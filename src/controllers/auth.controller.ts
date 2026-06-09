import { Response, NextFunction } from "express";
import logger from "../config/logger.js";
import User from "../models/user.model.js";
import { AuthRequest } from "../types/auth.types.js";
import { AccountStatus, UserRole } from "../types/enums.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";
import { generateOTP } from "../utils/otp.js";
import { normalizeEmail, normalizePhone } from "../utils/validators.js";
import { AppError } from "../utils/AppError.js";
import {
  saveOtp,
  verifyStoredOtp,
  deleteOtp,
  type OtpPurpose,
} from "../services/otp.service.js";
import {
  sendSignupOtpEmail,
  sendLoginOtpEmail,
  sendResetPasswordOtpEmail,
} from "../services/email.service.js";
import {
  formatAuthUser,
  setAuthCookies,
  findActiveUserByEmail,
  assertAccountActive,
  buildAuthResponse,
  parseRole,
} from "../services/auth.service.js";
import { rotateRefreshToken, revokeRefreshToken } from "../services/token.service.js";

function getRefreshTokenFromRequest(req: AuthRequest): string | undefined {
  return (
    req.body.refreshToken ||
    req.cookies?.refreshToken ||
    undefined
  );
}

function devOtpPayload(otp: string) {
  return process.env.NODE_ENV === "development" ? { devOtp: otp } : {};
}

// ─── POST /auth/register ───────────────────────────────────────
export const register = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const email = normalizeEmail(req.body.email);
    const mobile = req.body.mobile || req.body.phone
      ? normalizePhone(req.body.mobile || req.body.phone)
      : undefined;
    const { fullName, password } = req.body;
    const role = parseRole(req.body.role);

    const existing = await User.findOne({
      $or: [{ email }, ...(mobile ? [{ mobile }] : [])],
      isDeleted: false,
    });
    if (existing) {
      sendError(res, "Email or mobile already registered", 400);
      return;
    }

    const user = await User.create({
      fullName,
      email,
      mobile,
      password,
      role,
      accountStatus: AccountStatus.ACTIVE,
      isEmailVerified: true,
    });

    const { statusCode, body } = await buildAuthResponse(
      user,
      res,
      "Registration successful",
      201,
    );
    res.status(statusCode).json(body);
  } catch (err) {
    next(err);
  }
};

// ─── POST /auth/login ──────────────────────────────────────────
export const login = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;

    const user = await findActiveUserByEmail(email);
    if (!user || !user.password) {
      sendError(res, "Invalid email or password", 401);
      return;
    }

    assertAccountActive(user);

    const valid = await user.comparePassword(password);
    if (!valid) {
      sendError(res, "Invalid email or password", 401);
      return;
    }

    user.lastLoginAt = new Date();
    user.lastLoginIP = req.ip;
    await user.save();

    const { statusCode, body } = await buildAuthResponse(
      user,
      res,
      "Login successful",
    );
    res.status(statusCode).json(body);
  } catch (err) {
    next(err);
  }
};

// ─── POST /auth/send-otp ───────────────────────────────────────
export const sendOtp = async (req: AuthRequest, res: Response) => {
  const email = normalizeEmail(req.body.email);
  const purpose = (req.body.purpose || "login") as OtpPurpose;
  const mobile =
    req.body.mobile || req.body.phone
      ? normalizePhone(req.body.mobile || req.body.phone)
      : undefined;

  if (purpose === "signup") {
    await sendSignupOtpHandler(email, mobile, res);
    return;
  }
  if (purpose === "reset") {
    await sendResetOtpHandler(email, res);
    return;
  }
  await sendLoginOtpHandler(email, res);
};

async function sendSignupOtpHandler(
  email: string,
  mobile: string | undefined,
  res: Response,
) {
  const existing = await User.findOne({
    $or: [{ email }, ...(mobile ? [{ mobile }] : [])],
    isDeleted: false,
  });
  if (existing) {
    sendError(res, "Email or mobile already registered. Please login.", 400);
    return;
  }

  const otp = generateOTP();
  await saveOtp("signup", email, otp, mobile);
  await sendSignupOtpEmail(email, otp);
  if (process.env.NODE_ENV === "development") {
    logger.info(`[DEV] Signup OTP for ${email}: ${otp}`);
  }
  sendSuccess(res, "OTP sent to your email", { email, purpose: "signup", ...devOtpPayload(otp) });
}

