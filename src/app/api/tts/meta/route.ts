import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 只读地告诉前端哪些服务商配了「内置 key」（只返回布尔，不暴露 key 本体） */
export async function GET() {
  return NextResponse.json({ builtin: { fishaudio: !!process.env.FISH_AUDIO_KEY?.trim() } });
}
