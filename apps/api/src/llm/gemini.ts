import { Buffer } from "node:buffer";

/**
 * Calls Google Gemini's native generateContent endpoint with optional inline
 * audio (base64). Used for the "single-API multimodal" approach where a
 * WhatsApp .ogg/.opus voice note is sent directly to Gemini instead of being
 * transcribed by a separate STT service.
 *
 * Returns the model's text output.
 */
export async function geminiGenerate(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userParts: Array<{ text?: string; audio?: { data: Buffer; mimeType: string } }>,
): Promise<string> {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY (CHAT_API_KEY) is required for multimodal calls");
  }

  const parts: Array<Record<string, unknown>> = [];
  for (const p of userParts) {
    if (p.audio) {
      parts.push({
        inlineData: {
          mimeType: p.audio.mimeType,
          data: p.audio.data.toString("base64"),
        },
      });
    }
    if (p.text) {
      parts.push({ text: p.text });
    }
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0 },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Gemini failed: ${response.status} ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return text;
}

/**
 * Convenience: transcribe an audio buffer to text using Gemini.
 */
export async function geminiTranscribe(
  apiKey: string,
  model: string,
  audio: Buffer,
  mimeType: string,
): Promise<string> {
  return geminiGenerate(
    apiKey,
    model,
    "Transcribí el audio a texto en español. Devolvé SOLO el texto transcrito, sin comentarios.",
    [{ audio: { data: audio, mimeType } }],
  );
}
