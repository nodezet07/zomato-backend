import { z } from "zod";

const addressBody = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  pincode: z.string().optional(),
});

export const createRestaurantSchema = z.object({
  restaurantName: z.string().min(2).max(100),
  description: z.string().max(1000).optional(),
  logo: z
    .union([
      z.string().url(),
      z.string().regex(/^data:image\/[a-zA-Z0-9+.-]+;base64,/),
    ])
    .optional(),
  bannerImages: z
    .array(
      z.union([
        z.string().url(),
        z.string().regex(/^data:image\/[a-zA-Z0-9+.-]+;base64,/),
      ]),
    )
    .optional(),
  phone: z.string().regex(/^[0-9]{10}$/).optional(),
  email: z.string().email().optional(),
  cuisines: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  address: addressBody.optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  deliveryRadiusKm: z.number().min(0.5).max(50).optional(),
  averageDeliveryTime: z.number().min(5).max(180).optional(),
  minimumOrderAmount: z.number().min(0).optional(),
  packagingCharge: z.number().min(0).optional(),
  openingTime: z.string().optional(),
  closingTime: z.string().optional(),
  weeklyHours: z
    .array(
      z.object({
        day: z.string().min(1).max(12),
        open: z.string().optional(),
        close: z.string().optional(),
        isClosed: z.boolean().optional(),
      }),
    )
    .optional(),
  bankAccountDetails: z
    .object({
      accountHolderName: z.string().optional(),
      accountNumber: z.string().optional(),
      ifscCode: z.string().optional(),
    })
    .optional(),
  supportsCOD: z.boolean().optional(),
  supportsOnlinePayment: z.boolean().optional(),
  gstNumber: z.string().optional(),
  fssaiLicense: z.string().optional(),
});

export const updateRestaurantSchema = createRestaurantSchema.partial();

export const updateStatusSchema = z.object({
  isOpen: z.boolean().optional(),
  restaurantStatus: z
    .enum(["pending", "approved", "rejected", "suspended"])
    .optional(),
});

export const listRestaurantsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.enum(["rating", "deliveryTime", "distance", "newest"]).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  cuisine: z.string().optional(),
  isOpen: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  minRating: z.coerce.number().min(0).max(5).optional(),
});

export const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(0.5).max(50).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const reverseGeocodeQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export const placesAutocompleteQuerySchema = z.object({
  q: z.string().min(2).max(120),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

export const placeIdParamSchema = z.object({
  placeId: z.string().min(3).max(256),
});

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(100),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
