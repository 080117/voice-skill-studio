import { describe, expect, it } from "vitest";
import { emotionToneFreq, generateToneWav, parseWav } from "./wav";

describe("wav", () => {
  it("生成并解析一段 24kHz 单声道 WAV", () => {
    const buf = generateToneWav({ freq: 440, durationSec: 0.5, sampleRate: 24000 });
    const info = parseWav(buf);
    expect(info).not.toBeNull();
    expect(info!.sampleRate).toBe(24000);
    expect(info!.channels).toBe(1);
    expect(info!.durationSec).toBeCloseTo(0.5, 1);
    expect(info!.rms).toBeGreaterThan(0.05);
  });

  it("不同情感映射不同频率", () => {
    expect(emotionToneFreq("开心")).toBeGreaterThan(emotionToneFreq("悲伤"));
    expect(emotionToneFreq("平静")).toBe(440);
  });

  it("解析带 LIST 元数据 + 流式 data 大小标记的 WAV（ffmpeg pipe 输出）", () => {
    const sr = 24000;
    const seconds = 0.25;
    const numSamples = Math.floor(sr * seconds);
    const dataSize = numSamples * 2;
    const isft = Buffer.from("Lavf62.12.102", "ascii");
    const listBody = Buffer.concat([
      Buffer.from("INFO", "ascii"),
      Buffer.from("ISFT", "ascii"),
      (() => { const b = Buffer.alloc(4); b.writeUInt32LE(isft.length, 0); return b; })(),
      isft,
    ]);
    const listPayload = Buffer.alloc(listBody.length + (listBody.length % 2));
    listBody.copy(listPayload);
    const fmtPayload = Buffer.alloc(16);
    fmtPayload.writeUInt16LE(1, 0);
    fmtPayload.writeUInt16LE(1, 2);
    fmtPayload.writeUInt32LE(sr, 4);
    fmtPayload.writeUInt32LE(sr * 2, 8);
    fmtPayload.writeUInt16LE(2, 12);
    fmtPayload.writeUInt16LE(16, 14);
    const data = Buffer.alloc(dataSize);
    for (let i = 0; i < numSamples; i++) {
      const v = Math.round((0.25 * 32767 * Math.sin((2 * Math.PI * 440 * i) / sr)));
      data.writeInt16LE(v, i * 2);
    }
    const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n, 0); return b; };
    const buf = Buffer.concat([
      Buffer.from("RIFF", "ascii"),
      u32(0),
      Buffer.from("WAVE", "ascii"),
      Buffer.from("fmt ", "ascii"),
      u32(16),
      fmtPayload,
      Buffer.from("LIST", "ascii"),
      u32(listPayload.length),
      listPayload,
      Buffer.from("data", "ascii"),
      u32(0xffffffff),
      data,
    ]);
    buf.writeUInt32LE(buf.length - 8, 4);
    const info = parseWav(buf);
    expect(info).not.toBeNull();
    expect(info!.sampleRate).toBe(sr);
    expect(info!.dataBytes).toBe(dataSize);
    expect(info!.durationSec).toBeCloseTo(seconds, 1);
    expect(info!.rms).toBeGreaterThan(0.05);
  });

});
