#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Musik Maker — Run Script
# =============================================================================
# Usage:
#   ./run.sh          — Install deps, build, and start production server
#   ./run.sh dev      — Install deps and start both dev servers (client + API)
#   ./run.sh build    — Install deps and build for production
#   ./run.sh install  — Install all dependencies only
#   ./run.sh client   — Start only the Vite dev server (frontend)
#   ./run.sh server   — Start only the Express dev server (backend)
# =============================================================================

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLIENT_DIR="$ROOT_DIR/client"
SERVER_DIR="$ROOT_DIR/server"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log()   { echo -e "${GREEN}[musik-maker]${NC} $*"; }
warn()  { echo -e "${YELLOW}[musik-maker]${NC} $*"; }
error() { echo -e "${RED}[musik-maker]${NC} $*" >&2; }

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
check_node() {
  if ! command -v node &>/dev/null; then
    error "Node.js is not installed. Please install Node.js 22.x or later."
    exit 1
  fi

  local node_major
  node_major=$(node -v | sed 's/v\([0-9]*\).*/\1/')
  if (( node_major < 18 )); then
    warn "Node.js v${node_major} detected. Node 22.x is recommended."
  fi
}

check_npm() {
  if ! command -v npm &>/dev/null; then
    error "npm is not installed."
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------
do_install() {
  log "Installing client dependencies..."
  npm install --prefix "$CLIENT_DIR"

  log "Installing server dependencies..."
  npm install --prefix "$SERVER_DIR"

  log "Dependencies installed."
}

do_build() {
  do_install

  log "Building client..."
  npm run build --prefix "$CLIENT_DIR"

  log "Building server..."
  npm run build --prefix "$SERVER_DIR"

  log "Build complete."
}

do_start() {
  do_build

  log "Starting production server..."
  log "Open ${CYAN}http://localhost:${PORT:-3001}${NC} in your browser."
  npm run start --prefix "$SERVER_DIR"
}

do_dev() {
  do_install

  log "Starting dev servers (client + API)..."
  log "Client: ${CYAN}http://localhost:5173${NC}"
  log "Server: ${CYAN}http://localhost:3001${NC}"

  # Run both dev servers in parallel; kill both on exit
  trap 'kill 0' EXIT
  npm run dev --prefix "$SERVER_DIR" &
  npm run dev --prefix "$CLIENT_DIR" &
  wait
}

do_client() {
  log "Starting Vite dev server..."
  npm run dev --prefix "$CLIENT_DIR"
}

do_server() {
  log "Starting Express dev server..."
  npm run dev --prefix "$SERVER_DIR"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
check_node
check_npm

case "${1:-}" in
  dev)     do_dev     ;;
  build)   do_build   ;;
  install) do_install ;;
  client)  do_client  ;;
  server)  do_server  ;;
  *)       do_start   ;;
esac
