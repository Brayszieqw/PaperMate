let runtimeIdCounter = 0;

function asTrimmedString(value, fallback = '') {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? [...value] : [value];
}

function createRuntimeId(prefix = 'pw') {
  runtimeIdCounter += 1;
  return `${prefix}-${Date.now()}-${runtimeIdCounter}`;
}

module.exports = {
  asTrimmedString,
  asArray,
  createRuntimeId,
};
