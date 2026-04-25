# Bay State Scraper - Docker Image for Self-Hosted Runners
# Provides consistent Python + Playwright environment for web scraping
#
# Usage (daemon mode - recommended):
#   docker build -f apps/scraper/Dockerfile -t baystate-scraper:latest .
#   docker run -d --restart unless-stopped \
#     -e SCRAPER_API_URL=https://app.baystatepet.com \
#     -e SCRAPER_API_KEY=bsr_xxxx \
#     -e SCRAPER_BROWSER_STATE_DIR=/app/.browser_storage_states \
#     -v baystate-scraper-browser-state:/app/.browser_storage_states \
#     baystate-scraper:latest
#
# Usage (single job mode - legacy):
#   docker run --rm \
#     -e SCRAPER_API_URL=https://app.baystatepet.com \
#     -e SCRAPER_API_KEY=bsr_xxxx \
#     -e SCRAPER_BROWSER_STATE_DIR=/app/.browser_storage_states \
#     -v baystate-scraper-browser-state:/app/.browser_storage_states \
#     baystate-scraper:latest \
#     python runner.py --job-id <uuid>

FROM mcr.microsoft.com/playwright/python:v1.57.0-jammy

WORKDIR /app

ARG RUNNER_BUILD_ID=unknown
ARG RUNNER_BUILD_SHA=unknown

# Install only the dependencies needed by the runner image
COPY apps/scraper/requirements-runtime.txt ./requirements-runtime.txt
RUN pip install --no-cache-dir -r requirements-runtime.txt

# Install Playwright browsers (chromium only - firefox rarely needed)
RUN playwright install chromium

# Copy only the runtime code needed by the runner image
COPY apps/scraper/daemon.py ./daemon.py
COPY apps/scraper/runner.py ./runner.py
COPY apps/scraper/core ./core
COPY apps/scraper/runner ./runner
COPY apps/scraper/scrapers ./scrapers
COPY apps/scraper/src ./src
COPY apps/scraper/utils ./utils
COPY apps/scraper/validation ./validation
COPY apps/scraper/prompts ./prompts
COPY apps/scraper/scripts/health_check.py ./scripts/health_check.py

# Shared pricing catalog for AI cost calculation
COPY shared/ai-pricing/pricing-catalog.json ./shared/ai-pricing/pricing-catalog.json

# Python runtime defaults
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

# Environment defaults
ENV BAYSTATE_RUNNER_BUILD_ID=${RUNNER_BUILD_ID}
ENV BAYSTATE_RUNNER_BUILD_SHA=${RUNNER_BUILD_SHA}
ENV BAYSTATE_RUNNER_RELEASE_CHANNEL=latest
ENV POLL_INTERVAL=30
ENV MAX_JOBS_BEFORE_RESTART=100
ENV HEALTH_CHECK_MEMORY_LIMIT_MB=1800
ENV SCRAPER_BROWSER_STATE_DIR=/app/.browser_storage_states

# Default command runs the polling daemon
# Override with: docker run ... python runner.py --job-id <uuid>
ENTRYPOINT ["python", "daemon.py"]

# Docker health check (native, works standalone)
# Mitigates Issue #1754: asyncio.Lock deadlock detection
HEALTHCHECK --interval=60s --timeout=15s --start-period=30s --retries=3 \
    CMD python /app/scripts/health_check.py || exit 1
