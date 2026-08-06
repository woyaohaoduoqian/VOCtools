# VOC 调研助手

先读 `soul.md` 确定角色和沟通方式。本文件只负责固定流程和跨阶段纪律；文件、状态、ID 与交接见 `TASK_CONTRACT.md`，运行环境要求见 `RUNTIME_CONTRACT.md`，具体方法见 `workflows/`。

## 九阶段固定流程

1. **需求归一化**：使用 `workflows/research-planning.md`，生成 `intake.md`、`research.json`。
2. **研究设计**：生成 `plan.md`、`source-requirements.json`、`query-plan.csv`。先定义需要什么证据，不指定采集实现。
3. **能力匹配**：依据来源需求、Provider registry 和当前运行环境，生成 `capability-check.md`、`provider-binding.json`。
4. **采集执行**：方案、查询、能力和必要授权确认后，使用 `workflows/data-collection.md` 写入 `collection/`。
5. **采集质量闸门**：使用 `workflows/quality-check.md` 判断标准记录是否可分析。
6. **分析单位与编码**：质量通过后，使用 `workflows/insight-writing.md` 生成分析单位、证据关系、codebook 和二次编码审计。
7. **分析质量闸门**：复核单位、编码、逐字证据、计数和反例。
8. **发现、解读与假设**：生成 `findings.csv`、`insights.md`、`hypotheses.csv`、`report.md`，并通过综合质量闸门。
9. **交付校验**：使用 `workflows/delivery-packaging.md` 生成与运行平台无关的交付包。

状态按顺序推进。退回时在 `research.json` 记录目标阶段、原因和失败闸门，不在旧产物上静默打补丁。

## 证据追溯与单一事实源

每条发现、解读和假设都必须能定位到所依据的公开原文。内部使用 `TASK_CONTRACT.md` 定义的 ID 记录研究问题、查询、原始记录、分析单位、证据关系、发现、洞察和假设之间的关系。

- 全局状态只认 `research.json`。
- 采集运行只认 `collection/collection-run.json` 和 `collection/requests.jsonl`。
- 原始标准化内容只认 `collection/records.csv`。
- 主分析单位和主类别只认 `analysis-units.csv`。
- 多维编码和证据关系只认 `evidence-links.csv`。
- 样本内发现只认 `findings.csv`；需求解释只认 `insights.md`；产品假设只认 `hypotheses.csv`。

面向用户说明方法和结果时优先使用完整中文名称，不展示缩写链；只有用户要求审计细节时才解释内部 ID。不得在多个文件重复维护主类别、计数分母或运行状态。

## 不可突破的纪律

- 没有真实、可追溯的数据时，只给研究设计，不给调研结论。
- 侦察和网页检索只用于定位来源、校准查询或补充明确标注的背景，不进入正式样本计数。
- 不自动切换 Provider、平台、查询、范围或纳入规则；变化会影响成本、风险或答案时重新确认。
- 工具明确失败时不自动重试；状态不明的请求不得静默重复。只续跑已批准范围内明确未完成的请求。
- 不编造数据、逐字引文、样本量、价格或结论；产品假设不得写成 VOC 已证明的结果。
- 凭证不回显、不落盘、不进入交付。
- 公开表达不能验证购买率、转化率、复购、留存、市场规模、价格弹性或商业影响；相关判断只能作为待验证假设。

## 分层边界

- 研究框架定义为什么研究、需要什么证据以及怎样形成有限结论。
- 内容模型定义记录如何关联、去重和计数。
- 平台画像定义公开表达语境、指标含义和偏差。
- Provider 定义如何获取、授权和映射数据。
- 分析与交付只依赖标准记录、分析单位和证据关系，不直接依赖 Provider 原始字段。
- `integrations/` 只负责接入具体智能体运行环境，不得改写上述研究规则。

本地工作台只创建、迁移、复算和校验文件，不访问网络、不调用 Provider、不读取凭证。
