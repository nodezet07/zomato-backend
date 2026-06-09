import { Response, NextFunction } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../types/auth.types.js";
import Restaurant from "../models/restaurant.model.js";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";
import { AppError } from "../utils/AppError.js";
import { uniqueSlug } from "../utils/slug.js";
import { UserRole, RestaurantStatus } from "../types/enums.js";
import {
  publicRestaurantFilter,
  buildGeoPoint,
  listRestaurants,
  nearbyRestaurants,
  searchRestaurants,
} from "../services/restaurant.service.js";
import { CacheKeys, cacheGetOrSet } from "../services/cache.service.js";
import { reverseGeocode } from "../services/geocode.service.js";
import { listRestaurantSupportTickets } from "../services/support.service.js";

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

async function getRestaurantOrFail(id: string, includePending = false) {
  const filter: Record<string, unknown> = { _id: id, isDeleted: false };
  if (!includePending) {
    Object.assign(filter, publicRestaurantFilter());
  } else {
    filter.isDeleted = false;
  }
  const restaurant = await Restaurant.findOne(filter);
  if (!restaurant) {
    throw new AppError("Restaurant not found", 404);
  }
  return restaurant;
}

function assertOwner(req: AuthRequest, restaurant: InstanceType<typeof Restaurant>) {
  if (restaurant.ownerId.toString() !== req.userId) {
    throw new AppError("You do not own this restaurant", 403);
  }
}

// POST /restaurants — owner registers restaurant (Zomato partner flow)
export const createRestaurant = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || user.isDeleted) {
      sendError(res, "User not found", 404);
      return;
    }

    const { latitude, longitude, restaurantName, ...rest } = req.body;

    const slug = await uniqueSlug(restaurantName, async (s) => {
      const found = await Restaurant.findOne({ slug: s });
      return !!found;
    });

    const restaurant = await Restaurant.create({
      ownerId: user._id,
      restaurantName,
      slug,
      ...rest,
      latitude,
      longitude,
      location: buildGeoPoint(latitude, longitude),
      restaurantStatus: RestaurantStatus.PENDING,
      isOpen: false,
    });

    if (user.role === UserRole.CUSTOMER) {
      user.role = UserRole.RESTAURANT_OWNER;
      await user.save();
    }

    sendSuccess(
      res,
      "Restaurant registered. Awaiting admin approval.",
      { restaurant },
      201,
    );
  } catch (err) {
    next(err);
  }
};

// GET /restaurants — browse (customer flow)
export const getRestaurants = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await listRestaurants({
      page: req.query.page as string | undefined,
      limit: req.query.limit as string | undefined,
      sort: req.query.sort as string | undefined,
      lat: req.query.lat ? Number(req.query.lat) : undefined,
      lng: req.query.lng ? Number(req.query.lng) : undefined,
      cuisine: req.query.cuisine as string | undefined,
      isOpen:
        req.query.isOpen !== undefined
          ? req.query.isOpen === "true"
          : undefined,
      minRating: req.query.minRating
        ? Number(req.query.minRating)
        : undefined,
    });

    sendSuccess(res, "Restaurants fetched", result);
  } catch (err) {
    next(err);
  }
};

// GET /restaurants/recommended — fetch top-rated restaurants
export const getRecommendedRestaurants = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const key = CacheKeys.recommendedRestaurants();
    const result = await cacheGetOrSet(key, async () => {
      const filter = {
        isDeleted: false,
        restaurantStatus: RestaurantStatus.APPROVED,
      };
      const restaurants = await Restaurant.find(filter)
        .sort({ averageRating: -1, totalRatings: -1 })
        .limit(10)
        .lean();
      return { restaurants };
    });

    sendSuccess(res, "Recommended restaurants fetched", result);
  } catch (err) {
    next(err);
  }
};


// GET /restaurants/nearby
export const getNearbyRestaurants = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = req.query.radiusKm
      ? Number(req.query.radiusKm)
      : 5;

    const result = await nearbyRestaurants(
      lat,
      lng,
      radiusKm,
      req.query.page as string | undefined,
      req.query.limit as string | undefined,
    );

    sendSuccess(res, "Nearby restaurants fetched", result);
  } catch (err) {
    next(err);
  }
};

// GET /restaurants/search?q=
export const searchRestaurantsHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const q = String(req.query.q);
    const result = await searchRestaurants(
      q,
      req.query.page as string | undefined,
      req.query.limit as string | undefined,
    );
    sendSuccess(res, "Search results", result);
  } catch (err) {
    next(err);
  }
};

// GET /restaurants/:restaurantId — details
export const getRestaurantById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = paramId(req.params.restaurantId);
    const restaurant = await getRestaurantOrFail(id);
    sendSuccess(res, "Restaurant details", { restaurant });
  } catch (err) {
    next(err);
  }
};

