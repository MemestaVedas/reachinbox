import "dotenv/config";
import { randomUUID } from "node:crypto";
import express from "express";
import { prisma } from "./lib/db.js";
import { emailQueue } from "./queue.js";
import { scheduleRecipients } from "./scheduling.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(express.json({ limit: "2mb" }));
app.use((request, response, next) => {
  response.header("Access-Control-Allow-Origin", process.env.FRONTEND_URL ?? "http://localhost:5173");
  response.header("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key");
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

async function developmentSender() {
  const user = await prisma.user.upsert({
    where: { googleId: "development-user" },
    update: {},
    create: {
      googleId: "development-user",
      name: process.env.DEV_USER_NAME ?? "ReachInbox User",
      email: process.env.DEV_USER_EMAIL ?? "developer@example.com",
    },
  });

  return prisma.sender.upsert({
    where: { id: process.env.DEV_SENDER_ID ?? "development-sender" },
    update: {},
    create: {
      id: process.env.DEV_SENDER_ID ?? "development-sender",
      userId: user.id,
      etherealEmail: process.env.ETHEREAL_EMAIL ?? "",
      etherealPass: process.env.ETHEREAL_PASSWORD ?? "",
      etherealHost: process.env.ETHEREAL_HOST ?? "smtp.ethereal.email",
      etherealPort: Number(process.env.ETHEREAL_PORT ?? 587),
    },
  });
}

app.post("/api/batches", async (request, response) => {
  try {
    const body = request.body as CreateBatchBody;
    const idempotencyKey = request.header("Idempotency-Key");

    if (idempotencyKey) {
      const existing = await prisma.emailBatch.findUnique({ where: { idempotencyKey } });
      if (existing) {
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

    const sender = await developmentSender();
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
  const status = request.query.status;
  const allowedStatuses = ["pending", "processing", "sent", "failed"] as const;
  const filter = allowedStatuses.includes(status as (typeof allowedStatuses)[number])
    ? { status: status as (typeof allowedStatuses)[number] }
    : {};

  const emails = await prisma.scheduledEmail.findMany({
    where: filter,
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
});
