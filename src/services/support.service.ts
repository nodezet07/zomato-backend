import mongoose from "mongoose";
import SupportTicket from "../models/supportTicket.model.js";
import Order from "../models/order.model.js";
import Restaurant from "../models/restaurant.model.js";
import { AppError } from "../utils/AppError.js";
import {
  OrderStatus,
  SupportIssueType,
  TicketStatus,
} from "../types/enums.js";
import { getPagination, paginationMeta } from "../helpers/pagination.js";
import { idString } from "./order.service.js";

export function generateTicketNumber(): string {
  return `TKT-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
}

export async function createSupportTicket(input: {
  customerId: string;
  issueType: SupportIssueType;
  description: string;
  orderId?: string;
  images?: string[];
}) {
  if (input.orderId) {
    const order = await Order.findById(input.orderId);
    if (!order) {
      throw new AppError("Order not found", 404);
    }
    if (idString(order.customerId) !== input.customerId) {
      throw new AppError("You do not own this order", 403);
    }
    if (
      input.issueType === SupportIssueType.REFUND &&
      order.orderStatus !== OrderStatus.DELIVERED
    ) {
      throw new AppError("Refund can only be requested for delivered orders", 400);
    }
  }

  const existing = input.orderId
    ? await SupportTicket.findOne({
        customerId: input.customerId,
        orderId: input.orderId,
        issueType: input.issueType,
        status: { $in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] },
      })
    : null;

  if (existing) {
    throw new AppError(
      "An open ticket already exists for this order and issue type",
      400,
    );
  }

  const ticket = await SupportTicket.create({
    ticketNumber: generateTicketNumber(),
    customerId: input.customerId,
    orderId: input.orderId,
    issueType: input.issueType,
    description: input.description,
    images: input.images ?? [],
    status: TicketStatus.OPEN,
    replies: [],
  });

  return ticket;
}

export async function listCustomerTickets(
  customerId: string,
  query: { page?: string; limit?: string; status?: string },
) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
  const filter: Record<string, unknown> = { customerId };
  if (query.status) filter.status = query.status;

  const [tickets, total] = await Promise.all([
    SupportTicket.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("orderId", "orderNumber orderStatus grandTotal")
      .lean(),
    SupportTicket.countDocuments(filter),
  ]);

  return { tickets, pagination: paginationMeta(total, page, limit) };
}

export async function listRestaurantSupportTickets(
  restaurantId: string,
  ownerUserId: string,
  query: { page?: string; limit?: string; status?: string; issueType?: string },
) {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) {
    throw new AppError("Restaurant not found", 404);
  }
  if (restaurant.ownerId.toString() !== ownerUserId) {
    throw new AppError("Not your restaurant", 403);
  }

  const orderIds = await Order.find({ restaurantId: restaurant._id }).distinct("_id");
  if (orderIds.length === 0) {
    const { page, limit } = getPagination(query.page, query.limit);
    return { tickets: [], pagination: paginationMeta(0, page, limit) };
  }

  const { page, limit, skip } = getPagination(query.page, query.limit);
  const filter: Record<string, unknown> = { orderId: { $in: orderIds } };
  if (query.status) filter.status = query.status;
  if (query.issueType) filter.issueType = query.issueType;

  const [tickets, total] = await Promise.all([
    SupportTicket.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("customerId", "fullName email mobile")
      .populate("orderId", "orderNumber orderStatus grandTotal refundAmount")
      .lean(),
    SupportTicket.countDocuments(filter),
  ]);

  return { tickets, pagination: paginationMeta(total, page, limit) };
}

export async function listAllTickets(query: {
  page?: string;
  limit?: string;
  status?: string;
  issueType?: string;
}) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.issueType) filter.issueType = query.issueType;

  const [tickets, total] = await Promise.all([
    SupportTicket.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("customerId", "fullName email mobile")
      .populate("orderId", "orderNumber orderStatus grandTotal")
      .populate("assignedAdminId", "name email")
      .lean(),
    SupportTicket.countDocuments(filter),
  ]);

  return { tickets, pagination: paginationMeta(total, page, limit) };
}

export async function getTicketById(
  ticketId: string,
  requester: { userId?: string; adminId?: string },
) {
  const ticket = await SupportTicket.findById(ticketId)
    .populate("customerId", "fullName email mobile")
    .populate("orderId", "orderNumber orderStatus grandTotal paymentStatus")
    .populate("assignedAdminId", "name email");

  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }

  if (requester.adminId) {
    return ticket;
  }

  const customerId = idString(
    ticket.customerId as mongoose.Types.ObjectId | { _id?: mongoose.Types.ObjectId },
  );

  if (requester.userId && customerId === requester.userId) {
    return ticket;
  }

  throw new AppError("You do not have access to this ticket", 403);
}

export async function addTicketReply(input: {
  ticketId: string;
  authorId: string;
  authorRole: "customer" | "admin";
  message: string;
}) {
  const ticket = await SupportTicket.findById(input.ticketId);
  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }

  if (input.authorRole === "customer") {
    if (ticket.customerId.toString() !== input.authorId) {
      throw new AppError("You do not own this ticket", 403);
    }
  }

  if (
    ticket.status === TicketStatus.CLOSED ||
    ticket.status === TicketStatus.RESOLVED
  ) {
    throw new AppError("Cannot reply to a closed ticket", 400);
  }

  ticket.replies.push({
    authorId: new mongoose.Types.ObjectId(input.authorId),
    authorRole: input.authorRole,
    message: input.message,
    createdAt: new Date(),
  });

  if (ticket.status === TicketStatus.OPEN && input.authorRole === "admin") {
    ticket.status = TicketStatus.IN_PROGRESS;
    ticket.assignedAdminId = new mongoose.Types.ObjectId(input.authorId);
  }

  await ticket.save();
  return ticket;
}

export async function updateTicketAsCustomer(
  ticketId: string,
  customerId: string,
  status: TicketStatus,
) {
  if (status !== TicketStatus.CLOSED) {
    throw new AppError("Customers can only close their own tickets", 400);
  }

  const ticket = await SupportTicket.findOne({
    _id: ticketId,
    customerId,
  });
  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }

  ticket.status = TicketStatus.CLOSED;
  await ticket.save();
  return ticket;
}

export async function updateTicketAsAdmin(
  ticketId: string,
  adminId: string,
  input: {
    status?: TicketStatus;
    resolution?: string;
    assignedAdminId?: string;
  },
) {
  const ticket = await SupportTicket.findById(ticketId);
  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }

  if (input.status) {
    ticket.status = input.status;
    if (
      input.status === TicketStatus.RESOLVED ||
      input.status === TicketStatus.CLOSED
    ) {
      if (!input.resolution && !ticket.resolution) {
        throw new AppError("Resolution message required when resolving ticket", 400);
      }
    }
  }

  if (input.resolution) {
    ticket.resolution = input.resolution;
  }

  if (input.assignedAdminId) {
    ticket.assignedAdminId = new mongoose.Types.ObjectId(input.assignedAdminId);
  } else if (!ticket.assignedAdminId) {
    ticket.assignedAdminId = new mongoose.Types.ObjectId(adminId);
  }

  if (
    ticket.status === TicketStatus.RESOLVED ||
    ticket.status === TicketStatus.CLOSED
  ) {
    ticket.assignedAdminId =
      ticket.assignedAdminId ?? new mongoose.Types.ObjectId(adminId);
  }

  await ticket.save();
  return ticket;
}
