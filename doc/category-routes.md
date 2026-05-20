# Categories API

**Base path:** `/api/v1/categories`  
**Auth:** `Authorization: Bearer <accessToken>`  
**Source:** `src/routes/category/category.routes.js`

Categories are **global** — all warehouses and shops share the same category tree. Products reference `category_id` (and optional `sub_category_id`).

---

## Roles

| Action | Roles |
|--------|--------|
| **List / Get** | `SUPER_ADMIN`, `WH_MANAGER`, `WH_STOCK_LISTER`, `SHOP_OWNER`, `SHOP_STOCK_LISTER`, `BILLING_STAFF` |
| **Create / Update / Delete** | **`SUPER_ADMIN` only** (platform admin) |

Warehouse managers and stock listers **cannot** create or edit categories. They use `GET /categories` when building product or inward forms.

If a non-admin calls `POST`, `PUT`, or `DELETE`, the API returns **403 Forbidden**.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Paginated list |
| GET | `/:categoryId` | One category (may include children) |
| POST | `/` | Create category — **admin only** |
| PUT | `/:categoryId` | Update — **admin only** |
| DELETE | `/:categoryId` | Soft deactivate — **admin only** |

---

## List — `GET /categories`

| Query | Type | Description |
|-------|------|-------------|
| `page` | int | Default 1 |
| `limit` | int | Default 50 |
| `search` | string | Name / description |
| `is_active` | boolean | Filter active |
| `parent_id` | string | Children of this parent |
| `roots_only` | boolean | Top-level categories only |

**Frontend / tester:** For product create dropdowns use:

```
GET /api/v1/categories?is_active=true&roots_only=true
```

Sub-categories: `GET /api/v1/categories?parent_id=<rootId>&is_active=true`

---

## Create — `POST /categories` (admin only)

```json
{
  "name": "Apparel",
  "description": "Optional",
  "parent_id": null
}
```

- `parent_id: null` → root category.
- Sub-category: set `parent_id` to a **root** category id (single-level hierarchy).

**Expected:** `201` with new `category_id`.

**QA:** Login as `WH_MANAGER` → `POST /categories` → must get **403**.

---

## Update / delete (admin only)

- `PUT /categories/:categoryId` — name, description, parent, active flag.
- `DELETE /categories/:categoryId` — soft deactivate; fails with `CATEGORY_HAS_ACTIVE_PRODUCTS` if products still linked.

---

## How categories connect to products

| Product field | Source |
|---------------|--------|
| `category_id` | Required on `POST /products` — must exist and be active |
| `sub_category_id` | Optional — child of `category_id` |

See [product-routes.md](./product-routes.md).

---

## Errors

| Code | HTTP |
|------|------|
| `CATEGORY_NOT_FOUND` | 404 |
| `CATEGORY_HAS_ACTIVE_PRODUCTS` | 409 |
| `PARENT_MUST_BE_ROOT` | 400 |
| `VALIDATION_ERROR` | 400 |
