import { z } from "zod";

export const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const rejectReasonSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const adminCancelOrderSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const approveRefundSchema = z.object({
  amount: z.number().positive().optional(),
  reason: z.string().max(500).optional(),
  resolution: z.string().max(1000).optional(),
});

export const rejectRefundSchema = z.object({
  reason: z.string().min(3).max(500),
  resolution: z.string().max(1000).optional(),
});
