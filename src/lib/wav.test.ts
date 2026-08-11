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
});
