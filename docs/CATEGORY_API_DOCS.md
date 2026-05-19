# Category API Documentation

## Overview
This document provides complete API documentation for Category CRUD operations in the Inventory & Billing System. Categories support a single-level hierarchy where categories can have sub-categories but sub-categories cannot have further children.

## Base URL
```
http://localhost:5000/api/categories
```

## Authentication
All endpoints require Bearer token authentication.

**Header:**
```
Authorization: Bearer {token}
```

## Role-Based Access Control

### Read Access (GET endpoints)
- `SUPER_ADMIN`
- `WH_MANAGER`
- `WH_STOCK_LISTER`
- `SHOP_OWNER`
- `SHOP_STOCK_LISTER`
- `BILLING_STAFF`

### Write Access (POST, PUT, DELETE endpoints)
- `SUPER_ADMIN`
- `WH_MANAGER`
- `WH_STOCK_LISTER`

## Category Model

### Schema Definition (Prisma)
```prisma
model Category {
  category_id   String  @id @default(cuid())
  name          String  @unique
  description   String?
  parent_id     String? @relation("ParentChild", fields: [parent_id], references: [category_id])
  parent        Category? @relation("ParentChild")
  children      Category[] @relation("ParentChild")
  is_active     Boolean @default(true)
  remarks       String?
  
  products      Product[] @relation("ProductCategory")
  sub_products  Product[] @relation("ProductSubCategory")
  
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt
  
  @@map("categories")
}
```

### Response Object
```json
{
  "category_id": "string (CUID)",
  "name": "string (2-120 chars)",
  "description": "string | null (max 500 chars)",
  "parent_id": "string | null",
  "parent": {
    "category_id": "string",
    "name": "string",
    "is_active": "boolean"
  },
  "is_active": "boolean",
  "remarks": "string | null (max 500 chars)",
  "created_at": "ISO 8601 datetime",
  "updated_at": "ISO 8601 datetime"
}
```

### Response Object (with nested data)
```json
{
  "category_id": "string (CUID)",
  "name": "string",
  "description": "string | null",
  "parent_id": "string | null",
  "parent": {
    "category_id": "string",
    "name": "string",
    "is_active": "boolean"
  },
  "children": [
    {
      "category_id": "string",
      "name": "string",
      "description": "string | null",
      "parent_id": "string",
      "is_active": "boolean",
      "remarks": "string | null",
      "created_at": "ISO 8601 datetime",
      "updated_at": "ISO 8601 datetime",
      "_count": {
        "products": "number",
        "sub_products": "number"
      }
    }
  ],
  "is_active": "boolean",
  "remarks": "string | null",
  "created_at": "ISO 8601 datetime",
  "updated_at": "ISO 8601 datetime",
  "_count": {
    "children": "number",
    "products": "number",
    "sub_products": "number"
  }
}
```

---

## API Endpoints

### 1. Create Category
Creates a new category record.

**Endpoint:**
```
POST /categories
```

**Authentication:** Required (WH_MANAGER, WH_STOCK_LISTER, SUPER_ADMIN)

**Request Body:**
```json
{
  "name": "Electronics",
  "description": "Electronic products and gadgets",
  "parent_id": null,
  "remarks": "Main category for all electronics"
}
```

**Field Validations:**
| Field | Type | Length | Required | Notes |
|-------|------|--------|----------|-------|
| name | string | 2-120 | Yes | Must be unique; spaces normalized to single spaces |
| description | string | max 500 | No | Nullable |
| parent_id | string | - | No | Must be a valid active root-level category ID; nullable |
| remarks | string | max 500 | No | Nullable |

**Response:** `201 Created`
```json
{
  "statusCode": 201,
  "message": "Category created successfully",
  "data": {
    "category_id": "cls1x2y3z4w5q6r7s8t9",
    "name": "Electronics",
    "description": "Electronic products and gadgets",
    "parent_id": null,
    "parent": null,
    "is_active": true,
    "remarks": "Main category for all electronics",
    "created_at": "2026-05-19T17:31:10.603+05:30",
    "updated_at": "2026-05-19T17:31:10.603+05:30",
    "_count": {
      "children": 0,
      "products": 0,
      "sub_products": 0
    }
  }
}
```

