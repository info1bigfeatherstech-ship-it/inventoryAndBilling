# Warehouse Routes

**Base path:** `/api/v1/warehouses`  
**Source:** `src/routes/warehouse/warehouse.routes.js`

## Roles

| Action | Roles |
|--------|--------|
| List / Get / Peer stock | `SUPER_ADMIN`, `WH_MANAGER`, `WH_STOCK_LISTER` |
| Create / Update / Delete | `SUPER_ADMIN` only |

## Data isolation

- **SUPER_ADMIN:** sees all warehouses.
- **WH_MANAGER / WH_STOCK_LISTER:** `GET /` returns **only their assigned warehouse** (`user.warehouse_id`).
- **GET `/:warehouseId`:** allowed only for own warehouse (else 404).
- User must have `warehouse_id` set at creation (else `WAREHOUSE_NOT_ASSIGNED` on scoped routes).

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/peer-stock-summary` | Other warehouses — **quantity summary only** |
| GET | `/` | List warehouses (scoped) |
| GET | `/:warehouseId` | Warehouse detail |
| POST | `/` | Create warehouse (admin) |
| PUT | `/:warehouseId` | Update (admin) |
| DELETE | `/:warehouseId` | Soft deactivate (admin) |

## GET `/peer-stock-summary`

For cross-warehouse visibility (stock quantities only, no product names).

**Response `data` example:**
```json
[
  {
    "warehouse_id": "...",
    "warehouse_code": "WH-02",
    "warehouse_name": "Branch B",
    "city": "Mumbai",
    "stock_row_count": 120,
    "total_quantity": 4500
  }
]
```

## GET `/` — Query params

`page`, `limit`, `search`, `is_active`, `city`

## Frontend (WH Manager)

Prefer **`GET /auth/me`** or login `user.warehouse` for dashboard header.  
Optional: `GET /warehouses` (returns single row).

## Errors

| Code | HTTP |
|------|------|
| `WAREHOUSE_NOT_FOUND` | 404 |
| `WAREHOUSE_NOT_ASSIGNED` | 403 |
| `FORBIDDEN` | 403 |
