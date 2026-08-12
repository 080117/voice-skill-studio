# 预算账本（BUDGET）

> 常驻要求：余额不足或触发 429/额度预警时，**立即向用户报告“哪个服务 + 建议充值金额 + 充值入口”**，不得擅自降级或停用功能。
> 检查命令：`node scripts/check-budget.mjs`（需先设置下方 `KEY_*` 环境变量；未设置的服务跳过）。

## 付费服务清单（开发/自测用）
| 服务 | 用途 | 预计花费 | 充值入口 | 预警阈值 | 当前状态 |
|---|---|---|---|---|---|
| DeepSeek API | Codex 主引擎（写代码/规划） | ¥50–200 | platform.deepseek.com | 余额 < ¥20 | 待确认 |
| Moonshot Kimi | workbuddy 调研/审查 | ¥20–50 | platform.moonshot.cn | 余额 < ¥10 | 待确认 |
| TTS/克隆（自测，选一） | 拟合/试听测试 | 免费额度优先，不够 ¥10–30 | 硅基流动/ Fish Audio / MiniMax 各自控制台 | 免费额度将尽 | 待确认 |

## 免费/无需付费
| 服务 | 说明 |
|---|---|
| GitHub | 公开仓库 + Actions（2000 分钟/月免费） |
| Vercel | Hobby 免费版（函数最长 10s，用流式+分块规避） |
| cc-switch | 免费工具 |
| Cursor | 免费版即可（仅编辑器） |
| ChatGPT 套餐 | 不用升级（Codex 走 DeepSeek 自定义 provider） |
| OpenCode Go（已订阅） | 文本 LLM（情感标注/机器人对话），已加网站预设，无需额外充值 |
| Fish Audio 免费模型 s2.1-pro-free | TTS/声纹克隆 $0（公平使用限流：共享 key 会被 TPM/额度限制，个人/小范围够用） |
| 国外模型（Gemini/Grok/OpenAI） | 默认不买；确需时先问用户 |

## 环境变量（余额查询用，勿提交）
- `KEY_DEEPSEEK`：DeepSeek API key（查询余额用 `GET https://api.deepseek.com/user/balance`）
- `KEY_MOONSHOT`：Moonshot API key（`GET https://api.moonshot.cn/v1/users/me/balance`）
- `KEY_SILICONFLOW`：硅基流动 API key（`GET https://api.siliconflow.cn/v1/user/info`）

## 记录
（每次里程碑检查后更新：日期 / 服务 / 余额 / 操作）
