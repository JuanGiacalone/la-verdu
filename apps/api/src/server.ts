import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDatabase } from "./db/client.js";
import { createLogger } from "./logging.js";
import { createSessionStore } from "./routes/auth.js";

// registerSessionPlugin is called inside buildApp

/**
 * Process entrypoint. Config is validated before anything else starts, and the
 * process closes the database pool on shutdown.
 */
async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const logger = createLogger({ level: config.logLevel });
  const database = createDatabase(config.databaseUrl);
  const sessionStore = createSessionStore();

  const app = await buildApp({
    config,
    logger,
    readiness: { check: () => database.check() },
    database: database.db,
    sessionStore,
    isProduction: config.nodeEnv === "production",
  });

  // Session plugin is registered inside buildApp.

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    await app.close();
    await database.close();
    process.exit(0);
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));

  await app.listen({ port: config.port, host: "0.0.0.0" });
  logger.info({ port: config.port, env: config.nodeEnv }, "api listening");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown startup error";
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
