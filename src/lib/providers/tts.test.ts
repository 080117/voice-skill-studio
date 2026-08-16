import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createVoice, synthesize, getTtsProvider } from "./tts";
import { fetchWithProxy } from "./net";

vi.mock("./net", () => ({ fetchWithProxy: vi.fn() }));

const mockFetch = vi.mocked(fetchWithProxy);

/** 构造最小 PCM wav（mono 16bit），用于验证百炼多段拼接 */
function makeWavSec(sec: number, sampleRate = 24000): Buffer {
  const dataLen = sampleRate * 2 * sec;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byteRate
  buf.writeUInt16LE(2, 32); // blockAlign
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataLen, 40);
  return buf;
}

describe("tts registry", () => {
  it("mock provider 可创建声纹并合成（无需 key）", async () => {
    const created = await createVoice({
      config: { provider: "mock", apiKey: "" },
      audioBase64: Buffer.from("dummy").toString("base64"),
      mime: "audio/wav",
      mode: "reading",
      text: "你好",
    });
    expect(created.voiceId).toMatch(/^mock-/);
    const out = await synthesize({ config: { provider: "mock", apiKey: "" }, voiceId: created.voiceId, text: "你好", emotion: "开心" });
    expect(out.mimeType).toBe("audio/wav");
    expect(out.audioBase64.length).toBeGreaterThan(100);
  });

  it("siliconflow / fishaudio 支持克隆；minimax / openai 不支持", () => {
    expect(getTtsProvider("dashscope").supportsClone).toBe(true);
    expect(getTtsProvider("siliconflow").supportsClone).toBe(true);
    expect(getTtsProvider("fishaudio").supportsClone).toBe(true);
    expect(getTtsProvider("minimax").supportsClone).toBe(false);
    expect(getTtsProvider("openai").supportsClone).toBe(false);
  });

  it("未知 provider 抛错", () => {
    expect(() => getTtsProvider("unknown" as never)).toThrow();
  });
});

