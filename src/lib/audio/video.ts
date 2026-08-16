// 视频链接处理：下载 → ffmpeg 抽音频 → silencedetect 语音分段
import { spawn } from "child_process";
import { randomUUID } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseWav } from "../wav";

export interface SpeechSegment {
  start: number;
  end: number;
}

export interface Silence {
  start: number;
  end: number;
}

/** 单段语音上限（秒）：超过则均分，避免 BGM/连续讲话时出现整段超长片段，方便挑选参考音频 */
export const MAX_SEGMENT_SEC = 30;

/** 解析 ffmpeg silencedetect 输出（stderr），返回静音段 */
export function parseSilenceDetectOutput(text: string): Silence[] {
  const silences: Silence[] = [];
  const startRe = /silence_start:\s*([0-9.]+)/g;
  const endRe = /silence_end:\s*([0-9.]+)/g;
  const starts: number[] = [];
  const ends: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = startRe.exec(text)) !== null) starts.push(parseFloat(m[1]));
  while ((m = endRe.exec(text)) !== null) ends.push(parseFloat(m[1]));
  const n = Math.max(starts.length, ends.length);
  for (let i = 0; i < n; i++) {
    const s = starts[i] ?? ends[i] ?? 0;
    const e = ends[i] ?? starts[i] ?? 0;
    if (e > s) silences.push({ start: s, end: e });
  }
  return silences;
}

/** 由静音段推导语音段（合并 < 0.6s 的间隔，过滤 < 0.8s 的碎片） */
export function buildSpeechSegments(silences: Silence[], totalDuration: number, opts: { minSpeech?: number; mergeGap?: number } = {}): SpeechSegment[] {
  const { minSpeech = 0.8, mergeGap = 0.6 } = opts;
  const segs: SpeechSegment[] = [];
  let cursor = 0;
  for (const s of silences) {
    if (s.start - cursor >= minSpeech) segs.push({ start: cursor, end: s.start });
    cursor = Math.max(cursor, s.end);
  }
  if (totalDuration - cursor >= minSpeech) segs.push({ start: cursor, end: totalDuration });

  // 合并相邻过近的片段
  const merged: SpeechSegment[] = [];
  for (const seg of segs) {
    const last = merged[merged.length - 1];
    if (last && seg.start - last.end < mergeGap) {
      last.end = Math.max(last.end, seg.end);
    } else {
      merged.push({ ...seg });
    }
  }

  // 超长片段切分为 ≤MAX_SEGMENT_SEC 的子段
  const capped: SpeechSegment[] = [];
  for (const seg of merged) {
    let start = seg.start;
    while (seg.end - start > MAX_SEGMENT_SEC) {
      capped.push({ start, end: start + MAX_SEGMENT_SEC });
      start += MAX_SEGMENT_SEC;
    }
    if (seg.end - start > 0.001) capped.push({ start, end: seg.end });
  }
  return capped;
}


export function runFfmpeg(args: string[], input: Buffer, maxOut = 200 * 1024 * 1024, timeoutMs = 300000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let total = 0;
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("ffmpeg 超时")); }, timeoutMs);
    child.stdout.on("data", (c: Buffer) => {
      total += c.length;
      if (total > maxOut) { child.kill("SIGKILL"); reject(new Error("ffmpeg 输出超限")); return; }
      chunks.push(c);
    });
    child.stderr.on("data", (c: Buffer) => errChunks.push(c));
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`ffmpeg exit ${code}: ${Buffer.concat(errChunks).toString().slice(-400)}`));
    });
    child.stdin.write(input);
    child.stdin.end();
  });
}

/**
 * 抽取 24k 单声道 wav + 语音分段
 * 注：先落临时文件再跑 ffmpeg，因为 mp4/mkv 等容器的 moov 可能在文件末尾，管道(stdin) 无法 seek。
 */
export async function extractVideoAudio(input: Buffer): Promise<{ wav: Buffer; durationSec: number; segments: SpeechSegment[] }> {
  const tmpFile = join(tmpdir(), `vss-${Date.now()}-${randomUUID().slice(0, 8)}.in`);
  writeFileSync(tmpFile, input);
  try {
    // 1) 抽取音频
    const wav = await runFfmpeg(["-i", tmpFile, "-vn", "-ar", "24000", "-ac", "1", "-f", "wav", "pipe:1"], Buffer.alloc(0));
    const info = parseWav(wav);
    const durationSec = info?.durationSec ?? 0;

    // 2) silencedetect 找静音 → 语音分段
    const segments = await detectSegments(tmpFile, durationSec);
    return { wav, durationSec, segments };
  } finally {
    try { rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
  }
}

async function detectSegments(filePath: string, durationSec: number): Promise<SpeechSegment[]> {
  try {
    // 阈值放宽到 -40dB / 0.4s：更容易在 BGM 间隙切出片段
    const stderr = await runFfmpegStderr(["-i", filePath, "-vn", "-af", "silencedetect=noise=-40dB:d=0.4", "-f", "null", "-"], Buffer.alloc(0));
    const silences = parseSilenceDetectOutput(stderr);
    if (silences.length === 0 && durationSec > 0) {
      // 找不到静音（BGM/连续讲话）：整段按 ≤MAX_SEGMENT_SEC 均分，保证有可选的短片段
      return buildSpeechSegments([], durationSec);
    }
    return buildSpeechSegments(silences, durationSec);
  } catch {
    return durationSec > 0 ? buildSpeechSegments([], durationSec) : [];
  }
}

function runFfmpegStderr(args: string[], input: Buffer, timeoutMs = 300000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
    const errChunks: Buffer[] = [];
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("ffmpeg 超时")); }, timeoutMs);
    child.stderr.on("data", (c: Buffer) => errChunks.push(c));
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(errChunks).toString("utf8"));
      else reject(new Error(`ffmpeg silencedetect exit ${code}`));
    });
    child.stdin.write(input);
    child.stdin.end();
  });
}

export function hasYtDlp(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("yt-dlp", ["--version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

/** 用 yt-dlp 下载音频（YouTube/B 站等） */
export async function downloadWithYtDlp(url: string, maxBytes = 200 * 1024 * 1024, proxy?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const args = ["-f", "bestaudio/best", "-o", "-", "--no-playlist", "--no-warnings"];
    if (proxy) args.push("--proxy", proxy);
    args.push(url);
    const child = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let total = 0;
    child.stdout.on("data", (c: Buffer) => {
      total += c.length;
      if (total > maxBytes) { child.kill("SIGKILL"); reject(new Error("视频音频超过 200MB 上限")); return; }
      chunks.push(c);
    });
    child.stderr.on("data", (c: Buffer) => errChunks.push(c));
    child.on("error", (e) => reject(new Error(`yt-dlp 不可用: ${e.message}`)));
    child.on("close", (code) => {
      if (code === 0 && total > 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`yt-dlp 下载失败 exit ${code}: ${Buffer.concat(errChunks).toString().slice(0, 300)}`));
    });
  });
}
