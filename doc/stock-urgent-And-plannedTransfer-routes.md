STOCK MODULES - COMPLETE API DOCUMENTATION
Base URL
text
http://localhost:3441/api/v1
Authentication Header (All APIs)
text
Authorization: Bearer <access_token>
Content-Type: application/json
For Stock Transfer APIs (Idempotency required):

text
Idempotency-Key: <unique_uuid_or_string>
🔍 1. EMERGENCY STOCK SEARCH
1.1 Search Stock Across All Locations
Endpoint: GET {{BASE_URL}}/stock/search

Access: All authenticated users

Query Parameters:

Param	Type	Required	Description
variant_id	string	No*	Exact variant ID
product_code	string	No*	Product code
sku	string	No*	SKU of variant
barcode	string	No*	System or vendor barcode
city	string	No	Filter by city for priority
nearby_only	boolean	No	Show only same city results
request_type	string	No	`WH_TO_WH`, `WH_TO_SHOP`, or `SHOP_TO_SHOP` — scopes results by transfer intent (see below)
*At least one search parameter required

**Search scope (role + request_type):**

| Caller / `request_type` | Warehouses in response | Shops in response |
|-------------------------|------------------------|-------------------|
| `WH_MANAGER` / `WH_STOCK_LISTER` (default) | Other warehouses with stock; **own warehouse excluded** | **None** |
| `WH_TO_WH` | Same as WH manager default | None |
| `WH_TO_SHOP` | All warehouses with stock | None |
| `SHOP_TO_SHOP` | None | Other shops with stock; **own shop excluded** |
| `SHOP_OWNER` (no `request_type`) | All warehouses with stock | Other shops; own shop excluded |
| `SUPER_ADMIN` (no `request_type`) | All | All |

Example Request:

http
GET {{BASE_URL}}/stock/search?product_code=IP15CASE&city=Delhi&nearby_only=true
Response (200 OK):

json
{
  "success": true,
  "message": "Stock search completed successfully",
  "data": {
    "product": {
      "product_id": "prod_001",
      "product_code": "IP15CASE",
      "name": "iPhone 15 Silicon Case"
    },
    "variant": {
      "variant_id": "var_001",
      "sku": "SKU-IP15-001",
      "product_code": "IP15CASE-1",
      "attributes": { "color": "Black" },
      "system_barcode": "8901234567890"
    },
    "warehouses": [
      {
        "warehouse_id": "wh_delhi_001",
        "warehouse_code": "WH-DEL-001",
        "warehouse_name": "Delhi Warehouse",
        "city": "Delhi",
        "distance": "same city",
        "stock_quantity": 500,
        "last_updated": "2026-05-25T10:00:00.000Z"
      }
    ],
    "shops": [
      {
        "shop_id": "shop_delhi_001",
        "shop_code": "SHOP-DL-001",
        "shop_name": "Delhi Central Store",
        "city": "Delhi",
        "distance": "same city",
        "stock_quantity": 250,
        "last_updated": "2026-05-25T09:00:00.000Z"
      },
      {
        "shop_id": "shop_noida_001",
        "shop_code": "SHOP-NO-001",
        "shop_name": "Noida Store",
        "city": "Noida",
        "distance": "other city",
        "stock_quantity": 100,
        "last_updated": "2026-05-24T18:00:00.000Z"
      }
    ]
  }
}
🚨 2. EMERGENCY TRANSFER REQUEST (Single Item)
2.1 Create Emergency Transfer Request
Endpoint: POST {{BASE_URL}}/transfer-requests/emergency

Access: SUPER_ADMIN, WH_MANAGER, SHOP_OWNER

Headers Required: Idempotency-Key

Request Body:

json
{
  "request_type": "WH_TO_SHOP",
  "from_warehouse_id": "wh_delhi_001",
  "to_shop_id": "shop_delhi_001",
  "variant_id": "var_iphone_001",
  "quantity": 50,
  "priority": "HIGH",
  "expected_delivery": "2026-05-26T10:00:00.000Z",
  "request_remarks": "Urgent - customer waiting"
}
Field	Required	Type	Description
request_type	Yes	string	WH_TO_WH, WH_TO_SHOP, SHOP_TO_SHOP
from_warehouse_id	Conditional	string	Required for WH_TO_WH, WH_TO_SHOP
to_warehouse_id	Conditional	string	Required for WH_TO_WH
from_shop_id	Conditional	string	Required for SHOP_TO_SHOP
to_shop_id	Conditional	string	Required for WH_TO_SHOP, SHOP_TO_SHOP
variant_id	Yes	string	Product variant ID
quantity	Yes	integer	Positive integer
priority	No	string	HIGH, NORMAL (default: NORMAL)
expected_delivery	No	ISO date	Expected delivery date
request_remarks	No	string	Max 500 chars
Response (201 Created):

