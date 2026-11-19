import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { PrintJobData } from "@la-verdu/print-render";

export async function isBranchClosed(db: Database, branchId: string): Promise<boolean> {
  const rows = await db.select().from(schema.branch).where(eq(schema.branch.id, branchId)).limit(1);
  const branch = rows[0];
  if (!branch) return false;
  const tz = process.env.TZ_APP ?? "America/Argentina/Buenos_Aires";
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  const current = `${hh}:${mm}`;
  const opens = branch.opensAt;
  const closes = branch.closesAt;
  // Outside [opens, closes)
  if (current < opens || current >= closes) return true;
  return false;
}

export async function buildPrintJobData(
  db: Database,
  orderId: string,
  kind: "NEW" | "MODIFICATION" | "CANCELLATION",
  version: number,
): Promise<PrintJobData> {
  const orderRows = await db.select().from(schema.order).where(eq(schema.order.id, orderId)).limit(1);
  const order = orderRows[0]!;
  const branchRows = await db.select().from(schema.branch).where(eq(schema.branch.id, order.fulfillingBranchId as string)).limit(1);
  const branch = branchRows[0]!;
  const customerRows = await db.select().from(schema.customer).where(eq(schema.customer.id, order.customerId as string)).limit(1);
  const customer = customerRows[0];
  const itemsRows = await db.select().from(schema.orderItem).where(eq(schema.orderItem.orderId, orderId));
  const products = await db.select().from(schema.product);
  const items = itemsRows.map((it) => ({
    quantity: Number(it.quantity),
    unit: it.unit as "KG" | "UNIT" | "BUNCH",
    productName: products.find((p) => p.id === it.productId)?.officialName ?? it.productId,
  }));
  let paymentMethodName = "";
  if (order.paymentMethodId) {
    const pmRows = await db.select().from(schema.paymentMethod).where(eq(schema.paymentMethod.id, order.paymentMethodId)).limit(1);
    paymentMethodName = pmRows[0]?.label ?? "";
  }
  // preferred branch when derived
  let preferredBranchShortName: string | undefined;
  const derived = order.fulfillingBranchId !== order.preferredBranchId;
  if (derived) {
    const prefRows = await db.select().from(schema.branch).where(eq(schema.branch.id, order.preferredBranchId as string)).limit(1);
    preferredBranchShortName = prefRows[0]?.shortName;
  }
  return {
    branchShortName: branch.shortName,
    orderNumber: Number(order.orderNumber),
    version,
    kind,
    confirmedAt: order.confirmedAt ?? new Date(),
    customerName: customer?.name ?? "",
    customerOrderCount: customer?.orderCount,
    fulfillment: order.fulfillment as "PICKUP" | "DELIVERY",
    pickupTime: order.pickupTime ?? undefined,
    deliveryAddress: order.deliveryAddressSnapshot ?? undefined,
    paymentMethodName,
    paymentStatus: "TO_COLLECT",
    derived,
    preferredBranchShortName,
    items,
    notes: order.notes ?? undefined,
  };
}