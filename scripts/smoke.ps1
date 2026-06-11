<#
.SYNOPSIS
  IPro dev smoke test — verify the dev stack is up before burning time.

.DESCRIPTION
  Hits the four endpoints a healthy dev stack should respond to:
    1. http://localhost:3000/                (Next.js web root)
    2. http://localhost:3000/_next/static/css/app/layout.css (CSS asset)
       — falls back to any css asset under /_next/ if path differs
    3. http://localhost:3001/api/auth/me      (Fastify auth probe, dev auto-login)
    4. http://localhost:3001/api/health      (full subsystem report)

  Each check is wrapped in a short timeout. On failure the script prints the
  failing step in red and exits 1. Use:

    pwsh scripts/smoke.ps1

  Override ports via env:
    $env:WEB_PORT = 3002
    $env:API_PORT = 3101
    pwsh scripts/smoke.ps1
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$webPort = if ($env:WEB_PORT) { $env:WEB_PORT } else { '3000' }
$apiPort = if ($env:API_PORT) { $env:API_PORT } else { '3001' }
$baseWeb = "http://localhost:$webPort"
$baseApi = "http://localhost:$apiPort"
$timeoutSec = 8

$failed = $false

function Write-Section([string]$title) {
  Write-Host ''
  Write-Host "=== $title ===" -ForegroundColor Cyan
}

function Test-Step(
  [string]$name,
  [string]$url,
  [int]$expectedStatus = 200,
  [string]$expectContains = ''
) {
  Write-Host ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $name)
  Write-Host "    GET $url"
  try {
    $resp = Invoke-WebRequest -Uri $url -TimeoutSec $timeoutSec -UseBasicParsing -ErrorAction Stop
    $code = [int]$resp.StatusCode
    if ($code -ne $expectedStatus) {
      Write-Host ("    FAIL: expected HTTP {0}, got {1}" -f $expectedStatus, $code) -ForegroundColor Red
      return $false
    }
    if ($expectContains) {
      $body = $resp.Content
      if (-not $body.Contains($expectContains)) {
        Write-Host "    FAIL: response missing '$expectContains'" -ForegroundColor Red
        return $false
      }
    }
    Write-Host "    OK (HTTP $code)" -ForegroundColor Green
    return $true
  } catch {
    $msg = $_.Exception.Message
    if ($_.Exception.Response) {
      try { $code = [int]$_.Exception.Response.StatusCode } catch { $code = '?' }
      Write-Host ("    FAIL: HTTP {0} - {1}" -f $code, $msg) -ForegroundColor Red
    } else {
      Write-Host "    FAIL: $msg" -ForegroundColor Red
    }
    return $false
  }
}

Write-Section "IPro dev smoke test"
Write-Host "web = $baseWeb"
Write-Host "api = $baseApi"

# 1. Web root
if (-not (Test-Step -name 'web root' -url "$baseWeb/")) { $failed = $true }

# 2. layout.css — try the standard Next.js path first, then fall back to any
#    CSS asset under /_next/static/css/ by parsing the HTML.
$cssOk = Test-Step -name 'web layout.css (direct)' -url "$baseWeb/_next/static/css/app/layout.css"
if (-not $cssOk) {
  Write-Host '    layout.css not at default path, scanning HTML for a CSS asset...'
  try {
    $html = (Invoke-WebRequest -Uri "$baseWeb/" -TimeoutSec $timeoutSec -UseBasicParsing).Content
    $cssMatch = [regex]::Match($html, 'href="(/_next/static/css/[^"]+\.css)"')
    if ($cssMatch.Success) {
      $cssPath = $cssMatch.Groups[1].Value
      if (-not (Test-Step -name "web CSS asset ($cssPath)" -url "$baseWeb$cssPath")) {
        $failed = $true
      }
    } else {
      Write-Host '    FAIL: no /_next/static/css/*.css link found in HTML' -ForegroundColor Red
      $failed = $true
    }
  } catch {
    Write-Host "    FAIL: could not fetch HTML to locate CSS: $($_.Exception.Message)" -ForegroundColor Red
    $failed = $true
  }
}

# 3. /api/auth/me (dev mode auto-login returns 200)
if (-not (Test-Step -name 'api /api/auth/me' -url "$baseApi/api/auth/me")) { $failed = $true }

# 4. /api/health (overall status healthy or degraded is fine; unhealthy = fail)
Write-Section "api /api/health (full report)"
try {
  $hresp = Invoke-WebRequest -Uri "$baseApi/api/health" -TimeoutSec $timeoutSec -UseBasicParsing -ErrorAction Stop
  $hbody = $hresp.Content
  $hjson = $hbody | ConvertFrom-Json -ErrorAction Stop
  Write-Host ("    overall: {0}" -f $hjson.status)
  if ($hjson.subsystems) {
    foreach ($prop in $hjson.subsystems.PSObject.Properties) {
      $sub = $prop.Value
      $color = switch ($sub.status) {
        'ok' { 'Green' }
        'not_configured' { 'Yellow' }
        'not_tested' { 'Yellow' }
        default { 'Red' }
      }
      $detail = if ($sub.detail) { " — $($sub.detail)" } else { '' }
      Write-Host ("      - {0,-9} {1}{2}" -f $prop.Name, $sub.status, $detail) -ForegroundColor $color
    }
  }
  if ($hjson.status -eq 'unhealthy') {
    Write-Host '    FAIL: /api/health reported unhealthy' -ForegroundColor Red
    $failed = $true
  } else {
    Write-Host "    OK ($($hjson.status))" -ForegroundColor Green
  }
} catch {
  Write-Host "    FAIL: $($_.Exception.Message)" -ForegroundColor Red
  $failed = $true
}

Write-Host ''
if ($failed) {
  Write-Host 'SMOKE TEST FAILED' -ForegroundColor Red
  exit 1
} else {
  Write-Host 'SMOKE TEST PASSED' -ForegroundColor Green
  exit 0
}