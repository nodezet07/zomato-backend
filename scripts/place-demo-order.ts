/**
 * Place one COD order to Demo Biryani House (customer → restaurant notification test).
 *
 * Usage: npx tsx scripts/place-demo-order.ts
 */
import "dotenv/config";

const BASE = (process.env.E2E_BASE_URL || "http://localhost:5000/api/v1").replace(/\/$/, "");
const CUSTOMER_EMAIL = process.env.CUSTOMER_EMAIL || "customer@foodapp.com";
const PASSWORD = process.env.E2E_PASSWORD || "Test@123456";

async function api<T = Record<string, unknown>>(
  method: string,
  path: string,
  opts?: { body?: Record<string, unknown>; token?: string },
): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts?.token) headers.Authorization = `Bearer ${opts.token}`;

  const res = await fetch(`${BASE}${path}`, { method, headers, body: opts?.body ? JSON.stringify(opts.body) : undefined });
  const text = await res.text();
  let body: T;
  try {
    body = text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    body = { raw: text } as T;
  }
  return { status: res.status, body };
}

async function main() {
  console.log("\n🛒 Placing test order → Demo Biryani House");
  console.log(`   API: ${BASE}\n`);

  const health = await api("GET", "/health");
  if (health.status !== 200) throw new Error("Backend not reachable — run npm run dev in clone-backend");

  let login = await api<{ data?: { accessToken?: string } }>("POST", "/auth/login", {
    body: { email: CUSTOMER_EMAIL, password: PASSWORD },
  });

  if (login.status !== 200) {
    console.log("   Customer not found — run: npm run seed:all");
    throw new Error(`Customer login failed (${login.status})`);
  }

  const token = login.body.data!.accessToken!;

  const search = await api<{ data?: { restaurants?: { _id: string; restaurantName?: string }[] } }>(
    "GET",
    "/restaurants/search?q=Demo+Biryani&limit=1",
    { token },
  );
  const restaurant = search.body.data?.restaurants?.[0];
  if (!restaurant) throw new Error("Demo Biryani House not found — run npm run seed:phase2");

  const menu = await api<{ data?: { items?: { _id: string; name?: string }[] } }>(
    "GET",
    `/menu/items/${restaurant._id}`,
    { token },
  );
  const item = menu.body.data?.items?.[0];
  if (!item) throw new Error("No menu items — run npm run seed:demo");

  const addr = await api<{ data?: { address?: { _id: string } } }>("POST", "/users/address", {
    token,
    body: {
      label: "APK test",
      fullAddress: "123 Test Street, Mumbai",
      city: "Mumbai",
      pincode: "400001",
      latitude: 19.076,
      longitude: 72.8777,
      isDefault: true,
    },
  });
  const addressId = addr.body.data?.address?._id;
  if (!addressId) throw new Error("Failed to create address");

  await api("POST", "/cart/add", {
    token,
    body: { restaurantId: restaurant._id, menuItemId: item._id, quantity: 1 },
  });

  const orderRes = await api<{ data?: { order?: { _id: string; orderNumber?: string; orderStatus?: string } } }>(
    "POST",
    "/orders/create",
    { token, body: { deliveryAddressId: addressId, paymentMethod: "COD" } },
  );

  if (orderRes.status !== 200 && orderRes.status !== 201) {
    throw new Error(`Order create failed: ${orderRes.status} ${JSON.stringify(orderRes.body).slice(0, 200)}`);
  }

  const order = orderRes.body.data!.order!;
  console.log("✅ Order placed successfully\n");
  console.log(`   Restaurant: ${restaurant.restaurantName ?? "Demo Biryani House"}`);
  console.log(`   Item:       ${item.name ?? item._id}`);
  console.log(`   Customer:   ${CUSTOMER_EMAIL}`);
  console.log(`   Order ID:   ${order._id}`);
  console.log(`   Order #:    ${order.orderNumber ?? order._id.slice(-6).toUpperCase()}`);
  console.log(`   Status:     ${order.orderStatus ?? "PENDING"}`);
  console.log("\n📱 Restaurant APK should show:");
  console.log("   • In-app toast + bell notification (socket)");
  console.log("   • Local notification if alerts enabled in Settings");
  console.log("   • Orders tab → Pending tab\n");
}

main().catch((err) => {
  console.error("\n❌", err instanceof Error ? err.message : err);
  process.exit(1);
});
