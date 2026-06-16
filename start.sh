#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
VENV="$ROOT/backend/venv"
PYTHON="$VENV/bin/python3"
PIP="$VENV/bin/pip"
UVICORN="$VENV/bin/uvicorn"

echo "=== Strategy Backtester ==="
echo

# Create venv if not present
if [ ! -f "$PYTHON" ]; then
  echo "[1/3] Creating Python virtual environment..."
  python3 -m venv "$VENV"
fi

echo "[2/3] Installing Python dependencies..."
$PIP install -q fastapi uvicorn yfinance pandas numpy

echo "[3/3] Installing & starting frontend..."
cd "$ROOT/frontend"
npm install --silent

echo
echo "  Backend  → http://localhost:8000"
echo "  Frontend → http://localhost:5173"
echo

# Start backend
cd "$ROOT/backend"
$UVICORN main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Start frontend
cd "$ROOT/frontend"
npm run dev &
FRONTEND_PID=$!

# Open browser
sleep 3
open http://localhost:5173 2>/dev/null || true

echo "Servers running. Press Ctrl-C to stop."
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait $BACKEND_PID $FRONTEND_PID
