[CmdletBinding()]
param(
    [switch]$Check
)

$agentRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent $agentRoot
$pluginRoot = Join-Path $repoRoot 'plugins\voc-research-agent'
$destination = Join-Path $repoRoot 'plugins\voc-research-agent\skills\voc-research-agent'
$pluginSource = Join-Path $agentRoot 'plugin'
$manifestSource = Join-Path $pluginSource '.codex-plugin\plugin.json'
$mcpSource = Join-Path $pluginSource '.mcp.json'
$manifestDestination = Join-Path $pluginRoot '.codex-plugin\plugin.json'
$mcpDestination = Join-Path $pluginRoot '.mcp.json'

if (-not (Test-Path -LiteralPath $pluginSource -PathType Container)) {
    throw "Plugin source directory was not found: $pluginSource"
}

if (-not (Test-Path -LiteralPath $destination -PathType Container)) {
    throw "Plugin distribution directory was not found: $destination"
}

function Get-RelativePath([string]$base, [string]$path) {
    return $path.Substring($base.Length).TrimStart([char[]]@('\', '/')).Replace('\', '/')
}

$sourceFiles = Get-ChildItem -LiteralPath $agentRoot -Recurse -File |
    ForEach-Object {
        $relativePath = Get-RelativePath $agentRoot $_.FullName
        if ($_.FullName -ne $PSCommandPath -and -not $relativePath.StartsWith('plugin/')) {
            $relativePath
        }
    } |
    Where-Object { $_ }

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
    foreach ($file in @(@($manifestSource, $manifestDestination), @($mcpSource, $mcpDestination))) {
        if (-not (Test-Path -LiteralPath $file[0]) -or -not (Test-Path -LiteralPath $file[1])) {
            Write-Error "Plugin package file is missing: $($file[1])"
            exit 1
        }
        if ((Get-FileHash -LiteralPath $file[0] -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $file[1] -Algorithm SHA256).Hash) {
            Write-Error "Plugin package content differs: $($file[1])"
            exit 1
        }
    }
    Write-Output 'Plugin distribution files and content match agent source.'
    exit 0
}

Write-Output 'Synchronizing agent source and plugin package into plugins/voc-research-agent/.'
Get-ChildItem -LiteralPath $destination -Force | Remove-Item -Recurse -Force
robocopy $agentRoot $destination /E /XD __pycache__ plugin /XF *.pyc sync-plugin.ps1 | Out-Null
if ($LASTEXITCODE -gt 7) { throw "robocopy failed with exit code $LASTEXITCODE" }
New-Item -ItemType Directory -Path (Split-Path -Parent $manifestDestination) -Force | Out-Null
Copy-Item -LiteralPath $manifestSource -Destination $manifestDestination -Force
Copy-Item -LiteralPath $mcpSource -Destination $mcpDestination -Force
