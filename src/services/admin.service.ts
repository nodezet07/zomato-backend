import AdminUser from "../models/adminUser.model.js";
import mongoose from "mongoose";
import User from "../models/user.model.js";
import Restaurant from "../models/restaurant.model.js";
import Rider from "../models/rider.model.js";
import Order from "../models/order.model.js";
import Payment from "../models/payment.model.js";
import SupportTicket from "../models/supportTicket.model.js";
import { AppError } from "../utils/AppError.js";
import {
  AccountStatus,
  LoginProvider,
  OrderStatus,
  PaymentStatus,
  RestaurantStatus,
  TicketStatus,
  SupportIssueType,
  UserRole,
  VerificationStatus,
} from "../types/enums.js";
import { uniqueSlug } from "../utils/slug.js";
import { buildGeoPoint } from "./restaurant.service.js";
import { emitOrderStatusChange } from "./socket.service.js";
import { getPagination, paginationMeta } from "../helpers/pagination.js";
import { signAdminAccessToken, signAdminRefreshToken } from "../utils/jwtAdmin.js";

export async function adminLogin(email: string, password: string) {
  const admin = await AdminUser.findOne({ email: email.toLowerCase() }).select(
    "+password",
  );
  if (!admin || !admin.isActive) {
    throw new AppError("Invalid admin credentials", 401);
  }

  const valid = await admin.comparePassword(password);
  if (!valid) {
    throw new AppError("Invalid admin credentials", 401);
  }

  const accessToken = signAdminAccessToken(admin._id.toString(), admin.role);
  const refreshToken = signAdminRefreshToken(admin._id.toString(), admin.role);

  return {
    admin: {
      _id: admin._id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    },
    accessToken,
    refreshToken,
  };
}

export async function getDashboardStats() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    totalUsers,
    totalRestaurants,
    pendingRestaurants,
    totalRiders,
    pendingRiders,
    totalOrders,
    todayOrders,
    activeOrders,
    deliveredOrders,
    revenueAgg,
    pendingRefunds,
    capturedPayments,
  ] = await Promise.all([
    User.countDocuments({ isDeleted: false }),
    Restaurant.countDocuments({ isDeleted: false }),
    Restaurant.countDocuments({
      isDeleted: false,
      restaurantStatus: RestaurantStatus.PENDING,
    }),
    Rider.countDocuments({}),
    Rider.countDocuments({ verificationStatus: VerificationStatus.PENDING }),
    Order.countDocuments({}),
    Order.countDocuments({ createdAt: { $gte: todayStart } }),
    Order.countDocuments({
      orderStatus: {
        $in: [
          OrderStatus.PENDING,
          OrderStatus.CONFIRMED,
          OrderStatus.PREPARING,
          OrderStatus.READY_FOR_PICKUP,
          OrderStatus.RIDER_ASSIGNED,
          OrderStatus.PICKED_UP,
          OrderStatus.ON_THE_WAY,
        ],
      },
    }),
    Order.countDocuments({ orderStatus: OrderStatus.DELIVERED }),
    Order.aggregate([
      { $match: { orderStatus: OrderStatus.DELIVERED } },
      { $group: { _id: null, total: { $sum: "$grandTotal" } } },
    ]),
    SupportTicket.countDocuments({
      issueType: SupportIssueType.REFUND,
      status: { $in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] },
    }),
    Payment.countDocuments({ paymentStatus: PaymentStatus.CAPTURED }),
  ]);

  return {
    users: { total: totalUsers },
    restaurants: {
      total: totalRestaurants,
      pendingApproval: pendingRestaurants,
    },
    riders: { total: totalRiders, pendingApproval: pendingRiders },
    orders: {
      total: totalOrders,
      today: todayOrders,
      active: activeOrders,
      delivered: deliveredOrders,
    },
    revenue: {
      totalDelivered: revenueAgg[0]?.total ?? 0,
      capturedPayments,
    },
    support: { pendingRefundTickets: pendingRefunds },
  };
}

export async function listUsers(query: {
  page?: string;
  limit?: string;
  role?: string;
  accountStatus?: string;
}) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
  const filter: Record<string, unknown> = { isDeleted: false };
  if (query.role) filter.role = query.role;
  if (query.accountStatus) filter.accountStatus = query.accountStatus;

  const [users, total] = await Promise.all([
    User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  return { users, pagination: paginationMeta(total, page, limit) };
}

export async function setUserBlocked(userId: string, block: boolean) {
  const user = await User.findById(userId);
  if (!user || user.isDeleted) {
    throw new AppError("User not found", 404);
  }
  user.accountStatus = block ? AccountStatus.BLOCKED : AccountStatus.ACTIVE;
  await user.save();
  return user;
}

export async function listRestaurants(query: {
  page?: string;
  limit?: string;
  status?: string;
}) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
  const filter: Record<string, unknown> = { isDeleted: false };
  if (query.status) filter.restaurantStatus = query.status;

  const [restaurants, total] = await Promise.all([
    Restaurant.find(filter)
      .populate("ownerId", "fullName email mobile")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Restaurant.countDocuments(filter),
  ]);

  return { restaurants, pagination: paginationMeta(total, page, limit) };
}

