import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createVoice, synthesize, getTtsProvider } from "./tts";
import { fetchWithProxy } from "./net";

vi.mock("./net", () => ({ fetchWithProxy: vi.fn() }));

const mockFetch = vi.mocked(fetchWithProxy);

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
});

describe("fishaudio 适配器（内置 key 兜底 FISH_AUDIO_KEY）", () => {
  const envKey = "sk-builtin-fish";
  let savedKey: string | undefined;
  beforeEach(() => {
    mockFetch.mockReset();
    savedKey = process.env.FISH_AUDIO_KEY;
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.FISH_AUDIO_KEY;
    else process.env.FISH_AUDIO_KEY = savedKey;
  });

  it("createVoice：无 key + 内置 key 存在时用内置 key", async () => {
    process.env.FISH_AUDIO_KEY = envKey;
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ _id: "fa-voice-1" }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    const created = await createVoice({
      config: { provider: "fishaudio", apiKey: "" },
      audioBase64: Buffer.from("dummy").toString("base64"),
      mime: "audio/wav",
      mode: "reading",
    });
    expect(created.voiceId).toBe("fa-voice-1");
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("/model");
    expect((init!.headers as Record<string, string>).Authorization).toBe(`Bearer ${envKey}`);
  });

  it("synthesize：无 key + 内置 key 存在时用内置 key 和默认免费模型", async () => {
    process.env.FISH_AUDIO_KEY = envKey;
    mockFetch.mockResolvedValue(new Response(Buffer.from("fake-mp3"), { status: 200 }));
    const out = await synthesize({
      config: { provider: "fishaudio", apiKey: "" },
      voiceId: "fa-voice-1",
      text: "你好",
    });
    expect(out.mimeType).toBe("audio/mpeg");
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("/v1/tts");
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${envKey}`);
    expect(headers.model).toBe("s2.1-pro-free");
  });

  it("用户 key 优先于内置 key", async () => {
    process.env.FISH_AUDIO_KEY = envKey;
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ _id: "fa-voice-2" }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    await createVoice({
      config: { provider: "fishaudio", apiKey: "sk-user-own" },
      audioBase64: Buffer.from("dummy").toString("base64"),
      mime: "audio/wav",
      mode: "reading",
    });
    const [, init] = mockFetch.mock.calls[0];
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer sk-user-own");
  });

  it("无 key 且无内置 key：抛明确错误", async () => {
    delete process.env.FISH_AUDIO_KEY;
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
