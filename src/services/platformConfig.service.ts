import CityZone from "../models/cityZone.model.js";
import mongoose from "mongoose";
import PlatformPolicy from "../models/platformPolicy.model.js";
import LedgerEntry from "../models/ledgerEntry.model.js";
import RiderWithdrawalRequest, {
  WithdrawalStatus,
} from "../models/riderWithdrawalRequest.model.js";
import Restaurant from "../models/restaurant.model.js";
import Rider from "../models/rider.model.js";
import RiderPayout from "../models/riderPayout.model.js";
import { AppError } from "../utils/AppError.js";
import { getPagination, paginationMeta } from "../helpers/pagination.js";

function genNumber(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

// ─── Platform policy (singleton) ─────────────────────────────────────────────

export async function getPlatformPolicy() {
  let policy = await PlatformPolicy.findOne({ key: "global" });
  if (!policy) {
    policy = await PlatformPolicy.create({ key: "global" });
  }
  return policy;
}

let policyCache: { policy: Awaited<ReturnType<typeof getPlatformPolicy>>; at: number } | null = null;

export async function getEffectivePlatformPolicy() {
  if (policyCache && Date.now() - policyCache.at < 60_000) {
    return policyCache.policy;
  }
  const policy = await getPlatformPolicy();
  policyCache = { policy, at: Date.now() };
  return policy;
}

export function invalidatePlatformPolicyCache() {
  policyCache = null;
}

export async function updatePlatformPolicy(
  adminId: string,
  body: Record<string, unknown>,
) {
  const policy = await getPlatformPolicy();
  const allowed = [
    "defaultRestaurantCommissionPercent",
    "defaultPlatformFeePercent",
    "maxPlatformFee",
    "defaultDeliveryFee",
    "settlementCycle",
    "restaurantReserveHoldDays",
    "riderMinWithdrawalAmount",
    "riderBaseFare",
    "riderPerKmRate",
    "riderSurgeMultiplier",
    "deliveryFeeSlabs",
    "cancellationRules",
  ] as const;

  for (const key of allowed) {
    if (body[key] !== undefined) {
      (policy as unknown as Record<string, unknown>)[key] = body[key];
    }
  }
  policy.updatedBy = adminId as unknown as typeof policy.updatedBy;
  await policy.save();
  invalidatePlatformPolicyCache();
  return policy;
}

// ─── Cities & zones ──────────────────────────────────────────────────────────

export async function listCities(page = 1, limit = 20) {
  const { skip } = getPagination(String(page), String(limit));
  const [cities, total] = await Promise.all([
    CityZone.find().sort({ cityName: 1 }).skip(skip).limit(limit).lean(),
    CityZone.countDocuments(),
  ]);
  return { cities, pagination: paginationMeta(total, page, limit) };
}

export async function createCity(body: {
  cityCode: string;
  cityName: string;
  state?: string;
  country?: string;
  currency?: string;
  timezone?: string;
  zones?: { zoneCode: string; zoneName: string; radiusKm?: number }[];
}) {
  const exists = await CityZone.findOne({
    cityCode: body.cityCode.toUpperCase(),
  });
  if (exists) throw new AppError("City code already exists", 409);
  return CityZone.create({
    ...body,
    cityCode: body.cityCode.toUpperCase(),
  });
}

export async function updateCity(cityId: string, body: Record<string, unknown>) {
  const city = await CityZone.findById(cityId);
  if (!city) throw new AppError("City not found", 404);
  if (body.cityName) city.cityName = body.cityName as string;
  if (body.state !== undefined) city.state = body.state as string;
  if (body.isActive !== undefined) city.isActive = body.isActive as boolean;
  if (Array.isArray(body.zones)) {
    city.zones = body.zones as typeof city.zones;
  }
  await city.save();
  return city;
}

// ─── Restaurant commission ───────────────────────────────────────────────────

export async function updateRestaurantCommission(
  restaurantId: string,
  commissionPercent: number,
  settlementCycle?: string,
) {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant || restaurant.isDeleted) {
    throw new AppError("Restaurant not found", 404);
  }
  if (commissionPercent < 0 || commissionPercent > 100) {
    throw new AppError("Commission must be between 0 and 100", 400);
  }
  restaurant.platformCommissionPercentage = commissionPercent;
  if (settlementCycle) {
    restaurant.settlementCycle = settlementCycle as typeof restaurant.settlementCycle;
  }
  await restaurant.save();
  return restaurant;
}

