# Inventory ↔ E-comm Stock Integration — Handoff Summary

**For:** OfferWaleBaba (e-comm + wholesale) AI agents / developers  
**From:** Inventory / Billing software (Postgres + Prisma)  
**Status:** Phase 1–3 implemented on inventory side (localhost-ready). Live deploy after local verification.

---

## One-liner

E-comm/wholesale catalog stays in Mongo; **every variant’s stock** is read/written in Inventory by **`productCode`**; checkout uses atomic **reserve → commit / release**; missing codes / API down → Mongo fallback; **never merge variant stocks**.

---

## What inventory already implemented

### Schema (additive, production-safe)

- `product_stocks.quantity_reserved` (default 0)
- `app_settings.online_warehouse_id` — single online fulfillment warehouse
- `online_stock_reservations` + `online_stock_reservation_lines` (+ `allocations` JSON for safe multi-batch holds)

### Settings UI

SUPER_ADMIN → **Settings → Online Stock** → select warehouse.

Optional env override: `ONLINE_WAREHOUSE_ID` (wins over UI).

### Internal APIs

Full contract: **[online-stock-internal-api.md](./online-stock-internal-api.md)**

| Endpoint | Role |
|----------|------|
| `POST /api/v1/internal/stock/batch` | Read available by codes |
| `POST /api/v1/internal/stock/reserve` | Hold on checkout |
| `POST /api/v1/internal/stock/commit` | Confirm paid / sold |
| `POST /api/v1/internal/stock/release` | Cancel / fail / abandon |

Auth: `X-Api-Key` = shared `INTERNAL_STOCK_API_KEY`.

### Stock math

```
available = quantity - quantity_reserved   (online warehouse only)
```

Warehouse transfers / deducts already respect free (unreserved) qty.

---

## What e-comm / wholesale must implement

1. **`externalInventory.service.js`** — client for batch / reserve / commit / release  
2. **Overlay** inventory `available` on product/cart APIs — **per variant**, never summed  
3. Replace Mongo stock cut on order success with **reserve**; on pay **commit**; on cancel **release**  
4. Store `productCode` on order lines  
5. Keep Mongo quantity as **fallback only**  
6. Prefer readonly Mongo stock edit for inventory-linked products (later)

### Agreed policies

| Topic | Decision |
|-------|----------|
| Stock pool | Warehouse `ProductStock` (one fulfillment WH) |
| Reserve style | True reserve (hold → commit/release) |
| E-comm + wholesale | Same pool |
| API down @ checkout | Mongo fallback |
| Missing productCode | Mongo fallback + log |

---

## Example E2E

Inventory WH:

- `34354-1` → quantity 3, reserved 0 → available 3  
- `34354-2` → available 10  

User buys `34354-1` qty 1:

1. `reserve({ orderId: "ORD-1", lines: [{ productCode: "34354-1", quantity: 1 }] })`  
   → reserved 1, available 2; `34354-2` untouched  
2. Payment OK → `commit({ orderId: "ORD-1" })`  
   → quantity 2, reserved 0  
3. Or cancel → `release({ orderId: "ORD-1" })`  
   → quantity 3, reserved 0  

---

## Local test (before live)

**Inventory**

```bash
# backend/.env
INTERNAL_STOCK_API_KEY=dev-local-stock-key-change-me

npx prisma migrate deploy   # or migrate dev
npm run dev

# UI: Settings → Online Stock → pick WH

npm run smoke:online-stock
```

**E-comm**

```env
INVENTORY_STOCK_BASE_URL=http://localhost:3000/api/v1/internal/stock
INVENTORY_STOCK_API_KEY=dev-local-stock-key-change-me
```

Start with **batch overlay only**, then wire reserve/commit/release.

---

## Live deploy (later — do not skip)

1. `pg_dump` backup  
2. Deploy inventory code  
3. `npx prisma migrate deploy`  
4. Set strong `INTERNAL_STOCK_API_KEY`  
5. Configure Online Stock warehouse in UI  
6. Restart  
7. Point e-comm at production inventory URL + same key  
8. Roll out: batch → reserve/commit/release  

---

## Error codes cheat sheet

| Code | Action for e-comm |
|------|-------------------|
| `INSUFFICIENT_STOCK` | Show OOS / reduce qty; do not place order |
| `STOCK_CONFLICT` | Retry once, then fail soft |
| `ONLINE_WAREHOUSE_NOT_CONFIGURED` | Treat as inventory misconfig / fallback |
| `INTERNAL_STOCK_API_DISABLED` / `INVALID_API_KEY` | Config error — fix env |
| `RESERVATION_NOT_FOUND` | No hold to release/commit |
| Timeout / 5xx | Degraded → Mongo fallback (agreed) |

---

## Out of scope

Catalog create, price sync, images/SEO sync, product-level single stock master.
