import type { Server as SocketIOServer } from "socket.io";
import mongoose from "mongoose";
import { SocketEvents, type OrderSocketPayload } from "../types/socket.events.js";
import { OrderStatus } from "../types/enums.js";
import logger from "../config/logger.js";
import { notifyOnlineRidersDeliveryAvailable, notifyOrderEvent } from "./notification.service.js";
import Order from "../models/order.model.js";
import { RIDER_ORDER_ACCEPT_TIMEOUT_SECONDS } from "../constants/index.js";

let io: SocketIOServer | null = null;

export function setSocketServer(server: SocketIOServer): void {
  io = server;
}

export function getSocketServer(): SocketIOServer | null {
  return io;
}

type OrderLike = {
  _id: mongoose.Types.ObjectId;
  orderNumber: string;
  orderStatus: string;
  paymentStatus?: string;
  restaurantId: mongoose.Types.ObjectId | { _id?: mongoose.Types.ObjectId };
  customerId: mongoose.Types.ObjectId | { _id?: mongoose.Types.ObjectId };
  riderId?: mongoose.Types.ObjectId | { _id?: mongoose.Types.ObjectId };
  riderLocation?: { latitude: number; longitude: number };
  estimatedDeliveryTime?: Date;
};

function refId(
  value: mongoose.Types.ObjectId | { _id?: mongoose.Types.ObjectId },
): string {
  if (value && typeof value === "object" && "_id" in value && value._id) {
    return value._id.toString();
  }
  return value.toString();
}

export function buildOrderSocketPayload(order: OrderLike): OrderSocketPayload {
  const payload: OrderSocketPayload = {
    orderId: order._id.toString(),
    orderNumber: order.orderNumber,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    restaurantId: refId(order.restaurantId),
    customerId: refId(order.customerId),
    riderId: order.riderId ? refId(order.riderId) : undefined,
    riderLocation: order.riderLocation,
    estimatedDeliveryTime: order.estimatedDeliveryTime?.toISOString(),
    timestamp: new Date().toISOString(),
  };

  const rider = order.riderId as
    | {
        riderCode?: string;
        userId?: { fullName?: string; mobile?: string } | mongoose.Types.ObjectId;
      }
    | undefined;
  const riderUser = rider?.userId;
  if (riderUser && typeof riderUser === "object" && "fullName" in riderUser) {
    payload.riderName = riderUser.fullName;
    payload.riderMobile = riderUser.mobile;
    payload.riderCode = rider.riderCode;
  }

  return payload;
}

export function broadcastOrderEvent(
  order: OrderLike,
  event: string,
  extra?: Record<string, unknown>,
): void {
  const socket = getSocketServer();
  if (!socket) return;

  const payload: OrderSocketPayload = {
    ...buildOrderSocketPayload(order),
    ...extra,
    timestamp: new Date().toISOString(),
  };

  const orderId = order._id.toString();
  const customerId = refId(order.customerId);
  const restaurantId = refId(order.restaurantId);

  socket.to(`order:${orderId}`).emit(event, payload);
  socket.to(`user:${customerId}`).emit(event, payload);
  socket.to(`restaurant:${restaurantId}`).emit(event, payload);

  if (order.riderId) {
    socket.to(`rider:${refId(order.riderId)}`).emit(event, payload);
  }

  if (event === SocketEvents.ORDER_CREATED) {
    socket.to(`restaurant:${restaurantId}`).emit(SocketEvents.NEW_ORDER, payload);
  }

  void notifyOrderEvent(order, event);

  logger.debug(`Socket emit ${event} → order:${orderId}`);
}

/** Notify all online riders that a delivery is available to accept */
export async function emitDeliveryAvailable(order: OrderLike): Promise<void> {
  const socket = getSocketServer();
  if (!socket) return;

  const doc = await Order.findById(order._id)
    .populate("restaurantId", "restaurantName address")
    .lean();

  if (!doc || doc.riderId || doc.orderStatus !== OrderStatus.READY_FOR_PICKUP) {
    return;
  }

  const restaurant = doc.restaurantId as { restaurantName?: string } | null;
  const payload: OrderSocketPayload = {
    ...buildOrderSocketPayload(doc as OrderLike),
    restaurantName: restaurant?.restaurantName ?? "Restaurant",
    grandTotal: doc.grandTotal,
    acceptTimeoutSeconds: RIDER_ORDER_ACCEPT_TIMEOUT_SECONDS,
    timestamp: new Date().toISOString(),
  };

  socket.to("riders:online").emit(SocketEvents.DELIVERY_AVAILABLE, payload);
  logger.debug(`Socket emit ${SocketEvents.DELIVERY_AVAILABLE} → riders:online order:${doc._id}`);

  void notifyOnlineRidersDeliveryAvailable({
    orderId: doc._id.toString(),
    orderNumber: doc.orderNumber,
    restaurantName: restaurant?.restaurantName ?? "Restaurant",
    grandTotal: doc.grandTotal,
  });
}

/** Tell online riders an order was claimed so pop-ups dismiss */
export function emitDeliveryClaimed(orderId: string, orderNumber?: string): void {
  const socket = getSocketServer();
  if (!socket) return;

  socket.to("riders:online").emit(SocketEvents.DELIVERY_CLAIMED, {
    orderId,
    orderNumber,
    timestamp: new Date().toISOString(),
  });
  logger.debug(`Socket emit ${SocketEvents.DELIVERY_CLAIMED} → riders:online order:${orderId}`);
}

export function emitOrderStatusChange(order: OrderLike): void {
  const status = order.orderStatus;

  if (status === OrderStatus.CONFIRMED) {
    broadcastOrderEvent(order, SocketEvents.ORDER_CONFIRMED);
    return;
  }
  if (status === OrderStatus.READY_FOR_PICKUP) {
    broadcastOrderEvent(order, SocketEvents.ORDER_UPDATED);
    void emitDeliveryAvailable(order);
    return;
  }
  if (status === OrderStatus.RIDER_ASSIGNED) {
    broadcastOrderEvent(order, SocketEvents.RIDER_ASSIGNED);
    return;
  }
  if (status === OrderStatus.PICKED_UP) {
    broadcastOrderEvent(order, SocketEvents.ORDER_PICKED_UP);
    broadcastOrderEvent(order, SocketEvents.ORDER_UPDATED);
    return;
  }
  if (status === OrderStatus.ON_THE_WAY) {
    broadcastOrderEvent(order, SocketEvents.ORDER_UPDATED);
    return;
  }
  if (status === OrderStatus.DELIVERED) {
    broadcastOrderEvent(order, SocketEvents.ORDER_DELIVERED);
    broadcastOrderEvent(order, SocketEvents.ORDER_COMPLETED);
    return;
  }
  if (status === OrderStatus.CANCELLED) {
    broadcastOrderEvent(order, SocketEvents.ORDER_CANCELLED);
    return;
  }

  broadcastOrderEvent(order, SocketEvents.ORDER_UPDATED);
}

export function emitRiderLocationUpdate(
  order: OrderLike,
  latitude: number,
  longitude: number,
  heading?: number,
): void {
  broadcastOrderEvent(order, SocketEvents.RIDER_LOCATION_UPDATE, {
    riderLocation: { latitude, longitude, heading },
  });
}
