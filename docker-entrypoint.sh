#!/bin/sh
set -e

echo "[entrypoint] running migrations..."
prisma migrate deploy || {
  echo "[entrypoint] migrate failed, trying db push as fallback"
  prisma db push --accept-data-loss
}

echo "[entrypoint] seeding..."
tsx prisma/seed.ts || echo "[entrypoint] seed skipped/failed (non-fatal)"

echo "[entrypoint] starting app..."
exec "$@"
