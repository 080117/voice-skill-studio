import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { synthesize } from "@/lib/providers/tts";
import { tagEmotionWithLLM } from "@/lib/emotion";
import { fetchWithProxy } from "@/lib/providers/net";
import type { Emotion, TtsProviderId } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  text: z.string().min(1).max(2000),
  voice: z.object({
    providerVoiceId: z.string().min(1),
    provider: z.enum(["siliconflow", "fishaudio", "minimax", "openai", "mock"]),
  }),
  tts: z.object({
    provider: z.enum(["siliconflow", "fishaudio", "minimax", "openai", "mock"]),
    apiKey: z.string(),
    baseUrl: z.string().optional(),
    model: z.string().optional(),
  }),
  llm: z
    .object({ baseUrl: z.string(), apiKey: z.string(), model: z.string() })
    .nullable()
    .optional(),
  emotion: z.enum(["平静", "开心", "悲伤", "激动", "严肃", "温柔"]).optional(),
  autoEmotion: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: `参数错误: ${parsed.error.issues.map((i) => i.message).join("; ")}` }, { status: 400 });
    }
    const { text, voice, tts, llm, emotion, autoEmotion } = parsed.data;

    let finalEmotion: Emotion = emotion ?? "平静";
    if (autoEmotion && llm) {
      const tag = await tagEmotionWithLLM(llm, text, fetchWithProxy);
      finalEmotion = tag.emotion;
    }

    const out = await synthesize({
      config: tts,
      voiceId: voice.providerVoiceId,
      text,
      emotion: finalEmotion,
      speed: 1,
    });
    return NextResponse.json({
      audioBase64: out.audioBase64,
      mimeType: out.mimeType,
      emotion: finalEmotion,
      provider: tts.provider as TtsProviderId,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
