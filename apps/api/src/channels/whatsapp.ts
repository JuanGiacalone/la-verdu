import { createHmac } from "node:crypto";

export interface WhatsAppInboundMessage {
  readonly waMessageId: string;
  readonly from: string; // E.164 without +
  readonly type: "text" | "audio" | "other";
  readonly text?: string;
  readonly mediaId?: string;
  readonly timestamp: number;
  readonly contactName?: string;
}

export interface WhatsAppInboundEvent {
  readonly phoneNumberId: string;
  readonly messages: readonly WhatsAppInboundMessage[];
}

export interface WhatsAppChannel {
  /** Send a text message. Returns the WhatsApp message id. */
  sendText(to: string, body: string): Promise<string>;
  /** Send a template message (for messages outside the 24h window). */
  sendTemplate(
    to: string,
    templateName: string,
    language: string,
    components?: unknown[],
  ): Promise<string>;
  /** Download media by id. Returns the raw bytes. */
  downloadMedia(mediaId: string): Promise<Buffer>;
}

export interface WhatsAppChannelConfig {
  readonly accessToken: string;
  readonly phoneNumberId: string;
  readonly apiVersion: string;
  readonly appSecret: string;
}

/**
 * Verifies the X-Hub-Signature-256 header against the raw body.
 * Returns true if the signature is valid.
 */
export function verifyWebhookSignature(
  appSecret: string,
  rawBody: string,
  signatureHeader: string | undefined,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  // Constant-time comparison.
  if (expected.length !== provided.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < expected.length; i += 1) {
    result |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Parses a WhatsApp Cloud API webhook payload into a structured event.
 * Returns null if the payload is not a messages event.
 */
export function parseWebhookPayload(payload: unknown): WhatsAppInboundEvent | null {
  if (typeof payload !== "object" || payload === null) return null;
  const body = payload as Record<string, unknown>;
  if (body.object !== "whatsapp_business_account") return null;

  const entries = body.entry as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(entries)) return null;

  const messages: WhatsAppInboundMessage[] = [];
  let phoneNumberId = "";

  for (const entry of entries) {
    const changes = entry.changes as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = change.value as Record<string, unknown> | undefined;
      if (!value || change.field !== "messages") continue;

      const metadata = value.metadata as Record<string, unknown> | undefined;
      if (metadata?.phone_number_id) {
        phoneNumberId = String(metadata.phone_number_id);
      }

      const rawMessages = value.messages as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(rawMessages)) continue;

      const contacts = value.contacts as Array<Record<string, unknown>> | undefined;
      const contactMap = new Map<string, string>();
      if (Array.isArray(contacts)) {
        for (const c of contacts) {
          const profile = c.profile as Record<string, unknown> | undefined;
          if (c.wa_id && profile?.name) {
            contactMap.set(String(c.wa_id), String(profile.name));
          }
        }
      }

      for (const msg of rawMessages) {
        const from = String(msg.from ?? "");
        const id = String(msg.id ?? "");
        const timestamp = Number(msg.timestamp ?? 0);
        const type = msg.type === "text" ? "text" : msg.type === "audio" ? "audio" : "other";

        let text: string | undefined;
        let mediaId: string | undefined;

        if (type === "text") {
          const textObj = msg.text as Record<string, unknown> | undefined;
          text = textObj ? String(textObj.body ?? "") : undefined;
        } else if (type === "audio") {
          const audioObj = msg.audio as Record<string, unknown> | undefined;
          mediaId = audioObj ? String(audioObj.id ?? "") : undefined;
        }

        messages.push({
          waMessageId: id,
          from: `+${from}`,
          type,
          text,
          mediaId,
          timestamp,
          contactName: contactMap.get(from),
        });
      }
    }
  }

  if (messages.length === 0) return null;

  return { phoneNumberId, messages };
}

/**
 * Creates a WhatsApp channel that talks to the Cloud API.
 */
export function createWhatsAppChannel(config: WhatsAppChannelConfig): WhatsAppChannel {
  const baseUrl = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}`;

  return {
    async sendText(to, body) {
      const response = await fetch(`${baseUrl}/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: to.replace(/^\+/, ""),
          type: "text",
          text: { body },
        }),
      });
      if (!response.ok) {
        throw new Error(`WhatsApp sendText failed: ${response.status} ${await response.text()}`);
      }
      const data = (await response.json()) as { messages?: Array<{ id: string }> };
      return data.messages?.[0]?.id ?? "";
    },

    async sendTemplate(to, templateName, language, components) {
      const response = await fetch(`${baseUrl}/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: to.replace(/^\+/, ""),
          type: "template",
          template: {
            name: templateName,
            language: { code: language },
            components: components ?? [],
          },
        }),
      });
      if (!response.ok) {
        throw new Error(
          `WhatsApp sendTemplate failed: ${response.status} ${await response.text()}`,
        );
      }
      const data = (await response.json()) as { messages?: Array<{ id: string }> };
      return data.messages?.[0]?.id ?? "";
    },

    async downloadMedia(mediaId) {
      // First get the media URL.
      const metaResponse = await fetch(
        `https://graph.facebook.com/${config.apiVersion}/${mediaId}`,
        {
          headers: { authorization: `Bearer ${config.accessToken}` },
        },
      );
      if (!metaResponse.ok) {
        throw new Error(`WhatsApp media meta failed: ${metaResponse.status}`);
      }
      const meta = (await metaResponse.json()) as { url?: string };
      if (!meta.url) {
        throw new Error("WhatsApp media URL missing");
      }

      const mediaResponse = await fetch(meta.url, {
        headers: { authorization: `Bearer ${config.accessToken}` },
      });
      if (!mediaResponse.ok) {
        throw new Error(`WhatsApp media download failed: ${mediaResponse.status}`);
      }
      const buffer = await mediaResponse.arrayBuffer();
      return Buffer.from(buffer);
    },
  };
}
