"use client";

import { useState } from "react";
import type { ApiKeysState, TtsProviderId } from "@/lib/types";
import {
  DEFAULT_TTS_MODELS,
  DEFAULT_TTS_BASE_URLS,
  EMPTY_KEYS,
  LLM_PRESETS,
  TTS_MODEL_OPTIONS,
  TTS_PROVIDER_META,
  TTS_PROVIDER_OPTIONS,
  TTS_PROVIDER_LABELS,
} from "@/lib/types";

const RECOMMENDED_LLM = LLM_PRESETS[0];

/** 由已保存的 baseUrl/model 反推当前选中的 LLM 预设 id */
function presetIdFor(keys: ApiKeysState): string {
  if (keys.llmBaseUrl || keys.llmModel) {
    const hit = LLM_PRESETS.find(
      (p) => p.id !== "custom" && p.baseUrl === keys.llmBaseUrl && p.model === keys.llmModel,
    );
    return hit?.id ?? "custom";
  }
  return RECOMMENDED_LLM.id;
}

export function ApiKeysForm({ keys, onChange }: { keys: ApiKeysState; onChange: (k: ApiKeysState) => void }) {
  const [open, setOpen] = useState(false);
  const [showLlmKey, setShowLlmKey] = useState(false);
  const [showTtsKey, setShowTtsKey] = useState(false);

  const set = (patch: Partial<ApiKeysState>) => onChange({ ...keys, ...patch });

  const onProviderChange = (provider: TtsProviderId) => {
    set({ ttsProvider: provider, ttsBaseUrl: DEFAULT_TTS_BASE_URLS[provider], ttsModel: DEFAULT_TTS_MODELS[provider] });
  };

  const onLlmPresetChange = (id: string) => {
    if (id === "custom") return; // 保留当前值，展开高级输入
    const p = LLM_PRESETS.find((x) => x.id === id);
    if (p) set({ llmBaseUrl: p.baseUrl, llmModel: p.model });
  };

  const llmPresetId = presetIdFor(keys);
  const isCustomLlm = llmPresetId === "custom";
  const ttsModelOptions = TTS_MODEL_OPTIONS[keys.ttsProvider] ?? [];
  // 兼容旧存档里 ttsModel 为空：展示时归一化到该服务商默认模型（适配器内同样有兜底）
  const ttsModelValue = keys.ttsModel || DEFAULT_TTS_MODELS[keys.ttsProvider] || "";

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
            <select className={inputCls} value={llmPresetId} onChange={(e) => onLlmPresetChange(e.target.value)}>
              {LLM_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            {isCustomLlm && (
              <>
                <input className={inputCls} placeholder="Base URL，如 https://api.deepseek.com/v1" value={keys.llmBaseUrl} onChange={(e) => set({ llmBaseUrl: e.target.value })} />
                <input className={inputCls} placeholder="模型名，如 deepseek-chat" value={keys.llmModel} onChange={(e) => set({ llmModel: e.target.value })} />
              </>
            )}
            <div className="relative">
              <input
                className={inputCls}
                type={showLlmKey ? "text" : "password"}
                placeholder="API Key"
                value={keys.llmApiKey}
                onChange={(e) => set({ llmApiKey: e.target.value })}
              />
              <button type="button" onClick={() => setShowLlmKey((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-neutral-500">
                {showLlmKey ? "隐藏" : "显示"}
              </button>
            </div>
            {!isCustomLlm && <p className="text-xs text-neutral-500">选好服务后只需填 Key，Base URL 和模型名已自动填好。</p>}
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">声音克隆 / TTS</h3>
            <select className={inputCls} value={keys.ttsProvider} onChange={(e) => onProviderChange(e.target.value as TtsProviderId)}>
              {TTS_PROVIDER_OPTIONS.map((p) => (
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
            {ttsModelOptions.length > 0 && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-neutral-500">模型（声纹创建与合成共用）</label>
                <select className={inputCls} value={ttsModelValue} onChange={(e) => set({ ttsModel: e.target.value })}>
                  {ttsModelOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            )}
            <p className="text-xs text-neutral-500">
              {keys.ttsProvider === "mock"
                ? "演示模式：不需要 key，生成测试音验证全流程。"
                : TTS_PROVIDER_META[keys.ttsProvider].supportsClone
                  ? "该服务商支持上传音频创建声纹，只需填 Key。"
                  : "该服务商不支持 API 上传克隆：请在控制台先完成声音复刻，再在拟合页输入已有 voice_id。"}
            </p>
            {keys.ttsProvider === "siliconflow" && (
              <p className="text-xs text-neutral-500">
                小提示：首次使用需先在硅基流动控制台完成<b>实名认证</b>，并在「模型广场」把 CosyVoice / IndexTTS-2 点<b>开通</b>；报 30003「Model disabled」就是这个没弄好。同一把 key 也能填到上方 LLM（同一账号通用）。
              </p>
            )}
            {keys.ttsProvider === "dashscope" && (
              <p className="text-xs text-neutral-500">
                小提示：填百炼「通用 API Key」（<b>sk-ws- 开头</b>）即可。声音复刻用 <b>Qwen3-TTS-VC</b>，直接上传音频建声纹、无需公网 URL；同一把 key 也能填到上方 LLM（选「阿里云百炼 Qwen」）。
              </p>
            )}
          </div>

          <div className="md:col-span-2 flex gap-2">
            <button onClick={() => onChange(EMPTY_KEYS)} className="rounded-md border border-neutral-700 px-3 py-2 text-xs text-neutral-300 hover:bg-neutral-800">
              清空 API Key（保留服务选择）
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
