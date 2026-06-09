import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../types/auth.types.js";
import { sendSuccess } from "../utils/apiResponse.js";
import {
  createPaymentOrder,
  verifyPayment,
  handlePaymentWebhook,
  getPaymentById,
  devConfirmPaymentOrder,
} from "../services/payment.service.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { enqueueRefundJob } from "../queues/refund.queue.js";
import { buildAuditContext, writeAuditLog } from "../services/audit.service.js";

// POST /payments/create-order
export const createOrderPayment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await createPaymentOrder(req.userId!, req.body.orderId);
    sendSuccess(res, "Payment order created", {
      paymentId: result.payment._id,
      orderId: result.order._id,
      amount: result.payment.amount,
      currency: result.payment.currency,
      keyId: result.keyId,
      razorpayOrderId: result.razorpay?.id ?? null,
      razorpayAmount: result.razorpay?.amount ?? 0,
      autoConfirmed: result.autoConfirmed,
    });
  } catch (err) {
    next(err);
  }
};

// POST /payments/verify
export const verifyOrderPayment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await verifyPayment(req.userId!, req.body);
    sendSuccess(res, result.alreadyVerified ? "Payment already verified" : "Payment verified", {
      payment: result.payment,
      order: result.order,
    });
  } catch (err) {
    next(err);
  }
};

// POST /payments/webhook — mounted with raw body in app.ts
export const paymentWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const rawBody = req.body as Buffer;
    const signature = req.headers["x-razorpay-signature"] as string | undefined;
    const result = await handlePaymentWebhook(rawBody, signature);
    sendSuccess(res, "Webhook received", result);
  } catch (err) {
    next(err);
  }
};

// GET /payments/:paymentId
export const getPayment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const paymentId = Array.isArray(req.params.paymentId)
      ? req.params.paymentId[0]
      : req.params.paymentId;
    const payment = await getPaymentById(req.userId!, paymentId);
    sendSuccess(res, "Payment fetched", { payment });
  } catch (err) {
    next(err);
  }
};

// POST /payments/refund
export const refundPayment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { paymentId, amount, reason } = req.body;
    const result = await enqueueRefundJob({
      userId: req.userId!,
      paymentId,
      reason,
      amount,
    });
    await writeAuditLog(buildAuditContext(req), {
      module: "payment",
      action: "refund_requested",
      entityId: paymentId,
      newData: { amount, reason, queued: result.queued },
    });
    sendSuccess(
      res,
      result.queued ? "Refund queued for processing" : "Refund processed",
      result,
    );
  } catch (err) {
    next(err);
  }
};

// POST /payments/dev-confirm — development only
export const devConfirmPayment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (env.NODE_ENV === "production") {
      throw new AppError("Not available", 404);
    }
    const result = await devConfirmPaymentOrder(req.userId!, req.body.orderId);
    sendSuccess(res, "Payment confirmed (development)", result);
  } catch (err) {
    next(err);
  }
};

// POST /payments/wallet/add-money — Phase 9 stub
export const walletAddMoneyStub = async (
  _req: AuthRequest,
  res: Response,
): Promise<void> => {
  res.status(501).json({
    success: false,
    message:
      "Wallet is disabled in V1. Use COD or ONLINE for customer payments.",
  });
};
