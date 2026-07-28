[CmdletBinding()]
param(
    [switch]$Check
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $repoRoot 'voctools'
$destination = Join-Path $repoRoot 'plugins\voc-research-agent\skills\voc-research-agent'

if (-not (Test-Path -LiteralPath $source -PathType Container)) {
    throw "Source skill directory was not found: $source"
}
if (-not (Test-Path -LiteralPath $destination -PathType Container)) {
    throw "Plugin distribution directory was not found: $destination"
}

if ($Check) {
    $sourceFiles = Get-ChildItem -LiteralPath $source -Recurse -File | ForEach-Object { $_.FullName.Substring($source.Length).Replace('\', '/') }
    $destinationFiles = Get-ChildItem -LiteralPath $destination -Recurse -File | ForEach-Object { $_.FullName.Substring($destination.Length).Replace('\', '/') }
    $difference = Compare-Object $sourceFiles $destinationFiles
    if ($difference) {
        $difference | Format-Table -AutoSize
        exit 1
    }
    Write-Output 'Plugin distribution file list matches the source.'
    exit 0
}

Write-Output 'Synchronizing voctools/ into plugins/voc-research-agent/skills/voc-research-agent/.'
robocopy $source $destination /MIR /XD __pycache__ /XF *.pyc | Out-Null
if ($LASTEXITCODE -gt 7) {
    throw "robocopy failed with exit code $LASTEXITCODE"
}
