#!/bin/sh
set -e

echo "[entrypoint] running migrations..."
npx prisma migrate deploy || {
  echo "[entrypoint] migrate failed, trying db push as fallback"
  npx prisma db push
}

echo "[entrypoint] seeding..."
npx tsx prisma/seed.ts || echo "[entrypoint] seed skipped/failed (non-fatal)"

echo "[entrypoint] starting app..."
exec "$@"