**Error Responses:**

| Status | Error Code | Message |
|--------|-----------|---------|
| 400 | CATEGORY_NAME_REQUIRED | Category name is required |
| 400 | PARENT_CATEGORY_NOT_FOUND | Parent category not found |
| 400 | PARENT_CATEGORY_INACTIVE | Parent category is inactive |
| 400 | PARENT_MUST_BE_ROOT | Only top-level categories can be used as parent |
| 409 | Unique constraint | Category name must be unique |

---

### 2. List Categories
Retrieves a paginated list of categories with filtering and search capabilities.

**Endpoint:**
```
GET /categories
```

**Authentication:** Required (Read roles)

**Query Parameters:**
| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| page | integer | 1 | - | Page number (min: 1) |
| limit | integer | 50 | 100 | Items per page |
| search | string | - | 200 | Search by name or description |
| is_active | boolean | - | - | Filter by active status |
| roots_only | boolean | - | - | Return only root categories (parent_id = null) |
| parent_id | string | - | - | Filter by parent category ID |

**Example Requests:**
```
GET /categories?page=1&limit=20&search=electronics&is_active=true
GET /categories?roots_only=true&limit=50
GET /categories?parent_id=cls1x2y3z4w5q6r7s8t9&page=1
```

**Response:** `200 OK`
```json
{
  "statusCode": 200,
  "message": "Categories fetched successfully",
  "data": [
    {
      "category_id": "cls1x2y3z4w5q6r7s8t9",
      "name": "Electronics",
      "description": "Electronic products and gadgets",
      "parent_id": null,
      "parent": null,
      "is_active": true,
      "remarks": "Main category for all electronics",
      "created_at": "2026-05-19T17:31:10.603+05:30",
      "updated_at": "2026-05-19T17:31:10.603+05:30",
      "_count": {
        "children": 2,
        "products": 5,
        "sub_products": 8
      }
    },
    {
      "category_id": "cls1a2b3c4d5e6f7g8h9",
      "name": "Furniture",
      "description": "Household and office furniture",
      "parent_id": null,
      "parent": null,
      "is_active": true,
      "remarks": null,
      "created_at": "2026-05-18T10:20:30.000+05:30",
      "updated_at": "2026-05-18T10:20:30.000+05:30",
      "_count": {
        "children": 0,
        "products": 3,
        "sub_products": 1
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 2,
    "totalPages": 1
  }
}
```

**Error Responses:**
| Status | Error Code | Message |
|--------|-----------|---------|
| 400 | INVALID_PARENT_ID | Parent category not found when filtering by parent_id |

---

### 3. Get Category by ID
Retrieves a specific category with all its sub-categories and associated metadata.

**Endpoint:**
```
GET /categories/:categoryId
```

**Authentication:** Required (Read roles)

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| categoryId | string | Yes | Category ID (CUID format) |

**Response:** `200 OK`
```json
{
  "statusCode": 200,
  "message": "Category fetched successfully",
  "data": {
    "category_id": "cls1x2y3z4w5q6r7s8t9",
    "name": "Electronics",
    "description": "Electronic products and gadgets",
    "parent_id": null,
    "parent": null,
    "is_active": true,
    "remarks": "Main category for all electronics",
    "children": [
      {
        "category_id": "cls2a3b4c5d6e7f8g9h0",
        "name": "Smartphones",
        "description": "Mobile phones and accessories",
        "parent_id": "cls1x2y3z4w5q6r7s8t9",
        "is_active": true,
        "remarks": null,
        "created_at": "2026-05-19T12:00:00.000+05:30",
        "updated_at": "2026-05-19T12:00:00.000+05:30",
        "_count": {
          "products": 10,
          "sub_products": 5
        }
      },
      {
        "category_id": "cls2x3y4z5w6q7r8s9t0",
        "name": "Laptops",
        "description": "Desktop and laptop computers",
        "parent_id": "cls1x2y3z4w5q6r7s8t9",
        "is_active": true,
        "remarks": null,
        "created_at": "2026-05-19T12:30:00.000+05:30",
        "updated_at": "2026-05-19T12:30:00.000+05:30",
        "_count": {
          "products": 8,
          "sub_products": 3
        }
      }
    ],
    "created_at": "2026-05-19T17:31:10.603+05:30",
    "updated_at": "2026-05-19T17:31:10.603+05:30",
    "_count": {
      "children": 2,
      "products": 5,
      "sub_products": 8
    }
  }
}
```

