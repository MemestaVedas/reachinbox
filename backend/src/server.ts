import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import express from "express";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "./lib/db.js";
import { redis } from "./lib/redis.js";
import { emailQueue } from "./queue.js";
import { scheduleRecipients } from "./scheduling.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);
const googleClient = new OAuth2Client();
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_BATCH_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const NOTIFICATION_PREFIX = "notifications:";

app.use(express.json({ limit: "2mb" }));
app.use((request, response, next) => {
  response.header("Access-Control-Allow-Origin", process.env.FRONTEND_URL ?? "http://localhost:5173");
  response.header("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key, Authorization, X-File-Name, X-File-Type");
  response.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");

  if (request.method === "OPTIONS") {
    response.sendStatus(204);
    return;
  }

  next();
});

interface CreateBatchBody {
  subject?: string;
  body?: string;
  bodyHtml?: string;
  recipients?: unknown;
  startTime?: string;
  delayMs?: number;
  hourlyLimit?: number;
  senderId?: string;
  attachmentIds?: unknown;
  allowIncomplete?: boolean;
}

function safeFileName(value: string | undefined): string {
  if (!value) return "attachment";
  try {
    const decoded = decodeURIComponent(value);
    const cleaned = decoded.replace(/[^a-zA-Z0-9._() -]/g, "_").slice(0, 180);
    return cleaned || "attachment";
  } catch {
    return "attachment";
  }
}

function safeContentType(value: string | undefined): string {
  return value && /^[a-z]+\/[a-z0-9.+-]+$/i.test(value)
    ? value.toLowerCase()
    : "application/octet-stream";
}

