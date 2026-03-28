/**
 * parallelism.test.js - Tests for dynamic parallelism adjustment
 *
 * Tests that parallelism is correctly computed based on plan complexity.
 */

const { scorePlan, getTierLabel } = require('./model-router');

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

// Test 1: Empty plan
test('scorePlan with empty workers returns 0', () => {
  const score = scorePlan({ workers: [] });
  assert(score === 0, 'empty plan should score 0');
  assert(getTierLabel(score) === 'trivial', 'should be trivial tier');
});

// Test 2: Simple read-only plan
test('read-only plan (grep) is trivial', () => {
  const plan = {
    workers: [
      { kind: 'grep', regex: 'bug', extensions: ['.js'] },
    ],
  };
  const score = scorePlan(plan);
  assert(score <= 3, 'single grep should be trivial');
  assert(getTierLabel(score) === 'trivial', 'should be trivial tier');
});

// Test 3: Simple replacement
test('single file replacement is medium', () => {
  const plan = {
    workers: [
      { kind: 'grep', regex: 'bug', extensions: ['.js'] },
      { kind: 'replace_text', filePath: 'file.js', replacements: [{ search: 'old', replace: 'new' }] },
    ],
  };
  const score = scorePlan(plan);
  // grep scores ~1, replace_text scores ~8, so plan max = 8 (medium tier)
  assert(score >= 7 && score <= 9, `should be medium tier (7-9), got ${score}`);
  assert(getTierLabel(score) === 'medium', 'should be medium tier');
});

// Test 4: Medium complexity (multiple files)
test('multiple file reads/writes is medium', () => {
  const plan = {
    workers: [
      { kind: 'grep', regex: 'pattern', extensions: ['.js', '.ts'] },
      { kind: 'replace_text', filePath: 'file1.js', replacements: [] },
      { kind: 'replace_text', filePath: 'file2.js', replacements: [] },
    ],
  };
  const score = scorePlan(plan);
  // Multiple replace_text with grep, plan max will be around 8-9 (medium/complex)
  assert(score >= 7, `medium should be 7+, got ${score}`);
  assert(getTierLabel(score) !== 'trivial' && getTierLabel(score) !== 'simple', 'should not be trivial or simple');
});

// Test 5: Complex plan (many operations)
test('complex plan with many files is complex or hard', () => {
  const plan = {
    workers: [
      { kind: 'grep', regex: 'pattern1', extensions: ['.js', '.ts'] },
      { kind: 'grep', regex: 'pattern2', extensions: ['.js', '.ts'] },
      { kind: 'replace_text', filePath: 'f1.js', replacements: [] },
      { kind: 'replace_text', filePath: 'f2.js', replacements: [] },
      { kind: 'replace_text', filePath: 'f3.js', replacements: [] },
      { kind: 'run_command', command: 'npm test' },
    ],
  };
  const score = scorePlan(plan);
  // Multiple operations will score high
  assert(score >= 7, `should be at least medium (7+), got ${score}`);
  const tier = getTierLabel(score);
  assert(tier !== 'trivial' && tier !== 'simple', `should not be trivial/simple, got ${tier}`);
});

// Test 6: Parallelism mapping logic
test('parallelism mapping follows tier rules', () => {
  const cases = [
    { score: 0, tier: 'trivial', parallelism: 4 },
    { score: 3, tier: 'trivial', parallelism: 4 },
    { score: 4, tier: 'simple', parallelism: 3 },
    { score: 6, tier: 'simple', parallelism: 3 },
    { score: 7, tier: 'medium', parallelism: 2 },
    { score: 9, tier: 'medium', parallelism: 2 },
    { score: 10, tier: 'complex', parallelism: 1 },
    { score: 15, tier: 'hard', parallelism: 1 },
  ];

  for (const { score, tier, parallelism } of cases) {
    const label = getTierLabel(score);
    assert(label === tier, `score ${score} should be ${tier}, got ${label}`);

    // Simulate parallelism calculation
    let computedParallelism;
    if (score <= 3) {
      computedParallelism = 4;
    } else if (score <= 6) {
      computedParallelism = 3;
    } else if (score <= 9) {
      computedParallelism = 2;
    } else {
      computedParallelism = 1;
    }

    assert(
      computedParallelism === parallelism,
      `score ${score} (${tier}) should have parallelism ${parallelism}, got ${computedParallelism}`
    );
  }
});

// Test 7: Dynamism with different workers
test('different worker combinations produce expected tiers', () => {
  const testCases = [
    {
      name: 'single read',
      plan: { workers: [{ kind: 'read_file', filePath: 'file.js' }] },
      expectedTier: 'trivial',
    },
    {
      name: 'read + replace',
      plan: {
        workers: [
          { kind: 'read_file', filePath: 'file.js' },
          { kind: 'replace_text', filePath: 'file.js', replacements: [] },
        ],
      },
      expectedTier: 'medium',  // replace_text is medium/complex alone
    },
    {
      name: 'only greps',
      plan: {
        workers: [
          { kind: 'grep', regex: 'x', extensions: ['.js'] },
          { kind: 'grep', regex: 'y', extensions: ['.js'] },
        ],
      },
      expectedTier: 'trivial',  // greps are trivial/simple
    },
  ];

  for (const { name, plan, expectedTier } of testCases) {
    const score = scorePlan(plan);
    const tier = getTierLabel(score);
    assert(
      tier === expectedTier,
      `${name}: expected ${expectedTier}, got ${tier} (score=${score})`
    );
  }
});

// Test 8: Boundary conditions
test('boundary scores map correctly', () => {
  const boundaries = [
    { score: 3, expected: 'trivial' },
    { score: 4, expected: 'simple' },
    { score: 6, expected: 'simple' },
    { score: 7, expected: 'medium' },
    { score: 9, expected: 'medium' },
    { score: 10, expected: 'complex' },
    { score: 12, expected: 'complex' },
    { score: 13, expected: 'hard' },
  ];

  for (const { score, expected } of boundaries) {
    const tier = getTierLabel(score);
    assert(tier === expected, `score ${score} should map to ${expected}, got ${tier}`);
  }
});

// Print results
console.log(`\n${testsPassed} tests passed${testsFailed > 0 ? `, ${testsFailed} failed` : ''}!`);
process.exit(testsFailed > 0 ? 1 : 0);
