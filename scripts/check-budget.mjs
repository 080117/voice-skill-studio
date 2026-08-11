#!/usr/bin/env node
/**
 * 预算检查脚本：查询各付费服务余额/额度。
 * 使用环境变量中的 key（不落盘、不提交）：
 *   KEY_DEEPSEEK / KEY_MOONSHOT / KEY_SILICONFLOW
 * 未设置 key 的服务自动跳过。
 * 预警阈值命中时打印醒目警告，供编排 agent 立即向用户报告。
 */
const THRESHOLDS = {
  deepseek: { warn: 20, unit: "CNY", name: "DeepSeek" },
  moonshot: { warn: 10, unit: "CNY", name: "Moonshot Kimi" },
  siliconflow: { warn: 10, unit: "CNY", name: "SiliconFlow" },
};

const services = [
  {
    id: "deepseek",
    key: process.env.KEY_DEEPSEEK,
    url: "https://api.deepseek.com/user/balance",
    parse: (json) => {
      const list = json?.balance_infos ?? [];
      const total = list.reduce((s, b) => s + Number(b.total_balance ?? 0), 0);
      return { balance: total, raw: json };
    },
  },
  {
    id: "moonshot",
    key: process.env.KEY_MOONSHOT,
    url: "https://api.moonshot.cn/v1/users/me/balance",
    parse: (json) => ({ balance: Number(json?.data?.available_balance ?? json?.available_balance ?? 0), raw: json }),
  },
  {
    id: "siliconflow",
    key: process.env.KEY_SILICONFLOW,
    url: "https://api.siliconflow.cn/v1/user/info",
    parse: (json) => {
      const used = Number(json?.data?.total_balance ?? 0);
      return { balance: used, raw: json };
    },
  },
];

async function fetchBalance(svc) {
  const res = await fetch(svc.url, { headers: { Authorization: `Bearer ${svc.key}` }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const lines = [];
const warnings = [];
for (const svc of services) {
  const meta = THRESHOLDS[svc.id];
  if (!svc.key) {
    lines.push(`  - ${meta.name}: 未设置 ${svc.id.toUpperCase()}_KEY，跳过`);
    continue;
  }
  try {
    const json = await fetchBalance(svc);
    const { balance } = svc.parse(json);
    const shown = typeof balance === "number" ? `¥${balance.toFixed(2)}` : String(balance);
    lines.push(`  - ${meta.name}: ${shown}`);
    if (typeof balance === "number" && balance < meta.warn) {
      warnings.push(`${meta.name} 余额 ¥${balance.toFixed(2)} 低于阈值 ¥${meta.warn}，需要充值！`);
    }
  } catch (err) {
    lines.push(`  - ${meta.name}: 查询失败（${err.message}），请手动到控制台查看`);
    warnings.push(`${meta.name} 余额查询失败，请手动确认（${err.message}）`);
  }
}

console.log("==== 预算检查 ====");
console.log(lines.join("\n"));
console.log("==================");
if (warnings.length) {
  console.log("\n⚠️  预警：");
  warnings.forEach((w) => console.log(`  - ${w}`));
  console.log("\n请立即向用户报告：哪个服务 + 建议充值金额 + 充值入口（见 docs/BUDGET.md）。");
  process.exit(2);
} else {
  console.log("\n✅ 无预警阈值命中。");
}
