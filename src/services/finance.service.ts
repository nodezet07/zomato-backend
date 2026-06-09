import mongoose from "mongoose";
import Order from "../models/order.model.js";
import Restaurant from "../models/restaurant.model.js";
import Rider from "../models/rider.model.js";
import RestaurantSettlement from "../models/restaurantSettlement.model.js";
import RiderPayout from "../models/riderPayout.model.js";
import { AppError } from "../utils/AppError.js";
import {
  DEFAULT_RESTAURANT_COMMISSION_PERCENT,
  RIDER_EARNING_PER_DELIVERY,
} from "../constants/index.js";
import {
  OrderStatus,
  RestaurantSettlementStatus,
  RiderPayoutStatus,
  SettlementCycle,
} from "../types/enums.js";
import { getPagination, paginationMeta } from "../helpers/pagination.js";

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function genNumber(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

/** Compute restaurant commission & rider earning snapshot for a delivered order */
export function computeOrderFinancialSplit(input: {
  subtotal: number;
  packagingCharge: number;
  platformFee: number;
  deliveryFee: number;
  commissionRate: number;
  hasRider: boolean;
}) {
  const restaurantGross = roundMoney(input.subtotal + input.packagingCharge);
  const commissionAmount = roundMoney(
    (input.subtotal * input.commissionRate) / 100,
  );
  const restaurantNetPayable = roundMoney(restaurantGross - commissionAmount);
  const riderEarningAmount = input.hasRider ? RIDER_EARNING_PER_DELIVERY : 0;

  return {
    commissionRate: input.commissionRate,
    commissionAmount,
    restaurantGrossAmount: restaurantGross,
    restaurantNetPayable,
    riderEarningAmount,
    platformCustomerFee: input.platformFee,
    deliveryFeeCollected: input.deliveryFee,
  };
}

/**
 * Idempotent hook — call whenever an order becomes DELIVERED.
 * Records per-order financials and credits rider counters once.
 */
export async function recordOrderFinancialsOnDelivery(
  orderId: string,
): Promise<void> {
  const order = await Order.findById(orderId);
  if (!order || order.orderStatus !== OrderStatus.DELIVERED) {
    return;
  }
  if (order.settlement?.recordedAt) {
    return;
  }

  const restaurant = await Restaurant.findById(order.restaurantId);
  if (!restaurant) {
    return;
  }

  const commissionRate =
    restaurant.platformCommissionPercentage ?? DEFAULT_RESTAURANT_COMMISSION_PERCENT;

  const split = computeOrderFinancialSplit({
    subtotal: order.subtotal,
    packagingCharge: order.packagingCharge,
    platformFee: order.platformFee,
    deliveryFee: order.deliveryFee,
    commissionRate,
    hasRider: !!order.riderId,
  });

  order.settlement = {
    recordedAt: new Date(),
    ...split,
    restaurantSettlementStatus: "PENDING",
    riderPayoutStatus: split.riderEarningAmount > 0 ? "PENDING" : "PAID",
    riderEarningCredited: false,
  };

  if (order.riderId && split.riderEarningAmount > 0) {
    const rider = await Rider.findById(order.riderId);
    if (rider) {
      rider.totalDeliveries += 1;
      rider.totalEarnings += split.riderEarningAmount;
      rider.todayEarnings += split.riderEarningAmount;
      order.settlement.riderEarningCredited = true;
      await rider.save();
    }
  }

  await order.save();
}

// ─── Restaurant owner / partner views ───────────────────────────────────────

export async function getRestaurantEarningsSummary(
  restaurantId: string,
  ownerUserId: string,
) {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) {
    throw new AppError("Restaurant not found", 404);
  }
  if (restaurant.ownerId.toString() !== ownerUserId) {
    throw new AppError("Not your restaurant", 403);
  }

  const baseFilter = {
    restaurantId: restaurant._id,
    orderStatus: OrderStatus.DELIVERED,
    "settlement.recordedAt": { $exists: true },
  };

  const [pendingAgg, settledAgg, paidAgg, pendingOrders] = await Promise.all([
    Order.aggregate([
      {
        $match: {
          ...baseFilter,
          "settlement.restaurantSettlementStatus": "PENDING",
        },
      },
      {
        $group: {
          _id: null,
          orderCount: { $sum: 1 },
          grossFoodSales: { $sum: "$settlement.restaurantGrossAmount" },
          totalCommission: { $sum: "$settlement.commissionAmount" },
          netPayable: { $sum: "$settlement.restaurantNetPayable" },
        },
      },
    ]),
    Order.aggregate([
      {
        $match: {
          ...baseFilter,
          "settlement.restaurantSettlementStatus": "SETTLED",
        },
      },
      {
        $group: {
          _id: null,
          orderCount: { $sum: 1 },
          netPayable: { $sum: "$settlement.restaurantNetPayable" },
        },
      },
    ]),
    Order.aggregate([
      {
        $match: {
          ...baseFilter,
          "settlement.restaurantSettlementStatus": "PAID",
        },
      },
      {
        $group: {
          _id: null,
          orderCount: { $sum: 1 },
          netPayable: { $sum: "$settlement.restaurantNetPayable" },
        },
      },
    ]),
    Order.find({
      ...baseFilter,
      "settlement.restaurantSettlementStatus": "PENDING",
    })
      .sort({ deliveredAt: -1 })
      .limit(20)
      .select("orderNumber deliveredAt subtotal grandTotal settlement")
      .lean(),
  ]);

  const pending = pendingAgg[0] ?? {
    orderCount: 0,
    grossFoodSales: 0,
    totalCommission: 0,
    netPayable: 0,
  };
  const awaitingTransfer = settledAgg[0] ?? { orderCount: 0, netPayable: 0 };
  const paid = paidAgg[0] ?? { orderCount: 0, netPayable: 0 };

  return {
    restaurantId: restaurant._id,
    restaurantName: restaurant.restaurantName,
    commissionRate: restaurant.platformCommissionPercentage,
    pendingSettlement: {
      orderCount: pending.orderCount,
      grossFoodSales: roundMoney(pending.grossFoodSales),
      totalCommission: roundMoney(pending.totalCommission),
      netPayable: roundMoney(pending.netPayable),
    },
    awaitingBankTransfer: {
      orderCount: awaitingTransfer.orderCount,
      netPayable: roundMoney(awaitingTransfer.netPayable),
    },
    totalPaidOut: {
      orderCount: paid.orderCount,
      netPayable: roundMoney(paid.netPayable),
    },
    recentPendingOrders: pendingOrders,
  };
}

