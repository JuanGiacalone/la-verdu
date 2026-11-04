import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";

export interface OrderItemInput {
  readonly productId: string;
  readonly quantity: number;
  readonly unit: "KG" | "UNIT" | "BUNCH";
  readonly requestedText?: string;
}

export interface CreateOrderInput {
  readonly customerId: string;
  readonly preferredBranchId: string;
  readonly items: readonly OrderItemInput[];
  readonly fulfillment: "PICKUP" | "DELIVERY";
  readonly pickupTime?: string;
  readonly deliveryAddress?: string;
  readonly paymentMethodId?: string;
  readonly notes?: string;
  readonly source: "CUSTOMER" | "STAFF";
  readonly createdByStaffId?: string;
  readonly waMessageId?: string;
}

export interface OrderValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly unavailableItems: readonly string[];
  readonly derivedBranchId?: string;
  readonly derived: boolean;
}

/**
 * Validates an order against availability in the preferred branch.
 * If items are unavailable, checks other branches for full derivation.
 */
export async function validateOrder(
  db: Database,
  preferredBranchId: string,
  items: readonly OrderItemInput[],
): Promise<OrderValidationResult> {
  const unavailableItems: string[] = [];

  // Check availability in preferred branch.
  const today = new Date().toISOString().split("T")[0] ?? "";
  for (const item of items) {
    const avail = await db
      .select()
      .from(schema.branchProductDay)
      .where(
        and(
          eq(schema.branchProductDay.branchId, preferredBranchId),
          eq(schema.branchProductDay.productId, item.productId),
          eq(schema.branchProductDay.businessDate, today),
        ),
      )
      .limit(1);

    if (avail.length > 0 && avail[0]?.availability !== "AVAILABLE") {
      unavailableItems.push(item.productId);
    }
    // If no record exists, it's available by default (BR-04).
  }

  if (unavailableItems.length === 0) {
    return { valid: true, errors: [], unavailableItems: [], derived: false };
  }

  // Try to find a branch that has ALL items available.
  const branches = await db.select().from(schema.branch).where(eq(schema.branch.active, true));

  // Sort by priority.
  const sortedBranches = [...branches].sort((a, b) => a.priority - b.priority);

  for (const branch of sortedBranches) {
    if (branch.id === preferredBranchId) continue;

    let allAvailable = true;
    for (const item of items) {
      const avail = await db
        .select()
        .from(schema.branchProductDay)
        .where(
          and(
            eq(schema.branchProductDay.branchId, branch.id),
            eq(schema.branchProductDay.productId, item.productId),
            eq(schema.branchProductDay.businessDate, today),
          ),
        )
        .limit(1);

      if (avail.length > 0 && avail[0]?.availability !== "AVAILABLE") {
        allAvailable = false;
        break;
      }
    }

    if (allAvailable) {
      return {
        valid: true,
        errors: [],
        unavailableItems,
        derivedBranchId: branch.id,
        derived: true,
      };
    }
  }

  // No branch has all items.
  const unavailableNames = await getProductNames(db, unavailableItems);
  return {
    valid: false,
    errors: [`No hay disponibilidad de: ${unavailableNames.join(", ")}`],
    unavailableItems,
    derived: false,
  };
}

async function getProductNames(db: Database, productIds: string[]): Promise<string[]> {
  if (productIds.length === 0) return [];
  const products = await db.select().from(schema.product);
  return productIds
    .map((id) => products.find((p) => p.id === id)?.officialName ?? id)
    .filter(Boolean);
}

/**
 * Creates a draft order. Returns the order ID.
 */
export async function createDraftOrder(db: Database, input: CreateOrderInput): Promise<string> {
  const rows = await db
    .insert(schema.order)
    .values({
      customerId: input.customerId,
      preferredBranchId: input.preferredBranchId,
      fulfillingBranchId: input.preferredBranchId,
      fulfillment: input.fulfillment,
      pickupTime: input.pickupTime ?? null,
      deliveryAddressSnapshot: input.deliveryAddress ?? null,
      paymentMethodId: input.paymentMethodId ?? null,
      notes: input.notes ?? null,
      status: "DRAFT",
      source: input.source,
      createdByStaffId: input.createdByStaffId ?? null,
      waMessageId: input.waMessageId ?? null,
    })
    .returning({ id: schema.order.id });

  const orderId = rows[0]?.id;
  if (!orderId) {
    throw new Error("Failed to create order");
  }

  for (const item of input.items) {
    await db.insert(schema.orderItem).values({
      orderId,
      productId: item.productId,
      quantity: String(item.quantity),
      unit: item.unit,
      requestedText: item.requestedText ?? null,
    });
  }

  return orderId;
}

/**
 * Confirms a draft order. Sets status to CONFIRMED, version to 1.
 * Returns the order number.
 */
