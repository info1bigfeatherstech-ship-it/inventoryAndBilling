-- Add shop ownership category for billing permissions.
CREATE TYPE "ShopType" AS ENUM ('OWNER', 'FRANCHISE');

ALTER TABLE "shops"
ADD COLUMN "shop_type" "ShopType" NOT NULL DEFAULT 'OWNER';

CREATE INDEX "shops_shop_type_idx" ON "shops"("shop_type");
