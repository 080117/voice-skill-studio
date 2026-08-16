"use client";

import { useMemo, useState } from "react";
import type { ApiKeysState, DenoiseStrength, Emotion, VoiceMode, VoiceProfile } from "@/lib/types";
import { EMOTIONS, TTS_PROVIDER_META } from "@/lib/types";
import { denoise, createVoice, tts as ttsApi, keysToTts, keysToLlm } from "@/lib/api";
import { analyzeBlob, denoiseClient, truncateAudio, type AudioAnalysis } from "@/lib/audio/denoise-client";
import { MAX_MULTI_SEGMENTS, pickBestSegments, sliceAudioSegments, splitAudioBlob } from "@/lib/audio/split-client";
import { base64ToBlob, blobToBase64, playAudio } from "@/lib/play";
import { formatSeg, mergeSegments, mergeSegmentsMulti, pickDominantSlices, type Slice } from "@/lib/audio/merge-segments";
import { getRefAudio, newVoiceId, putRefAudio } from "@/lib/client-store";
import { buildSkillPack, downloadBlob } from "@/lib/skillpack";
import { Recorder } from "./Recorder";
import { Uploader } from "./Uploader";

// 加长范读：覆盖常见声母/韵母、四声与轻重读，含叙述/感叹/疑问等语气，约 1 分钟
const PASSAGE =
  "清晨的阳光洒在窗前，微风轻轻吹过。我坐在书桌旁，翻开一本厚厚的日记，回忆起过去的点点滴滴。那年春天，我们一起去爬山，路边的花开得特别灿烂，漫山遍野都是彩色的。你说，生活就像一条河，有时平静，有时汹涌，但总要向前流淌。后来我们各奔东西，各自忙碌，偶尔在深夜里想起那些温暖的日子。今天窗外又下起了小雨，滴滴答答，像极了我此刻的心情。生活总有起伏，但只要心里有光，就一定能走过每一个路口。明天，又是一个新的开始，我们一起去散散步，好吗？";

interface VideoSource {
  url: string;
  ok: boolean;
  error?: string;
  source?: string;
  blob?: Blob;
  durationSec?: number;
  segments: Slice[];
}

type Phase = "idle" | "denoising" | "denoised" | "creating" | "created";

