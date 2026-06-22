import Banner from "../models/banner.model.js";
import { AppError } from "../utils/AppError.js";
import { getPagination, paginationMeta } from "../helpers/pagination.js";

export async function listBanners(page = 1, limit = 20, placement?: string) {
  const { skip } = getPagination(String(page), String(limit));
  const filter: Record<string, unknown> = {};
  if (placement) filter.placement = placement;

  const [banners, total] = await Promise.all([
    Banner.find(filter).sort({ priority: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    Banner.countDocuments(filter),
  ]);

  return { banners, pagination: paginationMeta(total, page, limit) };
}

export async function listActiveBanners(placement = "HOME") {
  const now = new Date();
  return Banner.find({
    isActive: true,
    placement,
    $or: [{ startsAt: { $exists: false } }, { startsAt: { $lte: now } }],
    $and: [
      { $or: [{ endsAt: { $exists: false } }, { endsAt: { $gte: now } }] },
    ],
  })
    .sort({ priority: -1 })
    .lean();
}

export async function createBanner(body: {
  title: string;
  imageUrl: string;
  linkUrl?: string;
  placement?: string;
  priority?: number;
  isActive?: boolean;
  startsAt?: string;
  endsAt?: string;
}) {
  return Banner.create({
    ...body,
    placement: body.placement ?? "HOME",
    startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
    endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
  });
}

export async function updateBanner(
  bannerId: string,
  body: Partial<{
    title: string;
    imageUrl: string;
    linkUrl: string;
    placement: string;
    priority: number;
    isActive: boolean;
    startsAt: string;
    endsAt: string;
  }>,
) {
  const banner = await Banner.findById(bannerId);
  if (!banner) throw new AppError("Banner not found", 404);

  if (body.title !== undefined) banner.title = body.title;
  if (body.imageUrl !== undefined) banner.imageUrl = body.imageUrl;
  if (body.linkUrl !== undefined) banner.linkUrl = body.linkUrl;
  if (body.placement !== undefined) banner.placement = body.placement;
  if (body.priority !== undefined) banner.priority = body.priority;
  if (body.isActive !== undefined) banner.isActive = body.isActive;
  if (body.startsAt !== undefined) banner.startsAt = body.startsAt ? new Date(body.startsAt) : undefined;
  if (body.endsAt !== undefined) banner.endsAt = body.endsAt ? new Date(body.endsAt) : undefined;

  await banner.save();
  return banner;
}

export async function deleteBanner(bannerId: string) {
  const deleted = await Banner.findByIdAndDelete(bannerId);
  if (!deleted) throw new AppError("Banner not found", 404);
  return deleted;
}
