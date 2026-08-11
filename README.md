# Voice Skill Studio · 声音拟合网站

用「朗读一段文本」或「上传一段音频」，自动去噪后拟合声纹，生成**可下载的声音 Skill 包**；网站内置**机器人演示**，可用该声纹带情感地说话。

- **BYOK**：使用网站需自带模型 API（LLM + TTS/克隆，默认国内 provider，OpenAI-compatible）。
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
1. 在「API Keys」面板填入你的 LLM key（DeepSeek/Kimi/GLM/Qwen 等 OpenAI-compatible）与 TTS/克隆 key（硅基流动 CosyVoice / Fish Audio / MiniMax / OpenAI TTS）。
2. 选择模式：**朗读拟合**（读屏幕上的文本）或 **音频/视频拟合**（上传音频，或粘贴视频链接自动抽取音频并按片段选择目标角色）。
3. 自动去噪 → 创建声纹 → 试听。
4. 下载 Skill 包（zip：SKILL.md + voice.json + 去噪参考音频 + 情感示例）。
5. 打开「机器人演示」：与机器人聊天，机器人用你的声纹带情感说话。

> 隐私：key 仅存于浏览器 localStorage，可导出/导入；服务端不保存任何 key 与音频。

## 里程碑
见 `docs/ROADMAP.md`。


## 部署（免费）
1. 推到 GitHub（公开仓库）→ 在 Vercel 导入该仓库。
2. 无需配置任何环境变量：网站是 BYOK，所有 key 由用户在前端填写。
3. 注意：Vercel Hobby 版函数最长 10 秒，长文本 TTS 可能超时；v1 已尽量用浏览器端处理 + 分块规避。若不够用，可升级 Pro 或把后端换到 Cloudflare Workers 等免费平台。

## 多 Agent 协作
本项目由 Codex 主编排 + 子代理/辅助代理协作开发，规则见 `AGENTS.md`；预算与配置还原见 `docs/BUDGET.md` 与 `docs/REVERT.md`。
