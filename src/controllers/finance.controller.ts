import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/auth.types.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { DEFAULT_PAGE, DEFAULT_LIMIT } from "../constants/index.js";
import {
  RestaurantSettlementStatus,
  RiderPayoutStatus,
} from "../types/enums.js";
import {
  getAdminFinanceSummary,
  listAdminRestaurantEarnings,
  getAdminRestaurantEarningsDetail,
  createRestaurantSettlement,
  markRestaurantSettlementPaid,
  listAdminRestaurantSettlements,
  listAdminRiderEarnings,
  createRiderPayout,
  markRiderPayoutPaid,
  listAdminRiderPayouts,
  getRestaurantEarningsSummary,
  listRestaurantSettlementHistory,
  getRiderEarningsSummaryV1,
  listRiderPayoutHistory,
} from "../services/finance.service.js";
import { buildAuditContext, writeAuditLog } from "../services/audit.service.js";

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function pageLimit(query: { page?: number; limit?: number }) {
  return {
    page: query.page ?? DEFAULT_PAGE,
    limit: query.limit ?? DEFAULT_LIMIT,
  };
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export const adminFinanceSummary = async (
  _req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await getAdminFinanceSummary();
    sendSuccess(res, "Finance summary fetched", data);
  } catch (err) {
    next(err);
  }
};

export const adminListRestaurantEarnings = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { page, limit } = pageLimit(req.query as { page?: number; limit?: number });
    const data = await listAdminRestaurantEarnings(page, limit);
    sendSuccess(res, "Restaurant earnings fetched", data);
  } catch (err) {
    next(err);
  }
};

export const adminRestaurantEarningsDetail = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await getAdminRestaurantEarningsDetail(
      paramId(req.params.restaurantId),
    );
    sendSuccess(res, "Restaurant earnings detail fetched", data);
  } catch (err) {
    next(err);
  }
};

export const adminCreateRestaurantSettlement = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const settlement = await createRestaurantSettlement(
      req.adminId!,
      paramId(req.params.restaurantId),
      req.body,
    );
    await writeAuditLog(buildAuditContext(req), {
      module: "finance",
      action: "RESTAURANT_SETTLEMENT_CREATED",
      entityId: settlement._id.toString(),
      newData: { settlementNumber: settlement.settlementNumber },
    });
    sendSuccess(res, "Restaurant settlement created", { settlement }, 201);
  } catch (err) {
    next(err);
  }
};

export const adminListRestaurantSettlements = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { page, limit } = pageLimit(req.query as { page?: number; limit?: number });
    const status = req.query.status as RestaurantSettlementStatus | undefined;
    const data = await listAdminRestaurantSettlements(page, limit, status);
    sendSuccess(res, "Restaurant settlements fetched", data);
  } catch (err) {
    next(err);
  }
};

export const adminMarkRestaurantSettlementPaid = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const settlement = await markRestaurantSettlementPaid(
      req.adminId!,
      paramId(req.params.settlementId),
      req.body,
    );
    await writeAuditLog(buildAuditContext(req), {
      module: "finance",
      action: "RESTAURANT_SETTLEMENT_PAID",
      entityId: settlement._id.toString(),
      newData: { paymentReference: req.body.paymentReference },
    });
    sendSuccess(res, "Restaurant settlement marked paid", { settlement });
  } catch (err) {
    next(err);
  }
};

export const adminListRiderEarnings = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { page, limit } = pageLimit(req.query as { page?: number; limit?: number });
    const data = await listAdminRiderEarnings(page, limit);
    sendSuccess(res, "Rider earnings fetched", data);
  } catch (err) {
    next(err);
  }
};

export const adminCreateRiderPayout = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const payout = await createRiderPayout(
      req.adminId!,
      paramId(req.params.riderId),
      req.body,
    );
    await writeAuditLog(buildAuditContext(req), {
      module: "finance",
      action: "RIDER_PAYOUT_CREATED",
      entityId: payout._id.toString(),
      newData: { payoutNumber: payout.payoutNumber },
    });
    sendSuccess(res, "Rider payout created", { payout }, 201);
  } catch (err) {
    next(err);
  }
};

export const adminListRiderPayouts = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { page, limit } = pageLimit(req.query as { page?: number; limit?: number });
    const status = req.query.status as RiderPayoutStatus | undefined;
    const data = await listAdminRiderPayouts(page, limit, status);
    sendSuccess(res, "Rider payouts fetched", data);
  } catch (err) {
    next(err);
  }
};

export const adminMarkRiderPayoutPaid = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const payout = await markRiderPayoutPaid(
      req.adminId!,
      paramId(req.params.payoutId),
      req.body,
    );
    await writeAuditLog(buildAuditContext(req), {
      module: "finance",
      action: "RIDER_PAYOUT_PAID",
      entityId: payout._id.toString(),
      newData: { paymentReference: req.body.paymentReference },
    });
    sendSuccess(res, "Rider payout marked paid", { payout });
  } catch (err) {
    next(err);
  }
};

// ─── Restaurant owner ─────────────────────────────────────────────────────────

export const restaurantEarningsSummary = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await getRestaurantEarningsSummary(
      paramId(req.params.restaurantId),
      req.userId!,
    );
    sendSuccess(res, "Restaurant earnings fetched", data);
  } catch (err) {
    next(err);
  }
};

export const restaurantSettlementHistory = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { page, limit } = pageLimit(req.query as { page?: number; limit?: number });
    const data = await listRestaurantSettlementHistory(
      paramId(req.params.restaurantId),
      req.userId!,
      page,
      limit,
    );
    sendSuccess(res, "Settlement history fetched", data);
  } catch (err) {
    next(err);
  }
};

// ─── Rider ────────────────────────────────────────────────────────────────────

export const riderEarningsSummaryV1 = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await getRiderEarningsSummaryV1(req.userId!);
    sendSuccess(res, "Rider earnings fetched", data);
  } catch (err) {
    next(err);
  }
};

export const riderPayoutHistory = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { page, limit } = pageLimit(req.query as { page?: number; limit?: number });
    const data = await listRiderPayoutHistory(req.userId!, page, limit);
    sendSuccess(res, "Payout history fetched", data);
  } catch (err) {
    next(err);
  }
};