export async function adminCreateRestaurant(body: {
  ownerEmail: string;
  ownerFullName: string;
  ownerMobile?: string;
  autoApprove?: boolean;
  restaurantName: string;
  latitude: number;
  longitude: number;
  description?: string;
  phone?: string;
  email?: string;
  cuisines?: string[];
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    pincode?: string;
  };
  deliveryRadiusKm?: number;
  averageDeliveryTime?: number;
  minimumOrderAmount?: number;
  packagingCharge?: number;
}) {
  const email = body.ownerEmail.toLowerCase().trim();

  if (body.ownerMobile) {
    const mobileOwner = await User.findOne({
      mobile: body.ownerMobile,
      isDeleted: false,
    });
    if (mobileOwner && mobileOwner.email?.toLowerCase() !== email) {
      throw new AppError(
        `Mobile number ${body.ownerMobile} is already registered to another account (${mobileOwner.email ?? "unknown email"}).`,
        400,
      );
    }
  }

  let owner = await User.findOne({ email, isDeleted: false });

  if (owner) {
    if (owner.role === UserRole.RIDER || owner.role === UserRole.ADMIN) {
      throw new AppError("This user account cannot own a restaurant", 400);
    }
    const existingRestaurant = await Restaurant.findOne({
      ownerId: owner._id,
      isDeleted: false,
    });
    if (existingRestaurant) {
      throw new AppError("This owner already has a restaurant", 400);
    }
    owner.fullName = body.ownerFullName;
    if (body.ownerMobile) owner.mobile = body.ownerMobile;
    if (owner.role === UserRole.CUSTOMER) {
      owner.role = UserRole.RESTAURANT_OWNER;
    }
    owner.isEmailVerified = true;
    owner.accountStatus = AccountStatus.ACTIVE;
    await owner.save();
  } else {
    owner = await User.create({
      email,
      fullName: body.ownerFullName,
      mobile: body.ownerMobile,
      role: UserRole.RESTAURANT_OWNER,
      loginProvider: LoginProvider.EMAIL,
      isEmailVerified: true,
      accountStatus: AccountStatus.ACTIVE,
    });
  }

  const {
    ownerEmail: _ownerEmail,
    ownerFullName: _ownerFullName,
    ownerMobile: _ownerMobile,
    autoApprove,
    latitude,
    longitude,
    restaurantName,
    ...rest
  } = body;

  const slug = await uniqueSlug(restaurantName, async (s) => {
    const found = await Restaurant.findOne({ slug: s });
    return !!found;
  });

  const approved = autoApprove !== false;

  const restaurant = await Restaurant.create({
    ownerId: owner._id,
    restaurantName,
    slug,
    ...rest,
    latitude,
    longitude,
    location: buildGeoPoint(latitude, longitude),
    restaurantStatus: approved
      ? RestaurantStatus.APPROVED
      : RestaurantStatus.PENDING,
    isOpen: approved,
  });

  await restaurant.populate("ownerId", "fullName email mobile");

  return { restaurant, owner };
}

export async function approveRestaurant(restaurantId: string) {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant || restaurant.isDeleted) {
    throw new AppError("Restaurant not found", 404);
  }
  restaurant.restaurantStatus = RestaurantStatus.APPROVED;
  restaurant.isOpen = true;
  await restaurant.save();
  return restaurant;
}

export async function rejectRestaurant(restaurantId: string, reason?: string) {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant || restaurant.isDeleted) {
    throw new AppError("Restaurant not found", 404);
  }
  restaurant.restaurantStatus = RestaurantStatus.REJECTED;
  restaurant.isOpen = false;
  await restaurant.save();
  void reason;
  return restaurant;
}

export async function listRiders(query: {
  page?: string;
  limit?: string;
  verificationStatus?: string;
}) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
  const filter: Record<string, unknown> = {};
  if (query.verificationStatus) {
    filter.verificationStatus = query.verificationStatus;
  }

  const [riders, total] = await Promise.all([
    Rider.find(filter)
      .populate("userId", "fullName email mobile")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Rider.countDocuments(filter),
  ]);

  return { riders, pagination: paginationMeta(total, page, limit) };
}

export async function approveRider(riderId: string) {
  const rider = await Rider.findById(riderId);
  if (!rider) {
    throw new AppError("Rider not found", 404);
  }
  rider.verificationStatus = VerificationStatus.APPROVED;
  await rider.save();
  return rider;
}

