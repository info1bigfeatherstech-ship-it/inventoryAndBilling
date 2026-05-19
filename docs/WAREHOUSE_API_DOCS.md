# Warehouse API Documentation

## Overview
This document provides complete API documentation for Warehouse Master CRUD operations in the Inventory & Billing System.

## Base URL
```
http://localhost:5000/api
```

## Authentication
All endpoints require Bearer token authentication with `SUPER_ADMIN` role.

**Header:**
```
Authorization: Bearer {token}
```

## Warehouse Model

### Schema Definition (Prisma)
```prisma
model Warehouse {
  warehouse_id   String  @id @default(cuid())
  warehouse_code String  @unique
  warehouse_name String
  address        String
  city           String
  manager_name   String?
  is_active      Boolean @default(true)
  remarks        String?

  product_stocks    ProductStock[]
  purchase_entries PurchaseEntry[]
  users           User[]
  inward_receipts InwardReceipt[]
  stock_ledger_out StockLedger[] @relation("LedgerFromWarehouse")
  stock_ledger_in  StockLedger[] @relation("LedgerToWarehouse")

  created_at DateTime @default(now())
  updated_at DateTime @updatedAt

  @@map("warehouses")
}
```

### Response Object
```json
{
  "warehouse_id": "string (CUID)",
  "warehouse_code": "string (3-20 chars)",
  "warehouse_name": "string (2-150 chars)",
  "address": "string (3-500 chars)",
  "city": "string (2-100 chars)",
  "manager_name": "string | null (2-100 chars)",
  "is_active": "boolean",
  "remarks": "string | null (max 500 chars)",
  "created_at": "ISO 8601 datetime",
  "updated_at": "ISO 8601 datetime"
}
```

---

## API Endpoints

### 1. Create Warehouse
Creates a new warehouse record.

**Endpoint:**
```
POST /warehouses
```

**Authentication:** Required (SUPER_ADMIN)

**Request Body:**
```json
{
  "warehouse_code": "WH-CHN-001",
  "warehouse_name": "Chennai Main Warehouse",
  "address": "123 Industrial Park, Sriperambur",
  "city": "Chennai",
  "manager_name": "John Doe",
  "remarks": "Primary warehouse for Tamil Nadu"
}
```

**Field Validations:**
| Field | Type | Length | Pattern | Required |
|-------|------|--------|---------|----------|
| warehouse_code | string | 3-20 | [A-Z, 0-9, _, -] | Yes |
| warehouse_name | string | 2-150 | Any | Yes |
| address | string | 3-500 | Any | Yes |
| city | string | 2-100 | Any | Yes |
| manager_name | string | 2-100 | Any | No (nullable) |
| remarks | string | 0-500 | Any | No (nullable) |

**Response:** `201 Created`
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Warehouse created successfully",
  "data": {
    "warehouse_id": "cuid123abc",
    "warehouse_code": "WH-CHN-001",
    "warehouse_name": "Chennai Main Warehouse",
    "address": "123 Industrial Park, Sriperambur",
    "city": "Chennai",
    "manager_name": "John Doe",
    "is_active": true,
    "remarks": "Primary warehouse for Tamil Nadu",
    "created_at": "2026-05-19T10:00:25.000Z",
    "updated_at": "2026-05-19T10:00:25.000Z"
  }
}
```

**Error Responses:**

| Status | Code | Message | Reason |
|--------|------|---------|--------|
| 400 | Bad Request | Validation errors | Invalid field values |
| 400 | Bad Request | warehouse_code must be unique | Code already exists |
| 401 | Unauthorized | - | Missing/invalid token |
| 403 | Forbidden | - | Insufficient permissions |

**cURL Example:**
```bash
curl -X POST http://localhost:5000/api/warehouses \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "warehouse_code": "WH-CHN-001",
    "warehouse_name": "Chennai Main Warehouse",
    "address": "123 Industrial Park, Sriperambur",
    "city": "Chennai",
    "manager_name": "John Doe",
    "remarks": "Primary warehouse for Tamil Nadu"
  }'
