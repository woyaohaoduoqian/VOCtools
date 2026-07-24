---
provider: apify
type: rest_api
status: 已接入
platforms: [instagram]
stages: [collection]
spec: apify-instagram.json
---

# Provider:Apify

按结果计费的托管爬虫市场。执行单位是 **actor**(一个托管的采集程序),通过 REST API 启动、轮询、取数。当前接入 Instagram,13 个「起点 × 内容类型」组合。

## 1. 前置条件

**凭证**:`APIFY_TOKEN`

获取优先级(见 SKILL.md 凭证纪律):
1. 平台级密钥配置 【WinSight 是否支持:待确认】
2. 内部网关代持,智能体不接触凭证 【是否部署:待确认】
3. 用户会话内提供 —— 最后手段,须按凭证纪律提示风险

三条都不满足 → 预检阶段标记不可用,告知用户,**不要尝试无凭证调用**。

提示用户提供凭证时,建议使用 Apify 的**受限权限 token**(创建 token 时开启 "Limit token permissions",只给运行 actor 和读取 dataset 的权限),不要用全权限主 token。

## 2. 调用契约

在代码执行工具里用 Python requests 实现。

BASE = "https://api.apify.com/v2"
actor slug 中的 "/" 在 URL 路径里替换为 "~"

启动运行
POST {BASE}/acts/{slug~}/runs?token={APIFY_TOKEN}
headers: Content-Type: application/json
body: 构造好的 input(JSON)
→ 响应 data.id 即 runId;非 2xx 视为启动失败
轮询状态
GET {BASE}/actor-runs/{runId}?token={APIFY_TOKEN}
每 5 秒一次
→ data.status == "SUCCEEDED" → 取数
→ "FAILED" / "ABORTED" / "TIMED-OUT" → 报错停止(不重试)
→ 超时判定:试跑 5 分钟;全量按 max(5 分钟, 预计条数 ÷ 100 分钟)。超时后**停止轮询、不自动 abort**
(abort 会丢已采数据但停止计费,继续等则可能追加费用,取舍交用户),报告 runId、已等待时长、
预估已产生费用,给两个选项:继续等待 / 中止(POST {BASE}/actor-runs/{runId}/abort?token={APIFY_TOKEN})
取数
GET {BASE}/actor-runs/{runId}/dataset/items?token={APIFY_TOKEN}
→ JSON 数组,按 SKILL.md 的输出契约提取字段

**输入构造**:规格中每个 capability 的 `input` 是模板,占位符替换规则:

| 占位符 | 替换为 |
|---|---|
| `$values` | 用户输入按逗号/换行拆成的数组 |
| `$value` | 原始输入字符串 |
| `$first` | 数组第一项(预留,当前规格未使用) |
| `$tokens` | 数组每项清洗成合法 token:去开头 `#`、去空格和标点("press on nails" → "pressonnails"、"#nature" → "nature") |
| `$limit` | 本次条数上限。试跑固定 5;全量按方案,方案没写就问 |

**批量判定**:模板用了 `$values` / `$tokens` → 支持多输入,预计总条数 = 每输入上限 × 输入个数;只用 `$value` / `$first` → 单输入,多个种子需逐个跑(每个是独立的一次运行,成本按次累加)。

## 3. 代价模型

- **金钱**:`费用($) = pricePer1000 / 1000 × 预计总条数`。上限估算,实际按 Apify 返回条数计费。单价见规格文件的 `pricePer1000`,当前范围 $0.7–2.3 / 千条。**试跑 5 条同样计费**——金额可忽略,但要知道不是免费。
- **时间**:试跑通常 1–5 分钟;全量随条数增长。超时不自动中止,按调用契约的超时判定报告后由用户决定。
- **账号风险**:无。不需要登录任何社交媒体账号。
- **合规**:允许商用。采集受 Instagram 反爬机制与限额影响,偶发失败属正常现象。

## 4. 能力来源

`static` —— `apify-instagram.json`,手工维护。

结构要点:
- 每个 actor 一条,含 `slug`、`pricePer1000`、`official`、`allInOne`
- actor 级 `fieldSets`:命名字段集(post / profile / comment / list 等)。每个字段含 `label`、`path`(可为数组,按序取第一个非空值)、`tier`(common / advanced / debug 三档),部分含 `join`
- `capabilities[]`:每条是一个 `{start, content}` 组合,含:
  - `input`:该组合的输入模板
  - `fieldsRef`:引用 actor 级 fieldSets 的字段集名。个别 capability 用内联 `fields` 数组代替(build 脚本历史产出),两者含义相同,**查字段时两个键都要认**
  - `idOf`:**去重键在 capability 级,不在字段级**。是路径数组(如 `["id","shortCode"]`),按序取第一个非空值作为该行的去重标识
  - `excludeFields`(可选):标了的字段该组合实际拿不到

**维护方式**:本文件由能力清单仓库的 build 脚本生成,与网站版共用同一份源头(actor-specs.md),**不要手工编辑**。actor 涨价、换 actor、字段变化时改源头后重新生成。

## 5. 特有闸门

无,按 SKILL.md 通用流程。

注意通用流程中与本 provider 直接相关的两条:试跑必做;实际成本超预估 20% 立即停止。

## 6. 失败模式

| 情形 | 报告什么 |
|---|---|
| 401 / 403 | 凭证无效或权限不足。若用户用了受限 token,提示可能缺"运行 actor"或"读取 dataset"权限 |
| 启动返回非 2xx | actor slug 或 input 格式问题,附上实际请求体 |
| 状态 FAILED / ABORTED | actor 侧失败,附 runId 供用户到 Apify Console 查日志 |
| 超时(判定标准见调用契约) | 已停止轮询,报告 runId、已等待时长、预估费用,等用户选继续或中止 |
| 返回空数组 | 可能原因:种子无效、私密账号、平台限流、内容不存在。**给选项,不自行换词重试** |
| common 字段大面积为空 | 视为完成,标注为质量问题移交 quality-check,不要静默输出 |
| 私密账号 | 部分 actor 返回空;规格的 `path` 已含多重兜底,仍为空则按上一条处理 |
| 组合标了 excludeFields | 该字段拿不到,选工具阶段就该发现并告知,不要向用户承诺后再失败 |
