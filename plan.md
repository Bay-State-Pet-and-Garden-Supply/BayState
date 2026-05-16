Your best practice is **not** “deploy the whole turborepo as one giant app.” That is how people accidentally create a plywood spaceship and call it DevOps.

For your BayState setup, the right simplification is:

> **One repo, one command for local dev, one CI pipeline for release, but separate deploy targets per runtime.**

You already have a real monorepo at `Bay-State-Pet-and-Garden-Supply/BayState` , with the beta web app currently on Vercel . Your root `package.json` is already using Bun workspaces for `packages/*`, `apps/mobile`, `apps/web`, and `apps/scraper`, with root scripts like `dev`, `build`, `web:dev`, `web:db:start`, `web:db:reset`, and `web:bootstrap` . That is a good foundation. The problem is probably orchestration, not the monorepo itself.

## Recommended target setup

### 1. Keep Vercel responsible only for `apps/web`

Your Next.js app should remain a Vercel project with:

```txt
Root Directory: apps/web
Build Command: bun run build
Install Command: bun install
```

Vercel’s monorepo docs explicitly expect you to create a separate Vercel project for each deployable directory and configure the root directory for that project. Every commit can then issue deployments for connected projects, while unchanged projects can be skipped automatically if the workspace graph is correct. ([Vercel][1])

Your repo already matches this pattern because the README says:

```txt
Web: Deployed to Vercel (root directory: apps/web)
Scraper: Built as Docker image from apps/scraper/Dockerfile
```



So do **not** try to make Vercel deploy the scraper daemon. Vercel is great for the web app, API routes, serverless/edge-ish work, and preview deployments. It is not where your long-running Playwright scraper daemon belongs. Humanity has made enough mistakes already.

### 2. Deploy the scraper as a Docker service/job, not as part of Vercel

Your scraper already has a Dockerfile designed for daemon mode and self-hosted runners. It uses Playwright’s Python image, installs runtime requirements, copies scraper code, sets polling/runtime env vars, and runs `python daemon.py` as the entrypoint .

That means your deploy target should be one of:

```txt
Simple: Render / Railway / Fly.io
More serious: AWS ECS / EC2 / DigitalOcean App Platform
Most controlled: your own VPS + Docker Compose
```

For your current project stage, I would use **one Docker host** for the scraper, either Railway/Render/Fly or a small VPS. Then CI builds and redeploys the image whenever `apps/scraper/**` changes.

The production shape becomes:

```txt
GitHub repo
  ├─ apps/web      → Vercel
  ├─ apps/scraper  → Docker image/service
  ├─ packages/*    → shared code
  └─ supabase/*    → database migrations/seeds
```

### 3. Treat Supabase as infrastructure, not an app

Local Supabase should be started/reset from scripts. Production Supabase should be migrated from CI.

Your current web package already has:

```json
"db:start": "supabase start",
"db:reset": "supabase db reset",
"db:seed": "supabase db reset"
```



That is fine for local dev. Supabase docs say local development requires a Docker-compatible container runtime and starts the local stack with `supabase start`; they also warn not to expose the local stack publicly, because apparently we need to say “don’t publish your local database to the internet” out loud now. ([Supabase][2])

For production, use:

```bash
supabase db push
```

or:

```bash
supabase migration up --linked
```

Supabase documents `db push` as pushing local migrations to the linked remote database, and `migration up --linked` as applying pending migrations to the linked project. ([Supabase][3])

Do **not** use `supabase db reset --linked` in production. Supabase says `db reset` recreates the local Postgres container, applies migrations, and seeds after migrations, discarding other local data. It also has linked/remote reset flags, which is exactly the kind of footgun that wears a fake mustache and says “trust me.” ([Supabase][3])

## What I would change in your repo

### Root scripts should become the “control panel”

Your current root scripts are decent, but I would make the intent clearer:

```json
{
  "scripts": {
    "dev": "turbo run dev",
    "dev:web": "turbo run dev --filter=@baystate/web",
    "dev:scraper": "turbo run dev --filter=@baystate/scraper",
    "dev:all": "turbo run dev --parallel",

    "local:bootstrap": "bun install && bun run web:bootstrap && bun run web:db:start && bun run web:db:reset && bun run web:local:verify",
    "local:reset": "bun run web:db:reset && bun run web:local:verify",

    "check": "turbo run lint typecheck test",
    "build": "turbo run build",

    "deploy:db": "cd apps/web && supabase db push",
    "deploy:web": "vercel --prod",
    "deploy:scraper": "docker build -f apps/scraper/Dockerfile -t baystate-scraper:latest ."
  }
}
```

