const successResponse = (res, req, options = {}) => {
  const {
    statusCode = 200,
    message = 'Request successful',
    data = null,
    meta = null,
  } = options;

  return res.status(statusCode).json({
    success: true,
    message,
    data,
    ...(meta ? { meta } : {}),
    requestId: req.id,
  });
};

const paginatedMeta = ({ page, limit, total }) => {
  const safePage = Number(page) > 0 ? Number(page) : 1;
  const safeLimit = Number(limit) > 0 ? Number(limit) : 10;
  const safeTotal = Number(total) >= 0 ? Number(total) : 0;
  const totalPages = Math.ceil(safeTotal / safeLimit) || 1;

  return {
    page: safePage,
    limit: safeLimit,
    total: safeTotal,
    totalPages,
  };
};

module.exports = {
  successResponse,
  paginatedMeta,
};
