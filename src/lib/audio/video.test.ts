import { describe, expect, it } from "vitest";
import { buildSpeechSegments, parseSilenceDetectOutput } from "./video";
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