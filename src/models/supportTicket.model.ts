import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { SupportIssueType, TicketStatus } from "../types/enums.js";
import { ticketReplySchema } from "./schemas/common.schemas.js";

export interface ITicketReply {
  _id?: Types.ObjectId;
  authorId: Types.ObjectId;
  authorRole: "customer" | "admin";
  message: string;
  createdAt: Date;
}

export interface ISupportTicketDocument extends Document {
  ticketNumber: string;
  customerId: mongoose.Types.ObjectId;
  orderId?: mongoose.Types.ObjectId;
  issueType: SupportIssueType;
  description: string;
  images: string[];
  status: TicketStatus;
  assignedAdminId?: mongoose.Types.ObjectId;
  resolution?: string;
  replies: Types.DocumentArray<ITicketReply & Document>;
  createdAt: Date;
  updatedAt: Date;
}

const supportTicketSchema = new Schema<ISupportTicketDocument>(
  {
    ticketNumber: { type: String, required: true, unique: true },
    customerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order" },
    issueType: {
      type: String,
      enum: Object.values(SupportIssueType),
      required: true,
    },
    description: { type: String, required: true },
    images: [String],
    status: {
      type: String,
      enum: Object.values(TicketStatus),
      default: TicketStatus.OPEN,
    },
    assignedAdminId: { type: Schema.Types.ObjectId, ref: "AdminUser" },
    resolution: String,
    replies: [ticketReplySchema],
  },
  { timestamps: true, collection: "support_tickets" },
);

supportTicketSchema.index({ customerId: 1, status: 1 });
supportTicketSchema.index({ status: 1, createdAt: -1 });

const SupportTicket: Model<ISupportTicketDocument> =
  mongoose.model<ISupportTicketDocument>("SupportTicket", supportTicketSchema);

export default SupportTicket;
