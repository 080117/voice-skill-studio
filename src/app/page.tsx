"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiKeysState, VoiceProfile } from "@/lib/types";
import { EMPTY_KEYS } from "@/lib/types";
import { loadKeys, saveKeys, loadVoices, saveVoices } from "@/lib/client-store";
import { fetchTtsMeta } from "@/lib/api";
import { ApiKeysForm } from "@/components/ApiKeysForm";
import { FittingFlow } from "@/components/FittingFlow";
import { VoiceLibrary } from "@/components/VoiceLibrary";
import { ChatBot } from "@/components/ChatBot";

type Tab = "fit" | "chat" | "library";

export default function Home() {
  const [keys, setKeys] = useState<ApiKeysState>(EMPTY_KEYS);
  const [voices, setVoices] = useState<VoiceProfile[]>([]);
  const [tab, setTab] = useState<Tab>("fit");
  const [selectedVoice, setSelectedVoice] = useState<VoiceProfile | null>(null);
  const [ttsBuiltinFish, setTtsBuiltinFish] = useState(false);

  useEffect(() => {
    setKeys(loadKeys() ?? EMPTY_KEYS);
    setVoices(loadVoices());
    fetchTtsMeta().then((m) => setTtsBuiltinFish(!!m?.builtin?.fishaudio));
  }, []);

  const handleKeysChange = useCallback((k: ApiKeysState) => {
    setKeys(k);
    saveKeys(k);
  }, []);

  const handleVoiceCreated = useCallback((profile: VoiceProfile) => {
    setVoices((prev) => {
      const next = [profile, ...prev.filter((v) => v.id !== profile.id)];
      saveVoices(next);
      return next;
    });
    setSelectedVoice(profile);
  }, []);

  const handleVoicesChange = useCallback((next: VoiceProfile[]) => {
    setVoices(next);
    saveVoices(next);
  }, []);

  const tabs: { id: Tab; label: string }[] = [
    { id: "fit", label: "声音拟合" },
    { id: "chat", label: "机器人演示" },
    { id: "library", label: "我的声纹" },
  ];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Voice Skill Studio · 声音拟合</h1>
        <p className="text-sm text-neutral-400">
          朗读或上传音频 → 自动去噪 → 拟合声纹 → 下载声音 Skill 包；或让机器人用你的声纹带情感地聊天。所有模型 API 由你自带（BYOK）。
        </p>
      </header>

      <ApiKeysForm keys={keys} onChange={handleKeysChange} ttsBuiltinFish={ttsBuiltinFish} />

      <nav className="flex gap-2 border-b border-neutral-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id ? "bg-neutral-900 text-white" : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "fit" && <FittingFlow keys={keys} onVoiceCreated={handleVoiceCreated} ttsBuiltinFish={ttsBuiltinFish} />}
      {tab === "chat" && (
        <ChatBot
          keys={keys}
          voices={voices}
          selectedVoice={selectedVoice}
          ttsBuiltinFish={ttsBuiltinFish}
          onSelectVoice={setSelectedVoice}
        />
      )}
      {tab === "library" && (
        <VoiceLibrary
          keys={keys}
          voices={voices}
          onChange={handleVoicesChange}
          onSelectVoice={(v) => {
            setSelectedVoice(v);
            setTab("chat");
          }}
        />
      )}
    </main>
  );
}

