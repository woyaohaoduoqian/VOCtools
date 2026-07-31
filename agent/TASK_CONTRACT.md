# VOC 调研任务合同 v2

本文件只定义跨阶段信息合同。阶段操作方法由 `workflows/` 维护；平台语境和 Provider 调用分别由 `platforms/` 与 `providers/` 维护。

## 1. 版本

- 新任务使用 `schema_version: 2`。
- v1 任务可被识别，但不得静默按 v2 解释；先运行工作台 `migrate`。
- 文件结构或字段语义变化时提升 schema 版本。仅文案修订不提升版本。

## 2. 单一事实源与 Schema

| 信息 | 权威文件 | Schema |
|---|---|---|
| 全局研究状态 | `research.json` | `schemas/research.schema.json` |
| 来源需求 | `source-requirements.json` | `schemas/source-requirements.schema.json` |
| Provider 绑定 | `provider-binding.json` | `schemas/provider-binding.schema.json` |
| 采集运行 | `collection/collection-run.json` | `schemas/collection-run.schema.json` |
| 请求事件 | `collection/requests.jsonl` | 每行符合 `schemas/request-event.schema.json` |
| 标准化记录 | `collection/records.csv` | 本文件 CSV 合同 |
| 采集质量 | `quality/collection-quality.json` | `schemas/collection-quality.schema.json` |
| 分析单位/主类别 | `analysis-units.csv` | 本文件 CSV 合同 |
| 证据关系 | `evidence-links.csv` | 本文件 CSV 合同 |
| 二次编码审计 | `coding-audit.csv` | 本文件 CSV 合同 |
| 分析质量 | `quality/analysis-quality.json` | `schemas/analysis-quality.schema.json` |
| 样本内发现 | `findings.csv` | 本文件 CSV 合同 |
| 需求解读 | `insights.md` | `templates/insight-card.md` |
| 产品假设 | `hypotheses.csv` | 本文件 CSV 合同 |
| 交付版本与哈希 | `交付/审阅数据/交付元数据.json` | `schemas/delivery-metadata.schema.json` |

## 3. 统一 ID

| 对象 | 前缀 |
|---|---|
| 研究问题 | `RQ` |
| 查询 | `Q` |
| 采集记录 | `R` |
| 分析单位 | `U` |
| 证据关系 | `E` |
| 编码 | `CODE` |
| 发现 | `F` |
| 洞察 | `I` |
| 产品假设 | `H` |
| 限制 | `L` |
| 采集运行 | `RUN` |
| 请求 | `REQ` |

ID 在研究内唯一、创建后不可复用。完整关系为 `RQ → Q → R → U → E → F → I → H`；限制 `L` 可关联任一研究或分析对象。

## 4. 状态枚举

- 全局状态：`draft`、`awaiting_confirmation`、`authorized`、`running`、`blocked`、`completed`、`cancelled`
- 阶段：`intake`、`design`、`capability`、`collection`、`collection_quality`、`analysis`、`analysis_quality`、`synthesis`、`delivery`
- 阶段闸门：`not_started`、`pending`、`passed`、`passed_with_limitations`、`failed`
- 请求状态：`planned`、`in_progress`、`succeeded`、`failed`、`unknown`、`cancelled`
- 质量判定：`usable`、`usable_with_limitations`、`unusable`、`collection_incomplete`
- Provider 类型：`rest_api`、`mcp`、`self_hosted`、`browser`
- Provider 状态：`integrated`、`candidate`、`evaluation_required`、`disabled`
- 证据角色：`primary`、`supporting`、`counterexample`、`context`、`exclusion_basis`
- 证据等级：`single_observation`、`repeated_pattern`、`stable_within_sample`、`insufficient_data`
- 正式交付状态：finding 为 `accepted`；产品假设为 `proposed`

状态字段只写枚举；解释写入独立的 `reason`、`limitations` 或 `errors` 字段。

