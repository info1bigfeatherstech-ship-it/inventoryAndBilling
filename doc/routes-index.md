# API Routes Index

Source: `src/routes/index.routes.js`

## Public (no auth)

| Method | Path | Doc |
|--------|------|-----|
| GET | `/health` | [health-routes.md](./health-routes.md) |
| GET | `/ready` | [health-routes.md](./health-routes.md) |
| GET | `/live` | [health-routes.md](./health-routes.md) |
| GET | `/api` | API info + endpoint list |
| GET | `/api/v1` | v1 ping |

## Version 1 (`/api/v1`)

| Prefix | Router file | Documentation |
|--------|-------------|---------------|
| `/auth` | `auth/auth.routes.js` | [auth-routes.md](./auth-routes.md) |
| `/vendors` | `vendor/vendor.routes.js` | [vendor-routes.md](./vendor-routes.md) |
| `/warehouses` | `warehouse/warehouse.routes.js` | [warehouse-routes.md](./warehouse-routes.md) |
| `/users` | `user/user.routes.js` | [user-routes.md](./user-routes.md) |
| `/inwards` | `inward/inward.routes.js` | [inward-routes.md](./inward-routes.md) |
| `/categories` | `category/category.routes.js` | [category-routes.md](./category-routes.md) |
| `/product-stocks` | `product/productStock.routes.js` | [product-stock-routes.md](./product-stock-routes.md) |
| `/products` | `product/product.routes.js` | [product-routes.md](./product-routes.md) |

**Note:** Register `/product-stocks` before `/products` in the app router so paths do not collide.

## Data scope rules

| Entity | Scope |
|--------|--------|
| Vendors | Global read; admin write |
| Categories | Global read; admin + WH_MANAGER write |
| Warehouses | WH staff: own warehouse only; admin: all |
| Products | Per `warehouse_id` on product |
| Stock | Per warehouse + variant |
| Inwards | Per warehouse |
