# Zomato Clone Backend — Implementation Progress (End to End)

This document describes **everything built so far** in `clone-backend`: product flow, APIs, data layer, business rules, seed data, and what is still pending. It follows the roadmap in `cursor.md`, `endpoints.md`, and `database.md`.

**Base URL:** `http://localhost:5000/api/v1`  
**Status:** Phases **1–19** are implemented. Phase **20** (deploy) remains.

---

## Table of contents

1. [Project goal](#1-project-goal)
2. [Tech stack](#2-tech-stack)
3. [Repository layout](#3-repository-layout)
4. [How to run](#4-how-to-run)
5. [Demo seed data](#5-demo-seed-data)
6. [Phase-by-phase build log](#6-phase-by-phase-build-log)
7. [Complete API reference (implemented)](#7-complete-api-reference-implemented)
8. [End-to-end customer journey](#8-end-to-end-customer-journey)
9. [Restaurant partner journey](#9-restaurant-partner-journey)
10. [Rider delivery journey](#10-rider-delivery-journey)
11. [Order lifecycle & payment states](#11-order-lifecycle--payment-states)
12. [Database collections](#12-database-collections)
13. [Cross-cutting concerns](#13-cross-cutting-concerns)
14. [Not implemented yet](#14-not-implemented-yet)
15. [Planned next steps](#15-planned-next-steps)
16. [Per-phase detail files](#16-per-phase-detail-files)

---

## 1. Project goal

Build a **production-oriented food delivery backend** (Zomato-style) for:

- **Customer mobile app** — browse, cart, order, track
- **Restaurant panel** — menu, orders, open/close
- **Rider app** — accept deliveries, GPS, earnings
- **Admin** (later) — approvals, analytics, refunds

Development was done **phase by phase** so each layer (auth → browse → menu → cart → order → rider) works in sequence, not as a single unfinished monolith.

---

## 2. Tech stack

| Layer | Technology |
|--------|------------|
| Runtime | Node.js |
| Framework | Express 5 |
| Language | TypeScript (ESM) |
| Database | MongoDB + Mongoose |
| Cache / sessions | Redis (connected; OTP & tokens) |
| Realtime | Socket.io — JWT auth, rooms, order/rider events (Phase 11) |
| Auth | JWT (access + refresh), HTTP-only cookies optional |
| Validation | Zod |
| Logging | Winston (daily rotate) |
| API docs | Swagger UI at `/api-docs` |
| Email | Nodemailer (OTP, password reset) |
| Security | Helmet, CORS, rate limiting |

---

## 3. Repository layout

```
clone-backend/
├── src/
│   ├── app.ts                 # Express app, middleware, routes
│   ├── server.ts              # HTTP server + DB + Redis + Socket init (stub)
│   ├── config/                # env, db, redis, logger, swagger, socket
│   ├── constants/             # fees, rider earnings
│   ├── controllers/         # HTTP handlers per module
│   ├── services/              # Business logic
│   ├── routes/                # Route mounting
│   ├── models/                # Mongoose schemas (15 collections)
│   ├── validators/            # Zod schemas
│   ├── middlewares/           # auth, role, validate, error, rate limit
│   ├── seeds/                 # phase2 + admin seeds
│   ├── helpers/               # pagination
│   ├── types/                 # enums, auth types
│   └── utils/                 # AppError, JWT, apiResponse, slug, etc.
├── PHASE_1.md … PHASE_10.md   # Per-phase verification guides
├── cursor.md                  # Full 20-phase roadmap
├── endpoints.md               # API contract (source of truth)
├── database.md                # Collection schemas
├── developement.md            # Product vision
└── IMPLEMENTATION_PROGRESS.md # This file
```

---

## 4. How to run

```bash
cd clone-backend
npm install
cp .env.example .env   # set MONGO_URI, JWT secrets, etc.
npm run seed:phase2    # demo restaurant + menu + coupon
npm run seed:admin     # optional admin user
npm run dev            # http://localhost:5000
```

**Verify:**

- `GET /api/v1/health`
- `GET /api/v1/system/status`
- `GET /api-docs`

**Build:**

```bash
npm run typecheck
npm run build
```

---

## 5. Demo seed data

After `npm run seed:phase2`:

| Entity | Details |
|--------|---------|
| Owner | `owner@foodapp.com` (restaurant_owner) |
| Restaurant | **Demo Biryani House**, slug `demo-biryani-house`, **approved**, **open**, Mumbai-ish coords |
| Menu | Category **Biryani**, item **Chicken Biryani** ₹299 |
| Coupon | **WELCOME50** — flat ₹50 off, min order ₹199 |

After `npm run seed:demo`:

| Entity | Details |
|--------|---------|
| Restaurants | 3 full demo restaurants: **Demo Biryani House**, **QuickSlice Pizza**, **GreenBowl Kitchen** |
| Menu items | ~12 items with real images (Unsplash), food types (veg/nonveg), `isRecommended` flags |
| Portion addons | Items like Biryani, Pizza, etc. have `Portion: Half`, `Portion: Full` addons stored in MongoDB |

After `npm run seed:coupons`:

| Code | Type | Discount | Scope |
|------|------|----------|-------|
| `WELCOME50` | Flat | ₹50 off (min ₹199) | All restaurants |
| `SAVE20` | Percentage | 20% off, max ₹100 (min ₹299) | All restaurants |
| `FREEDEL` | Flat | ₹40 off (min ₹149) | All restaurants |
| `BIRYANI30` | Flat | ₹30 off (min ₹249) | Demo Biryani House only |
| `PIZZA25` | Percentage | 25% off, max ₹80 (min ₹299) | QuickSlice Pizza only |
| `HEALTHY10` | Flat | ₹10 off (min ₹199) | GreenBowl Kitchen only |

Use `npm run seed:admin` for admin panel testing later.

---

## 6. Phase-by-phase build log

### Phase 1 — Project setup ✅

**Purpose:** Runnable API with config, logging, auth middleware, and error handling.

**Delivered:**

- TypeScript + ESLint + Prettier
- Express app (`src/app.ts`, `src/server.ts`)
- MongoDB connection (`src/config/db.ts`)
- Environment validation with Zod (`src/config/env.ts`)
- Winston logging
- Global error handler + `AppError`
- JWT auth middleware (`auth.middleware.ts`)
- Role middleware (`role.middleware.ts`, `requireCustomer`, `requireRider`, etc.)
- Optional auth for public routes with logged-in extras
- Rate limiting (OTP routes)
- Swagger setup
- System routes: health, status

**Detail:** `PHASE_1.md`

---

### Phase 2 — Database ✅

**Purpose:** All MongoDB collections and enums from `database.md`.

**Delivered:**

- **15 models:** users, restaurants, menu_categories, menu_items, carts, orders, payments, riders, rider_locations, wallet_transactions, coupons, reviews, notifications, support_tickets, audit_logs, admin_users
- Shared sub-schemas: addresses, cart/order line items, timeline logs, geo points
- Enums in `src/types/enums.ts` (roles, order status, payment method, rider availability, etc.)
- Indexes on orders, restaurants (2dsphere), riders, etc.
- Seed script `npm run seed:phase2`

**User field convention:** `fullName`, `mobile`, `profileImage` (some APIs still accept legacy `name` / `phone` / `avatarUrl`).

**Detail:** `PHASE_2.md`

---

### Phase 3 — Authentication ✅

**Purpose:** Register, login, OTP, refresh tokens, password reset.

**APIs:** `/api/v1/auth/*`

**Delivered:**

- Email + password register/login
- OTP send/verify (signup, login, reset) — Redis-backed
- Refresh token rotation + logout
- Forgot / reset password
- `GET /auth/me`
- Legacy paths: `/signup/send-otp`, `/login/verify-otp`, etc.
- Dev mode: OTP in response as `devOtp` when `NODE_ENV=development`

**Not done:** Social login (`POST /auth/social/:provider` returns 501).

**Roles at register:** `customer` (default), `restaurant_owner`, `rider` (via parseRole).

**Detail:** `PHASE_3.md`

---

### Phase 4 — Users module ✅

**Purpose:** Profile, addresses, favorites, wallet read, notifications, account lifecycle.

**APIs:** `/api/v1/users/*` (JWT required)  
**Legacy alias:** `/api/v1/profile/*`

**Delivered:**

- Profile GET/PATCH, profile image URL
- Address CRUD (subdocuments on user)
- Favorite restaurants add/remove/list
- Order history list (paginated) — `GET /users/orders`
- Wallet balance + transaction history (read)
- Notifications list + mark read
- Onboarding complete, soft delete account

**Detail:** `PHASE_4.md`

---

### Phase 5 — Restaurants ✅

**Purpose:** Zomato-style browse — list, nearby, search, details, partner registration.

**APIs:** `/api/v1/restaurants/*`

**Delivered:**

- Public list of **approved** restaurants only
- Nearby search (geo `lat`, `lng`, `radiusKm`)
- Text search (`q` on name/cuisine)
- Restaurant detail (optional auth)
- Owner: create restaurant (status `pending` → dev approve)
- Owner: update, soft delete, open/close (`PATCH /status/:id`)
- Owner: basic analytics
- Dev: `PATCH /:restaurantId/approve-dev` (non-production)

**Rules:**

- Customers only see `restaurantStatus: approved` and `isDeleted: false`
- Creating a restaurant can upgrade `customer` → `restaurant_owner`

**Detail:** `PHASE_5.md`

---

### Phase 6 — Menu ✅

**Purpose:** Categories, items, addons, availability, search, combos.

**APIs:** `/api/v1/menu/*`

**Delivered:**

- Category CRUD (owner)
- Menu item CRUD (owner)
- Public: categories with nested items per restaurant
- Public: flat item list, item details
- Toggle availability
- Menu search across items
- **`GET /menu/items/combos/:restaurantId`** — "Most Ordered Together" pairs from **that restaurant's own items only** (food paired with beverage from same restaurant; no cross-restaurant data)
- **Portion size addons** — items seed `Portion: Half`, `Portion: Full` etc. as `addons[]`; frontend reads these and renders them as radio buttons in the Customize Modal

**Rules:**

- Public menu only for approved restaurants
- Items respect `isAvailable` and `isDeleted`
- Combos endpoint auto-detects beverages by category name / item name keywords

**Detail:** `PHASE_6.md`

---

### Phase 7 — Cart ✅

**Purpose:** One cart per user, line items, coupons, price breakdown.

**APIs:** `/api/v1/cart/*` (JWT)

**Delivered:**

- `GET /` — cart with totals
- `POST /add` — merge same item + same addons
- `PATCH /update/:itemId`, `DELETE /remove/:itemId`, `DELETE /clear`
- `POST /apply-coupon`, `DELETE /remove-coupon`
- Auto calculation: subtotal, tax (per item %), delivery fee, platform fee (capped), coupon discount, **grandTotal**
- Switching restaurant **clears** cart and coupon

**Constants:** `DEFAULT_DELIVERY_FEE`, `PLATFORM_FEE_PERCENT`, `MAX_PLATFORM_FEE`

**Detail:** `PHASE_7.md`

---

### Phase 8 — Order engine ✅

**Purpose:** Place order from cart, lifecycle, tracking, cancel, refund request.

**APIs:** `/api/v1/orders/*` (JWT)

**Delivered:**

- `POST /create` — from cart + delivery address + payment method
- `GET /:orderId`, `GET /user/history`, `GET /active`
- `GET /track/:orderId` — timeline, ETA, rider location snapshot
- `PATCH /cancel/:orderId` — customer, early statuses only
- `PATCH /status/:orderId` — validated state machine
- `PATCH /assign-rider/:orderId` — manual assign (uses Rider document id)
- `POST /verify-delivery-otp` — customer confirms delivery
- `POST /refund-request` — creates support ticket
- `GET /restaurant/:restaurantId` — owner order list

**On create:**

- Cart cleared, coupon `usedCount` incremented
- `orderNumber` generated, `deliveryOtp` (4 digits)
- Timeline log started

**Payment method at create:**

| Method | Order status | Payment status |
|--------|--------------|----------------|
| COD | CONFIRMED | PENDING (capture on delivery) |
| WALLET | CONFIRMED | CAPTURED (wallet debited) |
| ONLINE | PENDING | PENDING until `/payments/verify` or webhook |

**Detail:** `PHASE_8.md`

---

### Phase 9 — Payments (Razorpay) ✅

**Purpose:** Complete `ONLINE` orders via Razorpay Checkout on mobile.

**APIs:** `/api/v1/payments/*` + webhook at `/api/v1/payments/webhook` (raw body in `app.ts`)

**Delivered:**

- `POST /create-order` — Razorpay order + Payment row
- `POST /verify` — HMAC signature check → order `CONFIRMED`
- `POST /webhook` — `payment.captured` / `failed` / `refund.processed`
- `POST /refund`, `GET /:paymentId`
- Env: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`

**Alignment with Phase 8:**

- Coupon usage only after successful ONLINE payment
- Restaurant cannot confirm unpaid ONLINE orders
- `order.appliedCouponId` stored on order
- Payable = `grandTotal - walletDeduction`

**Detail:** `PHASE_9.md`

---

### Phase 10 — Rider system ✅

**Purpose:** Rider onboarding, available orders, accept → pickup → deliver, location, earnings.

**APIs:** `/api/v1/riders/*`

**Delivered:**

- `POST /register` — new rider account or onboard logged-in user
- `POST /login` — rider role + tokens + rider profile
- `GET /me`, `PATCH /status` (online/offline), `PATCH /location`
- `GET /available-orders` — `READY_FOR_PICKUP`, unassigned
- `PATCH /accept-order/:orderId` — assigns **Rider `_id`** to order
- `PATCH /reject-order/:orderId` — release back to pool
- `PATCH /pickup-order/:orderId` — `RIDER_ASSIGNED` → `PICKED_UP` → `ON_THE_WAY`
- `PATCH /complete-delivery/:orderId` — `DELIVERED`, COD captured, +₹40 earnings
- `GET /earnings`, `GET /history`
- Dev: `PATCH /:riderId/approve-dev`
- Location history in `rider_locations`; updates `order.riderLocation` for active delivery

**Rules:**

- Rider must be **approved** (auto in dev) and **online** to accept
- One active delivery per rider (`currentOrderId`)
- Restaurant must set order to `READY_FOR_PICKUP` before accept

**Detail:** `PHASE_10.md`

---

### Phase 11 — Realtime sockets ✅

**Purpose:** Push order status and rider location instead of polling only.

**Delivered:**

- JWT auth on socket connect (same access token as REST)
- Rooms: `user:{id}`, `order:{id}`, `restaurant:{id}`, `rider:{id}`
- Client: `join_order`, `join_restaurant`
- Server emits: `order_created`, `new_order`, `order_confirmed`, `order_updated`, `rider_assigned`, `rider_location_update`, `order_picked_up`, `order_delivered`, `order_cancelled`
- Hooks in order, payment, and rider services

**Detail:** `PHASE_11.md`

---

## 7. Complete API reference (implemented)

All paths are under `http://localhost:5000/api/v1`.

### System & public

| Method | Path | Auth |
|--------|------|------|
| GET | `/health` | No |
| GET | `/system/status` | No |
| GET | `/public/...` | Varies |

### Auth — `/auth`

| Method | Path | Auth |
|--------|------|------|
| POST | `/register` | No |
| POST | `/login` | No |
| POST | `/send-otp` | No |
| POST | `/verify-otp` | No |
| POST | `/refresh-token` | No |
| POST | `/logout` | No |
| POST | `/forgot-password` | No |
| POST | `/reset-password` | No |
| GET | `/me` | Yes |
| POST | `/social/:provider` | No (501 stub) |

### Users — `/users`

| Method | Path | Auth |
|--------|------|------|
| GET/PATCH | `/profile` | Yes |
| POST | `/profile-image` | Yes |
| POST/PATCH/DELETE | `/address`, `/address/:id` | Yes |
| GET/POST/DELETE | `/favorites`, `/favorites/:restaurantId` | Yes |
| GET | `/orders` | Yes |
| GET | `/wallet`, `/wallet/transactions` | Yes |
| GET | `/notifications` | Yes |
| PATCH | `/notifications/read/:id`, `/notifications/read-all` | Yes |
| POST | `/onboarding/complete` | Yes |
| DELETE | `/delete-account` | Yes |

### Restaurants — `/restaurants`

| Method | Path | Auth |
|--------|------|------|
| GET | `/`, `/nearby`, `/search` | No |
| GET | `/:restaurantId` | Optional |
| POST | `/` | Yes |
| PATCH/DELETE | `/:restaurantId` | Yes (owner) |
| PATCH | `/status/:restaurantId` | Yes (owner) |
| GET | `/analytics/:restaurantId` | Yes (owner) |
| PATCH | `/:restaurantId/approve-dev` | Yes (dev) |

### Menu — `/menu`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST/PATCH/DELETE | `/categories`, `/categories/:id` | Yes (owner) | Category CRUD |
| GET | `/categories/:restaurantId` | No | Public categories + nested items |
| POST/PATCH/DELETE | `/items`, `/items/:id` | Yes (owner) | Menu item CRUD |
| GET | `/items/:restaurantId` | No | All items for a restaurant (includes addons) |
| GET | `/items/details/:id` | No | Single item detail |
| GET | **`/items/combos/:restaurantId`** | No | **Most Ordered Together** — auto-paired combos from restaurant's own items |
| PATCH | `/items/availability/:id` | Yes (owner) | Toggle item availability |
| GET | `/search` | No | Search menu items |

### Cart — `/cart`

| Method | Path | Auth |
|--------|------|------|
| GET | `/` | Yes |
| POST | `/add` | Yes |
| PATCH | `/update/:itemId` | Yes |
| DELETE | `/remove/:itemId`, `/clear` | Yes |
| POST | `/apply-coupon` | Yes |
| DELETE | `/remove-coupon` | Yes |

### Orders — `/orders`

| Method | Path | Auth |
|--------|------|------|
| POST | `/create` | Yes |
| GET | `/user/history`, `/active` | Yes |
| GET | `/track/:orderId`, `/:orderId` | Yes |
| PATCH | `/cancel/:orderId`, `/status/:orderId` | Yes |
| PATCH | `/assign-rider/:orderId` | Yes |
| POST | `/verify-delivery-otp`, `/refund-request` | Yes |
| GET | `/restaurant/:restaurantId` | Yes (owner) |

### Payments — `/payments`

| Method | Path | Auth |
|--------|------|------|
| POST | `/create-order` | Yes |
| POST | `/verify` | Yes |
| POST | `/webhook` | Razorpay signature (`app.ts` raw body) |
| POST | `/refund` | Yes |
| GET | `/:paymentId` | Yes |
| POST | `/wallet/add-money` | Yes (501 stub) |

### Riders — `/riders`

| Method | Path | Auth |
|--------|------|------|
| POST | `/register` | Optional |
| POST | `/login` | No |
| GET | `/me` | Yes (rider) |
| PATCH | `/status`, `/location` | Yes (rider) |
| GET | `/available-orders`, `/earnings`, `/history` | Yes (rider) |
| PATCH | `/accept-order/:orderId`, `/reject-order/:orderId` | Yes (rider) |
| PATCH | `/pickup-order/:orderId`, `/complete-delivery/:orderId` | Yes (rider) |
| PATCH | `/:riderId/approve-dev` | Yes (dev) |

### Coupons — `/coupons`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | **`/coupons/restaurant/:restaurantId`** | No | **Active coupons for a restaurant** — global + restaurant-specific, sorted by discount value |

> ⚠️ Admin coupon CRUD (`POST /coupons`, `PATCH /coupons/:id`, `DELETE /coupons/:id`) is planned for the admin panel — not yet exposed.

---

## 8. End-to-end customer journey

This is the **full path** you can test today with seed data + three roles.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. AUTH                                                                  │
│    POST /auth/register  →  POST /auth/login  →  Bearer token            │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. BROWSE                                                                │
│    GET /restaurants  →  /nearby  →  /search  →  /restaurants/:id         │
│    Optional: POST /users/favorites/:restaurantId                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. MENU                                                                  │
│    GET /menu/items/:restaurantId  →  item details / search               │
│    GET /menu/items/combos/:restaurantId  →  Most Ordered Together        │
│    GET /coupons/restaurant/:restaurantId  →  Offer banner + modal        │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. CART                                                                  │
│    POST /cart/add (with addons[] for portion sizes)                      │
│    GET /cart  →  POST /cart/apply-coupon (WELCOME50 / SAVE20 / FREEDEL)  │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 5. CHECKOUT                                                              │
│    POST /users/address (fullAddress + lat/lng)                           │
│    POST /orders/create  (COD | WALLET | ONLINE*)                           │
│    * ONLINE → POST /payments/create-order → verify → CONFIRMED          │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 6. TRACK (REST polling today; sockets in Phase 11)                       │
│    GET /orders/active  →  GET /orders/track/:orderId                     │
│    POST /orders/verify-delivery-otp (optional, with deliveryOtp)         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Parallel restaurant + rider path** (after order created):

- Owner: `PATCH /orders/status/:id` → CONFIRMED → PREPARING → **READY_FOR_PICKUP**
- Rider: accept → pickup → location updates → complete delivery
- Customer sees status via track endpoint (rider location updated on each `PATCH /riders/location`)

---

## 9. Restaurant partner journey

```
Login (owner@foodapp.com or your user)
  → POST /restaurants (if new; else use seeded Demo Biryani House)
  → PATCH /restaurants/:id/approve-dev (development only)
  → PATCH /restaurants/status/:id  { "isOpen": true }
  → POST /menu/categories, POST /menu/items (optional extra items)
  → GET /orders/restaurant/:restaurantId  (incoming orders)
  → PATCH /orders/status/:orderId  (advance kitchen status)
```

When order reaches **READY_FOR_PICKUP**, it appears in rider **available-orders**.

---

## 10. Rider delivery journey

```
POST /riders/register  →  POST /riders/login
  → PATCH /riders/status  { "onlineStatus": true }
  → GET /riders/available-orders
  → PATCH /riders/accept-order/:orderId
  → PATCH /riders/pickup-order/:orderId
  → PATCH /riders/location  (repeat during trip)
  → PATCH /riders/complete-delivery/:orderId
  → GET /riders/earnings
```

**Earnings:** ₹40 per completed delivery (`RIDER_EARNING_PER_DELIVERY`).

**Important:** `order.riderId` references the **Riders collection `_id`**, not the User `_id`.

---

## 11. Order lifecycle & payment states

### Order status flow

```
PENDING
  → CONFIRMED
  → PREPARING
  → READY_FOR_PICKUP
  → RIDER_ASSIGNED
  → PICKED_UP
  → ON_THE_WAY
  → DELIVERED

(CANCELLED from PENDING | CONFIRMED | PREPARING — customer)
```

### Who can change status

| Actor | Typical transitions |
|--------|---------------------|
| System / COD create | PENDING → CONFIRMED (COD/WALLET) |
| Restaurant owner | CONFIRMED → PREPARING → READY_FOR_PICKUP |
| Rider | PICKED_UP, ON_THE_WAY, DELIVERED (via pickup/complete APIs) |
| Customer | Cancel early; verify OTP at delivery |

### Payment methods today

| Method | At order create | When paid |
|--------|-----------------|-----------|
| COD | Order CONFIRMED | On delivery (rider complete or OTP verify) |
| WALLET | Order CONFIRMED, wallet debited | Immediate |
| ONLINE | Order PENDING | Razorpay verify → CONFIRMED (Phase 9) |

---

## 12. Database collections

| Collection | Used in phases | Notes |
|------------|----------------|-------|
| users | 3–4 | Auth, profile, addresses |
| restaurants | 5 | Geo, approval, open flag |
| menu_categories, menu_items | 6 | |
| carts | 7 | One per user |
| orders | 8, 10 | Timeline, OTP, rider link |
| payments | 9 | Razorpay create/verify/webhook |
| riders, rider_locations | 10 | |
| coupons | 7–8, **today** | WELCOME50 + 5 new coupons (global + restaurant-specific) via `seed:coupons`; public API `GET /coupons/restaurant/:restaurantId` |
| wallet_transactions | 4 | Read history |
| notifications | 4 | |
| support_tickets | 8 | Refund requests |
| reviews, audit_logs, admin_users | — | Models ready; APIs later |

---

## 13. Cross-cutting concerns

| Concern | Implementation |
|---------|----------------|
| Errors | `AppError` + `error.middleware.ts` — consistent JSON `{ success, message }` |
| Validation | Zod via `validate.middleware.ts` |
| Pagination | `getPagination` + `paginationMeta` (page, limit, max 100) |
| Auth | Bearer token or cookie; `req.userId`, `req.userRole` |
| Roles | `customer`, `restaurant_owner`, `rider`, `admin` |
| Public reads | Restaurants/menu filtered to **approved** only |
| Soft delete | Users `isDeleted`; restaurants `isDeleted` |
| Sockets | `initializeSocket` logs connect only — **no order events yet** |
| File upload | Profile/restaurant images as **URLs** only (no S3 module yet) |

---

## 14. Not implemented yet

| Phase | Module | Notes |
|-------|--------|-------|
| **9** | Payments (Razorpay) | ✅ Done |
| **11** | Socket.io | ✅ Done |
| **12** | Notifications queue | Push/email/SMS jobs |
| **13** | Admin panel APIs | Approve riders/restaurants, dashboard |
| **14** | Support tickets API | ✅ Done |
| **15** | Analytics | ✅ Done |
| **16** | Redis & BullMQ | ✅ Done — cache, queues, live tracking, socket adapter |
| **17** | Search system | ✅ Done — `/search/*`, trending in Redis |
| **18** | Security hardening | ✅ Done — sanitize, CORS, audit, rate limits |
| **19** | Testing | ✅ Done — Vitest + E2E script |
| **20** | Deployment | Per `cursor.md` |

**Also stub / partial:**

- Social login (501)
- Stripe (not started; Razorpay chosen for India mobile)
- Coupon admin CRUD routes (create/edit/delete coupons via admin panel — not yet built; seeding only)
- Review after delivery
- Wallet top-up with Razorpay
- Production admin rider approval (only `approve-dev` in development)

---

## V1 Finance module (June 2026)

Manual settlement architecture — see **`PHASE_V1_FINANCE.md`** for full API docs.

| Rule | V1 behavior |
|------|-------------|
| Customer payments | Razorpay ONLINE + COD → platform |
| Restaurant settlements | Admin manual batch + `mark-paid` with UTR |
| Rider payouts | Admin weekly manual batch + `mark-paid` |
| Wallet | **Disabled** on order create |
| Automated payouts | **Not integrated** (RazorpayX later) |

**New collections:** `restaurant_settlements`, `rider_payouts`, `orders.settlement` (embedded snapshot on DELIVERED).

**Admin APIs:** `/admin/finance/*` — summary, earnings, create settlement/payout, history, mark paid.

**Partner APIs:** `/restaurants/:id/earnings`, `/restaurants/:id/settlements`, `/riders/earnings/summary`, `/riders/payouts`.

---

## Today's additions (June 2026)

Built on top of Phase 19 baseline:

| Feature | Backend | Frontend |
|---------|---------|----------|
| **Most Ordered Together** | `GET /menu/items/combos/:restaurantId` — auto-pairs food with beverages from same restaurant | Restaurant detail page — real API, no mock data |
| **Portion size addons** | Seeded as `Portion: Half / Full / Large` on menu items via `seed:demo` | Customize Modal — radio buttons for sizes, checkboxes for extras |
| **Public Coupon API** | `GET /coupons/restaurant/:restaurantId` — returns active global + restaurant-specific coupons | Offer banner shows real count; tap opens bottom sheet with coupon cards + COPY button |
| **Coupon seeding** | `npm run seed:coupons` — seeds 6 coupons (3 global + 3 restaurant-specific) | — |
| **Frontend services** | — | `services/coupons.ts`, `hooks/queries/coupons.ts` |

---

## 15. Planned next steps

Recommended order (from `cursor.md`):

1. **Phase 11 — Sockets** — stop polling; push order + rider location to customer app  
3. **Phase 13 — Admin** — approve riders/restaurants in production  
4. Mobile app (Expo) — wire each API screen to this flow  

---

## 16. Per-phase detail files

For step-by-step test commands and request bodies, use:

| Phase | File |
|-------|------|
| 1 | `PHASE_1.md` |
| 2 | `PHASE_2.md` |
| 3 | `PHASE_3.md` |
| 4 | `PHASE_4.md` |
| 5 | `PHASE_5.md` |
| 6 | `PHASE_6.md` |
| 7 | `PHASE_7.md` |
| 8 | `PHASE_8.md` |
| 9 | `PHASE_9.md` |
| 10 | `PHASE_10.md` |
| 11 | `PHASE_11.md` |
| 12 | `PHASE_12.md` |
| 13 | `PHASE_13.md` |
| 14 | `PHASE_14.md` |
| 15 | `PHASE_15.md` |
| 16 | `PHASE_16.md` |
| 17 | `PHASE_17.md` |
| 18 | `PHASE_18.md` |
| 19 | `PHASE_19.md` |

**Roadmap (all 20 phases):** `cursor.md`  
**API contract:** `endpoints.md`  
**Schemas:** `database.md`  
**Product vision:** `developement.md`

---

*Last updated: June 2026 — Phase 19 + Combos API, Portion Addons, Public Coupons API, Coupon Seed.*
