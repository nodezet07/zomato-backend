import mongoose, { Schema, Document, Model } from "mongoose";
import bcrypt from "bcryptjs";
import {
  UserRole,
  Gender,
  LoginProvider,
  AccountStatus,
} from "../types/enums.js";
import { addressSchema, deviceTokenSchema } from "./schemas/common.schemas.js";

export interface IUserDocument extends Document {
  fullName?: string;
  email?: string;
  mobile?: string;
  password?: string;
  role: UserRole;
  profileImage?: string;
  gender?: Gender;
  dateOfBirth?: Date;
  walletBalance: number;
  loyaltyPoints: number;
  referralCode?: string;
  referredBy?: mongoose.Types.ObjectId;
  favoriteRestaurants: mongoose.Types.ObjectId[];
  deviceTokens: Array<{ token: string; platform: string }>;
  addresses: mongoose.Types.DocumentArray<Record<string, unknown>>;
  loginProvider: LoginProvider;
  isEmailVerified: boolean;
  isMobileVerified: boolean;
  accountStatus: AccountStatus;
  onboardingCompleted: boolean;
  onboardingStep: number;
  lastLoginAt?: Date;
  lastLoginIP?: string;
  isDeleted: boolean;
  isGoldMember: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(entered: string): Promise<boolean>;
  getPublicProfile(): Record<string, unknown>;
}

const userSchema = new Schema<IUserDocument>(
  {
    fullName: { type: String, trim: true },
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    mobile: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      match: /^[0-9]{10}$/,
    },
    password: { type: String, select: false },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.CUSTOMER,
    },
    profileImage: String,
    gender: { type: String, enum: Object.values(Gender) },
    dateOfBirth: Date,
    walletBalance: { type: Number, default: 0, min: 0 },
    loyaltyPoints: { type: Number, default: 0, min: 0 },
    isGoldMember: { type: Boolean, default: true },
    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: Schema.Types.ObjectId, ref: "User" },
    favoriteRestaurants: [{ type: Schema.Types.ObjectId, ref: "Restaurant" }],
    deviceTokens: [deviceTokenSchema],
    addresses: [addressSchema],
    loginProvider: {
      type: String,
      enum: Object.values(LoginProvider),
      default: LoginProvider.EMAIL,
    },
    isEmailVerified: { type: Boolean, default: false },
    isMobileVerified: { type: Boolean, default: false },
    accountStatus: {
      type: String,
      enum: Object.values(AccountStatus),
      default: AccountStatus.ACTIVE,
    },
    onboardingCompleted: { type: Boolean, default: false },
    onboardingStep: { type: Number, default: 0 },
    lastLoginAt: Date,
    lastLoginIP: String,
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "users" },
);

userSchema.index({ role: 1, accountStatus: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ isDeleted: 1 });

userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function (entered: string) {
  if (!this.password) return false;
  return bcrypt.compare(entered, this.password);
};

userSchema.methods.getPublicProfile = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.lastLoginIP;
  return obj;
};

const User: Model<IUserDocument> = mongoose.model<IUserDocument>("User", userSchema);

export default User;
