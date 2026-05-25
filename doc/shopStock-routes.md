2. SHOP STOCK APIS
2.1 List Shop Stocks
Access: SUPER_ADMIN, SHOP_OWNER, SHOP_STOCK_LISTER, BILLING_STAFF, WH_MANAGER

Endpoint: GET {{BASE_URL}}/shop-stocks

Query Parameters:

Param	Type	Description
shop_id	string	Shop ID (optional, uses user's shop)
page	number	Page number
limit	number	Max 100
variant_id	string	Filter by variant
min_quantity	number	Minimum available quantity
low_stock_only	boolean	Show only low stock items
Example:

text
GET {{BASE_URL}}/shop-stocks?shop_id=shop_001&page=1&limit=20&min_quantity=10
Response (200 OK):

json
{
  "success": true,
  "message": "Shop stocks fetched successfully",
  "data": [
    {
      "shop_stock_id": "sstock_001",
      "shop_id": "shop_001",
      "variant_id": "var_iphone_001",
      "quantity_available": 500,
      "quantity_reserved": 10,
      "quantity_in_transit": 50,
      "low_stock_threshold": 10,
      "created_at": "2026-05-25T10:00:00.000Z",
      "updated_at": "2026-05-25T10:00:00.000Z",
      "variant": {
        "variant_id": "var_iphone_001",
        "sku": "SKU-IP15-001",
        "product_code": "IP15-001",
        "system_barcode": "8901234567890",
        "product": {
          "product_id": "prod_001",
          "product_code": "IP15",
          "name": "iPhone 15 Case",
          "warehouse_id": "wh_delhi_001"
        }
      },
      "shop": {
        "shop_id": "shop_001",
        "shop_code": "SHOP_DL_001",
        "shop_name": "Delhi Central Store",
        "is_active": true
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
2.2 Get Low Stock Alerts
Access: All read roles

Endpoint: GET {{BASE_URL}}/shop-stocks/low-stock

Example:

text
GET {{BASE_URL}}/shop-stocks/low-stock?shop_id=shop_001
Response (200 OK):

json
{
  "success": true,
  "message": "Low stock alerts fetched",
  "data": {
    "shop_id": "shop_001",
    "count": 2,
    "alerts": [
      {
        "shop_stock_id": "sstock_002",
        "variant_id": "var_charger_001",
        "quantity_available": 5,
        "low_stock_threshold": 10,
        "variant": {
          "sku": "SKU-CHR-001",
          "product": { "name": "iPhone Charger" }
        }
      }
    ]
  }
}
2.3 Get Shop Stock by Variant
Access: All read roles

Endpoint: GET {{BASE_URL}}/shop-stocks/:variantId

Example:

text
GET {{BASE_URL}}/shop-stocks/var_iphone_001?shop_id=shop_001
Response (200 OK):

json
{
  "success": true,
  "message": "Shop stock fetched successfully",
  "data": {
    "shop_id": "shop_001",
    "variant_id": "var_iphone_001",
    "quantity_available": 500,
    "quantity_reserved": 10,
    "quantity_in_transit": 50,
    "low_stock_threshold": 10
  }
}
Note: If stock not found, returns default object with zero quantities.

2.4 Update Shop Stock
Access: SUPER_ADMIN, SHOP_OWNER, SHOP_STOCK_LISTER

Endpoint: PATCH {{BASE_URL}}/shop-stocks/:variantId

Request Body (Set Operation):

json
{
  "shop_id": "shop_001",
  "quantity": 150,
  "operation": "set",
  "reason": "Physical stock count after audit",
  "low_stock_threshold": 15,
  "remarks": "Updated after inventory"
}
Request Body (Increment Operation):

json
{
  "shop_id": "shop_001",
  "quantity": 50,
  "operation": "increment",
  "reason": "New stock received from warehouse",
  "remarks": "WH-001 transfer completed"
}
Request Body (Decrement Operation):

json
{
  "shop_id": "shop_001",
  "quantity": 10,
  "operation": "decrement",
  "reason": "Sold to customer",
  "remarks": "Bill #INV-2026-001"
}
Field	Required	Description
shop_id	No	Uses user's shop if not provided
quantity	Yes	Positive number
operation	No	set (default), increment, decrement
reason	No	Reason for change
low_stock_threshold	No	New threshold value
remarks	No	Additional notes
Response (200 OK):

json
{
  "success": true,
  "message": "Shop stock updated successfully",
  "data": {
    "stock": {
      "shop_stock_id": "sstock_001",
      "shop_id": "shop_001",
      "variant_id": "var_iphone_001",
      "quantity_available": 150,
      "quantity_reserved": 10,
      "quantity_in_transit": 50,
      "low_stock_threshold": 15,
      "created_at": "2026-05-25T10:00:00.000Z",
      "updated_at": "2026-05-25T12:00:00.000Z"
    },
    "before": 500,
    "after": 150
  }
}
2.5 Bulk Update Shop Stocks
Access: SUPER_ADMIN, SHOP_OWNER, SHOP_STOCK_LISTER

Endpoint: PATCH {{BASE_URL}}/shop-stocks/bulk

Request Body:

json
{
  "shop_id": "shop_001",
  "items": [
    {
      "variant_id": "var_iphone_001",
      "quantity": 500,
      "operation": "set",
      "reason": "Initial stock setup"
    },
    {
      "variant_id": "var_charger_001",
      "quantity": 50,
      "operation": "increment",
      "reason": "Stock received"
    },
    {
      "variant_id": "var_cable_001",
      "quantity": 20,
      "operation": "decrement",
      "reason": "Sold items"
    }
  ]
}
Response (200 OK):

json
{
  "success": true,
  "message": "Bulk shop stock update completed",
  "data": {
    "updated": 3,
    "failed": []
  }
}
If some fail:

json
{
  "success": true,
  "message": "Bulk shop stock update completed",
  "data": {
    "updated": 2,
    "failed": [
      {
        "index": 2,
        "variant_id": "var_cable_001",
        "message": "Variant not found",
        "code": "VARIANT_NOT_FOUND"
      }
    ]
  }
}
3. SHOP STOCK LEDGER APIS
3.1 List Shop Ledger Entries
Access: SUPER_ADMIN, SHOP_OWNER, SHOP_STOCK_LISTER, BILLING_STAFF

Endpoint: GET {{BASE_URL}}/stock-ledger/shop/:shopId

Query Parameters:

Param	Type	Description
page	number	Page number
limit	number	Max 200
from	string	ISO date
to	string	ISO date
Example:

text
GET {{BASE_URL}}/stock-ledger/shop/shop_001?page=1&limit=20&from=2026-01-01
Response (200 OK):

json
{
  "success": true,
  "message": "Shop ledger fetched",
  "data": [
    {
      "ledger_id": "ldg_001",
      "movement_type": "WH_TO_SHOP",
      "quantity": 100,
      "from_warehouse_id": "wh_delhi_001",
      "to_shop_id": "shop_001",
      "reference_type": "STOCK_TRANSFER",
      "created_by": "user_wh_manager",
      "remarks": null,
      "created_at": "2026-05-25T10:30:00.000Z"
    },
    {
      "ledger_id": "ldg_002",
      "movement_type": "ADJUSTMENT",
      "quantity": 50,
      "to_shop_id": "shop_001",
      "reference_type": "SHOP_STOCK_ADJUSTMENT",
      "created_by": "user_shop_owner",
      "remarks": "Stock received from warehouse (500 → 550)",
      "created_at": "2026-05-25T11:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 2,
    "totalPages": 1
  }
}
4. COMPLETE WORKFLOW EXAMPLES
Flow 1: Setup New Shop and Stock
javascript
// Step 1: Super Admin creates SHOP_OWNER user
POST /api/v1/users
{
  "name": "Rajesh Khanna",
  "phone": "9876543210",
  "password": "ShopOwner@123",
  "role": "SHOP_OWNER"
}
// Response: user_id = "user_rajesh"

// Step 2: Super Admin creates shop with owner
POST /api/v1/shops
{
  "shop_code": "SHOP_DL_001",
  "shop_name": "Delhi Central Store",
  "address": "Sector 18, Okhla Phase 2",
  "city": "Delhi",
  "phone": "9876543210",
  "owner_user_id": "user_rajesh"
}
// Response: shop_id = "shop_001"

// Step 3: Shop owner logs in
POST /api/v1/auth/login
{
  "phone": "9876543210",
  "password": "ShopOwner@123"
}
// Gets token with shop_id automatically

// Step 4: Shop owner views their shop
GET /api/v1/shops/me
// Returns shop details with stock summary

// Step 5: Warehouse manager transfers stock to shop
POST /api/v1/stock-transfer/transfer/wh-to-shop
Headers: { "Idempotency-Key": "transfer_001" }
{
  "from_warehouse_id": "wh_delhi_001",
  "to_shop_id": "shop_001",
  "variant_id": "var_iphone_001",
  "quantity": 500
}

// Step 6: Shop owner checks stock
GET /api/v1/shop-stocks?shop_id=shop_001
// Shows 500 pieces available

// Step 7: Billing staff sells items
PATCH /api/v1/shop-stocks/var_iphone_001
{
  "shop_id": "shop_001",
  "quantity": 1,
  "operation": "decrement",
  "reason": "Sold to customer",
  "remarks": "Bill #INV-001"
}
Flow 2: Daily Shop Operations
javascript
// 1. Cashier checks stock before billing
GET /api/v1/shop-stocks/var_iphone_001?shop_id=shop_001

// 2. Check low stock items (manager alert)
GET /api/v1/shop-stocks/low-stock?shop_id=shop_001

// 3. Bulk update after physical audit
PATCH /api/v1/shop-stocks/bulk
{
  "shop_id": "shop_001",
  "items": [
    {"variant_id": "var_iphone_001", "quantity": 450, "operation": "set"},
    {"variant_id": "var_charger_001", "quantity": 80, "operation": "set"}
  ]
}

// 4. View stock movement history
GET /api/v1/stock-ledger/shop/shop_001?from=2026-05-01&to=2026-05-31
📋 POSTMAN COLLECTION (Copy-Paste Ready)
json
{
  "info": {
    "name": "Vyaapar Shop APIs",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    { "key": "baseUrl", "value": "http://localhost:3441/api/v1" },
    { "key": "token", "value": "" },
    { "key": "shopId", "value": "" },
    { "key": "variantId", "value": "" }
  ],
  "item": [
    {
      "name": "Shop APIs",
      "item": [
        { "name": "Create Shop", "request": { "method": "POST", "url": "{{baseUrl}}/shops", "header": [{ "key": "Authorization", "value": "Bearer {{token}}" }] } },
        { "name": "List Shops", "request": { "method": "GET", "url": "{{baseUrl}}/shops?page=1&limit=10", "header": [{ "key": "Authorization", "value": "Bearer {{token}}" }] } },
        { "name": "Get My Shop", "request": { "method": "GET", "url": "{{baseUrl}}/shops/me", "header": [{ "key": "Authorization", "value": "Bearer {{token}}" }] } },
        { "name": "Get Shop by ID", "request": { "method": "GET", "url": "{{baseUrl}}/shops/{{shopId}}", "header": [{ "key": "Authorization", "value": "Bearer {{token}}" }] } },
        { "name": "Update Shop", "request": { "method": "PUT", "url": "{{baseUrl}}/shops/{{shopId}}", "header": [{ "key": "Authorization", "value": "Bearer {{token}}" }] } },
        { "name": "Deactivate Shop", "request": { "method": "DELETE", "url": "{{baseUrl}}/shops/{{shopId}}", "header": [{ "key": "Authorization", "value": "Bearer {{token}}" }] } }
      ]
    },
    {
      "name": "Shop Stock APIs",
      "item": [
        { "name": "List Shop Stocks", "request": { "method": "GET", "url": "{{baseUrl}}/shop-stocks?shop_id={{shopId}}&page=1&limit=20", "header": [{ "key": "Authorization", "value": "Bearer {{token}}" }] } },
        { "name": "Low Stock Alerts", "request": { "method": "GET", "url": "{{baseUrl}}/shop-stocks/low-stock?shop_id={{shopId}}", "header": [{ "key": "Authorization", "value": "Bearer {{token}}" }] } },
        { "name": "Get Stock by Variant", "request": { "method": "GET", "url": "{{baseUrl}}/shop-stocks/{{variantId}}?shop_id={{shopId}}", "header": [{ "key": "Authorization", "value": "Bearer {{token}}" }] } },
        { "name": "Update Stock (Set)", "request": { "method": "PATCH", "url": "{{baseUrl}}/shop-stocks/{{variantId}}", "header": [{ "key": "Authorization", "value": "Bearer {{token}}" }] } },
        { "name": "Update Stock (Increment)", "request": { "method": "PATCH", "url": "{{baseUrl}}/shop-stocks/{{variantId}}", "header": [{ "key": "Authorization", "value": "Bearer {{token}}" }] } },
        { "name": "Update Stock (Decrement)", "request": { "method": "PATCH", "url": "{{baseUrl}}/shop-stocks/{{variantId}}", "header": [{ "key": "Authorization", "value": "Bearer {{token}}" }] } },
        { "name": "Bulk Update Stocks", "request": { "method": "PATCH", "url": "{{baseUrl}}/shop-stocks/bulk", "header": [{ "key": "Authorization", "value": "Bearer {{token}}" }] } }
      ]
    },
    {
      "name": "Shop Ledger APIs",
      "item": [
        { "name": "Shop Ledger", "request": { "method": "GET", "url": "{{baseUrl}}/stock-ledger/shop/{{shopId}}?page=1&limit=20", "header": [{ "key": "Authorization", "value": "Bearer {{token}}" }] } }
      ]
    }
  ]
}
✅ SUMMARY - ALL WORKING ENDPOINTS
Category	Endpoint	Method
Shop	/shops	POST
Shop	/shops	GET
Shop	/shops/me	GET
Shop	/shops/:shopId	GET
Shop	/shops/:shopId	PUT
Shop	/shops/:shopId	DELETE
Shop Stock	/shop-stocks	GET
Shop Stock	/shop-stocks/low-stock	GET
Shop Stock	/shop-stocks/:variantId	GET
Shop Stock	/shop-stocks/:variantId	PATCH
Shop Stock	/shop-stocks/bulk	PATCH
Shop Ledger	/stock-ledger/shop/:shopId	GET
Total: 12 production-ready APIs 🚀