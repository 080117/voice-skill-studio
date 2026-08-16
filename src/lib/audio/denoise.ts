// 服务端去噪：优先用本机 ffmpeg（afftdn + 高通/低通）；不可用时原样返回并标记
import { spawn } from "child_process";
import type { DenoiseStrength } from "../types";

function runFfmpeg(args: string[], input: Buffer, maxOut = 60 * 1024 * 1024): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let total = 0;
    child.stdout.on("data", (c: Buffer) => {
      total += c.length;
      if (total > maxOut) {
        child.kill();
        reject(new Error("ffmpeg 输出超限"));
        return;
      }
      chunks.push(c);
    });
    child.stderr.on("data", (c: Buffer) => errChunks.push(c));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`ffmpeg exit ${code}: ${Buffer.concat(errChunks).toString().slice(0, 300)}`));
    });
    child.stdin.write(input);
    child.stdin.end();
  });
}

export async function hasFfmpeg(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

const DENOISE_CHAINS: Record<DenoiseStrength, string> = {
  light: "highpass=f=80,afftdn=nf=-22,lowpass=f=8000",
  standard: "highpass=f=100,afftdn=nf=-30:nr=14,equalizer=f=400:t=q:w=1.2:g=-3,lowpass=f=8000",
  strong: "highpass=f=100,afftdn=nf=-38:nr=20,equalizer=f=400:t=q:w=1.2:g=-4,lowpass=f=7500",
};

export async function denoiseAudio(
  input: Buffer,
  mime: string,
  strength: DenoiseStrength = "standard",
): Promise<{ buffer: Buffer; mime: string; usedFfmpeg: boolean }> {
  try {
    const out = await runFfmpeg(
      ["-i", "pipe:0", "-af", DENOISE_CHAINS[strength] ?? DENOISE_CHAINS.standard, "-ar", "24000", "-ac", "1", "-f", "wav", "pipe:1"],
      input
    );
    return { buffer: out, mime: "audio/wav", usedFfmpeg: true };
  } catch {
    return { buffer: input, mime, usedFfmpeg: false };
  }
}
