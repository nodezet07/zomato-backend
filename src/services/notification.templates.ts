import { SocketEvents } from "../types/socket.events.js";

export interface OrderNotificationCopy {
  title: string;
  message: string;
}

export function orderNotificationCopy(
  event: string,
  orderNumber: string,
): OrderNotificationCopy {
  switch (event) {
    case SocketEvents.ORDER_CREATED:
      return {
        title: "Order placed",
        message: `Your order ${orderNumber} was placed. Waiting for the restaurant to accept.`,
      };
    case SocketEvents.NEW_ORDER:
      return {
        title: "New order",
        message: `New order ${orderNumber} — please confirm and prepare.`,
      };
    case SocketEvents.ORDER_CONFIRMED:
      return {
        title: "Order confirmed",
        message: `Order ${orderNumber} is confirmed. Restaurant is preparing your food.`,
      };
    case SocketEvents.RIDER_ASSIGNED:
      return {
        title: "Rider assigned",
        message: `A delivery partner is assigned to order ${orderNumber}.`,
      };
    case SocketEvents.ORDER_PICKED_UP:
      return {
        title: "Order picked up",
        message: `Your order ${orderNumber} has been picked up.`,
      };
    case SocketEvents.ORDER_UPDATED:
      return {
        title: "Order update",
        message: `Order ${orderNumber} status was updated.`,
      };
    case SocketEvents.ORDER_DELIVERED:
    case SocketEvents.ORDER_COMPLETED:
      return {
        title: "Delivered",
        message: `Order ${orderNumber} has been delivered. Enjoy your meal!`,
      };
    case SocketEvents.ORDER_CANCELLED:
      return {
        title: "Order cancelled",
        message: `Order ${orderNumber} was cancelled.`,
      };
  case SocketEvents.RIDER_LOCATION_UPDATE:
      return {
        title: "Rider on the way",
        message: `Your rider is heading to you for order ${orderNumber}.`,
      };
    default:
      return {
        title: "Order update",
        message: `Update for order ${orderNumber}.`,
      };
  }
}
