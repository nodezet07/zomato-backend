/**
 * End-to-end API test — customer → restaurant → rider → admin
 *
 * Prerequisites:
 *   1. MongoDB + Redis running
 *   2. npm run seed:all   (or seed:phase2 + seed:admin + seed:e2e)
 *   3. npm run dev        (server on PORT, default 5000)
 *
 * Run: npm run test:e2e
 */

import "dotenv/config";

const BASE = (process.env.E2E_BASE_URL || "http://localhost:5000/api/v1").replace(
  /\/$/,
  "",
);

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "samiyashk26@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@123";
const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL || process.env.TEAM_OWNER_EMAIL || "shaikhanzal94@gmail.com";
const RIDER_EMAIL = process.env.E2E_RIDER_EMAIL || process.env.TEAM_RIDER_EMAIL || "antigravityfree70@gmail.com";
const DEMO_PASSWORD = process.env.E2E_PASSWORD || "Test@123456";

type Json = Record<string, unknown>;

interface StepResult {
  name: string;
  ok: boolean;
  detail?: string;
}

const results: StepResult[] = [];
let customerToken = "";
let ownerToken = "";
let riderToken = "";
let adminToken = "";
let restaurantId = "";
let menuItemId = "";
let addressId = "";
let orderId = "";

function log(msg: string) {
  console.log(msg);
}

