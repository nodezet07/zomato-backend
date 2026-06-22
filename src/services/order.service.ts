import mongoose from "mongoose";
import Cart from "../models/cart.model.js";
import Order from "../models/order.model.js";
import User from "../models/user.model.js";
import Restaurant from "../models/restaurant.model.js";
import Coupon from "../models/coupon.model.js";
import Rider from "../models/rider.model.js";
import { AppError } from "../utils/AppError.js";
import {
  OrderStatus,
  OrderSource,
  PaymentMethod,
  PaymentStatus,
  RiderAvailability,
  SupportIssueType,
  UserRole,
} from "../types/enums.js";
import { createSupportTicket } from "./support.service.js";
import { ensureRestaurantForCart, recalculateCart } from "./cart.service.js";
import { AuthRequest } from "../types/auth.types.js";
import {
  broadcastOrderEvent,
  emitDeliveryClaimed,
  emitOrderStatusChange,
} from "./socket.service.js";
import { SocketEvents } from "../types/socket.events.js";

const CANCELLABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
];

const ACTIVE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY_FOR_PICKUP,
  OrderStatus.RIDER_ASSIGNED,
  OrderStatus.PICKED_UP,
  OrderStatus.ON_THE_WAY,
];

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.READY_FOR_PICKUP, OrderStatus.CANCELLED],
  [OrderStatus.READY_FOR_PICKUP]: [
    OrderStatus.RIDER_ASSIGNED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.RIDER_ASSIGNED]: [OrderStatus.PICKED_UP, OrderStatus.CANCELLED],
  [OrderStatus.PICKED_UP]: [OrderStatus.ON_THE_WAY],
  [OrderStatus.ON_THE_WAY]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

const RESTAURANT_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY_FOR_PICKUP,
];

const RIDER_STATUSES: OrderStatus[] = [
  OrderStatus.PICKED_UP,
  OrderStatus.ON_THE_WAY,
  OrderStatus.DELIVERED,
];

export function idString(
  value: mongoose.Types.ObjectId | { _id?: mongoose.Types.ObjectId },
): string {
  if (value && typeof value === "object" && "_id" in value && value._id) {
    return value._id.toString();
  }
  return value.toString();
}

function restaurantOwnerId(
  order: InstanceType<typeof Order>,
): string | null {
  const r = order.restaurantId as unknown;
  if (r && typeof r === "object" && "ownerId" in r) {
    return idString((r as { ownerId: mongoose.Types.ObjectId }).ownerId);
  }
  return null;
}

