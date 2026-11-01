import { count, eq } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type DatabaseHandle } from "../../src/db/client.js";
import { resetDatabase, runMigrations } from "../../src/db/migrate.js";
import * as schema from "../../src/db/schema.js";
import { seedDatabase } from "../../src/db/seed.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

async function countRows(handle: DatabaseHandle) {
  const [branches] = await handle.db.select({ value: count() }).from(schema.branch);
  const [staff] = await handle.db.select({ value: count() }).from(schema.staff);
  const [staffBranches] = await handle.db.select({ value: count() }).from(schema.staffBranch);
  const [products] = await handle.db.select({ value: count() }).from(schema.product);
  const [aliases] = await handle.db.select({ value: count() }).from(schema.productAlias);
  const [methods] = await handle.db.select({ value: count() }).from(schema.paymentMethod);
  const [branchMethods] = await handle.db
    .select({ value: count() })
    .from(schema.branchPaymentMethod);
  const [customers] = await handle.db.select({ value: count() }).from(schema.customer);
  return {
    branches: branches?.value,
    staff: staff?.value,
    staffBranches: staffBranches?.value,
    products: products?.value,
    aliases: aliases?.value,
    paymentMethods: methods?.value,
    branchPaymentMethods: branchMethods?.value,
    customers: customers?.value,
  };
}

describe.skipIf(!testDatabaseUrl)("development seed (integration)", () => {
  if (!testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL is required for integration tests");
  }
  const url = testDatabaseUrl;
  let handle: DatabaseHandle;

  beforeAll(async () => {
    await resetDatabase(url);
    await runMigrations(url);
    handle = createDatabase(url, 2);
  });

  afterAll(async () => {
    await handle?.close();
  });

  it("loads the PRD 19.4 dataset", async () => {
    await seedDatabase(handle.db);

    expect(await countRows(handle)).toEqual({
      branches: 2,
      staff: 3,
      staffBranches: 4,
      products: 5,
      aliases: 4,
      paymentMethods: 4,
      branchPaymentMethods: 8,
      customers: 3,
    });
  });

  it("opens CENTRO from 08:00 to 20:00 and NORTE from 08:30 to 19:30", async () => {
    const branches = await handle.db.select().from(schema.branch);
    const centro = branches.find((row) => row.shortName === "CENTRO");
    const norte = branches.find((row) => row.shortName === "NORTE");

    expect(centro?.opensAt).toBe("08:00:00");
    expect(centro?.closesAt).toBe("20:00:00");
    expect(norte?.opensAt).toBe("08:30:00");
    expect(norte?.closesAt).toBe("19:30:00");
  });

  it("is idempotent: running the seed twice does not duplicate anything", async () => {
    const before = await countRows(handle);

    await seedDatabase(handle.db);

    expect(await countRows(handle)).toEqual(before);
  });

  it("gives every seeded branch the four payment methods enabled", async () => {
    const enabled = await handle.db
      .select({ branch: schema.branch.shortName, enabled: schema.branchPaymentMethod.enabled })
      .from(schema.branchPaymentMethod)
      .innerJoin(schema.branch, eq(schema.branch.id, schema.branchPaymentMethod.branchId));

    expect(enabled).toHaveLength(8);
    expect(enabled.every((row) => row.enabled)).toBe(true);
  });

  it("does not store quality, price or total fields in the order model", async () => {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      const result = await client.query<{ column_name: string }>(
        `select column_name from information_schema.columns
         where table_schema = 'public' and table_name in ('order', 'order_item', 'print_job')
           and column_name ~* '(quality|calidad|total|amount|price|importe)'`,
      );
      expect(result.rows).toEqual([]);
    } finally {
      await client.end();
    }
  });
});
