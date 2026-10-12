import "server-only";
import Groq from "groq-sdk";
import type { LLMProvider, LLMRequest, LLMResponse } from "../provider";

// The smallest/cheapest model in the SDK's own shipped model-id union —
// historically the safest free-tier bet, but Groq's free model roster and
// limits rotate (third-party reports disagree on which models are
// currently free); verify against console.groq.com before relying on
// this in production.
const DEFAULT_MODEL = "llama-3.1-8b-instant";

export class GroqProvider implements LLMProvider {
  readonly name = "groq";
  private client: Groq;
  private model: string;

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY is not set");
    }
    this.client = new Groq({ apiKey });
    this.model = process.env.GROQ_MODEL ?? DEFAULT_MODEL;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      // max_tokens is deprecated in favor of this field as of the
      // installed SDK's own types.
      max_completion_tokens: request.maxTokens ?? 1024,
      messages: [
        ...(request.system
          ? [{ role: "system" as const, content: request.system }]
          : []),
        ...request.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    });

    return {
      text: response.choices[0]?.message?.content ?? "",
      provider: this.name,
      model: response.model,
    };
  }
}
