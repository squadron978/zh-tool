Param(
  [string]$PfxPath,
  [string]$PfxPassword,
  [string]$TimestampUrl = 'http://timestamp.digicert.com',
  [string[]]$Files = @()
)

function Sign-File([string]$Path) {
  if (!(Test-Path $Path)) { Write-Host "Skip (not found): $Path" -ForegroundColor Yellow; return }
  & signtool sign /f $PfxPath /p $PfxPassword /fd SHA256 /tr $TimestampUrl /td SHA256 "$Path"
  if ($LASTEXITCODE -ne 0) { throw "Sign failed: $Path" }
  & signtool verify /pa "$Path" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Verify failed: $Path" }
  Write-Host "Signed: $Path" -ForegroundColor Green
}

if (-not $PfxPath -or -not $PfxPassword) {
  Write-Host "Skip signing (no PFX provided)." -ForegroundColor Yellow
  exit 0
}

if ($Files.Count -eq 0) {
  $bin = Join-Path $PSScriptRoot '..\bin'
  $candidates = @(
    Join-Path $bin 'zh-tool.exe'),
    (Join-Path $bin 'zh-tool-dev.exe'),
    (Join-Path $bin 'zh-tool-installer.exe'),
    (Join-Path $bin 'zh-tool-amd64.exe'),
    (Join-Path $bin 'zh-tool-arm64.exe')
  $Files = $candidates | Where-Object { Test-Path $_ }
}

foreach ($f in $Files) { Sign-File $f }
