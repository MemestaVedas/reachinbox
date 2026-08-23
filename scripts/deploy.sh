#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

RUN_MIGRATIONS=0
CHECK_ENV=0
SKIP_TESTS=0

usage() {
  cat <<'EOF'
Usage: ./scripts/deploy.sh [options]

Installs dependencies, generates Prisma Client, validates the backend,
builds the backend and frontend, and checks production entrypoints.

Options:
  --migrate       Run `prisma migrate deploy` after validation.
  --check-env     Require the production Railway/Vercel variables.
  --skip-tests    Skip the backend test suite.
  -h, --help      Show this help.

Examples:
  ./scripts/deploy.sh
  ./scripts/deploy.sh --check-env --migrate
EOF
}

for argument in "$@"; do
  case "$argument" in
    --migrate) RUN_MIGRATIONS=1 ;;
    --check-env) CHECK_ENV=1 ;;
    --skip-tests) SKIP_TESTS=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $argument" >&2; usage >&2; exit 1 ;;
  esac
done

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js and npm are required." >&2
  exit 1
fi

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if (( node_major < 18 )); then
  echo "Node.js 18 or newer is required; found $(node --version)." >&2
  exit 1
fi

run() {
  echo "+ $*"
  "$@"
}

check_required_env() {
  local missing=()
  local variable
  for variable in DATABASE_URL REDIS_URL GOOGLE_CLIENT_ID ETHEREAL_EMAIL ETHEREAL_PASSWORD ETHEREAL_HOST ETHEREAL_PORT FRONTEND_URL; do
    if [[ -z "${!variable:-}" ]]; then
      missing+=("$variable")
    fi
  done

  if (( ${#missing[@]} > 0 )); then
    echo "Missing production backend variables: ${missing[*]}" >&2
    exit 1
  fi

  if [[ -n "${DEV_TEST_TOKEN:-}" ]]; then
    echo "DEV_TEST_TOKEN must not be set for production deployment." >&2
    exit 1
  fi

  if [[ -z "${VITE_API_URL:-}" || -z "${VITE_GOOGLE_CLIENT_ID:-}" ]]; then
    echo "Missing production frontend variables: VITE_API_URL VITE_GOOGLE_CLIENT_ID" >&2
    exit 1
  fi
}

cd "$ROOT_DIR"

if (( CHECK_ENV == 1 )); then
  check_required_env
fi

echo "== Installing backend dependencies =="
run npm --prefix "$BACKEND_DIR" ci

echo "== Validating Prisma schema =="
run npm --prefix "$BACKEND_DIR" run prisma -- validate

if (( RUN_MIGRATIONS == 1 )); then
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "DATABASE_URL is required when using --migrate." >&2
    exit 1
  fi
  echo "== Applying production migrations =="
  run npm --prefix "$BACKEND_DIR" run db:deploy
fi

echo "== Building backend =="
run npm --prefix "$BACKEND_DIR" run build

if (( SKIP_TESTS == 0 )); then
  echo "== Running backend tests =="
  run npm --prefix "$BACKEND_DIR" test
fi

echo "== Installing frontend dependencies =="
run npm --prefix "$FRONTEND_DIR" ci

echo "== Building frontend =="
run npm --prefix "$FRONTEND_DIR" run build

for entrypoint in "$BACKEND_DIR/dist/server.js" "$BACKEND_DIR/dist/worker.js"; do
  if [[ ! -f "$entrypoint" ]]; then
    echo "Expected build output is missing: $entrypoint" >&2
    exit 1
  fi
done

echo
echo "Deployment preparation completed successfully."
echo "Railway API start command:    npm run start"
echo "Railway worker start command: node dist/worker.js"
echo "Vercel build command:         npm run build"
