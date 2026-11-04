import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";

export interface ParsedOrderItem {
  readonly productName: string;
  readonly quantity: number;
  readonly unit: "KG" | "UNIT" | "BUNCH";
  readonly notes?: string;
}

export interface ParsedOrder {
  readonly items: readonly ParsedOrderItem[];
  readonly fulfillment?: "PICKUP" | "DELIVERY";
  readonly pickupTime?: string;
  readonly deliveryAddress?: string;
  readonly notes?: string;
}

/**
 * Uses the LLM to parse a customer's order message into structured items.
 */
export async function parseCustomerOrder(
  baseUrl: string,
  apiKey: string,
  model: string,
  message: string,
  db: Database,
): Promise<ParsedOrder> {
  const products = await db.select().from(schema.product).where(eq(schema.product.active, true));
  const productList = products.map((p) => `${p.officialName} (${p.unit})`).join(", ");

  const systemPrompt = `Sos un asistente para una frutería. El cliente te envía un pedido. Tu tarea es interpretar el mensaje y devolver un JSON con los productos, cantidades y modalidad.

Productos disponibles en el catálogo: ${productList}

Formato de respuesta (JSON):
{
  "items": [
    { "productName": "nombre del producto", "quantity": 2, "unit": "KG" | "UNIT" | "BUNCH" }
  ],
  "fulfillment": "PICKUP" | "DELIVERY" | null,
  "pickupTime": "HH:MM" | null,
  "deliveryAddress": "dirección" | null,
  "notes": "notas adicionales" | null
}

Reglas:
- "un kilo", "1 kg", "un kilo y medio" → quantity en kg (1, 1.5).
- "medio kilo" → 0.5.
- "una unidad", "2 unidades", "un atado" → quantity en unidades.
- "una docena" → 12 unidades.
- Si no se especifica cantidad, asumí 1.
- Si el cliente dice "retiro" o "paso a buscar" → fulfillment PICKUP.
- Si dice "envío", "domicilio", "traeme" → fulfillment DELIVERY.
- Si no se especifica modalidad, dejá null.
- Si no podés interpretar un producto, omitilo.
- Respondé SOLO con el JSON, sin texto adicional.`;

  console.log("[parser] LLM request", { baseUrl, model, message });
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      temperature: 0,
    }),
  });

  console.log("[parser] LLM response status", response.status, response.statusText);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.log("[parser] LLM error body", body.slice(0, 500));
    throw new Error(`LLM failed: ${response.status} ${body.slice(0, 300)}`.trim());
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const content = data.choices[0]?.message?.content ?? "{}";

  let parsed: {
    items?: Array<{ productName: string; quantity: number; unit: string }>;
    fulfillment?: string | null;
    pickupTime?: string | null;
    deliveryAddress?: string | null;
    notes?: string | null;
  };

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
  } catch {
    throw new Error("Could not parse LLM response as JSON");
  }

  const items: ParsedOrderItem[] = [];
  for (const item of parsed.items ?? []) {
    const product = products.find(
      (p) => p.officialName.toLowerCase() === item.productName.toLowerCase(),
    );
    const resolved =
      product ??
      products.find((p) => p.officialName.toLowerCase().includes(item.productName.toLowerCase()));
    if (!resolved) continue;

    const unit = ["KG", "UNIT", "BUNCH"].includes(item.unit)
      ? (item.unit as "KG" | "UNIT" | "BUNCH")
      : (resolved.unit as "KG" | "UNIT" | "BUNCH");

    items.push({
      productName: resolved.officialName,
      quantity: item.quantity || 1,
      unit,
    });
  }

  return {
    items: items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      unit: item.unit,
    })),
    fulfillment:
      parsed.fulfillment === "PICKUP"
        ? "PICKUP"
        : parsed.fulfillment === "DELIVERY"
          ? "DELIVERY"
          : undefined,
    pickupTime: parsed.pickupTime ?? undefined,
    deliveryAddress: parsed.deliveryAddress ?? undefined,
    notes: parsed.notes ?? undefined,
  };
}

/**
 * Maps parsed order items to product IDs.
 */
export async function mapParsedItemsToProducts(
  db: Database,
  parsedItems: readonly ParsedOrderItem[],
): Promise<
  Array<{ productId: string; quantity: number; unit: "KG" | "UNIT" | "BUNCH"; productName: string }>
> {
  const products = await db.select().from(schema.product).where(eq(schema.product.active, true));
  const result: Array<{
    productId: string;
    quantity: number;
    unit: "KG" | "UNIT" | "BUNCH";
    productName: string;
  }> = [];

  for (const item of parsedItems) {
    const product = products.find(
      (p) => p.officialName.toLowerCase() === item.productName.toLowerCase(),
    );
    if (product) {
      result.push({
        productId: product.id,
        quantity: item.quantity,
        unit: item.unit,
        productName: product.officialName,
      });
    }
  }

  return result;
}
