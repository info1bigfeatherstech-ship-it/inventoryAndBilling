# Warehouse API - Real-World Examples

This file contains real-world usage examples and common scenarios for the Warehouse API.

---

## Example 1: Complete Warehouse Setup Workflow

### Scenario: Setting up a new warehouse in a new city

```javascript
const axios = require('axios');

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  headers: {
    'Authorization': `Bearer ${process.env.AUTH_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

async function setupNewWarehouse() {
  try {
    // Step 1: Create the warehouse
    const createResponse = await api.post('/warehouses', {
      warehouse_code: 'WH-MUM-001',
      warehouse_name: 'Mumbai Distribution Center',
      address: '789 Business Park, Andheri East, Mumbai',
      city: 'Mumbai',
      manager_name: 'Rajesh Kumar',
      remarks: 'New distribution hub for West region'
    });

    const warehouseId = createResponse.data.data.warehouse_id;
    console.log(`✓ Warehouse created: ${warehouseId}`);

    // Step 2: Verify creation
    const getResponse = await api.get(`/warehouses/${warehouseId}`);
    console.log('✓ Warehouse verified:');
    console.log(JSON.stringify(getResponse.data.data, null, 2));

    // Step 3: List all warehouses in Mumbai
    const listResponse = await api.get('/warehouses', {
      params: {
        city: 'Mumbai',
        is_active: true,
        page: 1,
        limit: 10
      }
    });

    console.log(`✓ Found ${listResponse.data.meta.total} active warehouse(s) in Mumbai`);

    return warehouseId;
  } catch (error) {
    console.error('✗ Error:', error.response?.data?.message);
    throw error;
  }
}

// Execute
setupNewWarehouse().catch(console.error);
```

---

## Example 2: Bulk Warehouse Import

### Scenario: Import multiple warehouses from a CSV

```javascript
const fs = require('fs');
const csv = require('csv-parser');
const axios = require('axios');

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  headers: {
    'Authorization': `Bearer ${process.env.AUTH_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

async function importWarehousesFromCSV(csvFilePath) {
  const results = [];
  const warehouses = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (row) => {
        warehouses.push(row);
      })
      .on('end', async () => {
        console.log(`Processing ${warehouses.length} warehouses...`);

        for (const warehouse of warehouses) {
          try {
            const response = await api.post('/warehouses', {
              warehouse_code: warehouse.code,
              warehouse_name: warehouse.name,
              address: warehouse.address,
              city: warehouse.city,
              manager_name: warehouse.manager || null,
              remarks: warehouse.remarks || null
            });

            results.push({
              status: 'success',
              code: warehouse.code,
              id: response.data.data.warehouse_id
            });

            console.log(`✓ Created: ${warehouse.code}`);
          } catch (error) {
            results.push({
              status: 'error',
              code: warehouse.code,
              error: error.response?.data?.message || error.message
            });

            console.log(`✗ Failed: ${warehouse.code} - ${error.response?.data?.message}`);
          }
        }

        resolve(results);
      })
      .on('error', reject);
  });
}

// Example CSV format:
// code,name,address,city,manager,remarks
// WH-CHN-001,Chennai Main,Industrial Park...,Chennai,John Doe,Primary warehouse
// WH-BNG-001,Bangalore HQ,Tech Park...,Bangalore,Jane Smith,HQ location

// Execute
importWarehousesFromCSV('warehouses.csv')
  .then(results => {
    console.log('\n=== Import Summary ===');
    const successful = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'error').length;
    console.log(`✓ Successful: ${successful}`);
    console.log(`✗ Failed: ${failed}`);
  })
  .catch(console.error);
```

---

## Example 3: Update Warehouse Manager

### Scenario: Transfer manager from one warehouse to another

```python
import requests
from datetime import datetime

BASE_URL = "http://localhost:5000/api"
AUTH_TOKEN = "your_token_here"

headers = {
    "Authorization": f"Bearer {AUTH_TOKEN}",
    "Content-Type": "application/json"
}

def transfer_warehouse_manager(from_warehouse_id, to_warehouse_id, manager_name):
    """Transfer manager from one warehouse to another"""
    
    try:
        # Get old warehouse details
        old_wh = requests.get(
            f"{BASE_URL}/warehouses/{from_warehouse_id}",
            headers=headers
        ).json()['data']
        
        # Get new warehouse details
        new_wh = requests.get(
            f"{BASE_URL}/warehouses/{to_warehouse_id}",
            headers=headers
        ).json()['data']
        
        # Update old warehouse (remove manager)
        update_old = requests.put(
            f"{BASE_URL}/warehouses/{from_warehouse_id}",
            json={"manager_name": None},
            headers=headers
        )
        
        # Update new warehouse (add manager)
        update_new = requests.put(
            f"{BASE_URL}/warehouses/{to_warehouse_id}",
            json={"manager_name": manager_name},
            headers=headers
        )
        
        if update_old.status_code == 200 and update_new.status_code == 200:
            print(f"✓ Successfully transferred {manager_name}")
            print(f"  From: {old_wh['warehouse_name']}")
            print(f"  To: {new_wh['warehouse_name']}")
            return True
        else:
            print("✗ Transfer failed")
            return False
            
    except Exception as e:
        print(f"✗ Error: {str(e)}")
        return False

# Usage
transfer_warehouse_manager(
    from_warehouse_id="cuid123abc",
    to_warehouse_id="cuid456def",
    manager_name="Rajesh Kumar"
)
```

---

## Example 4: Warehouse Search and Filter

### Scenario: Search warehouses with multiple filters

```javascript
async function searchWarehouses(filters) {
  try {
    const params = new URLSearchParams();

    if (filters.search) {
      params.append('search', filters.search);
    }
    if (filters.city) {
      params.append('city', filters.city);
    }
    if (filters.is_active !== undefined) {
      params.append('is_active', filters.is_active);
    }
    if (filters.page) {
      params.append('page', filters.page);
    }
    if (filters.limit) {
      params.append('limit', filters.limit);
    }

    const response = await fetch(
      `http://localhost:5000/api/warehouses?${params}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`
        }
      }
    );

    const result = await response.json();
    
    if (result.success) {
      console.log(`Found ${result.meta.total} warehouses:`);
      result.data.forEach(wh => {
        console.log(`  • ${wh.warehouse_code} - ${wh.warehouse_name} (${wh.city})`);
      });
      return result.data;
    } else {
      console.error('Search failed:', result.message);
      return [];
    }
  } catch (error) {
    console.error('Error:', error);
    return [];
  }
}

