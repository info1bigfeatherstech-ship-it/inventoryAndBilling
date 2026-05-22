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






//updated with purchase entry 
# Inward Receipt (GRN) API Documentation - UPDATED

## 🎯 Important Changes

**Stock is now added ONLY when inward status becomes MAPPED. No other way to add stock.**

When you mark inward as MAPPED, the system automatically:
1. ✅ Creates a Purchase Entry
2. ✅ Adds stock to warehouse with purchase reference
3. ✅ Creates Stock Ledger entry for audit trail
4. ✅ Updates last_purchase_id and last_purchase_date

---

## Complete API Flow

### Step 1: Create Inward (SCHEDULED)

**Endpoint:** `POST /api/v1/inwards`

**Request Body:**
```json
{
  "vendor_id": "vendor_abc123",
  "warehouse_id": "wh_001",
  "expected_date": "2025-06-15T10:00:00.000Z",
  "remarks": "Monthly stock order"
}
Response: Get inward_id and inward_number

Step 2: Update Arrival Details (ARRIVED)
Endpoint: PATCH /api/v1/inwards/:inwardId/arrival-details

Request Body:

json
{
  "vendor_invoice_no": "INV-2025-001",
  "challan_no": "CH-2025-001",
  "transport_details": "Truck No: HR 55 AB 1234",
  "remarks": "Goods received in good condition"
}
After this step: Status changes from SCHEDULED → ARRIVED

Step 3: Add Items (Two Options)
Option A: Add Single Item
Endpoint: POST /api/v1/inwards/:inwardId/items

Request Body:

json
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
}
Option B: Add Bulk Items (Max 50)
Endpoint: POST /api/v1/inwards/:inwardId/items/bulk

Request Body:

json
{
  "items": [
    {
      "item_name": "iPhone 15 Pro Case - Black",
      "variant_text": "BLACK-15PRO",
      "quantity_received": 100,
      "purchase_cost": 450,
      "batch_number": "BATCH-001"
    },
    {
      "item_name": "Samsung S24 Case - Blue",
      "variant_text": "BLUE-S24",
      "quantity_received": 50,
      "purchase_cost": 350,
      "batch_number": "BATCH-002"
    }
  ]
}
Response: Get inward_item_id for each item (needed for mapping)

Step 4: Get All Items (To Get Item IDs)
Endpoint: GET /api/v1/inwards/:inwardId

Response: Returns all items with their inward_item_id

Step 5: Map Each Item to a Product
Endpoint: PUT /api/v1/inwards/:inwardId/items/:inwardItemId

Request Body:

json
{
  "mapped_product_id": "prod_iphone_case_123"
}
⚠️ Important: Map ALL items before proceeding to Step 6

Step 6: Mark as MAPPED (STOCK CREATED HERE)
Endpoint: PATCH /api/v1/inwards/:inwardId/status

Request Body:

json
{
  "status": "MAPPED",
  "remarks": "All items mapped successfully"
}
✅ What happens automatically:

Purchase Entry created

Stock added to warehouse

Stock Ledger entry created

last_purchase_id and last_purchase_date updated

Status Flow
Status	Meaning	Can Add Items?	Can Map Items?	Stock Added?
SCHEDULED	Order placed	❌ No	❌ No	❌ No
ARRIVED	Goods received	✅ Yes	✅ Yes	❌ No
MAPPED	All items mapped	❌ No	❌ No	✅ Yes
CANCELLED	Cancelled	❌ No	❌ No	❌ No
Error Codes
Code	Description	Solution
INWARD_ITEMS_UNMAPPED	Trying to mark MAPPED with unmapped items	Map all items first
INWARD_NOT_ARRIVED	Cannot mark MAPPED directly from SCHEDULED	Call arrival-details endpoint first
MAPPED_PRODUCT_NO_VARIANT	Product has no active variant	Add variant to product first
PRODUCT_NOT_FOUND	Invalid product ID	Use existing product ID
Complete Example (All API Calls in Order)
bash
# 1. Create inward
POST /api/v1/inwards
{"vendor_id":"vendor_123","warehouse_id":"wh_001"}
# → inward_id: "inw_001"

# 2. Update arrival details
PATCH /api/v1/inwards/inw_001/arrival-details
{"vendor_invoice_no":"INV-001"}

# 3. Add items (bulk)
POST /api/v1/inwards/inw_001/items/bulk
{"items":[{"item_name":"iPhone Case","quantity_received":100},{"item_name":"Samsung Cover","quantity_received":50}]}
# → items created with IDs

# 4. Get inward details to see item IDs
GET /api/v1/inwards/inw_001

# 5. Map item 1
PUT /api/v1/inwards/inw_001/items/item_001
{"mapped_product_id":"prod_iphone_123"}

# 6. Map item 2
PUT /api/v1/inwards/inw_001/items/item_002
{"mapped_product_id":"prod_samsung_456"}

# 7. Mark MAPPED (THIS CREATES STOCK)
PATCH /api/v1/inwards/inw_001/status
{"status":"MAPPED"}

# ✅ Stock automatically added to both products!
Important Rules
Rule	Why
Stock only from MAPPED status	Ensures complete purchase tracking
Map all items before MAPPED	System validates all items are mapped
Cannot modify after MAPPED	Maintains audit integrity
Product must have variant	Stock needs variant to add quantity
After MAPPED — Verify Stock
bash
# Check stock was added
GET /api/v1/product-stocks?product_id=prod_iphone_123

# Response shows:
# - quantity: 100
# - last_purchase_id: purchase entry ID (not null)
# - last_purchase_date: current timestamp
This is the complete flow. Stock will ONLY be added when status becomes MAPPED. 🚀

text

---

## 📋 Summary — Frontend Dev Ko Kya Batana Hai

| Point | Explanation |
|-------|-------------|
| **Stock kab add hota hai?** | Sirf jab status `MAPPED` karte ho |
| **Purchase Entry** | Auto-create hota hai jab MAPPED karte ho |
| **last_purchase_id** | Ab null nahi rahega — proper ID set hogi |
| **Items add** | Single ya bulk — dono support hai |
| **Map karna** | Har item ko product se map karna mandatory hai |
| **MAPPED se pehle** | Saare items mapped hone chahiye |

**Ye doc frontend dev ko bhej do — wo integration kar lega! 🚀**




//==========================================
//Purchase entry after inward status mapped
//==========================================
Purchase Entry API Documentation
Base URL
/api/v1/purchase-entries

Headers
Header	Value	Required
Authorization	Bearer <access_token>	✅ Yes
Content-Type	application/json	✅ Yes (for POST/PUT)
1. List All Purchase Entries
Endpoint: GET /api/v1/purchase-entries

Roles Allowed: SUPER_ADMIN, WH_MANAGER, WH_STOCK_LISTER

Query Parameters
Parameter	Type	Description	Example
page	number	Page number (default: 1)	page=2
limit	number	Items per page (default: 50, max: 100)	limit=20
vendor_id	string	Filter by vendor ID	vendor_id=vendor_123
warehouse_id	string	Filter by warehouse ID	warehouse_id=wh_001
status	string	Filter by status	status=RECEIVED
from_date	date	Start date (ISO format)	from_date=2026-01-01
to_date	date	End date (ISO format)	to_date=2026-12-31
search	string	Search by PO number, invoice, vendor name	search=INV-001
Example Request
http
GET /api/v1/purchase-entries?page=1&limit=20&from_date=2026-01-01&to_date=2026-12-31
Authorization: Bearer <token>
Response
json
{
  "success": true,
  "message": "Purchase entries fetched successfully",
  "data": [
    {
      "purchase_id": "pur_abc123",
      "purchase_number": "PO-INW-20260522-2801",
      "vendor_id": "vendor_123",
      "warehouse_id": "wh_001",
      "vendor_invoice_no": "INV-001",
      "purchase_date": "2026-05-22T10:00:00.000Z",
      "status": "RECEIVED",
      "subtotal": 45000,
      "tax_amount": 0,
      "total_amount": 45000,
      "received_by": "user_001",
      "received_at": "2026-05-22T10:00:00.000Z",
      "remarks": "Created from inward: INW-20260522-2801",
      "created_at": "2026-05-22T10:00:00.000Z",
      "updated_at": "2026-05-22T10:00:00.000Z",
      "vendor": {
        "vendor_id": "vendor_123",
        "company_name": "Apple India",
        "phone": "9876543210"
      },
      "warehouse": {
        "warehouse_id": "wh_001",
        "warehouse_code": "WH_DEL_01",
        "warehouse_name": "Delhi Central Warehouse",
        "city": "Delhi"
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "totalPages": 1
  },
  "requestId": "req_abc123"
}
2. Get Single Purchase Entry (with Items)
Endpoint: GET /api/v1/purchase-entries/:purchaseId

Roles Allowed: SUPER_ADMIN, WH_MANAGER, WH_STOCK_LISTER

URL Parameters
Parameter	Type	Description
purchaseId	string	Purchase entry ID
Example Request
http
GET /api/v1/purchase-entries/pur_abc123
Authorization: Bearer <token>
Response
json
{
  "success": true,
  "message": "Purchase entry fetched successfully",
  "data": {
    "purchase_id": "pur_abc123",
    "purchase_number": "PO-INW-20260522-2801",
    "vendor_id": "vendor_123",
    "warehouse_id": "wh_001",
    "vendor_invoice_no": "INV-001",
    "purchase_date": "2026-05-22T10:00:00.000Z",
    "status": "RECEIVED",
    "subtotal": 45000,
    "tax_amount": 0,
    "total_amount": 45000,
    "received_by": "user_001",
    "received_at": "2026-05-22T10:00:00.000Z",
    "remarks": "Created from inward: INW-20260522-2801",
    "created_at": "2026-05-22T10:00:00.000Z",
    "vendor": {
      "vendor_id": "vendor_123",
      "company_name": "Apple India"
    },
    "warehouse": {
      "warehouse_id": "wh_001",
      "warehouse_code": "WH_DEL_01",
      "warehouse_name": "Delhi Central Warehouse"
    },
    "items": [
      {
        "purchase_item_id": "pitem_001",
        "product_id": "prod_iphone_123",
        "quantity": 100,
        "purchase_cost": 450,
        "batch_number": "BATCH-001",
        "expiry_date": null,
        "room_zone": "Aisle-A",
        "rack_shelf": "Rack-01",
        "position": "Shelf-02",
        "remarks": null,
        "product": {
          "product_id": "prod_iphone_123",
          "product_code": "IPHONE-001",
          "name": "iPhone 15 Pro Case",
          "variants": [
            {
              "variant_id": "var_001",
              "sku": "SKU-IPHONE-001"
            }
          ]
        }
      },
      {
        "purchase_item_id": "pitem_002",
        "product_id": "prod_samsung_456",
        "quantity": 50,
        "purchase_cost": 350,
        "batch_number": "BATCH-002",
        "expiry_date": null,
        "room_zone": "Aisle-A",
        "rack_shelf": "Rack-02",
        "position": null,
        "remarks": null,
        "product": {
          "product_id": "prod_samsung_456",
          "product_code": "SAMSUNG-001",
          "name": "Samsung S24 Case"
        }
      }
    ]
  },
  "requestId": "req_abc123"
}
3. Vendor-wise Purchase Summary (for Reports)
Endpoint: GET /api/v1/purchase-entries/summary/vendor

Roles Allowed: SUPER_ADMIN, WH_MANAGER

Query Parameters
Parameter	Type	Description
from_date	date	Start date (ISO format)
to_date	date	End date (ISO format)
Example Request
http
GET /api/v1/purchase-entries/summary/vendor?from_date=2026-01-01&to_date=2026-12-31
Authorization: Bearer <token>
Response
json
{
  "success": true,
  "message": "Purchase summary fetched successfully",
  "data": [
    {
      "vendor_id": "vendor_123",
      "vendor_name": "Apple India",
      "total_purchases": 5,
      "total_subtotal": 250000,
      "total_tax": 0,
      "total_amount": 250000
    },
    {
      "vendor_id": "vendor_456",
      "vendor_name": "Samsung India",
      "total_purchases": 3,
      "total_subtotal": 150000,
      "total_tax": 0,
      "total_amount": 150000
    }
  ],
  "requestId": "req_abc123"
}
📊 Relationship Between APIs
text
Inward Receipt (SCHEDULED → ARRIVED → MAPPED)
        ↓ (automatically creates)
Purchase Entry (header) + Purchase Items (line items)
        ↓
Stock added to ProductStock
        ↓
View via:
├── GET /purchase-entries (list all purchases)
├── GET /purchase-entries/:id (view details with items)
└── GET /purchase-entries/summary/vendor (vendor reports)
📋 Error Codes
Code	Description	Solution
PURCHASE_NOT_FOUND	Purchase entry not found	Check purchase ID
UNAUTHORIZED	Invalid or missing token	Login again
FORBIDDEN	Insufficient permissions	Check user role
🚀 Quick Testing with Postman
1. List Purchase Entries
text
GET http://localhost:3441/api/v1/purchase-entries
Headers: Authorization: Bearer <token>
2. Get Single Purchase Entry
text
GET http://localhost:3441/api/v1/purchase-entries/pur_abc123
Headers: Authorization: Bearer <token>
3. Vendor Summary
text
GET http://localhost:3441/api/v1/purchase-entries/summary/vendor?from_date=2026-01-01
Headers: Authorization: Bearer <token>
✅ Summary — Frontend Dev Ko Kya Batana Hai
API	Purpose
GET /purchase-entries	Show all purchase history (table/list)
GET /purchase-entries/:id	Show purchase details with items
GET /purchase-entries/summary/vendor	Vendor purchase report
Ye APIs sirf READ-only hain. Purchase entries automatically create hoti hain jab inward MAPPED hota hai.