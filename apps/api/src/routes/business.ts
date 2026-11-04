import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";

const businessBody = z.object({
  name: z.string().min(1).max(120),
  ownerName: z.string().max(80).nullable().optional(),
  phoneE164: z.string().max(16).nullable().optional(),
  addressText: z.string().nullable().optional(),
  agentNotes: z.string().nullable().optional(),
});

export function registerBusinessRoutes(app: FastifyInstance, database: Database): void {
  // Public endpoint: business name for the login page / site title (no auth required).
  app.get("/business", async (_request, reply) => {
    const rows = await database
      .select({ name: schema.business.name })
      .from(schema.business)
      .limit(1);
    const row = rows[0];
    if (!row) {
      return reply.code(404).send({ error: "Negocio no configurado." });
    }
    return reply.code(200).send({ name: row.name });
  });

  app.get("/admin/business", async (_request, reply) => {
    const rows = await database.select().from(schema.business).limit(1);
    if (rows.length === 0) {
      return reply.code(404).send({ error: "Negocio no configurado." });
    }
    return reply.code(200).send(rows[0]);
  });

  app.put("/admin/business", async (request, reply) => {
    const parsed = businessBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues.map((i) => i.message).join(", ") });
    }
    const data = parsed.data;

    const existing = await database.select().from(schema.business).limit(1);
    if (existing.length === 0) {
      const rows = await database
        .insert(schema.business)
        .values({
          name: data.name,
          ownerName: data.ownerName ?? null,
          phoneE164: data.phoneE164 ?? null,
          addressText: data.addressText ?? null,
          agentNotes: data.agentNotes ?? null,
        })
        .returning();
      return reply.code(201).send(rows[0]);
    }

    const existingRow = existing[0];
    if (!existingRow) {
      return reply.code(500).send({ error: "Negocio no encontrado." });
    }

    const rows = await database
      .update(schema.business)
      .set({
        name: data.name,
        ownerName: data.ownerName ?? null,
        phoneE164: data.phoneE164 ?? null,
        addressText: data.addressText ?? null,
        agentNotes: data.agentNotes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.business.id, existingRow.id))
      .returning();
    return reply.code(200).send(rows[0]);
  });
}
