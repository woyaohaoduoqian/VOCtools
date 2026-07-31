# VOCtools 维护约定

- `agent/` 是平台无关的完整智能体源码；`integrations/` 只放运行环境适配，不得复制维护研究规则。
- `dist/` 是可重建安装包，不提交 Git。Codex marketplace 与插件包由 `integrations/codex/package.ps1` 生成。
- 不修改或部署 `archive/cloudflare-prototype/`，除非任务明确恢复该路径。
- 改动流程时同时检查 `agent/INSTRUCTIONS.md`、`agent/TASK_CONTRACT.md`、`agent/RUNTIME_CONTRACT.md`、`agent/workflows/`、内容模型、Schema、`agent/soul.md`、`docs/ARCHITECTURE.md` 和 `docs/EVALS.md`。
- 提交前执行 `node tests/run.mjs`、`node tests/codex-integration.mjs` 与 `git diff --check`。
