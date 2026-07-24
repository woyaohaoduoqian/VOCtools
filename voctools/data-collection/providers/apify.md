# Provider 协议:Apify

按结果计费的托管爬虫市场。工具单位是 actor,规格见同目录 `apify-instagram.json`(自动生成,勿手改;源头是能力清单仓库的 actor-specs.md)。

## 凭证

环境变量 `APIFY_TOKEN`。【部署待定:确认 WinSight 是否支持给智能体配置密钥/环境变量;若不支持,改为会话开始时向用户索要,用后不复述、不写入文件】

## 输入构造

规格中每个 capability 的 `input` 是模板,占位符替换规则:

- `$values`:用户输入按逗号/换行拆成的数组
- `$value`:原始输入字符串;`$first`:数组第一项
- `$tokens`:数组每项清洗成合法 token——去开头 `#`、去空格和标点(如 "press on nails" → "pressonnails"、"#nature" → "nature")
- `$limit`:本次条数上限。试跑固定 5;全量按用户设定,缺省 20,无硬上限

**批量判定**:input 模板用了 `$values`/`$tokens` → 支持多输入,预计总条数 = 每输入上限 × 输入个数;只用 `$value`/`$first` → 单输入,多个输入需逐个跑。

## 成本

`费用($) = pricePer1000 / 1000 × 预计总条数`。这是上限估算,实际按 Apify 返回条数计费。试跑 5 条同样计费(单价低,可忽略,但要知道不是免费)。

## REST 调用流程(代码执行工具内用 Python requests 实现)

```
BASE = "https://api.apify.com/v2"
路径中 actor slug 的 "/" 替换为 "~"

1. 启动运行
   POST {BASE}/acts/{slug~}/runs?token={APIFY_TOKEN}
   headers: Content-Type: application/json
   body: 构造好的 input(JSON)
   → 响应 data.id 即 runId;非 2xx 视为启动失败

2. 轮询状态
   GET {BASE}/actor-runs/{runId}?token={APIFY_TOKEN}
   每 5 秒一次
   → data.status == "SUCCEEDED" → 进入取数
   → "FAILED" / "ABORTED" / "TIMED-OUT" → 报错停止(不重试,铁律 2)
   → 超过 5 分钟仍在运行:POST {BASE}/actor-runs/{runId}/abort?token={APIFY_TOKEN} 中止并报告

3. 取数
   GET {BASE}/actor-runs/{runId}/dataset/items?token={APIFY_TOKEN}
   → JSON 数组,按 SKILL.md 的结果处理约定提取字段
```

## 已知失败模式

- IG 反爬与限额导致偶发空结果或失败,属正常;报告用户,可建议稍后再试或换输入,但由用户决定。
- 部分 actor 对私密账号返回空;字段规格中的 `path` 已含多重兜底,提取时若 common 字段大面积为空,应作为质量问题上报而不是静默输出。
- 组合级 `excludeFields`:规格中标了 excludeFields 的组合,对应字段实际拿不到,不要向用户承诺。
