const { AppError } = require('../middlewares/error.middleware');

const parsePagination = (query = {}, defaults = {}) => {
  const defaultPage = defaults.page || 1;
  const defaultLimit = defaults.limit || 20;
  const maxLimit = defaults.maxLimit || 100;

  const page = Number(query.page || defaultPage);
  const limit = Number(query.limit || defaultLimit);

  if (!Number.isInteger(page) || page < 1) {
    throw new AppError('page must be a positive integer', 400, 'INVALID_PAGINATION');
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw new AppError(`limit must be between 1 and ${maxLimit}`, 400, 'INVALID_PAGINATION');
  }

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
  };
};

module.exports = {
  parsePagination,
};
