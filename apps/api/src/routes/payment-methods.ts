import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";

export function registerPaymentMethodRoutes(app: FastifyInstance, database: Database): void {
  app.get("/admin/branches/:branchId/payment-methods", async (request, reply) => {
    const { branchId } = request.params as { branchId: string };
    const methods = await database.select().from(schema.paymentMethod);
    const enabled = await database
      .select()
      .from(schema.branchPaymentMethod)
      .where(eq(schema.branchPaymentMethod.branchId, branchId));

    const result = methods.map((m) => ({
      ...m,
      enabled: enabled.find((e) => e.paymentMethodId === m.id)?.enabled ?? false,
    }));
    return reply.code(200).send(result);
  });

  app.put("/admin/branches/:branchId/payment-methods", async (request, reply) => {
    const { branchId } = request.params as { branchId: string };
    const body = z
      .array(z.object({ paymentMethodId: z.string().uuid(), enabled: z.boolean() }))
      .safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues.map((i) => i.message).join(", ") });
    }

    for (const item of body.data) {
      await database
        .insert(schema.branchPaymentMethod)
        .values({
          branchId,
          paymentMethodId: item.paymentMethodId,
          enabled: item.enabled,
        })
        .onConflictDoUpdate({
          target: [schema.branchPaymentMethod.branchId, schema.branchPaymentMethod.paymentMethodId],
          set: { enabled: item.enabled },
        });
    }

    return reply.code(200).send({ ok: true });
  });
}
