import Restaurant from "../models/restaurant.model.js";
import MenuCategory from "../models/menuCategory.model.js";
import MenuItem from "../models/menuItem.model.js";
import { AppError } from "../utils/AppError.js";
import { RestaurantStatus } from "../types/enums.js";
import { publicRestaurantFilter } from "./restaurant.service.js";
import { CacheKeys, cacheGetOrSet } from "./cache.service.js";

export async function assertRestaurantOwner(
  userId: string,
  restaurantId: string,
) {
  const restaurant = await Restaurant.findOne({
    _id: restaurantId,
    isDeleted: false,
  });
  if (!restaurant) {
    throw new AppError("Restaurant not found", 404);
  }
  if (restaurant.ownerId.toString() !== userId) {
    throw new AppError("You do not own this restaurant", 403);
  }
  return restaurant;
}

export async function assertPublicRestaurant(restaurantId: string) {
  const restaurant = await Restaurant.findOne({
    _id: restaurantId,
    ...publicRestaurantFilter(),
  });
  if (!restaurant) {
    throw new AppError("Restaurant not found or not available", 404);
  }
  return restaurant;
}

export async function getMenuForRestaurant(restaurantId: string): Promise<{
  categories: Array<Record<string, unknown>>;
  uncategorized: Array<Record<string, unknown>>;
}> {
  await assertPublicRestaurant(restaurantId);
  const cacheKey = CacheKeys.menuItems(restaurantId);

  return cacheGetOrSet(cacheKey, async () => {
    const categories = await MenuCategory.find({
      restaurantId,
      isActive: true,
    })
      .sort({ sortOrder: 1 })
      .lean();

    const items = await MenuItem.find({
      restaurantId,
      isDeleted: false,
      isAvailable: true,
    })
      .sort({ isRecommended: -1, itemName: 1 })
      .lean();

    const menu: Array<Record<string, unknown>> = categories.map((cat) => ({
      ...cat,
      items: items.filter(
        (item) => item.categoryId.toString() === cat._id.toString(),
      ),
    }));

    const uncategorized = items.filter(
      (item) =>
        !categories.some((c) => c._id.toString() === item.categoryId.toString()),
    ) as Array<Record<string, unknown>>;

    return { categories: menu, uncategorized };
  }, 3600); // cache for 1 hour
}
