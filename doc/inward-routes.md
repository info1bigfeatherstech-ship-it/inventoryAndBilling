# Inward Routes

**Base path:** `/api/v1/inwards`  
**Source:** `src/routes/inward/inward.routes.js`

Warehouse-scoped goods receipt scheduling and mapping flow.

## Roles

All routes: `SUPER_ADMIN`, `WH_MANAGER`, `WH_STOCK_LISTER`

## Status flow

```
SCHEDULED → ARRIVED → MAPPED
              ↘ CANCELLED
```

| Status | Meaning |
|--------|---------|
| `SCHEDULED` | Expected delivery scheduled |
| `ARRIVED` | Goods received; items can be added |
| `MAPPED` | All lines mapped to products |
| `CANCELLED` | Closed |

## Data isolation

- Non-admin list/detail filtered by `user.warehouseId`.
- **POST `/`:** WH staff — `warehouse_id` auto-set from login (cannot create for another WH).

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Schedule inward |
| GET | `/` | List inwards |
| GET | `/:inwardId` | Detail + items |
| PATCH | `/:inwardId/arrival-details` | Mark arrived + invoice/challan |
| POST | `/:inwardId/items` | Add line (ARRIVED only) |
| PUT | `/:inwardId/items/:inwardItemId` | Update line |
| DELETE | `/:inwardId/items/:inwardItemId` | Remove line |
| PATCH | `/:inwardId/status` | e.g. MAPPED, CANCELLED |

## POST `/` — Schedule

```json
{
  "vendor_id": "<vendor_id>",
  "warehouse_id": "<only required for SUPER_ADMIN>",
  "expected_date": "2026-05-25T00:00:00.000Z",
  "remarks": "Optional"
}
```

Do **not** send items or arrival fields at schedule time.

## PATCH `/:inwardId/arrival-details`

```json
{
  "vendor_invoice_no": "INV-100",
  "challan_no": "CH-22",
  "transport_details": "Truck ABC",
  "remarks": "Received in good condition"
}
```

Sets status to `ARRIVED`.

## POST `/:inwardId/items`

```json
{
  "item_name": "Cotton Shirt Red",
  "variant_text": "Size M",
  "quantity_received": 100,
  "purchase_cost": 450,
  "mapped_product_id": "<optional product_id>",
  "room_zone": "A",
  "rack_shelf": "R1"
}
```

Mapped product must belong to **same warehouse** as inward.

## PATCH `/:inwardId/status` → MAPPED

All items must have `mapped_product_id` set.

## Errors

| Code | HTTP |
|------|------|
| `INWARD_NOT_FOUND` | 404 |
| `INWARD_ITEMS_UNMAPPED` | 409 |
| `PRODUCT_WAREHOUSE_MISMATCH` | 409 |
| `WAREHOUSE_FORBIDDEN` | 403 |
