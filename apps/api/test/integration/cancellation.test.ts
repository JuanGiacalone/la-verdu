import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { handleStaffMessage } from "../../src/conversations/handler.js";
import { handleCustomerMessage } from "../../src/customers/handler.js";
import { createDatabase } from "../../src/db/client.js";
import { resetDatabase, runMigrations } from "../../src/db/migrate.js";
import * as schema from "../../src/db/schema.js";
import { expectRow } from "./helpers.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

const MOCK_ORDER_RESPONSE = JSON.stringify({
  items: [{ productName: "Tomate perita", quantity: 1, unit: "KG" }],
  fulfillment: "PICKUP",
  pickupTime: "18:00",
  deliveryAddress: null,
  notes: null,
});

const MOCK_STAFF_RESPONSE = JSON.stringify([
  { productName: "Tomate perita", type: "availability", status: "UNAVAILABLE" },
]);

describe.skipIf(!testDatabaseUrl)("Cancellation (integration)", () => {
  if (!testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL is required for integration tests");
  }
  const url = testDatabaseUrl;
  let handle: ReturnType<typeof createDatabase>;
  let branchId: string;
  let customerId: string;
  let staffId: string;
  let tomateId: string;
  const customerPhone = "+5491100000777";
  const staffPhone = "+5491100000666";

  const channel = {
    sendText: vi.fn(async (_to: string, _body: string) => undefined),
    downloadMedia: vi.fn(async (_mediaId: string) => Buffer.from("")),
  };
  const stt = { transcribe: vi.fn(async () => ({ text: "" })) };

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
    branchId = expectRow(branchRows, "branch").id;

    const productRows = await db
      .insert(schema.product)
      .values([{ officialName: "Tomate perita", unit: "KG", active: true }])
      .returning();
    tomateId = expectRow(productRows, "product").id;

    const customerRows = await db
      .insert(schema.customer)
      .values({
        phoneE164: customerPhone,
        name: "Cliente Cancel",
        usualFulfillment: "PICKUP",
        preferredBranchId: branchId,
        consentAt: new Date(),
      })
      .returning();
    customerId = expectRow(customerRows, "customer").id;

    const staffRows = await db
      .insert(schema.staff)
      .values({ phoneE164: staffPhone, name: "Personal Cancel", role: "SELLER", active: true })
      .returning();
    staffId = expectRow(staffRows, "staff").id;
    await db.insert(schema.staffBranch).values({ staffId, branchId });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await handle?.close();
  });

  it("customer can cancel a pending order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: MOCK_ORDER_RESPONSE } }] }),
        text: async () => MOCK_ORDER_RESPONSE,
      })),
    );

    const deps = {
      database: handle.db,
      channel: channel as unknown as Parameters<typeof handleCustomerMessage>[0]["channel"],
      stt: stt as unknown as Parameters<typeof handleCustomerMessage>[0]["stt"],
      llmBaseUrl: "http://localhost:8082",
      llmApiKey: "",
      llmModel: "llm-stub",
    };

    await handleCustomerMessage(
      deps,
      customerPhone,
      "wa-c-1",
      "text",
      "quiero un tomate",
      undefined,
    );
    const ordersBefore = await handle.db
      .select()
      .from(schema.order)
      .where(eq(schema.order.customerId, customerId));
    expect(ordersBefore.length).toBe(1);
    expect(ordersBefore[0]?.status).toBe("DRAFT");

    channel.sendText.mockClear();

    await handleCustomerMessage(deps, customerPhone, "wa-c-2", "text", "cancelar", undefined);

    const ordersAfter = await handle.db
      .select()
      .from(schema.order)
      .where(eq(schema.order.customerId, customerId));
    expect(ordersAfter[0]?.status).toBe("CANCELLED");

    expect(channel.sendText).toHaveBeenCalled();
    const lastCall = channel.sendText.mock.calls[channel.sendText.mock.calls.length - 1];
    const sentText = String(lastCall?.[1] ?? "");
    // A pending confirmation is open, so "cancelar" is handled as a rejection of the
    // draft: the order is cancelled and the customer is told it was not confirmed.
    expect(sentText).toMatch(/no se confirmó|cancel/i);
  });

  it("staff can reject a pending change set", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: MOCK_STAFF_RESPONSE } }] }),
        text: async () => MOCK_STAFF_RESPONSE,
      })),
    );

    const deps = {
      database: handle.db,
      channel: channel as unknown as Parameters<typeof handleStaffMessage>[0]["channel"],
      stt: stt as unknown as Parameters<typeof handleStaffMessage>[0]["stt"],
      llmBaseUrl: "http://localhost:8082",
      llmApiKey: "",
      llmModel: "llm-stub",
    };

    await handleStaffMessage(deps, staffPhone, "wa-s-1", "text", "no hay tomate", undefined);
    const convRows = await handle.db
      .select()
      .from(schema.conversation)
      .where(eq(schema.conversation.phoneE164, staffPhone));
    const ctx = (convRows[0]?.contextJson ?? {}) as Record<string, unknown>;
    expect(ctx.pendingChangeSetId).toBeTruthy();
    const changeSetId = ctx.pendingChangeSetId as string;

    channel.sendText.mockClear();

    await handleStaffMessage(deps, staffPhone, "wa-s-2", "text", "no", undefined);

    const csRows = await handle.db
      .select()
      .from(schema.changeSet)
      .where(eq(schema.changeSet.id, changeSetId));
    expect(csRows[0]?.status).toBe("REJECTED");

    const today = new Date().toISOString().split("T")[0] ?? "";
    const tomateAvail = await handle.db
      .select()
      .from(schema.branchProductDay)
      .where(
        and(
          eq(schema.branchProductDay.branchId, branchId),
          eq(schema.branchProductDay.productId, tomateId),
          eq(schema.branchProductDay.businessDate, today),
        ),
      );
    if (tomateAvail.length > 0) {
      expect(tomateAvail[0]?.availability).not.toBe("UNAVAILABLE");
    }

    expect(channel.sendText).toHaveBeenCalled();
  });
});
