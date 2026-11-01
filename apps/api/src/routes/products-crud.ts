import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";

const productBody = z.object({
  officialName: z.string().min(1).max(80),
  unit: z.enum(["KG", "UNIT", "BUNCH"]),
  active: z.boolean().default(true),
});

const aliasBody = z.object({
  textNormalized: z.string().min(1).max(80),
});

export function registerProductCrudRoutes(app: FastifyInstance, database: Database): void {
  app.get("/admin/products", async (_request, reply) => {
    const products = await database
      .select()
      .from(schema.product)
      .orderBy(schema.product.officialName);
    const aliases = await database.select().from(schema.productAlias);
    const result = products.map((p) => ({
      ...p,
      aliases: aliases.filter((a) => a.productId === p.id).map((a) => a.textNormalized),
    }));
    return reply.code(200).send(result);
  });

  app.get("/admin/products/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const rows = await database
      .select()
      .from(schema.product)
      .where(eq(schema.product.id, id))
      .limit(1);
    if (rows.length === 0) {
      return reply.code(404).send({ error: "Producto no encontrado." });
    }
    const aliases = await database
      .select()
      .from(schema.productAlias)
      .where(eq(schema.productAlias.productId, id));
    return reply.code(200).send({
      ...rows[0],
      aliases: aliases.map((a) => a.textNormalized),
    });
  });

  app.post("/admin/products", async (request, reply) => {
    const parsed = productBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues.map((i) => i.message).join(", ") });
    }
    const data = parsed.data;
    try {
      const rows = await database
        .insert(schema.product)
        .values({
          officialName: data.officialName,
          unit: data.unit,
          active: data.active,
        })
        .returning();
      return reply.code(201).send(rows[0]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al crear el producto.";
      if (message.includes("unique")) {
        return reply.code(409).send({ error: "Ya existe un producto con ese nombre." });
      }
      return reply.code(500).send({ error: message });
    }
  });

  app.put("/admin/products/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = productBody.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues.map((i) => i.message).join(", ") });
    }
    const data = parsed.data;
    const rows = await database
      .update(schema.product)
      .set({
        ...(data.officialName !== undefined && { officialName: data.officialName }),
        ...(data.unit !== undefined && { unit: data.unit }),
        ...(data.active !== undefined && { active: data.active }),
        updatedAt: new Date(),
      })
      .where(eq(schema.product.id, id))
      .returning();
    if (rows.length === 0) {
      return reply.code(404).send({ error: "Producto no encontrado." });
    }
    return reply.code(200).send(rows[0]);
  });

  app.delete("/admin/products/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const rows = await database
      .update(schema.product)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(schema.product.id, id))
      .returning();
    if (rows.length === 0) {
      return reply.code(404).send({ error: "Producto no encontrado." });
    }
    return reply.code(200).send({ ok: true });
  });

  // Aliases
  app.post("/admin/products/:id/aliases", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = aliasBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues.map((i) => i.message).join(", ") });
    }
    try {
      const rows = await database
        .insert(schema.productAlias)
        .values({ productId: id, textNormalized: parsed.data.textNormalized.toLowerCase() })
        .returning();
      return reply.code(201).send(rows[0]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al agregar el sinónimo.";
      if (message.includes("unique")) {
        return reply.code(409).send({ error: "Ese sinónimo ya existe." });
      }
      return reply.code(500).send({ error: message });
    }
  });

  app.delete("/admin/products/:id/aliases/:alias", async (request, reply) => {
    const { id, alias } = request.params as { id: string; alias: string };
    await database.delete(schema.productAlias).where(eq(schema.productAlias.productId, id));
    // Re-insert all except the one to delete.
    // Actually, let's just delete by text.
    await database
      .delete(schema.productAlias)
      .where(eq(schema.productAlias.textNormalized, alias.toLowerCase()));
    return reply.code(200).send({ ok: true });
  });
}
