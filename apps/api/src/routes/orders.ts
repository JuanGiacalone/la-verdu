import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";
import { getOrderStats, getOrderSummary } from "../orders/stats.js";

export function registerOrderRoutes(app: FastifyInstance, database: Database): void {
  // List orders with filters.
  app.get("/admin/orders", async (request, reply) => {
    const query = request.query as {
      branchId?: string;
      status?: string;
      fulfillment?: string;
      from?: string;
      to?: string;
      limit?: string;
    };
    const limit = Math.min(Number(query.limit) || 50, 200);

    const q = database.select().from(schema.order).orderBy(schema.order.createdAt).limit(limit);

    const rows = await q;
    return reply.code(200).send(rows);
  });

  // Get order details with items.
  app.get("/admin/orders/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const orderRows = await database
      .select()
      .from(schema.order)
      .where(eq(schema.order.id, id))
      .limit(1);
    if (orderRows.length === 0) {
      return reply.code(404).send({ error: "Pedido no encontrado." });
    }
    const items = await database
      .select()
      .from(schema.orderItem)
      .where(eq(schema.orderItem.orderId, id));
    return reply.code(200).send({ ...orderRows[0], items });
  });

  // Order statistics.
  app.get("/admin/orders/stats", async (request, reply) => {
    const query = request.query as {
      period?: string;
      from?: string;
      to?: string;
      branchId?: string;
    };
    const period = (query.period === "month" || query.period === "year" ? query.period : "day") as
      | "day"
      | "month"
      | "year";

    const stats = await getOrderStats(database, {
      period,
      from: query.from,
      to: query.to,
      branchId: query.branchId,
    });
    return reply.code(200).send(stats);
  });

  // Quick summary (today, this month, this year, all time).
  app.get("/admin/orders/summary", async (request, reply) => {
    const query = request.query as { branchId?: string };
    const summary = await getOrderSummary(database, query.branchId);
    return reply.code(200).send(summary);
  });

  // Cancel an order from admin.
  app.post("/admin/orders/:id/cancel", async (request, reply) => {
    const { id } = request.params as { id: string };
    const rows = await database
      .update(schema.order)
      .set({ status: "CANCELLED", cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.order.id, id))
      .returning();
    if (rows.length === 0) {
      return reply.code(404).send({ error: "Pedido no encontrado." });
    }
    return reply.code(200).send({ ok: true });
  });

  // Update payment status.
  app.put("/admin/orders/:id/payment-status", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({ status: z.enum(["TO_COLLECT", "PAID"]) }).safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Estado de pago inválido." });
    }
    const rows = await database
      .update(schema.order)
      .set({ paymentStatus: body.data.status, updatedAt: new Date() })
      .where(eq(schema.order.id, id))
      .returning();
    if (rows.length === 0) {
      return reply.code(404).send({ error: "Pedido no encontrado." });
    }
    return reply.code(200).send(rows[0]);
  });

  // Update prep status.
  app.put("/admin/orders/:id/prep-status", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({ status: z.enum(["PENDING", "IN_PREPARATION", "READY", "DELIVERED"]) })
      .safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Estado de preparación inválido." });
    }
    const rows = await database
      .update(schema.order)
      .set({ prepStatus: body.data.status, updatedAt: new Date() })
      .where(eq(schema.order.id, id))
      .returning();
    if (rows.length === 0) {
      return reply.code(404).send({ error: "Pedido no encontrado." });
    }
    return reply.code(200).send(rows[0]);
  });
}
