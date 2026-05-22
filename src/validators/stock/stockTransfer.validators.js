const { body } = require('express-validator');

const transferBaseRules = [
  body('variant_id').isString().trim().notEmpty(),
  body('quantity').isInt({ min: 1 }),
  body('batch_number').optional().isString().trim(),
  body('remarks').optional().isString().trim().isLength({ max: 500 }),
];

const whToShopValidator = [
  body('from_warehouse_id').optional().isString().trim().notEmpty(),
  body('to_shop_id').isString().trim().notEmpty(),
  ...transferBaseRules,
];

const whToWhValidator = [
  body('from_warehouse_id').optional().isString().trim().notEmpty(),
  body('to_warehouse_id').isString().trim().notEmpty(),
  body('room_zone').optional().isString().trim(),
  body('rack_shelf').optional().isString().trim(),
  body('position').optional({ nullable: true }).isString().trim(),
  ...transferBaseRules,
];

const shopToShopValidator = [
  body('from_shop_id').optional().isString().trim().notEmpty(),
  body('to_shop_id').isString().trim().notEmpty(),
  ...transferBaseRules,
];

const reconcileValidator = [
  body('warehouse_id').isString().trim().notEmpty(),
  body('variant_id').isString().trim().notEmpty(),
  body('physical_count').isInt({ min: 0 }),
  body('batch_number').optional().isString().trim(),
  body('reason').optional().isString().trim().isLength({ max: 500 }),
  body('remarks').optional().isString().trim().isLength({ max: 500 }),
];

module.exports = {
  whToShopValidator,
  whToWhValidator,
  shopToShopValidator,
  reconcileValidator,
};
