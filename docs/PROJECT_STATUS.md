# Voice Skill Studio · 项目内容与进度（2026-08-11）

> 本文件用于快速了解项目现状。更新于 2026-08-11（代码最新 commit `fee6abd`）。

## 1. 项目一句话
声音拟合网站：朗读文本或上传音频/视频链接 → 自动去噪 → 拟合声纹 → 下载可安装的「声音 Skill 包」，并内置「带情感语音的机器人演示」。全部模型 API 由用户自带（BYOK），key 仅存浏览器 localStorage。

## 2. 里程碑进度
| 里程碑 | 目标 | 状态 |
|---|---|---|
| M0 | 协作基建：文档 / 预算脚本 / 配置快照 / CI / 工具 | ✅ 完成 |
| M1 | 拟合 MVP：录音/上传/去噪/声纹/试听/Skill 包下载 | ✅ 完成 |
| M2 | 情感与自然度：LLM 情感标注、情感预设、音频质量检测 | 🔶 核心完成（A/B 对照待补） |
| M3 | 内置机器人：聊天 + 带情感语音回复 | ✅ 完成 |
| M4 | 打磨发布：多 provider、README、上线、还原本机配置 | 🔶 进行中 |

## 3. 已实现功能
- **朗读拟合**：内置约 1 分钟范读文本（215 字），录音 → 去噪 → 创建声纹 → 试听。
- **素材拟合（音频上传）**：上传音频 → 去噪 → 创建声纹 → 试听。
- **素材拟合（视频链接）**：粘贴视频链接（B 站/通用，yt-dlp 解析，可一次粘贴多个）→ 自动抽音频 → 静音分段识别语音片段 → 勾选目标角色 → 合并 → 去噪 → 创建声纹 → 试听。
- **自动去噪**：服务端 ffmpeg（highpass 80 + afftdn + lowpass 8k），浏览器端 WebAudio 兜底。
- **参考音频质量检测**：时长 / RMS 音量 / 杂音提示。
- **情感控制（M2）**：LLM 自动情感标注（平静/开心/悲伤/激动/严肃/温柔）→ 映射 TTS 情感参数；情感预设库。
- **机器人演示（M3）**：聊天界面（文本 + 语音播放）、多轮上下文、用用户声纹带情感说话。
- **Skill 包下载**：zip 包含 `SKILL.md` + `voice.json`（schemaVersion/voiceId/provider/model/language/emotionControl/referenceAudio）+ `reference.wav` + `examples/`。
- **演示模式**：无需 key，生成测试音验证全流程（界面明确提示测试音非真实声纹）。
- **BYOK 密钥管理**：key 仅存 localStorage；可清空（保留服务选择）。

## 4. 技术栈与目录
- Next.js 15（App Router）+ TypeScript + Tailwind CSS 4 + Vitest + Playwright（自测）。
- 服务端适配器（OpenAI 兼容风格）：`src/lib/providers/llm.ts`（LLM）、`src/lib/providers/tts.ts`（TTS/克隆）。
- 音频：`src/lib/audio/denoise.ts`、`denoise-client.ts`、`video.ts`、`merge-segments.ts`。
- 路由（全 BYOK，key 前端传入、服务端不落盘）：
  - `POST /api/denoise`（multipart 音频 → 去噪 wav）
  - `POST /api/voices`（音频 + mode + 朗读文本 → 声纹）
  - `GET/DELETE /api/voices/:id`
  - `POST /api/tts`（voiceId + 文本 → 情感语音）
  - `POST /api/chat`（voiceId + 消息 → replyText + audioUrl）
  - `POST /api/video-audio`（视频链接 → 抽取音频 + 语音片段）
  - Skill 包下载在客户端生成（jszip）。
- 主要组件：`ApiKeysForm`（模型 API 配置）、`FittingFlow`（拟合流程）、`ChatBot`、`VoiceLibrary`、`Recorder`、`Uploader`。
- 文档：`docs/`（ROADMAP / ACCEPTANCE / BUDGET / REVERT / tasks/M0-M4 / backups 配置快照）。

## 5. 模型 API 配置（刚简化完，commit fee6abd）
- **LLM**：服务预设下拉——OpenCode Go（GLM-5，默认）、DeepSeek、硅基流动、智谱 GLM（免费）、自定义（高级）。选服务自动填 Base URL + 模型名，只填 Key。
- **TTS/声音克隆**：只留 3 个——硅基流动（CosyVoice，默认）、Fish Audio、演示模式。MiniMax/OpenAI TTS 从界面移除（代码保留，后续可加回）。
- 首次打开自动预选 OpenCode Go + 硅基流动，只需粘 2 个 Key。
- 说明：OpenCode Go 订阅只有文本 LLM（GLM-5/Kimi K2.5），**没有** TTS/声音克隆能力；声音克隆需 SiliconFlow / Fish Audio 等专用服务商。