async function sendLoginOtpHandler(email: string, res: Response) {
  const user = await User.findOne({ email, isDeleted: false });
  if (!user) {
    sendError(res, "No account found with this email", 404);
    return;
  }
  try {
    assertAccountActive(user);
  } catch (err) {
    if (err instanceof AppError) {
      sendError(res, err.message, err.statusCode);
      return;
    }
    throw err;
  }

  const otp = generateOTP();
  await saveOtp("login", email, otp);
  await sendLoginOtpEmail(email, otp);
  if (process.env.NODE_ENV === "development") {
    logger.info(`[DEV] Login OTP for ${email}: ${otp}`);
  }
  sendSuccess(res, "OTP sent to your email", { email, purpose: "login", ...devOtpPayload(otp) });
}

async function sendResetOtpHandler(email: string, res: Response) {
  const user = await User.findOne({ email, isDeleted: false });
  if (!user) {
    sendSuccess(res, "If the email exists, an OTP has been sent", { email });
    return;
  }

  const otp = generateOTP();
  await saveOtp("reset", email, otp);
  await sendResetPasswordOtpEmail(email, otp);
  if (process.env.NODE_ENV === "development") {
    logger.info(`[DEV] Reset OTP for ${email}: ${otp}`);
  }
  sendSuccess(res, "If the email exists, an OTP has been sent", {
    email,
    purpose: "reset",
    ...devOtpPayload(otp),
  });
}

// ─── POST /auth/verify-otp ─────────────────────────────────────
export const verifyOtp = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const email = normalizeEmail(req.body.email);
    const otp = req.body.otp;
    const purpose = (req.body.purpose || "login") as OtpPurpose;

    if (purpose === "signup") {
      req.body.email = email;
      req.body.otp = otp;
      await verifySignupOtp(req, res, next);
      return;
    }
    if (purpose === "reset") {
      await verifyResetOtpOnly(req, res);
      return;
    }
    await verifyLoginOtp(req, res, next);
  } catch (err) {
    next(err);
  }
};

export const verifySignupOtp = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const email = normalizeEmail(req.body.email);
    const otp = req.body.otp;
    const mobile =
      req.body.mobile || req.body.phone
        ? normalizePhone(req.body.mobile || req.body.phone)
        : undefined;
    const fullName = (req.body.fullName || req.body.name)?.trim();

    const valid = await verifyStoredOtp("signup", email, otp);
    if (!valid) {
      sendError(res, "Invalid or expired OTP", 400);
      return;
    }

    const user = await User.create({
      email,
      mobile,
      fullName: fullName || email.split("@")[0],
      role: UserRole.CUSTOMER,
      accountStatus: AccountStatus.ACTIVE,
      isEmailVerified: true,
    });

    await deleteOtp("signup", email);
    const { statusCode, body } = await buildAuthResponse(
      user,
      res,
      "Signup successful",
      201,
    );
    res.status(statusCode).json(body);
  } catch (err) {
    next(err);
  }
};

export const verifyLoginOtp = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const email = normalizeEmail(req.body.email);
    const otp = req.body.otp;

    const valid = await verifyStoredOtp("login", email, otp);
    if (!valid) {
      sendError(res, "Invalid or expired OTP", 400);
      return;
    }

    const user = await User.findOne({ email, isDeleted: false });
    if (!user) {
      sendError(res, "User not found", 404);
      return;
    }
    assertAccountActive(user);

    user.lastLoginAt = new Date();
    user.lastLoginIP = req.ip;
    await user.save();
    await deleteOtp("login", email);

    const { statusCode, body } = await buildAuthResponse(
      user,
      res,
      "Login successful",
    );
    res.status(statusCode).json(body);
  } catch (err) {
    next(err);
  }
};

async function verifyResetOtpOnly(req: AuthRequest, res: Response) {
  const email = normalizeEmail(req.body.email);
  const otp = req.body.otp;
  const valid = await verifyStoredOtp("reset", email, otp);
  if (!valid) {
    sendError(res, "Invalid or expired OTP", 400);
    return;
  }
  sendSuccess(res, "OTP verified. You can now reset your password.", { email });
}

