# Media Storage & Environment

Product variant images (max **4** per variant, **5MB** each).

## Provider selection

Set in `.env`:

```env
# cloudinary | cloudflare_r2  (default: cloudinary)
MEDIA_PROVIDER=cloudinary

# Cloudinary (development)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_FOLDER=vyaapar/products

# Cloudflare R2 (production option)
MEDIA_PROVIDER=cloudflare_r2
R2_ENDPOINT=
R2_BUCKET=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_PUBLIC_BASE_URL=https://cdn.example.com
```

Only the active provider is used for upload/delete. Each image row stores `storage_provider` so old files delete from the correct cloud.

## Redis (product detail cache)

```env
REDIS_HOST=localhost
REDIS_PORT=6379
PRODUCT_CACHE_TTL_SEC=300
```

`GET /products/:productId` is cached; mutations invalidate cache.

## Health check

`GET /health` includes `media`, `cloudinary`, and `cloudflare_r2` configuration status.
