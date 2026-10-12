import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { LLMProvider, LLMRequest, LLMResponse } from "../provider";

// The SDK's own doc-comment examples use this alias repeatedly — Google's
// "always-current flash model" alias, chosen so the default tracks
// whichever flash model is current instead of a dated id that gets
// deprecated out from under us. Free-tier availability still rotates;
// verify against ai.google.dev before relying on this in production.
const DEFAULT_MODEL = "gemini-flash-latest";

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  private client: GoogleGenAI;
  private model: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set");
    }
    this.client = new GoogleGenAI({ apiKey });
    this.model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const response = await this.client.models.generateContent({
      model: this.model,
      // Gemini's role is "user" | "model", not "assistant" — the SDK
      // types it as a bare string, so a wrong value here wouldn't be
      // caught by the compiler.
      contents: request.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      config: {
        systemInstruction: request.system,
        maxOutputTokens: request.maxTokens ?? 1024,
      },
    });

    return {
      text: response.text ?? "",
      provider: this.name,
      // modelVersion is documented optional; fall back to the configured
      // model string if the response doesn't report it.
      model: response.modelVersion ?? this.model,
    };
  }
}
