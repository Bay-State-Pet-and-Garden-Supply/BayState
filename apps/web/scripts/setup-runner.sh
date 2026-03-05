#!/bin/bash
# Bay State Pet & Garden - Self-Hosted Runner Setup Script
# Run this on any laptop to set it up as a scraping runner

set -e

REPO_OWNER="nickborrello"
REPO_NAME="BayStateApp"
RUNNER_DIR="$HOME/actions-runner"
RUNNER_VERSION="2.311.0"

echo "=================================================="
echo "  Bay State Self-Hosted Runner Setup"
echo "=================================================="
echo ""

# Detect OS
OS=$(uname -s)
case "$OS" in
    Darwin) 
        RUNNER_ARCH="osx-x64"
        ;;
    Linux)
        RUNNER_ARCH="linux-x64"
        ;;
    *)
        echo "❌ Unsupported OS: $OS"
        echo "   Please use macOS or Linux"
        exit 1
        ;;
esac

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed."
    echo "   Please install Docker Desktop from: https://www.docker.com/products/docker-desktop/"
    exit 1
fi

echo "✓ Docker is installed"

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo "❌ Docker is not running. Please start Docker Desktop."
    exit 1
fi

echo "✓ Docker is running"

# Build the scraper Docker image
echo ""
echo "📦 Building scraper Docker image..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
SCRAPER_DIR="$REPO_ROOT/scraper_backend"

if [ -d "$SCRAPER_DIR" ]; then
    docker build -t baystate-scraper:latest "$SCRAPER_DIR"
    echo "✓ Scraper image built: baystate-scraper:latest"
else
    echo "⚠ scraper_backend directory not found at $SCRAPER_DIR"
    echo "  Skipping Docker build - you'll need to build it manually"
fi

# Create runner directory
echo ""
echo "📁 Setting up runner directory..."
mkdir -p "$RUNNER_DIR"
cd "$RUNNER_DIR"

# Download runner if not present
if [ ! -f "./config.sh" ]; then
    echo "📥 Downloading GitHub Actions runner v${RUNNER_VERSION}..."
    RUNNER_URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz"
    curl -o actions-runner.tar.gz -L "$RUNNER_URL"
    tar xzf actions-runner.tar.gz
    rm actions-runner.tar.gz
    echo "✓ Runner downloaded"
else
    echo "✓ Runner already downloaded"
fi

# Get token from user
echo ""
echo "=================================================="
echo "  Configuration Required"
echo "=================================================="
echo ""
echo "1. Go to: https://github.com/${REPO_OWNER}/${REPO_NAME}/settings/actions/runners"
echo "2. Click 'New self-hosted runner'"
echo "3. Copy the TOKEN shown in the configuration section"
echo ""
read -p "Paste your runner token here: " RUNNER_TOKEN

if [ -z "$RUNNER_TOKEN" ]; then
    echo "❌ No token provided. Exiting."
    exit 1
fi

# Configure the runner
echo ""
echo "⚙️  Configuring runner..."
./config.sh --url "https://github.com/${REPO_OWNER}/${REPO_NAME}" \
            --token "$RUNNER_TOKEN" \
            --name "$(hostname)" \
            --labels "self-hosted,docker" \
            --unattended \
            --replace

echo ""
echo "=================================================="
echo "  ✅ Setup Complete!"
echo "=================================================="
echo ""
echo "To start the runner:"
echo "  cd $RUNNER_DIR && ./run.sh"
echo ""
echo "To run as a background service:"
echo "  cd $RUNNER_DIR && ./svc.sh install && ./svc.sh start"
echo ""
echo "Your runner will appear at:"
echo "  https://github.com/${REPO_OWNER}/${REPO_NAME}/settings/actions/runners"
echo ""

# Ask if user wants to start now
read -p "Start the runner now? (y/n): " START_NOW
if [[ "$START_NOW" =~ ^[Yy]$ ]]; then
    echo ""
    echo "Starting runner... Press Ctrl+C to stop."
    ./run.sh
fi
