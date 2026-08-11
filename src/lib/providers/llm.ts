// OpenAI-compatible LLM 适配器（DeepSeek / Kimi / GLM / Qwen / MiniMax 等）
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export function normalizeBaseUrl(baseUrl: string): string {
  let u = (baseUrl || "").trim().replace(/\/+$/, "");
  if (!u) throw new Error("缺少 baseUrl");
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u;
}

export async function chatCompletion(opts: ChatCompletionOptions, fetchImpl: typeof fetch = fetch): Promise<string> {
  const { baseUrl, apiKey, model, messages, temperature = 0.7, maxTokens, timeoutMs = 60000 } = opts;
  const url = `${normalizeBaseUrl(baseUrl)}/chat/completions`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream: false }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`LLM 请求失败 HTTP ${res.status}: ${t.slice(0, 300)}`);
  }
  const json = (await res.json()) as any;
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("LLM 响应缺少 content");
  return content;
}
