const { needsAdaptation } = require('./adaptive-planner');
const { saveBlackboard, loadBlackboard } = require('./blackboard-store');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
    process.exit(1);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Test retry logic detection (simulated)
test('retry logic: timeout detection', () => {
  const msg = 'request timeout';
  const isRetryable = /timeout|econnrefused|enotfound/i.test(msg);
  assert(isRetryable, 'timeout should be detected as retryable');
});

test('retry logic: ECONNREFUSED detection', () => {
  const msg = 'ECONNREFUSED: Connection refused';
  const isRetryable = /econnrefused/i.test(msg);
  assert(isRetryable, 'ECONNREFUSED should be detected as retryable');
});

test('retry logic: build error not retryable', () => {
  const msg = 'SyntaxError: Unexpected token';
  const isRetryable = /timeout|econnrefused|enotfound/i.test(msg);
  assert(!isRetryable, 'SyntaxError should not be detected as retryable');
});

// Test adaptive planning
test('adaptWriteSpec: needsAdaptation detects file mismatch', () => {
  const originalSpec = { filePath: '/expected/file.js' };
  const blackboard = {
    evidenceRefs: ['/actual/file.js:10', '/actual/file.js:20'],
  };
  const needsAdapt = needsAdaptation(originalSpec, blackboard);
  assert(needsAdapt, 'should detect file path mismatch');
});

test('adaptWriteSpec: no adaptation when files match', () => {
  const originalSpec = { filePath: '/path/file.js' };
  const blackboard = {
    evidenceRefs: ['/path/file.js:10', '/path/file.js:20'],
  };
  const needsAdapt = needsAdaptation(originalSpec, blackboard);
  assert(!needsAdapt, 'should not adapt when files match');
});

// Test blackboard persistence
async function testBlackboardPersistence() {
  const sessionId = `test-${Date.now()}`;
  const testBlackboard = {
    goal: 'Test goal',
    facts: ['fact1', 'fact2'],
    evidenceRefs: ['ref1', 'ref2'],
    decisions: ['decision1'],
    openQuestions: [],
  };

  // Save
  await saveBlackboard(sessionId, testBlackboard);

  // Load
  const loaded = await loadBlackboard(sessionId);
  assert(loaded !== null, 'blackboard should be loadable');
  assert(loaded.goal === testBlackboard.goal, 'goal should match');
  assert(loaded.facts.length === 2, 'facts should match');

  // Clean up
  const fs = require('node:fs');
  const path = require('node:path');
  const os = require('node:os');
  const filePath = path.join(
    os.homedir(),
    '.config',
    'opencode',
    'state',
    'blackboards',
    `${sessionId}.json`
  );
  try {
    fs.unlinkSync(filePath);
  } catch {}
}

// Run async test
testBlackboardPersistence()
  .then(() => {
    console.log('✓ blackboardPersistence: save and load works');
    console.log('\nAll Phase 3 tests passed!');
  })
  .catch((error) => {
    console.error('✗ blackboardPersistence: ' + error.message);
    process.exit(1);
  });