export function FittingFlow({ keys, onVoiceCreated }: { keys: ApiKeysState; onVoiceCreated: (v: VoiceProfile) => void }) {
  const supportsClone = TTS_PROVIDER_META[keys.ttsProvider].supportsClone;
  const maxRefSec = keys.ttsProvider === "siliconflow" ? 29 : 60;
  const [mode, setMode] = useState<VoiceMode>("reading");
  const [sourceBlob, setSourceBlob] = useState<Blob | null>(null);
  const [denoisedBlob, setDenoisedBlob] = useState<Blob | null>(null);
  const [denoiseStrength, setDenoiseStrength] = useState<DenoiseStrength>("standard");
  /** 多段参考（SiliconFlow 分段拟合）：非空时创建声纹会一次上传多段合并为同一个声纹 */
  const [refSegments, setRefSegments] = useState<Blob[] | null>(null);
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

  const [videoUrls, setVideoUrls] = useState("");
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoError, setVideoError] = useState("");
  const [sourceNotice, setSourceNotice] = useState("");
  const [videoSources, setVideoSources] = useState<VideoSource[]>([]);
  const [selectedSegs, setSelectedSegs] = useState<number[]>([]);

  const parseVideo = async () => {
    const urls = videoUrls
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (urls.length === 0) return;
    setVideoBusy(true);
    setVideoError("");
    setVideoSources([]);
    setSelectedSegs([]);
    try {
      const res = await fetch("/api/video-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
        signal: AbortSignal.timeout(180_000),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `解析失败 HTTP ${res.status}`);
      const results: any[] = json.results || [];
      const sources: VideoSource[] = results.map((r) => ({
        url: r.url,
        ok: !!r.ok,
        error: r.error,
        source: r.source,
        blob: r.ok ? base64ToBlob(r.audioBase64, r.mime || "audio/wav") : undefined,
        durationSec: r.durationSec,
        segments: r.ok ? r.segments || [] : [],
      }));
      setVideoSources(sources);
      const idx: number[] = [];
      let base = 0;
      for (const s of sources) {
        for (const si of pickDominantSlices(s.segments, 3)) idx.push(base + si);
        base += s.segments.length;
      }
      setSelectedSegs(idx);
    } catch (e) {
      setVideoError((e as Error).name === "TimeoutError" ? "视频解析超时（>3 分钟），请重试" : (e as Error).message);
    } finally {
      setVideoBusy(false);
    }
  };

  const toggleSeg = (i: number, checked: boolean) => {
    setSelectedSegs((prev) => (checked ? [...prev, i] : prev.filter((x) => x !== i)));
  };

  const previewVideoSeg = (entry: { src: number; seg: Slice }) => {
    const blob = videoSources[entry.src]?.blob;
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    a.currentTime = entry.seg.start;
    a.play().catch(() => {});
    const stop = () => {
      if (a.currentTime >= entry.seg.end) {
        a.pause();
        a.currentTime = 0;
        a.removeEventListener("timeupdate", stop);
      }
    };
    a.addEventListener("timeupdate", stop);
  };

  const useSelectedSegs = async () => {
    if (selectedSegs.length === 0) return;
    setVideoBusy(true);
    setVideoError("");
    try {
      const groups = new Map<number, Slice[]>();
      for (const i of selectedSegs) {
        const entry = allSegs[i];
        if (!entry) continue;
        const list = groups.get(entry.src) ?? [];
        list.push(entry.seg);
        groups.set(entry.src, list);
      }
      const sources = [...groups.entries()]
        .map(([srcIdx, segs]) => ({ blob: videoSources[srcIdx]?.blob, segments: segs }))
        .filter((x): x is { blob: Blob; segments: Slice[] } => Boolean(x.blob));
      if (sources.length === 0) throw new Error("没有可用的片段");
      const merged =
        sources.length === 1
          ? await mergeSegments(sources[0].blob, sources[0].segments, maxRefSec)
          : await mergeSegmentsMulti(sources, maxRefSec);
      await onAudio(merged.blob); // 进入原有 去噪 → 建声纹 → Skill 包 流程
      const cappedNotice = merged.capped
        ? `选中片段合计过长，参考音频已截取为 ${merged.totalSec.toFixed(0)}s（上限 ${maxRefSec}s）`
        : "";
      if (keys.ttsProvider === "siliconflow" && selectedSegs.length >= 2) {
        try {
          // 全选/多选时：按时间轴自动挑最有代表性的若干段（覆盖全片），而不是只取前几段
          const allSel: { src: number; seg: Slice }[] = [];
          for (const [srcIdx, segs] of groups) for (const seg of segs) allSel.push({ src: srcIdx, seg });
          const chosen = pickBestSegments(allSel.map((x) => x.seg), MAX_MULTI_SEGMENTS);
          const chosenSet = new Set(chosen);
          const segBlobs: Blob[] = [];
          for (const item of allSel) {
            if (!chosenSet.has(item.seg)) continue;
            const b = videoSources[item.src]?.blob;
            if (!b) continue;
            segBlobs.push(...(await sliceAudioSegments(b, [item.seg], maxRefSec)));
          }
          if (segBlobs.length > 1) {
            setRefSegments(segBlobs);
            setSourceNotice(`你选了 ${allSel.length} 段，实际只上传自动挑出的 ${segBlobs.length} 段最有代表性片段（覆盖全片，每段 ≤${maxRefSec}s）`);
          } else {
            setSourceNotice(cappedNotice);
          }
        } catch {
          setSourceNotice(cappedNotice);
        }
      } else {
        setSourceNotice(cappedNotice);
      }
    } catch (e) {
      setVideoError((e as Error).message);
    } finally {
      setVideoBusy(false);
    }
  };

  const allSegs = useMemo(() => {
    const arr: { src: number; seg: Slice }[] = [];
    videoSources.forEach((s, srcIdx) => {
      for (const seg of s.segments) arr.push({ src: srcIdx, seg });
    });
    return arr;
  }, [videoSources]);

  const srcOffsets = useMemo(() => {
    const offsets: number[] = [];
    let o = 0;
    for (const s of videoSources) {
      offsets.push(o);
      o += s.segments.length;
    }
    return offsets;
  }, [videoSources]);

  /** 一键：自动挑出覆盖全片的最有代表性的若干段（不手动勾选） */
  const autoPickBest = () => {
    if (!allSegs.length) return;
    const chosen = pickBestSegments(allSegs.map((x) => x.seg), MAX_MULTI_SEGMENTS);
    const idx = chosen.map((s) => allSegs.findIndex((x) => x.seg === s)).filter((i) => i >= 0);
    setSelectedSegs(idx);
  };

  const canProcess = useMemo(() => {
    if (keys.ttsProvider !== "mock" && !keys.ttsApiKey) return false;
    if (!supportsClone) return !!existingVoiceId.trim();
    return !!sourceBlob;
  }, [keys.ttsProvider, keys.ttsApiKey, supportsClone, existingVoiceId, sourceBlob]);

  const onAudio = async (blob: Blob) => {
    setSourceBlob(blob);
    setDenoisedBlob(null);
    setRefSegments(null);
    setPhase("idle");
    setError("");
    setProfile(null);
    setSourceNotice("");
    try {
      const dur = await analyzeBlob(blob);
      if (dur && dur.durationSec > maxRefSec) {
        // 超长素材：硅基流动支持多段参考，拆段做「分段拟合」合并为同一个声纹
        if (mode === "clip" && keys.ttsProvider === "siliconflow") {
          try {
            const segs = await splitAudioBlob(blob, maxRefSec);
            if (segs.length > 1) {
              const preview = await truncateAudio(blob, maxRefSec);
              setSourceBlob(preview);
              setRefSegments(segs);
              setSourceNotice(`超长素材已拆分为 ${segs.length} 段，自动挑选最有代表性的分段拟合为同一个声纹（每段 ≤${maxRefSec}s）`);
              return;
            }
          } catch {
            // VAD 失败则退回截取
          }
        }
        const cut = await truncateAudio(blob, maxRefSec);
        setSourceBlob(cut);
        setSourceNotice(`参考音频过长（${dur.durationSec.toFixed(0)}s），已自动截取前 ${maxRefSec}s（避免服务端超时）`);
      }
    } catch {
      // 分析失败则保持原样
    }
  };

  const runDenoise = async () => {
    if (!sourceBlob) return;
    setError("");
    setBusy("正在去噪…");
    setPhase("denoising");
    try {
      let result = await denoise(sourceBlob, denoiseStrength);
      let finalBlob = result.blob;
      let ff = result.usedFfmpeg;
      if (!ff) {
        finalBlob = await denoiseClient(sourceBlob);
      }
      setDenoisedBlob(finalBlob);
      setUsedFfmpeg(ff);
      setAnalysis(await analyzeBlob(finalBlob).catch(() => null));
      setPhase("denoised");
      // 分段拟合：用去噪后的音频重新拆段，让克隆参考也是去噪后的
      if (refSegments && refSegments.length > 1 && mode === "clip" && keys.ttsProvider === "siliconflow") {
        try {
          const segs = await splitAudioBlob(finalBlob, maxRefSec);
          if (segs.length > 1) setRefSegments(segs);
        } catch {
          // 保持原段
        }
      }
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
      // 分段拟合：SiliconFlow 一次上传多段参考，合并为同一个声纹
      if (refSegments && refSegments.length > 1) {
        const segs = await Promise.all(
          refSegments.slice(0, MAX_MULTI_SEGMENTS).map(async (b) => ({ audioBase64: await blobToBase64(b), mime: b.type || "audio/wav" })),
        );
        const profile = await createVoice({
          segments: segs,
          mime: "audio/wav",
          mode,
          text: mode === "reading" ? PASSAGE : undefined,
          tts: keysToTts(keys),
        });
        await putRefAudio(profile.id, ref);
        setProfile(profile);
        onVoiceCreated(profile);
        setPhase("created");
        return;
      }
      const refDur = analysis?.durationSec ?? (await analyzeBlob(ref).catch(() => null))?.durationSec;
      if (refDur && refDur > maxRefSec + 2) {
        throw new Error(`参考音频过长（${refDur.toFixed(0)}s，上限 ${maxRefSec}s）。超长音频会导致服务端超时（HTTP 524），请减少选中片段或换用较短音频。`);
      }
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
          <p className="text-xs text-neutral-400">
            请完整朗读一遍（约 1 分钟）：音频越长、覆盖音素越全，拟合效果越好（≥30s 最佳）。
          </p>
          <p className="text-sm leading-relaxed text-neutral-200">{PASSAGE}</p>
              <Recorder onAudio={onAudio} disabled={keys.ttsProvider !== "mock" && !keys.ttsApiKey} />
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
              <Uploader onAudio={onAudio} disabled={keys.ttsProvider !== "mock" && !keys.ttsApiKey} />
          <div className="border-t border-neutral-800 pt-3">
            <p className="mb-2 text-xs text-neutral-400">
              或粘贴视频链接（直链 mp4/webm；YouTube/B 站需本机装 yt-dlp），每行一个、可一次粘贴多个，自动抽音频并识别语音片段：
            </p>
            <div className="flex flex-col gap-2">
              <textarea
                className={inputCls}
                rows={3}
                placeholder={"https://…/video.mp4\nhttps://www.bilibili.com/video/BV…\nhttps://www.youtube.com/watch?v=…"}
                value={videoUrls}
                onChange={(e) => setVideoUrls(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <button onClick={parseVideo} disabled={videoBusy} className={btn}>
                  {videoBusy ? "解析中…" : "解析视频"}
                </button>
                {videoSources.length > 0 && (
                  <span className="text-xs text-neutral-400">共 {allSegs.length} 段语音</span>
                )}
              </div>
            </div>
            {videoError && <p className="mt-2 text-xs text-red-400">{videoError}</p>}
            {videoSources.length > 0 && (
              <div className="mt-3 flex flex-col gap-3">
                {videoSources.map((s, srcIdx) => (
                  <div key={srcIdx} className="rounded-md border border-neutral-800 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-neutral-400">
                        {s.ok ? `来源 ${srcIdx + 1}：${s.url}` : `来源 ${srcIdx + 1}（失败）：${s.url}`}
                      </span>
                      {s.ok && <span className="shrink-0 text-xs text-neutral-500">{s.durationSec?.toFixed(1) ?? "-"}s</span>}
                    </div>
                    {!s.ok && s.error && <p className="mt-1 text-xs text-red-400">{s.error}</p>}
                    {s.ok && (
                      <div className="mt-1 flex flex-col gap-1">
                        {s.segments.map((seg, i) => {
                          const gi = srcOffsets[srcIdx] + i;
                          return (
                            <label key={i} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-neutral-800">
                              <input type="checkbox" checked={selectedSegs.includes(gi)} onChange={(e) => toggleSeg(gi, e.target.checked)} />
                              <span>片段 {i + 1}：{formatSeg(seg)}</span>
                              <button
                                type="button"
                                className="ml-auto text-blue-400 hover:underline"
                                onClick={(e) => {
                                  e.preventDefault();
                                  previewVideoSeg({ src: srcIdx, seg });
                                }}
                              >
                                试听
                              </button>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
                {allSegs.length > 0 && (
                  <div className="flex items-center justify-between">
                    <button onClick={useSelectedSegs} disabled={selectedSegs.length === 0 || videoBusy} className={btn}>
                      用选中片段生成参考音频（{selectedSegs.length} 段）
                    </button>
                    <div className="flex gap-2">
                      <button onClick={() => setSelectedSegs(allSegs.map((_, i) => i))} className="text-xs text-blue-400 hover:underline">
                        全选
                      </button>
                      <button onClick={() => setSelectedSegs([])} className="text-xs text-neutral-500 hover:underline">
                        清空
                      </button>
                      <button onClick={autoPickBest} className="text-xs text-emerald-400 hover:underline">
                        🎯 自动挑最佳（{MAX_MULTI_SEGMENTS} 段）
                      </button>
                    </div>
                  </div>
                )}
                {allSegs.length > 0 && (
                  <p className="text-xs text-neutral-500">
                    选中片段会合并成一段 ≤{maxRefSec}s 的参考音频，随后进入下方「① 自动去噪 → ② 创建声纹 → 试听」流程。
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {!keys.ttsApiKey && keys.ttsProvider !== "mock" && (
        <p className="text-xs text-amber-400">请先在「模型 API」面板填写 TTS API Key（演示模式除外）。</p>
      )}

      {sourceNotice && <p className="text-xs text-amber-400">{sourceNotice}</p>}
      {refSegments && refSegments.length > 1 && (
        <p className="text-xs text-emerald-500">分段拟合已开启：{refSegments.length} 段参考将合并为同一个声纹。</p>
      )}

      {/* 处理按钮 */}
      {sourceBlob && (
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-200"
            value={denoiseStrength}
            onChange={(e) => setDenoiseStrength(e.target.value as DenoiseStrength)}
          >
            <option value="light">去噪：轻</option>
            <option value="standard">去噪：标准</option>
            <option value="strong">去噪：强力</option>
          </select>
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
          {profile.provider === "mock" && (
            <p className="text-xs text-amber-400">
              ⚠ 演示模式：试听听到的是测试音，不是你的声音；Skill 包里的 voice_id 不可用于真实机器人。请换真实 TTS key（硅基流动 / Fish Audio 等）后再拟合。
            </p>
          )}

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
