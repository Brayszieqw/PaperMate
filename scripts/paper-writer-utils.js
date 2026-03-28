const { randomUUID } = require('crypto');

function asTrimmedString(value, fallback = '') {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? [...value] : [value];
}

function createRuntimeId(prefix = 'pw') {
  const normalizedPrefix = typeof prefix === 'string' && prefix.trim() ? prefix.trim() : 'pw';
  return `${normalizedPrefix}-${randomUUID()}`;
}

module.exports = {
  asTrimmedString,
  asArray,
  createRuntimeId,
};
