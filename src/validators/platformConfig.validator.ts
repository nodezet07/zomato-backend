import { z } from "zod";
import { SettlementCycle } from "../types/enums.js";

export const updatePlatformPolicySchema = z.object({
  defaultRestaurantCommissionPercent: z.number().min(0).max(100).optional(),
  defaultPlatformFeePercent: z.number().min(0).max(100).optional(),
  maxPlatformFee: z.number().min(0).optional(),
  defaultDeliveryFee: z.number().min(0).optional(),
  settlementCycle: z.nativeEnum(SettlementCycle).optional(),
  restaurantReserveHoldDays: z.number().min(0).optional(),
  riderMinWithdrawalAmount: z.number().min(0).optional(),
  riderBaseFare: z.number().min(0).optional(),
  riderPerKmRate: z.number().min(0).optional(),
  riderSurgeMultiplier: z.number().min(1).optional(),
  deliveryFeeSlabs: z
    .array(z.object({ maxKm: z.number(), fee: z.number() }))
    .optional(),
  cancellationRules: z
    .array(
      z.object({
        stage: z.string(),
        responsibleParty: z.string(),
        chargeType: z.enum(["NONE", "FIXED", "PERCENT"]),
        chargeValue: z.number(),
        description: z.string(),
      }),
    )
    .optional(),
});

export const createCitySchema = z.object({
  cityCode: z.string().min(2).max(10),
  cityName: z.string().min(2),
  state: z.string().optional(),
  country: z.string().optional(),
  currency: z.string().optional(),
  timezone: z.string().optional(),
  zones: z
    .array(
      z.object({
        zoneCode: z.string(),
        zoneName: z.string(),
        radiusKm: z.number().optional(),
      }),
    )
    .optional(),
});

export const updateCitySchema = z.object({
  cityName: z.string().optional(),
  state: z.string().optional(),
  isActive: z.boolean().optional(),
  zones: z.array(z.record(z.string(), z.unknown())).optional(),
});

export const updateCommissionSchema = z.object({
  commissionPercent: z.number().min(0).max(100),
  settlementCycle: z.nativeEnum(SettlementCycle).optional(),
});

export const withdrawalActionSchema = z.object({
  note: z.string().max(500).optional(),
  reason: z.string().max(500).optional(),
  paymentReference: z.string().max(200).optional(),
});

export const createWithdrawalSchema = z.object({
  amount: z.number().positive(),
});
