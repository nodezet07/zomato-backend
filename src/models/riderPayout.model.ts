import mongoose, { Schema, Document, Model } from "mongoose";
import { RiderPayoutStatus, SettlementCycle } from "../types/enums.js";
import { bankDetailsSchema } from "./schemas/common.schemas.js";

export interface IRiderPayoutDocument extends Document {
  payoutNumber: string;
  riderId: mongoose.Types.ObjectId;
  orderIds: mongoose.Types.ObjectId[];
  deliveryCount: number;
  grossEarnings: number;
  deductions: number;
  netPayable: number;
  status: RiderPayoutStatus;
  cycle: SettlementCycle;
  periodStart?: Date;
  periodEnd?: Date;
  bankSnapshot?: {
    accountHolderName?: string;
    accountNumber?: string;
    ifscCode?: string;
  };
  paymentReference?: string;
  notes?: string;
  paidAt?: Date;
  paidByAdminId?: mongoose.Types.ObjectId;
  createdByAdminId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const riderPayoutSchema = new Schema<IRiderPayoutDocument>(
  {
    payoutNumber: { type: String, required: true, unique: true },
    riderId: { type: Schema.Types.ObjectId, ref: "Rider", required: true },
    orderIds: [{ type: Schema.Types.ObjectId, ref: "Order" }],
    deliveryCount: { type: Number, default: 0 },
    grossEarnings: { type: Number, default: 0 },
    deductions: { type: Number, default: 0 },
    netPayable: { type: Number, default: 0 },
    status: {
      type: String,
      enum: Object.values(RiderPayoutStatus),
      default: RiderPayoutStatus.PENDING,
    },
    cycle: {
      type: String,
      enum: Object.values(SettlementCycle),
      default: SettlementCycle.WEEKLY,
    },
    periodStart: Date,
    periodEnd: Date,
    bankSnapshot: { type: bankDetailsSchema, default: undefined },
    paymentReference: String,
    notes: String,
    paidAt: Date,
    paidByAdminId: { type: Schema.Types.ObjectId, ref: "AdminUser" },
    createdByAdminId: { type: Schema.Types.ObjectId, ref: "AdminUser" },
  },
  { timestamps: true, collection: "rider_payouts" },
);

riderPayoutSchema.index({ riderId: 1, createdAt: -1 });
riderPayoutSchema.index({ status: 1, createdAt: -1 });

const RiderPayout: Model<IRiderPayoutDocument> = mongoose.model<IRiderPayoutDocument>(
  "RiderPayout",
  riderPayoutSchema,
);

export default RiderPayout;
