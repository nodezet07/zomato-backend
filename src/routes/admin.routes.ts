import { Router } from "express";
import isAdminAuth from "../middlewares/adminAuth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  adminLoginRateLimiter,
  adminApiRateLimiter,
} from "../middlewares/rateLimit.middleware.js";
import {
  adminLoginSchema,
  rejectReasonSchema,
  adminCancelOrderSchema,
  approveRefundSchema,
  rejectRefundSchema,
} from "../validators/admin.validator.js";
import {
  addReplySchema,
  adminUpdateTicketSchema,
} from "../validators/support.validator.js";
import {
  login,
  dashboard,
  getUsers,
  blockUser,
  unblockUser,
  getRestaurants,
  approveRestaurantHandler,
  rejectRestaurantHandler,
  getRiders,
  approveRiderHandler,
  rejectRiderHandler,
  getOrders,
  cancelOrder,
  getRefunds,
  approveRefundHandler,
  getSupportTickets,
  getSupportTicket,
  adminReplyTicket,
  resolveSupportTicket,
  rejectRefundHandler,
  getAuditLogs,
} from "../controllers/admin.controller.js";
import {
  adminListBanners,
  adminCreateBanner,
  adminUpdateBanner,
  adminDeleteBanner,
} from "../controllers/banner.controller.js";
import { createBannerSchema, updateBannerSchema } from "../validators/banner.validator.js";
import {
  adminFinanceSummary,
  adminListRestaurantEarnings,
  adminRestaurantEarningsDetail,
  adminCreateRestaurantSettlement,
  adminListRestaurantSettlements,
  adminMarkRestaurantSettlementPaid,
  adminExportSettlements,
  adminListRiderEarnings,
  adminCreateRiderPayout,
  adminListRiderPayouts,
  adminMarkRiderPayoutPaid,
} from "../controllers/finance.controller.js";
import {
  createRestaurantSettlementSchema,
  createRiderPayoutSchema,
  financeListQuerySchema,
  markRiderPayoutPaidSchema,
  markSettlementPaidSchema,
} from "../validators/finance.validator.js";
import {
  getPolicy,
  patchPolicy,
  getCities,
  postCity,
  patchCity,
  patchRestaurantCommission,
  getLedger,
  getWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  payWithdrawal,
  failWithdrawal,
} from "../controllers/platformConfig.controller.js";
import {
  updatePlatformPolicySchema,
  createCitySchema,
  updateCitySchema,
  updateCommissionSchema,
  withdrawalActionSchema,
} from "../validators/platformConfig.validator.js";

const router = Router();

router.post(
  "/login",
  adminLoginRateLimiter,
  validate(adminLoginSchema),
  asyncHandler(login),
);

router.use(isAdminAuth);
router.use(adminApiRateLimiter);

router.get("/dashboard", asyncHandler(dashboard));
router.get("/users", asyncHandler(getUsers));
router.patch("/users/block/:userId", asyncHandler(blockUser));
router.patch("/users/unblock/:userId", asyncHandler(unblockUser));

router.get("/restaurants", asyncHandler(getRestaurants));
router.patch(
  "/restaurants/approve/:restaurantId",
  asyncHandler(approveRestaurantHandler),
);
router.patch(
  "/restaurants/reject/:restaurantId",
  validate(rejectReasonSchema),
  asyncHandler(rejectRestaurantHandler),
);

router.get("/riders", asyncHandler(getRiders));
router.patch("/riders/approve/:riderId", asyncHandler(approveRiderHandler));
router.patch(
  "/riders/reject/:riderId",
  validate(rejectReasonSchema),
  asyncHandler(rejectRiderHandler),
);

router.get("/orders", asyncHandler(getOrders));
router.patch(
  "/orders/cancel/:orderId",
  validate(adminCancelOrderSchema),
  asyncHandler(cancelOrder),
);

router.get("/refunds", asyncHandler(getRefunds));
router.post(
  "/refunds/:ticketId/approve",
  validate(approveRefundSchema),
  asyncHandler(approveRefundHandler),
);
router.post(
  "/refunds/:ticketId/reject",
  validate(rejectRefundSchema),
  asyncHandler(rejectRefundHandler),
);

