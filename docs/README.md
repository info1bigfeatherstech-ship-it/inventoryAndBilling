# Warehouse API Documentation Index

Welcome to the Warehouse API documentation. This folder contains comprehensive API documentation for the Warehouse master CRUD operations.

## 📚 Documentation Files

### 1. **WAREHOUSE_API_DOCS.md** (Main Documentation)
Complete, detailed API documentation covering:
- Full endpoint specifications with request/response examples
- Field validations and constraints
- Error handling and common error scenarios
- Integration examples (JavaScript, Python)
- Pagination and filtering details
- Related model relationships
- Response format specifications

**Best for:** Complete understanding, development reference, troubleshooting

**Read this if you need to:** Understand full API behavior, implement clients, debug issues

---

### 2. **WAREHOUSE_API_QUICK_REFERENCE.md** (Quick Reference)
At-a-glance reference guide including:
- Endpoints overview table
- Quick cURL examples for all operations
- Field rules summary
- HTTP status codes
- Query parameters reference
- Common validation errors
- Code snippets (JavaScript, Python)
- Environment setup

**Best for:** Quick lookups during development, copy-paste examples

**Read this if you need to:** Quick command examples, field validation rules, status codes

---

### 3. **WAREHOUSE_API.postman_collection.json** (Postman Collection)
Ready-to-import Postman collection featuring:
- All CRUD endpoints preconfigured
- Request/response examples
- Test scripts for validation
- Environment variables setup
- Response mocks
- Built-in API tests

**Best for:** Interactive API testing, API exploration

**How to use:**
1. Open Postman
2. Click "Import" → "File"
3. Select `WAREHOUSE_API.postman_collection.json`
4. Set environment variables (base_url, authToken)
5. Start making requests!

---

## 🚀 Getting Started

### For First-Time Users
1. Read the **Quick Reference** to understand endpoints
2. Review **field rules** in the Quick Reference
3. Import the **Postman Collection** to test endpoints
4. Consult **Main Documentation** for detailed specifications

### For API Integration
1. Check **Quick Reference** for cURL/code examples
2. Review **field validations** for input handling
3. Study **error responses** in Main Documentation
4. Implement error handling based on HTTP status codes

### For API Testing
1. Import **Postman Collection**
2. Configure environment variables
3. Use pre-built test scripts
4. Review responses against **Main Documentation**

---

## 📋 Quick API Overview

### Base URL
```
http://localhost:5000/api
```

### Authentication
All endpoints require Bearer token with `SUPER_ADMIN` role:
```
Authorization: Bearer {your_token}
```

### Endpoints at a Glance

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/warehouses` | Create new warehouse |
| GET | `/warehouses` | List warehouses (paginated) |
| GET | `/warehouses/:id` | Get single warehouse |
| PUT | `/warehouses/:id` | Update warehouse |
| DELETE | `/warehouses/:id` | Deactivate warehouse |

---

## 🔑 Key Field Rules

### Warehouse Code
- **Format:** `[A-Z0-9_-]` (uppercase only)
- **Length:** 3-20 characters
- **Unique:** Yes
- **Auto:** Converted to uppercase

### Warehouse Name
- **Length:** 2-150 characters
- **Required:** Yes

### Address
- **Length:** 3-500 characters
- **Required:** Yes

### City
- **Length:** 2-100 characters
- **Required:** Yes

### Manager Name
- **Length:** 2-100 characters
- **Required:** No (nullable)

### Remarks
- **Length:** 0-500 characters
- **Required:** No (nullable)

---

## 📝 Response Format

All responses follow this format:

```json
{
  "success": true|false,
  "statusCode": 200|201|400|401|403|404|500,
  "message": "Human-readable message",
  "data": {},
  "meta": {},
  "errors": []
}
```

---

## ✅ Common HTTP Status Codes

| Code | Meaning | When |
|------|---------|------|
| 200 | OK | Successful GET/PUT/DELETE |
| 201 | Created | Successful POST |
| 400 | Bad Request | Validation errors |
| 401 | Unauthorized | Missing/invalid token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 500 | Server Error | Internal error |

---

## 🔗 Related Resources

### Code Files
- **Controller:** `../src/controllers/warehouse/warehouse.controller.js`
- **Routes:** `../src/routes/warehouse/warehouse.routes.js`
- **Validators:** `../src/validators/warehouse/warehouse.validators.js`
- **Service:** `../src/services/warehouse/warehouse.service.js`

### Database
- **Schema:** `../prisma/schema.prisma` (Warehouse model at line 130)
- **Table:** `warehouses`

---

## 🧪 Testing Guide

### Using Postman
1. Import the collection
2. Set `base_url` = `http://localhost:5000`
3. Set `authToken` = your JWT token
4. Run requests in sequence

### Using cURL
See **Quick Reference** for copy-paste examples

### Using Code
- JavaScript/Node.js examples in **Quick Reference**
- Python examples in **Quick Reference**

---

## ❓ Common Questions

**Q: How do I get a warehouse by ID?**
A: Use `GET /warehouses/:warehouseId`. See Quick Reference for cURL example.

**Q: What's the warehouse code format?**
A: 3-20 chars of [A-Z, 0-9, _, -]. Automatically converted to uppercase. Must be unique.

**Q: How do I list warehouses with filters?**
A: Use `GET /warehouses?city=Chennai&is_active=true&page=1&limit=10`

**Q: Can I delete a warehouse?**
A: No, only soft delete (deactivate) by setting `is_active=false`. Use `DELETE /warehouses/:id`

**Q: How do I handle errors?**
A: Check the `errors` array in response or `message` field for details. Refer to Main Documentation for all error scenarios.

---

## 📞 Support

1. **Check documentation:** Review relevant doc file above
2. **Check examples:** Quick Reference has code examples
3. **Test in Postman:** Use the imported collection
4. **Review errors:** Main Documentation lists all error scenarios

---

## 📌 File Structure

```
docs/
├── README.md                                    (This file)
├── WAREHOUSE_API_DOCS.md                       (Full documentation)
├── WAREHOUSE_API_QUICK_REFERENCE.md            (Quick reference)
└── WAREHOUSE_API.postman_collection.json       (Postman collection)
```

---

## 🎯 Next Steps

1. **To understand the API:** Read `WAREHOUSE_API_DOCS.md`
2. **To use quickly:** Reference `WAREHOUSE_API_QUICK_REFERENCE.md`
3. **To test API:** Import `WAREHOUSE_API.postman_collection.json` to Postman
4. **To implement:** Use code examples in Quick Reference

---

## ✨ Features

✅ Full CRUD operations  
✅ Pagination support  
✅ Advanced filtering  
✅ Comprehensive validation  
✅ Soft delete (audit trail)  
✅ Role-based access control (SUPER_ADMIN)  
✅ Consistent response format  
✅ Detailed error messages  
✅ Postman collection included  
✅ Code examples provided  

---

**Last Updated:** 2026-05-19  
**Version:** 1.0.0  
**Status:** Production Ready
