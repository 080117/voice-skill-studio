"use client";

import { useEffect, useRef, useState } from "react";

export function Recorder({ onAudio, disabled }: { onAudio: (blob: Blob) => void; disabled?: boolean }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);

  useEffect(() => () => { if (timerRef.current) window.clearInterval(timerRef.current); }, []);

  const start = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        onAudio(blob);
        setSeconds(0);
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
      startTimeRef.current = Date.now();
      timerRef.current = window.setInterval(() => setSeconds((Date.now() - startTimeRef.current) / 1000), 200);
    } catch (e) {
      setError("无法访问麦克风：" + (e as Error).message);
    }
  };

  const stop = () => {
    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      mediaRef.current.stop();
    }
    setRecording(false);
    if (timerRef.current) window.clearInterval(timerRef.current);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        {!recording ? (
          <button
            onClick={start}
            disabled={disabled}
            className="rounded-full bg-red-500 px-5 py-2 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-40"
          >
            ● 开始录音
          </button>
        ) : (
          <button onClick={stop} className="rounded-full bg-neutral-700 px-5 py-2 text-sm font-semibold text-white hover:bg-neutral-600">
            ■ 停止（{seconds.toFixed(1)}s）
          </button>
        )}
        {recording && <span className="recording-dot h-3 w-3 rounded-full bg-red-500" />}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
