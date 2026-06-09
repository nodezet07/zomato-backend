import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/auth.types.js";
import Restaurant from "../models/restaurant.model.js";
import MenuCategory from "../models/menuCategory.model.js";
import MenuItem from "../models/menuItem.model.js";
import MenuCombo from "../models/menuCombo.model.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";
import { AppError } from "../utils/AppError.js";
import { uniqueSlug } from "../utils/slug.js";
import {
  assertRestaurantOwner,
  assertPublicRestaurant,
  getMenuForRestaurant,
} from "../services/menu.service.js";
import { getPagination, paginationMeta } from "../helpers/pagination.js";
import { publicRestaurantFilter } from "../services/restaurant.service.js";

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

// ─── Categories ───────────────────────────────────────────────

export const createCategory = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { restaurantId, categoryName, categoryImage, sortOrder } = req.body;
    await assertRestaurantOwner(req.userId!, restaurantId);

    const category = await MenuCategory.create({
      restaurantId,
      categoryName,
      categoryImage,
      sortOrder: sortOrder ?? 0,
    });

    sendSuccess(res, "Category created", { category }, 201);
  } catch (err) {
    next(err);
  }
};

export const getCategoriesByRestaurant = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const restaurantId = paramId(req.params.restaurantId);
    const menu = await getMenuForRestaurant(restaurantId);
    sendSuccess(res, "Menu fetched", menu);
  } catch (err) {
    next(err);
  }
};

export const updateCategory = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const categoryId = paramId(req.params.categoryId);
    const category = await MenuCategory.findById(categoryId);
    if (!category) {
      sendError(res, "Category not found", 404);
      return;
    }
    await assertRestaurantOwner(req.userId!, category.restaurantId.toString());

    Object.assign(category, req.body);
    await category.save();
    sendSuccess(res, "Category updated", { category });
  } catch (err) {
    next(err);
  }
};

export const deleteCategory = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const categoryId = paramId(req.params.categoryId);
    const category = await MenuCategory.findById(categoryId);
    if (!category) {
      sendError(res, "Category not found", 404);
      return;
    }
    await assertRestaurantOwner(req.userId!, category.restaurantId.toString());

    await MenuItem.updateMany(
      { categoryId: category._id },
      { isDeleted: true, isAvailable: false },
    );
    await category.deleteOne();

    sendSuccess(res, "Category deleted");
  } catch (err) {
    next(err);
  }
};

// ─── Menu items ───────────────────────────────────────────────

export const createMenuItem = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { restaurantId, categoryId, itemName, ...rest } = req.body;
    await assertRestaurantOwner(req.userId!, restaurantId);

    const category = await MenuCategory.findOne({
      _id: categoryId,
      restaurantId,
    });
    if (!category) {
      sendError(res, "Category not found for this restaurant", 404);
      return;
    }

    const slug = await uniqueSlug(`${itemName}-${restaurantId}`, async (s) => {
      const found = await MenuItem.findOne({ restaurantId, slug: s });
      return !!found;
    });

    const item = await MenuItem.create({
      restaurantId,
      categoryId,
      itemName,
      slug,
      ...rest,
    });

    sendSuccess(res, "Menu item created", { item }, 201);
  } catch (err) {
    next(err);
  }
};

export const getMenuItemsByRestaurant = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const restaurantId = paramId(req.params.restaurantId);
    await assertPublicRestaurant(restaurantId);

    const filter: Record<string, unknown> = {
      restaurantId,
      isDeleted: false,
    };

    if (req.query.recommended === "true") {
      filter.isRecommended = true;
    }

    const items = await MenuItem.find(filter)
      .populate("categoryId", "categoryName sortOrder")
      .sort({ isRecommended: -1, itemName: 1 })
      .lean();

    sendSuccess(res, "Menu items fetched", { items });
  } catch (err) {
    next(err);
  }
};

type ComboResponse = {
  id: string;
  title: string;
  image: string;
  price: number;
  tag: string;
  foodType: string;
  mainItem: Record<string, unknown>;
  source: "manual" | "auto";
  comboItems?: Array<{ menuItemId: string; itemName: string; quantity: number; price: number }>;
};

