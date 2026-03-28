const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const DEFAULT_STORE_DIR = path.join(__dirname, '..', '.paper-writer-sessions');
const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function resolveStoreDir(options = {}) {
  return path.resolve(options.storeDir || DEFAULT_STORE_DIR);
}

function validateTaskId(taskId) {
  const normalized = typeof taskId === 'string' ? taskId.trim() : '';
  if (!normalized) {
    throw new Error('taskId is required');
  }
  if (!TASK_ID_PATTERN.test(normalized)) {
    throw new Error(`invalid taskId: ${taskId}`);
  }
  return normalized;
}

function sessionFilePath(storeDir, taskId) {
  const safeTaskId = validateTaskId(taskId);
  const normalizedStoreDir = resolveStoreDir({ storeDir });
  const filePath = path.resolve(normalizedStoreDir, `${safeTaskId}.json`);
  const relative = path.relative(normalizedStoreDir, filePath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`resolved session path escapes store dir: ${safeTaskId}`);
  }

  return filePath;
}

function ensureStoreDir(storeDir) {
  if (!fs.existsSync(storeDir)) {
    fs.mkdirSync(storeDir, { recursive: true, mode: 0o700 });
  }
}

/**
 * Persist a runtime state object to disk.
 * Overwrites any existing file for the same task_id.
 */
function saveSession(state, options = {}) {
  const storeDir = resolveStoreDir(options);
  ensureStoreDir(storeDir);

  const taskId = validateTaskId(state.task_id);
  if (!taskId) {
    throw new Error('saveSession: state.task_id is required');
  }

  const filePath = sessionFilePath(storeDir, taskId);
  const record = {
    task_id: taskId,
    saved_at: new Date().toISOString(),
    run_status: state.runStatus,
    state,
  };

  const tempPath = path.join(storeDir, `.${taskId}.${process.pid}.${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(tempPath, JSON.stringify(record, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, filePath);
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }

  return { task_id: taskId, file_path: filePath, saved_at: record.saved_at };
}

/**
 * Load a previously saved session by task_id.
 * Returns the runtime state object, or null if not found.
 */
function loadSession(taskId, options = {}) {
  const storeDir = resolveStoreDir(options);
  const filePath = sessionFilePath(storeDir, taskId);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const record = JSON.parse(raw);
  return record.state;
}

/**
 * List all saved sessions as brief metadata entries.
 * Returns array sorted by saved_at descending (most recent first).
 */
function listSessions(options = {}) {
  const storeDir = resolveStoreDir(options);

  if (!fs.existsSync(storeDir)) {
    return [];
  }

  const files = fs.readdirSync(storeDir).filter((f) => f.endsWith('.json'));

  const entries = files.map((file) => {
    const filePath = path.join(storeDir, file);
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const record = JSON.parse(raw);
      return {
        task_id: record.task_id,
        run_status: record.run_status,
        saved_at: record.saved_at,
        current_phase: record.state?.routePacket?.current_phase || 'unknown',
        user_goal: record.state?.routePacket?.user_goal || null,
      };
    } catch {
      return null;
    }
  }).filter(Boolean);

  return entries.sort((a, b) => (b.saved_at > a.saved_at ? 1 : -1));
}

/**
 * Delete a saved session by task_id.
 * Returns true if deleted, false if it didn't exist.
 */
function deleteSession(taskId, options = {}) {
  const storeDir = resolveStoreDir(options);
  const filePath = sessionFilePath(storeDir, taskId);

  if (!fs.existsSync(filePath)) {
    return false;
  }

  fs.unlinkSync(filePath);
  return true;
}

module.exports = {
  DEFAULT_STORE_DIR,
  validateTaskId,
  saveSession,
  loadSession,
  listSessions,
  deleteSession,
};
