# 平台无关交付

负责阶段 9。不得在交付阶段新增采集、改写发现、生成新假设或放宽质量标准。

数据表任务要求采集质量通过；洞察任务要求采集、分析和综合质量均通过且阶段 8 产物齐全。固定目录见 `../TASK_CONTRACT.md`，稳定文件名不得附加“最终”“最新版”等词。

交付报告包含研究报告、完整证据追溯和质量核查；审阅数据包含研究状态、数据字典、标准记录、分析单位、证据关联、发现、质量结果和交付元数据。原始响应、请求日志和过程材料只放审阅材料，不成为新的事实源。

`调研报告.md` 必须与通过综合质检的 `report.md` 一致，并固定包含“研究范围与问题、数据来源与方法、样本与质量、发现与证据、限制与待验证”五节且各节有实质内容。`数据质量核查报告.md` 至少包含采集质量和限制；完整洞察任务还包含分析质量和综合质量。完整证据追溯表必须实际出现对应的 `RQ→R→U→E→F→I` 链，不能用空标题占位。

纯数据任务可以不生成分析与洞察文件，但必须在交付元数据的 `non_applicable_files` 声明不适用项，不能用空文件占位。完整洞察任务必须交付 `洞察.md` 和 `产品假设.csv`。

旧版移入 `历史版本/YYYY-MM-DD_变更说明/`。交付元数据记录版本、时间、profile、相对路径、SHA-256；CSV 另记数据行数，元数据不计算自身哈希。完整洞察的质量检查摘要必须记录源采集、分析和综合质量 JSON 的 SHA-256，不能只复制判定文字。

执行：

```powershell
node agent/tools/voc_workbench.mjs quality --task <任务目录> --stage synthesis
node agent/tools/voc_workbench.mjs validate --task <任务目录> --for-delivery
node agent/tools/voc_workbench.mjs finalize --task <任务目录>
node agent/tools/voc_workbench.mjs pack --task <任务目录>
```

综合质量通过后工作台自动进入 `delivery/running/pending`。准备交付快照并预检；`finalize` 通过后自动把全局状态改为 `completed`、交付闸门改为 `passed`，同步审阅快照和元数据哈希。未完成终态不得打包。Schema、ID、字段、行数、哈希、质量闸门或版本任一失败都停止。打包只包含任务的 `交付/`。
