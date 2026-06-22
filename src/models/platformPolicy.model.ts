import mongoose, { Schema, Document, Model } from "mongoose";
import { SettlementCycle } from "../types/enums.js";

export interface IPlatformPolicyDocument extends Document {
  key: string;
  defaultRestaurantCommissionPercent: number;
  defaultPlatformFeePercent: number;
  maxPlatformFee: number;
  defaultDeliveryFee: number;
  settlementCycle: SettlementCycle;
  restaurantReserveHoldDays: number;
  riderMinWithdrawalAmount: number;
  riderBaseFare: number;
  riderPerKmRate: number;
  riderSurgeMultiplier: number;
  deliveryFeeSlabs: {
    maxKm: number;
    fee: number;
  }[];
  cancellationRules: {
    stage: string;
    responsibleParty: string;
    chargeType: "NONE" | "FIXED" | "PERCENT";
    chargeValue: number;
    description: string;
  }[];
  updatedBy?: mongoose.Types.ObjectId;
}

const platformPolicySchema = new Schema<IPlatformPolicyDocument>(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    defaultRestaurantCommissionPercent: { type: Number, default: 15 },
    defaultPlatformFeePercent: { type: Number, default: 5 },
    maxPlatformFee: { type: Number, default: 25 },
    defaultDeliveryFee: { type: Number, default: 40 },
    settlementCycle: {
      type: String,
      enum: Object.values(SettlementCycle),
      default: SettlementCycle.WEEKLY,
    },
    restaurantReserveHoldDays: { type: Number, default: 7 },
    riderMinWithdrawalAmount: { type: Number, default: 100 },
    riderBaseFare: { type: Number, default: 25 },
    riderPerKmRate: { type: Number, default: 8 },
    riderSurgeMultiplier: { type: Number, default: 1 },
    deliveryFeeSlabs: {
      type: [
        {
          maxKm: Number,
          fee: Number,
        },
      ],
      default: [
        { maxKm: 3, fee: 30 },
        { maxKm: 6, fee: 45 },
        { maxKm: 10, fee: 60 },
      ],
    },
    cancellationRules: {
      type: [
        {
          stage: String,
          responsibleParty: String,
          chargeType: { type: String, enum: ["NONE", "FIXED", "PERCENT"] },
          chargeValue: Number,
          description: String,
        },
      ],
      default: [
        {
          stage: "BEFORE_ACCEPT",
          responsibleParty: "CUSTOMER",
          chargeType: "NONE",
          chargeValue: 0,
          description: "Free cancellation before restaurant accepts",
        },
        {
          stage: "AFTER_ACCEPT_BEFORE_PREP",
          responsibleParty: "CUSTOMER",
          chargeType: "FIXED",
          chargeValue: 25,
          description: "Small fee after accept, before preparation",
        },
        {
          stage: "AFTER_PREP",
          responsibleParty: "CUSTOMER",
          chargeType: "PERCENT",
          chargeValue: 100,
          description: "Full/partial order cost after preparation starts",
        },
        {
          stage: "RESTAURANT_CANCEL",
          responsibleParty: "RESTAURANT",
          chargeType: "FIXED",
          chargeValue: 50,
          description: "Restaurant penalty; customer full refund",
        },
      ],
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: "AdminUser" },
  },
  { timestamps: true, collection: "platform_policies" },
);

const PlatformPolicy: Model<IPlatformPolicyDocument> =
  mongoose.model<IPlatformPolicyDocument>("PlatformPolicy", platformPolicySchema);

export default PlatformPolicy;