export async function listRestaurantSettlementHistory(
  restaurantId: string,
  ownerUserId: string,
  page: number,
  limit: number,
) {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) {
    throw new AppError("Restaurant not found", 404);
  }
  if (restaurant.ownerId.toString() !== ownerUserId) {
    throw new AppError("Not your restaurant", 403);
  }

  const { skip } = getPagination(page, limit);
  const filter = { restaurantId: restaurant._id };

  const [settlements, total] = await Promise.all([
    RestaurantSettlement.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    RestaurantSettlement.countDocuments(filter),
  ]);

  return {
    settlements,
    pagination: paginationMeta(total, page, limit),
  };
}

// ─── Rider partner views ──────────────────────────────────────────────────────

export async function getRiderEarningsSummaryV1(userId: string) {
  const rider = await Rider.findOne({ userId });
  if (!rider) {
    throw new AppError("Rider not found", 404);
  }

  const baseFilter = {
    riderId: rider._id,
    orderStatus: OrderStatus.DELIVERED,
    "settlement.recordedAt": { $exists: true },
  };

  const [pendingAgg, paidAgg] = await Promise.all([
    Order.aggregate([
      {
        $match: {
          ...baseFilter,
          "settlement.riderPayoutStatus": "PENDING",
        },
      },
      {
        $group: {
          _id: null,
          deliveryCount: { $sum: 1 },
          grossEarnings: { $sum: "$settlement.riderEarningAmount" },
        },
      },
    ]),
    Order.aggregate([
      {
        $match: {
          ...baseFilter,
          "settlement.riderPayoutStatus": "PAID",
        },
      },
      {
        $group: {
          _id: null,
          deliveryCount: { $sum: 1 },
          grossEarnings: { $sum: "$settlement.riderEarningAmount" },
        },
      },
    ]),
  ]);

  const pending = pendingAgg[0] ?? { deliveryCount: 0, grossEarnings: 0 };
  const paid = paidAgg[0] ?? { deliveryCount: 0, grossEarnings: 0 };

  return {
    riderId: rider._id,
    riderCode: rider.riderCode,
    earningPerDelivery: RIDER_EARNING_PER_DELIVERY,
    totalDeliveries: rider.totalDeliveries,
    totalEarnings: rider.totalEarnings,
    todayEarnings: rider.todayEarnings,
    pendingPayout: {
      deliveryCount: pending.deliveryCount,
      grossEarnings: roundMoney(pending.grossEarnings),
    },
    totalPaidOut: {
      deliveryCount: paid.deliveryCount,
      grossEarnings: roundMoney(paid.grossEarnings),
    },
    settlementCycle: SettlementCycle.WEEKLY,
  };
}

