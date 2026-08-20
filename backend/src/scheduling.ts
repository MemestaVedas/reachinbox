export interface ScheduledRecipient {
  recipient: string;
  scheduledFor: Date;
}

function startOfUtcHour(value: Date): Date {
  const result = new Date(value);
  result.setUTCMinutes(0, 0, 0);
  return result;
}

export function scheduleRecipients(
  recipients: string[],
  startTime: Date,
  delayMs: number,
  hourlyLimit: number,
): ScheduledRecipient[] {
  if (delayMs < 0 || !Number.isInteger(delayMs)) {
    throw new Error("delayMs must be a non-negative integer");
  }

  if (hourlyLimit < 1 || !Number.isInteger(hourlyLimit)) {
    throw new Error("hourlyLimit must be a positive integer");
  }

  let nextTime = new Date(startTime);
  let windowStart = startOfUtcHour(nextTime);
  let scheduledInWindow = 0;

  return recipients.map((recipient) => {
    if (scheduledInWindow >= hourlyLimit) {
      windowStart = new Date(windowStart.getTime() + 60 * 60 * 1_000);
      nextTime = new Date(Math.max(nextTime.getTime(), windowStart.getTime()));
      scheduledInWindow = 0;
    }

    if (nextTime.getTime() >= windowStart.getTime() + 60 * 60 * 1_000) {
      windowStart = startOfUtcHour(nextTime);
      scheduledInWindow = 0;
    }

    const scheduledFor = new Date(nextTime);
    scheduledInWindow += 1;
    nextTime = new Date(scheduledFor.getTime() + delayMs);

    return { recipient, scheduledFor };
  });
}
