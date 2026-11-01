import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";
import type { Database } from "./db/client.js";
import { createMetrics } from "./metrics.js";
import { registerProductRoutes } from "./routes/products.js";

/** A dependency probe. Resolves when healthy, rejects when not. */
export interface Readiness {
  check(): Promise<void>;
}

export interface BuildAppOptions {
  readonly config: AppConfig;
  readonly logger: FastifyBaseLogger;
  readonly readiness: Readiness;
  readonly database?: Database;
  readonly version?: string;
}

/**
 * Builds the HTTP application without listening. Tests use `app.inject`;
 * `server.ts` is the only place that binds a port.
 */
export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ loggerInstance: options.logger });
  const metrics = createMetrics(options.version ?? "0.1.0");

  app.get("/health/live", async () => ({ status: "ok" }));

  app.get("/health/ready", async (_request, reply) => {
    try {
      await options.readiness.check();
      return reply.code(200).send({ status: "ready", checks: { database: "ok" } });
    } catch {
      // The probe error is not returned: it may contain connection details.
      options.logger.warn({ check: "database" }, "readiness check failed");
      return reply.code(503).send({ status: "unavailable", checks: { database: "error" } });
    }
  });

  app.get("/metrics", async (_request, reply) => {
    reply.header("content-type", metrics.registry.contentType);
    return reply.send(await metrics.registry.metrics());
  });

  if (options.database) {
    registerProductRoutes(app, options.database);
  }

  return app;
}
