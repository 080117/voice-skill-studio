# 还原清单（REVERT）

> 目的：项目完成后，把所有改动过的本机配置**还原到原样**，保留的只有新仓库与 CI。
> 规则：任何改动前先在 `docs/backups/` 存快照并在此登记。

## 已备份/已改动项
| 项 | 路径 | 原值摘要（项目开始前） | 改动后 | 是否已还原 |
|---|---|---|---|---|
| Codex 模型配置 | `~/.codex/config.toml` | model=`deepseek-v4-flash`；model_provider=`custom` → DeepSeek（api.deepseek.com） | 未改 | ☐ |
| cc-switch 当前 provider | `~/.cc-switch/settings.json` / db | currentProviderCodex=`68df8567-6c7e-4784-81ab-970ad840a0b8`（DeepSeek） | 未改 | ☐ |
| opencode 配置 | `~/.config/opencode/opencode.jsonc` | 仅 `$schema`，无 provider 配置 | 未改 | ☐ |
| 环境变量 | 相关 `KEY_*` / 代理变量 | 无 KEY_* 相关变量 | 未改 | ☐ |
| git 身份 | `git config user.name/email` | `080117` / `080117@users.noreply.github.com` | 未改 | ☐ |

## 还原步骤（项目完成后执行）
1. 用 `docs/backups/` 中的快照恢复上述文件/变量（快照时间戳见 backups 目录）。
2. 删除项目过程中新增的临时 key 与代理配置。
3. 运行核对：`.codex/config.toml` 回原模型、opencode 配置回原样、cc-switch 当前 provider 恢复。
4. 勾选上表并提交最终核对记录。

> 注意：`~/.codex/auth.json`、`.cc-switch/cc-switch.db` 含敏感 token，**不做仓库内备份**；如确需备份请放到仓库外目录。
