-- Track which cloud stores each variant image (Cloudinary vs Cloudflare R2).

CREATE TYPE "MediaStorageProvider" AS ENUM ('CLOUDINARY', 'CLOUDFLARE_R2');

ALTER TABLE "product_variant_images"
ADD COLUMN "storage_provider" "MediaStorageProvider" NOT NULL DEFAULT 'CLOUDINARY';
