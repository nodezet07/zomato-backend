import { z } from "zod";
import { OrderSource, OrderStatus, PaymentMethod } from "../types/enums.js";

export const createOrderSchema = z.object({
  deliveryAddressId: z.string().min(1),
  paymentMethod: z.nativeEnum(PaymentMethod),
  couponId: z.string().optional(),
  deliveryInstructions: z.string().max(300).optional(),
  orderSource: z.nativeEnum(OrderSource).optional(),
  useWallet: z.boolean().optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
  cancellationReason: z.string().max(500).optional(),
  /** Restaurant-set prep wait time in minutes when accepting (PENDING → CONFIRMED) */
  estimatedPreparationTime: z.coerce.number().int().min(5).max(180).optional(),
});

export const cancelOrderSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const assignRiderSchema = z.object({
  riderId: z.string().optional(),
});

export const verifyDeliveryOtpSchema = z.object({
  orderId: z.string().min(1),
  otp: z.string().length(4),
});

export const refundRequestSchema = z.object({
  orderId: z.string().min(1),
  description: z.string().min(10).max(1000),
});