```

---

### 2. Get Warehouse by ID
Retrieve a specific warehouse by its ID.

**Endpoint:**
```
GET /warehouses/:warehouseId
```

**Authentication:** Required (SUPER_ADMIN)

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| warehouseId | string | Warehouse unique identifier (CUID) |

**Query Parameters:** None

**Response:** `200 OK`
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Warehouse fetched successfully",
  "data": {
    "warehouse_id": "cuid123abc",
    "warehouse_code": "WH-CHN-001",
    "warehouse_name": "Chennai Main Warehouse",
    "address": "123 Industrial Park, Sriperambur",
    "city": "Chennai",
    "manager_name": "John Doe",
    "is_active": true,
    "remarks": "Primary warehouse for Tamil Nadu",
    "created_at": "2026-05-19T10:00:25.000Z",
    "updated_at": "2026-05-19T10:00:25.000Z"
  }
}
```

**Error Responses:**

| Status | Code | Message |
|--------|------|---------|
| 404 | Not Found | Warehouse not found |
| 400 | Bad Request | warehouseId is required |
| 401 | Unauthorized | - |
| 403 | Forbidden | - |

**cURL Example:**
```bash
curl -X GET http://localhost:5000/api/warehouses/cuid123abc \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 3. List Warehouses
Retrieve all warehouses with pagination and filtering.

**Endpoint:**
```
GET /warehouses
```

**Authentication:** Required (SUPER_ADMIN)

**Path Parameters:** None

**Query Parameters:**
| Parameter | Type | Default | Min/Max | Description |
|-----------|------|---------|---------|-------------|
| page | integer | 1 | min: 1 | Page number for pagination |
| limit | integer | 10 | 1-100 | Items per page |
| search | string | - | 1-200 chars | Search in warehouse name/code (case-insensitive) |
| city | string | - | 1-100 chars | Filter by city |
| is_active | boolean | - | - | Filter by active/inactive status |

**Response:** `200 OK`
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Warehouses fetched successfully",
  "data": [
    {
      "warehouse_id": "cuid123abc",
      "warehouse_code": "WH-CHN-001",
      "warehouse_name": "Chennai Main Warehouse",
      "address": "123 Industrial Park, Sriperambur",
      "city": "Chennai",
      "manager_name": "John Doe",
      "is_active": true,
      "remarks": "Primary warehouse for Tamil Nadu",
      "created_at": "2026-05-19T10:00:25.000Z",
      "updated_at": "2026-05-19T10:00:25.000Z"
    },
    {
      "warehouse_id": "cuid456def",
      "warehouse_code": "WH-BNG-001",
      "warehouse_name": "Bangalore Warehouse",
      "address": "456 Tech Park, Whitefield",
      "city": "Bangalore",
      "manager_name": "Jane Smith",
      "is_active": true,
      "remarks": null,
      "created_at": "2026-05-19T09:30:00.000Z",
      "updated_at": "2026-05-19T09:30:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 2,
    "totalPages": 1
  }
}
```

**Error Responses:**

| Status | Code | Message |
|--------|------|---------|
| 400 | Bad Request | Invalid pagination parameters |
| 401 | Unauthorized | - |
| 403 | Forbidden | - |

**cURL Examples:**

Basic list:
```bash
curl -X GET "http://localhost:5000/api/warehouses?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

With filters:
```bash
curl -X GET "http://localhost:5000/api/warehouses?page=1&limit=10&city=Chennai&is_active=true" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

