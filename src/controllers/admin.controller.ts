import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/auth.types.js";
import { sendSuccess } from "../utils/apiResponse.js";
import {
  adminLogin,
  getDashboardStats,
  listUsers,
  setUserBlocked,
  listRestaurants,
  approveRestaurant,
  rejectRestaurant,
  listRiders,
  approveRider,
  rejectRider,
  listOrders,
  adminCancelOrder,
  listRefundTickets,
  approveRefundTicket,
  rejectRefundTicket,
} from "../services/admin.service.js";
import {
  listAllTickets,
  getTicketById,
  addTicketReply,
  updateTicketAsAdmin,
} from "../services/support.service.js";
import { buildAuditContext, writeAuditLog, listAuditLogs } from "../services/audit.service.js";

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

// POST /admin/login
export const login = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await adminLogin(req.body.email, req.body.password);
    sendSuccess(res, "Admin login successful", result);
  } catch (err) {
    next(err);
  }
};

// GET /admin/dashboard
export const dashboard = async (
  _req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const stats = await getDashboardStats();
    sendSuccess(res, "Dashboard stats", { stats });
  } catch (err) {
    next(err);
  }
};

// GET /admin/users
export const getUsers = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await listUsers({
      page: req.query.page as string | undefined,
      limit: req.query.limit as string | undefined,
      role: req.query.role as string | undefined,
      accountStatus: req.query.accountStatus as string | undefined,
    });
    sendSuccess(res, "Users fetched", result);
  } catch (err) {
    next(err);
  }
};

// PATCH /admin/users/block/:userId
export const blockUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = paramId(req.params.userId);
    const user = await setUserBlocked(userId, true);
    await writeAuditLog(buildAuditContext(req), {
      module: "user",
      action: "block",
      entityId: userId,
    });
    sendSuccess(res, "User blocked", { user: user.getPublicProfile() });
  } catch (err) {
    next(err);
  }
};

// PATCH /admin/users/unblock/:userId
export const unblockUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = paramId(req.params.userId);
    const user = await setUserBlocked(userId, false);
    await writeAuditLog(buildAuditContext(req), {
      module: "user",
      action: "unblock",
      entityId: userId,
    });
    sendSuccess(res, "User unblocked", { user: user.getPublicProfile() });
  } catch (err) {
    next(err);
  }
};

// GET /admin/restaurants
export const getRestaurants = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await listRestaurants({
      page: req.query.page as string | undefined,
      limit: req.query.limit as string | undefined,
      status: req.query.status as string | undefined,
    });
    sendSuccess(res, "Restaurants fetched", result);
  } catch (err) {
    next(err);
  }
};

// PATCH /admin/restaurants/approve/:restaurantId
export const approveRestaurantHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const restaurantId = paramId(req.params.restaurantId);
    const restaurant = await approveRestaurant(restaurantId);
    await writeAuditLog(buildAuditContext(req), {
      module: "restaurant",
      action: "approve",
      entityId: restaurantId,
      newData: { restaurantStatus: restaurant.restaurantStatus },
    });
    sendSuccess(res, "Restaurant approved", { restaurant });
  } catch (err) {
    next(err);
  }
};

// PATCH /admin/restaurants/reject/:restaurantId
export const rejectRestaurantHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const restaurantId = paramId(req.params.restaurantId);
    const restaurant = await rejectRestaurant(restaurantId, req.body.reason);
    await writeAuditLog(buildAuditContext(req), {
      module: "restaurant",
      action: "reject",
      entityId: restaurantId,
      newData: { reason: req.body.reason },
    });
    sendSuccess(res, "Restaurant rejected", { restaurant });
  } catch (err) {
    next(err);
  }
};

// GET /admin/riders
export const getRiders = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await listRiders({
      page: req.query.page as string | undefined,
      limit: req.query.limit as string | undefined,
      verificationStatus: req.query.verificationStatus as string | undefined,
    });
    sendSuccess(res, "Riders fetched", result);
  } catch (err) {
    next(err);
  }
};

// PATCH /admin/riders/approve/:riderId
export const approveRiderHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const riderId = paramId(req.params.riderId);
    const rider = await approveRider(riderId);
    await writeAuditLog(buildAuditContext(req), {
      module: "rider",
      action: "approve",
      entityId: riderId,
    });
    sendSuccess(res, "Rider approved", { rider });
  } catch (err) {
    next(err);
  }
};

