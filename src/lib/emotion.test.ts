import { afterEach, describe, expect, it, vi } from "vitest";
import { EMOTION_INSTRUCT, parseEmotionJson, tagEmotionWithLLM } from "./emotion";
import type { LlmConfig } from "./types";

const llm: LlmConfig = { baseUrl: "https://example.com/v1", apiKey: "k", model: "m" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("emotion", () => {
  it("解析 LLM 返回的 JSON", () => {
    const tag = parseEmotionJson('好的，结果如下：{"emotion":"开心","intensity":0.8,"style":"轻快","reason":"表达喜悦"}');
    expect(tag?.emotion).toBe("开心");
    expect(tag?.intensity).toBe(0.8);
  });

  it("LLM 标注成功返回对应情感", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: '{"emotion":"悲伤","intensity":0.7,"style":"低沉","reason":"失落"}' } }] }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    const tag = await tagEmotionWithLLM(llm, "我很难过");
    expect(tag.emotion).toBe("悲伤");
    expect(tag.intensity).toBe(0.7);
  });

  it("LLM 失败时回退到平静", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const tag = await tagEmotionWithLLM(llm, "随便说点");
    expect(tag.emotion).toBe("平静");
  });

  it("情感指令齐全", () => {
    expect(Object.keys(EMOTION_INSTRUCT)).toHaveLength(6);
  });
});