export async function listRiderPayoutHistory(
  userId: string,
  page: number,
  limit: number,
) {
  const rider = await Rider.findOne({ userId });
  if (!rider) {
    throw new AppError("Rider not found", 404);
  }

  const { skip } = getPagination(page, limit);
  const filter = { riderId: rider._id };

  const [payouts, total] = await Promise.all([
    RiderPayout.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    RiderPayout.countDocuments(filter),
  ]);

  return {
    payouts,
    pagination: paginationMeta(total, page, limit),
  };
}

// ─── Admin finance ────────────────────────────────────────────────────────────

export async function getAdminFinanceSummary() {
  const delivered = { orderStatus: OrderStatus.DELIVERED, "settlement.recordedAt": { $exists: true } };

  const [platformAgg, pendingRestaurant, pendingRider, settlementCounts] =
    await Promise.all([
      Order.aggregate([
        { $match: delivered },
        {
          $group: {
            _id: null,
            totalGmv: { $sum: "$grandTotal" },
            totalCommission: { $sum: "$settlement.commissionAmount" },
            totalPlatformFees: { $sum: "$settlement.platformCustomerFee" },
            totalDeliveryFees: { $sum: "$settlement.deliveryFeeCollected" },
            totalRiderEarnings: { $sum: "$settlement.riderEarningAmount" },
            totalRestaurantPayable: { $sum: "$settlement.restaurantNetPayable" },
          },
        },
      ]),
      Order.aggregate([
        {
          $match: {
            ...delivered,
            "settlement.restaurantSettlementStatus": "PENDING",
          },
        },
        {
          $group: {
            _id: null,
            orderCount: { $sum: 1 },
            netPayable: { $sum: "$settlement.restaurantNetPayable" },
          },
        },
      ]),
      Order.aggregate([
        {
          $match: {
            ...delivered,
            "settlement.riderPayoutStatus": "PENDING",
          },
        },
        {
          $group: {
            _id: null,
            deliveryCount: { $sum: 1 },
            grossEarnings: { $sum: "$settlement.riderEarningAmount" },
          },
        },
      ]),
      Promise.all([
        RestaurantSettlement.countDocuments({ status: RestaurantSettlementStatus.PENDING }),
        RestaurantSettlement.countDocuments({ status: RestaurantSettlementStatus.PAID }),
        RiderPayout.countDocuments({ status: RiderPayoutStatus.PENDING }),
        RiderPayout.countDocuments({ status: RiderPayoutStatus.PAID }),
      ]),
    ]);

  const p = platformAgg[0] ?? {};
  const pr = pendingRestaurant[0] ?? { orderCount: 0, netPayable: 0 };
  const rr = pendingRider[0] ?? { deliveryCount: 0, grossEarnings: 0 };

  return {
    v1Model: {
      customerPayments: "Razorpay → platform account",
      restaurantSettlements: "Manual by admin",
      riderPayouts: "Manual weekly by admin",
      wallet: "Disabled in V1",
      automatedPayouts: "Not integrated (RazorpayX/Cashfree later)",
    },
    platform: {
      totalGmv: roundMoney(p.totalGmv ?? 0),
      totalCommission: roundMoney(p.totalCommission ?? 0),
      totalPlatformFees: roundMoney(p.totalPlatformFees ?? 0),
      totalDeliveryFees: roundMoney(p.totalDeliveryFees ?? 0),
      totalRiderEarningsAccrued: roundMoney(p.totalRiderEarnings ?? 0),
      totalRestaurantPayableAccrued: roundMoney(p.totalRestaurantPayable ?? 0),
    },
    pendingRestaurantSettlement: {
      orderCount: pr.orderCount,
      netPayable: roundMoney(pr.netPayable),
    },
    pendingRiderPayout: {
      deliveryCount: rr.deliveryCount,
      grossEarnings: roundMoney(rr.grossEarnings),
    },
    settlementBatches: {
      restaurantPending: settlementCounts[0],
      restaurantPaid: settlementCounts[1],
      riderPending: settlementCounts[2],
      riderPaid: settlementCounts[3],
    },
  };
}

