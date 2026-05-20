# Products API

**Base path:** `/api/v1/products`  
**Auth:** `Authorization: Bearer <accessToken>` on every route  
**Source:** `src/routes/product/product.routes.js`

This guide is for **frontend developers** and **QA testers**. It describes how warehouse products are listed, how variants work, and how to upload images.

---

## 1. Mental model (read this first)

```
Product (warehouse-scoped)
├── product_code     → base code only, e.g. "8878" (one per warehouse)
├── name, HSN, GST, category, vendor, …
└── Variants[]       → sellable SKUs
    ├── variant_code → "8878-1", "8878-2", … (auto serial)
    ├── system_barcode → 13-digit, auto-generated at listing
    ├── prices         → mrp, wholesale_price, retail_price, online_price (each variant owns these)
    ├── shipping       → weight, length, width, height (each variant owns these)
    ├── images[]       → up to 4 per variant (Cloudinary / R2)
    └── stock          → NOT on product create — use /product-stocks later
```

| Concept | Rule |
|---------|------|
| **Product vs variant** | Product = catalog header. Variant = what you scan, price, ship, and stock. |
| **Codes** | Never mix two bases on one product (no `8878` + `9978`). Add `8878-3` via add-variant. |
| **Prices** | Always on **variant**. With `variants[]`, every item must include `mrp`, `wholesale_price`, `retail_price`. |
| **Shipping** | Always on **variant** (for ecomm sync). With `variants[]`, every item needs `weight`, `length`, `width`, `height`. |
| **Images** | Always on **variant** (max 4). Not on product root. |
| **Stock** | After label is printed: `POST /api/v1/product-stocks`. Sending `stock` on create → `STOCK_NOT_ALLOWED_ON_LISTING`. |

### Recommended UI flow

1. User fills product form + variant rows (prices, size/color, photos).
2. **Create** → `POST /products` (JSON or multipart with images).
3. Print **system_barcode** from response.
4. Affix label on physical unit.
5. **Stock in** → `POST /product-stocks` with `variant_id`, location, quantity.

---

## 2. Who can do what

| Action | Roles |
|--------|--------|
| List / get product | `SUPER_ADMIN`, `WH_MANAGER`, `WH_STOCK_LISTER`, `SHOP_OWNER`, `SHOP_STOCK_LISTER`, `BILLING_STAFF` |
| Create / update / delete product & variants | `SUPER_ADMIN`, `WH_MANAGER`, `WH_STOCK_LISTER` |

**Warehouse scope**

- Warehouse staff only see and edit products where `product.warehouse_id` = their warehouse (from login `/me`).
- `SUPER_ADMIN` sees all; list supports `?warehouse_id=` filter.

**Categories**

- Products need a `category_id` from `GET /api/v1/categories`.
- **Only `SUPER_ADMIN` can create categories** — warehouse users pick from existing list. See [category-routes.md](./category-routes.md).

---

## 3. Endpoints quick reference

| Method | Path | Content-Type | Purpose |
|--------|------|--------------|---------|
| GET | `/` | — | List products (paginated) |
| GET | `/:productId` | — | Full detail + all variants |
| POST | `/` | `application/json` **or** `multipart/form-data` | Create product + variant(s) + optional images |
| PATCH / PUT | `/:productId` | JSON | Update product-level fields only |
| DELETE | `/:productId` | — | Soft-delete product + variants |
| POST | `/:productId/variants` | JSON or multipart | Add next variant (`8878-N`) |
| PATCH / PUT | `/:productId/variants/:variantId` | JSON | Update one variant |
| POST | `/:productId/variants/:variantId/images` | multipart | Append images (field `images`) |
| PUT | `/:productId/variants/:variantId/images` | multipart | Replace/sync images |
| POST | `/bulk/csv` | multipart (`file`) | Bulk create from CSV |
| PATCH | `/bulk` | JSON | Bulk update |
| DELETE | `/bulk` | JSON | Bulk soft-delete |

Related: [product-stock-routes.md](./product-stock-routes.md), [media-and-env.md](./media-and-env.md).

---

## 4. Create product — JSON (no images in same request)

**`POST /api/v1/products`**  
**Content-Type:** `application/json`

### 4a. Single variant (most common)

Prices and shipping on the **root body** → stored on auto-created variant `8878-1`.

| Field | Required | Notes |
|-------|----------|--------|
| `product_code` | Yes | Base only, e.g. `8878` (not `8878-1`) |
| `name` | Yes | |
| `primary_vendor_id` | Yes | From vendors API |
| `category_id` | Yes | From categories API (admin-created) |
| `hsn_code` | Yes | |
| `gst_percent` | Yes | 0–100 |
| `gst_type` | Yes | `CGST_SGST` \| `IGST` \| `EXEMPT` |
| `unit_of_measure` | Yes | e.g. `PCS` |
| `mrp`, `wholesale_price`, `retail_price` | Yes | |
| `online_price`, `purchase_cost` | No | |
| `weight`, `length`, `width`, `height` | No* | Recommended for ecomm; required if you use `variants[]` |
| `warehouse_id` | No | WH staff: ignored (uses their warehouse). Admin: optional |
| `sub_category_id`, `description`, `title`, `brand_name`, `remarks` | No | |
| `system_barcode` | No | Auto 13-digit if omitted |

