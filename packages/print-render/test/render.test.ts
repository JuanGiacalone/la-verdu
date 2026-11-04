import { describe, expect, it } from "vitest";
import { renderPrintJob } from "../src/index.js";
import type { PrintJobData } from "../src/types.js";

const baseData: PrintJobData = {
  branchShortName: "CENTRO",
  orderNumber: 1042,
  version: 1,
  kind: "NEW",
  confirmedAt: new Date("2026-11-01T10:32:00"),
  customerName: "Maria Gomez",
  fulfillment: "PICKUP",
  pickupTime: "11:30",
  paymentMethodName: "TRANSFERENCIA",
  paymentStatus: "TO_COLLECT",
  derived: false,
  items: [
    { quantity: 2, unit: "KG", productName: "Tomate perita" },
    { quantity: 1, unit: "UNIT", productName: "Lechuga crespa" },
    { quantity: 0.5, unit: "KG", productName: "Banana" },
  ],
  notes: "sin cascara en la banana. Llama al llegar.",
};

describe("renderPrintJob", () => {
  it("produces a non-empty byte array and preview", () => {
    const result = renderPrintJob(baseData);
    expect(result.bytes.length).toBeGreaterThan(0);
    expect(result.preview.length).toBeGreaterThan(0);
  });

  it("preview contains the order number", () => {
    const result = renderPrintJob(baseData);
    expect(result.preview).toContain("PEDIDO #1042");
  });

  it("preview contains only product and quantity, no price", () => {
    const result = renderPrintJob(baseData);
    expect(result.preview).toContain("Tomate perita");
    expect(result.preview).toContain("2 kg");
    expect(result.preview).not.toContain("$");
    expect(result.preview).not.toContain("TOTAL");
    expect(result.preview).not.toContain("Calidad");
  });

  it("formats half kilo as 1/2", () => {
    const result = renderPrintJob(baseData);
    expect(result.preview).toContain("1/2 kg");
  });

  it("shows MODIFICACION for version 2", () => {
    const result = renderPrintJob({ ...baseData, version: 2, kind: "MODIFICATION" });
    expect(result.preview).toContain("*** MODIFICACION ***");
    expect(result.preview).toContain("VERSION 2");
  });

  it("shows CANCELADO for cancellation", () => {
    const result = renderPrintJob({ ...baseData, version: 2, kind: "CANCELLATION" });
    expect(result.preview).toContain("*** CANCELADO ***");
  });

  it("shows derivation note", () => {
    const result = renderPrintJob({
      ...baseData,
      derived: true,
      preferredBranchShortName: "CENTRO",
      branchShortName: "NORTE",
    });
    expect(result.preview).toContain("Derivado desde: SUC. CENTRO");
  });

  it("shows delivery address", () => {
    const result = renderPrintJob({
      ...baseData,
      fulfillment: "DELIVERY",
      deliveryAddress: "Av. Siempreviva 742",
      pickupTime: undefined,
    });
    expect(result.preview).toContain("DOMICILIO");
    expect(result.preview).toContain("Siempreviva");
  });

  it("omits notes line when empty", () => {
    const result = renderPrintJob({ ...baseData, notes: undefined });
    expect(result.preview).not.toContain("Notas:");
  });

  it("strips accents from output", () => {
    const result = renderPrintJob({ ...baseData, customerName: "María Gómez", notes: "café" });
    expect(result.preview).not.toContain("í");
    expect(result.preview).not.toContain("ó");
    expect(result.preview).toContain("Maria Gomez");
  });

  it("bytes start with ESC @ initialization", () => {
    const result = renderPrintJob(baseData);
    expect(result.bytes[0]).toBe(0x1b);
    expect(result.bytes[1]).toBe(0x40);
  });

  it("bytes end with partial cut command", () => {
    const result = renderPrintJob(baseData);
    const len = result.bytes.length;
    // GS V 1
    expect(result.bytes[len - 3]).toBe(0x1d);
    expect(result.bytes[len - 2]).toBe(0x56);
    expect(result.bytes[len - 1]).toBe(0x01);
  });

  it("preview matches golden file (snapshot)", () => {
    const result = renderPrintJob(baseData);
    expect(result.preview).toMatchSnapshot();
  });

  it("shows NUEVO for a first-time customer (count 1)", () => {
    const result = renderPrintJob({ ...baseData, customerOrderCount: 1 });
    expect(result.preview).toContain("NUEVO");
    expect(result.bytes.length).toBeGreaterThan(0);
  });

  it("shows order number for a returning customer (count > 1)", () => {
    const result = renderPrintJob({ ...baseData, customerOrderCount: 3 });
    expect(result.preview).toContain("pedido #3");
    expect(result.preview).not.toContain("NUEVO");
  });

  it("omits order count suffix when not provided", () => {
    const result = renderPrintJob(baseData);
    expect(result.preview).not.toContain("NUEVO");
    expect(result.preview).not.toContain("pedido #");
  });
});
