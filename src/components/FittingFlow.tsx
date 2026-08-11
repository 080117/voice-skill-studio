"use client";

import { useMemo, useState } from "react";
import type { ApiKeysState, Emotion, VoiceMode, VoiceProfile } from "@/lib/types";
import { EMOTIONS, TTS_PROVIDER_META } from "@/lib/types";
import { denoise, createVoice, tts as ttsApi, keysToTts, keysToLlm } from "@/lib/api";
import { analyzeBlob, denoiseClient, type AudioAnalysis } from "@/lib/audio/denoise-client";
import { blobToBase64, playAudio } from "@/lib/play";
import { getRefAudio, newVoiceId, putRefAudio } from "@/lib/client-store";
import { buildSkillPack, downloadBlob } from "@/lib/skillpack";
import { Recorder } from "./Recorder";
import { Uploader } from "./Uploader";

const PASSAGE =
  "今天天气真好，阳光洒在窗台上。我喜欢听雨声，也喜欢看云慢慢飘过。生活总有起伏，但只要坚持，就一定能看到希望。我们一起去散步吧，好吗？";

type Phase = "idle" | "denoising" | "denoised" | "creating" | "created";

export function FittingFlow({ keys, onVoiceCreated }: { keys: ApiKeysState; onVoiceCreated: (v: VoiceProfile) => void }) {
  const supportsClone = TTS_PROVIDER_META[keys.ttsProvider].supportsClone;
  const [mode, setMode] = useState<VoiceMode>("reading");
  const [sourceBlob, setSourceBlob] = useState<Blob | null>(null);
  const [denoisedBlob, setDenoisedBlob] = useState<Blob | null>(null);
  const [usedFfmpeg, setUsedFfmpeg] = useState(false);
  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [existingVoiceId, setExistingVoiceId] = useState("");
  const [previewText, setPreviewText] = useState("你好，很高兴认识你。用我的声音打个招呼吧。");
  const [previewEmotion, setPreviewEmotion] = useState<Emotion | "auto">("auto");
  const [previewBusy, setPreviewBusy] = useState(false);

  const canProcess = useMemo(() => {
    if (keys.ttsProvider !== "mock" && !keys.ttsApiKey) return false;
    if (!supportsClone) return !!existingVoiceId.trim();
    return !!sourceBlob;
  }, [keys.ttsProvider, keys.ttsApiKey, supportsClone, existingVoiceId, sourceBlob]);

  const onAudio = (blob: Blob) => {
    setSourceBlob(blob);
    setDenoisedBlob(null);
    setPhase("idle");
    setError("");
    setProfile(null);
  };

  const runDenoise = async () => {
    if (!sourceBlob) return;
    setError("");
    setBusy("正在去噪…");
    setPhase("denoising");
    try {
      let result = await denoise(sourceBlob);
      let finalBlob = result.blob;
      let ff = result.usedFfmpeg;
      if (!ff) {
        finalBlob = await denoiseClient(sourceBlob);
      }
      setDenoisedBlob(finalBlob);
      setUsedFfmpeg(ff);
      setAnalysis(await analyzeBlob(finalBlob).catch(() => null));
      setPhase("denoised");
    } catch {
      const fallback = await denoiseClient(sourceBlob).catch(() => sourceBlob);
      setDenoisedBlob(fallback);
      setUsedFfmpeg(false);
      setAnalysis(await analyzeBlob(fallback).catch(() => null));
      setPhase("denoised");
    } finally {
      setBusy("");
    }
  };

  const createVoiceNow = async () => {
    setError("");
    if (!supportsClone) {
      if (!existingVoiceId.trim()) return;
      const profile: VoiceProfile = {
        id: newVoiceId(),
        mode,
        provider: keys.ttsProvider,
        providerVoiceId: existingVoiceId.trim(),
        model: keys.ttsModel || undefined,
        language: "zh",
        emotionControl: ["emotion_param", "reference_audio"],
        createdAt: Date.now(),
        sourceText: mode === "reading" ? PASSAGE : undefined,
      };
      await putRefAudio(profile.id, new Blob([""], { type: "audio/wav" })).catch(() => {});
      setProfile(profile);
      onVoiceCreated(profile);
      setPhase("created");
      return;
    }
    if (!sourceBlob) return;
    setBusy("正在创建声纹…");
    setPhase("creating");
    try {
      const ref = denoisedBlob ?? sourceBlob;
      const audioBase64 = await blobToBase64(ref);
      const profile = await createVoice({
        audioBase64,
        mime: ref.type || "audio/wav",
        mode,
        text: mode === "reading" ? PASSAGE : undefined,
        tts: keysToTts(keys),
      });
      await putRefAudio(profile.id, ref);
      setProfile(profile);
      onVoiceCreated(profile);
      setPhase("created");
    } catch (e) {
      setError((e as Error).message);
      setPhase("denoised");
    } finally {
      setBusy("");
    }
  };

  const preview = async () => {
    if (!profile) return;
    setPreviewBusy(true);
    setError("");
    try {
      const llm = keysToLlm(keys);
      const res = await ttsApi({
        text: previewText || "你好。",
        voice: profile,
        tts: keysToTts(keys),
        llm: llm ?? undefined,
        emotion: previewEmotion === "auto" ? undefined : previewEmotion,
        autoEmotion: previewEmotion === "auto" && !!llm,
      });
      playAudio(res.audioBase64, res.mimeType);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreviewBusy(false);
    }
  };

  const downloadSkill = async () => {
    if (!profile) return;
    try {
      const ref = denoisedBlob ?? (await getRefAudio(profile.id));
      const zipBlob = await buildSkillPack({
        profile,
        refAudio: ref,
        providerLabel: TTS_PROVIDER_META[profile.provider].label,
      });
      downloadBlob(zipBlob, `voice-skill-${profile.id.slice(0, 8)}.zip`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const btn =
    "rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40";
  const inputCls =
    "w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-blue-500";

  return (
    <section className="flex flex-col gap-4">
      {/* 模式选择 */}
      <div className="grid gap-3 md:grid-cols-2">
        <button
          onClick={() => { setMode("reading"); setSourceBlob(null); setPhase("idle"); setProfile(null); }}
          className={`rounded-xl border p-4 text-left ${mode === "reading" ? "border-blue-500 bg-blue-950/30" : "border-neutral-800 bg-neutral-900/40"}`}
        >
          <div className="font-semibold">🎙 朗读拟合</div>
          <div className="mt-1 text-xs text-neutral-400">读出下方文本，拟合你的声纹</div>
        </button>
        <button
          onClick={() => { setMode("clip"); setSourceBlob(null); setPhase("idle"); setProfile(null); }}
          className={`rounded-xl border p-4 text-left ${mode === "clip" ? "border-blue-500 bg-blue-950/30" : "border-neutral-800 bg-neutral-900/40"}`}
        >
          <div className="font-semibold">🎵 素材拟合</div>
          <div className="mt-1 text-xs text-neutral-400">上传一段音频，拟合其中声音</div>
        </button>
      </div>

      {/* 输入区 */}
      {!supportsClone ? (
        <div className="flex flex-col gap-2 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <p className="text-sm text-neutral-300">该服务商不支持 API 上传克隆，请在控制台完成“声音复刻”后粘贴 voice_id：</p>
          <input className={inputCls} placeholder="已有 voice_id" value={existingVoiceId} onChange={(e) => setExistingVoiceId(e.target.value)} />
        </div>
      ) : mode === "reading" ? (
        <div className="flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <p className="text-sm leading-relaxed text-neutral-200">{PASSAGE}</p>
          <Recorder onAudio={onAudio} disabled={keys.ttsProvider !== "mock" && !keys.ttsApiKey} />
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <Uploader onAudio={onAudio} disabled={keys.ttsProvider !== "mock" && !keys.ttsApiKey} />
        </div>
      )}

      {!keys.ttsApiKey && keys.ttsProvider !== "mock" && (
        <p className="text-xs text-amber-400">请先在「模型 API」面板填写 TTS API Key（演示模式除外）。</p>
      )}

      {/* 处理按钮 */}
      {sourceBlob && (
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={runDenoise} disabled={busy !== ""} className={btn}>
            {phase === "denoising" ? "去噪中…" : "① 自动去噪"}
          </button>
          {phase === "denoised" && analysis && (
            <span className="text-xs text-neutral-400">
              时长 {analysis.durationSec.toFixed(1)}s · RMS {analysis.rms.toFixed(3)}
              {analysis.durationSec < 5 ? "（偏短，建议 ≥10s）" : analysis.rms < 0.02 ? "（音量偏低）" : "（质量 OK）"}
            </span>
          )}
          {(phase === "denoised" || phase === "creating") && (
            <span className="text-xs text-neutral-400">{usedFfmpeg ? "（服务端 ffmpeg 去噪）" : "（浏览器端去噪）"}</span>
          )}
          <button onClick={createVoiceNow} disabled={!canProcess || busy !== ""} className={btn}>
            {busy ? busy : "② 创建声纹"}
          </button>
        </div>
      )}
      {!supportsClone && (
        <div className="flex">
          <button onClick={createVoiceNow} disabled={!canProcess || busy !== ""} className={btn}>
            {busy ? busy : "② 保存声纹"}
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* 结果区 */}
      {profile && phase === "created" && (
        <div className="flex flex-col gap-4 rounded-xl border border-emerald-800 bg-emerald-950/20 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              ✅ 声纹已创建
              <div className="mt-1 font-mono text-xs text-neutral-400">voice_id: {profile.providerVoiceId}</div>
            </div>
            <button onClick={downloadSkill} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
              ⬇ 下载 Skill 包
            </button>
          </div>

          <div className="grid gap-3 border-t border-neutral-800 pt-3 md:grid-cols-[1fr_auto]">
            <input className={inputCls} value={previewText} onChange={(e) => setPreviewText(e.target.value)} placeholder="输入要试听的文本" />
            <div className="flex gap-2">
              <select className={inputCls} value={previewEmotion} onChange={(e) => setPreviewEmotion(e.target.value as Emotion | "auto")}>
                <option value="auto">自动情感（需 LLM key）</option>
                {EMOTIONS.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
              <button onClick={preview} disabled={previewBusy} className={btn}>
                {previewBusy ? "合成中…" : "▶ 试听"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
