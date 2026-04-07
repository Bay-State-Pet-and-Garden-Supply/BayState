# Runner Setup Guide

Set up a new scraper runner in under 5 minutes using a single terminal command.

> **Deprecation Notice (2026-03):** The GitHub Actions-based runner has been deprecated. This guide covers the **polling daemon** approach, which is the current recommended method.

## TL;DR (One Command)

```bash
curl -sSL https://raw.githubusercontent.com/Bay-State-Pet-and-Garden-Supply/BayState/refs/heads/master/apps/scraper/get.sh | bash
```

4. Paste the key into the setup wizard

## What You'll Need

1. A Mac or Linux machine that stays powered on
2. A runner API key from the Admin Panel
3. 5 minutes

---

## Step-by-Step

### Step 1: Get Your Runner API Key

1. Go to: **Admin Panel → Scraper Network → Runner Accounts**
2. Create a new runner account
3. Copy the API key (starts with `bsr_`)

### 2) Run the One-Line Installer on the New Machine

```bash
curl -sSL https://raw.githubusercontent.com/Bay-State-Pet-and-Garden-Supply/BayState/refs/heads/master/apps/scraper/get.sh | bash
```

The script will prompt you for:
- **API URL**: Your BayStateApp URL (e.g., `https://app.baystatepet.com`)
- **API Key**: Paste the key from Step 1
- It auto-detects **RUNNER_NAME** from hostname
- Optional prompt: enable Docker-native auto-updates via Watchtower

The runner should connect automatically. Check the Admin Panel → Scraper Network to see the runner status.

The installer then:

1. Validates Docker and Docker Compose
2. Writes runner config to `~/.baystate-scraper/runner.env`
3. Writes a Compose stack to `~/.baystate-scraper/compose.yml`
4. Pulls `ghcr.io/bay-state-pet-and-garden-supply/baystate/scraper:latest`
5. Starts the `baystate-scraper` service in a Compose-managed stack
6. If enabled, starts a scoped `watchtower` sidecar that checks for new images hourly

## Architecture Overview

```
┌─────────────────┐                         ┌─────────────────────┐
│   BayStateApp   │   Polls for jobs        │   Self-Hosted       │
│   (Coordinator) │ ◀──────────────────────▶│   Runner            │
│                 │   every 30 seconds       │   (Docker Daemon)   │
└─────────────────┘                         └──────────┬──────────┘
                                                       │
                                                       ▼
                                             ┌─────────────────────┐
                                             │   Docker Container  │
                                             │   - Polling daemon  │
                                             │   - Playwright      │
                                             │   - Scraper code    │
                                             └─────────────────────┘
          Results sent via callback           │
┌─────────────────┐ ◀──────────────────────────┘
│   BayStateApp   │
│   (Database)    │
└─────────────────┘
```

### Two Modes

| Mode | How It Works | Use Case |
|------|--------------|----------|
| **Polling** (default) | Polls coordinator every 30 seconds | Most common |
| **Realtime** (v0.2.0+) | Connects via WebSocket for instant dispatch | High-volume setups |

---

## Managing Your Runner

### Docker Compose Commands

```bash
cd ~/.baystate-scraper

# View stack status
docker compose -p baystate-scraper -f compose.yml ps

# View logs
docker compose -p baystate-scraper -f compose.yml logs -f scraper

# Stop the stack
docker compose -p baystate-scraper -f compose.yml stop

# Start the stack
docker compose -p baystate-scraper -f compose.yml start

# Manually pull and restart with the latest image
docker compose -p baystate-scraper -f compose.yml pull
docker compose -p baystate-scraper -f compose.yml up -d
```

The installed runner now relies on Compose-managed container names, so Compose commands are the source of truth for managing the stack.

### Automatic Updates

If you enable auto-updates during install, the stack includes a `watchtower` sidecar. It only watches containers labeled for the Bay State scraper runner, checks GHCR hourly, and recreates the scraper container when a newer image is available. The installer intentionally avoids fixed `container_name` values so Watchtower can recreate the services without Docker name conflicts.

