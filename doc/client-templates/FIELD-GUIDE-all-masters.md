# Master Data — Field Guide (All Templates)

Har template ki poori field list. **Required** = client ko zaroor bharna hai.

---

## Software import type (summary)

| Templates | Bulk CSV in software? |
|-----------|----------------------|
| `01-bulk-products.csv` | ✅ Yes — **products only** |
| `02-bulk-warehouse-stock.csv` | ✅ Yes — **stock only** |
| `03` through `13` (all others) | ❌ No — **manual entry**; CSV = client data collection sheet |

---

## 03 — Vendor (`03-vendor.csv`)

**Entry:** Manual — Vendors tab (bulk import nahi)


| Field | Required | Format / Values |
|-------|----------|-----------------|
| company_name | Yes | 2–200 chars |
| phone | Yes | 10 digits |
| supply_city | Yes | Text |
| business_type | Yes | `RETAILER`, `WHOLESALER`, `IMPORTER`, `EXPORTER`, `DISTRIBUTOR` |
| city | Yes | Text |
| contact_person | No | Max 100 chars |
| whatsapp | No | 10 digits |
| email | No | Valid email |
| gst_number | No | 15-char GSTIN |
| vendor_type | No | e.g. Primary, Secondary |
| address | No | Max 500 chars |
| remarks | No | Text |

---

## 04 — Warehouse (`04-warehouse.csv`)

**Entry:** Manual — Warehouses tab (bulk import nahi)


| Field | Required | Format / Values |
|-------|----------|-----------------|
| warehouse_code | Yes | `A-Z`, `0-9`, `_`, `-` only; 3–20 chars; e.g. `WH-MUM-01` |
| warehouse_name | Yes | 2–150 chars |
| address | Yes | 3–500 chars |
| city | Yes | 2–100 chars |
| manager_name | No | 2–100 chars |
| remarks | No | Text |

---

## 05 — Shop (`05-shop.csv`)

**Entry:** Manual — Settings → Shops (bulk import nahi)


| Field | Required | Format / Values |
|-------|----------|-----------------|
| shop_code | Yes | Uppercase A-Z, 0-9, `_`; 3–20 chars; e.g. `SHOP01` |
| shop_name | Yes | 2–100 chars |
| address | Yes | 2–300 chars |
| city | Yes | 2–50 chars |
| state_code | Yes | 2 digits — `27` (Maharashtra), `07` (Delhi), etc. |
| phone | Yes | 10 digits |
| pincode | No | 6 digits |
| email | No | Valid email |
| gst_number | No | 15-char GSTIN |
| sales_channels | No | Comma-separated: `WALK_IN`, `ONLINE`, `WHOLESALE`, `MHM`, `OWB`, `OTHER` |
| remarks | No | Text |

---

## 06 — Category (`06-category.csv`)

**Entry:** Manual — Categories tab (bulk import nahi)


| Field | Required | Format / Values |
|-------|----------|-----------------|
| name | Yes | 2–120 chars; unique naam |
| description | No | Max 500 chars |
| parent_category_name | No | Sub-category ke liye parent ka naam (pehle parent create karein) |
| remarks | No | Text |

---

## 07 — Inward Schedule (`07-inward-schedule.csv`)

**Software flow:** Warehouses → Inwards → Schedule

| Field | Required | Format / Values |
|-------|----------|-----------------|
| vendor_name | Yes | Pehle create kiya hua vendor naam |
| warehouse_code | Yes | Pehle create kiya hua warehouse code |
| expected_date | No | `YYYY-MM-DD` |
| remarks | No | Text |

---

## 08 — Inward Items (`08-inward-items.csv`)

**Kab bharo:** Jab inward status **ARRIVED** ho (maal warehouse pahunch gaya)

| Field | Required | Format / Values |
|-------|----------|-----------------|
| item_name | Yes | 2–200 chars — maal ka naam |
| quantity_received | Yes | Integer ≥ 1 |
| variant_text | No | Size/color text — mapping ke liye help |
| purchase_cost | No | Number > 0 |
| batch_number | No | Batch ID |
| room_zone | No | e.g. A, B |
| rack_shelf | No | e.g. Shelf-01 |
| remarks | No | Text |

**Baad mein:** Har line ko product/variant se **map** karna padta hai software mein. Map complete → Purchase auto-create.

---

## 09 — Inward Arrival (`09-inward-arrival.csv`)

**Kab bharo:** Jab truck/maal physically receive ho

