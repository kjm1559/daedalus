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

interface OllamaResponse {
  message?: { content?: string };
}

interface OpenAIResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export class LLMService {
  private config: LLMConfig;
  private abortController: AbortController | null = null;

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

  async *streamChat(
    messages: Message[],
    onToken?: (token: string) => void,
  ): AsyncGenerator<string, void, unknown> {
    if (this.abortController) {
      throw new Error("Stream already in progress");
    }

    this.abortController = new AbortController();

    try {
      if (this.config.provider === "ollama") {
        yield* this.ollamaStreamChat(messages, onToken);
      } else {
        yield* this.openaiStreamChat(messages, onToken);
      }
    } finally {
      this.abortController = null;
    }
  }

  abortStream(): void {
    this.abortController?.abort();
  }

  private async *ollamaStreamChat(
    messages: Message[],
    onToken?: (token: string) => void,
  ): AsyncGenerator<string> {
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
        stream: true,
      }),
      signal: this.abortController?.signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error("Response body is null");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter(Boolean);

      for (const line of lines) {
        try {
          const data = JSON.parse(line) as OllamaResponse;
          if (data.message?.content) {
            onToken?.(data.message.content);
            yield data.message.content;
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }

  private async *openaiStreamChat(
    messages: Message[],
    onToken?: (token: string) => void,
  ): AsyncGenerator<string> {
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
        stream: true,
      }),
      signal: this.abortController?.signal,
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error("Response body is null");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data) as OpenAIResponse;
            const content = parsed.choices?.[0]?.message?.content;
            if (content) {
              onToken?.(content);
              yield content;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
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

    const data = (await response.json()) as OllamaResponse;
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

    const data = (await response.json()) as OpenAIResponse;
    return data.choices?.[0]?.message?.content || "";
  }
}
