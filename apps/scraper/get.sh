#!/bin/bash
set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
BOLD='\033[1m'

IMAGE="ghcr.io/bay-state-pet-and-garden-supply/baystate/scraper:latest"
CONTAINER_NAME="baystate-scraper"
INSTALL_COMMAND="curl -fsSL https://raw.githubusercontent.com/Bay-State-Pet-and-Garden-Supply/BayState/refs/heads/master/apps/scraper/get.sh | bash"
CONFIG_DIR="$HOME/.baystate-scraper"
CONFIG_FILE="$CONFIG_DIR/runner.env"
UPDATE_SCRIPT="$CONFIG_DIR/update-runner.sh"
AUTO_UPDATE_CRON_MARKER="baystate-scraper-auto-update"

AUTO_UPDATES_ENABLED="false"

print_banner() {
    echo ""
    echo -e "${CYAN}${BOLD}"
    echo "  ____              ____  _        _        "
    echo " | __ )  __ _ _   _/ ___|| |_ __ _| |_ ___  "
    echo " |  _ \ / _\` | | | \___ \| __/ _\` | __/ _ \ "
    echo " | |_) | (_| | |_| |___) | || (_| | ||  __/ "
    echo " |____/ \__,_|\__, |____/ \__\__,_|\__\___| "
    echo "              |___/                         "
    echo -e "${NC}"
    echo -e "${BOLD}Scraper Runner Installer${NC}"
    echo ""
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Error: Docker is not installed.${NC}"
        echo ""
        echo "Install Docker first:"
        echo "  - Mac: https://docs.docker.com/desktop/install/mac-install/"
        echo "  - Linux: curl -fsSL https://get.docker.com | sh"
        echo "  - Windows: https://docs.docker.com/desktop/install/windows-install/"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        echo -e "${RED}Error: Docker daemon is not running.${NC}"
        echo "Please start Docker and try again."
        exit 1
    fi
    
    echo -e "${GREEN}✓${NC} Docker is installed and running"
}

is_truthy() {
    local value
    value=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')

    case "$value" in
        1|true|yes|y|on) return 0 ;;
        *) return 1 ;;
    esac
}

require_tty() {
    if [ ! -r /dev/tty ]; then
        echo -e "${RED}Error: Interactive setup requires a terminal (TTY).${NC}"
        echo "Set SCRAPER_API_URL, SCRAPER_API_KEY, and optionally SCRAPER_AUTO_UPDATE, then re-run:"
        echo "  $INSTALL_COMMAND"
        exit 1
    fi
}

load_saved_config() {
    if [ ! -f "$CONFIG_FILE" ]; then
        return
    fi

    while IFS='=' read -r key value; do
        case "$key" in
            SCRAPER_API_URL)
                if [ -z "$SCRAPER_API_URL" ] && [ -n "$value" ]; then
                    SCRAPER_API_URL="$value"
                fi
                ;;
            SCRAPER_API_KEY)
                if [ -z "$SCRAPER_API_KEY" ] && [ -n "$value" ]; then
                    SCRAPER_API_KEY="$value"
                fi
                ;;
            RUNNER_NAME)
                if [ -z "$RUNNER_NAME" ] && [ -n "$value" ]; then
                    RUNNER_NAME="$value"
                fi
                ;;
            SCRAPER_AUTO_UPDATE)
                if [ -z "$SCRAPER_AUTO_UPDATE" ] && [ -n "$value" ]; then
                    SCRAPER_AUTO_UPDATE="$value"
                fi
                ;;
        esac
    done < "$CONFIG_FILE"
}

persist_config() {
    mkdir -p "$CONFIG_DIR"

    cat > "$CONFIG_FILE" <<EOF
SCRAPER_API_URL=$SCRAPER_API_URL
SCRAPER_API_KEY=$SCRAPER_API_KEY
RUNNER_NAME=$RUNNER_NAME
SCRAPER_AUTO_UPDATE=$AUTO_UPDATES_ENABLED
EOF

    chmod 600 "$CONFIG_FILE" 2>/dev/null || true
}