export async function rejectRider(riderId: string, reason?: string) {
  const rider = await Rider.findById(riderId);
  if (!rider) {
    throw new AppError("Rider not found", 404);
  }
  rider.verificationStatus = VerificationStatus.REJECTED;
  await rider.save();
  void reason;
  return rider;
}

export async function listOrders(query: {
  page?: string;
  limit?: string;
  orderStatus?: string;
}) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
  const filter: Record<string, unknown> = {};
  if (query.orderStatus) filter.orderStatus = query.orderStatus;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("customerId", "fullName email mobile")
      .populate("restaurantId", "restaurantName slug")
      .populate("riderId", "riderCode")
      .lean(),
    Order.countDocuments(filter),
  ]);

  return { orders, pagination: paginationMeta(total, page, limit) };
}

export async function adminCancelOrder(orderId: string, reason?: string) {
  const order = await Order.findById(orderId);
  if (!order) {
    throw new AppError("Order not found", 404);
  }
  if (order.orderStatus === OrderStatus.DELIVERED) {
    throw new AppError("Cannot cancel a delivered order", 400);
  }
  if (order.orderStatus === OrderStatus.CANCELLED) {
    throw new AppError("Order is already cancelled", 400);
  }

  order.orderStatus = OrderStatus.CANCELLED;
  order.cancelledAt = new Date();
  order.cancellationReason = reason ?? "Cancelled by admin";
  order.timelineLogs.push({
    status: OrderStatus.CANCELLED,
    updatedBy: "admin",
    timestamp: new Date(),
  });
  await order.save();
  emitOrderStatusChange(order);
  return order;
}

export async function listRefundTickets(query: {
  page?: string;
  limit?: string;
}) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
  const filter = {
    issueType: SupportIssueType.REFUND,
    status: { $in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] },
  };

  const [tickets, total] = await Promise.all([
    SupportTicket.find(filter)
      .populate("customerId", "fullName email")
      .populate("orderId", "orderNumber grandTotal orderStatus")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SupportTicket.countDocuments(filter),
  ]);

  return { tickets, pagination: paginationMeta(total, page, limit) };
}

export async function approveRefundTicket(
  adminId: string,
  ticketId: string,
  input: { amount?: number; reason?: string; resolution?: string },
) {
  const ticket = await SupportTicket.findById(ticketId);
  if (!ticket) {
    throw new AppError("Refund ticket not found", 404);
  }
  if (ticket.issueType !== SupportIssueType.REFUND) {
    throw new AppError("Not a refund ticket", 400);
  }
  if (![TicketStatus.OPEN, TicketStatus.IN_PROGRESS].includes(ticket.status)) {
    throw new AppError("Ticket is not open for approval", 400);
  }
  if (!ticket.orderId) {
    throw new AppError("Refund ticket has no linked order", 400);
  }

  const { initiateRefundByAdmin } = await import("./payment.service.js");
  const { recordLedgerEntry } = await import("./platformConfig.service.js");

  const result = await initiateRefundByAdmin(
    ticket.orderId.toString(),
    input.reason ?? "Admin approved refund",
    input.amount,
  );

  const refundAmount =
    input.amount ??
    (result.order?.refundAmount as number | undefined) ??
    (result.payment?.refundAmount as number | undefined) ??
    0;

  try {
    await recordLedgerEntry({
      entryType: "REFUND",
      debitAccount: "PLATFORM",
      creditAccount: "CUSTOMER",
      creditEntityId: ticket.customerId.toString(),
      amount: refundAmount,
      orderId: ticket.orderId.toString(),
      description: `Refund approved for ticket ${ticket.ticketNumber}`,
      metadata: { ticketId, adminId },
    });
  } catch {
    /* best-effort */
  }

  ticket.status = TicketStatus.RESOLVED;
  ticket.resolution = input.resolution ?? "Refund approved and processed by admin";
  ticket.assignedAdminId = new mongoose.Types.ObjectId(adminId);
  await ticket.save();

  return { ticket, refund: result };
}

export async function rejectRefundTicket(
  adminId: string,
  ticketId: string,
  input: { reason: string; resolution?: string },
) {
  const ticket = await SupportTicket.findById(ticketId);
  if (!ticket) {
    throw new AppError("Refund ticket not found", 404);
  }
  if (ticket.issueType !== SupportIssueType.REFUND) {
    throw new AppError("Not a refund ticket", 400);
  }
  if (![TicketStatus.OPEN, TicketStatus.IN_PROGRESS].includes(ticket.status)) {
    throw new AppError("Ticket is not open for rejection", 400);
  }

  ticket.status = TicketStatus.CLOSED;
  ticket.resolution = input.resolution ?? `Refund rejected: ${input.reason}`;
  ticket.assignedAdminId = new mongoose.Types.ObjectId(adminId);
  await ticket.save();

  return { ticket };
}
