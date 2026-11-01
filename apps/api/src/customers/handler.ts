import { eq } from "drizzle-orm";
import type { WhatsAppChannel } from "../channels/whatsapp.js";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";
import { mapParsedItemsToProducts, parseCustomerOrder } from "../orders/parser.js";
import {
  cancelOrder,
  confirmOrder,
  createDraftOrder,
  findLatestOrder,
  formatOrderSummary,
  modifyOrder,
  validateOrder,
} from "../orders/service.js";
import type { SttProvider } from "../stt/interface.js";
import { processOnboardingStep, startOnboarding } from "./onboarding.js";

export interface CustomerDeps {
  readonly database: Database;
  readonly channel: WhatsAppChannel;
  readonly stt: SttProvider;
  readonly llmBaseUrl: string;
  readonly llmApiKey: string;
  readonly llmModel: string;
}

const CONFIRM_WORDS = new Set(["sí", "si", "s", "yes", "ok", "dale", "confirmo", "correcto"]);
const REJECT_WORDS = new Set(["no", "n", "cancelar", "cancela", "anular"]);

/**
 * Handles an inbound message from a customer.
 */
export async function handleCustomerMessage(
  deps: CustomerDeps,
  phoneE164: string,
  waMessageId: string,
  type: "text" | "audio" | "other",
  text: string | undefined,
  mediaId: string | undefined,
): Promise<void> {
  // Look up customer.
  const customerRows = await deps.database
    .select()
    .from(schema.customer)
    .where(eq(schema.customer.phoneE164, phoneE164))
    .limit(1);

  const customer = customerRows[0];

  // Find or create conversation.
  let convRows = await deps.database
    .select()
    .from(schema.conversation)
    .where(eq(schema.conversation.phoneE164, phoneE164))
    .limit(1);

  if (convRows.length === 0) {
    const rows = await deps.database
      .insert(schema.conversation)
      .values({ phoneE164, actorType: "CUSTOMER" })
      .returning();
    convRows = rows;
  }

  const conversation = convRows[0];
  if (!conversation) return;

  // Store inbound message.
  await deps.database.insert(schema.message).values({
    waMessageId,
    conversationId: conversation.id,
    direction: "INBOUND",
    type: type === "text" ? "TEXT" : type === "audio" ? "AUDIO" : "OTHER",
    bodyText: text ?? null,
  });

  // Get text content.
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

  // Handle onboarding for new customers.
  if (!customer?.consentAt) {
    const context = (conversation.contextJson ?? {}) as Record<string, unknown>;
    const step = (context.onboardingStep as string) ?? "privacy";

    if (step === "privacy" && !context.onboardingStep) {
      // First contact: send privacy notice.
      const { message, step: nextStep } = await startOnboarding(deps.database, phoneE164);
      await deps.database
        .update(schema.conversation)
        .set({ contextJson: { onboardingStep: nextStep } })
        .where(eq(schema.conversation.id, conversation.id));
      await deps.channel.sendText(phoneE164, message);
      return;
    }

    const onboardingContext = {
      step: step as "privacy" | "name" | "address" | "branch" | "done",
      name: context.onboardingName as string | undefined,
      address: context.onboardingAddress as string | undefined,
      usualFulfillment: context.onboardingFulfillment as "PICKUP" | "DELIVERY" | undefined,
    };

    const result = await processOnboardingStep(
      deps.database,
      phoneE164,
      onboardingContext,
      messageText,
    );

    const newContext: Record<string, unknown> = { onboardingStep: result.step };
    if (result.completed) {
      newContext.onboardingStep = "done";
    } else {
      // Track intermediate data.
      if (onboardingContext.step === "name") {
        newContext.onboardingName = messageText.trim();
      }
      if (onboardingContext.step === "address") {
        const lower = messageText.toLowerCase();
        if (lower.includes("domicilio") || lower.includes("envio") || lower.includes("envío")) {
          newContext.onboardingFulfillment = "DELIVERY";
        } else if (lower.includes("retiro") || lower.includes("retirar")) {
          newContext.onboardingFulfillment = "PICKUP";
        }
        if (messageText.trim().length > 5 && !onboardingContext.address) {
          newContext.onboardingAddress = messageText.trim();
        }
      }
    }

    await deps.database
      .update(schema.conversation)
      .set({ contextJson: newContext })
      .where(eq(schema.conversation.id, conversation.id));

    await deps.channel.sendText(phoneE164, result.message);
    return;
  }

  // Returning customer.
  const context = (conversation.contextJson ?? {}) as Record<string, unknown>;
  const pendingOrderId = context.pendingOrderId as string | undefined;
  const pendingConfirmation = context.pendingConfirmation as boolean | undefined;

  // Handle confirmation/rejection of a pending order.
  if (pendingConfirmation && pendingOrderId) {
    const normalized = messageText.trim().toLowerCase();
    if (CONFIRM_WORDS.has(normalized)) {
      // Confirm the order.
      const orderNumber = await confirmOrder(deps.database, pendingOrderId);

      // Clear pending state.
      await deps.database
        .update(schema.conversation)
        .set({ contextJson: {} })
        .where(eq(schema.conversation.id, conversation.id));

      // Get payment method for message.
      const orderRows = await deps.database
        .select()
        .from(schema.order)
        .where(eq(schema.order.id, pendingOrderId))
        .limit(1);
      const order = orderRows[0];
      let paymentMethodName = "";
      if (order?.paymentMethodId) {
        const pmRows = await deps.database
          .select()
          .from(schema.paymentMethod)
          .where(eq(schema.paymentMethod.id, order.paymentMethodId))
          .limit(1);
        paymentMethodName = pmRows[0]?.label ?? "";
      }

      const moment = order?.fulfillment === "PICKUP" ? "retirar" : "recibir";
      await deps.channel.sendText(
        phoneE164,
        `Listo, tu pedido #${orderNumber} quedó confirmado. Pagás con ${paymentMethodName} al ${moment}. Los precios son referenciales y pueden cambiar. El total final lo define el peso en la balanza.`,
      );

      // Enqueue print job (will be handled in I4).
      // For now, log it.
      console.log(`Order ${orderNumber} confirmed, print job queued.`);

      return;
    }

    if (REJECT_WORDS.has(normalized)) {
      // Cancel the draft.
      await cancelOrder(deps.database, pendingOrderId);
      await deps.database
        .update(schema.conversation)
        .set({ contextJson: {} })
        .where(eq(schema.conversation.id, conversation.id));
      await deps.channel.sendText(phoneE164, "OK, no se confirmó el pedido. ¿Necesitás algo más?");
      return;
    }
  }

  // Check for modification/cancellation of existing order.
  const lower = messageText.toLowerCase();
  if (lower.includes("modificar") || lower.includes("cambiar") || lower.includes("agregar")) {
    const latestOrderId = await findLatestOrder(deps.database, customer.id);
    if (latestOrderId) {
      await deps.channel.sendText(
        phoneE164,
        "¿Qué querés modificar en tu pedido? Escribime los cambios.",
      );
      await deps.database
        .update(schema.conversation)
        .set({ contextJson: { modifyingOrderId: latestOrderId } })
        .where(eq(schema.conversation.id, conversation.id));
      return;
    }
  }

  if (lower.includes("cancelar") || lower.includes("anular")) {
    const latestOrderId = await findLatestOrder(deps.database, customer.id);
    if (latestOrderId) {
      await cancelOrder(deps.database, latestOrderId);
      await deps.database
        .update(schema.conversation)
        .set({ contextJson: {} })
        .where(eq(schema.conversation.id, conversation.id));
      await deps.channel.sendText(phoneE164, "Cancelé tu pedido. ¿Necesitás algo más?");
      return;
    }
    await deps.channel.sendText(phoneE164, "No tenés pedidos pendientes para cancelar.");
    return;
  }

  // Handle modification of an existing order.
  const modifyingOrderId = context.modifyingOrderId as string | undefined;
  if (modifyingOrderId) {
    // Parse the modification as a new order.
    const parsed = await parseCustomerOrder(
      deps.llmBaseUrl,
      deps.llmApiKey,
      deps.llmModel,
      messageText,
      deps.database,
    );

    const mappedItems = await mapParsedItemsToProducts(deps.database, parsed.items);
    if (mappedItems.length === 0) {
      await deps.channel.sendText(
        phoneE164,
        "No entendí qué productos querés. ¿Me lo podés escribir de otra forma?",
      );
      return;
    }

    // Validate availability.
    const preferredBranchId = customer.preferredBranchId ?? (await getDefaultBranch(deps.database));
    const validation = await validateOrder(
      deps.database,
      preferredBranchId,
      mappedItems.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        unit: i.unit,
      })),
    );

    if (!validation.valid) {
      await deps.channel.sendText(phoneE164, validation.errors.join("\n"));
      // Notify staff.
      await void notifyStaffAboutIssue(
        deps.database,
        deps.channel,
        preferredBranchId,
        validation.unavailableItems as string[],
      );
      return;
    }

    const fulfillingBranchId = validation.derivedBranchId ?? preferredBranchId;

    // Apply modification.
    await modifyOrder(deps.database, modifyingOrderId, {
      items: mappedItems.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        unit: i.unit,
        requestedText: i.productName,
      })),
      fulfillment: parsed.fulfillment,
      pickupTime: parsed.pickupTime,
      deliveryAddress: parsed.deliveryAddress,
      notes: parsed.notes,
    });

    // Update fulfilling branch if derived.
    if (validation.derived) {
      await deps.database
        .update(schema.order)
        .set({ fulfillingBranchId, derived: true })
        .where(eq(schema.order.id, modifyingOrderId));
    }

    await deps.database
      .update(schema.conversation)
      .set({ contextJson: {} })
      .where(eq(schema.conversation.id, conversation.id));

    const summary = await formatOrderSummary(deps.database, modifyingOrderId);
    await deps.channel.sendText(
      phoneE164,
      `Actualicé tu pedido #${modifyingOrderId}. Te confirmo el resumen:\n${summary}\n¿Está todo bien?`,
    );

    // Set pending confirmation for the modification.
    await deps.database
      .update(schema.conversation)
      .set({ contextJson: { pendingOrderId: modifyingOrderId, pendingConfirmation: true } })
      .where(eq(schema.conversation.id, conversation.id));

    return;
  }

  // New order flow.
  const parsed = await parseCustomerOrder(
    deps.llmBaseUrl,
    deps.llmApiKey,
    deps.llmModel,
    messageText,
    deps.database,
  );

  const mappedItems = await mapParsedItemsToProducts(deps.database, parsed.items);
  if (mappedItems.length === 0) {
    await deps.channel.sendText(
      phoneE164,
      "No entendí qué productos querés. ¿Me lo podés escribir de otra forma?",
    );
    return;
  }

  // Determine preferred branch.
  const preferredBranchId = customer.preferredBranchId ?? (await getDefaultBranch(deps.database));

  // Validate availability.
  const validation = await validateOrder(
    deps.database,
    preferredBranchId,
    mappedItems.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      unit: i.unit,
    })),
  );

  if (!validation.valid) {
    await deps.channel.sendText(phoneE164, validation.errors.join("\n"));
    await void notifyStaffAboutIssue(
      deps.database,
      deps.channel,
      preferredBranchId,
      validation.unavailableItems as string[],
    );
    return;
  }

  const fulfillingBranchId = validation.derivedBranchId ?? preferredBranchId;
  const derived = validation.derived;

  // Determine fulfillment.
  let fulfillment: "PICKUP" | "DELIVERY" = customer.usualFulfillment as "PICKUP" | "DELIVERY";
  if (parsed.fulfillment) {
    fulfillment = parsed.fulfillment;
  }

  // Check delivery enabled for fulfilling branch.
  const branchRows = await deps.database
    .select()
    .from(schema.branch)
    .where(eq(schema.branch.id, fulfillingBranchId))
    .limit(1);
  const branch = branchRows[0];

  if (fulfillment === "DELIVERY" && branch && !branch.deliveryEnabled) {
    await deps.channel.sendText(
      phoneE164,
      "En esa sucursal por ahora solo hacemos retiro en el local.",
    );
    fulfillment = "PICKUP";
  }

  // Get active payment methods for the fulfilling branch.
  const paymentMethods = await deps.database
    .select()
    .from(schema.branchPaymentMethod)
    .innerJoin(
      schema.paymentMethod,
      eq(schema.paymentMethod.id, schema.branchPaymentMethod.paymentMethodId),
    )
    .where(eq(schema.branchPaymentMethod.branchId, fulfillingBranchId));

  const activeMethods = paymentMethods.filter(
    (pm) => pm.branch_payment_method.enabled && pm.payment_method.active !== false,
  );

  // Determine pickup time.
  let pickupTime: string | undefined = parsed.pickupTime;
  if (fulfillment === "PICKUP" && !pickupTime) {
    // Ask for pickup time.
    // For now, use a default. In production, ask the customer.
    pickupTime = undefined;
  }

  // Determine delivery address.
  let deliveryAddress: string | undefined = parsed.deliveryAddress;
  if (fulfillment === "DELIVERY" && !deliveryAddress) {
    deliveryAddress = customer.addressText ?? undefined;
  }

  // Get payment method ID (default to first active).
  const defaultPaymentMethodId = activeMethods[0]?.payment_method.id;

  // Create draft order.
  const orderId = await createDraftOrder(deps.database, {
    customerId: customer.id,
    preferredBranchId,
    items: mappedItems.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      unit: i.unit,
      requestedText: i.productName,
    })),
    fulfillment,
    pickupTime,
    deliveryAddress,
    paymentMethodId: defaultPaymentMethodId,
    notes: parsed.notes,
    source: "CUSTOMER",
    waMessageId,
  });

  // Update fulfilling branch and derived flag.
  if (fulfillingBranchId !== preferredBranchId || derived) {
    await deps.database
      .update(schema.order)
      .set({ fulfillingBranchId, derived })
      .where(eq(schema.order.id, orderId));
  }

  // Notify about derivation.
  if (derived) {
    const preferredBranchRows = await deps.database
      .select()
      .from(schema.branch)
      .where(eq(schema.branch.id, preferredBranchId))
      .limit(1);
    const fulfillingBranchRows = await deps.database
      .select()
      .from(schema.branch)
      .where(eq(schema.branch.id, fulfillingBranchId))
      .limit(1);

    const preferredName = preferredBranchRows[0]?.shortName ?? "";
    const fulfillingName = fulfillingBranchRows[0]?.shortName ?? "";

    await deps.channel.sendText(
      phoneE164,
      `En ${preferredName} no tenemos todos los productos. Tu pedido se prepara en ${fulfillingName}, donde sí los tenemos. Podés retirarlo allí o pedir envío desde esa sucursal.`,
    );
  }

  // Ask for payment method if multiple options.
  if (activeMethods.length > 1) {
    // const methodNames = activeMethods.map((pm) => pm.payment_method.label).join(", ");
    // For now, use the first method. In production, ask the customer.
    // Store the available methods in context for later.
  }

  // Ask for pickup time if not provided.
  if (fulfillment === "PICKUP" && !pickupTime) {
    await deps.channel.sendText(phoneE164, "¿A qué hora retirás?");
    // Store pending state.
    await deps.database
      .update(schema.conversation)
      .set({ contextJson: { pendingOrderId: orderId, awaitingPickupTime: true } })
      .where(eq(schema.conversation.id, conversation.id));
    return;
  }

  // Show summary and ask for confirmation.
  const summary = await formatOrderSummary(deps.database, orderId);
  const methodLabel = activeMethods[0]?.payment_method.label ?? "Efectivo";

  await deps.channel.sendText(
    phoneE164,
    `Confirmo tu pedido:\n${summary}\nPago: ${methodLabel}\n¿Está todo bien? Respondé sí para confirmar.`,
  );

  await deps.database
    .update(schema.conversation)
    .set({ contextJson: { pendingOrderId: orderId, pendingConfirmation: true } })
    .where(eq(schema.conversation.id, conversation.id));
}

