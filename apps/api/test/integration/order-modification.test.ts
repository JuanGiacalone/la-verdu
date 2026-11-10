import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

const MOCK_MODIFY_RESPONSE = JSON.stringify({
  items: [{ productName: "Tomate perita", quantity: 2, unit: "KG" }],
  fulfillment: "PICKUP",
  pickupTime: "18:00",
  deliveryAddress: null,
  notes: null,
});

describe.skipIf(!testDatabaseUrl)("Order modification (integration)", () => {
  if (!testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL is required for integration tests");
  }
  const url = testDatabaseUrl;
  let handle: ReturnType<typeof createDatabase>;
  let branchId: string;
  let customerId: string;
  const customerPhone = "+5491100000555";

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

    await db
      .insert(schema.product)
      .values([{ officialName: "Tomate perita", unit: "KG", active: true }]);

    const customerRows = await db
      .insert(schema.customer)
      .values({
        phoneE164: customerPhone,
        name: "Cliente Mod",
        usualFulfillment: "PICKUP",
        preferredBranchId: branchId,
        consentAt: new Date(),
      })
      .returning();
    customerId = expectRow(customerRows, "customer").id;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await handle?.close();
  });

  it("modifies an existing confirmed order (new version)", async () => {
    // Step 1: create and confirm an order.
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
      "wa-m-1",
      "text",
      "quiero un tomate",
      undefined,
    );
    // Confirm.
    await handleCustomerMessage(deps, customerPhone, "wa-m-2", "text", "sí", undefined);

    const ordersAfterConfirm = await handle.db
      .select()
      .from(schema.order)
      .where(eq(schema.order.customerId, customerId));
    expect(ordersAfterConfirm.length).toBe(1);
    expect(ordersAfterConfirm[0]?.status).toBe("CONFIRMED");
    expect(ordersAfterConfirm[0]?.version).toBe(1);

    channel.sendText.mockClear();

    // Step 2: request modification.
    await handleCustomerMessage(deps, customerPhone, "wa-m-3", "text", "modificar", undefined);
    // Bot should ask what to change.
    expect(channel.sendText).toHaveBeenCalled();
    channel.sendText.mockClear();

    // Step 3: send the new order details.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: MOCK_MODIFY_RESPONSE } }] }),
        text: async () => MOCK_MODIFY_RESPONSE,
      })),
    );

    await handleCustomerMessage(
      deps,
      customerPhone,
      "wa-m-4",
      "text",
      "ahora quiero 2 kg de tomate",
      undefined,
    );

    // The order should now be version 2 (modified).
    const ordersAfterModify = await handle.db
      .select()
      .from(schema.order)
      .where(eq(schema.order.customerId, customerId));
    expect(ordersAfterModify.length).toBe(1);
    expect(ordersAfterModify[0]?.version).toBe(2);

    expect(channel.sendText).toHaveBeenCalled();
    const lastCall = channel.sendText.mock.calls[channel.sendText.mock.calls.length - 1];
    const sentText = String(lastCall?.[1] ?? "");
    expect(sentText).toMatch(/Actualicé|resumen/i);
  });
});
