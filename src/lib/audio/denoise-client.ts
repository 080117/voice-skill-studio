// 浏览器端去噪：WebAudio 解码 → 高通滤波 + 压缩（轻降噪）→ 重编码 WAV（16bit PCM 24kHz mono）
// 供无 ffmpeg 的环境（如 Vercel 前端）与离线场景使用。

export function encodeWavPcm(audioBuffer: AudioBuffer): Blob {
  const numChannels = 1;
  const sampleRate = 24000;
  const samples = new Float32Array(audioBuffer.length);
  // 混合到单声道
  for (let i = 0; i < audioBuffer.length; i++) {
    let s = 0;
    for (let c = 0; c < audioBuffer.numberOfChannels; c++) s += audioBuffer.getChannelData(c)[i];
    samples[i] = s / audioBuffer.numberOfChannels;
  }
  const dataSize = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Blob([buf], { type: "audio/wav" });
}

export async function denoiseClient(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext({ sampleRate: 24000 });
  try {
    const arrayBuf = await blob.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuf);
    const duration = Math.min(decoded.duration, 120); // 上限 120s
    const length = Math.floor(24000 * duration);
    const offCtx = new OfflineAudioContext(1, length, 24000);
    const src = offCtx.createBufferSource();
    src.buffer = decoded;
    const hp = offCtx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 80;
    const comp = offCtx.createDynamicsCompressor();
    comp.threshold.value = -40;
    comp.knee.value = 20;
    comp.ratio.value = 3;
    comp.attack.value = 0.005;
    comp.release.value = 0.15;
    src.connect(hp).connect(comp).connect(offCtx.destination);
    src.start(0);
    const rendered = await offCtx.startRendering();
    return encodeWavPcm(rendered);
  } finally {
    ctx.close().catch(() => {});
  }
}


export interface AudioAnalysis {
  durationSec: number;
  rms: number;
  sampleRate: number;
  /** |x| 低 10% 分位：底噪/背景音估计 */
  p10: number;
  /** 最大幅度 */
  maxRms: number;
  /** 削波比例（|x|>0.99 的采样占比） */
  clippedRatio: number;
}

/** Decode & analyze audio: duration / RMS / 底噪 / 削波 */
export async function analyzeBlob(blob: Blob): Promise<AudioAnalysis | null> {
  const ctx = new AudioContext({ sampleRate: 24000 });
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const ch = decoded.getChannelData(0);
    const step = Math.max(1, Math.floor(ch.length / 200_000));
    let sum = 0;
    let count = 0;
    let clipped = 0;
    const abs: number[] = [];
    for (let i = 0; i < ch.length; i += step) {
      sum += ch[i] * ch[i];
      count++;
      const v = Math.abs(ch[i]);
      abs.push(v);
      if (v > 0.99) clipped++;
    }
    abs.sort((a, b) => a - b);
    return {
      durationSec: decoded.duration,
      rms: count > 0 ? Math.sqrt(sum / count) : 0,
      sampleRate: decoded.sampleRate,
      p10: abs[Math.min(abs.length - 1, Math.floor(abs.length * 0.1))] ?? 0,
      maxRms: abs[abs.length - 1] ?? 0,
      clippedRatio: count > 0 ? clipped / count : 0,
    };
  } catch {
    return null;
  } finally {
    ctx.close().catch(() => {});
  }
}

/** 截取音频前 maxSec 秒（24k mono wav），用于控制参考音频长度，避免服务端超时（HTTP 524） */
export async function truncateAudio(blob: Blob, maxSec: number): Promise<Blob> {
  const ctx = new AudioContext({ sampleRate: 24000 });
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const length = Math.max(1, Math.min(decoded.length, Math.floor(24000 * maxSec)));
    const offCtx = new OfflineAudioContext(1, length, 24000);
    const src = offCtx.createBufferSource();
    src.buffer = decoded;
    src.connect(offCtx.destination);
    src.start(0);
    const rendered = await offCtx.startRendering();
    return encodeWavPcm(rendered);
  } finally {
    ctx.close().catch(() => {});
  }
}
