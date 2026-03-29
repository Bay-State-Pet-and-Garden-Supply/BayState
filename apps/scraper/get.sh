#!/bin/bash
set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
BOLD='\033[1m'

IMAGE="ghcr.io/bay-state-pet-and-garden-supply/baystate/scraper:latest"
STACK_NAME="baystate-scraper"
SCRAPER_CONTAINER_NAME="baystate-scraper"
WATCHTOWER_CONTAINER_NAME="baystate-scraper-watchtower"
INSTALL_COMMAND="curl -fsSL https://raw.githubusercontent.com/Bay-State-Pet-and-Garden-Supply/BayState/refs/heads/master/apps/scraper/get.sh | bash"
CONFIG_DIR="$HOME/.baystate-scraper"
CONFIG_FILE="$CONFIG_DIR/runner.env"
COMPOSE_FILE="$CONFIG_DIR/compose.yml"
BROWSER_STATE_DIR="$CONFIG_DIR/browser-state"
LEGACY_UPDATE_SCRIPT="$CONFIG_DIR/update-runner.sh"
AUTO_UPDATE_CRON_MARKER="baystate-scraper-auto-update"

AUTO_UPDATES_ENABLED="false"
DOCKER_COMPOSE_CMD=()
WATCHTOWER_DOCKER_API_VERSION=""

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
    if ! command -v docker >/dev/null 2>&1; then
        echo -e "${RED}Error: Docker is not installed.${NC}"
        echo ""
        echo "Install Docker first:"
        echo "  - Mac: https://docs.docker.com/desktop/install/mac-install/"
        echo "  - Linux: curl -fsSL https://get.docker.com | sh"
        echo "  - Windows: https://docs.docker.com/desktop/install/windows-install/"
        exit 1
    fi

    if ! docker info >/dev/null 2>&1; then
        echo -e "${RED}Error: Docker daemon is not running.${NC}"
        echo "Please start Docker and try again."
        exit 1
    fi

    echo -e "${GREEN}✓${NC} Docker is installed and running"
}

detect_compose() {
    if docker compose version >/dev/null 2>&1; then
        DOCKER_COMPOSE_CMD=(docker compose)
    elif command -v docker-compose >/dev/null 2>&1; then
        DOCKER_COMPOSE_CMD=(docker-compose)
    else
        echo -e "${RED}Error: Docker Compose is not available.${NC}"
        echo "Install the Docker Compose plugin (preferred) or docker-compose, then re-run:"
        echo "  $INSTALL_COMMAND"
        exit 1
    fi

    echo -e "${GREEN}✓${NC} Docker Compose is available"
}

detect_watchtower_api_version() {
    local detected_version
    detected_version="$(docker version --format '{{.Server.MinAPIVersion}}' 2>/dev/null || true)"

    if [ -z "$detected_version" ] || [ "$detected_version" = "<no value>" ]; then
        detected_version="$(docker version --format '{{.Server.APIVersion}}' 2>/dev/null || true)"
    fi

    if [ -z "$detected_version" ] || [ "$detected_version" = "<no value>" ]; then
        echo -e "${RED}Error:${NC} Could not detect the Docker API version."
        echo "This is required for Watchtower auto-updates to work correctly."
        echo "Please ensure Docker is properly installed and accessible."
        echo ""
        echo "To continue without auto-updates, set:"
        echo "  export SCRAPER_AUTO_UPDATE=false"
        exit 1
    fi

    WATCHTOWER_DOCKER_API_VERSION="$detected_version"
    echo -e "${GREEN}✓${NC} Watchtower will use Docker API ${CYAN}${WATCHTOWER_DOCKER_API_VERSION}${NC}"
}

compose() {
    "${DOCKER_COMPOSE_CMD[@]}" -p "$STACK_NAME" -f "$COMPOSE_FILE" "$@"
}

compose_base_command() {
    printf 'cd "%s" && %s -p "%s" -f compose.yml' "$CONFIG_DIR" "${DOCKER_COMPOSE_CMD[*]}" "$STACK_NAME"
}

