import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/auth.types.js";
import Order from "../models/order.model.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";
import { getPagination, paginationMeta } from "../helpers/pagination.js";
import {
  createOrderFromCart,
  getOrderOrFail,
  assertOrderAccess,
  updateOrderStatus,
  cancelOrder,
  assignRiderToOrder,
  verifyDeliveryOtp,
  buildTrackPayload,
  attachLiveRiderLocation,
  requestRefund,
  ACTIVE_STATUSES,
} from "../services/order.service.js";
import { OrderStatus, RiderAvailability, VerificationStatus } from "../types/enums.js";
import Restaurant from "../models/restaurant.model.js";
import Rider from "../models/rider.model.js";
import { AppError } from "../utils/AppError.js";

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

// POST /orders/create
export const createOrder = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const order = await createOrderFromCart(req.userId!, req.body);
    const populated = await getOrderOrFail(order._id.toString());
    sendSuccess(res, "Order placed successfully", { order: populated }, 201);
  } catch (err) {
    next(err);
  }
};

// GET /orders/:orderId
export const getOrderById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const orderId = paramId(req.params.orderId);
    const order = await getOrderOrFail(orderId);
    await assertOrderAccess(req, order);
    await attachLiveRiderLocation(order);
    sendSuccess(res, "Order fetched", { order });
  } catch (err) {
    next(err);
  }
};

// GET /orders/user/history
export const getOrderHistory = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { page, limit, skip } = getPagination(
      req.query.page as string | undefined,
      req.query.limit as string | undefined,
    );

    const filter = { customerId: req.userId };
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("restaurantId", "restaurantName logo slug")
        .lean(),
      Order.countDocuments(filter),
    ]);

    sendSuccess(res, "Order history fetched", {
      orders,
      pagination: paginationMeta(total, page, limit),
    });
  } catch (err) {
    next(err);
  }
};

// GET /orders/track/:orderId
export const trackOrder = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const orderId = paramId(req.params.orderId);
    const order = await getOrderOrFail(orderId);
    await assertOrderAccess(req, order);
    sendSuccess(res, "Order tracking", {
      tracking: await buildTrackPayload(order),
    });
  } catch (err) {
    next(err);
  }
};

// GET /orders/track/:orderId/route — road polyline for live map
export const trackOrderRoute = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const orderId = paramId(req.params.orderId);
    const order = await getOrderOrFail(orderId);
    await assertOrderAccess(req, order);
    const { googleRoutePolyline } = await import("../services/google-maps.service.js");
    const { getLiveRiderLocation } = await import("../services/tracking.service.js");

    const live = await getLiveRiderLocation(orderId);
    const riderLoc = live
      ? { latitude: live.latitude, longitude: live.longitude }
      : order.riderLocation;
    const customerLat = order.customerAddress?.latitude;
    const customerLng = order.customerAddress?.longitude;
    const restaurantDoc = order.restaurantId as { latitude?: number; longitude?: number } | undefined;

    const customer =
      Number.isFinite(customerLat) && Number.isFinite(customerLng)
        ? { latitude: customerLat!, longitude: customerLng! }
        : null;
    const restaurant =
      restaurantDoc?.latitude != null && restaurantDoc?.longitude != null
        ? { latitude: restaurantDoc.latitude, longitude: restaurantDoc.longitude }
        : null;

    let path: Array<{ latitude: number; longitude: number }> | null = null;

    if (riderLoc && customer && ["PICKED_UP", "ON_THE_WAY"].includes(order.orderStatus)) {
      path = await googleRoutePolyline({ origin: riderLoc, destination: customer });
    } else if (restaurant && customer) {
      path = await googleRoutePolyline({
        origin: restaurant,
        destination: customer,
        waypoints: riderLoc ? [riderLoc] : undefined,
      });
    } else if (restaurant && riderLoc) {
      path = await googleRoutePolyline({ origin: restaurant, destination: riderLoc });
    }

    sendSuccess(res, "Route polyline", { path: path ?? [] });
  } catch (err) {
    next(err);
  }
};

