import { describe, expect, it } from "vitest";
import { extractProducts, parseCsv } from "../../src/products/csv-import.js";

describe("parseCsv", () => {
  it("parses a simple CSV with a header", () => {
    const text = "a,b,c\n1,2,3\n4,5,6";
    expect(parseCsv(text)).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("handles quoted fields with commas", () => {
    const text = 'name,desc\n"Smith, John","hello, world"';
    expect(parseCsv(text)).toEqual([
      ["name", "desc"],
      ["Smith, John", "hello, world"],
    ]);
  });

  it("handles escaped quotes", () => {
    const text = 'name,desc\n"He said ""hi""",ok';
    expect(parseCsv(text)).toEqual([
      ["name", "desc"],
      ['He said "hi"', "ok"],
    ]);
  });

  it("handles \\r\\n line endings", () => {
    const text = "a,b\r\n1,2\r\n";
    expect(parseCsv(text)).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("skips blank lines", () => {
    const text = "a,b\n\n1,2\n";
    expect(parseCsv(text)).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("extractProducts", () => {
  it("extracts products from a POS export CSV", () => {
    const rows = [
      ["Nombre de la sección", "Código de PLU", "Descripción", "Tipo de Venta"],
      ["VERDURAS", "3", "Lechuga Manteca", "Peso"],
      ["VERDURAS", "6", "Lechuga Crespa", "Peso"],
      ["FRUTAS", "84", "Banana Brasil", "Peso"],
      ["HUEVOS", "107", "Maple Huevo Color", "Unidad"],
    ];
    const { products, errors } = extractProducts(rows);
    expect(errors).toEqual([]);
    expect(products).toEqual([
      { officialName: "Lechuga Manteca", unit: "KG" },
      { officialName: "Lechuga Crespa", unit: "KG" },
      { officialName: "Banana Brasil", unit: "KG" },
      { officialName: "Maple Huevo Color", unit: "UNIT" },
    ]);
  });

  it("trims whitespace from names and units", () => {
    const rows = [
      ["Descripción", "Tipo de Venta"],
      ["  Verdeo  ", "Peso     "],
    ];
    const { products, errors } = extractProducts(rows);
    expect(errors).toEqual([]);
    expect(products).toEqual([{ officialName: "Verdeo", unit: "KG" }]);
  });

  it("reports an error for unknown sale types", () => {
    const rows = [
      ["Descripción", "Tipo de Venta"],
      ["Producto X", "Kilo"],
    ];
    const { products, errors } = extractProducts(rows);
    expect(products).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Producto X");
  });

  it("returns an error when the header is missing", () => {
    const rows = [["foo", "bar"]];
    const { products, errors } = extractProducts(rows);
    expect(products).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("skips blank rows", () => {
    const rows = [
      ["Descripción", "Tipo de Venta"],
      ["", ""],
      ["Banana", "Peso"],
    ];
    const { products } = extractProducts(rows);
    expect(products).toEqual([{ officialName: "Banana", unit: "KG" }]);
  });
});
