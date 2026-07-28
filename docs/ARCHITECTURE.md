# 部署能力契约

## GitHub 中保存的资产

- `agent/`：流程、skills、平台画像、Apify 与 Reddit provider 规格、工作台脚本。
- `.codex-plugin/plugin.json`：插件清单。
- `.mcp.json`：Reddit MCP 连接定义。
- `tests/`：回归与部署契约检查。

## 每个部署环境必须具备

1. **Apify**：可发起外部 HTTPS API 请求，并通过环境安全配置 `APIFY_TOKEN`；不需要 Apify 专用插件。Token 不提交、不回显、不写入任务文件。
2. **Reddit**：能启动 `.mcp.json` 中的 MCP，并在首次使用时完成 OAuth。
3. **运行条件**：支持 Codex 插件、Node.js 与网络访问 MCP/Apify。

这三项中任一缺失，环境即不支持本插件。不得安装后只关闭 Instagram 或 Reddit 分支；否则同一份流程将不再具备承诺的跨平台能力。

每个调研任务开始前还要检查：`APIFY_TOKEN` 已安全注入、Reddit MCP 工具已注入。首次触发 Reddit 时，要求用户完成 OAuth；预检失败即停止，不以单平台替代。

## 可迁移边界

GitHub 可让任意新设备获得相同的流程、skills、MCP 定义与测试；`APIFY_TOKEN` 和 OAuth 会话属于设备/环境的私密运行态，必须重新配置或授权。
