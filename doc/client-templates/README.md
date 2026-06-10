# Client Data Templates — Vyapar ERP

Yeh folder aapke client ko de sakte ho. Isme har feature ke liye **alag template** hai — client ko pata chalega software mein data daalne se pehle unhe kya-kya ready karna hai.

---

## ⚠️ Important — Bulk se sirf PRODUCT banate hain

Software mein **CSV bulk import** se abhi **sirf ye 2 cheezein** create hoti hain:

| Bulk CSV | Kya banta hai |
|----------|----------------|
| `01-bulk-products.csv` | **Product + Variant only** (images ZIP optional) |
| `02-bulk-warehouse-stock.csv` | **Warehouse stock only** (product pehle se hona chahiye) |

**Bulk product CSV se NAHI banta:** vendor, category, warehouse, shop, stock quantity, customer, user, bank.

- CSV mein `vendor_name` / `category_name` likhna padta hai — lekin wo **pehle software mein manually create** hone chahiye (exact naam match).
- `quantity` column product CSV mein **ignore** hoti hai — stock alag se (`02` ya inward).

Detail: [`BULK-vs-MANUAL.md`](./BULK-vs-MANUAL.md)

---

## Pehle kya banana hai? (Recommended order)

| Step | Kya banana hai | Template file |
|------|----------------|---------------|
| 1 | Warehouse | `04-warehouse.csv` |
| 2 | Shop | `05-shop.csv` |
| 3 | Category (+ sub-category) | `06-category.csv` |
| 4 | Vendor | `03-vendor.csv` |
| 5 | Products (bulk) | `01-bulk-products.csv` + optional images ZIP |
| 6 | Warehouse stock | `02-bulk-warehouse-stock.csv` **ya** Inward flow |
| 7 | Inward (agar vendor se maal aata hai) | `07-inward-schedule.csv`, `08-inward-items.csv`, `09-inward-arrival.csv` |
| 8 | Customer (billing ke liye) | `10-customer.csv` |
| 9 | Staff / Team login | `11-user-team.csv` |
| 10 | Shop bank / UPI (billing) | `12-bank-account.csv` |

**Note:** Purchase bill **automatic** banti hai jab Inward **MAPPED** hota hai — alag template nahi chahiye.

---

## File types

| Type | Use |
|------|-----|
| `.csv` | Excel / Google Sheets mein kholo, bharo, save as CSV UTF-8 |
| `FIELD-GUIDE-*.md` | Har column ki detail (required/optional, format) |

---

## Kaunsi file bulk hai vs manual?

| File | Client template | Software import |
|------|-----------------|-----------------|
| `01-bulk-products.csv` | ✅ | ✅ **Bulk** — products only |
| `02-bulk-warehouse-stock.csv` | ✅ | ✅ **Bulk** — stock only |
| `03` – `13` (baaki sab) | ✅ | ❌ **Manual entry** — template sirf data collect ke liye |

## Bulk upload rules (sirf 01 aur 02 ke liye)

- Sirf **CSV** supported (`.xlsx` direct upload nahi hota — Excel se **Save As CSV** karein)
- Pehli row = column headers (exact spelling, lowercase with underscore jaisa template mein hai)
- Extra spaces avoid karein; phone 10 digit; GST 15 character
- Product CSV (`01`): **vendor + category pehle manually create** — CSV sirf unke naam link karta hai, create nahi karta

---

## Product images (optional)

Bulk product upload ke sath **ZIP** attach kar sakte hain:

```
images.zip
├── 6767-1/          ← folder name = product_code
│   ├── front.jpg
│   └── back.jpg
├── 6767-2/
│   └── photo.jpg
```

Formats: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`

---

## Template index

| File | Purpose | Software |
|------|---------|----------|
| `01-bulk-products.csv` | Products + variants | **Bulk import** |
| `02-bulk-warehouse-stock.csv` | Warehouse quantity + location | **Bulk import** |
| `03-vendor.csv` | Vendor data collect | Manual — Vendors tab |
| `04-warehouse.csv` | Warehouse data collect | Manual — Warehouses tab |
| `05-shop.csv` | Shop data collect | Manual — Settings → Shops |
| `06-category.csv` | Category data collect | Manual — Categories tab |
| `07-inward-schedule.csv` | Inward schedule | Manual — Inwards flow |
| `08-inward-items.csv` | Inward line items | Manual — Inwards flow |
| `09-inward-arrival.csv` | Invoice / challan | Manual — Inwards flow |
| `10-customer.csv` | Customer data | Manual — Sales → Customers |
| `11-user-team.csv` | Staff login data | Manual — Users / Team |
| `12-bank-account.csv` | Bank + UPI data | Manual — Bank Details |
| `13-inventory-stock-manual.csv` | Stock reference / manual add | Manual ya use `02` bulk |
| `BULK-vs-MANUAL.md` | **Bulk vs manual clear guide** | — |
| `FIELD-GUIDE-bulk-products.md` | Product CSV column details | — |
| `FIELD-GUIDE-all-masters.md` | Manual masters field list | — |

---

## Client ko kaise dena hai

1. Poora `client-templates` folder ZIP karke bhejein  
2. Ya Google Drive par upload karein  
3. Client templates bhare → aap Super Admin se software mein import / manual entry karein  

**Support contact:** Apna implementation team contact yahan add karein.
