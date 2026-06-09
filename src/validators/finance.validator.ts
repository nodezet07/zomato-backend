import { z } from "zod";
import {
  RestaurantSettlementStatus,
  RiderPayoutStatus,
  SettlementCycle,
} from "../types/enums.js";

export const createRestaurantSettlementSchema = z.object({
  orderIds: z.array(z.string().min(1)).optional(),
  periodStart: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional(),
  periodEnd: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional(),
  notes: z.string().max(500).optional(),
});

export const markSettlementPaidSchema = z.object({
  paymentReference: z.string().min(2).max(200),
  notes: z.string().max(500).optional(),
});

export const createRiderPayoutSchema = z.object({
  orderIds: z.array(z.string().min(1)).optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  deductions: z.number().min(0).optional(),
  notes: z.string().max(500).optional(),
  cycle: z.nativeEnum(SettlementCycle).optional(),
});

export const markRiderPayoutPaidSchema = markSettlementPaidSchema;

export const financeListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z
    .union([
      z.nativeEnum(RestaurantSettlementStatus),
      z.nativeEnum(RiderPayoutStatus),
    ])
    .optional(),
});
