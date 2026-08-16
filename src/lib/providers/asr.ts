// SiliconFlow SenseVoiceSmall 语音转文字（免费档）：
// 为参考音频生成真实转录，让 CosyVoice 对齐更准、克隆不因占位文本而失真/过拟合。
import { fetchWithProxy } from "./net";
import { normalizeBaseUrl } from "./llm";
import { blobFromB64 } from "./tts";

export interface TranscribeInput {
  baseUrl?: string;
  apiKey: string;
  audioBase64: string;
  mime?: string;
  model?: string;
}

export async function transcribeAudio(input: TranscribeInput): Promise<string> {
  const buildForm = () => {
    const form = new FormData();
    form.append("file", blobFromB64(input.audioBase64, input.mime || "audio/wav"), "ref.wav");
    form.append("model", input.model || "FunAudioLLM/SenseVoiceSmall");
    return form;
  };
  let res: Response | undefined;
  for (let attempt = 0; ; attempt++) {
    res = await fetchWithProxy(
      `${normalizeBaseUrl(input.baseUrl || "https://api.siliconflow.cn/v1")}/audio/transcriptions`,
      { method: "POST", headers: { Authorization: `Bearer ${input.apiKey}` }, body: buildForm() },
    );
    const transient = res.status >= 500 || res.status === 429;
    if (!transient || attempt >= 2) break;
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  if (!res!.ok) throw new Error(`转写失败 HTTP ${res!.status}: ${(await res!.text()).slice(0, 200)}`);
  const json = (await res!.json()) as any;
  const text = typeof json?.text === "string" ? json.text.trim() : "";
  if (!text) throw new Error("转写结果为空，请检查参考音频是否含清晰人声");
  return text;
}
