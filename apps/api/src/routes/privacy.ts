import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.js";
import { exportCustomerData, rectifyCustomerData, suppressCustomerData } from "../privacy/arco.js";
import { purgeOldData } from "../privacy/purge.js";

export function registerPrivacyRoutes(app: FastifyInstance, database: Database): void {
  // Export customer data (ARCO: Access).
  app.get("/admin/privacy/export/:customerId", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const data = await exportCustomerData(database, customerId);
    if (!data) {
      return reply.code(404).send({ error: "Cliente no encontrado." });
    }
    return reply.code(200).send(data);
  });

  // Rectify customer data (ARCO: Rectification).
  app.put("/admin/privacy/rectify/:customerId", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const body = z
      .object({
        name: z.string().optional(),
        addressText: z.string().optional(),
        usualFulfillment: z.enum(["PICKUP", "DELIVERY"]).optional(),
      })
      .safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues.map((i) => i.message).join(", ") });
    }
    const ok = await rectifyCustomerData(database, customerId, body.data);
    if (!ok) {
      return reply.code(404).send({ error: "Cliente no encontrado." });
    }
    return reply.code(200).send({ ok: true });
  });

  // Suppress customer data (ARCO: Suppression).
  app.delete("/admin/privacy/suppress/:customerId", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const ok = await suppressCustomerData(database, customerId);
    if (!ok) {
      return reply.code(404).send({ error: "Cliente no encontrado." });
    }
    return reply.code(200).send({ ok: true });
  });

  // Purge old data (admin/scheduler).
  app.post("/admin/privacy/purge", async (request, reply) => {
    const body = z
      .object({ retentionMonths: z.number().int().min(1).max(60).default(12) })
      .safeParse(request.body ?? {});
    const months = body.success ? body.data.retentionMonths : 12;
    const result = await purgeOldData(database, months);
    return reply.code(200).send(result);
  });
}
