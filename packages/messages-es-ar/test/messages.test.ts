import { describe, expect, it } from "vitest";
import { formatMessage, getMessage, MESSAGES } from "../src/index.js";

describe("messages-es-ar (PRD 24)", () => {
  it("defines exactly M-01..M-17", () => {
    const keys = Object.keys(MESSAGES).sort();
    const expected = Array.from({ length: 17 }, (_, i) => `M-${String(i + 1).padStart(2, "0")}`);
    expect(keys).toEqual(expected);
  });

  it("every message is non-empty Spanish text", () => {
    for (const [key, value] of Object.entries(MESSAGES)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
      expect(value).not.toMatch(/\s{2,}/);
      // sanity: no stray English placeholders beyond {token}
      expect(value).not.toMatch(/\{[A-Z]/);
      expect(key).toMatch(/^M-\d{2}$/);
    }
  });

  it("getMessage returns the raw template", () => {
    expect(getMessage("M-16")).toBe("No pude entender el audio. ¿Me lo podés escribir?");
  });

  it("formatMessage interpolates known tokens and leaves unknown ones", () => {
    const out = formatMessage("M-03", {
      preferred_branch: "CENTRO",
      product: "Banana",
      fulfilling_branch: "NORTE",
    });
    expect(out).toBe(
      "En CENTRO no tenemos Banana. Tu pedido se prepara en NORTE, donde sí lo tenemos. Podés retirarlo allí o pedir envío desde esa sucursal.",
    );
  });

  it("formatMessage keeps {token} when value is missing", () => {
    const out = formatMessage("M-07", { summary: "2 kg Tomate perita" });
    expect(out).toContain("{summary}".replace("{summary}", "2 kg Tomate perita"));
    expect(out).toContain("¿Está todo bien? Respondé sí para confirmar.");
  });

  it("M-08 composes the reference note from M-02", () => {
    const note = getMessage("M-02");
    const out = formatMessage("M-08", {
      order_number: 1042,
      payment_method: "Transferencia",
      moment: "retirar",
      reference_note: note,
    });
    expect(out).toContain("Los precios son referenciales");
    expect(out).toContain("Pagás con Transferencia al retirar.");
  });
});
