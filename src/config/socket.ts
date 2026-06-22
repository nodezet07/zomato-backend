import { Server as HTTPServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import config from "./config.js";
import logger from "./logger.js";
import { getCorsOrigins } from "./security.js";
import { isSocketRedisAdapterEnabled } from "./bullmq.js";
import { registerSocketHandlers } from "../sockets/socket.handlers.js";
import { setSocketServer } from "../services/socket.service.js";

let socketPubClient: ReturnType<typeof createClient> | null = null;
let socketSubClient: ReturnType<typeof createClient> | null = null;

export const initializeSocket = async (
  httpServer: HTTPServer,
): Promise<SocketIOServer> => {
  const corsOrigins = getCorsOrigins();
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin:
        corsOrigins === true
          ? true
          : [
              ...corsOrigins,
              "http://localhost",
              "https://localhost",
              "capacitor://localhost",
              "http://localhost:5174",
            ].filter(Boolean),
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  if (isSocketRedisAdapterEnabled()) {
    try {
      socketPubClient = createClient({ url: config.REDIS_URL });
      socketSubClient = socketPubClient.duplicate();
      await Promise.all([socketPubClient.connect(), socketSubClient.connect()]);
      io.adapter(createAdapter(socketPubClient, socketSubClient));
      logger.info("Socket.io Redis adapter enabled (multi-instance ready)");
    } catch (error) {
      logger.warn("Socket.io Redis adapter failed — single-instance mode", {
        error,
      });
    }
  }

  setSocketServer(io);
  registerSocketHandlers(io);

  logger.info("Socket.io handlers registered");
  return io;
};

export async function closeSocketRedisClients(): Promise<void> {
  await Promise.all([
    socketPubClient?.quit(),
    socketSubClient?.quit(),
  ]);
  socketPubClient = null;
  socketSubClient = null;
}
