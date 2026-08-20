import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import express from "express";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "./lib/db.js";
import { emailQueue } from "./queue.js";
import { scheduleRecipients } from "./scheduling.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);
const googleClient = new OAuth2Client();

app.use(express.json({ limit: "2mb" }));
app.use((request, response, next) => {
  response.header("Access-Control-Allow-Origin", process.env.FRONTEND_URL ?? "http://localhost:5173");
  response.header("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key, Authorization");
  response.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (request.method === "OPTIONS") {
    response.sendStatus(204);
    return;
  }

  next();
});

interface CreateBatchBody {
  subject?: string;
  body?: string;
  recipients?: unknown;
  startTime?: string;
  delayMs?: number;
  hourlyLimit?: number;
}

function normalizedRecipients(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const recipients = value
    .filter((recipient): recipient is string => typeof recipient === "string")
    .map((recipient) => recipient.trim().toLowerCase())
    .filter((recipient) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient));

  return [...new Set(recipients)];
}

async function senderForUser(userId?: string) {
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId } })
    : await prisma.user.upsert({
        where: { googleId: "development-user" },
        update: {},
        create: {
          googleId: "development-user",
          name: process.env.DEV_USER_NAME ?? "ReachInbox User",
          email: process.env.DEV_USER_EMAIL ?? "developer@example.com",
        },
      });

  if (!user) {
    throw new Error("Authenticated user was not found");
  }

  const existingSender = await prisma.sender.findFirst({ where: { userId: user.id } });
  if (existingSender) {
    return existingSender;
  }

  return prisma.sender.create({
    data: {
      userId: user.id,
      etherealEmail: process.env.ETHEREAL_EMAIL ?? "",
      etherealPass: process.env.ETHEREAL_PASSWORD ?? "",
      etherealHost: process.env.ETHEREAL_HOST ?? "smtp.ethereal.email",
      etherealPort: Number(process.env.ETHEREAL_PORT ?? 587),
    },
  });
}

async function reconcilePendingJobs(): Promise<void> {
  const pending = await prisma.scheduledEmail.findMany({
    where: { status: "pending" },
    select: { id: true, scheduledFor: true },
  });

  for (const email of pending) {
    if (await emailQueue.getJob(email.id)) continue;
    await emailQueue.add("send-email", { scheduledEmailId: email.id }, {
      jobId: email.id,
      delay: Math.max(0, email.scheduledFor.getTime() - Date.now()),
    });
  }
}

async function authenticatedUser(request: express.Request, response: express.Response) {
  const authorization = request.header("Authorization");
  const audience = process.env.GOOGLE_CLIENT_ID;

  if (!audience || !authorization?.startsWith("Bearer ")) {
    response.status(401).json({ error: "Google authentication is required" });
    return null;
  }

  try {
    const ticket = await googleClient.verifyIdToken({ idToken: authorization.slice(7), audience });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || !payload.name) throw new Error("Incomplete Google profile");

    return prisma.user.upsert({
      where: { googleId: payload.sub },
      update: { name: payload.name, email: payload.email, avatarUrl: payload.picture },
      create: { googleId: payload.sub, name: payload.name, email: payload.email, avatarUrl: payload.picture },
    });
  } catch {
    response.status(401).json({ error: "Google authentication could not be verified" });
    return null;
  }
}

app.post("/api/auth/google", async (request, response) => {
  const credential = request.body?.credential;
  const audience = process.env.GOOGLE_CLIENT_ID;

  if (!audience) {
    response.status(503).json({ error: "Google login is not configured" });
    return;
  }

  if (typeof credential !== "string") {
    response.status(400).json({ error: "Google credential is required" });
    return;
  }

  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience });
    const payload = ticket.getPayload();

    if (!payload?.sub || !payload.email || !payload.name) {
      response.status(401).json({ error: "Google profile is incomplete" });
      return;
    }

    const user = await prisma.user.upsert({
      where: { googleId: payload.sub },
      update: { name: payload.name, email: payload.email, avatarUrl: payload.picture },
      create: { googleId: payload.sub, name: payload.name, email: payload.email, avatarUrl: payload.picture },
    });

    response.json({ user });
  } catch {
    response.status(401).json({ error: "Google credential could not be verified" });
  }
});

