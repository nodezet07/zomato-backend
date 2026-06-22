import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/auth.types.js";
import { sendSuccess } from "../utils/apiResponse.js";
import {
  parseAnalyticsRange,
  getSalesAnalytics,
  getOrderAnalytics,
  getUserAnalytics,
  getDeliveryAnalytics,
  getTaxReport,
} from "../services/analytics.service.js";

function rangeFromQuery(query: AuthRequest["query"]) {
  return parseAnalyticsRange({
    from: query.from as string | undefined,
    to: query.to as string | undefined,
    days: query.days as string | undefined,
  });
}

// GET /analytics/sales
export const sales = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await getSalesAnalytics(rangeFromQuery(req.query));
    sendSuccess(res, "Sales analytics", { analytics: data });
  } catch (err) {
    next(err);
  }
};

// GET /analytics/orders
export const orders = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await getOrderAnalytics(rangeFromQuery(req.query));
    sendSuccess(res, "Order analytics", { analytics: data });
  } catch (err) {
    next(err);
  }
};

// GET /analytics/users
export const users = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await getUserAnalytics(rangeFromQuery(req.query));
    sendSuccess(res, "User analytics", { analytics: data });
  } catch (err) {
    next(err);
  }
};

// GET /analytics/delivery
export const delivery = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await getDeliveryAnalytics(rangeFromQuery(req.query));
    sendSuccess(res, "Delivery analytics", { analytics: data });
  } catch (err) {
    next(err);
  }
};

// GET /analytics/summary — combined overview
export const summary = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const range = rangeFromQuery(req.query);
    const [sales, orderStats, userStats, deliveryStats] = await Promise.all([
      getSalesAnalytics(range),
      getOrderAnalytics(range),
      getUserAnalytics(range),
      getDeliveryAnalytics(range),
    ]);
    sendSuccess(res, "Analytics summary", {
      period: range,
      sales,
      orders: orderStats,
      users: userStats,
      delivery: deliveryStats,
    });
  } catch (err) {
    next(err);
  }
};

export const tax = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await getTaxReport(rangeFromQuery(req.query));
    sendSuccess(res, "Tax report", { report: data });
  } catch (err) {
    next(err);
  }
};
