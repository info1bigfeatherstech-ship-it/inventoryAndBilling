# Category Routes

**Base path:** `/api/v1/categories`  
**Source:** `src/routes/category/category.routes.js`

Categories are **global** (all warehouses use the same category tree).

## Roles

| Action | Roles |
|--------|--------|
| List / Get | `SUPER_ADMIN`, `WH_MANAGER`, `WH_STOCK_LISTER`, `SHOP_OWNER`, `SHOP_STOCK_LISTER`, `BILLING_STAFF` |
| Create / Update / Delete | `SUPER_ADMIN`, `WH_MANAGER` |

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Paginated categories |
| GET | `/:categoryId` | Category + children |
| POST | `/` | Create category |
| PUT | `/:categoryId` | Update |
| DELETE | `/:categoryId` | Soft deactivate |

## GET `/` — Query params

| Param | Notes |
|-------|-------|
| `page`, `limit` | Pagination |
| `search` | Name / description |
| `is_active` | boolean |
| `parent_id` | Filter children |
| `roots_only` | boolean — top-level only |

## POST `/` — Body

```json
{
  "name": "Electronics",
  "description": "Optional",
  "parent_id": null
}
```

Single-level hierarchy: parent must be a root category.

## WH Manager use case

`GET /categories?is_active=true` for product create / inward UI.

## Errors

| Code | HTTP |
|------|------|
| `CATEGORY_NOT_FOUND` | 404 |
| `CATEGORY_HAS_ACTIVE_PRODUCTS` | 409 — cannot deactivate |
| `PARENT_MUST_BE_ROOT` | 400 |
