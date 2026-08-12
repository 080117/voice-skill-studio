// 客户端 API 封装（BYOK：key 随请求头传递，服务端不落盘）
import type { ApiKeysState, LlmConfig, TtsConfig, VoiceProfile } from "./types";

export interface DenoiseResult {
  blob: Blob;
  usedFfmpeg: boolean;
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
  audioBase64: string;
  mime: string;
  mode: "reading" | "clip";
  text?: string;
  tts: TtsConfig;
}): Promise<VoiceProfile> {
  const res = await fetch("/api/voices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `创建声纹失败 HTTP ${res.status}`);
  return json as VoiceProfile;
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
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `合成失败 HTTP ${res.status}`);
  return json as TtsResult;
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
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `机器人请求失败 HTTP ${res.status}`);
  return json as ChatResult;
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

export interface TtsMeta {
  builtin: { fishaudio: boolean };
}

/** 查询服务端配置的内置 TTS key（只返回布尔，不含 key） */
export async function fetchTtsMeta(): Promise<TtsMeta | null> {
  try {
    const res = await fetch("/api/tts/meta");
    if (!res.ok) return null;
    return (await res.json()) as TtsMeta;
  } catch {
    return null;
  }
}
