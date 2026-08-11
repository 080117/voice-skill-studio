// 情感预设与 LLM 情感标注（M2）
import type { Emotion, LlmConfig } from "./types";
import { EMOTIONS } from "./types";
import { chatCompletion } from "./providers/llm";

export const EMOTION_DESCRIPTIONS: Record<Emotion, string> = {
  平静: "平稳、客观、不带强烈情绪",
  开心: "轻快、上扬、带笑意",
  悲伤: "低沉、缓慢、带失落",
  激动: "高亢、急促、充满能量",
  严肃: "郑重、沉稳、有分量",
  温柔: "柔和、亲切、放轻放缓",
};

/** CosyVoice instruct / 提示词里可用的情感指令短语 */
export const EMOTION_INSTRUCT: Record<Emotion, string> = {
  平静: "用平静客观的语气",
  开心: "用开心轻快的语气，带一点笑意",
  悲伤: "用悲伤低沉的语气，放慢语速",
  激动: "用激动高亢的语气，加快语速、加强重音",
  严肃: "用严肃郑重的语气，沉稳有力",
  温柔: "用温柔亲切的语气，放轻放缓",
};

export interface EmotionTag {
  emotion: Emotion;
  intensity: number; // 0..1
  style: string;
  reason: string;
}

const TAG_SYSTEM_PROMPT = `你是语音情感标注器。给定一段文本，判断最适合的说话情感，输出严格 JSON：
{"emotion":"平静|开心|悲伤|激动|严肃|温柔","intensity":0-1,"style":"一句风格描述","reason":"一句话理由"}
只输出 JSON，不要其他内容。`;

/** 调用 LLM 标注情感；失败时回退到“平静” */
export async function tagEmotionWithLLM(llm: LlmConfig, text: string): Promise<EmotionTag> {
  const fallback: EmotionTag = { emotion: "平静", intensity: 0.5, style: EMOTION_DESCRIPTIONS.平静, reason: "LLM 标注失败，回退默认" };
  const trimmed = (text || "").trim();
  if (!trimmed) return fallback;
  try {
    const raw = await chatCompletion({
      ...llm,
      messages: [
        { role: "system", content: TAG_SYSTEM_PROMPT },
        { role: "user", content: trimmed.slice(0, 2000) },
      ],
      temperature: 0.2,
    });
    const parsed = parseEmotionJson(raw);
    if (!parsed) return fallback;
    const emotion: Emotion = (EMOTIONS as string[]).includes(parsed.emotion as string) ? (parsed.emotion as Emotion) : "平静";
    return {
      emotion,
      intensity: clamp01(Number(parsed.intensity) || 0.5),
      style: parsed.style || EMOTION_DESCRIPTIONS[emotion],
      reason: parsed.reason || "",
    };
  } catch {
    return fallback;
  }
}

export function parseEmotionJson(raw: string): Partial<EmotionTag> | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