export async function listAdminRestaurantEarnings(page: number, limit: number) {
  const { skip } = getPagination(page, limit);

  const rows = await Order.aggregate([
    {
      $match: {
        orderStatus: OrderStatus.DELIVERED,
        "settlement.recordedAt": { $exists: true },
        "settlement.restaurantSettlementStatus": "PENDING",
      },
    },
    {
      $group: {
        _id: "$restaurantId",
        orderCount: { $sum: 1 },
        grossFoodSales: { $sum: "$settlement.restaurantGrossAmount" },
        totalCommission: { $sum: "$settlement.commissionAmount" },
        netPayable: { $sum: "$settlement.restaurantNetPayable" },
      },
    },
    { $sort: { netPayable: -1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $lookup: {
        from: "restaurants",
        localField: "_id",
        foreignField: "_id",
        as: "restaurant",
      },
    },
    { $unwind: { path: "$restaurant", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        restaurantId: "$_id",
        restaurantName: "$restaurant.restaurantName",
        commissionRate: "$restaurant.platformCommissionPercentage",
        orderCount: 1,
        grossFoodSales: 1,
        totalCommission: 1,
        netPayable: 1,
      },
    },
  ]);

  const total = await Order.aggregate([
    {
      $match: {
        orderStatus: OrderStatus.DELIVERED,
        "settlement.recordedAt": { $exists: true },
        "settlement.restaurantSettlementStatus": "PENDING",
      },
    },
    { $group: { _id: "$restaurantId" } },
    { $count: "total" },
  ]);

  return {
    restaurants: rows.map((r) => ({
      ...r,
      grossFoodSales: roundMoney(r.grossFoodSales),
      totalCommission: roundMoney(r.totalCommission),
      netPayable: roundMoney(r.netPayable),
    })),
    pagination: paginationMeta(total[0]?.total ?? 0, page, limit),
  };
}

export async function getAdminRestaurantEarningsDetail(restaurantId: string) {
  const restaurant = await Restaurant.findById(restaurantId).lean();
  if (!restaurant) {
    throw new AppError("Restaurant not found", 404);
  }

  const pendingOrders = await Order.find({
    restaurantId,
    orderStatus: OrderStatus.DELIVERED,
    "settlement.restaurantSettlementStatus": "PENDING",
    "settlement.recordedAt": { $exists: true },
  })
    .sort({ deliveredAt: -1 })
    .select(
      "orderNumber deliveredAt paymentMethod grandTotal settlement subtotal",
    )
    .lean();

  const totals = pendingOrders.reduce(
    (acc, o) => {
      const s = (o as any).settlement;
      acc.grossFoodSales += s?.restaurantGrossAmount ?? 0;
      acc.totalCommission += s?.commissionAmount ?? 0;
      acc.netPayable += s?.restaurantNetPayable ?? 0;
      return acc;
    },
    { grossFoodSales: 0, totalCommission: 0, netPayable: 0 },
  );

  return {
    restaurant,
    pendingOrderCount: pendingOrders.length,
    grossFoodSales: roundMoney(totals.grossFoodSales),
    totalCommission: roundMoney(totals.totalCommission),
    netPayable: roundMoney(totals.netPayable),
    pendingOrders,
    bankAccountDetails: restaurant.bankAccountDetails ?? null,
  };
}

export async function createRestaurantSettlement(
  adminId: string,
  restaurantId: string,
  input: {
    orderIds?: string[];
    periodStart?: string;
    periodEnd?: string;
    notes?: string;
  },
) {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) {
    throw new AppError("Restaurant not found", 404);
  }

  const filter: Record<string, unknown> = {
    restaurantId: restaurant._id,
    orderStatus: OrderStatus.DELIVERED,
    "settlement.restaurantSettlementStatus": "PENDING",
    "settlement.recordedAt": { $exists: true },
  };

  if (input.orderIds?.length) {
    filter._id = {
      $in: input.orderIds.map((id) => new mongoose.Types.ObjectId(id)),
    };
  } else {
    if (input.periodStart) {
      filter.deliveredAt = {
        ...(filter.deliveredAt as object),
        $gte: new Date(input.periodStart),
      };
    }
    if (input.periodEnd) {
      const end = new Date(input.periodEnd);
      end.setHours(23, 59, 59, 999);
      filter.deliveredAt = {
        ...(filter.deliveredAt as object),
        $lte: end,
      };
    }
  }

  const orders = await Order.find(filter);
  if (!orders.length) {
    throw new AppError("No pending orders found for settlement", 400);
  }

  let grossFoodSales = 0;
  let totalCommission = 0;
  let netPayable = 0;
  const orderIds: mongoose.Types.ObjectId[] = [];

  for (const order of orders) {
    const s = order.settlement!;
    grossFoodSales += s.restaurantGrossAmount;
    totalCommission += s.commissionAmount;
    netPayable += s.restaurantNetPayable;
    orderIds.push(order._id);
  }

  const settlement = await RestaurantSettlement.create({
    settlementNumber: genNumber("RST"),
    restaurantId: restaurant._id,
    orderIds,
    orderCount: orders.length,
    grossFoodSales: roundMoney(grossFoodSales),
    totalCommission: roundMoney(totalCommission),
    netPayable: roundMoney(netPayable),
    status: RestaurantSettlementStatus.PENDING,
    periodStart: input.periodStart ? new Date(input.periodStart) : undefined,
    periodEnd: input.periodEnd ? new Date(input.periodEnd) : undefined,
    bankSnapshot: restaurant.bankAccountDetails ?? undefined,
    notes: input.notes,
    createdByAdminId: adminId,
  });

  await Order.updateMany(
    { _id: { $in: orderIds } },
    {
      $set: {
        "settlement.restaurantSettlementStatus": "SETTLED",
        "settlement.restaurantSettlementId": settlement._id,
      },
    },
  );

  return settlement;
}

