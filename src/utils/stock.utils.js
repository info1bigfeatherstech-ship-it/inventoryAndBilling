/**
 * Stock planning and location-priority helpers.
 */

/**
 * Calculate suggested reorder quantity from min-max levels.
 * @param {number} currentStock
 * @param {number} minLevel
 * @param {number} maxLevel
 * @param {number|null} reorderQty - Fixed reorder qty overrides max-current
 * @returns {number}
 */
const calculateReorderQuantity = (currentStock, minLevel, maxLevel, reorderQty = null) => {
  const current = Number(currentStock) || 0;
  const min = Number(minLevel) || 0;
  const max = Number(maxLevel) || 0;

  if (current >= min) return 0;

  if (reorderQty != null && Number(reorderQty) > 0) {
    return Math.max(0, Number(reorderQty));
  }

  return Math.max(0, max - current);
};

/**
 * Human-readable distance label for stock search (city-based; no GPS).
 * @param {string} referenceCity
 * @param {string} locationCity
 */
const formatDistanceLabel = (referenceCity, locationCity) => {
  const ref = String(referenceCity || '').trim().toLowerCase();
  const loc = String(locationCity || '').trim().toLowerCase();

  if (!ref || !loc) return 'unknown';
  if (ref === loc) return 'same city';
  return 'other city';
};

/**
 * Sort key: same city first, then higher stock, then name.
 */
const shopSortScore = (referenceCity, shop, stockQty) => {
  const sameCity = formatDistanceLabel(referenceCity, shop.city) === 'same city' ? 0 : 1;
  return { sameCity, stock: -(stockQty || 0), name: shop.shop_name || '' };
};

/**
 * Sort warehouses: same city as shop first, then by name.
 * @param {string} shopCity
 * @param {Array<{ city: string, warehouse_name: string }>} warehouses
 */
const prioritizeWarehouses = (shopCity, warehouses) => {
  return [...warehouses].sort((a, b) => {
    const aSame = formatDistanceLabel(shopCity, a.city) === 'same city' ? 0 : 1;
    const bSame = formatDistanceLabel(shopCity, b.city) === 'same city' ? 0 : 1;
    if (aSame !== bSame) return aSame - bSame;
    return (a.warehouse_name || '').localeCompare(b.warehouse_name || '');
  });
};

/**
 * Sort shops: same city first, then by stock desc, then name.
 * @param {string} referenceCity
 * @param {Array} shops - entries with city, shop_name, stock_quantity
 */
const prioritizeShops = (referenceCity, shops) => {
  return [...shops].sort((a, b) => {
    const aScore = shopSortScore(referenceCity, a, a.stock_quantity);
    const bScore = shopSortScore(referenceCity, b, b.stock_quantity);
    if (aScore.sameCity !== bScore.sameCity) return aScore.sameCity - bScore.sameCity;
    if (aScore.stock !== bScore.stock) return aScore.stock - bScore.stock;
    return aScore.name.localeCompare(bScore.name);
  });
};

module.exports = {
  calculateReorderQuantity,
  formatDistanceLabel,
  prioritizeWarehouses,
  prioritizeShops,
};
