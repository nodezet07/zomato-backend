import { Router } from "express";
import config from "../config/config.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import mongoose from "mongoose";
import redisClient from "../config/redis.js";
import { isBullMqEnabled, isSocketRedisAdapterEnabled } from "../config/bullmq.js";
import { getAllQueueStats } from "../queues/queue.factory.js";

const router = Router();

router.get(
  "/status",
  asyncHandler(async (_req, res) => {
    res.json({
      success: true,
      message: "System status",
      data: {
        service: "Food App API",
        version: "1.0.0",
        environment: config.NODE_ENV,
        phase: 19,
        testing: true,
        search: true,
        security: {
          helmet: true,
          cors: true,
          rateLimit: true,
          mongoSanitize: true,
          xssSanitize: true,
          auditLogs: true,
          hpp: true,
        },
        sockets: true,
        socketRedisAdapter: isSocketRedisAdapterEnabled(),
        bullmq: isBullMqEnabled(),
        notifications: true,
        cache: true,
        liveTracking: true,
        collections: [
          "users",
          "restaurants",
          "menu_categories",
          "menu_items",
          "carts",
          "orders",
          "payments",
          "riders",
          "rider_locations",
          "wallet_transactions",
          "restaurant_settlements",
          "rider_payouts",
          "coupons",
          "reviews",
          "notifications",
          "support_tickets",
          "audit_logs",
          "admin_users",
        ],
        uptime: process.uptime(),
        mongodb:
          mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        redis: redisClient.isOpen ? "connected" : "disconnected",
        timestamp: new Date().toISOString(),
      },
    });
  }),
);

router.get(
  "/queues",
  asyncHandler(async (_req, res) => {
    res.json({
      success: true,
      message: "Queue status",
      data: {
        bullmqEnabled: isBullMqEnabled(),
        redis: redisClient.isOpen ? "connected" : "disconnected",
        queues: await getAllQueueStats(),
      },
    });
  }),
);

export default router;
