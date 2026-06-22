import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICityZoneDocument extends Document {
  cityCode: string;
  cityName: string;
  state?: string;
  country: string;
  currency: string;
  timezone: string;
  isActive: boolean;
  zones: {
    zoneCode: string;
    zoneName: string;
    center?: { type: string; coordinates: number[] };
    radiusKm?: number;
    isActive: boolean;
  }[];
}

const zoneSchema = new Schema(
  {
    zoneCode: { type: String, required: true },
    zoneName: { type: String, required: true },
    center: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: undefined },
    },
    radiusKm: Number,
    isActive: { type: Boolean, default: true },
  },
  { _id: true },
);

const cityZoneSchema = new Schema<ICityZoneDocument>(
  {
    cityCode: { type: String, required: true, unique: true, uppercase: true },
    cityName: { type: String, required: true },
    state: String,
    country: { type: String, default: "IN" },
    currency: { type: String, default: "INR" },
    timezone: { type: String, default: "Asia/Kolkata" },
    isActive: { type: Boolean, default: true },
    zones: { type: [zoneSchema], default: [] },
  },
  { timestamps: true, collection: "city_zones" },
);

cityZoneSchema.index({ "zones.center": "2dsphere" });

const CityZone: Model<ICityZoneDocument> = mongoose.model<ICityZoneDocument>(
  "CityZone",
  cityZoneSchema,
);

export default CityZone;
