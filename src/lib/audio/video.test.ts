import { describe, expect, it } from "vitest";
import { buildSpeechSegments, MAX_SEGMENT_SEC, parseSilenceDetectOutput } from "./video";
import { pickDominantSlices } from "./merge-segments";

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
