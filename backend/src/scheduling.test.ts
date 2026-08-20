import assert from "node:assert/strict";
import test from "node:test";
import { scheduleRecipients } from "./scheduling.js";

test("preserves order and rolls over to the next UTC hour", () => {
  const result = scheduleRecipients(
    ["a@example.com", "b@example.com", "c@example.com"],
    new Date("2026-08-20T10:30:00.000Z"),
    60_000,
    2,
  );

  assert.deepEqual(result.map(({ recipient }) => recipient), ["a@example.com", "b@example.com", "c@example.com"]);
  assert.equal(result[0].scheduledFor.toISOString(), "2026-08-20T10:30:00.000Z");
  assert.equal(result[1].scheduledFor.toISOString(), "2026-08-20T10:31:00.000Z");
  assert.equal(result[2].scheduledFor.toISOString(), "2026-08-20T11:00:00.000Z");
});

test("handles a 1,000-recipient burst without dropping order", () => {
  const recipients = Array.from({ length: 1_000 }, (_, index) => `lead-${index}@example.com`);
  const result = scheduleRecipients(recipients, new Date("2026-08-20T00:00:00.000Z"), 2_000, 200);

  assert.equal(result.length, 1_000);
  assert.equal(result[0].recipient, "lead-0@example.com");
  assert.equal(result[999].recipient, "lead-999@example.com");
  assert.ok(result[999].scheduledFor > result[0].scheduledFor);
});

test("rejects invalid delay and hourly limit values", () => {
  assert.throws(() => scheduleRecipients(["a@example.com"], new Date(), -1, 10), /delayMs/);
  assert.throws(() => scheduleRecipients(["a@example.com"], new Date(), 1_000, 0), /hourlyLimit/);
});
