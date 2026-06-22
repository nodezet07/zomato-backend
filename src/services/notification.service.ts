import mongoose from "mongoose";
import Notification from "../models/notification.model.js";
import User from "../models/user.model.js";
import Restaurant from "../models/restaurant.model.js";
import Rider from "../models/rider.model.js";
import logger from "../config/logger.js";
import {
  NotificationType,
  NotificationRedirect,
  DevicePlatform,
  CustomerNotificationEvent,
  OrderStatus,
} from "../types/enums.js";
import { orderNotificationCopy } from "./notification.templates.js";
import { SocketEvents } from "../types/socket.events.js";
import { enqueueNotificationJob } from "../queues/notification.queue.js";
import { enqueueEmailJob } from "../queues/email.queue.js";
import { enqueueSmsJob } from "../queues/sms.queue.js";
import { AppError } from "../utils/AppError.js";
import {
  isExpoPushToken,
  sendExpoPushNotification,
  sendFcmPushNotification,
} from "./push-notification.service.js";

export type NotificationChannel = "in_app" | "email" | "push" | "sms";

export type NotificationJobType =
  | "send_in_app"
  | "send_email"
  | "send_push"
  | "send_sms"
  | "notify_user";

export interface NotificationJobPayload {
  jobType: NotificationJobType;
  userId: string;
  title: string;
  message: string;
  notificationType: NotificationType;
  channels?: NotificationChannel[];
  redirectType?: NotificationRedirect;
  redirectId?: string;
  email?: string;
  mobile?: string;
  /** Expo push data.type — e.g. order_update, new_order, delivery_available */
  pushType?: string;
  /** Android notification channel id for Expo push */
  pushChannelId?: string;
}

export async function createInAppNotification(input: {
  userId: string;
  notificationType: NotificationType;
  title: string;
  message: string;
  redirectType?: NotificationRedirect;
  redirectId?: mongoose.Types.ObjectId | string;
  image?: string;
}) {
  return Notification.create({
    userId: input.userId,
    notificationType: input.notificationType,
    title: input.title,
    message: input.message,
    image: input.image,
    redirectType: input.redirectType,
    redirectId: input.redirectId,
    isRead: false,
    sentAt: new Date(),
  });
}

export async function sendEmailNotification(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  await enqueueEmailJob({
    to,
    subject,
    html: `<div>${html}</div>`,
  });
}

export async function sendSmsNotification(
  mobile: string,
  message: string,
): Promise<void> {
  await enqueueSmsJob({ mobile, message });
}

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  const user = await User.findById(userId).select("deviceTokens");
  const tokens = user?.deviceTokens ?? [];
  if (tokens.length === 0) {
    logger.debug(`[Push] no device tokens for user=${userId}`);
    return;
  }

  const expoTokens = tokens.map((t) => t.token).filter((t) => isExpoPushToken(t));
  const fcmTokens = tokens.map((t) => t.token).filter((t) => !isExpoPushToken(t));

  if (expoTokens.length === 0 && fcmTokens.length === 0) {
    logger.debug(`[Push] no valid tokens for user=${userId}`);
    return;
  }

  const pushType = data?.type ?? "notification";
  const channelId =
    data?.channelId ??
    (pushType === "delivery_available"
      ? "delivery"
      : pushType === "new_order" ||
          pushType === "order_update" ||
          pushType.startsWith("customer.order_") ||
          pushType.startsWith("customer.payment_")
        ? "orders"
        : "default");

  if (expoTokens.length > 0) {
    await sendExpoPushNotification({
      to: expoTokens,
      title,
      body,
      data,
      sound: "default",
      priority: "high",
      channelId,
    });
  }

  if (fcmTokens.length > 0) {
    await sendFcmPushNotification(fcmTokens, title, body, data, channelId);
  }
}

/** Push + in-app alert for all online riders when a delivery becomes available */
export async function notifyOnlineRidersDeliveryAvailable(input: {
  orderId: string;
  orderNumber: string;
  restaurantName: string;
  grandTotal?: number;
}): Promise<void> {
  const riders = await Rider.find({
    onlineStatus: true,
    currentOrderId: { $in: [null, undefined] },
  })
    .select("userId")
    .lean();

  if (riders.length === 0) return;

  const message = `${input.restaurantName} · #${input.orderNumber}${
    input.grandTotal ? ` · ₹${input.grandTotal}` : ""
  }`;

  await Promise.all(
    riders.map(async (rider) => {
      const userId = rider.userId.toString();
      await createInAppNotification({
        userId,
        notificationType: NotificationType.ORDER,
        title: "New delivery available",
        message,
        redirectType: NotificationRedirect.ORDER,
        redirectId: input.orderId,
      });
      await sendPushNotification(userId, "New delivery available", message, {
        type: "delivery_available",
        channelId: "delivery",
        orderId: input.orderId,
        orderNumber: input.orderNumber,
        redirectType: NotificationRedirect.ORDER,
        redirectId: input.orderId,
      });
    }),
  );
}

