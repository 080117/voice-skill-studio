import { NextRequest, NextResponse } from "next/server";
import { denoiseAudio } from "@/lib/audio/denoise";
import type { DenoiseStrength } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "缺少 file 字段" }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length === 0) return NextResponse.json({ error: "空音频" }, { status: 400 });
    if (buf.length > MAX_BYTES) return NextResponse.json({ error: "音频过大（上限 25MB）" }, { status: 413 });

    const strength = (String(form.get("strength") || "standard")) as DenoiseStrength;
    const { buffer, mime, usedFfmpeg } = await denoiseAudio(buf, file.type || "audio/wav", strength);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "X-Used-Ffmpeg": usedFfmpeg ? "1" : "0",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: `去噪失败: ${(err as Error).message}` }, { status: 500 });
  }
}
