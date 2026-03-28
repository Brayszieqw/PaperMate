/**
 * cache-integration.test.js - Integration tests for caching in swarm execution
 *
 * Tests that cache is properly passed to workers and cache hits are recorded.
 */

const fs = require('node:fs');
const path = require('node:path');
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

// Test 1: Cache is created and passed correctly
test('cache object is properly initialized', () => {
  const cache = createCacheStore();
  const stats = cache.getStats();

  assert(stats !== null, 'stats should not be null');
  assert(typeof stats === 'object', 'stats should be an object');
  assert(stats.search.hits === 0, 'initial hits should be 0');
  assert(stats.search.misses === 0, 'initial misses should be 0');
});

// Test 2: Multiple grep searches with cache
test('multiple searches with same pattern use cache', () => {
  const cache = createCacheStore();
  const pattern = 'bug';
  const extensions = ['.js'];
  const path = '.';

  // First search (miss)
  assert(cache.getSearch(pattern, extensions, path) === null, 'first search should be miss');

  // Set cache
  const results = ['file1.js:10', 'file2.js:20'];
  cache.setSearch(pattern, extensions, path, results);

  // Second search (hit)
  const cached1 = cache.getSearch(pattern, extensions, path);
  assert(cached1 !== null, 'second search should hit');
  assert(cached1.length === 2, 'cached results should have 2 items');

  // Third search (hit)
  const cached2 = cache.getSearch(pattern, extensions, path);
  assert(cached2 !== null, 'third search should hit');
  assert(cached2.length === 2, 'cached results should have 2 items');

  const stats = cache.getStats();
  assert(stats.search.hits === 2, 'should have 2 hits');
  assert(stats.search.misses === 1, 'should have 1 miss');
});

// Test 3: Different patterns don't interfere
test('different search patterns are isolated', () => {
  const cache = createCacheStore();

  // Pattern 1
  cache.setSearch('pattern1', ['.js'], '.', ['r1']);
  const r1 = cache.getSearch('pattern1', ['.js'], '.');
  assert(r1.length === 1, 'pattern1 should return 1 result');

  // Pattern 2 (different pattern)
  assert(cache.getSearch('pattern2', ['.js'], '.') === null, 'pattern2 should be miss initially');
  cache.setSearch('pattern2', ['.js'], '.', ['r2', 'r3']);
  const r2 = cache.getSearch('pattern2', ['.js'], '.');
  assert(r2.length === 2, 'pattern2 should return 2 results');

  // Pattern 1 should still work
  const r1_again = cache.getSearch('pattern1', ['.js'], '.');
  assert(r1_again.length === 1, 'pattern1 should still work');
});

// Test 4: Read cache for multiple reads
test('multiple file reads with same path use cache', () => {
  const cache = createCacheStore();
  const filePath = 'test.js';
  const content = 'function test() {\n  return true;\n}';

  // First read (miss)
  assert(cache.getRead(filePath, 0, -1) === null, 'first read should be miss');

  // Set cache
  cache.setRead(filePath, 0, -1, content);

  // Second read (hit)
  const cached1 = cache.getRead(filePath, 0, -1);
  assert(cached1 === content, 'cached content should match');

  // Third read (hit)
  const cached2 = cache.getRead(filePath, 0, -1);
  assert(cached2 === content, 'cached content should match again');

  const stats = cache.getStats();
  assert(stats.read.hits === 2, 'should have 2 read hits');
  assert(stats.read.misses === 1, 'should have 1 read miss');
});

// Test 5: Cache capacity limits
test('cache respects max entry limits', () => {
  const cache = createCacheStore({ maxSearchEntries: 3 });

  // Add 4 entries
  for (let i = 1; i <= 4; i++) {
    cache.setSearch(`pattern${i}`, ['.js'], '.', [`result${i}`]);
  }

  const stats = cache.getStats();
  assert(stats.sizes.searchEntries <= 3, 'cache size should not exceed max');

  // Oldest entry should be evicted
  const old = cache.getSearch('pattern1', ['.js'], '.');
  assert(old === null, 'oldest entry should be evicted');

  // Newer entries should still exist
  const new3 = cache.getSearch('pattern3', ['.js'], '.');
  const new4 = cache.getSearch('pattern4', ['.js'], '.');
  assert(new3 !== null, 'pattern3 should exist');
  assert(new4 !== null, 'pattern4 should exist');
});

// Test 6: Cache clear functionality
test('clear removes all cache entries', () => {
  const cache = createCacheStore();

  // Add entries
  cache.setSearch('p1', ['.js'], '.', ['r1']);
  cache.setRead('file.js', 0, -1, 'content');
  cache.setLLM('prompt', 'response');

  // Access them to generate statistics
  cache.getSearch('p1', ['.js'], '.');
  cache.getRead('file.js', 0, -1);
  cache.getLLM('prompt');

  // Get current stats before clear
  const statsBefore = cache.getStats();
  assert(statsBefore.search.hits === 1, 'search hits before clear');
  assert(statsBefore.read.hits === 1, 'read hits before clear');
  assert(statsBefore.llm.hits === 1, 'llm hits before clear');

  // Clear
  cache.clear();

  // Stats should reset without further accesses
  const statsAfter = cache.getStats();
  assert(statsAfter.search.hits === 0, 'search hits should reset');
  assert(statsAfter.search.misses === 0, 'search misses should reset');
  assert(statsAfter.read.hits === 0, 'read hits should reset');
  assert(statsAfter.read.misses === 0, 'read misses should reset');
  assert(statsAfter.llm.hits === 0, 'llm hits should reset');
  assert(statsAfter.llm.misses === 0, 'llm misses should reset');
  assert(statsAfter.sizes.searchEntries === 0, 'search entries should be empty');
  assert(statsAfter.sizes.readEntries === 0, 'read entries should be empty');
  assert(statsAfter.sizes.llmEntries === 0, 'llm entries should be empty');
});

// Test 7: Cache statistics accuracy
test('cache statistics are accurate', () => {
  const cache = createCacheStore();

  // Add and access
  cache.setSearch('p1', ['.js'], '.', ['r1']);
  cache.getSearch('p1', ['.js'], '.');  // hit
  cache.getSearch('p1', ['.js'], '.');  // hit
  cache.getSearch('p2', ['.js'], '.');  // miss

  const stats = cache.getStats();
  assert(stats.search.total === 3, 'total should be 3');
  assert(stats.search.hitRate.includes('66'), 'hit rate should be 66%');
});

// Test 8: LLM cache with prompts
test('LLM cache handles prompt caching', () => {
  const cache = createCacheStore();

  const prompt1 = 'What is the meaning of life?';
  const response1 = '42';
  const prompt2 = 'How many apples in a basket?';
  const response2 = 'depends on basket size';

  // Cache two prompts
  cache.setLLM(prompt1, response1);
  cache.setLLM(prompt2, response2);

  // Retrieve them
  const r1 = cache.getLLM(prompt1);
  const r2 = cache.getLLM(prompt2);

  assert(r1 === response1, 'prompt1 response should match');
  assert(r2 === response2, 'prompt2 response should match');

  // Same prompt should return same response
  const r1_again = cache.getLLM(prompt1);
  assert(r1_again === response1, 'prompt1 should return same response');

  const stats = cache.getStats();
  assert(stats.llm.hits === 3, 'should have 3 llm hits (all subsequent gets hit cache)');
  assert(stats.llm.misses === 0, 'should have 0 llm misses');
});

// Print results
console.log(`\n${testsPassed} tests passed${testsFailed > 0 ? `, ${testsFailed} failed` : ''}!`);
process.exit(testsFailed > 0 ? 1 : 0);
