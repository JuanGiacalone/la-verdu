import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";

export interface AvailabilityChange {
  readonly productId: string;
  readonly type: "availability" | "price";
  readonly availability?: "AVAILABLE" | "UNAVAILABLE";
  readonly priceAmount?: number;
  readonly priceUnit?: "KG" | "UNIT" | "BUNCH";
}

export interface ChangeSetPayload {
  readonly branchId: string;
  readonly changes: readonly AvailabilityChange[];
}

/**
 * Creates a change set in PENDING_CONFIRMATION state.
 * Returns the change set ID.
 */
export async function proposeChanges(
  db: Database,
  actorStaffId: string,
  branchId: string,
  changes: readonly AvailabilityChange[],
): Promise<string> {
  const rows = await db
    .insert(schema.changeSet)
    .values({
      actorStaffId,
      branchId,
      payloadJson: { branchId, changes },
      status: "PENDING_CONFIRMATION",
    })
    .returning({ id: schema.changeSet.id });

  const id = rows[0]?.id;
  if (!id) {
    throw new Error("Failed to create change set");
  }
  return id;
}

/**
 * Applies a confirmed change set: updates availability and prices,
 * creates audit entries, and returns the list of affected product IDs.
 */
export async function applyChanges(
  db: Database,
  changeSetId: string,
): Promise<{ affectedProductIds: string[] }> {
  const rows = await db
    .select()
    .from(schema.changeSet)
    .where(eq(schema.changeSet.id, changeSetId))
    .limit(1);

  const changeSet = rows[0];
  if (changeSet?.status !== "PENDING_CONFIRMATION") {
    throw new Error("Change set not found or not pending confirmation");
  }

  const payload = changeSet.payloadJson as ChangeSetPayload;
  const affectedProductIds: string[] = [];

  for (const change of payload.changes) {
    if (change.type === "availability" && change.availability) {
      const today = new Date().toISOString().split("T")[0] ?? "";
      await db
        .insert(schema.branchProductDay)
        .values({
          branchId: payload.branchId,
          productId: change.productId,
          businessDate: today,
          availability: change.availability,
        })
        .onConflictDoUpdate({
          target: [
            schema.branchProductDay.branchId,
            schema.branchProductDay.productId,
            schema.branchProductDay.businessDate,
          ],
          set: { availability: change.availability, updatedAt: new Date() },
        });
      affectedProductIds.push(change.productId);
    }

    if (change.type === "price" && change.priceAmount !== undefined) {
      await db
        .insert(schema.branchProduct)
        .values({
          branchId: payload.branchId,
          productId: change.productId,
          priceAmount: String(change.priceAmount),
          priceUnit: change.priceUnit ?? "KG",
        })
        .onConflictDoUpdate({
          target: [schema.branchProduct.branchId, schema.branchProduct.productId],
          set: {
            priceAmount: String(change.priceAmount),
            priceUnit: change.priceUnit ?? "KG",
            updatedAt: new Date(),
          },
        });
      affectedProductIds.push(change.productId);
    }
  }

  // Mark change set as applied.
  await db
    .update(schema.changeSet)
    .set({ status: "APPLIED", resolvedAt: new Date() })
    .where(eq(schema.changeSet.id, changeSetId));

  // Audit entry.
  await db.insert(schema.auditLog).values({
    actor: `staff:${changeSet.actorStaffId}`,
    action: "APPLY_CHANGE_SET",
    entity: "change_set",
    entityId: changeSetId,
    afterJson: payload as unknown as Record<string, unknown>,
  });

  return { affectedProductIds };
}

/**
 * Rejects a pending change set.
 */
export async function rejectChanges(db: Database, changeSetId: string): Promise<void> {
  await db
    .update(schema.changeSet)
    .set({ status: "REJECTED", resolvedAt: new Date() })
    .where(eq(schema.changeSet.id, changeSetId));
}

/**
 * Finds orders that contain a product that became unavailable.
 * Returns order IDs for notification.
 */
export async function findAffectedOrders(
  db: Database,
  branchId: string,
  productIds: string[],
): Promise<string[]> {
  if (productIds.length === 0) return [];

  const orders = await db
    .select({ orderId: schema.orderItem.orderId })
    .from(schema.orderItem)
    .innerJoin(schema.order, eq(schema.order.id, schema.orderItem.orderId))
    .where(
      and(eq(schema.order.fulfillingBranchId, branchId), eq(schema.order.status, "CONFIRMED")),
    );

  // Filter to orders that contain at least one of the affected products.
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
 * Transitions UNAVAILABLE → PENDING_CHECK for all branch_product_day records
 * of the previous day, at the start of a new day. Called by the scheduler.
 */
export async function transitionAvailabilityForNewDay(
  db: Database,
  branchId: string,
  newDate: string,
): Promise<number> {
  // Find products that were UNAVAILABLE yesterday.
  const yesterday = new Date(newDate);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0] ?? "";

  const unavailable = await db
    .select({ productId: schema.branchProductDay.productId })
    .from(schema.branchProductDay)
    .where(
      and(
        eq(schema.branchProductDay.branchId, branchId),
        eq(schema.branchProductDay.businessDate, yesterdayStr),
        eq(schema.branchProductDay.availability, "UNAVAILABLE"),
      ),
    );

  let count = 0;
  for (const row of unavailable) {
    await db
      .insert(schema.branchProductDay)
      .values({
        branchId,
        productId: row.productId,
        businessDate: newDate,
        availability: "PENDING_CHECK",
      })
      .onConflictDoNothing();
    count += 1;
  }

  return count;
}
