import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/auth.types.js";
import User from "../models/user.model.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { AppError } from "../utils/AppError.js";
import { uploadImageBuffer, isCloudinaryEnabled } from "../config/cloudinary.js";
import { getPagination, paginationMeta } from "../helpers/pagination.js";
import {
  registerRider,
  riderLogin,
  getRiderByUserId,
  getRiderMe,
  updateRiderProfile,
  updateRiderStatus,
  updateRiderLocation,
  listAvailableOrders,
  acceptOrder,
  rejectOrder,
  pickupOrder,
  startDelivery,
  completeDelivery,
  getRiderEarnings,
  getRiderDeliveryHistory,
  approveRiderDev,
} from "../services/rider.service.js";
import {
  createRiderWithdrawalRequest,
  listRiderWithdrawalsForRider,
} from "../services/platformConfig.service.js";

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

// POST /riders/register
export const register = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    let payload = req.body;
    if (req.userId) {
      const user = await User.findById(req.userId);
      if (!user || user.isDeleted) {
        throw new AppError("User not found", 404);
      }
      payload = {
        fullName: user.fullName ?? "Rider",
        email: user.email!,
        password: "not-used",
        ...req.body,
      };
    }
    const { user, rider } = await registerRider(payload, req.userId);
    sendSuccess(
      res,
      "Rider registered successfully",
      { user: user.getPublicProfile(), rider },
      201,
    );
  } catch (err) {
    next(err);
  }
};

// POST /riders/login
export const login = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { statusCode, body } = await riderLogin(
      req.body.email,
      req.body.password,
      res,
    );
    res.status(statusCode).json(body);
  } catch (err) {
    next(err);
  }
};

// GET /riders/me
export const getProfile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await getRiderMe(req.userId!);
    sendSuccess(res, "Rider profile fetched", data);
  } catch (err) {
    next(err);
  }
};

// PATCH /riders/profile
export const updateProfile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await updateRiderProfile(req.userId!, req.body);
    sendSuccess(res, "Rider profile updated", data);
  } catch (err) {
    next(err);
  }
};

// PATCH /riders/status
export const updateStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const rider = await updateRiderStatus(req.userId!, req.body);
    sendSuccess(res, "Rider status updated", { rider });
  } catch (err) {
    next(err);
  }
};

// PATCH /riders/location
export const updateLocation = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { latitude, longitude, speed, heading } = req.body;
    const rider = await updateRiderLocation(
      req.userId!,
      latitude,
      longitude,
      speed,
      heading,
    );
    sendSuccess(res, "Location updated", { rider });
  } catch (err) {
    next(err);
  }
};

// GET /riders/available-orders
export const getAvailableOrders = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    await getRiderByUserId(req.userId!);
    const orders = await listAvailableOrders();
    sendSuccess(res, "Available orders fetched", { orders });
  } catch (err) {
    next(err);
  }
};

// PATCH /riders/accept-order/:orderId
export const acceptOrderHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const orderId = paramId(req.params.orderId);
    const order = await acceptOrder(req.userId!, orderId);
    sendSuccess(res, "Order accepted", { order });
  } catch (err) {
    next(err);
  }
};

// PATCH /riders/reject-order/:orderId
export const rejectOrderHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const orderId = paramId(req.params.orderId);
    const order = await rejectOrder(req.userId!, orderId, req.body.reason);
    sendSuccess(res, "Order rejected", { order });
  } catch (err) {
    next(err);
  }
};

// PATCH /riders/pickup-order/:orderId
export const pickupOrderHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const orderId = paramId(req.params.orderId);
    const order = await pickupOrder(req.userId!, orderId);
    sendSuccess(res, "Order picked up from restaurant", { order });
  } catch (err) {
    next(err);
  }
};

// PATCH /riders/start-delivery/:orderId
export const startDeliveryHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const orderId = paramId(req.params.orderId);
    const order = await startDelivery(req.userId!, orderId);
    sendSuccess(res, "Out for delivery", { order });
  } catch (err) {
    next(err);
  }
};

// PATCH /riders/complete-delivery/:orderId
export const completeDeliveryHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const orderId = paramId(req.params.orderId);
    const order = await completeDelivery(req.userId!, orderId);
    sendSuccess(res, "Delivery completed", { order });
  } catch (err) {
    next(err);
  }
};

// GET /riders/earnings
export const getEarnings = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const earnings = await getRiderEarnings(req.userId!);
    sendSuccess(res, "Rider earnings fetched", { earnings });
  } catch (err) {
    next(err);
  }
};

// GET /riders/history
export const getHistory = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { page, limit, skip } = getPagination(
      req.query.page as string | undefined,
      req.query.limit as string | undefined,
    );
    const { orders, total } = await getRiderDeliveryHistory(
      req.userId!,
      page,
      limit,
      skip,
    );
    sendSuccess(res, "Delivery history fetched", {
      orders,
      pagination: paginationMeta(total, page, limit),
    });
  } catch (err) {
    next(err);
  }
};

// POST /riders/upload-document — multipart image → Cloudinary URL
export const uploadDocument = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!isCloudinaryEnabled()) {
      throw new AppError("File upload is not configured on the server", 503);
    }

    const file = req.file;
    const docType = String(req.body?.type ?? "profileImage");
    const allowed = ["profileImage", "drivingLicense", "aadhaarCard"] as const;
    if (!allowed.includes(docType as (typeof allowed)[number])) {
      throw new AppError("Invalid document type", 400);
    }
    if (!file?.buffer) {
      throw new AppError("No image file uploaded", 400);
    }

    const url = await uploadImageBuffer(
      file.buffer,
      `rider-kyc/${req.userId}`,
      file.mimetype,
    );
    if (!url) {
      throw new AppError("Failed to upload image", 500);
    }

    sendSuccess(res, "Document uploaded", { url, type: docType });
  } catch (err) {
    next(err);
  }
};

// PATCH /riders/:riderId/approve-dev
export const approveDev = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const riderId = paramId(req.params.riderId);
    const rider = await approveRiderDev(riderId);
    sendSuccess(res, "Rider approved (dev)", { rider });
  } catch (err) {
    next(err);
  }
};

// POST /riders/withdrawals
export const requestWithdrawal = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const request = await createRiderWithdrawalRequest(req.userId!, req.body.amount);
    sendSuccess(res, "Withdrawal request submitted", { request }, 201);
  } catch (err) {
    next(err);
  }
};

// GET /riders/withdrawals
export const getWithdrawals = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const data = await listRiderWithdrawalsForRider(req.userId!, page, limit);
    sendSuccess(res, "Withdrawal requests fetched", data);
  } catch (err) {
    next(err);
  }
};
