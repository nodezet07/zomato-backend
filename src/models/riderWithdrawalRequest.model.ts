import mongoose, { Schema, Document, Model } from "mongoose";

export enum WithdrawalStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  PROCESSING = "PROCESSING",
  PAID = "PAID",
  FAILED = "FAILED",
  REJECTED = "REJECTED",
}

export interface IRiderWithdrawalRequestDocument extends Document {
  requestNumber: string;
  riderId: mongoose.Types.ObjectId;
  amount: number;
  status: WithdrawalStatus;
  bankAccountDetails?: Record<string, string>;
  adminNote?: string;
  paymentReference?: string;
  failureReason?: string;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  paidAt?: Date;
}

const riderWithdrawalSchema = new Schema<IRiderWithdrawalRequestDocument>(
  {
    requestNumber: { type: String, required: true, unique: true },
    riderId: { type: Schema.Types.ObjectId, ref: "Rider", required: true },
    amount: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: Object.values(WithdrawalStatus),
      default: WithdrawalStatus.PENDING,
    },
    bankAccountDetails: Schema.Types.Mixed,
    adminNote: String,
    paymentReference: String,
    failureReason: String,
    approvedBy: { type: Schema.Types.ObjectId, ref: "AdminUser" },
    approvedAt: Date,
    paidAt: Date,
  },
  { timestamps: true, collection: "rider_withdrawal_requests" },
);

riderWithdrawalSchema.index({ riderId: 1, status: 1 });
riderWithdrawalSchema.index({ status: 1, createdAt: -1 });

const RiderWithdrawalRequest: Model<IRiderWithdrawalRequestDocument> =
  mongoose.model<IRiderWithdrawalRequestDocument>(
    "RiderWithdrawalRequest",
    riderWithdrawalSchema,
  );

export default RiderWithdrawalRequest;
