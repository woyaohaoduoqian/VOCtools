# Codex 接入与验收

本目录说明如何从通用智能体源码生成并验收 Codex 接入包。

1. 运行 `integrations/codex/package.ps1`，生成 `dist/codex-marketplace/`。
2. 将 `dist/codex-marketplace/` 注册为本地 marketplace。
3. 安装 `voc-research-agent@voctools`。
4. 新建 Codex 任务，确认主 skill 能读取 `workflows/`、Schema 和 Provider registry。
5. 首次执行 Reddit 采集时完成 Reddit Research MCP 授权。

```powershell
codex plugin marketplace add <VOCtools 仓库绝对路径>\dist\codex-marketplace
codex plugin add voc-research-agent@voctools
```

如果旧版本曾把仓库根目录注册为 `voctools`，先执行 `codex plugin marketplace remove voctools`，再注册上面的生成目录，避免 Codex 在缺少 marketplace manifest 的仓库根目录上失败。

每次打包都会生成新的 `0.2.0+codex.<UTC时间>` 版本。重装后必须新建 Codex 任务，不能用旧任务判断 skill 或 MCP 是否已更新。

当前任务必须实际暴露所需 MCP 操作；插件已安装、配置存在或连接已授权都不足以证明可调用。未暴露操作时停在能力匹配阶段。

安装包是可重建产物，不提交 Git。维护时只编辑 `agent/` 或 `integrations/codex/`，再运行 README 中的测试和打包命令。
