const { body, param, query } = require('express-validator');

const EXPENSE_CATEGORIES = ['RENT', 'UTILITIES', 'FREIGHT', 'LABOUR', 'TRANSPORT', 'OFFICE', 'REPAIRS', 'OTHER'];
const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER'];

const expenseIdParam = [param('expenseId').isString().trim().notEmpty()];

const listExpensesValidator = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
  query('warehouse_id').optional().isString().trim(),
  query('category').optional().isIn(EXPENSE_CATEGORIES),
  query('search').optional().isString().trim().isLength({ max: 200 }),
  query('from_date').optional().isISO8601().toDate(),
  query('to_date').optional().isISO8601().toDate(),
];

const createExpenseValidator = [
  body('warehouse_id').optional().isString().trim(),
  body('category').isIn(EXPENSE_CATEGORIES),
  body('description').isString().trim().isLength({ min: 2, max: 500 }),
  body('amount').isFloat({ min: 0.01 }),
  body('expense_date').optional().isISO8601().toDate(),
  body('payment_method').optional({ nullable: true }).isIn(PAYMENT_METHODS),
  body('reference_no').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
];

const updateExpenseValidator = [
  ...expenseIdParam,
  body('category').optional().isIn(EXPENSE_CATEGORIES),
  body('description').optional().isString().trim().isLength({ min: 2, max: 500 }),
  body('amount').optional().isFloat({ min: 0.01 }),
  body('expense_date').optional().isISO8601().toDate(),
  body('payment_method').optional({ nullable: true }).isIn(PAYMENT_METHODS),
  body('reference_no').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
  body('remarks').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
];

module.exports = {
  expenseIdParam,
  listExpensesValidator,
  createExpenseValidator,
  updateExpenseValidator,
};
