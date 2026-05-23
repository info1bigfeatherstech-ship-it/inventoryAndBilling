# Product Stock Routes

**Base path:** `/api/v1/product-stocks`  
**Source:** `src/routes/product/productStock.routes.js`

Warehouse stock by **variant**, location (zone/rack), and batch.

## Roles

| Action | Roles |
|--------|--------|
| Read | `SUPER_ADMIN`, `WH_MANAGER`, `WH_STOCK_LISTER`, shop roles |
| Write | `SUPER_ADMIN`, `WH_MANAGER`, `WH_STOCK_LISTER` |

## Data isolation

- WH staff: only stock rows for their warehouse.
- SUPER_ADMIN: all warehouses.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List stock rows |
| POST | `/` | Create stock row |
| GET | `/:stockId` | Get by id |
| PUT | `/:stockId` | Update quantity/location/batch |
| DELETE | `/:stockId` | Delete row |
| POST | `/bulk/csv` | Bulk create from CSV |
| PATCH | `/bulk` | Bulk update |
| DELETE | `/bulk` | Bulk delete |

## POST `/`

```json
{
  "variant_id": "<variant_id>",
  "quantity": 50,
  "room_zone": "A",
  "rack_shelf": "R3",
  "position": "Top",
  "batch_number": "BATCH-2026-01",
  "expiry_date": "2027-01-01T00:00:00.000Z",
  "low_stock_threshold": 5
}
```

`warehouse_id` auto from user for WH staff.

**Unique:** `(variant_id, warehouse_id, batch_number)` — use `""` for non-batch aggregate.

## GET `/` — Query params

| Param | Notes |
|-------|-------|
| `variant_id` | Filter by variant |
| `product_id` | Filter by product |
| `batch_number` | |
| `search` | Zone, rack, barcode, product name |
| `warehouse_id` | Admin filter |

## POST `/bulk/csv`

Multipart field: `file`

Columns: `variant_id` **or** `system_barcode`, `quantity`, `room_zone`, `rack_shelf`, `position`, `batch_number`, `expiry_date`, `low_stock_threshold`, `remarks`

Super admin: pass `warehouse_id` in form or query.

## PATCH `/bulk`

```json
{
  "items": [
    { "stock_id": "...", "quantity": 40, "room_zone": "B" }
  ]
}
```

## Errors

| Code | HTTP |
|------|------|
| `STOCK_NOT_FOUND` | 404 |
| `VARIANT_WAREHOUSE_MISMATCH` | 409 |
| `INVALID_QUANTITY` | 400 |








1. LIST STOCKS (Dekho saari stock entries)
http
GET /api/v1/product-stocks?page=1&limit=20&warehouse_id=wh_delhi_001&variant_id=var_123
Query Params (Optional):

page = 1

limit = 20 (max 100)

warehouse_id = filter by warehouse

variant_id = filter by variant

product_id = filter by product

batch_number = filter by batch

search = search in room_zone, rack_shelf, batch_number

Response:

