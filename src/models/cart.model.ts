import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { cartItemSchema } from "./schemas/common.schemas.js";

export interface ICartItem {
  _id?: Types.ObjectId;
  menuItemId: Types.ObjectId;
  itemName: string;
  quantity: number;
  price: number;
  addons?: { name: string; price: number }[];
  specialInstructions?: string;
  total: number;
}

export interface ICartDocument extends Document {
  userId: mongoose.Types.ObjectId;
  restaurantId: mongoose.Types.ObjectId;
  items: Types.DocumentArray<ICartItem & Document>;
  subtotal: number;
  taxAmount: number;
  deliveryFee: number;
  platformFee: number;
  couponDiscount: number;
  grandTotal: number;
  appliedCouponId?: mongoose.Types.ObjectId;
  generalNote?: string;
  dontSendCutlery: boolean;
  isVipMode: boolean;
  goldDiscount: number;
}

const cartSchema = new Schema<ICartDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    items: [cartItemSchema],
    subtotal: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    deliveryFee: { type: Number, default: 0 },
    platformFee: { type: Number, default: 0 },
    couponDiscount: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    appliedCouponId: { type: Schema.Types.ObjectId, ref: "Coupon" },
    generalNote: { type: String, default: "" },
    dontSendCutlery: { type: Boolean, default: false },
    isVipMode: { type: Boolean, default: false },
    goldDiscount: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "carts" },
);

cartSchema.index({ restaurantId: 1 });

const Cart: Model<ICartDocument> = mongoose.model<ICartDocument>("Cart", cartSchema);

export default Cart;