I would eventually rename `apps/web` from `"name": "@baystate/web"` to something real like `"@baystate/web"` because “@baystate/web” sitting in a production-bound repo is the software equivalent of labeling your electrical panel “misc sparks.” Your Vercel monorepo optimization also benefits from unique package names and explicit dependencies; Vercel says all workspace packages should have unique names, and internal dependencies need to be explicitly declared for dependency graph detection. ([Vercel][1])

### `turbo.json` should know all production env vars

Your current `turbo.json` includes `VERCEL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for build hashing . That is not enough for your app if build/runtime behavior depends on Stripe, AI providers, Supabase service role usage, ShopSite, scraper API settings, etc.

Turborepo’s docs say environment variables should be accounted for in `env` or `globalEnv`, and missing env configuration can cause wrong cache hits, including preview builds accidentally using production-style configuration. ([Turborepo][4])

I’d expand it roughly like this:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env*", "apps/*/.env*"],
  "tasks": {
    "dev": {
      "cache": false,
      "persistent": true
    },
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*", "apps/*/.env*"],
      "env": [
        "VERCEL",
        "NODE_ENV",

        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
        "SUPABASE_SECRET_KEY",

        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",

        "OPENAI_API_KEY",
        "DEEPSEEK_API_KEY",
        "GOOGLE_GENERATIVE_AI_API_KEY",

        "SHOP_SITE_*",
        "SCRAPER_*"
      ],
      "outputs": [".next/**", "!.next/cache/**", ".vercel/output/**", "dist/**"]
    },
    "lint": {
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["^typecheck"],
      "outputs": []
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": []
    }
  }
}
```

Turborepo also recommends keeping `.env` files inside application packages rather than in the repo root, because each app has its own runtime environment and root env files leak across apps as the monorepo grows. ([Turborepo][4])

## Best-practice deployment flow

Use GitHub as the “deploy everything at once” trigger, not as proof that everything runs in one place.

```txt
Push to master
  ↓
CI checks:
  - bun install
  - turbo run lint typecheck test build
  ↓
Database migration:
  - supabase db push
  ↓
Deploy web:
  - Vercel auto-deploys apps/web
  ↓
Deploy scraper:
  - build Docker image
  - push image
  - restart scraper service
```

That gives you one release pipeline while respecting that your pieces are different kinds of software. A Next.js app, a Postgres schema, and a Playwright daemon are not the same organism. They are barely the same species.

## Local dev should become boring

Your README already lists the local flow: install dependencies, start Supabase, check Supabase status, copy `.env.local.example`, reset/seed the DB, verify seed data, and start Next.js . That is good documentation, but bad daily ergonomics.

Collapse it into three commands:

```bash
bun run local:bootstrap
bun run dev:web
bun run dev:scraper
```

Or, when you want everything:

```bash
bun run dev:all
```

Turborepo supports long-running dev tasks with `"cache": false` and `"persistent": true`, exactly like your repo already has, and it supports filtering to run a specific app such as `turbo dev --filter=web`. ([Turborepo][5])

## The answer, bluntly

For BayState, the best practice is:

```txt
Vercel deploys apps/web.
Supabase handles the database.
Docker deploys apps/scraper.
Turborepo coordinates local dev and CI checks.
GitHub Actions coordinates the release.
```

Do **not** over-Dockerize the Next.js app just because the scraper needs Docker. Do **not** shove the scraper into Vercel just because the web app is there. Do **not** treat Supabase migrations like a side effect of `next build`.

Your simplification goal should be:

```txt
One repo.
One install command.
One local bootstrap command.
One CI release pipeline.
Separate deployment targets.
```

That is the clean version. Not glamorous, but neither is plumbing, and everyone gets dramatic when it breaks.

[1]: https://vercel.com/docs/monorepos "Using Monorepos"
[2]: https://supabase.com/docs/guides/local-development "Local Development & CLI | Supabase Docs"
[3]: https://supabase.com/docs/reference/cli/supabase-db-reset "CLI Reference | Supabase Docs"
[4]: https://turborepo.com/docs/crafting-your-repository/using-environment-variables "Using environment variables"
[5]: https://turborepo.com/docs/crafting-your-repository/developing-applications "Developing applications"
