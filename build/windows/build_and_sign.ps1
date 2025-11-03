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
if ($LASTEXITCODE -ne 0) { throw "go build helper failed ($LASTEXITCODE)" }

# Sign helper (if PFX provided)
if ($PfxPath -and $PfxPassword -and (Test-Path $helperOut)) {
  & (Join-Path $PSScriptRoot 'sign.ps1') -PfxPath $PfxPath -PfxPassword $PfxPassword -Files $helperOut
}

# Build main app with Wails
$args = @('build','-platform', $Target)
if ($Nsis) { $args += '-nsis' }
Write-Host "Running: wails $($args -join ' ')" -ForegroundColor Cyan
Push-Location (Join-Path $PSScriptRoot '..\..')
wails @args
$wailsExit = $LASTEXITCODE
Pop-Location
if ($wailsExit -ne 0) { throw "wails build failed ($wailsExit)" }

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

# Build NSIS installer (fallback manual run)
if ($Nsis) {
  $exePath   = Join-Path $bin "zh-tool.exe"
  $expected  = Get-ChildItem -Path $bin -Filter "*-installer.exe" -ErrorAction SilentlyContinue
  if (-not $expected) {
    $nsisProj = Join-Path $PSScriptRoot "installer\project.nsi"
    $hasNsis  = Get-Command makensis -ErrorAction SilentlyContinue
    if (-not $hasNsis) {
      Write-Warning "NSIS (makensis) 未安裝或未在 PATH，無法產生安裝檔。"
    } else {
      if ($goarch -eq 'arm64') {
        Write-Host "Running makensis (ARM64) ..." -ForegroundColor Cyan
        & makensis -DARG_WAILS_ARM64_BINARY="$exePath" "$nsisProj"
      } else {
        Write-Host "Running makensis (AMD64) ..." -ForegroundColor Cyan
        & makensis -DARG_WAILS_AMD64_BINARY="$exePath" "$nsisProj"
      }
      if ($LASTEXITCODE -ne 0) { throw "makensis failed ($LASTEXITCODE)" }
    }
  }
}

# Package portable zip with both executables
$zipOut = Join-Path $bin "zh-tool.zip"
if (Test-Path $zipOut) { Remove-Item $zipOut -Force }
$toPack = @()
$mainExe = Join-Path $bin "zh-tool.exe"
$helperExe = Join-Path $bin "zh-tool-copier.exe"
if (Test-Path $mainExe)   { $toPack += $mainExe }
if (Test-Path $helperExe) { $toPack += $helperExe }
if ($toPack.Count -gt 0) {
  Write-Host ("Creating portable zip: {0}" -f $zipOut) -ForegroundColor Cyan
  Compress-Archive -Path $toPack -DestinationPath $zipOut -Force
  Write-Host 'Portable zip created.' -ForegroundColor Green
}
