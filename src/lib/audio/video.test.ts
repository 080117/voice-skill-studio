import { describe, expect, it } from "vitest";
import { buildEnergySegments, buildSpeechSegments, MAX_SEGMENT_SEC, parseSilenceDetectOutput, pickSegments } from "./video";
import { pickDominantSlices } from "./merge-segments";

/** 按分段生成 16-bit mono PCM：amp 决定该段响度 */
function makePcm(parts: { sec: number; amp: number }[], sampleRate = 24000): Buffer {
  const total = Math.round(parts.reduce((a, p) => a + p.sec, 0) * sampleRate);
  const buf = Buffer.alloc(total * 2);
  let off = 0;
  for (const p of parts) {
    const n = Math.round(p.sec * sampleRate);
    for (let i = 0; i < n; i++) {
      const v = p.amp * Math.sin((2 * Math.PI * 220 * (off + i)) / sampleRate);
      buf.writeInt16LE(Math.round(Math.max(-32768, Math.min(32767, v * 32767))), (off + i) * 2);
    }
    off += n;
  }
  return buf;
}

describe("video", () => {
  it("解析 silencedetect 输出", () => {
    const text = `
[silencedetect @ 0x1] silence_start: 0
[silencedetect @ 0x1] silence_end: 2.4 | silence_duration: 2.4
[silencedetect @ 0x1] silence_start: 5.1
[silencedetect @ 0x1] silence_end: 7.9 | silence_duration: 2.8
`;
    const silences = parseSilenceDetectOutput(text);
    expect(silences).toEqual([
      { start: 0, end: 2.4 },
      { start: 5.1, end: 7.9 },
    ]);
  });

  it("由静音推导语音段并合并过近片段", () => {
    const segs = buildSpeechSegments(
      [
        { start: 0, end: 2.4 },
        { start: 5.1, end: 7.9 },
      ],
      12
    );
    // 语音段: 2.4–5.1（间隔 2.7 ≥ mergeGap 不合并）, 7.9–12
    expect(segs).toEqual([
      { start: 2.4, end: 5.1 },
      { start: 7.9, end: 12 },
    ]);
  });

  it("超长语音段自动切分为 ≤MAX_SEGMENT_SEC 的子段", () => {
    const segs = buildSpeechSegments([], 95);
    // 无静音 → 整段均分：30/30/30/5，每段都不超过 30s
    expect(segs.length).toBe(4);
    for (const s of segs) expect(s.end - s.start).toBeLessThanOrEqual(MAX_SEGMENT_SEC + 0.001);
    expect(segs[0]).toEqual({ start: 0, end: 30 });
    expect(segs[3]).toEqual({ start: 90, end: 95 });
  });

  it("有静音但单段讲话过长时同样切分", () => {
    const segs = buildSpeechSegments(
      [
        { start: 2, end: 3 },
        { start: 70, end: 71 },
      ],
      100
    );
    // 语音段：0–2（短）、3–70（67s → 切成 30/30/7）、71–100（29s 不切）
    expect(segs.length).toBe(5);
    for (const s of segs) expect(s.end - s.start).toBeLessThanOrEqual(MAX_SEGMENT_SEC + 0.001);
    expect(segs[0]).toEqual({ start: 0, end: 2 });
    expect(segs[1]).toEqual({ start: 3, end: 33 });
    expect(segs[2]).toEqual({ start: 33, end: 63 });
    expect(segs[3]).toEqual({ start: 63, end: 70 });
    expect(segs[4]).toEqual({ start: 71, end: 100 });
  });

  it("无静音时按响度差切出说话片段（不是固定 30s 一刀切）", () => {
    const pcm = makePcm([
      { sec: 2, amp: 0.01 }, // 背景
      { sec: 3, amp: 0.3 },  // 说话
      { sec: 2, amp: 0.01 }, // 背景
      { sec: 2, amp: 0.3 },  // 说话
      { sec: 1, amp: 0.01 }, // 背景
    ]);
    const segs = buildEnergySegments(pcm, {
      sampleRate: 24000,
      channels: 1,
      bitsPerSample: 16,
      windowMs: 200,
      floorPct: 0.15,
      boost: 1.6,
      minSpeech: 0.8,
      mergeGap: 0.8,
    });
    expect(segs.length).toBe(2);
    expect(segs[0].start).toBeCloseTo(2, 1);
    expect(segs[0].end).toBeCloseTo(5, 1);
    expect(segs[1].start).toBeCloseTo(7, 1);
    expect(segs[1].end).toBeCloseTo(9, 1);
  });

  it("buildEnergySegments 超长说话段同样切成 ≤30s", () => {
    const pcm = makePcm([{ sec: 70, amp: 0.3 }]);
    const segs = buildEnergySegments(pcm, {
      sampleRate: 24000,
      channels: 1,
      bitsPerSample: 16,
      windowMs: 100,
      floorPct: 0.05,
      boost: 1.35,
    });
    expect(segs.length).toBe(3); // 70s → 30/30/10
    for (const s of segs) expect(s.end - s.start).toBeLessThanOrEqual(MAX_SEGMENT_SEC + 0.001);
    expect(segs[0].start).toBeCloseTo(0, 1);
    expect(segs[2].end).toBeCloseTo(70, 1);
  });

  it("buildEnergySegments 长段切点落在响度低谷（不固定 30s）", () => {
    const pcm = makePcm([
      { sec: 25, amp: 0.3 }, // 说话
      { sec: 1, amp: 0.05 }, // 明显低谷
      { sec: 44, amp: 0.3 }, // 继续说话
    ]);
    const segs = buildEnergySegments(pcm, {
      sampleRate: 24000,
      channels: 1,
      bitsPerSample: 16,
      windowMs: 100,
      floorPct: 0.05,
      boost: 1.35,
    });
    expect(segs.length).toBeGreaterThanOrEqual(2);
    // 第一段应结束在低谷附近（约 25s），而不是固定 30s
    expect(segs[0].end).toBeGreaterThan(23);
    expect(segs[0].end).toBeLessThan(27);
    for (const s of segs) expect(s.end - s.start).toBeLessThanOrEqual(MAX_SEGMENT_SEC + 0.001);
  });

  it("pickSegments：静音段太粗（连续讲话）时改用能量段，避免 30s 一刀切", () => {
    const silence = [
      { start: 0, end: 376 },
      { start: 376, end: 474 },
    ];
    const energy = Array.from({ length: 8 }, (_, i) => ({ start: i * 20, end: i * 20 + 15 }));
    const picked = pickSegments(silence, energy, true);
    expect(picked).toBe(energy);
  });

  it("pickSegments：静音段本身够细时保留静音段", () => {
    const silence = [
      { start: 0, end: 10 },
      { start: 12, end: 30 },
    ];
    const energy = [{ start: 0, end: 15 }];
    const picked = pickSegments(silence, energy, false);
    expect(picked).toBe(silence);
  });

  it("推荐主导片段按时长取前 N", () => {
    const idx = pickDominantSlices(
      [
        { start: 0, end: 1 },
        { start: 2, end: 8 },
        { start: 9, end: 12 },
      ],
      2
    );
    expect(idx).toEqual([1, 2]);
  });
});
