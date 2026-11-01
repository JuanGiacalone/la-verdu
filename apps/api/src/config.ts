import { z } from "zod";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface AppConfig {
  readonly nodeEnv: "development" | "test" | "production";
  readonly port: number;
  readonly databaseUrl: string;
  readonly timezone: string;
  readonly logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
}

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z
    .string()
    .regex(/^\d+$/, "must be an integer")
    .default("3000")
    .refine((value) => Number(value) >= 1 && Number(value) <= 65535, "must be between 1 and 65535"),
  DATABASE_URL: z.string().min(1, "is required"),
  TZ_APP: z
    .string()
    .default("America/Argentina/Buenos_Aires")
    .refine(isValidTimezone, "must be a valid IANA timezone"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

/**
 * Validates process configuration once at startup. Fails fast with every
 * problem listed, so a misconfigured deployment never starts half-working.
 */
export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${String(issue.path[0] ?? "env")}: ${issue.message}`)
      .join("; ");
    throw new ConfigError(`Invalid configuration: ${details}`);
  }

  const values = result.data;
  return {
    nodeEnv: values.NODE_ENV,
    port: Number(values.PORT),
    databaseUrl: values.DATABASE_URL,
    timezone: values.TZ_APP,
    logLevel: values.LOG_LEVEL,
  };
}