// Example searches:

// Find all active warehouses in Chennai
await searchWarehouses({
  city: 'Chennai',
  is_active: true,
  page: 1,
  limit: 20
});

// Search by warehouse code pattern
await searchWarehouses({
  search: 'WH-CHN',
  limit: 50
});

// Find inactive warehouses for archival
await searchWarehouses({
  is_active: false,
  page: 1,
  limit: 100
});
```

---

## Example 5: Error Handling Best Practices

### Scenario: Robust error handling in production

```javascript
const axios = require('axios');

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  headers: {
    'Authorization': `Bearer ${process.env.AUTH_TOKEN}`
  }
});

// Add response interceptor for error handling
api.interceptors.response.use(
  response => response,
  error => {
    const status = error.response?.status;
    const data = error.response?.data;

    switch (status) {
      case 400:
        console.error('❌ Validation Error:', data.errors);
        // Handle validation - notify user
        break;

      case 401:
        console.error('❌ Unauthorized - Token expired or invalid');
        // Re-authenticate
        break;

      case 403:
        console.error('❌ Forbidden - Insufficient permissions');
        // Show permission error
        break;

      case 404:
        console.error('❌ Warehouse not found');
        // Handle not found
        break;

      case 500:
        console.error('❌ Server error - Try again later');
        // Retry or notify admin
        break;

      default:
        console.error('❌ Unexpected error:', error.message);
    }

    throw error;
  }
);

