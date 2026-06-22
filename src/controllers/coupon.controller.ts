import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/auth.types.js";
import Coupon from "../models/coupon.model.js";
import Restaurant from "../models/restaurant.model.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";
import { CouponStatus } from "../types/enums.js";
import { assertRestaurantOwner } from "../services/menu.service.js";
import { getPagination, paginationMeta } from "../helpers/pagination.js";

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

// GET /coupons — Admin only (list all coupons)
export const listCoupons = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const page = parseInt(String(req.query.page ?? "1"), 10) || 1;
    const limit = parseInt(String(req.query.limit ?? "20"), 10) || 20;
    const status = req.query.status as string | undefined;

    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;

    const { skip } = getPagination(String(page), String(limit));
    const [coupons, total] = await Promise.all([
      Coupon.find(filter)
        .populate("applicableRestaurants", "restaurantName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Coupon.countDocuments(filter),
    ]);

    sendSuccess(res, "Coupons fetched", {
      coupons,
      pagination: paginationMeta(total, page, limit),
    });
  } catch (err) {
    next(err);
  }
};

// GET /coupons/restaurant/:restaurantId — public, no auth required
export const getCouponsByRestaurant = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const restaurantId = paramId(req.params.restaurantId);

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      sendError(res, "Restaurant not found", 404);
      return;
    }

    const now = new Date();
    const coupons = await Coupon.find({
      status: CouponStatus.ACTIVE,
      validFrom: { $lte: now },
      validTo: { $gte: now },
      $or: [
        { applicableRestaurants: { $size: 0 } }, // global coupons
        { applicableRestaurants: restaurantId },   // restaurant-specific
      ],
    })
      .select("couponCode title description discountType discountValue minimumOrderAmount maximumDiscount validTo usageLimit usedCount")
      .sort({ discountValue: -1 })
      .lean();

    sendSuccess(res, "Coupons fetched", { coupons, count: coupons.length });
  } catch (err) {
    next(err);
  }
};

// POST /coupons — Admin only
export const createCoupon = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const {
      couponCode,
      title,
      description,
      discountType,
      discountValue,
      minimumOrderAmount,
      maximumDiscount,
      usageLimit,
      validFrom,
      validTo,
      applicableRestaurants,
      status,
    } = req.body;

    if (!couponCode || !title || !discountType || discountValue === undefined || !validFrom || !validTo) {
      sendError(res, "Missing required fields", 400);
      return;
    }

    const existing = await Coupon.findOne({ couponCode: couponCode.toUpperCase() });
    if (existing) {
      sendError(res, "Coupon code already exists", 400);
      return;
    }

    const coupon = new Coupon({
      couponCode,
      title,
      description,
      discountType,
      discountValue,
      minimumOrderAmount,
      maximumDiscount,
      usageLimit,
      validFrom: new Date(validFrom),
      validTo: new Date(validTo),
      applicableRestaurants: applicableRestaurants || [],
      status: status || CouponStatus.ACTIVE,
    });

    await coupon.save();

    sendSuccess(res, "Coupon created successfully", { coupon }, 201);
  } catch (err) {
    next(err);
  }
};

// POST /coupons/restaurant — Restaurant owner creates offer for their store
export const createRestaurantCoupon = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const {
      restaurantId,
      couponCode,
      title,
      description,
      discountType,
      discountValue,
      minimumOrderAmount,
      maximumDiscount,
      usageLimit,
      validFrom,
      validTo,
    } = req.body;

    if (
      !restaurantId ||
      !couponCode ||
      !title ||
      !discountType ||
      discountValue === undefined ||
      !validFrom ||
      !validTo
    ) {
      sendError(res, "Missing required fields", 400);
      return;
    }

    await assertRestaurantOwner(req.userId!, restaurantId);

    const code = String(couponCode).toUpperCase();
    const existing = await Coupon.findOne({ couponCode: code });
    if (existing) {
      sendError(res, "Coupon code already exists", 400);
      return;
    }

    const coupon = await Coupon.create({
      couponCode: code,
      title,
      description,
      discountType,
      discountValue,
      minimumOrderAmount: minimumOrderAmount ?? 0,
      maximumDiscount,
      usageLimit: usageLimit ?? 100,
      validFrom: new Date(validFrom),
      validTo: new Date(validTo),
      applicableRestaurants: [restaurantId],
      status: CouponStatus.ACTIVE,
    });

    sendSuccess(res, "Offer created for your restaurant", { coupon }, 201);
  } catch (err) {
    next(err);
  }
};

// DELETE /coupons/restaurant/:couponId — Restaurant owner (own offers only)
export const deleteRestaurantCoupon = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const couponId = paramId(req.params.couponId);
    const restaurantId = paramId(
      (req.query.restaurantId as string) ??
        (req.body as { restaurantId?: string })?.restaurantId ??
        "",
    );
    if (!restaurantId) {
      sendError(res, "restaurantId query param is required", 400);
      return;
    }

    await assertRestaurantOwner(req.userId!, restaurantId);

    const coupon = await Coupon.findById(couponId);
    if (!coupon) {
      sendError(res, "Coupon not found", 404);
      return;
    }

    const ownsCoupon = coupon.applicableRestaurants.some(
      (id) => id.toString() === restaurantId,
    );
    if (!ownsCoupon) {
      sendError(res, "You can only delete offers for your restaurant", 403);
      return;
    }

    await Coupon.findByIdAndDelete(couponId);
    sendSuccess(res, "Offer deleted", {});
  } catch (err) {
    next(err);
  }
};

// DELETE /coupons/:couponId — Admin only
export const deleteCoupon = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const couponId = paramId(req.params.couponId);
    const deleted = await Coupon.findByIdAndDelete(couponId);
    if (!deleted) {
      sendError(res, "Coupon not found", 404);
      return;
    }
    sendSuccess(res, "Coupon deleted successfully", { deleted });
  } catch (err) {
    next(err);
  }
};
