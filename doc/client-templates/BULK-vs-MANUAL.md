# Bulk Upload vs Manual — Client ko ye zaroor samjhao

Software mein **sirf 2 cheezein** CSV se bulk import hoti hain. Baaki sab **alag-alag** process hai.

---

## Software mein ACTUAL bulk CSV import

| CSV file | Kya create hota hai | Kya NAHI hota |
|----------|---------------------|---------------|
| `01-bulk-products.csv` | **Sirf Product + Variant** (+ optional images ZIP) | ❌ Vendor create nahi<br>❌ Category create nahi<br>❌ Stock / quantity nahi<br>❌ Warehouse / Shop nahi |
| `02-bulk-warehouse-stock.csv` | **Sirf Warehouse stock rows** (quantity + location) | ❌ Product create nahi<br>❌ Product pehle se hona chahiye |

---

## Bulk product CSV — client confusion fix

CSV mein `vendor_name` aur `category_name` columns hain, lekin:

- Ye **naya vendor/category create nahi karte**
- Ye **pehle se software mein maujood** vendor/category ka naam likhna padta hai (exact match)
- Agar naam galat / missing → import **fail** ho jata hai

**Isliye pehle Phase 1 complete karo, phir product bulk.**

---

## Baaki templates — bulk import NAHI hai

Yeh files client se **data collect** karne ke liye hain. Aapki team software mein **ek-ek karke / form se** entry karegi:

| Template | Software mein entry kaise |
|----------|---------------------------|
| `03-vendor.csv` | Vendors tab → Add Vendor (manual) |
| `04-warehouse.csv` | Warehouses → Add (manual) |
| `05-shop.csv` | Settings → Shops → Add (manual) |
| `06-category.csv` | Categories → Add (manual) |
| `07–09` inward files | Inwards flow (manual steps) |
| `10-customer.csv` | Sales → Customers → Add (manual) |
| `11-user-team.csv` | Settings / Team → Add user (manual) |
| `12-bank-account.csv` | Settings → Bank Details (manual) |
| `13-inventory-stock-manual.csv` | Reference — ya `02` bulk stock CSV use karein |

> **Future:** Agar vendor/shop/warehouse ke liye bulk import banaya jaye to alag feature hoga. Abhi software mein nahi hai.

---

## Sahi order (implementation team)

```
1. Manual: Warehouse, Shop, Category, Vendor
2. Bulk CSV: Products only (01)
3. Bulk CSV: Warehouse stock (02)  OR  Inward → Map flow
4. Manual: Transfer to shop (shop stock)
5. Manual: Customers, Users, Bank
6. Test billing
```

---

## Client ko ek line mein

> **"Product ki bulk file se sirf product banenge. Vendor, category, stock, shop — pehle alag se setup hoga; uske baad hi product CSV chalegi."**
