# Health Routes

**Source:** `src/routes/health.routes.js`  
**Auth:** None

## Endpoints

### GET `/health`

Full health check (database, Redis, media config snapshot).

**Response 200:** `{ status: "healthy", ... }`  
**Response 503:** degraded / unhealthy

---

### GET `/ready`

Kubernetes-style readiness probe.

**Response 200:** ready  
**Response 503:** not ready

---

### GET `/live`

Liveness probe — process is up.

**Response 200:** always if server running
