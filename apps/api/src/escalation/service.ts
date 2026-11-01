import { and, desc, eq, sql } from "drizzle-orm";
import type { WhatsAppChannel } from "../channels/whatsapp.js";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";

export interface EscalationContext {
  readonly phoneE164: string;
  readonly reason: string;
  readonly summary: string;
  readonly recentMessages: readonly string[];
}

/**
 * Escalates a conversation to human staff.
 * Notifies all active staff of the branch with a summary and recent history.
 * Sets conversation state to ESCALATED.
 */
export async function escalateConversation(
  db: Database,
  channel: WhatsAppChannel,
  conversationId: string,
  phoneE164: string,
  branchId: string | null,
  reason: string,
  summary: string,
): Promise<void> {
  // Get recent messages for context.
  const messages = await db
    .select()
    .from(schema.message)
    .where(eq(schema.message.conversationId, conversationId))
    .orderBy(desc(schema.message.createdAt))
    .limit(5);

  const recentTexts = messages
    .reverse()
    .map(
      (m) =>
        `${m.direction === "INBOUND" ? "Cliente" : "Bot"}: ${m.bodyText ?? m.transcript ?? "(audio)"}`,
    )
    .filter((t) => t.length > 0);

  // Set conversation to ESCALATED.
  await db
    .update(schema.conversation)
    .set({ state: "ESCALATED" })
    .where(eq(schema.conversation.id, conversationId));

  // Create alert.
  await db.insert(schema.alert).values({
    branchId: branchId ?? null,
    kind: "ESCALATION",
    message: `Escalamiento: ${reason}. ${summary}`,
  });

  // Notify staff.
  const staffToNotify = await getBranchStaff(db, branchId);
  const notifyMessage = `Escalamiento de ${phoneE164}:\n${reason}\n${summary}\n\nÚltimos mensajes:\n${recentTexts.join("\n")}\n\nRespondé por acá para continuar con el cliente.`;

  for (const member of staffToNotify) {
    try {
      await channel.sendText(member.phoneE164, notifyMessage);
    } catch {
      console.error(`Failed to notify staff ${member.phoneE164}`);
    }
  }
}

/**
 * Handles a staff response to an escalated conversation.
 * Retransmits the message to the customer.
 */
export async function handleStaffResponse(
  db: Database,
  channel: WhatsAppChannel,
  staffPhone: string,
  customerPhone: string,
  message: string,
): Promise<void> {
  // Find the escalated conversation.
  const convRows = await db
    .select()
    .from(schema.conversation)
    .where(eq(schema.conversation.phoneE164, customerPhone))
    .limit(1);

  const conversation = convRows[0];
  if (conversation?.state !== "ESCALATED") {
    await channel.sendText(staffPhone, "No hay conversación escalada con ese cliente.");
    return;
  }

  // Retransmit to customer.
  await channel.sendText(customerPhone, message);

  // Store the outbound message.
  await db.insert(schema.message).values({
    waMessageId: `staff-reply-${Date.now()}`,
    conversationId: conversation.id,
    direction: "OUTBOUND",
    type: "TEXT",
    bodyText: message,
  });
}

/**
 * Resolves an escalation (staff marks it as resolved).
 * Sets conversation back to BOT.
 */
export async function resolveEscalation(db: Database, conversationId: string): Promise<void> {
  await db
    .update(schema.conversation)
    .set({ state: "BOT", contextJson: {} })
    .where(eq(schema.conversation.id, conversationId));
}

/**
 * Closes a conversation after inactivity timeout.
 */
export async function closeConversation(db: Database, conversationId: string): Promise<void> {
  await db
    .update(schema.conversation)
    .set({ state: "CLOSED", contextJson: {} })
    .where(eq(schema.conversation.id, conversationId));
}

/**
 * Expires draft orders older than the given minutes.
 * Returns the number of expired orders.
 */
export async function expireDraftOrders(db: Database, olderThanMinutes: number): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  const result = await db
    .update(schema.order)
    .set({ status: "CANCELLED", cancelledAt: new Date(), updatedAt: new Date() })
    .where(and(eq(schema.order.status, "DRAFT"), sql`${schema.order.createdAt} < ${cutoff}`))
    .returning({ id: schema.order.id });

  return result.length;
}

async function getBranchStaff(
  db: Database,
  branchId: string | null,
): Promise<Array<typeof schema.staff.$inferSelect>> {
  if (!branchId) {
    // Notify all owners.
    return db.select().from(schema.staff).where(eq(schema.staff.role, "OWNER"));
  }

  const assignments = await db
    .select()
    .from(schema.staffBranch)
    .where(eq(schema.staffBranch.branchId, branchId));

  const staffIds = assignments.map((a) => a.staffId);
  if (staffIds.length === 0) {
    return db.select().from(schema.staff).where(eq(schema.staff.role, "OWNER"));
  }

  const allStaff = await db.select().from(schema.staff).where(eq(schema.staff.active, true));
  return allStaff.filter((s) => staffIds.includes(s.id));
}
