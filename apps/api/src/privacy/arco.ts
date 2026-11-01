import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";

export interface CustomerExport {
  readonly customer: {
    readonly id: string;
    readonly phone: string; // masked
    readonly name: string | null;
    readonly address: string | null;
    readonly usualFulfillment: string;
    readonly preferredBranch: string | null;
    readonly consentAt: string | null;
    readonly createdAt: string;
  };
  readonly orders: readonly {
    readonly orderNumber: number;
    readonly status: string;
    readonly fulfillment: string;
    readonly notes: string | null;
    readonly createdAt: string;
    readonly items: readonly {
      readonly productName: string;
      readonly quantity: string;
      readonly unit: string;
    }[];
  }[];
  readonly messages: readonly {
    readonly direction: string;
    readonly type: string;
    readonly body: string | null;
    readonly createdAt: string;
  }[];
}

/**
 * Exports all data for a customer (ARCO: Access).
 * Phone numbers are masked in the export.
 */
export async function exportCustomerData(
  db: Database,
  customerId: string,
): Promise<CustomerExport | null> {
  const customerRows = await db
    .select()
    .from(schema.customer)
    .where(eq(schema.customer.id, customerId))
    .limit(1);

  const customer = customerRows[0];
  if (!customer) return null;

  const branch = customer.preferredBranchId
    ? await db
        .select()
        .from(schema.branch)
        .where(eq(schema.branch.id, customer.preferredBranchId))
        .limit(1)
    : [];

  const orders = await db
    .select()
    .from(schema.order)
    .where(eq(schema.order.customerId, customerId));

  const orderItems = await Promise.all(
    orders.map(async (order) => {
      const items = await db
        .select()
        .from(schema.orderItem)
        .where(eq(schema.orderItem.orderId, order.id));
      const products = await db.select().from(schema.product);
      return {
        orderNumber: Number(order.orderNumber),
        status: order.status,
        fulfillment: order.fulfillment,
        notes: order.notes,
        createdAt: order.createdAt.toISOString(),
        items: items.map((item) => ({
          productName:
            products.find((p) => p.id === item.productId)?.officialName ?? item.productId,
          quantity: item.quantity,
          unit: item.unit,
        })),
      };
    }),
  );

  // Get conversations and messages.
  const conversations = await db
    .select()
    .from(schema.conversation)
    .where(eq(schema.conversation.phoneE164, customer.phoneE164));

  const messages = await Promise.all(
    conversations.map(async (conv) => {
      const msgs = await db
        .select()
        .from(schema.message)
        .where(eq(schema.message.conversationId, conv.id));
      return msgs.map((m) => ({
        direction: m.direction,
        type: m.type,
        body: m.bodyText,
        createdAt: m.createdAt.toISOString(),
      }));
    }),
  );

  return {
    customer: {
      id: customer.id,
      phone: maskPhone(customer.phoneE164),
      name: customer.name,
      address: customer.addressText,
      usualFulfillment: customer.usualFulfillment,
      preferredBranch: branch[0]?.shortName ?? null,
      consentAt: customer.consentAt?.toISOString() ?? null,
      createdAt: customer.createdAt.toISOString(),
    },
    orders: orderItems,
    messages: messages.flat(),
  };
}

/**
 * Rectifies customer data (ARCO: Rectification).
 */
export async function rectifyCustomerData(
  db: Database,
  customerId: string,
  data: { name?: string; addressText?: string; usualFulfillment?: "PICKUP" | "DELIVERY" },
): Promise<boolean> {
  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.addressText !== undefined) updates.addressText = data.addressText;
  if (data.usualFulfillment !== undefined) updates.usualFulfillment = data.usualFulfillment;
  updates.updatedAt = new Date();

  const rows = await db
    .update(schema.customer)
    .set(updates)
    .where(eq(schema.customer.id, customerId))
    .returning({ id: schema.customer.id });

  return rows.length > 0;
}

/**
 * Suppresses a customer's personal data (ARCO: Suppression).
 * Anonymizes the customer and keeps orders without personal data.
 */
export async function suppressCustomerData(db: Database, customerId: string): Promise<boolean> {
  const rows = await db
    .update(schema.customer)
    .set({
      name: null,
      addressText: null,
      phoneE164: `anon-${customerId}`,
      usualFulfillment: "PICKUP",
      preferredBranchId: null,
      consentAt: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.customer.id, customerId))
    .returning({ id: schema.customer.id });

  if (rows.length === 0) return false;

  // Anonymize conversation phone numbers.
  await db
    .update(schema.conversation)
    .set({ phoneE164: `anon-${customerId}` })
    .where(
      eq(
        schema.conversation.phoneE164,
        (
          await db.select().from(schema.customer).where(eq(schema.customer.id, customerId)).limit(1)
        )[0]?.phoneE164 ?? "",
      ),
    );

  return true;
}

function maskPhone(phone: string): string {
  if (phone.length < 8) return "***";
  return `${phone.slice(0, 4)}***${phone.slice(-4)}`;
}
