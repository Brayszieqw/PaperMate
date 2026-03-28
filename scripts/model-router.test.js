const { scoreWorker, scorePlan, routeModel, getTierLabel, MODEL_TIERS } = require('./model-router');

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

// Test routeModel
test('routeModel: score 0 routes to gpt-5.4', () => {
  const model = routeModel(0);
  assert(model === 'gpt-5.4', `expected gpt-5.4, got ${model}`);
});

test('routeModel: score 5 routes to gpt-5.4', () => {
  const model = routeModel(5);
  assert(model === 'gpt-5.4', `expected gpt-5.4, got ${model}`);
});

test('routeModel: score 10 routes to gpt-5.4', () => {
  const model = routeModel(10);
  assert(model === 'gpt-5.4', `expected gpt-5.4, got ${model}`);
});

test('routeModel: score 15 routes to gpt-5.4', () => {
  const model = routeModel(15);
  assert(model === 'gpt-5.4', `expected gpt-5.4, got ${model}`);
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
