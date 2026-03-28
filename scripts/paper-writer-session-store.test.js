const os = require('os');
const path = require('path');
const fs = require('fs');
const { saveSession, loadSession, listSessions, deleteSession, validateTaskId } = require('./paper-writer-session-store');
const { startRun, advancePaperWriterPhase, pauseRun, attachArtifactToState } = require('./paper-writer-runtime-state');

const TEST_STORE_DIR = path.join(os.tmpdir(), `pw-session-store-test-${Date.now()}`);

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`✗ ${message}`);
    testsFailed += 1;
    throw new Error(message);
  }
}

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    testsPassed += 1;
  } catch (error) {
    console.error(`  ${error.message}`);
  }
}

function cleanup() {
  if (fs.existsSync(TEST_STORE_DIR)) {
    fs.rmSync(TEST_STORE_DIR, { recursive: true, force: true });
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function makeState(taskId, goal = 'test goal') {
  return startRun({ task_id: taskId, user_goal: goal, domain_focus: 'draft', recommended_next_agent: 'paper-drafter' });
}

// ── tests ─────────────────────────────────────────────────────────────────────

test('saveSession writes a JSON file and returns metadata', () => {
  const state = makeState('save-1');
  const result = saveSession(state, { storeDir: TEST_STORE_DIR });

  assert(result.task_id === 'save-1', 'save result should include task_id');
  assert(typeof result.file_path === 'string' && result.file_path.endsWith('.json'), 'save result should include file path');
  assert(typeof result.saved_at === 'string' && result.saved_at.length > 0, 'save result should include saved_at timestamp');
  assert(fs.existsSync(result.file_path), 'session file should exist on disk');
});

test('saveSession creates the store directory if it does not exist', () => {
  const freshDir = path.join(TEST_STORE_DIR, 'subdir-auto-create');
  assert(!fs.existsSync(freshDir), 'test dir should not exist before save');

  const state = makeState('save-2');
  saveSession(state, { storeDir: freshDir });

  assert(fs.existsSync(freshDir), 'store dir should be created automatically');
  assert(fs.existsSync(path.join(freshDir, 'save-2.json')), 'session file should be written');
});

test('saveSession throws when state has no task_id', () => {
  let threw = false;
  try {
    saveSession({ runStatus: 'running' }, { storeDir: TEST_STORE_DIR });
  } catch (e) {
    threw = true;
  }
  assert(threw, 'saveSession should throw when task_id is missing');
});

test('validateTaskId rejects path traversal input', () => {
  let threw = false;
  try {
    validateTaskId('../escape');
  } catch {
    threw = true;
  }

  assert(threw, 'validateTaskId should reject traversal-like task ids');
});

test('loadSession returns the original state after save', () => {
  const state = makeState('load-1', 'write related work');
  saveSession(state, { storeDir: TEST_STORE_DIR });

  const loaded = loadSession('load-1', { storeDir: TEST_STORE_DIR });

  assert(loaded !== null, 'loadSession should return the saved state');
  assert(loaded.task_id === 'load-1', 'loaded state should preserve task_id');
  assert(loaded.runStatus === 'running', 'loaded state should preserve runStatus');
  assert(loaded.routePacket.user_goal === 'write related work', 'loaded state should preserve user_goal');
  assert(loaded.routePacket.recommended_next_agent === 'paper-drafter', 'loaded state should preserve next agent');
});

test('loadSession preserves phaseHistory and activeArtifacts', () => {
  let state = makeState('load-2', 'draft introduction');
  state = advancePaperWriterPhase(state, 'draft', { owner: 'paper-drafter', inputArtifacts: ['goal'] });
  state = attachArtifactToState(state, {
    artifact_id: 'draft-load-2',
    artifact_type: 'chapter_draft',
    producer: 'paper-drafter',
    summary: 'introduction draft',
  });
  saveSession(state, { storeDir: TEST_STORE_DIR });

  const loaded = loadSession('load-2', { storeDir: TEST_STORE_DIR });

  assert(Array.isArray(loaded.phaseHistory) && loaded.phaseHistory.length === 1, 'phase history should be preserved');
  assert(loaded.phaseHistory[0].phase_name === 'draft', 'phase name should be preserved');
  assert(Array.isArray(loaded.activeArtifacts) && loaded.activeArtifacts.length === 1, 'active artifacts should be preserved');
  assert(loaded.activeArtifacts[0].artifact_id === 'draft-load-2', 'artifact id should be preserved');
});

test('loadSession preserves paused run with pending checkpoint', () => {
  let state = makeState('load-3', 'review chapter');
  state = pauseRun(state, {
    checkpoint_type: 'review',
    checkpoint_level: 'hard',
    current_phase: 'review',
    why_pause: 'review needs confirmation',
    current_result_summary: 'risky claims found',
    recommended_action: 'revise draft',
  });
  saveSession(state, { storeDir: TEST_STORE_DIR });

  const loaded = loadSession('load-3', { storeDir: TEST_STORE_DIR });

  assert(loaded.runStatus === 'paused', 'paused run status should survive round-trip');
  assert(loaded.pendingCheckpoint !== null, 'pending checkpoint should survive round-trip');
  assert(loaded.pendingCheckpoint.checkpoint_type === 'review', 'checkpoint type should be preserved');
  assert(loaded.lifecycle.pausedAt !== null, 'pausedAt timestamp should be preserved');
});

test('loadSession returns null for unknown task_id', () => {
  const loaded = loadSession('does-not-exist', { storeDir: TEST_STORE_DIR });
  assert(loaded === null, 'loadSession should return null for missing session');
});

test('listSessions returns saved sessions sorted by saved_at descending', () => {
  const storeDir = path.join(TEST_STORE_DIR, 'list-test');

  saveSession(makeState('list-a', 'goal a'), { storeDir });
  saveSession(makeState('list-b', 'goal b'), { storeDir });
  saveSession(makeState('list-c', 'goal c'), { storeDir });

  const sessions = listSessions({ storeDir });

  assert(sessions.length === 3, 'should list all 3 saved sessions');
  assert(sessions.every((s) => typeof s.task_id === 'string'), 'each entry should have a task_id');
  assert(sessions.every((s) => typeof s.saved_at === 'string'), 'each entry should have saved_at');
  assert(sessions.every((s) => typeof s.run_status === 'string'), 'each entry should have run_status');
  assert(sessions.every((s) => typeof s.current_phase === 'string'), 'each entry should expose current_phase');
  assert(sessions.every((s) => s.user_goal !== undefined), 'each entry should expose user_goal');
  // most recent first: list-c >= list-b >= list-a
  const ids = sessions.map((s) => s.task_id);
  const idxA = ids.indexOf('list-a');
  const idxC = ids.indexOf('list-c');
  assert(idxC <= idxA, 'list-c should appear before list-a (more recent)');
});

test('listSessions returns empty array when store dir does not exist', () => {
  const sessions = listSessions({ storeDir: path.join(TEST_STORE_DIR, 'nonexistent') });
  assert(Array.isArray(sessions) && sessions.length === 0, 'should return empty array for missing store dir');
});

test('deleteSession removes the file and returns true', () => {
  const storeDir = path.join(TEST_STORE_DIR, 'delete-test');
  saveSession(makeState('del-1'), { storeDir });

  const deleted = deleteSession('del-1', { storeDir });

  assert(deleted === true, 'deleteSession should return true when file existed');
  assert(!fs.existsSync(path.join(storeDir, 'del-1.json')), 'session file should be gone after delete');
  assert(loadSession('del-1', { storeDir }) === null, 'loadSession should return null after delete');
});

test('deleteSession returns false for unknown task_id', () => {
  const deleted = deleteSession('never-saved', { storeDir: TEST_STORE_DIR });
  assert(deleted === false, 'deleteSession should return false when file did not exist');
});

test('loadSession rejects invalid task ids instead of resolving arbitrary paths', () => {
  let threw = false;
  try {
    loadSession('../../etc/passwd', { storeDir: TEST_STORE_DIR });
  } catch {
    threw = true;
  }

  assert(threw, 'loadSession should reject invalid task ids');
});

test('saveSession overwrites an existing session', () => {
  const storeDir = path.join(TEST_STORE_DIR, 'overwrite-test');
  let state = makeState('overwrite-1', 'original goal');
  saveSession(state, { storeDir });

  state = advancePaperWriterPhase(state, 'draft', { owner: 'paper-drafter' });
  saveSession(state, { storeDir });

  const loaded = loadSession('overwrite-1', { storeDir });
  assert(loaded.phaseHistory.length === 1, 'overwritten session should reflect updated state');
  assert(loaded.routePacket.current_phase === 'draft', 'current phase should be updated after overwrite');
});

// ── teardown ──────────────────────────────────────────────────────────────────

cleanup();
console.log(`\n${testsPassed} tests passed${testsFailed > 0 ? `, ${testsFailed} failed` : ''}!`);
process.exit(testsFailed > 0 ? 1 : 0);