async function api<T = Json>(
  method: string,
  path: string,
  options?: {
    body?: Json;
    token?: string;
    expectStatus?: number;
  },
): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options?.token) headers.Authorization = `Bearer ${options.token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  let body: T;
  const text = await res.text();
  try {
    body = text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    body = { raw: text } as T;
  }

  if (options?.expectStatus !== undefined && res.status !== options.expectStatus) {
    throw new Error(`Expected ${options.expectStatus}, got ${res.status}: ${text.slice(0, 300)}`);
  }

  return { status: res.status, body };
}

async function step(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ name, ok: true });
    log(`  ✓ ${name}`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    results.push({ name, ok: false, detail });
    log(`  ✗ ${name} — ${detail}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const runId = Date.now();
  const customerEmail = `e2e_customer_${runId}@test.com`;

  log("\n🧪 Food App Full E2E Test Suite");
  log(`   Base URL: ${BASE}\n`);

  // ─── System ────────────────────────────────────────────────────
  await step("Health check", async () => {
    const { status, body } = await api("GET", "/health");
    assert(status === 200, `Expected 200, got ${status}`);
    assert((body as Json).status === "OK", "Health status not OK");
  });

  await step("Find demo restaurant (owner's store)", async () => {
    const { status, body } = await api<{ success: boolean; data: { restaurants: Json[] } }>(
      "GET",
      "/restaurants/search?q=Demo+Biryani&limit=5",
    );
    assert(status === 200, `Search failed: ${status}`);
    const list = body.data?.restaurants ?? [];
    assert(list.length > 0, "Demo Biryani House not found — run seed:phase2");
    restaurantId = String((list[0] as { _id: string })._id);
  });

  // ─── Customer journey ──────────────────────────────────────────
  await step("Register customer", async () => {
    const { status, body } = await api<{
      success: boolean;
      data: { accessToken: string };
    }>("POST", "/auth/register", {
      body: {
        fullName: "E2E Customer",
        email: customerEmail,
        mobile: String(runId).slice(-10).padStart(10, "9"),
        password: DEMO_PASSWORD,
      },
    });
    assert(status === 201 || status === 200, `Register failed: ${status}`);
    customerToken = body.data?.accessToken ?? "";
    assert(!!customerToken, "No access token");
  });

  await step("Add delivery address", async () => {
    const { status, body } = await api<{
      success: boolean;
      data: { address: { _id: string } };
    }>("POST", "/users/address", {
      token: customerToken,
      body: {
        label: "Home",
        fullAddress: "123 Test Street, Mumbai",
        city: "Mumbai",
        pincode: "400001",
        latitude: 19.076,
        longitude: 72.8777,
        isDefault: true,
      },
    });
    assert(status === 200 || status === 201, `Add address failed: ${status}`);
    addressId = String(body.data?.address?._id ?? "");
    assert(!!addressId, "No address id");
  });

  await step("Get menu items", async () => {
    const { status, body } = await api<{
      success: boolean;
      data: { items: { _id: string }[] };
    }>("GET", `/menu/items/${restaurantId}`, { token: customerToken });
    assert(status === 200, `Menu failed: ${status}`);
    const items = body.data?.items ?? [];
    assert(items.length > 0, "No menu items");
    menuItemId = String(items[0]._id);
  });

  await step("Add item to cart", async () => {
    const { status } = await api("POST", "/cart/add", {
      token: customerToken,
      body: { restaurantId, menuItemId, quantity: 1 },
    });
    assert(status === 200 || status === 201, `Add cart failed: ${status}`);
  });

  await step("Get cart with platform policy fees", async () => {
    const { status, body } = await api("GET", "/cart", { token: customerToken });
    assert(status === 200, `Get cart failed: ${status}`);
    const cart = (body as { data?: { cart?: { items?: unknown[]; deliveryFee?: number; platformFee?: number } } }).data?.cart;
    assert((cart?.items?.length ?? 0) > 0, "Cart is empty");
    assert(typeof cart?.deliveryFee === "number", "deliveryFee missing");
    assert(typeof cart?.platformFee === "number", "platformFee missing");
  });

  await step("Create order (COD)", async () => {
    const { status, body } = await api<{
      success: boolean;
      data: { order: { _id: string; orderStatus?: string } };
    }>("POST", "/orders/create", {
      token: customerToken,
      body: { deliveryAddressId: addressId, paymentMethod: "COD" },
    });
    assert(status === 200 || status === 201, `Create order failed: ${status}`);
    orderId = String(body.data?.order?._id ?? "");
    assert(!!orderId, "No order id");
    assert(body.data?.order?.orderStatus === "PENDING", "New order should be PENDING");
  });

  // ─── Restaurant owner journey ──────────────────────────────────
  await step("Restaurant owner login", async () => {
    const { status, body } = await api<{
      success: boolean;
      data: { accessToken: string };
    }>("POST", "/auth/login", {
      body: { email: OWNER_EMAIL, password: DEMO_PASSWORD },
    });
    assert(status === 200, `Owner login failed: ${status} — run npm run seed:e2e`);
    ownerToken = body.data?.accessToken ?? "";
    assert(!!ownerToken, "No owner token");
  });

  await step("Restaurant list orders", async () => {
    const { status, body } = await api<{ success: boolean; data: { orders: Json[] } }>(
      "GET",
      `/orders/restaurant/${restaurantId}`,
      { token: ownerToken },
    );
    assert(status === 200, `Restaurant orders failed: ${status}`);
    assert((body.data?.orders?.length ?? 0) > 0, "No orders for restaurant");
  });

  await step("Restaurant accept order (CONFIRMED)", async () => {
    const { status } = await api("PATCH", `/orders/status/${orderId}`, {
      token: ownerToken,
      body: { status: "CONFIRMED", estimatedPreparationTime: 15 },
    });
    assert(status === 200, `CONFIRMED failed: ${status}`);
  });

  await step("Restaurant → PREPARING", async () => {
    const { status } = await api("PATCH", `/orders/status/${orderId}`, {
      token: ownerToken,
      body: { status: "PREPARING", estimatedPreparationTime: 15 },
    });
    assert(status === 200, `PREPARING failed: ${status}`);
  });

  await step("Restaurant → READY_FOR_PICKUP", async () => {
    const { status } = await api("PATCH", `/orders/status/${orderId}`, {
      token: ownerToken,
      body: { status: "READY_FOR_PICKUP" },
    });
    assert(status === 200, `READY_FOR_PICKUP failed: ${status}`);
  });

  // ─── Rider journey ─────────────────────────────────────────────
  await step("Rider login", async () => {
    const { status, body } = await api<{
      success: boolean;
      data: { accessToken: string };
    }>("POST", "/riders/login", {
      body: { email: RIDER_EMAIL, password: DEMO_PASSWORD },
    });
    assert(status === 200, `Rider login failed: ${status} — run npm run seed:e2e`);
    riderToken = body.data?.accessToken ?? "";
    assert(!!riderToken, "No rider token");
  });

  await step("Rider go online", async () => {
    const { status } = await api("PATCH", "/riders/status", {
      token: riderToken,
      body: { onlineStatus: true },
    });
    assert(status === 200, `Go online failed: ${status}`);
  });

  await step("Rider see available orders", async () => {
    const { status, body } = await api<{ success: boolean; data: { orders: Json[] } }>(
      "GET",
      "/riders/available-orders",
      { token: riderToken },
    );
    assert(status === 200, `Available orders failed: ${status}`);
    const orders = body.data?.orders ?? [];
    assert(orders.some((o) => String((o as { _id: string })._id) === orderId), "Order not in available list");
  });

  await step("Rider accept order", async () => {
    const { status } = await api("PATCH", `/riders/accept-order/${orderId}`, {
      token: riderToken,
    });
    assert(status === 200, `Accept order failed: ${status}`);
  });

  await step("Rider send live GPS location", async () => {
    const { status } = await api("PATCH", "/riders/location", {
      token: riderToken,
      body: { latitude: 19.08, longitude: 72.88, heading: 90 },
    });
    assert(status === 200, `Location update failed: ${status}`);
  });

  await step("Customer sees live rider on track API", async () => {
    const { status, body } = await api<{
      success: boolean;
      data: {
        tracking: {
          liveLocation?: { latitude: number };
          riderLocation?: { latitude: number };
        };
      };
    }>("GET", `/orders/track/${orderId}`, { token: customerToken });
    assert(status === 200, `Track failed: ${status}`);
    const loc = body.data?.tracking?.liveLocation ?? body.data?.tracking?.riderLocation;
    assert(loc?.latitude != null, "Live rider location missing on track API");
  });

  await step("Rider pickup order", async () => {
    const { status } = await api("PATCH", `/riders/pickup-order/${orderId}`, {
      token: riderToken,
    });
    assert(status === 200, `Pickup failed: ${status}`);
  });

  await step("Rider start delivery", async () => {
    const { status } = await api("PATCH", `/riders/start-delivery/${orderId}`, {
      token: riderToken,
    });
    assert(status === 200, `Start delivery failed: ${status}`);
  });

  await step("Rider complete delivery", async () => {
    const { status, body } = await api<{ success: boolean; data: { order: { orderStatus: string } } }>(
      "PATCH",
      `/riders/complete-delivery/${orderId}`,
      { token: riderToken },
    );
    assert(status === 200, `Complete delivery failed: ${status}`);
    assert(body.data?.order?.orderStatus === "DELIVERED", "Order not DELIVERED");
  });

  await step("Rider earnings updated", async () => {
    const { status, body } = await api<{
      success: boolean;
      data: { earnings: { totalDeliveries: number; totalEarnings: number } };
    }>("GET", "/riders/earnings", { token: riderToken });
    assert(status === 200, `Earnings failed: ${status}`);
    assert((body.data?.earnings?.totalDeliveries ?? 0) >= 1, "Rider should have at least 1 delivery");
    assert((body.data?.earnings?.totalEarnings ?? 0) > 0, "Rider earnings should be credited");
  });

  await step("Customer track delivered order", async () => {
    const { status, body } = await api<{ success: boolean; data: { tracking: Json } }>(
      "GET",
      `/orders/track/${orderId}`,
      { token: customerToken },
    );
    assert(status === 200, `Track failed: ${status}`);
    const tracking = body.data?.tracking as { orderStatus?: string };
    assert(tracking?.orderStatus === "DELIVERED", "Tracking should show DELIVERED");
  });

  // ─── Admin panel APIs ──────────────────────────────────────────
  await step("Admin login", async () => {
    const { status, body } = await api<{
      success: boolean;
      data: { accessToken: string };
    }>("POST", "/admin/login", {
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    assert(status === 200, `Admin login failed: ${status}`);
    adminToken = body.data?.accessToken ?? "";
    assert(!!adminToken, "No admin token");
  });

  await step("Admin dashboard", async () => {
    const { status, body } = await api("GET", "/admin/dashboard", { token: adminToken });
    assert(status === 200, `Dashboard failed: ${status}`);
    const stats = (body as { data: { stats: Json } }).data?.stats;
    assert(stats !== undefined, "No stats");
  });

  await step("Admin list orders (delivered)", async () => {
    const { status, body } = await api<{ success: boolean; data: { orders: Json[] } }>(
      "GET",
      "/admin/orders?page=1&limit=10&orderStatus=DELIVERED",
      { token: adminToken },
    );
    assert(status === 200, `Admin orders failed: ${status}`);
    assert((body.data?.orders?.length ?? 0) > 0, "No delivered orders in admin");
  });

  await step("Admin finance summary", async () => {
    const { status } = await api("GET", "/admin/finance/summary", { token: adminToken });
    assert(status === 200, `Finance summary failed: ${status}`);
  });

  await step("Admin list coupons", async () => {
    const { status, body } = await api<{ success: boolean; data: { coupons: unknown[] } }>(
      "GET",
      "/coupons?page=1&limit=10",
      { token: adminToken },
    );
    assert(status === 200, `Coupons list failed: ${status}`);
    assert(Array.isArray(body.data?.coupons), "Coupons array missing");
  });

  await step("Admin platform policy", async () => {
    const { status } = await api("GET", "/admin/platform/policy", { token: adminToken });
    assert(status === 200, `Platform policy failed: ${status}`);
  });

  await step("Admin ledger entries", async () => {
    const { status, body } = await api<{ success: boolean; data: { entries: unknown[] } }>(
      "GET",
      "/admin/finance/ledger?page=1&limit=10",
      { token: adminToken },
    );
    assert(status === 200, `Ledger failed: ${status}`);
    assert(Array.isArray(body.data?.entries), "Entries array missing");
  });

  await step("Admin audit logs", async () => {
    const { status } = await api("GET", "/admin/audit-logs?page=1&limit=5", { token: adminToken });
    assert(status === 200, `Audit logs failed: ${status}`);
  });

  await step("Admin banners CRUD", async () => {
    const { status: createStatus, body: createBody } = await api<{
      success: boolean;
      data: { banner: { _id: string } };
    }>("POST", "/admin/banners", {
      token: adminToken,
      body: {
        title: "E2E Test Banner",
        imageUrl: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800",
        placement: "HOME",
        priority: 1,
      },
    });
    assert(createStatus === 201 || createStatus === 200, `Create banner failed: ${createStatus}`);
    const bannerId = createBody.data?.banner?._id;
    assert(!!bannerId, "No banner id");
    const { status: delStatus } = await api("DELETE", `/admin/banners/${bannerId}`, {
      token: adminToken,
    });
    assert(delStatus === 200, `Delete banner failed: ${delStatus}`);
  });

  await step("Admin tax report", async () => {
    const { status } = await api("GET", "/analytics/tax?days=30", { token: adminToken });
    assert(status === 200, `Tax report failed: ${status}`);
  });

  await step("Public active banners", async () => {
    const { status } = await api("GET", "/public/banners?placement=HOME");
    assert(status === 200, `Public banners failed: ${status}`);
  });

  // ─── Summary ───────────────────────────────────────────────────
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  log("\n─────────────────────────────────────");
  log(`Results: ${passed}/${results.length} passed`);

  if (failed.length > 0) {
    log("\nFailed steps:");
    for (const f of failed) {
      log(`  • ${f.name}: ${f.detail}`);
    }
    process.exit(1);
  }

  log("\n✅ Full E2E flow passed — customer → restaurant → rider → admin\n");
}

main().catch((err) => {
  console.error("\nE2E runner crashed:", err);
  process.exit(1);
});
