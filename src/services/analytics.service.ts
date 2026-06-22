import mongoose from "mongoose";
import Order from "../models/order.model.js";
import User from "../models/user.model.js";
import Rider from "../models/rider.model.js";
import Restaurant from "../models/restaurant.model.js";
import Payment from "../models/payment.model.js";
import { OrderStatus, PaymentStatus } from "../types/enums.js";
import { AppError } from "../utils/AppError.js";

export function parseAnalyticsRange(query: {
  from?: string;
  to?: string;
  days?: string;
}) {
  const to = query.to ? new Date(query.to) : new Date();
  to.setHours(23, 59, 59, 999);

  let from: Date;
  if (query.from) {
    from = new Date(query.from);
  } else {
    const days = query.days ? Number(query.days) : 30;
    from = new Date(to);
    from.setDate(from.getDate() - days);
  }
  from.setHours(0, 0, 0, 0);

  return { from, to };
}

export async function getSalesAnalytics(range: { from: Date; to: Date }) {
  const match = {
    createdAt: { $gte: range.from, $lte: range.to },
    orderStatus: OrderStatus.DELIVERED,
  };

  const [summary, revenueByDay, byPaymentMethod, topRestaurants] = await Promise.all([
    Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$grandTotal" },
          orderCount: { $sum: 1 },
          avgOrderValue: { $avg: "$grandTotal" },
        },
      },
    ]),
    Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          revenue: { $sum: "$grandTotal" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$paymentMethod",
          revenue: { $sum: "$grandTotal" },
          count: { $sum: 1 },
        },
      },
    ]),
    Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$restaurantId",
          revenue: { $sum: "$grandTotal" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "restaurants",
          localField: "_id",
          foreignField: "_id",
          as: "restaurant",
        },
      },
      {
        $project: {
          restaurantId: "$_id",
          restaurantName: { $arrayElemAt: ["$restaurant.restaurantName", 0] },
          revenue: 1,
          orders: 1,
        },
      },
    ]),
  ]);

  const capturedPayments = await Payment.countDocuments({
    paymentStatus: PaymentStatus.CAPTURED,
    createdAt: { $gte: range.from, $lte: range.to },
  });

  const s = summary[0];

  return {
    period: { from: range.from, to: range.to },
    totalRevenue: s?.totalRevenue ?? 0,
    deliveredOrders: s?.orderCount ?? 0,
    avgOrderValue: Math.round((s?.avgOrderValue ?? 0) * 100) / 100,
    capturedPayments,
    revenueByDay,
    revenueByPaymentMethod: byPaymentMethod,
    topRestaurants,
  };
}

