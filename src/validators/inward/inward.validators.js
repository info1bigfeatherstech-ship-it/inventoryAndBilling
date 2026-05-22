const { body, param, query } = require('express-validator');

const INWARD_STATUSES = ['SCHEDULED', 'ARRIVED', 'MAPPED', 'CANCELLED'];

const inwardIdParam = [
  param('inwardId').isString().trim().notEmpty().withMessage('inwardId is required'),
];

const inwardItemIdParam = [
  ...inwardIdParam,
  param('inwardItemId').isString().trim().notEmpty().withMessage('inwardItemId is required'),
];

const inwardItemRules = [
  body('item_name').isString().trim().isLength({ min: 2, max: 200 }).withMessage('item_name must be 2-200 characters'),
  body('variant_text').optional({ nullable: true }).isString().trim().isLength({ max: 200 }),
  body('quantity_received').isInt({ min: 1 }).toInt().withMessage('quantity_received must be >= 1'),
  body('purchase_cost').optional({ nullable: true }).isFloat({ gt: 0 }).toFloat(),
  body('batch_number').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
  body('expiry_date').optional({ nullable: true }).isISO8601().toDate(),
  body('room_zone').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
  body('rack_shelf').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
  body('position').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
  body('mapped_product_id').optional({ nullable: true }).isString().trim().notEmpty(),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
];

const createInwardValidator = [
  body('vendor_id').isString().trim().notEmpty().withMessage('vendor_id is required'),
  body('warehouse_id').isString().trim().notEmpty().withMessage('warehouse_id is required'),
  body('expected_date').optional({ nullable: true }).isISO8601().toDate(),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
];

const updateArrivalDetailsValidator = [
  ...inwardIdParam,
  body('vendor_invoice_no').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
  body('challan_no').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
  body('transport_details').optional({ nullable: true }).isString().trim().isLength({ max: 300 }),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  body().custom((value) => {
    const hasAny = ['vendor_invoice_no', 'challan_no', 'transport_details', 'remarks']
      .some((k) => Object.prototype.hasOwnProperty.call(value || {}, k));
    if (!hasAny) {
      throw new Error('At least one arrival detail field is required');
    }
    return true;
  }),
];

const addInwardItemValidator = [
  ...inwardIdParam,
  ...inwardItemRules,
];

const bulkAddInwardItemsValidator = [
  ...inwardIdParam,
  body('items').isArray({ min: 1, max: 50 }).withMessage('items must be an array with 1-50 items'),
  body('items.*.item_name').isString().trim().notEmpty().withMessage('item_name is required for each item'),
  body('items.*.quantity_received').isInt({ min: 1 }).toInt().withMessage('quantity_received must be >= 1'),
  body('items.*.purchase_cost').optional({ nullable: true }).isFloat({ gt: 0 }).toFloat(),
  body('items.*.batch_number').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
  body('items.*.expiry_date').optional({ nullable: true }).isISO8601().toDate(),
  body('items.*.room_zone').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
  body('items.*.rack_shelf').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
  body('items.*.position').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
  body('items.*.variant_text').optional({ nullable: true }).isString().trim().isLength({ max: 200 }),
  body('items.*.mapped_product_id').optional({ nullable: true }).isString().trim().notEmpty(),
  body('items.*.remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
];



const updateInwardItemValidator = [
  ...inwardItemIdParam,
  body('item_name').optional().isString().trim().isLength({ min: 2, max: 200 }),
  body('variant_text').optional({ nullable: true }).isString().trim().isLength({ max: 200 }),
  body('quantity_received').optional().isInt({ min: 1 }).toInt(),
  body('purchase_cost').optional({ nullable: true }).isFloat({ gt: 0 }).toFloat(),
  body('batch_number').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
  body('expiry_date').optional({ nullable: true }).isISO8601().toDate(),
  body('room_zone').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
  body('rack_shelf').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
  body('position').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
  body('mapped_product_id').optional({ nullable: true }).isString().trim().notEmpty(),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
];

const updateInwardStatusValidator = [
  ...inwardIdParam,
  body('status').isIn(INWARD_STATUSES).withMessage(`status must be one of: ${INWARD_STATUSES.join(', ')}`),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
];

const listInwardsValidator = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('vendor_id').optional().isString().trim().notEmpty(),
  query('warehouse_id').optional().isString().trim().notEmpty(),
  query('status').optional().isIn(INWARD_STATUSES),
  query('search').optional().isString().trim().isLength({ min: 1, max: 200 }),
  query('expected_from').optional().isISO8601().toDate(),
  query('expected_to').optional().isISO8601().toDate(),
];

module.exports = {
  INWARD_STATUSES,
  inwardIdParam,
  inwardItemIdParam,
  createInwardValidator,
  updateArrivalDetailsValidator,
  addInwardItemValidator,
  updateInwardItemValidator,
  updateInwardStatusValidator,
  listInwardsValidator,
  bulkAddInwardItemsValidator,
};
