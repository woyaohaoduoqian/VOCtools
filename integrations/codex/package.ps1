param(
  [string]$OutputRoot = (Join-Path $PSScriptRoot "..\..\dist\codex-marketplace")
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$agentSource = Join-Path $projectRoot "agent"
$resolvedOutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
$target = Join-Path $resolvedOutputRoot "plugins\voc-research-agent"
$skillTarget = Join-Path $target "skills\voc-research-agent"

if ($resolvedOutputRoot -eq $projectRoot -or $target -eq $projectRoot) {
  throw "OutputRoot must not be the project root."
}

if (Test-Path -LiteralPath $target) {
  Remove-Item -LiteralPath $target -Recurse -Force
}

New-Item -ItemType Directory -Force -Path (Join-Path $resolvedOutputRoot ".agents\plugins"), (Join-Path $target ".codex-plugin"), $skillTarget | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "marketplace.json") -Destination (Join-Path $resolvedOutputRoot ".agents\plugins\marketplace.json")
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot "plugin.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$baseVersion = ($manifest.version -split '\+', 2)[0]
$manifest.version = "$baseVersion+codex.$([DateTime]::UtcNow.ToString('yyyyMMddHHmmssfff'))"
[System.IO.File]::WriteAllText(
  (Join-Path $target ".codex-plugin\plugin.json"),
  ($manifest | ConvertTo-Json -Depth 20) + [Environment]::NewLine,
  [System.Text.UTF8Encoding]::new($false)
)
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "mcp.json") -Destination (Join-Path $target ".mcp.json")

Get-ChildItem -LiteralPath $agentSource -Force | ForEach-Object {
  if ($_.Name -ne "INSTRUCTIONS.md") {
    Copy-Item -LiteralPath $_.FullName -Destination $skillTarget -Recurse
  }
}

$frontmatter = @"
---
name: voctools
description: 执行可溯源的公开 VOC 调研，从需求归一化、研究设计、能力匹配和受控采集，到两级质量闸门、结构化洞察与平台无关交付。没有真实可追溯数据时不输出研究结论。
---

"@
$agentText = Get-Content -LiteralPath (Join-Path $agentSource "INSTRUCTIONS.md") -Raw -Encoding UTF8
[System.IO.File]::WriteAllText((Join-Path $skillTarget "SKILL.md"), $frontmatter + $agentText, [System.Text.UTF8Encoding]::new($false))

Write-Output $target