**Error Responses:**
| Status | Error Code | Message |
|--------|-----------|---------|
| 404 | CATEGORY_NOT_FOUND | Category not found |

---

### 4. Update Category
Updates an existing category's fields.

**Endpoint:**
```
PUT /categories/:categoryId
```

**Authentication:** Required (WH_MANAGER, WH_STOCK_LISTER, SUPER_ADMIN)

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| categoryId | string | Yes | Category ID to update |

**Request Body (all fields optional):**
```json
{
  "name": "Digital Electronics",
  "description": "Updated description for electronics",
  "parent_id": null,
  "is_active": true,
  "remarks": "Updated remarks"
}
```

**Field Validations:**
| Field | Type | Length | Rules |
|-------|------|--------|-------|
| name | string | 2-120 | Optional; must be unique if provided |
| description | string | max 500 | Optional; nullable |
| parent_id | string | - | Optional; must be valid active root-level category or null |
| is_active | boolean | - | Optional; deactivation checks for active children and products |
| remarks | string | max 500 | Optional; nullable |

**Response:** `200 OK`
```json
{
  "statusCode": 200,
  "message": "Category updated successfully",
  "data": {
    "category_id": "cls1x2y3z4w5q6r7s8t9",
    "name": "Digital Electronics",
    "description": "Updated description for electronics",
    "parent_id": null,
    "parent": null,
    "is_active": true,
    "remarks": "Updated remarks",
    "created_at": "2026-05-19T17:31:10.603+05:30",
    "updated_at": "2026-05-20T10:45:22.000+05:30",
    "_count": {
      "children": 2,
      "products": 5,
      "sub_products": 8
    }
  }
}
```

**Update Restrictions:**

1. **Assigning Parent (Hierarchy Rules)**
   - Can only assign active root-level categories as parents
   - Cannot assign the same category as its own parent
   - Categories with existing sub-categories cannot be moved under another parent

2. **Deactivation Restrictions**
   - Cannot deactivate a category if it has active sub-categories
   - Cannot deactivate a category if it has active products linked to it (as main or sub-category)

3. **Unique Name Constraint**
   - Category names must be unique across the system

**Error Responses:**
| Status | Error Code | Message |
|--------|-----------|---------|
| 400 | EMPTY_UPDATE | No updatable fields provided |
| 400 | CATEGORY_NOT_FOUND | Category not found |
| 400 | PARENT_CATEGORY_NOT_FOUND | Parent category not found |
| 400 | PARENT_CATEGORY_INACTIVE | Parent category is inactive |
| 400 | PARENT_MUST_BE_ROOT | Only top-level categories can be used as parent |
| 400 | INVALID_PARENT_CATEGORY | Category cannot be its own parent |
| 400 | CATEGORY_HAS_CHILDREN | Category with sub-categories cannot be moved under another parent |
| 409 | CATEGORY_HAS_ACTIVE_CHILDREN | Cannot deactivate category with active sub-categories |
| 409 | CATEGORY_HAS_ACTIVE_PRODUCTS | Cannot deactivate category linked to active products |
| 409 | Unique constraint | Category name must be unique |

---

### 5. Delete Category (Soft Delete)
Deactivates a category by setting `is_active` to false.

