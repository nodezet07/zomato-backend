import { QUEUE_NAMES, isBullMqEnabled } from "../config/bullmq.js";
import logger from "../config/logger.js";
import { registerWorker } from "../queues/queue.factory.js";
import { processNotificationJob } from "../services/notification.service.js";
import type { NotificationJobPayload } from "../services/notification.service.js";
import type { EmailJobPayload } from "../queues/email.queue.js";
import type { SmsJobPayload } from "../queues/sms.queue.js";
import type { RefundJobPayload } from "../queues/refund.queue.js";
import type { AnalyticsJobPayload } from "../queues/analytics.queue.js";
import type { FinanceJobPayload } from "../queues/finance.queue.js";
import { enqueueAnalyticsJob } from "../queues/analytics.queue.js";
import { enqueueFinanceJob } from "../queues/finance.queue.js";
import {
  warmAnalyticsCache,
  invalidateRestaurantCaches,
} from "../services/analytics-cache.service.js";

let workersStarted = false;

export function startQueueWorkers(): void {
  if (workersStarted || !isBullMqEnabled()) return;
  workersStarted = true;

  registerWorker<NotificationJobPayload>(
    QUEUE_NAMES.NOTIFICATIONS,
    processNotificationJob,
    5,
  );

  registerWorker<EmailJobPayload>(QUEUE_NAMES.EMAILS, async (job) => {
    const { sendTransactionalEmail } = await import("../config/mail.js");
    await sendTransactionalEmail(job.to, job.subject, job.html);
  });

  registerWorker<SmsJobPayload>(QUEUE_NAMES.SMS, async (job) => {
    logger.info(`[SMS stub] to=${job.mobile} message=${job.message}`);
  });

  registerWorker<RefundJobPayload>(QUEUE_NAMES.REFUNDS, async (job) => {
    const { initiateRefund } = await import("../services/payment.service.js");
    await initiateRefund(job.userId, job.paymentId, job.reason, job.amount);
  });

  registerWorker<AnalyticsJobPayload>(QUEUE_NAMES.ANALYTICS, async (job) => {
    if (job.type === "warm_cache") {
      await warmAnalyticsCache();
    } else {
      await invalidateRestaurantCaches();
    }
  });

  registerWorker<FinanceJobPayload>(QUEUE_NAMES.FINANCE, async (job) => {
    const {
      runScheduledSettlements,
      runScheduledRiderPayouts,
      processAutomatedPayoutsStub,
    } = await import("../services/finance.service.js");
    const adminId =
      job.type === "razorpayx_payout_stub" ? "system" : (job.adminId ?? "system");

    if (job.type === "auto_settlements") {
      const result = await runScheduledSettlements(adminId);
      logger.info("Auto settlements job completed", result);
    } else if (job.type === "auto_rider_payouts") {
      const result = await runScheduledRiderPayouts(adminId);
      logger.info("Auto rider payouts job completed", result);
    } else if (job.type === "razorpayx_payout_stub") {
      const result = await processAutomatedPayoutsStub();
      logger.info("RazorpayX payout stub job completed", result);
    }
  });

  logger.info("BullMQ workers started (Phase 16)", {
    queues: Object.values(QUEUE_NAMES),
  });
}

/** Schedule cache warm on startup (delayed 30s). */
export function scheduleRecurringJobs(): void {
  if (!isBullMqEnabled()) return;

  setTimeout(() => {
    void enqueueAnalyticsJob({ type: "warm_cache" });
  }, 30_000);

  setInterval(
    () => {
      void enqueueAnalyticsJob({ type: "warm_cache" });
    },
    6 * 60 * 60 * 1000,
  );

  // Weekly auto-settlement batches (Monday 02:00 UTC approx via interval for V1)
  setTimeout(() => {
    void enqueueFinanceJob({ type: "auto_settlements" });
    void enqueueFinanceJob({ type: "auto_rider_payouts" });
  }, 60_000);

  setInterval(
    () => {
      void enqueueFinanceJob({ type: "auto_settlements" });
      void enqueueFinanceJob({ type: "auto_rider_payouts" });
    },
    7 * 24 * 60 * 60 * 1000,
  );
}