With search:
```bash
curl -X GET "http://localhost:5000/api/warehouses?search=CHN&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 4. Update Warehouse
Update an existing warehouse (supports partial updates).

**Endpoint:**
```
PUT /warehouses/:warehouseId
```

**Authentication:** Required (SUPER_ADMIN)

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| warehouseId | string | Warehouse unique identifier (CUID) |

**Request Body (all fields optional):**
```json
{
  "warehouse_code": "WH-CHN-001",
  "warehouse_name": "Chennai Central Warehouse - Updated",
  "address": "123 Industrial Park, Sriperambur",
  "city": "Chennai",
  "manager_name": "Jane Doe",
  "is_active": true,
  "remarks": "Updated manager information"
}
```

**Field Validations:**
| Field | Type | Length | Pattern | Validation |
|-------|------|--------|---------|-----------|
| warehouse_code | string | 3-20 | [A-Z, 0-9, _, -] | Optional, must be unique |
| warehouse_name | string | 2-150 | Any | Optional |
| address | string | 3-500 | Any | Optional |
| city | string | 2-100 | Any | Optional |
| manager_name | string | 2-100 | Any | Optional |
| is_active | boolean | - | - | Optional |
| remarks | string | 0-500 | Any | Optional |

**Response:** `200 OK`
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Warehouse updated successfully",
  "data": {
    "warehouse_id": "cuid123abc",
    "warehouse_code": "WH-CHN-001",
    "warehouse_name": "Chennai Central Warehouse - Updated",
    "address": "123 Industrial Park, Sriperambur",
    "city": "Chennai",
    "manager_name": "Jane Doe",
    "is_active": true,
    "remarks": "Updated manager information",
    "created_at": "2026-05-19T10:00:25.000Z",
    "updated_at": "2026-05-19T10:15:30.000Z"
  }
}
```

**Error Responses:**

| Status | Code | Message |
|--------|------|---------|
| 404 | Not Found | Warehouse not found |
| 400 | Bad Request | Validation errors |
| 400 | Bad Request | warehouse_code must be unique |
| 401 | Unauthorized | - |
| 403 | Forbidden | - |

**cURL Example:**
```bash
curl -X PUT http://localhost:5000/api/warehouses/cuid123abc \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "manager_name": "Jane Doe",
    "remarks": "Updated manager information"
  }'
```

---

### 5. Delete/Deactivate Warehouse
Soft delete (deactivate) a warehouse.

**Endpoint:**
```
DELETE /warehouses/:warehouseId
```

**Authentication:** Required (SUPER_ADMIN)

**Note:** This endpoint performs a soft delete by setting `is_active` to `false`. The warehouse record remains in the database for historical tracking and audit purposes.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| warehouseId | string | Warehouse unique identifier (CUID) |

**Request Body:** None

**Response:** `200 OK`
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Warehouse deactivated successfully",
  "data": {
    "warehouse_id": "cuid123abc",
    "is_active": false
  }
}
```

**Alternative Response (Already Inactive):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Warehouse already inactive",
  "data": {
    "warehouse_id": "cuid123abc",
    "is_active": false
  }
}
```

**Error Responses:**

| Status | Code | Message |
|--------|------|---------|
| 404 | Not Found | Warehouse not found |
| 400 | Bad Request | warehouseId is required |
| 401 | Unauthorized | - |
| 403 | Forbidden | - |

**cURL Example:**
```bash
curl -X DELETE http://localhost:5000/api/warehouses/cuid123abc \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Response Format

All API responses follow a consistent format:

```json
{
  "success": true|false,
  "statusCode": number,
  "message": "string",
  "data": object|array|null,
  "meta": object|null,
  "errors": array|null
}
```

### Fields:
- **success** (boolean): Indicates if the operation was successful
- **statusCode** (number): HTTP status code
- **message** (string): Human-readable message
- **data** (object|array|null): Response payload
- **meta** (object|null): Metadata (e.g., pagination info)
- **errors** (array|null): Array of error objects with `field` and `message`

---

## Error Handling

### Common Error Scenarios

**Missing Authentication Token:**
```json
{
  "success": false,
  "statusCode": 401,
  "message": "No authorization token was found"
}
```

**Invalid/Expired Token:**
```json
{
  "success": false,
  "statusCode": 401,
  "message": "Invalid token"
}
```

**Insufficient Permissions:**
```json
{
  "success": false,
  "statusCode": 403,
  "message": "Insufficient permissions"
}
```

**Validation Error:**
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation errors",
  "errors": [
    {
      "field": "warehouse_code",
      "message": "warehouse_code must be 3-20 chars [A-Z, 0-9, _, -]"
    }
  ]
}
```

