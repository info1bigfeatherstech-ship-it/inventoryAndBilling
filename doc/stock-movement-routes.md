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









Authentication
All APIs require Bearer token except login.

Header:

text
Authorization: Bearer <access_token>
Content-Type: application/json
For Stock Transfer APIs (Idempotency required):

text
Idempotency-Key: <unique_uuid_or_string>
📦 1. STOCK LEDGER APIs
Stock Ledger records every stock movement - purchase, transfers, adjustments.

1.1 List All Ledger Entries
Endpoint: GET /stock-ledger

Access: SUPER_ADMIN, WH_MANAGER, WH_STOCK_LISTER, SHOP_OWNER, SHOP_STOCK_LISTER, BILLING_STAFF

Query Parameters:

Param	Type	Description
page	number	Page number (default: 1)
limit	number	Items per page (max: 200)
variant_id	string	Filter by variant ID
product_id	string	Filter by product ID
movement_type	string	PURCHASE, WH_TO_SHOP, WH_TO_WH, SHOP_TO_SHOP, ADJUSTMENT
reference_id	string	Filter by reference ID
reference_type	string	PURCHASE_ENTRY, INWARD_RECEIPT, STOCK_TRANSFER, etc.
from_date	string	ISO date (YYYY-MM-DD)
to_date	string	ISO date (YYYY-MM-DD)
Response:

