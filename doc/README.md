# Vyaapar Backend — API Documentation

Route-level docs for the inventory & billing API. Use with [POSTMAN_COMPLETE_API_DOCS.md](../POSTMAN_COMPLETE_API_DOCS.md) for full Postman flows.

## Base URLs

| Environment | Base |
|-------------|------|
| Local | `http://localhost:3000` |
| API v1 | `http://localhost:3000/api/v1` |

## Authentication

All protected routes require:

```
Authorization: Bearer <accessToken>
```

Obtain token via `POST /api/v1/auth/login`. Refresh via cookie + `POST /api/v1/auth/refresh`.

## Client data templates (for onboarding)

Give clients the **[client-templates/](./client-templates/)** folder — CSV samples + field guides for vendors, warehouses, shops, bulk products, inward, stock, customers, users, and bank accounts.

## Documentation index

| Module | File | Mount path |
|--------|------|------------|
| Overview | [routes-index.md](./routes-index.md) | — |
| Health | [health-routes.md](./health-routes.md) | `/health`, `/ready`, `/live` |
| Auth | [auth-routes.md](./auth-routes.md) | `/api/v1/auth` |
| Vendors | [vendor-routes.md](./vendor-routes.md) | `/api/v1/vendors` |
| Warehouses | [warehouse-routes.md](./warehouse-routes.md) | `/api/v1/warehouses` |
| Categories | [category-routes.md](./category-routes.md) | `/api/v1/categories` |
| Users | [user-routes.md](./user-routes.md) | `/api/v1/users` |
| Inwards | [inward-routes.md](./inward-routes.md) | `/api/v1/inwards` |
| Products | [product-routes.md](./product-routes.md) — **FE/QA guide** (variants, images, multipart) | `/api/v1/products` |
| Product stock | [product-stock-routes.md](./product-stock-routes.md) | `/api/v1/product-stocks` |
| Stock movement | [stock-movement-routes.md](./stock-movement-routes.md) | `/api/v1/shops`, `/shop-stocks`, `/stock` |
| Online stock (e-comm internal) | [online-stock-internal-api.md](./online-stock-internal-api.md) | `/api/v1/internal/stock` |
| E-comm handoff summary | [online-stock-ecomm-handoff.md](./online-stock-ecomm-handoff.md) | — |
| ERP gaps & roadmap | [erp-implementation-checklist.md](./erp-implementation-checklist.md) | — |
| Media / env | [media-and-env.md](./media-and-env.md) | — |

## Role summary (warehouse app)

| Role | Typical use |
|------|-------------|
| `SUPER_ADMIN` | All masters, all warehouses |
| `WH_MANAGER` | Own warehouse: inwards, products, stock; read global vendors/categories (cannot create categories) |
| `WH_STOCK_LISTER` | Same as manager for stock/product listing ops |
| Shop roles | Read catalog (products/vendors/categories); shop billing (future) |

## Standard response shape

```json
{
  "success": true,
  "message": "Human readable message",
  "data": {},
  "meta": { "page": 1, "limit": 50, "total": 100 },
  "requestId": "uuid"
}
```

Errors: `success: false`, `message`, `code`, optional `details`.
