# Warehouse API - Quick Reference Guide

## Endpoints Overview

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/warehouses` | Create new warehouse | SUPER_ADMIN |
| GET | `/api/warehouses` | List all warehouses | SUPER_ADMIN |
| GET | `/api/warehouses/:warehouseId` | Get warehouse by ID | SUPER_ADMIN |
| PUT | `/api/warehouses/:warehouseId` | Update warehouse | SUPER_ADMIN |
| DELETE | `/api/warehouses/:warehouseId` | Deactivate warehouse | SUPER_ADMIN |

---

## Quick Examples

### Create Warehouse
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

### Get Warehouse List
```bash
curl -X GET "http://localhost:5000/api/warehouses?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get Warehouse by ID
```bash
curl -X GET http://localhost:5000/api/warehouses/cuid123abc \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Update Warehouse
```bash
curl -X PUT http://localhost:5000/api/warehouses/cuid123abc \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "manager_name": "Jane Doe",
    "remarks": "Updated manager information"
  }'
```

### Delete/Deactivate Warehouse
```bash
curl -X DELETE http://localhost:5000/api/warehouses/cuid123abc \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Field Rules at a Glance

| Field | Required | Length | Pattern | Notes |
|-------|----------|--------|---------|-------|
| warehouse_code | Yes | 3-20 | [A-Z0-9_-] | Auto-uppercase, unique |
| warehouse_name | Yes | 2-150 | Any | Trimmed |
| address | Yes | 3-500 | Any | Trimmed |
| city | Yes | 2-100 | Any | Trimmed |
| manager_name | No | 2-100 | Any | Nullable, trimmed |
| remarks | No | 0-500 | Any | Nullable, trimmed |
| is_active | No | - | Boolean | Default: true |

---

## Common HTTP Status Codes

| Code | Meaning | Common Reasons |
|------|---------|----------------|
| 200 | OK | Successful GET/PUT/DELETE |
| 201 | Created | Successful POST |
| 400 | Bad Request | Validation errors, invalid params |
| 401 | Unauthorized | Missing/invalid token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Warehouse doesn't exist |
| 500 | Server Error | Internal server error |

---

## Query Parameters for List

**Endpoint:** `GET /api/warehouses`

```
?page=1              # Page number (default: 1)
&limit=10            # Items per page (default: 10, max: 100)
&search=CHN          # Search warehouse name/code
&city=Chennai        # Filter by city
&is_active=true      # Filter by active status
```

**Example:**
```bash
GET /api/warehouses?page=1&limit=20&city=Chennai&is_active=true
```

---

## Response Structure

### Success Response
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Warehouses fetched successfully",
  "data": [
    { ... warehouse object ... }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 45,
    "totalPages": 5
  }
}
```

### Error Response
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

---

## Warehouse Object Structure

```json
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
}
```

---

## Common Validation Errors

| Error | Message | Solution |
|-------|---------|----------|
| warehouse_code format | "warehouse_code must be 3-20 chars [A-Z, 0-9, _, -]" | Use uppercase, digits, underscore, hyphen only |
| warehouse_code unique | "Warehouse code must be unique" | Choose a different warehouse code |
| warehouse_name length | "warehouse_name must be 2-150 characters" | Check name length |
| address length | "address must be 3-500 characters" | Provide valid address |
| city length | "city must be 2-100 characters" | Provide valid city name |
| Missing required field | "Field is required" | Include all required fields |

---

## Testing with Postman

1. **Import Collection:** `WAREHOUSE_API.postman_collection.json`
2. **Set Variables:**
   - `base_url`: http://localhost:5000
   - `authToken`: Your JWT token
   - `warehouse_id`: Will auto-populate from POST response
3. **Run Requests:** Use the collection to test all endpoints

---

## JavaScript/Node.js Example

```javascript
const axios = require('axios');

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  headers: {
    'Authorization': `Bearer ${process.env.AUTH_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

// Create warehouse
async function createWarehouse() {
  const response = await api.post('/warehouses', {
    warehouse_code: 'WH-CHN-001',
    warehouse_name: 'Chennai Main Warehouse',
    address: '123 Industrial Park, Sriperambur',
    city: 'Chennai',
    manager_name: 'John Doe'
  });
  return response.data.data;
}

// Get all warehouses
async function listWarehouses(page = 1, limit = 10) {
  const response = await api.get('/warehouses', {
    params: { page, limit }
  });
  return response.data.data;
}

// Get warehouse by ID
async function getWarehouse(id) {
  const response = await api.get(`/warehouses/${id}`);
  return response.data.data;
}

// Update warehouse
async function updateWarehouse(id, updates) {
  const response = await api.put(`/warehouses/${id}`, updates);
  return response.data.data;
}

// Delete warehouse
async function deleteWarehouse(id) {
  const response = await api.delete(`/warehouses/${id}`);
  return response.data.data;
}
```

---

## Python Example

```python
import requests

BASE_URL = "http://localhost:5000/api"
AUTH_TOKEN = "YOUR_TOKEN"

headers = {
    "Authorization": f"Bearer {AUTH_TOKEN}",
    "Content-Type": "application/json"
}

# Create warehouse
def create_warehouse():
    url = f"{BASE_URL}/warehouses"
    data = {
        "warehouse_code": "WH-CHN-001",
        "warehouse_name": "Chennai Main Warehouse",
        "address": "123 Industrial Park, Sriperambur",
        "city": "Chennai",
        "manager_name": "John Doe"
    }
    response = requests.post(url, json=data, headers=headers)
    return response.json()

# List warehouses
def list_warehouses(page=1, limit=10):
    url = f"{BASE_URL}/warehouses"
    params = {"page": page, "limit": limit}
    response = requests.get(url, params=params, headers=headers)
    return response.json()

# Get warehouse
def get_warehouse(warehouse_id):
    url = f"{BASE_URL}/warehouses/{warehouse_id}"
    response = requests.get(url, headers=headers)
    return response.json()

# Update warehouse
def update_warehouse(warehouse_id, updates):
    url = f"{BASE_URL}/warehouses/{warehouse_id}"
    response = requests.put(url, json=updates, headers=headers)
    return response.json()

# Delete warehouse
def delete_warehouse(warehouse_id):
    url = f"{BASE_URL}/warehouses/{warehouse_id}"
    response = requests.delete(url, headers=headers)
    return response.json()
```

---

## Environment Setup

### Postman Environment Variables
```json
{
  "base_url": "http://localhost:5000",
  "authToken": "eyJhbGc...",
  "warehouse_id": ""
}
```

### .env File
```
API_BASE_URL=http://localhost:5000
API_TOKEN=your_jwt_token_here
```

---

## Related Files

- **Markdown Docs:** `WAREHOUSE_API_DOCS.md` - Full detailed documentation
- **Postman Collection:** `WAREHOUSE_API.postman_collection.json` - Import into Postman
- **Controller:** `src/controllers/warehouse/warehouse.controller.js`
- **Routes:** `src/routes/warehouse/warehouse.routes.js`
- **Validators:** `src/validators/warehouse/warehouse.validators.js`
- **Service:** `src/services/warehouse/warehouse.service.js`

---

## Support

For full details, refer to `WAREHOUSE_API_DOCS.md` in this docs folder.
