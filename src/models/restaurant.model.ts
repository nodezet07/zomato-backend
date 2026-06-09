import mongoose, { Schema, Document, Model } from "mongoose";
import { RestaurantStatus } from "../types/enums.js";
import {
  geoPointSchema,
  restaurantAddressSchema,
  bankDetailsSchema,
} from "./schemas/common.schemas.js";

export interface IRestaurantDocument extends Document {
  ownerId: mongoose.Types.ObjectId;
  restaurantName: string;
  slug: string;
  description?: string;
  logo?: string;
  bannerImages: string[];
  phone?: string;
  email?: string;
  cuisines: string[];
  tags: string[];
  address: Record<string, unknown>;
  location: { type: string; coordinates: number[] };
  latitude: number;
  longitude: number;
  deliveryRadiusKm: number;
  averageDeliveryTime: number;
  minimumOrderAmount: number;
  packagingCharge: number;
  platformCommissionPercentage: number;
  gstNumber?: string;
  fssaiLicense?: string;
  openingTime?: string;
  closingTime?: string;
  weeklyHours?: Array<{
    day: string;
    open?: string;
    close?: string;
    isClosed?: boolean;
  }>;
  isOpen: boolean;
  supportsCOD: boolean;
  supportsOnlinePayment: boolean;
  restaurantStatus: RestaurantStatus;
  averageRating: number;
  totalRatings: number;
  totalOrders: number;
  isDeleted: boolean;
  bankAccountDetails?: {
    accountHolderName?: string;
    accountNumber?: string;
    ifscCode?: string;
  };
}

const restaurantSchema = new Schema<IRestaurantDocument>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    restaurantName: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: String,
    logo: String,
    bannerImages: [String],
    phone: String,
    email: String,
    cuisines: [String],
    tags: [String],
    address: { type: restaurantAddressSchema, default: {} },
    location: { type: geoPointSchema, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    deliveryRadiusKm: { type: Number, default: 5 },
    averageDeliveryTime: { type: Number, default: 30 },
    minimumOrderAmount: { type: Number, default: 0 },
    packagingCharge: { type: Number, default: 0 },
    platformCommissionPercentage: { type: Number, default: 15 },
    gstNumber: String,
    fssaiLicense: String,
    openingTime: String,
    closingTime: String,
    weeklyHours: [
      {
        day: { type: String, trim: true },
        open: String,
        close: String,
        isClosed: { type: Boolean, default: false },
      },
    ],
    isOpen: { type: Boolean, default: false },
    supportsCOD: { type: Boolean, default: true },
    supportsOnlinePayment: { type: Boolean, default: true },
    restaurantStatus: {
      type: String,
      enum: Object.values(RestaurantStatus),
      default: RestaurantStatus.PENDING,
    },
    averageRating: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 },
    totalOrders: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false },
    bankAccountDetails: { type: bankDetailsSchema, default: undefined },
  },
  { timestamps: true, collection: "restaurants" },
);

restaurantSchema.index({ location: "2dsphere" });
restaurantSchema.index({ ownerId: 1 });
restaurantSchema.index({ restaurantStatus: 1, isOpen: 1 });
restaurantSchema.index({ slug: 1 });
restaurantSchema.index({ averageRating: -1 });

const Restaurant: Model<IRestaurantDocument> = mongoose.model<IRestaurantDocument>(
  "Restaurant",
  restaurantSchema,
);

export default Restaurant;
