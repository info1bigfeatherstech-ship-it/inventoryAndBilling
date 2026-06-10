# Client Setup Checklist (Printable)

Client naam: _______________________  
Date: _______________________

---

## Phase 1 — Master data (pehle ye) — **MANUAL entry, bulk nahi**

Client template bharega → aap software mein form se create karenge.

| # | Item | Template | Software | Done ☐ |
|---|------|----------|----------|--------|
| 1 | Warehouse | `04-warehouse.csv` | Manual | ☐ |
| 2 | Shop / outlet | `05-shop.csv` | Manual | ☐ |
| 3 | Categories | `06-category.csv` | Manual | ☐ |
| 4 | Vendors | `03-vendor.csv` | Manual | ☐ |

---

## Phase 2 — Products & stock

| # | Item | Template | Software | Done ☐ |
|---|------|----------|----------|--------|
| 5 | Products | `01-bulk-products.csv` + images ZIP | **Bulk — sirf product/variant** | ☐ |
| 6 | Warehouse stock | `02-bulk-warehouse-stock.csv` | **Bulk — sirf stock** | ☐ |
| **OR** | Inward + mapping | `07` + `08` + `09` | ☐ |
| 7 | Shop stock (transfer) | Software mein transfer request | ☐ |

---

## Phase 3 — Sales & operations

| # | Item | Template | Done ☐ |
|---|------|----------|--------|
| 8 | Customers | `10-customer.csv` | ☐ |
| 9 | Staff logins | `11-user-team.csv` | ☐ |
| 10 | Bank / UPI | `12-bank-account.csv` | ☐ |
| 11 | Billing test | 1 sample bill | ☐ |

---

## Client se ye documents maango

- [ ] GST certificate (agar GST billing)
- [ ] Shop address proof
- [ ] Bank cancelled cheque / UPI proof
- [ ] Product list Excel/CSV (hamara template use karein)
- [ ] Product photos folder (ZIP) — optional
- [ ] Vendor list with phone & GST

---

## Hamari team kya karegi

1. Templates check karegi (missing fields / wrong format)
2. Phase 1 master data **manually** software mein create karegi (vendor, category, warehouse, shop)
3. Phase 2: **sirf product** bulk CSV import (`01`) — phir **stock** bulk (`02`) ya inward
4. Shop transfer / stock verify karegi
5. 1 test billing + 1 test inward demo degi

**Yaad rahe:** Ek product CSV se sab kuch nahi banta — vendor/category pehle manual, stock alag bulk/inward.

---

**Folder location:** `backend/doc/client-templates/`
