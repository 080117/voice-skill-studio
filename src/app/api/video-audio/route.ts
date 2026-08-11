import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { extractVideoAudio, downloadWithYtDlp, hasYtDlp } from "@/lib/audio/video";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 200 * 1024 * 1024;
const schema = z.object({ url: z.string().url().max(2048) });

async function downloadUrl(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(110_000),
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36" },
  });
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_BYTES) throw new Error("视频超过 200MB 上限");
  if (!res.body) return Buffer.from(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => {});
      throw new Error("视频超过 200MB 上限");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "url 必须是合法的 http(s) 链接" }, { status: 400 });
    const { url } = parsed.data;

    let raw: Buffer | null = null;
    let source = "direct";
    try {
      raw = await downloadUrl(url);
    } catch (err) {
      // 直链失败时尝试 yt-dlp（YouTube / B 站等，本机装了才可用）
      const yt = await hasYtDlp();
      if (yt) {
        raw = await downloadWithYtDlp(url);
        source = "yt-dlp";
      } else {
        throw new Error(`${(err as Error).message}（如为 YouTube/B 站链接，请先安装 yt-dlp）`);
      }
    }
    if (!raw || raw.length === 0) throw new Error("未能获取视频内容");

    const { wav, durationSec, segments } = await extractVideoAudio(raw);
    if (durationSec <= 0) throw new Error("未能从视频中解析出音频，请确认链接可直接访问");

    return NextResponse.json({
      audioBase64: wav.toString("base64"),
      mime: "audio/wav",
      durationSec,
      segments,
      source,
      sourceUrl: url,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}