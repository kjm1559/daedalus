export interface LLMConfig {
  provider: "ollama" | "openai";
  baseUrl?: string;
  model: string;
  apiKey?: string;
}

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletion {
  id: string;
  model: string;
  choices: Array<{
    message: Message;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class LLMService {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  static fromEnv(): LLMService {
    const ollamaUrl = process.env.OLLAMA_BASE_URL;
    const ollamaModel = process.env.OLLAMA_MODEL || "llama3.2";
    const openaiKey = process.env.OPENAI_API_KEY;
    const openaiModel = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const provider: "ollama" | "openai" = openaiKey ? "openai" : "ollama";

    return new LLMService({
      provider,
      baseUrl: provider === "ollama" ? ollamaUrl : undefined,
      model: provider === "ollama" ? ollamaModel : openaiModel,
      apiKey: provider === "openai" ? openaiKey : undefined,
    });
  }

  async chat(messages: Message[]): Promise<string> {
    if (this.config.provider === "ollama") {
      return this.ollamaChat(messages);
    } else {
      return this.openaiChat(messages);
    }
  }

  private async ollamaChat(messages: Message[]): Promise<string> {
    if (!this.config.baseUrl) {
      throw new Error("OLLAMA_BASE_URL is not configured");
    }

    const response = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.message?.content || "";
  }

  private async openaiChat(messages: Message[]): Promise<string> {
    if (!this.config.apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  }
}
