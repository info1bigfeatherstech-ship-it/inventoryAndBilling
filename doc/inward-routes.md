# Inward Routes

**Base path:** `/api/v1/inwards`  
**Source:** `src/routes/inward/inward.routes.js`

Warehouse-scoped goods receipt scheduling and mapping flow.

## Roles

All routes: `SUPER_ADMIN`, `WH_MANAGER`, `WH_STOCK_LISTER`

## Status flow

```
SCHEDULED → ARRIVED → MAPPED
              ↘ CANCELLED
```

| Status | Meaning |
|--------|---------|
| `SCHEDULED` | Expected delivery scheduled |
| `ARRIVED` | Goods received; items can be added |
| `MAPPED` | All lines mapped to products |
| `CANCELLED` | Closed |

## Data isolation

- Non-admin list/detail filtered by `user.warehouseId`.
- **POST `/`:** WH staff — `warehouse_id` auto-set from login (cannot create for another WH).

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Schedule inward |
| GET | `/` | List inwards |
| GET | `/:inwardId` | Detail + items |
| PATCH | `/:inwardId/arrival-details` | Mark arrived + invoice/challan |
| POST | `/:inwardId/items` | Add line (ARRIVED only) |
| PUT | `/:inwardId/items/:inwardItemId` | Update line |
| DELETE | `/:inwardId/items/:inwardItemId` | Remove line |
| PATCH | `/:inwardId/status` | e.g. MAPPED, CANCELLED |

## POST `/` — Schedule

```json
{
  "vendor_id": "<vendor_id>",
  "warehouse_id": "<only required for SUPER_ADMIN>",
  "expected_date": "2026-05-25T00:00:00.000Z",
  "remarks": "Optional"
}
```

Do **not** send items or arrival fields at schedule time.

## PATCH `/:inwardId/arrival-details`

```json
{
  "vendor_invoice_no": "INV-100",
  "challan_no": "CH-22",
  "transport_details": "Truck ABC",
  "remarks": "Received in good condition"
}
```

Sets status to `ARRIVED`.

## POST `/:inwardId/items`

```json
{
  "item_name": "Cotton Shirt Red",
  "variant_text": "Size M",
  "quantity_received": 100,
  "purchase_cost": 450,
  "mapped_product_id": "<optional product_id>",
  "room_zone": "A",
  "rack_shelf": "R1"
}
```

Mapped product must belong to **same warehouse** as inward.

## PATCH `/:inwardId/status` → MAPPED

All items must have `mapped_product_id` set.

When status changes from **ARRIVED → MAPPED** (first time only), the API **adds warehouse stock**:

- Upserts `product_stocks` by `variant_id` + `warehouse_id` + `batch_number`
- **Increments** `quantity` by each line’s `quantity_received` (repeat inwards add more qty)
- Variant resolved by: `variant_text` (matches `variant_code` / `sku` / `system_barcode`) → else default variant → else first active variant
- Location from line: `room_zone`, `rack_shelf`, `batch_number`, `expiry_date` (defaults: `DEFAULT` zone/shelf, empty batch)

**Stock is not created** on product CSV or single product create — only via inward MAPPED or manual `POST /product-stocks`.

## Errors

| Code | HTTP |
|------|------|
| `INWARD_NOT_FOUND` | 404 |
| `INWARD_ITEMS_UNMAPPED` | 409 |
| `PRODUCT_WAREHOUSE_MISMATCH` | 409 |
| `WAREHOUSE_FORBIDDEN` | 403 |
| `MAPPED_PRODUCT_NO_VARIANT` | 409 |
| `INWARD_ITEM_NOT_MAPPED` | 400 |








Frontend Developer Documentation
🎯 Overview
Inward Receipt (Goods Receipt Note) is the ONLY way stock should be added to the inventory system. This ensures:

✅ Complete purchase history & audit trail

✅ Vendor tracking & performance analytics

✅ Purchase cost tracking for profit calculation

✅ Batch/Expiry tracking for perishable goods

✅ Return to vendor capability

📋 Complete Flow (Step by Step)
text
Step 1: Create Inward (SCHEDULED)
        ↓