json
{
  "success": true,
  "message": "Emergency transfer request created successfully",
  "data": {
    "request_id": "req_001",
    "request_number": "TR-20260525-001",
    "request_type": "WH_TO_SHOP",
    "from_warehouse_id": "wh_delhi_001",
    "to_shop_id": "shop_delhi_001",
    "variant_id": "var_iphone_001",
    "quantity": 50,
    "priority": "HIGH",
    "status": "REQUESTED",
    "expected_delivery": "2026-05-26T10:00:00.000Z",
    "request_remarks": "Urgent - customer waiting",
    "requested_by": "user_001",
    "requested_at": "2026-05-25T10:00:00.000Z"
  }
}
📋 3. REGULAR TRANSFER REQUEST (Single Item)
3.1 Create Transfer Request
Endpoint: POST {{BASE_URL}}/transfer-requests

Access: SUPER_ADMIN, WH_MANAGER, SHOP_OWNER

Headers Required: Idempotency-Key

Request Body:

json
{
  "request_type": "SHOP_TO_SHOP",
  "from_shop_id": "shop_delhi_001",
  "to_shop_id": "shop_noida_001",
  "variant_id": "var_iphone_001",
  "quantity": 30,
  "request_remarks": "Transfer for customer order"
}
3.2 List Transfer Requests
Endpoint: GET {{BASE_URL}}/transfer-requests

Query Parameters:

Param	Type	Description
page	number	Page number
limit	number	Max 100
status	string	REQUESTED, APPROVED, DISPATCHED, RECEIVED, COMPLETED, CANCELLED
request_type	string	WH_TO_WH, WH_TO_SHOP, SHOP_TO_SHOP
3.3 Get My Transfer Requests
Endpoint: GET {{BASE_URL}}/transfer-requests/my-requests

3.4 Get Transfer Request by ID
Endpoint: GET {{BASE_URL}}/transfer-requests/:requestId

3.5 Approve Transfer Request
Endpoint: PATCH {{BASE_URL}}/transfer-requests/:requestId/approve

Headers Required: Idempotency-Key

3.6 Reject Transfer Request
Endpoint: PATCH {{BASE_URL}}/transfer-requests/:requestId/reject

Request Body:

json
{
  "rejection_reason": "Insufficient stock in warehouse"
}
3.7 Dispatch Transfer Request
Endpoint: PATCH {{BASE_URL}}/transfer-requests/:requestId/dispatch

Headers Required: Idempotency-Key

Request Body:

json
{
  "tracking_number": "TRK-2026-001",
  "expected_delivery": "2026-05-27T10:00:00.000Z"
}
3.8 Receive Transfer Request
Endpoint: PATCH {{BASE_URL}}/transfer-requests/:requestId/receive

Request Body:

json
{
  "received_quantity": 30,
  "receive_remarks": "All goods received in good condition"
}
3.9 Cancel Transfer Request
Endpoint: PATCH {{BASE_URL}}/transfer-requests/:requestId/cancel

Request Body:

json
{
  "cancel_reason": "No longer needed"
}


📋 3.10 Shop Warehouse Stock Catalog (variant picker)
Endpoint: GET {{BASE_URL}}/shops/:shopId/warehouse-stock-catalog

Access: SUPER_ADMIN, SHOP_OWNER (own shop only)

Query Parameters:

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| warehouse_id | string | Yes | Source warehouse for WH→shop requests |
| mode | string | No | `new`, `existing`, or `all` (default: `all`) |
| search | string | No | Filter by product name, code, or SKU |
| page | number | No | Default 1 |
| limit | number | No | Default 50, max 100 |

**Mode definitions:**

| Mode | Variant included when |
|------|----------------------|
| `new` | Warehouse stock > 0 AND shop has no stock (no row or available + in_transit = 0) |
| `existing` | Active `shop_product_level`, OR shop has stock, OR below min level |
| `all` | Any variant with warehouse stock > 0 |

