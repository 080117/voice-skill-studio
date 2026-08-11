// 把整段音频按选中片段切出来合并成参考音频（浏览器端，24k mono wav）
import { encodeWavPcm } from "./denoise-client";

export interface Slice { start: number; end: number; }

/** 参考音频时长上限（秒）：Fish Audio / SiliconFlow 超长音频会导致服务端处理超时（HTTP 524） */
export const DEFAULT_MAX_REF_SEC = 60;

export interface MergeResult {
  blob: Blob;
  /** 合并后实际时长（秒） */
  totalSec: number;
  /** 是否因超过 maxSec 被截断 */
  capped: boolean;
}

/** 纯函数：按顺序保留 cuts，总样本数不超过 maxLen；超出的最后一个 cut 会被截短。 */
export function capCuts<T extends { len: number }>(cuts: T[], maxLen: number): { kept: T[]; totalLen: number } {
  let totalLen = 0;
  const kept: T[] = [];
  for (const c of cuts) {
    if (totalLen + c.len <= maxLen) {
      kept.push(c);
      totalLen += c.len;
    } else {
      const remain = maxLen - totalLen;
      if (remain > 0) kept.push({ ...c, len: remain });
      totalLen += remain;
      break;
    }
  }
  return { kept, totalLen };
}

async function mergeAll(sources: { blob: Blob; segments: Slice[] }[], maxSec: number): Promise<MergeResult> {
  const ctx = new AudioContext({ sampleRate: 24000 });
  try {
    const sr = 24000;
    const maxLen = Math.max(1, Math.floor(maxSec * sr));
    const cuts: { data: Float32Array; from: number; len: number }[] = [];
    let rawTotalLen = 0;
    for (const src of sources) {
      if (!src.segments.length) continue;
      const decoded = await ctx.decodeAudioData(await src.blob.arrayBuffer());
      const dur = decoded.duration;
      const offCtx = new OfflineAudioContext(1, Math.max(1, Math.floor(dur * sr)), sr);
      const srcNode = offCtx.createBufferSource();
      srcNode.buffer = decoded;
      srcNode.connect(offCtx.destination);
      srcNode.start(0);
      const rendered = await offCtx.startRendering();
      const data = rendered.getChannelData(0);
      for (const s of src.segments) {
        const a = Math.max(0, Math.min(dur, s.start));
        const b = Math.max(a + 0.05, Math.min(dur, s.end));
        const from = Math.floor(a * sr);
        const len = Math.floor((b - a) * sr);
        if (len > 0) {
          cuts.push({ data, from, len });
          rawTotalLen += len;
        }
      }
    }
    const { kept, totalLen } = capCuts(cuts, maxLen);
    if (totalLen < sr * 0.5) throw new Error("选中的片段太短（合计需 ≥0.5s）");
    const out = new Float32Array(totalLen);
    let off = 0;
    for (const c of kept) {
      for (let i = 0; i < c.len; i++) out[off++] = c.data[c.from + i] ?? 0;
    }
    const outCtx = new OfflineAudioContext(1, totalLen, sr);
    const outBuf = outCtx.createBuffer(1, totalLen, sr);
    outBuf.copyToChannel(out, 0);
    return { blob: encodeWavPcm(outBuf), totalSec: totalLen / sr, capped: rawTotalLen > maxLen };
  } finally {
    ctx.close().catch(() => {});
  }
}

export async function mergeSegments(blob: Blob, segments: Slice[], maxSec = DEFAULT_MAX_REF_SEC): Promise<MergeResult> {
  return mergeAll([{ blob, segments }], maxSec);
}

/** 把多个来源的选中片段合并成一个参考音频（浏览器端，24k mono wav） */
export async function mergeSegmentsMulti(
  sources: { blob: Blob; segments: Slice[] }[],
  maxSec = DEFAULT_MAX_REF_SEC,
): Promise<MergeResult> {
  return mergeAll(sources, maxSec);
}

export function formatSeg(s: Slice): string {
  return `${s.start.toFixed(1)}–${s.end.toFixed(1)}s（${(s.end - s.start).toFixed(1)}s）`;
}

/** 推荐疑似主角片段：按时长排序取前 N 个下标 */
export function pickDominantSlices(segments: Slice[], n = 3): number[] {
  return segments
    .map((s, i) => ({ i, dur: s.end - s.start }))
    .sort((a, b) => b.dur - a.dur)
    .slice(0, n)
    .map((x) => x.i)
    .sort((a, b) => a - b);
}
