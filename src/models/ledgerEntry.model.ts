import mongoose, { Schema, Document, Model } from "mongoose";

export type LedgerAccountType =
  | "PLATFORM"
  | "RESTAURANT"
  | "RIDER"
  | "CUSTOMER"
  | "GATEWAY";

export type LedgerEntryType =
  | "ORDER_PAYMENT"
  | "COMMISSION"
  | "RESTAURANT_SETTLEMENT"
  | "RIDER_PAYOUT"
  | "REFUND"
  | "CANCELLATION_CHARGE"
  | "WALLET_CREDIT"
  | "WALLET_DEBIT"
  | "COD_COLLECTION"
  | "ADJUSTMENT";

export interface ILedgerEntryDocument extends Document {
  entryNumber: string;
  entryType: LedgerEntryType;
  debitAccount: LedgerAccountType;
  debitEntityId?: mongoose.Types.ObjectId;
  creditAccount: LedgerAccountType;
  creditEntityId?: mongoose.Types.ObjectId;
  amount: number;
  currency: string;
  orderId?: mongoose.Types.ObjectId;
  paymentId?: mongoose.Types.ObjectId;
  settlementId?: mongoose.Types.ObjectId;
  payoutId?: mongoose.Types.ObjectId;
  description: string;
  metadata?: Record<string, unknown>;
  recordedAt: Date;
}

const ledgerEntrySchema = new Schema<ILedgerEntryDocument>(
  {
    entryNumber: { type: String, required: true, unique: true },
    entryType: { type: String, required: true },
    debitAccount: { type: String, required: true },
    debitEntityId: Schema.Types.ObjectId,
    creditAccount: { type: String, required: true },
    creditEntityId: Schema.Types.ObjectId,
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },
    orderId: { type: Schema.Types.ObjectId, ref: "Order" },
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment" },
    settlementId: { type: Schema.Types.ObjectId, ref: "RestaurantSettlement" },
    payoutId: { type: Schema.Types.ObjectId, ref: "RiderPayout" },
    description: { type: String, required: true },
    metadata: Schema.Types.Mixed,
    recordedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "ledger_entries" },
);

ledgerEntrySchema.index({ orderId: 1 });
ledgerEntrySchema.index({ entryType: 1, recordedAt: -1 });
ledgerEntrySchema.index({ debitAccount: 1, debitEntityId: 1 });
ledgerEntrySchema.index({ creditAccount: 1, creditEntityId: 1 });

const LedgerEntry: Model<ILedgerEntryDocument> = mongoose.model<ILedgerEntryDocument>(
  "LedgerEntry",
  ledgerEntrySchema,
);

export default LedgerEntry;