export function generateOrderNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${ts}-${rand}`;
}

export function generateDeliveryOtp(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function getOrderOrFail(orderId: string) {
  const order = await Order.findById(orderId)
    .populate("restaurantId", "restaurantName logo slug ownerId address phone latitude longitude")
    .populate("customerId", "fullName mobile email")
    .populate({
      path: "riderId",
      select: "riderCode vehicleType userId",
      populate: { path: "userId", select: "fullName mobile" },
    });
  if (!order) {
    throw new AppError("Order not found", 404);
  }
  return order;
}

export async function assertOrderAccess(
  req: AuthRequest,
  order: InstanceType<typeof Order>,
): Promise<void> {
  const userId = req.userId!;
  const role = req.userRole;

  if (idString(order.customerId) === userId) return;

  if (role === UserRole.RESTAURANT_OWNER && restaurantOwnerId(order) === userId) {
    return;
  }

  if (role === UserRole.RIDER) {
    const rider = await Rider.findOne({ userId });
    if (rider) {
      if (order.riderId && idString(order.riderId) === rider._id.toString()) {
        return;
      }
      if (
        order.orderStatus === OrderStatus.READY_FOR_PICKUP &&
        !order.riderId &&
        rider.onlineStatus
      ) {
        return;
      }
    }
  }

  throw new AppError("You do not have access to this order", 403);
}

function pushTimeline(
  order: InstanceType<typeof Order>,
  status: string,
  updatedBy: string,
) {
  order.timelineLogs.push({
    status,
    updatedBy,
    timestamp: new Date(),
  });
}

export async function createOrderFromCart(
  userId: string,
  input: {
    deliveryAddressId: string;
    paymentMethod: PaymentMethod;
    couponId?: string;
    deliveryInstructions?: string;
    orderSource?: OrderSource;
    useWallet?: boolean;
  },
) {
  let cart = await Cart.findOne({ userId });
  if (!cart || cart.items.length === 0) {
    throw new AppError("Cart is empty. Add items before placing an order", 400);
  }

  cart = await recalculateCart(cart);
  const restaurant = await ensureRestaurantForCart(cart.restaurantId.toString());

  if (cart.subtotal < restaurant.minimumOrderAmount) {
    throw new AppError(
      `Minimum order amount is ₹${restaurant.minimumOrderAmount}`,
      400,
    );
  }

  const user = await User.findById(userId);
  if (!user || user.isDeleted) {
    throw new AppError("User not found", 404);
  }

  const address = user.addresses.id(input.deliveryAddressId);
  if (!address) {
    throw new AppError("Delivery address not found", 404);
  }

  const fullAddress = String(address.get("fullAddress") ?? "");
  const latitude = address.get("latitude") as number | undefined;
  const longitude = address.get("longitude") as number | undefined;

  if (latitude == null || longitude == null) {
    throw new AppError("Delivery address must include latitude and longitude", 400);
  }

  let walletDeduction = 0;
  if (input.paymentMethod === PaymentMethod.WALLET) {
    throw new AppError(
      "Wallet payments are disabled in V1. Use COD or ONLINE.",
      400,
    );
  }
  if (input.useWallet) {
    throw new AppError("Wallet is disabled in V1.", 400);
  }

  const couponId = input.couponId ?? cart.appliedCouponId?.toString();

  const orderItems = cart.items.map((line) => ({
    menuItemId: line.menuItemId,
    itemName: line.itemName,
    quantity: line.quantity,
    price: line.price,
    addons: line.addons ?? [],
    specialInstructions: line.specialInstructions,
    total: line.total,
  }));

  const isOnline = input.paymentMethod === PaymentMethod.ONLINE;

  // All new orders start PENDING — restaurant must accept before kitchen work begins.
  const initialStatus = OrderStatus.PENDING;

  if (couponId && !isOnline) {
    const coupon = await Coupon.findById(couponId);
    if (coupon) {
      coupon.usedCount += 1;
      await coupon.save();
    }
  }

  const paymentStatus = PaymentStatus.PENDING;

  const order = await Order.create({
    orderNumber: generateOrderNumber(),
    customerId: userId,
    restaurantId: cart.restaurantId,
    orderSource: input.orderSource ?? OrderSource.APP,
    orderItems,
    subtotal: cart.subtotal,
    taxAmount: cart.taxAmount,
    deliveryFee: cart.deliveryFee,
    platformFee: cart.platformFee,
    packagingCharge: 0,
    surgeFee: 0,
    couponDiscount: cart.couponDiscount,
    walletDeduction,
    grandTotal: cart.grandTotal,
    paymentMethod: input.paymentMethod,
    paymentStatus,
    appliedCouponId: couponId ? new mongoose.Types.ObjectId(couponId) : undefined,
    orderStatus: initialStatus,
    customerAddress: {
      fullAddress,
      latitude,
      longitude,
    },
    deliveryInstructions: input.deliveryInstructions,
    deliveryOtp: generateDeliveryOtp(),
    estimatedPreparationTime: 30,
    estimatedDeliveryTime: new Date(Date.now() + 45 * 60 * 1000),
    timelineLogs: [
      {
        status: OrderStatus.PENDING,
        updatedBy: userId,
        timestamp: new Date(),
      },
    ],
    fraudFlags: [],
  });

  broadcastOrderEvent(order, SocketEvents.ORDER_CREATED);

  cart.set("items", []);
  cart.appliedCouponId = undefined;
  await recalculateCart(cart);

  restaurant.totalOrders = (restaurant.totalOrders ?? 0) + 1;
  await restaurant.save();

  return order;
}

export async function updateOrderStatus(
  req: AuthRequest,
  orderId: string,
  newStatus: OrderStatus,
  cancellationReason?: string,
  estimatedPreparationTime?: number,
) {
  const order = await getOrderOrFail(orderId);
  await assertOrderAccess(req, order);

  const current = order.orderStatus;
  const allowed = STATUS_TRANSITIONS[current];
  if (!allowed.includes(newStatus)) {
    throw new AppError(
      `Cannot transition from ${current} to ${newStatus}`,
      400,
    );
  }

  if (
    newStatus === OrderStatus.CONFIRMED &&
    current === OrderStatus.PENDING &&
    order.paymentMethod === PaymentMethod.ONLINE &&
    order.paymentStatus === PaymentStatus.PENDING
  ) {
    throw new AppError(
      "Order is awaiting online payment. Complete payment before confirming",
      400,
    );
  }

  const role = req.userRole ?? UserRole.CUSTOMER;

  if (RESTAURANT_STATUSES.includes(newStatus)) {
    const ownerId = restaurantOwnerId(order);
    if (role !== UserRole.RESTAURANT_OWNER || ownerId !== req.userId) {
      throw new AppError("Only restaurant owner can set this status", 403);
    }
  }

  if (RIDER_STATUSES.includes(newStatus)) {
    const rider = await Rider.findOne({ userId: req.userId });
    if (
      role !== UserRole.RIDER ||
      !rider ||
      !order.riderId ||
      idString(order.riderId) !== rider._id.toString()
    ) {
      throw new AppError("Only assigned rider can set this status", 403);
    }
  }

  if (newStatus === OrderStatus.CANCELLED && role === UserRole.CUSTOMER) {
    if (!CANCELLABLE_STATUSES.includes(current)) {
      throw new AppError("Order can no longer be cancelled", 400);
    }
  }

  order.orderStatus = newStatus;
  pushTimeline(order, newStatus, req.userId!);

  const now = new Date();
  if (newStatus === OrderStatus.CONFIRMED) {
    order.acceptedAt = now;
    if (estimatedPreparationTime != null) {
      order.estimatedPreparationTime = estimatedPreparationTime;
      const deliveryBufferMins = 20;
      order.estimatedDeliveryTime = new Date(
        now.getTime() + (estimatedPreparationTime + deliveryBufferMins) * 60 * 1000,
      );
    }
  }
  if (newStatus === OrderStatus.PREPARING) order.preparedAt = now;
  if (newStatus === OrderStatus.PICKED_UP) order.pickedUpAt = now;
  if (newStatus === OrderStatus.DELIVERED) {
    order.deliveredAt = now;
    order.paymentStatus =
      order.paymentMethod === PaymentMethod.COD
        ? PaymentStatus.CAPTURED
        : order.paymentStatus;
  }
  if (newStatus === OrderStatus.CANCELLED) {
    order.cancelledAt = now;
    order.cancellationReason = cancellationReason;
    if (order.walletDeduction > 0) {
      const user = await User.findById(order.customerId);
      if (user) {
        user.walletBalance += order.walletDeduction;
        await user.save();
      }
      order.refundAmount = order.walletDeduction;
    }
  }

  await order.save();
  if (newStatus === OrderStatus.DELIVERED) {
    const { recordOrderFinancialsOnDelivery } = await import("./finance.service.js");
    await recordOrderFinancialsOnDelivery(order._id.toString());
  }
  emitOrderStatusChange(order);
  return order;
}

export async function cancelOrder(
  req: AuthRequest,
  orderId: string,
  reason?: string,
) {
  const order = await getOrderOrFail(orderId);
  if (idString(order.customerId) !== req.userId) {
    throw new AppError("Only the customer can cancel this order", 403);
  }
  if (!CANCELLABLE_STATUSES.includes(order.orderStatus)) {
    throw new AppError("Order can no longer be cancelled", 400);
  }
  return updateOrderStatus(
    req,
    orderId,
    OrderStatus.CANCELLED,
    reason ?? "Cancelled by customer",
  );
}

export async function assignRiderToOrder(
  req: AuthRequest,
  orderId: string,
  riderUserId?: string,
) {
  const targetUserId = riderUserId ?? req.userId!;
  const rider = await Rider.findOne({ userId: targetUserId });
  if (!rider) {
    throw new AppError("Rider not found", 404);
  }

  const order = await Order.findOneAndUpdate(
    {
      _id: orderId,
      orderStatus: OrderStatus.READY_FOR_PICKUP,
      $or: [{ riderId: { $exists: false } }, { riderId: null }],
    },
    {
      $set: {
        riderId: rider._id,
        orderStatus: OrderStatus.RIDER_ASSIGNED,
      },
      $push: {
        timelineLogs: {
          status: OrderStatus.RIDER_ASSIGNED,
          updatedBy: req.userId!,
          timestamp: new Date(),
        },
      },
    },
    { new: true },
  );

  if (!order) {
    throw new AppError("Order is not available or already assigned to another rider", 409);
  }

  const riderUpdated = await Rider.findOneAndUpdate(
    {
      _id: rider._id,
      $or: [{ currentOrderId: { $exists: false } }, { currentOrderId: null }],
    },
    {
      $set: {
        currentOrderId: order._id,
        availabilityStatus: RiderAvailability.ON_DELIVERY,
      },
    },
    { new: true },
  );

  if (!riderUpdated) {
    await Order.findByIdAndUpdate(orderId, {
      $set: { orderStatus: OrderStatus.READY_FOR_PICKUP },
      $unset: { riderId: 1 },
      $push: {
        timelineLogs: {
          status: "ASSIGN_ROLLBACK",
          updatedBy: req.userId!,
          timestamp: new Date(),
        },
      },
    });
    throw new AppError("Rider already has an active delivery", 400);
  }

  const populated = await getOrderOrFail(orderId);
  emitDeliveryClaimed(populated._id.toString(), populated.orderNumber);
  broadcastOrderEvent(populated, SocketEvents.RIDER_ASSIGNED);
  return populated;
}

export async function verifyDeliveryOtp(
  userId: string,
  orderId: string,
  otp: string,
) {
  const order = await getOrderOrFail(orderId);
  if (idString(order.customerId) !== userId) {
    throw new AppError("Only the customer can verify delivery", 403);
  }
  if (![OrderStatus.ON_THE_WAY, OrderStatus.PICKED_UP].includes(order.orderStatus)) {
    throw new AppError("Order is not out for delivery", 400);
  }
  if (order.deliveryOtp !== otp) {
    throw new AppError("Invalid delivery OTP", 400);
  }

  order.orderStatus = OrderStatus.DELIVERED;
  order.deliveredAt = new Date();
  if (order.paymentMethod === PaymentMethod.COD) {
    order.paymentStatus = PaymentStatus.CAPTURED;
  }
  pushTimeline(order, OrderStatus.DELIVERED, userId);
  await order.save();
  const { recordOrderFinancialsOnDelivery } = await import("./finance.service.js");
  await recordOrderFinancialsOnDelivery(order._id.toString());
  emitOrderStatusChange(order);
  return order;
}

export async function buildTrackPayload(order: InstanceType<typeof Order>) {
  const { getLiveRiderLocation } = await import("./tracking.service.js");
  const { googleRouteEtaMinutes } = await import("./google-maps.service.js");
  const live = await getLiveRiderLocation(order._id.toString());

  const riderDoc = order.riderId as
    | {
        _id?: mongoose.Types.ObjectId;
        riderCode?: string;
        vehicleType?: string;
        userId?: { fullName?: string; mobile?: string } | mongoose.Types.ObjectId;
      }
    | undefined;
  const riderUser =
    riderDoc?.userId && typeof riderDoc.userId === "object" && "fullName" in riderDoc.userId
      ? riderDoc.userId
      : null;

  const customerLat = order.customerAddress?.latitude;
  const customerLng = order.customerAddress?.longitude;
  const restaurantDoc = order.restaurantId as { latitude?: number; longitude?: number } | undefined;
  const riderLoc = live
    ? { latitude: live.latitude, longitude: live.longitude }
    : order.riderLocation;

  let etaMinutes: number | null = null;
  if (
    riderLoc &&
    Number.isFinite(customerLat) &&
    Number.isFinite(customerLng) &&
    ["RIDER_ASSIGNED", "PICKED_UP", "ON_THE_WAY"].includes(order.orderStatus)
  ) {
    etaMinutes = await googleRouteEtaMinutes({
      origin: riderLoc,
      destination: { latitude: customerLat!, longitude: customerLng! },
    });
  } else if (
    restaurantDoc?.latitude != null &&
    restaurantDoc?.longitude != null &&
    Number.isFinite(customerLat) &&
    Number.isFinite(customerLng) &&
    ["CONFIRMED", "PREPARING", "READY_FOR_PICKUP"].includes(order.orderStatus)
  ) {
    etaMinutes = await googleRouteEtaMinutes({
      origin: { latitude: restaurantDoc.latitude, longitude: restaurantDoc.longitude },
      destination: { latitude: customerLat!, longitude: customerLng! },
    });
  }

  return {
    orderId: order._id,
    orderNumber: order.orderNumber,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    restaurantId: order.restaurantId,
    riderId: order.riderId,
    rider: riderDoc
      ? {
          _id: riderDoc._id?.toString(),
          riderCode: riderDoc.riderCode,
          vehicleType: riderDoc.vehicleType,
          fullName: riderUser?.fullName ?? "Delivery Partner",
          mobile: riderUser?.mobile ?? null,
        }
      : null,
    riderLocation: live
      ? {
          latitude: live.latitude,
          longitude: live.longitude,
          heading: live.heading,
        }
      : order.riderLocation,
    liveLocation: live
      ? {
          latitude: live.latitude,
          longitude: live.longitude,
          heading: live.heading,
          speed: live.speed,
        }
      : null,
    restaurantLocation:
      restaurantDoc?.latitude != null && restaurantDoc?.longitude != null
        ? { latitude: restaurantDoc.latitude, longitude: restaurantDoc.longitude }
        : null,
    deliveryLocation:
      Number.isFinite(customerLat) && Number.isFinite(customerLng)
        ? { latitude: customerLat!, longitude: customerLng! }
        : null,
    estimatedPreparationTime: order.estimatedPreparationTime,
    estimatedDeliveryTime: order.estimatedDeliveryTime,
    etaMinutes,
    timelineLogs: order.timelineLogs,
    deliveredAt: order.deliveredAt,
  };
}

export async function attachLiveRiderLocation(
  order: InstanceType<typeof Order>,
): Promise<InstanceType<typeof Order>> {
  const { getLiveRiderLocation } = await import("./tracking.service.js");
  const live = await getLiveRiderLocation(order._id.toString());
  if (live) {
    order.riderLocation = {
      latitude: live.latitude,
      longitude: live.longitude,
    };
  }
  return order;
}

export async function requestRefund(
  userId: string,
  orderId: string,
  description: string,
) {
  const order = await Order.findById(orderId);
  if (!order) {
    throw new AppError("Order not found", 404);
  }
  if (idString(order.customerId) !== userId) {
    throw new AppError("You do not own this order", 403);
  }
  if (order.orderStatus !== OrderStatus.DELIVERED) {
    throw new AppError("Refund can only be requested for delivered orders", 400);
  }

  return createSupportTicket({
    customerId: userId,
    orderId: order._id.toString(),
    issueType: SupportIssueType.REFUND,
    description,
    images: [],
  });
}

export { ACTIVE_STATUSES, CANCELLABLE_STATUSES };
