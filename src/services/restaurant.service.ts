import Restaurant from "../models/restaurant.model.js";
import { RestaurantStatus } from "../types/enums.js";
import { getPagination, paginationMeta } from "../helpers/pagination.js";
import {
  CacheKeys,
  cacheGetOrSet,
  hashQuery,
} from "./cache.service.js";

export const publicRestaurantFilter = () => ({
  isDeleted: false,
  restaurantStatus: RestaurantStatus.APPROVED,
});

export const buildGeoPoint = (lat: number, lng: number) => ({
  type: "Point" as const,
  coordinates: [lng, lat],
});

async function listRestaurantsUncached(query: {
  page?: string | number;
  limit?: string | number;
  sort?: string;
  lat?: number;
  lng?: number;
  cuisine?: string;
  isOpen?: boolean;
  minRating?: number;
}) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
  const filter: Record<string, unknown> = { ...publicRestaurantFilter() };

  if (query.cuisine) {
    filter.cuisines = { $in: [query.cuisine] };
  }
  if (query.isOpen !== undefined) {
    filter.isOpen = query.isOpen;
  }
  if (query.minRating !== undefined) {
    filter.averageRating = { $gte: query.minRating };
  }

  let sort: Record<string, 1 | -1> = { averageRating: -1 };
  if (query.sort === "deliveryTime") sort = { averageDeliveryTime: 1 };
  if (query.sort === "newest") sort = { createdAt: -1 };

  if (query.sort === "distance" && query.lat !== undefined && query.lng !== undefined) {
    const maxDistance = 15000;
    const results = await Restaurant.aggregate([
      {
        $geoNear: {
          near: { type: "Point", coordinates: [query.lng, query.lat] },
          distanceField: "distanceMeters",
          maxDistance,
          spherical: true,
          query: filter,
        },
      },
      { $skip: skip },
      { $limit: limit },
    ]);
    const total = await Restaurant.countDocuments({
      ...filter,
      location: {
        $geoWithin: {
          $centerSphere: [[query.lng, query.lat], maxDistance / 6378100],
        },
      },
    });
    return {
      restaurants: results,
      pagination: paginationMeta(total, page, limit),
    };
  }

  const [restaurants, total] = await Promise.all([
    Restaurant.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Restaurant.countDocuments(filter),
  ]);

  return {
    restaurants,
    pagination: paginationMeta(total, page, limit),
  };
}

export async function listRestaurants(query: {
  page?: string | number;
  limit?: string | number;
  sort?: string;
  lat?: number;
  lng?: number;
  cuisine?: string;
  isOpen?: boolean;
  minRating?: number;
}) {
  const key = CacheKeys.restaurantList(hashQuery(query as Record<string, unknown>));
  return cacheGetOrSet(key, () => listRestaurantsUncached(query));
}

async function nearbyRestaurantsUncached(
  lat: number,
  lng: number,
  radiusKm = 5,
  page?: string | number,
  limit?: string | number,
) {
  const { page: p, limit: l, skip } = getPagination(page, limit);
  const maxDistance = radiusKm * 1000;

  const filter = publicRestaurantFilter();

  const [restaurants, total] = await Promise.all([
    Restaurant.aggregate([
      {
        $geoNear: {
          near: { type: "Point", coordinates: [lng, lat] },
          distanceField: "distanceMeters",
          maxDistance,
          spherical: true,
          query: filter,
        },
      },
      { $skip: skip },
      { $limit: l },
      {
        $addFields: {
          distanceKm: { $round: [{ $divide: ["$distanceMeters", 1000] }, 2] },
        },
      },
    ]),
    Restaurant.countDocuments({
      ...filter,
      location: {
        $geoWithin: {
          $centerSphere: [[lng, lat], maxDistance / 6378100],
        },
      },
    }),
  ]);

  return { restaurants, pagination: paginationMeta(total, p, l) };
}

export async function nearbyRestaurants(
  lat: number,
  lng: number,
  radiusKm = 5,
  page?: string | number,
  limit?: string | number,
) {
  const { page: p, limit: l } = getPagination(page, limit);
  const key = CacheKeys.nearbyRestaurants(lat, lng, radiusKm, p, l);
  return cacheGetOrSet(key, () =>
    nearbyRestaurantsUncached(lat, lng, radiusKm, page, limit),
  );
}

async function searchRestaurantsUncached(
  q: string,
  page?: string | number,
  limit?: string | number,
) {
  const { page: p, limit: l, skip } = getPagination(page, limit);
  const filter = {
    ...publicRestaurantFilter(),
    $or: [
      { restaurantName: { $regex: q, $options: "i" } },
      { description: { $regex: q, $options: "i" } },
      { cuisines: { $regex: q, $options: "i" } },
      { tags: { $regex: q, $options: "i" } },
    ],
  };

  const [restaurants, total] = await Promise.all([
    Restaurant.find(filter)
      .sort({ averageRating: -1 })
      .skip(skip)
      .limit(l)
      .lean(),
    Restaurant.countDocuments(filter),
  ]);

  return { restaurants, pagination: paginationMeta(total, p, l) };
}

export async function searchRestaurants(
  q: string,
  page?: string | number,
  limit?: string | number,
) {
  const { page: p, limit: l } = getPagination(page, limit);
  const key = CacheKeys.restaurantSearch(q.trim().toLowerCase(), p, l);
  return cacheGetOrSet(key, () => searchRestaurantsUncached(q, page, limit));
}