// PATCH /orders/cancel/:orderId
export const cancelOrderHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const orderId = paramId(req.params.orderId);
    const order = await cancelOrder(req, orderId, req.body.reason);
    sendSuccess(res, "Order cancelled", { order });
  } catch (err) {
    next(err);
  }
};

// PATCH /orders/status/:orderId
export const updateStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const orderId = paramId(req.params.orderId);
    const { status, cancellationReason, estimatedPreparationTime } = req.body;
    const order = await updateOrderStatus(
      req,
      orderId,
      status as OrderStatus,
      cancellationReason,
      estimatedPreparationTime,
    );
    sendSuccess(res, "Order status updated", { order });
  } catch (err) {
    next(err);
  }
};

// GET /orders/riders/available — restaurant assigns delivery partner
export const listAvailableRiders = async (
  _req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const riders = await Rider.find({
      onlineStatus: true,
      availabilityStatus: RiderAvailability.AVAILABLE,
      verificationStatus: VerificationStatus.APPROVED,
    })
      .populate("userId", "fullName mobile")
      .select("riderCode vehicleType averageRating userId")
      .sort({ averageRating: -1 })
      .lean();

    const list = riders.map((r) => {
      const user = r.userId as { _id?: { toString(): string }; fullName?: string; mobile?: string } | null;
      return {
        riderId: r._id.toString(),
        userId: user?._id?.toString?.() ?? String(r.userId),
        fullName: user?.fullName ?? "Rider",
        mobile: user?.mobile,
        riderCode: r.riderCode,
        vehicleType: r.vehicleType,
        averageRating: r.averageRating,
      };
    });

    sendSuccess(res, "Available riders", { riders: list });
  } catch (err) {
    next(err);
  }
};

// PATCH /orders/assign-rider/:orderId
export const assignRider = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const orderId = paramId(req.params.orderId);
    const order = await assignRiderToOrder(req, orderId, req.body.riderId);
    sendSuccess(res, "Rider assigned", { order });
  } catch (err) {
    next(err);
  }
};

// POST /orders/verify-delivery-otp
export const verifyDeliveryOtpHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { orderId, otp } = req.body;
    const order = await verifyDeliveryOtp(req.userId!, orderId, otp);
    sendSuccess(res, "Delivery verified", { order });
  } catch (err) {
    next(err);
  }
};

// GET /orders/active
export const getActiveOrders = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const orders = await Order.find({
      customerId: req.userId,
      orderStatus: { $in: ACTIVE_STATUSES },
    })
      .sort({ createdAt: -1 })
      .populate("restaurantId", "restaurantName logo slug")
      .lean();

    sendSuccess(res, "Active orders fetched", { orders });
  } catch (err) {
    next(err);
  }
};

// POST /orders/refund-request
export const refundRequest = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { orderId, description } = req.body;
    const ticket = await requestRefund(req.userId!, orderId, description);
    sendSuccess(res, "Refund request submitted", { ticket }, 201);
  } catch (err) {
    next(err);
  }
};

// GET /orders/restaurant/:restaurantId — owner views restaurant orders
export const getRestaurantOrders = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const restaurantId = paramId(req.params.restaurantId);
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant || restaurant.ownerId.toString() !== req.userId) {
      throw new AppError("You do not own this restaurant", 403);
    }

    const status = req.query.status as string | undefined;

    const filter: Record<string, unknown> = { restaurantId };
    if (status) {
      filter.orderStatus = status;
    }

    const { page, limit, skip } = getPagination(
      req.query.page as string | undefined,
      req.query.limit as string | undefined,
    );

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("customerId", "fullName mobile")
        .populate({
          path: "riderId",
          select: "riderCode vehicleType userId",
          populate: { path: "userId", select: "fullName mobile" },
        })
        .lean(),
      Order.countDocuments(filter),
    ]);

    sendSuccess(res, "Restaurant orders fetched", {
      orders,
      pagination: paginationMeta(total, page, limit),
    });
  } catch (err) {
    next(err);
  }
};
