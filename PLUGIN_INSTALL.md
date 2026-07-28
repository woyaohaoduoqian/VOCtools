# 在另一台电脑安装 VOC 调研智能体

本仓库包含 VOC 调研智能体的源码和可安装发布目录。

1. 克隆仓库：`git clone https://github.com/woyaohaoduoqian/VOCtools.git`
2. 在仓库根目录注册市场：`codex plugin marketplace add <仓库绝对路径>`。
3. 安装插件：`codex plugin add voc-research-agent@voctools`。
4. 新建一个 Codex 任务；首次使用 Reddit MCP 时，在该电脑完成 OAuth 授权。

日常开发时编辑 `voctools/`。需要发布插件更新前，运行：

```powershell
.\scripts\sync-plugin.ps1
```

然后审阅 `git diff`，提交 `voctools/` 与 `plugins/voc-research-agent/` 的同步改动。`sync-plugin.ps1` 使用镜像同步，会删除发布目录中源码已删除的文件；不要在发布目录直接手工编辑。
