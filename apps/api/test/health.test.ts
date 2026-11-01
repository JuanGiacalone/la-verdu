import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { createLogger } from "../src/logging.js";

const config: AppConfig = {
  nodeEnv: "test",
  port: 0,
  databaseUrl: "postgres://unused",
  timezone: "America/Argentina/Buenos_Aires",
  logLevel: "silent",
  whatsappAppSecret: "",
  whatsappVerifyToken: "",
  whatsappAccessToken: "",
  whatsappPhoneNumberId: "",
  whatsappApiVersion: "v22.0",
  llmBaseUrl: "http://localhost:8082",
  llmApiKey: "",
  llmModel: "llm-stub",
  sttBaseUrl: "http://localhost:8083",
  sttApiKey: "",
  sttModel: "stt-stub",
};

describe("health and metrics routes", () => {
  let app: FastifyInstance | undefined;

  beforeEach(() => {
    app = undefined;
  });

  afterEach(async () => {
    await app?.close();
  });

  it("reports liveness without touching dependencies", async () => {
    app = await buildApp({
      config,
      logger: createLogger({ level: "silent" }),
      readiness: { check: () => Promise.reject(new Error("db down")) },
    });

    const response = await app.inject({ method: "GET", url: "/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("reports readiness when the database check passes", async () => {
    app = await buildApp({
      config,
      logger: createLogger({ level: "silent" }),
      readiness: { check: () => Promise.resolve() },
    });

    const response = await app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ready", checks: { database: "ok" } });
  });

  it("reports unavailable when the database check fails, without leaking the error", async () => {
    app = await buildApp({
      config,
      logger: createLogger({ level: "silent" }),
      readiness: {
        check: () => Promise.reject(new Error("password authentication failed for user x")),
      },
    });

    const response = await app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "unavailable", checks: { database: "error" } });
    expect(response.body).not.toContain("password");
  });

  it("exposes Prometheus metrics including the application build info", async () => {
    app = await buildApp({
      config,
      logger: createLogger({ level: "silent" }),
      readiness: { check: () => Promise.resolve() },
    });

    const response = await app.inject({ method: "GET", url: "/metrics" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.body).toContain("laverdu_build_info");
    expect(response.body).toContain("nodejs_version_info");
  });
});
