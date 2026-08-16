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

/**
 * 基于短窗 RMS 的语音活动检测：BGM/连续声音没有可检测静音时，
 * 用「响度明显高于背景」来切出说话片段，而不是按固定时长一刀切。
 */
export function buildEnergySegments(
  pcm: Buffer,
  opts: {
    sampleRate: number;
    channels: number;
    bitsPerSample?: number;
    windowMs?: number;
    floorPct?: number;
    boost?: number;
    minSpeech?: number;
    mergeGap?: number;
    maxSec?: number;
  },
): SpeechSegment[] {
  const {
    sampleRate,
    channels,
    bitsPerSample = 16,
    windowMs = 200,
    floorPct = 0.15,
    boost = 1.6,
    minSpeech = 1.0,
    mergeGap = 0.8,
    maxSec = MAX_SEGMENT_SEC,
  } = opts;
  const bytesPerSample = bitsPerSample / 8;
  const step = Math.max(1, Math.floor(channels * bytesPerSample));
  const frameBytes = Math.max(step, Math.floor(sampleRate * channels * bytesPerSample * (windowMs / 1000)));

  // 1) 逐窗计算 RMS
  const rms: number[] = [];
  for (let off = 0; off + step <= pcm.length; off += frameBytes) {
    let sum = 0;
    let n = 0;
    const end = Math.min(pcm.length, off + frameBytes);
    for (let i = off; i + bytesPerSample <= end; i += step) {
      const s = pcm.readInt16LE(i) / 32768;
      sum += s * s;
      n++;
    }
    rms.push(n > 0 ? Math.sqrt(sum / n) : 0);
  }
  if (rms.length === 0) return [];

  // 2) 以低分位 RMS 作为背景底噪，阈值 = max(底噪*boost, 绝对下限)
  const sorted = [...rms].sort((a, b) => a - b);
  const floor = sorted[Math.min(sorted.length - 1, Math.floor(rms.length * floorPct))] ?? 0;
  const threshold = Math.max(floor * boost, 0.004);

  // 3) 标记活跃窗 → 分组为语音段
  const windowSec = windowMs / 1000;
  const segs: SpeechSegment[] = [];
  let start = -1;
  for (let i = 0; i < rms.length; i++) {
    const t = i * windowSec;
    if (rms[i] > threshold) {
      if (start < 0) start = t;
    } else if (start >= 0) {
      if (t - start >= minSpeech) segs.push({ start, end: t });
      start = -1;
    }
  }
  if (start >= 0 && rms.length * windowSec - start >= minSpeech) {
    segs.push({ start, end: rms.length * windowSec });
  }

  // 4) 合并过近、切分超长
  const merged: SpeechSegment[] = [];
  for (const seg of segs) {
    const last = merged[merged.length - 1];
    if (last && seg.start - last.end < mergeGap) last.end = Math.max(last.end, seg.end);
    else merged.push({ ...seg });
  }
  const capped: SpeechSegment[] = [];
  for (const seg of merged) {
    let s0 = seg.start;
    while (seg.end - s0 > maxSec) {
      capped.push({ start: s0, end: s0 + maxSec });
      s0 += maxSec;
    }
    if (seg.end - s0 > 0.001) capped.push({ start: s0, end: seg.end });
  }
  // 响度没有起伏（如纯 BGM 全程均匀）时切不出段：退回均匀分块，保证有可选的短片段
  if (capped.length === 0) {
    const total = rms.length * windowSec;
    return total > 0 ? buildSpeechSegments([], total) : [];
  }
  return capped;
}

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
    const segments = await detectSegments(tmpFile, wav, durationSec);
    return { wav, durationSec, segments };
  } finally {
    try { rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
  }
}

async function detectSegments(filePath: string, wav: Buffer, durationSec: number): Promise<SpeechSegment[]> {
  try {
    // 阈值放宽到 -40dB / 0.4s：更容易在 BGM 间隙切出片段
    const stderr = await runFfmpegStderr(["-i", filePath, "-vn", "-af", "silencedetect=noise=-40dB:d=0.4", "-f", "null", "-"], Buffer.alloc(0));
    const silences = parseSilenceDetectOutput(stderr);
    if (silences.length === 0 && durationSec > 0) {
      // 找不到静音（BGM/连续讲话）：按响度差切出说话片段，避免固定 30s 一刀切
      const info = parseWav(wav);
      if (info) return buildEnergySegments(wav, { sampleRate: info.sampleRate, channels: info.channels, bitsPerSample: info.bitsPerSample });
      return buildSpeechSegments([], durationSec);
    }
    return buildSpeechSegments(silences, durationSec);
  } catch {
    const info = parseWav(wav);
    if (durationSec > 0) {
      if (info) return buildEnergySegments(wav, { sampleRate: info.sampleRate, channels: info.channels, bitsPerSample: info.bitsPerSample });
      return buildSpeechSegments([], durationSec);
    }
    return [];
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
