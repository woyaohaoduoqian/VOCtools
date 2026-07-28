# VOCtools · 社媒调研智能体资产包

给 WinSight 智能体用的一套调研规程:把非技术同事的模糊需求,变成有方案、有成本确认、有质量闸门、有溯源的调研产出。

> 现在可直接作为一个完整技能包使用：`SKILL.md` 是统一入口，`scripts/voc_workbench.py` 提供任务脚手架、可复算质检、编码汇总、交付校验与 ZIP 打包。脚本不会采集数据或调用任何付费服务。

## 结构

```
soul.md                      贴进 agent 配置页的「角色说明」,不是 skill

research-planning/           skill 1 · 方案规划
├── SKILL.md                 七步:补全信息 → 定目的 → 可答性 → 关键词 → 平台 → 侦察 → 出方案
└── platforms/               平台画像(研究特性,不含工具信息)
    ├── _template.md         新增平台照此填
    ├── instagram.md         已接入
    └── reddit.md / tiktok.md / etsy.md   未接入,但可推荐

data-collection/             skill 2 · 采集执行
├── SKILL.md                 预检 → 拆任务 → 轮次 → 选工具 → 试跑 → 确认 → 全量 → 落盘
└── providers/               工具知识,与流程分离
    ├── registry.json        薄索引,选工具只读这个(唯一事实源)
    ├── _template.md         新增工具照此填
    ├── apify.md             Apify 调用协议
    └── apify-instagram.json IG 能力规格(build 脚本生成,勿手改)

quality-check/SKILL.md       skill 3 · 两道闸门 + 多轮节奏 + 饱和判定,产出 quality.md
insight-writing/SKILL.md     skill 4 · 编码 → 证据强弱 → 报告,产出 report.md

SKILL.md                     统一入口与阶段路由
scripts/voc_workbench.py     本地工作台：init → quality → summarize → validate → pack
```


## 设计原则

- **流程与工具分离**:skill 1-4 不含任何具体工具知识;工具全部在 `providers/`。加工具改数据不改流程。
- **两级读取**:选工具先读 `registry.json` 薄索引,命中后只读那一个 provider 文档,避免上下文膨胀。
- **停下比跑完重要**:所有异常的处置都是"停下 + 报告 + 等指示"。禁止 fallback、禁止自动重试。
- **每个阶段落文件**:`plan.md` → `manifest.json` → `quality.md` → `report.md`。价值在**单次调研会话内即成立**:中断能续、下游能引、结论能溯源。交付时全部过程文件随报告打包给用户(见各 skill 的交付节),交付包在用户手里,因此这套纪律不依赖平台文件空间跨会话持久。持久性只影响一件事——"跨调研自动复用历史数据";不持久时复用改为用户重新上传历史交付包,流程不变。

## 部署

1. `soul.md` 内容贴进 agent 配置页的「角色说明」
2. 四个 skill 文件夹导入(整仓 GitHub 导入,或各自打 ZIP),再到 agent 配置勾选
3. 配置 Apify 凭证 —— 见 `data-collection/providers/apify.md` 第 1 节的三级优先级,当前【待确认】平台是否支持密钥配置
4. 工具集需开启:代码执行、文件操作、网页搜索

### 先在 ChatGPT / Codex 验收

先不需要 OpenAI API Key，也不需要发布网站。Codex 安装插件后可直接使用本仓库技能；ChatGPT 的手动配置与首轮测试方式见 [CHATGPT_SETUP.md](CHATGPT_SETUP.md)，每次调整后的验收用例见 [EVALS.md](EVALS.md)。只有 P1–P8 全部通过，才进入真实采集工具和独立网站阶段。

### 公开 Web 分发（Cloudflare）

仓库中的 [`cloudflare/`](cloudflare/README.md) 是可部署的 Workers Web 应用：访客填写研究简报、由服务端模型生成**待确认**方案并下载 `plan.md`。模型密钥只保存在 Cloudflare Secret；应用不会在浏览器端暴露凭证，也不会未确认即发起采集。发布命令、Secret 配置、上线前访问控制要求见该目录 README。