export async function confirmOrder(db: Database, orderId: string): Promise<number> {
  const orderRows = await db
    .select({ customerId: schema.order.customerId, orderNumber: schema.order.orderNumber })
    .from(schema.order)
    .where(eq(schema.order.id, orderId))
    .limit(1);
  const order = orderRows[0];
  if (!order) {
    throw new Error("Order not found");
  }

  await db
    .update(schema.order)
    .set({
      status: "CONFIRMED",
      version: 1,
      confirmedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.order.id, orderId));

  // Increment the customer's order counter (for "new customer" detection on print).
  if (order.customerId) {
    await db
      .update(schema.customer)
      .set({ orderCount: sql`${schema.customer.orderCount} + 1`, updatedAt: new Date() })
      .where(eq(schema.customer.id, order.customerId));
  }

  return Number(order.orderNumber);
}

/**
 * Modifies a confirmed order. Creates a new version and reprints.
 * Returns the new version number.
 */
export async function modifyOrder(
  db: Database,
  orderId: string,
  changes: {
    items?: readonly OrderItemInput[];
    fulfillment?: "PICKUP" | "DELIVERY";
    pickupTime?: string;
    deliveryAddress?: string;
    paymentMethodId?: string;
    notes?: string;
  },
): Promise<number> {
  // Get current order.
  const orderRows = await db
    .select()
    .from(schema.order)
    .where(eq(schema.order.id, orderId))
    .limit(1);
  const order = orderRows[0];
  if (order?.status !== "CONFIRMED") {
    throw new Error("Order not found or not confirmed");
  }

  const newVersion = order.version + 1;

  // Update order fields.
  await db
    .update(schema.order)
    .set({
      ...(changes.fulfillment !== undefined && { fulfillment: changes.fulfillment }),
      ...(changes.pickupTime !== undefined && { pickupTime: changes.pickupTime }),
      ...(changes.deliveryAddress !== undefined && {
        deliveryAddressSnapshot: changes.deliveryAddress,
      }),
      ...(changes.paymentMethodId !== undefined && { paymentMethodId: changes.paymentMethodId }),
      ...(changes.notes !== undefined && { notes: changes.notes }),
      version: newVersion,
      updatedAt: new Date(),
    })
    .where(eq(schema.order.id, orderId));

  // Replace items if provided.
  if (changes.items) {
    await db.delete(schema.orderItem).where(eq(schema.orderItem.orderId, orderId));
    for (const item of changes.items) {
      await db.insert(schema.orderItem).values({
        orderId,
        productId: item.productId,
        quantity: String(item.quantity),
        unit: item.unit,
        requestedText: item.requestedText ?? null,
      });
    }
  }

  return newVersion;
}

/**
 * Cancels a confirmed order.
 */
export async function cancelOrder(db: Database, orderId: string): Promise<void> {
  const rows = await db
    .update(schema.order)
    .set({
      status: "CANCELLED",
      cancelledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.order.id, orderId))
    .returning({ id: schema.order.id });

  if (rows.length === 0) {
    throw new Error("Order not found");
  }
}

/**
 * Finds the most recent confirmed order for a customer.
 */
export async function findLatestOrder(db: Database, customerId: string): Promise<string | null> {
  const rows = await db
    .select({ id: schema.order.id })
    .from(schema.order)
    .where(and(eq(schema.order.customerId, customerId), eq(schema.order.status, "CONFIRMED")))
    .orderBy(schema.order.confirmedAt)
    .limit(1);

  return rows[0]?.id ?? null;
}

/**
 * Formats an order summary for confirmation (M-07, M-09).
 */
export async function formatOrderSummary(db: Database, orderId: string): Promise<string> {
  const orderRows = await db
    .select()
    .from(schema.order)
    .where(eq(schema.order.id, orderId))
    .limit(1);
  const order = orderRows[0];
  if (!order) return "Pedido no encontrado.";

  const items = await db
    .select()
    .from(schema.orderItem)
    .where(eq(schema.orderItem.orderId, orderId));
  const products = await db.select().from(schema.product);

  const itemLines = items.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    const name = product?.officialName ?? item.productId;
    const qty = Number(item.quantity);
    const qtyStr = qty === 0.5 ? "1/2" : qty === 0.25 ? "1/4" : qty === 0.75 ? "3/4" : String(qty);
    return `${qtyStr} ${item.unit.toLowerCase()} ${name}`;
  });

  const fulfillment =
    order.fulfillment === "PICKUP"
      ? `Retiro ${order.pickupTime ?? ""}`
      : `Domicilio: ${order.deliveryAddressSnapshot ?? ""}`;

  const lines = [...itemLines, fulfillment];
  if (order.notes) {
    lines.push(`Notas: ${order.notes}`);
  }

  return lines.join("\n");
}