**Endpoint:**
```
DELETE /categories/:categoryId
```

**Authentication:** Required (WH_MANAGER, WH_STOCK_LISTER, SUPER_ADMIN)

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| categoryId | string | Yes | Category ID to deactivate |

**Response:** `200 OK`
```json
{
  "statusCode": 200,
  "message": "Category deactivated successfully",
  "data": {
    "category_id": "cls1x2y3z4w5q6r7s8t9",
    "is_active": false
  }
}
```

**Already Inactive Response:**
```json
{
  "statusCode": 200,
  "message": "Category already inactive",
  "data": {
    "category_id": "cls1x2y3z4w5q6r7s8t9",
    "is_active": false
  }
}
```

**Deactivation Restrictions:**
- Cannot deactivate a category if it has active sub-categories
- Cannot deactivate a category if it has active products linked to it

**Error Responses:**
| Status | Error Code | Message |
|--------|-----------|---------|
| 404 | CATEGORY_NOT_FOUND | Category not found |
| 409 | CATEGORY_HAS_ACTIVE_CHILDREN | Cannot deactivate category with active sub-categories |
| 409 | CATEGORY_HAS_ACTIVE_PRODUCTS | Cannot deactivate category linked to active products |

---

## Category Hierarchy Rules

### Single-Level Hierarchy
The category system enforces a single-level hierarchy:
- Root categories have `parent_id = null`
- Sub-categories have `parent_id` pointing to a root category
- Sub-categories cannot have their own children

### Key Constraints
1. **Parent Must Be Root**: Only root categories (where `parent_id = null`) can be parents
2. **No Circular References**: A category cannot be its own parent
3. **No Multi-Level Nesting**: Sub-categories cannot be parents themselves

### Practical Examples

**Valid Hierarchy:**
```
Electronics (root, parent_id: null)
├── Smartphones (sub, parent_id: Electronics_ID)
└── Laptops (sub, parent_id: Electronics_ID)
```

**Invalid - Multi-level Nesting:**
```
Electronics (root)
├── Smartphones (sub)
│   └── iPhones (NOT ALLOWED - sub-categories cannot have children)
```

---

## Data Validation Rules

### Name Field
- **Length**: 2-120 characters
- **Uniqueness**: Must be globally unique
- **Normalization**: Multiple spaces normalized to single spaces
- **Required**: Yes
- **Example**: "Electronics", "Home & Garden"

### Description Field
- **Type**: String or Null
- **Max Length**: 500 characters
- **Required**: No
- **Example**: "All electronic products including phones, laptops, etc."

### Parent ID Field
- **Type**: String (CUID) or Null
- **Validation**: 
  - Must reference an existing category
  - Referenced category must be active
  - Referenced category must be root-level (parent_id = null)
- **Required**: No
- **Example**: "cls1x2y3z4w5q6r7s8t9"

### Remarks Field
- **Type**: String or Null
- **Max Length**: 500 characters
- **Required**: No
- **Example**: "Category for promotional items"

### Is Active Field
- **Type**: Boolean
- **Default**: true
- **Required**: No

---

## Error Handling

### Standard Error Response Format
```json
{
  "statusCode": 400,
  "message": "Error description",
  "errorCode": "ERROR_CODE",
  "errors": [
    {
      "field": "fieldName",
      "message": "Field validation error"
    }
  ]
}
```

### Common HTTP Status Codes
| Code | Meaning | Example Scenario |
|------|---------|------------------|
| 200 | OK | Successful GET, PUT, DELETE |
| 201 | Created | Successful POST (create) |
| 400 | Bad Request | Validation failure, invalid parent |
| 401 | Unauthorized | Missing/invalid token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Category/parent category doesn't exist |
| 409 | Conflict | Duplicate name, deactivation blocked |

---

## Request/Response Examples

### Example 1: Create Root Category
```bash
curl -X POST http://localhost:5000/api/categories \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Electronics",
    "description": "All electronic products",
    "parent_id": null,
    "remarks": "Primary electronics category"
  }'
```

