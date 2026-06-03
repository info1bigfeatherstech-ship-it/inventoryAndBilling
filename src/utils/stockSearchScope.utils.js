const { AppError } = require('../errors/AppError');
const { resolveOwnerShopId } = require('./transferRequest.utils');

const TRANSFER_REQUEST_TYPES = ['WH_TO_WH', 'WH_TO_SHOP', 'SHOP_TO_SHOP'];

/**
 * Resolve which locations appear in GET /stock/search for the current user.
 *
 * Rules align with who may create which transfer:
 * - WH_TO_WH (WH_MANAGER destination): other warehouses with stock only — not own WH, no shops.
 * - WH_TO_SHOP (SHOP_OWNER): warehouses with stock only — shops hidden (source is always a warehouse).
 * - SHOP_TO_SHOP (SHOP_OWNER): other shops with stock only — warehouses hidden.
 * - SHOP_OWNER default search: warehouses + other shops (own shop excluded).
 * - SUPER_ADMIN: all locations unless request_type narrows scope.
 *
 * @param {object} user - req.user
 * @param {object} [query] - req.query (optional request_type)
 * @returns {Promise<{
 *   requestType: string|null,
 *   includeWarehouses: boolean,
 *   includeShops: boolean,
 *   excludeWarehouseIds: string[],
 *   excludeShopIds: string[],
 * }>}
 */
const resolveStockSearchScope = async (user, query = {}) => {
  const explicitType = query.request_type?.trim();

  if (explicitType && !TRANSFER_REQUEST_TYPES.includes(explicitType)) {
    throw new AppError(
      `request_type must be one of: ${TRANSFER_REQUEST_TYPES.join(', ')}`,
      400,
      'INVALID_REQUEST_TYPE'
    );
  }

  let requestType = explicitType || null;

  if (!requestType) {
    if (['WH_MANAGER', 'WH_STOCK_LISTER'].includes(user.role)) {
      requestType = 'WH_TO_WH';
    }
  }

  const excludeWarehouseIds = [];
  const excludeShopIds = [];
  let includeWarehouses = true;
  let includeShops = true;

  switch (requestType) {
    case 'WH_TO_WH':
      includeWarehouses = true;
      includeShops = false;
      if (user.warehouseId) {
        excludeWarehouseIds.push(user.warehouseId);
      }
      break;

    case 'WH_TO_SHOP':
      includeWarehouses = true;
      includeShops = false;
      break;

    case 'SHOP_TO_SHOP':
      includeWarehouses = false;
      includeShops = true;
      break;

    default:
      if (['WH_MANAGER', 'WH_STOCK_LISTER'].includes(user.role)) {
        includeWarehouses = true;
        includeShops = false;
        if (user.warehouseId) {
          excludeWarehouseIds.push(user.warehouseId);
        }
      } else if (user.role === 'SHOP_OWNER') {
        includeWarehouses = true;
        includeShops = true;
      } else {
        includeWarehouses = true;
        includeShops = true;
      }
      break;
  }

  if (includeShops) {
    const ownShopId =
      user.role === 'SHOP_OWNER' ? await resolveOwnerShopId(user) : user.shopId ?? null;
    if (ownShopId) {
      excludeShopIds.push(ownShopId);
    }
  }

  return {
    requestType,
    includeWarehouses,
    includeShops,
    excludeWarehouseIds,
    excludeShopIds,
  };
};

module.exports = {
  TRANSFER_REQUEST_TYPES,
  resolveStockSearchScope,
};
