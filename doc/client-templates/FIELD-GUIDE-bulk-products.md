# Bulk Products CSV — Field Guide

**File:** `01-bulk-products.csv`  
**Software path:** Inventory → Bulk Upload  
**Format:** CSV only (Excel se Save As CSV)

---

## Is bulk se kya banta hai / kya NAHI

| ✅ Create hota hai | ❌ Create NAHI hota |
|-------------------|---------------------|
| Product (name se group) | Vendor |
| Product Variant (har row) | Category / Sub-category |
| Variant prices, HSN, GST | Warehouse stock / quantity |
| Images (agar ZIP di ho) | Warehouse, Shop, Customer |

**Vendor aur category CSV mein naam likhna zaroori hai** — lekin wo **pehle manually** software mein bane hone chahiye. Bulk sirf unse **link** karta hai.

**Stock ke liye alag file:** `02-bulk-warehouse-stock.csv` (product import ke **baad**).

---

## Required columns

| Column | Example | Rules |
|--------|---------|-------|
| `name` | Premium Cotton T-Shirt | Product name. Same name ki multiple rows = variants (size/color). |
| `product_code` | 6767-1 | Variant code. Format: `BASE-N` (e.g. 6767-1, 6767-2). |
| `vendor_name` | Apple India | Pehle software mein vendor create hona chahiye — naam exact match. |
| `category_name` | Electronics | Pehle category create honi chahiye — naam exact match. |
| `mrp` | 1299 | Number ≥ 0 |
| `special_price` | 999 | Selling price (billing default). `retail_price` alias bhi chalega. |
| `purchase_price` | 100 | Cost price. `purchase_cost` / `wholesale_price` alias bhi chalega. |
| `hsn_code` | 6109 | HSN code (product group ki pehli row se set hota hai) |

---

## Optional columns

| Column | Default | Notes |
|--------|---------|-------|
| `title` | — | Variant display title |
| `description` | — | Text |
| `brand_name` | Generic | Brand |
| `sub_category_name` | — | Parent category ke under sub-category naam |
| `expenses` | 0 | Extra cost per unit |
| `gst_percent` | 18 | e.g. 5, 12, 18 |
| `gst_type` | CGST_SGST | `CGST_SGST` ya `IGST` ya `EXEMPT` |
| `unit_of_measure` | PCS | PCS, KG, etc. |
| `weight`, `length`, `width`, `height` | — | Grams / cm (numbers) |
| `low_stock_threshold` | 10 | Low stock alert |
| `remarks` | — | Free text |

---

## NOT used (ignore)

| Column | Note |
|--------|------|
| `quantity` | Stock CSV se alag add karein (`02-bulk-warehouse-stock.csv`) |
| `online_price` | Ignored by system |

---

## Images ZIP (optional)

- Folder name = `product_code` (e.g. `6767-1/`)
- Max ~4 images per variant recommended
- JPG, PNG, WEBP

---

## Common errors

| Error | Fix |
|-------|-----|
| Vendor not found | Pehle **manually** Vendors tab se vendor create karein (`03-vendor.csv` = client data sheet, auto-import nahi) |
| Category not found | Pehle **manually** Categories se create karein (`06-category.csv` = client data sheet, auto-import nahi) |
| Invalid price | `special_price` ≤ `mrp` hona chahiye |
| Duplicate code | Har `product_code` unique hona chahiye |
