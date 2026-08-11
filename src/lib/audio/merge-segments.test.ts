import { describe, expect, it } from "vitest";
import { capCuts, DEFAULT_MAX_REF_SEC } from "./merge-segments";

describe("capCuts（参考音频时长上限）", () => {
  it("不超过上限时原样保留", () => {
    const cuts = [
      { from: 0, len: 100 },
      { from: 200, len: 50 },
    ];
    const { kept, totalLen } = capCuts(cuts, 1000);
    expect(kept).toEqual(cuts);
    expect(totalLen).toBe(150);
  });

  it("超过上限时按顺序保留并截短最后一个", () => {
    const cuts = [
      { from: 0, len: 100 },
      { from: 200, len: 200 },
      { from: 500, len: 300 },
    ];
    const { kept, totalLen } = capCuts(cuts, 250);
    expect(totalLen).toBe(250);
    expect(kept).toEqual([
      { from: 0, len: 100 },
      { from: 200, len: 150 },
    ]);
  });

  it("上限为 0 时返回空", () => {
    const cuts = [{ from: 0, len: 100 }];
    const { kept, totalLen } = capCuts(cuts, 0);
    expect(totalLen).toBe(0);
    expect(kept).toEqual([]);
  });

  it("上限恰好等于总长时逐段保留", () => {
    const cuts = [
      { from: 0, len: 100 },
      { from: 100, len: 100 },
    ];
    const { kept, totalLen } = capCuts(cuts, 200);
    expect(totalLen).toBe(200);
    expect(kept).toEqual(cuts);
  });

  it("默认上限为 60 秒", () => {
    expect(DEFAULT_MAX_REF_SEC).toBe(60);
  });
});
