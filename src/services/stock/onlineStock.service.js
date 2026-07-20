const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../errors/AppError');
const config = require('../../config/index.config');
const AppSettingsService = require('../settings/appSettings.service');
const { normalizeProductCode } = require('../../utils/productCode.utils');
const { freeQuantityOnRow } = require('../../utils/warehouseFreeStock.utils');
const logger = require('../../utils/logger.utils');

const TX_OPTIONS = { isolationLevel: 'Serializable', maxWait: 10000, timeout: 30000 };

const RESERVATION_INCLUDE = {
  lines: {
    orderBy: { product_code: 'asc' },
  },
  warehouse: {
    select: {
      warehouse_id: true,
      warehouse_code: true,
      warehouse_name: true,
    },
  },
};

const formatReservation = (row) => ({
  reservation_id: row.reservation_id,
  orderId: row.order_id,
  storefront: row.storefront,
  status: row.status,
  warehouse_id: row.warehouse_id,
  warehouse: row.warehouse || null,
  lines: (row.lines || []).map((line) => ({
    productCode: line.product_code,
    variant_id: line.variant_id,
    quantity: line.quantity,
  })),
  created_at: row.created_at,
  updated_at: row.updated_at,
  committed_at: row.committed_at,
  released_at: row.released_at,
});

const mergeLinesByProductCode = (lines = []) => {
  const map = new Map();
  for (const raw of lines) {
    const productCode = normalizeProductCode(raw.productCode ?? raw.product_code);
    const quantity = Number(raw.quantity);
    if (!productCode) {
      throw new AppError('Each line requires productCode', 400, 'PRODUCT_CODE_REQUIRED');
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new AppError(
        `Invalid quantity for ${productCode}`,
        400,
        'INVALID_QUANTITY',
        { productCode, quantity: raw.quantity }
      );
    }
    map.set(productCode, (map.get(productCode) || 0) + quantity);
  }
  return [...map.entries()].map(([productCode, quantity]) => ({ productCode, quantity }));
};

const linesFingerprint = (lines) =>
  mergeLinesByProductCode(lines)
    .map((l) => `${l.productCode}:${l.quantity}`)
    .sort()
    .join('|');

/**
 * Variant-level match within the online fulfillment warehouse only.
 * Tries exact normalized code, then bare base → `${base}-1`.
 * If multiple products in the same warehouse share the variant code, picks the one with highest available stock.
 */
const resolveVariantByProductCode = async (tx, productCode, warehouseId) => {
  if (!warehouseId) return null;

  const code = normalizeProductCode(productCode);
  if (!code) return null;

  const productScope = { is_active: true, warehouse_id: warehouseId };

  const findAll = async (value) =>
    tx.productVariant.findMany({
      where: {
        product_code: { equals: value, mode: 'insensitive' },
        is_active: true,
        product: productScope,
      },
      select: {
        variant_id: true,
        product_code: true,
        product_id: true,
      },
    });

  let candidates = await findAll(code);
  if (!candidates.length && !code.includes('-')) {
    candidates = await findAll(`${code}-1`);
  }
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  let best = candidates[0];
  let bestAvailable = -1;
  for (const candidate of candidates) {
    const { available } = await sumFreeAvailableForVariant(tx, candidate.variant_id, warehouseId);
    if (available > bestAvailable) {
      bestAvailable = available;
      best = candidate;
    }
  }

  logger.warn('[online-stock] ambiguous productCode in fulfillment warehouse — using highest available', {
    warehouseId,
    productCode: code,
    variantIds: candidates.map((c) => c.variant_id),
    chosenVariantId: best.variant_id,
    chosenAvailable: bestAvailable,
  });

  return best;
};

const sumFreeAvailableForVariant = async (tx, variantId, warehouseId) => {
  const rows = await tx.productStock.findMany({
    where: { variant_id: variantId, warehouse_id: warehouseId },
    select: {
      stock_id: true,
      quantity: true,
      quantity_reserved: true,
      expiry_date: true,
      updated_at: true,
    },
    orderBy: [{ expiry_date: 'asc' }, { updated_at: 'asc' }],
  });
  const available = rows.reduce((sum, row) => sum + freeQuantityOnRow(row), 0);
  return { available, rows };
};

