#!/usr/bin/env bash
# Creates (first run) and starts a private PostgreSQL cluster for NutriScan on port 5433,
# using the PostgreSQL binaries already installed on this machine. Local-only, no password
# (trust auth bound to localhost). Use Docker Compose or your own server instead if you prefer.
set -euo pipefail
cd "$(dirname "$0")/.."
DATA=.pgdata
if [ ! -d "$DATA" ]; then
  initdb -D "$DATA" -U nutriscan --auth=trust -E UTF8 --locale=C >/dev/null
  printf "port = 5433\nlisten_addresses = 'localhost'\n" >> "$DATA/postgresql.conf"
fi
if ! pg_ctl -D "$DATA" status >/dev/null 2>&1; then
  pg_ctl -D "$DATA" -l "$DATA/server.log" start >/dev/null
  sleep 3
fi
for db in nutriscan nutriscan_test; do
  psql -h localhost -p 5433 -U nutriscan -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 \
    || psql -h localhost -p 5433 -U nutriscan -d postgres -c "CREATE DATABASE $db" >/dev/null
done
echo "PostgreSQL ready on localhost:5433 (databases: nutriscan, nutriscan_test)"
