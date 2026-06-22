import mongoose from "mongoose";
import { Request } from "express";
import AuditLog from "../models/auditLog.model.js";
import { AuthRequest } from "../types/auth.types.js";
import logger from "../config/logger.js";

export interface AuditContext {
  actorId: string;
  actorRole: string;
  ipAddress?: string;
  deviceInfo?: string;
}

export function getClientIp(req: Request): string | undefined {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0]?.trim();
  }
  return req.ip;
}

export function buildAuditContext(req: AuthRequest): AuditContext {
  return {
    actorId: req.adminId ?? req.userId ?? "system",
    actorRole: req.adminRole ?? req.userRole ?? "system",
    ipAddress: getClientIp(req),
    deviceInfo: req.headers["user-agent"],
  };
}

export async function writeAuditLog(
  ctx: AuditContext,
  input: {
    module: string;
    action: string;
    entityId?: string;
    oldData?: Record<string, unknown>;
    newData?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await AuditLog.create({
      actorId: new mongoose.Types.ObjectId(ctx.actorId),
      actorRole: ctx.actorRole,
      module: input.module,
      action: input.action,
      entityId: input.entityId
        ? new mongoose.Types.ObjectId(input.entityId)
        : undefined,
      oldData: input.oldData,
      newData: input.newData,
      ipAddress: ctx.ipAddress,
      deviceInfo: ctx.deviceInfo,
    });
  } catch (error) {
    logger.warn("Audit log write failed", { error, action: input.action });
  }
}

export async function listAuditLogs(query: {
  page?: string;
  limit?: string;
  module?: string;
  action?: string;
  from?: string;
  to?: string;
}) {
  const page = parseInt(query.page ?? "1", 10) || 1;
  const limit = Math.min(parseInt(query.limit ?? "20", 10) || 20, 100);
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  if (query.module) filter.module = query.module;
  if (query.action) filter.action = query.action;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) (filter.createdAt as Record<string, Date>).$gte = new Date(query.from);
    if (query.to) (filter.createdAt as Record<string, Date>).$lte = new Date(query.to);
  }

  const [logs, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}
