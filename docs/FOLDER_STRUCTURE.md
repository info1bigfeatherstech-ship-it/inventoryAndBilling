# Backend folder structure (domain modules)

## Domain modules (auth, vendor, warehouse, …)

Each feature gets matching folders under `controllers`, `services`, `routes`, and `validators`:

```text
src/controllers/<domain>/
src/services/<domain>/
src/routes/<domain>/
src/validators/<domain>/
```

Example (current):

```text
src/controllers/vendor/vendor.controller.js
src/services/vendor/vendor.service.js
src/routes/vendor/vendor.routes.js
src/validators/vendor/vendor.validators.js

src/controllers/auth/auth.controller.js
src/services/auth/auth.service.js
src/routes/auth/auth.routes.js
src/validators/auth/auth.validators.js
```

Auth bootstrap (still “auth domain”, not a route):

```text
src/services/auth/adminBootstrap.service.js
```

## Cross-cutting services (stay at `src/services/` root)

Shared infrastructure, not tied to one business module:

- `health.service.js`
- `connectivity.service.js`
- `shutdown.service.js`

(Add monitoring here when you build it.)

## API versioning

`src/routes/index.routes.js` mounts `v1Router` at `/v1`. Domain route files are included from `src/routes/<domain>/`, not from a `v1/` subfolder.
