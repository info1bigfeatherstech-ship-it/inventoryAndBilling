SHOP MODULE - COMPLETE API DOCUMENTATION
🔐 Authentication Header (All APIs)
text
Authorization: Bearer <your_jwt_token>
Content-Type: application/json
🏪 1. SHOP APIs
1.1 Create Shop (SUPER_ADMIN only)
Endpoint: POST {{BASE_URL}}/api/v1/shops

Request Body:

json
{
  "shop_code": "SHOP-DL-001",
  "shop_name": "Delhi Central Store",
  "address": "Sector 18, Okhla Phase 2",
  "city": "Delhi",
  "phone": "9876543210",
  "email": "delhi@vyaapar.com",
  "owner_user_id": "user_abc123",
  "sales_channels": ["WALK_IN", "ONLINE", "WHOLESALE"],
  "remarks": "Main flagship store"
}
Response (201 Created):

json
{
  "success": true,
  "message": "Shop created successfully",
  "data": {
    "shop_id": "shop_delhi_001",
    "shop_code": "SHOP-DL-001",
    "shop_name": "Delhi Central Store",
    "address": "Sector 18, Okhla Phase 2",
    "city": "Delhi",
    "phone": "9876543210",
    "email": "delhi@vyaapar.com",
    "owner_user_id": "user_abc123",
    "is_active": true,
    "remarks": "Main flagship store",
    "sales_channels": ["WALK_IN", "ONLINE", "WHOLESALE"],
    "created_at": "2026-05-23T10:30:00.000Z",
    "updated_at": "2026-05-23T10:30:00.000Z"
  }
}
1.2 List Shops (All read roles)
Endpoint: GET {{BASE_URL}}/api/v1/shops?page=1&limit=10&city=Delhi&is_active=true&search=Central

Query Parameters:

Param	Type	Description
page	number	Page number (default: 1)
limit	number	Items per page (max: 100)
city	string	Filter by city
is_active	boolean	Filter by active status
search	string	Search in shop_code, shop_name, phone, city
Response (200 OK):

json
{
  "success": true,
  "message": "Shops fetched successfully",
  "data": [
    {
      "shop_id": "shop_delhi_001",
      "shop_code": "SHOP-DL-001",
      "shop_name": "Delhi Central Store",
      "address": "Sector 18, Okhla Phase 2",
      "city": "Delhi",
      "phone": "9876543210",
      "email": "delhi@vyaapar.com",
      "owner_user_id": "user_abc123",
      "is_active": true,
      "remarks": "Main flagship store",
      "sales_channels": ["WALK_IN", "ONLINE", "WHOLESALE"],
      "created_at": "2026-05-23T10:30:00.000Z",
      "updated_at": "2026-05-23T10:30:00.000Z"
    },
    {
      "shop_id": "shop_noida_001",
      "shop_code": "SHOP-NO-001",
      "shop_name": "Noida Sector 18 Store",
      "address": "Sector 18, Noida",
      "city": "Noida",
      "phone": "9876543222",
      "email": "noida@vyaapar.com",
      "owner_user_id": "user_def456",
      "is_active": true,
      "remarks": null,
      "sales_channels": ["WALK_IN"],
      "created_at": "2026-05-22T15:20:00.000Z",
      "updated_at": "2026-05-22T15:20:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 2,
    "totalPages": 1
  }
}
1.3 Get My Shop (SHOP_OWNER only)
Endpoint: GET {{BASE_URL}}/api/v1/shops/me

Response (200 OK):

json
{
  "success": true,
  "message": "Your shop fetched successfully",
  "data": {
    "shop_id": "shop_delhi_001",
    "shop_code": "SHOP-DL-001",
    "shop_name": "Delhi Central Store",
    "address": "Sector 18, Okhla Phase 2",
    "city": "Delhi",
    "phone": "9876543210",
    "email": "delhi@vyaapar.com",
    "owner_user_id": "user_abc123",
    "is_active": true,
    "remarks": "Main flagship store",
    "sales_channels": ["WALK_IN", "ONLINE", "WHOLESALE"],
    "created_at": "2026-05-23T10:30:00.000Z",
    "updated_at": "2026-05-23T10:30:00.000Z",
    "_count": {
      "shop_stocks": 15,
      "users": 8
    },
    "shop_stocks": [
      {
        "shop_stock_id": "sstock_001",
        "variant_id": "var_iphone_case",
        "quantity_available": 500,
        "quantity_reserved": 10,
        "quantity_in_transit": 50
      }
    ]
  }
}
1.4 Get Shop by ID (All read roles)
Endpoint: GET {{BASE_URL}}/api/v1/shops/:shopId

Example: GET {{BASE_URL}}/api/v1/shops/shop_delhi_001

Response (200 OK): Same as above (includes stocks and counts)

1.5 Update Shop (SUPER_ADMIN only)
Endpoint: PUT {{BASE_URL}}/api/v1/shops/:shopId

Request Body:

json
{
  "shop_name": "Delhi Central Store - Updated",
  "address": "Sector 19, Okhla Phase 2",
  "city": "Delhi",
  "phone": "9998887776",
  "email": "delhi_new@vyaapar.com",
  "owner_user_id": "user_new_owner_456",
  "is_active": true,
  "remarks": "Renovated and expanded",
  "sales_channels": ["WALK_IN", "ONLINE", "WHOLESALE", "OWB"]
}
Response (200 OK):

json
{
  "success": true,
  "message": "Shop updated successfully",
  "data": {
    "shop_id": "shop_delhi_001",
    "shop_code": "SHOP-DL-001",
    "shop_name": "Delhi Central Store - Updated",
    "address": "Sector 19, Okhla Phase 2",
    "city": "Delhi",
    "phone": "9998887776",
    "email": "delhi_new@vyaapar.com",
    "owner_user_id": "user_new_owner_456",
    "is_active": true,
    "remarks": "Renovated and expanded",
    "sales_channels": ["WALK_IN", "ONLINE", "WHOLESALE", "OWB"],
    "created_at": "2026-05-23T10:30:00.000Z",
    "updated_at": "2026-05-23T14:20:00.000Z"
  }
}
1.6 Delete (Deactivate) Shop (SUPER_ADMIN only)
Endpoint: DELETE {{BASE_URL}}/api/v1/shops/:shopId

Example: DELETE {{BASE_URL}}/api/v1/shops/shop_delhi_001

Response (200 OK):

json
{
  "success": true,
  "message": "Shop deactivated successfully",
  "data": {
    "shop_id": "shop_delhi_001",
    "is_active": false
  }
}
Note:

Shop deactivation fails if there are active bills or non-zero stock

This is soft delete (is_active = false)

