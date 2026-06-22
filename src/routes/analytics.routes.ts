import { Router } from "express";
import isAdminAuth from "../middlewares/adminAuth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  sales,
  orders,
  users,
  delivery,
  summary,
  tax,
} from "../controllers/analytics.controller.js";

const router = Router();

router.use(isAdminAuth);

router.get("/summary", asyncHandler(summary));
router.get("/sales", asyncHandler(sales));
router.get("/orders", asyncHandler(orders));
router.get("/users", asyncHandler(users));
router.get("/delivery", asyncHandler(delivery));
router.get("/tax", asyncHandler(tax));

export default router;
