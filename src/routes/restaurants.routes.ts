import { Router } from "express";
import isAuth from "../middlewares/auth.middleware.js";
import optionalAuth from "../middlewares/optionalAuth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  createRestaurantSchema,
  updateRestaurantSchema,
  updateStatusSchema,
  listRestaurantsQuerySchema,
  nearbyQuerySchema,
  searchQuerySchema,
  reverseGeocodeQuerySchema,
} from "../validators/restaurant.validator.js";
import {
  createRestaurant,
  getRestaurants,
  getRecommendedRestaurants,
  getNearbyRestaurants,
  searchRestaurantsHandler,
  getRestaurantById,
  updateRestaurant,
  deleteRestaurant,
  updateRestaurantStatus,
  getRestaurantAnalytics,
  approveRestaurantDev,
  reverseGeocodeHandler,
  getRestaurantSupportTickets,
} from "../controllers/restaurants.controller.js";
import {
  restaurantEarningsSummary,
  restaurantSettlementHistory,
} from "../controllers/finance.controller.js";
import { requireRestaurantOwner } from "../middlewares/role.middleware.js";
import { financeListQuerySchema } from "../validators/finance.validator.js";

const router = Router();

// Public browse flow (Zomato: discover → search → nearby)
router.get(
  "/recommended",
  asyncHandler(getRecommendedRestaurants),
);

router.get(
  "/search",
  validate(searchQuerySchema, "query"),
  asyncHandler(searchRestaurantsHandler),
);
router.get(
  "/nearby",
  validate(nearbyQuerySchema, "query"),
  asyncHandler(getNearbyRestaurants),
);
router.get(
  "/",
  validate(listRestaurantsQuerySchema, "query"),
  asyncHandler(getRestaurants),
);

// Owner / partner flow
router.post(
  "/",
  isAuth,
  validate(createRestaurantSchema),
  asyncHandler(createRestaurant),
);

// Static paths before :restaurantId
router.get(
  "/geocode/reverse",
  isAuth,
  validate(reverseGeocodeQuerySchema, "query"),
  asyncHandler(reverseGeocodeHandler),
);
router.patch(
  "/status/:restaurantId",
  isAuth,
  validate(updateStatusSchema),
  asyncHandler(updateRestaurantStatus),
);
router.get(
  "/analytics/:restaurantId",
  isAuth,
  asyncHandler(getRestaurantAnalytics),
);
router.get(
  "/:restaurantId/support-tickets",
  isAuth,
  requireRestaurantOwner,
  asyncHandler(getRestaurantSupportTickets),
);
router.get(
  "/:restaurantId/earnings",
  isAuth,
  requireRestaurantOwner,
  asyncHandler(restaurantEarningsSummary),
);
router.get(
  "/:restaurantId/settlements",
  isAuth,
  requireRestaurantOwner,
  validate(financeListQuerySchema, "query"),
  asyncHandler(restaurantSettlementHistory),
);
router.patch(
  "/:restaurantId/approve-dev",
  isAuth,
  asyncHandler(approveRestaurantDev),
);

router.get("/:restaurantId", optionalAuth, asyncHandler(getRestaurantById));
router.patch(
  "/:restaurantId",
  isAuth,
  validate(updateRestaurantSchema),
  asyncHandler(updateRestaurant),
);
router.delete("/:restaurantId", isAuth, asyncHandler(deleteRestaurant));

export default router;
