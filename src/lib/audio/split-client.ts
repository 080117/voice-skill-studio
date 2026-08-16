// 浏览器端长音频分段（SiliconFlow 多段参考拟合用）：
// 短窗 RMS 找说话片段（与服务端 buildEnergySegments 同思路），每段 ≤ maxSec，
// 全部切出来作为多段参考上传 → 合并为同一个声纹。
import { encodeWavPcm } from "./denoise-client";

export interface Slice {
  start: number;
  end: number;
}

export interface SplitOptions {
  windowMs?: number;
  floorPct?: number;
  boost?: number;
  minSpeech?: number;
  mergeGap?: number;
  maxSegments?: number;
}

async function decodeOnce(blob: Blob): Promise<AudioBuffer> {
  const ctx = new AudioContext();
  try {
    return await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    ctx.close().catch(() => {});
  }
}

/** 短窗 RMS 语音活动检测，返回语音段（秒） */
function vadSegments(
  data: Float32Array,
  sampleRate: number,
  opts: { windowMs?: number; floorPct?: number; boost?: number; minSpeech?: number; mergeGap?: number } = {},
): Slice[] {
  const { windowMs = 200, floorPct = 0.15, boost = 1.6, minSpeech = 1.0, mergeGap = 0.8 } = opts;
  const windowLen = Math.max(1, Math.floor((sampleRate * windowMs) / 1000));
  const rms: number[] = [];
  for (let off = 0; off < data.length; off += windowLen) {
    let sum = 0;
    let n = 0;
    const end = Math.min(data.length, off + windowLen);
    for (let i = off; i < end; i++) {
      sum += data[i] * data[i];
      n++;
    }
    rms.push(n > 0 ? Math.sqrt(sum / n) : 0);
  }
  if (rms.length === 0) return [];
  const sorted = [...rms].sort((a, b) => a - b);
  const floor = sorted[Math.min(rms.length - 1, Math.floor(rms.length * floorPct))] ?? 0;
  const threshold = Math.max(floor * boost, 0.004);
  const windowSec = windowMs / 1000;
  const segs: Slice[] = [];
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
  if (start >= 0 && rms.length * windowSec - start >= minSpeech) segs.push({ start, end: rms.length * windowSec });
  const merged: Slice[] = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && s.start - last.end < mergeGap) last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  }
  return merged;
}

/** 把一段音频渲染成 ≤maxSec 的 24k mono wav Blob（从 startSec 开始） */
async function renderRange(decoded: AudioBuffer, startSec: number, endSec: number, maxSec: number): Promise<Blob> {
  const sr = 24000;
  const a = Math.max(0, startSec);
  const b = Math.min(decoded.duration, endSec);
  const dur = Math.max(0, Math.min(b - a, maxSec));
  const length = Math.max(1, Math.floor(dur * sr));
  const offCtx = new OfflineAudioContext(1, length, sr);
  const src = offCtx.createBufferSource();
  src.buffer = decoded;
  src.connect(offCtx.destination);
  src.start(0, a);
  const rendered = await offCtx.startRendering();
  return encodeWavPcm(rendered);
}

/** 按指定 [start,end] 列表把音频切成多个 ≤maxSec 的 wav Blob */
export async function sliceAudioSegments(blob: Blob, slices: Slice[], maxSec: number): Promise<Blob[]> {
  const decoded = await decodeOnce(blob);
  const out: Blob[] = [];
  for (const s of slices) {
    if (s.end - s.start < 0.3) continue;
    out.push(await renderRange(decoded, s.start, s.end, maxSec));
  }
  return out;
}

/** 长音频自动分段：VAD 找说话片段；找不到则均匀分块；每段 ≤ maxSec，最多 maxSegments 段 */
export async function splitAudioBlob(blob: Blob, maxSec: number, opts: SplitOptions = {}): Promise<Blob[]> {
  const { maxSegments = 10, ...vadOpts } = opts;
  const decoded = await decodeOnce(blob);
  const data = decoded.getChannelData(0);
  const sr = decoded.sampleRate;
  let segs = vadSegments(data, sr, vadOpts);
  if (!segs.length) {
    // 纯 BGM / 均匀响度：均匀分块兜底
    segs = [];
    const total = decoded.duration;
    for (let t = 0; t < total; t += maxSec) segs.push({ start: t, end: Math.min(total, t + maxSec) });
  }
  // 每段 ≤ maxSec
  const capped: Slice[] = [];
  for (const s of segs) {
    let a = s.start;
    while (s.end - a > maxSec) {
      capped.push({ start: a, end: a + maxSec });
      a += maxSec;
    }
    if (s.end - a > 0.3) capped.push({ start: a, end: s.end });
  }
  const chosen = capped.slice(0, maxSegments);
  const out: Blob[] = [];
  for (const s of chosen) {
    if (s.end - s.start < 0.3) continue;
    out.push(await renderRange(decoded, s.start, s.end, maxSec));
  }
  return out;
}
