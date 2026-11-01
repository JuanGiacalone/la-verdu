import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import type { AppConfig } from "../../src/config.js";
import { createDatabase } from "../../src/db/client.js";
import { resetDatabase, runMigrations } from "../../src/db/migrate.js";
import { createLogger } from "../../src/logging.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

const config: AppConfig = {
  nodeEnv: "test",
  port: 0,
  databaseUrl: testDatabaseUrl ?? "postgres://unused",
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

describe.skipIf(!testDatabaseUrl)("CSV product import (integration)", () => {
  if (!testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL is required for integration tests");
  }
  const url = testDatabaseUrl;
  let app: FastifyInstance;
  let handle: ReturnType<typeof createDatabase>;

  beforeAll(async () => {
    await resetDatabase(url);
    await runMigrations(url);
    handle = createDatabase(url, 2);
    app = await buildApp({
      config: { ...config, databaseUrl: url },
      logger: createLogger({ level: "silent" }),
      readiness: { check: () => handle.check() },
      database: handle.db,
    });
  });

  afterAll(async () => {
    await app?.close();
    await handle?.close();
  });

  it("imports products from a CSV body", async () => {
    const csv = [
      "Nombre de la sección,Código de PLU,Descripción,Tipo de Venta",
      "VERDURAS,3,Lechuga Manteca,Peso",
      "FRUTAS,84,Banana Brasil,Peso",
      "HUEVOS,107,Maple Huevo Color,Unidad",
    ].join("\n");

    const response = await app.inject({
      method: "POST",
      url: "/admin/products/import-csv",
      headers: { "content-type": "text/plain" },
      payload: csv,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      imported: 3,
      skipped: 0,
      errors: [],
      total: 3,
    });

    const rows = await handle.db.select().from((await import("../../src/db/schema.js")).product);
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.officialName === "Lechuga Manteca")?.unit).toBe("KG");
    expect(rows.find((r) => r.officialName === "Maple Huevo Color")?.unit).toBe("UNIT");
  });

  it("skips duplicates and reports them", async () => {
    const csv = ["Descripción,Tipo de Venta", "Lechuga Manteca,Peso", "Nueva Fruta,Peso"].join(
      "\n",
    );

    const response = await app.inject({
      method: "POST",
      url: "/admin/products/import-csv",
      headers: { "content-type": "text/plain" },
      payload: csv,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.imported).toBe(1);
    expect(body.skipped).toBe(1);
  });

  it("rejects an empty body", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/admin/products/import-csv",
      headers: { "content-type": "text/plain" },
      payload: "",
    });

    expect(response.statusCode).toBe(400);
  });

  it("reports row-level errors for unknown sale types", async () => {
    const csv = ["Descripción,Tipo de Venta", "Producto X,Kilo"].join("\n");

    const response = await app.inject({
      method: "POST",
      url: "/admin/products/import-csv",
      headers: { "content-type": "text/plain" },
      payload: csv,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.imported).toBe(0);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]).toContain("Producto X");
  });
});
