// Skill 包生成（浏览器端 JSZip）：SKILL.md + voice.json + reference.wav + examples/
import JSZip from "jszip";
import type { Emotion, SkillPackMeta, VoiceProfile, TtsProviderId } from "./types";
import { EMOTION_INSTRUCT, EMOTION_DESCRIPTIONS } from "./emotion";

export const EMOTION_EXAMPLE_TEXTS: Record<Emotion, string> = {
  平静: "今天天气不错，我们按计划进行吧。",
  开心: "太好了，终于等到这一天了！",
  悲伤: "没想到会变成这样，我心里很难受。",
  激动: "太棒了，我们做到了！冲啊！",
  严肃: "请注意，这是非常重要的决定，请认真对待。",
  温柔: "别担心，有我在，一切都会好起来的。",
};

function providerNote(provider: TtsProviderId): string {
  switch (provider) {
    case "siliconflow":
      return "使用硅基流动（SiliconFlow）CosyVoice：填入该 voice_id 作为 `voice` 参数；情感通过指令文本（见 examples）。需在服务商控制台配置 API key。";
    case "fishaudio":
      return "使用 Fish Audio：填入该 voice_id 作为 `reference_id` 参数；情感主要靠参考音频与提示词。需在服务商控制台配置 API key。";
    case "minimax":
      return "使用 MiniMax：填入该 voice_id 作为 `voice_setting.voice_id`；情感通过 `audio_setting.emotion` 参数。需在服务商控制台配置 API key。";
    case "openai":
      return "使用 OpenAI TTS：该 voice_id 为预设音色名；OpenAI 不支持 API 声纹克隆，情感表达有限。";
    default:
      return "演示模式：仅供流程演示，不产生真实语音。";
  }
}

export async function buildSkillPack(params: { profile: VoiceProfile; refAudio: Blob | null; providerLabel: string }): Promise<Blob> {
  const { profile, refAudio, providerLabel } = params;
  const meta: SkillPackMeta = {
    schemaVersion: "1.0",
    voiceId: profile.providerVoiceId,
    provider: profile.provider,
    model: profile.model,
    language: profile.language,
    emotionControl: profile.emotionControl,
    referenceAudio: "reference.wav",
    mode: profile.mode,
    createdAt: new Date(profile.createdAt).toISOString(),
  };

  const emotions = Object.keys(EMOTION_INSTRUCT) as Emotion[];
  const emotionMd = emotions
    .map((e) => `### ${e}\n- 描述：${EMOTION_DESCRIPTIONS[e]}\n- 指令：${EMOTION_INSTRUCT[e]}\n- 示例：${EMOTION_EXAMPLE_TEXTS[e]}`)
    .join("\n\n");

  const skillMd = `# 声音 Skill：${providerLabel}（voice_id: ${meta.voiceId}）

> 由 Voice Skill Studio 生成。本 Skill 让机器人/Agent 用该人物的声音说话，并带有情感与自然度。

## 快速开始
1. 准备好对应服务商的 API key（本包**不包含**任何 key）。
2. 按下面“调用方式”用 voice_id 合成语音。
3. 情感控制见 \`examples/emotion-prompts.md\`。

## 元数据
\`\`\`json
${JSON.stringify(meta, null, 2)}
\`\`\`

## 调用方式
${providerNote(profile.provider)}

## 情感控制
${emotionMd}

## 注意
- 参考音频 \`reference.wav\` 已做去噪处理，可再次用于该服务商的声纹/克隆接口。
- 请遵守相关法律法规，仅用于本人或已获授权的声音。
`;

  const zip = new JSZip();
  zip.file("SKILL.md", skillMd);
  zip.file("voice.json", JSON.stringify(meta, null, 2));
  if (refAudio) zip.file("reference.wav", await refAudio.arrayBuffer());
  zip.file(
    "examples/emotion-prompts.md",
    `# 情感示例提示词\n\n${emotionMd}\n\n> 用法：先让 LLM 判断文本情感，再按上表指令/参数传给 TTS。\n`
  );
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}


