# User Onboarding and Login Guide

This document explains how to create and login users for warehouse/shop operations.

## Base API URL

- `http://localhost:3000/api/v1`

## Role Policy (Important)

Role assignment follows strict ERP rules:

- `SUPER_ADMIN` -> no `warehouse_id`, no `shop_id`
- `WH_MANAGER` -> `warehouse_id` required, `shop_id` not allowed
- `WH_STOCK_LISTER` -> `warehouse_id` required, `shop_id` not allowed
- `SHOP_OWNER` -> `shop_id` required, `warehouse_id` not allowed
- `BILLING_STAFF` -> `shop_id` required, `warehouse_id` not allowed
- `SHOP_STOCK_LISTER` -> `shop_id` required, `warehouse_id` not allowed

## Admin Login (to create users)

### Endpoint

- `POST /auth/login`

### Request body

```json
{
  "phone": "8580403506",
  "password": "bfDev@09"
}
```

### Output

- Access token is returned in response body.
- Refresh token is set in secure HttpOnly cookie.

Use access token as Bearer token in admin-only APIs.

## Create Users (Admin Only)

### Endpoint

- `POST /users`

### Headers

- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`

### Example: Warehouse Manager

```json
{
  "name": "Ravi WH Manager",
  "phone": "9123456789",
  "password": "Ravi@12345",
  "role": "WH_MANAGER",
  "warehouse_id": "PUT_WAREHOUSE_ID_HERE",
  "remarks": "Handles full warehouse operations"
}
```

### Example: Warehouse Stock Lister

```json
{
  "name": "Aman WH Lister",
  "phone": "9234567890",
  "password": "Aman@12345",
  "role": "WH_STOCK_LISTER",
  "warehouse_id": "PUT_WAREHOUSE_ID_HERE",
  "remarks": "Handles inward listing and stock location updates"
}
```


### Example: Shop owner

```json
{
  "name": "Priya Shop Owner",
  "phone": "9345678901",
  "password": "Priya@12345",
  "role": "SHOP_OWNER",
  "shop_id": "PUT_SHOP_ID_HERE",
  "remarks": "Shop business owner"
}
````

### Example: Shop Billing Staff

```json
{
  "name": "Vikas Billing",
  "phone": "9456789012",
  "password": "Vikas@12345",
  "role": "BILLING_STAFF",
  "shop_id": "PUT_SHOP_ID_HERE",
  "remarks": "POS billing user"
}
```

###Example: Shop_Stock_Manager

```json
{
  "name": "Neha Shop Lister",
  "phone": "9567890123",
  "password": "Neha@12345",
  "role": "SHOP_STOCK_LISTER",
  "shop_id": "PUT_SHOP_ID_HERE",
  "remarks": "Shop stock listing from inward stock"
}


## Manager/Lister Login (Operational Users)

After user creation, login is same for all users.

### Endpoint

- `POST /auth/login`

### Request body (example)

```json
{
  "phone": "9123456789",
  "password": "Ravi@12345"
}
```

Use the returned access token for authorized APIs based on role permissions.

## Useful User Management APIs

- `GET /users` -> list users
- `GET /users/:userId` -> user detail
- `PUT /users/:userId` -> update role/assignment
- `PATCH /users/:userId/status` -> activate/deactivate user
- `POST /users/:userId/reset-password` -> reset password (also revokes active refresh sessions)

## Postman Quick Test Flow

1. Admin login -> get access token.
2. Create warehouse (if needed).
3. Create `WH_MANAGER` / `WH_STOCK_LISTER` with warehouse mapping.
4. Login with created user's phone/password.
5. Test role-authorized endpoints.

## Security Notes

- Do not store plain passwords in documents for production usage.
- Share first-time passwords securely and force reset on first login (recommended next enhancement).
- Use strong password format: upper + lower + number + special character.










///from cursor
List users
GET /users?page=1&limit=20
GET /users?role=WH_MANAGER
GET /users?warehouse_id=PUT_WAREHOUSE_ID_HERE
GET /users?is_active=true&search=aman
Get user by ID
GET /users/{userId}
Update user (role/assignment aware)
PUT /users/{userId}
{
  "name": "Aman Kumar",
  "remarks": "Updated profile"
}
Promote lister -> manager (same warehouse)
{
  "role": "WH_MANAGER",
  "warehouse_id": "PUT_WAREHOUSE_ID_HERE"
}
Activate/deactivate user
PATCH /users/{userId}/status
{
  "is_active": false
}
Reset password
POST /users/{userId}/reset-password
{
  "new_password": "NewPass@12345"
}
3) Negative tests (important)
Invalid: warehouse role with shop_id
POST /users
{
  "name": "Bad Mapping",
  "phone": "9789012345",
  "password": "BadMap@123",
  "role": "WH_STOCK_LISTER",
  "shop_id": "SOME_SHOP_ID"
}
Expected: validation / INVALID_ROLE_ASSIGNMENT

Invalid: shop role without shop_id
{
  "name": "Bad Shop User",
  "phone": "9890123456",
  "password": "BadShop@123",
  "role": "BILLING_STAFF"
}
Invalid: SUPER_ADMIN with assignment
{
  "name": "Wrong Admin",
  "phone": "9901234567",
  "password": "Wrong@123",
  "role": "SUPER_ADMIN",
  "warehouse_id": "PUT_WAREHOUSE_ID_HERE"
}
Invalid weak password
{
  "name": "Weak Pass",
  "phone": "9012345678",
  "password": "12345678",
  "role": "WH_MANAGER",
  "warehouse_id": "PUT_WAREHOUSE_ID_HERE"
}
4) Quick Postman env vars suggestion
Create env vars:

baseUrl = http://localhost:3000/api/v1
accessToken = (login response se)
warehouseId = created warehouse id
userId = created user id
shopId = existing shop id (later)
Then requests use:

{{baseUrl}}/users
Bearer {{accessToken}}