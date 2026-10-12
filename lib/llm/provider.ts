import "server-only";
import { AnthropicProvider } from "./providers/anthropic";
import { GeminiProvider } from "./providers/gemini";
import { GroqProvider } from "./providers/groq";

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

/** Reads LLM_PROVIDER to pick an implementation: "anthropic" (default),
 * "gemini", or "groq" — all behind the same interface above. */
export function getLLMProvider(): LLMProvider {
  if (cachedProvider) return cachedProvider;

  const providerName = process.env.LLM_PROVIDER ?? "anthropic";
  switch (providerName) {
    case "anthropic":
      cachedProvider = new AnthropicProvider();
      break;
    case "gemini":
      cachedProvider = new GeminiProvider();
      break;
    case "groq":
      cachedProvider = new GroqProvider();
      break;
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${providerName}`);
  }
  return cachedProvider;
}
