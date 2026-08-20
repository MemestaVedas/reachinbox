# ReachInbox Dispatch

A full-stack email scheduling dashboard built around Express, Prisma, BullMQ, Redis, PostgreSQL, React, and Ethereal SMTP.

## Run locally

Prerequisites:

- Node.js 22+
- Docker Desktop (for PostgreSQL and Redis)
- A Google OAuth web client ID
- An Ethereal Email account

Start the infrastructure:

```powershell
docker compose up -d
```

Configure the backend:

```powershell
Copy-Item backend/.env.example backend/.env
cd backend
npm install
npm run db:generate
npm run db:migrate
```

Set `DATABASE_URL`, `GOOGLE_CLIENT_ID`, and the Ethereal credentials in `backend/.env`. The default database and Redis URLs match `docker-compose.yml`.

Run the API and worker in separate terminals:

```powershell
cd backend
npm run dev
npm run worker
```

Configure and run the dashboard:

```powershell
Copy-Item frontend/.env.example frontend/.env
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## Architecture

```text
React dashboard
    |  Google ID token + JSON batch
    v
Express API ----> PostgreSQL (batch and delivery state)
    |                         
    +----> BullMQ delayed jobs ----> Redis AOF
                                      |
                                      v
                                Email worker ----> Ethereal SMTP
```

`POST /api/batches` normalizes and deduplicates recipients, computes each `scheduledFor` timestamp up front, writes the batch and delivery rows in a transaction, and then adds one delayed BullMQ job per row. Each job uses the delivery row ID as its BullMQ `jobId`, so reconciliation can safely re-add missing jobs after a restart.

The worker runs separately from the API. On startup it reconciles pending and processing database rows before consuming new work. Redis is configured with AOF persistence in Docker, while PostgreSQL remains the source of truth for delivery state.

## Throughput controls

- `WORKER_CONCURRENCY` controls parallel worker capacity and defaults to `5`.
- `MIN_DELAY_MS` configures BullMQ's global dispatch floor and defaults to `2000` milliseconds.
- `MAX_EMAILS_PER_HOUR_PER_SENDER` controls a Redis-backed per-sender hourly counter and defaults to `200`.
- Counters use `ratelimit:<senderId>:<UTC hour>` keys. When a sender reaches its cap, the worker returns the job to BullMQ delayed until the next UTC hour instead of failing it.
- Scheduling also spaces rows during ingestion, preserving recipient order and reducing pressure on the execution limiter.
- Jobs retry up to three times with exponential backoff. A final delivery error is written as `failed`; transient attempts return the row to `pending`.

A burst of 1,000 recipients is stored in chunks of 500 and represented by persistent delayed jobs. The hourly schedule is computed before enqueueing, so the queue does not need to hold the whole batch in memory inside one worker process.

## API surface

- `GET /health` returns API readiness.
- `POST /api/auth/google` verifies a Google Identity Services ID token and upserts the user profile.
- `POST /api/batches` accepts `subject`, `body`, `recipients`, `startTime`, `delayMs`, and `hourlyLimit`. Send an `Idempotency-Key` header to safely retry a submission.
- `GET /api/emails?status=pending|processing|sent|failed` returns dashboard rows.

The browser parses CSV or TXT lead files and sends the normalized recipient list as JSON. This keeps the API contract explicit while still supporting the required upload workflow.

## Frontend

The dashboard includes:

- Google Identity Services sign-in and logout
- Responsive workspace navigation
- Queue and delivery metrics
- Scheduled and sent email tabs
- Empty, loading, error, and preview fallback states
- CSV/TXT upload with email count detection
- Compose drawer with subject, body, start time, delay, and hourly limit controls

When `VITE_GOOGLE_CLIENT_ID` is empty, the dashboard stays available with a local preview profile so the UI can be reviewed without credentials. A configured deployment uses the real Google button and server-side token verification.

## Assumptions and trade-offs

- Ethereal credentials are stored in environment variables for this assignment. A production system would use a secrets manager and encrypted sender credentials.
- The API currently uses `X-User-Id` as the short-lived user handoff after Google verification. A production deployment should replace this with an HTTP-only session or signed access token.
- SMTP is an external side effect, so a process crash after SMTP accepts a message but before PostgreSQL records `sent` cannot be made perfectly atomic. The status guard, stable job IDs, retries, and reconciliation minimize duplicates and make the recovery path explicit.
- Docker runtime and live SMTP/database tests must be run on a machine with Docker and configured credentials. The repository build and pure scheduling assertions are verified locally.

## Checks

```powershell
cd backend
npm run build
npm run prisma -- validate

cd ../frontend
npm run build
```

No cron jobs are used. Scheduling is handled by BullMQ delayed jobs and Redis-backed counters only.
