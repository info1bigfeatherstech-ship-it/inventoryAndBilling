const prisma = require('./prisma.utils');
const { AppError } = require('../errors/AppError');
const { assertBillWriteAccess, SHOP_BILLING_ROLES } = require('./billAccess.utils');
const { resolveOwnerShopId } = require('./transferRequest.utils');
const { getCreditNoteBalance } = require('./creditNote.utils');

const REDEEMABLE_STATUSES = new Set(['ACTIVE', 'PARTIALLY_REDEEMED']);

const normalizeMobile = (value) => {
  if (!value) return '';
  return String(value).replace(/\D/g, '').slice(-10);
};

const assertShopActive = async (shopId) => {
  const shop = await prisma.shop.findUnique({
    where: { shop_id: shopId },
    select: { shop_id: true, is_active: true },
  });
  if (!shop || !shop.is_active) {
    throw new AppError('Shop not found or inactive', 404, 'SHOP_NOT_FOUND');
  }
  return shop;
};

/**
 * User may look up / redeem credit notes at this billing counter (org-wide pool).
 */
const assertCreditNoteLookupAccess = async (user, redeemingShopId) => {
  if (['SUPER_ADMIN', 'WH_MANAGER', 'WH_STOCK_LISTER'].includes(user.role)) {
    if (redeemingShopId) await assertShopActive(redeemingShopId);
    return redeemingShopId || null;
  }

  let shopId = redeemingShopId;
  if (!shopId && user.role === 'SHOP_OWNER') {
    shopId = (await resolveOwnerShopId(user)) || user.shopId;
  }
  if (!shopId && SHOP_BILLING_ROLES.has(user.role)) {
    shopId = user.shopId;
  }
  if (!shopId) {
    throw new AppError('redeeming_shop_id is required', 400, 'REDEEMING_SHOP_ID_REQUIRED');
  }

  await assertBillWriteAccess(shopId, user);
  return shopId;
};

/**
 * Validate CN can be applied at redeeming shop (cross-shop allowed).
 */
const assertCreditNoteRedeemable = (cn, { customerId, customerMobile }) => {
  if (!REDEEMABLE_STATUSES.has(cn.status)) {
    throw new AppError(
      `Credit note ${cn.credit_note_number} is not available for redemption`,
      409,
      'CREDIT_NOTE_NOT_ACTIVE',
      { credit_note_id: cn.credit_note_id, status: cn.status }
    );
  }

  const balance = getCreditNoteBalance(cn);
  if (balance <= 0) {
    throw new AppError('Credit note has no remaining balance', 409, 'CREDIT_NOTE_NO_BALANCE');
  }

  if (cn.customer_id) {
    if (!customerId) {
      throw new AppError(
        'Select the customer on this bill to use this credit note',
        409,
        'CREDIT_NOTE_CUSTOMER_REQUIRED'
      );
    }
    if (cn.customer_id !== customerId) {
      throw new AppError('Credit note customer does not match bill customer', 409, 'CREDIT_NOTE_CUSTOMER_MISMATCH');
    }
  } else if (cn.customer_mobile) {
    const cnMobile = normalizeMobile(cn.customer_mobile);
    const billMobile = normalizeMobile(customerMobile);
    if (cnMobile && billMobile && cnMobile !== billMobile) {
      throw new AppError('Credit note mobile does not match bill customer', 409, 'CREDIT_NOTE_CUSTOMER_MISMATCH');
    }
  }
};

module.exports = {
  normalizeMobile,
  assertShopActive,
  assertCreditNoteLookupAccess,
  assertCreditNoteRedeemable,
  REDEEMABLE_STATUSES,
};