The installer also sets Watchtower's `DOCKER_API_VERSION` from the host daemon so it stays compatible with newer Docker Engine releases that no longer accept Watchtower's legacy default API version.

This replaces the older cron-based updater, so there is no host-level cron job or handwritten update script to maintain.

### View Real-Time Events (v0.2.0+)

If running in realtime mode, connect to the event stream:

```bash
docker compose -p baystate-scraper -f compose.yml exec scraper python -c "from scrapers.events.emitter import EventEmitter; import asyncio; asyncio.run(EventEmitter().subscribe('*', lambda e: print(e)))"
```

### Update the Runner

```bash
# Re-run the installer (safe and idempotent)
curl -sSL https://raw.githubusercontent.com/Bay-State-Pet-and-Garden-Supply/BayState/refs/heads/master/apps/scraper/get.sh | bash

# Or update manually via Compose
cd ~/.baystate-scraper
docker compose -p baystate-scraper -f compose.yml pull
docker compose -p baystate-scraper -f compose.yml up -d
```

---

## Useful Commands

```bash
cd ~/.baystate-scraper
docker compose -p baystate-scraper -f compose.yml down
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SCRAPER_API_URL` | Yes | - | BayStateApp URL |
| `SCRAPER_API_KEY` | Yes | - | Runner API key (starts with `bsr_`) |
| `RUNNER_NAME` | No | hostname | Identifier for this runner |
| `POLL_INTERVAL` | No | 30 | Seconds between job polls |
| `BSR_SUPABASE_REALTIME_KEY` | No | - | For realtime mode (optional) |
| `HEADLESS` | No | `true` | Set to `false` for visible browser |

---

## Credential Security (Vault Pattern)

Site passwords are **never stored on the runner**:

1. Runner connects to Supabase on-demand
2. Downloads encrypted credentials
3. Decrypts using `SETTINGS_ENCRYPTION_KEY` (fetched from coordinator)
4. Credentials exist only in memory during execution
5. Container exits and credentials are gone

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Docker not running" | Open Docker Desktop (macOS) or `sudo systemctl start docker` (Linux) |
| Runner shows offline | Check logs: `cd ~/.baystate-scraper && docker compose -p baystate-scraper -f compose.yml logs scraper` |
| Jobs stuck in "queued" | Verify API key is valid in Admin Panel |
| "Permission denied" on Docker | Run `sudo usermod -aG docker $USER` and log out/in |
| Auto-updates aren't happening | Check `cd ~/.baystate-scraper && docker compose -p baystate-scraper -f compose.yml logs watchtower` and verify the runner can pull from GHCR |
| `client version 1.25 is too old` in Watchtower logs | Re-run the installer so it regenerates `compose.yml` with `DOCKER_API_VERSION` set for your Docker daemon |

---

## FAQ

**Q: Can I use my laptop while it's running jobs?**
A: Yes. Jobs run in Docker containers and don't interfere with normal use.

**Q: Does my laptop need to stay open?**
A: Yes, it needs to be powered on and connected to the internet. Sleep mode will pause jobs.

**Q: Can I have multiple runners?**
A: Yes! Run the bootstrap script on each machine with a unique name.

**Q: What happens if I close my laptop during a job?**
A: The job will fail and be marked as such. No data is lost.

**Q: What's the difference from the old GitHub Actions runner?**
A: The polling daemon is self-contained and doesn't require GitHub Actions infrastructure. It's simpler, more reliable, and has lower latency.

---

## Alternative: Desktop App

For testing and debugging, use the Desktop App instead:

1. Download from [GitHub Releases](https://github.com/Bay-State-Pet-and-Garden-Supply/BayStateScraper/releases/latest)
2. Open the app
3. Enter your API key from Admin Panel → Scraper Network
4. Run scrapes manually with full visibility

The Desktop App is for **development/testing**. For production, use the Docker daemon setup above.