| Field | Required | Format / Values |
|-------|----------|-----------------|
| inward_reference | Yes | Software inward number (reference ke liye) |
| vendor_invoice_no | Yes* | Vendor invoice number |
| challan_no | Yes* | Delivery challan |
| transport_details | Yes* | Courier / vehicle detail |
| remarks | No | Text |

\*Kam se kam ek detail zaroor bharein.

---

## 02 — Warehouse Stock Bulk (`02-bulk-warehouse-stock.csv`)

**Software path:** Inventory → Warehouse Stock → Bulk CSV (ya API)  
**Note:** Product pehle se exist karna chahiye (`01` bulk ke baad). Sirf stock rows create hoti hain.

| Field | Required | Format / Values |
|-------|----------|-----------------|
| variant_id | Yes* | System variant ID — agar barcode nahi hai |
| system_barcode | Yes* | Product `product_code` / barcode — *ek zaroor* |
| quantity | Yes | Integer ≥ 0 |
| room_zone | Yes | e.g. A, B, Cold |
| rack_shelf | Yes | e.g. Shelf-01, R3 |
| position | No | Top, Bottom, etc. |
| batch_number | No | Empty = non-batch stock |
| expiry_date | No | `YYYY-MM-DD` |
| low_stock_threshold | No | Integer |
| remarks | No | Text |

---

## 13 — Manual Stock (`13-inventory-stock-manual.csv`)

Same as bulk stock but `product_code_or_barcode` use karein jab `variant_id` client ko na pata ho.

---

## 10 — Customer (`10-customer.csv`)

**Software path:** Sales → Customers / Billing counter

| Field | Required | Format / Values |
|-------|----------|-----------------|
| mobile | Yes | 10 digits — unique |
| name | Yes | 2–100 chars |
| address | Yes | 2–500 chars |
| city | Yes | 2–100 chars |
| state_code | Yes | 2 digits |
| pincode | Yes | 6 digits |
| email | No | Valid email |
| gst_number | No | 15 chars (B2B) |
| credit_limit | No | Number ≥ 0 |
| remarks | No | Text |

---

## 11 — User / Team (`11-user-team.csv`)

| Field | Required | Format / Values |
|-------|----------|-----------------|
| name | Yes | 2–120 chars |
| phone | Yes | 10 digits — login ID |
| password | Yes | Min 8 chars; upper + lower + digit + special char |
| role | Yes | See table below |
| warehouse_code | Conditional | Required for `WH_MANAGER`, `WH_STOCK_LISTER` |
| shop_code | Conditional | Required for `SHOP_OWNER`, `BILLING_STAFF`, `SHOP_STOCK_LISTER` |
| remarks | No | Text |

### Roles

| Role | Kaun create kare | Kahan assign |
|------|------------------|--------------|
| SUPER_ADMIN | System only | Full access |
| WH_MANAGER | Super Admin | One warehouse |
| WH_STOCK_LISTER | WH Manager / Admin | One warehouse |
| SHOP_OWNER | Super Admin | One shop |
| BILLING_STAFF | Shop Owner | Same shop |
| SHOP_STOCK_LISTER | Shop Owner | Same shop |

---

## 12 — Bank Account (`12-bank-account.csv`)

**Software path:** Settings → Bank Details (per shop)

| Field | Required | Format / Values |
|-------|----------|-----------------|
| shop_code | Yes | Pehle create kiya hua shop |
| account_holder_name | Yes | Max 120 chars |
| bank_name | Yes | Max 120 chars |
| account_number | Yes | Bank account number |
| ifsc_code | Yes | Exactly 11 characters |
| upi_id | Yes | e.g. `name@bank` — billing UPI ke liye |
| branch_name | No | Max 120 chars |
| is_default | No | `YES` / `NO` |
| remarks | No | Text |

---

## Purchase — Koi template nahi

Purchase entry **automatic** banti hai jab:
1. Inward schedule → Arrived → Items add → **Map to products** → Status **MAPPED**

Client ko purchase CSV dene ki zaroorat nahi.

---

## Billing ke liye extra checklist

Client se confirm karein:

- [ ] Shop create ho chuka hai
- [ ] Products bulk upload ho chuke hain
- [ ] Shop mein stock hai (transfer / shop stock)
- [ ] Bank account + UPI (UPI payment ke liye)
- [ ] Staff codes (agar staff-wise billing chahiye)
- [ ] Customers (optional — walk-in bina customer ke bhi bill ho sakta hai)
