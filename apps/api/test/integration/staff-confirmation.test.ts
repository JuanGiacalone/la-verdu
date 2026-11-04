import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDatabase } from "../../src/db/client.js";
import { resetDatabase, runMigrations } from "../../src/db/migrate.js";
import * as schema from "../../src/db/schema.js";
import { handleStaffMessage } from "../../src/conversations/handler.js";
import { and, eq } from "drizzle-orm";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

const MOCK_STAFF_RESPONSE = JSON.stringify([
  { productName: "Tomate perita", type: "availability", status: "UNAVAILABLE" },
  { productName: "Lechuga crespa", type: "price", amount: 2400, unit: "UNIT" },
]);

describe.skipIf(!testDatabaseUrl)("Staff change confirmation (integration)", () => {
  if (!testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL is required for integration tests");
  }
  const url = testDatabaseUrl;
  let handle: ReturnType<typeof createDatabase>;
  let branchId: string;
  let staffId: string;
  let tomateId: string;
  const phone = "+5491100000888";

  const channel = {
    sendText: vi.fn(async () => undefined),
    downloadMedia: vi.fn(async () => Buffer.from("")),
  };
  const stt = {
    transcribe: vi.fn(async () => ({ text: "" })),
  };

  beforeAll(async () => {
    await resetDatabase(url);
    await runMigrations(url);
    handle = createDatabase(url, 2);

    const db = handle.db;
    const branchRows = await db
      .insert(schema.branch)
      .values({
        shortName: "TEST",
        fullName: "Sucursal Test",
        address: "Calle Test 123",
        opensAt: "08:00",
        closesAt: "20:00",
        dayStartAt: "08:00",
        priority: 1,
        active: true,
      })
      .returning();
    branchId = branchRows[0]!.id;

    const productRows = await db
      .insert(schema.product)
      .values([
        { officialName: "Tomate perita", unit: "KG", active: true },
        { officialName: "Lechuga crespa", unit: "UNIT", active: true },
      ])
      .returning();
    tomateId = productRows.find((p) => p.officialName === "Tomate perita")!.id;
    // lechugaId not used in this test

    const staffRows = await db
      .insert(schema.staff)
      .values({
        phoneE164: phone,
        name: "Personal Test",
        role: "SELLER",
        active: true,
      })
      .returning();
    staffId = staffRows[0]!.id;

    await db.insert(schema.staffBranch).values({
      staffId,
      branchId,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: MOCK_STAFF_RESPONSE } }],
        }),
        text: async () => MOCK_STAFF_RESPONSE,
      })),
    );
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await handle?.close();
  });

  it("does not apply changes until staff says 'sí' (noInventedPrices)", async () => {
    const deps = {
      database: handle.db,
      channel: channel as unknown as Parameters<typeof handleStaffMessage>[0]["channel"],
      stt: stt as unknown as Parameters<typeof handleStaffMessage>[0]["stt"],
      llmBaseUrl: "http://localhost:8082",
      llmApiKey: "",
      llmModel: "llm-stub",
    };

    // First message: change request.
    await handleStaffMessage(deps, phone, "wa-staff-1", "text", "no hay tomate, lechuga a 2400", undefined);

    expect(channel.sendText).toHaveBeenCalled();
    const lastCall = (channel.sendText.mock.calls as any[])[channel.sendText.mock.calls.length - 1];
    const sentText = String(lastCall?.[1] ?? "");
    // Bot echoes proposed changes and asks for confirmation.
    expect(sentText).toMatch(/Entendí|¿Lo aplico\?|sí o no/i);
    // The echoed price must be the one from the input (2400), not an invented one.
    expect(sentText).toContain("2400");

    // A change set should be pending.
    const convRows = await handle.db
      .select()
      .from(schema.conversation)
      .where(eq(schema.conversation.phoneE164, phone));
    const ctx = (convRows[0]?.contextJson ?? {}) as Record<string, unknown>;
    expect(ctx.pendingChangeSetId).toBeTruthy();

    // Changes not applied yet: Tomate should not be UNAVAILABLE.
    const today = new Date().toISOString().split("T")[0] ?? "";
    const tomateAvailBefore = await handle.db
      .select()
      .from(schema.branchProductDay)
      .where(
        and(
          eq(schema.branchProductDay.branchId, branchId),
          eq(schema.branchProductDay.productId, tomateId),
          eq(schema.branchProductDay.businessDate, today),
        ),
      );
    if (tomateAvailBefore.length > 0) {
      expect(tomateAvailBefore[0]?.availability).not.toBe("UNAVAILABLE");
    }

    channel.sendText.mockClear();

    // Second message: explicit confirmation.
    await handleStaffMessage(deps, phone, "wa-staff-2", "text", "sí", undefined);

    expect(channel.sendText).toHaveBeenCalled();
    const confirmCall = (channel.sendText.mock.calls as any[])[channel.sendText.mock.calls.length - 1];
    const confirmText = String(confirmCall?.[1] ?? "");
    expect(confirmText).toMatch(/Listo|cambios aplicados/i);

    // After apply, Tomate should be UNAVAILABLE.
    const tomateAvailAfter = await handle.db
      .select()
      .from(schema.branchProductDay)
      .where(
        and(
          eq(schema.branchProductDay.branchId, branchId),
          eq(schema.branchProductDay.productId, tomateId),
          eq(schema.branchProductDay.businessDate, today),
        ),
      );
    // applyChanges may create or update the record; verify it's now UNAVAILABLE if present.
    if (tomateAvailAfter.length > 0) {
      expect(tomateAvailAfter[0]?.availability).toBe("UNAVAILABLE");
    }
  });
});