function buildAutoCombos(items: Array<Record<string, any>>): ComboResponse[] {
  const beverages = items.filter((it) => {
    const catName = (it.categoryId as any)?.categoryName?.toLowerCase() ?? "";
    const itemName = it.itemName.toLowerCase();
    return (
      catName.includes("beverage") ||
      catName.includes("drink") ||
      itemName.includes("lemonade") ||
      itemName.includes("smoothie") ||
      itemName.includes("shake") ||
      itemName.includes("cola") ||
      itemName.includes("juice")
    );
  });

  const foods = items.filter((it) => !beverages.includes(it));
  const combos: ComboResponse[] = [];

  if (foods.length > 0 && beverages.length > 0) {
    foods.slice(0, 3).forEach((food, idx) => {
      const bev = beverages[idx % beverages.length];
      const comboPrice = Math.round(
        ((food.discountedPrice ?? food.price) + (bev.discountedPrice ?? bev.price)) * 0.9,
      );
      combos.push({
        id: `combo-${food._id}-${bev._id}`,
        title: `${food.itemName} + ${bev.itemName}`,
        image: food.images?.[0] || bev.images?.[0] || "",
        price: comboPrice,
        tag: `Ordered by ${40 - idx * 10}+ customers`,
        foodType: food.foodType,
        mainItem: food,
        source: "auto",
      });
    });
  } else if (foods.length >= 2) {
    const food1 = foods[0];
    const food2 = foods[1];
    const comboPrice = Math.round(
      ((food1.discountedPrice ?? food1.price) + (food2.discountedPrice ?? food2.price)) * 0.85,
    );
    combos.push({
      id: `combo-${food1._id}-${food2._id}`,
      title: `${food1.itemName} + ${food2.itemName}`,
      image: food1.images?.[0] || food2.images?.[0] || "",
      price: comboPrice,
      tag: "Best Value Combo",
      foodType: food1.foodType === "veg" && food2.foodType === "veg" ? "veg" : "nonveg",
      mainItem: food1,
      source: "auto",
    });
  }

  return combos;
}

function shapeManualCombo(combo: Record<string, any>): ComboResponse {
  const mainItem = combo.mainItemId as Record<string, any>;
  const comboItems = (combo.items ?? []).map((row: Record<string, any>) => {
    const item = row.menuItemId as Record<string, any>;
    return {
      menuItemId: item?._id?.toString?.() ?? String(row.menuItemId),
      itemName: item?.itemName ?? "Item",
      quantity: row.quantity ?? 1,
      price: item?.discountedPrice ?? item?.price ?? 0,
    };
  });

  return {
    id: combo._id.toString(),
    title: combo.title,
    image: combo.image || mainItem?.images?.[0] || "",
    price: combo.price,
    tag: combo.tag || "Combo Deal",
    foodType: combo.foodType,
    mainItem,
    source: "manual",
    comboItems,
  };
}

async function validateComboItems(
  restaurantId: string,
  items: Array<{ menuItemId: string; quantity?: number }>,
  mainItemId: string,
) {
  const ids = items.map((i) => i.menuItemId);
  if (!ids.includes(mainItemId)) {
    throw new AppError("mainItemId must be one of the combo items", 400);
  }

  const menuItems = await MenuItem.find({
    _id: { $in: ids },
    restaurantId,
    isDeleted: false,
  });

  if (menuItems.length !== ids.length) {
    throw new AppError("One or more menu items are invalid for this restaurant", 400);
  }
}

export const getCombosByRestaurant = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const restaurantId = paramId(req.params.restaurantId);
    await assertPublicRestaurant(restaurantId);

    const manual = await MenuCombo.find({
      restaurantId,
      isDeleted: false,
      isAvailable: true,
    })
      .populate({ path: "items.menuItemId", select: "-isDeleted" })
      .populate("mainItemId")
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();

    if (manual.length > 0) {
      sendSuccess(res, "Restaurant combos fetched", {
        combos: manual.map((c) => shapeManualCombo(c)),
      });
      return;
    }

    const items = await MenuItem.find({
      restaurantId,
      isDeleted: false,
      isAvailable: true,
    })
      .populate("categoryId", "categoryName")
      .lean();

    sendSuccess(res, "Restaurant combos fetched", {
      combos: buildAutoCombos(items),
    });
  } catch (err) {
    next(err);
  }
};

export const listOwnerCombos = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const restaurantId = paramId(req.params.restaurantId);
    await assertRestaurantOwner(req.userId!, restaurantId);

    const combos = await MenuCombo.find({ restaurantId, isDeleted: false })
      .populate({ path: "items.menuItemId", select: "itemName price discountedPrice images foodType isAvailable" })
      .populate("mainItemId", "itemName images foodType isAvailable")
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();

    sendSuccess(res, "Owner combos fetched", { combos });
  } catch (err) {
    next(err);
  }
};

export const createMenuCombo = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { restaurantId, items, mainItemId, ...rest } = req.body;
    await assertRestaurantOwner(req.userId!, restaurantId);
    await validateComboItems(restaurantId, items, mainItemId);

    const combo = await MenuCombo.create({
      restaurantId,
      items: items.map((i: { menuItemId: string; quantity?: number }) => ({
        menuItemId: i.menuItemId,
        quantity: i.quantity ?? 1,
      })),
      mainItemId,
      ...rest,
    });

    const populated = await MenuCombo.findById(combo._id)
      .populate({ path: "items.menuItemId" })
      .populate("mainItemId")
      .lean();

    sendSuccess(res, "Combo created", { combo: populated }, 201);
  } catch (err) {
    next(err);
  }
};

