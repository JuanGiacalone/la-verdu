import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";

const staffBody = z.object({
  phoneE164: z.string().regex(/^\+[1-9][0-9]{7,14}$/, "Teléfono inválido (formato E.164)"),
  name: z.string().min(1).max(80),
  role: z.enum(["OWNER", "SELLER"]),
  active: z.boolean().default(true),
  branchIds: z.array(z.string().uuid()).default([]),
});

export function registerStaffRoutes(app: FastifyInstance, database: Database): void {
  app.get("/admin/staff", async (_request, reply) => {
    const staff = await database.select().from(schema.staff).orderBy(schema.staff.name);
    // Load branch assignments for each staff member.
    const assignments = await database.select().from(schema.staffBranch);
    const result = staff.map((s) => ({
      ...s,
      branchIds: assignments.filter((a) => a.staffId === s.id).map((a) => a.branchId),
    }));
    return reply.code(200).send(result);
  });

  app.get("/admin/staff/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const rows = await database.select().from(schema.staff).where(eq(schema.staff.id, id)).limit(1);
    if (rows.length === 0) {
      return reply.code(404).send({ error: "Personal no encontrado." });
    }
    const assignments = await database
      .select()
      .from(schema.staffBranch)
      .where(eq(schema.staffBranch.staffId, id));
    return reply.code(200).send({
      ...rows[0],
      branchIds: assignments.map((a) => a.branchId),
    });
  });

  app.post("/admin/staff", async (request, reply) => {
    const parsed = staffBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues.map((i) => i.message).join(", ") });
    }
    const data = parsed.data;

    const rows = await database
      .insert(schema.staff)
      .values({
        phoneE164: data.phoneE164,
        name: data.name,
        role: data.role,
        active: data.active,
      })
      .returning();

    const staffId = rows[0]?.id;
    if (!staffId) {
      return reply.code(500).send({ error: "Error al crear el personal." });
    }

    // Assign branches.
    for (const branchId of data.branchIds) {
      await database.insert(schema.staffBranch).values({ staffId, branchId }).onConflictDoNothing();
    }

    return reply.code(201).send({ ...rows[0], branchIds: data.branchIds });
  });

  app.put("/admin/staff/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = staffBody.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues.map((i) => i.message).join(", ") });
    }
    const data = parsed.data;

    const rows = await database
      .update(schema.staff)
      .set({
        ...(data.phoneE164 !== undefined && { phoneE164: data.phoneE164 }),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.role !== undefined && { role: data.role }),
        ...(data.active !== undefined && { active: data.active }),
        updatedAt: new Date(),
      })
      .where(eq(schema.staff.id, id))
      .returning();

    if (rows.length === 0) {
      return reply.code(404).send({ error: "Personal no encontrado." });
    }

    // Update branch assignments if provided.
    if (data.branchIds !== undefined) {
      await database.delete(schema.staffBranch).where(eq(schema.staffBranch.staffId, id));
      for (const branchId of data.branchIds) {
        await database
          .insert(schema.staffBranch)
          .values({ staffId: id, branchId })
          .onConflictDoNothing();
      }
    }

    return reply.code(200).send(rows[0]);
  });

  app.delete("/admin/staff/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const rows = await database
      .update(schema.staff)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(schema.staff.id, id))
      .returning();
    if (rows.length === 0) {
      return reply.code(404).send({ error: "Personal no encontrado." });
    }
    return reply.code(200).send({ ok: true });
  });
}
