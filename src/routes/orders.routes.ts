import { Router } from "express";
import isAuth from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  createOrderSchema,
  updateOrderStatusSchema,
  cancelOrderSchema,
  assignRiderSchema,
  verifyDeliveryOtpSchema,
  refundRequestSchema,
} from "../validators/order.validator.js";
import {
  createOrder,
  getOrderById,
  getOrderHistory,
  trackOrder,
  trackOrderRoute,
  cancelOrderHandler,
  updateStatus,
  assignRider,
  listAvailableRiders,
  verifyDeliveryOtpHandler,
  getActiveOrders,
  refundRequest,
  getRestaurantOrders,
} from "../controllers/orders.controller.js";
import { requireRestaurantOwner } from "../middlewares/role.middleware.js";

const router = Router();

router.use(isAuth);

router.post("/create", validate(createOrderSchema), asyncHandler(createOrder));
router.get("/user/history", asyncHandler(getOrderHistory));
router.get("/active", asyncHandler(getActiveOrders));
router.post(
  "/verify-delivery-otp",
  validate(verifyDeliveryOtpSchema),
  asyncHandler(verifyDeliveryOtpHandler),
);
router.post(
  "/refund-request",
  validate(refundRequestSchema),
  asyncHandler(refundRequest),
);
router.get(
  "/restaurant/:restaurantId",
  requireRestaurantOwner,
  asyncHandler(getRestaurantOrders),
);
router.get("/track/:orderId", asyncHandler(trackOrder));
router.get("/track/:orderId/route", asyncHandler(trackOrderRoute));
router.patch(
  "/cancel/:orderId",
  validate(cancelOrderSchema),
  asyncHandler(cancelOrderHandler),
);
router.patch(
  "/status/:orderId",
  validate(updateOrderStatusSchema),
  asyncHandler(updateStatus),
);
router.patch(
  "/assign-rider/:orderId",
  validate(assignRiderSchema),
  asyncHandler(assignRider),
);
router.get(
  "/riders/available",
  requireRestaurantOwner,
  asyncHandler(listAvailableRiders),
);
router.get("/:orderId", asyncHandler(getOrderById));

export default router;