// ─── POST /auth/refresh-token ──────────────────────────────────
export const refreshToken = async (req: AuthRequest, res: Response) => {
  const token = getRefreshTokenFromRequest(req);
  if (!token) {
    sendError(res, "Refresh token required", 401);
    return;
  }

  const tokens = await rotateRefreshToken(token);
  if (!tokens) {
    sendError(res, "Invalid or expired refresh token", 401);
    return;
  }

  setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
  sendSuccess(res, "Token refreshed", {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
};

// ─── POST /auth/logout ─────────────────────────────────────────
export const logout = async (req: AuthRequest, res: Response) => {
  const token = getRefreshTokenFromRequest(req);
  if (token) {
    await revokeRefreshToken(token);
  }
  res.clearCookie("token");
  res.clearCookie("refreshToken");
  sendSuccess(res, "Logged out successfully");
};

// ─── POST /auth/forgot-password ────────────────────────────────
export const forgotPassword = async (req: AuthRequest, res: Response) => {
  await sendResetOtpHandler(normalizeEmail(req.body.email), res);
};

// ─── POST /auth/reset-password ─────────────────────────────────
export const resetPassword = async (req: AuthRequest, res: Response) => {
  const email = normalizeEmail(req.body.email);
  const otp = req.body.otp;
  const newPassword = req.body.newPassword || req.body.password;

  const valid = await verifyStoredOtp("reset", email, otp);
  if (!valid) {
    sendError(res, "Invalid or expired OTP", 400);
    return;
  }

  const user = await findActiveUserByEmail(email);
  if (!user) {
    sendError(res, "User not found", 404);
    return;
  }

  user.password = newPassword;
  await user.save();
  await deleteOtp("reset", email);

  sendSuccess(res, "Password reset successful. Please login with your new password.");
};

// ─── GET /auth/me ──────────────────────────────────────────────
export const getCurrentUser = async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.userId);
  if (!user || user.isDeleted) {
    sendError(res, "User not found", 404);
    return;
  }
  sendSuccess(res, "User fetched", { user: formatAuthUser(user) });
};

// ─── Legacy aliases (Phase 1 paths) ────────────────────────────
export const sendSignupOtp = async (req: AuthRequest, res: Response) => {
  req.body.purpose = "signup";
  await sendOtp(req, res);
};

export const sendLoginOtp = async (req: AuthRequest, res: Response) => {
  req.body.purpose = "login";
  await sendOtp(req, res);
};

// ─── Restaurant portal — mobile OTP (owner accounts) ─────────────
export const restaurantSendOtp = async (req: AuthRequest, res: Response) => {
  const mobile = normalizePhone(req.body.mobile || req.body.phone);
  const user = await User.findOne({
    mobile,
    role: UserRole.RESTAURANT_OWNER,
    isDeleted: false,
  });
  if (!user) {
    sendError(res, "No restaurant partner account found for this mobile", 404);
    return;
  }
  await sendLoginOtpHandler(user.email, res);
};

export const restaurantVerifyOtp = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const mobile = normalizePhone(req.body.mobile || req.body.phone);
    const user = await User.findOne({
      mobile,
      role: UserRole.RESTAURANT_OWNER,
      isDeleted: false,
    });
    if (!user) {
      sendError(res, "No restaurant partner account found for this mobile", 404);
      return;
    }
    req.body.email = user.email;
    req.body.purpose = "login";
    await verifyLoginOtp(req, res, next);
  } catch (err) {
    next(err);
  }
};

// ─── Restaurant portal — email OTP (Gmail) ───────────────────────
export const restaurantEmailSendOtp = async (req: AuthRequest, res: Response) => {
  const email = normalizeEmail(req.body.email);
  const user = await User.findOne({
    email,
    role: UserRole.RESTAURANT_OWNER,
    isDeleted: false,
  });
  if (!user) {
    sendError(res, "No restaurant partner account found for this email", 404);
    return;
  }
  await sendLoginOtpHandler(email, res);
};

export const restaurantEmailVerifyOtp = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const email = normalizeEmail(req.body.email);
    const user = await User.findOne({
      email,
      role: UserRole.RESTAURANT_OWNER,
      isDeleted: false,
    });
    if (!user) {
      sendError(res, "No restaurant partner account found for this email", 404);
      return;
    }
    req.body.email = email;
    req.body.purpose = "login";
    await verifyLoginOtp(req, res, next);
  } catch (err) {
    next(err);
  }
};

// ─── Social login stub ───────────────────────────────────────────
export const socialLoginStub = async (_req: AuthRequest, res: Response) => {
  sendError(
    res,
    "Social login is not implemented yet. Use email/password or OTP.",
    501,
  );
};
