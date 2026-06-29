import MenuItem from "../models/menuItem.model.js";
import Restaurant from "../models/restaurant.model.js";
import redisClient from "../config/redis.js";
import logger from "../config/logger.js";
import { getPagination, paginationMeta } from "../helpers/pagination.js";
import {
  publicRestaurantFilter,
  searchRestaurants,
  nearbyRestaurants,
} from "./restaurant.service.js";
import { cacheGetOrSet, hashQuery } from "./cache.service.js";

const TRENDING_ZSET = "search:trending:scores";

export function normalizeSearchQuery(q: string): string {
  return q.trim().toLowerCase().slice(0, 100);
}

export async function recordTrendingSearch(q: string): Promise<void> {
  const term = normalizeSearchQuery(q);
  if (term.length < 2) return;
  if (!redisClient.isOpen) return;

  try {
    await redisClient.zIncrBy(TRENDING_ZSET, 1, term);
  } catch (error) {
    logger.warn("Failed to record trending search", { error, term });
  }
}

export async function getTrendingSearches(limit = 10) {
  if (!redisClient.isOpen) {
    return { trending: [] as { query: string; count: number }[] };
  }

  try {
    const rows = await redisClient.zRangeWithScores(TRENDING_ZSET, 0, limit - 1, {
      REV: true,
    });
    return {
      trending: rows.map((row) => ({
        query: row.value,
        count: Math.round(row.score),
      })),
    };
  } catch (error) {
    logger.warn("Failed to fetch trending searches", { error });
    return { trending: [] };
  }
}

export async function searchFoodItems(query: {
  q: string;
  restaurantId?: string;
  foodType?: string;
  page?: string | number;
  limit?: string | number;
}) {
  const q = query.q.trim();
  const { page, limit, skip } = getPagination(query.page, query.limit);

  const filter: Record<string, unknown> = {
    isDeleted: false,
    isAvailable: true,
    $or: [
      { itemName: { $regex: q, $options: "i" } },
      { description: { $regex: q, $options: "i" } },
      { ingredients: { $regex: q, $options: "i" } },
    ],
  };

  if (query.foodType) {
    filter.foodType = query.foodType;
  }

  if (query.restaurantId) {
    filter.restaurantId = query.restaurantId;
  } else {
    const approvedIds = await cacheGetOrSet("cache:restaurants:approved_ids", async () => {
      return Restaurant.find({
        ...publicRestaurantFilter(),
      }).distinct("_id");
    }, 1800); // cache for 30 minutes
    filter.restaurantId = { $in: approvedIds };
  }

  const [items, total] = await Promise.all([
    MenuItem.find(filter)
      .populate("restaurantId", "restaurantName slug logo averageRating isOpen")
      .populate("categoryId", "categoryName")
      .sort({ totalOrders: -1, itemName: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    MenuItem.countDocuments(filter),
  ]);

  return {
    items,
    pagination: paginationMeta(total, page, limit),
  };
}

export async function searchRestaurantsWithTrending(
  q: string,
  page?: string | number,
  limit?: string | number,
) {
  await recordTrendingSearch(q);
  return searchRestaurants(q, page, limit);
}

export async function searchFoodsWithTrending(query: {
  q: string;
  restaurantId?: string;
  foodType?: string;
  page?: string | number;
  limit?: string | number;
}) {
  await recordTrendingSearch(query.q);
  return searchFoodItems(query);
}

export async function globalSearch(query: {
  q: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  page?: string | number;
  limit?: string | number;
  restaurantLimit?: number;
  foodLimit?: number;
}) {
  const cacheKey = `cache:search:global:${hashQuery(query as Record<string, unknown>)}`;

  return cacheGetOrSet(cacheKey, async () => {
    await recordTrendingSearch(query.q);

    const restaurantLimit = query.restaurantLimit ?? 8;
    const foodLimit = query.foodLimit ?? 12;

    const [restaurantResult, foodResult] = await Promise.all([
      searchRestaurants(query.q, 1, restaurantLimit),
      searchFoodItems({ q: query.q, page: 1, limit: foodLimit }),
    ]);

    let nearby: Awaited<ReturnType<typeof nearbyRestaurants>> | null = null;
    if (query.lat !== undefined && query.lng !== undefined) {
      nearby = await nearbyRestaurants(
        query.lat,
        query.lng,
        query.radiusKm ?? 5,
        1,
        6,
      );
    }

    return {
      query: query.q,
      restaurants: restaurantResult.restaurants,
      foods: foodResult.items,
      nearby: nearby?.restaurants ?? [],
      counts: {
        restaurants: restaurantResult.pagination.total,
        foods: foodResult.pagination.total,
        nearby: nearby?.pagination.total ?? 0,
      },
      pagination: {
        restaurants: restaurantResult.pagination,
        foods: foodResult.pagination,
      },
    };
  });
}
