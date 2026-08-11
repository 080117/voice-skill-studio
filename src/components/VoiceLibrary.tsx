"use client";

import { useState } from "react";
import type { ApiKeysState, VoiceProfile } from "@/lib/types";
import { TTS_PROVIDER_META } from "@/lib/types";
import { keysToTts, tts as ttsApi } from "@/lib/api";
import { playAudio } from "@/lib/play";
import { deleteRefAudio, getRefAudio } from "@/lib/client-store";
import { buildSkillPack, downloadBlob } from "@/lib/skillpack";

export function VoiceLibrary({
  keys,
  voices,
  onChange,
  onSelectVoice,
}: {
  keys: ApiKeysState;
  voices: VoiceProfile[];
  onChange: (v: VoiceProfile[]) => void;
  onSelectVoice: (v: VoiceProfile) => void;
}) {
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const preview = async (v: VoiceProfile) => {
    setBusyId(v.id);
    setError("");
    try {
      const res = await ttsApi({
        text: "你好，这是用我的声音合成的试听。",
        voice: v,
        tts: keysToTts(keys),
        emotion: "平静",
      });
      playAudio(res.audioBase64, res.mimeType);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId("");
    }
  };

  const download = async (v: VoiceProfile) => {
    setBusyId(v.id);
    setError("");
    try {
      const ref = await getRefAudio(v.id);
      const zip = await buildSkillPack({ profile: v, refAudio: ref, providerLabel: TTS_PROVIDER_META[v.provider].label });
      downloadBlob(zip, `voice-skill-${v.id.slice(0, 8)}.zip`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId("");
    }
  };

  const remove = async (v: VoiceProfile) => {
    await deleteRefAudio(v.id).catch(() => {});
    onChange(voices.filter((x) => x.id !== v.id));
  };

  if (voices.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-700 p-8 text-center text-sm text-neutral-500">
        还没有声纹。先去「声音拟合」创建一个吧。
      </div>
    );
  }

  const btn = "rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-40";

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-red-400">{error}</p>}
      {voices.map((v) => (
        <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span>{v.mode === "reading" ? "🎙 朗读" : "🎵 素材"}</span>
              <span className="text-neutral-400">·</span>
              <span>{TTS_PROVIDER_META[v.provider]?.label ?? v.provider}</span>
              <span className="text-neutral-500">· {new Date(v.createdAt).toLocaleString("zh-CN")}</span>
            </div>
            <div className="mt-1 truncate font-mono text-xs text-neutral-500">voice_id: {v.providerVoiceId}</div>
          </div>
          <div className="flex gap-2">
            <button className={btn} disabled={busyId === v.id} onClick={() => preview(v)}>▶ 试听</button>
            <button className={btn} disabled={busyId === v.id} onClick={() => download(v)}>⬇ Skill 包</button>
            <button className={btn} onClick={() => onSelectVoice(v)}>💬 去聊天</button>
            <button className="rounded-md border border-red-800 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950" onClick={() => remove(v)}>
              删除
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