export async function markRestaurantSettlementPaid(
  adminId: string,
  settlementId: string,
  input: { paymentReference: string; notes?: string },
) {
  const settlement = await RestaurantSettlement.findById(settlementId);
  if (!settlement) {
    throw new AppError("Settlement not found", 404);
  }
  if (settlement.status === RestaurantSettlementStatus.PAID) {
    throw new AppError("Settlement already marked paid", 400);
  }
  if (settlement.status === RestaurantSettlementStatus.CANCELLED) {
    throw new AppError("Cancelled settlement cannot be paid", 400);
  }

  settlement.status = RestaurantSettlementStatus.PAID;
  settlement.paidAt = new Date();
  settlement.paidByAdminId = new mongoose.Types.ObjectId(adminId);
  settlement.paymentReference = input.paymentReference;
  if (input.notes) {
    settlement.notes = settlement.notes
      ? `${settlement.notes}\n${input.notes}`
      : input.notes;
  }
  await settlement.save();

  await Order.updateMany(
    { _id: { $in: settlement.orderIds } },
    { $set: { "settlement.restaurantSettlementStatus": "PAID" } },
  );

  return settlement;
}

export async function listAdminRestaurantSettlements(
  page: number,
  limit: number,
  status?: RestaurantSettlementStatus,
) {
  const { skip } = getPagination(page, limit);
  const filter: Record<string, unknown> = {};
  if (status) {
    filter.status = status;
  }

  const [settlements, total] = await Promise.all([
    RestaurantSettlement.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("restaurantId", "restaurantName slug")
      .lean(),
    RestaurantSettlement.countDocuments(filter),
  ]);

  return { settlements, pagination: paginationMeta(total, page, limit) };
}

