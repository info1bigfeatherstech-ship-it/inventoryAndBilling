# Vyaapar Backend API - Complete Documentation

Complete API testing guide with all endpoints for Postman / API testing tools.

## Base Configuration

- **Base URL**: `http://localhost:3000`
- **API Version Base**: `http://localhost:3000/api/v1`
- **Content Type**: `application/json`
- **All APIs** require Bearer token in Authorization header (except Health & Auth Login)

## Postman Environment Variables

Create a Postman environment and add these variables:

```
baseUrl = http://localhost:3000
apiV1 = {{baseUrl}}/api/v1
accessToken = <value from login response>
vendorId = <value from vendor create/list>
warehouseId = <value from warehouse create/list>
userId = <value from user create/list>
categoryId = <value from category create/list>
productId = <value from product create/list>
variantId = <value from variant create/list>
stockId = <value from stock create/list>
inwardId = <value from inward create/list>
```

---

## 1. Health / System APIs (Public - No Auth Required)

### 1.1 Health Check
```
GET {{baseUrl}}/health
```
**Response**: `{ success: true, message: "Health check passed" }`

### 1.2 Readiness
```
GET {{baseUrl}}/ready
```
**Response**: Readiness status

### 1.3 Liveness
```
GET {{baseUrl}}/live
```
**Response**: Liveness status

### 1.4 API Root
```
GET {{baseUrl}}/api
```
**Response**: API info with version and endpoints list

### 1.5 API v1 Root
```
GET {{apiV1}}
```
**Response**: API v1 endpoint information

---

## 2. Authentication APIs

