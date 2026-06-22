import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  getCouponsByRestaurant,
  listCoupons,
  createCoupon,
  createRestaurantCoupon,
  deleteCoupon,
  deleteRestaurantCoupon,
} from "../controllers/coupon.controller.js";
import isAdminAuth from "../middlewares/adminAuth.middleware.js";
import isAuth from "../middlewares/auth.middleware.js";
import { requireRestaurantOwner } from "../middlewares/role.middleware.js";

const router = Router();

// Public: get active coupons for a restaurant (customer-facing)
router.get("/restaurant/:restaurantId", asyncHandler(getCouponsByRestaurant));

// Restaurant owner: manage store offers
router.post(
  "/restaurant",
  isAuth,
  requireRestaurantOwner,
  asyncHandler(createRestaurantCoupon),
);
router.delete(
  "/restaurant/:couponId",
  isAuth,
  requireRestaurantOwner,
  asyncHandler(deleteRestaurantCoupon),
);

// Admin: list, create and delete coupons (admin panel integration)
router.get("/", isAdminAuth, asyncHandler(listCoupons));
router.post("/", isAdminAuth, asyncHandler(createCoupon));
router.delete("/:couponId", isAdminAuth, asyncHandler(deleteCoupon));

export default router;
