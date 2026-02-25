# Scraper Runner Setup Guide (One-Line Install)

Set up a new scraper runner in under 5 minutes using a single terminal command.

## TL;DR

1. Open **Admin → Scrapers → Network** in BayStateApp
2. Create a key under **Runner Accounts**
3. Run:

```bash
curl -fsSL https://raw.githubusercontent.com/Bay-State-Pet-and-Garden-Supply/BayStateScraper/main/get.sh | bash
```

4. Paste the key into the setup wizard

The runner is deployed to Docker and starts immediately.

---

## Step-by-Step

### 1) Generate a Runner API Key

In BayStateApp admin:

- Go to **Scrapers → Network**
- Open **Runner Accounts**
- Click **Add Runner**
- Copy the `bsr_...` API key (shown once)

### 2) Run the One-Line Installer on the New Machine

```bash
curl -fsSL https://raw.githubusercontent.com/Bay-State-Pet-and-Garden-Supply/BayStateScraper/main/get.sh | bash
```

The setup wizard will ask for:

- **SCRAPER_API_URL** (defaults to `https://app.baystatepet.com`)
- **SCRAPER_API_KEY** (paste the key you generated)
- It auto-detects **RUNNER_NAME** from hostname
- Optional prompt: enable auto-updates

### 3) Verify Connection

Return to **Scrapers → Network** and confirm the runner appears as **Ready**.

---

## Docker Deployment Details

The installer:

1. Validates Docker installation/daemon
2. Pulls `ghcr.io/bay-state-pet-and-garden-supply/baystatescraper:latest`
3. Starts container `baystate-scraper` with `--restart unless-stopped`
4. Passes `SCRAPER_API_URL`, `SCRAPER_API_KEY`, and `RUNNER_NAME`

Installer state is saved to:

```bash
~/.baystate-scraper/runner.env
```

---

## Auto Updates

### Supported (Docker)

During setup, you can enable GitHub Packages (GHCR) auto-updates.

- The installer writes `~/.baystate-scraper/update-runner.sh`
- An hourly cron entry runs it (`0 * * * *`)
- It only restarts the container when a newer GHCR image is available

### If You Skip Auto Updates

Manual update command:

```bash
curl -fsSL https://raw.githubusercontent.com/Bay-State-Pet-and-Garden-Supply/BayStateScraper/main/get.sh | bash
```

---

## Useful Commands

```bash
# View runner logs
docker logs -f baystate-scraper

# Stop/start runner
docker stop baystate-scraper
docker start baystate-scraper

# Check auto-updater (if enabled)
docker logs -f baystate-scraper-watchtower
```

---

## Security Notes

- API keys are displayed once and stored hashed server-side
- The installer prompts for keys interactively (hidden input)
- Runners use API key auth via `X-API-Key` and do not connect directly to the database