async function getDefaultBranch(db: Database): Promise<string> {
  const branches = await db
    .select()
    .from(schema.branch)
    .where(eq(schema.branch.active, true))
    .limit(1);
  return branches[0]?.id ?? "";
}

async function notifyStaffAboutIssue(
  db: Database,
  channel: WhatsAppChannel,
  branchId: string,
  unavailableProductIds: string[],
): Promise<void> {
  if (unavailableProductIds.length === 0) return;

  const assignments = await db
    .select()
    .from(schema.staffBranch)
    .where(eq(schema.staffBranch.branchId, branchId));

  const staffIds = assignments.map((a) => a.staffId);
  const staffMembers = await db.select().from(schema.staff).where(eq(schema.staff.active, true));
  const branchStaff = staffMembers.filter((s) => staffIds.includes(s.id));

  const productNames = await getProductNames(db, unavailableProductIds);

  for (const member of branchStaff) {
    try {
      await channel.sendText(
        member.phoneE164,
        `Faltante en pedido: ${productNames.join(", ")}. Revisá la disponibilidad.`,
      );
    } catch {
      console.error(`Failed to notify staff ${member.phoneE164}`);
    }
  }
}

async function getProductNames(db: Database, productIds: string[]): Promise<string[]> {
  if (productIds.length === 0) return [];
  const products = await db.select().from(schema.product);
  return productIds
    .map((id) => products.find((p) => p.id === id)?.officialName ?? id)
    .filter(Boolean);
}
