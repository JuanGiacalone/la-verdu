import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";

export function registerOpsRoutes(app: FastifyInstance, database: Database): void {
  // Operational status: queues, alerts, agents.
  app.get("/admin/ops/status", async (_request, reply) => {
    // Pending print jobs.
    const pendingPrints = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.printJob)
      .where(eq(schema.printJob.status, "QUEUED"));

    const failedPrints = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.printJob)
      .where(eq(schema.printJob.status, "FAILED"));

    const abandonedPrints = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.printJob)
      .where(eq(schema.printJob.status, "ABANDONED"));

    const heldPrints = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.printJob)
      .where(eq(schema.printJob.status, "HELD"));

    // Open alerts.
    const openAlerts = await database
      .select()
      .from(schema.alert)
      .where(eq(schema.alert.status, "OPEN"))
      .orderBy(schema.alert.createdAt);

    // Agent sessions (last seen).
    const agents = await database.select().from(schema.agentSession);

    // Escalated conversations.
    const escalated = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.conversation)
      .where(eq(schema.conversation.state, "ESCALATED"));

    // Draft orders.
    const drafts = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.order)
      .where(eq(schema.order.status, "DRAFT"));

    return reply.code(200).send({
      printQueue: {
        queued: pendingPrints[0]?.count ?? 0,
        failed: failedPrints[0]?.count ?? 0,
        abandoned: abandonedPrints[0]?.count ?? 0,
        held: heldPrints[0]?.count ?? 0,
      },
      alerts: openAlerts,
      agents: agents.map((a) => ({
        branchId: a.branchId,
        version: a.agentVersion,
        lastSeen: a.lastSeenAt,
        printerStatus: a.printerStatus,
      })),
      escalatedConversations: escalated[0]?.count ?? 0,
      draftOrders: drafts[0]?.count ?? 0,
    });
  });

  // Acknowledge an alert.
  app.put("/admin/ops/alerts/:id/acknowledge", async (request, reply) => {
    const { id } = request.params as { id: string };
    const rows = await database
      .update(schema.alert)
      .set({ status: "ACKNOWLEDGED", acknowledgedAt: new Date() })
      .where(eq(schema.alert.id, id))
      .returning();
    if (rows.length === 0) {
      return reply.code(404).send({ error: "Alerta no encontrada." });
    }
    return reply.code(200).send({ ok: true });
  });
}
