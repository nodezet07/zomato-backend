export enum UserRole {
  CUSTOMER = "customer",
  RESTAURANT_OWNER = "restaurant_owner",
  RIDER = "rider",
  ADMIN = "admin",
  SUPER_ADMIN = "super_admin",
}

export enum AdminRole {
  ADMIN = "admin",
  SUPER_ADMIN = "super_admin",
}

export enum Gender {
  MALE = "male",
  FEMALE = "female",
  OTHER = "other",
}

export enum LoginProvider {
  EMAIL = "email",
  GOOGLE = "google",
  APPLE = "apple",
}

export enum AccountStatus {
  ACTIVE = "active",
  BLOCKED = "blocked",
  SUSPENDED = "suspended",
}

export enum RestaurantStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
  SUSPENDED = "suspended",
}

export enum FoodType {
  VEG = "veg",
  NONVEG = "nonveg",
  EGG = "egg",
}

export enum SpiceLevel {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
}

export enum PaymentMethod {
  COD = "COD",
  ONLINE = "ONLINE",
  WALLET = "WALLET",
}

export enum PaymentStatus {
  PENDING = "PENDING",
  AUTHORIZED = "AUTHORIZED",
  CAPTURED = "CAPTURED",
  FAILED = "FAILED",
  REFUNDED = "REFUNDED",
}

export enum OrderStatus {
  PENDING = "PENDING",
  CONFIRMED = "CONFIRMED",
  PREPARING = "PREPARING",
  READY_FOR_PICKUP = "READY_FOR_PICKUP",
  RIDER_ASSIGNED = "RIDER_ASSIGNED",
  PICKED_UP = "PICKED_UP",
  ON_THE_WAY = "ON_THE_WAY",
  DELIVERED = "DELIVERED",
  CANCELLED = "CANCELLED",
}

export enum OrderSource {
  APP = "app",
  WEB = "web",
}

export enum PaymentGateway {
  RAZORPAY = "razorpay",
  STRIPE = "stripe",
  CASHFREE = "cashfree",
}

export enum GatewayPaymentMethod {
  UPI = "UPI",
  CARD = "CARD",
  NETBANKING = "NETBANKING",
  WALLET = "WALLET",
  COD = "COD",
}

export enum VehicleType {
  BIKE = "bike",
  CYCLE = "cycle",
  CAR = "car",
}

export enum RiderAvailability {
  ONLINE = "ONLINE",
  OFFLINE = "OFFLINE",
  AVAILABLE = "AVAILABLE",
  BUSY = "BUSY",
  ON_DELIVERY = "ON_DELIVERY",
}

export enum VerificationStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
}

export enum WalletTransactionType {
  CREDIT = "CREDIT",
  DEBIT = "DEBIT",
  REFUND = "REFUND",
  CASHBACK = "CASHBACK",
  BONUS = "BONUS",
}

export enum CouponDiscountType {
  PERCENTAGE = "PERCENTAGE",
  FLAT = "FLAT",
}

export enum CouponStatus {
  ACTIVE = "ACTIVE",
  EXPIRED = "EXPIRED",
  DISABLED = "DISABLED",
}

export enum NotificationType {
  ORDER = "ORDER",
  PAYMENT = "PAYMENT",
  PROMOTION = "PROMOTION",
  SYSTEM = "SYSTEM",
}

export enum NotificationRedirect {
  ORDER = "ORDER",
  RESTAURANT = "RESTAURANT",
  OFFER = "OFFER",
}

export enum SupportIssueType {
  PAYMENT = "PAYMENT",
  DELIVERY = "DELIVERY",
  FOOD = "FOOD",
  REFUND = "REFUND",
  OTHER = "OTHER",
}

export enum TicketStatus {
  OPEN = "OPEN",
  IN_PROGRESS = "IN_PROGRESS",
  RESOLVED = "RESOLVED",
  CLOSED = "CLOSED",
}

export enum DevicePlatform {
  ANDROID = "android",
  IOS = "ios",
  WEB = "web",
}

/** Per-order earning line — restaurant or rider */
export enum OrderEarningStatus {
  PENDING = "PENDING",
  SETTLED = "SETTLED",
  PAID = "PAID",
}

/** Admin restaurant settlement batch (manual bank transfer in V1) */
export enum RestaurantSettlementStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  PAID = "PAID",
  CANCELLED = "CANCELLED",
}

/** Admin rider payout batch (weekly manual cycle in V1) */
export enum RiderPayoutStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  PAID = "PAID",
  REJECTED = "REJECTED",
}

export enum SettlementCycle {
  WEEKLY = "WEEKLY",
  ON_DEMAND = "ON_DEMAND",
}
