const fs = require('fs');
const path = require('path');

const DEFAULT_STORE_DIR = path.join(__dirname, '..', '.paper-writer-sessions');

function resolveStoreDir(options = {}) {
  return options.storeDir || DEFAULT_STORE_DIR;
}

function sessionFilePath(storeDir, taskId) {
  return path.join(storeDir, `${taskId}.json`);
}

function ensureStoreDir(storeDir) {
  if (!fs.existsSync(storeDir)) {
    fs.mkdirSync(storeDir, { recursive: true });
  }
}

/**
 * Persist a runtime state object to disk.
 * Overwrites any existing file for the same task_id.
 */
function saveSession(state, options = {}) {
  const storeDir = resolveStoreDir(options);
  ensureStoreDir(storeDir);

  const taskId = state.task_id;
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

  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');
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
  saveSession,
  loadSession,
  listSessions,
  deleteSession,
};
