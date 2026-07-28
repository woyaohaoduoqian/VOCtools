[CmdletBinding()]
param(
    [switch]$Check
)

$agentRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent $agentRoot
$destination = Join-Path $repoRoot 'plugins\voc-research-agent\skills\voc-research-agent'

if (-not (Test-Path -LiteralPath $destination -PathType Container)) {
    throw "Plugin distribution directory was not found: $destination"
}

function Get-RelativePath([string]$base, [string]$path) {
    return $path.Substring($base.Length).TrimStart([char[]]@('\', '/')).Replace('\', '/')
}

$sourceFiles = Get-ChildItem -LiteralPath $agentRoot -Recurse -File |
    Where-Object { $_.FullName -ne $PSCommandPath } |
    ForEach-Object { Get-RelativePath $agentRoot $_.FullName }

if ($Check) {
    $destinationFiles = Get-ChildItem -LiteralPath $destination -Recurse -File |
        ForEach-Object { Get-RelativePath $destination $_.FullName }
    $difference = Compare-Object $sourceFiles $destinationFiles
    if ($difference) {
        $difference | Format-Table -AutoSize
        exit 1
    }
    foreach ($relativePath in $sourceFiles) {
        $sourceHash = (Get-FileHash -LiteralPath (Join-Path $agentRoot $relativePath) -Algorithm SHA256).Hash
        $destinationHash = (Get-FileHash -LiteralPath (Join-Path $destination $relativePath) -Algorithm SHA256).Hash
        if ($sourceHash -ne $destinationHash) {
            Write-Error "Plugin distribution content differs: $relativePath"
            exit 1
        }
    }
    Write-Output 'Plugin distribution files and content match agent source.'
    exit 0
}

Write-Output 'Synchronizing agent source into plugins/voc-research-agent/skills/voc-research-agent/.'
Get-ChildItem -LiteralPath $destination -Force | Remove-Item -Recurse -Force
robocopy $agentRoot $destination /E /XD __pycache__ /XF *.pyc sync-plugin.ps1 | Out-Null
if ($LASTEXITCODE -gt 7) { throw "robocopy failed with exit code $LASTEXITCODE" }
