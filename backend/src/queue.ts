import { Queue } from "bullmq";
import { redis } from "./lib/redis.js";

export const EMAIL_QUEUE_NAME = "email-queue";

export interface SendEmailJobData {
  scheduledEmailId: string;
}

export const emailQueue = new Queue<SendEmailJobData>(EMAIL_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5_000,
    },
    removeOnComplete: {
      age: 86_400,
      count: 10_000,
    },
    removeOnFail: {
      age: 604_800,
      count: 10_000,
    },
  },
});
