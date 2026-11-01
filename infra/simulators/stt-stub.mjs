// Speech-to-text stub (PRD 12.2, 19.1). Speaks the OpenAI-compatible transcription shape.
// Transcripts come from fixtures in later iterations (I2). For I0 it returns a fixed text.
import { createServer } from "node:http";

const port = Number(process.env.STT_STUB_PORT ?? 8083);
const FIXED_TRANSCRIPT = "[stt-stub] transcripcion no grabada";

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    return sendJson(response, 200, { status: "ok", simulator: "stt" });
  }
  if (request.method === "POST" && request.url === "/v1/audio/transcriptions") {
    request.resume();
    request.on("end", () => sendJson(response, 200, { text: FIXED_TRANSCRIPT }));
    return undefined;
  }
  return sendJson(response, 404, { error: "not found" });
});

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`stt-stub listening on ${port}\n`);
});
