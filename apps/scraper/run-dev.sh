#!/bin/bash
# Run scraper daemon in DEVELOPMENT mode (connects to localhost:3000)
# Usage: ./run-dev.sh [--debug]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Bay State Scraper - DEV MODE${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if BayStateApp is running locally
if ! curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠ Warning: BayStateApp doesn't appear to be running on localhost:3000${NC}"
    echo ""
    echo "To start the app:"
    echo "  cd ../BayStateApp && npm run dev"
    echo ""
    read -p "Continue anyway? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Activate virtual environment
if [ -d "venv" ]; then
    source venv/bin/activate
elif [ -d ".venv" ]; then
    source .venv/bin/activate
else
    echo -e "${YELLOW}⚠ No virtual environment found. Using system Python.${NC}"
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠ .env not found!${NC}"
    echo "Copy .env.example to .env and fill in your API keys."
    exit 1
fi

echo -e "${GREEN}✓ Starting scraper in DEV mode${NC}"
echo -e "${BLUE}  API URL: http://localhost:3000${NC}"
echo ""

# Run daemon
# --env dev is informational (logged); .env is the single config source
exec python daemon.py --env dev "$@"
