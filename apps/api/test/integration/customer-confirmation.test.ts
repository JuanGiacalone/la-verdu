import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../../src/config.js";
import { handleCustomerMessage } from "../../src/customers/handler.js";
import { createDatabase } from "../../src/db/client.js";
import { resetDatabase, runMigrations } from "../../src/db/migrate.js";
import * as schema from "../../src/db/schema.js";
import { expectRow } from "./helpers.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

const config: AppConfig = {
  nodeEnv: "test",
  port: 0,
  databaseUrl: testDatabaseUrl ?? "postgres://unused",
  timezone: "America/Argentina/Buenos_Aires",
  logLevel: "silent",
  whatsappAppSecret: "",
  whatsappVerifyToken: "",
  whatsappAccessToken: "",
  whatsappPhoneNumberId: "",
  whatsappApiVersion: "v22.0",
  llmBaseUrl: "http://localhost:8082",
  llmApiKey: "",
  llmModel: "llm-stub",
  sttBaseUrl: "http://localhost:8083",
  sttApiKey: "",
  sttModel: "stt-stub",
};

const MOCK_LLM_RESPONSE = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          items: [
            { productName: "Tomate perita", quantity: 2, unit: "KG" },
            { productName: "Lechuga crespa", quantity: 1, unit: "UNIT" },
          ],
          fulfillment: "PICKUP",
          pickupTime: "18:00",
          deliveryAddress: null,
          notes: null,
        }),
      },
    },
  ],
};

describe.skipIf(!testDatabaseUrl)("Customer order confirmation (integration)", () => {
  if (!testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL is required for integration tests");
  }
  const url = testDatabaseUrl;
  let handle: ReturnType<typeof createDatabase>;
  let branchId: string;
  let customerId: string;
  const phone = "+5491100000999";

  const channel = {
    sendText: vi.fn(async (_to: string, _body: string) => undefined),
    downloadMedia: vi.fn(async (_mediaId: string) => Buffer.from("")),
  };
  const stt = {
    transcribe: vi.fn(async () => ({ text: "" })),
  };

  beforeAll(async () => {
    await resetDatabase(url);
    await runMigrations(url);
    handle = createDatabase(url, 2);

    // Seed minimal data: branch + products + customer with consent.
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

    await db.insert(schema.product).values([
      { officialName: "Tomate perita", unit: "KG", active: true },
      { officialName: "Lechuga crespa", unit: "UNIT", active: true },
    ]);

    const customerRows = await db
      .insert(schema.customer)
      .values({
        phoneE164: phone,
        name: "Cliente Test",
        usualFulfillment: "PICKUP",
        preferredBranchId: branchId,
        consentAt: new Date(),
      })
      .returning();
    customerId = expectRow(customerRows, "customer").id;

    // Mock fetch to return a valid LLM JSON response.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => MOCK_LLM_RESPONSE,
        text: async () => JSON.stringify(MOCK_LLM_RESPONSE),
      })),
    );
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await handle?.close();
  });

  it("does not confirm the order until the customer says 'sí'", async () => {
    const deps = {
      database: handle.db,
      channel: channel as unknown as Parameters<typeof handleCustomerMessage>[0]["channel"],
      stt: stt as unknown as Parameters<typeof handleCustomerMessage>[0]["stt"],
      llmBaseUrl: config.llmBaseUrl,
      llmApiKey: config.llmApiKey,
      llmModel: config.llmModel,
    };

    // First message: order request.
    await handleCustomerMessage(
      deps,
      phone,
      "wa-msg-1",
      "text",
      "quiero 2 kg de tomate y una lechuga",
      undefined,
    );

    // The bot should have sent a confirmation summary asking for "sí".
    expect(channel.sendText).toHaveBeenCalled();
    const lastCall = channel.sendText.mock.calls[channel.sendText.mock.calls.length - 1];
    const sentText = String(lastCall?.[1] ?? "");
    expect(sentText).toMatch(/¿Está todo bien\?|resumen|confirm/i);

    // There should be a DRAFT order, not a CONFIRMED one.
    const orders = await handle.db
      .select()
      .from(schema.order)
      .where(eq(schema.order.customerId, customerId));
    expect(orders.length).toBe(1);
    expect(orders[0]?.status).toBe("DRAFT");

    // Reset mock calls for the confirmation step.
    channel.sendText.mockClear();

    // Second message: explicit confirmation.
    await handleCustomerMessage(deps, phone, "wa-msg-2", "text", "sí", undefined);

    // The order should now be CONFIRMED.
    const ordersAfter = await handle.db
      .select()
      .from(schema.order)
      .where(eq(schema.order.customerId, customerId));
    expect(ordersAfter.length).toBe(1);
    expect(ordersAfter[0]?.status).toBe("CONFIRMED");
  });
});
