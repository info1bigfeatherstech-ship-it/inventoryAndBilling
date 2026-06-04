# ERP Flow — Implementation Checklist

**Purpose:** Track gaps between “real ERP” expectations and the current inventory & billing codebase.  
**Last reviewed:** 2026-06-04  
**Related:** [stock-movement-routes.md](./stock-movement-routes.md), [inward-routes.md](./inward-routes.md)

---

## Current state (summary)

| Layer | Status |
|-------|--------|
| Stock movement types (`PURCHASE`, `WH_TO_SHOP`, `SALES`, `RETURN`, etc.) | Done |
| Vendor → WH via Inward → `PurchaseEntry` + `PURCHASE` ledger | Done |
| WH → Shop / WH → WH / Shop → Shop transfers | Done |
| Transfer request workflow (dispatch / in-transit / receive) | Done |
| Shop billing + `SALES` ledger + stock deduct | Done |
| Customer returns via credit note + `RETURN` ledger | Done |
| Vendor purchase returns via debit note + `PURCHASE_RETURN` ledger (WH only) | Done |
| Separate `ShopPurchaseEntry` / `WH_Sale` models | Not needed (by design) |

---

## Priority legend

| Priority | Meaning |
|----------|---------|
| **P0** | Blocks compliance, wrong stock, or daily ops |
| **P1** | Important for accounting / audit; should ship soon |
| **P2** | UX / clarity / ops efficiency |
| **P3** | Nice-to-have / polish |

---

## P0 — Correctness & compliance

- [x] **Purchase GST on inward completion**  
  - **Today:** `PurchaseEntry` created with `tax_amount: 0` in `inward.service.js` when status → `MAPPED`.  
  - **Need:** Compute CGST/SGST/IGST from vendor state, WH state, product `gst_percent` / `gst_type`; persist on `PurchaseEntry` and optionally line-level tax.  
  - **Touch:** `backend/src/services/inward/inward.service.js`, purchase validators, `PurchaseTab` / inward UI.  
  - **Done when:** Purchase summary shows non-zero tax where applicable; totals match vendor invoice.

- [ ] **Place of supply on bills (IGST vs CGST/SGST)**  
  - **Today:** `place_of_supply_state_code: null` on bill create in `billing.service.js`.  
  - **Need:** Set from customer `state_code` or shop state using `indianStateCodes.js`.  
  - **Touch:** `billing.service.js`, billing validators, `BillingTab` checkout.  
  - **Done when:** Intra-state vs inter-state tax split is correct on printed/PDF bill.

- [ ] **Document single source of truth for WH → Shop**  
  - **Today:** Two paths — instant `POST /stock/transfer/wh-to-shop` vs transfer-request (in-transit).  
  - **Need:** Team decision + docs: which path is default for production; deprecate or restrict the other if it causes double-counting confusion.  
  - **Touch:** `stockTransfer.service.js`, `transferRequest.service.js`, `transfersTabRegistry.js`, internal SOP.  
  - **Done when:** One documented primary flow; roles/UI aligned.

---

## P1 — Accounting & audit

- [ ] **Standalone purchase entry (optional)**  
  - **Today:** `GET /purchase-entries` only; records created only from inward `MAPPED`.  
  - **Need:** `POST /purchase-entries` for edge cases (vendor invoice without full inward workflow) OR explicit “no” in docs.  
  - **Touch:** `purchaseEntry.service.js`, routes, validators, `PurchaseTab`.  
  - **Done when:** Either API exists with same ledger rules as inward, or product doc states inward-only policy.

- [ ] **Purchase entry line items ↔ variants**  
  - **Today:** `PurchaseItem` links `product_id`, stock/ledger uses variant from mapped inward item.  
  - **Need:** Confirm reporting by variant/SKU; add `variant_id` on `PurchaseItem` if reports require it.  
  - **Touch:** `schema.prisma`, migration, inward mapping.  
  - **Done when:** Purchase detail report matches stock ledger by variant.

- [x] **Transfer document / challan reference**  
  - **Today:** `TransferRequest.request_number`, `tracking_number`; ledger `reference_type: TRANSFER_REQUEST`.  
  - **Need:** Printable transfer challan (no GST) with from/to, lines, qty, signatures; optional PDF.  
  - **Touch:** New template or endpoint, transfer request detail API, frontend print button.  
  - **Done when:** WH dispatch prints challan matching ledger entry.

- [x] **Inter-location cost transfer (WH → Shop)**  
  - **Today:** Variant `purchase_price` on master only; no cost snapshot on transfer.  
  - **Need:** Store landed cost at receive (WH purchase cost + expenses) and expose to shop margin reports.  
  - **Touch:** `StockLedger` optional cost fields or `TransferRequest` line cost, shop reporting.  
  - **Done when:** Shop can see cost vs sale price per variant after transfer.

