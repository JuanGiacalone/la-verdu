// Speech-to-text stub (PRD 12.2, 19.1). Speaks the OpenAI-compatible transcription shape.
//
// Modes:
// - default: fixed transcript so the stack works without fixtures (I0 behavior).
// - fixture: when the multipart "model" field is "fixture:<name>", returns the
//   transcript recorded in evals/fixtures/stt/<name>.json, shape:
//     { "text": "<transcript>", "language": "es", "duration": 3.2 }

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixturesDir = process.env.STT_FIXTURES_DIR ?? join(repoRoot, "evals", "fixtures", "stt");
const port = Number(process.env.STT_STUB_PORT ?? 8083);
const FIXED_TRANSCRIPT = "[stt-stub] transcripcion no grabada";

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

// Extracts a plain text multipart field value without a multipart library:
// field values in OpenAI-style transcription requests are short ASCII strings.
function extractField(raw, fieldName) {
  const text = raw.toString("latin1");
  const pattern = new RegExp(`name="${fieldName}"\\r?\\n\\r?\\n([^\\r]*)`);
  const match = text.match(pattern);
  return match ? match[1] : undefined;
}

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    return sendJson(response, 200, { status: "ok", simulator: "stt" });
  }
  if (request.method === "POST" && request.url === "/v1/audio/transcriptions") {
    readBody(request)
      .then((raw) => {
        const model = extractField(raw, "model") ?? "";
        if (model.startsWith("fixture:")) {
          const name = model.slice("fixture:".length);
          let fixture;
          try {
            fixture = JSON.parse(readFileSync(join(fixturesDir, `${name}.json`), "utf8"));
          } catch (error) {
            const status = error?.code === "ENOENT" ? 404 : 500;
            return sendJson(response, status, { error: `fixture "${name}" unavailable` });
          }
          if (typeof fixture.text !== "string") {
            return sendJson(response, 500, { error: `fixture "${name}" has no text` });
          }
          return sendJson(response, 200, {
            text: fixture.text,
            ...(fixture.language ? { language: fixture.language } : {}),
            ...(typeof fixture.duration === "number" ? { duration: fixture.duration } : {}),
          });
        }
        return sendJson(response, 200, { text: FIXED_TRANSCRIPT });
      })
      .catch(() => sendJson(response, 500, { error: "failed to read body" }));
    return undefined;
  }
  return sendJson(response, 404, { error: "not found" });
});

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`stt-stub listening on ${port} (fixtures: ${fixturesDir})\n`);
});