Step 2: Update Arrival Details (ARRIVED) — when goods physically arrive
        ↓
Step 3: Add Items (Single OR Bulk)
        ↓
Step 4: Map each item to a product (one by one)
        ↓
Step 5: Update Status to MAPPED
        ↓
Step 6: Stock automatically added to warehouse
        ↓
Step 7: Stock Ledger entry created automatically
🔑 Important Rules
Rule	Explanation
Items cannot be added/modified after MAPPED	Once mapped, inward is locked for audit integrity
Map items individually	Each item needs its own API call with inward_item_id
Product must exist before mapping	Can't map to non-existent product
Variant auto-mapping supported	Use variant_text to match product_code, SKU, or barcode
Stock auto-adds on MAPPED	No separate stock creation API needed
Bulk add supported	Up to 50 items in single API call
📁 Base URL
text
http://localhost:3441/api/v1/inwards
🔐 Headers
Header	Value	Required
Authorization	Bearer <access_token>	✅ Yes
Content-Type	application/json	✅ Yes
🚀 API Endpoints
1. Create Inward (SCHEDULED)
Creates a new inward receipt with SCHEDULED status.

Endpoint: POST /api/v1/inwards

Request Body
json
{
  "vendor_id": "vendor_abc123",
  "warehouse_id": "wh_001",
  "expected_date": "2025-06-15T10:00:00.000Z",
  "remarks": "Monthly stock order - Q2 collection"
}
Field Details
Field	Required	Type	Description
vendor_id	✅ Yes	string	Valid vendor ID from vendors list
warehouse_id	✅ Yes	string	Valid warehouse ID from warehouses list
expected_date	❌ No	ISO datetime	Expected delivery date (YYYY-MM-DDTHH:MM:SSZ)
remarks	❌ No	string	Internal notes (max 500 chars)
Response
json
{
  "success": true,
  "message": "Inward schedule created successfully",
  "data": {
    "inward_id": "inw_abc123",
    "inward_number": "INW-20260522-1234",
    "vendor_id": "vendor_abc123",
    "warehouse_id": "wh_001",
    "status": "SCHEDULED",
    "expected_date": "2025-06-15T10:00:00.000Z",
    "created_at": "2026-05-22T10:00:00.000Z",
    "vendor": {
      "vendor_id": "vendor_abc123",
      "company_name": "Apple India"
    },
    "warehouse": {
      "warehouse_id": "wh_001",
      "warehouse_code": "WH_DEL_01",
      "warehouse_name": "Delhi Central Warehouse"
    },
    "items": []
  },
  "requestId": "req_abc123"
}
⭐ Save These for Later
inward_id — Required for all subsequent API calls

inward_number — For reference/invoice printing

2. Update Arrival Details (ARRIVED)
Mark goods as physically received and update arrival information.

Endpoint: PATCH /api/v1/inwards/:inwardId/arrival-details

URL Parameters
Parameter	Value
inwardId	The inward_id from Step 1
Request Body (at least one field required)
json
{
  "vendor_invoice_no": "INV-2025-001",
  "challan_no": "CH-2025-001",
  "transport_details": "Truck No: HR 55 AB 1234, Transport: VRL Logistics, Driver: Rajesh",
  "remarks": "All goods received in good condition"
}
Field Details
Field	Required	Type	Description
vendor_invoice_no	❌ No	string	Vendor's invoice/bill number
challan_no	❌ No	string	Transport challan / LR number
transport_details	❌ No	string	Vehicle, transporter, driver details
remarks	❌ No	string	Arrival notes (max 500 chars)
Response
json
{
  "success": true,
  "message": "Arrival details updated successfully",
  "data": {
    "inward_id": "inw_abc123",
    "inward_number": "INW-20260522-1234",
    "status": "ARRIVED",
    "arrived_at": "2026-05-22T10:30:00.000Z",
    "vendor_invoice_no": "INV-2025-001",
    "challan_no": "CH-2025-001",
    "transport_details": "Truck No: HR 55 AB 1234",
    "updated_at": "2026-05-22T10:30:00.000Z"
  },
  "requestId": "req_abc123"
}
⚠️ After This Step
Status changes from SCHEDULED → ARRIVED

