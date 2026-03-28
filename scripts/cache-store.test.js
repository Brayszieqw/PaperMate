/**
 * cache-store.test.js - Unit tests for cache-store.js
 *
 * Tests caching behavior for grep, read_file, and LLM results.
 */

const { createCacheStore } = require('./cache-store');

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

// Test 1: Create cache store
test('createCacheStore returns valid object', () => {
  const cache = createCacheStore();
  assert(cache !== null, 'cache should not be null');
  assert(typeof cache.getSearch === 'function', 'getSearch should be a function');
  assert(typeof cache.setSearch === 'function', 'setSearch should be a function');
  assert(typeof cache.getRead === 'function', 'getRead should be a function');
  assert(typeof cache.setRead === 'function', 'setRead should be a function');
});

// Test 2: Search cache miss
test('search cache miss returns null', () => {
  const cache = createCacheStore();
  const result = cache.getSearch('pattern', ['.js'], '.');
  assert(result === null, 'search cache miss should return null');
});

// Test 3: Search cache hit
test('search cache hit returns cached results', () => {
  const cache = createCacheStore();
  const results = ['file.js:10', 'file.js:20'];
  cache.setSearch('bug', ['.js'], '.', results);
  const cached = cache.getSearch('bug', ['.js'], '.');
  assert(cached !== null, 'cached result should not be null');
  assert(Array.isArray(cached), 'cached result should be an array');
  assert(cached.length === 2, 'cached result should have 2 items');
});

// Test 4: Read cache miss
test('read cache miss returns null', () => {
  const cache = createCacheStore();
  const result = cache.getRead('file.js', 0, -1);
  assert(result === null, 'read cache miss should return null');
});

// Test 5: Read cache hit
test('read cache hit returns cached content', () => {
  const cache = createCacheStore();
  const content = 'line 1\nline 2\nline 3';
  cache.setRead('file.js', 0, -1, content);
  const cached = cache.getRead('file.js', 0, -1);
  assert(cached === content, 'cached content should match original');
});

// Test 6: Different search keys don't interfere
test('different search keys are independent', () => {
  const cache = createCacheStore();
  cache.setSearch('pattern1', ['.js'], '.', ['result1']);
  cache.setSearch('pattern2', ['.ts'], '.', ['result2']);

  const r1 = cache.getSearch('pattern1', ['.js'], '.');
  const r2 = cache.getSearch('pattern2', ['.ts'], '.');

  assert(r1.length === 1 && r1[0] === 'result1', 'pattern1 should return correct result');
  assert(r2.length === 1 && r2[0] === 'result2', 'pattern2 should return correct result');
});

// Test 7: Cache statistics
test('cache statistics track hits and misses', () => {
  const cache = createCacheStore();

  // Make some hits
  cache.setSearch('bug', ['.js'], '.', ['file.js:10']);
  cache.getSearch('bug', ['.js'], '.');  // hit
  cache.getSearch('bug', ['.js'], '.');  // hit
  cache.getSearch('other', ['.js'], '.'); // miss

  const stats = cache.getStats();
  assert(stats.search.hits === 2, 'should have 2 search hits');
  assert(stats.search.misses === 1, 'should have 1 search miss');
  assert(stats.search.total === 3, 'total should be 3');
});

// Test 8: Clear cache
test('clear removes all cached items', () => {
  const cache = createCacheStore();
  cache.setSearch('bug', ['.js'], '.', ['file.js:10']);
  cache.setRead('file.js', 0, -1, 'content');

  cache.clear();

  const s = cache.getSearch('bug', ['.js'], '.');
  const r = cache.getRead('file.js', 0, -1);

  assert(s === null, 'search cache should be empty after clear');
  assert(r === null, 'read cache should be empty after clear');
});

// Test 9: LLM cache
test('LLM cache works correctly', () => {
  const cache = createCacheStore();

  // LLM miss
  let result = cache.getLLM('some prompt');
  assert(result === null, 'LLM miss should return null');

  // Set and hit
  cache.setLLM('some prompt', 'response text');
  result = cache.getLLM('some prompt');
  assert(result === 'response text', 'LLM hit should return cached response');
});

// Test 10: Max entries enforcement
test('cache enforces max entry limits', () => {
  const cache = createCacheStore({ maxSearchEntries: 2 });

  cache.setSearch('pattern1', ['.js'], '.', ['r1']);
  cache.setSearch('pattern2', ['.js'], '.', ['r2']);
  cache.setSearch('pattern3', ['.js'], '.', ['r3']);  // Should evict oldest

  const stats = cache.getStats();
  assert(stats.sizes.searchEntries <= 2, 'search cache should not exceed max size');
});

// Print results
console.log(`\n${testsPassed} tests passed${testsFailed > 0 ? `, ${testsFailed} failed` : ''}!`);
process.exit(testsFailed > 0 ? 1 : 0);