async function createWarehouseWithRetry(payload, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await api.post('/warehouses', payload);
      console.log(`✓ Created on attempt ${attempt}`);
      return response.data.data;
    } catch (error) {
      if (attempt < maxRetries && error.response?.status === 500) {
        console.log(`⚠ Attempt ${attempt} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      } else {
        throw error;
      }
    }
  }
}

// Usage
createWarehouseWithRetry({
  warehouse_code: 'WH-TEST-001',
  warehouse_name: 'Test Warehouse',
  address: 'Test Address',
  city: 'Test City'
}).catch(error => {
  console.error('Failed after retries:', error.message);
});
```

---

## Example 6: Pagination - Processing Large Datasets

### Scenario: Export all warehouses to file with pagination

```python
import requests
import json

BASE_URL = "http://localhost:5000/api"
AUTH_TOKEN = "your_token_here"

def export_all_warehouses(output_file='warehouses.json'):
    """Export all warehouses to JSON file"""
    
    headers = {
        "Authorization": f"Bearer {AUTH_TOKEN}",
        "Content-Type": "application/json"
    }
    
    all_warehouses = []
    page = 1
    limit = 50
    total_pages = None
    
    print("Exporting warehouses...")
    
    while total_pages is None or page <= total_pages:
        try:
            response = requests.get(
                f"{BASE_URL}/warehouses",
                params={
                    'page': page,
                    'limit': limit,
                    'is_active': True
                },
                headers=headers
            )
            
            result = response.json()
            
            if result['success']:
                all_warehouses.extend(result['data'])
                
                if total_pages is None:
                    total_pages = result['meta']['totalPages']
                    print(f"Total warehouses: {result['meta']['total']} (Pages: {total_pages})")
                
                print(f"✓ Loaded page {page}/{total_pages}")
                page += 1
            else:
                print(f"✗ Error on page {page}: {result['message']}")
                break
                
        except Exception as e:
            print(f"✗ Request failed: {str(e)}")
            break
    
    # Write to file
    with open(output_file, 'w') as f:
        json.dump(all_warehouses, f, indent=2, default=str)
    
    print(f"✓ Exported {len(all_warehouses)} warehouses to {output_file}")
    return all_warehouses

# Execute
export_all_warehouses('all_warehouses.json')
```

---

## Example 7: Batch Update - Change Manager for Multiple Warehouses

### Scenario: Update manager name for all warehouses in a city

```javascript
async function updateManagerForCityWarehouses(city, newManager) {
  try {
    // Step 1: Find all warehouses in the city
    const listResponse = await fetch(
      `http://localhost:5000/api/warehouses?city=${encodeURIComponent(city)}&limit=100`,
      {
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`
        }
      }
    );

    const listResult = await listResponse.json();
    const warehouses = listResult.data;

    console.log(`Found ${warehouses.length} warehouses in ${city}`);

    // Step 2: Update each warehouse
    const updates = warehouses.map(wh =>
      fetch(`http://localhost:5000/api/warehouses/${wh.warehouse_id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ manager_name: newManager })
      })
    );

    const results = await Promise.allSettled(updates);

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`✓ Updated ${successful} warehouses`);
    if (failed > 0) {
      console.log(`✗ Failed to update ${failed} warehouses`);
    }

    return { successful, failed };
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

// Usage
await updateManagerForCityWarehouses('Chennai', 'Ramesh Iyer');
```

---

## Example 8: Deactivate Inactive Warehouses

### Scenario: Deactivate warehouses that haven't received stock for months

```python
import requests
from datetime import datetime, timedelta

BASE_URL = "http://localhost:5000/api"
AUTH_TOKEN = "your_token_here"

