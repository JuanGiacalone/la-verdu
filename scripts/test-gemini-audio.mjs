import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";

const apiKey = process.env.CHAT_API_KEY;
const model = process.env.CHAT_MODEL || "gemini-3.5-flash-lite";
const audioPath = process.argv[2];

if (!apiKey) {
  console.error("CHAT_API_KEY is not set");
  process.exit(1);
}
if (!audioPath) {
  console.error("Usage: node scripts/test-gemini-audio.mjs <audio.ogg>");
  process.exit(1);
}

const audio = readFileSync(audioPath);
const mime = audioPath.endsWith(".opus") ? "audio/opus" : "audio/ogg";

const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

const res = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    systemInstruction: { parts: [{ text: "Transcribí el audio a texto en español. Devolvé SOLO el texto transcrito." }] },
    contents: [{ role: "user", parts: [{ inlineData: { mimeType: mime, data: audio.toString("base64") } }] }],
    generationConfig: { temperature: 0 },
  }),
});

if (!res.ok) {
  console.error("Gemini error:", res.status, await res.text());
  process.exit(1);
}
const data = await res.json();
const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
console.log("Transcript:", text);
