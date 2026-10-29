# Windows PowerShell equivalent of scripts/dev-db.sh (requires PostgreSQL's bin folder on PATH).
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$data = '.pgdata'
if (-not (Test-Path $data)) {
  initdb -D $data -U nutriscan --auth=trust -E UTF8 --locale=C | Out-Null
  Add-Content -Path "$data/postgresql.conf" -Value "port = 5433`nlisten_addresses = 'localhost'"
}
pg_ctl -D $data status *> $null
if ($LASTEXITCODE -ne 0) {
  Start-Process -FilePath pg_ctl -ArgumentList @('-D', $data, '-l', "$data/server.log", 'start') -NoNewWindow
  Start-Sleep -Seconds 4
}
foreach ($db in @('nutriscan', 'nutriscan_test')) {
  $exists = psql -h localhost -p 5433 -U nutriscan -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'"
  if ($exists -ne '1') { psql -h localhost -p 5433 -U nutriscan -d postgres -c "CREATE DATABASE $db" | Out-Null }
}
Write-Host 'PostgreSQL ready on localhost:5433 (databases: nutriscan, nutriscan_test)'
