const { scoreWorker, scorePlan, routeModel, routeTier, getTierLabel, TIERS } = require('./model-router');

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

// Test scoreWorker
test('scoreWorker: read_file returns 0', () => {
  const score = scoreWorker({ kind: 'read_file' });
  assert(score === 0, `expected 0, got ${score}`);
});

test('scoreWorker: grep returns 1', () => {
  const score = scoreWorker({ kind: 'grep' });
  assert(score === 1, `expected 1, got ${score}`);
});

test('scoreWorker: replace_text returns 8', () => {
  const score = scoreWorker({ kind: 'replace_text', filePath: '/path/to/file' });
  assert(score === 8, `expected 8, got ${score}`);
});

test('scoreWorker: write_batch returns high score', () => {
  const score = scoreWorker({ kind: 'write_batch' });
  assert(score >= 6, `expected >= 6, got ${score}`);
});

test('scoreWorker: synthesize returns high score', () => {
  const score = scoreWorker({ kind: 'synthesize' });
  assert(score >= 9, `expected >= 9, got ${score}`);
});

test('scoreWorker: score is capped at 15', () => {
  const score = scoreWorker({ kind: 'synthesize', filePath: '/a', path: '/b' });
  assert(score <= 15, `expected <= 15, got ${score}`);
});

// Test scorePlan
test('scorePlan: empty plan returns 0', () => {
  const score = scorePlan({ workers: [] });
  assert(score === 0, `expected 0, got ${score}`);
});

test('scorePlan: read-only plan returns low score', () => {
  const score = scorePlan({
    workers: [
      { kind: 'read_file' },
      { kind: 'grep' },
    ],
  });
  assert(score <= 3, `expected <= 3, got ${score}`);
});

test('scorePlan: write plan returns higher score', () => {
  const score = scorePlan({
    workers: [
      { kind: 'read_file' },
      { kind: 'replace_text', filePath: '/path' },
    ],
  });
  assert(score >= 5, `expected >= 5, got ${score}`);
});

// Test routeTier (replaces routeModel — no longer returns model names)
test('routeTier: score 0 is trivial', () => {
  assert(routeTier(0) === 'trivial', `expected trivial, got ${routeTier(0)}`);
});

test('routeTier: score 5 is simple', () => {
  assert(routeTier(5) === 'simple', `expected simple, got ${routeTier(5)}`);
});

test('routeTier: score 10 is complex', () => {
  assert(routeTier(10) === 'complex', `expected complex, got ${routeTier(10)}`);
});

test('routeTier: score 15 is hard', () => {
  assert(routeTier(15) === 'hard', `expected hard, got ${routeTier(15)}`);
});

test('routeModel: backward-compat alias returns tier label', () => {
  assert(routeModel(0) === 'trivial', `expected trivial, got ${routeModel(0)}`);
  assert(routeModel(15) === 'hard', `expected hard, got ${routeModel(15)}`);
});

// Test getTierLabel
test('getTierLabel: score 0 is trivial', () => {
  const label = getTierLabel(0);
  assert(label === 'trivial', `expected trivial, got ${label}`);
});

test('getTierLabel: score 5 is simple', () => {
  const label = getTierLabel(5);
  assert(label === 'simple', `expected simple, got ${label}`);
});

test('getTierLabel: score 8 is medium', () => {
  const label = getTierLabel(8);
  assert(label === 'medium', `expected medium, got ${label}`);
});

test('getTierLabel: score 11 is complex', () => {
  const label = getTierLabel(11);
  assert(label === 'complex', `expected complex, got ${label}`);
});

test('getTierLabel: score 15 is hard', () => {
  const label = getTierLabel(15);
  assert(label === 'hard', `expected hard, got ${label}`);
});

console.log('\nAll tests passed!');
