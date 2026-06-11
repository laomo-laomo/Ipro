<#
.SYNOPSIS
  One-shot dev reset for IPro: kill stale processes, clear build caches,
  start web+api in the background, wait, and run the smoke test.

.DESCRIPTION
  What it does, in order:
    1. Kill any node process whose command line mentions IPro dev markers
       (ipro, apps/web, apps/api, dev:web, dev:api, next dev, tsx watch).
    2. Remove .next caches under apps/web and apps/admin (if admin exists).
    3. Start dev:web and dev:api as background jobs with redirected logs.
    4. Poll /api/health for up to 30s.
    5. Run scripts/smoke.ps1 and print PASS / FAIL.

  Usage (from repo root):
    pwsh scripts/dev-clean.ps1

  Exit codes:
    0 = smoke test passed
    1 = smoke test failed or API never came up
#>

[CmdletBinding()]
param(
  [int]$WaitSeconds = 30,
  [switch]$SkipClean = $false
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path "$PSScriptRoot/..").Path
$logDir = Join-Path $repoRoot '.tmp-dev-clean'
$webLog = Join-Path $logDir 'web.log'
$apiLog = Join-Path $logDir 'api.log'

if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

function Write-Step([string]$msg) {
  Write-Host ''
  Write-Host "=== $msg ===" -ForegroundColor Cyan
}

function Write-Ok([string]$msg) { Write-Host "  OK  $msg" -ForegroundColor Green }
function Write-Warn([string]$msg) { Write-Host "  WARN $msg" -ForegroundColor Yellow }

# ------------------------------------------------------------------
# 1. Kill stale IPro node processes
# ------------------------------------------------------------------
Write-Step 'Killing stale IPro node processes'

$killPatterns = @(
  'apps[\\/]web',
  'apps[\\/]api',
  'ipro',
  'dev:web',
  'dev:api',
  'next dev',
  'next-server',
  'tsx watch',
  'src[\\/]index\.ts'
)

$killed = 0
try {
  $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'"
  foreach ($p in $procs) {
    $cmd = "$($p.CommandLine)"
    $matched = $false
    foreach ($pat in $killPatterns) {
      if ($cmd -match $pat) { $matched = $true; break }
    }
    if ($matched) {
      Write-Host "  killing PID $($p.ProcessId): $($cmd.Substring(0, [Math]::Min(80, $cmd.Length)))..."
      try {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
        $killed++
      } catch {
        Write-Warn "could not stop PID $($p.ProcessId): $($_.Exception.Message)"
      }
    }
  }
} catch {
  Write-Warn "Get-CimInstance failed: $($_.Exception.Message)"
}

if ($killed -eq 0) {
  Write-Ok 'no stale IPro node processes found'
} else {
  Write-Ok "killed $killed process(es)"
  Start-Sleep -Seconds 2
}

# ------------------------------------------------------------------
# 2. Clear .next caches
# ------------------------------------------------------------------
if (-not $SkipClean) {
  Write-Step 'Removing .next caches'
  foreach ($sub in @('apps/web', 'apps/admin')) {
    $nextDir = Join-Path $repoRoot "$sub/.next"
    if (Test-Path $nextDir) {
      try {
        Remove-Item -Path $nextDir -Recurse -Force -ErrorAction Stop
        Write-Ok "removed $sub/.next"
      } catch {
        Write-Warn "could not remove $nextDir : $($_.Exception.Message)"
      }
    } else {
      Write-Host "  skip  $sub/.next (not present)"
    }
  }
} else {
  Write-Step 'Skipping cache cleanup (-SkipClean)'
}

# ------------------------------------------------------------------
# 3. Start dev:web + dev:api as background jobs
# ------------------------------------------------------------------
Write-Step 'Starting dev servers (background)'

# Start API first so /api/health is the first thing ready.
$apiJob = Start-Job -ScriptBlock {
  param($root, $logPath)
  Set-Location $root
  $proc = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/c', 'npm run dev:api' `
    -WorkingDirectory $root `
    -RedirectStandardOutput $logPath `
    -RedirectStandardError "$logPath.err" `
    -NoNewWindow -PassThru
  return $proc.Id
} -ArgumentList $repoRoot, $apiLog

$webJob = Start-Job -ScriptBlock {
  param($root, $logPath)
  Set-Location $root
  $proc = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/c', 'npm run dev:web' `
    -WorkingDirectory $root `
    -RedirectStandardOutput $logPath `
    -RedirectStandardError "$logPath.err" `
    -NoNewWindow -PassThru
  return $proc.Id
} -ArgumentList $repoRoot, $webLog

$apiPid = Receive-Job -Job $apiJob -Keep
$webPid = Receive-Job -Job $webJob -Keep
Write-Ok "dev:api   pid: $apiPid"
Write-Ok "dev:web   pid: $webPid"
Write-Host "  logs:"
Write-Host "    API: $apiLog"
Write-Host "    web: $webLog"

# ------------------------------------------------------------------
# 4. Wait for API health (up to WaitSeconds)
# ------------------------------------------------------------------
Write-Step "Waiting for API /api/health (up to $WaitSeconds s)"

$apiReady = $false
$pollInterval = 2
$elapsed = 0
while ($elapsed -lt $WaitSeconds) {
  Start-Sleep -Seconds $pollInterval
  $elapsed += $pollInterval
  try {
    $r = Invoke-WebRequest -Uri 'http://localhost:3001/api/health' -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    if ($r.StatusCode -eq 200) {
      Write-Ok "API up after ${elapsed}s"
      $apiReady = $true
      break
    }
    Write-Host "  ... HTTP $($r.StatusCode) at ${elapsed}s"
  } catch {
    Write-Host "  ... waiting (${elapsed}s): $($_.Exception.Message.Split([Environment]::NewLine)[0])"
  }
}

if (-not $apiReady) {
  Write-Host ''
  Write-Host "API failed to become healthy in ${WaitSeconds}s — last API log tail:" -ForegroundColor Red
  if (Test-Path $apiLog) {
    Get-Content $apiLog -Tail 40 | ForEach-Object { Write-Host "  $_" }
  }
  if (Test-Path "$apiLog.err") {
    Get-Content "$apiLog.err" -Tail 40 | ForEach-Object { Write-Host "  $_" }
  }
  Write-Host ''
  Write-Host 'DEV-CLEAN: FAIL (api never came up)' -ForegroundColor Red
  exit 1
}

# Give the web dev server a few more seconds; it boots slower than the API.
$extraWebWait = 8
Write-Host "  giving web dev ${extraWebWait}s extra..."
Start-Sleep -Seconds $extraWebWait

# ------------------------------------------------------------------
# 5. Run smoke.ps1
# ------------------------------------------------------------------
Write-Step 'Running smoke test'

$smoke = Join-Path $PSScriptRoot 'smoke.ps1'
if (-not (Test-Path $smoke)) {
  Write-Host "smoke.ps1 not found at $smoke" -ForegroundColor Red
  exit 1
}

# Run smoke in-process so colors flow.
& $smoke
$smokeExit = $LASTEXITCODE

if ($smokeExit -eq 0) {
  Write-Host ''
  Write-Host 'DEV-CLEAN: PASS' -ForegroundColor Green
  exit 0
} else {
  Write-Host ''
  Write-Host "DEV-CLEAN: FAIL (smoke exit=$smokeExit)" -ForegroundColor Red
  exit 1
}