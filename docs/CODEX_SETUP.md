# 安装与调试 VOC 调研插件

## 安装

1. 克隆仓库：`git clone https://github.com/woyaohaoduoqian/VOCtools.git`
2. 在仓库根目录注册本地 marketplace：`codex plugin marketplace add <仓库绝对路径>`。
3. 安装插件：`codex plugin add voc-research-agent@voctools`。
4. 新建一个 Codex 任务；首次需要 Reddit 数据时，Codex 先连接并注入 Reddit MCP 工具。如服务要求授权，才在该任务内完成 OAuth。

插件根目录内的 `.mcp.json` 是 Codex 插件的运行配置，随插件一起安装；不依赖 `npx` 或本机 Node/npm。它不能通过仅提供 GitHub URL 的个人 GPT 自动执行。

## 调试顺序

1. 先运行本地工作台回归测试：`node tests/run.mjs` 和 `node tests/plugin-contract.mjs`。
2. 新建 Codex 任务，发送 [`EVALS.md`](EVALS.md) 中的 P1–P8；P9 只在 Reddit MCP 已授权时执行。
3. 预期流程必须是：澄清 → 待确认方案 → 用户确认与成本确认 → 采集/质检 → 编码/报告。任一闸门不通过都要停止，不能自动补救。

## 维护发布副本

只编辑仓库根目录的源文件。改动后运行：

```powershell
./agent/scripts/sync-plugin.ps1
./agent/scripts/sync-plugin.ps1 -Check
```

前一个命令将 `agent/` 源码复制到 `plugins/voc-research-agent/skills/voc-research-agent/`，并将 `agent/plugin/` 生成到插件根目录；后一个命令验证技能文件和插件清单的内容哈希完全一致。
