# ReachInbox Dispatch

A full-stack email scheduling dashboard built around Express, Prisma, BullMQ, Redis, PostgreSQL, React, and Ethereal SMTP.

## Project Structure

```
reachinbox/
├── docker-compose.yml     # Infrastructure (PostgreSQL, Redis AOF)
├── backend/               # Express API, Worker, Prisma Schema, Tests
│   ├── src/
│   │   ├── api.ts         # REST Endpoints & Authentication
│   │   ├── worker.ts      # BullMQ Worker, Rate Limiter & SMTP Sender
│   │   ├── queue.ts       # Queue definition & helpers
│   │   ├── scheduling.ts  # Batch/recipient spacing & ingestion logic
│   │   ├── db.ts          # Prisma Client setup
│   │   └── redis.ts       # Redis client setup
│   └── tests/             # Ingestion & scheduling integration tests
└── frontend/              # React Dashboard SPA
    ├── src/
    │   ├── types.ts       # Shared TypeScript types
    │   ├── utils.ts       # Helpers (formatDate, initials, session management)
    │   ├── components/    # Reusable UI Components
    │   │   ├── Sidebar.tsx
    │   │   ├── LoginScreen.tsx
    │   │   ├── EmailRow.tsx
    │   │   ├── ComposeScreen.tsx
    │   │   └── DetailScreen.tsx
    │   └── App.tsx        # Thin orchestrator (state & routing)
    └── styles.css         # Customized theme CSS
```

## Quick Start (Run Locally)

### Prerequisites:

- **Node.js 22+**
- **Docker Desktop** (running PostgreSQL and Redis)
- **Google OAuth Web Client ID** (for authentication)
- **Ethereal SMTP credentials** (test account from [ethereal.email](https://ethereal.email))

---

### Step 1: Start the Infrastructure

In the project root, start the PostgreSQL and Redis containers:

```powershell
docker compose up -d  # Run every time to start databases
```
*Expected Output on Success:*
```text
✔ Container reachinbox-postgres-1 Running
✔ Container reachinbox-redis-1    Running
```

---

### Step 2: Configure and Boot the Backend

1. Navigate to the backend directory:
   ```powershell
   cd backend
   ```

2. Install dependencies:
   ```powershell
   npm install  # One-time setup only
   ```
   *Expected Output on Success:*
   ```text
   added XXX packages, and audited YYY packages in Zs
   ```

3. Create the environment file:
   ```powershell
   copy .env.example .env  # One-time setup only
   ```
   *Expected Output on Success:*
   ```text
   1 file(s) copied.
   ```

4. **Update `.env`**:
   Open `backend/.env` and supply:
   - `DATABASE_URL` (if different from default docker setup)
   - `GOOGLE_CLIENT_ID`
   - `SMTP_USER` and `SMTP_PASS` (from your Ethereal account)

5. Generate the Prisma Client and migrate the database:
   ```powershell
   npx prisma generate  # One-time setup (and after schema changes)
   npx prisma db push   # One-time setup (and after schema changes)
   ```
   *Expected Output on Success:*
   ```text
   ✔ Generated Prisma Client (v6.14.0) to .\node_modules\@prisma\client in 304ms
   Database schema is up to date!
   ```

6. Start the API Server:
   ```powershell
   npm run dev  # Run every time to start server
   ```
   *Expected Output on Success:*
   ```text
   API server listening on port 4000
   ```

7. Start the Queue Worker (in a separate terminal inside `backend/`):
   ```powershell
   npm run worker  # Run every time to start worker
   ```
   *Expected Output on Success:*
   ```text
   Queue worker active & listening for BullMQ jobs...
   ```

---

### Step 3: Configure and Boot the Frontend

1. Navigate to the frontend directory:
   ```powershell
   cd ../frontend
   ```

2. Install dependencies:
   ```powershell
   npm install  # One-time setup only
   ```
   *Expected Output on Success:*
   ```text
   added XXX packages, and audited YYY packages in Zs
   ```

3. Create the environment file:
   ```powershell
   copy .env.example .env  # One-time setup only
   ```
   *Expected Output on Success:*
   ```text
   1 file(s) copied.
   ```

4. **Update `.env`**:
   Open `frontend/.env` and set:
   - `VITE_GOOGLE_CLIENT_ID` (must match the backend)
   - `VITE_API_URL` (defaults to `http://localhost:4000`)

5. Start the development server:
   ```powershell
   npm run dev  # Run every time to start dev dashboard
   ```
   *Expected Output on Success:*
   ```text
     VITE v7.3.6  ready in X ms

     ➜  Local:   http://localhost:5173/
     ➜  Network: use --host to expose
   ```

6. Open your browser to `http://localhost:5173`.

---

## Testing & Verification

To verify typescript safety, build correctness, and run the test suite:

### Backend Tests & Build
```powershell
cd backend
npm run build        # Compiles TypeScript (verification/production)
npm test             # Runs integration tests (including 1000-recipient burst tests)
npx prisma validate  # Checks schema validity
```
*Expected Output on Success (`npm test`):*
```text
PASS  tests/scheduling.test.ts
  ✓ Spacing & scheduling limits (X ms)
  ✓ 1000-recipient burst limits (Y ms)
```

### Frontend Build
```powershell
cd frontend
npm run build        # Checks TypeScript compilation and runs Vite build
```
*Expected Output on Success:*
```text
vite v7.3.6 building client environment for production...
✓ 1585 modules transformed.
dist/index.html                   0.47 kB
dist/assets/index-CGxq-81L.css   10.28 kB
dist/assets/index-BG-Q6RZK.js   207.24 kB
✓ built in 6.50s
```

---

## Core Architecture & Safety

- **No Cron Jobs**: Scheduling is fully managed via BullMQ delayed jobs with Redis AOF persistence.
- **Deduplication & Idempotency**:
  - `POST /api/batches` supports a custom `Idempotency-Key` header bound to the user's fingerprint.
  - Job IDs are mapped directly to database row IDs (`jobId = row.id`), guaranteeing BullMQ cannot schedule duplicate runs for the same record.
- **Graceful Reconnections & Crash Recovery**:
  - On worker boot, orphaned `processing` rows are reset to `pending` and missing BullMQ jobs are enqueued.
  - The API runs a lightweight reconciliation cycle on startup and every 30 seconds to catch any jobs that were saved to PostgreSQL but failed to enqueue to Redis.
- **Rate-Limiting (Atomic Redis Counter)**:
  - Tracks sending velocity per-sender using atomic increments (`INCR`/`EXPIRE`) on `ratelimit:<senderId>:<hour>` keys.
  - When the hourly cap is hit, jobs are delayed and rescheduled to the next UTC hour rather than dropped or failed.

---

## Viewing Logs & Troubleshooting

Logs are generated across different processes and can be monitored as follows:

### 1. Database & Redis Logs (Docker)
To view output or troubleshoot connection/startup errors for your database or Redis cache:
```powershell
docker compose logs -f                 # Follow logs from both services
docker compose logs -f postgres        # Follow PostgreSQL logs only
docker compose logs -f redis           # Follow Redis logs only
```

### 2. Backend API Logs
The Express API prints request routing, server startup details, and reconciliation logs directly to stdout:
- If running under `npm run dev`, check the terminal running this command.
- Production logs can be redirected to a file if necessary: `npm run dev > api.log`.

### 3. Queue Worker Logs
The BullMQ worker prints active state, job claim processes, Ethereal SMTP delivery receipts, and backoff retries:
- Look at the console running `npm run worker`. You will see trace logs when jobs are processed:
  ```text
  [Worker] Claimed job row_uuid...
  [Worker] Email successfully sent to recipient@example.com (MessageID: <...>)
  ```

### 4. Frontend Logs (Browser Console)
- Open the dashboard at `http://localhost:5173`.
- Press `F12` (or Right-Click -> Inspect) and select the **Console** tab.
- This displays API connectivity errors, token validation callbacks, CSV/TXT address parsing feedback, and runtime warning indicators.