is_truthy() {
    local value
    value=$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')

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
                if [ -z "${SCRAPER_API_URL:-}" ] && [ -n "$value" ]; then
                    SCRAPER_API_URL="$value"
                fi
                ;;
            SCRAPER_API_KEY)
                if [ -z "${SCRAPER_API_KEY:-}" ] && [ -n "$value" ]; then
                    SCRAPER_API_KEY="$value"
                fi
                ;;
            RUNNER_NAME)
                if [ -z "${RUNNER_NAME:-}" ] && [ -n "$value" ]; then
                    RUNNER_NAME="$value"
                fi
                ;;
            SCRAPER_AUTO_UPDATE)
                if [ -z "${SCRAPER_AUTO_UPDATE:-}" ] && [ -n "$value" ]; then
                    SCRAPER_AUTO_UPDATE="$value"
                fi
                ;;
            BAYSTATE_RUNNER_RELEASE_CHANNEL)
                if [ -z "${BAYSTATE_RUNNER_RELEASE_CHANNEL:-}" ] && [ -n "$value" ]; then
                    BAYSTATE_RUNNER_RELEASE_CHANNEL="$value"
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
BAYSTATE_RUNNER_RELEASE_CHANNEL=${BAYSTATE_RUNNER_RELEASE_CHANNEL:-latest}
EOF

    chmod 600 "$CONFIG_FILE" 2>/dev/null || true
}

