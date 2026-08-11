import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Voice Skill Studio · 声音拟合",
  description: "朗读或上传音频，自动去噪后拟合声纹，生成可下载的声音 Skill 包，并可用该声纹带情感地聊天（BYOK）。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