### 2.1 Login
```
POST {{apiV1}}/auth/login
Content-Type: application/json

{
  "phone": "8580403506",
  "password": "bfDev@09"
}
```
**Response**:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "eyJhbGc...",
    "tokenType": "Bearer",
    "expiresIn": 3600,
    "user": {
      "user_id": "...",
      "phone": "8580403506",
      "role": "SUPER_ADMIN",
      "warehouse_id": null,
      "shop_id": null
    }
  },
  "requestId": "req_..."
}
```
**Save to env**: `accessToken` = `data.accessToken`

### 2.2 Refresh Token
```
POST {{apiV1}}/auth/refresh
Authorization: Bearer {{accessToken}}
```
**Response**: New access token (same structure as login)

### 2.3 Logout
```
POST {{apiV1}}/auth/logout
Authorization: Bearer {{accessToken}}
```
**Response**: `{ success: true, message: "Logout successful", data: null }`

### 2.4 Get My Profile
```
GET {{apiV1}}/auth/me
Authorization: Bearer {{accessToken}}
```
**Response**: Current user profile details

---

## 3. Vendor APIs (Protected: SUPER_ADMIN)

### 3.1 Create Vendor
```
POST {{apiV1}}/vendors
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "company_name": "Hindustan Unilever Ltd.",
  "contact_person": "Rajesh Sharma",
  "phone": "9876543210",
  "whatsapp": "9876543210",
  "email": "rajesh@hul.com",
  "gst_number": "07AAACH0997M1ZJ",
  "vendor_type": "Premium",
  "supply_city": "Mumbai",
  "business_type": "IMPORTER",
  "city": "Mumbai",
  "address": "HUL House, Lower Parel",
  "remarks": "Preferred vendor"
}
```
**Response**: Created vendor object with `vendor_id`
**Status**: 201 Created

### 3.2 List Vendors (with Pagination)
```
GET {{apiV1}}/vendors
Authorization: Bearer {{accessToken}}
```
**Query Parameters** (optional):
- `page` (default: 1)
- `limit` (default: 50, max: 100)
- `search` - searches company_name, phone, email
- `business_type` - RETAILER, WHOLESALER, IMPORTER, EXPORTER, DISTRIBUTOR
- `city` - filter by city
- `is_active` - true/false

**Examples**:
```
GET {{apiV1}}/vendors?page=1&limit=10
GET {{apiV1}}/vendors?search=hul
GET {{apiV1}}/vendors?business_type=WHOLESALER&is_active=true
```

### 3.3 Get Vendor by ID
```
GET {{apiV1}}/vendors/{{vendorId}}
Authorization: Bearer {{accessToken}}
```

### 3.4 Update Vendor
```
PUT {{apiV1}}/vendors/{{vendorId}}
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "company_name": "HUL (Updated)",
  "email": "updated@hul.com",
  "remarks": "Updated from Postman"
}
```

### 3.5 Delete Vendor (Soft Delete - sets is_active=false)
```
DELETE {{apiV1}}/vendors/{{vendorId}}
Authorization: Bearer {{accessToken}}
```

---

## 4. Warehouse APIs (Protected: SUPER_ADMIN)

### 4.1 Create Warehouse
```
POST {{apiV1}}/warehouses
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "warehouse_name": "Delhi Central Warehouse",
  "warehouse_code": "WH_DEL_001",
  "address": "Plot 123, Industrial Area, Delhi",
  "city": "Delhi",
  "state": "Delhi",
  "pincode": "110001",
  "contact_person": "Suresh Kumar",
  "contact_phone": "9123456789",
  "email": "warehouse@vyaapar.com",
  "capacity": 10000,
  "remarks": "Main distribution center"
}
```
**Response**: Created warehouse object with `warehouse_id`
**Status**: 201 Created

### 4.2 List Warehouses
```
GET {{apiV1}}/warehouses
Authorization: Bearer {{accessToken}}
```
**Query Parameters** (optional):
- `page` (default: 1)
- `limit` (default: 50)
- `search` - warehouse_name, warehouse_code
- `city`
- `is_active` - true/false

### 4.3 Get Warehouse by ID
```
GET {{apiV1}}/warehouses/{{warehouseId}}
Authorization: Bearer {{accessToken}}
```

### 4.4 Update Warehouse
```
PUT {{apiV1}}/warehouses/{{warehouseId}}
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "warehouse_name": "Delhi Central Warehouse (Updated)",
  "contact_person": "Ramesh Singh",
  "capacity": 15000
}
```

### 4.5 Delete Warehouse (Soft Delete)
```
DELETE {{apiV1}}/warehouses/{{warehouseId}}
Authorization: Bearer {{accessToken}}
```

---

## 5. Category APIs (Protected: All Roles can READ, SUPER_ADMIN only can WRITE)

> Full spec: [doc/category-routes.md](./doc/category-routes.md) — WH_MANAGER cannot create categories.

### 5.1 Create Category
```
POST {{apiV1}}/categories
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "category_name": "Electronics",
  "description": "Electronic items and gadgets",
  "category_code": "CAT_ELEC_001",
  "remarks": "New category"
}
```
**Response**: Created category object with `category_id`
**Status**: 201 Created

### 5.2 List Categories
```
GET {{apiV1}}/categories
Authorization: Bearer {{accessToken}}
```
**Query Parameters** (optional):
- `page` (default: 1)
- `limit` (default: 50)
- `search` - category_name, category_code
- `is_active` - true/false

### 5.3 Get Category by ID
```
GET {{apiV1}}/categories/{{categoryId}}
Authorization: Bearer {{accessToken}}
```

### 5.4 Update Category
```
PUT {{apiV1}}/categories/{{categoryId}}
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "category_name": "Electronics (Updated)",
  "description": "Updated description"
}
```

### 5.5 Delete Category (Soft Delete)
```
DELETE {{apiV1}}/categories/{{categoryId}}
Authorization: Bearer {{accessToken}}
```

---

## 6. User APIs (Protected: SUPER_ADMIN Only)

### 6.1 Create User
```
POST {{apiV1}}/users
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "phone": "9876543210",
  "password": "SecurePass@123",
  "first_name": "Raj",
  "last_name": "Kumar",
  "email": "raj@vyaapar.com",
  "role": "WH_MANAGER",
  "warehouse_id": "{{warehouseId}}",
  "is_active": true
}
```
**Roles**: SUPER_ADMIN, WH_MANAGER, WH_STOCK_LISTER, SHOP_OWNER, SHOP_STOCK_LISTER, BILLING_STAFF
**Response**: Created user object with `user_id`
**Status**: 201 Created

### 6.2 List Users
```
GET {{apiV1}}/users
Authorization: Bearer {{accessToken}}
```
**Query Parameters** (optional):
- `page` (default: 1)
- `limit` (default: 50)
- `search` - phone, email, first_name
- `role` - filter by role
- `is_active` - true/false

### 6.3 Get User by ID
```
GET {{apiV1}}/users/{{userId}}
Authorization: Bearer {{accessToken}}
```

### 6.4 Update User
```
PUT {{apiV1}}/users/{{userId}}
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "first_name": "Rajesh",
  "email": "rajesh.updated@vyaapar.com",
  "role": "WH_MANAGER"
}
```

### 6.5 Update User Status
```
PATCH {{apiV1}}/users/{{userId}}/status
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "is_active": false
}
```

### 6.6 Reset User Password
```
POST {{apiV1}}/users/{{userId}}/reset-password
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "new_password": "NewPassword@123"
}
```

---

## 7. Product APIs (with Variants Support)

**Read Roles**: SUPER_ADMIN, WH_MANAGER, WH_STOCK_LISTER, SHOP_OWNER, SHOP_STOCK_LISTER, BILLING_STAFF
**Write Roles**: SUPER_ADMIN, WH_MANAGER, WH_STOCK_LISTER

### 7.1 Create Product
```
POST {{apiV1}}/products
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "product_name": "iPhone 14 Pro",
  "product_code": "PRD_IP14P_001",
  "category_id": "{{categoryId}}",
  "vendor_id": "{{vendorId}}",
  "warehouse_id": "{{warehouseId}}",
  "description": "Latest Apple iPhone 14 Pro",
  "mrp": 99999,
  "cost_price": 80000,
  "unit_of_measurement": "PIECE",
  "warranty_period_months": 12,
  "is_serialized": true,
  "tax_percentage": 18,
  "remarks": "Premium smartphone"
}
```
**Response**: Created product with `product_id`
**Status**: 201 Created

### 7.2 List Products
```
GET {{apiV1}}/products
Authorization: Bearer {{accessToken}}
```
**Query Parameters** (optional):
- `page` (default: 1)
- `limit` (default: 50)
- `search` - product_name, product_code
- `category_id`
- `vendor_id`
- `warehouse_id` - (SUPER_ADMIN can filter)
- `is_active` - true/false

### 7.3 Get Product by ID
```
GET {{apiV1}}/products/{{productId}}
Authorization: Bearer {{accessToken}}
```

### 7.4 Update Product
```
PATCH {{apiV1}}/products/{{productId}}
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "product_name": "iPhone 14 Pro Max",
  "mrp": 119999,
  "cost_price": 95000,
  "warranty_period_months": 18
}
```
Also supports PUT instead of PATCH.

### 7.5 Delete Product (Soft Delete)
```
DELETE {{apiV1}}/products/{{productId}}
Authorization: Bearer {{accessToken}}
```

---

## 8. Product Variant APIs

### 8.1 Create Variant for Product
```
POST {{apiV1}}/products/{{productId}}/variants
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "variant_name": "iPhone 14 Pro - Gold 256GB",
  "variant_sku": "IP14P_GOLD_256",
  "variant_code": "VAR_IP14P_G256_001",
  "color": "Gold",
  "size": "256GB",
  "mrp": 99999,
  "cost_price": 80000,
  "quantity": 50,
  "is_active": true,
  "remarks": "Gold variant 256GB model"
}
```
**Response**: Updated product with new variant
**Status**: 201 Created

### 8.2 Update Variant
```
PATCH {{apiV1}}/products/{{productId}}/variants/{{variantId}}
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "variant_name": "iPhone 14 Pro - Gold 512GB",
  "size": "512GB",
  "mrp": 119999,
  "quantity": 75
}
```
Also supports PUT instead of PATCH.

### 8.3 Upload Variant Images (Max 4 images)
```
POST {{apiV1}}/products/{{productId}}/variants/{{variantId}}/images
Authorization: Bearer {{accessToken}}
Content-Type: multipart/form-data

