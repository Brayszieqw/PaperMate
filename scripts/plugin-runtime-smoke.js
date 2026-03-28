const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const TMP_ROOT = path.join(ROOT, '.tmp-plugin-audit-min');
const STATE_FILE = path.join(TMP_ROOT, 'hive-audit-test-runtime.json');
const PLUGIN_PATH = path.join(ROOT, 'plugins', 'hive-audit-plugin.js');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  process.env.HIVE_AUDIT_PLUGIN_ROOT = TMP_ROOT;
  process.env.HIVE_AUDIT_PLUGIN_STATE_FILE = STATE_FILE;
  process.env.HIVE_AUDIT_PLUGIN_FLUSH_INTERVAL_MS = '20';
  process.env.HIVE_AUDIT_PLUGIN_ENABLED = 'true';

  const pluginModule = await import(pathToFileURL(PLUGIN_PATH).href);
  const plugin = pluginModule.default;
  const client = { app: { log: async () => {} } };
  const api = await plugin({ client });

  const sessionID = `runtime-test-${Date.now()}`;
  const toolContext = {
    sessionID,
    messageID: 'message-1',
    agent: 'smoke-test',
    directory: ROOT,
    worktree: ROOT,
    abort: new AbortController().signal,
    metadata() {},
    ask: async () => {},
  };

  await api.event({
    event: {
      type: 'session.status',
      sessionID,
      properties: { status: 'running' },
    },
  });

  await api['tool.execute.before']({ sessionID, tool: 'read', callID: 'call-1' });
  await api['tool.execute.after'](
    { sessionID, tool: 'read', callID: 'call-1' },
    { title: 'Read complete', ok: true }
  );
  await api.event({
    event: {
      type: 'command.executed',
      sessionID,
      properties: { name: 'git status', cwd: 'D:\\' },
    },
  });

  if (api['permission.asked']) {
    await api['permission.asked'](
      { sessionID, permission: 'bash', patterns: ['bash'], metadata: { source: 'smoke' } },
      { status: 'pending' }
    );
  }

  if (api['permission.replied']) {
    await api['permission.replied'](
      { sessionID, permission: 'bash', status: 'approved', reason: 'smoke' },
      { status: 'approved' }
    );
  }

  const controlStatus = api.tool?.hive_audit_control
    ? await api.tool.hive_audit_control.execute({ action: 'status' }, toolContext)
    : null;
  const disableResult = api.tool?.hive_audit_control
    ? await api.tool.hive_audit_control.execute({ action: 'disable' }, toolContext)
    : null;
  const enableResult = api.tool?.hive_audit_control
    ? await api.tool.hive_audit_control.execute({ action: 'enable' }, toolContext)
    : null;
  const healthPacketRaw = api.tool?.hive_audit_health
    ? await api.tool.hive_audit_health.execute({ windowSeconds: 300 }, toolContext)
    : null;
  const healthPacket = healthPacketRaw ? JSON.parse(healthPacketRaw) : null;

  await sleep(250);

  const day = new Date().toISOString().slice(0, 10);
  const dayDir = path.join(TMP_ROOT, day);
  const prefix = `plugin-audit_${sessionID}_`;
  const files = fs.existsSync(dayDir)
    ? fs.readdirSync(dayDir).filter((name) => name.startsWith(prefix) && name.endsWith('.jsonl'))
    : [];

  const parsed = [];
  for (const file of files) {
    const full = path.join(dayDir, file);
    const text = fs.readFileSync(full, 'utf8').trim();
    const lines = text ? text.split(/\r?\n/) : [];
    for (const line of lines) {
      try {
        parsed.push(JSON.parse(line));
      } catch {}
    }
  }

  const telemetryPacketFiles = fs.readdirSync(ROOT, { recursive: true })
    .filter((name) => typeof name === 'string' && /telemetry/i.test(name) && /runtime-test/i.test(name));

  const result = {
    plugin_loaded: true,
    session_id: sessionID,
    tmp_root: TMP_ROOT,
    state_file_exists: fs.existsSync(STATE_FILE),
    raw_audit_file_count: files.length,
    raw_audit_files: files,
    raw_record_count: parsed.length,
    event_types: [...new Set(parsed.map((item) => item?.event).filter(Boolean))],
    control_status: controlStatus,
    disable_result: disableResult,
    enable_result: enableResult,
    health_packet: healthPacket,
    telemetry_packet_produced: telemetryPacketFiles.length > 0,
    telemetry_packet_candidates: telemetryPacketFiles,
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
