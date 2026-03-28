const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const STATE_DIR = path.join(os.homedir(), '.papermate', 'state', 'blackboards');
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function validateSessionId(sessionId) {
  const normalized = typeof sessionId === 'string' ? sessionId.trim() : '';
  if (!normalized) throw new Error('sessionId is required');
  if (!SESSION_ID_PATTERN.test(normalized)) throw new Error(`invalid sessionId: ${sessionId}`);
  return normalized;
}

function safeFilePath(sessionId) {
  const safe = validateSessionId(sessionId);
  const filePath = path.resolve(STATE_DIR, `${safe}.json`);
  const relative = path.relative(STATE_DIR, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`session path escapes state dir: ${safe}`);
  }
  return filePath;
}

/**
 * Ensure state directory exists
 */
async function ensureStateDir() {
  await fs.promises.mkdir(STATE_DIR, { recursive: true, mode: 0o700 });
}

/**
 * Save blackboard to persistent storage
 * @param {string} sessionId - Unique session identifier
 * @param {object} blackboard - Blackboard snapshot
 */
async function saveBlackboard(sessionId, blackboard) {
  await ensureStateDir();
  const filePath = safeFilePath(sessionId);
  const data = {
    sessionId,
    timestamp: Date.now(),
    blackboard,
  };
  await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Load blackboard from persistent storage
 * @param {string} sessionId - Unique session identifier
 * @returns {object|null} Blackboard snapshot or null if not found
 */
async function loadBlackboard(sessionId) {
  const filePath = safeFilePath(sessionId);
  try {
    const text = await fs.promises.readFile(filePath, 'utf8');
    const data = JSON.parse(text);
    return data.blackboard || null;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Clean up old blackboard files (older than 7 days)
 */
async function cleanupOldBlackboards(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  await ensureStateDir();
  const entries = await fs.promises.readdir(STATE_DIR, { withFileTypes: true });
  const now = Date.now();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const filePath = path.join(STATE_DIR, entry.name);
    const stats = await fs.promises.stat(filePath);
    if (now - stats.mtimeMs > maxAgeMs) {
      await fs.promises.unlink(filePath).catch(() => {});
    }
  }
}

module.exports = {
  saveBlackboard,
  loadBlackboard,
  cleanupOldBlackboards,
  STATE_DIR,
};