Response groups products with `variants[]` per line: `warehouse_available`, `shop_available`, `suggested_quantity` (existing mode), `selectable`.

Use with `POST /bulk-transfer-requests` — send only selected `variant_id` rows in `items[]`. Dispatch deducts warehouse stock per approved variant only (partial product selection is supported).

**Create-time validation:** Each item quantity is checked against aggregate warehouse availability before the request is saved (`INSUFFICIENT_STOCK` if over-requested).

Example:

```http
GET {{BASE_URL}}/shops/shop_noida_001/warehouse-stock-catalog?warehouse_id=wh_delhi_001&mode=new&search=case
```

---

📦 4. BULK TRANSFER REQUEST (Multiple Items)
4.1 Create Bulk Transfer Request
Endpoint: POST {{BASE_URL}}/bulk-transfer-requests

Access: SUPER_ADMIN, SHOP_OWNER

Headers Required: Idempotency-Key

Request Body:

json
{
  "to_shop_id": "shop_noida_001",
  "from_warehouse_id": "wh_delhi_001",
  "request_type": "WH_TO_SHOP",
  "request_remarks": "Monthly restock - April 2026",
  "items": [
    { "variant_id": "var_iphone_001", "quantity": 185 },
    { "variant_id": "var_charger_001", "quantity": 142 },
    { "variant_id": "var_cable_001", "quantity": 480 }
  ]
}
Field	Required	Type	Description
to_shop_id	No (uses user's shop)	string	Destination shop
from_warehouse_id	Yes	string	Source warehouse
request_type	No	string	Default: WH_TO_SHOP
request_remarks	No	string	Max 500 chars
items	Yes	array	Max 100 items
items.*.variant_id	Yes	string	Variant ID
items.*.quantity	Yes	integer	Positive integer; must not exceed warehouse available (validated at create)
Response (201 Created):

json
{
  "success": true,
  "message": "Bulk transfer request created successfully",
  "data": {
    "bulk_request_id": "breq_001",
    "bulk_request_number": "BTR-20260525-001",
    "status": "REQUESTED",
    "items_count": 3,
    "total_quantity": 807
  }
}
4.2 List Bulk Transfer Requests
Endpoint: GET {{BASE_URL}}/bulk-transfer-requests

Query Parameters:

Param	Type	Description
page	number	Page number
limit	number	Max 100
status	string	REQUESTED, APPROVED, DISPATCHED, COMPLETED, etc.
to_shop_id	string	Filter by destination shop
4.3 Get Bulk Transfer Request by ID
Endpoint: GET {{BASE_URL}}/bulk-transfer-requests/:bulkRequestId

4.4 Approve Bulk Transfer Request
Endpoint: PATCH {{BASE_URL}}/bulk-transfer-requests/:bulkRequestId/approve

Headers Required: Idempotency-Key

Request Body (Full Approval - all items):

json
{}
Request Body (Partial Approval):

json
{
  "items": [
    { "variant_id": "var_iphone_001", "quantity": 185, "approved": true },
    { "variant_id": "var_charger_001", "quantity": 142, "approved": true },
    { "variant_id": "var_cable_001", "quantity": 200, "approved": true },
    { "variant_id": "var_screen_guard_001", "quantity": 0, "approved": false, "reason": "Out of stock" }
  ]
}
4.5 Dispatch Bulk Transfer Request
Endpoint: PATCH {{BASE_URL}}/bulk-transfer-requests/:bulkRequestId/dispatch

Headers Required: Idempotency-Key

Request Body:

json
{
  "tracking_number": "BULK-TRK-001",
  "expected_delivery": "2026-05-28T10:00:00.000Z"
}
4.6 Receive Bulk Transfer Request
Endpoint: PATCH {{BASE_URL}}/bulk-transfer-requests/:bulkRequestId/receive

Headers Required: Idempotency-Key

Request Body (Full Receive):

json
{
  "receive_remarks": "All goods received"
}
Request Body (Partial Receive):

json
{
  "items": [
    { "variant_id": "var_iphone_001", "received_quantity": 185 },
    { "variant_id": "var_charger_001", "received_quantity": 142 },
    { "variant_id": "var_cable_001", "received_quantity": 200, "remarks": "Short by 280 pieces" }
  ],
  "receive_remarks": "Partial receive - cable short"
}
4.7 Cancel Bulk Transfer Request
Endpoint: PATCH {{BASE_URL}}/bulk-transfer-requests/:bulkRequestId/cancel

Request Body:

json
{
  "cancel_reason": "Monthly order cancelled"
}
📊 5. SHOP PRODUCT MIN-MAX LEVELS
5.1 Set Product Levels (Min-Max)
Endpoint: POST {{BASE_URL}}/shop-product-levels

Access: SUPER_ADMIN, SHOP_OWNER

Request Body:

json
{
  "shop_id": "shop_noida_001",
  "items": [
    { "variant_id": "var_iphone_001", "min_level": 50, "max_level": 200 },
    { "variant_id": "var_charger_001", "min_level": 30, "max_level": 150 },
    { "variant_id": "var_cable_001", "min_level": 100, "max_level": 500, "reorder_qty": 400 }
  ]
}
Field	Required	Description
shop_id	No (uses user's shop)	Shop ID
items	Yes	Array of levels
items.*.variant_id	Yes	Variant ID
items.*.min_level	Yes	Non-negative integer (reorder trigger)
items.*.max_level	Yes	Integer >= min_level
items.*.reorder_qty	No	Fixed reorder quantity (overrides max-min)
Response (200 OK):

json
{
  "success": true,
  "message": "Product levels saved successfully",
  "data": {
    "created": 2,
    "updated": 1,
    "failed": []
  }
}
5.2 Get Reorder Suggestions
Endpoint: GET {{BASE_URL}}/shop-reorder-suggestions

Access: SUPER_ADMIN, SHOP_OWNER, SHOP_STOCK_LISTER, BILLING_STAFF

Query Parameters:

Param	Type	Description
shop_id	string	Shop ID (uses user's shop if not provided)
warehouse_id	string	Preferred source warehouse
Response (200 OK):

json
{
  "success": true,
  "message": "Reorder suggestions fetched successfully",
  "data": {
    "shop_id": "shop_noida_001",
    "shop_name": "Noida Store",
    "source_warehouse_id": "wh_delhi_001",
    "warehouses": [
      { "warehouse_id": "wh_delhi_001", "warehouse_name": "Delhi Warehouse", "city": "Delhi", "is_default": true },
      { "warehouse_id": "wh_mumbai_001", "warehouse_name": "Mumbai Warehouse", "city": "Mumbai", "is_default": false }
    ],
    "items": [
      {
        "variant_id": "var_iphone_001",
        "product_name": "iPhone 15 Case",
        "sku": "SKU-IP15-001",
        "current_stock": 15,
        "min_level": 50,
        "max_level": 200,
        "suggested_quantity": 185,
        "available_in_warehouse": 500,
        "status": "BELOW_MIN"
      },
      {
        "variant_id": "var_charger_001",
        "product_name": "20W Charger",
        "sku": "SKU-CHR-001",
        "current_stock": 8,
        "min_level": 30,
        "max_level": 150,
        "suggested_quantity": 142,
        "available_in_warehouse": 300,
        "status": "BELOW_MIN"
      }
    ],
    "summary": {
      "total_items_below_min": 2,
      "total_suggested_quantity": 327
    }
  }
}
🔄 6. COMPLETE WORKFLOW EXAMPLES
Workflow A: Emergency Stock Refill
javascript
// Step 1: Search for product availability
GET /stock/search?product_code=IP15CASE&city=Delhi

// Step 2: Create emergency transfer request
POST /transfer-requests/emergency
Idempotency-Key: emg-001
{
  "request_type": "WH_TO_SHOP",
  "from_warehouse_id": "wh_delhi_001",
  "to_shop_id": "shop_delhi_001",
  "variant_id": "var_iphone_001",
  "quantity": 50,
  "priority": "HIGH",
  "expected_delivery": "2026-05-26T10:00:00Z"
}

// Step 3: Warehouse Manager approves
PATCH /transfer-requests/{requestId}/approve

// Step 4: Warehouse staff dispatches
PATCH /transfer-requests/{requestId}/dispatch
{
  "tracking_number": "TRK-001",
  "expected_delivery": "2026-05-26T10:00:00Z"
}

// Step 5: Shop Owner receives
PATCH /transfer-requests/{requestId}/receive
{
  "received_quantity": 50,
  "receive_remarks": "Goods received"
}
Workflow B: Monthly Bulk Restock
javascript
// Step 1: Set Min-Max levels (one-time setup)
POST /shop-product-levels
{
  "items": [
    { "variant_id": "var_iphone_001", "min_level": 50, "max_level": 200 },
    { "variant_id": "var_charger_001", "min_level": 30, "max_level": 150 }
  ]
}

// Step 2: Check reorder suggestions
GET /shop-reorder-suggestions?shop_id=shop_noida_001

// Step 3: Create bulk transfer request
POST /bulk-transfer-requests
Idempotency-Key: bulk-001
{
  "to_shop_id": "shop_noida_001",
  "from_warehouse_id": "wh_delhi_001",
  "items": [
    { "variant_id": "var_iphone_001", "quantity": 185 },
    { "variant_id": "var_charger_001", "quantity": 142 }
  ],
  "request_remarks": "Monthly restock"
}

// Step 4: Approve bulk request
PATCH /bulk-transfer-requests/{bulkRequestId}/approve

// Step 5: Dispatch bulk request
PATCH /bulk-transfer-requests/{bulkRequestId}/dispatch
{
  "tracking_number": "BULK-001",
  "expected_delivery": "2026-05-28T10:00:00Z"
}

// Step 6: Receive bulk request
PATCH /bulk-transfer-requests/{bulkRequestId}/receive
{
  "receive_remarks": "All goods received"
}
📋 POSTMAN COLLECTION (Import Ready)
json
{
  "info": {
    "name": "Vyaapar Stock Modules",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    { "key": "baseUrl", "value": "http://localhost:3441/api/v1" },
    { "key": "token", "value": "" },
    { "key": "requestId", "value": "" },
    { "key": "bulkRequestId", "value": "" },
    { "key": "variantId", "value": "var_iphone_001" },
    { "key": "warehouseId", "value": "wh_delhi_001" },
    { "key": "shopId", "value": "shop_noida_001" }
  ],
  "item": [
    {
      "name": "Emergency Stock Search",
      "item": [
        {
          "name": "Search by Product Code",
          "request": {
            "method": "GET",
            "url": "{{baseUrl}}/stock/search?product_code=IP15CASE&city=Delhi",
            "header": [{ "key": "Authorization", "value": "Bearer {{token}}" }]
          }
        },
        {
          "name": "Search Nearby Only",
          "request": {
            "method": "GET",
            "url": "{{baseUrl}}/stock/search?product_code=IP15CASE&city=Delhi&nearby_only=true",
            "header": [{ "key": "Authorization", "value": "Bearer {{token}}" }]
          }
        }
      ]
    },
    {
      "name": "Emergency Transfer",
      "item": [
        {
          "name": "Create Emergency Request",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/transfer-requests/emergency",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" },
              { "key": "Idempotency-Key", "value": "{{$timestamp}}" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"request_type\": \"WH_TO_SHOP\",\n  \"from_warehouse_id\": \"{{warehouseId}}\",\n  \"to_shop_id\": \"{{shopId}}\",\n  \"variant_id\": \"{{variantId}}\",\n  \"quantity\": 50,\n  \"priority\": \"HIGH\",\n  \"expected_delivery\": \"2026-05-26T10:00:00Z\",\n  \"request_remarks\": \"Urgent stock needed\"\n}"
            }
          }
        }
      ]
    },
    {
      "name": "Bulk Transfer",
      "item": [
        {
          "name": "Set Min-Max Levels",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/shop-product-levels",
            "header": [{ "key": "Authorization", "value": "Bearer {{token}}" }],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"shop_id\": \"{{shopId}}\",\n  \"items\": [\n    { \"variant_id\": \"{{variantId}}\", \"min_level\": 50, \"max_level\": 200 }\n  ]\n}"
            }
          }
        },
        {
          "name": "Get Reorder Suggestions",
          "request": {
            "method": "GET",
            "url": "{{baseUrl}}/shop-reorder-suggestions?shop_id={{shopId}}",
            "header": [{ "key": "Authorization", "value": "Bearer {{token}}" }]
          }
        },
        {
          "name": "Create Bulk Request",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/bulk-transfer-requests",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" },
              { "key": "Idempotency-Key", "value": "{{$timestamp}}" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"to_shop_id\": \"{{shopId}}\",\n  \"from_warehouse_id\": \"{{warehouseId}}\",\n  \"items\": [\n    { \"variant_id\": \"{{variantId}}\", \"quantity\": 150 }\n  ],\n  \"request_remarks\": \"Monthly restock\"\n}"
            }
          }
        },
        {
          "name": "Approve Bulk Request",
          "request": {
            "method": "PATCH",
            "url": "{{baseUrl}}/bulk-transfer-requests/{{bulkRequestId}}/approve",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" },
              { "key": "Idempotency-Key", "value": "{{$timestamp}}" }
            ]
          }
        },
        {
          "name": "Dispatch Bulk Request",
          "request": {
            "method": "PATCH",
            "url": "{{baseUrl}}/bulk-transfer-requests/{{bulkRequestId}}/dispatch",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" },
              { "key": "Idempotency-Key", "value": "{{$timestamp}}" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"tracking_number\": \"BULK-001\",\n  \"expected_delivery\": \"2026-05-28T10:00:00Z\"\n}"
            }
          }
        },
        {
          "name": "Receive Bulk Request",
          "request": {
            "method": "PATCH",
            "url": "{{baseUrl}}/bulk-transfer-requests/{{bulkRequestId}}/receive",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" },
              { "key": "Idempotency-Key", "value": "{{$timestamp}}" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"receive_remarks\": \"All goods received\"\n}"
            }
          }
        }
      ]
    },
    {
      "name": "Regular Transfer",
      "item": [
        {
          "name": "Create Transfer Request",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/transfer-requests",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" },
              { "key": "Idempotency-Key", "value": "{{$timestamp}}" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"request_type\": \"WH_TO_SHOP\",\n  \"from_warehouse_id\": \"{{warehouseId}}\",\n  \"to_shop_id\": \"{{shopId}}\",\n  \"variant_id\": \"{{variantId}}\",\n  \"quantity\": 100,\n  \"request_remarks\": \"Regular stock\"\n}"
            }
          }
        },
        {
          "name": "List My Requests",
          "request": {
            "method": "GET",
            "url": "{{baseUrl}}/transfer-requests/my-requests?page=1&limit=20",
            "header": [{ "key": "Authorization", "value": "Bearer {{token}}" }]
          }
        },
        {
          "name": "Approve Request",
          "request": {
            "method": "PATCH",
            "url": "{{baseUrl}}/transfer-requests/{{requestId}}/approve",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" },
              { "key": "Idempotency-Key", "value": "{{$timestamp}}" }
            ]
          }
        },
        {
          "name": "Dispatch Request",
          "request": {
            "method": "PATCH",
            "url": "{{baseUrl}}/transfer-requests/{{requestId}}/dispatch",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" },
              { "key": "Idempotency-Key", "value": "{{$timestamp}}" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"tracking_number\": \"TRK-001\",\n  \"expected_delivery\": \"2026-05-27T10:00:00Z\"\n}"
            }
          }
        },
        {
          "name": "Receive Request",
          "request": {
            "method": "PATCH",
            "url": "{{baseUrl}}/transfer-requests/{{requestId}}/receive",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" },
              { "key": "Idempotency-Key", "value": "{{$timestamp}}" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"received_quantity\": 100,\n  \"receive_remarks\": \"Goods received\"\n}"
            }
          }
        },
        {
          "name": "Cancel Request",
          "request": {
            "method": "PATCH",
            "url": "{{baseUrl}}/transfer-requests/{{requestId}}/cancel",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" },
              { "key": "Idempotency-Key", "value": "{{$timestamp}}" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"cancel_reason\": \"No longer needed\"\n}"
            }
          }
        }
      ]
    }
  ]
}
✅ SUMMARY - ALL ENDPOINTS
Category	Endpoint	Method
Stock Search	/stock/search	GET
Emergency Request	/transfer-requests/emergency	POST
Transfer Request (CRUD)	/transfer-requests	POST, GET
Transfer Request (Actions)	/transfer-requests/:id/approve	PATCH
/transfer-requests/:id/reject	PATCH
/transfer-requests/:id/dispatch	PATCH
/transfer-requests/:id/receive	PATCH
/transfer-requests/:id/cancel	PATCH
Bulk Transfer	/bulk-transfer-requests	POST, GET
/bulk-transfer-requests/:id	GET
/bulk-transfer-requests/:id/approve	PATCH
/bulk-transfer-requests/:id/dispatch	PATCH
/bulk-transfer-requests/:id/receive	PATCH
/bulk-transfer-requests/:id/cancel	PATCH
Min-Max Levels	/shop-product-levels	POST
Reorder Suggestions	/shop-reorder-suggestions	GET
Shop WH Catalog	/shops/:shopId/warehouse-stock-catalog	GET