// PATCH /restaurants/:restaurantId — owner updates
export const updateRestaurant = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = paramId(req.params.restaurantId);
    const restaurant = await Restaurant.findOne({ _id: id, isDeleted: false });
    if (!restaurant) {
      sendError(res, "Restaurant not found", 404);
      return;
    }
    assertOwner(req, restaurant);

    const { latitude, longitude, restaurantName, ...rest } = req.body;

    if (restaurantName) {
      restaurant.restaurantName = restaurantName;
      restaurant.slug = await uniqueSlug(restaurantName, async (s) => {
        const found = await Restaurant.findOne({
          slug: s,
          _id: { $ne: restaurant._id },
        });
        return !!found;
      });
    }

    Object.assign(restaurant, rest);

    if (latitude !== undefined && longitude !== undefined) {
      restaurant.latitude = latitude;
      restaurant.longitude = longitude;
      restaurant.location = buildGeoPoint(latitude, longitude);
    }

    await restaurant.save();
    const { invalidateRestaurantCaches } = await import(
      "../services/cache.service.js"
    );
    void invalidateRestaurantCaches();
    sendSuccess(res, "Restaurant updated", { restaurant });
  } catch (err) {
    next(err);
  }
};

// DELETE /restaurants/:restaurantId — soft delete
export const deleteRestaurant = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = paramId(req.params.restaurantId);
    const restaurant = await Restaurant.findOne({ _id: id, isDeleted: false });
    if (!restaurant) {
      sendError(res, "Restaurant not found", 404);
      return;
    }
    assertOwner(req, restaurant);

    restaurant.isDeleted = true;
    restaurant.isOpen = false;
    await restaurant.save();

    sendSuccess(res, "Restaurant deleted");
  } catch (err) {
    next(err);
  }
};

// PATCH /restaurants/status/:restaurantId — open/close toggle
export const updateRestaurantStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = paramId(req.params.restaurantId);
    const restaurant = await Restaurant.findOne({ _id: id, isDeleted: false });
    if (!restaurant) {
      sendError(res, "Restaurant not found", 404);
      return;
    }
    assertOwner(req, restaurant);

    if (req.body.isOpen === true && restaurant.restaurantStatus !== RestaurantStatus.APPROVED) {
      sendError(
        res,
        "Restaurant must be approved before opening",
        400,
      );
      return;
    }

    if (req.body.isOpen !== undefined) restaurant.isOpen = req.body.isOpen;
    if (req.body.restaurantStatus) {
      restaurant.restaurantStatus = req.body.restaurantStatus;
    }

    await restaurant.save();
    sendSuccess(res, "Restaurant status updated", { restaurant });
  } catch (err) {
    next(err);
  }
};

// GET /restaurants/analytics/:restaurantId — owner dashboard
export const getRestaurantAnalytics = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = paramId(req.params.restaurantId);
    const restaurant = await Restaurant.findOne({ _id: id, isDeleted: false });
    if (!restaurant) {
      sendError(res, "Restaurant not found", 404);
      return;
    }
    assertOwner(req, restaurant);

    const { getRestaurantAnalytics: getStats } = await import(
      "../services/analytics.service.js"
    );
    const analytics = await getStats(id);
    sendSuccess(res, "Restaurant analytics", { analytics });
  } catch (err) {
    next(err);
  }
};

// PATCH /restaurants/:restaurantId/approve — dev helper to approve (flow testing)
export const approveRestaurantDev = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (process.env.NODE_ENV === "production") {
      sendError(res, "Not available in production", 403);
      return;
    }
    const id = paramId(req.params.restaurantId);
    const restaurant = await Restaurant.findOne({ _id: id, isDeleted: false });
    if (!restaurant) {
      sendError(res, "Restaurant not found", 404);
      return;
    }
    restaurant.restaurantStatus = RestaurantStatus.APPROVED;
    restaurant.isOpen = true;
    await restaurant.save();
    sendSuccess(res, "Restaurant approved (dev)", { restaurant });
  } catch (err) {
    next(err);
  }
};

// GET /restaurants/:restaurantId/support-tickets
export const getRestaurantSupportTickets = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const restaurantId = paramId(req.params.restaurantId);
    const { page, limit, status, issueType } = req.query as {
      page?: string;
      limit?: string;
      status?: string;
      issueType?: string;
    };
    const result = await listRestaurantSupportTickets(restaurantId, req.userId!, {
      page,
      limit,
      status,
      issueType,
    });
    sendSuccess(res, "Support tickets fetched", result);
  } catch (err) {
    next(err);
  }
};

// GET /restaurants/geocode/reverse?lat=&lng=
export const reverseGeocodeHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { lat, lng } = req.query as { lat: number; lng: number };
    const address = await reverseGeocode(lat, lng);
    sendSuccess(res, "Address resolved", { address });
  } catch (err) {
    next(err);
  }
};
