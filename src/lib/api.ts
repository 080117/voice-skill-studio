// 客户端 API 封装（BYOK：key 随请求头传递，服务端不落盘）
import type { ApiKeysState, LlmConfig, TtsConfig, VoiceProfile } from "./types";

export interface DenoiseResult {
  blob: Blob;
  usedFfmpeg: boolean;
}

/** 带超时的 JSON POST：网络异常时给出友好提示，而不是裸抛 "Failed to fetch" */
async function postJson(url: string, body: unknown, timeoutMs: number): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || `请求失败 HTTP ${res.status}`);
    return json;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("请求超时，请稍后重试");
    if (e instanceof TypeError) throw new Error("网络异常：请确认本地服务在运行后重试");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function denoise(blob: Blob): Promise<DenoiseResult> {
  const form = new FormData();
  form.append("file", blob, "input-audio");
  const res = await fetch("/api/denoise", { method: "POST", body: form });
  if (!res.ok) throw new Error(`去噪失败 HTTP ${res.status}`);
  return {
    blob: await res.blob(),
    usedFfmpeg: res.headers.get("X-Used-Ffmpeg") === "1",
  };
}

export async function createVoice(payload: {
  audioBase64?: string;
  mime: string;
  mode: "reading" | "clip";
  text?: string;
  segments?: { audioBase64: string; mime: string }[];
  tts: TtsConfig;
}): Promise<VoiceProfile> {
  return (await postJson("/api/voices", payload, 120_000)) as VoiceProfile;
}

export interface TtsResult {
  audioBase64: string;
  mimeType: string;
  emotion: string;
}

export async function tts(payload: {
  text: string;
  voice: VoiceProfile;
  tts: TtsConfig;
  llm?: LlmConfig;
  emotion?: string;
  autoEmotion?: boolean;
}): Promise<TtsResult> {
  return (await postJson("/api/tts", payload, 90_000)) as TtsResult;
}

export interface ChatResult {
  replyText: string;
  audioBase64: string;
  mimeType: string;
  emotion: string;
}

export async function chat(payload: {
  messages: { role: "user" | "assistant"; content: string }[];
  voice: VoiceProfile;
  tts: TtsConfig;
  llm: LlmConfig;
  persona?: string;
}): Promise<ChatResult> {
  return (await postJson("/api/chat", payload, 90_000)) as ChatResult;
}

export function keysToTts(keys: ApiKeysState): TtsConfig {
  return {
    provider: keys.ttsProvider,
    apiKey: keys.ttsApiKey.trim(),
    baseUrl: keys.ttsBaseUrl || undefined,
    model: keys.ttsModel || undefined,
  };
}

export function keysToLlm(keys: ApiKeysState): LlmConfig | null {
  if (!keys.llmBaseUrl || !keys.llmApiKey || !keys.llmModel) return null;
  return { baseUrl: keys.llmBaseUrl, apiKey: keys.llmApiKey.trim(), model: keys.llmModel };
}