json
{
  "success": true,
  "data": [
    {
      "stock_id": "stk_001",
      "variant_id": "var_123",
      "product_id": "prod_456",
      "warehouse_id": "wh_delhi_001",
      "quantity": 500,
      "low_stock_threshold": 10,
      "room_zone": "A",
      "rack_shelf": "Shelf-12",
      "position": "Row-3",
      "batch_number": "BATCH-JUN-2026",
      "expiry_date": "2028-12-31T00:00:00.000Z",
      "remarks": "Main batch",
      "variant": {
        "sku": "SKU-IP15CASE-1",
        "system_barcode": "8901234567890"
      },
      "warehouse": {
        "warehouse_name": "Delhi Main Warehouse"
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
2. GET SINGLE STOCK (Kisi ek stock ki details)
http
GET /api/v1/product-stocks/:stockId
Example:

http
GET /api/v1/product-stocks/stk_001
Response: Same as above single object

3. CREATE STOCK (Manual stock entry - agar direct dalna ho)
http
POST /api/v1/product-stocks
Request Body:

json
{
  "variant_id": "var_123",
  "warehouse_id": "wh_delhi_001",
  "quantity": 100,
  "room_zone": "B",
  "rack_shelf": "Shelf-05",
  "position": "Row-2",
  "batch_number": "BATCH-MANUAL-001",
  "expiry_date": "2025-12-31T00:00:00.000Z",
  "low_stock_threshold": 5,
  "remarks": "Manual stock addition after audit"
}
⚠️ Note: room_zone aur rack_shelf required hain.

4. UPDATE STOCK (Location, quantity, sab kuch update kar sakte ho)
http
PUT /api/v1/product-stocks/:stockId
PATCH /api/v1/product-stocks/:stockId
Request Body (Jo bhi update karna ho):

json
{
  "quantity": 450,
  "room_zone": "C",
  "rack_shelf": "Shelf-20",
  "position": "Row-1",
  "batch_number": "BATCH-UPDATED-002",
  "expiry_date": "2026-06-30T00:00:00.000Z",
  "low_stock_threshold": 8,
  "remarks": "Moved to new location"
}
Example:

http
PATCH /api/v1/product-stocks/stk_001
Content-Type: application/json

{
  "room_zone": "A",
  "rack_shelf": "Shelf-15",
  "position": "Row-5"
}
⚠️ Quantity update se stock ledger mein entry automatically create hoti hai!

5. DELETE STOCK (Poori stock entry hi hatao)
http
DELETE /api/v1/product-stocks/:stockId
Example:

http
DELETE /api/v1/product-stocks/stk_001
⚠️ Agar quantity > 0 hai to ledger mein adjustment entry create hogi!

6. BULK UPDATE (Ek saath multiple stocks update)
http
PATCH /api/v1/product-stocks/bulk
Request Body:

json
{
  "items": [
    {
      "stock_id": "stk_001",
      "room_zone": "A",
      "rack_shelf": "Shelf-12",
      "position": "Row-3"
    },
    {
      "stock_id": "stk_002",
      "quantity": 200,
      "low_stock_threshold": 15
    },
    {
      "stock_id": "stk_003",
      "remarks": "Damaged stock - moved to quarantine"
    }
  ]
}
Response:

json
{
  "success": true,
  "data": {
    "updated": 3,
    "failed": []
  }
}
7. BULK DELETE (Ek saath multiple stocks delete)
http
DELETE /api/v1/product-stocks/bulk
Request Body:

json
{
  "stock_ids": ["stk_001", "stk_002", "stk_003"]
}
Response:

json
{
  "success": true,
  "data": {
    "deleted": 3,
    "failed": []
  }
}
8. BULK CSV IMPORT (Excel/CSV se bulk stock create)
http
POST /api/v1/product-stocks/bulk/csv
Form Data:

file: CSV file (required)

warehouse_id: "wh_delhi_001" (optional)

CSV Format:

csv
variant_id,quantity,room_zone,rack_shelf,batch_number,expiry_date,low_stock_threshold
var_123,500,A,Shelf-12,BATCH-001,2025-12-31,10
var_456,300,B,Shelf-05,BATCH-002,2025-12-31,10
Response:

json
{
  "success": true,
  "data": {
    "created": 2,
    "failed": []
  }
}
🎯 TUMHARE USE CASE KE LIYE (After Inward Mapping)
Inward map karne ke baad stock entry create ho gayi. Ab tum ye kar sakte ho:

Scenario 1: Location Change (Product ko dusre rack mein rakh diya)
http
PATCH /api/v1/product-stocks/stk_001
{
  "room_zone": "D",
  "rack_shelf": "Shelf-30",
  "position": "Row-2"
}
Scenario 2: Quantity Adjust (Kuch stock damaged ho gaya)
http
PATCH /api/v1/product-stocks/stk_001
{
  "quantity": 480,
  "remarks": "20 pieces damaged - removed from inventory"
}
Scenario 3: Expiry Update (Expiry date extend ho gayi)
http
PATCH /api/v1/product-stocks/stk_001
{
  "expiry_date": "2026-12-31T00:00:00.000Z"
}
Scenario 4: Batch Number Change (Naya batch number mila)
http
PATCH /api/v1/product-stocks/stk_001
{
  "batch_number": "BATCH-REVISED-002"
}
Scenario 5: Multiple Updates Ek Saath
http
PATCH /api/v1/product-stocks/stk_001
{
  "room_zone": "E",
  "rack_shelf": "Shelf-40",
  "position": "Row-1",
  "low_stock_threshold": 20,
  "remarks": "Moved to premium section"
}
📊 PRACTICAL EXAMPLE (Tumhare liye ready-to-use)
Maan lo tumhara stock entry aisi hai:

json
{
  "stock_id": "stk_abc123",
  "variant_id": "var_ip15_black",
  "quantity": 500,
  "room_zone": "A",
  "rack_shelf": "Shelf-12",
  "position": "Row-3"
}
Ab tum ye karna chahte ho ki product ko A zone se B zone shift karo:

http
PATCH /api/v1/product-stocks/stk_abc123
Host: localhost:3000
Authorization: Bearer <your_token>
Content-Type: application/json

{
  "room_zone": "B",
  "rack_shelf": "Shelf-25",
  "position": "Row-1",
  "remarks": "Moved to fast-moving section"
}
Response:

json
{
  "success": true,
  "message": "Stock record updated successfully",
  "data": {
    "stock_id": "stk_abc123",
    "room_zone": "B",
    "rack_shelf": "Shelf-25",
    "position": "Row-1",
    "quantity": 500,
    "remarks": "Moved to fast-moving section",
    "updated_at": "2026-05-23T10:30:00.000Z"
  }
}
⚠️ IMPORTANT NOTES
Field	Rules
room_zone	Required in create, optional in update
rack_shelf	Required in create, optional in update
quantity	Can't be negative
batch_number	Unique per variant+warehouse combination
expiry_date	ISO format: YYYY-MM-DDTHH:MM:SSZ
🔄 LEDGER ENTRIES (Jo automatically create hoti hain)
Action	Ledger Entry Created
Create stock (quantity > 0)	✅ ADJUSTMENT entry
Update quantity	✅ ADJUSTMENT entry (with diff)
Delete stock (quantity > 0)	✅ ADJUSTMENT entry (negative)
✅ SUMMARY - Tumhare Paas Sab Kuch Hai
API	Endpoint	Method
List stocks	/api/v1/product-stocks	GET
Get single	/api/v1/product-stocks/:stockId	GET
Create stock	/api/v1/product-stocks	POST
Update stock	/api/v1/product-stocks/:stockId	PUT/PATCH
Delete stock	/api/v1/product-stocks/:stockId	DELETE
Bulk update	/api/v1/product-stocks/bulk	PATCH
Bulk delete	/api/v1/product-stocks/bulk	DELETE
Bulk CSV	/api/v1/product-stocks/bulk/csv	POST