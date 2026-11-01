import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import { registerSessionPlugin } from "./auth/session.js";
import { createWhatsAppChannel } from "./channels/whatsapp.js";
import type { AppConfig } from "./config.js";
import type { Database } from "./db/client.js";
import { createMetrics } from "./metrics.js";
import { registerAuditRoutes } from "./routes/audit.js";
import { type createSessionStore, registerAuthRoutes } from "./routes/auth.js";
import { registerBranchRoutes } from "./routes/branches.js";
import { registerPaymentMethodRoutes } from "./routes/payment-methods.js";
import { registerProductRoutes } from "./routes/products.js";
import { registerProductCrudRoutes } from "./routes/products-crud.js";
import { registerStaffRoutes } from "./routes/staff.js";
import { registerWhatsAppWebhook } from "./webhooks/whatsapp.js";

/** A dependency probe. Resolves when healthy, rejects when not. */
export interface Readiness {
  check(): Promise<void>;
}

export interface BuildAppOptions {
  readonly config: AppConfig;
  readonly logger: FastifyBaseLogger;
  readonly readiness: Readiness;
  readonly database?: Database;
  readonly sessionStore?: ReturnType<typeof createSessionStore>;
  readonly isProduction?: boolean;
  readonly version?: string;
}

/**
 * Builds the HTTP application without listening. Tests use `app.inject`;
 * `server.ts` is the only place that binds a port.
 */
export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ loggerInstance: options.logger });
  const metrics = createMetrics(options.version ?? "0.1.0");

  if (options.sessionStore) {
    await registerSessionPlugin(app, process.env.SESSION_SECRET ?? "dev-secret-only");
  }

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
    registerProductCrudRoutes(app, options.database);
    registerBranchRoutes(app, options.database);
    registerStaffRoutes(app, options.database);
    registerPaymentMethodRoutes(app, options.database);
    registerAuditRoutes(app, options.database);

    if (options.sessionStore) {
      registerAuthRoutes(
        app,
        options.database,
        options.sessionStore,
        options.isProduction ?? false,
      );
    }

    // WhatsApp webhook (only if configured).
    if (options.config.whatsappAppSecret) {
      const channel = createWhatsAppChannel({
        accessToken: options.config.whatsappAccessToken,
        phoneNumberId: options.config.whatsappPhoneNumberId,
        apiVersion: options.config.whatsappApiVersion,
        appSecret: options.config.whatsappAppSecret,
      });
      registerWhatsAppWebhook(app, {
        database: options.database,
        channel,
        appSecret: options.config.whatsappAppSecret,
        verifyToken: options.config.whatsappVerifyToken,
        onMessage: async (msg) => {
          const { createSttProvider } = await import("./stt/interface.js");
          const stt = createSttProvider(options.config);
          if (msg.isStaff) {
            const { handleStaffMessage } = await import("./conversations/handler.js");
            await handleStaffMessage(
              {
                database: options.database as Database,
                channel,
                stt,
                llmBaseUrl: options.config.llmBaseUrl,
                llmApiKey: options.config.llmApiKey,
                llmModel: options.config.llmModel,
              },
              msg.phoneE164,
              msg.waMessageId,
              msg.type,
              msg.text,
              msg.mediaId,
            );
          } else {
            const { handleCustomerMessage } = await import("./customers/handler.js");
            await handleCustomerMessage(
              {
                database: options.database as Database,
                channel,
                stt,
                llmBaseUrl: options.config.llmBaseUrl,
                llmApiKey: options.config.llmApiKey,
                llmModel: options.config.llmModel,
              },
              msg.phoneE164,
              msg.waMessageId,
              msg.type,
              msg.text,
              msg.mediaId,
            );
          }
        },
      });
    }
  }

  return app;
}
