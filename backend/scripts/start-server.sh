#!/bin/sh
set -e

echo "[start] prisma db push..."
npx prisma db push

if [ "${AUTO_SEED:-true}" = "true" ]; then
  echo "[start] seed question bank..."
  npm run seed
fi

echo "[start] backend boot..."
node dist/src/main.js
