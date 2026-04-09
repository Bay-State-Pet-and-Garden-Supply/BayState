# Fix Self-Hosted Runner Git Access (Exit Code 128)

## Problem
Your Windows self-hosted runner can't authenticate with GitHub to fetch the repository.

## Solutions (try in order):

### Option 1: Configure Git Credentials on Runner

On your Windows runner machine, open PowerShell as Administrator:

```powershell
# Set git user (required for commits, also helps with some auth issues)
git config --global user.name "GitHub Runner"
git config --global user.email "runner@localhost"

# Make sure git is in PATH
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Program Files\Git\cmd", "Machine")
```

### Option 2: Use Personal Access Token (PAT)

If the runner can't use the default GITHUB_TOKEN:

1. Create a PAT: GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Give it `repo` scope
3. On your runner, configure git to use it:

```powershell
# Store credentials (replace with your actual token)
git config --global credential.helper wincred
# Or use: git config --global credential.helper store
```

### Option 3: Re-register the Runner with Correct Permissions

If the runner was registered without proper repo access:

```powershell
# Remove old runner configuration
.\config.cmd remove --token YOUR_OLD_TOKEN

# Re-register with a new token from GitHub
# Go to: Settings → Actions → Runners → New self-hosted runner
.\config.cmd --url https://github.com/Bay-State-Pet-and-Garden-Supply/BayState --token YOUR_NEW_TOKEN
```

### Option 4: Quick Workaround - Use GitHub Hosted for Changes Job

If fixing the runner is complex, we can use GitHub hosted runners just for the `changes` job (which just detects file changes), and keep your self-hosted runners for the actual Docker build:

```yaml
jobs:
  changes:
    runs-on: ubuntu-latest  # GitHub hosted - no git issues
    
  build-and-push-docker:
    runs-on: self-hosted    # Your runner - does the actual work
```

## Most Likely Fix

The issue is probably that your self-hosted runner was registered but doesn't have the `GITHUB_TOKEN` permissions configured. Try **Option 3** first (re-register the runner) - this usually fixes auth issues.

## Verify Fix

After making changes, trigger a new build by pushing a test commit to the scraper directory.
