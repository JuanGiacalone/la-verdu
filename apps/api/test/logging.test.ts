import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger, maskPhone } from "../src/logging.js";

describe("maskPhone", () => {
  it("keeps the country prefix and the last four digits", () => {
    expect(maskPhone("+5491155554521")).toBe("+549***4521");
  });

  it("hides short values completely", () => {
    expect(maskPhone("1234")).toBe("***");
  });

  it("returns a placeholder for empty values", () => {
    expect(maskPhone("")).toBe("***");
  });
});

describe("createLogger", () => {
  function captureLogger() {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    const logger = createLogger({ level: "info", destination: stream });
    return { logger, lines };
  }

  it("never writes a full phone number or address in clear text", () => {
    const { logger, lines } = captureLogger();

    logger.info({ phone_e164: "+5491155554521", address: "Av. Siempreviva 742" }, "inbound");

    const output = lines.join("");
    expect(output).not.toContain("+5491155554521");
    expect(output).not.toContain("Siempreviva");
    expect(output).toContain("***");
  });

  it("masks phone numbers that appear inside the message text", () => {
    const { logger, lines } = captureLogger();

    logger.info("contact +5491155554521 failed");

    expect(lines.join("")).not.toContain("+5491155554521");
  });
});
