[CmdletBinding()]
param(
  [switch]$Migrate,
  [switch]$CheckEnv,
  [switch]$SkipTests
)

$ErrorActionPreference = "Stop"
$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$BackendDir = Join-Path $RootDir "backend"
$FrontendDir = Join-Path $RootDir "frontend"

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )

  Write-Host "+ $Command $($Arguments -join ' ')"
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $Command"
  }
}

function Get-EnvironmentValue([string]$Name) {
  return [Environment]::GetEnvironmentVariable($Name)
}

if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "Node.js and npm are required."
}

$NodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($NodeMajor -lt 18) {
  throw "Node.js 18 or newer is required; found $(node --version)."
}

if ($CheckEnv) {
  $RequiredBackendVariables = @(
    "DATABASE_URL", "REDIS_URL", "GOOGLE_CLIENT_ID", "ETHEREAL_EMAIL",
    "ETHEREAL_PASSWORD", "ETHEREAL_HOST", "ETHEREAL_PORT", "FRONTEND_URL"
  )
  $Missing = @($RequiredBackendVariables | Where-Object { [string]::IsNullOrWhiteSpace((Get-EnvironmentValue $_)) })
  if ($Missing.Count -gt 0) {
    throw "Missing production backend variables: $($Missing -join ' ')"
  }
  if (-not [string]::IsNullOrWhiteSpace((Get-EnvironmentValue "DEV_TEST_TOKEN"))) {
    throw "DEV_TEST_TOKEN must not be set for production deployment."
  }
  if ([string]::IsNullOrWhiteSpace((Get-EnvironmentValue "VITE_API_URL")) -or
      [string]::IsNullOrWhiteSpace((Get-EnvironmentValue "VITE_GOOGLE_CLIENT_ID"))) {
    throw "Missing production frontend variables: VITE_API_URL VITE_GOOGLE_CLIENT_ID"
  }
}

Write-Host "== Installing backend dependencies =="
Invoke-Step "npm" @("--prefix", $BackendDir, "ci")

Write-Host "== Validating Prisma schema =="
Invoke-Step "npm" @("--prefix", $BackendDir, "run", "prisma", "--", "validate")

if ($Migrate) {
  if ([string]::IsNullOrWhiteSpace((Get-EnvironmentValue "DATABASE_URL"))) {
    throw "DATABASE_URL is required when using -Migrate."
  }
  Write-Host "== Applying production migrations =="
  Invoke-Step "npm" @("--prefix", $BackendDir, "run", "db:deploy")
}

Write-Host "== Building backend =="
Invoke-Step "npm" @("--prefix", $BackendDir, "run", "build")

if (-not $SkipTests) {
  Write-Host "== Running backend tests =="
  Invoke-Step "npm" @("--prefix", $BackendDir, "test")
}

Write-Host "== Installing frontend dependencies =="
Invoke-Step "npm" @("--prefix", $FrontendDir, "ci")

Write-Host "== Building frontend =="
Invoke-Step "npm" @("--prefix", $FrontendDir, "run", "build")

foreach ($Entrypoint in @(
  (Join-Path $BackendDir "dist/server.js"),
  (Join-Path $BackendDir "dist/worker.js")
)) {
  if (-not (Test-Path -LiteralPath $Entrypoint -PathType Leaf)) {
    throw "Expected build output is missing: $Entrypoint"
  }
}

Write-Host ""
Write-Host "Deployment preparation completed successfully."
Write-Host "Railway API start command:    npm run start"
Write-Host "Railway worker start command: node dist/worker.js"
Write-Host "Vercel build command:         npm run build"
