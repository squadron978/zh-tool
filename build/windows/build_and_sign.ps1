Param(
  [ValidateSet('windows/amd64','windows/arm64')]
  [string]$Target = 'windows/amd64',
  [Parameter(Mandatory=$true)][string]$PfxPath,
  [Parameter(Mandatory=$true)][string]$PfxPassword,
  [switch]$Nsis
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Export env vars for NSIS finalize hooks
$env:SIGN_PFX = $PfxPath
$env:SIGN_PWD = $PfxPassword

# Build with Wails
$args = @('build','--target', $Target)
if ($Nsis) { $args += '--nsis' }
Write-Host "Running: wails $($args -join ' ')" -ForegroundColor Cyan
wails @args

# Sign built binaries
$bin = Join-Path $PSScriptRoot '..\bin'
$files = @()
if (Test-Path (Join-Path $bin 'zh-tool.exe')) { $files += (Join-Path $bin 'zh-tool.exe') }
if (Test-Path (Join-Path $bin 'zh-tool-dev.exe')) { $files += (Join-Path $bin 'zh-tool-dev.exe') }

if ($files.Count -gt 0) {
  & (Join-Path $PSScriptRoot 'sign.ps1') -PfxPath $PfxPath -PfxPassword $PfxPassword -Files $files
}

Write-Host "Build and signing completed." -ForegroundColor Green


