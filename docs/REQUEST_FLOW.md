# Request flow (routes → controller → service)

This document explains how HTTP requests move through the backend. Same pattern applies to **Vendor**, **Auth**, and future modules.

## Folder mental map

```text
routes/<domain>/<domain>.routes.js     → URL + middleware chain (auth, validate)
controllers/<domain>/<domain>.controller.js → HTTP response; calls service only
services/<domain>/<domain>.service.js       → Business rules + Prisma / DB
validators/<domain>/<domain>.validators.js  → express-validator field rules

Cross-cutting (stay under services/ root): health, connectivity, shutdown, etc.
Auth bootstrap: services/auth/adminBootstrap.service.js

middlewares/auth.middleware.js → Bearer verify, role check
utils/prisma.utils.js         → DB client singleton
```

## 1) Typical request (example: list vendors)

```mermaid
flowchart LR
  subgraph Client
    A[Postman / Browser]
  end

  subgraph Express
    B[app.js middlewares]
    C[index.routes.js /v1]
    D[vendor.routes.js]
    E[express-validator]
    F[validateRequest]
    G[requireAuth]
    H[authorizeRoles SUPER_ADMIN]
    I[vendor.controller list]
  end

  subgraph Domain
    J[vendor.service listVendors]
    K[(Prisma → PostgreSQL)]
  end

  A -->|HTTP GET + Bearer| B
  B --> C --> D
  D --> E --> F --> G --> H --> I
  I --> J --> K
  K --> J --> I -->|JSON success + meta| A
```

**One-liner:** Request passes **security + validation** first; the controller only **calls the service**; the service talks to the **database**; the response goes back the same way.

## 2) Create vendor (POST) — sequence

```mermaid
sequenceDiagram
  participant C as Client
  participant R as vendor.routes
  participant V as validateRequest
  participant A as auth + RBAC
  participant Ctrl as vendor.controller
  participant Svc as vendor.service
  participant DB as Prisma/DB

  C->>R: POST /v1/vendors + JSON + Bearer
  R->>V: rules check
  V-->>R: OK / 400
  R->>A: requireAuth + SUPER_ADMIN
  A-->>R: OK / 401 / 403
  R->>Ctrl: create()
  Ctrl->>Svc: createVendor(body)
  Svc->>DB: vendor.create(...)
  DB-->>Svc: row
  Svc-->>Ctrl: vendor
  Ctrl-->>C: 201 + data + requestId
```

## 3) Login (current — access token only)

```mermaid
flowchart TB
  subgraph HTTP
    L[POST /auth/login]
  end

  subgraph Pipeline
    V[validators + validateRequest]
    Ctrl[auth.controller login]
    Svc[auth.service login]
  end

  subgraph Data
    DB[(User + password_hash)]
    JWT[jwt.utils signAccessToken]
  end

  L --> V --> Ctrl --> Svc
  Svc --> DB
  Svc -->|bcrypt.compare| DB
  Svc --> JWT
  JWT --> Ctrl -->|JSON accessToken + user| L
```

**Future (refresh token):** add `Set-Cookie`, a `RefreshToken` (or session) table, and `POST /auth/refresh` — this diagram will gain one more branch.

## Viewing Mermaid diagrams

- GitHub / many IDEs render `.md` Mermaid natively.
- Or paste into [Mermaid Live Editor](https://mermaid.live).
