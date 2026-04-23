#!/usr/bin/env bash
set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }
die()  { echo -e "${RED}✗${NC} $1"; exit 1; }

echo ""
echo "  overwatch — setup"
echo "  ─────────────────"
echo ""

# ── Python 3.12+ ──────────────────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
  die "Python 3.12+ is required. Install from https://python.org"
fi
PY_VER=$(python3 -c 'import sys; print(f"{sys.version_info.major}{sys.version_info.minor}")')
if [ "$PY_VER" -lt "312" ]; then
  die "Python 3.12+ required (found $(python3 --version))"
fi
ok "Python $(python3 --version | cut -d' ' -f2)"

# ── uv ────────────────────────────────────────────────────────────────────────
if ! command -v uv &>/dev/null; then
  warn "uv not found — installing..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi
ok "uv $(uv --version | cut -d' ' -f2)"

# ── Node.js 18+ ───────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  die "Node.js 18+ is required. Install from https://nodejs.org or via: brew install node"
fi
NODE_VER=$(node -e 'process.stdout.write(process.version.slice(1).split(".")[0])')
if [ "$NODE_VER" -lt "18" ]; then
  die "Node.js 18+ required (found $(node --version))"
fi
ok "Node.js $(node --version)"

# ── Install deps ──────────────────────────────────────────────────────────────
echo ""
echo "  Installing dependencies..."
uv pip install -e . -q
cd frontend && npm install --silent && cd ..
ok "Dependencies installed"

echo ""
echo "  ┌─────────────────────────────────────┐"
echo "  │  Setup complete!                     │"
echo "  │  Run:  make dev                      │"
echo "  │  Open: http://localhost:5173         │"
echo "  └─────────────────────────────────────┘"
echo ""