json
{
  "success": true,
  "message": "Stock ledger entries fetched",
  "data": [
    {
      "ledger_id": "ldg_abc123",
      "product_id": "prod_001",
      "variant_id": "var_001",
      "movement_type": "WH_TO_SHOP",
      "quantity": 100,
      "from_warehouse_id": "wh_delhi_001",
      "to_warehouse_id": null,
      "from_shop_id": null,
      "to_shop_id": "shop_delhi_001",
      "reference_id": null,
      "reference_type": "STOCK_TRANSFER",
      "batch_number": null,
      "expiry_date": null,
      "created_by": "user_123",
      "remarks": null,
      "created_at": "2026-05-23T10:30:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 10,
    "totalPages": 1
  }
}
1.2 Get Variant-wise Ledger
Endpoint: GET /stock-ledger/variant/:variantId

Access: All read roles (filtered by their scope)

Query Parameters:

Param	Type	Description
page	number	Page number
limit	number	Max 200
from	string	ISO date
to	string	ISO date
Example: GET /stock-ledger/variant/var_iphone_001?page=1&limit=20

Response: Same as above

1.3 Get Warehouse-wise Ledger
Endpoint: GET /stock-ledger/warehouse/:warehouseId

Access: SUPER_ADMIN, WH_MANAGER, WH_STOCK_LISTER (only own warehouse)

Query Parameters: Same as variant ledger

Example: GET /stock-ledger/warehouse/wh_delhi_001

1.4 Get Shop-wise Ledger
Endpoint: GET /stock-ledger/shop/:shopId

Access: SUPER_ADMIN, SHOP_OWNER, SHOP_STOCK_LISTER, BILLING_STAFF (only own shop)

Example: GET /stock-ledger/shop/shop_delhi_001

📦 2. STOCK TRANSFER APIs
2.1 Warehouse to Shop Transfer
Endpoint: POST /stock-transfer/transfer/wh-to-shop

Access: SUPER_ADMIN, WH_MANAGER, WH_STOCK_LISTER

Headers Required:

text
Idempotency-Key: transfer_20260523_001
Request Body:

json
{
  "from_warehouse_id": "wh_delhi_001",
  "to_shop_id": "shop_delhi_001",
  "variant_id": "var_iphone_case_001",
  "quantity": 100,
  "batch_number": "BATCH-001",
  "remarks": "Monthly stock replenishment"
}
Field	Required	Type	Description
from_warehouse_id	No (uses user's WH)	string	Source warehouse ID
to_shop_id	Yes	string	Destination shop ID
variant_id	Yes	string	Product variant ID
quantity	Yes	integer	Positive integer
batch_number	No	string	Batch tracking
remarks	No	string	Max 500 chars
Response:

json
{
  "success": true,
  "message": "Warehouse to shop transfer completed",
  "data": {
    "success": true,
    "transferred": 100,
    "ledger_id": "ldg_abc123",
    "source_remaining": 400,
    "destination_new_quantity": 100
  }
}
What happens:

✅ Warehouse stock decreases

✅ Shop stock increases

✅ Stock ledger entry created (movement_type: WH_TO_SHOP)

2.2 Warehouse to Warehouse Transfer
Endpoint: POST /stock-transfer/transfer/wh-to-wh

Access: SUPER_ADMIN, WH_MANAGER, WH_STOCK_LISTER

Headers Required: Idempotency-Key

Request Body:

json
{
  "from_warehouse_id": "wh_delhi_001",
  "to_warehouse_id": "wh_mumbai_001",
  "variant_id": "var_iphone_case_001",
  "quantity": 50,
  "batch_number": "BATCH-001",
  "room_zone": "A",
  "rack_shelf": "Shelf-12",
  "position": "Row-3",
  "remarks": "Stock transfer to Mumbai"
}
Field	Required	Description
from_warehouse_id	No	Source warehouse
to_warehouse_id	Yes	Destination warehouse
variant_id	Yes	Product variant ID
quantity	Yes	Positive integer
batch_number	No	Batch tracking
room_zone	No	Storage zone in destination
rack_shelf	No	Shelf in destination
position	No	Exact position
remarks	No	Notes
Response:

json
{
  "success": true,
  "message": "Warehouse to warehouse transfer completed",
  "data": {
    "success": true,
    "transferred": 50,
    "ledger_id": "ldg_xyz789",
    "source_remaining": 350
  }
}
2.3 Shop to Shop Transfer
Endpoint: POST /stock-transfer/transfer/shop-to-shop

Access: SUPER_ADMIN, SHOP_OWNER

Headers Required: Idempotency-Key

Request Body:

json
{
  "from_shop_id": "shop_delhi_001",
  "to_shop_id": "shop_noida_001",
  "variant_id": "var_iphone_case_001",
  "quantity": 30,
  "remarks": "Stock transfer between shops"
}
Field	Required	Description
from_shop_id	No (uses user's shop)	Source shop ID
to_shop_id	Yes	Destination shop ID
variant_id	Yes	Product variant ID
quantity	Yes	Positive integer
remarks	No	Notes
Response:

json
{
  "success": true,
  "message": "Shop to shop transfer completed",
  "data": {
    "success": true,
    "transferred": 30,
    "ledger_id": "ldg_def456",
    "source_remaining": 70,
    "destination_new_quantity": 30
  }
}
2.4 Stock Reconciliation (Physical Count)
Endpoint: POST /stock-transfer/reconcile

Access: SUPER_ADMIN only

Headers Required: Idempotency-Key

Request Body:

json
{
  "warehouse_id": "wh_delhi_001",
  "variant_id": "var_iphone_case_001",
  "physical_count": 480,
  "batch_number": "BATCH-001",
  "reason": "Physical stock audit",
  "remarks": "Found 20 pieces damaged"
}
Field	Required	Description
warehouse_id	Yes	Warehouse ID
variant_id	Yes	Product variant ID
physical_count	Yes	Actual physical count
batch_number	No	Batch number
reason	No	Why reconciliation
remarks	No	Additional notes
Response:

json
{
  "success": true,
  "message": "Stock reconciliation completed",
  "data": {
    "success": true,
    "adjusted": -20,
    "ledger_id": "ldg_rec_001",
    "system_quantity_before": 500,
    "physical_count": 480,
    "system_quantity_after": 480
  }
}
🎯 MOVEMENT TYPES REFERENCE
Type	Description	When Created
PURCHASE	Goods received from vendor	Inward → MAPPED
WH_TO_SHOP	Warehouse to shop transfer	Stock transfer API
WH_TO_WH	Warehouse to warehouse transfer	Stock transfer API
SHOP_TO_SHOP	Shop to shop transfer	Stock transfer API
ADJUSTMENT	Manual stock adjustment	Stock update or reconciliation
🔒 ROLE-BASED ACCESS SUMMARY
Role	Ledger View	WH→Shop	WH→WH	Shop→Shop	Reconcile
SUPER_ADMIN	All	✅	✅	✅	✅
WH_MANAGER	Own WH only	✅	✅	❌	❌
WH_STOCK_LISTER	Own WH only	✅	✅	❌	❌
SHOP_OWNER	Own shop only	❌	❌	✅	❌
SHOP_STOCK_LISTER	Own shop only	❌	❌	❌	❌
BILLING_STAFF	Own shop only	❌	❌	❌	❌
📋 POSTMAN COLLECTION (Import Ready)
json
{
  "info": {
    "name": "Vyaapar Stock APIs",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    { "key": "baseUrl", "value": "http://localhost:3441/api/v1" },
    { "key": "token", "value": "" },
    { "key": "warehouseId", "value": "" },
    { "key": "shopId", "value": "" },
    { "key": "variantId", "value": "" }
  ],
  "item": [
    {
      "name": "Stock Ledger",
      "item": [
        {
          "name": "List All Ledger",
          "request": {
            "method": "GET",
            "url": "{{baseUrl}}/stock-ledger?page=1&limit=20",
            "header": [{ "key": "Authorization", "value": "Bearer {{token}}" }]
          }
        },
        {
          "name": "Variant Ledger",
          "request": {
            "method": "GET",
            "url": "{{baseUrl}}/stock-ledger/variant/{{variantId}}",
            "header": [{ "key": "Authorization", "value": "Bearer {{token}}" }]
          }
        },
        {
          "name": "Warehouse Ledger",
          "request": {
            "method": "GET",
            "url": "{{baseUrl}}/stock-ledger/warehouse/{{warehouseId}}",
            "header": [{ "key": "Authorization", "value": "Bearer {{token}}" }]
          }
        },
        {
          "name": "Shop Ledger",
          "request": {
            "method": "GET",
            "url": "{{baseUrl}}/stock-ledger/shop/{{shopId}}",
            "header": [{ "key": "Authorization", "value": "Bearer {{token}}" }]
          }
        }
      ]
    },
    {
      "name": "Stock Transfer",
      "item": [
        {
          "name": "WH to Shop",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/stock-transfer/transfer/wh-to-shop",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" },
              { "key": "Idempotency-Key", "value": "{{$timestamp}}" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"from_warehouse_id\": \"{{warehouseId}}\",\n  \"to_shop_id\": \"{{shopId}}\",\n  \"variant_id\": \"{{variantId}}\",\n  \"quantity\": 100,\n  \"remarks\": \"Stock transfer\"\n}"
            }
          }
        },
        {
          "name": "WH to WH",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/stock-transfer/transfer/wh-to-wh",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" },
              { "key": "Idempotency-Key", "value": "{{$timestamp}}" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"from_warehouse_id\": \"{{warehouseId}}\",\n  \"to_warehouse_id\": \"wh_target_001\",\n  \"variant_id\": \"{{variantId}}\",\n  \"quantity\": 50,\n  \"remarks\": \"Inter-warehouse transfer\"\n}"
            }
          }
        },
        {
          "name": "Shop to Shop",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/stock-transfer/transfer/shop-to-shop",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" },
              { "key": "Idempotency-Key", "value": "{{$timestamp}}" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"to_shop_id\": \"shop_target_001\",\n  \"variant_id\": \"{{variantId}}\",\n  \"quantity\": 30,\n  \"remarks\": \"Shop to shop transfer\"\n}"
            }
          }
        },
        {
          "name": "Reconcile Stock",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/stock-transfer/reconcile",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" },
              { "key": "Idempotency-Key", "value": "{{$timestamp}}" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"warehouse_id\": \"{{warehouseId}}\",\n  \"variant_id\": \"{{variantId}}\",\n  \"physical_count\": 450,\n  \"reason\": \"Physical audit\"\n}"
            }
          }
        }
      ]
    }
  ]
}
⚠️ ERROR CODES
Code	HTTP Status	Description
INSUFFICIENT_STOCK	409	Not enough stock available
VARIANT_NOT_FOUND	404	Variant does not exist
WAREHOUSE_NOT_FOUND	404	Warehouse not found
SHOP_NOT_FOUND	404	Shop not found
FORBIDDEN	403	Insufficient permissions
TOKEN_EXPIRED	401	JWT token expired
IDEMPOTENCY_KEY_REQUIRED	400	Missing Idempotency-Key header







access token isinto the new thing is the main this is new thing caching is into the main thing is into the main the restore the user latest is the new thing is into the new thing is into the main thing is into the main thing is into the main thing in which is into the main thing in which new thing in which thing which is into the main thing is into the main this is into the main thing isinto the new thing in which is into the main thinf is into the main thing into the main thing is thing this is into the main into the main remotely is into the new thing is into the main thing is into the main thing is into the mainthing is into the main thing is into the main thing is into the main thing is into the main thing is into the main thing is into the main the new thing is into the main thing is into the main