# Start IPro API server in background
$ErrorActionPreference = "Continue"
$apiDir = "F:\IPro\apps\api"

# Change to API directory
Set-Location $apiDir

# Start the server
Write-Host "Starting IPro API server..."
Write-Host "Directory: $apiDir"
Write-Host ""

$process = Start-Process -FilePath "npx" -ArgumentList "tsx", "src/index.ts" -WorkingDirectory $apiDir -PassThru -NoNewWindow -WindowStyle Hidden

# Wait for server to start
Start-Sleep -Seconds 5

# Check if server is running
$connections = Get-NetTCPConnection -OwningProcess $process.Id -LocalPort 3001 -ErrorAction SilentlyContinue

if ($connections) {
    Write-Host "SUCCESS! API server is running on http://localhost:3001"
    Write-Host "Process ID: $($process.Id)"
} else {
    Write-Host "WARNING: Server may not have started properly"
    Write-Host "Process ID: $($process.Id)"
    Write-Host "Process running: $(!$process.HasExited)"
}

# Keep window open
Write-Host ""
Write-Host "Server window will remain open. Close it to stop the server."
Write-Host "Press Enter to exit this script (server will continue running)..."
Read-Host