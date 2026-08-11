// 把整段音频按选中片段切出来合并成参考音频（浏览器端，24k mono wav）
import { encodeWavPcm } from "./denoise-client";

export interface Slice { start: number; end: number; }

export async function mergeSegments(blob: Blob, segments: Slice[]): Promise<Blob> {
  const ctx = new AudioContext({ sampleRate: 24000 });
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const dur = decoded.duration;
    const sr = 24000;

    // 先用 OfflineAudioContext 重采样到 24k
    const offCtx = new OfflineAudioContext(1, Math.max(1, Math.floor(dur * sr)), sr);
    const srcNode = offCtx.createBufferSource();
    srcNode.buffer = decoded;
    srcNode.connect(offCtx.destination);
    srcNode.start(0);
    const rendered = await offCtx.startRendering();
    const data = rendered.getChannelData(0);

    // 切片并拼接
    let totalLen = 0;
    const cuts: { from: number; len: number }[] = [];
    for (const s of segments) {
      const a = Math.max(0, Math.min(dur, s.start));
      const b = Math.max(a + 0.05, Math.min(dur, s.end));
      const from = Math.floor(a * sr);
      const len = Math.floor((b - a) * sr);
      if (len > 0) { cuts.push({ from, len }); totalLen += len; }
    }
    if (totalLen < sr * 0.5) throw new Error("选中的片段太短（合计需 ≥0.5s）");

    const out = new Float32Array(totalLen);
    let off = 0;
    for (const c of cuts) {
      for (let i = 0; i < c.len; i++) out[off++] = data[c.from + i] ?? 0;
    }
    const outBuf = offCtx.createBuffer(1, totalLen, sr);
    outBuf.copyToChannel(out, 0);
    return encodeWavPcm(outBuf);
  } finally {
    ctx.close().catch(() => {});
  }
}

/** 把多个来源的选中片段合并成一个参考音频（浏览器端，24k mono wav） */
export async function mergeSegmentsMulti(sources: { blob: Blob; segments: Slice[] }[]): Promise<Blob> {
  const ctx = new AudioContext({ sampleRate: 24000 });
  try {
    const sr = 24000;
    const cuts: { data: Float32Array; from: number; len: number }[] = [];
    let totalLen = 0;
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
          totalLen += len;
        }
      }
    }
    if (totalLen < sr * 0.5) throw new Error("选中的片段太短（合计需 ≥0.5s）");
    const out = new Float32Array(totalLen);
    let off = 0;
    for (const c of cuts) {
      for (let i = 0; i < c.len; i++) out[off++] = c.data[c.from + i] ?? 0;
    }
    const outCtx = new OfflineAudioContext(1, totalLen, sr);
    const outBuf = outCtx.createBuffer(1, totalLen, sr);
    outBuf.copyToChannel(out, 0);
    return encodeWavPcm(outBuf);
  } finally {
    ctx.close().catch(() => {});
  }
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