You can now add items (single or bulk)

3. Add Items (Two Options)
Option A: Add Single Item
Endpoint: POST /api/v1/inwards/:inwardId/items

Request Body
json
{
  "item_name": "iPhone 15 Pro Case - Black",
  "variant_text": "BLACK-15PRO",
  "quantity_received": 100,
  "purchase_cost": 450,
  "batch_number": "BATCH-2025-001",
  "expiry_date": null,
  "room_zone": "Aisle-A",
  "rack_shelf": "Rack-01",
  "position": "Shelf-02",
  "remarks": "Premium quality silicon case"
}
Option B: Add Bulk Items (Max 50)
Endpoint: POST /api/v1/inwards/:inwardId/items/bulk

Request Body
json
{
  "items": [
    {
      "item_name": "iPhone 15 Pro Case - Black",
      "variant_text": "BLACK-15PRO",
      "quantity_received": 100,
      "purchase_cost": 450,
      "batch_number": "BATCH-2025-001",
      "room_zone": "Aisle-A",
      "rack_shelf": "Rack-01",
      "position": "Shelf-02",
      "remarks": "Premium quality"
    },
    {
      "item_name": "Samsung S24 Case - Blue",
      "variant_text": "BLUE-S24",
      "quantity_received": 50,
      "purchase_cost": 350,
      "batch_number": "BATCH-2025-002",
      "room_zone": "Aisle-A",
      "rack_shelf": "Rack-02",
      "remarks": null
    },
    {
      "item_name": "Google Pixel Case - Green",
      "variant_text": "GREEN-PXL",
      "quantity_received": 75,
      "purchase_cost": 400,
      "batch_number": "BATCH-2025-003",
      "room_zone": "Aisle-B",
      "rack_shelf": "Rack-03",
      "remarks": "Limited edition"
    }
  ]
}
Item Fields Details
Field	Required	Type	Description
item_name	✅ Yes	string	Item name as on vendor invoice
quantity_received	✅ Yes	integer	Quantity received (≥1)
purchase_cost	❌ No	number	Cost price per unit (for profit calculation)
variant_text	❌ No	string	Helps auto-map to variant (product_code/sku/barcode)
batch_number	❌ No	string	Vendor batch/lot number
expiry_date	❌ No	ISO date	For perishable goods (YYYY-MM-DD)
room_zone	❌ No	string	Warehouse zone (default: "DEFAULT")
rack_shelf	❌ No	string	Rack number (default: "DEFAULT")
position	❌ No	string	Exact shelf position
remarks	❌ No	string	Item-specific notes (max 500 chars)
Response (Single Item)
json
{
  "success": true,
  "message": "Inward item added successfully",
  "data": {
    "inward_item_id": "item_001",
    "inward_id": "inw_abc123",
    "line_no": 1,
    "item_name": "iPhone 15 Pro Case - Black",
    "quantity_received": 100,
    "purchase_cost": 450,
    "batch_number": "BATCH-2025-001",
    "room_zone": "Aisle-A",
    "rack_shelf": "Rack-01",
    "position": "Shelf-02",
    "variant_text": "BLACK-15PRO",
    "created_at": "2026-05-22T10:35:00.000Z"
  },
  "requestId": "req_abc123"
}
Response (Bulk Items)
json
{
  "success": true,
  "message": "Bulk items added successfully",
  "data": {
    "created": [
      {
        "inward_item_id": "item_001",
        "item_name": "iPhone 15 Pro Case - Black",
        "quantity_received": 100
      },
      {
        "inward_item_id": "item_002",
        "item_name": "Samsung S24 Case - Blue",
        "quantity_received": 50
      }
    ],
    "failed": []
  },
  "requestId": "req_abc123"
}
⭐ Save inward_item_id for each item — needed for mapping
4. Get Inward Details (View All Items)
View complete inward details including all items with their IDs.

Endpoint: GET /api/v1/inwards/:inwardId

