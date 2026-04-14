#!/bin/sh
set -e

echo "[entrypoint] pushing schema..."
prisma db push --skip-generate --accept-data-loss

echo "[entrypoint] seeding..."
tsx prisma/seed.ts || echo "[entrypoint] seed skipped/failed (non-fatal)"

echo "[entrypoint] starting app..."
exec "$@"
