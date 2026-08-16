import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { transcribeAudio } from "@/lib/providers/asr";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  audioBase64: z.string().min(1),
  mime: z.string().default("audio/wav"),
  tts: z.object({
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
    const { audioBase64, mime, tts } = parsed.data;
    if (audioBase64.length > 8_000_000) {
      return NextResponse.json({ error: "音频过大（转写单段上限约 6MB）" }, { status: 413 });
    }
    const text = await transcribeAudio({ baseUrl: tts.baseUrl, apiKey: tts.apiKey, audioBase64, mime });
    return NextResponse.json({ text });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