合法推进为九阶段顺序：`entered` 只能进入当前或下一阶段，`passed`、`blocked`、`completed` 只能记录在当前阶段，`returned` 只能回到更早阶段。任何退回都必须追加 `research.json.stage_history`；不得只改 `current_stage`。进入采集前，`research.json.approvals` 必须存在方案、查询计划、Provider 绑定和采集范围的有效确认，且哈希与当前文件一致。

## 5. 空值

- 空字符串：应采集字段未成功取得。
- `not_stated`：用户原文没有提及。
- `unknown`：信息可能存在但无法判断。
- `not_applicable`：字段不适用于该记录。
- `0`：真实观测值为零。

不得用“无”或 `0` 代替缺失值。

## 6. 九阶段交接

| 阶段 | 必需输入 | 固定输出 |
|---|---|---|
| 1 需求归一化 | 用户需求 | `intake.md`、`research.json` |
| 2 研究设计 | 已确认 intake | `plan.md`、`source-requirements.json`、`query-plan.csv` |
| 3 能力匹配 | 来源需求、registry、实际工具 | `capability-check.md`、`provider-binding.json` |
| 4 采集执行 | 已确认方案/查询/授权/绑定 | `collection/collection-run.json`、`requests.jsonl`、`raw/`、`records.csv`、`candidate-log.csv`、`run.md` |
| 5 采集质量 | plan、运行清单、records、raw | `quality/collection-quality.md/.json` |
| 6 分析编码 | 可分析 records、内容模型 | `analysis-units.csv`、`evidence-links.csv`、`codebook.md`、`coding-audit.csv` |
| 7 分析质量 | records、分析单位、证据、codebook、二次编码 | `quality/analysis-quality.md/.json` |
| 8 综合输出 | 通过分析质量的数据 | `findings.csv`、`insights.md`、`hypotheses.csv`、`report.md` |
| 9 交付 | 阶段产物 | 固定 `交付/` 目录 |

## 7. CSV 字段合同

所有表头只在 `schemas/tabular-contracts.json` 维护。工作台、测试和交付校验必须读取该文件，不得复制字段数组。

`requests.jsonl` 的成功终态必须记录 raw 响应 SHA-256；`collection-run.json.observed_checks` 必须记录参数生效、相关性、异常内容和平台偏差四项采集观察。`coding-audit.csv.resolved_code` 是复核后的最终编码，必须等于 `analysis-units.csv.primary_code`，不能成为第二个分类事实源。

`collection_scope` 的确认哈希固定对以下 JSON 字段按所列顺序序列化后计算 SHA-256：`analysis_unit`、`target`、`inclusion_rules_locked`、`expansion_boundary`、`cost_limit`、`currency`。确认记录的成本和币种必须与运行清单一致；扩样边界同时与 `research.json.sample_target.approved_expansion_boundary` 一致。

平台扩展字段使用 `platform__<platform>__<field>` 命名。通用流程不得依赖扩展字段，除非方案明确声明。

## 8. 交付目录

```text
交付/
  交付报告/
    调研报告.md
    完整证据追溯表.md
    数据质量核查报告.md
  审阅数据/
    research.json
    数据字典.md
    标准化记录.csv
    分析单位.csv
    证据关联.csv
    发现清单.csv
    洞察.md
    产品假设.csv
    质量检查结果.json
    交付元数据.json
  审阅材料/
  历史版本/
```

`full_insight` 必须包含分析单位、证据、发现、洞察和产品假设；`dataset_only` 在交付元数据中列出不适用文件。交付元数据不包含自身哈希。CSV 记录数据行数；其他文件记录 SHA-256。打包前必须通过 v2 合同与完整 ID 链校验。

交付预检时任务必须处于 `delivery/running/pending`。只有 `finalize` 校验并同步任务快照和元数据后，才能进入 `delivery/completed/passed` 并执行打包。
