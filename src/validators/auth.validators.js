const { body } = require('express-validator');

const normalizePhone = (value) => String(value || '').replace(/[^\d]/g, '');

const loginValidator = [
  body('phone')
    .customSanitizer(normalizePhone)
    .isLength({ min: 10, max: 10 })
    .withMessage('phone must be a 10-digit number'),
  body('password')
    .isString()
    .isLength({ min: 6, max: 128 })
    .withMessage('password must be between 6 and 128 characters'),
];

module.exports = {
  loginValidator,
};

