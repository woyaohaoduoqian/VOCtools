# 部署能力契约

## GitHub 中保存的资产

- `agent/`：流程、skills、平台画像、Apify 与 Reddit provider 规格、工作台脚本。
- `.codex-plugin/plugin.json`：插件清单。
- `.mcp.json`：Reddit MCP 连接定义。
- `tests/`：回归与部署契约检查。

## 按平台启用的运行能力

1. **Instagram / Apify**：可发起外部 HTTPS API 请求，并通过环境安全配置 `APIFY_TOKEN`；不需要 Apify 专用插件。Token 不提交、不回显、不写入任务文件。
2. **Reddit**：能启动 `.mcp.json` 中的 MCP，并在首次使用时完成 OAuth。
3. **基础条件**：支持 Codex 插件、Node.js 与访问所选平台所需服务的网络。

未选择的平台不需要对应能力。每个任务先确认平台：选择 Instagram 时检查 `APIFY_TOKEN`；选择 Reddit 时检查 MCP，并在首次触发时要求 OAuth。某个已选择平台预检失败即停止该平台的执行，等待用户修改方案或完成配置，不自动改用其他平台。

## 可迁移边界

GitHub 可让任意新设备获得相同的流程、skills、MCP 定义与测试；`APIFY_TOKEN` 和 OAuth 会话属于设备/环境的私密运行态，必须重新配置或授权。
