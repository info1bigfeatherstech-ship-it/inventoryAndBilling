const { validationResult } = require('express-validator');
const { AppError } = require('./error.middleware');
const { humanizeValidationErrors } = require('../utils/validationMessage.utils');

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  const formatted = errors.array({ onlyFirstError: true }).map((err) => ({
    field: err.path,
    message: err.msg,
  }));

  const summary = humanizeValidationErrors(formatted);

  return next(
    new AppError(summary, 400, 'VALIDATION_ERROR', {
      fields: formatted,
    })
  );
};

module.exports = {
  validateRequest,
};
