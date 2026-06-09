import mongoose from "mongoose";
import Rider from "../models/rider.model.js";
import RiderLocation from "../models/riderLocation.model.js";
import Order from "../models/order.model.js";
import User from "../models/user.model.js";
import { AppError } from "../utils/AppError.js";
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  RiderAvailability,
  UserRole,
  VerificationStatus,
} from "../types/enums.js";
import { buildGeoPoint } from "./restaurant.service.js";
import { idString, getOrderOrFail } from "./order.service.js";
import { RIDER_EARNING_PER_DELIVERY } from "../constants/index.js";
import {
  broadcastOrderEvent,
  emitOrderStatusChange,
  emitRiderLocationUpdate,
} from "./socket.service.js";
import {
  setLiveRiderLocation,
  clearLiveRiderLocation,
} from "./tracking.service.js";
import { SocketEvents } from "../types/socket.events.js";
import { normalizeEmail, normalizePhone } from "../utils/validators.js";
import {
  assertAccountActive,
  buildAuthResponse,
  findActiveUserByEmail,
} from "./auth.service.js";
import { Response } from "express";

export function generateRiderCode(): string {
  return `RDR-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
}

export async function getRiderByUserId(userId: string) {
  const rider = await Rider.findOne({ userId });
  if (!rider) {
    throw new AppError("Rider profile not found. Register as a rider first", 404);
  }
  return rider;
}

export async function getRiderOrFail(riderId: string) {
  const rider = await Rider.findById(riderId);
  if (!rider) {
    throw new AppError("Rider not found", 404);
  }
  return rider;
}

export function assertRiderApproved(rider: InstanceType<typeof Rider>) {
  if (rider.verificationStatus !== VerificationStatus.APPROVED) {
    throw new AppError(
      "Rider account is pending approval. Contact admin or use approve-dev in development",
      403,
    );
  }
}

export function assertRiderOnline(rider: InstanceType<typeof Rider>) {
  if (!rider.onlineStatus) {
    throw new AppError("Go online to accept deliveries", 400);
  }
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

export function assertRiderOwnsOrder(
  rider: InstanceType<typeof Rider>,
  order: InstanceType<typeof Order>,
) {
  if (!order.riderId || idString(order.riderId) !== rider._id.toString()) {
    throw new AppError("This order is not assigned to you", 403);
  }
}

export async function registerRider(
  input: {
    fullName: string;
    email: string;
    password: string;
    mobile?: string;
    vehicleType?: string;
    vehicleNumber?: string;
    drivingLicense?: string;
    aadhaarCard?: string;
    bankAccountDetails?: Record<string, string>;
  },
  existingUserId?: string,
) {
  let user: InstanceType<typeof User> | null = null;

  if (existingUserId) {
    user = await User.findById(existingUserId);
    if (!user || user.isDeleted) {
      throw new AppError("User not found", 404);
    }
    const existingRider = await Rider.findOne({ userId: user._id });
    if (existingRider) {
      throw new AppError("Rider profile already exists", 400);
    }
  } else {
    const email = normalizeEmail(input.email);
    const mobile = input.mobile ? normalizePhone(input.mobile) : undefined;
    const dup = await User.findOne({
      $or: [{ email }, ...(mobile ? [{ mobile }] : [])],
      isDeleted: false,
    });
    if (dup) {
      throw new AppError("Email or mobile already registered", 400);
    }
    user = await User.create({
      fullName: input.fullName,
      email,
      mobile,
      password: input.password,
      role: UserRole.RIDER,
      isEmailVerified: true,
    });
  }

  if (user.role === UserRole.CUSTOMER) {
    user.role = UserRole.RIDER;
    await user.save();
  } else if (user.role !== UserRole.RIDER) {
    throw new AppError("Account cannot be registered as a rider", 400);
  }

  const rider = await Rider.create({
    userId: user._id,
    riderCode: generateRiderCode(),
    vehicleType: input.vehicleType,
    vehicleNumber: input.vehicleNumber,
    drivingLicense: input.drivingLicense,
    aadhaarCard: input.aadhaarCard,
    bankAccountDetails: input.bankAccountDetails,
    verificationStatus:
      process.env.NODE_ENV === "development"
        ? VerificationStatus.APPROVED
        : VerificationStatus.PENDING,
  });

  return { user, rider };
}

export async function riderLogin(
  email: string,
  password: string,
  res: Response,
) {
  const user = await findActiveUserByEmail(normalizeEmail(email));
  if (!user || !user.password) {
    throw new AppError("Invalid email or password", 401);
  }
  assertAccountActive(user);

  if (user.role !== UserRole.RIDER) {
    throw new AppError("This account is not a rider", 403);
  }

  const valid = await user.comparePassword(password);
  if (!valid) {
    throw new AppError("Invalid email or password", 401);
  }

  const rider = await getRiderByUserId(user._id.toString());

  user.lastLoginAt = new Date();
  await user.save();

  const { statusCode, body } = await buildAuthResponse(user, res, "Rider login successful");
  return {
    statusCode,
    body: {
      ...body,
      data: {
        ...body.data,
        rider,
      },
    },
  };
}

export async function updateRiderStatus(
  userId: string,
  input: { onlineStatus?: boolean; availabilityStatus?: RiderAvailability },
) {
  const rider = await getRiderByUserId(userId);
  if (input.onlineStatus !== undefined) {
    rider.onlineStatus = input.onlineStatus;
    if (!input.onlineStatus) {
      rider.availabilityStatus = RiderAvailability.OFFLINE;
    } else if (rider.currentOrderId) {
      rider.availabilityStatus = RiderAvailability.ON_DELIVERY;
    } else {
      rider.availabilityStatus = RiderAvailability.AVAILABLE;
    }
  }
  if (input.availabilityStatus !== undefined && !rider.currentOrderId) {
    rider.availabilityStatus = input.availabilityStatus;
  }
  await rider.save();
  return rider;
}

export async function updateRiderLocation(
  userId: string,
  latitude: number,
  longitude: number,
  speed?: number,
  heading?: number,
) {
  const rider = await getRiderByUserId(userId);
  rider.currentLocation = buildGeoPoint(latitude, longitude);
  rider.lastLocationUpdatedAt = new Date();
  await rider.save();

  await RiderLocation.create({
    riderId: rider._id,
    orderId: rider.currentOrderId,
    latitude,
    longitude,
    speed,
    heading,
    recordedAt: new Date(),
  });

  if (rider.currentOrderId) {
    const order = await Order.findByIdAndUpdate(
      rider.currentOrderId,
      { riderLocation: { latitude, longitude } },
      { new: true },
    );
    if (order) {
      await setLiveRiderLocation({
        orderId: order._id.toString(),
        riderId: rider._id.toString(),
        latitude,
        longitude,
        speed,
        heading,
      });
      emitRiderLocationUpdate(order, latitude, longitude);
    }
  }

  return rider;
}

export async function listAvailableOrders() {
  return Order.find({
    orderStatus: OrderStatus.READY_FOR_PICKUP,
    $or: [{ riderId: { $exists: false } }, { riderId: null }],
  })
    .sort({ createdAt: 1 })
    .populate("restaurantId", "restaurantName logo slug latitude longitude address")
    .populate("customerId", "fullName mobile")
    .limit(50)
    .lean();
}

export async function acceptOrder(userId: string, orderId: string) {
  const rider = await getRiderByUserId(userId);
  assertRiderApproved(rider);
  assertRiderOnline(rider);

  if (rider.currentOrderId) {
    throw new AppError("Complete your current delivery before accepting a new order", 400);
  }

  const order = await Order.findById(orderId);
  if (!order) {
    throw new AppError("Order not found", 404);
  }
  if (order.orderStatus !== OrderStatus.READY_FOR_PICKUP) {
    throw new AppError("Order is not ready for pickup", 400);
  }
  if (order.riderId) {
    throw new AppError("Order already assigned to a rider", 400);
  }

  order.riderId = rider._id;
  order.orderStatus = OrderStatus.RIDER_ASSIGNED;
  pushTimeline(order, OrderStatus.RIDER_ASSIGNED, userId);

  rider.currentOrderId = order._id;
  rider.availabilityStatus = RiderAvailability.ON_DELIVERY;

  await Promise.all([order.save(), rider.save()]);
  const populated = await getOrderOrFail(orderId);
  broadcastOrderEvent(populated, SocketEvents.RIDER_ASSIGNED);
  return populated;
}

export async function rejectOrder(userId: string, orderId: string, reason?: string) {
  const rider = await getRiderByUserId(userId);
  const order = await Order.findById(orderId);
  if (!order) {
    throw new AppError("Order not found", 404);
  }

  if (
    order.orderStatus !== OrderStatus.RIDER_ASSIGNED ||
    !order.riderId ||
    idString(order.riderId) !== rider._id.toString()
  ) {
    throw new AppError("You cannot reject this order", 400);
  }

  order.riderId = undefined;
  order.orderStatus = OrderStatus.READY_FOR_PICKUP;
  pushTimeline(order, `REJECTED_BY_RIDER: ${reason ?? "no reason"}`, userId);

  rider.currentOrderId = undefined;
  rider.availabilityStatus = rider.onlineStatus
    ? RiderAvailability.AVAILABLE
    : RiderAvailability.OFFLINE;

  await Promise.all([order.save(), rider.save()]);
  emitOrderStatusChange(order);
  return order;
}

export async function pickupOrder(userId: string, orderId: string) {
  const rider = await getRiderByUserId(userId);
  const order = await Order.findById(orderId);
  if (!order) {
    throw new AppError("Order not found", 404);
  }
  assertRiderOwnsOrder(rider, order);

  if (order.orderStatus !== OrderStatus.RIDER_ASSIGNED) {
    throw new AppError("Order must be assigned before pickup", 400);
  }

  order.orderStatus = OrderStatus.PICKED_UP;
  order.pickedUpAt = new Date();
  pushTimeline(order, OrderStatus.PICKED_UP, userId);

  order.orderStatus = OrderStatus.ON_THE_WAY;
  pushTimeline(order, OrderStatus.ON_THE_WAY, userId);

  await order.save();
  const populated = await getOrderOrFail(orderId);
  emitOrderStatusChange(populated);
  return populated;
}

export async function completeDelivery(userId: string, orderId: string) {
  const rider = await getRiderByUserId(userId);
  const order = await Order.findById(orderId);
  if (!order) {
    throw new AppError("Order not found", 404);
  }
  assertRiderOwnsOrder(rider, order);

  if (order.orderStatus !== OrderStatus.ON_THE_WAY) {
    throw new AppError("Start delivery (pickup) before completing", 400);
  }

  order.orderStatus = OrderStatus.DELIVERED;
  order.deliveredAt = new Date();
  if (order.paymentMethod === PaymentMethod.COD) {
    order.paymentStatus = PaymentStatus.CAPTURED;
  }
  pushTimeline(order, OrderStatus.DELIVERED, userId);

  rider.currentOrderId = undefined;
  rider.availabilityStatus = rider.onlineStatus
    ? RiderAvailability.AVAILABLE
    : RiderAvailability.OFFLINE;

  await Promise.all([order.save(), rider.save()]);
  const { recordOrderFinancialsOnDelivery } = await import("./finance.service.js");
  await recordOrderFinancialsOnDelivery(orderId);
  await clearLiveRiderLocation(orderId);
  const populated = await getOrderOrFail(orderId);
  emitOrderStatusChange(populated);
  return populated;
}

export async function getRiderEarnings(userId: string) {
  const rider = await getRiderByUserId(userId);
  return {
    riderCode: rider.riderCode,
    totalDeliveries: rider.totalDeliveries,
    totalEarnings: rider.totalEarnings,
    todayEarnings: rider.todayEarnings,
    earningPerDelivery: RIDER_EARNING_PER_DELIVERY,
  };
}

export async function getRiderDeliveryHistory(
  userId: string,
  page: number,
  limit: number,
  skip: number,
) {
  const rider = await getRiderByUserId(userId);
  const filter = {
    riderId: rider._id,
    orderStatus: OrderStatus.DELIVERED,
  };

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ deliveredAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("restaurantId", "restaurantName logo slug")
      .lean(),
    Order.countDocuments(filter),
  ]);

  return { orders, total };
}

export async function approveRiderDev(riderId: string) {
  if (process.env.NODE_ENV === "production") {
    throw new AppError("Not available in production", 403);
  }
  const rider = await getRiderOrFail(riderId);
  rider.verificationStatus = VerificationStatus.APPROVED;
  await rider.save();
  return rider;
}
