Param(
  [ValidateSet('windows/amd64','windows/arm64')]
  [string]$Platform = 'windows/amd64',
  [switch]$Nsis,
  [string]$NsisPath,
  [string]$PfxPath,
  [string]$PfxPassword
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-RepoRoot {
  return (Join-Path $PSScriptRoot '..\..')
}

function Invoke-WailsBuild([string]$Platform) {
  $root = Resolve-RepoRoot
  Push-Location $root
  try {
    Write-Host ('[1/4] Wails build -platform {0}' -f $Platform) -ForegroundColor Cyan
    wails build -platform $Platform
    if ($LASTEXITCODE -ne 0) { throw "wails build failed ($LASTEXITCODE)" }
  } finally {
    Pop-Location
  }
}

function Build-Helper([string]$Platform) {
  $isArm64 = ($Platform -like '*/arm64')
  $env:GOOS = 'windows'
  $env:GOARCH = if ($isArm64) { 'arm64' } else { 'amd64' }
  $outDir = Join-Path $PSScriptRoot '..\bin'
  if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
  $src = Join-Path $PSScriptRoot '..\..\cmd\zh-tool-copier\main.go'
  $out = Join-Path $outDir 'zh-tool-copier.exe'
  Write-Host ('[2/4] go build helper ({0}/{1}): {2}' -f $env:GOOS,$env:GOARCH,$out) -ForegroundColor Cyan
  go build -ldflags "-s -w" -o $out $src
  if ($LASTEXITCODE -ne 0) { throw "go build helper failed ($LASTEXITCODE)" }
  return $out
}

function Sign-Artifacts {
  Param([string[]]$Files)
  if (-not $PfxPath -or -not $PfxPassword) { return }
  $signScript = Join-Path $PSScriptRoot 'sign.ps1'
  if (!(Test-Path $signScript)) { return }
  & $signScript -PfxPath $PfxPath -PfxPassword $PfxPassword -Files $Files
}

function Build-NSIS([string]$Platform) {
  if (-not $Nsis) { return }
  $bin = Join-Path $PSScriptRoot '..\bin'
  $mainExe = Join-Path $bin 'zh-tool.exe'
  if (!(Test-Path $mainExe)) { throw "main exe not found: $mainExe" }
  $proj = Join-Path $PSScriptRoot 'installer\project.nsi'
  # Ensure EULA is UTF-16LE with BOM to avoid garbled text on Unicode NSIS
  $eulaSrc = Join-Path $PSScriptRoot 'installer\resources\eula.txt'
  $eulaOut = Join-Path $PSScriptRoot 'installer\resources\eula.utf16.txt'
  if (Test-Path $eulaSrc) {
    try {
      $content = Get-Content -Path $eulaSrc -Raw -Encoding UTF8
    } catch { $content = Get-Content -Path $eulaSrc -Raw }
    $content | Out-File -FilePath $eulaOut -Encoding Unicode -Force
  }

  $makensis = $null
  if ($NsisPath) { $makensis = $NsisPath }
  if (-not $makensis) {
    $probe = (Get-Command makensis -ErrorAction SilentlyContinue)
    if ($probe) { $makensis = $probe.Source }
  }
  if (-not $makensis) {
    $candidates = @(
      'C:\Program Files (x86)\NSIS\makensis.exe',
      'C:\Program Files\NSIS\makensis.exe'
    )
    foreach ($c in $candidates) { if (Test-Path $c) { $makensis = $c; break } }
  }
  if (-not $makensis) { Write-Warning 'makensis not found. Skip NSIS.'; return }

  $isArm64 = ($Platform -like '*/arm64')
  if ($isArm64) {
    Write-Host '[3/4] NSIS (ARM64)' -ForegroundColor Cyan
    $args = @('/INPUTCHARSET','UTF8', ("/DARG_WAILS_ARM64_BINARY={0}" -f $mainExe), ("/DEULA_PATH={0}" -f $eulaOut), $proj)
    & $makensis @args
  } else {
    Write-Host '[3/4] NSIS (AMD64)' -ForegroundColor Cyan
    $args = @('/INPUTCHARSET','UTF8', ("/DARG_WAILS_AMD64_BINARY={0}" -f $mainExe), ("/DEULA_PATH={0}" -f $eulaOut), $proj)
    & $makensis @args
  }
  if ($LASTEXITCODE -ne 0) { throw "makensis failed ($LASTEXITCODE)" }
}

function Make-Zip {
  $bin = Join-Path $PSScriptRoot '..\bin'
  $mainExe = Join-Path $bin 'zh-tool.exe'
  $helperExe = Join-Path $bin 'zh-tool-copier.exe'
  $zip = Join-Path $bin 'zh-tool.zip'
  if (Test-Path $zip) { Remove-Item $zip -Force }
  $files = @()
  if (Test-Path $mainExe) { $files += $mainExe }
  if (Test-Path $helperExe) { $files += $helperExe }
  if ($files.Count -gt 0) {
    Write-Host ('[4/4] Zip: {0}' -f $zip) -ForegroundColor Cyan
    Compress-Archive -Path $files -DestinationPath $zip -Force
  }
}

# Main
Invoke-WailsBuild -Platform $Platform
$helper = Build-Helper -Platform $Platform

$bin = Join-Path $PSScriptRoot '..\bin'
$main = Join-Path $bin 'zh-tool.exe'
$toSign = @()
if (Test-Path $main) { $toSign += $main }
if (Test-Path $helper) { $toSign += $helper }
Sign-Artifacts -Files $toSign

Build-NSIS -Platform $Platform
Make-Zip

Write-Host 'Done.' -ForegroundColor Green

