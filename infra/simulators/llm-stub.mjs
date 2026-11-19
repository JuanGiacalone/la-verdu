// LLM stub (PRD 12.3, 19.1). Speaks the OpenAI-compatible chat completions shape.
//
// Modes:
// - default: fixed reply so the stack works without fixtures (I0 behavior).
// - fixture: when the request model is "fixture:<name>", replays a recorded
//   response from evals/fixtures/llm/<name>.json. Fixture shape:
//     { "default": "<content>", "matches": [{ "contains": "<user text>", "content": "<content>" }] }
//   The reply is the first "matches" entry whose "contains" appears in any user
//   message of the request; falls back to "default".

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixturesDir = process.env.LLM_FIXTURES_DIR ?? join(repoRoot, "evals", "fixtures", "llm");
const port = Number(process.env.LLM_STUB_PORT ?? 8082);
const FIXED_REPLY = "[llm-stub] respuesta no grabada";

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function completion(content, model) {
  return {
    id: "chatcmpl-stub",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: model ?? "llm-stub",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
  };
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function selectFixtureContent(fixture, messages) {
  const userTexts = messages
    .filter((message) => message?.role === "user")
    .map((message) => String(message.content ?? ""));
  for (const match of fixture.matches ?? []) {
    if (
      typeof match?.contains === "string" &&
      userTexts.some((text) => text.includes(match.contains))
    ) {
      return match.content;
    }
  }
  return typeof fixture.default === "string" ? fixture.default : null;
}

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    return sendJson(response, 200, { status: "ok", simulator: "llm" });
  }
  if (request.method === "POST" && request.url === "/v1/chat/completions") {
    readBody(request)
      .then((raw) => {
        let body = {};
        try {
          body = JSON.parse(raw);
        } catch {
          return sendJson(response, 400, { error: "invalid JSON body" });
        }
        const model = typeof body.model === "string" ? body.model : "";
        if (model.startsWith("fixture:")) {
          const name = model.slice("fixture:".length);
          let fixture;
          try {
            fixture = JSON.parse(readFileSync(join(fixturesDir, `${name}.json`), "utf8"));
          } catch (error) {
            const status = error?.code === "ENOENT" ? 404 : 500;
            return sendJson(response, status, { error: `fixture "${name}" unavailable` });
          }
          const content = selectFixtureContent(
            fixture,
            Array.isArray(body.messages) ? body.messages : [],
          );
          if (content === null) {
            return sendJson(response, 404, { error: `fixture "${name}" has no matching reply` });
          }
          return sendJson(response, 200, completion(content, model));
        }
        return sendJson(response, 200, completion(FIXED_REPLY));
      })
      .catch(() => sendJson(response, 500, { error: "failed to read body" }));
    return undefined;
  }
  return sendJson(response, 404, { error: "not found" });
});

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`llm-stub listening on ${port} (fixtures: ${fixturesDir})\n`);
});
