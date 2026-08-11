import { describe, expect, it } from "vitest";
import { createVoice, synthesize, getTtsProvider } from "./tts";

describe("tts registry", () => {
  it("mock provider 可创建声纹并合成（无需 key）", async () => {
    const created = await createVoice({
      config: { provider: "mock", apiKey: "" },
      audioBase64: Buffer.from("dummy").toString("base64"),
      mime: "audio/wav",
      mode: "reading",
      text: "你好",
    });
    expect(created.voiceId).toMatch(/^mock-/);
    const out = await synthesize({ config: { provider: "mock", apiKey: "" }, voiceId: created.voiceId, text: "你好", emotion: "开心" });
    expect(out.mimeType).toBe("audio/wav");
    expect(out.audioBase64.length).toBeGreaterThan(100);
  });

  it("siliconflow / fishaudio 支持克隆；minimax / openai 不支持", () => {
    expect(getTtsProvider("siliconflow").supportsClone).toBe(true);
    expect(getTtsProvider("fishaudio").supportsClone).toBe(true);
    expect(getTtsProvider("minimax").supportsClone).toBe(false);
    expect(getTtsProvider("openai").supportsClone).toBe(false);
  });

  it("未知 provider 抛错", () => {
    expect(() => getTtsProvider("unknown" as never)).toThrow();
  });
});
