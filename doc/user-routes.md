# User Routes

**Base path:** `/api/v1/users`  
**Source:** `src/routes/user/user.routes.js`

## Roles

**All routes:** `SUPER_ADMIN` only

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Create user |
| GET | `/` | List users |
| GET | `/:userId` | User detail |
| PUT | `/:userId` | Update user |
| PATCH | `/:userId/status` | Activate / deactivate |
| POST | `/:userId/reset-password` | Admin reset password |

## POST `/` — Warehouse staff example

```json
{
  "name": "WH Manager One",
  "phone": "9876500001",
  "password": "SecurePass@123",
  "role": "WH_MANAGER",
  "warehouse_id": "<warehouse_id from admin>",
  "remarks": null
}
```

**Required:** `WH_MANAGER` and `WH_STOCK_LISTER` **must** include `warehouse_id`.  
Shop roles require `shop_id`.

## Role assignment rules

| Role | `warehouse_id` | `shop_id` |
|------|----------------|-----------|
| `SUPER_ADMIN` | must be null | must be null |
| `WH_MANAGER`, `WH_STOCK_LISTER` | required | must be null |
| `SHOP_OWNER`, etc. | must be null | required |

Only one active `WH_MANAGER` per warehouse.

## Errors

| Code | HTTP |
|------|------|
| `INVALID_ROLE_ASSIGNMENT` | 400 |
| `FORBIDDEN` | 403 |
