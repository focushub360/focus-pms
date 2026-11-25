# Stop any process listening on ports 8000 (Backend) and 3000 (Frontend)
Write-Host "Freeing ports 8000 and 3000..." -ForegroundColor Cyan

$ports = @(8000, 3000)
foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($conn in $connections) {
            $pidToKill = $conn.OwningProcess
            if ($pidToKill -gt 0) {
                try {
                    Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
                    Write-Host "✓ Stopped process $pidToKill on port $port" -ForegroundColor Green
                } catch {
                    Write-Host "! Could not stop process $pidToKill on port $port" -ForegroundColor Yellow
                }
            }
        }
    } else {
        Write-Host "• Port $port is already free" -ForegroundColor Gray
    }
}

Write-Host "All project ports are now clear!" -ForegroundColor Green
