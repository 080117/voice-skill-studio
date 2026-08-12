# Voice Skill Studio · 声音拟合网站

用「朗读一段文本」或「上传一段音频」，自动去噪后拟合声纹，生成**可下载的声音 Skill 包**；网站内置**机器人演示**，可用该声纹带情感地说话。

- **BYOK**：使用网站需自带模型 API（LLM + TTS/克隆，默认国内 provider，OpenAI-compatible）。Fish Audio 可选：站长在服务器配置 `FISH_AUDIO_KEY` 后，访客可留空 key 直接用网站内置的免费 Fish 音色/声纹克隆。
- 技术栈：Next.js 15 (App Router) + TypeScript + Tailwind CSS，免费托管（Vercel/GitHub Pages）。
- 架构说明、验收标准、预算与还原机制见 `docs/`。

## 快速开始
```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 单元测试
npm run typecheck  # 类型检查
npm run build      # 生产构建
```

## 使用流程（对用户）
1. 在「API Keys」面板填入你的 LLM key 与 TTS/克隆 key。LLM 内置国内模型预设（DeepSeek / 智谱 GLM / Moonshot Kimi / 阿里云百炼 Qwen / OpenCode Go），也可自定义任意 OpenAI-compatible 服务；TTS 推荐 **Fish Audio**（见下方免费说明），也可用硅基流动 CosyVoice。
2. 选择模式：**朗读拟合**（读屏幕上的文本）或 **音频/视频拟合**（上传音频，或粘贴视频链接自动抽取音频并按片段选择目标角色）。
3. 自动去噪 → 创建声纹 → 试听。
4. 下载 Skill 包（zip：SKILL.md + voice.json + 去噪参考音频 + 情感示例）。
5. 打开「机器人演示」：与机器人聊天，机器人用你的声纹带情感说话。

> 隐私：key 仅存于浏览器 localStorage，可导出/导入；服务端不保存任何 key 与音频。

## 模型与免费额度

### LLM（情感标注 / 机器人对话）
内置国内模型预设，OpenAI-compatible，填 key 即用：**OpenCode Go（GLM-5）**、**DeepSeek**、**硅基流动 SiliconFlow**、**智谱 GLM（免费）**、**Moonshot Kimi**、**阿里云百炼 Qwen**；也支持自定义任意兼容服务（OpenAI / 本地 Ollama 等）。

### TTS / 声音克隆
- **Fish Audio（免费可用，推荐）**：官方 `s2.1-pro-free` 模型 **$0**（公平使用限流），免费档**包含声纹克隆**。自己注册一个 key 即可：打开 https://fish.audio → 注册/登录 → 控制台 → **API Keys** → 新建一个 key，粘贴到网站「API Keys」面板的 TTS 栏。站长也可在服务器配置 `FISH_AUDIO_KEY` 环境变量作内置兜底（用户留空 key 直接用、填自己的 key 优先）。
- **硅基流动 SiliconFlow（CosyVoice）**：BYOK；上传音色克隆需账号实名认证。
- **演示模式**：无需 key，生成测试音验证全流程（非真实声纹）。

## 里程碑
见 `docs/ROADMAP.md`。


## 依赖
- ffmpeg（本机已装，用于去噪/视频抽音频/分段）
- yt-dlp（已装 2026.07.04，用于解析 YouTube/B 站等视频链接；若换机器需自行安装并确保在 PATH）

## 部署（免费，Vercel）
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2F080117%2Fvoice-skill-studio)

1. 点击上方按钮（或用 GitHub 账号登录 vercel.com → New Project → Import Git Repository → 选择 `080117/voice-skill-studio`）。
2. 框架自动识别为 Next.js，无需改配置；点 Deploy 即得 `https://voice-skill-studio.vercel.app`。
3. 可选：要给访客内置免费 Fish 音色 → Project → Settings → Environment Variables 加 `FISH_AUDIO_KEY`（仅服务端使用，不下发前端）。不配置则维持纯 BYOK：所有 key 由用户在前端填写。
4. 说明：Vercel 免费版没有 ffmpeg/yt-dlp，**「视频链接拟合」在 Vercel 上不可用**（录音/上传音频/去噪/克隆/试听/聊天/Skill 包下载都正常，去噪走浏览器端降级）。若需要视频链接功能，请部署到自带 ffmpeg/yt-dlp 的服务器（如云主机）。

## 多 Agent 协作
本项目由 Codex 主编排 + 子代理/辅助代理协作开发，规则见 `AGENTS.md`；预算与配置还原见 `docs/BUDGET.md` 与 `docs/REVERT.md`。
