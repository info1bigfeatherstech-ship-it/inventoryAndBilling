# Vyaapar Backend API Testing Flow (Postman)

This document contains all currently implemented APIs and a clean testing flow with dummy payloads.

## 1) Base Configuration

- Base URL: `http://localhost:3000`
- API Version Base: `http://localhost:3000/api/v1`
- Content type for JSON requests: `application/json`
- Vendor APIs are protected and require Bearer token.

## 2) Postman Environment Variables (Recommended)

Create a Postman environment and add:

- `baseUrl` = `http://localhost:3000`
- `apiV1` = `{{baseUrl}}/api/v1`
- `accessToken` = (set after login)
- `vendorId` = (set after create/list)

## 3) Health / System APIs (Public)

### 3.1 Health
- Method: `GET`
- URL: `{{baseUrl}}/health`
- Auth: None

### 3.2 Readiness
- Method: `GET`
- URL: `{{baseUrl}}/ready`
- Auth: None

### 3.3 Liveness
- Method: `GET`
- URL: `{{baseUrl}}/live`
- Auth: None

### 3.4 API Root
- Method: `GET`
- URL: `{{baseUrl}}/api`
- Auth: None

### 3.5 API v1 Root
- Method: `GET`
- URL: `{{apiV1}}`
- Auth: None

## 4) Auth APIs

## 4.1 Login (Super Admin)
- Method: `POST`
- URL: `{{apiV1}}/auth/login`
- Auth: None
- Headers:
  - `Content-Type: application/json`
- Body (raw JSON):

```json
{
  "phone": "8580403506",
  "password": "bfDev@09"
}
```

Expected output contains:
- `data.accessToken`
- `data.tokenType` (`Bearer`)
- `data.user`

Save token to Postman env:
- `accessToken = <data.accessToken>`

## 4.2 My Profile
- Method: `GET`
- URL: `{{apiV1}}/auth/me`
- Auth: Bearer Token
  - Token: `{{accessToken}}`

## 5) Vendor APIs (Protected: SUPER_ADMIN)

For all Vendor endpoints below, set:
- Auth Type: Bearer Token
- Token: `{{accessToken}}`

### 5.1 Create Vendor
- Method: `POST`
- URL: `{{apiV1}}/vendors`
- Headers:
  - `Content-Type: application/json`
- Body (raw JSON):

```json
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

After response, store:
- `vendorId = data.vendor_id`

### 5.2 Create Vendor (Dummy 2)
- Method: `POST`
- URL: `{{apiV1}}/vendors`
- Body:

```json
{
  "company_name": "Amul Dairy",
  "contact_person": "Amit Patel",
  "phone": "9123456789",
  "whatsapp": "9123456789",
  "email": "sales@amul.example",
  "gst_number": "07AAACA1234R1Z5",
  "vendor_type": "Regular",
  "supply_city": "Anand",
  "business_type": "DISTRIBUTOR",
  "city": "Delhi",
  "address": "Patel Nagar, Delhi",
  "remarks": "Cold chain items"
}
```

### 5.3 Create Vendor (Dummy 3)
- Method: `POST`
- URL: `{{apiV1}}/vendors`
- Body:

```json
{
  "company_name": "Gupta Wholesale Traders",
  "phone": "9000011111",
  "supply_city": "Delhi",
  "business_type": "WHOLESALER",
  "city": "Delhi",
  "address": "Karol Bagh",
  "remarks": "No GST vendor"
}
```

### 5.4 List Vendors
- Method: `GET`
- URL: `{{apiV1}}/vendors`
- Query params (optional):
  - `page` (default: 1)
  - `limit` (default: 50, max: 100)
  - `search` (searches company_name / phone / email)
  - `business_type` (`RETAILER`, `WHOLESALER`, `IMPORTER`, `EXPORTER`, `DISTRIBUTOR`)
  - `city`
  - `is_active` (`true` / `false`)

Examples:
- `{{apiV1}}/vendors?page=1&limit=10`
- `{{apiV1}}/vendors?search=hul&page=1&limit=10`
- `{{apiV1}}/vendors?business_type=WHOLESALER&is_active=true`

### 5.5 Get Vendor by ID
- Method: `GET`
- URL: `{{apiV1}}/vendors/{{vendorId}}`

### 5.6 Update Vendor
- Method: `PUT`
- URL: `{{apiV1}}/vendors/{{vendorId}}`
- Headers:
  - `Content-Type: application/json`
- Body:

```json
{
  "company_name": "HUL (Updated)",
  "email": "updated@hul.com",
  "remarks": "Updated from Postman test"
}
```

### 5.7 Soft Delete Vendor
- Method: `DELETE`
- URL: `{{apiV1}}/vendors/{{vendorId}}`

This sets `is_active = false`.

### 5.8 Verify Inactive Vendors
- Method: `GET`
- URL: `{{apiV1}}/vendors?is_active=false&page=1&limit=10`

## 6) Negative Test Cases (Important)

### 6.1 Vendor endpoint without token
- Method: `GET`
- URL: `{{apiV1}}/vendors`
- Expected: `401 AUTH_REQUIRED`

### 6.2 Duplicate phone
- Method: `POST`
- URL: `{{apiV1}}/vendors`
- Body:

```json
{
  "company_name": "Duplicate Phone Vendor",
  "phone": "9876543210",
  "supply_city": "Delhi",
  "business_type": "RETAILER",
  "city": "Delhi"
}
```

Expected: `409` duplicate entry (phone unique).

### 6.3 Invalid business_type
- Method: `POST`
- URL: `{{apiV1}}/vendors`
- Body:

```json
{
  "company_name": "Bad Enum Vendor",
  "phone": "8111111111",
  "supply_city": "Delhi",
  "business_type": "SOMETHING",
  "city": "Delhi"
}
```

Expected: `400 VALIDATION_ERROR`.

### 6.4 Invalid phone format
- Method: `POST`
- URL: `{{apiV1}}/vendors`
- Body:

```json
{
  "company_name": "Invalid Phone Vendor",
  "phone": "12345",
  "supply_city": "Delhi",
  "business_type": "IMPORTER",
  "city": "Delhi"
}
```

Expected: `400 VALIDATION_ERROR`.

## 7) Standard Response Formats

### Success

```json
{
  "success": true,
  "message": "Request successful",
  "data": {},
  "requestId": "..."
}
```

### Success with pagination

```json
{
  "success": true,
  "message": "Vendors fetched successfully",
  "data": [],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 3,
    "totalPages": 1
  },
  "requestId": "..."
}
```

### Error

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": {
    "fields": [
      {
        "field": "business_type",
        "message": "business_type must be one of: RETAILER, WHOLESALER, IMPORTER, EXPORTER, DISTRIBUTOR"
      }
    ]
  },
  "requestId": "..."
}
```

---

This document reflects currently implemented APIs only.