export async function getOrderAnalytics(range: { from: Date; to: Date }) {
  const dateMatch = { createdAt: { $gte: range.from, $lte: range.to } };

  const [byStatus, ordersByDay, totals] = await Promise.all([
    Order.aggregate([
      { $match: dateMatch },
      { $group: { _id: "$orderStatus", count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: dateMatch },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([
      { $match: dateMatch },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          cancelled: {
            $sum: {
              $cond: [{ $eq: ["$orderStatus", OrderStatus.CANCELLED] }, 1, 0],
            },
          },
        },
      },
    ]),
  ]);

  const total = totals[0]?.total ?? 0;
  const cancelled = totals[0]?.cancelled ?? 0;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const ordersToday = await Order.countDocuments({
    createdAt: { $gte: todayStart },
  });

  return {
    period: { from: range.from, to: range.to },
    totalOrders: total,
    ordersToday,
    cancellationRate: total > 0 ? Math.round((cancelled / total) * 10000) / 100 : 0,
    ordersByStatus: byStatus,
    ordersByDay,
  };
}

export async function getUserAnalytics(range: { from: Date; to: Date }) {
  const [byRole, newUsersByDay, totals] = await Promise.all([
    User.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: "$role", count: { $sum: 1 } } },
    ]),
    User.aggregate([
      {
        $match: {
          isDeleted: false,
          createdAt: { $gte: range.from, $lte: range.to },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Promise.all([
      User.countDocuments({ isDeleted: false }),
      User.countDocuments({
        isDeleted: false,
        createdAt: { $gte: range.from, $lte: range.to },
      }),
    ]),
  ]);

  return {
    period: { from: range.from, to: range.to },
    totalUsers: totals[0],
    newUsersInPeriod: totals[1],
    usersByRole: byRole,
    newUsersByDay,
  };
}

export async function getDeliveryAnalytics(range: { from: Date; to: Date }) {
  const deliveredMatch = {
    orderStatus: OrderStatus.DELIVERED,
    deliveredAt: { $gte: range.from, $lte: range.to },
  };

  const [riderStats, avgDeliveryMinutes, deliveriesByDay] = await Promise.all([
    Rider.aggregate([
      {
        $lookup: {
          from: "orders",
          let: { riderId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$riderId", "$$riderId"] },
                orderStatus: OrderStatus.DELIVERED,
                deliveredAt: { $gte: range.from, $lte: range.to },
              },
            },
            { $count: "c" },
          ],
          as: "deliveryCount",
        },
      },
      {
        $project: {
          riderCode: 1,
          totalDeliveries: 1,
          totalEarnings: 1,
          onlineStatus: 1,
          periodDeliveries: {
            $ifNull: [{ $arrayElemAt: ["$deliveryCount.c", 0] }, 0],
          },
        },
      },
      { $sort: { periodDeliveries: -1 } },
      { $limit: 10 },
    ]),
    Order.aggregate([
      {
        $match: {
          ...deliveredMatch,
          riderId: { $exists: true, $ne: null },
          createdAt: { $exists: true },
        },
      },
      {
        $project: {
          minutes: {
            $divide: [
              { $subtract: ["$deliveredAt", "$createdAt"] },
              1000 * 60,
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          avgMinutes: { $avg: "$minutes" },
        },
      },
    ]),
    Order.aggregate([
      { $match: deliveredMatch },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$deliveredAt" },
          },
          deliveries: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const [totalRiders, onlineRiders, totalDeliveries] = await Promise.all([
    Rider.countDocuments({}),
    Rider.countDocuments({ onlineStatus: true }),
    Order.countDocuments(deliveredMatch),
  ]);

  return {
    period: { from: range.from, to: range.to },
    totalRiders,
    onlineRiders,
    totalDeliveriesInPeriod: totalDeliveries,
    avgDeliveryTimeMinutes: Math.round(avgDeliveryMinutes[0]?.avgMinutes ?? 0),
    deliveriesByDay,
    topRiders: riderStats,
  };
}

export async function getRestaurantAnalytics(restaurantId: string) {
  const restaurant = await Restaurant.findOne({
    _id: restaurantId,
    isDeleted: false,
  });
  if (!restaurant) {
    throw new AppError("Restaurant not found", 404);
  }

  const rid = new mongoose.Types.ObjectId(restaurantId);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const [totalOrders, completedOrders, revenueAgg, ordersByDay, byStatus] =
    await Promise.all([
      Order.countDocuments({ restaurantId: rid }),
      Order.countDocuments({
        restaurantId: rid,
        orderStatus: OrderStatus.DELIVERED,
      }),
      Order.aggregate([
        {
          $match: {
            restaurantId: rid,
            orderStatus: OrderStatus.DELIVERED,
          },
        },
        { $group: { _id: null, total: { $sum: "$grandTotal" } } },
      ]),
      Order.aggregate([
        {
          $match: {
            restaurantId: rid,
            createdAt: { $gte: thirtyDaysAgo },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
            },
            orders: { $sum: 1 },
            revenue: {
              $sum: {
                $cond: [
                  { $eq: ["$orderStatus", OrderStatus.DELIVERED] },
                  "$grandTotal",
                  0,
                ],
              },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Order.aggregate([
        { $match: { restaurantId: rid } },
        { $group: { _id: "$orderStatus", count: { $sum: 1 } } },
      ]),
    ]);

  return {
    restaurantId,
    restaurantName: restaurant.restaurantName,
    totalOrders,
    completedOrders,
    totalRevenue: revenueAgg[0]?.total ?? 0,
    averageRating: restaurant.averageRating,
    totalRatings: restaurant.totalRatings,
    isOpen: restaurant.isOpen,
    ordersByStatus: byStatus,
    ordersByDayLast30: ordersByDay,
  };
}

export async function getTaxReport(range: { from: Date; to: Date }) {
  const match = {
    orderStatus: OrderStatus.DELIVERED,
    deliveredAt: { $gte: range.from, $lte: range.to },
  };

  const [summary, byDay, byRestaurant] = await Promise.all([
    Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalTax: { $sum: "$taxAmount" },
          totalRevenue: { $sum: "$grandTotal" },
          taxableSubtotal: { $sum: "$subtotal" },
          orderCount: { $sum: 1 },
        },
      },
    ]),
    Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$deliveredAt" } },
          taxCollected: { $sum: "$taxAmount" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$restaurantId",
          taxCollected: { $sum: "$taxAmount" },
          revenue: { $sum: "$grandTotal" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { taxCollected: -1 } },
      { $limit: 15 },
      {
        $lookup: {
          from: "restaurants",
          localField: "_id",
          foreignField: "_id",
          as: "restaurant",
        },
      },
      {
        $project: {
          restaurantId: "$_id",
          restaurantName: { $arrayElemAt: ["$restaurant.restaurantName", 0] },
          taxCollected: 1,
          revenue: 1,
          orders: 1,
        },
      },
    ]),
  ]);

  const s = summary[0];
  return {
    period: { from: range.from, to: range.to },
    totalTaxCollected: Math.round((s?.totalTax ?? 0) * 100) / 100,
    taxableSubtotal: Math.round((s?.taxableSubtotal ?? 0) * 100) / 100,
    totalRevenue: s?.totalRevenue ?? 0,
    deliveredOrders: s?.orderCount ?? 0,
    effectiveTaxRate:
      s?.taxableSubtotal > 0
        ? Math.round(((s.totalTax / s.taxableSubtotal) * 100) * 100) / 100
        : 0,
    taxByDay: byDay,
    taxByRestaurant: byRestaurant,
  };
}