describe("siliconflow 适配器（回归：新接口 /v1/uploads/audio/voice）", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("createVoice 走 /uploads/audio/voice，返回 uri 作为 voiceId", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ uri: "speech:vss-test:cm01:xyz" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const created = await createVoice({
      config: { provider: "siliconflow", apiKey: "sk-test" },
      audioBase64: Buffer.from("dummy").toString("base64"),
      mime: "audio/wav",
      mode: "reading",
      text: "参考音频的文字",
    });
    expect(created.voiceId).toBe("speech:vss-test:cm01:xyz");
    expect(created.model).toBe("FunAudioLLM/CosyVoice2-0.5B");
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("/uploads/audio/voice");
    expect(String(url)).not.toContain("/audio/voices");
    const form = init!.body as FormData;
    expect(form.get("model")).toBe("FunAudioLLM/CosyVoice2-0.5B");
    expect(String(form.get("customName"))).toMatch(/^vss-\d+$/);
    expect(form.get("text")).toBe("参考音频的文字");
    expect(form.get("file")).toBeInstanceOf(Blob);
  });

  it("synthesize 默认 FunAudioLLM/CosyVoice2-0.5B，情感走 <|endofprompt|> 且不带空格", async () => {
    mockFetch.mockResolvedValue(new Response(Buffer.from("fake-mp3"), { status: 200 }));
    const out = await synthesize({
      config: { provider: "siliconflow", apiKey: "sk-test" },
      voiceId: "speech:vss-test:cm01:xyz",
      text: "今天天气很好",
      emotion: "开心",
    });
    expect(out.mimeType).toBe("audio/mpeg");
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("/audio/speech");
    const body = JSON.parse(init!.body as string) as Record<string, unknown>;
    expect(body.model).toBe("FunAudioLLM/CosyVoice2-0.5B");
    expect(body.voice).toBe("speech:vss-test:cm01:xyz");
    expect(body.input).toBe("用开心轻快的语气，带一点笑意。<|endofprompt|>今天天气很好");
  });

  it("synthesize 平静时不加情感指令", async () => {
    mockFetch.mockResolvedValue(new Response(Buffer.from("fake-mp3"), { status: 200 }));
    await synthesize({
      config: { provider: "siliconflow", apiKey: "sk-test" },
      voiceId: "speech:vss-test:cm01:xyz",
      text: "今天天气很好",
      emotion: "平静",
    });
    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init!.body as string) as Record<string, unknown>;
    expect(body.input).toBe("今天天气很好");
  });

  it("createVoice 传 IndexTeam/IndexTTS-2：表单与返回 model 均为 IndexTTS-2", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ uri: "speech:vss-index:abc" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const created = await createVoice({
      config: { provider: "siliconflow", apiKey: "sk-test", model: "IndexTeam/IndexTTS-2" },
      audioBase64: Buffer.from("dummy").toString("base64"),
      mime: "audio/wav",
      mode: "reading",
      text: "参考文本",
    });
    expect(created.model).toBe("IndexTeam/IndexTTS-2");
    const [, init] = mockFetch.mock.calls[0];
    const form = init!.body as FormData;
    expect(form.get("model")).toBe("IndexTeam/IndexTTS-2");
  });

  it("createVoice 传多段 segments：表单含多个 file，合并为一个声纹", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ uri: "speech:vss-multi:abc" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const created = await createVoice({
      config: { provider: "siliconflow", apiKey: "sk-test" },
      mime: "audio/wav",
      mode: "clip",
      segments: [
        { audioBase64: Buffer.from("dummy1").toString("base64"), mime: "audio/wav" },
        { audioBase64: Buffer.from("dummy2").toString("base64"), mime: "audio/wav" },
      ],
    });
    expect(created.voiceId).toBe("speech:vss-multi:abc");
    const [, init] = mockFetch.mock.calls[0];
    const form = init!.body as FormData;
    const files = form.getAll("file");
    expect(files.length).toBe(2);
    expect(files.every((f) => f instanceof Blob)).toBe(true);
    expect(form.get("model")).toBe("FunAudioLLM/CosyVoice2-0.5B");
    expect(String(form.get("customName"))).toMatch(/^vss-\d+$/);
  });

  it("createVoice 无 text 时自动补占位 text（CosyVoice 声纹合成必需，否则 50507）", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ uri: "speech:vss:nt" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await createVoice({
      config: { provider: "siliconflow", apiKey: "sk-test" },
      audioBase64: Buffer.from("dummy").toString("base64"),
      mime: "audio/wav",
      mode: "clip",
    });
    const [, init] = mockFetch.mock.calls[0];
    const form = init!.body as FormData;
    expect(form.get("text")).toBe("参考音频");
  });

  it("synthesize 用 IndexTTS-2：模型透传且不注入 CosyVoice 情感指令", async () => {
    mockFetch.mockResolvedValue(new Response(Buffer.from("fake-mp3"), { status: 200 }));
    await synthesize({
      config: { provider: "siliconflow", apiKey: "sk-test", model: "IndexTeam/IndexTTS-2" },
      voiceId: "speech:vss-index:abc",
      text: "今天天气很好",
      emotion: "开心",
    });
    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init!.body as string) as Record<string, unknown>;
    expect(body.model).toBe("IndexTeam/IndexTTS-2");
    expect(body.input).toBe("今天天气很好");
  });

  it("synthesize 遇 5xx（50507 等平台抖动）自动重试，最终成功", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 50507, message: "Request failed: Unknown error." }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 50507, message: "Request failed: Unknown error." }), { status: 500 }))
      .mockResolvedValueOnce(new Response(Buffer.from("fake-mp3"), { status: 200 }));
    const out = await synthesize({
      config: { provider: "siliconflow", apiKey: "sk-test" },
      voiceId: "speech:vss:abc",
      text: "你好",
    });
    expect(out.mimeType).toBe("audio/mpeg");
    expect(mockFetch.mock.calls.length).toBe(3);
  });

  it("synthesize 遇 4xx（402/403）不重试，直接抛错", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ code: 30001, message: "Sorry, your account balance is insufficient" }), { status: 402 }),
    );
    await expect(
      synthesize({
        config: { provider: "siliconflow", apiKey: "sk-test" },
        voiceId: "speech:vss:abc",
        text: "你好",
      }),
    ).rejects.toThrow("SiliconFlow 合成 请求失败 HTTP 402");
    expect(mockFetch.mock.calls.length).toBe(1);
  });
});

