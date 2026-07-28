# Cloudflare 发布版：VOC Research Agent

这是一个可以直接发布到 Cloudflare Workers 的公开 Web 工作台。它将模型密钥保留在 Worker 环境中，浏览器只提交研究需求；它目前完成**规划与方案确认**，不在没有逐次费用确认的情况下调用采集服务。

## 架构与边界

```text
访客浏览器 ── 同域 HTTPS ── Cloudflare Worker ── OpenAI Responses API
     │                              │
     └─ 方案保存在访客浏览器          └─ OPENAI_API_KEY / APP_ACCESS_KEY（Secret）
```

- `POST /api/plan` 仅生成待确认的研究方案；不会采集内容、不会调用 Apify。
- Worker 必须同时配置 `OPENAI_API_KEY`、`OPENAI_MODEL` 和 `APP_ACCESS_KEY` 才会生成方案。
- `APP_ACCESS_KEY` 是最低限度的公开部署保护。面向大量外部用户时，应改为 Cloudflare Access、OAuth 或自己的账号/配额系统，并在 Worker 前增加 Turnstile 与速率限制。
- 任何真实采集应作为第二个、受控的后端能力接入：服务端保存 Apify token；界面展示试跑范围与预估费用；每次由用户确认后才执行。不得把 token 放进前端代码。

## 本地运行

```powershell
cd cloudflare
Copy-Item .dev.vars.example .dev.vars
npm install
npm run dev
```

在 `.dev.vars` 填入模型配置和本地访问口令。该文件已在 `.gitignore` 中排除。

## 发布到 Cloudflare

1. 登录 Cloudflare：`npx wrangler login`。
2. 先配置 secrets（不把值写进 `wrangler.jsonc`）：

   ```powershell
   npx wrangler secret put OPENAI_API_KEY
   npx wrangler secret put APP_ACCESS_KEY
   npx wrangler secret put OPENAI_MODEL
   ```

   `OPENAI_MODEL` 是要使用的、你账户有权访问的模型 ID。
3. 检查脚本：`npm run check`。
4. 发布：`npm run deploy`。Wrangler 会输出 `workers.dev` 地址；之后可在 Cloudflare Dashboard 绑定自定义域名。

Cloudflare 当前推荐使用 Workers Static Assets，而不是已废弃的 Workers Sites；本项目按这一方式配置。详见 [Cloudflare Wrangler 配置](https://developers.cloudflare.com/workers/wrangler/configuration/) 和 [Static Assets SPA 配置](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)。

## 发布前检查

- 不发布 `.dev.vars`、任何 API token 或真实调研数据。
- 至少设置一个不与其他系统共用的 `APP_ACCESS_KEY`。
- 确认模型和采集预算的计费归属；在可公开访问前加入身份认证和限流。
- 先在 `workers.dev` 地址完成方案生成冒烟测试，再绑定正式域名。
