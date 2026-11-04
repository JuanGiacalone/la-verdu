import { ilike, or, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";

export function registerCustomerRoutes(app: FastifyInstance, database: Database): void {
  app.get("/admin/customers", async (request, reply) => {
    const query = request.query as { search?: string; limit?: string };
    const limit = Math.min(Number(query.limit) || 50, 200);
    const search = query.search?.trim();
    const base = database.select().from(schema.customer).orderBy(schema.customer.createdAt).limit(limit);
    if (!search) {
      const rows = await base;
      return reply.code(200).send(rows);
    }
    const rows = await database
      .select()
      .from(schema.customer)
      .where(or(ilike(schema.customer.name, `%${search}%`), ilike(schema.customer.phoneE164, `%${search}%`)))
      .orderBy(schema.customer.createdAt)
      .limit(limit);
    return reply.code(200).send(rows);
  });

  app.get("/admin/customers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const rows = await database.select().from(schema.customer).where(eq(schema.customer.id, id)).limit(1);
    if (rows.length === 0) {
      return reply.code(404).send({ error: "Cliente no encontrado." });
    }
    return reply.code(200).send(rows[0]);
  });

  app.put("/admin/customers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        name: z.string().optional(),
        addressText: z.string().optional(),
        usualFulfillment: z.enum(["PICKUP", "DELIVERY"]).optional(),
        preferredBranchId: z.string().uuid().nullable().optional(),
      })
      .safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues.map((i) => i.message).join(", ") });
    }
    const data = body.data;
    const rows = await database
      .update(schema.customer)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.addressText !== undefined && { addressText: data.addressText }),
        ...(data.usualFulfillment !== undefined && { usualFulfillment: data.usualFulfillment }),
        ...(data.preferredBranchId !== undefined && { preferredBranchId: data.preferredBranchId }),
        updatedAt: new Date(),
      })
      .where(eq(schema.customer.id, id))
      .returning();
    if (rows.length === 0) {
      return reply.code(404).send({ error: "Cliente no encontrado." });
    }
    return reply.code(200).send(rows[0]);
  });
}