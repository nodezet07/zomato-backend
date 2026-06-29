import mongoose from "mongoose";
import config from "./config.js";
import logger from "./logger.js";

const connectDB = async (): Promise<void> => {
  try {
    await mongoose.connect(config.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 20000,
      socketTimeoutMS: 45000,
      maxPoolSize: 100,        // Handle up to 100 concurrent DB operations
      minPoolSize: 10,         // Keep 10 connections warm to avoid cold-start lag
      maxIdleTimeMS: 60000,    // Close idle connections after 60s to free resources
      heartbeatFrequencyMS: 30000, // Validate connection health every 30s
    });
    logger.info("MongoDB connected successfully");
  } catch (error) {
    logger.error("MongoDB connection failed", { error });
    process.exit(1);
  }
};

export default connectDB;
