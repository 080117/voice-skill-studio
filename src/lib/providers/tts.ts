// TTS / 声音克隆适配器注册表（OpenAI-compatible 风格；各 provider 具体请求体不同，均在此归一化）
import type { Emotion, TtsConfig, TtsProviderId } from "../types";
import { EMOTION_INSTRUCT } from "../emotion";
import { emotionToneFreq, generateToneWav } from "../wav";
import { normalizeBaseUrl } from "./llm";
import { fetchWithProxy } from "./net";

export interface CreateVoiceInput {
  config: TtsConfig;
  /** base64（无 data: 前缀） */
  audioBase64?: string;
  mime: string;
  text?: string;
  mode: "reading" | "clip";
  /** 多段参考（SiliconFlow 一次上传多段合并为同一个声纹）；传了则忽略单段 audioBase64 */
  segments?: { audioBase64: string; mime: string; text?: string }[];
}

export interface CreatedVoice {
  voiceId: string;
  model?: string;
  emotionControl: string[];
}

export interface SynthesizeInput {
  config: TtsConfig;
  voiceId: string;
  text: string;
  emotion?: Emotion;
  speed?: number;
}

export interface SynthesizedAudio {
  audioBase64: string;
  mimeType: string;
}

export interface TtsProvider {
  id: TtsProviderId;
  label: string;
  /** 是否支持通过上传音频 API 创建声纹 */
  supportsClone: boolean;
  emotionControl: string[];
  createVoice?(input: CreateVoiceInput): Promise<CreatedVoice>;
  synthesize(input: SynthesizeInput): Promise<SynthesizedAudio>;
}

function b64ToBuffer(b64: string): Buffer {
  return Buffer.from(b64.replace(/^data:[^;]+;base64,/, ""), "base64");
}

function bufToB64(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf).toString("base64");
}

export function blobFromB64(b64: string, mime: string): Blob {
  const buf = b64ToBuffer(b64);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  return new Blob([ab], { type: mime || "audio/wav" });
}

const RETRY_BASE_MS = 300;

/**
 * 平台抖动（5xx / 429）自动重试：每次重建请求体（FormData 流不可复用），
 * 命中 5xx 或限流时按 300ms/600ms/900ms 退避重试，最多重试 3 次。
 */
async function postWithRetry(url: string, buildInit: () => RequestInit, retries = 3): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetchWithProxy(url, buildInit());
    const transient = res.status >= 500 || res.status === 429;
    if (!transient || attempt >= retries) return res;
    await new Promise((r) => setTimeout(r, RETRY_BASE_MS * (attempt + 1)));
  }
}

async function readError(res: Response, tag: string): Promise<string> {
  const t = await res.text().catch(() => "");
  let hint = "";
  if (res.status === 401) hint = "（API Key 无效或已过期，请检查是否有多余空格/换行、是否以 sk- 开头）";
  else if (res.status === 403 && (t.includes("Model disabled") || t.includes("30003")))
    hint = "（模型未开通：请到硅基流动控制台完成实名认证，并在「模型广场」搜索该模型点击开通后重试）";
  else if (res.status === 402 && (t.includes("30001") || t.includes("insufficient")))
    hint = "（余额不足：请到硅基流动控制台「活动中心→认证专享礼」领取实名送的 ¥16 代金券，并在「余额充值」充 ≥0.01 元激活后重试）";
  else if (res.status >= 500) hint = "（服务端临时故障/过载：已自动重试仍失败，请稍后再试）";
  return `${tag} 请求失败 HTTP ${res.status}: ${t.slice(0, 300)}${hint}`;
}

function minimaxEmotion(e?: Emotion): string | undefined {
  if (!e) return undefined;
  const map: Record<string, string> = {
    平静: "neutral",
    开心: "happy",
    悲伤: "sad",
    激动: "excited",
    严肃: "serious",
    温柔: "gentle",
  };
  return map[e] ?? "neutral";
}

