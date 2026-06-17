import type { Server as SocketIOServer, Socket } from "socket.io";
import { verifyUserAccessToken } from "../utils/jwt.js";
import { ClientSocketEvents } from "../types/socket.events.js";
import { UserRole } from "../types/enums.js";
import Order from "../models/order.model.js";
import Restaurant from "../models/restaurant.model.js";
import Rider from "../models/rider.model.js";
import logger from "../config/logger.js";

export interface SocketUserData {
  userId: string;
  role?: UserRole;
  riderId?: string;
}

function extractToken(socket: Socket): string | undefined {
  const auth = socket.handshake.auth as { token?: string };
  if (auth?.token) return auth.token;
  const query = socket.handshake.query as { token?: string };
  if (typeof query.token === "string") return query.token;
  const header = socket.handshake.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return undefined;
}

async function canJoinOrder(
  userId: string,
  role: UserRole | undefined,
  orderId: string,
): Promise<boolean> {
  const order = await Order.findById(orderId).select(
    "customerId restaurantId riderId",
  );
  if (!order) return false;

  if (order.customerId.toString() === userId) return true;

  if (role === UserRole.RESTAURANT_OWNER) {
    const restaurant = await Restaurant.findById(order.restaurantId).select(
      "ownerId",
    );
    if (restaurant?.ownerId.toString() === userId) return true;
  }

  if (role === UserRole.RIDER && order.riderId) {
    const rider = await Rider.findOne({ userId });
    if (rider && order.riderId.toString() === rider._id.toString()) return true;
  }

  return false;
}

async function canJoinRestaurant(
  userId: string,
  restaurantId: string,
): Promise<boolean> {
  const restaurant = await Restaurant.findById(restaurantId).select("ownerId");
  return restaurant?.ownerId.toString() === userId;
}

export function registerSocketHandlers(io: SocketIOServer): void {
  io.use((socket, next) => {
    const token = extractToken(socket);
    if (!token) {
      next(new Error("Authentication required"));
      return;
    }
    const decoded = verifyUserAccessToken(token);
    if (!decoded?.userId) {
      next(new Error("Invalid token"));
      return;
    }
    socket.data.user = {
      userId: decoded.userId,
      role: decoded.role,
    } satisfies SocketUserData;
    next();
  });

  io.on("connection", async (socket) => {
    const user = socket.data.user as SocketUserData;
    logger.info(`Socket connected: ${socket.id} user=${user.userId}`);

    socket.join(`user:${user.userId}`);

    if (user.role === UserRole.RIDER) {
      const rider = await Rider.findOne({ userId: user.userId }).select("_id onlineStatus");
      if (rider) {
        user.riderId = rider._id.toString();
        socket.join(`rider:${rider._id.toString()}`);
        if (rider.onlineStatus) {
          socket.join("riders:online");
        }
      }
    }

    socket.on(ClientSocketEvents.RIDER_ONLINE, () => {
      if (user.role !== UserRole.RIDER) return;
      socket.join("riders:online");
      socket.emit("rider_online_ack", { online: true });
    });

    socket.on(ClientSocketEvents.RIDER_OFFLINE, () => {
      if (user.role !== UserRole.RIDER) return;
      socket.leave("riders:online");
      socket.emit("rider_offline_ack", { online: false });
    });

    socket.on(ClientSocketEvents.JOIN_ORDER, async (payload: { orderId?: string }) => {
      const orderId = payload?.orderId;
      if (!orderId) return;
      const allowed = await canJoinOrder(user.userId, user.role, orderId);
      if (!allowed) {
        socket.emit("error", { message: "Cannot join this order room" });
        return;
      }
      socket.join(`order:${orderId}`);
      socket.emit("joined_order", { orderId });
    });

    socket.on(ClientSocketEvents.LEAVE_ORDER, (payload: { orderId?: string }) => {
      const orderId = payload?.orderId;
      if (orderId) socket.leave(`order:${orderId}`);
    });

    socket.on(
      ClientSocketEvents.JOIN_RESTAURANT,
      async (payload: { restaurantId?: string }) => {
        const restaurantId = payload?.restaurantId;
        if (!restaurantId) return;
        const allowed = await canJoinRestaurant(user.userId, restaurantId);
        if (!allowed) {
          socket.emit("error", { message: "Cannot join this restaurant room" });
          return;
        }
        socket.join(`restaurant:${restaurantId}`);
        socket.emit("joined_restaurant", { restaurantId });
      },
    );

    socket.on(
      ClientSocketEvents.LEAVE_RESTAURANT,
      (payload: { restaurantId?: string }) => {
        const restaurantId = payload?.restaurantId;
        if (restaurantId) socket.leave(`restaurant:${restaurantId}`);
      },
    );

    socket.on("disconnect", () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });
}
