// WAV 工具：生成测试音、解析 WAV 做基础质量检测

export interface WavInfo {
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataBytes: number;
  durationSec: number;
  /** 16-bit PCM 的 RMS（0..1），用于底噪估计 */
  rms: number;
}

export function parseWav(buf: Buffer): WavInfo | null {
  if (buf.length < 44) return null;
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") return null;
  let offset = 12;
  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataSize = 0;
  // 逐个 chunk 扫描，兼容 ffmpeg 输出的 LIST/INFO 等额外元数据头
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const payload = offset + 8;
    if (id === "fmt " && size >= 16) {
      audioFormat = buf.readUInt16LE(payload);
      channels = buf.readUInt16LE(payload + 2);
      sampleRate = buf.readUInt32LE(payload + 4);
      bitsPerSample = buf.readUInt16LE(payload + 14);
    } else if (id === "data") {
      dataOffset = payload;
      dataSize = size;
      break;
    }
    offset = payload + size + (size % 2); // chunk 按 2 字节对齐
    if (offset <= payload) break; // 防止畸形头死循环
  }
  if (dataOffset < 0 || audioFormat !== 1 || sampleRate <= 0 || channels <= 0) return null;
  // 流式 WAV（ffmpeg 输出到管道等不可 seek 目标时）data 大小写为 0xFFFFFFFF 占位，用实际剩余字节数
  if (dataSize === 0xffffffff || dataOffset + dataSize > buf.length) dataSize = buf.length - dataOffset;
  if (dataSize <= 0) return null;
  const durationSec = sampleRate > 0 ? dataSize / (sampleRate * channels * (bitsPerSample / 8)) : 0;
  let sum = 0;
  let count = 0;
  if (bitsPerSample === 16 && dataOffset + dataSize <= buf.length) {
    const step = Math.max(1, Math.floor(dataSize / 200_000)); // 采样以控制耗时
    for (let i = dataOffset; i < dataOffset + dataSize; i += 2 * step) {
      const s = buf.readInt16LE(i) / 32768;
      sum += s * s;
      count++;
    }
  }
  const rms = count > 0 ? Math.sqrt(sum / count) : 0;
  return { channels, sampleRate, bitsPerSample, dataBytes: dataSize, durationSec, rms };
}
/** 生成一段正弦波 WAV（演示模式 / 测试用） */
export function generateToneWav(opts: { freq?: number; durationSec?: number; sampleRate?: number; amplitude?: number } = {}): Buffer {
  const { freq = 440, durationSec = 1.2, sampleRate = 24000, amplitude = 0.25 } = opts;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  const freq2 = freq * 1.005; // 轻微拍频，便于听出差异
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, t / 0.05) * Math.min(1, (durationSec - t) / 0.1); // 淡入淡出
    const v = amplitude * env * (Math.sin(2 * Math.PI * freq * t) + 0.5 * Math.sin(2 * Math.PI * freq2 * t));
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), 44 + i * 2);
  }
  return buf;
}

/** 用不同频率代表不同情感，便于演示模式 A/B 区分 */
export function emotionToneFreq(emotion: string): number {
  switch (emotion) {
    case "开心": return 660;
    case "悲伤": return 220;
    case "激动": return 880;
    case "严肃": return 330;
    case "温柔": return 550;
    default: return 440;
  }
}
