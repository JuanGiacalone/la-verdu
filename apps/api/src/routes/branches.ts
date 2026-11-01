import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";

const branchBody = z.object({
  shortName: z.string().min(1).max(20),
  fullName: z.string().min(1).max(120),
  address: z.string().optional(),
  timezone: z.string().default("America/Argentina/Buenos_Aires"),
  opensAt: z.string().regex(/^\d{2}:\d{2}$/),
  closesAt: z.string().regex(/^\d{2}:\d{2}$/),
  dayStartAt: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  deliveryEnabled: z.boolean().default(true),
  priority: z.number().int().min(0).default(0),
  printerAddress: z.string().optional(),
  active: z.boolean().default(true),
});

export function registerBranchRoutes(app: FastifyInstance, database: Database): void {
  app.get("/admin/branches", async (_request, reply) => {
    const branches = await database.select().from(schema.branch).orderBy(schema.branch.priority);
    return reply.code(200).send(branches);
  });

  app.get("/admin/branches/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const rows = await database
      .select()
      .from(schema.branch)
      .where(eq(schema.branch.id, id))
      .limit(1);
    if (rows.length === 0) {
      return reply.code(404).send({ error: "Sucursal no encontrada." });
    }
    return reply.code(200).send(rows[0]);
  });

  app.post("/admin/branches", async (request, reply) => {
    const parsed = branchBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues.map((i) => i.message).join(", ") });
    }
    const data = parsed.data;
    const rows = await database
      .insert(schema.branch)
      .values({
        shortName: data.shortName,
        fullName: data.fullName,
        address: data.address ?? null,
        timezone: data.timezone,
        opensAt: data.opensAt,
        closesAt: data.closesAt,
        dayStartAt: data.dayStartAt ?? data.opensAt,
        deliveryEnabled: data.deliveryEnabled,
        priority: data.priority,
        printerAddress: data.printerAddress ?? null,
        active: data.active,
      })
      .returning();
    return reply.code(201).send(rows[0]);
  });

  app.put("/admin/branches/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = branchBody.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues.map((i) => i.message).join(", ") });
    }
    const data = parsed.data;
    const rows = await database
      .update(schema.branch)
      .set({
        ...(data.shortName !== undefined && { shortName: data.shortName }),
        ...(data.fullName !== undefined && { fullName: data.fullName }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.timezone !== undefined && { timezone: data.timezone }),
        ...(data.opensAt !== undefined && { opensAt: data.opensAt }),
        ...(data.closesAt !== undefined && { closesAt: data.closesAt }),
        ...(data.dayStartAt !== undefined && { dayStartAt: data.dayStartAt }),
        ...(data.deliveryEnabled !== undefined && { deliveryEnabled: data.deliveryEnabled }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.printerAddress !== undefined && { printerAddress: data.printerAddress }),
        ...(data.active !== undefined && { active: data.active }),
        updatedAt: new Date(),
      })
      .where(eq(schema.branch.id, id))
      .returning();
    if (rows.length === 0) {
      return reply.code(404).send({ error: "Sucursal no encontrada." });
    }
    return reply.code(200).send(rows[0]);
  });

  app.delete("/admin/branches/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const rows = await database
      .update(schema.branch)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(schema.branch.id, id))
      .returning();
    if (rows.length === 0) {
      return reply.code(404).send({ error: "Sucursal no encontrada." });
    }
    return reply.code(200).send({ ok: true });
  });
}