/**
 * Atomically hold free qty across batch rows (FIFO). Returns allocations.
 */
const allocateReserveOnRows = async (tx, rows, quantity) => {
  let remaining = quantity;
  const allocations = [];

  for (const row of rows) {
    if (remaining <= 0) break;
    const free = freeQuantityOnRow(row);
    if (free <= 0) continue;

    const take = Math.min(free, remaining);
    const updated = await tx.$executeRaw`
      UPDATE product_stocks
      SET quantity_reserved = quantity_reserved + ${take},
          updated_at = NOW()
      WHERE stock_id = ${row.stock_id}
        AND (quantity - quantity_reserved) >= ${take}
    `;

    if (Number(updated) !== 1) {
      throw new AppError('Stock changed during reserve — retry', 409, 'STOCK_CONFLICT');
    }

    allocations.push({ stock_id: row.stock_id, quantity: take });
    remaining -= take;
  }

  if (remaining > 0) {
    throw new AppError('Insufficient stock to complete reserve', 409, 'INSUFFICIENT_STOCK');
  }

  return allocations;
};

const applyAllocationDelta = async (tx, allocations, { release = false, commit = false }) => {
  for (const alloc of allocations || []) {
    const stockId = alloc.stock_id;
    const qty = Number(alloc.quantity);
    if (!stockId || !Number.isInteger(qty) || qty <= 0) {
      throw new AppError('Invalid reservation allocation data', 500, 'RESERVATION_ALLOCATION_CORRUPT');
    }

    if (commit) {
      const updated = await tx.$executeRaw`
        UPDATE product_stocks
        SET quantity = quantity - ${qty},
            quantity_reserved = quantity_reserved - ${qty},
            updated_at = NOW()
        WHERE stock_id = ${stockId}
          AND quantity_reserved >= ${qty}
          AND quantity >= ${qty}
      `;
      if (Number(updated) !== 1) {
        throw new AppError('Cannot commit reservation — stock state mismatch', 409, 'STOCK_CONFLICT');
      }
    } else if (release) {
      const updated = await tx.$executeRaw`
        UPDATE product_stocks
        SET quantity_reserved = quantity_reserved - ${qty},
            updated_at = NOW()
        WHERE stock_id = ${stockId}
          AND quantity_reserved >= ${qty}
      `;
      if (Number(updated) !== 1) {
        throw new AppError('Cannot release reservation — stock state mismatch', 409, 'STOCK_CONFLICT');
      }
    }
  }
};

