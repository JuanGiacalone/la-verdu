import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";

export function registerAvailabilityRoutes(app: FastifyInstance, database: Database): void {
  // Branch products (prices).
  app.get("/admin/branches/:branchId/products", async (request, reply) => {
    const { branchId } = request.params as { branchId: string };
    const products = await database.select().from(schema.product).orderBy(schema.product.officialName);
    const prices = await database
      .select()
      .from(schema.branchProduct)
      .where(eq(schema.branchProduct.branchId, branchId));
    const result = products.map((p) => {
      const price = prices.find((pr) => pr.productId === p.id);
      return {
        branchId,
        productId: p.id,
        officialName: p.officialName,
        unit: p.unit,
        priceAmount: price?.priceAmount ?? null,
        priceUnit: price?.priceUnit ?? null,
        updatedAt: price?.updatedAt ?? null,
      };
    });
    return reply.code(200).send(result);
  });

  app.put("/admin/branches/:branchId/products/:productId", async (request, reply) => {
    const { branchId, productId } = request.params as { branchId: string; productId: string };
    const body = z
      .object({
        priceAmount: z.number().nullable().optional(),
        priceUnit: z.enum(["KG", "UNIT", "BUNCH"]).nullable().optional(),
      })
      .safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues.map((i) => i.message).join(", ") });
    }
    const data = body.data;
    await database
      .insert(schema.branchProduct)
      .values({
        branchId,
        productId,
        priceAmount: data.priceAmount !== undefined ? String(data.priceAmount ?? "") : null,
        priceUnit: data.priceUnit ?? null,
      })
      .onConflictDoUpdate({
        target: [schema.branchProduct.branchId, schema.branchProduct.productId],
        set: {
          ...(data.priceAmount !== undefined && { priceAmount: data.priceAmount === null ? null : String(data.priceAmount) }),
          ...(data.priceUnit !== undefined && { priceUnit: data.priceUnit }),
          updatedAt: new Date(),
        },
      });
    const rows = await database
      .select()
      .from(schema.branchProduct)
      .where(and(eq(schema.branchProduct.branchId, branchId), eq(schema.branchProduct.productId, productId)))
      .limit(1);
    return reply.code(200).send(rows[0]);
  });

  // Branch product day availability.
  app.get("/admin/branches/:branchId/availability", async (request, reply) => {
    const { branchId } = request.params as { branchId: string };
    const query = request.query as { date?: string };
    const date = query.date ?? new Date().toISOString().slice(0, 10);
    const products = await database.select().from(schema.product).orderBy(schema.product.officialName);
    const days = await database
      .select()
      .from(schema.branchProductDay)
      .where(and(eq(schema.branchProductDay.branchId, branchId), eq(schema.branchProductDay.businessDate, date)));
    const result = products.map((p) => {
      const d = days.find((x) => x.productId === p.id);
      return {
        id: d?.id ?? null,
        branchId,
        productId: p.id,
        officialName: p.officialName,
        businessDate: date,
        availability: d?.availability ?? null,
      };
    });
    return reply.code(200).send(result);
  });

  app.put("/admin/branches/:branchId/availability/:productId", async (request, reply) => {
    const { branchId, productId } = request.params as { branchId: string; productId: string };
    const body = z
      .object({
        businessDate: z.string(),
        availability: z.enum(["AVAILABLE", "UNAVAILABLE", "PENDING_CHECK"]),
      })
      .safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues.map((i) => i.message).join(", ") });
    }
    const data = body.data;
    await database
      .insert(schema.branchProductDay)
      .values({
        branchId,
        productId,
        businessDate: data.businessDate,
        availability: data.availability,
      })
      .onConflictDoUpdate({
        target: [schema.branchProductDay.branchId, schema.branchProductDay.productId, schema.branchProductDay.businessDate],
        set: { availability: data.availability, updatedAt: new Date() },
      });
    const rows = await database
      .select()
      .from(schema.branchProductDay)
      .where(
        and(
          eq(schema.branchProductDay.branchId, branchId),
          eq(schema.branchProductDay.productId, productId),
          eq(schema.branchProductDay.businessDate, data.businessDate),
        ),
      )
      .limit(1);
    return reply.code(200).send(rows[0]);
  });
}