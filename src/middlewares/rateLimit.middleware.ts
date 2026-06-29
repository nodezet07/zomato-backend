import type { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import config from "../config/config.js";

const standardHeaders = { standardHeaders: true, legacyHeaders: false };

function isRiderApiRoute(req: Request): boolean {
  const path = req.originalUrl.split("?")[0] ?? "";
  if (path.startsWith("/api/v1/riders")) return true;
  // Rider app polls route/tracking during active delivery
  if (req.method === "GET" && path.startsWith("/api/v1/orders/track/")) return true;
  return false;
}

function limiter(
  windowMs: number,
  max: number,
  message: string,
  skip?: (req: Request) => boolean,
) {
  if (config.NODE_ENV === "test" || config.NODE_ENV === "development") {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }
  return rateLimit({
    windowMs,
    max,
    message: { success: false, message },
    skip: skip ?? (() => false),
    ...standardHeaders,
  });
}

/** General API traffic per IP — rider routes exempt (GPS pings every ~15s) */
export const apiRateLimiter = limiter(
  config.RATE_LIMIT_API_WINDOW_MS,
  config.RATE_LIMIT_API_MAX,
  "Too many requests, please try again later",
  isRiderApiRoute,
);

/** Login / register / token refresh */
export const authStrictRateLimiter = limiter(
  15 * 60 * 1000,
  config.RATE_LIMIT_AUTH_MAX,
  "Too many authentication attempts, try again later",
);

/** @deprecated Use apiRateLimiter — kept for backward imports */
export const authRateLimiter = apiRateLimiter;

export const otpRateLimiter = limiter(
  60 * 1000,
  5,
  "Too many OTP requests, wait a minute",
);

export const paymentRateLimiter = limiter(
  15 * 60 * 1000,
  config.RATE_LIMIT_PAYMENT_MAX,
  "Too many payment requests, please slow down",
);

export const adminLoginRateLimiter = limiter(
  15 * 60 * 1000,
  10,
  "Too many admin login attempts",
);

export const adminApiRateLimiter = limiter(
  15 * 60 * 1000,
  120,
  "Too many admin requests",
);
