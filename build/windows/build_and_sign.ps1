Param(
  [ValidateSet('windows/amd64','windows/arm64')]
  [string]$Target = 'windows/amd64',
  [string]$PfxPath,
  [string]$PfxPassword,
  [switch]$Nsis
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Export env vars for NSIS finalize hooks (only if provided)
if ($PfxPath -and $PfxPassword) {
  $env:SIGN_PFX = $PfxPath
  $env:SIGN_PWD = $PfxPassword
} else {
  Remove-Item Env:SIGN_PFX -ErrorAction SilentlyContinue
  Remove-Item Env:SIGN_PWD -ErrorAction SilentlyContinue
}

# Build elevated copier first (needed by NSIS File step)
$helperSrc = Join-Path $PSScriptRoot '..\..\cmd\zh-tool-copier\main.go'
$binDir    = Join-Path $PSScriptRoot '..\bin'
$helperOut = Join-Path $binDir 'zh-tool-copier.exe'
if (!(Test-Path $binDir)) { New-Item -ItemType Directory -Path $binDir | Out-Null }

# Map target to GOARCH
$goarch = if ($Target -like '*/arm64') { 'arm64' } else { 'amd64' }
$env:GOOS = 'windows'
$env:GOARCH = $goarch
Write-Host "Building helper ($env:GOOS/$env:GOARCH): $helperOut" -ForegroundColor Cyan
go build -ldflags "-s -w" -o $helperOut $helperSrc

# Sign helper (if PFX provided)
if ($PfxPath -and $PfxPassword -and (Test-Path $helperOut)) {
  & (Join-Path $PSScriptRoot 'sign.ps1') -PfxPath $PfxPath -PfxPassword $PfxPassword -Files $helperOut
}

# Build main app with Wails
$args = @('build','--target', $Target)
if ($Nsis) { $args += '--nsis' }
Write-Host "Running: wails $($args -join ' ')" -ForegroundColor Cyan
wails @args

# Sign built binaries (if PFX provided)
$bin = Join-Path $PSScriptRoot '..\bin'
if ($PfxPath -and $PfxPassword) {
  $files = @()
  if (Test-Path (Join-Path $bin 'zh-tool.exe')) { $files += (Join-Path $bin 'zh-tool.exe') }
  if (Test-Path (Join-Path $bin 'zh-tool-dev.exe')) { $files += (Join-Path $bin 'zh-tool-dev.exe') }
  if ($files.Count -gt 0) {
    & (Join-Path $PSScriptRoot 'sign.ps1') -PfxPath $PfxPath -PfxPassword $PfxPassword -Files $files
  }
}

Write-Host "Build and signing completed." -ForegroundColor Green


