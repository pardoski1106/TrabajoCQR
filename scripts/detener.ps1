# Detiene servidor, cliente web y MongoDB. PostgreSQL y RabbitMQ (servicios de Windows) se dejan corriendo.
Set-Location (Split-Path $PSScriptRoot -Parent)
foreach ($port in 3000, 5173) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { Stop-Process -Id $_ -Force -Confirm:$false; Write-Host ">> Puerto $port detenido" }
}
docker compose stop mongo
