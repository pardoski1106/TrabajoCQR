# Levanta todo: MongoDB (Docker), comprueba PostgreSQL y RabbitMQ, servidor (3000) y web (5173).
$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

function Test-Port($port) { [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) }
function Wait-Port($port, $seconds) {
    for ($i = 0; $i -lt $seconds; $i++) { if (Test-Port $port) { return $true }; Start-Sleep 1 }
    return $false
}

# 1) Docker Desktop + MongoDB (lado QUERY)
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host '>> Abriendo Docker Desktop...' -ForegroundColor Cyan
    $exe = "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe"
    if (-not (Test-Path $exe)) { $exe = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe" }
    Start-Process $exe
    for ($i = 0; $i -lt 60; $i++) { Start-Sleep 3; docker info *> $null; if ($LASTEXITCODE -eq 0) { break } }
}
docker compose up -d mongo
if (-not (Wait-Port 27017 60)) { Write-Host 'MongoDB NO arranco (revisa Docker Desktop).' -ForegroundColor Red; exit 1 }

# 2) PostgreSQL (lado COMMAND) y RabbitMQ: servicios de Windows
$usaLocal = [bool](Select-String -Path .env -Pattern '^DATABASE_URL=.*localhost:5433' -Quiet)
if ($usaLocal -and -not (Test-Port 5433)) { Write-Host 'PostgreSQL (5433) apagado: inicia el servicio postgresql-x64-18 en services.msc' -ForegroundColor Red; exit 1 }
if (-not (Test-Port 5672)) { Write-Host '>> RabbitMQ no responde, se usa el de Docker...' -ForegroundColor Yellow; docker compose up -d rabbitmq }
if (-not (Wait-Port 5672 60)) { Write-Host 'RabbitMQ NO arranco.' -ForegroundColor Red; exit 1 }
npm run migrate
if ($LASTEXITCODE -ne 0) { Write-Host 'No se pudo conectar a PostgreSQL: revisa internet y DATABASE_URL en .env' -ForegroundColor Red; exit 1 }

# 3) Servidor y cliente web, cada uno en su ventana (cerrarla = detenerlo)
if (-not (Test-Port 3000)) { Start-Process cmd.exe -ArgumentList '/k title SERVIDOR CQRS (3000) && npm run start:server' -WorkingDirectory $root }
if (-not (Test-Port 5173)) { Start-Process cmd.exe -ArgumentList '/k title CLIENTE WEB (5173) && npm run dev:web' -WorkingDirectory $root }
$server = Wait-Port 3000 90
$web = Wait-Port 5173 90
if (-not ($server -and $web)) { Write-Host 'Algo no respondio: revisa las ventanas abiertas.' -ForegroundColor Red; exit 1 }

Write-Host ''
Write-Host 'LISTO' -ForegroundColor Green
Write-Host '  Web:       http://localhost:5173'
Write-Host '  API:       http://localhost:3000/salud'
Write-Host '  RabbitMQ:  http://localhost:15672  (guest / guest)'
Write-Host '  MongoDB:   mongodb://localhost:27017  (base: MONGODB_DB en .env)'
if ($usaLocal) { Write-Host '  Postgres:  localhost:5433  (base bd_command_cqrs)' } else { Write-Host '  Postgres:  nube (DATABASE_URL en .env)' }
