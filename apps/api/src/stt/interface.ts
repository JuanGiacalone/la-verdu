import type { AppConfig } from "../config.js";

export interface SttResult {
  readonly text: string;
  readonly language?: string;
  readonly durationSeconds?: number;
}

export interface SttProvider {
  transcribe(audio: Buffer, mimeType: string): Promise<SttResult>;
}

/**
 * Hosted STT (OpenAI-compatible Whisper API).
 */
export function createHostedStt(apiKey: string, baseUrl: string, model: string): SttProvider {
  return {
    async transcribe(audio, mimeType) {
      const formData = new FormData();
      formData.append("file", new Blob([audio], { type: mimeType }), "audio.ogg");
      formData.append("model", model);
      formData.append("language", "es");

      const response = await fetch(`${baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`STT failed: ${response.status} ${await response.text()}`);
      }

      const data = (await response.json()) as {
        text: string;
        language?: string;
        duration?: number;
      };
      return {
        text: data.text,
        language: data.language,
        durationSeconds: data.duration,
      };
    },
  };
}

/**
 * Local STT (profile A). Uses the same OpenAI-compatible Whisper API but
 * points to a local server (faster-whisper, whisper.cpp) without an API key.
 */
export function createLocalStt(baseUrl: string, model: string): SttProvider {
  return createHostedStt("", baseUrl, model);
}

export function createSttProvider(config: AppConfig): SttProvider {
  // For profile B (hosted), use hosted STT.
  // For profile A (local), use createLocalStt.
  return createHostedStt(config.sttApiKey, config.sttBaseUrl, config.sttModel);
}
