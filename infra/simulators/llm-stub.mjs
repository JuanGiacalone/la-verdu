// LLM stub (PRD 12.3, 19.1). Speaks the OpenAI-compatible chat completions shape.
// Responses are fixture-driven in later iterations (I2). For I0 it returns a fixed reply
// so the rest of the stack can be exercised without a model or an API key.
import { createServer } from "node:http";

const port = Number(process.env.LLM_STUB_PORT ?? 8082);
const FIXED_REPLY = "[llm-stub] respuesta no grabada";

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    return sendJson(response, 200, { status: "ok", simulator: "llm" });
  }
  if (request.method === "POST" && request.url === "/v1/chat/completions") {
    request.resume();
    request.on("end", () =>
      sendJson(response, 200, {
        id: "chatcmpl-stub",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "llm-stub",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: FIXED_REPLY },
            finish_reason: "stop",
          },
        ],
      }),
    );
    return undefined;
  }
  return sendJson(response, 404, { error: "not found" });
});

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`llm-stub listening on ${port}\n`);
});