```json
{
  "product_code": "8878",
  "name": "Cotton Shirt",
  "primary_vendor_id": "clxxx_vendor",
  "category_id": "clxxx_category",
  "hsn_code": "6109",
  "gst_percent": 12,
  "gst_type": "CGST_SGST",
  "unit_of_measure": "PCS",
  "mrp": 999,
  "wholesale_price": 700,
  "retail_price": 850,
  "online_price": 799,
  "weight": 0.25,
  "length": 30,
  "width": 20,
  "height": 5
}
```

**Expected:** `201`, body includes `variants[0].variant_code` = `8878-1`, `system_barcode`, prices, `shipping` object.

### 4b. Multiple variants

Omit root-level prices/shipping. Send **`variants` array** — each object must have its **own** prices and dimensions.

```json
{
  "product_code": "7834",
  "name": "Shirt",
  "primary_vendor_id": "clxxx_vendor",
  "category_id": "clxxx_category",
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
      "online_price": 799,
      "weight": 0.25,
      "length": 30,
      "width": 20,
      "height": 5
    },
    {
      "attributes": [{ "key": "Color", "value": "Blue" }],
      "mrp": 1099,
      "wholesale_price": 800,
      "retail_price": 949,
      "online_price": 899,
      "weight": 0.28,
      "length": 32,
      "width": 22,
      "height": 6
    }
  ]
}
```

**Expected:** variants `7834-1`, `7834-2`, each with distinct prices and `shipping`.

---

## 5. Create product — multipart (product + variant images)

**`POST /api/v1/products`**  
**Content-Type:** `multipart/form-data`  
Use this when the React form already has image files selected.

### Form fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `data` | string | **Yes** | `JSON.stringify(...)` of the same payload as JSON create (sections 4a / 4b) |
| `variant_images_0` | file × 1–4 | No | Images for variant at index `0` (first in `variants[]`, or sole variant) |
| `variant_images_1` | file × 1–4 | No | Images for variant index `1` |
| `variant_images_N` | file × 1–4 | No | `N` must be `0 … variants.length - 1` |
| `images` | file × 1–4 | No | Alias for `variant_images_0` (single-variant forms) |

**File rules:** JPEG, PNG, WebP, GIF; max **5MB** each; max **4 images per variant**.

### React example

```javascript
const payload = {
  product_code: '8878',
  name: 'Shirt',
  primary_vendor_id: vendorId,
  category_id: categoryId,
  hsn_code: '6109',
  gst_percent: 12,
  gst_type: 'CGST_SGST',
  unit_of_measure: 'PCS',
  variants: [
    {
      attributes: [{ key: 'Color', value: 'Red' }],
      mrp: 999, wholesale_price: 700, retail_price: 850,
      weight: 0.2, length: 28, width: 18, height: 4,
    },
    {
      attributes: [{ key: 'Color', value: 'Blue' }],
      mrp: 1099, wholesale_price: 800, retail_price: 949,
      weight: 0.28, length: 32, width: 22, height: 6,
    },
  ],
};

const form = new FormData();
form.append('data', JSON.stringify(payload));
redFiles.forEach((f) => form.append('variant_images_0', f));
blueFiles.forEach((f) => form.append('variant_images_1', f));

const res = await fetch(`${API}/products`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: form,
});
```

**Do not** set `Content-Type: application/json` manually when using `FormData`.

### Alternative: images after create

1. `POST /products` with JSON (no files).
2. For each variant in the response, `POST /products/:productId/variants/:variantId/images` with field **`images`** (1–4 files).

---

## 6. Add variant to existing product

**`POST /api/v1/products/:productId/variants`**

- Next code is automatic: if product is `8878` with `8878-1`, `8878-2`, new one is `8878-3`.
- **Required on body:** `mrp`, `wholesale_price`, `retail_price`, `weight`, `length`, `width`, `height`.
- Images: same multipart pattern (`data` + `variant_images_0` or `images`).

---

## 7. Update product vs variant

| Endpoint | Updates |
|----------|---------|
| `PATCH /products/:productId` | Product name, category, GST, **default** prices on product row, etc. |
| `PATCH /products/:productId/variants/:variantId` | That variant’s barcode, prices, shipping, attributes |

**Cascade prices to all variants (optional):**

```json
PATCH /products/:productId
{
  "mrp": 1050,
  "wholesale_price": 720,
  "apply_prices_to_variants": true
}
```

Without `apply_prices_to_variants`, only the product row defaults change; existing variant prices stay as-is.

**Immutable after create:** `variant_code`, `product_code` on variant.

---

