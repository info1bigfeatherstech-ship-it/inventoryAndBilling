# Product Stock Routes

**Base path:** `/api/v1/product-stocks`  
**Source:** `src/routes/product/productStock.routes.js`

Warehouse stock by **variant**, location (zone/rack), and batch.

## Roles

| Action | Roles |
|--------|--------|
| Read | `SUPER_ADMIN`, `WH_MANAGER`, `WH_STOCK_LISTER`, shop roles |
| Write | `SUPER_ADMIN`, `WH_MANAGER`, `WH_STOCK_LISTER` |

## Data isolation

- WH staff: only stock rows for their warehouse.
- SUPER_ADMIN: all warehouses.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List stock rows |
| POST | `/` | Create stock row |
| GET | `/:stockId` | Get by id |
| PUT | `/:stockId` | Update quantity/location/batch |
| DELETE | `/:stockId` | Delete row |
| POST | `/bulk/csv` | Bulk create from CSV |
| PATCH | `/bulk` | Bulk update |
| DELETE | `/bulk` | Bulk delete |

## POST `/`

```json
{
  "variant_id": "<variant_id>",
  "quantity": 50,
  "room_zone": "A",
  "rack_shelf": "R3",
  "position": "Top",
  "batch_number": "BATCH-2026-01",
  "expiry_date": "2027-01-01T00:00:00.000Z",
  "low_stock_threshold": 5
}
```

`warehouse_id` auto from user for WH staff.

**Unique:** `(variant_id, warehouse_id, batch_number)` — use `""` for non-batch aggregate.

## GET `/` — Query params

| Param | Notes |
|-------|-------|
| `variant_id` | Filter by variant |
| `product_id` | Filter by product |
| `batch_number` | |
| `search` | Zone, rack, barcode, product name |
| `warehouse_id` | Admin filter |

## POST `/bulk/csv`

Multipart field: `file`

Columns: `variant_id` **or** `system_barcode`, `quantity`, `room_zone`, `rack_shelf`, `position`, `batch_number`, `expiry_date`, `low_stock_threshold`, `remarks`

Super admin: pass `warehouse_id` in form or query.

## PATCH `/bulk`

```json
{
  "items": [
    { "stock_id": "...", "quantity": 40, "room_zone": "B" }
  ]
}
```

## Errors

| Code | HTTP |
|------|------|
| `STOCK_NOT_FOUND` | 404 |
| `VARIANT_WAREHOUSE_MISMATCH` | 409 |
| `INVALID_QUANTITY` | 400 |
