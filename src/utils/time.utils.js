const durationRegex = /^(\d+)\s*([smhd])$/i;

const durationToMs = (durationValue) => {
  if (typeof durationValue === 'number' && Number.isFinite(durationValue) && durationValue > 0) {
    return durationValue;
  }

  if (typeof durationValue !== 'string') {
    return null;
  }

  const normalized = durationValue.trim();
  const match = normalized.match(durationRegex);
  if (!match) return null;

  const value = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(value) || value <= 0) return null;

  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * multipliers[unit];
};

module.exports = {
  durationToMs,
};