export const updateMenuCombo = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const comboId = paramId(req.params.comboId);
    const combo = await MenuCombo.findOne({ _id: comboId, isDeleted: false });
    if (!combo) {
      sendError(res, "Combo not found", 404);
      return;
    }

    await assertRestaurantOwner(req.userId!, combo.restaurantId.toString());

    const { items, mainItemId, ...rest } = req.body;
    if (items && mainItemId) {
      await validateComboItems(combo.restaurantId.toString(), items, mainItemId);
      combo.items = items.map((i: { menuItemId: string; quantity?: number }) => ({
        menuItemId: i.menuItemId,
        quantity: i.quantity ?? 1,
      }));
      combo.mainItemId = mainItemId;
    } else if (items || mainItemId) {
      sendError(res, "Provide both items and mainItemId when updating combo items", 400);
      return;
    }

    Object.assign(combo, rest);
    await combo.save();

    const populated = await MenuCombo.findById(combo._id)
      .populate({ path: "items.menuItemId" })
      .populate("mainItemId")
      .lean();

    sendSuccess(res, "Combo updated", { combo: populated });
  } catch (err) {
    next(err);
  }
};

export const deleteMenuCombo = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const comboId = paramId(req.params.comboId);
    const combo = await MenuCombo.findOne({ _id: comboId, isDeleted: false });
    if (!combo) {
      sendError(res, "Combo not found", 404);
      return;
    }

    await assertRestaurantOwner(req.userId!, combo.restaurantId.toString());

    combo.isDeleted = true;
    combo.isAvailable = false;
    await combo.save();

    sendSuccess(res, "Combo deleted");
  } catch (err) {
    next(err);
  }
};

export const getMenuItemDetails = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const itemId = paramId(req.params.itemId);
    const item = await MenuItem.findOne({ _id: itemId, isDeleted: false })
      .populate("categoryId", "categoryName")
      .populate("restaurantId", "restaurantName slug logo isOpen averageRating")
      .lean();

    if (!item) {
      sendError(res, "Menu item not found", 404);
      return;
    }

    sendSuccess(res, "Menu item details", { item });
  } catch (err) {
    next(err);
  }
};

export const updateMenuItem = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const itemId = paramId(req.params.itemId);
    const item = await MenuItem.findOne({ _id: itemId, isDeleted: false });
    if (!item) {
      sendError(res, "Menu item not found", 404);
      return;
    }
    await assertRestaurantOwner(req.userId!, item.restaurantId.toString());

    const { itemName, ...rest } = req.body;
    if (itemName) {
      item.itemName = itemName;
      item.slug = await uniqueSlug(`${itemName}-${item.restaurantId}`, async (s) => {
        const found = await MenuItem.findOne({
          restaurantId: item.restaurantId,
          slug: s,
          _id: { $ne: item._id },
        });
        return !!found;
      });
    }
    Object.assign(item, rest);
    await item.save();

    sendSuccess(res, "Menu item updated", { item });
  } catch (err) {
    next(err);
  }
};

export const deleteMenuItem = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const itemId = paramId(req.params.itemId);
    const item = await MenuItem.findOne({ _id: itemId, isDeleted: false });
    if (!item) {
      sendError(res, "Menu item not found", 404);
      return;
    }
    await assertRestaurantOwner(req.userId!, item.restaurantId.toString());

    item.isDeleted = true;
    item.isAvailable = false;
    await item.save();

    sendSuccess(res, "Menu item deleted");
  } catch (err) {
    next(err);
  }
};

export const toggleItemAvailability = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const itemId = paramId(req.params.itemId);
    const item = await MenuItem.findOne({ _id: itemId, isDeleted: false });
    if (!item) {
      sendError(res, "Menu item not found", 404);
      return;
    }
    await assertRestaurantOwner(req.userId!, item.restaurantId.toString());

    item.isAvailable = req.body.isAvailable;
    await item.save();

    sendSuccess(res, "Availability updated", { item });
  } catch (err) {
    next(err);
  }
};

// ─── Search food (customer flow) ────────────────────────────────

export const searchMenuItems = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const q = String(req.query.q);
    const { page, limit, skip } = getPagination(
      req.query.page as string | undefined,
      req.query.limit as string | undefined,
    );

    const filter: Record<string, unknown> = {
      isDeleted: false,
      isAvailable: true,
      $or: [
        { itemName: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
        { ingredients: { $regex: q, $options: "i" } },
      ],
    };

    if (req.query.foodType) {
      filter.foodType = req.query.foodType;
    }

    if (req.query.restaurantId) {
      filter.restaurantId = req.query.restaurantId;
    } else {
      const approvedIds = await Restaurant.find({
        ...publicRestaurantFilter(),
      }).distinct("_id");
      filter.restaurantId = { $in: approvedIds };
    }

    const [items, total] = await Promise.all([
      MenuItem.find(filter)
        .populate("restaurantId", "restaurantName slug logo averageRating isOpen")
        .populate("categoryId", "categoryName")
        .skip(skip)
        .limit(limit)
        .lean(),
      MenuItem.countDocuments(filter),
    ]);

    sendSuccess(res, "Menu search results", {
      items,
      pagination: paginationMeta(total, page, limit),
    });
  } catch (err) {
    next(err);
  }
};
