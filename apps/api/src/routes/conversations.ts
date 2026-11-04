import { eq, desc } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";

export function registerConversationRoutes(app: FastifyInstance, database: Database): void {
  app.get("/admin/conversations", async (_request, reply) => {
    const rows = await database
      .select()
      .from(schema.conversation)
      .orderBy(desc(schema.conversation.lastInboundAt));
    return reply.code(200).send(rows);
  });

  app.get("/admin/conversations/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const convRows = await database
      .select()
      .from(schema.conversation)
      .where(eq(schema.conversation.id, id))
      .limit(1);
    if (convRows.length === 0) {
      return reply.code(404).send({ error: "Conversación no encontrada." });
    }
    const messages = await database
      .select()
      .from(schema.message)
      .where(eq(schema.message.conversationId, id))
      .orderBy(schema.message.createdAt);
    return reply.code(200).send({ ...convRows[0], messages });
  });

  app.post("/admin/conversations/:id/resolve", async (request, reply) => {
    const { id } = request.params as { id: string };
    const rows = await database
      .update(schema.conversation)
      .set({ state: "CLOSED", updatedAt: new Date() })
      .where(eq(schema.conversation.id, id))
      .returning();
    if (rows.length === 0) {
      return reply.code(404).send({ error: "Conversación no encontrada." });
    }
    return reply.code(200).send({ ok: true });
  });

  app.post("/admin/conversations/:id/reply", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({ text: z.string().min(1) }).safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Texto requerido." });
    }
    const convRows = await database
      .select()
      .from(schema.conversation)
      .where(eq(schema.conversation.id, id))
      .limit(1);
    if (convRows.length === 0) {
      return reply.code(404).send({ error: "Conversación no encontrada." });
    }
    await database.insert(schema.message).values({
      waMessageId: `admin-${crypto.randomUUID()}`,
      conversationId: id,
      direction: "OUTBOUND",
      type: "TEXT",
      bodyText: body.data.text,
    });
    return reply.code(200).send({ ok: true });
  });
}