# Auth Routes

**Base path:** `/api/v1/auth`  
**Source:** `src/routes/auth/auth.routes.js`

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/login` | No | Phone + password → access token + user (with `warehouse` / `shop`) |
| POST | `/refresh` | Cookie | Rotate refresh token; new access token |
| POST | `/logout` | Cookie | Revoke refresh session |
| GET | `/me` | Bearer | Current user profile + nested warehouse/shop |

## POST `/login`

**Body:**
```json
{
  "phone": "9876543210",
  "password": "yourPassword"
}
```

**Response `data` (typical):**
```json
{
  "accessToken": "eyJ...",
  "tokenType": "Bearer",
  "user": {
    "user_id": "...",
    "name": "WH Manager",
    "role": "WH_MANAGER",
    "warehouse_id": "...",
    "warehouse": {
      "warehouse_id": "...",
      "warehouse_code": "WH-01",
      "warehouse_name": "Main WH",
      "city": "Delhi",
      "is_active": true
    }
  }
}
```

Refresh token is set as **httpOnly cookie** (not in JSON body).

## GET `/me`

Use after login to refresh UI context. Same nested `warehouse` / `shop` as login.

## Errors

| Code | HTTP | When |
|------|------|------|
| `INVALID_CREDENTIALS` | 401 | Wrong phone/password |
| `USER_INACTIVE` | 401 | Account disabled |
| `AUTH_REQUIRED` | 401 | Missing Bearer on `/me` |
