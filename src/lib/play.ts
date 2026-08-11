// 鎾斁 base64 闊抽
export function audioSrc(base64: string, mimeType: string): string {
  return `data:${mimeType || "audio/mpeg"};base64,${base64}`;
}

export function playAudio(base64: string, mimeType: string): HTMLAudioElement {
  const a = new Audio(audioSrc(base64, mimeType));
  a.play().catch(() => {});
  return a;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(";base64,");
      resolve(idx >= 0 ? result.slice(idx + 8) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function base64ToBlob(b64: string, mimeType: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mimeType || "audio/wav" });
}