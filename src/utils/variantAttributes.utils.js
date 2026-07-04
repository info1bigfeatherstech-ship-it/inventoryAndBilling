/**
 * Normalizes variant attribute payloads for storage and display.
 * Storage shape: [{ key: string, value: string }, ...] or null when empty.
 */

const isNonEmptyString = (value) =>
  value != null && String(value).trim().length > 0;

/**
 * Parse attributes from API body, CSV, or legacy string formats.
 * @param {unknown} raw
 * @returns {Array<{ key: string, value: string }>|null}
 */
const parseAttributes = (raw) => {
  if (raw === null || raw === undefined || raw === '') return null;

  if (Array.isArray(raw)) {
    const normalized = raw
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const key = isNonEmptyString(entry.key) ? String(entry.key).trim() : '';
        const value = isNonEmptyString(entry.value) ? String(entry.value).trim() : '';
        if (!key || !value) return null;
        return { key, value };
      })
      .filter(Boolean);
    return normalized.length ? normalized : null;
  }

  if (typeof raw === 'object') {
    const normalized = Object.entries(raw)
      .map(([key, value]) => {
        const k = isNonEmptyString(key) ? String(key).trim() : '';
        const v = isNonEmptyString(value) ? String(value).trim() : '';
        if (!k || !v) return null;
        return { key: k, value: v };
      })
      .filter(Boolean);
    return normalized.length ? normalized : null;
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    try {
      const parsed = JSON.parse(trimmed);
      return parseAttributes(parsed);
    } catch {
      // key:value pairs separated by |  e.g. Color:Red|Size:M
      const pairs = trimmed.split('|').map((p) => p.trim()).filter(Boolean);
      const normalized = pairs
        .map((pair) => {
          const [key, ...rest] = pair.split(':');
          const k = key?.trim() || '';
          const v = rest.join(':').trim();
          if (!k || !v) return null;
          return { key: k, value: v };
        })
        .filter(Boolean);
      return normalized.length ? normalized : null;
    }
  }

  return null;
};

/**
 * @param {unknown} raw
 * @returns {Array<{ key: string, value: string }>|null}
 */
const sanitizeAttributesForStorage = (raw) => parseAttributes(raw);

/**
 * Human-readable single-line label for invoices and pickers.
 * @param {unknown} raw
 * @param {{ separator?: string, maxLength?: number }} [options]
 * @returns {string}
 */
const formatAttributesDisplay = (raw, { separator = ', ', maxLength } = {}) => {
  const parsed = parseAttributes(raw);
  if (!parsed?.length) return '';

  let text = parsed.map(({ key, value }) => `${key}: ${value}`).join(separator);
  if (maxLength && text.length > maxLength) {
    return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
  }
  return text;
};

module.exports = {
  parseAttributes,
  sanitizeAttributesForStorage,
  formatAttributesDisplay,
};
