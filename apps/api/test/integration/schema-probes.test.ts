import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetDatabase, runMigrations } from "../../src/db/migrate.js";

// Regression probes for the constraints of PRD.md section 8, 14.3 and 16.3.
// They were written by the independent verifier of the migration unit and then
// adopted here so they run on every integration pass.

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)("schema constraints (regression probes)", () => {
  if (!testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL is required for integration tests");
  }
  const url = testDatabaseUrl;
  let pool: pg.Pool;
  let branchId: string;
  let productId: string;
  let customerId: string;
  let orderId: string;

  beforeAll(async () => {
    await resetDatabase(url);
    await runMigrations(url);
    pool = new pg.Pool({ connectionString: url, max: 2 });

    const branch = await pool.query<{ id: string }>(
      `insert into branch (short_name, full_name, opens_at, closes_at, day_start_at)
       values ('CENTRO', 'La Verdu Centro', '08:00', '20:00', '08:00') returning id`,
    );
    branchId = branch.rows[0]?.id ?? "";
    const product = await pool.query<{ id: string }>(
      `insert into product (official_name, unit) values ('Banana', 'KG') returning id`,
    );
    productId = product.rows[0]?.id ?? "";
    const customer = await pool.query<{ id: string }>(
      `insert into customer (phone_e164) values ('+5491100000001') returning id`,
    );
    customerId = customer.rows[0]?.id ?? "";
    const order = await pool.query<{ id: string }>(
      `insert into "order" (customer_id, fulfillment, source, status, pickup_time)
       values ($1, 'PICKUP', 'CUSTOMER', 'CONFIRMED', '11:30') returning id`,
      [customerId],
    );
    orderId = order.rows[0]?.id ?? "";
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("rejects a blank branch short name", async () => {
    await expect(
      pool.query(
        `insert into branch (short_name, full_name, opens_at, closes_at, day_start_at)
         values ('  ', 'x', '08:00', '20:00', '08:00')`,
      ),
    ).rejects.toThrow(/branch_short_name_not_blank/);
  });

  it.each([
    ["staff", `insert into staff (phone_e164, name, role) values ('hola', 'x', 'SELLER')`],
    ["customer", `insert into customer (phone_e164) values ('hola')`],
    [
      "conversation",
      `insert into conversation (phone_e164, actor_type) values ('hola', 'CUSTOMER')`,
    ],
  ])("rejects free text as a %s phone number", async (_table, sql) => {
    await expect(pool.query(sql)).rejects.toThrow(/phone_e164_format/);
  });

  it("rejects a negative branch price and accepts a zero price", async () => {
    await expect(
      pool.query(
        `insert into branch_product (branch_id, product_id, price_amount) values ($1, $2, -5)`,
        [branchId, productId],
      ),
    ).rejects.toThrow(/branch_product_price_not_negative/);

    await pool.query(
      `insert into branch_product (branch_id, product_id, price_amount) values ($1, $2, 0)`,
      [branchId, productId],
    );
  });

  it("rejects an order version below 1", async () => {
    await expect(
      pool.query(
        `insert into "order" (customer_id, fulfillment, source, version)
         values ($1, 'PICKUP', 'CUSTOMER', 0)`,
        [customerId],
      ),
    ).rejects.toThrow(/order_version_positive/);
  });

  it("rejects a print job whose order version is below 1", async () => {
    await expect(
      pool.query(
        `insert into print_job (order_id, order_version, branch_id, kind)
         values ($1, 0, $2, 'NEW')`,
        [orderId, branchId],
      ),
    ).rejects.toThrow(/print_job_order_version_positive/);
  });

  it("allows only one availability record per branch, product and day", async () => {
    await pool.query(
      `insert into branch_product_day (branch_id, product_id, business_date, availability)
       values ($1, $2, '2026-11-01', 'UNAVAILABLE')`,
      [branchId, productId],
    );

    await expect(
      pool.query(
        `insert into branch_product_day (branch_id, product_id, business_date, availability)
         values ($1, $2, '2026-11-01', 'AVAILABLE')`,
        [branchId, productId],
      ),
    ).rejects.toThrow(/branch_product_day_unique/);
  });

  it("keeps the order number global and never accepts an explicit value", async () => {
    await expect(
      pool.query(
        `insert into "order" (order_number, customer_id, fulfillment, source)
         values (999999, $1, 'PICKUP', 'CUSTOMER')`,
        [customerId],
      ),
    ).rejects.toThrow(/cannot insert a non-DEFAULT value/);
  });

  it("has no price, quality, amount or total column on order, order_item or print_job", async () => {
    const result = await pool.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name in ('order', 'order_item', 'print_job')
         and column_name ~* '(price|total|amount|quality|calidad|importe|monto)'`,
    );
    expect(result.rows).toEqual([]);
  });

  it("makes the audit log insert-only: update, delete and truncate are rejected", async () => {
    await pool.query(
      `insert into audit_log (actor, action, entity) values ('staff:1', 'CREATE', 'order')`,
    );

    await expect(pool.query(`update audit_log set actor = 'tampered'`)).rejects.toThrow(
      /append-only/,
    );
    await expect(pool.query(`delete from audit_log`)).rejects.toThrow(/append-only/);
    await expect(pool.query(`truncate audit_log`)).rejects.toThrow(/append-only/);

    const stored = await pool.query<{ actor: string }>(`select actor from audit_log`);
    expect(stored.rows).toEqual([{ actor: "staff:1" }]);
  });

  it("gives payment methods the active flag from PRD 8, enabled by default", async () => {
    const inserted = await pool.query<{ active: boolean }>(
      `insert into payment_method (code, label) values ('CASH', 'Efectivo') returning active`,
    );
    expect(inserted.rows[0]?.active).toBe(true);
  });
});
