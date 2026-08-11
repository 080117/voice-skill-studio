# AGENTS.md — 多 Agent 协作规则（Voice Skill Studio）

本文件约束所有参与本仓库的 agent（Codex 主编排、子代理、workbuddy/opencode 等辅助代理）。

## 角色与模型分工
| 角色 | 工具 | 模型 | 职责 |
|---|---|---|---|
| 主编排 | Codex 桌面版 | DeepSeek V4 Pro（重推理）/ V4 Flash（日常），cc-switch 切换 | 规划、写代码、跑 computer-use 浏览器验证、部署 |
| 调研/审查 | workbuddy | Kimi K3（Moonshot） | 技术调研、并行审查、踩坑排查 |
| 备用编码 | opencode | GLM-4.5 / Qwen3 | 独立编码/审查（可选） |

- Claude 全程排除：不切换、不调用、不安装。
- 国外模型（Gemini/Grok/OpenAI 等）默认不用；启用前必须先征得用户同意。
- 子代理仅用于可并行的调研/审查任务；核心实现由主编排直接执行。

## 工作流
1. 每个里程碑开始前：读 `docs/ROADMAP.md` 与 `docs/tasks/*.md`，更新任务状态。
2. 实现顺序遵循 `docs/ACCEPTANCE.md` 的验收清单；未过验收不算完成。
3. 每个 PR / 提交前：`npm run typecheck` + `npm test` + `npm run build` 全绿。
4. 涉及本机配置（模型、代理、环境变量）的改动：先快照到 `docs/backups/`，并在 `docs/REVERT.md` 登记。
5. 预算：每个里程碑前后跑 `npm run check-budget`（即 `node scripts/check-budget.mjs`）；余额低于阈值或出现 429/余额不足，立即停下并向用户报告“哪个服务 + 建议充值金额 + 充值入口”，不得擅自降级。
6. 大音频不提交 git；临时文件放 `tmp-audio/`（已 gitignore）。

## 代码约定
- 目录：`src/app`（Next App Router 页面/API）、`src/lib`（纯逻辑/适配器）、`src/components`（客户端组件）。
- 所有外部 LLM/TTS 一律走 OpenAI-compatible 适配器（见 `src/lib/providers/`）。
- BYOK：key 由前端传入请求头，服务端不落盘；key 字段见 `src/lib/types.ts`。
- 新增 provider 时：实现 `src/lib/providers/tts.ts` 中声明的接口，并在 registry 注册。
