const { v2: cloudinary } = require('cloudinary');
const config = require('../../config/index.config');
const { AppError } = require('../../middlewares/error.middleware');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

let configured = false;

const ensureConfigured = () => {
  if (configured) return;

  const missing = [];
  if (!config.CLOUDINARY_CLOUD_NAME) missing.push('CLOUDINARY_CLOUD_NAME');
  if (!config.CLOUDINARY_API_KEY) missing.push('CLOUDINARY_API_KEY');
  if (!config.CLOUDINARY_API_SECRET) missing.push('CLOUDINARY_API_SECRET');

  if (missing.length) {
    throw new AppError(`Cloudinary is not configured: ${missing.join(', ')}`, 503, 'CLOUDINARY_MISCONFIGURED');
  }

  cloudinary.config({
    cloud_name: config.CLOUDINARY_CLOUD_NAME,
    api_key: config.CLOUDINARY_API_KEY,
    api_secret: config.CLOUDINARY_API_SECRET,
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
  `${config.CLOUDINARY_FOLDER}/wh-${warehouseId}/p-${productId}/v-${variantId}`;

const uploadVariantImage = async ({ warehouseId, productId, variantId, file }) => {
  validateFile(file);
  ensureConfigured();

  const folder = buildFolder({ warehouseId, productId, variantId });

  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        use_filename: true,
        unique_filename: true,
      },
      (error, uploaded) => {
        if (error) return reject(error);
        return resolve(uploaded);
      }
    );
    stream.end(file.buffer);
  });

  return {
    url: result.secure_url,
    storage_key: result.public_id,
    storage_provider: 'CLOUDINARY',
  };
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