get_config() {
    echo ""
    echo -e "${BOLD}Configuration${NC}"
    echo ""

    if [ -n "${SCRAPER_API_URL:-}" ]; then
        echo -e "API URL: ${CYAN}$SCRAPER_API_URL${NC} (from saved config or environment)"
    else
        require_tty
        echo -e "${YELLOW}Enter your BayStateApp API URL${NC}"
        echo -e "(e.g., https://app.baystatepet.com)"
        read -r -p "> " SCRAPER_API_URL < /dev/tty

        if [ -z "$SCRAPER_API_URL" ]; then
            SCRAPER_API_URL="https://app.baystatepet.com"
            echo -e "Using default: ${CYAN}$SCRAPER_API_URL${NC}"
        fi
    fi

    local admin_setup_url="${SCRAPER_API_URL%/}/admin/scrapers/network"
    echo ""
    echo -e "Open ${CYAN}${admin_setup_url}${NC} to create a new Runner API key."

    if [ -n "${SCRAPER_API_KEY:-}" ]; then
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

    if [ -z "${RUNNER_NAME:-}" ]; then
        RUNNER_NAME=$(hostname | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
    fi

    if [ -z "${BAYSTATE_RUNNER_RELEASE_CHANNEL:-}" ]; then
        BAYSTATE_RUNNER_RELEASE_CHANNEL="latest"
    fi

    echo ""
    echo -e "Runner Name: ${CYAN}$RUNNER_NAME${NC}"
    echo -e "Release Channel: ${CYAN}$BAYSTATE_RUNNER_RELEASE_CHANNEL${NC}"
}

get_auto_update_preference() {
    echo ""
    echo -e "${BOLD}Automatic Updates${NC}"

    if [ -n "${SCRAPER_AUTO_UPDATE:-}" ]; then
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

    echo -e "Enable Docker-native automatic updates with Watchtower? ${CYAN}[Y/n]${NC}"
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

write_compose_file() {
    mkdir -p "$CONFIG_DIR" "$BROWSER_STATE_DIR"

    cat > "$COMPOSE_FILE" <<EOF
services:
  scraper:
    image: $IMAGE
    container_name: $SCRAPER_CONTAINER_NAME
    restart: unless-stopped
    init: true
    shm_size: 2g
    env_file:
      - ./runner.env
    environment:
      SCRAPER_BROWSER_STATE_DIR: /app/.browser_storage_states
    volumes:
      - "$BROWSER_STATE_DIR:/app/.browser_storage_states"
    healthcheck:
      test: ["CMD", "python", "/app/scripts/health_check.py"]
      interval: 60s
      timeout: 15s
      retries: 3
      start_period: 30s
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "3"
EOF

    if [ "$AUTO_UPDATES_ENABLED" = "true" ]; then
        cat >> "$COMPOSE_FILE" <<EOF
    labels:
      com.centurylinklabs.watchtower.enable: "true"
      com.centurylinklabs.watchtower.scope: "$STACK_NAME"

  watchtower:
    image: containrrr/watchtower:latest
    container_name: $WATCHTOWER_CONTAINER_NAME
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command:
      - --label-enable
      - --scope
      - $STACK_NAME
      - --cleanup
      - --interval
      - "3600"
      - --api-version
      - "$WATCHTOWER_DOCKER_API_VERSION"
    environment:
      DOCKER_API_VERSION: "$WATCHTOWER_DOCKER_API_VERSION"
      WATCHTOWER_INCLUDE_RESTARTING: "true"
    labels:
      com.centurylinklabs.watchtower.enable: "false"
EOF
    else
        cat >> "$COMPOSE_FILE" <<EOF
    labels:
      com.centurylinklabs.watchtower.enable: "false"
EOF
    fi
}

remove_legacy_auto_update_schedule() {
    if command -v crontab >/dev/null 2>&1; then
        local current_cron
        current_cron="$(crontab -l 2>/dev/null || true)"

        if [ -n "$current_cron" ]; then
            local filtered_cron
            filtered_cron="$(printf '%s\n' "$current_cron" | grep -v "$AUTO_UPDATE_CRON_MARKER" || true)"

            if [ -n "$filtered_cron" ]; then
                printf '%s\n' "$filtered_cron" | crontab -
            else
                crontab -r 2>/dev/null || true
            fi
        fi
    fi

    rm -f "$LEGACY_UPDATE_SCRIPT"
}

remove_legacy_container_if_needed() {
    local container_name="$1"

    if ! docker ps -a --format '{{.Names}}' | grep -q "^${container_name}$"; then
        return
    fi

    local compose_project
    compose_project="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$container_name" 2>/dev/null || true)"

    if [ "$compose_project" = "$STACK_NAME" ]; then
        return
    fi

    echo ""
    echo -e "${YELLOW}Migrating legacy container: ${container_name}${NC}"
    docker stop "$container_name" >/dev/null 2>&1 || true
    docker rm "$container_name" >/dev/null 2>&1 || true
}

cleanup_legacy_install() {
    remove_legacy_auto_update_schedule
    remove_legacy_container_if_needed "$SCRAPER_CONTAINER_NAME"
    remove_legacy_container_if_needed "$WATCHTOWER_CONTAINER_NAME"
}

pull_stack_images() {
    echo ""
    echo -e "${BOLD}Pulling latest images...${NC}"
    compose pull
    echo -e "${GREEN}✓${NC} Images pulled successfully"
}

start_stack() {
    echo ""
    echo -e "${BOLD}Starting scraper stack...${NC}"
    compose up -d --remove-orphans
    echo -e "${GREEN}✓${NC} Stack started"
}

verify_running() {
    echo ""
    sleep 2

    local scraper_status
    scraper_status="$(docker inspect --format '{{.State.Status}}' "$SCRAPER_CONTAINER_NAME" 2>/dev/null || true)"

    if [ "$scraper_status" != "running" ]; then
        echo -e "${RED}Error: Scraper container failed to start${NC}"
        echo "Check logs with: docker logs $SCRAPER_CONTAINER_NAME"
        exit 1
    fi

    if [ "$AUTO_UPDATES_ENABLED" = "true" ]; then
        local watchtower_status
        watchtower_status="$(docker inspect --format '{{.State.Status}}' "$WATCHTOWER_CONTAINER_NAME" 2>/dev/null || true)"

        if [ "$watchtower_status" != "running" ]; then
            echo -e "${RED}Error: Watchtower failed to start${NC}"
            echo "Check logs with: docker logs $WATCHTOWER_CONTAINER_NAME"
            exit 1
        fi
    fi

    local compose_cmd
    compose_cmd="$(compose_base_command)"

    echo -e "${GREEN}${BOLD}Installation complete!${NC}"
    echo ""
    echo -e "Your scraper runner is now running in a Docker Compose stack."
    echo ""
    echo -e "${BOLD}Useful commands:${NC}"
    echo -e "  Stack status:   ${CYAN}${compose_cmd} ps${NC}"
    echo -e "  View logs:      ${CYAN}${compose_cmd} logs -f scraper${NC}"
    echo -e "  Stop stack:     ${CYAN}${compose_cmd} stop${NC}"
    echo -e "  Start stack:    ${CYAN}${compose_cmd} start${NC}"
    echo -e "  Update:         ${CYAN}$INSTALL_COMMAND${NC}"
    echo -e "  Browser state:  ${CYAN}$BROWSER_STATE_DIR${NC}"

    if [ "$AUTO_UPDATES_ENABLED" = "true" ]; then
        echo -e "  Auto-update:    ${CYAN}Enabled via Watchtower (hourly checks)${NC}"
        echo -e "  Watchtower:     ${CYAN}${compose_cmd} logs -f watchtower${NC}"
    else
        echo -e "  Manual update:  ${CYAN}${compose_cmd} pull && ${compose_cmd} up -d${NC}"
    fi

    echo ""
}

main() {
    print_banner
    load_saved_config
    check_docker
    detect_compose
    get_config
    get_auto_update_preference
    if [ "$AUTO_UPDATES_ENABLED" = "true" ]; then
        detect_watchtower_api_version
    fi
    persist_config
    write_compose_file
    cleanup_legacy_install
    pull_stack_images
    start_stack
    verify_running
}

main
