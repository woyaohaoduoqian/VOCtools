---
provider: reddit-research-mcp
type: mcp_http_via_remote
status: 已接入（免费、分批质量闸门）
platforms: [reddit]
---

# Provider：Reddit Research MCP（Dialog 托管服务）

## 1. 接入边界

- MCP 端点：`https://reddit-research-mcp.fastmcp.app/mcp`
- 认证：Descope OAuth2。首次连接必须由用户在 Codex 完成授权；不要索取、复述或写入 OAuth token。
- 数据边界：仅公开 Reddit 数据；服务方提供语义社区发现、帖子、评论树和链接。
- 覆盖边界：服务方声明索引约 20,000 个活跃 subreddit、每周更新。它不是整个 Reddit 的全量数据库；语义发现结果只能作为取样入口。
- 费用：服务方当前声明可免费独立使用；但免费状态、配额和返回字段只以**本次试跑实测**为准，不得把声明当作保证。

## 2. 允许操作与权限

### 默认允许（只读研究）

1. `discover_operations()`：读取能力与推荐流程。
2. `get_operation_schema()`：读取某操作参数和示例。
3. `execute_operation()` 仅可执行以下 Reddit 只读操作：
   - `discover_subreddits`
   - `search_subreddit`
   - `fetch_posts`
   - `fetch_multiple`
   - `fetch_comments`

### 默认禁止（会持久化改变远端状态）

- `create_feed`
- `update_feed`
- `delete_feed`

只有用户明确说“创建/修改/删除 Reddit 监测 Feed”，才可先展示变更对象和影响，再执行；不得为方便后续研究而自动建 Feed。

## 3. 调用顺序

1. 先读本文件；方案必须已确认。
2. 首次 OAuth 前，向用户说明：使用第三方 Dialog MCP、将访问公开 Reddit 数据、索引覆盖有限；等待明确确认。OAuth 已完成且方案已确认后，不因免费只读采集再索取一次“全量确认”。
3. 调用 `discover_operations()`，再对要用的操作调用 `get_operation_schema()`；这是**无数据 schema 预检**，不得猜参数名。
4. 按方案直接开始分批采集：`discover_subreddits` → 1–3 个社区的 `search_subreddit` / `fetch_posts` → 高相关帖子 `fetch_comments`。首批是正式样本的一部分，不是为收费而拆出的试跑。
5. 每次响应原样落为 `raw/{任务id}-reddit-*.json`；不得只保留模型摘要。
6. 每批映射为 `processed/{任务id}-reddit-{content}.csv`，立即执行质量检查：字段有值率、溯源字段、相关性、时间窗、社区集中度与重复情况。
7. 质量正常则继续下一批，直到达到方案样本量或探索式饱和；质量异常、schema 不匹配、配额信号或时间过滤失效则停止并报告。仅当要扩大范围、改变种子/时间窗、转为付费替代工具或建 Feed 时再要求用户确认。

## 4. 标准化输出

每行追加 `采集时间`（本次 MCP 响应完成时间）。字段名按下列映射；上游字段在实测 schema 中名称不同则记录真实路径，不能臆造。

| 内容 | 最低字段 | 额外字段 |
|---|---|---|
| 帖子 | 原始链接、发布时间、采集时间、标题、正文、作者、社区 | 帖子 ID、分数、评论数、是否置顶、NSFW 标记 |
| 评论 | 原始链接、发布时间、采集时间、评论文本、作者、社区、来源帖子链接 | 评论 ID、分数、父评论 ID、深度 |

- 任何缺失字段保留空值，不用 `0` 或“无”补齐。
- 去重：帖子按帖子 ID；评论按评论 ID。缺 ID 时不自行按文本去重，交由 quality-check 报告。
- 确保评论行可追溯到原始帖子链接；无法构造原始链接的行不得进入结论计数。

## 5. 分批质量闸门与失败处理

- 完整原始链接、发布时间、采集时间是帖子/评论结论的必要溯源字段。
- 社区发现仅用于确定取样社区，不得把“检索排名”写作声量或市场份额。
- 首批先确认真实字段路径和最小溯源字段；通过后继续累计样本，最终按 quality-check 的全量闸门判定是否可分析。
- OAuth 失败、Schema 变化、返回为空、配额限制或 MCP 超时：停止，不自动重试、不自动切换 Apify；保留已完成原始响应，报告现状并等待用户选择。

## 6. 报告限制（必须原样传递）

> 本次 Reddit 样本来自 Reddit Research MCP 的公开数据索引与指定社区/查询，不覆盖整个 Reddit。语义社区发现结果仅用于取样；本报告中的计数和发现仅代表本次可溯源样本，不能外推为市场总体用户比例或共识。
