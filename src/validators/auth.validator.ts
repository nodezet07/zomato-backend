import { z } from "zod";

const mobileField = z
  .string()
  .regex(/^[0-9]{10}$/, "Mobile must be 10 digits")
  .optional();

export const registerSchema = z.object({
  fullName: z.string().min(2, "Full name is required").max(80),
  email: z.string().email("Invalid email format"),
  mobile: mobileField,
  phone: mobileField,
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["customer", "restaurant_owner", "rider"]).optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export const sendOtpSchema = z.object({
  email: z.string().email("Invalid email format"),
  mobile: mobileField,
  phone: mobileField,
  purpose: z.enum(["signup", "login", "reset"]).default("login"),
});

export const verifyOtpSchema = z.object({
  email: z.string().email("Invalid email format"),
  otp: z.string().length(6, "OTP must be 6 digits"),
  mobile: mobileField,
  phone: mobileField,
  fullName: z.string().min(2).max(80).optional(),
  name: z.string().min(2).max(80).optional(),
  purpose: z.enum(["signup", "login", "reset"]).optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(10).optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email format"),
});

const mobileRequired = z
  .string()
  .regex(/^[0-9]{10}$/, "Mobile must be 10 digits");

export const restaurantMobileSendOtpSchema = z.object({
  mobile: mobileRequired.optional(),
  phone: mobileRequired.optional(),
}).refine((d) => Boolean(d.mobile || d.phone), {
  message: "Mobile number is required",
});

export const restaurantMobileVerifyOtpSchema = z.object({
  mobile: mobileRequired.optional(),
  phone: mobileRequired.optional(),
  otp: z.string().length(6, "OTP must be 6 digits"),
}).refine((d) => Boolean(d.mobile || d.phone), {
  message: "Mobile number is required",
});

export const restaurantEmailSendOtpSchema = z.object({
  email: z.string().email("Invalid email format"),
});

export const restaurantEmailVerifyOtpSchema = z.object({
  email: z.string().email("Invalid email format"),
  otp: z.string().length(6, "OTP must be 6 digits"),
});

export const resetPasswordSchema = z.object({
  email: z.string().email("Invalid email format"),
  otp: z.string().length(6, "OTP must be 6 digits"),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
  password: z.string().min(6).optional(),
});
