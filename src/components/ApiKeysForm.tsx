"use client";

import { useState } from "react";
import type { ApiKeysState, TtsProviderId } from "@/lib/types";
import { DEFAULT_TTS_BASE_URLS, EMPTY_KEYS, TTS_PROVIDER_META, TTS_PROVIDER_LABELS } from "@/lib/types";

export function ApiKeysForm({ keys, onChange }: { keys: ApiKeysState; onChange: (k: ApiKeysState) => void }) {
  const [open, setOpen] = useState(false);
  const [showLlmKey, setShowLlmKey] = useState(false);
  const [showTtsKey, setShowTtsKey] = useState(false);

  const set = (patch: Partial<ApiKeysState>) => onChange({ ...keys, ...patch });

  const onProviderChange = (provider: TtsProviderId) => {
    const baseUrl = keys.ttsBaseUrl || DEFAULT_TTS_BASE_URLS[provider];
    set({ ttsProvider: provider, ttsBaseUrl: baseUrl });
  };

  const inputCls =
    "w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 outline-none focus:border-blue-500";

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/50">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
      >
        <span>🔑 模型 API（BYOK · 仅存本浏览器，可随时清空）</span>
        <span className="text-neutral-400">{open ? "收起 ▲" : "展开 ▼"}</span>
      </button>

      {open && (
        <div className="grid gap-4 border-t border-neutral-800 px-4 py-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">LLM（情感标注 / 机器人对话）</h3>
            <input className={inputCls} placeholder="Base URL，如 https://api.deepseek.com/v1" value={keys.llmBaseUrl} onChange={(e) => set({ llmBaseUrl: e.target.value })} />
            <div className="relative">
              <input
                className={inputCls}
                type={showLlmKey ? "text" : "password"}
                placeholder="API Key（DeepSeek / Kimi / GLM / Qwen…）"
                value={keys.llmApiKey}
                onChange={(e) => set({ llmApiKey: e.target.value })}
              />
              <button type="button" onClick={() => setShowLlmKey((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-neutral-500">
                {showLlmKey ? "隐藏" : "显示"}
              </button>
            </div>
            <input className={inputCls} placeholder="模型名，如 deepseek-chat / moonshot-v1-8k / glm-4-flash" value={keys.llmModel} onChange={(e) => set({ llmModel: e.target.value })} />
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">TTS / 声音克隆</h3>
            <select className={inputCls} value={keys.ttsProvider} onChange={(e) => onProviderChange(e.target.value as TtsProviderId)}>
              {(Object.keys(TTS_PROVIDER_LABELS) as TtsProviderId[]).map((p) => (
                <option key={p} value={p}>{TTS_PROVIDER_LABELS[p]}</option>
              ))}
            </select>
            <div className="relative">
              <input
                className={inputCls}
                type={showTtsKey ? "text" : "password"}
                placeholder="TTS API Key（演示模式可留空）"
                value={keys.ttsApiKey}
                onChange={(e) => set({ ttsApiKey: e.target.value })}
              />
              <button type="button" onClick={() => setShowTtsKey((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-neutral-500">
                {showTtsKey ? "隐藏" : "显示"}
              </button>
            </div>
            <input className={inputCls} placeholder="Base URL（默认已按 provider 填好）" value={keys.ttsBaseUrl} onChange={(e) => set({ ttsBaseUrl: e.target.value })} />
            <input className={inputCls} placeholder="模型（可选，如 CosyVoice2-0.5B）" value={keys.ttsModel} onChange={(e) => set({ ttsModel: e.target.value })} />
            <p className="text-xs text-neutral-500">
              {keys.ttsProvider === "mock"
                ? "演示模式：不需要 key，生成测试音验证全流程。"
                : TTS_PROVIDER_META[keys.ttsProvider].supportsClone
                  ? "该服务商支持上传音频创建声纹。"
                  : "该服务商不支持 API 上传克隆：请在控制台先完成声音复刻，再在拟合页输入已有 voice_id。"}
            </p>
          </div>

          <div className="md:col-span-2 flex gap-2">
            <button onClick={() => onChange(EMPTY_KEYS)} className="rounded-md border border-neutral-700 px-3 py-2 text-xs text-neutral-300 hover:bg-neutral-800">
              清空全部
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