app.post("/api/batches", async (request, response) => {
  try {
    const user = await authenticatedUser(request, response);
    if (!user) return;
    const body = request.body as CreateBatchBody;
    const idempotencyKey = request.header("Idempotency-Key");
    const fingerprint = createHash("sha256").update(JSON.stringify({
      subject: body.subject?.trim(),
      body: body.body?.trim(),
      recipients: normalizedRecipients(body.recipients),
      startTime: body.startTime,
      delayMs: body.delayMs ?? 2_000,
      hourlyLimit: body.hourlyLimit ?? 200,
    })).digest("hex");

    if (idempotencyKey) {
      const existing = await prisma.emailBatch.findUnique({ where: { idempotencyKey } });
      if (existing) {
        if (existing.userId !== user.id || existing.requestFingerprint !== fingerprint) {
          response.status(409).json({ error: "Idempotency-Key was already used for another request" });
          return;
        }
        response.status(200).json({ batch: existing, reused: true });
        return;
      }
    }

    const recipients = normalizedRecipients(body.recipients);
    const startTime = body.startTime ? new Date(body.startTime) : new Date();
    const delayMs = Number(body.delayMs ?? 2_000);
    const hourlyLimit = Number(body.hourlyLimit ?? 200);

    if (!body.subject?.trim() || !body.body?.trim() || recipients.length === 0 || Number.isNaN(startTime.getTime())) {
      response.status(400).json({ error: "subject, body, recipients, and a valid startTime are required" });
      return;
    }

    const sender = await senderForUser(user.id);
    const scheduledRecipients = scheduleRecipients(recipients, startTime, delayMs, hourlyLimit);
    const batchId = randomUUID();
    const rows = scheduledRecipients.map(({ recipient, scheduledFor }) => ({
      id: randomUUID(),
      batchId,
      senderId: sender.id,
      recipient,
      scheduledFor,
      jobId: "",
    }));

    for (const row of rows) {
      row.jobId = row.id;
    }

    const batch = await prisma.$transaction(async (transaction) => {
      const createdBatch = await transaction.emailBatch.create({
        data: {
          id: batchId,
          userId: sender.userId,
          idempotencyKey,
          requestFingerprint: fingerprint,
          subject: body.subject!.trim(),
          body: body.body!.trim(),
          delayMs,
          hourlyLimit,
          startTime,
          totalRecipients: rows.length,
        },
      });

      for (let index = 0; index < rows.length; index += 500) {
        await transaction.scheduledEmail.createMany({
          data: rows.slice(index, index + 500),
        });
      }

      return createdBatch;
    });

    await emailQueue.addBulk(
      rows.map((row) => ({
        name: "send-email",
        data: { scheduledEmailId: row.id },
        opts: {
          jobId: row.jobId,
          delay: Math.max(0, row.scheduledFor.getTime() - Date.now()),
        },
      })),
    );

    response.status(201).json({ batch, scheduledCount: rows.length });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Unable to schedule email batch" });
  }
});

app.get("/api/emails", async (request, response) => {
  const user = await authenticatedUser(request, response);
  if (!user) return;
  const status = request.query.status;
  const allowedStatuses = ["pending", "processing", "sent", "failed"] as const;
  const filter = allowedStatuses.includes(status as (typeof allowedStatuses)[number])
    ? { status: status as (typeof allowedStatuses)[number] }
    : {};

  const emails = await prisma.scheduledEmail.findMany({
    where: { ...filter, batch: { userId: user.id } },
    include: { batch: true },
    orderBy: { scheduledFor: "asc" },
  });

  response.json({ emails });
});

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`API listening on port ${port}`);
  void reconcilePendingJobs();
});

const recoveryTimer = setInterval(() => void reconcilePendingJobs(), 30_000);
recoveryTimer.unref();