export async function listAdminRiderEarnings(page: number, limit: number) {
  const { skip } = getPagination(page, limit);

  const rows = await Order.aggregate([
    {
      $match: {
        orderStatus: OrderStatus.DELIVERED,
        "settlement.recordedAt": { $exists: true },
        "settlement.riderPayoutStatus": "PENDING",
        riderId: { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: "$riderId",
        deliveryCount: { $sum: 1 },
        grossEarnings: { $sum: "$settlement.riderEarningAmount" },
      },
    },
    { $sort: { grossEarnings: -1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $lookup: {
        from: "riders",
        localField: "_id",
        foreignField: "_id",
        as: "rider",
      },
    },
    { $unwind: { path: "$rider", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        riderId: "$_id",
        riderCode: "$rider.riderCode",
        deliveryCount: 1,
        grossEarnings: 1,
      },
    },
  ]);

  const total = await Order.aggregate([
    {
      $match: {
        orderStatus: OrderStatus.DELIVERED,
        "settlement.riderPayoutStatus": "PENDING",
        riderId: { $exists: true, $ne: null },
      },
    },
    { $group: { _id: "$riderId" } },
    { $count: "total" },
  ]);

  return {
    riders: rows.map((r) => ({
      ...r,
      grossEarnings: roundMoney(r.grossEarnings),
    })),
    pagination: paginationMeta(total[0]?.total ?? 0, page, limit),
  };
}

export async function createRiderPayout(
  adminId: string,
  riderId: string,
  input: {
    orderIds?: string[];
    periodStart?: string;
    periodEnd?: string;
    deductions?: number;
    notes?: string;
    cycle?: SettlementCycle;
  },
) {
  const rider = await Rider.findById(riderId);
  if (!rider) {
    throw new AppError("Rider not found", 404);
  }

  const filter: Record<string, unknown> = {
    riderId: rider._id,
    orderStatus: OrderStatus.DELIVERED,
    "settlement.riderPayoutStatus": "PENDING",
    "settlement.recordedAt": { $exists: true },
  };

  if (input.orderIds?.length) {
    filter._id = {
      $in: input.orderIds.map((id) => new mongoose.Types.ObjectId(id)),
    };
  } else {
    if (input.periodStart) {
      filter.deliveredAt = {
        ...(filter.deliveredAt as object),
        $gte: new Date(input.periodStart),
      };
    }
    if (input.periodEnd) {
      const end = new Date(input.periodEnd);
      end.setHours(23, 59, 59, 999);
      filter.deliveredAt = {
        ...(filter.deliveredAt as object),
        $lte: end,
      };
    }
  }

  const orders = await Order.find(filter);
  if (!orders.length) {
    throw new AppError("No pending deliveries found for payout", 400);
  }

  let grossEarnings = 0;
  const orderIds: mongoose.Types.ObjectId[] = [];
  for (const order of orders) {
    grossEarnings += order.settlement?.riderEarningAmount ?? 0;
    orderIds.push(order._id);
  }

  const deductions = roundMoney(input.deductions ?? 0);
  const netPayable = roundMoney(Math.max(0, grossEarnings - deductions));

  const payout = await RiderPayout.create({
    payoutNumber: genNumber("RPO"),
    riderId: rider._id,
    orderIds,
    deliveryCount: orders.length,
    grossEarnings: roundMoney(grossEarnings),
    deductions,
    netPayable,
    status: RiderPayoutStatus.PENDING,
    cycle: input.cycle ?? SettlementCycle.WEEKLY,
    periodStart: input.periodStart ? new Date(input.periodStart) : undefined,
    periodEnd: input.periodEnd ? new Date(input.periodEnd) : undefined,
    bankSnapshot: rider.bankAccountDetails ?? undefined,
    notes: input.notes,
    createdByAdminId: adminId,
  });

  await Order.updateMany(
    { _id: { $in: orderIds } },
    {
      $set: {
        "settlement.riderPayoutId": payout._id,
      },
    },
  );

  return payout;
}

export async function markRiderPayoutPaid(
  adminId: string,
  payoutId: string,
  input: { paymentReference: string; notes?: string },
) {
  const payout = await RiderPayout.findById(payoutId);
  if (!payout) {
    throw new AppError("Payout not found", 404);
  }
  if (payout.status === RiderPayoutStatus.PAID) {
    throw new AppError("Payout already marked paid", 400);
  }
  if (payout.status === RiderPayoutStatus.REJECTED) {
    throw new AppError("Rejected payout cannot be paid", 400);
  }

  payout.status = RiderPayoutStatus.PAID;
  payout.paidAt = new Date();
  payout.paidByAdminId = new mongoose.Types.ObjectId(adminId);
  payout.paymentReference = input.paymentReference;
  if (input.notes) {
    payout.notes = payout.notes ? `${payout.notes}\n${input.notes}` : input.notes;
  }
  await payout.save();

  await Order.updateMany(
    { _id: { $in: payout.orderIds } },
    { $set: { "settlement.riderPayoutStatus": "PAID" } },
  );

  return payout;
}

export async function listAdminRiderPayouts(
  page: number,
  limit: number,
  status?: RiderPayoutStatus,
) {
  const { skip } = getPagination(page, limit);
  const filter: Record<string, unknown> = {};
  if (status) {
    filter.status = status;
  }

  const [payouts, total] = await Promise.all([
    RiderPayout.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("riderId", "riderCode userId")
      .lean(),
    RiderPayout.countDocuments(filter),
  ]);

  return { payouts, pagination: paginationMeta(total, page, limit) };
}
