# Frees port 5000 when a stale backend is still running (EADDRINUSE fix).
$connections = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue
if (-not $connections) {
  Write-Host "Port 5000 is free."
  exit 0
}

$pids = $connections.OwningProcess | Sort-Object -Unique
foreach ($procId in $pids) {
  try {
    Stop-Process -Id $procId -Force -ErrorAction Stop
    Write-Host "Stopped process $procId on port 5000."
  } catch {
    Write-Warning "Could not stop PID $procId : $_"
  }
}
