# V1 Finance Module — Manual Settlements

**Approach:** Razorpay collects customer payments into the **platform account**. Restaurant settlements and rider payouts are **manual** by admin in V1. No RazorpayX/Cashfree Payouts. **No customer wallet** in V1.

---

## Money flow

```
Customer pays (COD or Razorpay ONLINE)
    → Platform account / COD collected by rider
    → Order DELIVERED → financial snapshot recorded on order
    → Restaurant net payable accrues (PENDING)
    → Rider earning accrues (PENDING)
    → Admin creates settlement / payout batch
    → Admin marks PAID with bank UTR / reference (manual transfer)
```

---

## Commission formula (per delivered order)

| Field | Calculation |
|-------|-------------|
| `restaurantGrossAmount` | `subtotal + packagingCharge` |
| `commissionAmount` | `subtotal × restaurant.platformCommissionPercentage / 100` (default 15%) |
| `restaurantNetPayable` | `restaurantGrossAmount - commissionAmount` |
| `riderEarningAmount` | `₹40` flat if rider assigned (`RIDER_EARNING_PER_DELIVERY`) |
| `platformCustomerFee` | Customer `platformFee` on order (5% capped ₹25) |

**Note:** Customer `platformFee` ≠ restaurant commission. Both can apply on the same order.

---

## Database collections

| Collection | Purpose |
|------------|---------|
| `orders.settlement` | Per-order financial snapshot (embedded) |
| `restaurant_settlements` | Admin batch settlement to restaurant |
| `rider_payouts` | Admin weekly payout batch to rider |

### Order settlement statuses

| Party | PENDING | SETTLED | PAID |
|-------|---------|---------|------|
| Restaurant | Awaiting admin batch | In settlement batch | Bank transfer done |
| Rider | Awaiting payout batch | — | Paid via admin |

---

## API reference

Base: `/api/v1`

### Admin (Bearer admin token)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/admin/finance/summary` | Platform GMV, commission, pending totals |
| GET | `/admin/finance/restaurants/earnings` | Restaurant-wise pending payable list |
| GET | `/admin/finance/restaurants/:restaurantId/earnings` | Pending orders + bank details |
| POST | `/admin/finance/restaurants/:restaurantId/settlements` | Create settlement batch |
| GET | `/admin/finance/restaurants/settlements` | Settlement history |
| PATCH | `/admin/finance/restaurants/settlements/:settlementId/mark-paid` | Mark manual transfer done |
| GET | `/admin/finance/riders/earnings` | Rider-wise pending earnings |
| POST | `/admin/finance/riders/:riderId/payouts` | Create weekly payout batch |
| GET | `/admin/finance/riders/payouts` | Payout history |
| PATCH | `/admin/finance/riders/payouts/:payoutId/mark-paid` | Mark rider paid |

**Create restaurant settlement body:**

```json
{
  "periodStart": "2026-06-01",
  "periodEnd": "2026-06-07",
  "notes": "Week 23 settlement"
}
```

Or pass explicit `"orderIds": ["..."]`.

**Mark paid body:**

```json
{
  "paymentReference": "NEFT-UTR-1234567890",
  "notes": "Paid via HDFC corporate account"
}
```

### Restaurant owner (Bearer token, `restaurant_owner`)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/restaurants/:restaurantId/earnings` | Pending + paid summary |
| GET | `/restaurants/:restaurantId/settlements` | Settlement history |

### Rider (Bearer token, `rider`)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/riders/earnings/summary` | Pending payout + paid totals (V1) |
| GET | `/riders/payouts` | Payout history |

---

## V1 restrictions

- `POST /orders/create` with `paymentMethod: "WALLET"` → **400** disabled
- `POST /payments/wallet/add-money` → **501** disabled
- Automated bank payouts → **not implemented** (future RazorpayX phase)

---

## Admin weekly rider payout workflow

1. `GET /admin/finance/riders/earnings` — see pending per rider
2. `POST /admin/finance/riders/:riderId/payouts` with `periodStart` / `periodEnd` (Mon–Sun)
3. Transfer manually via bank
4. `PATCH .../mark-paid` with UTR reference

## Admin restaurant settlement workflow

1. `GET /admin/finance/restaurants/earnings`
2. `POST /admin/finance/restaurants/:restaurantId/settlements`
3. Manual NEFT/UPI to restaurant `bankAccountDetails`
4. `PATCH .../mark-paid`

---

## Files added

- `src/models/restaurantSettlement.model.ts`
- `src/models/riderPayout.model.ts`
- `src/services/finance.service.ts`
- `src/controllers/finance.controller.ts`
- `src/validators/finance.validator.ts`

Hooks: `recordOrderFinancialsOnDelivery()` on all `DELIVERED` paths in `order.service.ts` and `rider.service.ts`.
