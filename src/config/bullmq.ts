import config from "./config.js";

export const QUEUE_NAMES = {
  NOTIFICATIONS: "notifications",
  EMAILS: "emails",
  SMS: "sms",
  REFUNDS: "refunds",
  ANALYTICS: "analytics",
  FINANCE: "finance",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export function isBullMqEnabled(): boolean {
  return config.ENABLE_BULLMQ === "true";
}

export function isSocketRedisAdapterEnabled(): boolean {
  return config.SOCKET_REDIS_ADAPTER === "true";
}

/** BullMQ uses ioredis-compatible connection options. */
export function getBullMqConnection() {
  const url = new URL(config.REDIS_URL);
  const port = url.port ? Number(url.port) : 6379;
  const username =
    url.username && url.username !== "default" ? url.username : undefined;

  return {
    host: url.hostname,
    port,
    password: url.password || undefined,
    username,
    maxRetriesPerRequest: null as null,
  };
}
