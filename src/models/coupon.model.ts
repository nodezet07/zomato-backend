import mongoose, { Schema, Document, Model } from "mongoose";
import { CouponDiscountType, CouponStatus } from "../types/enums.js";

export interface ICouponDocument extends Document {
  couponCode: string;
  title: string;
  description?: string;
  discountType: CouponDiscountType;
  discountValue: number;
  minimumOrderAmount: number;
  maximumDiscount?: number;
  usageLimit: number;
  usedCount: number;
  validFrom: Date;
  validTo: Date;
  applicableRestaurants: mongoose.Types.ObjectId[];
  status: CouponStatus;
  createdAt: Date;
}

const couponSchema = new Schema<ICouponDocument>(
  {
    couponCode: { type: String, required: true, unique: true, uppercase: true },
    title: { type: String, required: true },
    description: String,
    discountType: {
      type: String,
      enum: Object.values(CouponDiscountType),
      required: true,
    },
    discountValue: { type: Number, required: true, min: 0 },
    minimumOrderAmount: { type: Number, default: 0 },
    maximumDiscount: Number,
    usageLimit: { type: Number, default: 100 },
    usedCount: { type: Number, default: 0 },
    validFrom: { type: Date, required: true },
    validTo: { type: Date, required: true },
    applicableRestaurants: [{ type: Schema.Types.ObjectId, ref: "Restaurant" }],
    status: {
      type: String,
      enum: Object.values(CouponStatus),
      default: CouponStatus.ACTIVE,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "coupons" },
);

couponSchema.index({ status: 1, validFrom: 1, validTo: 1 });

const Coupon: Model<ICouponDocument> = mongoose.model<ICouponDocument>(
  "Coupon",
  couponSchema,
);

export default Coupon;
