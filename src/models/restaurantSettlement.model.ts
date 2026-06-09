import mongoose, { Schema, Document, Model } from "mongoose";
import { RestaurantSettlementStatus } from "../types/enums.js";
import { bankDetailsSchema } from "./schemas/common.schemas.js";

export interface IRestaurantSettlementDocument extends Document {
  settlementNumber: string;
  restaurantId: mongoose.Types.ObjectId;
  orderIds: mongoose.Types.ObjectId[];
  orderCount: number;
  grossFoodSales: number;
  totalCommission: number;
  netPayable: number;
  status: RestaurantSettlementStatus;
  periodStart?: Date;
  periodEnd?: Date;
  bankSnapshot?: {
    accountHolderName?: string;
    accountNumber?: string;
    ifscCode?: string;
  };
  paymentReference?: string;
  notes?: string;
  paidAt?: Date;
  paidByAdminId?: mongoose.Types.ObjectId;
  createdByAdminId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const restaurantSettlementSchema = new Schema<IRestaurantSettlementDocument>(
  {
    settlementNumber: { type: String, required: true, unique: true },
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    orderIds: [{ type: Schema.Types.ObjectId, ref: "Order" }],
    orderCount: { type: Number, default: 0 },
    grossFoodSales: { type: Number, default: 0 },
    totalCommission: { type: Number, default: 0 },
    netPayable: { type: Number, default: 0 },
    status: {
      type: String,
      enum: Object.values(RestaurantSettlementStatus),
      default: RestaurantSettlementStatus.PENDING,
    },
    periodStart: Date,
    periodEnd: Date,
    bankSnapshot: { type: bankDetailsSchema, default: undefined },
    paymentReference: String,
    notes: String,
    paidAt: Date,
    paidByAdminId: { type: Schema.Types.ObjectId, ref: "AdminUser" },
    createdByAdminId: { type: Schema.Types.ObjectId, ref: "AdminUser" },
  },
  { timestamps: true, collection: "restaurant_settlements" },
);

restaurantSettlementSchema.index({ restaurantId: 1, createdAt: -1 });
restaurantSettlementSchema.index({ status: 1, createdAt: -1 });
restaurantSettlementSchema.index({ settlementNumber: 1 });

const RestaurantSettlement: Model<IRestaurantSettlementDocument> =
  mongoose.model<IRestaurantSettlementDocument>(
    "RestaurantSettlement",
    restaurantSettlementSchema,
  );

export default RestaurantSettlement;