Form Data:
- images: [file1.jpg, file2.png, ...]
```
**Response**: Array of uploaded image objects
**Status**: 201 Created
**Allowed formats**: JPEG, PNG, WebP, GIF
**Max size**: 5MB per file

### 8.4 Sync Variant Images (Replace all images)
```
PUT {{apiV1}}/products/{{productId}}/variants/{{variantId}}/images
Authorization: Bearer {{accessToken}}
Content-Type: multipart/form-data

Form Data:
- images: [file1.jpg, file2.png, ...]
- keep_image_ids: [id1, id2] (optional - comma-separated or JSON array)
```
**Response**: Updated image list
**Status**: 200 OK

---

## 9. Bulk Product Operations

### 9.1 Bulk Create Products from CSV
```
POST {{apiV1}}/products/bulk/csv
Authorization: Bearer {{accessToken}}
Content-Type: multipart/form-data

Form Data:
- file: products.csv
- warehouse_id: {{warehouseId}} (optional)
```
**CSV Format**:
```
product_name,product_code,category_id,vendor_id,mrp,cost_price,quantity
iPhone 14 Pro,PRD_IP14P_001,cat_123,ven_456,99999,80000,50
```
**Response**: Bulk import results with success/error details
**Status**: 200 OK

### 9.2 Bulk Update Products
```
PATCH {{apiV1}}/products/bulk
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "items": [
    {
      "product_id": "prod_1",
      "mrp": 99999,
      "cost_price": 80000
    },
    {
      "product_id": "prod_2",
      "mrp": 49999
    }
  ]
}
```
**Response**: Bulk update results
**Status**: 200 OK

### 9.3 Bulk Delete Products
```
DELETE {{apiV1}}/products/bulk
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "product_ids": ["prod_1", "prod_2", "prod_3"]
}
```
**Response**: Deleted product IDs
**Status**: 200 OK

---

## 10. Product Stock APIs

**Read Roles**: SUPER_ADMIN, WH_MANAGER, WH_STOCK_LISTER, SHOP_OWNER, SHOP_STOCK_LISTER, BILLING_STAFF
**Write Roles**: SUPER_ADMIN, WH_MANAGER, WH_STOCK_LISTER

### 10.1 Create Stock Record
```
POST {{apiV1}}/product-stocks
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "product_id": "{{productId}}",
  "variant_id": "{{variantId}}",
  "warehouse_id": "{{warehouseId}}",
  "quantity_on_hand": 100,
  "quantity_reserved": 10,
  "quantity_available": 90,
  "reorder_level": 20,
  "batch_number": "BATCH_001",
  "expiry_date": "2025-12-31",
  "last_stock_check_date": "2024-01-15",
  "remarks": "Fresh stock"
}
```
**Response**: Created stock record with `stock_id`
**Status**: 201 Created

### 10.2 List Stock Records
```
GET {{apiV1}}/product-stocks
Authorization: Bearer {{accessToken}}
```
**Query Parameters** (optional):
- `page` (default: 1)
- `limit` (default: 50)
- `product_id`
- `variant_id`
- `warehouse_id` - (SUPER_ADMIN can filter)
- `is_low_stock` - true/false
- `batch_number`

### 10.3 Get Stock Record by ID
```
GET {{apiV1}}/product-stocks/{{stockId}}
Authorization: Bearer {{accessToken}}
```

### 10.4 Update Stock Record
```
PUT {{apiV1}}/product-stocks/{{stockId}}
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "quantity_on_hand": 120,
  "quantity_reserved": 15,
  "quantity_available": 105,
  "reorder_level": 25
}
```

### 10.5 Delete Stock Record
```
DELETE {{apiV1}}/product-stocks/{{stockId}}
Authorization: Bearer {{accessToken}}
```

---

## 11. Bulk Stock Operations

### 11.1 Bulk Create Stock from CSV
```
POST {{apiV1}}/product-stocks/bulk/csv
Authorization: Bearer {{accessToken}}
Content-Type: multipart/form-data

