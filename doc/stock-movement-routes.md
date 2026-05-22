# Stock Movement API

Warehouse inventory, shop inventory, transfers, and audit ledger.

**Auth:** `Authorization: Bearer <token>`  
**Idempotency (transfers):** Header `idempotency-key` required — cached 24h in Redis.

---

## Stock flow (single source of truth)

| Step | Stock changes? |
|------|----------------|
| Product create / CSV bulk | **No** |
| Inward → status **MAPPED** | **Yes** — `product_stocks` + ledger `PURCHASE` |
| `POST /product-stocks` | **Yes** — manual WH adjustment + ledger |
| `POST /stock/transfer/*` | **Yes** — move between WH/shop + ledger |
| `PATCH /shop-stocks/:variantId` | **Yes** — shop adjustment + ledger |

---

## Shops — `/api/v1/shops`

| Method | Path | Roles |
|--------|------|--------|
| POST | `/` | `SUPER_ADMIN` |
| GET | `/` | Admin, shop staff, WH read |
| GET | `/:shopId` | Admin, shop staff (own shop) |
| PUT | `/:shopId` | `SUPER_ADMIN` |
| DELETE | `/:shopId` | `SUPER_ADMIN` (soft) |

**Create body:**

```json
{
  "shop_code": "SHOP_MUM_01",
  "shop_name": "Mumbai Store",
  "address": "123 MG Road",
  "city": "Mumbai",
  "phone": "9876543210",
  "email": "store@example.com"
}
```

---

## Shop stock — `/api/v1/shop-stocks`

Tracked per **variant** (`shop_id` + `variant_id`).

| Method | Path | Roles |
|--------|------|--------|
| GET | `/` | Shop + WH read |
| GET | `/low-stock` | Shop + WH read |
| GET | `/:variantId` | Shop + WH read |
| PATCH | `/:variantId` | `SUPER_ADMIN`, `SHOP_OWNER`, `SHOP_STOCK_LISTER` |
| PATCH | `/bulk` | Same |

**Adjust body:**

```json
{
  "shop_id": "optional-for-admin",
  "quantity": 10,
  "operation": "increment",
  "reason": "Opening balance correction"
}
```

`operation`: `set` | `increment` | `decrement` — never allows negative `quantity_available`.

---

## Transfers — `/api/v1/stock`

### WH → Shop

`POST /stock/transfer/wh-to-shop`

```json
{
  "from_warehouse_id": "wh_xxx",
  "to_shop_id": "shop_xxx",
  "variant_id": "var_xxx",
  "quantity": 50,
  "batch_number": "",
  "remarks": "Daily replenishment"
}
```

Roles: `SUPER_ADMIN`, `WH_MANAGER`, `WH_STOCK_LISTER`

### WH → WH

`POST /stock/transfer/wh-to-wh`

```json
{
  "from_warehouse_id": "wh_a",
  "to_warehouse_id": "wh_b",
  "variant_id": "var_xxx",
  "quantity": 20,
  "batch_number": ""
}
```

### Shop → Shop

`POST /stock/transfer/shop-to-shop`

```json
{
  "from_shop_id": "shop_a",
  "to_shop_id": "shop_b",
  "variant_id": "var_xxx",
  "quantity": 5
}
```

Roles: `SUPER_ADMIN`, `SHOP_OWNER` (from own shop only)

### Physical reconcile (admin)

`POST /stock/reconcile`

```json
{
  "warehouse_id": "wh_xxx",
  "variant_id": "var_xxx",
  "physical_count": 120,
  "batch_number": "",
  "reason": "Monthly cycle count"
}
```

Role: `SUPER_ADMIN` only

---

## Stock ledger — `/api/v1/stock/ledger`

Immutable audit trail for every movement.

| Method | Path |
|--------|------|
| GET | `/` — filters: `variant_id`, `movement_type`, `from_date`, `to_date` |
| GET | `/variant/:variantId` |
| GET | `/warehouse/:warehouseId` |
| GET | `/shop/:shopId` |

**Movement types:** `PURCHASE`, `WH_TO_SHOP`, `WH_TO_WH`, `SHOP_TO_SHOP`, `ADJUSTMENT`, `SALES`, `RETURN`

---

## Error codes

| Code | HTTP |
|------|------|
| `INSUFFICIENT_STOCK` | 409 |
| `SHOP_NOT_FOUND` | 404 |
| `SHOP_INACTIVE` | 409 |
| `WAREHOUSE_NOT_FOUND` | 404 |
| `SAME_LOCATION_TRANSFER` | 400 |
| `TRANSFER_QUANTITY_INVALID` | 400 |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 |
| `IDEMPOTENCY_CONFLICT` | 409 |
| `VARIANT_NOT_FOUND` | 404 |

---

## Testing (curl)

```bash
# WH → Shop (repeat same idempotency-key = same response, no double transfer)
curl -X POST http://localhost:3441/api/v1/stock/transfer/wh-to-shop \
  -H "Authorization: Bearer $TOKEN" \
  -H "idempotency-key: transfer-001" \
  -H "Content-Type: application/json" \
  -d '{"to_shop_id":"...","variant_id":"...","quantity":10}'
```

See also: [product-stock-routes.md](./product-stock-routes.md), [inward-routes.md](./inward-routes.md), [product-routes.md](./product-routes.md)