URL Parameters
Parameter	Value
inwardId	The inward_id from Step 1
Response
json
{
  "success": true,
  "message": "Inward detail fetched successfully",
  "data": {
    "inward_id": "inw_abc123",
    "inward_number": "INW-20260522-1234",
    "status": "ARRIVED",
    "vendor": {
      "vendor_id": "vendor_abc123",
      "company_name": "Apple India"
    },
    "warehouse": {
      "warehouse_id": "wh_001",
      "warehouse_name": "Delhi Central Warehouse"
    },
    "items": [
      {
        "inward_item_id": "item_001",
        "item_name": "iPhone 15 Pro Case - Black",
        "quantity_received": 100,
        "purchase_cost": 450,
        "batch_number": "BATCH-2025-001",
        "mapped_product_id": null
      },
      {
        "inward_item_id": "item_002",
        "item_name": "Samsung S24 Case - Blue",
        "quantity_received": 50,
        "purchase_cost": 350,
        "batch_number": "BATCH-2025-002",
        "mapped_product_id": null
      }
    ]
  },
  "requestId": "req_abc123"
}
Use this API to:
Get all inward_item_id values

Check which items are already mapped

Verify quantities before mapping

5. Map Items to Products (One by One)
IMPORTANT: Each item must be mapped individually using its inward_item_id.

Endpoint: PUT /api/v1/inwards/:inwardId/items/:inwardItemId

URL Parameters
Parameter	Value
inwardId	The inward_id from Step 1
inwardItemId	The inward_item_id from Step 3 or Step 4
Request Body
json
{
  "mapped_product_id": "prod_iphone_case_123"
}
Field Details
Field	Required	Type	Description
mapped_product_id	✅ Yes	string	Existing product ID from your products list
Response
json
{
  "success": true,
  "message": "Inward item updated successfully",
  "data": {
    "inward_item_id": "item_001",
    "inward_id": "inw_abc123",
    "item_name": "iPhone 15 Pro Case - Black",
    "quantity_received": 100,
    "purchase_cost": 450,
    "mapped_product_id": "prod_iphone_case_123"
  },
  "requestId": "req_abc123"
}
⚠️ Important Notes for Mapping
Note	Explanation
Product must exist	Create product first via CSV or single API
Variant auto-mapping	If variant_text was provided, system auto-matches to correct variant
Default variant	If no variant_text, system uses default variant
Map all items	Cannot mark MAPPED until every item is mapped
6. Update Status to MAPPED (Stock Created)
THIS IS THE MOST IMPORTANT STEP — STOCK GETS ADDED HERE!

Endpoint: PATCH /api/v1/inwards/:inwardId/status

URL Parameters
Parameter	Value
inwardId	The inward_id from Step 1
Request Body
json
{
  "status": "MAPPED",
  "remarks": "All items mapped successfully, stock added"
}
Field Details
Field	Required	Type	Description
status	✅ Yes	string	Must be "MAPPED"
remarks	❌ No	string	Completion notes
Response
json
{
  "success": true,
  "message": "Inward status updated successfully",
  "data": {
    "inward_id": "inw_abc123",
    "inward_number": "INW-20260522-1234",
    "status": "MAPPED",
    "updated_at": "2026-05-22T11:00:00.000Z"
  },
  "requestId": "req_abc123"
}
✅ What Happens Automatically After MAPPED
Action	Description
Stock created	For each mapped item, stock record created/updated
Quantity added	quantity_received added to existing stock
Stock Ledger entry	Immutable audit trail created
Last purchase tracked	last_purchase_id and last_purchase_date updated
Location saved	room_zone, rack_shelf, position preserved
7. Cancel Inward (If Needed)
Endpoint: PATCH /api/v1/inwards/:inwardId/status

Request Body
json
{
  "status": "CANCELLED",
  "remarks": "Order cancelled due to vendor issue"
}
⚠️ Important
Condition	Allowed?
Cancel before MAPPED	✅ Yes
Cancel after MAPPED	❌ No (stock already added)
📊 Status Flow Summary
Status	Meaning	Can Add Items?	Can Map Items?	Stock Added?
SCHEDULED	Order placed, waiting for goods	❌ No	❌ No	❌ No
ARRIVED	Goods physically received	✅ Yes (Single/Bulk)	✅ Yes	❌ No
MAPPED	All items mapped to products	❌ No	❌ No	✅ Yes
CANCELLED	Order cancelled	❌ No	❌ No	❌ No
📋 Complete API Call Sequence Example
Using Single Item Add
bash
# 1. Create inward
POST /api/v1/inwards
{
  "vendor_id": "vendor_123",
  "warehouse_id": "wh_001"
}
# → inward_id: "inw_001"

