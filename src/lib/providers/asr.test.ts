import { describe, expect, it, vi, beforeEach } from "vitest";
import { transcribeAudio } from "./asr";
import { fetchWithProxy } from "./net";

vi.mock("./net", () => ({ fetchWithProxy: vi.fn() }));

const mockFetch = vi.mocked(fetchWithProxy);

describe("asr（SiliconFlow SenseVoiceSmall 免费转写）", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("调用 /audio/transcriptions，返回 text", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ text: "今天天气很好" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const text = await transcribeAudio({
      apiKey: "sk-test",
      audioBase64: Buffer.from("dummy").toString("base64"),
      mime: "audio/wav",
    });
    expect(text).toBe("今天天气很好");
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("/audio/transcriptions");
    const form = init!.body as FormData;
    expect(form.get("model")).toBe("FunAudioLLM/SenseVoiceSmall");
    expect(form.get("file")).toBeInstanceOf(Blob);
  });

  it("转写失败抛明确错误", async () => {
    mockFetch.mockResolvedValue(new Response("bad", { status: 500 }));
    await expect(
      transcribeAudio({ apiKey: "sk-test", audioBase64: "eA==", mime: "audio/wav" }),
    ).rejects.toThrow("转写失败");
  });

  it("转写结果为空时抛错", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ text: "" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(
      transcribeAudio({ apiKey: "sk-test", audioBase64: "eA==", mime: "audio/wav" }),
    ).rejects.toThrow("转写结果为空");
  });
});