def deactivate_inactive_warehouses(months_inactive=6):
    """Deactivate warehouses with no recent activity"""
    
    headers = {
        "Authorization": f"Bearer {AUTH_TOKEN}"
    }
    
    # Get all active warehouses
    response = requests.get(
        f"{BASE_URL}/warehouses",
        params={'is_active': True, 'limit': 100},
        headers=headers
    )
    
    warehouses = response.json()['data']
    cutoff_date = datetime.now() - timedelta(days=months_inactive*30)
    
    deactivated = []
    
    for warehouse in warehouses:
        updated_at = datetime.fromisoformat(warehouse['updated_at'].replace('Z', '+00:00'))
        
        if updated_at < cutoff_date:
            # Deactivate this warehouse
            delete_response = requests.delete(
                f"{BASE_URL}/warehouses/{warehouse['warehouse_id']}",
                headers=headers
            )
            
            if delete_response.status_code == 200:
                deactivated.append(warehouse['warehouse_code'])
                print(f"✓ Deactivated: {warehouse['warehouse_name']}")
    
    print(f"\n✓ Total deactivated: {len(deactivated)}")
    return deactivated

# Execute
deactivate_inactive_warehouses(months_inactive=6)
```

---

## Example 9: Warehouse Report Generation

### Scenario: Generate a report of all warehouses with their details

```javascript
async function generateWarehouseReport() {
  try {
    const response = await fetch(
      'http://localhost:5000/api/warehouses?limit=100&is_active=true',
      {
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`
        }
      }
    );

    const result = await response.json();
    const warehouses = result.data;

    // Generate report
    let report = `
WAREHOUSE REPORT
Generated: ${new Date().toLocaleString()}
Total Warehouses: ${warehouses.length}

`;

    report += '| Code | Name | City | Manager | Active |\n';
    report += '|------|------|------|---------|--------|\n';

    warehouses.forEach(wh => {
      report += `| ${wh.warehouse_code} | ${wh.warehouse_name} | ${wh.city} | ${wh.manager_name || 'N/A'} | ${wh.is_active ? 'Yes' : 'No'} |\n`;
    });

    report += `\nCities Served: ${[...new Set(warehouses.map(w => w.city))].join(', ')}\n`;
    report += `Warehouses with Managers: ${warehouses.filter(w => w.manager_name).length}\n`;

    console.log(report);
    return report;
  } catch (error) {
    console.error('Error generating report:', error);
  }
}

// Execute
await generateWarehouseReport();
```

---

## Common Patterns

### Pattern 1: Validation Before Create
```javascript
function validateWarehouse(data) {
  const errors = [];
  
  if (!data.warehouse_code || !/^[A-Z0-9_-]{3,20}$/.test(data.warehouse_code)) {
    errors.push('Invalid warehouse_code');
  }
  if (!data.warehouse_name || data.warehouse_name.length < 2) {
    errors.push('warehouse_name too short');
  }
  if (!data.address || data.address.length < 3) {
    errors.push('address too short');
  }
  if (!data.city || data.city.length < 2) {
    errors.push('city too short');
  }
  
  return errors;
}
```

### Pattern 2: Exponential Backoff Retry
```javascript
async function retryWithBackoff(fn, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt < maxAttempts) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.log(`Retry in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}
```

### Pattern 3: Caching Warehouse Data
```javascript
const cache = {
  warehouses: null,
  timestamp: null,
  maxAge: 5 * 60 * 1000 // 5 minutes
};

async function getWarehousesWithCache() {
  if (cache.warehouses && Date.now() - cache.timestamp < cache.maxAge) {
    console.log('✓ Using cached data');
    return cache.warehouses;
  }
  
  const response = await fetch('...', { headers });
  const data = await response.json();
  
  cache.warehouses = data.data;
  cache.timestamp = Date.now();
  
  return data.data;
}
```

---

## Testing Examples

### Unit Test (Jest)
```javascript
describe('Warehouse API', () => {
  it('should create a warehouse', async () => {
    const response = await api.post('/warehouses', {
      warehouse_code: 'WH-TEST-001',
      warehouse_name: 'Test Warehouse',
      address: 'Test Address',
      city: 'Test City'
    });

    expect(response.status).toBe(201);
    expect(response.data.success).toBe(true);
    expect(response.data.data.warehouse_code).toBe('WH-TEST-001');
  });

  it('should list warehouses', async () => {
    const response = await api.get('/warehouses?page=1&limit=10');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.data.data)).toBe(true);
    expect(response.data.meta).toHaveProperty('page');
  });
});
```

---

**More examples available upon request.**
