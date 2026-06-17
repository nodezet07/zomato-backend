/** Socket event names — aligned with endpoints.md / cursor.md Phase 11 */
export const SocketEvents = {
  ORDER_CREATED: "order_created",
  ORDER_CONFIRMED: "order_confirmed",
  RIDER_ASSIGNED: "rider_assigned",
  RIDER_LOCATION_UPDATE: "rider_location_update",
  ORDER_PICKED_UP: "order_picked_up",
  ORDER_DELIVERED: "order_delivered",
  ORDER_COMPLETED: "order_completed",
  NEW_ORDER: "new_order",
  ORDER_CANCELLED: "order_cancelled",
  ORDER_UPDATED: "order_updated",
  /** Broadcast to online riders when order is ready for pickup */
  DELIVERY_AVAILABLE: "delivery_available",
  /** Broadcast when any rider accepts — dismiss pop on other devices */
  DELIVERY_CLAIMED: "delivery_claimed",
} as const;

export type SocketEventName = (typeof SocketEvents)[keyof typeof SocketEvents];

/** Client → server */
export const ClientSocketEvents = {
  JOIN_ORDER: "join_order",
  LEAVE_ORDER: "leave_order",
  JOIN_RESTAURANT: "join_restaurant",
  LEAVE_RESTAURANT: "leave_restaurant",
  /** Rider went online — join `riders:online` broadcast room */
  RIDER_ONLINE: "rider_online",
  /** Rider went offline — leave broadcast room */
  RIDER_OFFLINE: "rider_offline",
} as const;

export interface OrderSocketPayload {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  paymentStatus?: string;
  restaurantId: string;
  customerId: string;
  riderId?: string;
  riderName?: string;
  riderMobile?: string;
  riderCode?: string;
  riderLocation?: { latitude: number; longitude: number };
  estimatedDeliveryTime?: string;
  timestamp: string;
  restaurantName?: string;
  grandTotal?: number;
  acceptTimeoutSeconds?: number;
  [key: string]: unknown;
}
