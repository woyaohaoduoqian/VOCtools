# VOC 工作台脚本

`voc_workbench.mjs` 将现有四阶段规则落成可复算的本地交付物；它不访问网络，不会调用 Apify，也不会读取或保存 token。运行需要 Node.js 18+；插件本身也依赖 Node.js 启动 Reddit MCP。

## 典型顺序

1. `init`：建立任务目录与待确认方案模板。
2. 用户确认方案、授权采集后，按 `skills/data-collection/SKILL.md` 采集并写入 `processed/`、`raw/` 与 `manifest.json`。
3. `quality --stage pilot` 或 `quality --stage full`：生成/追加 `quality.md`，并把判定回写入 manifest。
4. 仅在允许分析时，由智能体逐行生成 `coded.csv`，再运行 `summarize` 复算类别占比。
5. 智能体依据 `skills/insight-writing/SKILL.md` 撰写 `report.md`；运行 `validate --for-report` 后使用 `pack` 打包交付。

## CSV 最低约定

- 所有 CSV 使用 UTF-8 with BOM；每行是一条观察。
- 帖子/短视频/评论至少有：`原始链接`、`发布时间`、`采集时间`。
- 账号、粉丝、关注列表至少有：`主页链接`、`采集时间`。
- 编码后的 `coded.csv` 必须有：`类别`、`编码依据`；不确定的行写 `未归类`，质检标注的营销行写 `排除-营销`。

脚本不会替你判断语义相关性、广告/机器人、类别定义或研究结论；这些判断必须由相应 skill 和可追溯的原始行来完成。
