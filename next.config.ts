import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 服务器端无状态：不落盘音频，BYOK key 仅随请求传递
  serverExternalPackages: [],
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
