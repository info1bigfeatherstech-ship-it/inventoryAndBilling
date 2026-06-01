PREREQUISITES
Environment Variables Setup in Postman
text
BASE_URL = http://localhost:3441/api/v1
TOKEN = <your_super_admin_or_shop_owner_token>
SHOP_ID = <your_shop_id>
WAREHOUSE_ID = <your_warehouse_id>
VARIANT_ID = <your_variant_id>
CUSTOMER_ID = <will_get_from_response>
BILL_ID = <will_get_from_response>
🔐 STEP 0: Login First
Get Authentication Token
http
POST {{BASE_URL}}/auth/login
Content-Type: application/json

{
  "phone": "your_registered_phone",
  "password": "your_password"
}
Save the accessToken from response to TOKEN variable.

👤 PART 1: CUSTOMER MANAGEMENT
1.1 Create New Customer
http
POST {{BASE_URL}}/customers
Authorization: Bearer {{TOKEN}}
Content-Type: application/json

{
  "mobile": "9876543210",
  "name": "Rajesh Sharma",
  "email": "rajesh@example.com",
  "gst_number": "07AAACA1234B1Z",
  "address": "Sector 18, Noida",
  "city": "Noida",
  "state_code": "07",
  "remarks": "Regular customer"
}
Expected Response (201 Created):

json
{
  "success": true,
  "message": "Customer created successfully",
  "data": {
    "customer_id": "cust_abc123",
    "mobile": "9876543210",
    "name": "Rajesh Sharma",
    "loyalty_tier": "BRONZE",
    "total_spent": 0,
    "total_orders": 0
  }
}
Save customer_id to CUSTOMER_ID variable.

1.2 Search Customer by Mobile
http
GET {{BASE_URL}}/customers/search?mobile=9876543210
Authorization: Bearer {{TOKEN}}
Expected Response (200 OK):

json
{
  "success": true,
  "message": "Customer search completed",
  "data": [
    {
      "customer_id": "cust_abc123",
      "mobile": "9876543210",
      "name": "Rajesh Sharma",
      "loyalty_tier": "BRONZE"
    }
  ]
}
1.3 Get Customer Details
http
GET {{BASE_URL}}/customers/{{CUSTOMER_ID}}
Authorization: Bearer {{TOKEN}}
Expected Response:

json
{
  "success": true,
  "data": {
    "customer_id": "cust_abc123",
    "name": "Rajesh Sharma",
    "mobile": "9876543210",
    "total_spent": 0,
    "loyalty_tier": "BRONZE",
    "bills": []
  }
}
1.4 List All Customers
http
GET {{BASE_URL}}/customers?page=1&limit=10&loyalty_tier=BRONZE
Authorization: Bearer {{TOKEN}}
1.5 Update Customer
http
PUT {{BASE_URL}}/customers/{{CUSTOMER_ID}}
Authorization: Bearer {{TOKEN}}
Content-Type: application/json

{
  "name": "Rajesh Kumar Sharma",
  "email": "rajesh.kumar@example.com",
  "city": "Delhi",
  "remarks": "VIP customer - updated"
}
🏪 PART 2: SHOP STOCK CHECK (Before Billing)
2.1 Check Product Stock in Shop
http
GET {{BASE_URL}}/shop-stocks/{{VARIANT_ID}}?shop_id={{SHOP_ID}}
Authorization: Bearer {{TOKEN}}
Expected Response:

json
{
  "success": true,
  "data": {
    "shop_id": "shop_001",
    "variant_id": "var_iphone_001",
    "quantity_available": 500,
    "quantity_reserved": 0,
    "quantity_in_transit": 0
  }
}
🧾 PART 3: BILLING (CREATE BILL)
3.1 Create Bill with Existing Customer
http
POST {{BASE_URL}}/bills
Authorization: Bearer {{TOKEN}}
Idempotency-Key: bill-test-001
Content-Type: application/json

{
  "shop_id": "{{SHOP_ID}}",
  "customer_id": "{{CUSTOMER_ID}}",
  "bill_type": "GST_INVOICE",
  "items": [
    {
      "variant_id": "{{VARIANT_ID}}",
      "quantity": 2,
      "unit_price": 599,
      "price_type": "SPECIAL"
    }
  ],
  "payment_method": "UPI",
  "payment_amount": 1416,
  "sales_channel": "WALK_IN"
}
Expected Response (201 Created):

json
{
  "success": true,
  "message": "Bill created successfully",
  "data": {
    "bill_id": "bill_xyz789",
    "bill_number": "INV-20260526-0001",
    "customer": {
      "name": "Rajesh Sharma",
      "mobile": "9876543210",
      "loyalty_tier": "BRONZE"
    },
    "subtotal": 1198,
    "discount": 0,
    "taxable_amount": 1198,
    "gst_amount": 215.64,
    "total_amount": 1413.64,
    "payment_status": "PAID",
    "items": [
      {
        "product_name": "iPhone 15 Case",
        "quantity": 2,
        "unit_price": 599,
        "line_total": 1413.64
      }
    ]
  }
}
Save bill_id to BILL_ID variable.