export async function notifyUser(job: NotificationJobPayload): Promise<void> {
  const channels = job.channels ?? ["in_app", "email", "push"];

  if (channels.includes("in_app")) {
    await createInAppNotification({
      userId: job.userId,
      notificationType: job.notificationType,
      title: job.title,
      message: job.message,
      redirectType: job.redirectType,
      redirectId: job.redirectId,
    });
  }

  const user = await User.findById(job.userId).select("email mobile deviceTokens");
  const email = job.email ?? user?.email;
  const mobile = job.mobile ?? user?.mobile;

  if (channels.includes("email") && email) {
    await sendEmailNotification(email, job.title, job.message);
  }

  if (channels.includes("sms") && mobile) {
    await sendSmsNotification(mobile, job.message);
  }

  if (channels.includes("push")) {
    const pushType =
      job.pushType ??
      (job.notificationType === NotificationType.ORDER ? "order_update" : "notification");
    await sendPushNotification(job.userId, job.title, job.message, {
      type: pushType,
      channelId: job.pushChannelId ?? (pushType === "new_order" ? "orders" : "default"),
      redirectType: job.redirectType ?? "",
      redirectId: job.redirectId ?? "",
      orderId: job.redirectId ?? "",
    });
  }
}

export async function processNotificationJob(
  job: NotificationJobPayload,
): Promise<void> {
  switch (job.jobType) {
    case "send_in_app":
      await createInAppNotification({
        userId: job.userId,
        notificationType: job.notificationType,
        title: job.title,
        message: job.message,
        redirectType: job.redirectType,
        redirectId: job.redirectId,
      });
      break;
    case "send_email":
      if (job.email) {
        await enqueueEmailJob({
          to: job.email,
          subject: job.title,
          html: `<div>${job.message}</div>`,
        });
      }
      break;
    case "send_sms":
      if (job.mobile) {
        await enqueueSmsJob({ mobile: job.mobile, message: job.message });
      }
      break;
    case "send_push":
      await sendPushNotification(job.userId, job.title, job.message, {
        type: "notification",
        redirectType: job.redirectType ?? "",
        redirectId: job.redirectId ?? "",
      });
      break;
    case "notify_user":
    default:
      await notifyUser(job);
      break;
  }
}

export function queueNotifyUser(
  input: Omit<NotificationJobPayload, "jobType"> & {
    jobType?: NotificationJobType;
  },
): void {
  const job: NotificationJobPayload = {
    jobType: input.jobType ?? "notify_user",
    userId: input.userId,
    title: input.title,
    message: input.message,
    notificationType: input.notificationType,
    channels: input.channels,
    redirectType: input.redirectType,
    redirectId: input.redirectId,
    email: input.email,
    mobile: input.mobile,
  };
  void enqueueNotificationJob(job);
}

type OrderNotifyLike = {
  _id: mongoose.Types.ObjectId;
  orderNumber: string;
  orderStatus?: string;
  restaurantId: mongoose.Types.ObjectId | { _id?: mongoose.Types.ObjectId };
  customerId: mongoose.Types.ObjectId | { _id?: mongoose.Types.ObjectId };
  riderId?: mongoose.Types.ObjectId | { _id?: mongoose.Types.ObjectId; userId?: { fullName?: string; mobile?: string } };
};

function refId(
  value: mongoose.Types.ObjectId | { _id?: mongoose.Types.ObjectId },
): string {
  if (value && typeof value === "object" && "_id" in value && value._id) {
    return value._id.toString();
  }
  return value.toString();
}

function customerChannels(event: string): NotificationChannel[] {
  if (event === SocketEvents.RIDER_LOCATION_UPDATE) {
    return ["in_app", "push"];
  }
  return ["in_app", "email", "push"];
}

