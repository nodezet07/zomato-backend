import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/auth.types.js";
import { sendSuccess } from "../utils/apiResponse.js";
import {
  listBanners,
  listActiveBanners,
  createBanner,
  updateBanner,
  deleteBanner,
} from "../services/banner.service.js";

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export const adminListBanners = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const page = parseInt(String(req.query.page ?? "1"), 10) || 1;
    const limit = parseInt(String(req.query.limit ?? "20"), 10) || 20;
    const placement = req.query.placement as string | undefined;
    const data = await listBanners(page, limit, placement);
    sendSuccess(res, "Banners fetched", data);
  } catch (err) {
    next(err);
  }
};

export const adminCreateBanner = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const banner = await createBanner(req.body);
    sendSuccess(res, "Banner created", { banner }, 201);
  } catch (err) {
    next(err);
  }
};

export const adminUpdateBanner = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const banner = await updateBanner(paramId(req.params.bannerId), req.body);
    sendSuccess(res, "Banner updated", { banner });
  } catch (err) {
    next(err);
  }
};

export const adminDeleteBanner = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    await deleteBanner(paramId(req.params.bannerId));
    sendSuccess(res, "Banner deleted", {});
  } catch (err) {
    next(err);
  }
};

export const publicListBanners = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const placement = (req.query.placement as string) || "HOME";
    const banners = await listActiveBanners(placement);
    sendSuccess(res, "Active banners", { banners });
  } catch (err) {
    next(err);
  }
};
