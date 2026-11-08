#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "  CAIRN: Project Continuity Intelligence Platform        "
echo "  Anti-Gravity Invariants Lock: ACTIVE                   "
echo "=========================================================="

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# 1. Virtual Environment
if [ ! -f "$ROOT_DIR/backend/.venv/bin/python" ]; then
    echo "[1/4] Creating backend virtual environment..."
    python3 -m venv "$ROOT_DIR/backend/.venv"
    "$ROOT_DIR/backend/.venv/bin/pip" install -r "$ROOT_DIR/backend/requirements.txt"
    "$ROOT_DIR/backend/.venv/bin/pip" install email-validator
else
    echo "[1/4] Backend virtual environment verified."
fi

# 2. Seed Database
echo "[2/4] Initializing and seeding synthetic benchmark project..."
export PYTHONPATH="$ROOT_DIR/backend"
export DATABASE_URL="sqlite:///$ROOT_DIR/cairn_demo.db"
"$ROOT_DIR/backend/.venv/bin/python" "$ROOT_DIR/backend/app/seeds/seed_demo_data.py"

# 3. Frontend Dependencies
echo "[3/4] Verifying frontend dependencies..."
cd "$ROOT_DIR/frontend"
if [ ! -d "node_modules" ]; then
    npm install
fi

# 4. Start Services
echo "[4/4] Launching Cairn Platform..."
echo "  • Backend API:     http://127.0.0.1:8000 (Swagger: /docs)"
echo "  • Frontend UI:     http://127.0.0.1:3000"

"$ROOT_DIR/backend/.venv/bin/python" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload &
BACKEND_PID=$!

npm run dev -- --host 127.0.0.1 --port 3000 &
FRONTEND_PID=$!

trap "kill $BACKEND_PID $FRONTEND_PID" EXIT
wait

