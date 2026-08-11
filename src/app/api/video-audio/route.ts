import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { extractVideoAudio, downloadWithYtDlp, hasYtDlp } from "@/lib/audio/video";
import { fetchWithProxy, getProxyUrl } from "@/lib/providers/net";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 200 * 1024 * 1024;
const MAX_URLS = 8;
const schema = z.object({ urls: z.array(z.string().url().max(2048)).min(1).max(MAX_URLS) });

/** 直链下载的内容是否像可解码的音频/视频（用魔数快速判断，避免把网页 HTML 喂给 ffmpeg） */
function looksLikeMedia(buf: Buffer): boolean {
  if (!buf || buf.length < 12) return false;
  const h = buf.subarray(0, 12);
  // mp4 / m4a / mov：offset 4 处为 "ftyp"
  if (h.toString("latin1", 4, 8) === "ftyp") return true;
  // webm / mkv：1A 45 DF A3
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return true;
  // mp3：ID3 标签或 0xFF Ex 帧头
  if (h.toString("latin1", 0, 3) === "ID3") return true;
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true;
  // wav：RIFF....WAVE
  if (h.toString("latin1", 0, 4) === "RIFF" && h.toString("latin1", 8, 12) === "WAVE") return true;
  // flac / ogg
  if (h.toString("latin1", 0, 4) === "fLaC") return true;
  if (h.toString("latin1", 0, 4) === "OggS") return true;
  return false;
}

async function downloadUrl(url: string): Promise<Buffer> {
  const res = await fetchWithProxy(url, {
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

function okResult(url: string, source: string, wav: Buffer, durationSec: number, segments: unknown[]): Record<string, unknown> {
  return { url, ok: true, audioBase64: wav.toString("base64"), mime: "audio/wav", durationSec, segments, source };
}

async function processUrl(url: string): Promise<Record<string, unknown>> {
  try {
    let raw: Buffer | null = null;
    let source = "direct";
    let directErr: Error | null = null;

    // 1) 尝试直链下载；内容不是可识别媒体时视为失败
    try {
      const candidate = await downloadUrl(url);
      if (looksLikeMedia(candidate)) {
        raw = candidate;
      } else {
        directErr = new Error("直链内容不是可识别的音频/视频（可能是网页，已切换解析器）");
      }
    } catch (err) {
      directErr = err as Error;
    }

    // 2) 直链失败 → yt-dlp
    if (!raw) {
      if (!(await hasYtDlp())) {
        throw new Error(`${directErr?.message ?? "下载失败"}（如为 YouTube/B 站链接，请先安装 yt-dlp）`);
      }
      try {
        raw = await downloadWithYtDlp(url, MAX_BYTES, getProxyUrl());
        source = "yt-dlp";
      } catch (ytErr) {
        throw new Error(`${directErr?.message ?? "下载失败"}（yt-dlp 也失败：${(ytErr as Error).message}）`);
      }
    }

    // 3) 直链下载成功但 ffmpeg 解析失败 → 再用 yt-dlp 重试一次
    try {
      const { wav, durationSec, segments } = await extractVideoAudio(raw);
      if (durationSec <= 0) throw new Error("无法从视频中解析出音频，请确认链接可直接访问");
      return okResult(url, source, wav, durationSec, segments);
    } catch (extractErr) {
      if (source === "direct" && (await hasYtDlp())) {
        const ytRaw = await downloadWithYtDlp(url, MAX_BYTES, getProxyUrl());
        const { wav, durationSec, segments } = await extractVideoAudio(ytRaw);
        if (durationSec <= 0) throw new Error("无法从视频中解析出音频");
        return okResult(url, "yt-dlp", wav, durationSec, segments);
      }
      throw extractErr;
    }
  } catch (err) {
    return { url, ok: false, error: (err as Error).message };
  }
}

/** 并发上限 limit 的 map */
async function mapLimit(
  items: string[],
  limit: number,
  fn: (item: string) => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown>[]> {
  const results = new Array<Record<string, unknown>>(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "urls 必须是 1-8 个合法的 http(s) 链接" }, { status: 400 });
    const { urls } = parsed.data;
    const results = await mapLimit(urls, 2, processUrl);
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
