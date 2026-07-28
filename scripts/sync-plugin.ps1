[CmdletBinding()]
param(
    [switch]$Check
)

$repoRoot = (Split-Path -Parent $PSScriptRoot).TrimEnd('\')
$destination = Join-Path $repoRoot 'plugins\voc-research-agent\skills\voc-research-agent'
$assetNames = @(
    'README.md', 'CHATGPT_SETUP.md', 'EVALS.md', 'SKILL.md', 'soul.md',
    'data-collection', 'insight-writing', 'quality-check', 'research-planning',
    'mcp', 'scripts/README.md', 'scripts/voc_workbench.mjs', 'scripts/voc_workbench.py', 'tests'
)

if (-not (Test-Path -LiteralPath $destination -PathType Container)) {
    throw "Plugin distribution directory was not found: $destination"
}

if ($Check) {
    $sourceFiles = foreach ($assetName in $assetNames) {
        $source = Join-Path $repoRoot $assetName
        if (-not (Test-Path -LiteralPath $source)) { throw "Source asset was not found: $source" }
        if (Test-Path -LiteralPath $source -PathType Leaf) { $assetName }
        else { Get-ChildItem -LiteralPath $source -Recurse -File | ForEach-Object { $_.FullName.Replace("$repoRoot\", '').Replace('\', '/') } }
    }
    $destinationFiles = Get-ChildItem -LiteralPath $destination -Recurse -File | ForEach-Object { $_.FullName.Replace("$destination\", '').Replace('\', '/') }
    $difference = Compare-Object $sourceFiles $destinationFiles
    if ($difference) {
        $difference | Format-Table -AutoSize
        exit 1
    }
    Write-Output 'Plugin distribution file list matches the source.'
    exit 0
}

Write-Output 'Synchronizing root skill assets into plugins/voc-research-agent/skills/voc-research-agent/.'
Get-ChildItem -LiteralPath $destination -Force | Remove-Item -Recurse -Force
foreach ($assetName in $assetNames) {
    $source = Join-Path $repoRoot $assetName
    $target = Join-Path $destination $assetName
    if (Test-Path -LiteralPath $source -PathType Leaf) { New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null; Copy-Item -LiteralPath $source -Destination $target }
    else {
        robocopy $source $target /E /XD __pycache__ /XF *.pyc | Out-Null
        if ($LASTEXITCODE -gt 7) { throw "robocopy failed for $assetName with exit code $LASTEXITCODE" }
    }
}
