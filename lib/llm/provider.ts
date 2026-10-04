import "server-only";
import { AnthropicProvider } from "./providers/anthropic";

export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  system?: string;
  messages: LLMMessage[];
  maxTokens?: number;
}

export interface LLMResponse {
  text: string;
  provider: string;
  model: string;
}

export interface LLMProvider {
  readonly name: string;
  complete(request: LLMRequest): Promise<LLMResponse>;
}

let cachedProvider: LLMProvider | undefined;

/**
 * Reads LLM_PROVIDER to pick an implementation. Only "anthropic" exists in
 * V1 — "gemini" and "groq" are added in a later phase behind this same
 * interface, so nothing above this function needs to change then.
 */
export function getLLMProvider(): LLMProvider {
  if (cachedProvider) return cachedProvider;

  const providerName = process.env.LLM_PROVIDER ?? "anthropic";
  switch (providerName) {
    case "anthropic":
      cachedProvider = new AnthropicProvider();
      break;
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${providerName}`);
  }
  return cachedProvider;
}
