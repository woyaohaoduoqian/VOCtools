# VOCtools

一个可迁移、可审计的 Codex VOC 调研插件。GitHub 是唯一源码和安装来源；任何部署环境都必须同时支持外部 API 调用/安全密钥注入与 Reddit MCP/OAuth，缺任一能力即不支持部署。

## 仓库结构

```text
agent/                 唯一源码：总流程、四阶段 skills、平台与 provider 规格、工作台脚本
docs/                  安装、验收与架构说明
tests/                 回归与部署契约检查
.codex-plugin/         Codex 插件清单
.mcp.json              Reddit MCP 运行配置
plugins/               自动生成的插件发布副本，不直接编辑
archive/               非运行资产；Cloudflare 原型仅作历史保留
```

## 流程

```text
需求澄清 → 待确认 plan.md → Apify/Reddit 受控采集 → quality.md → 编码 → report.md
```

先确认方案与成本；先试跑再全量；每批/全量均过质量闸门；失败不自动重试或换源；没有真实数据不写结论。

## 换设备或换部署环境

提供 GitHub 项目地址即可取得同一份插件定义，但运行态需要在新环境重新完成：

1. 安装插件并加载 `.mcp.json`。
2. 安全配置 `APIFY_TOKEN`（不提交到 GitHub）。
3. 完成 Reddit MCP 的 OAuth。
4. 运行部署契约与回归检查。

详见 [安装与调试](docs/CODEX_SETUP.md) 与 [部署能力契约](docs/ARCHITECTURE.md)。

## 维护

只编辑 `agent/`、`docs/`、`tests/` 与插件配置。改动后执行：

```powershell
& 'C:\Users\Lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tests/run.mjs
& 'C:\Users\Lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tests/plugin-contract.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File .\agent\scripts\sync-plugin.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\agent\scripts\sync-plugin.ps1 -Check
```
