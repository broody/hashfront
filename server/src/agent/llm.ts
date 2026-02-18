interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface CompletionOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

interface CompletionResponse {
  content: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number };
}

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function complete(
  apiKey: string,
  options: CompletionOptions,
): Promise<CompletionResponse> {
  const res = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://chain-tactics.dev",
      "X-Title": "Chain Tactics",
    },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1024,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];

  return {
    content: choice?.message?.content ?? "",
    model: data.model ?? options.model,
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
    },
  };
}

export function composeSystemPrompt(
  personality: { systemPrompt: string; traits: string[] },
  gameContext: string,
): string {
  const traitsStr = personality.traits.join(", ");
  return `${personality.systemPrompt}\n\nTraits: ${traitsStr}\n\nCurrent game state:\n${gameContext}`;
}
