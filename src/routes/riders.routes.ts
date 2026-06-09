import { Router } from "express";
import { AuthRequest } from "../types/auth.types.js";
import isAuth from "../middlewares/auth.middleware.js";
import optionalAuth from "../middlewares/optionalAuth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireRider } from "../middlewares/role.middleware.js";
import {
  registerRiderSchema,
  onboardRiderSchema,
  riderLoginSchema,
  updateLocationSchema,
  updateRiderStatusSchema,
  rejectOrderSchema,
} from "../validators/rider.validator.js";
import {
  register,
  login,
  getProfile,
  updateStatus,
  updateLocation,
  getAvailableOrders,
  acceptOrderHandler,
  rejectOrderHandler,
  pickupOrderHandler,
  completeDeliveryHandler,
  getEarnings,
  getHistory,
  approveDev,
} from "../controllers/riders.controller.js";
import {
  riderEarningsSummaryV1,
  riderPayoutHistory,
} from "../controllers/finance.controller.js";
import { financeListQuerySchema } from "../validators/finance.validator.js";

const router = Router();

router.post(
  "/register",
  optionalAuth,
  (req, res, next) => {
    const authReq = req as AuthRequest;
    const schema = authReq.userId ? onboardRiderSchema : registerRiderSchema;
    return validate(schema)(req, res, next);
  },
  asyncHandler(register),
);
router.post("/login", validate(riderLoginSchema), asyncHandler(login));

router.use(isAuth);

router.get("/me", requireRider, asyncHandler(getProfile));
router.patch(
  "/status",
  requireRider,
  validate(updateRiderStatusSchema),
  asyncHandler(updateStatus),
);
router.patch(
  "/location",
  requireRider,
  validate(updateLocationSchema),
  asyncHandler(updateLocation),
);
router.get("/available-orders", requireRider, asyncHandler(getAvailableOrders));
router.get("/earnings", requireRider, asyncHandler(getEarnings));
router.get("/earnings/summary", requireRider, asyncHandler(riderEarningsSummaryV1));
router.get(
  "/payouts",
  requireRider,
  validate(financeListQuerySchema, "query"),
  asyncHandler(riderPayoutHistory),
);
router.get("/history", requireRider, asyncHandler(getHistory));

router.patch("/accept-order/:orderId", requireRider, asyncHandler(acceptOrderHandler));
router.patch(
  "/reject-order/:orderId",
  requireRider,
  validate(rejectOrderSchema),
  asyncHandler(rejectOrderHandler),
);
router.patch("/pickup-order/:orderId", requireRider, asyncHandler(pickupOrderHandler));
router.patch(
  "/complete-delivery/:orderId",
  requireRider,
  asyncHandler(completeDeliveryHandler),
);

router.patch("/:riderId/approve-dev", asyncHandler(approveDev));

export default router;