const OnlineStockService = {
  /**
   * Batch READ — variant-level available map for configured online warehouse.
   * Missing codes omitted (e-comm Mongo fallback).
   */
  async batchStockByCodes(codesInput = []) {
    const maxCodes = config.INTERNAL_STOCK_BATCH_MAX_CODES;
    if (!Array.isArray(codesInput) || codesInput.length === 0) {
      throw new AppError('codes must be a non-empty array', 400, 'CODES_REQUIRED');
    }
    if (codesInput.length > maxCodes) {
      throw new AppError(`Too many codes (max ${maxCodes})`, 400, 'CODES_LIMIT_EXCEEDED', {
        max: maxCodes,
      });
    }

    const warehouseId = await AppSettingsService.resolveOnlineWarehouseId();
    const normalized = [...new Set(codesInput.map((c) => normalizeProductCode(c)).filter(Boolean))];

    const stockByCode = {};
    const missing = [];

    for (const code of normalized) {
      const variant = await resolveVariantByProductCode(prisma, code, warehouseId);
      if (!variant) {
        missing.push(code);
        continue;
      }

      const { available } = await sumFreeAvailableForVariant(prisma, variant.variant_id, warehouseId);
      stockByCode[variant.product_code] = {
        available,
        productCode: variant.product_code,
        variant_id: variant.variant_id,
      };

      // Also key by requested code when bare base resolved to -1
      if (code !== variant.product_code) {
        stockByCode[code] = stockByCode[variant.product_code];
      }
    }

    if (missing.length) {
      logger.warn('[online-stock] batch missing productCodes', { missing, warehouseId });
    }

    return {
      warehouse_id: warehouseId,
      stock: stockByCode,
      missing,
    };
  },

  async reserve({ orderId, storefront, lines }) {
    const order_id = String(orderId || '').trim();
    const storefrontName = String(storefront || 'ecomm').trim().toLowerCase() || 'ecomm';
    if (!order_id) throw new AppError('orderId is required', 400, 'ORDER_ID_REQUIRED');

    const mergedLines = mergeLinesByProductCode(lines);
    if (!mergedLines.length) throw new AppError('lines must be a non-empty array', 400, 'LINES_REQUIRED');

    const fingerprint = linesFingerprint(mergedLines);
    const warehouseId = await AppSettingsService.resolveOnlineWarehouseId();

    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.onlineStockReservation.findUnique({
          where: { order_id },
          include: RESERVATION_INCLUDE,
        });

        if (existing) {
          if (existing.status === 'HELD') {
            const existingFp = linesFingerprint(
              existing.lines.map((l) => ({ productCode: l.product_code, quantity: l.quantity }))
            );
            if (existingFp === fingerprint) {
              return { idempotent: true, reservation: formatReservation(existing) };
            }
            throw new AppError(
              'orderId already has a different active reservation',
              409,
              'ORDER_RESERVATION_CONFLICT',
              { orderId: order_id, status: existing.status }
            );
          }
          throw new AppError(
            `orderId reservation is already ${existing.status}`,
            409,
            'ORDER_RESERVATION_NOT_HELD',
            { orderId: order_id, status: existing.status }
          );
        }

        const prepared = [];
        const insufficient = [];

        for (const line of mergedLines) {
          const variant = await resolveVariantByProductCode(tx, line.productCode, warehouseId);
          if (!variant) {
            insufficient.push({
              productCode: line.productCode,
              requested: line.quantity,
              available: 0,
              reason: 'PRODUCT_CODE_NOT_FOUND',
            });
            continue;
          }

          const { available, rows } = await sumFreeAvailableForVariant(tx, variant.variant_id, warehouseId);
          if (available < line.quantity) {
            insufficient.push({
              productCode: variant.product_code,
              requested: line.quantity,
              available,
              reason: 'INSUFFICIENT_STOCK',
            });
            continue;
          }

          prepared.push({
            productCode: variant.product_code,
            variant_id: variant.variant_id,
            quantity: line.quantity,
            rows,
          });
        }

        if (insufficient.length) {
          throw new AppError('Insufficient stock for one or more lines', 409, 'INSUFFICIENT_STOCK', {
            lines: insufficient,
          });
        }

        const lineCreates = [];
        for (const item of prepared) {
          const allocations = await allocateReserveOnRows(tx, item.rows, item.quantity);
          lineCreates.push({
            product_code: item.productCode,
            variant_id: item.variant_id,
            quantity: item.quantity,
            allocations,
          });
        }

        const created = await tx.onlineStockReservation.create({
          data: {
            order_id,
            storefront: storefrontName,
            status: 'HELD',
            warehouse_id: warehouseId,
            lines: { create: lineCreates },
          },
          include: RESERVATION_INCLUDE,
        });

        return { idempotent: false, reservation: formatReservation(created) };
      }, TX_OPTIONS);
    } catch (err) {
      if (err instanceof AppError) throw err;

      // Parallel reserve race on unique order_id — re-read for idempotent success.
      if (err?.code === 'P2002') {
        const existing = await prisma.onlineStockReservation.findUnique({
          where: { order_id },
          include: RESERVATION_INCLUDE,
        });
        if (existing?.status === 'HELD') {
          const existingFp = linesFingerprint(
            existing.lines.map((l) => ({ productCode: l.product_code, quantity: l.quantity }))
          );
          if (existingFp === fingerprint) {
            return { idempotent: true, reservation: formatReservation(existing) };
          }
        }
        throw new AppError(
          'orderId reservation conflict',
          409,
          'ORDER_RESERVATION_CONFLICT',
          { orderId: order_id }
        );
      }

      if (err?.code === 'P2034') {
        throw new AppError('Stock changed during reserve — retry', 409, 'STOCK_CONFLICT');
      }

      throw err;
    }
  },

  async release({ orderId, lines: optionalLines }) {
    const order_id = String(orderId || '').trim();
    if (!order_id) throw new AppError('orderId is required', 400, 'ORDER_ID_REQUIRED');

    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.onlineStockReservation.findUnique({
          where: { order_id },
          include: RESERVATION_INCLUDE,
        });

        if (!existing) {
          throw new AppError('Reservation not found for orderId', 404, 'RESERVATION_NOT_FOUND', {
            orderId: order_id,
          });
        }

        if (existing.status === 'RELEASED') {
          return { idempotent: true, reservation: formatReservation(existing) };
        }

        if (existing.status === 'COMMITTED') {
          throw new AppError(
            'Cannot release a committed (sold) reservation',
            409,
            'ORDER_ALREADY_COMMITTED',
            { orderId: order_id }
          );
        }

        // Optional partial release validation — full release by default (all held lines).
        if (Array.isArray(optionalLines) && optionalLines.length > 0) {
          const requestedFp = linesFingerprint(optionalLines);
          const heldFp = linesFingerprint(
            existing.lines.map((l) => ({ productCode: l.product_code, quantity: l.quantity }))
          );
          if (requestedFp !== heldFp) {
            throw new AppError(
              'Partial release is not supported — send full held lines or omit lines',
              400,
              'PARTIAL_RELEASE_NOT_SUPPORTED'
            );
          }
        }

        for (const line of existing.lines) {
          await applyAllocationDelta(tx, line.allocations, { release: true });
        }

        const updated = await tx.onlineStockReservation.update({
          where: { reservation_id: existing.reservation_id },
          data: {
            status: 'RELEASED',
            released_at: new Date(),
          },
          include: RESERVATION_INCLUDE,
        });

        return { idempotent: false, reservation: formatReservation(updated) };
      }, TX_OPTIONS);
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err?.code === 'P2034') {
        throw new AppError('Stock changed during release — retry', 409, 'STOCK_CONFLICT');
      }
      throw err;
    }
  },

  async commit({ orderId }) {
    const order_id = String(orderId || '').trim();
    if (!order_id) throw new AppError('orderId is required', 400, 'ORDER_ID_REQUIRED');

    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.onlineStockReservation.findUnique({
          where: { order_id },
          include: RESERVATION_INCLUDE,
        });

        if (!existing) {
          throw new AppError('Reservation not found for orderId', 404, 'RESERVATION_NOT_FOUND', {
            orderId: order_id,
          });
        }

        if (existing.status === 'COMMITTED') {
          return { idempotent: true, reservation: formatReservation(existing) };
        }

        if (existing.status === 'RELEASED') {
          throw new AppError(
            'Cannot commit a released reservation',
            409,
            'ORDER_ALREADY_RELEASED',
            { orderId: order_id }
          );
        }

        for (const line of existing.lines) {
          await applyAllocationDelta(tx, line.allocations, { commit: true });
        }

        const updated = await tx.onlineStockReservation.update({
          where: { reservation_id: existing.reservation_id },
          data: {
            status: 'COMMITTED',
            committed_at: new Date(),
          },
          include: RESERVATION_INCLUDE,
        });

        return { idempotent: false, reservation: formatReservation(updated) };
      }, TX_OPTIONS);
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err?.code === 'P2034') {
        throw new AppError('Stock changed during commit — retry', 409, 'STOCK_CONFLICT');
      }
      throw err;
    }
  },
};

module.exports = OnlineStockService;
