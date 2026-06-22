import { createServer } from "http";
import type { Express } from "express";
import { Server as SocketIOServer } from "socket.io";
import app from "./app.js";
import connectDB from "./config/db.js";
import config from "./config/config.js";
import { connectRedis } from "./config/redis.js";
import { initializeSocket } from "./config/socket.js";
import { registerNotificationProcessor } from "./queues/notification.queue.js";
import { processNotificationJob } from "./services/notification.service.js";
import {
  startQueueWorkers,
  scheduleRecurringJobs,
} from "./workers/index.js";
import { closeQueues } from "./queues/queue.factory.js";
import { closeSocketRedisClients } from "./config/socket.js";
import logger from "./config/logger.js";

const startServer = async () => {
  try {
    await connectDB();
    logger.info("✅ MongoDB connected");

    try {
      const User = (await import("./models/user.model.js")).default;
      await User.updateMany({}, { $set: { isGoldMember: true } });
      logger.info("✅ All users updated to Gold membership for testing");
    } catch (e: any) {
      logger.error("Error updating users to Gold: " + e.message);
    }

    await connectRedis();
    logger.info("✅ Redis connected");

    registerNotificationProcessor(processNotificationJob);
    startQueueWorkers();
    scheduleRecurringJobs();

    const httpServer = createServer(app);

    const io: SocketIOServer = await initializeSocket(httpServer);
    (app as Express & { io?: SocketIOServer }).io = io;
    logger.info("✅ Socket.io initialized");

    const port = Number(config.PORT) || 5000;

    httpServer.listen(port, "0.0.0.0", () => {
      logger.info(`🚀 Server running on http://localhost:${port}`);
      logger.info(`🌐 LAN access: http://0.0.0.0:${port} (use 10.0.2.2 from Android emulator)`);
      logger.info(`📚 API docs at http://localhost:${port}/api-docs`);
      logger.info(`💚 Health check at http://localhost:${port}/api/v1/health`);
    });

    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down...`);
      await closeQueues();
      await closeSocketRedisClients();
      httpServer.close(() => process.exit(0));
    };

    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT", () => void shutdown("SIGINT"));

    process.on("uncaughtException", (error) => {
      logger.error(`Uncaught Exception: ${error.message}`);
      process.exit(1);
    });

    process.on("unhandledRejection", (reason) => {
      logger.error(`Unhandled Rejection: ${reason}`);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Failed to start server: ${message}`);
    process.exit(1);
  }
};

startServer();
