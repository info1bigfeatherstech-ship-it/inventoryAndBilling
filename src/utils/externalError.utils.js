const { AppError } = require('../errors/AppError');

const cloudinaryMessage = (err) => err?.message || err?.error?.message || '';

const mapCloudinaryError = (err) => {
  const raw = cloudinaryMessage(err);
  const httpCode = err?.http_code || err?.error?.http_code;

  if (/invalid signature/i.test(raw)) {
    return new AppError(
      'Image upload failed: Cloudinary API secret does not match your cloud name/key. In .env set CLOUDINARY_API_SECRET exactly as in the Cloudinary dashboard (no quotes, no spaces).',
      502,
      'CLOUDINARY_AUTH_FAILED'
    );
  }

  if (/unknown api key|unauthorized|401/i.test(raw) || httpCode === 401) {
    return new AppError(
      'Image upload failed: invalid Cloudinary API key or cloud name.',
      502,
      'CLOUDINARY_AUTH_FAILED'
    );
  }

  if (/file size too large|max bytes/i.test(raw)) {
    return new AppError('Image file is too large for Cloudinary (max 5MB).', 400, 'IMAGE_TOO_LARGE');
  }

  if (/invalid image|not allowed|format/i.test(raw)) {
    return new AppError('Invalid image file for Cloudinary upload.', 400, 'INVALID_IMAGE_TYPE');
  }

  return new AppError(
    'Image upload to Cloudinary failed. Try again or contact support.',
    502,
    'CLOUDINARY_UPLOAD_FAILED',
    process.env.NODE_ENV === 'development' ? { reason: raw.slice(0, 200) } : null
  );
};

const mapMulterError = (err) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return new AppError('File too large (max 5MB per image).', 400, 'IMAGE_TOO_LARGE');
  }
  if (err?.code === 'LIMIT_FILE_COUNT' || err?.code === 'LIMIT_UNEXPECTED_FILE') {
    return new AppError(err.message || 'Too many files in upload.', 400, 'UPLOAD_LIMIT_EXCEEDED');
  }
  if (err?.message?.includes('Invalid image type')) {
    return new AppError('Only JPEG, PNG, WebP, and GIF images are allowed.', 400, 'INVALID_IMAGE_TYPE');
  }
  if (err?.message?.includes('Only CSV')) {
    return new AppError('Only CSV files are allowed for bulk import.', 400, 'INVALID_FILE_TYPE');
  }
  return null;
};

const normalizeExternalError = (err) => {
  if (err instanceof AppError) return err;

  const multerMapped = mapMulterError(err);
  if (multerMapped) return multerMapped;

  const raw = cloudinaryMessage(err);
  if (raw && (/cloudinary|invalid signature|unknown api key/i.test(raw) || err?.http_code)) {
    return mapCloudinaryError(err);
  }

  return null;
};

module.exports = {
  mapCloudinaryError,
  mapMulterError,
  normalizeExternalError,
};