- [x] **Vendor invoice uniqueness vs inward**  
  - **Today:** `vendor_invoice_no` unique on `PurchaseEntry`; inward may reuse flow.  
  - **Need:** Validate duplicate vendor invoice across inwards before `MAPPED`.  
  - **Touch:** `inward.service.js`, inward UI.  
  - **Done when:** Duplicate vendor invoice blocked with clear error.

---

## P2 — Operations & UX

- [ ] **Transfer History: filter by movement type**  
  - **Today:** `TransferHistoryTab` + ledger API support `movement_type`.  
  - **Need:** Default filters for shop staff (hide `PURCHASE`); WH sees WH-relevant types.  
  - **Done when:** Each role sees only relevant ledger rows without confusion.

- [ ] **Inward → Purchase UI clarity**  
  - **Today:** Inward tab + “Purchase Summary” (read-only).  
  - **Need:** Label copy: “GRN / Inward” vs “Purchase register”; link inward row → purchase entry.  
  - **Touch:** `InwardTab.jsx`, `PurchaseTab.jsx`.  
  - **Done when:** Users don’t search “shop purchase entry” in wrong screen.

- [ ] **Shop stock: show in-transit separately**  
  - **Today:** `quantity_in_transit` on `shop_stocks` (transfer request path).  
  - **Need:** Shop inventory UI shows Available / In transit / Reserved.  
  - **Touch:** shop stock API response, shop inventory components.  
  - **Done when:** Shop owner sees goods dispatched but not yet received.

- [ ] **Direct transfer UI (if kept)**  
  - **Today:** `WHToShopTab` commented out in `transfersTabRegistry.js`; API still exists.  
  - **Need:** Either enable for WH_MANAGER with warnings or remove API from public docs.  
  - **Done when:** UI matches chosen P0 policy.

- [ ] **Batch-aware dispatch (regression guard)**  
  - **Today:** Fixed for empty batch vs `batch1` stock (see transfer dispatch investigation).  
  - **Need:** Automated test: request with empty batch deducts FIFO/total WH stock.  
  - **Touch:** `transferRequest.service.js`, `warehouseStock.utils.js`, tests.  
  - **Done when:** Test fails if exact-batch-only bug returns.

---

## P3 — Polish & reporting

- [ ] **ERP terminology glossary (internal)**  
  - One-pager: Purchase = vendor→WH; Transfer In = WH→shop ledger; Sale = shop→customer only.  
  - Link from onboarding / `erp-implementation-checklist.md`.

- [ ] **Stock ledger export (CSV)**  
  - For auditors: date range, location, movement type.

- [ ] **SAP-style transaction code mapping (training)**  
  - MIGO/GRN → Inward MAPPED; Issue → WH_TO_SHOP dispatch; VF01 → Bill create.

- [ ] **Reorder / low-stock → auto transfer request**  
  - If `ReorderSuggestionsTab` is planned, wire to `transfer-requests` create.

---

## Movement matrix (reference — do not duplicate models)

| Flow | MovementType | Document | GST |
|------|----------------|----------|-----|
| Vendor → WH | `PURCHASE` | Purchase / inward | Yes |
| WH → Shop | `WH_TO_SHOP` | Transfer challan | No |
| WH → WH | `WH_TO_WH` | Transfer challan | No |
| Shop → Shop | `SHOP_TO_SHOP` | Transfer challan | No |
| Shop → Customer | `SALES` | GST bill | Yes |
| Customer → Shop | `RETURN` | Credit note | Yes |
| WH → Vendor (purchase return) | `PURCHASE_RETURN` | Debit note | Yes |
| Manual fix | `ADJUSTMENT` | Internal note | No |

**Do not build:** `ShopPurchaseEntry`, `WH_Sale` (customer sale at warehouse).

---

## Suggested sprint order

1. **P0:** Purchase GST + place of supply on bills + WH→Shop path decision  
2. **P1:** Transfer challan print + cost on transfer + vendor invoice duplicate check  
3. **P2:** Shop in-transit UI + ledger filters + inward/purchase labeling  
4. **P3:** Exports, glossary, training doc  

---

## Verification checklist (QA)

After each P0/P1 item, run:

- [ ] Inward `MAPPED` → WH `product_stocks` qty up, ledger `PURCHASE`, `PurchaseEntry` exists  
- [ ] Transfer request WH→Shop: dispatch → shop `in_transit` up; receive → `available` up, WH down  
- [ ] Bill create → shop `available` down, ledger `SALES`, GST totals correct  
- [ ] Credit note with restore → shop stock up, ledger `RETURN`  
- [ ] Debit note (DEFECTIVE) → WH stock down, ledger `PURCHASE_RETURN`; SHORTAGE → amount only, no stock  
- [ ] No ledger row with `SALES` from warehouse location  

---

## Notes for implementers

- **Stock truth:** `StockLedger` + location tables (`product_stocks`, `shop_stocks`) — not bill or purchase tables alone.  
- **Naming:** Use “Transfer” in UI for WH→Shop; reserve “Purchase” for vendor→WH.  
- **Ask mode analysis:** Full code review 2026-06-04; schema `MovementType` already complete for stock flows.
