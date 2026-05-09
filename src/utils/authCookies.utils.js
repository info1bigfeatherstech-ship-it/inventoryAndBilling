const config = require('../config/index.config');
const { durationToMs } = require('./time.utils');

const REFRESH_COOKIE_NAME = 'refresh_token';

const getRefreshCookieOptions = () => {
  const maxAgeMs = durationToMs(config.JWT_REFRESH_EXPIRES_IN) || 30 * 24 * 60 * 60 * 1000;
  const sameSite = config.isProduction ? 'strict' : 'lax';

  const options = {
    httpOnly: true,
    secure: config.isProduction,
    sameSite,
    maxAge: maxAgeMs,
    path: '/api/v1/auth',
  };

  if (config.COOKIE_DOMAIN) {
    options.domain = config.COOKIE_DOMAIN;
  }

  return options;
};

module.exports = {
  REFRESH_COOKIE_NAME,
  getRefreshCookieOptions,
};
