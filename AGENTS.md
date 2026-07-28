# VOCtools 维护约定

- `agent/` 是唯一源码；`plugins/voc-research-agent/skills/voc-research-agent/` 是由 `agent/scripts/sync-plugin.ps1` 生成的发布副本，不直接编辑。
- 不修改或部署 `archive/cloudflare-prototype/`，除非任务明确恢复该路径。
- 改动工作流规则时，同时检查 `agent/SKILL.md`、四个阶段 skill、`agent/soul.md`、`docs/CODEX_SETUP.md` 和 `docs/EVALS.md` 是否一致。
- 提交前执行 `node tests/run.mjs`、`node tests/plugin-contract.mjs` 与 `agent/scripts/sync-plugin.ps1 -Check`。环境没有 PATH 中的 Node 时使用 README 中的 bundled Node 路径。
