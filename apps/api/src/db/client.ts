import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseHandle {
  readonly db: Database;
  readonly pool: pg.Pool;
  /** Resolves when the database answers a trivial query. Used by /health/ready. */
  check(): Promise<void>;
  close(): Promise<void>;
}

export function createDatabase(databaseUrl: string, maxConnections = 10): DatabaseHandle {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: maxConnections });
  const db = drizzle(pool, { schema });

  return {
    db,
    pool,
    async check() {
      await pool.query("select 1");
    },
    async close() {
      await pool.end();
    },
  };
}