// ─── Ledger ──────────────────────────────────────────────────────────────────

export async function listLedgerEntries(
  page = 1,
  limit = 20,
  filters?: { entryType?: string; orderId?: string },
) {
  const { skip } = getPagination(String(page), String(limit));
  const match: Record<string, unknown> = {};
  if (filters?.entryType) match.entryType = filters.entryType;
  if (filters?.orderId) match.orderId = filters.orderId;

  const [entries, total, summary] = await Promise.all([
    LedgerEntry.find(match).sort({ recordedAt: -1 }).skip(skip).limit(limit).lean(),
    LedgerEntry.countDocuments(match),
    LedgerEntry.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$entryType",
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  return {
    entries,
    summary,
    pagination: paginationMeta(total, page, limit),
  };
}

export async function recordLedgerEntry(input: {
  entryType: string;
  debitAccount: string;
  debitEntityId?: string;
  creditAccount: string;
  creditEntityId?: string;
  amount: number;
  orderId?: string;
  paymentId?: string;
  settlementId?: string;
  payoutId?: string;
  description: string;
  metadata?: Record<string, unknown>;
}) {
  return LedgerEntry.create({
    entryNumber: genNumber("LED"),
    ...input,
    debitEntityId: input.debitEntityId || undefined,
    creditEntityId: input.creditEntityId || undefined,
    orderId: input.orderId || undefined,
    paymentId: input.paymentId || undefined,
    settlementId: input.settlementId || undefined,
    payoutId: input.payoutId || undefined,
  });
}

// ─── Rider withdrawals ───────────────────────────────────────────────────────

export async function getRiderAvailableBalance(riderId: mongoose.Types.ObjectId) {
  const rider = await Rider.findById(riderId);
  if (!rider) throw new AppError("Rider not found", 404);

  const [paidPayouts, paidWithdrawals, pendingWithdrawals] = await Promise.all([
    RiderPayout.aggregate([
      { $match: { riderId: rider._id, status: "PAID" } },
      { $group: { _id: null, total: { $sum: "$netPayable" } } },
    ]),
    RiderWithdrawalRequest.aggregate([
      { $match: { riderId: rider._id, status: WithdrawalStatus.PAID } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    RiderWithdrawalRequest.aggregate([
      {
        $match: {
          riderId: rider._id,
          status: { $in: [WithdrawalStatus.PENDING, WithdrawalStatus.APPROVED] },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);

  const totalPaid =
    (paidPayouts[0]?.total ?? 0) +
    (paidWithdrawals[0]?.total ?? 0) +
    (pendingWithdrawals[0]?.total ?? 0);

  return Math.max(0, roundMoney(rider.totalEarnings - totalPaid));
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function createRiderWithdrawalRequest(userId: string, amount: number) {
  const rider = await Rider.findOne({ userId });
  if (!rider) throw new AppError("Rider profile not found", 404);

  const policy = await getPlatformPolicy();
  if (amount < policy.riderMinWithdrawalAmount) {
    throw new AppError(
      `Minimum withdrawal is ₹${policy.riderMinWithdrawalAmount}`,
      400,
    );
  }

  const available = await getRiderAvailableBalance(rider._id);
  if (amount > available) {
    throw new AppError(`Insufficient balance. Available: ₹${available.toFixed(2)}`, 400);
  }

  const pending = await RiderWithdrawalRequest.findOne({
    riderId: rider._id,
    status: WithdrawalStatus.PENDING,
  });
  if (pending) {
    throw new AppError("You already have a pending withdrawal request", 400);
  }

  return RiderWithdrawalRequest.create({
    requestNumber: genNumber("WDR"),
    riderId: rider._id,
    amount: roundMoney(amount),
    bankAccountDetails: rider.bankAccountDetails ?? undefined,
    status: WithdrawalStatus.PENDING,
  });
}

export async function listRiderWithdrawalsForRider(
  userId: string,
  page = 1,
  limit = 20,
) {
  const rider = await Rider.findOne({ userId });
  if (!rider) throw new AppError("Rider profile not found", 404);

  const { skip } = getPagination(String(page), String(limit));
  const filter = { riderId: rider._id };

  const [requests, total, availableBalance] = await Promise.all([
    RiderWithdrawalRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    RiderWithdrawalRequest.countDocuments(filter),
    getRiderAvailableBalance(rider._id),
  ]);

  return {
    requests,
    availableBalance,
    pagination: paginationMeta(total, page, limit),
  };
}

export async function listRiderWithdrawals(
  page = 1,
  limit = 20,
  status?: WithdrawalStatus,
) {
  const { skip } = getPagination(String(page), String(limit));
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;

  const [requests, total] = await Promise.all([
    RiderWithdrawalRequest.find(filter)
      .populate("riderId", "riderCode totalEarnings bankAccountDetails")
      .populate("approvedBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    RiderWithdrawalRequest.countDocuments(filter),
  ]);

  return { requests, pagination: paginationMeta(total, page, limit) };
}

export async function approveRiderWithdrawal(
  adminId: string,
  requestId: string,
  note?: string,
) {
  const req = await RiderWithdrawalRequest.findById(requestId);
  if (!req) throw new AppError("Withdrawal request not found", 404);
  if (req.status !== WithdrawalStatus.PENDING) {
    throw new AppError("Request is not pending", 400);
  }

  const rider = await Rider.findById(req.riderId);
  if (!rider) throw new AppError("Rider not found", 404);

  const available = await getRiderAvailableBalance(rider._id);

  if (req.amount > available) {
    throw new AppError(`Insufficient balance. Available: ₹${available.toFixed(2)}`, 400);
  }

  req.status = WithdrawalStatus.APPROVED;
  req.approvedBy = adminId as unknown as typeof req.approvedBy;
  req.approvedAt = new Date();
  if (note) req.adminNote = note;
  await req.save();
  return req;
}

export async function rejectRiderWithdrawal(
  adminId: string,
  requestId: string,
  reason: string,
) {
  const req = await RiderWithdrawalRequest.findById(requestId);
  if (!req) throw new AppError("Withdrawal request not found", 404);
  if (req.status !== WithdrawalStatus.PENDING) {
    throw new AppError("Request is not pending", 400);
  }
  req.status = WithdrawalStatus.REJECTED;
  req.approvedBy = adminId as unknown as typeof req.approvedBy;
  req.approvedAt = new Date();
  req.failureReason = reason;
  await req.save();
  return req;
}

export async function markRiderWithdrawalPaid(
  adminId: string,
  requestId: string,
  paymentReference: string,
) {
  const req = await RiderWithdrawalRequest.findById(requestId);
  if (!req) throw new AppError("Withdrawal request not found", 404);
  if (req.status !== WithdrawalStatus.APPROVED) {
    throw new AppError("Request must be approved first", 400);
  }

  req.status = WithdrawalStatus.PAID;
  req.paymentReference = paymentReference;
  req.paidAt = new Date();
  await req.save();

  await recordLedgerEntry({
    entryType: "RIDER_PAYOUT",
    debitAccount: "PLATFORM",
    creditAccount: "RIDER",
    creditEntityId: req.riderId.toString(),
    amount: req.amount,
    description: `Rider withdrawal ${req.requestNumber}`,
    metadata: { withdrawalRequestId: req._id.toString(), paymentReference, adminId },
  });

  return req;
}

export async function failRiderWithdrawal(
  requestId: string,
  failureReason: string,
) {
  const req = await RiderWithdrawalRequest.findById(requestId);
  if (!req) throw new AppError("Withdrawal request not found", 404);
  if (![WithdrawalStatus.APPROVED, WithdrawalStatus.PROCESSING].includes(req.status)) {
    throw new AppError("Cannot fail this request", 400);
  }
  req.status = WithdrawalStatus.FAILED;
  req.failureReason = failureReason;
  await req.save();
  return req;
}
