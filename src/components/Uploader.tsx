"use client";

import { useRef, useState } from "react";

const MAX = 25 * 1024 * 1024;

export function Uploader({ onAudio, disabled }: { onAudio: (blob: Blob) => void; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const handle = (file?: File) => {
    setError("");
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setError("请选择音频文件（mp3/wav/m4a/webm 等）");
      return;
    }
    if (file.size > MAX) {
      setError("文件过大（上限 25MB）");
      return;
    }
    setName(file.name);
    onAudio(file);
  };

  return (
    <div className="flex flex-col gap-2">
      <input ref={inputRef} type="file" accept="audio/*" className="hidden" onChange={(e) => handle(e.target.files?.[0])} />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="rounded-md border border-dashed border-neutral-600 bg-neutral-900 px-5 py-3 text-sm text-neutral-200 hover:border-blue-500 hover:bg-neutral-800 disabled:opacity-40"
      >
        {name ? `已选择：${name}` : "⬆ 选择音频素材"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
