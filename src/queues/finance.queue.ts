import { getQueue } from "../queues/queue.factory.js";
import { QUEUE_NAMES } from "../config/bullmq.js";
import logger from "../config/logger.js";

export type FinanceJobPayload =
  | { type: "auto_settlements"; adminId?: string }
  | { type: "auto_rider_payouts"; adminId?: string }
  | { type: "razorpayx_payout_stub" };

export async function enqueueFinanceJob(payload: FinanceJobPayload) {
  const queue = getQueue(QUEUE_NAMES.FINANCE);
  if (!queue) {
    logger.warn("Finance queue unavailable — job skipped", payload);
    return null;
  }
  return queue.add(payload.type, payload, {
    removeOnComplete: 100,
    removeOnFail: 50,
  });
}
