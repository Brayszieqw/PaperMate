import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_ROOT = 'C:\\Users\\ljx\\.config\\opencode\\日志\\hive-router\\plugin-audit\\raw';
const DEFAULT_STATE_FILE = path.join(path.dirname(__dirname), 'state', 'hive-audit.json');
const DEFAULT_MAX_BYTES = 512 * 1024;
const DEFAULT_MAX_QUEUE_ITEMS = 200;
const DEFAULT_FLUSH_INTERVAL_MS = 1000;
const MAX_TRACKED_SESSIONS = 1000;
const CACHE_PRUNE_INTERVAL = 100;
const PREVIEW_LIMIT = 2000;
const ITEM_LIMIT = 20;
const MAX_RECORD_BYTES = 64 * 1024;
const RUNTIME_STATE_VERSION = 1;
const STATUS_THROTTLE_MS = 2000;
const HOT_STATUS_THROTTLE_MS = 5000;
const BATCH_FLUSH_SIZE = 20;
const DEFAULT_HEALTH_WINDOW_SECONDS = 300;
const MAX_HEALTH_EVENTS = 500;
const EVENT_TYPES = new Set([
  'session.status',
  'session.error',
  'session.idle',
  'file.edited',
  'command.executed',
]);
const SECRET_KEY_RE = /(token|api[-_]?key|authorization|cookie|secret|password|passwd|bearer)/i;
const DIAGNOSTIC_EVENTS = new Set(['session.error', 'tool.execute.after', 'command.executed']);
const PATH_TOKEN_RE = /(?:[A-Za-z]:[\\/][^\s"'<>|]+|(?:\.{1,2}[\\/])?[^\s"'<>|]+\.(?:pem|crt|cer|key|p12|pfx|jks|keystore|npmrc|gitconfig|curlrc|conf|config|ini|cnf|json|yaml|yml))/gi;
const CERTIFICATE_ERROR_PATTERNS = [
  { code: 'unknown_certificate_verification_error', re: /unknown certificate verification error/i },
  { code: 'certificate_verify_failed', re: /certificate verify failed/i },
  { code: 'self_signed_certificate', re: /self[- ]signed certificate/i },
  { code: 'unable_to_get_local_issuer_certificate', re: /unable to get local issuer certificate/i },
  { code: 'unable_to_verify_first_certificate', re: /unable to verify the first certificate/i },
  { code: 'x509_unknown_authority', re: /x509: certificate signed by unknown authority/i },
  { code: 'tls_unknown_ca', re: /(?:tls|ssl)[^\n]{0,120}unknown ca/i },
  { code: 'ssl_certificate_problem', re: /ssl certificate problem/i },
];

function clip(text, limit = PREVIEW_LIMIT) {
  if (typeof text !== 'string') text = String(text ?? '');
  return text.length > limit ? `${text.slice(0, limit)}…[truncated ${text.length - limit} chars]` : text;
}

function redactString(text) {
  let out = clip(text)
    .replace(/(authorization\s*[:=]\s*)(bearer\s+)?[^\s,'";]+/gi, (_m, p1, p2 = '') => `${p1}${p2}[REDACTED]`)
    .replace(/(cookie\s*[:=]\s*)[^\n]+/gi, '$1[REDACTED]')
    .replace(/(["'](?:token|api[_-]?key|authorization|cookie|secret|password|passwd)["']\s*[:=]\s*["'])[^"']+(["'])/gi, '$1[REDACTED]$2')
    .replace(/([?&](?:token|api[_-]?key|auth|authorization|cookie|secret|password)\=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/((?:--?|\/)(?:token|api[_-]?key|authorization|cookie|secret|password|passwd)\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(/((?:token|api[_-]?key|authorization|cookie|secret|password|passwd)\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(/(^|\n)(\s*[A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD|COOKIE)[A-Z0-9_]*\s*=\s*)([^\n]+)/g, '$1$2[REDACTED]')
    .replace(/\b(?:sk|rk|pk|ghp|gho|ghu|github_pat|xox[baprs]|hf|ya29)_[A-Za-z0-9._-]{8,}\b/g, '[REDACTED]');
  return out.replace(/(\.env[^\s:=]*\s*[:=]\s*)[^\s,'";]+/gi, '$1[REDACTED]');
}

function preview(value, depth = 0, seen = new WeakSet()) {
  if (value == null) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`;
  if (depth >= 3) return '[MaxDepth]';
  if (typeof value !== 'object') return redactString(String(value));
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, ITEM_LIMIT).map((item) => preview(item, depth + 1, seen));
  const out = {};
  for (const key of Object.keys(value).slice(0, ITEM_LIMIT)) {
    out[key] = SECRET_KEY_RE.test(key) ? '[REDACTED]' : preview(value[key], depth + 1, seen);
  }
  return out;
}

function parseBoolean(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return fallback;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function loadConfig(env = process.env) {
  return {
    enabled: parseBoolean(env.HIVE_AUDIT_PLUGIN_ENABLED, true),
    verbose: parseBoolean(env.HIVE_AUDIT_PLUGIN_VERBOSE, false),
    root: typeof env.HIVE_AUDIT_PLUGIN_ROOT === 'string' && env.HIVE_AUDIT_PLUGIN_ROOT.trim() ? env.HIVE_AUDIT_PLUGIN_ROOT.trim() : DEFAULT_ROOT,
    stateFile: typeof env.HIVE_AUDIT_PLUGIN_STATE_FILE === 'string' && env.HIVE_AUDIT_PLUGIN_STATE_FILE.trim() ? env.HIVE_AUDIT_PLUGIN_STATE_FILE.trim() : DEFAULT_STATE_FILE,
    maxBytes: parsePositiveInt(env.HIVE_AUDIT_PLUGIN_MAX_BYTES, DEFAULT_MAX_BYTES),
    maxQueueItems: parsePositiveInt(env.HIVE_AUDIT_PLUGIN_MAX_QUEUE_ITEMS, DEFAULT_MAX_QUEUE_ITEMS),
    flushIntervalMs: parsePositiveInt(env.HIVE_AUDIT_PLUGIN_FLUSH_INTERVAL_MS, DEFAULT_FLUSH_INTERVAL_MS),
  };
}

function normalizeRuntimeState(input, fallbackEnabled, stateFile, source) {
  const enabled = parseBoolean(input?.enabled, fallbackEnabled);
  return {
    version: Number.isFinite(input?.version) ? input.version : RUNTIME_STATE_VERSION,
    enabled,
    updatedAt: typeof input?.updatedAt === 'string' ? input.updatedAt : null,
    updatedBy: typeof input?.updatedBy === 'string' ? input.updatedBy : source,
    stateFile,
    source,
  };
}

function loadRuntimeStateSync(config) {
  try {
    const raw = fsSync.readFileSync(config.stateFile, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeRuntimeState(parsed, config.enabled, config.stateFile, 'file');
  } catch {
    return normalizeRuntimeState(null, config.enabled, config.stateFile, 'default');
  }
}

async function persistRuntimeState(state, client, enabled, updatedBy) {
  const next = normalizeRuntimeState({
    version: RUNTIME_STATE_VERSION,
    enabled,
    updatedAt: new Date().toISOString(),
    updatedBy,
  }, enabled, state.config.stateFile, 'file');

  try {
    await fs.mkdir(path.dirname(state.config.stateFile), { recursive: true });
    await fs.writeFile(state.config.stateFile, `${JSON.stringify({
      version: next.version,
      enabled: next.enabled,
      updatedAt: next.updatedAt,
      updatedBy: next.updatedBy,
    }, null, 2)}\n`, 'utf8');
  } catch (error) {
    state.runtime = { ...next, source: 'memory' };
    await bestEffortLog(client, `failed to persist hive audit state: ${error?.message || error}`);
    return {
      runtime: state.runtime,
      persisted: false,
      error,
    };
  }

  state.runtime = next;
  return {
    runtime: state.runtime,
    persisted: true,
    error: null,
  };
}

function isAuditEnabled(state) {
  return !!state.runtime?.enabled;
}

function formatAuditStatus(state) {
  const lines = [
    `Hive audit logging is ${isAuditEnabled(state) ? 'enabled' : 'disabled'}.`,
    `State file: ${state.config.stateFile}`,
    `Log root: ${state.config.root}`,
    `State source: ${state.runtime?.source || 'unknown'}`,
  ];
  if (state.runtime?.updatedAt) lines.push(`Updated at: ${state.runtime.updatedAt}`);
  if (state.runtime?.updatedBy) lines.push(`Updated by: ${state.runtime.updatedBy}`);
  lines.push('Use hive_audit_control with action status, enable, disable, or toggle.');
  return lines.join('\n');
}

async function changeAuditState(state, client, nextEnabled, updatedBy) {
  const previousEnabled = isAuditEnabled(state);
  const result = await persistRuntimeState(state, client, nextEnabled, updatedBy);

  writeAuditRecord(state, createRecord('plugin.state.changed', 'plugin', {
    previousEnabled,
    nextEnabled,
    stateFile: state.config.stateFile,
    updatedBy,
  }, null, {
    previous_enabled: previousEnabled,
    enabled: nextEnabled,
    state_file: state.config.stateFile,
    persisted: result.persisted,
    error: result.error ? extractError(result.error) : undefined,
  }, state.config.verbose));
  scheduleFlush(state, client, true);

  if (!nextEnabled) await flush(state, client);

  return {
    previousEnabled,
    enabled: nextEnabled,
    persisted: result.persisted,
    stateFile: state.config.stateFile,
  };
}

function formatAuditChange(result) {
  const lines = [
    `Hive audit logging is now ${result.enabled ? 'enabled' : 'disabled'}.`,
    `State file: ${result.stateFile}`,
  ];
  if (!result.persisted) lines.push('Warning: state change is active for this process but was not persisted to disk.');
  return lines.join('\n');
}

function rememberHealthEvent(state, record) {
  if (!record) return;
  const errorMessage = typeof record?.error?.data?.message === 'string'
    ? record.error.data.message
    : typeof record?.error?.message === 'string'
      ? record.error.message
      : typeof record?.error === 'string'
        ? record.error
        : null;
  state.recentEvents.push({
    timestamp: record.timestamp || new Date().toISOString(),
    event: record.event || 'unknown',
    error: errorMessage ? clip(redactString(errorMessage), 500) : null,
  });
  if (state.recentEvents.length > MAX_HEALTH_EVENTS) {
    state.recentEvents.splice(0, state.recentEvents.length - MAX_HEALTH_EVENTS);
  }
}

function getHealthPacket(state, windowSeconds = DEFAULT_HEALTH_WINDOW_SECONDS) {
  const safeWindowSeconds = parsePositiveInt(windowSeconds, DEFAULT_HEALTH_WINDOW_SECONDS);
  const now = Date.now();
  const windowMs = safeWindowSeconds * 1000;
  const recentEvents = state.recentEvents.filter((record) => {
    const recordTime = new Date(record.timestamp).getTime();
    return Number.isFinite(recordTime) && now - recordTime <= windowMs;
  });

  const errorCount = recentEvents.filter((record) => record.event === 'session.error').length;
  const toolBeforeCount = recentEvents.filter((record) => record.event === 'tool.execute.before').length;
  const toolAfterCount = recentEvents.filter((record) => record.event === 'tool.execute.after').length;
  const pairedEventsComplete = toolBeforeCount === toolAfterCount;

  let pluginHealth = 'healthy';
  if (!isAuditEnabled(state)) {
    pluginHealth = 'unavailable';
  } else if (state.dropped > 0 || errorCount > 5 || !pairedEventsComplete) {
    pluginHealth = 'degraded';
  } else if (recentEvents.length === 0) {
    pluginHealth = 'unknown';
  }

  let telemetryGap = 'none';
  const missingSignals = [];
  if (!pairedEventsComplete) {
    const diff = Math.abs(toolBeforeCount - toolAfterCount);
    if (diff === 1) telemetryGap = 'minor';
    else if (diff <= 3) telemetryGap = 'major';
    else telemetryGap = 'critical';
    if (toolBeforeCount > toolAfterCount) missingSignals.push('tool.execute.after');
    if (toolAfterCount > toolBeforeCount) missingSignals.push('tool.execute.before');
  }
  if (state.dropped > 0 && telemetryGap === 'none') telemetryGap = 'major';

  const lastError = recentEvents.filter((record) => record.error).at(-1)?.error || null;
  const notes = [];
  if (state.queue.length > 0) notes.push(`queue has ${state.queue.length} pending records`);
  if (state.dropped > 0) notes.push(`queue dropped ${state.dropped} records`);
  if (state.runtime?.updatedAt) notes.push(`state updated at ${state.runtime.updatedAt}`);

  return {
    schema_version: 'plugin-telemetry-v1',
    plugin_name: 'hive-audit-plugin',
    plugin_health: pluginHealth,
    telemetry_gap: telemetryGap,
    heartbeat_ts: new Date().toISOString(),
    trace_window_s: safeWindowSeconds,
    trace_count: recentEvents.length,
    paired_events_complete: pairedEventsComplete,
    missing_signals: missingSignals,
    error_count: errorCount,
    timeout_count: 0,
    last_error: lastError,
    latency_p95_ms: null,
    last_trace_ts: recentEvents.at(-1)?.timestamp || null,
    user_disabled: !isAuditEnabled(state),
    queue_depth: state.queue.length,
    dropped_records: state.dropped,
    state_file: state.config.stateFile,
    log_root: state.config.root,
    notes,
  };
}

function formatHealthPacket(state, windowSeconds = DEFAULT_HEALTH_WINDOW_SECONDS) {
  return `${JSON.stringify(getHealthPacket(state, windowSeconds), null, 2)}\n`;
}

function uniqueLimited(items, limit = 10) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const text = String(item || '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

function extractStrings(value, out = [], seen = new WeakSet(), depth = 0) {
  if (value == null || out.length >= 40 || depth > 3) return out;
  if (typeof value === 'string') {
    out.push(clip(value, 400));
    return out;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    out.push(String(value));
    return out;
  }
  if (typeof value !== 'object') return out;
  if (seen.has(value)) return out;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value.slice(0, ITEM_LIMIT)) extractStrings(item, out, seen, depth + 1);
    return out;
  }
  for (const [key, item] of Object.entries(value).slice(0, ITEM_LIMIT)) {
    if (typeof item === 'string') out.push(`${key}: ${clip(item, 400)}`);
    else extractStrings(item, out, seen, depth + 1);
  }
  return out;
}

function cleanPathToken(value) {
  return String(value || '').replace(/^[`'"(\[]+|[`'"),;\]]+$/g, '').trim();
}

function matchPathTokens(text) {
  return (String(text || '').match(PATH_TOKEN_RE) || []).map(cleanPathToken).filter(Boolean);
}

function extractPathCandidatesFromStrings(strings) {
  const out = [];
  for (const text of strings.slice(0, ITEM_LIMIT * 2)) {
    if (!text) continue;
    out.push(...matchPathTokens(text));
  }
  return out;
}

function extractCommandText(source) {
  const candidates = [
    source?.input?.command,
    source?.input?.args?.command,
    source?.input?.args?.cmd,
    source?.input?.cmd,
    source?.input?.argv,
    source?.output?.command,
    source?.extra?.command,
    source?.event?.properties?.command,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

function extractWorkdirText(source) {
  const candidates = [
    source?.input?.cwd,
    source?.input?.workdir,
    source?.input?.args?.cwd,
    source?.input?.args?.workdir,
    source?.event?.properties?.cwd,
    source?.event?.properties?.workdir,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

function detectIssue(event, source) {
  if (!DIAGNOSTIC_EVENTS.has(event)) return null;
  const strings = extractStrings(source);
  const combined = strings.join('\n');
  if (!combined) return null;
  for (const pattern of CERTIFICATE_ERROR_PATTERNS) {
    const match = combined.match(pattern.re);
    if (!match) continue;
    const command = extractCommandText(source);
    const workdir = extractWorkdirText(source);
    const relatedFiles = uniqueLimited([
      ...extractPathCandidatesFromStrings(strings),
      ...matchPathTokens(command),
      ...matchPathTokens(workdir),
    ].map((item) => redactString(item)));
    return {
      category: 'certificate_verification',
      code: pattern.code,
      matched_text: redactString(match[0]),
      related_command: command ? redactString(clip(command, 400)) : undefined,
      related_workdir: workdir ? redactString(workdir) : undefined,
      related_files: relatedFiles.length ? relatedFiles : undefined,
    };
  }
  return null;
}

function pruneMapByAge(map, maxSize) {
  if (map.size <= maxSize) return;
  const entries = [...map.entries()].sort((a, b) => (a[1]?.lastSeen || 0) - (b[1]?.lastSeen || 0));
  for (const [key] of entries.slice(0, map.size - maxSize)) {
    map.delete(key);
  }
}

function cleanSessionID(value) {
  const text = String(value || 'session').replace(/[^a-zA-Z0-9_-]+/g, '_');
  return text || 'session';
}

function dayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function pickSessionID(...values) {
  return _pickSessionID(values, 0);
}

function _pickSessionID(values, depth) {
  if (depth > 4) return null;
  for (const value of values) {
    if (typeof value === 'string' && value) return value;
    if (value && typeof value === 'object') {
      if (typeof value.sessionID === 'string' && value.sessionID) return value.sessionID;
      if (typeof value.sessionId === 'string' && value.sessionId) return value.sessionId;
      if (typeof value.id === 'string' && value.id) return value.id;
      if (value.message && typeof value.message === 'object') {
        const nestedMessage = _pickSessionID([value.message], depth + 1);
        if (nestedMessage) return nestedMessage;
      }
      if (value.properties) {
        const nested = _pickSessionID([value.properties], depth + 1);
        if (nested) return nested;
      }
    }
  }
  return depth === 0 ? 'session' : null;
}

function extractError(error) {
  if (!error) return null;
  return preview(error);
}

async function bestEffortLog(client, message) {
  try {
    await client?.app?.log?.({
      body: {
        service: 'hive-audit-plugin',
        level: 'warn',
        message: redactString(message),
      },
    });
  } catch {
    try {
      await client?.app?.log?.(`[hive-audit-plugin] ${redactString(message)}`);
    } catch {}
  }
}

async function ensureFile(state, sessionID, day) {
  try {
    if (!day) day = dayStamp();
    const key = `${day}:${sessionID}`;
    const current = state.files.get(key);
    if (current) return current;
    const dir = path.join(state.config.root, day);
    await fs.mkdir(dir, { recursive: true });
    const prefix = `plugin-audit_${sessionID}_`;
    const entries = await fs.readdir(dir).catch(() => []);
    let index = 1;
    for (const entry of entries) {
      const match = entry.match(new RegExp(`^${prefix}(\\d{3})\\.jsonl$`));
      if (match) index = Math.max(index, Number(match[1]));
    }
    let file = path.join(dir, `${prefix}${String(index).padStart(3, '0')}.jsonl`);
    let size = await fs.stat(file).then((info) => info.size).catch(() => 0);
    if (size >= state.config.maxBytes) {
      index += 1;
      file = path.join(dir, `${prefix}${String(index).padStart(3, '0')}.jsonl`);
      size = await fs.stat(file).then((info) => info.size).catch(() => 0);
    }
    const result = { key, file, dir, index, size, lastSeen: Date.now() };
    state.files.set(key, result);
    return result;
  } catch (error) {
    console.error('[hive-audit-plugin] ensureFile failed:', error.message);
    return null;
  }
}

async function appendBatch(state, sessionID, lines, day) {
  try {
    const info = await ensureFile(state, sessionID, day);
    if (!info) return; // Skip if ensureFile failed
    let chunk = '';
    let chunkBytes = 0;
    for (const line of lines) {
      const bytes = Buffer.byteLength(line);
      if (chunk && info.size + chunkBytes + bytes > state.config.maxBytes) {
        await fs.appendFile(info.file, chunk, 'utf8');
        info.size += chunkBytes;
        info.index += 1;
        info.file = path.join(info.dir, `plugin-audit_${sessionID}_${String(info.index).padStart(3, '0')}.jsonl`);
        info.size = await fs.stat(info.file).then((data) => data.size).catch(() => 0);
        chunk = '';
        chunkBytes = 0;
      }
      if (!chunk && info.size + bytes > state.config.maxBytes) {
        info.index += 1;
        info.file = path.join(info.dir, `plugin-audit_${sessionID}_${String(info.index).padStart(3, '0')}.jsonl`);
        info.size = await fs.stat(info.file).then((data) => data.size).catch(() => 0);
      }
      chunk += line;
      chunkBytes += bytes;
    }
    if (chunk) {
      await fs.appendFile(info.file, chunk, 'utf8');
      info.size += chunkBytes;
    }
    info.lastSeen = Date.now();
  } catch (error) {
    console.error('[hive-audit-plugin] appendBatch failed:', error.message);
  }
}

function ensureFileSync(state, sessionID, day) {
  try {
    if (!day) day = dayStamp();
    const key = `${day}:${sessionID}`;
    const current = state.files.get(key);
    if (current) return current;
    const dir = path.join(state.config.root, day);
    fsSync.mkdirSync(dir, { recursive: true });
    const prefix = `plugin-audit_${sessionID}_`;
    const entries = fsSync.readdirSync(dir, { withFileTypes: false });
    let index = 1;
    for (const entry of entries) {
      const match = entry.match(new RegExp(`^${prefix}(\\d{3})\\.jsonl$`));
      if (match) index = Math.max(index, Number(match[1]));
    }
    let file = path.join(dir, `${prefix}${String(index).padStart(3, '0')}.jsonl`);
    let size = 0;
    try {
      size = fsSync.statSync(file).size;
    } catch {}
    if (size >= state.config.maxBytes) {
      index += 1;
      file = path.join(dir, `${prefix}${String(index).padStart(3, '0')}.jsonl`);
      try {
        size = fsSync.statSync(file).size;
      } catch {
        size = 0;
      }
    }
    const result = { key, file, dir, index, size, lastSeen: Date.now() };
    state.files.set(key, result);
    return result;
  } catch (error) {
    console.error('[hive-audit-plugin] ensureFileSync failed:', error.message);
    return null;
  }
}

function appendBatchSync(state, sessionID, lines, day) {
  try {
    const info = ensureFileSync(state, sessionID, day);
    if (!info) return; // Skip if ensureFileSync failed
    let chunk = '';
    let chunkBytes = 0;
    for (const line of lines) {
      const bytes = Buffer.byteLength(line);
      if (chunk && info.size + chunkBytes + bytes > state.config.maxBytes) {
        fsSync.appendFileSync(info.file, chunk, 'utf8');
        info.size += chunkBytes;
        info.index += 1;
        info.file = path.join(info.dir, `plugin-audit_${sessionID}_${String(info.index).padStart(3, '0')}.jsonl`);
        info.size = fsSync.existsSync(info.file) ? fsSync.statSync(info.file).size : 0;
        chunk = '';
        chunkBytes = 0;
      }
      if (!chunk && info.size + bytes > state.config.maxBytes) {
        info.index += 1;
        info.file = path.join(info.dir, `plugin-audit_${sessionID}_${String(info.index).padStart(3, '0')}.jsonl`);
        info.size = fsSync.existsSync(info.file) ? fsSync.statSync(info.file).size : 0;
      }
      chunk += line;
      chunkBytes += bytes;
    }
    if (chunk) {
      fsSync.appendFileSync(info.file, chunk, 'utf8');
      info.size += chunkBytes;
    }
    info.lastSeen = Date.now();
  } catch (error) {
    console.error('[hive-audit-plugin] appendBatchSync failed:', error.message);
  }
}

function queueOverflowRecord(sessionID, dropped, maxQueueItems) {
  return {
    timestamp: new Date().toISOString(),
    event: 'plugin.queue.dropped',
    sessionID,
    dropped,
    note: `Dropped ${dropped} plugin audit records because queue exceeded ${maxQueueItems}`,
  };
}

function pruneStateIfNeeded(state) {
  state.writeCount += 1;
  if (state.writeCount % CACHE_PRUNE_INTERVAL !== 0) return;
  pruneMapByAge(state.files, MAX_TRACKED_SESSIONS);
  pruneMapByAge(state.status, MAX_TRACKED_SESSIONS);
}

function createRecord(event, sessionID, input, output, extra, verbose = false, diagnosticsSource = null) {
  const issue = detectIssue(event, diagnosticsSource || { input, output, extra });
  const ts = new Date().toISOString();
  const record = {
    ...extra,
    timestamp: ts,
    event,
    sessionID,
    input_preview: preview(input),
    output_preview: preview(output),
  };
  if (issue) record.issue = issue;
  if (verbose) {
    record.verbose = true;
    record.pid = process.pid;
  }
  return record;
}

function statusThrottleMs(status) {
  return status === 'busy' || status === 'retry' ? HOT_STATUS_THROTTLE_MS : STATUS_THROTTLE_MS;
}

function statusSignature(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return String(value ?? 'unknown');
  const type = typeof value.type === 'string' ? value.type : 'unknown';
  const attempt = Number.isFinite(value.attempt) ? `:${value.attempt}` : '';
  return `${type}${attempt}`;
}

function shouldRecordStatus(state, sessionID, status) {
  const now = Date.now();
  const key = cleanSessionID(sessionID);
  const entry = state.status.get(key);
  if (!entry) {
    state.status.set(key, { status, at: now, suppressed: 0, lastSeen: now });
    return { record: true, suppressed: 0 };
  }

  if (entry.status === status && now - entry.at < statusThrottleMs(status)) {
    entry.suppressed += 1;
    entry.lastSeen = now;
    return { record: false, suppressed: entry.suppressed };
  }

  const suppressed = entry.suppressed;
  state.status.set(key, { status, at: now, suppressed: 0, lastSeen: now });
  return { record: true, suppressed };
}

function consumeSuppressedStatusCount(state, sessionID) {
  const key = cleanSessionID(sessionID);
  const entry = state.status.get(key);
  if (!entry || !entry.suppressed) return 0;
  const suppressed = entry.suppressed;
  entry.suppressed = 0;
  entry.lastSeen = Date.now();
  return suppressed;
}

function scheduleFlush(state, client, immediate = false) {
  if (state.flushTimer) return;
  const delay = immediate ? 0 : state.config.flushIntervalMs;
  state.flushTimer = setTimeout(() => {
    state.flushTimer = null;
    void flush(state, client);
  }, delay);
  state.flushTimer.unref?.();
}

async function flush(state, client) {
  if (state.flushing) {
    scheduleFlush(state, client);
    return;
  }
  if (!state.queue.length && !state.dropped) return;

  state.flushing = true;
  const items = state.queue.splice(0, state.queue.length);
  const dropped = state.dropped;
  state.dropped = 0;

  try {
    const perSession = new Map();
    const day = dayStamp();

    if (dropped > 0) {
      const sessionID = items[0]?.sessionID || 'session';
      const line = `${JSON.stringify(queueOverflowRecord(cleanSessionID(sessionID), dropped, state.config.maxQueueItems))}\n`;
      perSession.set(cleanSessionID(sessionID), [line]);
    }

    for (const record of items) {
      const sessionID = cleanSessionID(record.sessionID);
      const lines = perSession.get(sessionID) || [];
      lines.push(`${JSON.stringify(record)}\n`);
      perSession.set(sessionID, lines);
    }

    for (const [sessionID, lines] of perSession) {
      await appendBatch(state, sessionID, lines, day);
      const fileKey = `${day}:${sessionID}`;
      const fileEntry = state.files.get(fileKey);
      if (fileEntry) fileEntry.lastSeen = Date.now();
    }
    pruneStateIfNeeded(state);
  } catch (error) {
    await bestEffortLog(client, `flush failed: ${error?.message || error}`);
  } finally {
    state.flushing = false;
    if (state.queue.length || state.dropped) scheduleFlush(state, client, state.queue.length >= BATCH_FLUSH_SIZE);
  }
}

function flushSync(state) {
  if ((!state.queue.length && !state.dropped) || state.flushing) return;
  state.flushing = true;
  try {
    const items = state.queue.splice(0, state.queue.length);
    const dropped = state.dropped;
    state.dropped = 0;
    const perSession = new Map();
    const day = dayStamp();
    if (dropped > 0) {
      const sessionID = items[0]?.sessionID || 'session';
      const line = `${JSON.stringify(queueOverflowRecord(cleanSessionID(sessionID), dropped, state.config.maxQueueItems))}\n`;
      perSession.set(cleanSessionID(sessionID), [line]);
    }
    for (const record of items) {
      const sessionID = cleanSessionID(record.sessionID);
      const lines = perSession.get(sessionID) || [];
      lines.push(`${JSON.stringify(record)}\n`);
      perSession.set(sessionID, lines);
    }
    for (const [sessionID, lines] of perSession) {
      appendBatchSync(state, sessionID, lines, day);
    }
    pruneStateIfNeeded(state);
  } finally {
    state.flushing = false;
  }
}

function installShutdownFlush(state) {
  if (globalThis.__HIVE_AUDIT_PLUGIN_SHUTDOWN_INSTALLED__) return;
  globalThis.__HIVE_AUDIT_PLUGIN_SHUTDOWN_INSTALLED__ = true;
  const doFlush = () => {
    try {
      flushSync(state);
    } catch {}
  };
  const registerSignal = (signal) => {
    const exitCode = signal === 'SIGINT' ? 130 : 143;
    const handler = () => {
      doFlush();
      process.exitCode = exitCode;
      setImmediate(() => process.exit());
    };
    process.once(signal, handler);
  };
  process.once('beforeExit', doFlush);
  process.once('exit', doFlush);
  registerSignal('SIGINT');
  registerSignal('SIGTERM');
}

function writeAuditRecord(state, record) {
  if (!record) return;
  const serialized = JSON.stringify(record);
  if (Buffer.byteLength(serialized) > MAX_RECORD_BYTES) {
    record.input_preview = '[truncated: record too large]';
    record.output_preview = '[truncated: record too large]';
  }
  if (state.queue.length >= state.config.maxQueueItems) {
    state.dropped += 1;
    return;
  }
  state.queue.push(record);
  rememberHealthEvent(state, record);
}

async function HiveAuditPlugin({ client } = {}) {
  const config = loadConfig();

  const state = {
    config,
    runtime: loadRuntimeStateSync(config),
    files: new Map(),
    queue: [],
    recentEvents: [],
    dropped: 0,
    flushTimer: null,
    flushing: false,
    status: new Map(),
    writeCount: 0,
  };

  installShutdownFlush(state);

  let toolFactory = null;
  try {
    ({ tool: toolFactory } = await import('@opencode-ai/plugin/tool'));
    if (typeof toolFactory?.schema?.enum !== 'function') {
      toolFactory = null;
      await bestEffortLog(client, 'hive audit control tools unavailable: schema.enum is not supported by the installed plugin package');
    }
  } catch (error) {
    await bestEffortLog(client, `failed to load hive audit control tool support: ${error?.message || error}`);
  }

  const write = (record) => {
    if (!isAuditEnabled(state)) return;
    const serialized = JSON.stringify(record);
    if (Buffer.byteLength(serialized) > MAX_RECORD_BYTES) {
      record.input_preview = '[truncated: record too large]';
      record.output_preview = '[truncated: record too large]';
    }
    if (state.queue.length >= state.config.maxQueueItems) {
      state.dropped += 1;
      if (state.dropped === 1 || state.dropped % 50 === 0) {
        void bestEffortLog(client, `queue overflow: dropped ${state.dropped} plugin audit records`);
      }
      scheduleFlush(state, client, true);
      return;
    }

    state.queue.push(record);
    rememberHealthEvent(state, record);
    scheduleFlush(state, client, state.queue.length >= BATCH_FLUSH_SIZE);
  };

  const safeHook = (buildRecord) => async (input, output) => {
    if (!isAuditEnabled(state)) return;
    try {
      const record = buildRecord(input, output);
      if (record) write(record);
    } catch (error) {
      await bestEffortLog(client, `hook failed: ${error?.message || error}`);
    }
  };

  if (isAuditEnabled(state)) {
    write(createRecord('plugin.loaded', 'plugin', {
      root: config.root,
      stateFile: config.stateFile,
      maxBytes: config.maxBytes,
      maxQueueItems: config.maxQueueItems,
      flushIntervalMs: config.flushIntervalMs,
    }, null, {
      enabled: state.runtime.enabled,
      verbose: config.verbose,
      state_source: state.runtime.source,
    }, config.verbose));
  }

  const hooks = {
    event: safeHook(({ event }) => {
      if (!event || !EVENT_TYPES.has(event.type)) return null;
      const sessionID = pickSessionID(event);
      const status = event.type === 'session.status' ? preview(event.properties?.status) : undefined;
      let suppressed = 0;
      if (event.type === 'session.status') {
        const decision = shouldRecordStatus(state, sessionID, statusSignature(event.properties?.status));
        if (!decision.record) return null;
        suppressed = decision.suppressed;
      } else if (event.type === 'session.idle' || event.type === 'session.error') {
        suppressed = consumeSuppressedStatusCount(state, sessionID);
      }
      return createRecord(
        event.type,
        sessionID,
        config.verbose ? event.properties : {
          status,
          file: event.type === 'file.edited' ? event.properties?.file : undefined,
          command: event.type === 'command.executed' ? event.properties?.name : undefined,
        },
        null,
        {
          status,
          suppressed_status_count: suppressed || undefined,
          error: event.type === 'session.error' ? extractError(event.properties?.error) : undefined,
          file: event.type === 'file.edited' ? event.properties?.file : undefined,
          command: event.type === 'command.executed' ? event.properties?.name : undefined,
        },
        config.verbose,
        { event, input: event.properties, extra: { eventType: event.type } },
      );
    }),
    'permission.asked': safeHook((input, output) => createRecord('permission.asked', pickSessionID(input, output), config.verbose ? input : {
      permission: input?.permission,
      patterns: input?.patterns,
      metadata: input?.metadata,
    }, config.verbose ? output : {
      status: output?.status,
      reason: output?.reason,
    }, {
      permission: input?.permission,
      status: output?.status,
    }, config.verbose, { input, output })),
    'permission.replied': safeHook((input, output) => createRecord('permission.replied', pickSessionID(input, output), config.verbose ? input : {
      permission: input?.permission,
      status: input?.status,
      reason: input?.reason,
    }, config.verbose ? output : {
      status: output?.status,
      reason: output?.reason,
    }, {
      permission: input?.permission,
      status: output?.status ?? input?.status,
    }, config.verbose, { input, output })),
    'tool.execute.before': safeHook((input, output) => createRecord('tool.execute.before', pickSessionID(input), config.verbose ? input : {
      tool: input?.tool,
      callID: input?.callID,
    }, config.verbose ? output : null, {
      tool: input?.tool,
      callID: input?.callID,
    }, config.verbose)),
    'tool.execute.after': safeHook((input, output) => createRecord('tool.execute.after', pickSessionID(input), config.verbose ? input : {
      tool: input?.tool,
      callID: input?.callID,
    }, config.verbose ? output : {
      title: output?.title,
      ok: output?.ok,
    }, {
      tool: input?.tool,
      callID: input?.callID,
      title: output?.title,
    }, config.verbose, { input, output, extra: { tool: input?.tool, title: output?.title } })),
  };

  if (toolFactory) {
    hooks.tool = {
      hive_audit_control: toolFactory({
        description: 'Inspect or change local hive audit logging. Only use this when the user explicitly asks to enable, disable, toggle, or inspect audit logging.',
        args: {
          action: toolFactory.schema.enum(['status', 'enable', 'disable', 'toggle']).describe('The audit control action to perform.'),
        },
        async execute(args, context) {
          context.metadata({
            title: 'Hive audit control',
            metadata: { action: args.action },
          });

          if (args.action === 'status') return formatAuditStatus(state);

          const nextEnabled = args.action === 'toggle'
            ? !isAuditEnabled(state)
            : args.action === 'enable';

          const result = await changeAuditState(state, client, nextEnabled, `tool:${args.action}`);
          return formatAuditChange(result);
        },
      }),
      hive_audit_health: toolFactory({
        description: 'Show a compact health packet for hive audit logging, including queue state and recent hook coverage.',
        args: {
          windowSeconds: toolFactory.schema.number().int().positive().max(86400).optional().describe('Recent time window to inspect, in seconds. Defaults to 300.'),
        },
        async execute(args, context) {
          context.metadata({
            title: 'Hive audit health',
            metadata: { windowSeconds: args.windowSeconds || DEFAULT_HEALTH_WINDOW_SECONDS },
          });
          return formatHealthPacket(state, args.windowSeconds);
        },
      }),
    };
  }

  return hooks;
}

export default HiveAuditPlugin;
