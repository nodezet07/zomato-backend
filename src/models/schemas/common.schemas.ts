import { Schema } from "mongoose";
import { DevicePlatform } from "../../types/enums.js";

export const addressSchema = new Schema(
  {
    label: { type: String, required: true, trim: true },
    fullAddress: { type: String, required: true, trim: true },
    street: String,
    city: String,
    state: String,
    country: { type: String, default: "India" },
    pincode: String,
    latitude: Number,
    longitude: Number,
    landmark: String,
    isDefault: { type: Boolean, default: false },
  },
  { _id: true },
);

export const deviceTokenSchema = new Schema(
  {
    token: { type: String, required: true },
    platform: {
      type: String,
      enum: Object.values(DevicePlatform),
      required: true,
    },
  },
  { _id: false },
);

export const addonSchema = new Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    isAvailable: { type: Boolean, default: true },
  },
  { _id: false },
);

export const cartAddonSchema = new Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

export const cartItemSchema = new Schema(
  {
    menuItemId: { type: Schema.Types.ObjectId, ref: "MenuItem", required: true },
    itemName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    addons: [cartAddonSchema],
    specialInstructions: String,
    total: { type: Number, required: true, min: 0 },
  },
  { _id: true },
);

export const orderItemSchema = new Schema(
  {
    menuItemId: { type: Schema.Types.ObjectId, ref: "MenuItem", required: true },
    itemName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    addons: [cartAddonSchema],
    specialInstructions: String,
    total: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

export const ticketReplySchema = new Schema(
  {
    authorId: { type: Schema.Types.ObjectId, required: true },
    authorRole: {
      type: String,
      enum: ["customer", "admin"],
      required: true,
    },
    message: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

export const timelineLogSchema = new Schema(
  {
    status: { type: String, required: true },
    updatedBy: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false },
);

export const geoPointSchema = new Schema(
  {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (v: number[]) => v.length === 2,
        message: "Coordinates must be [longitude, latitude]",
      },
    },
  },
  { _id: false },
);

export const restaurantAddressSchema = new Schema(
  {
    street: String,
    city: String,
    state: String,
    country: { type: String, default: "India" },
    pincode: String,
  },
  { _id: false },
);

export const bankDetailsSchema = new Schema(
  {
    accountHolderName: String,
    accountNumber: String,
    ifscCode: String,
  },
  { _id: false },
);

export const nutritionalInfoSchema = new Schema(
  {
    calories: Number,
    protein: Number,
    fat: Number,
    carbs: Number,
  },
  { _id: false },
);

/** Snapshot recorded when order reaches DELIVERED (V1 finance module) */
export const orderSettlementSchema = new Schema(
  {
    recordedAt: { type: Date },
    commissionRate: { type: Number, default: 0 },
    commissionAmount: { type: Number, default: 0 },
    restaurantGrossAmount: { type: Number, default: 0 },
    restaurantNetPayable: { type: Number, default: 0 },
    riderEarningAmount: { type: Number, default: 0 },
    platformCustomerFee: { type: Number, default: 0 },
    deliveryFeeCollected: { type: Number, default: 0 },
    restaurantSettlementStatus: {
      type: String,
      enum: ["PENDING", "SETTLED", "PAID"],
      default: "PENDING",
    },
    riderPayoutStatus: {
      type: String,
      enum: ["PENDING", "PAID"],
      default: "PENDING",
    },
    restaurantSettlementId: { type: Schema.Types.ObjectId, ref: "RestaurantSettlement" },
    riderPayoutId: { type: Schema.Types.ObjectId, ref: "RiderPayout" },
    riderEarningCredited: { type: Boolean, default: false },
  },
  { _id: false },
);
