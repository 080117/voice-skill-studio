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

export interface LlmPreset {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
}

/** LLM 服务预设：选好后自动填 Base URL 与模型名，用户只需填 Key */
export const LLM_PRESETS: LlmPreset[] = [
  { id: "opencode-go", label: "OpenCode Go（GLM-5）", baseUrl: "https://opencode.ai/zen/go/v1", model: "glm-5" },
  { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { id: "siliconflow", label: "硅基流动 SiliconFlow", baseUrl: "https://api.siliconflow.cn/v1", model: "deepseek-ai/DeepSeek-V3" },
  { id: "zhipu", label: "智谱 GLM（免费）", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4.7-flash" },
  { id: "kimi", label: "Moonshot Kimi", baseUrl: "https://api.moonshot.cn/v1", model: "kimi-k2.6" },
  { id: "qwen", label: "阿里云百炼 Qwen", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  { id: "custom", label: "自定义（高级）", baseUrl: "", model: "" },
];

/** 默认推荐的 LLM 预设（OpenCode Go，用户已订阅） */
export const DEFAULT_LLM_PRESET: LlmPreset = LLM_PRESETS[0];

/** TTS 下拉只展示这几个；minimax/openai 保留代码供后续扩展 */
export const TTS_PROVIDER_OPTIONS: TtsProviderId[] = ["siliconflow", "fishaudio", "mock"];

/** 各 TTS 服务商可选模型（前端展示用；适配器内也有兜底默认） */
export const TTS_MODEL_OPTIONS: Record<TtsProviderId, { value: string; label: string }[]> = {
  siliconflow: [
    { value: "FunAudioLLM/CosyVoice2-0.5B", label: "CosyVoice2-0.5B（默认，支持情感指令）" },
    { value: "IndexTeam/IndexTTS-2", label: "IndexTTS-2（新一代，更自然拟真）" },
  ],
  fishaudio: [{ value: "s2.1-pro-free", label: "s2.1-pro-free（免费）" }],
  minimax: [{ value: "speech-02-hd", label: "speech-02-hd" }],
  openai: [{ value: "tts-1", label: "tts-1" }],
  mock: [],
};

/** 切换 TTS 服务商时自动带上的默认模型 */
export const DEFAULT_TTS_MODELS: Record<TtsProviderId, string> = {
  siliconflow: "FunAudioLLM/CosyVoice2-0.5B",
  fishaudio: "s2.1-pro-free",
  minimax: "speech-02-hd",
  openai: "tts-1",
  mock: "",
};

/** 空状态：服务预选好，只需填 Key */
export const EMPTY_KEYS: ApiKeysState = {
  llmBaseUrl: DEFAULT_LLM_PRESET.baseUrl,
  llmApiKey: "",
  llmModel: DEFAULT_LLM_PRESET.model,
  ttsProvider: "siliconflow",
  ttsApiKey: "",
  ttsBaseUrl: "",
  ttsModel: DEFAULT_TTS_MODELS.siliconflow,
};

export const DEFAULT_TTS_BASE_URLS: Record<TtsProviderId, string> = {
  siliconflow: "https://api.siliconflow.cn/v1",
  fishaudio: "https://api.fish.audio",
  minimax: "https://api.minimax.chat/v1",
  openai: "https://api.openai.com/v1",
  mock: "",
};

export const TTS_PROVIDER_LABELS: Record<TtsProviderId, string> = {
  siliconflow: "硅基流动 SiliconFlow（CosyVoice / IndexTTS-2）",
  fishaudio: "Fish Audio",
  minimax: "MiniMax",
  openai: "OpenAI TTS",
  mock: "演示模式（无需 key）",
};

/** 客户端展示用 provider 元信息（与服务端适配器保持一致） */
export const TTS_PROVIDER_META: Record<TtsProviderId, { label: string; supportsClone: boolean }> = {
  siliconflow: { label: "硅基流动 SiliconFlow（CosyVoice / IndexTTS-2）", supportsClone: true },
  fishaudio: { label: "Fish Audio", supportsClone: true },
  minimax: { label: "MiniMax（需控制台先做声音复刻）", supportsClone: false },
  openai: { label: "OpenAI TTS（预设音色，不支持克隆）", supportsClone: false },
  mock: { label: "演示模式（无需 key）", supportsClone: true },
};
