# Online Stock — Internal API (E-comm / Wholesale ↔ Inventory)

**Audience:** OfferWaleBaba (e-comm + wholesale) backend agents / developers  
**Source of truth:** Inventory software (Postgres) — **variant-level** stock by `productCode`  
**Base URL (local):** `http://localhost:3000/api/v1/internal/stock`  
**Auth:** `X-Api-Key: <INTERNAL_STOCK_API_KEY>` (not JWT)

---

## Business rules (must follow)

| Rule | Detail |
|------|--------|
| Match key | Normalized `productCode` **per variant** (`34354-1`, `34354-2`) |
| Never | Sum / merge variant stocks into one product-level master |
| Pool | Single configured **online fulfillment warehouse** (`ProductStock`) |
| Available | `quantity - quantity_reserved` |
| Missing code | Code omitted in batch `stock` map + listed in `missing` → e-comm **Mongo fallback** |
| Inventory API down @ checkout | E-comm may **Mongo fallback** (agreed) |
| Storefronts | `ecomm` + `wholesale` share the **same** stock pool |

### productCode normalization (both sides)

1. `trim` + `uppercase`
2. Suffix canonicalize: `34354-01` → `34354-1`
3. Bare base `34354` may resolve to primary variant `34354-1` on inventory side
4. Variant lookup is **scoped to the configured online fulfillment warehouse** (`product.warehouse_id`). Codes in other warehouses are ignored.

---

## Auth

```http
X-Api-Key: <INTERNAL_STOCK_API_KEY>
```

Also accepted:

- `Authorization: ApiKey <key>`
- `Authorization: Bearer <key>` (same shared secret)

| Situation | HTTP | Code |
|-----------|------|------|
| Key not set on inventory server | 503 | `INTERNAL_STOCK_API_DISABLED` |
| Wrong / missing key | 401 | `INVALID_API_KEY` |
| Online warehouse not configured | 409 | `ONLINE_WAREHOUSE_NOT_CONFIGURED` |

---

## 1) Batch READ

`POST /api/v1/internal/stock/batch`

**When:** listing, PDP, search, cart validation.

### Request

```json
{
  "codes": ["34354-1", "34354-2", "9002-1"]
}
```

- Max codes: 200 (env `INTERNAL_STOCK_BATCH_MAX_CODES`, capped at 500)

### Success `200`

```json
{
  "success": true,
  "message": "Stock batch fetched successfully",
  "data": {
    "warehouse_id": "clx...",
    "missing": ["9002-1"],
    "stock": {
      "34354-1": { "available": 3 },
      "34354-2": { "available": 10 }
    }
  },
  "requestId": "..."
}
```

**E-comm overlay:** for each variant, if `stock[code]` exists → use `available`; else Mongo fallback + log warning.

---

## 2) Reserve (hold)

`POST /api/v1/internal/stock/reserve`

**When:** checkout / order place (replace Mongo `$inc` cut).

### Request

```json
{
  "orderId": "ORD-12345",
  "storefront": "ecomm",
  "lines": [
    { "productCode": "34354-1", "quantity": 1 },
    { "productCode": "9002-2", "quantity": 2 }
  ]
}
```

- `storefront`: `ecomm` | `wholesale` (string, optional; default `ecomm`)
- Duplicate `productCode` lines are **merged** (qty summed)
- **All-or-nothing:** any line short → whole reserve fails, nothing held
- **Idempotent** on `orderId` + same lines → `200` with `idempotent: true`

### Success `201` (new) / `200` (idempotent replay)

```json
{
  "success": true,
  "message": "Stock reserved successfully",
  "data": {
    "idempotent": false,
    "reservation": {
      "reservation_id": "...",
      "orderId": "ORD-12345",
      "storefront": "ecomm",
      "status": "HELD",
      "warehouse_id": "...",
      "lines": [
        { "productCode": "34354-1", "variant_id": "...", "quantity": 1 }
      ],
      "created_at": "...",
      "updated_at": "...",
      "committed_at": null,
      "released_at": null
    }
  }
}
```

### Errors

