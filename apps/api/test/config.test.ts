import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config.js";

const validEnv = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/laverdu_dev",
};

describe("loadConfig", () => {
  it("applies defaults for optional values", () => {
    const config = loadConfig(validEnv);

    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe("development");
    expect(config.logLevel).toBe("info");
    expect(config.timezone).toBe("America/Argentina/Buenos_Aires");
    expect(config.databaseUrl).toBe(validEnv.DATABASE_URL);
  });

  it("reads explicit values", () => {
    const config = loadConfig({
      ...validEnv,
      PORT: "8080",
      NODE_ENV: "production",
      LOG_LEVEL: "warn",
      TZ_APP: "America/Argentina/Cordoba",
    });

    expect(config.port).toBe(8080);
    expect(config.nodeEnv).toBe("production");
    expect(config.logLevel).toBe("warn");
    expect(config.timezone).toBe("America/Argentina/Cordoba");
  });

  it("fails naming the missing DATABASE_URL", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it("rejects an invalid port", () => {
    expect(() => loadConfig({ ...validEnv, PORT: "99999" })).toThrow(/PORT/);
    expect(() => loadConfig({ ...validEnv, PORT: "abc" })).toThrow(/PORT/);
  });

  it("rejects an unknown timezone", () => {
    expect(() => loadConfig({ ...validEnv, TZ_APP: "Mars/Olympus" })).toThrow(/TZ_APP/);
  });

  it("rejects an unknown log level", () => {
    expect(() => loadConfig({ ...validEnv, LOG_LEVEL: "verbose" })).toThrow(/LOG_LEVEL/);
  });
});
