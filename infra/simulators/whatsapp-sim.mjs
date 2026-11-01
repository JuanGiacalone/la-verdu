// WhatsApp Cloud API simulator (PRD 12.1, 19.1). Node built-ins only.
//
// Inbound (fake customer or staff message):
//   POST /inbound  {"from": "+5491100000201", "text": "hola"}
//   Builds a Cloud API webhook payload, signs it with X-Hub-Signature-256 using the app
//   secret, and forwards it to the API webhook URL.
//
// Outbound (what the API sends to WhatsApp):
//   POST /v22.0/:phoneNumberId/messages  -> captured to the outbox file, returns a fake wamid.
//   GET  /outbox                         -> captured messages.
import { createHmac, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname } from "node:path";

const port = Number(process.env.WHATSAPP_SIM_PORT ?? 8081);
const appSecret = process.env.WHATSAPP_APP_SECRET ?? "local_dev_app_secret_only";
const webhookUrl =
  process.env.WHATSAPP_SIM_WEBHOOK_URL ?? "http://localhost:3000/webhooks/whatsapp";
const outboxFile = process.env.WHATSAPP_SIM_OUT ?? "./.dev/whatsapp-outbox.jsonl";
const PHONE_NUMBER_ID = "1000000000000001";
const DISPLAY_PHONE = "+54 9 11 0000-0000";

mkdirSync(dirname(outboxFile), { recursive: true });

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

/** Builds a Cloud API webhook body for one inbound text message. */
export function buildInboundPayload({ from, text, messageId, name = "Cliente de prueba" }) {
  const waId = from.replace(/^\+/, "");
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "200000000000001",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: DISPLAY_PHONE, phone_number_id: PHONE_NUMBER_ID },
              contacts: [{ profile: { name }, wa_id: waId }],
              messages: [
                {
                  from: waId,
                  id: messageId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

/** X-Hub-Signature-256 header value: "sha256=" + HMAC-SHA256(app secret, raw body). */
export function signBody(rawBody, secret = appSecret) {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

async function forwardInbound(input) {
  const messageId = `wamid.SIM${randomUUID().replaceAll("-", "").toUpperCase()}`;
  const rawBody = JSON.stringify(buildInboundPayload({ ...input, messageId }));
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": signBody(rawBody),
    },
    body: rawBody,
  });
  return { messageId, status: response.status };
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/health") {
      return sendJson(response, 200, { status: "ok", simulator: "whatsapp" });
    }

    if (request.method === "POST" && request.url === "/inbound") {
      const input = JSON.parse(await readBody(request));
      if (!input.from || !input.text) {
        return sendJson(response, 400, { error: "from and text are required" });
      }
      const result = await forwardInbound(input);
      return sendJson(response, 202, result);
    }

    if (request.method === "POST" && /^\/v\d+\.\d+\/[^/]+\/messages$/.test(request.url ?? "")) {
      const payload = JSON.parse(await readBody(request));
      const wamid = `wamid.OUT${randomUUID().replaceAll("-", "").toUpperCase()}`;
      appendFileSync(
        outboxFile,
        `${JSON.stringify({ wamid, at: new Date().toISOString(), payload })}\n`,
      );
      return sendJson(response, 200, { messaging_product: "whatsapp", messages: [{ id: wamid }] });
    }

    if (request.method === "GET" && request.url === "/outbox") {
      const lines = existsSync(outboxFile)
        ? readFileSync(outboxFile, "utf8").trim().split("\n")
        : [];
      return sendJson(response, 200, {
        messages: lines.filter(Boolean).map((line) => JSON.parse(line)),
      });
    }

    return sendJson(response, 404, { error: "not found" });
  } catch (error) {
    return sendJson(response, 500, { error: String(error) });
  }
});

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`whatsapp-sim listening on ${port}, forwarding to ${webhookUrl}\n`);
});