## 6. 验证状态
- `npm run typecheck` ✅
- `npm test`（18 个单测）✅：wav、emotion、tts provider、video、skillpack（含 SiliconFlow 新接口回归）
- `npm run build` ✅
- Playwright E2E 全链路（录音→拟合→试听→对话→下载 zip）✅（自测通过，未入库）
- CI：GitHub Actions 工作流已配置（build + lint + test + e2e）

## 7. 预算与充值（详见 docs/BUDGET.md）
- 免费/已订阅：GitHub、Vercel Hobby、cc-switch、Cursor 免费版、OpenCode Go（已订阅，可当 LLM 用）、ChatGPT 套餐不升级。
- 待用：SiliconFlow（新用户送约 ¥16 代金券，CosyVoice 克隆+合成）→ 优先免费额度，不够再充 ¥10–20。
- 备选：Fish Audio（非付费每 30 天送 $5）。
- 规则：余额不足/429 时先告知用户充值，不擅自降级；`node scripts/check-budget.mjs` 查余额（需配 `KEY_*` 环境变量）。

## 8. 当前工作区状态（重要）
- 代码已全部提交到 `main`（最新 `fee6abd`），工作区干净（除临时调试文件已删除）。
- **SiliconFlow 创建声纹 404 已修复（fee6abd）**：旧接口 `/v1/audio/voices` 已下线，改用 `POST /v1/uploads/audio/voice`（multipart：file/model/customName/text），响应 `uri` 即声纹 ID；默认模型修正为 `FunAudioLLM/CosyVoice2-0.5B`；情感指令走 `<|endofprompt|>` 后缀；已加 3 个回归单测。
- **外部 API 走系统代理**：Fish Audio 等海外服务需代理才能访问（本机 127.0.0.1:7897）。`src/lib/providers/net.ts` 会在服务端自动读取 Windows 系统代理（或 `HTTPS_PROXY` 环境变量），并让 TTS/LLM 适配器经 `fetchWithProxy` 走代理；生产环境无代理时自动退化。
- **本地 dev 服务器运行中**（http://localhost:3000，Hidden 后台启动）。注意：`next build` 与 `next dev` 不要同时运行，共用的 `.next` 会被覆盖，导致 dev 页面 CSS 404、失去 Tailwind 样式；本次按 停 dev → build → 删 .next → 重启 dev 处理，页面已恢复。
- **重启 dev 服务器的正确方法**（注意：`Start-Process -WorkingDirectory` 传中文路径会乱码，需先 `Set-Location` 再启动）：
  ```powershell
  Set-Location "C:\Users\29234\Documents\ChatGPT\声音"
  Start-Process -FilePath "C:\Users\29234\AppData\Local\hermes\node\node.exe" `
    -ArgumentList "next","dev","-p","3000" -WindowStyle Hidden
  ```
  然后访问 http://localhost:3000。

## 9. 下一步（按优先级）
1. ~~重启本地 dev 服务器，确认 UI 恢复正常~~ ✅ 已完成：dev 运行中，首页 200，`/api/voices` 路由正常（空 body 返回 400 校验）。
2. 用户本地实测：填 OpenCode Go key（LLM）+ SiliconFlow key（TTS/克隆）→ 试音质与情感；出 3 组 A/B 对照音频（ACCEPTANCE M2 待办）。
3. 部署：安装并登录 `gh` CLI → 推送 GitHub 仓库 `voice-skill-studio` → Vercel 导入（注意 Hobby 10s 函数限制，已用流式/分块规避）。
4. 可选：说话人分离模型做视频多角色自动区分（需用户同意）；阿里云百炼 CosyVoice 适配器（用户确认后加）。
5. 收尾：按 `docs/REVERT.md` 还原本机配置（.codex/config.toml、cc-switch、opencode 配置、环境变量），快照在 `docs/backups/`。
6. workbuddy（Kimi K3）尚未配置，待用户提供 key/同意。

## 10. 关键约束（用户明确）
- Claude 全程排除；国外模型启用前先问用户。
- 无 NVIDIA GPU（AMD 780M / 15GB）→ 零样本克隆 API，不做本地训练。
- 中文 UI、BYOK 即鉴权、无账号系统。
- 预算不足 → 告知用户充值；项目完成后按 REVERT.md 还原所有本机配置改动（保留新仓库与 CI）。