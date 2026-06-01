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
    ├── prices         → mrp, special_price, purchase_price, expenses, purchase_code (each variant owns these)
    ├── shipping       → weight, length, width, height (each variant owns these)
    ├── images[]       → up to 4 per variant (Cloudinary / R2)
    └── stock          → NOT on product create — use /product-stocks later
```

| Concept | Rule |
|---------|------|
| **Product vs variant** | Product = catalog header. Variant = what you scan, price, ship, and stock. |
| **Codes** | Never mix two bases on one product (no `8878` + `9978`). Add `8878-3` via add-variant. |
| **Prices** | Always on **variant**. With `variants[]`, every item must include `mrp`, `special_price`, `purchase_price`, `expenses`. Server computes `purchase_code = purchase_price + expenses + 1986`. |
| **Shipping** | Always on **variant** (for ecomm sync). With `variants[]`, every item needs `weight`, `length`, `width`, `height`. |
| **Images** | Always on **variant** (max 4). Not on product root. |
| **Stock** | **Only from inward receipt (MAPPED)** or manual `POST /product-stocks`. Product create/CSV does **not** add stock. `stock` / `initial_stock` on create → `STOCK_NOT_ALLOWED_ON_LISTING`. |

### Recommended UI flow

1. User fills product form + variant rows (prices, size/color, photos).
2. **Create** → `POST /products` (JSON or multipart with images) — **no stock**.
3. Print label from response: **product_code**, **name**, **purchase_code**, **special_price**, **mrp**, plus barcodes for `system_barcode` and `purchase_code`.
4. Affix label on physical unit.
5. **Stock in** → inward receipt: ARRIVED → map items → status **MAPPED** (stock auto-added), or manual `POST /product-stocks` for corrections.

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
| `mrp`, `special_price`, `purchase_price`, `expenses` | Yes | `purchase_code` is server-computed (do not send) |
| `purchase_cost` | No | Legacy alias for `purchase_price` |
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
  "special_price": 799,
  "purchase_price": 100,
  "expenses": 20,
  "weight": 0.25,
  "length": 30,
  "width": 20,
  "height": 5
}
```

