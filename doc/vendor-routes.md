# Vendor Routes

**Base path:** `/api/v1/vendors`  
**Source:** `src/routes/vendor/vendor.routes.js`

Vendors are **global master data** (all warehouses share the same vendor list).

## Roles

| Action | Roles |
|--------|--------|
| List / Get | `SUPER_ADMIN`, `WH_MANAGER`, `WH_STOCK_LISTER`, `SHOP_OWNER`, `SHOP_STOCK_LISTER`, `BILLING_STAFF` |
| Create / Update / Delete | `SUPER_ADMIN` only |

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Paginated vendor list |
| GET | `/:vendorId` | Vendor detail |
| POST | `/` | Create vendor (admin) |
| PUT | `/:vendorId` | Update vendor (admin) |
| DELETE | `/:vendorId` | Soft deactivate (admin) |

## GET `/` — Query params

| Param | Type | Notes |
|-------|------|-------|
| `page` | int | Default 1 |
| `limit` | int | Max 100 |
| `search` | string | Company name, phone, email |
| `is_active` | boolean | Filter active vendors |
| `city` | string | |
| `business_type` | enum | `RETAILER`, `WHOLESALER`, etc. |

**WH Manager use case:** `GET /vendors?is_active=true` for inward vendor dropdown.

## POST `/` — Create (admin)

Required fields include: `company_name`, `phone`, `supply_city`, `business_type`, `city`.

See validators: `src/validators/vendor/vendor.validators.js`

## Errors

| Code | HTTP |
|------|------|
| `FORBIDDEN` | 403 — non-admin write |
| `VENDOR_NOT_FOUND` | 404 |
