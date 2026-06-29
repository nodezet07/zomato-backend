import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";

import { AppError } from "../utils/AppError.js";
import logger from "../config/logger.js";

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const first = Object.values(err.errors)[0];
    res.status(400).json({
      success: false,
      message: first?.message ?? err.message,
    });
    return;
  }

  if (
    err instanceof mongoose.mongo.MongoServerError &&
    err.code === 11000
  ) {
    const keyValue = err.keyValue as Record<string, unknown> | undefined;
    const field = keyValue ? Object.keys(keyValue)[0] : "field";
    const value = keyValue?.[field ?? ""];
    const friendly =
      field === "mobile"
        ? `Mobile number ${value ?? ""} is already registered to another account.`
        : field === "email"
          ? `Email ${value ?? ""} is already registered.`
          : `Duplicate value for ${field}.`;
    res.status(400).json({
      success: false,
      message: friendly.trim(),
    });
    return;
  }

  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(500).json({
    success: false,
    message: "Internal Server Error",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
};
