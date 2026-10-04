import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, LLMRequest, LLMResponse } from "../provider";

const DEFAULT_MODEL = "claude-opus-5-5";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private model: string;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    this.client = new Anthropic({ apiKey });
    this.model = process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: request.maxTokens ?? 1024,
      system: request.system,
      // feedback text is short and simple — low effort keeps cost/latency down
      output_config: { effort: "low" },
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );

    return {
      text: textBlock?.text ?? "",
      provider: this.name,
      model: response.model,
    };
  }
}
