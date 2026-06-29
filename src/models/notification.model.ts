import mongoose, { Schema, Document, Model } from "mongoose";
import { NotificationType, NotificationRedirect } from "../types/enums.js";

export interface INotificationDocument extends Document {
  userId: mongoose.Types.ObjectId;
  notificationType: NotificationType;
  title: string;
  message: string;
  image?: string;
  redirectType?: NotificationRedirect;
  redirectId?: mongoose.Types.ObjectId;
  isRead: boolean;
  sentAt: Date;
  readAt?: Date;
}

const notificationSchema = new Schema<INotificationDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    notificationType: {
      type: String,
      enum: Object.values(NotificationType),
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    image: String,
    redirectType: { type: String, enum: Object.values(NotificationRedirect) },
    redirectId: Schema.Types.ObjectId,
    isRead: { type: Boolean, default: false },
    sentAt: { type: Date, default: Date.now },
    readAt: Date,
  },
  { timestamps: false, collection: "notifications" },
);

notificationSchema.index({ userId: 1, isRead: 1, sentAt: -1 });
notificationSchema.index({ userId: 1, sentAt: -1 });

const Notification: Model<INotificationDocument> =
  mongoose.model<INotificationDocument>("Notification", notificationSchema);

export default Notification;