Form Data:
- file: stock.csv
- warehouse_id: {{warehouseId}} (optional)
```
**CSV Format**:
```
product_id,variant_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_level,batch_number,expiry_date
prod_1,var_1,wh_1,100,10,20,BATCH_001,2025-12-31
```

### 11.2 Bulk Update Stock
```
PATCH {{apiV1}}/product-stocks/bulk
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "items": [
    {
      "stock_id": "stk_1",
      "quantity_on_hand": 120,
      "quantity_reserved": 15
    },
    {
      "stock_id": "stk_2",
      "quantity_on_hand": 85
    }
  ]
}
```

### 11.3 Bulk Delete Stock
```
DELETE {{apiV1}}/product-stocks/bulk
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "stock_ids": ["stk_1", "stk_2", "stk_3"]
}
```

---

## 12. Inward APIs (Goods Receiving)

**Protected**: SUPER_ADMIN, WH_MANAGER, WH_STOCK_LISTER

### 12.1 Create Inward Schedule
```
POST {{apiV1}}/inwards
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "vendor_id": "{{vendorId}}",
  "warehouse_id": "{{warehouseId}}",
  "reference_number": "PO_2024_001",
  "expected_arrival_date": "2024-02-15",
  "po_number": "PO_2024_001",
  "po_date": "2024-02-01",
  "po_amount": 500000,
  "remarks": "First shipment"
}
```
**Response**: Created inward record with `inward_id`
**Status**: 201 Created

### 12.2 List Inwards
```
GET {{apiV1}}/inwards
Authorization: Bearer {{accessToken}}
```
**Query Parameters** (optional):
- `page` (default: 1)
- `limit` (default: 50)
- `search` - reference_number, po_number
- `vendor_id`
- `warehouse_id`
- `status` - PENDING, IN_TRANSIT, RECEIVED, COMPLETED, CANCELLED
- `from_date` - filter from date
- `to_date` - filter to date

### 12.3 Get Inward by ID
```
GET {{apiV1}}/inwards/{{inwardId}}
Authorization: Bearer {{accessToken}}
```

### 12.4 Update Inward Arrival Details
```
PATCH {{apiV1}}/inwards/{{inwardId}}/arrival-details
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "actual_arrival_date": "2024-02-14",
  "invoice_number": "INV_2024_001",
  "invoice_amount": 495000,
  "invoice_date": "2024-02-14",
  "transport_mode": "TRUCK",
  "tracking_number": "TRK_123456",
  "remarks": "Arrived on schedule"
}
```

### 12.5 Add Item to Inward
```
POST {{apiV1}}/inwards/{{inwardId}}/items
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "product_id": "{{productId}}",
  "variant_id": "{{variantId}}",
  "po_quantity": 50,
  "received_quantity": 50,
  "unit_price": 16000,
  "batch_number": "BATCH_001",
  "expiry_date": "2025-12-31",
  "remarks": "All items received in good condition"
}
```
**Response**: Created inward item
**Status**: 201 Created

### 12.6 Update Inward Item
```
PUT {{apiV1}}/inwards/{{inwardId}}/items/{{inwardItemId}}
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "received_quantity": 48,
  "remarks": "2 units found defective"
}
```

### 12.7 Remove Inward Item
```
DELETE {{apiV1}}/inwards/{{inwardId}}/items/{{inwardItemId}}
Authorization: Bearer {{accessToken}}
```

### 12.8 Update Inward Status
```
PATCH {{apiV1}}/inwards/{{inwardId}}/status
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "status": "RECEIVED",
  "remarks": "All items checked and stored"
}
```
**Status Options**: PENDING, IN_TRANSIT, RECEIVED, COMPLETED, CANCELLED

---

## 13. Standard Response Formats

### 13.1 Success Response
```json
{
  "success": true,
  "message": "Request successful",
  "data": {},
  "requestId": "req_12345..."
}
```

### 13.2 Success with Pagination
```json
{
  "success": true,
  "message": "Records fetched successfully",
  "data": [],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10
  },
  "requestId": "req_12345..."
}
```

### 13.3 Error Response
```json
{
  "success": false,
  "message": "Request failed",
  "code": "ERROR_CODE",
  "details": {
    "fields": [
      {
        "field": "field_name",
        "message": "Error message"
      }
    ]
  },
  "requestId": "req_12345..."
}
```

### 13.4 Common Error Codes
- `AUTH_REQUIRED` - 401 - Authentication token missing or invalid
- `AUTH_FORBIDDEN` - 403 - User doesn't have permission
- `VALIDATION_ERROR` - 400 - Input validation failed
- `NOT_FOUND` - 404 - Resource not found
- `DUPLICATE_ENTRY` - 409 - Duplicate unique field
- `SERVER_ERROR` - 500 - Internal server error

---

## 14. Authentication Headers

All protected endpoints require:
```
Authorization: Bearer {{accessToken}}
Content-Type: application/json
```

---

## 15. Negative Test Cases

### 15.1 Missing Authentication Token
```
GET {{apiV1}}/products
```
**Expected**: 401 AUTH_REQUIRED

### 15.2 Invalid Token
```
GET {{apiV1}}/products
Authorization: Bearer invalid_token_xyz
```
**Expected**: 401 AUTH_REQUIRED

### 15.3 Insufficient Permissions
```
POST {{apiV1}}/products
Authorization: Bearer {{accessToken}}
(with BILLING_STAFF role)
```
**Expected**: 403 AUTH_FORBIDDEN

### 15.4 Validation Error - Missing Required Field
```
POST {{apiV1}}/products
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "product_name": "Test Product"
  // missing product_code, category_id, etc.
}
```
**Expected**: 400 VALIDATION_ERROR

### 15.4 Duplicate Phone in Vendor
```
POST {{apiV1}}/vendors
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "company_name": "Duplicate Vendor",
  "phone": "9876543210", // already exists
  "city": "Delhi",
  "business_type": "WHOLESALER"
}
```
**Expected**: 409 DUPLICATE_ENTRY

### 15.5 Not Found
```
GET {{apiV1}}/products/invalid_product_id
Authorization: Bearer {{accessToken}}
```
**Expected**: 404 NOT_FOUND

---

## 16. Testing Workflow Example

1. **Login**
   ```
   POST {{apiV1}}/auth/login
   → Save accessToken from response
   ```

2. **Create Warehouse**
   ```
   POST {{apiV1}}/warehouses
   → Save warehouseId from response
   ```

3. **Create Vendor**
   ```
   POST {{apiV1}}/vendors
   → Save vendorId from response
   ```

4. **Create Category**
   ```
   POST {{apiV1}}/categories
   → Save categoryId from response
   ```

5. **Create Product**
   ```
   POST {{apiV1}}/products
   → Save productId from response
   ```

6. **Create Product Variant**
   ```
   POST {{apiV1}}/products/{{productId}}/variants
   → Save variantId from response
   ```

7. **Upload Variant Images**
   ```
   POST {{apiV1}}/products/{{productId}}/variants/{{variantId}}/images
   ```

8. **Create Stock Record**
   ```
   POST {{apiV1}}/product-stocks
   → Save stockId from response
   ```

9. **Create Inward**
   ```
   POST {{apiV1}}/inwards
   → Save inwardId from response
   ```

10. **Add Items to Inward**
    ```
    POST {{apiV1}}/inwards/{{inwardId}}/items
    ```

11. **Update Inward Status**
    ```
    PATCH {{apiV1}}/inwards/{{inwardId}}/status
    ```

---

## 17. Performance Tips

- Use pagination (page & limit) for list endpoints
- Use search filters to reduce data transfer
- Cache frequently accessed data (categories, warehouses)
- Batch bulk operations when possible
- Use appropriate status codes for error handling

---

**Document Version**: 1.0
**Last Updated**: 2024
**API Base Version**: v1.0.0
