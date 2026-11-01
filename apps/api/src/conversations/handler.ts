import { eq } from "drizzle-orm";
import {
  type AvailabilityChange,
  applyChanges,
  proposeChanges,
  rejectChanges,
} from "../availability/service.js";
import type { WhatsAppChannel } from "../channels/whatsapp.js";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";
import type { SttProvider } from "../stt/interface.js";

export interface StaffMessageContext {
  readonly phoneE164: string;
  readonly staffId: string;
  readonly staffName: string;
  readonly branchId: string;
  readonly branchShortName: string;
}

export interface ConversationDeps {
  readonly database: Database;
  readonly channel: WhatsAppChannel;
  readonly stt: SttProvider;
  readonly llmBaseUrl: string;
  readonly llmApiKey: string;
  readonly llmModel: string;
}

const CONFIRM_WORDS = new Set(["sí", "si", "s", "yes", "ok", "dale", "confirmo"]);
const REJECT_WORDS = new Set(["no", "n", "cancelar", "cancela"]);

/**
 * Handles an inbound message from a staff member.
 */
export async function handleStaffMessage(
  deps: ConversationDeps,
  phoneE164: string,
  _waMessageId: string,
  type: "text" | "audio" | "other",
  text: string | undefined,
  mediaId: string | undefined,
): Promise<void> {
  // Look up staff.
  const staffRows = await deps.database
    .select()
    .from(schema.staff)
    .where(eq(schema.staff.phoneE164, phoneE164))
    .limit(1);

  const staff = staffRows[0];
  if (!staff?.active) {
    // Not a known staff member; skip (will be handled as customer in I3).
    return;
  }

  // Get branch assignment (first branch).
  const assignments = await deps.database
    .select()
    .from(schema.staffBranch)
    .where(eq(schema.staffBranch.staffId, staff.id))
    .limit(1);

  const branchId = assignments[0]?.branchId;
  if (!branchId) {
    await deps.channel.sendText(phoneE164, "No tenés una sucursal asignada. Contactá al dueño.");
    return;
  }

  const branchRows = await deps.database
    .select()
    .from(schema.branch)
    .where(eq(schema.branch.id, branchId))
    .limit(1);
  const branch = branchRows[0];
  if (!branch) {
    await deps.channel.sendText(phoneE164, "Sucursal no encontrada.");
    return;
  }

  // Find or create conversation.
  let convRows = await deps.database
    .select()
    .from(schema.conversation)
    .where(eq(schema.conversation.phoneE164, phoneE164))
    .limit(1);

  if (convRows.length === 0) {
    const rows = await deps.database
      .insert(schema.conversation)
      .values({ phoneE164, actorType: "STAFF" })
      .returning();
    convRows = rows;
  }

  const conversation = convRows[0];
  if (!conversation) return;

  // Get text content (transcribe if audio).
  let messageText = text ?? "";
  if (type === "audio" && mediaId) {
    try {
      const audioBuffer = await deps.channel.downloadMedia(mediaId);
      const result = await deps.stt.transcribe(audioBuffer, "audio/ogg");
      messageText = result.text;
    } catch {
      await deps.channel.sendText(phoneE164, "No pude entender el audio. ¿Me lo podés escribir?");
      return;
    }
  }

  if (!messageText.trim()) {
    await deps.channel.sendText(phoneE164, "No entendí el mensaje. ¿Me lo podés escribir?");
    return;
  }

  // Check for pending change set.
  const context = (conversation.contextJson ?? {}) as Record<string, unknown>;
  const pendingChangeSetId = context.pendingChangeSetId as string | undefined;

  if (pendingChangeSetId) {
    const normalized = messageText.trim().toLowerCase();
    if (CONFIRM_WORDS.has(normalized)) {
      // Apply changes.
      try {
        const { affectedProductIds } = await applyChanges(deps.database, pendingChangeSetId);
        // Clear pending change set.
        await deps.database
          .update(schema.conversation)
          .set({ contextJson: {} })
          .where(eq(schema.conversation.id, conversation.id));

        await deps.channel.sendText(phoneE164, "Listo, cambios aplicados.");

        // Notify about affected orders.
        if (affectedProductIds.length > 0) {
          const affectedOrders = await findAffectedOrdersForNotify(
            deps.database,
            branchId,
            affectedProductIds,
          );
          if (affectedOrders.length > 0) {
            await deps.channel.sendText(
              phoneE164,
              `Hay ${affectedOrders.length} pedido(s) con productos que dejaron de estar disponibles. Revisá el panel.`,
            );
          }
        }
      } catch {
        await deps.channel.sendText(
          phoneE164,
          "Hubo un error al aplicar los cambios. Intentá de nuevo.",
        );
      }
      return;
    }

    if (REJECT_WORDS.has(normalized)) {
      await rejectChanges(deps.database, pendingChangeSetId);
      await deps.database
        .update(schema.conversation)
        .set({ contextJson: {} })
        .where(eq(schema.conversation.id, conversation.id));
      await deps.channel.sendText(phoneE164, "OK, no se aplicó ningún cambio.");
      return;
    }

    // Not a confirmation; treat as a new message. Clear the pending change set.
    await deps.database
      .update(schema.conversation)
      .set({ contextJson: {} })
      .where(eq(schema.conversation.id, conversation.id));
  }

  // Parse the message into changes using the LLM.
  try {
    const changes = await parseStaffMessage(
      deps.llmBaseUrl,
      deps.llmApiKey,
      deps.llmModel,
      messageText,
      branchId,
      deps.database,
    );

    if (changes.length === 0) {
      await deps.channel.sendText(
        phoneE164,
        'No entendí qué cambios querés hacer. Probá con algo como: "Hoy no hay banana. El tomate perita está a 2.400 el kilo."',
      );
      return;
    }

    const changeSetId = await proposeChanges(deps.database, staff.id, branchId, changes);

    // Build echo message.
    const echoLines = changes.map((c) => {
      if (c.type === "availability") {
        return `${c.productId}: ${c.availability === "UNAVAILABLE" ? "no disponible" : "disponible"}`;
      }
      if (c.type === "price") {
        return `${c.productId}: $${c.priceAmount}/${c.priceUnit}`;
      }
      return `${c.productId}: cambio`;
    });

    // For simplicity, use product IDs in echo. In production, resolve names.
    const echoMessage = `Entendí: ${echoLines.join(", ")}. ¿Lo aplico? Respondé sí o no.`;

    await deps.channel.sendText(phoneE164, echoMessage);

    // Store pending change set in conversation context.
    await deps.database
      .update(schema.conversation)
      .set({ contextJson: { pendingChangeSetId: changeSetId } })
      .where(eq(schema.conversation.id, conversation.id));
  } catch (error) {
    console.error("Error parsing staff message:", error);
    await deps.channel.sendText(
      phoneE164,
      "Tuve un problema procesando tu mensaje. ¿Me lo podés escribir de otra forma?",
    );
  }
}

