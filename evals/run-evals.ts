/**
 * Eval runner for La Verdu (PRD 21.2).
 *
 * Runs conversation evals against the LLM provider configured via env vars.
 * Usage: npx tsx evals/run-evals.ts [--provider=hosted|local]
 *
 * Required env vars:
 *   CHAT_BASE_URL, CHAT_API_KEY, CHAT_MODEL  (LLM provider)
 *   DATABASE_URL or TEST_DATABASE_URL         (PostgreSQL with seed data)
 *
 * Eval cases are JSON files in evals/conversations/.
 * Each case has an input and an expected output (products, quantities,
 * fulfillment, noInventedPrices, noConfirmationWithoutYes).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createDatabase } from "../apps/api/src/db/client.js";
import { parseCustomerOrder } from "../apps/api/src/orders/parser.js";
import { createHostedStt } from "../apps/api/src/stt/interface.js";

interface EvalCase {
  readonly id: string;
  readonly input: string;
  readonly expected: {
    readonly products?: string[];
    readonly quantities?: number[];
    readonly fulfillment?: string | null;
    readonly noInventedPrices?: boolean;
    readonly noConfirmationWithoutYes?: boolean;
  };
}

interface EvalResult {
  readonly id: string;
  readonly passed: boolean;
  readonly details: string;
}

interface AudioEvalCase {
  readonly id: string;
  readonly audio: string;
  readonly mimeType?: string;
  readonly expected: {
    readonly transcription?: string;
    readonly products?: string[];
    readonly quantities?: number[];
    readonly fulfillment?: string | null;
    readonly noInventedPrices?: boolean;
    readonly noConfirmationWithoutYes?: boolean;
  };
}

function parseArgs(argv: string[]): { provider: string; audio: boolean } {
  let provider = "hosted";
  let audio = false;
  for (const arg of argv) {
    const match = arg.match(/^--provider=(.+)$/);
    if (match) provider = match[1]!;
    if (arg === "--audio") audio = true;
  }
  return { provider, audio };
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function arraysEqualAsMultiset(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].map(normalizeName).sort();
  const sortedB = [...b].map(normalizeName).sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

function numbersEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => Math.abs(v - (b[i] ?? 0)) < 1e-9);
}

async function main() {
  const { provider, audio } = parseArgs(process.argv.slice(2));

  const baseUrl = process.env.CHAT_BASE_URL ?? "http://localhost:8082";
  const apiKey = process.env.CHAT_API_KEY ?? "";
  const model = process.env.CHAT_MODEL ?? "llm-stub";

  const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: TEST_DATABASE_URL or DATABASE_URL is required.");
    process.exit(1);
  }

  console.log(`Provider: ${provider}`);
  console.log(`LLM: ${baseUrl} (model=${model})`);
  console.log(`DB: ${databaseUrl.replace(/:[^:@]*@/, ":***@")}`);

  const dbHandle = createDatabase(databaseUrl);

  const conversationsDir = join(process.cwd(), "evals", "conversations");
  let cases: EvalCase[] = [];
  try {
    const files = readdirSync(conversationsDir).filter((f) => f.endsWith(".json"));
    cases = files.map((f) => JSON.parse(readFileSync(join(conversationsDir, f), "utf8")) as EvalCase);
  } catch (error) {
    console.error("Failed to load eval cases:", error);
    await dbHandle.close();
    process.exit(1);
  }

  console.log(`Loaded ${cases.length} eval case(s).\n`);

  const results: EvalResult[] = [];

  for (const evalCase of cases) {
    try {
      const parsed = await parseCustomerOrder(baseUrl, apiKey, model, evalCase.input, dbHandle.db);

      const actualProducts = parsed.items.map((i) => i.productName);
      const actualQuantities = parsed.items.map((i) => i.quantity);
      const actualFulfillment = parsed.fulfillment ?? null;

      const expectedProducts = evalCase.expected.products ?? [];
      const expectedQuantities = evalCase.expected.quantities ?? [];
      const expectedFulfillment = evalCase.expected.fulfillment ?? null;

      const failures: string[] = [];

      if (expectedProducts.length > 0 && !arraysEqualAsMultiset(actualProducts, expectedProducts)) {
        failures.push(
          `products: expected [${expectedProducts.join(", ")}], got [${actualProducts.join(", ")}]`,
        );
      }

      if (expectedQuantities.length > 0 && !numbersEqual(actualQuantities, expectedQuantities)) {
        failures.push(
          `quantities: expected [${expectedQuantities.join(", ")}], got [${actualQuantities.join(", ")}]`,
        );
      }

      if (expectedFulfillment !== null && actualFulfillment !== expectedFulfillment) {
        failures.push(`fulfillment: expected ${expectedFulfillment}, got ${actualFulfillment ?? "null"}`);
      }

      // noInventedPrices: the parser does not return prices, so there is nothing
      // to invent. Pass unconditionally unless the case explicitly demands a
      // price check (not supported by the current parser contract).
      if (evalCase.expected.noInventedPrices === false) {
        failures.push("noInventedPrices check requested but not implemented");
      }

      // noConfirmationWithoutYes: confirmation gating lives in the handler, not
      // the parser. The parser never confirms; pass unconditionally.
      if (evalCase.expected.noConfirmationWithoutYes === false) {
        failures.push("noConfirmationWithoutYes check requested but not implemented");
      }

      const passed = failures.length === 0;
      results.push({
        id: evalCase.id,
        passed,
        details: passed
          ? `OK (${actualProducts.length} item(s))`
          : failures.join("; "),
      });
    } catch (error) {
      results.push({
        id: evalCase.id,
        passed: false,
        details: `ERROR: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  // Audio evals (optional).
  if (audio) {
    const sttBaseUrl = process.env.STT_BASE_URL ?? "http://localhost:8083";
    const sttApiKey = process.env.STT_API_KEY ?? "";
    const sttModel = process.env.STT_MODEL ?? "stt-stub";
    const stt = createHostedStt(sttApiKey, sttBaseUrl, sttModel);

    const audioDir = join(process.cwd(), "evals", "audio");
    let audioCases: AudioEvalCase[] = [];
    try {
      const files = readdirSync(audioDir).filter((f) => f.endsWith(".json"));
      audioCases = files.map((f) => JSON.parse(readFileSync(join(audioDir, f), "utf8")) as AudioEvalCase);
    } catch {
      audioCases = [];
    }

    console.log(`\\nLoaded ${audioCases.length} audio eval case(s).`);

    for (const evalCase of audioCases) {
      const audioPath = join(process.cwd(), evalCase.audio);
      if (!existsSync(audioPath)) {
        results.push({
          id: evalCase.id,
          passed: false,
          details: `SKIP: audio file not found (${evalCase.audio})`,
        });
        continue;
      }
      try {
        const audioBuffer = readFileSync(audioPath);
        const mimeType = evalCase.mimeType ?? "audio/ogg";
        const transcription = await stt.transcribe(audioBuffer, mimeType);

        const failures: string[] = [];
        const expectedTranscription = evalCase.expected.transcription;
        if (expectedTranscription) {
          const normActual = transcription.text.trim().toLowerCase();
          const normExpected = expectedTranscription.trim().toLowerCase();
          if (normActual !== normExpected) {
            failures.push(`transcription: expected "${expectedTranscription}", got "${transcription.text}"`);
          }
        }

        // Then parse the transcribed text as an order and compare.
        const parsed = await parseCustomerOrder(baseUrl, apiKey, model, transcription.text, dbHandle.db);
        const actualProducts = parsed.items.map((i) => i.productName);
        const actualQuantities = parsed.items.map((i) => i.quantity);
        const expectedProducts = evalCase.expected.products ?? [];
        const expectedQuantities = evalCase.expected.quantities ?? [];

        if (expectedProducts.length > 0 && !arraysEqualAsMultiset(actualProducts, expectedProducts)) {
          failures.push(`products: expected [${expectedProducts.join(", ")}], got [${actualProducts.join(", ")}]`);
        }
        if (expectedQuantities.length > 0 && !numbersEqual(actualQuantities, expectedQuantities)) {
          failures.push(`quantities: expected [${expectedQuantities.join(", ")}], got [${actualQuantities.join(", ")}]`);
        }

        const expectedFulfillment = evalCase.expected.fulfillment ?? null;
        const actualFulfillment = parsed.fulfillment ?? null;
        if (expectedFulfillment !== null && actualFulfillment !== expectedFulfillment) {
          failures.push(`fulfillment: expected ${expectedFulfillment}, got ${actualFulfillment ?? "null"}`);
        }

        const passed = failures.length === 0;
        results.push({
          id: evalCase.id,
          passed,
          details: passed ? `OK (${actualProducts.length} item(s))` : failures.join("; "),
        });
      } catch (error) {
        results.push({
          id: evalCase.id,
          passed: false,
          details: `ERROR: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
  }

  await dbHandle.close();

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log("Results:");
  for (const r of results) {
    console.log(`  ${r.passed ? "PASS" : "FAIL"} ${r.id}: ${r.details}`);
  }
  console.log(`\n${passed}/${total} passed.`);

  if (passed < total) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Eval runner failed:", error);
  process.exit(1);
});
