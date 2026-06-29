import mongoose, { Schema, Document, Model } from "mongoose";
import {
  PaymentGateway,
  GatewayPaymentMethod,
  PaymentStatus,
} from "../types/enums.js";

export interface IPaymentDocument extends Document {
  orderId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  gateway: PaymentGateway;
  transactionId?: string;
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  amount: number;
  currency: string;
  paymentMethod: GatewayPaymentMethod;
  paymentStatus: PaymentStatus;
  gatewayResponse?: Record<string, unknown>;
  webhookPayload?: Record<string, unknown>;
  refundAmount: number;
  refundReason?: string;
  refundedAt?: Date;
  retryCount: number;
  fraudScore: number;
  paidAt?: Date;
  createdAt: Date;
}

const paymentSchema = new Schema<IPaymentDocument>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    gateway: { type: String, enum: Object.values(PaymentGateway), required: true },
    transactionId: String,
    gatewayOrderId: String,
    gatewayPaymentId: String,
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },
    paymentMethod: {
      type: String,
      enum: Object.values(GatewayPaymentMethod),
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.PENDING,
    },
    gatewayResponse: { type: Schema.Types.Mixed },
    webhookPayload: { type: Schema.Types.Mixed },
    refundAmount: { type: Number, default: 0 },
    refundReason: String,
    refundedAt: Date,
    retryCount: { type: Number, default: 0 },
    fraudScore: { type: Number, default: 0 },
    paidAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "payments" },
);

paymentSchema.index({ orderId: 1 });
paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ gatewayPaymentId: 1 }, { sparse: true });
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ paymentStatus: 1, createdAt: -1 });

const Payment: Model<IPaymentDocument> = mongoose.model<IPaymentDocument>(
  "Payment",
  paymentSchema,
);

export default Payment;
