import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { type Database } from "../db/client.js";
import { importProductsFromCsv } from "../products/csv-import.js";

const importBodySchema = z.string().min(1, "El CSV no puede estar vacío");

export function registerProductRoutes(app: FastifyInstance, database: Database): void {
  app.post(
    "/admin/products/import-csv",
    {
      schema: {
        body: { type: "string" },
        response: {
          200: {
            type: "object",
            properties: {
              imported: { type: "integer" },
              skipped: { type: "integer" },
              errors: { type: "array", items: { type: "string" } },
              total: { type: "integer" },
            },
            required: ["imported", "skipped", "errors", "total"],
          },
          400: {
            type: "object",
            properties: {
              error: { type: "string" },
            },
            required: ["error"],
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = importBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "CSV inválido" });
      }

      const result = await importProductsFromCsv(database, parsed.data);
      return reply.code(200).send(result);
    },
  );
}
