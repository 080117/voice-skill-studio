import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildSkillPack } from "./skillpack";
import type { VoiceProfile } from "./types";

const profile: VoiceProfile = {
  id: "abc",
  mode: "reading",
  provider: "siliconflow",
  providerVoiceId: "voice-123",
  model: "CosyVoice2-0.5B",
  language: "zh",
  emotionControl: ["instruct_text"],
  createdAt: Date.now(),
};

describe("skillpack", () => {
  it("生成包含 SKILL.md / voice.json / reference.wav / examples 的 zip", async () => {
    const blob = await buildSkillPack({
      profile,
      refAudio: new Blob(["fake-audio"], { type: "audio/wav" }),
      providerLabel: "硅基流动",
    });
    const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));
    expect(zip.file("SKILL.md")).not.toBeNull();
    expect(zip.file("voice.json")).not.toBeNull();
    expect(zip.file("reference.wav")).not.toBeNull();
    expect(zip.file("examples/emotion-prompts.md")).not.toBeNull();
    const meta = JSON.parse(await (await zip.file("voice.json")!).async("text"));
    expect(meta.voiceId).toBe("voice-123");
    expect(meta.schemaVersion).toBe("1.0");
  });

  it("refAudio 为 null 时仍可生成（不崩溃）", async () => {
    const blob = await buildSkillPack({ profile, refAudio: null, providerLabel: "x" });
    expect(blob.size).toBeGreaterThan(100);
  });
});
