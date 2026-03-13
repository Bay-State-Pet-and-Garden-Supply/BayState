<#
.SYNOPSIS
    Bootstrap a GitHub Actions self-hosted runner on Windows.

.DESCRIPTION
    Downloads, verifies, and extracts the GitHub runner package under C:\actions-runner,
    then runs the GitHub-provided `config.cmd` for you.

    This is intended for interactive use on Windows machines (PowerShell).
#>

param(
    [string]$RunnerDir = "C:\actions-runner",
    [string]$Version = "2.332.0",
    [string]$ExpectedHash = "83e56e05b21eb58c9697f82e52c53b30867335ff039cd5d44d1a1a24d2149f4b",
    [string]$Url = "https://github.com/Bay-State-Pet-and-Garden-Supply",
    [string]$Token
)

function Write-Info($msg) { Write-Host "[INFO]  $msg" -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Write-ErrorAndExit($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red; exit 1 }

if (-not $Token) {
    Write-Host "";
    Write-Host "A GitHub runner registration token is required." -ForegroundColor Yellow
    Write-Host "Get one at: $Url/settings/actions/runners/new" -ForegroundColor Yellow
    $Token = Read-Host "Paste your runner token"
}

if (-not $Token) {
    Write-ErrorAndExit "Runner token is required."
}

$zipName = "actions-runner-win-x64-$Version.zip"
$zipPath = Join-Path $env:TEMP $zipName

Write-Info "Using runner version: $Version"
Write-Info "Runner directory: $RunnerDir"
Write-Info "Downloading $zipName..."

$downloadUrl = "https://github.com/actions/runner/releases/download/v$Version/$zipName"
Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing -ErrorAction Stop

Write-Info "Validating checksum..."
$hash = (Get-FileHash -Path $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($hash -ne $ExpectedHash.ToLowerInvariant()) {
    Write-ErrorAndExit "Checksum mismatch: got $hash (expected $ExpectedHash). Aborting."
}

Write-Info "Creating runner directory ($RunnerDir) ..."
New-Item -ItemType Directory -Force -Path $RunnerDir | Out-Null

Write-Info "Extracting runner..."
Expand-Archive -Path $zipPath -DestinationPath $RunnerDir -Force
Remove-Item $zipPath

Set-Location $RunnerDir

Write-Info "Configuring runner..."
& .\config.cmd --url $Url --token $Token

Write-Host "";
Write-Host "✅ Runner configured. To start it, run:" -ForegroundColor Green
Write-Host "    cd $RunnerDir" -ForegroundColor Green
Write-Host "    .\run.cmd" -ForegroundColor Green
Write-Host "";
Write-Host "If you want to register it as a Windows service (optional):" -ForegroundColor Green
Write-Host "    .\svc.sh install" -ForegroundColor Green
Write-Host "    .\svc.sh start" -ForegroundColor Green
