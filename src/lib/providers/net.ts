// 网络层：让 provider 的外部 API 请求自动走系统代理（本地访问海外服务需要）。
// 生产环境（Vercel）无代理时自动退化为原生 fetch，不受影响。
import { ProxyAgent } from "undici";
import { execSync } from "node:child_process";

function detectProxy(): string | undefined {
  const env = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY;
  if (env) return env;
  if (process.platform !== "win32") return undefined;
  try {
    const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
    const out = execSync('reg query "' + key + '" /v ProxyEnable /t REG_DWORD', { encoding: "utf8", windowsHide: true });
    const m = /0x([0-9a-fA-F]+)/.exec(out);
    if (!m || parseInt(m[1], 16) !== 1) return undefined;
    const out2 = execSync('reg query "' + key + '" /v ProxyServer /t REG_SZ', { encoding: "utf8", windowsHide: true });
    const m2 = /ProxyServer\s+REG_SZ\s+(.+)/.exec(out2);
    const server = m2?.[1]?.trim();
    if (!server) return undefined;
    return server.includes("://") ? server : "http://" + server;
  } catch {
    return undefined;
  }
}

const proxy = detectProxy();
let dispatcher: ProxyAgent | undefined;
if (proxy) {
  try {
    dispatcher = new ProxyAgent(proxy);
    console.warn("[net] 外部 API 走代理: " + proxy);
  } catch (e) {
    console.warn("[net] 代理初始化失败: " + (e as Error).message);
  }
}

/** 供 provider 使用：带代理（如有）的 fetch，不影响全局 fetch */
export function fetchWithProxy(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): ReturnType<typeof fetch> {
  if (!dispatcher) return fetch(input, init);
  return fetch(input, { ...init, dispatcher } as RequestInit);
}

export function getProxyUrl(): string | undefined {
  return proxy;
}
