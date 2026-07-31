---
provider_id: reddit-research-mcp
type: mcp
transport: streamable_http
status: integrated
platforms: [reddit]
content_models: [threaded-discussion]
---

# Reddit Research MCP

## 能力与缺口

支持语义发现社区、社区内搜索、主题列表、批量主题和评论树。索引覆盖不是整个 Reddit；时间过滤、评论树完整度、配额和返回字段以当前任务运行时 Schema 与响应为准。

## 鉴权和运行条件

使用第三方托管 MCP 和 OAuth。当前任务必须实际暴露该 MCP 的操作，首次连接需完成授权。不要索取、复述或保存 token。

registry 中的 `integrated` 表示核心已维护正式契约，不代表所有运行环境或当前任务已连接。

端点和安装方式只在部署配置与 `docs/CODEX_SETUP.md` 维护。

## 调用契约

先发现可用操作，再读取目标操作 Schema，最后执行只读研究操作。允许的能力类别是社区发现、社区搜索、主题获取和评论获取。

持久化 Feed 的创建、修改和删除不属于普通研究绑定，只有用户明确要求监测 Feed 时才能另行授权。

每次调用的真实操作名、参数、参数哈希、请求 ID、响应位置、响应 SHA-256 和状态写入 `collection/requests.jsonl`。原始响应写入 `collection/raw/`。

## 代价、配额、并发与超时

- 金钱：服务方当前声明免费，实际配额和状态以运行时为准。
- 时间：按首批实测。
- 账号风险：不需要用户 Reddit 凭证；需要服务方 OAuth。
- 合规：仅公开数据，受服务条款、授权范围和可用性约束。
- 并发：首批串行；稳定后只使用很小并发并写入运行清单。

## 字段映射

| 标准字段 | 运行时来源 |
|---|---|
| `record_id` | 主题或评论稳定 ID |
| `parent_record_id` | 评论父记录；主题为 `not_applicable` |
| `entity_type` | `thread` / `reply` |
| `text` | 标题与正文或评论文本 |
| `published_at` | 平台发布时间 |
| `permalink` | 可回访的永久链接 |
| `author` | 公开作者标识 |
| `source_location` | subreddit |
| `platform__reddit__score` | Reddit score |
| `platform__reddit__subreddit` | subreddit |
| `platform__reddit__is_stickied` | 置顶状态 |

真实字段路径必须从运行时 Schema 和首批响应确认，不能凭文档猜测。缺失值保留为空字符串。

## 错误映射

| Provider 情况 | 通用错误 |
|---|---|
| OAuth 或授权失败 | `authentication_failed` |
| MCP 超时 | `timeout` |
| 空响应 | `empty_result` |
| 配额或限流 | `rate_limited` |
| 字段或 Schema 变化 | `schema_changed` |
| 连接失败 | `transport_failed` |
| 请求终态无法确认 | `unknown_state` |
