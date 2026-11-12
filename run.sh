#!/usr/bin/env bash
# One-command startup for ASHA Vaani
set -e

echo "================================================================="
echo "             Starting ASHA Vaani Voice Field Register             "
echo "================================================================="

# Check environment file
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    echo "[INFO] No .env found. Copying .env.example to .env..."
    cp .env.example .env
  fi
fi

# Run fast unit tests and clinical safety evaluation
echo "[1/3] Running clinical safety & unit tests..."
python3 tests/test_all.py
python3 scripts/eval.py

# Start application server
echo "[2/3] Building frontend assets..."
npm run build 2>/dev/null || true

echo "[3/3] Starting ASHA Vaani dev server on Port 3000..."
exec npm run dev
