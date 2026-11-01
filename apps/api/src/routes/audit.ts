import { desc } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";

export function registerAuditRoutes(app: FastifyInstance, database: Database): void {
  app.get("/admin/audit-log", async (request, reply) => {
    const query = request.query as { entity?: string; action?: string; limit?: string };
    const limit = Math.min(Number(query.limit) || 50, 200);

    const q = database
      .select()
      .from(schema.auditLog)
      .orderBy(desc(schema.auditLog.createdAt))
      .limit(limit);

    const rows = await q;
    return reply.code(200).send(rows);
  });
}
