import { Router } from "express";
import isAuth from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  createCategorySchema,
  updateCategorySchema,
  createMenuItemSchema,
  updateMenuItemSchema,
  toggleAvailabilitySchema,
  menuSearchSchema,
  createMenuComboSchema,
  updateMenuComboSchema,
} from "../validators/menu.validator.js";
import {
  createCategory,
  getCategoriesByRestaurant,
  updateCategory,
  deleteCategory,
  createMenuItem,
  getMenuItemsByRestaurant,
  getCombosByRestaurant,
  listOwnerCombos,
  createMenuCombo,
  updateMenuCombo,
  deleteMenuCombo,
  getMenuItemDetails,
  updateMenuItem,
  deleteMenuItem,
  toggleItemAvailability,
  searchMenuItems,
} from "../controllers/menu.controller.js";

const router = Router();

// Categories
router.post(
  "/categories",
  isAuth,
  validate(createCategorySchema),
  asyncHandler(createCategory),
);
router.get(
  "/categories/:restaurantId",
  asyncHandler(getCategoriesByRestaurant),
);

// Search (before /items/:restaurantId)
router.get(
  "/search",
  validate(menuSearchSchema, "query"),
  asyncHandler(searchMenuItems),
);

// Items — static paths first
router.post("/items", isAuth, validate(createMenuItemSchema), asyncHandler(createMenuItem));
router.get("/items/details/:itemId", asyncHandler(getMenuItemDetails));
router.patch(
  "/items/availability/:itemId",
  isAuth,
  validate(toggleAvailabilitySchema),
  asyncHandler(toggleItemAvailability),
);

router.get("/items/combos/:restaurantId", asyncHandler(getCombosByRestaurant));

// Combos (owner CRUD)
router.get("/combos/:restaurantId", isAuth, asyncHandler(listOwnerCombos));
router.post("/combos", isAuth, validate(createMenuComboSchema), asyncHandler(createMenuCombo));
router.patch(
  "/combos/:comboId",
  isAuth,
  validate(updateMenuComboSchema),
  asyncHandler(updateMenuCombo),
);
router.delete("/combos/:comboId", isAuth, asyncHandler(deleteMenuCombo));
router.get("/items/:restaurantId", asyncHandler(getMenuItemsByRestaurant));
router.patch(
  "/items/:itemId",
  isAuth,
  validate(updateMenuItemSchema),
  asyncHandler(updateMenuItem),
);
router.delete("/items/:itemId", isAuth, asyncHandler(deleteMenuItem));

// Category update/delete
router.patch(
  "/categories/:categoryId",
  isAuth,
  validate(updateCategorySchema),
  asyncHandler(updateCategory),
);
router.delete("/categories/:categoryId", isAuth, asyncHandler(deleteCategory));

export default router;
