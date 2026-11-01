export interface ChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface ChatCompletionResult {
  readonly content: string;
  readonly model: string;
}

export interface ChatModel {
  complete(
    messages: readonly ChatMessage[],
    options?: { temperature?: number },
  ): Promise<ChatCompletionResult>;
}

/**
 * Hosted LLM (OpenAI-compatible API).
 */
export function createHostedChatModel(apiKey: string, baseUrl: string, model: string): ChatModel {
  return {
    async complete(messages, options) {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: options?.temperature ?? 0,
        }),
      });

      if (!response.ok) {
        throw new Error(`ChatModel failed: ${response.status} ${await response.text()}`);
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
        model: string;
      };
      return {
        content: data.choices[0]?.message?.content ?? "",
        model: data.model ?? model,
      };
    },
  };
}

/**
 * Local LLM (profile A). Uses the same OpenAI-compatible API but points to
 * a local server (Ollama, llama.cpp, vLLM, etc.) without requiring an API key.
 * The model name is typically the local model tag (e.g., "llama3.1:8b").
 */
export function createLocalChatModel(baseUrl: string, model: string): ChatModel {
  return createHostedChatModel("", baseUrl, model);
}
