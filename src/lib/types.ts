// 共享类型与常量（BYOK / 声纹 / Skill 包）

export type VoiceMode = "reading" | "clip";

export type Emotion =
  | "平静"
  | "开心"
  | "悲伤"
  | "激动"
  | "严肃"
  | "温柔";

export const EMOTIONS: Emotion[] = ["平静", "开心", "悲伤", "激动", "严肃", "温柔"];

export type TtsProviderId = "siliconflow" | "fishaudio" | "minimax" | "openai" | "mock";

export interface TtsConfig {
  provider: TtsProviderId;
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface VoiceProfile {
  /** 本地生成的唯一 id（客户端） */
  id: string;
  mode: VoiceMode;
  provider: TtsProviderId;
  /** 服务商返回的 voice_id / preset 名 */
  providerVoiceId: string;
  model?: string;
  language: string;
  /** 该 provider 支持的情感控制方式 */
  emotionControl: string[];
  createdAt: number;
  /** 朗读文本（reading 模式）或留空 */
  sourceText?: string;
}

export interface SkillPackMeta {
  schemaVersion: "1.0";
  voiceId: string;
  provider: TtsProviderId;
  model?: string;
  language: string;
  emotionControl: string[];
  referenceAudio: "reference.wav";
  mode: VoiceMode;
  createdAt: string;
}

export interface ApiKeysState {
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  ttsProvider: TtsProviderId;
  ttsApiKey: string;
  ttsBaseUrl: string;
  ttsModel: string;
}

export const EMPTY_KEYS: ApiKeysState = {
  llmBaseUrl: "",
  llmApiKey: "",
  llmModel: "",
  ttsProvider: "siliconflow",
  ttsApiKey: "",
  ttsBaseUrl: "",
  ttsModel: "",
};

export const DEFAULT_TTS_BASE_URLS: Record<TtsProviderId, string> = {
  siliconflow: "https://api.siliconflow.cn/v1",
  fishaudio: "https://api.fish.audio",
  minimax: "https://api.minimax.chat/v1",
  openai: "https://api.openai.com/v1",
  mock: "",
};

export const TTS_PROVIDER_LABELS: Record<TtsProviderId, string> = {
  siliconflow: "硅基流动 SiliconFlow（CosyVoice）",
  fishaudio: "Fish Audio",
  minimax: "MiniMax",
  openai: "OpenAI TTS",
  mock: "演示模式（无需 key）",
};

/** 客户端展示用 provider 元信息（与服务端适配器保持一致） */
export const TTS_PROVIDER_META: Record<TtsProviderId, { label: string; supportsClone: boolean }> = {
  siliconflow: { label: "硅基流动 SiliconFlow（CosyVoice）", supportsClone: true },
  fishaudio: { label: "Fish Audio", supportsClone: true },
  minimax: { label: "MiniMax（需控制台先做声音复刻）", supportsClone: false },
  openai: { label: "OpenAI TTS（预设音色，不支持克隆）", supportsClone: false },
  mock: { label: "演示模式（无需 key）", supportsClone: true },
};