**Response (201):**
```json
{
  "statusCode": 201,
  "message": "Category created successfully",
  "data": {
    "category_id": "cls1x2y3z4w5q6r7s8t9",
    "name": "Electronics",
    "description": "All electronic products",
    "parent_id": null,
    "parent": null,
    "is_active": true,
    "remarks": "Primary electronics category",
    "created_at": "2026-05-19T17:31:10.603+05:30",
    "updated_at": "2026-05-19T17:31:10.603+05:30",
    "_count": {
      "children": 0,
      "products": 0,
      "sub_products": 0
    }
  }
}
```

---

### Example 2: Create Sub-Category
```bash
curl -X POST http://localhost:5000/api/categories \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Smartphones",
    "description": "Mobile phones and accessories",
    "parent_id": "cls1x2y3z4w5q6r7s8t9"
  }'
```

**Response (201):**
```json
{
  "statusCode": 201,
  "message": "Category created successfully",
  "data": {
    "category_id": "cls2a3b4c5d6e7f8g9h0",
    "name": "Smartphones",
    "description": "Mobile phones and accessories",
    "parent_id": "cls1x2y3z4w5q6r7s8t9",
    "parent": {
      "category_id": "cls1x2y3z4w5q6r7s8t9",
      "name": "Electronics",
      "is_active": true
    },
    "is_active": true,
    "remarks": null,
    "created_at": "2026-05-19T18:00:00.000+05:30",
    "updated_at": "2026-05-19T18:00:00.000+05:30",
    "_count": {
      "children": 0,
      "products": 0,
      "sub_products": 0
    }
  }
}
```

---