3.2 Create Bill for Walk-in Customer (No Customer ID)
http
POST {{BASE_URL}}/bills
Authorization: Bearer {{TOKEN}}
Idempotency-Key: bill-test-002
Content-Type: application/json

{
  "shop_id": "{{SHOP_ID}}",
  "customer_name": "Walk-in Customer",
  "customer_mobile": "9998887776",
  "customer_gstin": null,
  "items": [
    {
      "variant_id": "{{VARIANT_ID}}",
      "quantity": 1,
      "unit_price": 599
    }
  ],
  "payment_method": "CASH",
  "payment_amount": 707
}
3.3 Get Bill Details
http
GET {{BASE_URL}}/bills/{{BILL_ID}}
Authorization: Bearer {{TOKEN}}
3.4 List All Bills (with Filters)
http
GET {{BASE_URL}}/bills?page=1&limit=10&payment_status=PAID&from_date=2026-05-01&to_date=2026-05-31
Authorization: Bearer {{TOKEN}}
💰 PART 4: PAYMENT OPERATIONS
4.1 Add Partial Payment (if bill is partially paid)
http
POST {{BASE_URL}}/bills/{{BILL_ID}}/payments
Authorization: Bearer {{TOKEN}}
Idempotency-Key: payment-001
Content-Type: application/json

{
  "amount": 500,
  "payment_method": "CASH",
  "reference_no": "CASH-001"
}
❌ PART 5: BILL CANCELLATION
5.1 Cancel Bill (Return Products)
http
PATCH {{BASE_URL}}/bills/{{BILL_ID}}/cancel
Authorization: Bearer {{TOKEN}}
Idempotency-Key: cancel-001
Content-Type: application/json

{
  "reason": "Customer returned product - defective"
}
Expected Response:

json
{
  "success": true,
  "message": "Bill cancelled successfully",
  "data": {
    "bill_id": "bill_xyz789",
    "is_cancelled": true,
    "cancelled_at": "2026-05-26T12:00:00Z",
    "cancel_reason": "Customer returned product - defective"
  }
}
📄 PART 6: PDF INVOICE
6.1 Download PDF Invoice
http
GET {{BASE_URL}}/bills/{{BILL_ID}}/pdf
Authorization: Bearer {{TOKEN}}
Expected: PDF file downloads (Content-Type: application/pdf)

6.2 Get PDF as JSON (with metadata)
http
GET {{BASE_URL}}/bills/{{BILL_ID}}/pdf?format=json
Authorization: Bearer {{TOKEN}}
Expected Response:

json
{
  "success": true,
  "message": "Bill PDF generated",
  "data": {
    "bill_id": "bill_xyz789",
    "bill_number": "INV-20260526-0001"
  }
}
👤 PART 7: CUSTOMER HISTORY
7.1 Get Customer's Bill History
http
GET {{BASE_URL}}/customers/{{CUSTOMER_ID}}/bills?page=1&limit=20
Authorization: Bearer {{TOKEN}}
Expected Response:

json
{
  "success": true,
  "data": [
    {
      "bill_id": "bill_xyz789",
      "bill_number": "INV-20260526-0001",
      "total_amount": 1413.64,
      "payment_status": "PAID",
      "created_at": "2026-05-26T10:30:00Z"
    }
  ]
}
📊 PART 8: REPORTS
8.1 Daily Sales Summary
http
GET {{BASE_URL}}/bills/reports/daily?shop_id={{SHOP_ID}}&date=2026-05-26
Authorization: Bearer {{TOKEN}}
Expected Response:

json
{
  "success": true,
  "data": {
    "shop_id": "shop_001",
    "date": "2026-05-26",
    "bill_count": 5,
    "total_amount": 5000,
    "total_gst": 900,
    "total_collected": 5000,
    "payment_methods": {
      "UPI": 3500,
      "CASH": 1500
    },
    "gst": {
      "cgst": 450,
      "sgst": 450,
      "igst": 0
    }
  }
}
8.2 GST Report (HSN-wise)
http
GET {{BASE_URL}}/bills/reports/gst?shop_id={{SHOP_ID}}&from_date=2026-05-01&to_date=2026-05-31
Authorization: Bearer {{TOKEN}}
Expected Response:

json
{
  "success": true,
  "data": {
    "shop_name": "Delhi Central Store",
    "from_date": "2026-05-01",
    "to_date": "2026-05-31",
    "hsn_summary": [
      {
        "hsn_code": "851712",
        "gst_percent": 18,
        "taxable_value": 10000,
        "tax_amount": 1800,
        "cgst": 900,
        "sgst": 900,
        "igst": 0
      }
    ],
    "totals": {
      "taxable_value": 10000,
      "tax_amount": 1800,
      "cgst": 900,
      "sgst": 900,
      "igst": 0
    }
  }
}
🔄 PART 9: LOYALTY TIER VERIFICATION
9.1 Create Multiple Bills to Increase Customer Spend
http
# Bill 1: ₹1500
POST {{BASE_URL}}/bills
{
  "shop_id": "{{SHOP_ID}}",
  "customer_id": "{{CUSTOMER_ID}}",
  "items": [{"variant_id": "{{VARIANT_ID}}", "quantity": 2, "unit_price": 750}],
  "payment_method": "UPI",
  "payment_amount": 1770
}

# Bill 2: ₹9000 (Total now ₹10500)
POST {{BASE_URL}}/bills
{
  "shop_id": "{{SHOP_ID}}",
  "customer_id": "{{CUSTOMER_ID}}",
  "items": [{"variant_id": "{{VARIANT_ID}}", "quantity": 12, "unit_price": 750}],
  "payment_method": "UPI",
  "payment_amount": 10620
}
9.2 Check Customer Loyalty Tier Updated
http
GET {{BASE_URL}}/customers/{{CUSTOMER_ID}}
Authorization: Bearer {{TOKEN}}
Expected: loyalty_tier should be "SILVER" (since total_spent > 10000)

📋 POSTMAN COLLECTION JSON (Import Ready)
json
{
  "info": {
    "name": "Vyaapar Billing & Customer APIs",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    { "key": "baseUrl", "value": "http://localhost:3441/api/v1" },
    { "key": "token", "value": "" },
    { "key": "shopId", "value": "" },
    { "key": "variantId", "value": "" },
    { "key": "customerId", "value": "" },
    { "key": "billId", "value": "" }
  ],
  "item": [
    {
      "name": "Customer APIs",
      "item": [
        { "name": "Create Customer", "request": { "method": "POST", "url": "{{baseUrl}}/customers" } },
        { "name": "Search Customer", "request": { "method": "GET", "url": "{{baseUrl}}/customers/search?mobile=9876543210" } },
        { "name": "Get Customer", "request": { "method": "GET", "url": "{{baseUrl}}/customers/{{customerId}}" } },
        { "name": "List Customers", "request": { "method": "GET", "url": "{{baseUrl}}/customers?page=1&limit=10" } },
        { "name": "Update Customer", "request": { "method": "PUT", "url": "{{baseUrl}}/customers/{{customerId}}" } },
        { "name": "Customer Bills", "request": { "method": "GET", "url": "{{baseUrl}}/customers/{{customerId}}/bills" } },
        { "name": "Delete Customer", "request": { "method": "DELETE", "url": "{{baseUrl}}/customers/{{customerId}}" } }
      ]
    },
    {
      "name": "Billing APIs",
      "item": [
        { "name": "Create Bill", "request": { "method": "POST", "url": "{{baseUrl}}/bills", "header": [{ "key": "Idempotency-Key", "value": "{{$timestamp}}" }] } },
        { "name": "Get Bill", "request": { "method": "GET", "url": "{{baseUrl}}/bills/{{billId}}" } },
        { "name": "List Bills", "request": { "method": "GET", "url": "{{baseUrl}}/bills?page=1&limit=20" } },
        { "name": "Add Payment", "request": { "method": "POST", "url": "{{baseUrl}}/bills/{{billId}}/payments" } },
        { "name": "Cancel Bill", "request": { "method": "PATCH", "url": "{{baseUrl}}/bills/{{billId}}/cancel" } },
        { "name": "Download PDF", "request": { "method": "GET", "url": "{{baseUrl}}/bills/{{billId}}/pdf" } }
      ]
    },
    {
      "name": "Reports",
      "item": [
        { "name": "Daily Summary", "request": { "method": "GET", "url": "{{baseUrl}}/bills/reports/daily?shop_id={{shopId}}&date=2026-05-26" } },
        { "name": "GST Report", "request": { "method": "GET", "url": "{{baseUrl}}/bills/reports/gst?shop_id={{shopId}}&from_date=2026-05-01&to_date=2026-05-31" } }
      ]
    }
  ]
}
✅ TESTING SEQUENCE SUMMARY
Step	What to Test	API
1	Create customer	POST /customers
2	Search customer	GET /customers/search
3	Check shop stock	GET /shop-stocks/:variantId
4	Create bill	POST /bills
5	Get bill details	GET /bills/:billId
6	Download PDF	GET /bills/:billId/pdf
7	Add payment	POST /bills/:billId/payments
8	Cancel bill	PATCH /bills/:billId/cancel
9	Customer history	GET /customers/:customerId/bills
10	Daily report	GET /bills/reports/daily
11	GST report	GET /bills/reports/gst