async function findAffectedOrdersForNotify(
  db: Database,
  branchId: string,
  productIds: string[],
): Promise<string[]> {
  if (productIds.length === 0) return [];

  const orders = await db
    .select({ orderId: schema.orderItem.orderId })
    .from(schema.orderItem)
    .innerJoin(schema.order, eq(schema.order.id, schema.orderItem.orderId))
    .where(eq(schema.order.fulfillingBranchId, branchId));

  const affectedOrderIds = new Set<string>();
  for (const order of orders) {
    const items = await db
      .select({ productId: schema.orderItem.productId })
      .from(schema.orderItem)
      .where(eq(schema.orderItem.orderId, order.orderId));
    if (items.some((item) => productIds.includes(item.productId))) {
      affectedOrderIds.add(order.orderId);
    }
  }

  return [...affectedOrderIds];
}

/**
 * Uses the LLM to parse a staff message into structured changes.
 * The LLM searches for products and proposes changes.
 */
async function parseStaffMessage(
  baseUrl: string,
  apiKey: string,
  model: string,
  message: string,
  _branchId: string,
  db: Database,
): Promise<AvailabilityChange[]> {
  // Get all products for context.
  const products = await db.select().from(schema.product).where(eq(schema.product.active, true));
  const productList = products.map((p) => `${p.officialName} (${p.unit})`).join(", ");

  const systemPrompt = `Sos un asistente para una frutería. El personal te envía mensajes sobre cambios de disponibilidad y precios. Tu tarea es interpretar el mensaje y devolver un JSON con los cambios.

Productos disponibles en el catálogo: ${productList}

Formato de respuesta (JSON array):
[
  { "productName": "nombre del producto", "type": "availability", "status": "UNAVAILABLE" | "AVAILABLE" },
  { "productName": "nombre del producto", "type": "price", "amount": 2400, "unit": "KG" | "UNIT" }
]

Reglas:
- "no hay", "se acabó", "falta" → availability UNAVAILABLE
- "volvió", "llegó", "hay de nuevo" → availability AVAILABLE
- "está a X", "precio X" → price con amount X (número, sin formato)
- Si no podés interpretar algún producto, omitilo.
- Respondé SOLO con el JSON array, sin texto adicional.`;

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

  if (!response.ok) {
    throw new Error(`LLM failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const content = data.choices[0]?.message?.content ?? "[]";

  // Parse the JSON response.
  let parsed: Array<{
    productName: string;
    type: string;
    status?: string;
    amount?: number;
    unit?: string;
  }>;

  try {
    // Extract JSON from the response (handle markdown code blocks).
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
  } catch {
    throw new Error("Could not parse LLM response as JSON");
  }

  // Map product names to IDs.
  const changes: AvailabilityChange[] = [];
  for (const item of parsed) {
    const product = products.find(
      (p) => p.officialName.toLowerCase() === item.productName.toLowerCase(),
    );
    if (!product) {
      // Try fuzzy match.
      const fuzzy = products.find((p) =>
        p.officialName.toLowerCase().includes(item.productName.toLowerCase()),
      );
      if (!fuzzy) continue;
      item.productName = fuzzy.officialName;
    }

    const resolvedProduct = products.find(
      (p) => p.officialName.toLowerCase() === item.productName.toLowerCase(),
    );
    if (!resolvedProduct) continue;

    if (item.type === "availability") {
      changes.push({
        productId: resolvedProduct.id,
        type: "availability",
        availability: item.status === "UNAVAILABLE" ? "UNAVAILABLE" : "AVAILABLE",
      });
    } else if (item.type === "price" && item.amount !== undefined) {
      changes.push({
        productId: resolvedProduct.id,
        type: "price",
        priceAmount: item.amount,
        priceUnit:
          (item.unit as "KG" | "UNIT" | "BUNCH") ??
          (resolvedProduct.unit as "KG" | "UNIT" | "BUNCH"),
      });
    }
  }

  return changes;
}