router.get("/audit-logs", asyncHandler(getAuditLogs));

router.get("/banners", asyncHandler(adminListBanners));
router.post("/banners", validate(createBannerSchema), asyncHandler(adminCreateBanner));
router.patch(
  "/banners/:bannerId",
  validate(updateBannerSchema),
  asyncHandler(adminUpdateBanner),
);
router.delete("/banners/:bannerId", asyncHandler(adminDeleteBanner));

router.get("/support/tickets", asyncHandler(getSupportTickets));
router.get("/support/tickets/:ticketId", asyncHandler(getSupportTicket));
router.post(
  "/support/tickets/reply",
  validate(addReplySchema),
  asyncHandler(adminReplyTicket),
);
router.patch(
  "/support/tickets/:ticketId",
  validate(adminUpdateTicketSchema),
  asyncHandler(resolveSupportTicket),
);

// V1 Finance — manual restaurant settlements & rider payouts
router.get("/finance/summary", asyncHandler(adminFinanceSummary));
router.get(
  "/finance/restaurants/earnings",
  validate(financeListQuerySchema, "query"),
  asyncHandler(adminListRestaurantEarnings),
);
router.get(
  "/finance/restaurants/:restaurantId/earnings",
  asyncHandler(adminRestaurantEarningsDetail),
);
router.post(
  "/finance/restaurants/:restaurantId/settlements",
  validate(createRestaurantSettlementSchema),
  asyncHandler(adminCreateRestaurantSettlement),
);
router.get(
  "/finance/restaurants/settlements",
  validate(financeListQuerySchema, "query"),
  asyncHandler(adminListRestaurantSettlements),
);
router.get(
  "/finance/restaurants/settlements/export",
  asyncHandler(adminExportSettlements),
);
router.patch(
  "/finance/restaurants/settlements/:settlementId/mark-paid",
  validate(markSettlementPaidSchema),
  asyncHandler(adminMarkRestaurantSettlementPaid),
);
router.get(
  "/finance/riders/earnings",
  validate(financeListQuerySchema, "query"),
  asyncHandler(adminListRiderEarnings),
);
router.post(
  "/finance/riders/:riderId/payouts",
  validate(createRiderPayoutSchema),
  asyncHandler(adminCreateRiderPayout),
);
router.get(
  "/finance/riders/payouts",
  validate(financeListQuerySchema, "query"),
  asyncHandler(adminListRiderPayouts),
);
router.patch(
  "/finance/riders/payouts/:payoutId/mark-paid",
  validate(markRiderPayoutPaidSchema),
  asyncHandler(adminMarkRiderPayoutPaid),
);

// Platform config — cities, policies, commission, ledger, withdrawals
router.get("/platform/policy", asyncHandler(getPolicy));
router.patch(
  "/platform/policy",
  validate(updatePlatformPolicySchema),
  asyncHandler(patchPolicy),
);
router.get("/platform/cities", asyncHandler(getCities));
router.post("/platform/cities", validate(createCitySchema), asyncHandler(postCity));
router.patch(
  "/platform/cities/:cityId",
  validate(updateCitySchema),
  asyncHandler(patchCity),
);
router.patch(
  "/restaurants/:restaurantId/commission",
  validate(updateCommissionSchema),
  asyncHandler(patchRestaurantCommission),
);
router.get("/finance/ledger", asyncHandler(getLedger));
router.get("/finance/withdrawals", asyncHandler(getWithdrawals));
router.patch(
  "/finance/withdrawals/:requestId/approve",
  validate(withdrawalActionSchema),
  asyncHandler(approveWithdrawal),
);
router.patch(
  "/finance/withdrawals/:requestId/reject",
  validate(withdrawalActionSchema),
  asyncHandler(rejectWithdrawal),
);
router.patch(
  "/finance/withdrawals/:requestId/mark-paid",
  validate(withdrawalActionSchema),
  asyncHandler(payWithdrawal),
);
router.patch(
  "/finance/withdrawals/:requestId/mark-failed",
  validate(withdrawalActionSchema),
  asyncHandler(failWithdrawal),
);

export default router;