function customerPushType(event: string): string {
  switch (event) {
    case SocketEvents.ORDER_CREATED:
      return CustomerNotificationEvent.ORDER_PLACED;
    case SocketEvents.ORDER_CONFIRMED:
      return CustomerNotificationEvent.ORDER_CONFIRMED;
    case SocketEvents.RIDER_ASSIGNED:
      return CustomerNotificationEvent.RIDER_ASSIGNED;
    case SocketEvents.ORDER_PICKED_UP:
      return CustomerNotificationEvent.ORDER_PICKED_UP;
    case SocketEvents.ORDER_DELIVERED:
    case SocketEvents.ORDER_COMPLETED:
      return CustomerNotificationEvent.ORDER_DELIVERED;
    case SocketEvents.ORDER_CANCELLED:
      return CustomerNotificationEvent.ORDER_CANCELLED;
    default:
      return "order_update";
  }
}

export async function notifyOrderEvent(
  order: OrderNotifyLike,
  event: string,
): Promise<void> {
  if (event === SocketEvents.RIDER_LOCATION_UPDATE) {
    return;
  }

  const copy = orderNotificationCopy(event, order.orderNumber);
  const orderId = order._id.toString();
  const customerId = refId(order.customerId);

  const shouldNotifyCustomer =
    event !== SocketEvents.NEW_ORDER &&
    !(
      event === SocketEvents.ORDER_UPDATED &&
      order.orderStatus === OrderStatus.PENDING
    );

  if (shouldNotifyCustomer) {
    let message = copy.message;
    if (event === SocketEvents.RIDER_ASSIGNED && order.riderId && typeof order.riderId === "object") {
      const riderUser = "userId" in order.riderId ? order.riderId.userId : undefined;
      if (riderUser?.fullName) {
        message = `${riderUser.fullName} is delivering order ${order.orderNumber}.${
          riderUser.mobile ? ` Call ${riderUser.mobile}.` : ""
        }`;
      }
    }

    void notifyUser({
      jobType: "notify_user",
      userId: customerId,
      notificationType: NotificationType.ORDER,
      title: copy.title,
      message,
      channels: customerChannels(event),
      redirectType: NotificationRedirect.ORDER,
      redirectId: orderId,
      pushType: customerPushType(event),
      pushChannelId: "orders",
    });
  }

  if (event === SocketEvents.ORDER_CREATED || event === SocketEvents.NEW_ORDER) {
    const restaurant = await Restaurant.findById(refId(order.restaurantId)).select(
      "ownerId restaurantName",
    );
    if (restaurant) {
      const restaurantCopy = orderNotificationCopy(
        SocketEvents.NEW_ORDER,
        order.orderNumber,
      );
      queueNotifyUser({
        userId: restaurant.ownerId.toString(),
        notificationType: NotificationType.ORDER,
        title: restaurantCopy.title,
        message: `${restaurantCopy.message} (${restaurant.restaurantName})`,
        channels: ["in_app", "email", "push"],
        redirectType: NotificationRedirect.ORDER,
        redirectId: orderId,
        pushType: "new_order",
        pushChannelId: "orders",
      });
    }
  }

  if (
    event === SocketEvents.RIDER_ASSIGNED &&
    order.riderId
  ) {
    const rider = await Rider.findById(refId(order.riderId)).select("userId");
    if (rider) {
      queueNotifyUser({
        userId: rider.userId.toString(),
        notificationType: NotificationType.ORDER,
        title: "New delivery",
        message: `You are assigned to order ${order.orderNumber}.`,
        channels: ["in_app", "push"],
        redirectType: NotificationRedirect.ORDER,
        redirectId: orderId,
        pushType: "order_assigned",
        pushChannelId: "delivery",
      });
    }
  }
}

export async function registerDeviceToken(
  userId: string,
  token: string,
  platform: DevicePlatform,
) {
  const user = await User.findById(userId);
  if (!user || user.isDeleted) {
    throw new AppError("User not found", 404);
  }

  const existing = user.deviceTokens.find((d) => d.token === token);
  if (existing) {
    existing.platform = platform;
  } else {
    user.deviceTokens.push({ token, platform });
  }
  await user.save();
  return user.deviceTokens;
}

export async function removeDeviceToken(userId: string, token: string) {
  const user = await User.findById(userId);
  if (!user) return;
  user.deviceTokens = user.deviceTokens.filter((d) => d.token !== token) as typeof user.deviceTokens;
  await user.save();
}