const providers: Record<TtsProviderId, TtsProvider> = {
  mock: {
    id: "mock",
    label: "演示模式",
    supportsClone: true,
    emotionControl: ["tone"],
    async createVoice() {
      return { voiceId: `mock-${Math.random().toString(36).slice(2, 10)}`, model: "mock-tone", emotionControl: ["tone"] };
    },
    synthesize(input) {
      const buf = generateToneWav({ freq: emotionToneFreq(input.emotion || "平静") });
      return Promise.resolve({ audioBase64: bufToB64(buf), mimeType: "audio/wav" });
    },
  },

  siliconflow: {
    id: "siliconflow",
    label: "硅基流动（CosyVoice / IndexTTS-2）",
    supportsClone: true,
    emotionControl: ["instruct_text"],
    async createVoice({ config, audioBase64, mime, text, segments }) {
      const parts = segments && segments.length ? segments : audioBase64 ? [{ audioBase64, mime, text }] : [];
      if (!parts.length) throw new Error("缺少参考音频");
      const buildForm = () => {
        const form = new FormData();
        parts.forEach((p, i) => {
          form.append("file", blobFromB64(p.audioBase64, p.mime || "audio/wav"), `reference-${i}.wav`);
          if (p.text) form.append("text", p.text);
        });
        form.append("model", config.model || "FunAudioLLM/CosyVoice2-0.5B");
        form.append("customName", `vss-${Date.now()}`);
        // CosyVoice 要求参考音频必须带 text（否则合成时 50507 500）。没有转录时补占位文本。
        if (!parts.some((p) => p.text)) form.append("text", "参考音频");
        return form;
      };
      const res = await postWithRetry(`${normalizeBaseUrl(config.baseUrl || "https://api.siliconflow.cn/v1")}/uploads/audio/voice`, () => ({
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}` },
        body: buildForm(),
      }));
      if (!res.ok) throw new Error(await readError(res, "SiliconFlow 创建声纹"));
      const json = (await res.json()) as any;
      const voiceId = json?.uri ?? json?.voice_id ?? json?.data?.voice_id ?? json?.id;
      if (!voiceId) throw new Error("SiliconFlow 创建声纹响应缺少 uri");
      return { voiceId, model: config.model || "FunAudioLLM/CosyVoice2-0.5B", emotionControl: ["instruct_text"] };
    },
    async synthesize({ config, voiceId, text, emotion, speed = 1 }) {
      const model = config.model || "FunAudioLLM/CosyVoice2-0.5B";
      // CosyVoice 用 <|endofprompt|> 情感指令；IndexTTS-2 不识别该标记，按文本自然表达即可
      const isCosyVoice = model.includes("CosyVoice");
      const input = isCosyVoice && emotion && emotion !== "平静" ? `${EMOTION_INSTRUCT[emotion]}。<|endofprompt|>${text}` : text;
      const res = await postWithRetry(`${normalizeBaseUrl(config.baseUrl || "https://api.siliconflow.cn/v1")}/audio/speech`, () => ({
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model,
          input,
          voice: voiceId,
          response_format: "mp3",
          speed,
        }),
      }));
      if (!res.ok) throw new Error(await readError(res, "SiliconFlow 合成"));
      const bytes = Buffer.from(await res.arrayBuffer());
      return { audioBase64: bufToB64(bytes), mimeType: "audio/mpeg" };
    },
  },

  fishaudio: {
    id: "fishaudio",
    label: "Fish Audio",
    supportsClone: true,
    emotionControl: ["reference_audio"],
    async createVoice({ config, audioBase64, mime }) {
      const key = config.apiKey?.trim() || "";
      if (!key) throw new Error("Fish Audio 未配置 API key：请在「模型 API」面板填写自己的 Fish Audio key");
      if (!audioBase64) throw new Error("缺少参考音频");
      const buildForm = () => {
        const form = new FormData();
        form.append("type", "tts");
        form.append("title", `vss-${Date.now()}`);
        form.append("train_mode", "fast");
        form.append("visibility", "private");
        form.append("voices", blobFromB64(audioBase64, mime), "reference.wav");
        return form;
      };
      const res = await postWithRetry(`${normalizeBaseUrl(config.baseUrl || "https://api.fish.audio")}/model`, () => ({
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: buildForm(),
      }));
      if (!res.ok) throw new Error(await readError(res, "Fish Audio 创建声纹"));
      const json = (await res.json()) as any;
      const voiceId = json?._id ?? json?.voice_id ?? json?.data?.voice_id ?? json?.id;
      if (!voiceId) throw new Error("Fish Audio 创建声纹响应缺少 _id/voice_id");
      return { voiceId, model: config.model || "s2.1-pro-free", emotionControl: ["reference_audio"] };
    },
    async synthesize({ config, voiceId, text }) {
      const key = config.apiKey?.trim() || "";
      if (!key) throw new Error("Fish Audio 未配置 API key：请在「模型 API」面板填写自己的 Fish Audio key");
      const res = await postWithRetry(`${normalizeBaseUrl(config.baseUrl || "https://api.fish.audio")}/v1/tts`, () => ({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          model: config.model || "s2.1-pro-free",
        },
        body: JSON.stringify({ text, reference_id: voiceId, format: "mp3", chunk_length: 200 }),
      }));
      if (!res.ok) throw new Error(await readError(res, "Fish Audio 合成"));
      const bytes = Buffer.from(await res.arrayBuffer());
      return { audioBase64: bufToB64(bytes), mimeType: "audio/mpeg" };
    },
  },

  minimax: {
    id: "minimax",
    label: "MiniMax",
    // MiniMax 的声纹克隆需在控制台“声音复刻”，API 不直接支持上传创建，因此走“已有 voice_id”
    supportsClone: false,
    emotionControl: ["emotion_param"],
    synthesize: async ({ config, voiceId, text, emotion, speed = 1 }) => {
      const base = normalizeBaseUrl(config.baseUrl || "https://api.minimax.chat/v1");
      const res = await fetchWithProxy(`${base}/t2a_v2`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.model || "speech-02-hd",
          text,
          stream: false,
          voice_setting: { voice_id: voiceId, speed },
          audio_setting: {
            sample_rate: 32000,
            bitrate: 128000,
            format: "mp3",
            ...(emotion ? { emotion: minimaxEmotion(emotion) } : {}),
          },
        }),
      });
      if (!res.ok) throw new Error(await readError(res, "MiniMax 合成"));
      const json = (await res.json()) as any;
      const audio = json?.data?.audio;
      if (!audio) throw new Error(`MiniMax 合成响应缺少音频: ${JSON.stringify(json).slice(0, 200)}`);
      // MiniMax 返回 base64
      return { audioBase64: String(audio), mimeType: "audio/mpeg" };
    },
  },

  openai: {
    id: "openai",
    label: "OpenAI TTS",
    supportsClone: false,
    emotionControl: ["none"],
    synthesize: async ({ config, voiceId, text, speed = 1 }) => {
      const res = await fetchWithProxy(`${normalizeBaseUrl(config.baseUrl || "https://api.openai.com/v1")}/audio/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ model: config.model || "tts-1", input: text, voice: voiceId, response_format: "mp3", speed }),
      });
      if (!res.ok) throw new Error(await readError(res, "OpenAI 合成"));
      const bytes = Buffer.from(await res.arrayBuffer());
      return { audioBase64: bufToB64(bytes), mimeType: "audio/mpeg" };
    },
  },
};

export function getTtsProvider(id: TtsProviderId): TtsProvider {
  const p = providers[id];
  if (!p) throw new Error(`不支持的 TTS provider: ${id}`);
  return p;
}

export async function createVoice(input: CreateVoiceInput): Promise<CreatedVoice> {
  const p = getTtsProvider(input.config.provider);
  if (!p.supportsClone || !p.createVoice) {
    throw new Error(`${p.label} 不支持通过上传音频创建声纹，请在对应控制台创建后填入 voice_id`);
  }
  return p.createVoice(input);
}

export async function synthesize(input: SynthesizeInput): Promise<SynthesizedAudio> {
  return getTtsProvider(input.config.provider).synthesize(input);
}

export const TTS_PROVIDERS = providers;
