import "dotenv/config";
import { DelayedError, Worker, type Job } from "bullmq";
import nodemailer from "nodemailer";
import { prisma } from "./lib/db.js";
import { redis } from "./lib/redis.js";
import { emailQueue, EMAIL_QUEUE_NAME, type SendEmailJobData } from "./queue.js";

const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 5);
const minimumDelayMs = Number(process.env.MIN_DELAY_MS ?? 2_000);

function hourWindow(date: Date): string {
	return date.toISOString().slice(0, 13);
}

function nextHourDelayMs(date: Date): number {
	const nextHour = new Date(date);
	nextHour.setUTCMinutes(0, 0, 0);
	nextHour.setUTCHours(nextHour.getUTCHours() + 1);
	return Math.max(1_000, nextHour.getTime() - Date.now());
}

async function reserveHourlySlot(senderId: string, limit: number): Promise<boolean> {
	const key = `ratelimit:${senderId}:${hourWindow(new Date())}`;
	const count = await redis.incr(key);

	if (count === 1) {
		await redis.expire(key, 3_700);
	}

	if (count <= limit) {
		return true;
	}

	await redis.decr(key);
	return false;
}

async function processEmail(job: Job<SendEmailJobData>): Promise<void> {
	const email = await prisma.scheduledEmail.findUnique({
		where: { id: job.data.scheduledEmailId },
		include: { sender: true, batch: { include: { attachments: true } } },
	});

	if (!email || email.status === "sent") {
		return;
	}

	const claim = await prisma.scheduledEmail.updateMany({
			where: { id: email.id, status: "pending" },
		data: { status: "processing", attempts: { increment: 1 } },
	});

	if (claim.count === 0) {
		return;
	}

	if (!(await reserveHourlySlot(email.senderId, email.batch.hourlyLimit))) {
		const delayMs = nextHourDelayMs(new Date());
		const scheduledFor = new Date(Date.now() + delayMs);
		await prisma.scheduledEmail.update({
			where: { id: email.id },
			data: { status: "pending", scheduledFor },
		});
		await job.moveToDelayed(scheduledFor.getTime(), job.token);
		throw new DelayedError("Hourly sender limit reached; rescheduled for the next UTC hour.");
	}

	try {
		const transporter = nodemailer.createTransport({
			host: email.sender.etherealHost,
			port: email.sender.etherealPort,
			secure: email.sender.etherealPort === 465,
			auth: {
				user: email.sender.etherealEmail,
				pass: email.sender.etherealPass,
			},
		});

		await transporter.sendMail({
			from: email.sender.etherealEmail,
			to: email.recipient,
			subject: email.batch.subject,
			text: email.batch.body,
			html: email.batch.bodyHtml ?? undefined,
			attachments: email.batch.attachments.map((attachment) => ({
				filename: attachment.fileName,
				content: Buffer.from(attachment.data),
				contentType: attachment.contentType,
			})),
		});

		await prisma.scheduledEmail.update({
			where: { id: email.id },
			data: { status: "sent", sentAt: new Date(), errorMessage: null },
		});
	} catch (error) {
		const attempts = job.attemptsMade + 1;
		const maxAttempts = job.opts.attempts ?? 1;
		const message = error instanceof Error ? error.message : "Unknown delivery error";

		await prisma.scheduledEmail.update({
			where: { id: email.id },
			data: {
				status: attempts >= maxAttempts ? "failed" : "pending",
				errorMessage: message,
			},
		});

		throw error;
	}
}

async function reconcileJobs(): Promise<void> {
	await prisma.scheduledEmail.updateMany({ where: { status: "processing" }, data: { status: "pending" } });
	const orphanedEmails = await prisma.scheduledEmail.findMany({
		where: { status: { in: ["pending", "processing"] } },
		select: { id: true, scheduledFor: true },
	});

	for (const email of orphanedEmails) {
		if (await emailQueue.getJob(email.id)) {
			continue;
		}

		await emailQueue.add(
			"send-email",
			{ scheduledEmailId: email.id },
			{ jobId: email.id, delay: Math.max(0, email.scheduledFor.getTime() - Date.now()) },
		);
	}

	console.log(`Reconciled ${orphanedEmails.length} pending email records.`);
}

let worker: Worker<SendEmailJobData>;

await reconcileJobs();

worker = new Worker<SendEmailJobData>(EMAIL_QUEUE_NAME, processEmail, {
	connection: redis,
	concurrency,
	limiter: {
		max: 1,
		duration: minimumDelayMs,
	},
});

worker.on("completed", (job) => {
	console.log(`Email job ${job.id} completed.`);
});

worker.on("failed", (job, error) => {
	console.error(`Email job ${job?.id ?? "unknown"} failed: ${error.message}`);
});

console.log(`Email worker listening with concurrency ${concurrency}.`);
