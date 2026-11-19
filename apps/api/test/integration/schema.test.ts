import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetDatabase, runMigrations } from "../../src/db/migrate.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

const EXPECTED_TABLES = [
  "admin_user",
  "alert",
  "agent_session",
  "audit_log",
  "branch",
  "branch_payment_method",
  "branch_product",
  "branch_product_day",
  "business",
  "change_set",
  "conversation",
  "customer",
  "message",
  "order",
  "order_item",
  "payment_method",
  "print_job",
  "product",
  "product_alias",
  "staff",
  "staff_branch",
].sort();

describe.skipIf(!testDatabaseUrl)("database schema (integration)", () => {
  if (!testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL is required for integration tests");
  }
  const url = testDatabaseUrl;
  let pool: pg.Pool;

  beforeAll(async () => {
    await resetDatabase(url);
    await runMigrations(url);
    pool = new pg.Pool({ connectionString: url, max: 2 });
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("creates every entity from PRD section 8", async () => {
    const result = await pool.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'
         and table_name not like '\\_\\_drizzle%'
       order by table_name`,
    );

    expect(result.rows.map((row) => row.table_name)).toEqual(EXPECTED_TABLES);
  });

  it("enforces unique staff phone numbers", async () => {
    await pool.query(
      `insert into staff (phone_e164, name, role) values ('+5491100000001', 'Ana', 'OWNER')`,
    );

    await expect(
      pool.query(
        `insert into staff (phone_e164, name, role) values ('+5491100000001', 'Bea', 'SELLER')`,
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it("enforces idempotency on inbound WhatsApp messages", async () => {
    const conversation = await pool.query<{ id: string }>(
      `insert into conversation (phone_e164, actor_type) values ('+5491100000002', 'CUSTOMER')
       returning id`,
    );
    const conversationId = conversation.rows[0]?.id;

    await pool.query(
      `insert into message (wa_message_id, conversation_id, direction, type)
       values ('wamid.TEST1', $1, 'INBOUND', 'TEXT')`,
      [conversationId],
    );

    await expect(
      pool.query(
        `insert into message (wa_message_id, conversation_id, direction, type)
         values ('wamid.TEST1', $1, 'INBOUND', 'TEXT')`,
        [conversationId],
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it("rejects order items with a non-positive quantity", async () => {
    const product = await pool.query<{ id: string }>(
      `insert into product (official_name, unit) values ('Test product zero', 'KG') returning id`,
    );
    const customer = await pool.query<{ id: string }>(
      `insert into customer (phone_e164) values ('+5491100000003') returning id`,
    );
    const order = await pool.query<{ id: string }>(
      `insert into "order" (customer_id, fulfillment, source)
       values ($1, 'PICKUP', 'CUSTOMER') returning id`,
      [customer.rows[0]?.id],
    );

    await expect(
      pool.query(
        `insert into order_item (order_id, product_id, quantity, unit)
         values ($1, $2, 0, 'KG')`,
        [order.rows[0]?.id, product.rows[0]?.id],
      ),
    ).rejects.toThrow(/order_item_quantity_positive|check constraint/);
  });

  it("limits order notes to 200 characters", async () => {
    const customer = await pool.query<{ id: string }>(
      `insert into customer (phone_e164) values ('+5491100000004') returning id`,
    );

    await expect(
      pool.query(
        `insert into "order" (customer_id, fulfillment, source, notes)
         values ($1, 'PICKUP', 'CUSTOMER', $2)`,
        [customer.rows[0]?.id, "x".repeat(201)],
      ),
    ).rejects.toThrow(/value too long/);
  });

  it("assigns a global increasing order number", async () => {
    const customer = await pool.query<{ id: string }>(
      `insert into customer (phone_e164) values ('+5491100000005') returning id`,
    );
    const first = await pool.query<{ order_number: string }>(
      `insert into "order" (customer_id, fulfillment, source)
       values ($1, 'PICKUP', 'CUSTOMER') returning order_number`,
      [customer.rows[0]?.id],
    );
    const second = await pool.query<{ order_number: string }>(
      `insert into "order" (customer_id, fulfillment, source)
       values ($1, 'PICKUP', 'CUSTOMER') returning order_number`,
      [customer.rows[0]?.id],
    );

    expect(Number(second.rows[0]?.order_number)).toBeGreaterThan(
      Number(first.rows[0]?.order_number),
    );
  });
});
