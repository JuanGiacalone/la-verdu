import pino, { type DestinationStream, type Logger } from "pino";

/** Keys whose values are personal data (Ley 25.326). Phones are masked, the rest are removed. */
const PHONE_KEYS = new Set([
  "phone",
  "phone_e164",
  "wa_id",
  "from",
  "to",
  "customer_phone",
  "staff_phone",
]);
const PERSONAL_KEYS = new Set([
  "address",
  "address_text",
  "delivery_address",
  "name",
  "body",
  "body_text",
  "transcript",
]);

const PHONE_IN_TEXT = /\+\d{8,15}/g;

/** Masks a phone number keeping the country prefix and the last four digits. */
export function maskPhone(phone: string): string {
  const digits = phone.trim();
  if (digits.length < 8) {
    return "***";
  }
  return `${digits.slice(0, 4)}***${digits.slice(-4)}`;
}

function maskPhonesInText(text: string): string {
  return text.replace(PHONE_IN_TEXT, (match) => maskPhone(match));
}

export interface LoggerOptions {
  readonly level: string;
  readonly destination?: DestinationStream;
}

/**
 * Structured JSON logger. Personal data never reaches the output in clear text:
 * phone fields are masked, address and message content are redacted, and phone
 * numbers embedded in free text are masked as well.
 */
export function createLogger(options: LoggerOptions): Logger {
  const redactPaths = [
    ...[...PHONE_KEYS].flatMap((key) => [key, `*.${key}`]),
    ...[...PERSONAL_KEYS].flatMap((key) => [key, `*.${key}`]),
  ];

  return pino(
    {
      level: options.level,
      base: { service: "la-verdu-api" },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: {
        paths: redactPaths,
        censor: (value: unknown, path: string[]) => {
          const key = path[path.length - 1] ?? "";
          if (PHONE_KEYS.has(key) && typeof value === "string") {
            return maskPhone(value);
          }
          return "[REDACTED]";
        },
      },
      hooks: {
        logMethod(args, method) {
          const masked = args.map((arg) => (typeof arg === "string" ? maskPhonesInText(arg) : arg));
          method.apply(this, masked as Parameters<typeof method>);
        },
      },
    },
    options.destination,
  );
}
