# GitHub Actions Self-Hosted Runner (Docker)

This folder contains a **Docker Compose** setup to run a GitHub Actions self-hosted runner inside a container.

> ✅ Works on Windows (via Docker Desktop), macOS, and Linux.

---

## Quick start

1. Copy the env template:

```bash
cp .env.example .env
```

2. Fill in `.env`:

- `RUNNER_REPO` (recommended) **or** `RUNNER_ORG` (not both)
- `RUNNER_TOKEN` (from GitHub)

3. Start the runner:

```bash
docker compose up -d
```

4. Confirm your runner is online:

- GitHub → Settings → Actions → Runners → Self-hosted runners

---

## Getting a runner token

1. Go to the repository or organization you want to add the runner to.
2. Navigate to **Settings → Actions → Runners**.
3. Click **New self-hosted runner**.
4. Copy the **token** shown in the setup instructions.

> Tokens expire quickly, so start the container immediately after copying it.

---

## Logs / Control

```bash
docker compose logs -f

docker compose stop

docker compose start

docker compose down
```

---

## Notes

- The container stores runner state in `./_work` (it is safe to delete to reset the runner).
- If you want the runner to spawn sibling Docker containers, keep the `docker.sock` volume enabled.
