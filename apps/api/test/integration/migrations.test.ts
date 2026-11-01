import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetDatabase, rollbackMigrations, runMigrations } from "../../src/db/migrate.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)("migrations are versioned and reversible (RNF-20)", () => {
  if (!testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL is required for integration tests");
  }
  const url = testDatabaseUrl;
  let pool: pg.Pool;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: url, max: 2 });
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function publicTables(): Promise<string[]> {
    const result = await pool.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
    );
    return result.rows.map((row) => row.table_name);
  }

  async function columnExists(table: string, column: string): Promise<boolean> {
    const result = await pool.query(
      `select 1 from information_schema.columns
       where table_schema = 'public' and table_name = $1 and column_name = $2`,
      [table, column],
    );
    return result.rowCount === 1;
  }

  async function triggerExists(name: string): Promise<boolean> {
    // The pg_trigger catalog is authoritative; information_schema.triggers filters by privilege.
    const result = await pool.query(
      `select 1 from pg_trigger where tgname = $1 and not tgisinternal`,
      [name],
    );
    return result.rowCount === 1;
  }

  it("rolls back one migration at a time and re-applies cleanly", async () => {
    await resetDatabase(url);
    await runMigrations(url);
    expect(await publicTables()).toHaveLength(20);
    expect(await triggerExists("audit_log_append_only")).toBe(true);

    await rollbackMigrations(url, 1);
    expect(await columnExists("admin_user", "id")).toBe(false);
    expect(await publicTables()).toHaveLength(19);

    await rollbackMigrations(url, 1);
    expect(await triggerExists("audit_log_append_only")).toBe(false);
    expect(await publicTables()).toHaveLength(19);

    await rollbackMigrations(url, 1);
    expect(await columnExists("payment_method", "active")).toBe(false);
    expect(await publicTables()).toHaveLength(19);

    await rollbackMigrations(url, 1);
    expect(await publicTables()).toEqual([]);

    await runMigrations(url);
    expect(await publicTables()).toHaveLength(20);
    expect(await columnExists("payment_method", "active")).toBe(true);
    expect(await columnExists("admin_user", "id")).toBe(true);
  });
});