function safeTextStyle(tag: string, source: string): string {
  if (!/^(div|p|h1|h2|h3|blockquote|span)$/i.test(tag)) return "";
  const styleMatch = source.match(/\bstyle\s*=\s*(["'])(.*?)\1/i);
  const style = styleMatch?.[2] ?? "";
  const alignment = style.match(/text-align\s*:\s*(left|center|right|justify)\b/i)?.[1]?.toLowerCase();
  const margin = style.match(/margin-left\s*:\s*(\d{1,3})(px|em)\b/i);
  const allowed = [
    alignment ? `text-align:${alignment}` : "",
    margin ? `margin-left:${margin[1]}${margin[2]}` : "",
  ].filter(Boolean).join(";");
  return allowed ? ` style="${allowed}"` : "";
}

function sanitizeRichText(value: string | undefined): string | null {
  if (!value?.trim()) return null;

  const allowedTags = new Set([
    "a", "b", "blockquote", "br", "div", "em", "h1", "h2", "h3", "i", "li", "ol", "p", "span", "strong", "u", "ul",
  ]);
  const withoutDangerousBlocks = value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|form|svg|math)[^>]*>[\s\S]*?<\/\1>/gi, "");

  return withoutDangerousBlocks.replace(/<\/?([a-z][a-z0-9]*)(?:\s+[^>]*)?>/gi, (tag, tagName: string) => {
    const name = tagName.toLowerCase();
    if (!allowedTags.has(name)) return "";
    if (tag.startsWith("</")) return `</${name}>`;
    if (name !== "a") return `<${name}${safeTextStyle(name, tag)}>`;

    const hrefMatch = tag.match(/\bhref\s*=\s*(["'])(.*?)\1/i) ?? tag.match(/\bhref\s*=\s*([^\s>]+)/i);
    const href = hrefMatch?.[2] ?? hrefMatch?.[1];
    if (!href || !/^(https?:|mailto:)/i.test(href)) return "<a>";
    const escapedHref = href.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    return `<a href="${escapedHref}" target="_blank" rel="noopener noreferrer">`;
  });
}

function textFromRichText(value: string): string {
  return value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|li|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function attachmentIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0))];
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

async function senderForUser(userId?: string, requestedSenderId?: string) {
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

  if (requestedSenderId) {
    const requestedSender = await prisma.sender.findFirst({
      where: { id: requestedSenderId, userId: user.id },
    });
    if (!requestedSender) {
      throw new Error("The selected sender is unavailable");
    }
    return requestedSender;
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

  // Local test support only. This route never accepts the token in production,
  // and it remains disabled unless a token is explicitly configured.
  if (
    process.env.NODE_ENV !== "production"
    && process.env.DEV_TEST_TOKEN
    && authorization === `Bearer ${process.env.DEV_TEST_TOKEN}`
  ) {
    return prisma.user.upsert({
      where: { googleId: "development-test-user" },
      update: {},
      create: {
        googleId: "development-test-user",
        name: "Development Test User",
        email: "dev-test@reachinbox.local",
      },
    });
  }

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

app.post(
  "/api/uploads",
  express.raw({ type: "application/octet-stream", limit: MAX_ATTACHMENT_BYTES }),
  async (request, response) => {
    try {
      const user = await authenticatedUser(request, response);
      if (!user) return;

      if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
        response.status(400).json({ error: "Choose a non-empty file to upload" });
        return;
      }

      if (request.body.length > MAX_ATTACHMENT_BYTES) {
        response.status(413).json({ error: "Each attachment must be 8 MB or smaller" });
        return;
      }

      const attachment = await prisma.emailAttachment.create({
        data: {
          userId: user.id,
          fileName: safeFileName(request.header("X-File-Name")),
          contentType: safeContentType(request.header("X-File-Type")),
          sizeBytes: request.body.length,
          data: request.body,
        },
        select: { id: true, fileName: true, contentType: true, sizeBytes: true },
      });

      response.status(201).json({ attachment });
    } catch (error) {
      console.error(error);
      response.status(500).json({ error: "Unable to upload attachment" });
    }
  },
);

app.delete("/api/uploads/:attachmentId", async (request, response) => {
  try {
    const user = await authenticatedUser(request, response);
    if (!user) return;

    const deleted = await prisma.emailAttachment.deleteMany({
      where: { id: request.params.attachmentId, userId: user.id, batchId: null },
    });

    if (deleted.count === 0) {
      response.status(404).json({ error: "Attachment was not found or has already been scheduled" });
      return;
    }

    response.sendStatus(204);
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Unable to remove attachment" });
  }
});

app.post("/api/batches", async (request, response) => {
  try {
    const user = await authenticatedUser(request, response);
    if (!user) return;
    const body = request.body as CreateBatchBody;
    const idempotencyKey = request.header("Idempotency-Key");
    const uploadedAttachmentIds = attachmentIds(body.attachmentIds);
    const richText = sanitizeRichText(body.bodyHtml);
    const plainText = richText ? textFromRichText(richText) : (body.body?.trim() ?? "");
    const fingerprint = createHash("sha256").update(JSON.stringify({
      subject: body.subject?.trim(),
      body: plainText,
      bodyHtml: richText,
      recipients: normalizedRecipients(body.recipients),
      startTime: body.startTime,
      delayMs: body.delayMs ?? 2_000,
      hourlyLimit: body.hourlyLimit ?? 200,
      senderId: body.senderId,
      attachmentIds: uploadedAttachmentIds,
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

    if ((!body.allowIncomplete && (!body.subject?.trim() || !plainText)) || recipients.length === 0 || Number.isNaN(startTime.getTime())) {
      response.status(400).json({ error: "subject, body, recipients, and a valid startTime are required" });
      return;
    }

    const sender = await senderForUser(user.id, body.senderId);
    const attachments = uploadedAttachmentIds.length === 0
      ? []
      : await prisma.emailAttachment.findMany({
        where: { id: { in: uploadedAttachmentIds }, userId: user.id, batchId: null },
        select: { id: true, sizeBytes: true },
      });

    if (attachments.length !== uploadedAttachmentIds.length) {
      response.status(400).json({ error: "One or more attachments are unavailable" });
      return;
    }

    if (attachments.reduce((total, attachment) => total + attachment.sizeBytes, 0) > MAX_BATCH_ATTACHMENT_BYTES) {
      response.status(413).json({ error: "Attachments must total 25 MB or less" });
      return;
    }

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
          subject: body.subject?.trim() ?? "",
          body: plainText,
          bodyHtml: richText,
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

      if (uploadedAttachmentIds.length > 0) {
        const attached = await transaction.emailAttachment.updateMany({
          where: { id: { in: uploadedAttachmentIds }, userId: user.id, batchId: null },
          data: { batchId },
        });
        if (attached.count !== uploadedAttachmentIds.length) {
          throw new Error("Attachments changed before the batch was created");
        }
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

app.get("/api/senders", async (request, response) => {
  const user = await authenticatedUser(request, response);
  if (!user) return;

  await senderForUser(user.id);
  const senders = await prisma.sender.findMany({
    where: { userId: user.id },
    select: { id: true, etherealEmail: true },
    orderBy: { etherealEmail: "asc" },
  });

  response.json({ senders: senders.map((sender) => ({ id: sender.id, email: sender.etherealEmail })) });
});

app.get("/api/notifications", async (request, response) => {
  const user = await authenticatedUser(request, response);
  if (!user) return;

  const key = `${NOTIFICATION_PREFIX}${user.id}`;
  const notifications = await redis.lrange(key, 0, -1);
  await redis.del(key);
  response.json({ notifications: notifications.flatMap((value) => {
    try {
      return [JSON.parse(value)];
    } catch {
      return [];
    }
  }) });
});

app.get("/api/emails", async (request, response) => {
  const user = await authenticatedUser(request, response);
  if (!user) return;
  const requestedStatuses = typeof request.query.status === "string"
    ? request.query.status.split(",")
    : [];
  const allowedStatuses = ["pending", "processing", "sent", "failed"] as const;
  const statuses = requestedStatuses.filter((status): status is (typeof allowedStatuses)[number] =>
    allowedStatuses.includes(status as (typeof allowedStatuses)[number]),
  );
  const filter = statuses.length > 0 ? { status: { in: statuses } } : {};

  const emails = await prisma.scheduledEmail.findMany({
    where: { ...filter, batch: { userId: user.id } },
    include: {
      batch: {
        include: {
          attachments: { select: { id: true, fileName: true, contentType: true, sizeBytes: true } },
        },
      },
      sender: { select: { etherealEmail: true } },
    },
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
