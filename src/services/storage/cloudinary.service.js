const { v2: cloudinary } = require('cloudinary');
const config = require('../../config/index.config');
const { AppError } = require('../../middlewares/error.middleware');
const { mapCloudinaryError } = require('../../utils/externalError.utils');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

let configured = false;

const trimEnv = (value) => String(value || '').trim().replace(/^['"]|['"]$/g, '');

const ensureConfigured = () => {
  if (configured) return;

  const cloudName = trimEnv(config.CLOUDINARY_CLOUD_NAME);
  const apiKey = trimEnv(config.CLOUDINARY_API_KEY);
  const apiSecret = trimEnv(config.CLOUDINARY_API_SECRET);

  const missing = [];
  if (!cloudName) missing.push('CLOUDINARY_CLOUD_NAME');
  if (!apiKey) missing.push('CLOUDINARY_API_KEY');
  if (!apiSecret) missing.push('CLOUDINARY_API_SECRET');

  if (missing.length) {
    throw new AppError(`Cloudinary is not configured: ${missing.join(', ')}`, 503, 'CLOUDINARY_MISCONFIGURED');
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  configured = true;
};

const validateFile = (file) => {
  if (!file) throw new AppError('Image file is required', 400, 'IMAGE_REQUIRED');
  if (!ALLOWED_MIME.has(file.mimetype)) {
    throw new AppError('Only jpeg, png, webp, gif images are allowed', 400, 'INVALID_IMAGE_TYPE');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new AppError('Image size must be at most 5MB', 400, 'IMAGE_TOO_LARGE');
  }
};

const buildFolder = ({ warehouseId, productId, variantId }) =>
  `${trimEnv(config.CLOUDINARY_FOLDER) || 'vyaapar/products'}/wh-${warehouseId}/p-${productId}/v-${variantId}`;

const uploadVariantImage = async ({ warehouseId, productId, variantId, file }) => {
  validateFile(file);
  ensureConfigured();

  const folder = buildFolder({ warehouseId, productId, variantId });

  try {
    const result = await cloudinary.uploader.upload(
      `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
      {
        folder,
        resource_type: 'image',
      }
    );

    return {
      url: result.secure_url,
      storage_key: result.public_id,
      storage_provider: 'CLOUDINARY',
    };
  } catch (err) {
    throw mapCloudinaryError(err);
  }
};

const deleteObject = async (publicId) => {
  if (!publicId) return;
  ensureConfigured();
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch {
    // Best-effort delete — do not block DB consistency
  }
};

module.exports = {
  uploadVariantImage,
  deleteObject,
};
