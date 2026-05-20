const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { randomUUID } = require('crypto');
const path = require('path');
const config = require('../../config/index.config');
const { AppError } = require('../../middlewares/error.middleware');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

let s3Client = null;

const getClient = () => {
  const missing = [];
  if (!config.R2_ENDPOINT) missing.push('R2_ENDPOINT');
  if (!config.R2_BUCKET) missing.push('R2_BUCKET');
  if (!config.R2_ACCESS_KEY_ID) missing.push('R2_ACCESS_KEY_ID');
  if (!config.R2_SECRET_ACCESS_KEY) missing.push('R2_SECRET_ACCESS_KEY');

  if (missing.length) {
    throw new AppError(`Cloudflare R2 is not configured: ${missing.join(', ')}`, 503, 'R2_MISCONFIGURED');
  }

  if (!s3Client) {
    s3Client = new S3Client({
      region: 'auto',
      endpoint: config.R2_ENDPOINT,
      credentials: {
        accessKeyId: config.R2_ACCESS_KEY_ID,
        secretAccessKey: config.R2_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
    });
  }

  return s3Client;
};

const buildPublicUrl = (storageKey) => {
  const base = config.R2_PUBLIC_BASE_URL || '';
  if (base) return `${base.replace(/\/$/, '')}/${storageKey}`;
  return `${config.R2_ENDPOINT.replace(/\/$/, '')}/${config.R2_BUCKET}/${storageKey}`;
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

const uploadVariantImage = async ({ warehouseId, productId, variantId, file }) => {
  validateFile(file);

  const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
  const storageKey = `warehouses/${warehouseId}/products/${productId}/variants/${variantId}/${randomUUID()}${ext}`;

  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: config.R2_BUCKET,
      Key: storageKey,
      Body: file.buffer,
      ContentType: file.mimetype,
    })
  );

  return {
    url: buildPublicUrl(storageKey),
    storage_key: storageKey,
    storage_provider: 'CLOUDFLARE_R2',
  };
};

const deleteObject = async (storageKey) => {
  if (!storageKey) return;
  try {
    const client = getClient();
    await client.send(
      new DeleteObjectCommand({
        Bucket: config.R2_BUCKET,
        Key: storageKey,
      })
    );
  } catch {
    // Best-effort
  }
};

module.exports = {
  uploadVariantImage,
  deleteObject,
};
