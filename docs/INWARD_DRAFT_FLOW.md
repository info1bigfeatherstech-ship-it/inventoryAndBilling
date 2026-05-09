0) Admin login
POST /auth/login
{
  "phone": "8580403506",
  "password": "bfDev@09"
}
Save:

{{accessToken}}
1) Create vendor (if not already)
POST /vendors
{
  "company_name": "Sharma Textiles Pvt Ltd",
  "contact_person": "Rohit Sharma",
  "phone": "9876543210",
  "supply_city": "Panipat",
  "business_type": "WHOLESALER",
  "city": "Panipat",
  "address": "Industrial Area, Plot 22",
  "remarks": "Inward vendor"
}
Save:

{{vendorId}} = data.vendor_id
2) Create warehouse (if not already)
POST /warehouses
{
  "warehouse_code": "WH_DEL_01",
  "warehouse_name": "Delhi Central Warehouse",
  "address": "Plot 15, Okhla Phase 2",
  "city": "Delhi",
  "manager_name": "Nitin Verma",
  "remarks": "Primary warehouse"
}
Save:

{{warehouseId}} = data.warehouse_id
3) Create inward schedule (pre-dispatch only)
POST /inwards
{
  "vendor_id": "{{vendorId}}",
  "warehouse_id": "{{warehouseId}}",
  "expected_date": "2026-05-12T10:30:00.000Z",
  "remarks": "Vendor dispatch expected in 2 days"
}
Save:

{{inwardId}} = data.inward_id
Note: iss step pe items/transport/challan/invoice mat bhejna.

4) Verify scheduled inward
GET /inwards?status=SCHEDULED&page=1&limit=20
GET /inwards/{{inwardId}}
5) Arrival details update (truck aa gaya)
PATCH /inwards/{{inwardId}}/arrival-details
{
  "vendor_invoice_no": "INV-4821",
  "challan_no": "CH-9821",
  "transport_details": "Truck HR38A1234",
  "remarks": "Vehicle reached gate and unloading started"
}
6) Verify ARRIVED state
GET /inwards/{{inwardId}}
Expected:

status = ARRIVED
arrival details present
7) Add received items (after ARRIVED)
POST /inwards/{{inwardId}}/items
{
  "item_name": "Men T-Shirt Black",
  "variant_text": "Size M",
  "quantity_received": 40,
  "purchase_cost": 220,
  "batch_number": "BATCH-M-BLK-01",
  "remarks": "Physical count matched"
}
Add second line:

POST /inwards/{{inwardId}}/items
{
  "item_name": "Men T-Shirt Black",
  "variant_text": "Size L",
  "quantity_received": 35,
  "purchase_cost": 225
}
Save any line id:

{{inwardItemId}} = data.inward_item_id
8) Update one item (optional)
PUT /inwards/{{inwardId}}/items/{{inwardItemId}}
{
  "quantity_received": 42,
  "remarks": "Recount after unloading"
}
9) Remove wrong item (optional)
DELETE /inwards/{{inwardId}}/items/{{inwardItemId}}
10) Try status -> MAPPED (only when all lines mapped)
PATCH /inwards/{{inwardId}}/status
{
  "status": "MAPPED",
  "remarks": "All lines mapped to products"
}
Expected now:

if any line has mapped_product_id = null -> 409 (INWARD_ITEMS_UNMAPPED)
mapping phase ke baad ye pass karega.
11) Useful listing filters
GET /inwards?page=1&limit=20
GET /inwards?vendor_id={{vendorId}}
GET /inwards?warehouse_id={{warehouseId}}
GET /inwards?status=ARRIVED
GET /inwards?search=INV-4821
12) Negative tests (must fail)
A) Schedule create with transport (should fail)
POST /inwards

{
  "vendor_id": "{{vendorId}}",
  "warehouse_id": "{{warehouseId}}",
  "transport_details": "Truck AA11"
}
B) Add item before ARRIVED (should fail)
Create fresh scheduled inward
directly call POST /inwards/{id}/items
C) ARRIVED via status endpoint (should fail)
PATCH /inwards/{{inwardId}}/status

{
  "status": "ARRIVED"
}
Use /arrival-details endpoint instead.

Postman environment vars (recommended)
baseUrl = http://localhost:3000/api/v1
accessToken = <from login>
vendorId = <from vendor create>
warehouseId = <from warehouse create>
inwardId = <from inward schedule>
inwardItemId = <from inward item create>
Use URLs like:

{{baseUrl}}/inwards
{{baseUrl}}/inwards/{{inwardId}}/arrival-details