**Resource Not Found:**
```json
{
  "success": false,
  "statusCode": 404,
  "message": "Warehouse not found"
}
```

**Server Error:**
```json
{
  "success": false,
  "statusCode": 500,
  "message": "Internal server error"
}
```

---

## Validation Rules

### Warehouse Code
- **Format:** `^[A-Z0-9_-]{3,20}$`
- **Rules:**
  - Must be 3-20 characters
  - Only uppercase letters (A-Z), digits (0-9), underscores (_), and hyphens (-)
  - Automatically converted to uppercase
  - Must be unique across all warehouses

### Warehouse Name
- **Rules:**
  - 2-150 characters
  - Required field
  - Trimmed on input

### Address
- **Rules:**
  - 3-500 characters
  - Required field
  - Trimmed on input

### City
- **Rules:**
  - 2-100 characters
  - Required field
  - Trimmed on input

### Manager Name
- **Rules:**
  - 2-100 characters
  - Optional field
  - Trimmed on input
  - Can be null

### Remarks
- **Rules:**
  - Maximum 500 characters
  - Optional field
  - Trimmed on input
  - Can be null

---

## Rate Limiting

The API currently has no rate limiting implemented. However, standard HTTP best practices should be followed:
- Implement exponential backoff for retries
- Avoid excessive polling
- Cache responses appropriately

---

## Pagination

List endpoints support cursor-based pagination:

**Query Parameters:**
- `page`: Page number (starting from 1)
- `limit`: Number of items per page (1-100, default: 10)

**Pagination Metadata:**
```json
{
  "page": 1,
  "limit": 10,
  "total": 45,
  "totalPages": 5
}
```

---

## Related Models & Relationships

The Warehouse model is related to several other entities:

### Direct Relations
- **ProductStock**: Tracks inventory per product at warehouse
- **PurchaseEntry**: Purchase orders received at warehouse
- **User**: Staff members assigned to warehouse
- **InwardReceipt**: Incoming shipments
- **StockLedger**: Stock movement history

### Usage Context
Before deleting a warehouse, ensure:
1. All products stock is cleared or transferred
2. All outstanding purchase orders are fulfilled
3. All associated users are reassigned
4. All stock ledger entries are recorded

---

## Integration Examples

### JavaScript/Node.js
```javascript
const axios = require('axios');

async function createWarehouse() {
  try {
    const response = await axios.post('http://localhost:5000/api/warehouses', {
      warehouse_code: 'WH-CHN-001',
      warehouse_name: 'Chennai Main Warehouse',
      address: '123 Industrial Park, Sriperambur',
      city: 'Chennai',
      manager_name: 'John Doe',
      remarks: 'Primary warehouse for Tamil Nadu'
    }, {
      headers: {
        'Authorization': `Bearer ${YOUR_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    console.log(response.data);
  } catch (error) {
    console.error(error.response.data);
  }
}
```

### Python
```python
import requests

url = "http://localhost:5000/api/warehouses"
headers = {
    "Authorization": f"Bearer {YOUR_TOKEN}",
    "Content-Type": "application/json"
}

payload = {
    "warehouse_code": "WH-CHN-001",
    "warehouse_name": "Chennai Main Warehouse",
    "address": "123 Industrial Park, Sriperambur",
    "city": "Chennai",
    "manager_name": "John Doe",
    "remarks": "Primary warehouse for Tamil Nadu"
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())
```

---

## Changelog

**Version 1.0.0** (2026-05-19)
- Initial API release
- Full CRUD operations for Warehouse master
- Pagination and filtering support
- Soft delete implementation

---

## Support & Issues

For issues or questions:
1. Check this documentation
2. Review error messages in response
3. Contact the development team
