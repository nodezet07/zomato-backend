import { z } from "zod";

export const createBannerSchema = z.object({
  title: z.string().min(2).max(120),
  imageUrl: z.string().url(),
  linkUrl: z.string().url().optional(),
  placement: z.enum(["HOME", "RESTAURANT", "CHECKOUT"]).optional(),
  priority: z.number().int().optional(),
  isActive: z.boolean().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
});

export const updateBannerSchema = createBannerSchema.partial();
