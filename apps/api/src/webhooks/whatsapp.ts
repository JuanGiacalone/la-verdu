import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  parseWebhookPayload,
  verifyWebhookSignature,
  type WhatsAppChannel,
} from "../channels/whatsapp.js";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";

export interface WebhookDeps {
  readonly database: Database;
  readonly channel: WhatsAppChannel;
  readonly appSecret: string;
  readonly verifyToken: string;
  readonly onMessage: (event: {
    phoneE164: string;
    waMessageId: string;
    type: "text" | "audio" | "other";
    text?: string;
    mediaId?: string;
    contactName?: string;
    isStaff: boolean;
  }) => Promise<void>;
}

export function registerWhatsAppWebhook(app: FastifyInstance, deps: WebhookDeps): void {
  // Handshake verification (GET).
  app.get("/webhooks/whatsapp", async (request, reply) => {
    const query = request.query as Record<string, string>;
    const mode = query["hub.mode"];
    const token = query["hub.verify_token"];
    const challenge = query["hub.challenge"];

    if (mode === "subscribe" && token === deps.verifyToken && challenge) {
      return reply.code(200).send(challenge);
    }
    return reply.code(403).send("Forbidden");
  });

  // Incoming messages (POST).
  app.post("/webhooks/whatsapp", async (request, reply) => {
    const signature = request.headers["x-hub-signature-256"] as string | undefined;
    const rawBody = typeof request.body === "string" ? request.body : JSON.stringify(request.body);

    if (!verifyWebhookSignature(deps.appSecret, rawBody, signature)) {
      return reply.code(403).send({ error: "Invalid signature" });
    }

    // Respond 200 immediately; process asynchronously.
    reply.code(200).send({ status: "ok" });

    const event = parseWebhookPayload(request.body);
    if (!event) return;

    for (const msg of event.messages) {
      // Deduplicate by wa_message_id.
      const existing = await deps.database
        .select({ id: schema.message.id })
        .from(schema.message)
        .where(eq(schema.message.waMessageId, msg.waMessageId))
        .limit(1);

      if (existing.length > 0) {
        continue; // Already processed.
      }

      // Find or create conversation.
      let conversation = await deps.database
        .select()
        .from(schema.conversation)
        .where(eq(schema.conversation.phoneE164, msg.from))
        .limit(1);

      if (conversation.length === 0) {
        const actorType = (await isStaff(deps.database, msg.from)) ? "STAFF" : "CUSTOMER";
        const rows = await deps.database
          .insert(schema.conversation)
          .values({ phoneE164: msg.from, actorType })
          .returning();
        conversation = rows;
      }

      // Store the inbound message.
      const convId = conversation[0]?.id;
      if (convId) {
        await deps.database.insert(schema.message).values({
          waMessageId: msg.waMessageId,
          conversationId: convId,
          direction: "INBOUND",
          type: msg.type === "text" ? "TEXT" : msg.type === "audio" ? "AUDIO" : "OTHER",
          bodyText: msg.text ?? null,
        });
      }

      // Check if sender is staff.
      const staffCheck = await deps.database
        .select({ id: schema.staff.id })
        .from(schema.staff)
        .where(eq(schema.staff.phoneE164, msg.from))
        .limit(1);
      const senderIsStaff = staffCheck.length > 0;

      // Process the message.
      try {
        await deps.onMessage({
          phoneE164: msg.from,
          waMessageId: msg.waMessageId,
          type: msg.type,
          text: msg.text,
          mediaId: msg.mediaId,
          contactName: msg.contactName,
          isStaff: senderIsStaff,
        });
      } catch (error) {
        // Log but don't crash; the message is already stored.
        console.error("Error processing message:", error);
      }
    }
  });
}

async function isStaff(database: Database, phone: string): Promise<boolean> {
  const rows = await database
    .select({ id: schema.staff.id })
    .from(schema.staff)
    .where(eq(schema.staff.phoneE164, phone))
    .limit(1);
  return rows.length > 0;
}
