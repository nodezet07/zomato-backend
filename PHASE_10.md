# Phase 10 — Rider System ✅

Base: `/api/v1/riders`

## Rider delivery flow

```
Register → Login → Go online → See available orders → Accept
  → Pickup (PICKED_UP + ON_THE_WAY) → Update location → Complete delivery
```

Restaurant must set order to **`READY_FOR_PICKUP`** before riders can accept.

## Public APIs (no JWT)

| Method | Route | Body |
|--------|-------|------|
| POST | `/register` | `fullName`, `email`, `password`, `mobile?`, `vehicleType?`, KYC fields |
| POST | `/login` | `email`, `password` → tokens + `rider` |

In **development**, new riders are auto-**approved**. All new registrations are **auto-approved** for now.

## Rider APIs (JWT + role `rider`)

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/me` | Rider + user profile |
| PATCH | `/profile` | Update profile, KYC images, bank, vehicle |
| PATCH | `/status` | `{ "onlineStatus": true }` go online/offline |
| PATCH | `/location` | `{ "latitude", "longitude" }` — also updates active order map |
| GET | `/available-orders` | Orders ready, unassigned |
| PATCH | `/accept-order/:orderId` | Assign self, `RIDER_ASSIGNED` |
| PATCH | `/reject-order/:orderId` | Unassign if already accepted |
| PATCH | `/pickup-order/:orderId` | `PICKED_UP` |
| PATCH | `/start-delivery/:orderId` | `PICKED_UP` → `ON_THE_WAY` |
| PATCH | `/complete-delivery/:orderId` | `DELIVERED` + earnings |
| GET | `/earnings` | `totalEarnings`, `todayEarnings` |
| GET | `/history` | Completed deliveries (paginated) |

## Dev helper

| Method | Route | Notes |
|--------|-------|-------|
| PATCH | `/:riderId/approve-dev` | JWT, non-production only |

## Earnings

₹`40` per completed delivery (`RIDER_EARNING_PER_DELIVERY` in constants).

## Realtime delivery offers

When restaurant sets order to **`READY_FOR_PICKUP`**:

- Socket broadcasts `delivery_available` to all riders in `riders:online` room
- Rider app shows in-app pop with **45s** accept timeout (`RIDER_ORDER_ACCEPT_TIMEOUT_SECONDS`)
- First rider to `PATCH /accept-order/:orderId` wins (MongoDB atomic update)
- Other riders receive `delivery_claimed` and pop dismisses

Rider joins `riders:online` on socket connect (if online) or via `rider_online` client event.

## Test flow (with customer order)

1. Customer places order (COD) → restaurant sets status to `READY_FOR_PICKUP` via `PATCH /orders/status/:id`  
2. Register rider: `POST /riders/register`  
3. `POST /riders/login` → token  
4. `PATCH /riders/status` → `{ "onlineStatus": true }`  
5. `GET /riders/available-orders`  
6. `PATCH /riders/accept-order/:orderId`  
7. `PATCH /riders/pickup-order/:orderId`  
8. `PATCH /riders/start-delivery/:orderId`  
9. `PATCH /riders/location` (repeat while delivering)  
10. `PATCH /riders/complete-delivery/:orderId`  
11. `GET /riders/earnings`  

Customer can also verify with `POST /orders/verify-delivery-otp` (Phase 8).

## Order ↔ rider link

`order.riderId` stores the **Rider document `_id`**, not the User id.

## Next: Phase 12

Push notifications — see `PHASE_11.md` for live sockets (done).
