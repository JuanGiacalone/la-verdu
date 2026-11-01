import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";
import { reprintJob, retryJob } from "../printing/queue.js";

export function registerPrintRoutes(app: FastifyInstance, database: Database): void {
  // Reprint a job (creates a new QUEUED job with the same data).
  app.post("/admin/print-jobs/:id/reprint", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const newJobId = await reprintJob(database, id);
      return reply.code(201).send({ jobId: newJobId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al reimprimir.";
      return reply.code(404).send({ error: message });
    }
  });

  // Retry a failed job.
  app.post("/admin/print-jobs/:id/retry", async (request, reply) => {
    const { id } = request.params as { id: string };
    await retryJob(database, id);
    return reply.code(200).send({ ok: true });
  });

  // List print jobs for a branch.
  app.get("/admin/print-jobs", async (request, reply) => {
    const query = request.query as { branchId?: string; status?: string; limit?: string };
    const limit = Math.min(Number(query.limit) || 50, 200);

    const q = database
      .select()
      .from(schema.printJob)
      .orderBy(schema.printJob.createdAt)
      .limit(limit);

    const rows = await q;
    return reply.code(200).send(rows);
  });

  // Get a single print job (with preview).
  app.get("/admin/print-jobs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const rows = await database
      .select()
      .from(schema.printJob)
      .where(eq(schema.printJob.id, id))
      .limit(1);
    if (rows.length === 0) {
      return reply.code(404).send({ error: "Trabajo de impresión no encontrado." });
    }
    return reply.code(200).send(rows[0]);
  });
}