## 8. Variant images (manage later)

### Append

`POST /products/:productId/variants/:variantId/images`  
multipart, field **`images`** (1–4 files). Total per variant ≤ 4.

### Sync (replace set)

`PUT /products/:productId/variants/:variantId/images`

| Field | Description |
|-------|-------------|
| `keep_image_ids` | JSON array or comma-separated IDs to keep (order preserved) |
| `images` | New files to append after kept ones |

Removed images are deleted from DB and cloud storage.

---

## 9. List & detail responses

### List `GET /products?page=1&limit=50`

Query: `search`, `is_active`, `category_id`, `primary_vendor_id`, `warehouse_id` (admin).

Each product includes:

- `variant_count`, `is_single_variant`, `primary_variant`
- `variants[]` (active only on list): prices, `shipping`, first image thumbnail

### Detail `GET /products/:productId`

Full variant list with all `images[]`, optional `stocks[]` summary.

### Variant `shipping` shape (ecomm-friendly)

```json
{
  "variant_code": "8878-1",
  "weight": 0.25,
  "length": 30,
  "width": 20,
  "height": 5,
  "shipping": {
    "weight": 0.25,
    "dimensions": { "length": 30, "width": 20, "height": 5 }
  },
  "images": [
    { "image_id": "...", "url": "https://...", "sort_order": 0 }
  ]
}
```

---

## 10. QA test checklist

| # | Test | Expect |
|---|------|--------|
| 1 | WH_MANAGER creates product in own warehouse | `201`, `warehouse_id` = user’s warehouse |
| 2 | WH_MANAGER lists products | Only own warehouse |
| 3 | Create with duplicate `product_code` in same warehouse | `409` `PRODUCT_CODE_ALREADY_EXISTS` |
| 4 | Create with `variants[]` but missing price on variant 2 | `400` `VARIANT_PRICES_REQUIRED` |
| 5 | Create with `variants[]` but missing `weight` on variant 1 | `400` validation / `VARIANT_SHIPPING_REQUIRED` |
| 6 | Multipart create with `variant_images_0` + `variant_images_1` | Each variant has correct image count in GET detail |
| 7 | Multipart with `variant_images_5` but only 2 variants | `400` `INVALID_VARIANT_IMAGE_INDEX` |
| 8 | POST create with `stock` or `initial_stock` | `400` `STOCK_NOT_ALLOWED_ON_LISTING` |
| 9 | Add variant to existing product | New `variant_code` serial; own prices/shipping required |
| 10 | Upload 5 images to one variant | `400` `MAX_VARIANT_IMAGES_EXCEEDED` |
| 11 | WH_MANAGER tries `POST /categories` | `403` forbidden (admin only) |
| 12 | Product create with `category_id` from `GET /categories` | `201` |

---

## 11. Error codes

| Code | HTTP | Meaning |
|------|------|---------|
| `PRODUCT_NOT_FOUND` | 404 | |
| `PRODUCT_CODE_ALREADY_EXISTS` | 409 | Duplicate base code in warehouse |
| `VARIANT_NOT_FOUND` | 404 | |
| `VARIANT_BASE_CODE_MISMATCH` | 400 | Wrong base in variant sku/code |
| `VARIANT_PRICES_REQUIRED` | 400 | Missing price on a variant in `variants[]` |
| `VARIANT_SHIPPING_REQUIRED` | 400 | Missing weight/dimensions on a variant |
| `STOCK_NOT_ALLOWED_ON_LISTING` | 400 | Use product-stocks API |
| `VARIANT_CODE_IMMUTABLE` | 400 | |
| `MAX_VARIANT_IMAGES_EXCEEDED` | 400 | More than 4 images per variant |
| `INVALID_VARIANT_IMAGE_INDEX` | 400 | `variant_images_N` out of range |
| `INVALID_PRODUCT_DATA_JSON` | 400 | Invalid `data` field in multipart |
| `IMAGE_REQUIRED` | 400 | Append images with empty files |
| `DUPLICATE_BARCODE` | 409 | Same `system_barcode` twice in request |
| `CLOUDINARY_AUTH_FAILED` | 502 | Wrong Cloudinary secret/key — fix `.env` |
| `CLOUDINARY_UPLOAD_FAILED` | 502 | Other Cloudinary upload error |
| `CLOUDINARY_MISCONFIGURED` | 503 | Missing Cloudinary env vars |
| `VALIDATION_ERROR` | 400 | See `details.fields` |
| `CATEGORY_NOT_FOUND` / `CATEGORY_INACTIVE` | 404 / 400 | Bad `category_id` |

---

## 12. Related docs

- [category-routes.md](./category-routes.md) — global categories (admin create only)
- [product-stock-routes.md](./product-stock-routes.md) — stock after labeling
- [vendor-routes.md](./vendor-routes.md) — `primary_vendor_id`
- [media-and-env.md](./media-and-env.md) — `MEDIA_PROVIDER`, Cloudinary, R2
