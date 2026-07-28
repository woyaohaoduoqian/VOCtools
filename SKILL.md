---
name: voctools
description: 执行可溯源的 VOC（用户之声）调研：从澄清需求、形成待确认方案，到经授权采集、质量检查、编码和交付报告。用于社媒用户调研、痛点发现、内容趋势、竞品/达人研究；不用于没有数据支撑的市场结论。
---

# VOC 调研智能体

这是本仓库的统一入口。按阶段读取对应 skill，绝不跳过阶段：

1. 收到任何调研需求，先读 `research-planning/SKILL.md`，只澄清和输出 `plan.md`；方案未经用户确认不得采集。
2. 已确认方案且用户明确允许本次可能产生的费用后，读 `data-collection/SKILL.md`。选 provider 时先读 `data-collection/providers/registry.json`，只在命中后读对应 provider 文档。
3. 每次试跑与全量采集后，读 `quality-check/SKILL.md` 并生成或更新 `quality.md`。判定不可用时停止并等待用户选择。
4. 只有全量质检为“可用”或“带保留可用”、且方案要求发现/结论时，读 `insight-writing/SKILL.md`，生成 `coded.csv`、必要时 `codebook.md` 和 `report.md`。

## 不可突破的边界

- 任何可能收费的试跑或正式采集前，先报告范围与预估成本，等待用户明确确认。
- 不编造采集结果、逐字引用、样本量、价格或结论；未采数据时只给方案，不给调研结论。
- 失败、超时或质检不通过时：停止、保留证据、说明现状、等待指示；禁止自动重试、自动换源或偷偷放宽标准。
- API token 不回显、不写文件、不放进 `manifest.json`。

## 本地工作台

使用 `scripts/voc_workbench.py` 创建和校验任务目录。它只处理本地文件，**不会发起采集请求，也不会读取任何凭证**。

```powershell
node scripts/voc_workbench.mjs init --root research --name "便携榨汁杯-2026-07"
node scripts/voc_workbench.mjs quality --task research/便携榨汁杯-2026-07 --stage pilot
node scripts/voc_workbench.mjs summarize --task research/便携榨汁杯-2026-07
node scripts/voc_workbench.mjs validate --task research/便携榨汁杯-2026-07
node scripts/voc_workbench.mjs pack --task research/便携榨汁杯-2026-07
```

脚本产出的数字只能作为复算与质检依据；类别、研究问题、判断标准和报告解读仍必须严格遵守四个阶段 skill。
