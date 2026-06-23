# Graph Report - inventoryAndBilling  (2026-06-02)

## Corpus Check
- 146 files · ~79,476 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 550 nodes · 636 edges · 35 communities detected
- Extraction: 89% EXTRACTED · 11% INFERRED · 0% AMBIGUOUS · INFERRED: 67 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]

## God Nodes (most connected - your core abstractions)
1. `Config` - 44 edges
2. `buildVariantInput()` - 12 edges
3. `printStartupBanner()` - 9 edges
4. `HealthService` - 8 edges
5. `roundMoney()` - 8 edges
6. `cacheDel()` - 8 edges
7. `cacheDelByPattern()` - 8 edges
8. `resolveOwnerShopId()` - 8 edges
9. `issueSessionTokens()` - 7 edges
10. `performDispatchStock()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `assertBulkRead()` --calls--> `resolveOwnerShopId()`  [INFERRED]
  src\services\stock\bulkTransfer.service.js → src\utils\transferRequest.utils.js
- `issueSessionTokens()` --calls--> `signRefreshToken()`  [INFERRED]
  src\services\auth\auth.service.js → src\utils\jwt.utils.js
- `issueSessionTokens()` --calls--> `decodeToken()`  [INFERRED]
  src\services\auth\auth.service.js → src\utils\jwt.utils.js
- `issueSessionTokens()` --calls--> `signAccessToken()`  [INFERRED]
  src\services\auth\auth.service.js → src\utils\jwt.utils.js
- `buildCsvVariantPrices()` --calls--> `withComputedPurchaseCode()`  [INFERRED]
  src\services\product\product.service.js → src\utils\purchaseCode.utils.js

## Communities

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (36): applyVariantImagesOnCreate(), assertVariantUsesProductBase(), buildCsvVariantPrices(), buildPriceUpdatePayload(), buildVariantCode(), buildVariantInput(), createBulkVariant(), extractVariantPrices() (+28 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (1): Config

### Community 2 - "Community 2"
Cohesion: 0.1
Nodes (26): addWarehouseStock(), assertShopActive(), assertWarehouseActive(), decrementShopAvailable(), decrementShopInTransit(), deductWarehouseStock(), incrementShopAvailable(), incrementShopInTransit() (+18 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (11): applyStockFromMappedInward(), resolveVariantForInwardItem(), createStockLedgerEntry(), addWarehouseStock(), decrementShopInTransit(), deductWarehouseStock(), dispatchWhToShop(), incrementShopAvailable() (+3 more)

### Community 4 - "Community 4"
Cohesion: 0.16
Nodes (16): invalidateProductCaches(), invalidateProductCaches(), invalidateProductCacheByStock(), assertBulkRead(), invalidateProductCaches(), invalidateProductCaches(), invalidateProductCaches(), cacheDel() (+8 more)

### Community 5 - "Community 5"
Cohesion: 0.16
Nodes (10): applyCreditNotesOnBill(), aggregateBillTotals(), calculateLineAmounts(), derivePaymentStatus(), isIntraStateSupply(), normalizeStateCode(), roundMoney(), splitGstComponents() (+2 more)

### Community 6 - "Community 6"
Cohesion: 0.22
Nodes (12): errorHandler(), handlePrismaError(), buildFolder(), deleteObject(), ensureConfigured(), trimEnv(), uploadVariantImage(), validateFile() (+4 more)

### Community 7 - "Community 7"
Cohesion: 0.18
Nodes (11): findActiveRefreshRecord(), getRefreshTokenDelegate(), hashRefreshToken(), issueSessionTokens(), sanitizeUser(), getBearerToken(), requireAuth(), decodeToken() (+3 more)

### Community 8 - "Community 8"
Cohesion: 0.3
Nodes (15): center(), colorize(), formatBytes(), getLocalIps(), kvRow(), makeBox(), padLeft(), padRight() (+7 more)

### Community 9 - "Community 9"
Cohesion: 0.27
Nodes (9): assertCanAssignParent(), assertDeactivationAllowed(), assertNoActiveChildren(), assertNoActiveProducts(), getCategoryOrThrow(), normalizeName(), normalizeParentId(), sanitizeCategoryCreate() (+1 more)

### Community 10 - "Community 10"
Cohesion: 0.22
Nodes (3): assertWarehouseHasStock(), deductWarehouseStock(), lockWarehouseStock()

### Community 11 - "Community 11"
Cohesion: 0.42
Nodes (7): assertPurchaseCodeFormula(), ensureTestFixtures(), expectAmbiguousPurchaseCodeScan(), expectSamePurchaseCode(), run(), computePurchaseCode(), withComputedPurchaseCode()

### Community 12 - "Community 12"
Cohesion: 0.33
Nodes (1): HealthService

### Community 13 - "Community 13"
Cohesion: 0.25
Nodes (2): buildShopWhere(), applyShopListScope()

### Community 14 - "Community 14"
Cohesion: 0.48
Nodes (1): ConnectivityService

### Community 15 - "Community 15"
Cohesion: 0.29
Nodes (1): ShutdownService

### Community 17 - "Community 17"
Cohesion: 0.29
Nodes (3): buildProductWhere(), buildStockWhere(), applyWarehouseScope()

### Community 18 - "Community 18"
Cohesion: 0.4
Nodes (2): listRealEntries(), resolveZipContentRoot()

### Community 19 - "Community 19"
Cohesion: 0.6
Nodes (5): buildBillPdfBuffer(), ensureCloudinary(), generateBillPdf(), trimEnv(), uploadBillPdf()

### Community 20 - "Community 20"
Cohesion: 0.6
Nodes (5): buildPublicUrl(), deleteObject(), getClient(), uploadVariantImage(), validateFile()

### Community 21 - "Community 21"
Cohesion: 0.47
Nodes (3): getBulkItemInTransit(), getDispatchQuantity(), isBulkPartiallyReceived()

### Community 22 - "Community 22"
Cohesion: 0.6
Nodes (5): devLog(), formatMeta(), getTimestamp(), getWinstonLogger(), prodLog()

### Community 23 - "Community 23"
Cohesion: 0.47
Nodes (4): assertVariantImageUploads(), countVariantsInPayload(), middlewareParseProductJsonBody(), parseProductJsonBody()

### Community 24 - "Community 24"
Cohesion: 0.4
Nodes (2): formatDistanceLabel(), shopSortScore()

### Community 25 - "Community 25"
Cohesion: 0.8
Nodes (5): applyWarehouseListScope(), assertCanReadWarehouse(), assertWarehouseAssigned(), isSuperAdmin(), isWarehouseStaff()

### Community 26 - "Community 26"
Cohesion: 0.6
Nodes (3): generateRequestId(), requestIdMiddleware(), sanitizeRequestId()

### Community 27 - "Community 27"
Cohesion: 0.5
Nodes (3): ensureSuperAdmin(), startServer(), validateDatabaseConnection()

### Community 28 - "Community 28"
Cohesion: 0.5
Nodes (2): resolveActiveProvider(), uploadVariantImage()

### Community 30 - "Community 30"
Cohesion: 0.6
Nodes (3): productPriceRules(), variantBodyRules(), variantShippingRules()

### Community 31 - "Community 31"
Cohesion: 0.83
Nodes (3): expectPass(), expectThrow(), run()

### Community 34 - "Community 34"
Cohesion: 0.67
Nodes (2): createRateLimiter(), getRedisClient()

### Community 37 - "Community 37"
Cohesion: 0.5
Nodes (2): getRefreshCookieOptions(), durationToMs()

### Community 38 - "Community 38"
Cohesion: 0.5
Nodes (1): PrismaSingleton

### Community 39 - "Community 39"
Cohesion: 0.5
Nodes (2): resolveVariant(), resolveVariantByScanCode()

### Community 40 - "Community 40"
Cohesion: 0.67
Nodes (1): AppError

## Knowledge Gaps
- **Thin community `Community 1`** (45 nodes): `Config`, `.ADMIN_NAME()`, `.ADMIN_PASSWORD()`, `.ADMIN_PHONE()`, `.ALLOWED_ORIGINS()`, `.API_VERSION()`, `.CLOUDINARY_API_KEY()`, `.CLOUDINARY_API_SECRET()`, `.CLOUDINARY_CLOUD_NAME()`, `.CLOUDINARY_FOLDER()`, `.constructor()`, `.COOKIE_DOMAIN()`, `.CORS_ALLOWED_HEADERS()`, `.DATABASE_URL()`, `.DB_CONNECTION_TIMEOUT()`, `.DB_POOL_SIZE()`, `.ENABLE_REDIS_RATE_LIMIT()`, `.isDevelopment()`, `.isProduction()`, `.isTesting()`, `.JWT_EXPIRES_IN()`, `.JWT_REFRESH_EXPIRES_IN()`, `.JWT_REFRESH_SECRET()`, `.JWT_SECRET()`, `.LOG_DIR()`, `.LOG_LEVEL()`, `.MEDIA_PROVIDER()`, `.NODE_ENV()`, `.PORT()`, `.PRODUCT_CACHE_TTL_SEC()`, `.R2_ACCESS_KEY_ID()`, `.R2_BUCKET()`, `.R2_ENABLED()`, `.R2_ENDPOINT()`, `.R2_PUBLIC_BASE_URL()`, `.R2_SECRET_ACCESS_KEY()`, `.RATE_LIMIT_MAX_ADMIN()`, `.RATE_LIMIT_MAX_GENERAL()`, `.RATE_LIMIT_MAX_SENSITIVE()`, `.RATE_LIMIT_WINDOW_MS()`, `.REDIS_HOST()`, `.REDIS_PASSWORD()`, `.REDIS_PORT()`, `.validate()`, `index.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 12`** (9 nodes): `HealthService`, `.checkDatabase()`, `.checkRedis()`, `.constructor()`, `.getFullHealth()`, `.getLiveness()`, `.getMemoryUsage()`, `.getReadiness()`, `health.service.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 13`** (8 nodes): `assertDeactivationAllowed()`, `buildShopWhere()`, `normalizeShopCode()`, `shop.service.js`, `shopAccess.utils.js`, `applyShopListScope()`, `assertShopReadAccess()`, `resolveShopIdForUser()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 14`** (7 nodes): `ConnectivityService`, `.checkCloudinaryConfig()`, `.checkDatabase()`, `.checkR2Config()`, `.checkRedis()`, `.getSnapshot()`, `connectivity.service.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (7 nodes): `ShutdownService`, `.constructor()`, `.registerConnection()`, `.registerServer()`, `.setupProcessHandlers()`, `.shutdown()`, `shutdown.service.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (6 nodes): `isOsJunkEntryName()`, `listRealEntries()`, `parseKeepImageIds()`, `resolveZipContentRoot()`, `withUserContext()`, `product.controller.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (6 nodes): `stock.utils.js`, `calculateReorderQuantity()`, `formatDistanceLabel()`, `prioritizeShops()`, `prioritizeWarehouses()`, `shopSortScore()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (5 nodes): `media.service.js`, `deleteStoredImage()`, `getMediaStatus()`, `resolveActiveProvider()`, `uploadVariantImage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (4 nodes): `createRateLimiter()`, `getIpKey()`, `getRedisClient()`, `rateLimiter.middleware.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (4 nodes): `authCookies.utils.js`, `time.utils.js`, `getRefreshCookieOptions()`, `durationToMs()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (4 nodes): `prisma.utils.js`, `PrismaSingleton`, `.constructor()`, `.getInstance()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (4 nodes): `stockSearch.service.js`, `variantScan.utils.js`, `resolveVariant()`, `resolveVariantByScanCode()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (3 nodes): `AppError`, `.constructor()`, `AppError.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `invalidateProductCaches()` connect `Community 4` to `Community 0`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `invalidateProductCaches()` connect `Community 4` to `Community 2`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `createStockLedgerEntry()` connect `Community 3` to `Community 2`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `buildVariantInput()` (e.g. with `generateSystemBarcode()` and `withComputedPurchaseCode()`) actually correct?**
  _`buildVariantInput()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `roundMoney()` (e.g. with `applyCreditNotesOnBill()` and `getCreditNoteBalance()`) actually correct?**
  _`roundMoney()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._