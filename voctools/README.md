# VOCtools智能体资产包

## 结构

```
soul.md                      → 贴进 agent 配置页的「角色说明」
data-collection/             → skill 1:数据采集(含 Apify 协议和 IG 能力清单)
research-planning/           → skill 2:方案规划(需求拆解、可答性判定)
quality-check/               → skill 3:质量检查(试跑/全量两道闸 + 饱和判定)
insight-writing/             → skill 4:洞察输出(编码、证据强弱、措辞管制)
```

## 部署步骤

1. soul.md 内容贴进 agent 的「角色说明」框
2. 四个 skill 文件夹各自打包(或整仓走 GitHub 导入),在 Skill 页导入,再到 agent 配置勾选
3. 配置 Apify token(见 data-collection/providers/apify.md 的【部署待定】)
4. 验证:问 agent "读 data-collection skill 里 providers/apify-instagram.json 第一个 actor 的 slug"

## 待核对
- research-planning:预注册模板
- insight-writing:完整证据强弱表、禁用词清单、编码一致率抽检阈值