### Example 3: List Root Categories with Pagination
```bash
curl -X GET "http://localhost:5000/api/categories?roots_only=true&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response (200):**
```json
{
  "statusCode": 200,
  "message": "Categories fetched successfully",
  "data": [
    {
      "category_id": "cls1x2y3z4w5q6r7s8t9",
      "name": "Electronics",
      "description": "All electronic products",
      "parent_id": null,
      "parent": null,
      "is_active": true,
      "remarks": "Primary electronics category",
      "created_at": "2026-05-19T17:31:10.603+05:30",
      "updated_at": "2026-05-19T17:31:10.603+05:30",
      "_count": {
        "children": 3,
        "products": 12,
        "sub_products": 25
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

---

### Example 4: Get Category with Sub-Categories
```bash
curl -X GET http://localhost:5000/api/categories/cls1x2y3z4w5q6r7s8t9 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response (200):**
```json
{
  "statusCode": 200,
  "message": "Category fetched successfully",
  "data": {
    "category_id": "cls1x2y3z4w5q6r7s8t9",
    "name": "Electronics",
    "description": "All electronic products",
    "parent_id": null,
    "parent": null,
    "is_active": true,
    "remarks": "Primary electronics category",
    "children": [
      {
        "category_id": "cls2a3b4c5d6e7f8g9h0",
        "name": "Smartphones",
        "description": "Mobile phones and accessories",
        "parent_id": "cls1x2y3z4w5q6r7s8t9",
        "is_active": true,
        "remarks": null,
        "created_at": "2026-05-19T18:00:00.000+05:30",
        "updated_at": "2026-05-19T18:00:00.000+05:30",
        "_count": {
          "products": 10,
          "sub_products": 5
        }
      },
      {
        "category_id": "cls2x3y4z5w6q7r8s9t0",
        "name": "Laptops",
        "description": "Laptop computers",
        "parent_id": "cls1x2y3z4w5q6r7s8t9",
        "is_active": true,
        "remarks": null,
        "created_at": "2026-05-19T18:05:00.000+05:30",
        "updated_at": "2026-05-19T18:05:00.000+05:30",
        "_count": {
          "products": 8,
          "sub_products": 3
        }
      }
    ],
    "created_at": "2026-05-19T17:31:10.603+05:30",
    "updated_at": "2026-05-19T17:31:10.603+05:30",
    "_count": {
      "children": 2,
      "products": 5,
      "sub_products": 8
    }
  }
}
```

---

### Example 5: Update Category
```bash
curl -X PUT http://localhost:5000/api/categories/cls1x2y3z4w5q6r7s8t9 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Digital Electronics",
    "description": "Updated: All digital electronic products"
  }'
```

**Response (200):**
```json
{
  "statusCode": 200,
  "message": "Category updated successfully",
  "data": {
    "category_id": "cls1x2y3z4w5q6r7s8t9",
    "name": "Digital Electronics",
    "description": "Updated: All digital electronic products",
    "parent_id": null,
    "parent": null,
    "is_active": true,
    "remarks": "Primary electronics category",
    "created_at": "2026-05-19T17:31:10.603+05:30",
    "updated_at": "2026-05-20T10:45:22.000+05:30",
    "_count": {
      "children": 2,
      "products": 5,
      "sub_products": 8
    }
  }
}
```

---

### Example 6: Deactivate Category (Delete)
```bash
curl -X DELETE http://localhost:5000/api/categories/cls2a3b4c5d6e7f8g9h0 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response (200):**
```json
{
  "statusCode": 200,
  "message": "Category deactivated successfully",
  "data": {
    "category_id": "cls2a3b4c5d6e7f8g9h0",
    "is_active": false
  }
}
```

---

### Example 7: Error - Deactivating Category with Active Children
```bash
curl -X DELETE http://localhost:5000/api/categories/cls1x2y3z4w5q6r7s8t9 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response (409 Conflict):**
```json
{
  "statusCode": 409,
  "message": "Cannot deactivate category with active sub-categories",
  "errorCode": "CATEGORY_HAS_ACTIVE_CHILDREN",
  "metadata": {
    "activeChildren": 2
  }
}
```

---

## API Usage Patterns

### Pattern 1: Building a Category Tree
```
1. GET /categories?roots_only=true
   → Get all root categories
2. For each root category:
   GET /categories/{categoryId}
   → Get category with nested children
```

### Pattern 2: Searching Categories
```
GET /categories?search=electronics&is_active=true&page=1&limit=20
```

### Pattern 3: Category Management Workflow
```
1. POST /categories - Create root category
2. POST /categories - Create sub-category with parent_id
3. GET /categories/{categoryId} - Verify hierarchy
4. PUT /categories/{categoryId} - Update details if needed
5. DELETE /categories/{categoryId} - Deactivate when needed
```

---

## Best Practices

1. **Always validate parent_id**: Ensure parent categories are root-level and active before assignment
2. **Plan deactivation**: Check for active sub-categories and products before deactivating
3. **Use pagination**: Always use page and limit parameters when listing large datasets
4. **Handle errors**: Implement proper error handling for 409 conflicts during deactivation
5. **Search optimization**: Use search query parameter instead of client-side filtering for large datasets
6. **Cache wisely**: Root categories change infrequently; consider caching with invalidation on updates
7. **Use roots_only flag**: When you only need root categories for UI dropdowns/selects

---

## Related Endpoints
- **Products API**: `/api/products` - Products are linked to categories
- **Warehouses API**: `/api/warehouses` - Independent from categories

---

## Support & Troubleshooting

### Common Issues

**Issue**: "Cannot deactivate category with active sub-categories"
- **Solution**: Deactivate or move all sub-categories first

**Issue**: "Parent category is inactive"
- **Solution**: Only active categories can be used as parents; activate parent first

**Issue**: "Only top-level categories can be used as parent"
- **Solution**: Sub-categories cannot have their own children; use root category as parent

**Issue**: Duplicate name error on create
- **Solution**: Category names are globally unique; verify name doesn't exist

---

## Version
- **API Version**: v1.0
- **Last Updated**: 2026-05-19
- **Documentation Format**: OpenAPI-compatible

