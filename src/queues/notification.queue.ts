import { QUEUE_NAMES } from "../config/bullmq.js";
import logger from "../config/logger.js";
import type { NotificationJobPayload } from "../services/notification.service.js";
import { addQueueJob } from "./queue.factory.js";

let processor: ((job: NotificationJobPayload) => Promise<void>) | null = null;

export function registerNotificationProcessor(
  fn: (job: NotificationJobPayload) => Promise<void>,
): void {
  processor = fn;
}

export async function enqueueNotificationJob(
  job: NotificationJobPayload,
): Promise<void> {
  if (!processor) {
    logger.warn("Notification processor not registered — running inline");
    const { notifyUser } = await import("../services/notification.service.js");
    await notifyUser(job);
    return;
  }

  await addQueueJob(
    QUEUE_NAMES.NOTIFICATIONS,
    job.jobType,
    job,
    async () => {
      await processor!(job);
    },
  );
}

/** @deprecated Phase 12 list worker — use BullMQ workers via startQueueWorkers() */
export function startNotificationWorker(): void {
  logger.debug("startNotificationWorker is a no-op; BullMQ workers handle notifications");
}
