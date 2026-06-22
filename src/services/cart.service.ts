import mongoose from "mongoose";
import Cart from "../models/cart.model.js";
import MenuItem from "../models/menuItem.model.js";
import Restaurant from "../models/restaurant.model.js";
import Coupon from "../models/coupon.model.js";
import User from "../models/user.model.js";
import { AppError } from "../utils/AppError.js";
import {
  CouponDiscountType,
  CouponStatus,
} from "../types/enums.js";
import { assertPublicRestaurant } from "./menu.service.js";
import {
  DEFAULT_DELIVERY_FEE,
  PLATFORM_FEE_PERCENT,
  MAX_PLATFORM_FEE,
} from "../constants/index.js";
import { getEffectivePlatformPolicy } from "./platformConfig.service.js";

type CartAddon = { name: string; price: number };

export function lineItemTotal(
  unitPrice: number,
  quantity: number,
  addons: CartAddon[] = [],
): number {
  const addonTotal = addons.reduce((sum, a) => sum + a.price, 0);
  return Math.round((unitPrice + addonTotal) * quantity * 100) / 100;
}

export async function getMenuItemForCart(menuItemId: string) {
  const item = await MenuItem.findOne({
    _id: menuItemId,
    isDeleted: false,
    isAvailable: true,
  });
  if (!item) {
    throw new AppError("Menu item not available", 404);
  }
  return item;
}

export async function recalculateCart(cart: InstanceType<typeof Cart>) {
  const restaurant = await Restaurant.findById(cart.restaurantId);
  if (!restaurant) {
    throw new AppError("Restaurant not found", 404);
  }

  let subtotal = 0;
  let taxAmount = 0;

  for (const line of cart.items) {
    subtotal += line.total;
    const menuItem = await MenuItem.findById(line.menuItemId);
    const taxPct = menuItem?.taxPercentage ?? 5;
    taxAmount += (line.total * taxPct) / 100;
  }

  subtotal = Math.round(subtotal * 100) / 100;
  taxAmount = Math.round(taxAmount * 100) / 100;

  const policy = await getEffectivePlatformPolicy();
  const defaultDeliveryFee = policy.defaultDeliveryFee ?? DEFAULT_DELIVERY_FEE;
  const platformFeePercent = policy.defaultPlatformFeePercent ?? PLATFORM_FEE_PERCENT;
  const maxPlatformFee = policy.maxPlatformFee ?? MAX_PLATFORM_FEE;

  const user = await User.findById(cart.userId);
  const isGold = user?.isGoldMember || false;

  let deliveryFee =
    subtotal >= restaurant.minimumOrderAmount
      ? defaultDeliveryFee
      : defaultDeliveryFee;

  let platformFee = Math.min(
    maxPlatformFee,
    Math.round((subtotal * platformFeePercent) / 100),
  );

  let goldDiscount = 0;
  if (isGold) {
    goldDiscount = deliveryFee + platformFee;
    deliveryFee = 0;
    platformFee = 0;
  }

  let couponDiscount = 0;
  if (cart.appliedCouponId) {
    const coupon = await Coupon.findById(cart.appliedCouponId);
    if (coupon) {
      couponDiscount = computeCouponDiscount(coupon, subtotal);
    }
  }

  cart.subtotal = subtotal;
  cart.taxAmount = taxAmount;
  cart.deliveryFee = deliveryFee;
  cart.platformFee = platformFee;
  cart.couponDiscount = couponDiscount;
  cart.goldDiscount = goldDiscount;
  cart.grandTotal = Math.max(
    0,
    Math.round(
      (subtotal + taxAmount + deliveryFee + platformFee - couponDiscount) * 100,
    ) / 100,
  );

  await cart.save();
  return cart;
}

export function computeCouponDiscount(
  coupon: InstanceType<typeof Coupon>,
  subtotal: number,
): number {
  if (subtotal < coupon.minimumOrderAmount) {
    return 0;
  }
  if (coupon.discountType === CouponDiscountType.FLAT) {
    return Math.min(coupon.discountValue, subtotal);
  }
  let discount = (subtotal * coupon.discountValue) / 100;
  if (coupon.maximumDiscount) {
    discount = Math.min(discount, coupon.maximumDiscount);
  }
  return Math.round(discount * 100) / 100;
}

export async function validateCoupon(
  couponCode: string,
  restaurantId: string,
  subtotal: number,
) {
  const coupon = await Coupon.findOne({
    couponCode: couponCode.toUpperCase(),
    status: CouponStatus.ACTIVE,
  });
  if (!coupon) {
    throw new AppError("Invalid coupon code", 400);
  }
  const now = new Date();
  if (now < coupon.validFrom || now > coupon.validTo) {
    throw new AppError("Coupon is expired or not yet valid", 400);
  }
  if (coupon.usedCount >= coupon.usageLimit) {
    throw new AppError("Coupon usage limit reached", 400);
  }
  if (
    coupon.applicableRestaurants.length > 0 &&
    !coupon.applicableRestaurants.some((id) => id.toString() === restaurantId)
  ) {
    throw new AppError("Coupon not valid for this restaurant", 400);
  }
  if (subtotal < coupon.minimumOrderAmount) {
    throw new AppError(
      `Minimum order amount ₹${coupon.minimumOrderAmount} required for this coupon`,
      400,
    );
  }
  return coupon;
}

export async function getOrCreateCart(
  userId: string,
  restaurantId: string,
) {
  let cart = await Cart.findOne({ userId });
  if (cart && cart.restaurantId.toString() !== restaurantId) {
    cart.set("items", []);
    cart.appliedCouponId = undefined;
    cart.restaurantId = new mongoose.Types.ObjectId(restaurantId);
  }
  if (!cart) {
    cart = await Cart.create({
      userId,
      restaurantId,
      items: [],
    });
  }
  return cart;
}

export async function getUserCart(userId: string) {
  const cart = await Cart.findOne({ userId })
    .populate("restaurantId", "restaurantName slug logo minimumOrderAmount isOpen averageDeliveryTime")
    .populate("appliedCouponId", "couponCode title discountType discountValue");
  return cart;
}

export async function ensureRestaurantForCart(restaurantId: string) {
  const restaurant = await assertPublicRestaurant(restaurantId);
  if (!restaurant.isOpen) {
    throw new AppError("Restaurant is currently closed", 400);
  }
  return restaurant;
}