# 2. Update arrival details
PATCH /api/v1/inwards/inw_001/arrival-details
{
  "vendor_invoice_no": "INV-001"
}

# 3. Add item 1
POST /api/v1/inwards/inw_001/items
{
  "item_name": "iPhone Case",
  "quantity_received": 100,
  "purchase_cost": 450
}
# → inward_item_id: "item_001"

# 4. Add item 2
POST /api/v1/inwards/inw_001/items
{
  "item_name": "Samsung Cover",
  "quantity_received": 50,
  "purchase_cost": 350
}
# → inward_item_id: "item_002"

# 5. Map item 1
PUT /api/v1/inwards/inw_001/items/item_001
{
  "mapped_product_id": "prod_iphone_123"
}

# 6. Map item 2
PUT /api/v1/inwards/inw_001/items/item_002
{
  "mapped_product_id": "prod_samsung_456"
}

# 7. Mark MAPPED (STOCK CREATED)
PATCH /api/v1/inwards/inw_001/status
{
  "status": "MAPPED"
}
Using Bulk Item Add
bash
# 1. Create inward
POST /api/v1/inwards
{
  "vendor_id": "vendor_123",
  "warehouse_id": "wh_001"
}
# → inward_id: "inw_001"

# 2. Update arrival details
PATCH /api/v1/inwards/inw_001/arrival-details
{
  "vendor_invoice_no": "INV-001"
}

# 3. Add all items in one call
POST /api/v1/inwards/inw_001/items/bulk
{
  "items": [
    {"item_name": "iPhone Case", "quantity_received": 100, "purchase_cost": 450},
    {"item_name": "Samsung Cover", "quantity_received": 50, "purchase_cost": 350}
  ]
}
# → items created with IDs: item_001, item_002

# 4. Get inward details to see item IDs
GET /api/v1/inwards/inw_001

# 5. Map item 1
PUT /api/v1/inwards/inw_001/items/item_001
{
  "mapped_product_id": "prod_iphone_123"
}

# 6. Map item 2
PUT /api/v1/inwards/inw_001/items/item_002
{
  "mapped_product_id": "prod_samsung_456"
}

# 7. Mark MAPPED (STOCK CREATED)
PATCH /api/v1/inwards/inw_001/status
{
  "status": "MAPPED"
}
🚨 Error Codes & Handling
Code	Description	Solution
INWARD_NOT_MUTABLE	Cannot modify after MAPPED	Create new inward
INWARD_ITEMS_UNMAPPED	Trying to mark MAPPED with unmapped items	Map all items first
INWARD_ALREADY_CANCELLED	Cannot modify cancelled inward	Create new inward
MAPPED_PRODUCT_NO_VARIANT	Product has no active variant	Add variant to product first
PRODUCT_NOT_FOUND	Invalid product ID	Use existing product ID from product list
VENDOR_NOT_FOUND	Invalid vendor ID	Use existing vendor ID from vendor list
WAREHOUSE_NOT_FOUND	Invalid warehouse ID	Use existing warehouse ID
PRODUCT_WAREHOUSE_MISMATCH	Product belongs to different warehouse	Product and inward warehouse must match
MAX_BULK_ITEMS_EXCEEDED	More than 50 items in bulk request	Split into multiple bulk requests
USE_ARRIVAL_DETAILS_ENDPOINT	Cannot set ARRIVED via status endpoint	Use arrival-details endpoint
✅ Success Indicators
After completing all steps, verify:

bash
# Check if stock was created
GET /api/v1/product-stocks?product_id=prod_iphone_123

# Response should show quantity = quantity_received from inward
# last_purchase_id should equal inward_id
# last_purchase_date should be current date