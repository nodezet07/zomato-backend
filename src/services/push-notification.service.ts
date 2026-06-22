import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";
import User from "../models/user.model.js";
import logger from "../config/logger.js";
import { getFirebaseMessaging } from "../config/firebase.js";

const expo = new Expo();

export type ExpoPushPayload = {
  to: string | string[];
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: "default" | null;
  priority?: "default" | "normal" | "high";
  channelId?: string;
};

export function isExpoPushToken(token: string): boolean {
  return Expo.isExpoPushToken(token);
}

export async function sendExpoPushNotification(payload: ExpoPushPayload): Promise<void> {
  const tokens = Array.isArray(payload.to) ? payload.to : [payload.to];
  const validTokens = tokens.filter((t) => Expo.isExpoPushToken(t));

  if (validTokens.length === 0) {
    logger.debug("[Expo Push] No valid Expo push tokens");
    return;
  }

  const messages: ExpoPushMessage[] = validTokens.map((token) => ({
    to: token,
    sound: payload.sound ?? "default",
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    priority: payload.priority ?? "high",
    channelId:
      payload.channelId ??
      (payload.data?.channelId as string | undefined) ??
      (payload.data?.type === "delivery_available" ? "delivery" : "default"),
  }));

  const chunks = expo.chunkPushNotifications(messages);
  const tickets: ExpoPushTicket[] = [];

  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    } catch (error) {
      logger.error(`[Expo Push] Chunk error: ${(error as Error).message}`);
    }
  }

  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i];
    if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
      await removeInvalidPushToken(validTokens[i]!);
    }
  }

  logger.info(`[Expo Push] Sent ${validTokens.length} notification(s)`);
}

/** FCM tokens from Capacitor / native Android & iOS apps */
export async function sendFcmPushNotification(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
  channelId = "orders",
): Promise<void> {
  const messaging = getFirebaseMessaging();
  if (!messaging || tokens.length === 0) return;

  try {
    const res = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: data ?? {},
      android: { priority: "high", notification: { channelId } },
    });
    logger.info(`[FCM Push] Sent ${res.successCount}/${tokens.length} notification(s)`);
    if (res.failureCount > 0) {
      res.responses.forEach((r, i) => {
        if (!r.success) {
          logger.debug(`[FCM Push] token ${i} failed: ${r.error?.message}`);
        }
      });
    }
  } catch (error) {
    logger.error(`[FCM Push] ${(error as Error).message}`);
  }
}

export async function sendExpoPushToUser(
  userId: string,
  notification: Omit<ExpoPushPayload, "to">,
): Promise<void> {
  const user = await User.findById(userId).select("deviceTokens").lean();
  const expoTokens =
    user?.deviceTokens?.map((d) => d.token).filter((t) => Expo.isExpoPushToken(t)) ?? [];

  if (expoTokens.length === 0) return;

  await sendExpoPushNotification({ to: expoTokens, ...notification });
}

export async function sendExpoPushToUsers(
  userIds: string[],
  notification: Omit<ExpoPushPayload, "to">,
): Promise<void> {
  const users = await User.find({ _id: { $in: userIds } })
    .select("deviceTokens")
    .lean();

  const allTokens: string[] = [];
  users.forEach((user) => {
    user.deviceTokens?.forEach((dt) => {
      if (Expo.isExpoPushToken(dt.token)) allTokens.push(dt.token);
    });
  });

  if (allTokens.length === 0) return;
  await sendExpoPushNotification({ to: allTokens, ...notification });
}

async function removeInvalidPushToken(token: string): Promise<void> {
  await User.updateMany({ "deviceTokens.token": token }, { $pull: { deviceTokens: { token } } });
  logger.info(`[Expo Push] Removed invalid token ${token.slice(0, 16)}…`);
}