**Expected:** `201`, body includes `variants[0].product_code` = `8878-1`, `system_barcode`, `purchase_code`, prices, `shipping` object.

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
      "special_price": 799,
      "purchase_price": 100,
      "expenses": 20,
      "weight": 0.25,
      "length": 30,
      "width": 20,
      "height": 5
    },
    {
      "attributes": [{ "key": "Color", "value": "Blue" }],
      "mrp": 1099,
      "special_price": 899,
      "purchase_price": 110,
      "expenses": 20,
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
      mrp: 999, special_price: 799, purchase_price: 100, expenses: 20,
      weight: 0.2, length: 28, width: 18, height: 4,
    },
    {
      attributes: [{ key: 'Color', value: 'Blue' }],
      mrp: 1099, special_price: 899, purchase_price: 110, expenses: 20,
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
- **Required on body:** `mrp`, `special_price`, `purchase_price`, `expenses`, `weight`, `length`, `width`, `height`.
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
  "special_price": 820,
  "purchase_price": 100,
  "expenses": 20,
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

## 10. Barcode / purchase code lookup (POS)

**`GET /api/v1/products/by-barcode/:code?shop_id=<optional>`**

Accepts **`system_barcode`** or numeric **`purchase_code`**. Returns **variant-level** prices:

```json
{
  "variant_id": "...",
  "product_code": "8878-1",
  "name": "Cotton Shirt",
  "mrp": 999,
  "special_price": 799,
  "purchase_price": 100,
  "expenses": 20,
  "purchase_code": 2106,
  "system_barcode": "21xxxxxxxxxxx",
  "stock_available": 5
}
```

Configure the purchase code offset via env: `PURCHASE_CODE_OFFSET=1986` (default).

---

## 11. QA test checklist

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

## 12. Error codes

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
| `PURCHASE_CODE_COLLISION` | 409 | Another variant already has this purchase code |
| `CLOUDINARY_AUTH_FAILED` | 502 | Wrong Cloudinary secret/key — fix `.env` |
| `CLOUDINARY_UPLOAD_FAILED` | 502 | Other Cloudinary upload error |
| `CLOUDINARY_MISCONFIGURED` | 503 | Missing Cloudinary env vars |
| `VALIDATION_ERROR` | 400 | See `details.fields` |
| `CATEGORY_NOT_FOUND` / `CATEGORY_INACTIVE` | 404 / 400 | Bad `category_id` |

---

## 13. Related docs

- [category-routes.md](./category-routes.md) — global categories (admin create only)
- [product-stock-routes.md](./product-stock-routes.md) — stock after labeling
- [vendor-routes.md](./vendor-routes.md) — `primary_vendor_id`
- [media-and-env.md](./media-and-env.md) — `MEDIA_PROVIDER`, Cloudinary, R2




//bulk upload 
Upload Products with Images (CSV + ZIP)
text
POST /api/v1/products/bulk/csv
Preview Only (Validate without saving)
text
POST /api/v1/products/bulk/csv?preview=true
📋 Headers
Header	Value	Required
Authorization	Bearer <access_token>	✅ Yes
Content-Type	multipart/form-data	✅ Yes (auto-set by browser)
📦 Request Body (FormData)
Field Name	Type	Required	Description
file	File	✅ Yes	CSV file with product data
imagesZip	File	❌ No	ZIP file containing product images
📁 CSV Format
Required Columns
Column	Type	Example	Description
name	String	Premium Cotton T-Shirt	Product name (groups variants)
product_code	String	6767-1	Variant code (BASE-N format)
mrp	Number	1299	Maximum retail price
special_price	Number	999	Special / offer selling price
purchase_price	Number	100	Net purchase cost (before expenses)
expenses	Number	20	Transport, labour, labelling, etc.
hsn_code	String	6109	HSN code for GST
gst_percent	Number	12	GST percentage
gst_type	String	CGST_SGST	CGST_SGST / IGST
unit_of_measure	String	PCS	Unit (PCS, KG, LTR, etc.)
Optional Columns

> **Stock:** Do not use a `quantity` column — inventory is added only when an inward receipt is **MAPPED**. Use [inward-routes.md](./inward-routes.md) or `POST /product-stocks` for manual adjustments.
Column	Type	Example	Description
title	String	Premium Cotton T-Shirt - White	SEO title (variant-specific)
description	String	100% combed cotton	Product description
brand_name	String	Apple	Brand (defaults to "Generic")
purchase_cost	Number	100	Legacy alias for purchase_price
weight	Number	200	Weight in grams (per unit)
length	Number	35	Length in cm (per unit)
width	Number	25	Width in cm (per unit)
height	Number	3	Height in cm (per unit)
vendor_name	String	Apple India	Vendor name (instead of vendor_id)
category_name	String	Electronics	Category name (instead of category_id)
sub_category_name	String	Mobile Accessories	Sub-category name
remarks	String	Summer collection	Internal notes
📁 ZIP File Structure
text
images.zip
│
├── 6767-1/                    ← Folder name = product_code from CSV
│   ├── front.jpg
│   ├── back.jpg
│   └── side.jpg
│
├── 6767-2/                    ← Another variant
│   └── image.jpg
│
├── 8765-1/                    ← Another product variant
│   ├── front.png
│   └── back.png
│
└── 1112-1/                    ← Single variant product
    └── product.jpg
Rules:

Folder name MUST EXACTLY MATCH product_code from CSV

Supported image formats: .jpg, .jpeg, .png, .gif, .webp

Max 10 images per variant

Missing folders = product created without images (warning in response)

📝 Sample CSV File
csv
name,title,product_code,vendor_name,category_name,mrp,special_price,purchase_price,expenses,hsn_code,gst_percent,gst_type,unit_of_measure,weight,length,width,height
Premium Cotton T-Shirt,Premium Cotton T-Shirt - White,6767-1,Apple India,Electronics,1299,999,100,20,6109,12,CGST_SGST,PCS,200,35,25,3
Premium Cotton T-Shirt,Premium Cotton T-Shirt - Black,6767-2,Apple India,Electronics,1299,999,100,20,6109,12,CGST_SGST,PCS,200,35,25,3
Slim Fit Jeans,Slim Fit Jeans - Light Blue,8765-1,Samsung India,Apparel,2499,1999,500,50,6204,18,CGST_SGST,PCS,600,45,35,12
Slim Fit Jeans,Slim Fit Jeans - Dark Blue,8765-2,Samsung India,Apparel,2499,1999,500,50,6204,18,CGST_SGST,PCS,600,45,35,12
Wireless Mouse,Wireless Bluetooth Mouse,1112-1,Local Supplier,Electronics,1499,1199,400,30,8471,12,CGST_SGST,PCS,150,12,8,4
📤 Response Format
Success Response (Final Upload)
json
{
  "success": true,
  "message": "Bulk product import completed",
  "data": {
    "created": 5,
    "failed": [],
    "warnings": [
      {
        "product": "Premium Cotton T-Shirt",
        "variants": ["6767-3"],
        "message": "Image folder(s) not found or empty for variants: 6767-3. Product created without images."
      }
    ]
  },
  "requestId": "abc123"
}
Preview Response (?preview=true)
json
{
  "success": true,
  "message": "Preview generated successfully",
  "data": {
    "preview": {
      "valid": 5,
      "invalid": 1,
      "rows": [
        {
          "name": "Premium Cotton T-Shirt",
          "variants_count": 3,
          "has_images": true,
          "vendor_id": "vendor_123",
          "category_id": "cat_456",
          "errors": []
        }
      ]
    },
    "failed": []
  },
  "requestId": "abc123"
}
Error Response
json
{
  "success": false,
  "message": "CSV file is required (field name: file)",
  "code": "CSV_FILE_REQUIRED",
  "requestId": "abc123"
}
🔄 Complete Flow (Recommended)
Step 1: Preview First (Validate)
javascript
const formData = new FormData();
formData.append('file', csvFile);
// No ZIP in preview

const response = await fetch('/api/v1/products/bulk/csv?preview=true', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const preview = await response.json();
if (preview.data.preview.valid === preview.data.preview.rows.length) {
  // All valid, proceed to Step 2
}
Step 2: Final Upload with Images
javascript
const formData = new FormData();
formData.append('file', csvFile);
formData.append('imagesZip', zipFile);  // Optional

const response = await fetch('/api/v1/products/bulk/csv', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const result = await response.json();
console.log(`Created: ${result.data.created}`);
console.log(`Failed: ${result.data.failed.length}`);
if (result.data.warnings) {
  console.warn('Warnings:', result.data.warnings);
}
⚠️ Important Rules for Frontend
Rule	Explanation
Same name = same product	All variants of a product must have identical name
product_code format	Must be BASE-N (e.g., 6767-1, 6767-2, 6767-3)
Sequence continuity	For multi-variant products, codes must be continuous: -1, -2, -3
Single variant	Can be -1 only (e.g., 1112-1)
Vendor name OR ID	Use vendor_name column (easier) or primary_vendor_id
Category name OR ID	Use category_name column (easier)
Images optional	Products created without images if ZIP missing or folder not found
Max images	10 images per variant
Batch processing	50 products per batch, 1 sec delay between batches
🧪 Postman Testing
Setup:
Method: POST

URL: http://localhost:3441/api/v1/products/bulk/csv

Headers: Authorization: Bearer <token>

Body: form-data

Form Data Fields:
Key	Type	Value
file	File	products.csv
imagesZip	File	images.zip
📞 Error Codes
Code	Description
CSV_FILE_REQUIRED	No CSV file uploaded
CSV_EMPTY	CSV file is empty
PRODUCT_CODE_REQUIRED	Missing product_code in CSV
VENDOR_NOT_FOUND	Vendor name/ID doesn't exist
CATEGORY_NOT_FOUND	Category name/ID doesn't exist
ROW_FAILED	Individual row failed (check message)
