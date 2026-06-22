import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/auth.types.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { DEFAULT_PAGE, DEFAULT_LIMIT } from "../constants/index.js";
import { WithdrawalStatus } from "../models/riderWithdrawalRequest.model.js";
import {
  getPlatformPolicy,
  updatePlatformPolicy,
  listCities,
  createCity,
  updateCity,
  updateRestaurantCommission,
  listLedgerEntries,
  listRiderWithdrawals,
  approveRiderWithdrawal,
  rejectRiderWithdrawal,
  markRiderWithdrawalPaid,
  failRiderWithdrawal,
} from "../services/platformConfig.service.js";
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

export const getPolicy = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const policy = await getPlatformPolicy();
    sendSuccess(res, "Platform policy fetched", { policy });
  } catch (err) {
    next(err);
  }
};

export const patchPolicy = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const policy = await updatePlatformPolicy(req.adminId!, req.body);
    await writeAuditLog(buildAuditContext(req), {
      module: "platform",
      action: "POLICY_UPDATED",
      entityId: policy._id.toString(),
    });
    sendSuccess(res, "Platform policy updated", { policy });
  } catch (err) {
    next(err);
  }
};

export const getCities = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { page, limit } = pageLimit(req.query as { page?: number; limit?: number });
    const data = await listCities(page, limit);
    sendSuccess(res, "Cities fetched", data);
  } catch (err) {
    next(err);
  }
};

export const postCity = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const city = await createCity(req.body);
    sendSuccess(res, "City created", { city }, 201);
  } catch (err) {
    next(err);
  }
};

export const patchCity = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const city = await updateCity(paramId(req.params.cityId), req.body);
    sendSuccess(res, "City updated", { city });
  } catch (err) {
    next(err);
  }
};

export const patchRestaurantCommission = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const restaurant = await updateRestaurantCommission(
      paramId(req.params.restaurantId),
      req.body.commissionPercent,
      req.body.settlementCycle,
    );
    await writeAuditLog(buildAuditContext(req), {
      module: "restaurant",
      action: "COMMISSION_UPDATED",
      entityId: restaurant._id.toString(),
      newData: { commissionPercent: req.body.commissionPercent },
    });
    sendSuccess(res, "Restaurant commission updated", { restaurant });
  } catch (err) {
    next(err);
  }
};

export const getLedger = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { page, limit } = pageLimit(req.query as { page?: number; limit?: number });
    const data = await listLedgerEntries(page, limit, {
      entryType: req.query.entryType as string | undefined,
      orderId: req.query.orderId as string | undefined,
    });
    sendSuccess(res, "Ledger entries fetched", data);
  } catch (err) {
    next(err);
  }
};

export const getWithdrawals = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { page, limit } = pageLimit(req.query as { page?: number; limit?: number });
    const status = req.query.status as WithdrawalStatus | undefined;
    const data = await listRiderWithdrawals(page, limit, status);
    sendSuccess(res, "Withdrawal requests fetched", data);
  } catch (err) {
    next(err);
  }
};

export const approveWithdrawal = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const request = await approveRiderWithdrawal(
      req.adminId!,
      paramId(req.params.requestId),
      req.body.note,
    );
    sendSuccess(res, "Withdrawal approved", { request });
  } catch (err) {
    next(err);
  }
};

export const rejectWithdrawal = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const request = await rejectRiderWithdrawal(
      req.adminId!,
      paramId(req.params.requestId),
      req.body.reason ?? "Rejected by admin",
    );
    sendSuccess(res, "Withdrawal rejected", { request });
  } catch (err) {
    next(err);
  }
};

export const payWithdrawal = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const request = await markRiderWithdrawalPaid(
      req.adminId!,
      paramId(req.params.requestId),
      req.body.paymentReference ?? "",
    );
    sendSuccess(res, "Withdrawal marked paid", { request });
  } catch (err) {
    next(err);
  }
};

export const failWithdrawal = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const request = await failRiderWithdrawal(
      paramId(req.params.requestId),
      req.body.reason ?? "Payout failed",
    );
    sendSuccess(res, "Withdrawal marked failed", { request });
  } catch (err) {
    next(err);
  }
};
