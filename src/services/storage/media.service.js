const config = require('../../config/index.config');
const { AppError } = require('../../middlewares/error.middleware');
const CloudinaryService = require('./cloudinary.service');
const R2Service = require('./r2.service');

const MAX_IMAGES_PER_VARIANT = 4;

const PROVIDER_MAP = {
  cloudinary: {
    enum: 'CLOUDINARY',
    service: CloudinaryService,
    isReady: () =>
      Boolean(config.CLOUDINARY_CLOUD_NAME && config.CLOUDINARY_API_KEY && config.CLOUDINARY_API_SECRET),
  },
  cloudflare_r2: {
    enum: 'CLOUDFLARE_R2',
    service: R2Service,
    isReady: () =>
      Boolean(
        config.R2_ENDPOINT &&
          config.R2_BUCKET &&
          config.R2_ACCESS_KEY_ID &&
          config.R2_SECRET_ACCESS_KEY
      ),
  },
};

const resolveActiveProvider = () => {
  const preferred = config.MEDIA_PROVIDER;
  const entry = PROVIDER_MAP[preferred];

  if (!entry) {
    throw new AppError(`Invalid MEDIA_PROVIDER: ${preferred}`, 500, 'INVALID_MEDIA_PROVIDER');
  }

  if (!entry.isReady()) {
    throw new AppError(
      `Media provider "${preferred}" is selected but not fully configured in environment`,
      503,
      'MEDIA_PROVIDER_MISCONFIGURED',
      { provider: preferred }
    );
  }

  return { key: preferred, ...entry };
};

const uploadVariantImage = async (params) => {
  const provider = resolveActiveProvider();
  const uploaded = await provider.service.uploadVariantImage(params);
  return {
    ...uploaded,
    storage_provider: provider.enum,
  };
};

const deleteStoredImage = async (storageProvider, storageKey) => {
  if (!storageKey) return;

  if (storageProvider === 'CLOUDINARY') {
    await CloudinaryService.deleteObject(storageKey);
    return;
  }

  if (storageProvider === 'CLOUDFLARE_R2') {
    await R2Service.deleteObject(storageKey);
  }
};

const getMediaStatus = () => {
  const active = config.MEDIA_PROVIDER;
  return {
    active_provider: active,
    cloudinary: {
      configured: PROVIDER_MAP.cloudinary.isReady(),
    },
    cloudflare_r2: {
      configured: PROVIDER_MAP.cloudflare_r2.isReady(),
      enabled_flag: config.R2_ENABLED,
    },
  };
};

module.exports = {
  MAX_IMAGES_PER_VARIANT,
  resolveActiveProvider,
  uploadVariantImage,
  deleteStoredImage,
  getMediaStatus,
};