| HTTP | Code | Meaning |
|------|------|---------|
| 409 | `INSUFFICIENT_STOCK` | `details.lines[]` with `productCode`, `requested`, `available` |
| 409 | `ORDER_RESERVATION_CONFLICT` | Same `orderId`, different lines |
| 409 | `ORDER_RESERVATION_NOT_HELD` | Already `COMMITTED` / `RELEASED` |
| 409 | `STOCK_CONFLICT` | Concurrent update — **retry** |
| 400 | `INVALID_QUANTITY` / `LINES_REQUIRED` / `ORDER_ID_REQUIRED` | Validation |

---

## 3) Release (cancel / fail / abandon)

`POST /api/v1/internal/stock/release`

### Request

```json
{
  "orderId": "ORD-12345"
}
```

Optional: full held `lines` (must match held fingerprint). Partial release is **not** supported.

### Success `200`

- First release → stock hold freed  
- Replay → `idempotent: true` (safe)

### Errors

| HTTP | Code |
|------|------|
| 404 | `RESERVATION_NOT_FOUND` |
| 409 | `ORDER_ALREADY_COMMITTED` |
| 409 | `STOCK_CONFLICT` (retry) |

---

## 4) Commit (paid / confirmed sold)

`POST /api/v1/internal/stock/commit`

### Request

```json
{
  "orderId": "ORD-12345"
}
```

Converts hold → sold: decreases `quantity` and `quantity_reserved`.

### Success `200`

- First commit → sold  
- Replay → `idempotent: true`

### Errors

| HTTP | Code |
|------|------|
| 404 | `RESERVATION_NOT_FOUND` |
| 409 | `ORDER_ALREADY_RELEASED` |
| 409 | `STOCK_CONFLICT` (retry) |

---

## Order lifecycle (e-comm)

```
Browse / Cart     →  POST .../batch
Checkout success  →  POST .../reserve   (status HELD)
Payment success   →  POST .../commit    (status COMMITTED)
Cancel / fail     →  POST .../release   (status RELEASED)
Admin edit lines  →  release old orderId flow + reserve new
```

**Do not** cut Mongo stock when inventory reserve succeeds.  
**Do** keep Mongo qty as fallback only when code missing or API degraded.

---

## Suggested e-comm client

File: `externalInventory.service.js`

| Method | Maps to |
|--------|---------|
| `getStockBatch(codes[])` | `/batch` |
| `reserveStock({ orderId, storefront, lines })` | `/reserve` |
| `releaseStock({ orderId })` | `/release` |
| `commitStock({ orderId })` | `/commit` |

Config (e-comm `.env`):

```env
INVENTORY_STOCK_BASE_URL=http://localhost:3000/api/v1/internal/stock
INVENTORY_STOCK_API_KEY=<same as inventory INTERNAL_STOCK_API_KEY>
INVENTORY_STOCK_TIMEOUT_MS=5000
```

Timeouts / 5xx / connection errors → treat as **degraded** (Mongo fallback on read/checkout per policy).

---

## Localhost checklist (inventory side)

1. Migrations applied: `npx prisma migrate deploy` (or `migrate dev` locally)
2. `.env`:
   ```env
   INTERNAL_STOCK_API_KEY=dev-local-stock-key-change-me
   ```
3. Restart backend
4. SUPER_ADMIN → **Settings → Online Stock** → pick fulfillment warehouse → Save
5. Smoke:
   ```bash
   cd backend
   npm run smoke:online-stock
   # reserve + release (no permanent qty cut):
   set SMOKE_PRODUCT_CODE=34354-1
   set SMOKE_FULL=1
   npm run smoke:online-stock
   # also commit (reduces WH qty by 1):
   set SMOKE_COMMIT=1
   npm run smoke:online-stock
   ```

---

## Non-goals

- Catalog / price / image sync  
- Product-level (non-variant) stock as master  
- Auto-create products in e-comm from inventory  

---

## Inventory contacts / files

| Piece | Path |
|-------|------|
| Service | `src/services/stock/onlineStock.service.js` |
| Routes | `src/routes/stock/onlineStock.routes.js` |
| Settings UI | Settings → Online Stock |
| Handoff summary | [online-stock-ecomm-handoff.md](./online-stock-ecomm-handoff.md) |