### 本地执行工作台

在仓库根目录运行：

```powershell
node scripts/voc_workbench.mjs init --root research --name "研究主题-日期"
```

这会创建标准任务目录和待确认的 `plan.md`。完整命令与数据约定见 [scripts/README.md](scripts/README.md)；工作台不替代采集授权和四阶段 skill 的判断。

## 导入后自检

| 测什么 | 怎么问 | 通过标准 |
|---|---|---|
| 薄索引可读 | "registry 里有哪些采集工具,Apify 的文档文件叫什么" | 答出三条 provider 及其状态,doc 是 apify.md |
| 嵌套目录可读 | "读 apify-instagram.json,第一个 actor 的 slug" | 答出具体 slug |
| skill 会被触发 | 给一句模糊需求,如"看看 IG 上美甲达人的情况" | 先问澄清问题,不直接开始采集或回答 |
| 边界生效 | "IG 上有多少比例的用户不满意 xx" | 说明这类问题答不了,并给出可替代的问法 |
| 文件跨会话持久性 | 本会话让 agent 写一个测试文件;**新开会话**让它读该文件 | 读得到 → 数据复用可跨调研;读不到 → 复用仅限单会话,跨调研复用靠用户重传交付包(两种结果流程都成立,测出来是为了写死结论、关掉待确认项) |

## 首单验收标准

一个非技术同事,只说一句"帮我看看 IG 上 xx 品类哪些达人火",在无人指导的情况下走完:澄清 → 方案确认 → 试跑 → 成本确认 → 全量 → 拿到 CSV 和取样说明。

过程中智能体没有编造数据、没有跳过成本确认、没有把探索式发现写成结论。

## 状态与待办

**当前实际可采集的平台只有 Instagram。**其余平台画像(Reddit / TikTok / Etsy)仅供规划阶段推荐使用,且画像均为初稿、未经实际调研校准(状态标在各画像文件头部)。不要因为画像文件数量产生"覆盖很广"的判断。

**已接入**:Instagram(Apify,13 个起点 × 内容组合)

**待接入**
- Reddit —— Codex 插件已接入 **Reddit Research MCP（Dialog 托管服务）**。该服务需要首次 OAuth，但不要求 Reddit 凭证；原 WinSight 的 OAuth 限制不再直接适用。免费只读采集采用“schema 预检 → 按方案分批采集 → 每批质量检查 → 最终质量闸门”，不人为拆成付费式试跑/全量两次确认。字段、评论树完整度、时间筛选、配额和可复跑性仍只认实际首批与后续返回；异常即停止。Apify Reddit actor 保留为候选，不自动切换。
- TikTok / Etsy —— 平台画像已写,能力规格未验证
- 国内平台 —— 合规问题未定,不接

**已定稿**(原"待核对"项):`insight-writing` 的证据强弱表、禁用词清单、编码一致率阈值(不一致率 >20% 判编码不可靠)为现行标准。方法论文档尚未定稿,不作为上位依据;后续标准调整走正常修订流程,不再挂"以原文为准"。

**待确认**(两项都有验证方法,测完把结论写死、删掉本条)
- WinSight 是否支持 agent 级密钥配置 —— 决定 Apify 凭证走三级优先级的哪一级。验证:agent 配置页找 secrets / 环境变量入口;没有则问平台管理员是否有内部网关代持
- 文件空间是否跨会话持久 —— **仅决定跨调研复用是否自动**;不持久时用户重传交付包即可,流程不变(见设计原则第 4 条)。验证方法见"导入后自检"表

**后续**
- 名单类任务(达人清单、竞品账号表)另开 skill——它们不需要编码和结论,现有流水线套上去是浪费
- 能力清单 build 脚本增加输出 `apify-instagram.json`,与网站共用同一份源头
