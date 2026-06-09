import { z } from "zod";

export const createCategorySchema = z.object({
  restaurantId: z.string().min(1),
  categoryName: z.string().min(1).max(80),
  categoryImage: z
    .union([
      z.string().url(),
      z.string().regex(/^data:image\/[a-zA-Z0-9+.-]+;base64,/),
    ])
    .optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateCategorySchema = z.object({
  categoryName: z.string().min(1).max(80).optional(),
  categoryImage: z
    .union([
      z.string().url(),
      z.string().regex(/^data:image\/[a-zA-Z0-9+.-]+;base64,/),
    ])
    .optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const createMenuItemSchema = z.object({
  restaurantId: z.string().min(1),
  categoryId: z.string().min(1),
  itemName: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  shortDescription: z.string().max(200).optional(),
  images: z
    .array(
      z.union([
        z.string().url(),
        z.string().regex(/^data:image\/[a-zA-Z0-9+.-]+;base64,/),
      ]),
    )
    .optional(),
  price: z.number().min(0),
  discountedPrice: z.number().min(0).optional(),
  taxPercentage: z.number().min(0).max(100).optional(),
  foodType: z.enum(["veg", "nonveg", "egg"]),
  spiceLevel: z.enum(["low", "medium", "high"]).optional(),
  ingredients: z.array(z.string()).optional(),
  addons: z
    .array(
      z.object({
        name: z.string(),
        price: z.number().min(0),
        isAvailable: z.boolean().optional(),
      }),
    )
    .optional(),
  preparationTimeMinutes: z.number().min(1).max(180).optional(),
  isRecommended: z.boolean().optional(),
});

export const updateMenuItemSchema = createMenuItemSchema
  .omit({ restaurantId: true, categoryId: true })
  .partial();

export const toggleAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
});

export const comboItemSchema = z.object({
  menuItemId: z.string().min(1),
  quantity: z.number().int().min(1).max(10).optional(),
});

export const createMenuComboSchema = z.object({
  restaurantId: z.string().min(1),
  title: z.string().min(1).max(120),
  tag: z.string().max(80).optional(),
  image: z
    .union([
      z.string().url(),
      z.string().regex(/^data:image\/[a-zA-Z0-9+.-]+;base64,/),
      z.literal(""),
    ])
    .optional(),
  price: z.number().min(0),
  foodType: z.enum(["veg", "nonveg", "egg"]),
  items: z.array(comboItemSchema).min(2),
  mainItemId: z.string().min(1),
  sortOrder: z.number().int().min(0).optional(),
  isAvailable: z.boolean().optional(),
});

export const updateMenuComboSchema = createMenuComboSchema
  .omit({ restaurantId: true })
  .partial();

export const menuSearchSchema = z.object({
  q: z.string().min(1).max(100),
  restaurantId: z.string().optional(),
  foodType: z.enum(["veg", "nonveg", "egg"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
