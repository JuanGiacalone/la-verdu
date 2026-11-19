/**
 * Load test for La Verdu (PRD T6.5, RNF-05).
 *
 * Runs 20 concurrent customer order flows per branch (40 total) against
 * PostgreSQL, measuring per-flow latency and reporting p50/p95. Uses the
 * LLM/STT stubs in fixture mode so interpretation succeeds deterministically.
 *
 * Usage:
 *   TEST_DATABASE_URL=postgres://... npx tsx scripts/load-test.ts [--per-branch=20]
 *
 * Requires `make dev-up` (db) and a clean TEST_DATABASE_URL (reset + seed
 * happens inside the script).
 */
import { parseArgs } from "node:util";
import { createDatabase } from "../apps/api/src/db/client.js";
import { resetDatabase, runMigrations } from "../apps/api/src/db/migrate.js";
import * as schema from "../apps/api/src/db/schema.js";
import { seedDatabase } from "../apps/api/src/db/seed.js";
import { handleCustomerMessage } from "../apps/api/src/customers/handler.js";
import type { WhatsAppChannel } from "../apps/api/src/channels/whatsapp.js";
import { eq } from "drizzle-orm";

const TZ_APP = process.env.TZ_APP ?? "America/Argentina/Buenos_Aires";

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index]!;
}

async function main() {
  const { values } = parseArgs({
    options: { "per-branch": { type: "string", default: "20" } },
  });
  const perBranch = Number(values["per-branch"]);
  const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("TEST_DATABASE_URL or DATABASE_URL is required.");
    process.exit(1);
  }

  await resetDatabase(databaseUrl);
  await runMigrations(databaseUrl);
  const handle = createDatabase(databaseUrl, 4);
  const db = handle.db;
  await seedDatabase(db);

  // Ensure every seeded customer has consent + a preferred branch; the seed
  // already sets consentAt. We'll use the 3 seeded customers cycled per branch.
  const customers = await db.select().from(schema.customer);
  const branches = await db.select().from(schema.branch);
  const centro = branches.find((b) => b.shortName === "CENTRO")!;
  const norte = branches.find((b) => b.shortName === "NORTE")!;

  const jobs: Array<Promise<{ branch: string; ms: number; ok: boolean; error?: string }>> = [];
  const startAll = performance.now();

  for (const [branch, branchRow] of [["CENTRO", centro], ["NORTE", norte]] as const) {
    for (let i = 0; i < perBranch; i++) {
      const customer = customers[i % customers.length]!;
      // Point the customer at this branch for the run.
      await db
        .update(schema.customer)
        .set({ preferredBranchId: branchRow.id, usualFulfillment: "PICKUP" })
        .where(eq(schema.customer.id, customer.id));

      const base = branch === "CENTRO" ? 9000000 : 9100000;
      const phone = `+54911${String(base + i).padStart(7, "0")}`;
      // Create a fresh customer row to avoid PK collisions across runs.
      await db.insert(schema.customer).values({
        phoneE164: phone,
        name: `Load ${branch} ${i}`,
        preferredBranchId: branchRow.id,
        usualFulfillment: "PICKUP",
        consentAt: new Date(),
      });

      const job = (async () => {
        const sent: string[] = [];
        const channel = {
          sendText: async (_to: string, text: string) => {
            sent.push(text);
          },
          downloadMedia: async () => Buffer.from(""),
        } as unknown as WhatsAppChannel;
        const deps = {
          database: db,
          channel,
          stt: { transcribe: async () => ({ text: "" }) } as any,
          llmBaseUrl: "http://127.0.0.1:8082/v1",
          llmApiKey: "",
          llmModel: "fixture:flow-order-tomate",
        };
        const t0 = performance.now();
        try {
          await handleCustomerMessage(deps, phone, `load-${branch}-${i}-1`, "text", "quiero 2 kilos de tomate perita, retiro a las 18:30", undefined);
          await handleCustomerMessage(deps, phone, `load-${branch}-${i}-2`, "text", "sí", undefined);
          const ms = performance.now() - t0;
          const confirmed = sent.some((m) => m.includes("quedó confirmado"));
          return { branch, ms, ok: confirmed };
        } catch (error) {
          return { branch, ms: performance.now() - t0, ok: false, error: String(error) };
        }
      })();
      jobs.push(job);
    }
  }

  const results = await Promise.all(jobs);
  const totalMs = performance.now() - startAll;

  const byBranch = new Map<string, number[]>();
  let okCount = 0;
  let failCount = 0;
  for (const r of results) {
    if (!byBranch.has(r.branch)) byBranch.set(r.branch, []);
    byBranch.get(r.branch)!.push(r.ms);
    if (r.ok) okCount++;
    else failCount++;
  }

  console.log(`\nLoad test: ${perBranch} flows/branch x 2 branches = ${jobs.length} flows`);
  console.log(`Total wall time: ${totalMs.toFixed(0)} ms`);
  console.log(`Success: ${okCount}/${jobs.length} (${((okCount / jobs.length) * 100).toFixed(1)}%)`);
  if (failCount > 0) {
    console.log(`Failures: ${failCount}`);
    for (const r of results.filter((x) => !x.ok).slice(0, 5)) {
      console.log(`  ${r.branch}: ${r.error ?? "not confirmed"}`);
    }
  }
  for (const [branch, latencies] of byBranch) {
    console.log(
      `${branch}: p50=${percentile(latencies, 50).toFixed(0)}ms p95=${percentile(latencies, 95).toFixed(0)}ms max=${Math.max(...latencies).toFixed(0)}ms`,
    );
  }

  const orderCount = await db.select({ id: schema.order.id }).from(schema.order);
  const printCount = await db.select({ id: schema.printJob.id }).from(schema.printJob);
  console.log(`DB: orders=${orderCount.length}, printJobs=${printCount.length}`);

  await handle.close();
  if (failCount > 0 || okCount / jobs.length < 0.95) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Load test failed:", error);
  process.exit(1);
});
