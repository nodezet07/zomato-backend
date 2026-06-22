import mongoose, { Schema, Document, Model, Types } from "mongoose";
import {
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "../types/enums.js";
import {
  orderItemSchema,
  timelineLogSchema,
  orderSettlementSchema,
} from "./schemas/common.schemas.js";

export interface IOrderSettlement {
  recordedAt?: Date;
  commissionRate: number;
  commissionAmount: number;
  restaurantGrossAmount: number;
  restaurantNetPayable: number;
  riderEarningAmount: number;
  platformCustomerFee: number;
  deliveryFeeCollected: number;
  restaurantSettlementStatus: "PENDING" | "SETTLED" | "PAID";
  riderPayoutStatus: "PENDING" | "PAID";
  restaurantSettlementId?: mongoose.Types.ObjectId;
  riderPayoutId?: mongoose.Types.ObjectId;
  riderEarningCredited?: boolean;
}

export interface IOrderItem {
  menuItemId: Types.ObjectId;
  itemName: string;
  quantity: number;
  price: number;
  addons?: { name: string; price: number }[];
  specialInstructions?: string;
  total: number;
}

export interface IOrderDocument extends Document {
  orderNumber: string;
  customerId: mongoose.Types.ObjectId;
  restaurantId: mongoose.Types.ObjectId;
  riderId?: mongoose.Types.ObjectId;
  paymentId?: mongoose.Types.ObjectId;
  appliedCouponId?: mongoose.Types.ObjectId;
  orderSource: OrderSource;
  orderItems: Types.DocumentArray<IOrderItem & Document>;
  subtotal: number;
  taxAmount: number;
  deliveryFee: number;
  platformFee: number;
  packagingCharge: number;
  surgeFee: number;
  couponDiscount: number;
  walletDeduction: number;
  grandTotal: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  customerAddress: {
    fullAddress: string;
    latitude: number;
    longitude: number;
  };
  riderLocation?: { latitude: number; longitude: number };
  estimatedPreparationTime?: number;
  estimatedDeliveryTime?: Date;
  acceptedAt?: Date;
  preparedAt?: Date;
  pickedUpAt?: Date;
  deliveredAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  refundAmount: number;
  deliveryOtp?: string;
  deliveryInstructions?: string;
  timelineLogs: Array<{ status: string; updatedBy: string; timestamp: Date }>;
  fraudFlags: string[];
  settlement?: IOrderSettlement;
}

const orderSchema = new Schema<IOrderDocument>(
  {
    orderNumber: { type: String, required: true, unique: true },
    customerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    riderId: { type: Schema.Types.ObjectId, ref: "Rider" },
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment" },
    appliedCouponId: { type: Schema.Types.ObjectId, ref: "Coupon" },
    orderSource: {
      type: String,
      enum: Object.values(OrderSource),
      default: OrderSource.APP,
    },
    orderItems: [orderItemSchema],
    subtotal: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    deliveryFee: { type: Number, default: 0 },
    platformFee: { type: Number, default: 0 },
    packagingCharge: { type: Number, default: 0 },
    surgeFee: { type: Number, default: 0 },
    couponDiscount: { type: Number, default: 0 },
    walletDeduction: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    paymentMethod: {
      type: String,
      enum: Object.values(PaymentMethod),
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.PENDING,
    },
    orderStatus: {
      type: String,
      enum: Object.values(OrderStatus),
      default: OrderStatus.PENDING,
    },
    customerAddress: {
      fullAddress: { type: String, required: true },
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
    },
    riderLocation: {
      latitude: Number,
      longitude: Number,
    },
    estimatedPreparationTime: Number,
    estimatedDeliveryTime: Date,
    acceptedAt: Date,
    preparedAt: Date,
    pickedUpAt: Date,
    deliveredAt: Date,
    cancelledAt: Date,
    cancellationReason: String,
    refundAmount: { type: Number, default: 0 },
    deliveryOtp: String,
    deliveryInstructions: String,
    timelineLogs: [timelineLogSchema],
    fraudFlags: [String],
    settlement: { type: orderSettlementSchema, default: undefined },
  },
  { timestamps: true, collection: "orders" },
);

orderSchema.index({ customerId: 1, createdAt: -1 });
orderSchema.index({ restaurantId: 1, orderStatus: 1 });
orderSchema.index({ riderId: 1, orderStatus: 1 });

const Order: Model<IOrderDocument> = mongoose.model<IOrderDocument>("Order", orderSchema);

export default Order;
