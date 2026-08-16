import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { chatCompletion } from "@/lib/providers/llm";
import { synthesize } from "@/lib/providers/tts";
import { tagEmotionWithLLM } from "@/lib/emotion";
import { fetchWithProxy } from "@/lib/providers/net";
import type { Emotion } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).min(1).max(20),
  voice: z.object({
    providerVoiceId: z.string().min(1),
    provider: z.enum(["dashscope", "siliconflow", "fishaudio", "minimax", "openai", "mock"]),
  }),
  tts: z.object({
    provider: z.enum(["dashscope", "siliconflow", "fishaudio", "minimax", "openai", "mock"]),
    apiKey: z.string(),
    baseUrl: z.string().optional(),
    model: z.string().optional(),
  }),
  llm: z.object({ baseUrl: z.string(), apiKey: z.string(), model: z.string() }),
  persona: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: `参数错误: ${parsed.error.issues.map((i) => i.message).join("; ")}` }, { status: 400 });
    }
    const { messages, voice, tts, llm, persona } = parsed.data;

    const system = `你是“Voice Skill Studio”里的声音机器人。你正在用 ${persona || "用户的声纹"} 说话。要求：
1. 回复口语化、简短（不超过 80 字），像真人聊天。
2. 根据内容自然流露情感（平静/开心/悲伤/激动/严肃/温柔），语气自然不生硬。
3. 不要提你是 AI 模型，直接以第一人称聊天。`;

    const reply = await chatCompletion({
      baseUrl: llm.baseUrl,
      apiKey: llm.apiKey,
      model: llm.model,
      messages: [
        { role: "system", content: system },
        ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      ],
      temperature: 0.8,
      maxTokens: 200,
    }, fetchWithProxy);

    const tag = await tagEmotionWithLLM(llm, reply, fetchWithProxy);
    const emotion: Emotion = tag.emotion;

    const out = await synthesize({ config: tts, voiceId: voice.providerVoiceId, text: reply, emotion, speed: 1 });
    return NextResponse.json({
      replyText: reply.trim(),
      audioBase64: out.audioBase64,
      mimeType: out.mimeType,
      emotion,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
