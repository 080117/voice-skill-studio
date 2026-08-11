# Acceptance Criteria（验收清单）

## 全局
- [x] `npm run typecheck`、`npm test`、`npm run build` 全绿
- [x] CI（GitHub Actions）通过
- [x] 无敏感信息提交到 git（key/token/音频）
- [x] 配置改动已登记 REVERT.md 并备份

## M1 拟合 MVP
- [x] 朗读模式：录音 → 去噪 → 创建声纹 → 试听
- [x] 素材模式：上传音频 → 去噪 → 创建声纹 → 试听
- [x] 素材模式（视频链接）：粘贴视频链接 → 自动抽音频 → 语音片段识别 → 勾选目标角色 → 合并 → 去噪 → 创建声纹 → 试听
- [x] 可下载 Skill 包（zip 含 SKILL.md/voice.json/reference.wav/examples）
- [x] BYOK：无 key 时给出清晰引导，不崩溃
- [x] 无效 key / 限流 / 不支持的 provider → 友好错误

## M2 情感与自然度
- [x] 文本自动情感标注（LLM）→ 映射到 TTS 情感参数
- [x] 情感预设库（平静/开心/悲伤/激动等）
- [x] 参考音频质量检测（时长/信噪比/杂音提示）
- [ ] 出 3 组相似度/情感对照音频供 A/B 试听（需真实 provider key）

## M3 内置机器人
- [x] 聊天界面（文本 + 语音播放）
- [x] 多轮上下文，机器人用用户声纹带情感说话

## M4 发布
- [x] README/部署文档完善
- [x] 多 provider 适配（≥2 个 TTS + ≥2 个 LLM）
- [ ] 上线可用（待 gh 登录/部署）；本机配置按 REVERT.md 还原（收尾）
