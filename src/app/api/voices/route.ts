import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createVoice } from "@/lib/providers/tts";
import { newId } from "@/lib/id";
import type { TtsProviderId } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  audioBase64: z.string().min(1).optional(),
  mime: z.string().default("audio/wav"),
  mode: z.enum(["reading", "clip"]),
  text: z.string().max(2000).optional(),
  segments: z
    .array(
      z.object({
        audioBase64: z.string().min(1),
        mime: z.string().default("audio/wav"),
        text: z.string().max(2000).optional(),
      }),
    )
    .max(12)
    .optional(),
  tts: z.object({
    provider: z.enum(["siliconflow", "fishaudio", "minimax", "openai", "mock"]),
    apiKey: z.string(),
    baseUrl: z.string().optional(),
    model: z.string().optional(),
  }),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: `参数错误: ${parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}` }, { status: 400 });
    }
    const { audioBase64, mime, mode, text, tts, segments } = parsed.data;
    if (!audioBase64 && (!segments || segments.length === 0)) {
      return NextResponse.json({ error: "缺少参考音频（audioBase64 或 segments）" }, { status: 400 });
    }
    const totalLen = (audioBase64?.length ?? 0) + (segments ?? []).reduce((s, x) => s + x.audioBase64.length, 0);
    if (totalLen > 35_000_000) {
      return NextResponse.json({ error: "音频过大（base64 上限约 26MB）" }, { status: 413 });
    }
    const created = await createVoice({ config: tts, audioBase64, mime, text, mode, segments });
    return NextResponse.json({
      id: newId(),
      mode,
      provider: tts.provider as TtsProviderId,
      providerVoiceId: created.voiceId,
      model: created.model ?? tts.model ?? undefined,
      language: "zh",
      emotionControl: created.emotionControl,
      createdAt: Date.now(),
      sourceText: text ?? undefined,
    });
  } catch (err) {
    const msg = (err as Error).message;
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
