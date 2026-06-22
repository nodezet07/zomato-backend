import mongoose, { Schema, Document, Model } from "mongoose";

export interface IBannerDocument extends Document {
  title: string;
  imageUrl: string;
  linkUrl?: string;
  placement: string;
  priority: number;
  isActive: boolean;
  startsAt?: Date;
  endsAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const bannerSchema = new Schema<IBannerDocument>(
  {
    title: { type: String, required: true },
    imageUrl: { type: String, required: true },
    linkUrl: String,
    placement: { type: String, default: "HOME", index: true },
    priority: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    startsAt: Date,
    endsAt: Date,
  },
  { timestamps: true, collection: "banners" },
);

bannerSchema.index({ placement: 1, isActive: 1, priority: -1 });

const Banner: Model<IBannerDocument> = mongoose.model<IBannerDocument>(
  "Banner",
  bannerSchema,
);

export default Banner;
