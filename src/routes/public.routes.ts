import { Router } from "express";
import { getAppInfo, getTerms } from "../controllers/public.controller.js";
import { publicListBanners } from "../controllers/banner.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.get("/info", asyncHandler(getAppInfo));
router.get("/terms", asyncHandler(getTerms));
router.get("/banners", asyncHandler(publicListBanners));

export default router;
