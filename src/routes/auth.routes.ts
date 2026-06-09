import { Router } from "express";
import {
  register,
  login,
  sendOtp,
  verifyOtp,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  getCurrentUser,
  sendSignupOtp,
  sendLoginOtp,
  verifySignupOtp,
  verifyLoginOtp,
  restaurantSendOtp,
  restaurantVerifyOtp,
  restaurantEmailSendOtp,
  restaurantEmailVerifyOtp,
  socialLoginStub,
} from "../controllers/auth.controller.js";
import isAuth from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  registerSchema,
  loginSchema,
  sendOtpSchema,
  verifyOtpSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  restaurantMobileSendOtpSchema,
  restaurantMobileVerifyOtpSchema,
  restaurantEmailSendOtpSchema,
  restaurantEmailVerifyOtpSchema,
} from "../validators/auth.validator.js";
import {
  authStrictRateLimiter,
  otpRateLimiter,
} from "../middlewares/rateLimit.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

// endpoints.md — Phase 3
router.post(
  "/register",
  authStrictRateLimiter,
  validate(registerSchema),
  asyncHandler(register),
);
router.post(
  "/login",
  authStrictRateLimiter,
  validate(loginSchema),
  asyncHandler(login),
);
router.post("/send-otp", otpRateLimiter, validate(sendOtpSchema), asyncHandler(sendOtp));
router.post("/verify-otp", validate(verifyOtpSchema), asyncHandler(verifyOtp));
router.post(
  "/refresh-token",
  authStrictRateLimiter,
  validate(refreshTokenSchema),
  asyncHandler(refreshToken),
);
router.post("/logout", asyncHandler(logout));
router.post("/forgot-password", otpRateLimiter, validate(forgotPasswordSchema), asyncHandler(forgotPassword));
router.post("/reset-password", validate(resetPasswordSchema), asyncHandler(resetPassword));

router.get("/me", isAuth, asyncHandler(getCurrentUser));

// Legacy OTP paths (backward compatible)
router.post("/signup/send-otp", otpRateLimiter, validate(sendOtpSchema), asyncHandler(sendSignupOtp));
router.post("/signup/verify-otp", validate(verifyOtpSchema), asyncHandler(verifySignupOtp));
router.post("/login/send-otp", otpRateLimiter, validate(sendOtpSchema), asyncHandler(sendLoginOtp));
router.post("/login/verify-otp", validate(verifyOtpSchema), asyncHandler(verifyLoginOtp));

router.post(
  "/restaurant/send-otp",
  otpRateLimiter,
  validate(restaurantMobileSendOtpSchema),
  asyncHandler(restaurantSendOtp),
);
router.post(
  "/restaurant/verify-otp",
  validate(restaurantMobileVerifyOtpSchema),
  asyncHandler(restaurantVerifyOtp),
);
router.post(
  "/restaurant/send-email-otp",
  otpRateLimiter,
  validate(restaurantEmailSendOtpSchema),
  asyncHandler(restaurantEmailSendOtp),
);
router.post(
  "/restaurant/verify-email-otp",
  validate(restaurantEmailVerifyOtpSchema),
  asyncHandler(restaurantEmailVerifyOtp),
);

// Social login — Phase 3 stub
router.post("/social/:provider", asyncHandler(socialLoginStub));

export default router;
