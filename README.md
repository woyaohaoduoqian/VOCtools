# VOCtools

VOCtools 是一个公开 VOC 调研智能体。它把用户需求转换为固定、可审计的九阶段研究流程，并输出可追溯的结构化洞察，可接入不同的智能体运行环境。

## 目录

```text
agent/                    平台无关的完整智能体源码
  INSTRUCTIONS.md         运行入口与跨阶段纪律
  soul.md                 角色与沟通方式
  TASK_CONTRACT.md        文件、Schema、ID、状态和交接
  RUNTIME_CONTRACT.md     运行环境接入要求
  workflows/              五个研究方法模块
  content-models/         内容关系、去重和计数
  platforms/              平台语境与偏差
  providers/              数据获取与标准字段映射
  schemas/ templates/     机器合同与稳定模板
  tools/                  本地创建、迁移、复算和校验
integrations/codex/       Codex 薄适配与打包脚本
docs/                     架构、接入和验收
tests/                    核心流程与适配层回归
archive/                  不参与运行的历史原型和候选资料
dist/                     本地生成的安装包，不提交 Git
```

固定流程：需求归一化 → 研究设计 → 能力匹配 → 采集 → 采集质量 → 分析编码 → 分析质量 → 发现/解读/假设 → 交付。

## 本地工作台

要求 Node.js 22 或更高版本，不需要第三方 npm 依赖。

如果 Windows 环境中的 `node` 不在 `PATH`，可使用 Codex 自带运行时：

```powershell
$node = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
& $node tests/run.mjs
& $node tests/codex-integration.mjs
```

```powershell
node agent/tools/voc_workbench.mjs init --root research --name 任务名
node agent/tools/voc_workbench.mjs quality --task <任务目录> --stage collection
node agent/tools/voc_workbench.mjs quality --task <任务目录> --stage analysis
node agent/tools/voc_workbench.mjs summarize --task <任务目录>
node agent/tools/voc_workbench.mjs migrate --task <v1任务目录>
node agent/tools/voc_workbench.mjs validate --task <任务目录> --for-delivery
node agent/tools/voc_workbench.mjs finalize --task <任务目录>
node agent/tools/voc_workbench.mjs pack --task <任务目录>
```

`pack` 生成跨平台的 `.tar.gz` 交付包。

## Codex 接入包

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\integrations\codex\package.ps1
```

生成位置为 `dist/codex-marketplace/`。该目录包含 marketplace 配置和插件安装包；每次打包会在基础版本后生成新的 Codex cachebuster，可随时从源码重建，不进入版本库。

生成后，将 `dist/codex-marketplace/` 注册为本地 marketplace。运行环境接入的通用要求见 `agent/RUNTIME_CONTRACT.md`。

## 验证

```powershell
node tests/run.mjs
node tests/codex-integration.mjs
git diff --check
```
