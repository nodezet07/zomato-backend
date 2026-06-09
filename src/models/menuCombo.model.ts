import mongoose, { Schema, Document, Model } from "mongoose";
import { FoodType } from "../types/enums.js";

export interface IMenuComboItem {
  menuItemId: mongoose.Types.ObjectId;
  quantity: number;
}

export interface IMenuComboDocument extends Document {
  restaurantId: mongoose.Types.ObjectId;
  title: string;
  tag?: string;
  image?: string;
  price: number;
  foodType: FoodType;
  items: IMenuComboItem[];
  mainItemId: mongoose.Types.ObjectId;
  sortOrder: number;
  isAvailable: boolean;
  isDeleted: boolean;
}

const comboItemSchema = new Schema<IMenuComboItem>(
  {
    menuItemId: {
      type: Schema.Types.ObjectId,
      ref: "MenuItem",
      required: true,
    },
    quantity: { type: Number, required: true, min: 1, default: 1 },
  },
  { _id: false },
);

const menuComboSchema = new Schema<IMenuComboDocument>(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    tag: { type: String, trim: true, default: "Combo Deal" },
    image: String,
    price: { type: Number, required: true, min: 0 },
    foodType: {
      type: String,
      enum: Object.values(FoodType),
      required: true,
    },
    items: { type: [comboItemSchema], required: true, validate: [(v: unknown[]) => v.length >= 2, "Combo needs at least 2 items"] },
    mainItemId: {
      type: Schema.Types.ObjectId,
      ref: "MenuItem",
      required: true,
    },
    sortOrder: { type: Number, default: 0 },
    isAvailable: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

menuComboSchema.index({ restaurantId: 1, isDeleted: 1, isAvailable: 1 });

const MenuCombo: Model<IMenuComboDocument> =
  mongoose.models.MenuCombo ??
  mongoose.model<IMenuComboDocument>("MenuCombo", menuComboSchema);

export default MenuCombo;
