# Product Routes

**Base path:** `/api/v1/products`  
**Source:** `src/routes/product/product.routes.js`

Warehouse-scoped products with serial variant codes and four price channels.

## Product model (summary)

| Level | Fields |
|-------|--------|
| **Product** | One **base** `product_code` per product (e.g. `8878`) — never two bases on same product |
| **Variant** | `variant_code` = `8878-1`, `8878-2`, … auto **system_barcode** at listing |
| **Stock** | **Separate step** — `POST /product-stocks` after label is printed & affixed |

**Four prices (per variant):** `mrp` (walk-in), `wholesale_price`, `retail_price`, `online_price` (optional)

- **Single variant** (no `variants` array): set prices on the product body → stored on variant `BASE-1`.
- **Multiple variants:** set **all four prices on each object** in `variants[]` — they are not copied from each other.
- Product row keeps variant-1 prices as catalog defaults only.

### Industry flow

1. **List product** → master data + prices + **barcode generated** (print label)
2. **Affix label** on physical unit
3. **Record stock** → zone / rack / batch / quantity via product-stocks API

Do **not** send `initial_stock` or variant `stock` on product create — returns `STOCK_NOT_ALLOWED_ON_LISTING`.

## Roles

| Action | Roles |
|--------|--------|
| Read | `SUPER_ADMIN`, `WH_MANAGER`, `WH_STOCK_LISTER`, shop roles |
| Write | `SUPER_ADMIN`, `WH_MANAGER`, `WH_STOCK_LISTER` |

## Data isolation

- WH staff: only products for their `warehouse_id`.
- SUPER_ADMIN: all; optional `?warehouse_id=` filter on list.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List products (with variants + prices) |
| GET | `/:productId` | Detail (Redis cached) |
| POST | `/` | Create product + variant(s) |
| PATCH/PUT | `/:productId` | Update **product-level** fields only |
| DELETE | `/:productId` | Soft delete product + variants |
| POST | `/bulk/csv` | Bulk create (multipart `file`) |
| PATCH | `/bulk` | Bulk update |
| DELETE | `/bulk` | Bulk soft delete |
| POST | `/:productId/variants` | Add variant (next serial code) |
| PATCH/PUT | `/:productId/variants/:variantId` | Update variant |
| POST | `.../variants/:variantId/images` | Append images (max 4 total) |
| PUT | `.../variants/:variantId/images` | Sync images (keep + delete + new) |

## POST `/` — Single variant (common)

```json
{
  "product_code": "8878",
  "name": "Cotton Shirt",
  "mrp": 999,
  "wholesale_price": 700,
  "retail_price": 850,
  "online_price": 799,
  "primary_vendor_id": "...",
  "category_id": "...",
  "hsn_code": "6109",
  "gst_percent": 12,
  "gst_type": "CGST_SGST",
  "unit_of_measure": "PCS"
}
```

Creates variant **`8878-1`** with **auto-generated** `system_barcode` (13-digit). Optional: pass `system_barcode` to override.

Then: `POST /api/v1/product-stocks` with `variant_id`, `room_zone`, `rack_shelf`, `quantity`.

## POST `/` — Multiple variants (each with own prices)

```json
{
  "product_code": "7834",
  "name": "Shirt",
  "primary_vendor_id": "...",
  "category_id": "...",
  "hsn_code": "6109",
  "gst_percent": 12,
  "gst_type": "CGST_SGST",
  "unit_of_measure": "PCS",
  "variants": [
    {
      "attributes": [{ "key": "Color", "value": "Red" }],
      "mrp": 999,
      "wholesale_price": 700,
      "retail_price": 850,
      "online_price": 799
    },
    {
      "attributes": [{ "key": "Color", "value": "Blue" }],
      "mrp": 1099,
      "wholesale_price": 800,
      "retail_price": 949,
      "online_price": 899
    },
    {
      "attributes": [{ "key": "Color", "value": "Green" }],
      "mrp": 1049,
      "wholesale_price": 780,
      "retail_price": 999,
      "online_price": 879
    }
  ]
}
```

Creates `7834-1`, `7834-2`, `7834-3` — each variant stores **its own** four prices in the response.

## PATCH `/:productId` — Product prices

```json
{
  "mrp": 1050,
  "wholesale_price": 720,
  "apply_prices_to_variants": true
}
```

Without `apply_prices_to_variants`, only product defaults change.

## PUT variant images sync

`multipart/form-data`:

| Field | Description |
|-------|-------------|
| `keep_image_ids` | JSON array or comma-separated IDs to **keep** |
| `images` | New files (max 4 total after sync) |

Removed images are deleted from DB **and** cloud (Cloudinary / R2).

## List response meta

Each product includes: `variant_count`, `is_single_variant`, `primary_variant` (first variant).

## Errors

| Code | HTTP |
|------|------|
| `PRODUCT_NOT_FOUND` | 404 |
| `PRODUCT_CODE_ALREADY_EXISTS` | 409 — duplicate base in warehouse |
| `VARIANT_BASE_CODE_MISMATCH` | 400 — e.g. 8878 vs 9978 on same product |
| `VARIANT_PRICES_REQUIRED` | 400 — missing price on a variant in `variants[]` |
| `STOCK_NOT_ALLOWED_ON_LISTING` | 400 — use product-stocks |
| `VARIANT_CODE_IMMUTABLE` | 400 |
| `MAX_VARIANT_IMAGES_EXCEEDED` | 400 |
| `DUPLICATE_BARCODE` | 409 |

See also: [media-and-env.md](./media-and-env.md), [product-stock-routes.md](./product-stock-routes.md)