get_config() {
    echo ""
    echo -e "${BOLD}Configuration${NC}"
    echo ""
    
    if [ -n "$SCRAPER_API_URL" ]; then
        echo -e "API URL: ${CYAN}$SCRAPER_API_URL${NC} (from saved config or environment)"
    else
        require_tty
        echo -e "${YELLOW}Enter your BayStateApp API URL${NC}"
        echo -e "(e.g., https://app.baystatepet.com)"
        read -p "> " SCRAPER_API_URL < /dev/tty
        
        if [ -z "$SCRAPER_API_URL" ]; then
            SCRAPER_API_URL="https://app.baystatepet.com"
            echo -e "Using default: ${CYAN}$SCRAPER_API_URL${NC}"
        fi
    fi

    local admin_setup_url="${SCRAPER_API_URL%/}/admin/scrapers/network"
    echo ""
    echo -e "Open ${CYAN}${admin_setup_url}${NC} to create a new Runner API key."

    if [ -n "$SCRAPER_API_KEY" ]; then
        echo -e "API Key: ${CYAN}${SCRAPER_API_KEY:0:12}...${NC} (from saved config or environment)"
    else
        require_tty
        echo ""
        echo -e "${YELLOW}Enter your API Key${NC}"
        echo -e "(Get this from Admin Panel > Scraper Network > Runner Accounts)"
        read -rsp "> " SCRAPER_API_KEY < /dev/tty
        echo ""
        
        if [ -z "$SCRAPER_API_KEY" ]; then
            echo -e "${RED}Error: API Key is required${NC}"
            exit 1
        fi
    fi
    
    if [[ ! "$SCRAPER_API_KEY" == bsr_* ]]; then
        echo -e "${YELLOW}Warning: API key should start with 'bsr_'${NC}"
    fi
    
    if [ -z "$RUNNER_NAME" ]; then
        RUNNER_NAME=$(hostname | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
    fi
    echo ""
    echo -e "Runner Name: ${CYAN}$RUNNER_NAME${NC}"
}

get_auto_update_preference() {
    echo ""
    echo -e "${BOLD}Automatic Updates${NC}"

    if [ -n "$SCRAPER_AUTO_UPDATE" ]; then
        if is_truthy "$SCRAPER_AUTO_UPDATE"; then
            AUTO_UPDATES_ENABLED="true"
            echo -e "Auto-update: ${CYAN}enabled${NC} (from SCRAPER_AUTO_UPDATE)"
        else
            AUTO_UPDATES_ENABLED="false"
            echo -e "Auto-update: ${CYAN}disabled${NC} (from SCRAPER_AUTO_UPDATE)"
        fi
        return
    fi

    require_tty

    echo -e "Enable automatic updates from GitHub Packages (GHCR)? ${CYAN}[Y/n]${NC}"
    read -r -p "> " AUTO_UPDATE_RESPONSE < /dev/tty

    if [ -z "$AUTO_UPDATE_RESPONSE" ] || [[ "$AUTO_UPDATE_RESPONSE" =~ ^[Yy]$ ]]; then
        AUTO_UPDATES_ENABLED="true"
    else
        AUTO_UPDATES_ENABLED="false"
    fi

    if [ "$AUTO_UPDATES_ENABLED" = "true" ]; then
        echo -e "Auto-update: ${CYAN}enabled${NC}"
    else
        echo -e "Auto-update: ${CYAN}disabled${NC}"
    fi
}

write_update_script() {
    mkdir -p "$CONFIG_DIR"

    cat > "$UPDATE_SCRIPT" <<EOF
#!/usr/bin/env bash
set -euo pipefail

IMAGE="$IMAGE"
CONTAINER_NAME="$CONTAINER_NAME"
CONFIG_FILE="$CONFIG_FILE"

if ! command -v docker >/dev/null 2>&1; then
    exit 0
fi

if ! docker info >/dev/null 2>&1; then
    exit 0
fi

if [ ! -f "\$CONFIG_FILE" ]; then
    exit 0
fi

CURRENT_IMAGE_ID="\$(docker inspect --format '{{.Image}}' "\$CONTAINER_NAME" 2>/dev/null || true)"

if ! docker pull "\$IMAGE" >/dev/null 2>&1; then
    exit 0
fi

NEW_IMAGE_ID="\$(docker image inspect --format '{{.Id}}' "\$IMAGE" 2>/dev/null || true)"

if [ -z "\$NEW_IMAGE_ID" ]; then
    exit 0
fi

if [ -n "\$CURRENT_IMAGE_ID" ] && [ "\$CURRENT_IMAGE_ID" = "\$NEW_IMAGE_ID" ]; then
    exit 0
fi

if docker ps -a --format '{{.Names}}' | grep -q "^\$CONTAINER_NAME\$"; then
    docker stop "\$CONTAINER_NAME" >/dev/null 2>&1 || true
    docker rm "\$CONTAINER_NAME" >/dev/null 2>&1 || true
fi

docker run -d \
    --name "\$CONTAINER_NAME" \
    --restart unless-stopped \
    --init \
    --shm-size=2g \
    --env-file "\$CONFIG_FILE" \
    "\$IMAGE" >/dev/null
EOF

    chmod 700 "$UPDATE_SCRIPT"
}

remove_auto_update_schedule() {
    if ! command -v crontab >/dev/null 2>&1; then
        return
    fi

    local current_cron
    current_cron="$(crontab -l 2>/dev/null || true)"

    if [ -z "$current_cron" ]; then
        return
    fi

    local filtered_cron
    filtered_cron="$(printf '%s\n' "$current_cron" | grep -v "$AUTO_UPDATE_CRON_MARKER" || true)"

    if [ -n "$filtered_cron" ]; then
        printf '%s\n' "$filtered_cron" | crontab -
    else
        crontab -r 2>/dev/null || true
    fi
}

setup_auto_update_schedule() {
    if ! command -v crontab >/dev/null 2>&1; then
        echo -e "${YELLOW}Warning:${NC} crontab not available; auto-updates were not scheduled."
        echo -e "Run ${CYAN}$UPDATE_SCRIPT${NC} manually to update from GitHub Packages."
        return
    fi

    local existing_cron
    existing_cron="$(crontab -l 2>/dev/null || true)"

    local filtered_cron
    filtered_cron="$(printf '%s\n' "$existing_cron" | grep -v "$AUTO_UPDATE_CRON_MARKER" || true)"

    {
        if [ -n "$filtered_cron" ]; then
            printf '%s\n' "$filtered_cron"
        fi
        printf '0 * * * * "%s" # %s\n' "$UPDATE_SCRIPT" "$AUTO_UPDATE_CRON_MARKER"
    } | crontab -
}

stop_existing() {
    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo ""
        echo -e "${YELLOW}Stopping existing container...${NC}"
        docker stop "$CONTAINER_NAME" 2>/dev/null || true
        docker rm "$CONTAINER_NAME" 2>/dev/null || true
        echo -e "${GREEN}✓${NC} Removed old container"
    fi
}

pull_image() {
    echo ""
    echo -e "${BOLD}Pulling latest image...${NC}"
    docker pull "$IMAGE"
    echo -e "${GREEN}✓${NC} Image pulled successfully"
}

start_container() {
    echo ""
    echo -e "${BOLD}Starting scraper daemon...${NC}"
    
    local run_args=(
        -d
        --name "$CONTAINER_NAME"
        --restart unless-stopped
        --init
        --shm-size=2g
        --env-file "$CONFIG_FILE"
    )

    docker run "${run_args[@]}" "$IMAGE"

    echo -e "${GREEN}✓${NC} Container started"
}

setup_auto_updates() {
    if [ "$AUTO_UPDATES_ENABLED" != "true" ]; then
        remove_auto_update_schedule
        echo -e "${GREEN}✓${NC} Automatic updates disabled"
        return
    fi

    echo ""
    echo -e "${BOLD}Configuring automatic updates...${NC}"
    setup_auto_update_schedule
    echo -e "${GREEN}✓${NC} Automatic updates enabled via GitHub Packages"
}

verify_running() {
    echo ""
    sleep 2
    
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo -e "${GREEN}${BOLD}Installation complete!${NC}"
        echo ""
        echo -e "Your scraper runner is now running in the background."
        echo ""
        echo -e "${BOLD}Useful commands:${NC}"
        echo -e "  View logs:     ${CYAN}docker logs -f $CONTAINER_NAME${NC}"
        echo -e "  Stop runner:   ${CYAN}docker stop $CONTAINER_NAME${NC}"
        echo -e "  Start runner:  ${CYAN}docker start $CONTAINER_NAME${NC}"
        echo -e "  Update:        ${CYAN}$INSTALL_COMMAND${NC}"
        echo -e "  Updater:       ${CYAN}$UPDATE_SCRIPT${NC}"
        if [ "$AUTO_UPDATES_ENABLED" = "true" ]; then
            echo -e "  Auto-update:   ${CYAN}Enabled hourly via cron + GHCR${NC}"
        fi
        echo ""
    else
        echo -e "${RED}Error: Container failed to start${NC}"
        echo "Check logs with: docker logs $CONTAINER_NAME"
        exit 1
    fi
}

main() {
    print_banner
    load_saved_config
    check_docker
    get_config
    get_auto_update_preference
    persist_config
    write_update_script
    stop_existing
    pull_image
    start_container
    setup_auto_updates
    verify_running
}

main
