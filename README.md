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
docker compose up -d
```

---

### Step 2: Configure and Boot the Backend

1. Navigate to the backend directory:
   ```powershell
   cd backend
   ```

2. Install dependencies:
   ```powershell
   npm install
   ```

3. Create the environment file:
   ```powershell
   copy .env.example .env
   ```

4. **Update `.env`**:
   Open `backend/.env` and supply:
   - `DATABASE_URL` (if different from default docker setup)
   - `GOOGLE_CLIENT_ID`
   - `SMTP_USER` and `SMTP_PASS` (from your Ethereal account)

5. Generate the Prisma Client and migrate the database:
   ```powershell
   npx prisma generate
   npx prisma db push
   ```

6. Start the API Server:
   ```powershell
   npm run dev
   ```

7. Start the Queue Worker (in a separate terminal inside `backend/`):
   ```powershell
   npm run worker
   ```

---

### Step 3: Configure and Boot the Frontend

1. Navigate to the frontend directory:
   ```powershell
   cd ../frontend
   ```

2. Install dependencies:
   ```powershell
   npm install
   ```

3. Create the environment file:
   ```powershell
   copy .env.example .env
   ```

4. **Update `.env`**:
   Open `frontend/.env` and set:
   - `VITE_GOOGLE_CLIENT_ID` (must match the backend)
   - `VITE_API_URL` (defaults to `http://localhost:4000`)

5. Start the development server:
   ```powershell
   npm run dev
   ```

6. Open your browser to `http://localhost:5173`.

---

## Testing & Verification

To verify typescript safety, build correctness, and run the test suite:

### Backend Tests & Build
```powershell
cd backend
npm run build     # Compiles TypeScript
npm test          # Runs integration tests (including 1000-recipient burst tests)
npx prisma validate
```

### Frontend Build
```powershell
cd frontend
npm run build     # Checks TypeScript compilation and runs Vite build
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

