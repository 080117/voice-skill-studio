"use client";

import { useRef, useState } from "react";
import type { ApiKeysState, VoiceProfile } from "@/lib/types";
import { TTS_PROVIDER_META } from "@/lib/types";
import { chat as chatApi, keysToLlm, keysToTts } from "@/lib/api";
import { playAudio } from "@/lib/play";

interface Msg {
  role: "user" | "assistant";
  content: string;
  emotion?: string;
}

export function ChatBot({
  keys,
  voices,
  selectedVoice,
  onSelectVoice,
  ttsBuiltinFish = false,
}: {
  keys: ApiKeysState;
  voices: VoiceProfile[];
  selectedVoice: VoiceProfile | null;
  onSelectVoice: (v: VoiceProfile | null) => void;
  ttsBuiltinFish?: boolean;
}) {
  const [persona, setPersona] = useState("用户的声纹（自然、亲切）");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const llmReady = !!keys.llmBaseUrl && !!keys.llmApiKey && !!keys.llmModel;
  const ttsReady = keys.ttsProvider === "mock" || (keys.ttsProvider === "fishaudio" && !!ttsBuiltinFish) || !!keys.ttsApiKey;

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    if (!selectedVoice) {
      setError("请先选择声纹（可在「我的声纹」或下方选择）。");
      return;
    }
    if (!llmReady || !ttsReady) {
      setError("机器人需要 LLM + TTS 的 API Key（演示模式仅 TTS 可留空）。");
      return;
    }
    setError("");
    const userMsg: Msg = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await chatApi({
        messages: next.map((m) => ({ role: m.role, content: m.content })),
        voice: selectedVoice,
        tts: keysToTts(keys),
        llm: keysToLlm(keys)!,
        persona,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: res.replyText, emotion: res.emotion }]);
      playAudio(res.audioBase64, res.mimeType);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 声纹选择 */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
        <label className="text-sm text-neutral-300">声纹：</label>
        <select
          className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
          value={selectedVoice?.id ?? ""}
          onChange={(e) => {
            const v = voices.find((x) => x.id === e.target.value) ?? null;
            onSelectVoice(v);
            setMessages([]);
          }}
        >
          <option value="">请选择声纹</option>
          {voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.mode === "reading" ? "🎙" : "🎵"} {TTS_PROVIDER_META[v.provider]?.label ?? v.provider} · {v.providerVoiceId.slice(0, 12)}…
            </option>
          ))}
        </select>
        <input
          className="min-w-40 flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm outline-none focus:border-blue-500"
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          placeholder="人设（如：温柔的朋友）"
        />
      </div>

      {!selectedVoice && (
        <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-center text-sm text-neutral-500">
          还没有声纹。请先到「声音拟合」创建声纹。
        </div>
      )}

      {selectedVoice && (
        <>
          <div className="flex max-h-96 min-h-64 flex-col gap-3 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
            {messages.length === 0 && (
              <p className="m-auto text-sm text-neutral-500">和 TA 说点什么吧——机器人会用这个声纹带情感地回复你。</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                    m.role === "user" ? "rounded-br-sm bg-blue-600 text-white" : "rounded-bl-sm bg-neutral-800 text-neutral-100"
                  }`}
                >
                  <div>{m.content}</div>
                  {m.emotion && <div className="mt-1 text-[10px] text-neutral-400">情感：{m.emotion}</div>}
                </div>
              </div>
            ))}
            {busy && <p className="text-xs text-neutral-500">正在思考并合成语音…</p>}
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-2">
            <input
              className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-blue-500"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="输入消息，回车发送"
            />
            <button onClick={send} disabled={busy} className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40">
              发送
            </button>
          </div>
          <audio ref={audioRef} className="hidden" />
        </>
      )}
    </div>
  );
}
