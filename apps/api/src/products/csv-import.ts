import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";

export interface CsvImportResult {
  readonly imported: number;
  readonly skipped: number;
  readonly errors: readonly string[];
  readonly total: number;
}

export interface ParsedProduct {
  readonly officialName: string;
  readonly unit: "KG" | "UNIT" | "BUNCH";
  readonly referencePrice: number | null;
}

/**
 * Parses a CSV string and returns an array of rows, each row being an array
 * of field values. Handles quoted fields, escaped quotes ("") and both \n
 * and \r\n line endings. Blank lines are skipped.
 */
export function parseCsv(text: string): string[][] {
  // Strip a leading BOM (UTF-8/UTF-16) so header detection works on POS exports.
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;
  let atFieldStart = true;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
      atFieldStart = false;
    } else if (char === ",") {
      current.push(field);
      field = "";
      atFieldStart = true;
    } else if (char === "\n") {
      current.push(field);
      if (current.some((value) => value.trim() !== "")) {
        rows.push(current);
      }
      current = [];
      field = "";
      atFieldStart = true;
    } else if (char === "\r") {
      // Skip \r; \n handles the line break.
    } else {
      field += char;
      atFieldStart = false;
    }
  }

  // Flush the last field and row.
  if (field !== "" || !atFieldStart || current.length > 0) {
    current.push(field);
  }
  if (current.length > 0 && current.some((value) => value.trim() !== "")) {
    rows.push(current);
  }

  return rows;
}

const UNIT_MAP: Record<string, "KG" | "UNIT" | "BUNCH"> = {
  peso: "KG",
  unidad: "UNIT",
  atado: "BUNCH",
};

/**
 * Extracts products from parsed CSV rows. Expects a header row containing
 * "Descripción" (or "Descripcion") and "Tipo de Venta" columns. Returns the
 * parsed products and any row-level errors.
 */
export function extractProducts(rows: string[][]): {
  products: ParsedProduct[];
  errors: string[];
} {
  const products: ParsedProduct[] = [];
  const errors: string[] = [];

  if (rows.length === 0) {
    return { products, errors: ["El archivo CSV está vacío."] };
  }

  const headerRow = rows[0];
  if (!headerRow) {
    return { products, errors: ["El archivo CSV está vacío."] };
  }
  const normalize = (value: string) =>
    value
      .replace(/^\ufeff/, "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  const header = headerRow.map(normalize);
  const nameIndex = header.findIndex(
    (h) => h === "descripcion" || h.includes("descripcion") || h.includes("description"),
  );
  const unitIndex = header.findIndex(
    (h) => h === "tipo de venta" || (h.includes("tipo") && h.includes("venta")),
  );
  const priceIndex = header.findIndex(
    (h) =>
      h === "precio lista 1" ||
      h.includes("precio lista 1") ||
      h.includes("precio lista") ||
      h.includes("precio"),
  );

  if (nameIndex === -1) {
    return {
      products,
      errors: ['No se encontró la columna "Descripción" en el encabezado.'],
    };
  }
  if (unitIndex === -1) {
    return {
      products,
      errors: ['No se encontró la columna "Tipo de Venta" en el encabezado.'],
    };
  }

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) {
      continue;
    }
    const name = (row[nameIndex] ?? "").trim();
    const unitRaw = (row[unitIndex] ?? "").trim().toLowerCase();

    if (name === "") {
      // Skip blank rows silently.
      continue;
    }

    const unit = UNIT_MAP[unitRaw];
    if (!unit) {
      errors.push(`Fila ${i + 1}: "${name}" tiene tipo de venta desconocido "${unitRaw}".`);
      continue;
    }

    let referencePrice: number | null = null;
    if (priceIndex !== -1) {
      const rawPrice = (row[priceIndex] ?? "").trim();
      if (rawPrice !== "") {
        const parsed = Number(rawPrice.replace(",", "."));
        if (Number.isFinite(parsed) && parsed >= 0) {
          referencePrice = parsed;
        }
      }
    }

    products.push({ officialName: name, unit, referencePrice });
  }

  return { products, errors };
}

/**
 * Imports products from a CSV string into the database. Products whose
 * official name already exists are skipped and reported. Returns a summary.
 */
export async function importProductsFromCsv(
  db: Database,
  csvText: string,
): Promise<CsvImportResult> {
  const rows = parseCsv(csvText);
  const { products, errors } = extractProducts(rows);

  let imported = 0;
  let skipped = 0;
  const allErrors = [...errors];

  for (const product of products) {
    const existing = await db
      .select({ id: schema.product.id })
      .from(schema.product)
      .where(eq(schema.product.officialName, product.officialName))
      .limit(1);

    if (existing.length > 0) {
      skipped += 1;
      continue;
    }

    await db.insert(schema.product).values({
      officialName: product.officialName,
      unit: product.unit,
      referencePrice: product.referencePrice !== null ? String(product.referencePrice) : null,
    });
    imported += 1;
  }

  return {
    imported,
    skipped,
    errors: allErrors,
    total: products.length + errors.length,
  };
}