describe("dashscope 适配器（阿里云百炼 Qwen3-TTS 声音复刻）", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("createVoice 走 /services/audio/tts/customization，base64 直传，返回 output.voice", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          output: { voice: "qwen-tts-vc-vsstest-voice-123", target_model: "qwen3-tts-vc-2026-01-22" },
          usage: { count: 1 },
          request_id: "r1",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const created = await createVoice({
      config: { provider: "dashscope", apiKey: "sk-ws-test" },
      audioBase64: Buffer.from("dummy-audio").toString("base64"),
      mime: "audio/wav",
      mode: "reading",
    });
    expect(created.voiceId).toBe("qwen-tts-vc-vsstest-voice-123");
    expect(created.model).toBe("qwen3-tts-vc-2026-01-22");
    expect(created.emotionControl).toEqual(["none"]);
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("/services/audio/tts/customization");
    const body = JSON.parse(init!.body as string) as Record<string, any>;
    expect(body.model).toBe("qwen-voice-enrollment");
    expect(body.input.action).toBe("create");
    expect(body.input.target_model).toBe("qwen3-tts-vc-2026-01-22");
    expect(body.input.preferred_name).toMatch(/^vss\d+$/);
    expect(String(body.input.audio.data)).toContain("data:audio/wav;base64,");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer sk-ws-test");
  });

  it("synthesize 走 multimodal-generation，再下载 OSS 音频 URL 返回 base64", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output: { audio: { url: "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/xxx.wav?Expires=1" }, finish_reason: "stop" },
            usage: { characters: 5 },
            request_id: "r2",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response(Buffer.from("fake-wav-bytes"), { status: 200, headers: { "Content-Type": "audio/x-wav" } }));
    const out = await synthesize({
      config: { provider: "dashscope", apiKey: "sk-ws-test" },
      voiceId: "qwen-tts-vc-voice-123",
      text: "你好，测试一下。",
      emotion: "平静",
    });
    expect(out.mimeType).toBe("audio/x-wav");
    expect(out.audioBase64).toBe(Buffer.from("fake-wav-bytes").toString("base64"));
    const [url1, init1] = mockFetch.mock.calls[0];
    expect(String(url1)).toContain("/services/aigc/multimodal-generation/generation");
    const body = JSON.parse(init1!.body as string) as Record<string, any>;
    expect(body.model).toBe("qwen3-tts-vc-2026-01-22");
    expect(body.input.voice).toBe("qwen-tts-vc-voice-123");
    expect(body.input.text).toBe("你好，测试一下。");
    expect(String(mockFetch.mock.calls[1][0])).toContain("dashscope-result-bj.oss-cn-beijing");
    expect(mockFetch.mock.calls.length).toBe(2);
  });

  it("无 key：抛明确错误（无内置兜底）", async () => {
    await expect(
      createVoice({
        config: { provider: "dashscope", apiKey: "" },
        audioBase64: Buffer.from("dummy").toString("base64"),
        mime: "audio/wav",
        mode: "clip",
      }),
    ).rejects.toThrow("阿里云百炼 未配置 API key");
  });

  it("createVoice 传多段 segments：服务端拼接为一段 base64（上限内）", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ output: { voice: "qwen-tts-vc-multi-1" }, usage: { count: 1 }, request_id: "r3" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const wav1 = makeWavSec(1);
    const wav2 = makeWavSec(1);
    await createVoice({
      config: { provider: "dashscope", apiKey: "sk-ws-test" },
      mime: "audio/wav",
      mode: "clip",
      segments: [
        { audioBase64: wav1.toString("base64"), mime: "audio/wav" },
        { audioBase64: wav2.toString("base64"), mime: "audio/wav" },
      ],
    });
    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init!.body as string) as Record<string, any>;
    const dataUrl: string = body.input.audio.data;
    expect(dataUrl.startsWith("data:audio/wav;base64,")).toBe(true);
    const merged = Buffer.from(dataUrl.split(",")[1], "base64");
    // 两段 1s 24k mono 16bit 拼接：44 字节头 + 2 * (24000*2) 字节 PCM
    expect(merged.length).toBe(44 + 2 * 24000 * 2);
  });

  it("synthesize 遇 429 自动重试，最终成功", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "Throttling", message: "限流" }), { status: 429 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ output: { audio: { url: "https://x.example/1.wav" } } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(Buffer.from("ok"), { status: 200 }));
    const out = await synthesize({ config: { provider: "dashscope", apiKey: "sk-ws-test" }, voiceId: "v1", text: "你好" });
    expect(out.mimeType).toBe("audio/wav");
    expect(mockFetch.mock.calls.length).toBe(3);
  });
});

describe("fishaudio 适配器（纯 BYOK：只认用户填的 key）", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("createVoice 用用户 key，走 /model 创建声纹", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ _id: "fa-voice-1" }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    const created = await createVoice({
      config: { provider: "fishaudio", apiKey: "sk-user-own" },
      audioBase64: Buffer.from("dummy").toString("base64"),
      mime: "audio/wav",
      mode: "reading",
    });
    expect(created.voiceId).toBe("fa-voice-1");
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("/model");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer sk-user-own");
  });

  it("synthesize 用用户 key 和默认免费模型 s2.1-pro-free", async () => {
    mockFetch.mockResolvedValue(new Response(Buffer.from("fake-mp3"), { status: 200 }));
    const out = await synthesize({
      config: { provider: "fishaudio", apiKey: "sk-user-own" },
      voiceId: "fa-voice-1",
      text: "你好",
    });
    expect(out.mimeType).toBe("audio/mpeg");
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("/v1/tts");
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-user-own");
    expect(headers.model).toBe("s2.1-pro-free");
  });

  it("无 key：抛明确错误（无内置兜底）", async () => {
    await expect(
      createVoice({
        config: { provider: "fishaudio", apiKey: "" },
        audioBase64: Buffer.from("dummy").toString("base64"),
        mime: "audio/wav",
        mode: "reading",
      }),
    ).rejects.toThrow("Fish Audio 未配置 API key");
  });
});