// PATCH /admin/riders/reject/:riderId
export const rejectRiderHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const riderId = paramId(req.params.riderId);
    const rider = await rejectRider(riderId, req.body.reason);
    await writeAuditLog(buildAuditContext(req), {
      module: "rider",
      action: "reject",
      entityId: riderId,
      newData: { reason: req.body.reason },
    });
    sendSuccess(res, "Rider rejected", { rider });
  } catch (err) {
    next(err);
  }
};

// GET /admin/orders
export const getOrders = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await listOrders({
      page: req.query.page as string | undefined,
      limit: req.query.limit as string | undefined,
      orderStatus: req.query.orderStatus as string | undefined,
    });
    sendSuccess(res, "Orders fetched", result);
  } catch (err) {
    next(err);
  }
};

// PATCH /admin/orders/cancel/:orderId
export const cancelOrder = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const orderId = paramId(req.params.orderId);
    const order = await adminCancelOrder(orderId, req.body.reason);
    await writeAuditLog(buildAuditContext(req), {
      module: "order",
      action: "admin_cancel",
      entityId: orderId,
      newData: { reason: req.body.reason },
    });
    sendSuccess(res, "Order cancelled by admin", { order });
  } catch (err) {
    next(err);
  }
};

// GET /admin/refunds — refund support tickets
export const getRefunds = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await listRefundTickets({
      page: req.query.page as string | undefined,
      limit: req.query.limit as string | undefined,
    });
    sendSuccess(res, "Refund requests fetched", result);
  } catch (err) {
    next(err);
  }
};

// POST /admin/refunds/:ticketId/approve
export const approveRefundHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await approveRefundTicket(
      req.adminId!,
      paramId(req.params.ticketId),
      req.body,
    );
    await writeAuditLog(buildAuditContext(req), {
      module: "refund",
      action: "REFUND_APPROVED",
      entityId: paramId(req.params.ticketId),
    });
    sendSuccess(res, "Refund approved and processed", result);
  } catch (err) {
    next(err);
  }
};

export const rejectRefundHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await rejectRefundTicket(
      req.adminId!,
      paramId(req.params.ticketId),
      req.body,
    );
    await writeAuditLog(buildAuditContext(req), {
      module: "refund",
      action: "REFUND_REJECTED",
      entityId: paramId(req.params.ticketId),
      newData: { reason: req.body.reason },
    });
    sendSuccess(res, "Refund rejected", result);
  } catch (err) {
    next(err);
  }
};

export const getAuditLogs = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await listAuditLogs({
      page: req.query.page as string | undefined,
      limit: req.query.limit as string | undefined,
      module: req.query.module as string | undefined,
      action: req.query.action as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    sendSuccess(res, "Audit logs fetched", result);
  } catch (err) {
    next(err);
  }
};

// GET /admin/support/tickets
export const getSupportTickets = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await listAllTickets({
      page: req.query.page as string | undefined,
      limit: req.query.limit as string | undefined,
      status: req.query.status as string | undefined,
      issueType: req.query.issueType as string | undefined,
    });
    sendSuccess(res, "Support tickets fetched", result);
  } catch (err) {
    next(err);
  }
};

// GET /admin/support/tickets/:ticketId
export const getSupportTicket = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const ticket = await getTicketById(paramId(req.params.ticketId), {
      adminId: req.adminId,
    });
    sendSuccess(res, "Ticket fetched", { ticket });
  } catch (err) {
    next(err);
  }
};

// POST /admin/support/tickets/reply
export const adminReplyTicket = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const ticket = await addTicketReply({
      ticketId: req.body.ticketId,
      authorId: req.adminId!,
      authorRole: "admin",
      message: req.body.message,
    });
    sendSuccess(res, "Reply added", { ticket });
  } catch (err) {
    next(err);
  }
};

// PATCH /admin/support/tickets/:ticketId
export const resolveSupportTicket = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const ticket = await updateTicketAsAdmin(
      paramId(req.params.ticketId),
      req.adminId!,
      req.body,
    );
    sendSuccess(res, "Ticket updated", { ticket });
  } catch (err) {
    next(err);
  }
};
