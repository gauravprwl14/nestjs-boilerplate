#!/bin/bash
set -e

PRIMARY_HOST="${PRIMARY_HOST:-primary-db}"
PRIMARY_PORT="${PRIMARY_PORT:-5432}"
REPLICATION_USER="${REPLICATION_USER:-replicator}"
REPLICATION_PASSWORD="${REPLICATION_PASSWORD:-replicator_pass}"

echo "Waiting for primary at $PRIMARY_HOST:$PRIMARY_PORT..."
until pg_isready -h "$PRIMARY_HOST" -p "$PRIMARY_PORT" -U "$REPLICATION_USER"; do
  sleep 2
done
echo "Primary is ready."

# Only run basebackup if data dir is empty
if [ -z "$(ls -A "$PGDATA")" ]; then
  echo "Running pg_basebackup from $PRIMARY_HOST..."
  PGPASSWORD="$REPLICATION_PASSWORD" pg_basebackup \
    -h "$PRIMARY_HOST" \
    -p "$PRIMARY_PORT" \
    -U "$REPLICATION_USER" \
    -D "$PGDATA" \
    -P \
    -R \
    --wal-method=stream
  echo "Basebackup complete. Starting standby..."
else
  echo "Data dir not empty, skipping basebackup."
fi

exec docker-entrypoint.sh postgres
