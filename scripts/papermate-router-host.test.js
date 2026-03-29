const { dispatch } = require('./papermate-router-host');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`✗ ${message}`);
    testsFailed += 1;
    throw new Error(message);
  }
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    testsPassed += 1;
  } catch (error) {
    console.error(`  ${error.message}`);
  }
}

(async () => {
  await test('papermate-router host dispatch runs the executable agent team', async () => {
    const response = await dispatch({
      goal: 'survey papers and draft related work for a biomedical QA thesis',
      executionMode: 'swarm',
      searchMode: 'mock',
    });

    assert(response.ok === true, 'dispatch should succeed');
    assert(response.mode === 'papermate-router', 'host should expose papermate-router mode');
    assert(response.result.mode === 'papermate-agent-team', 'host should return the executable agent-team result');
    assert(Array.isArray(response.result.executedRoles) && response.result.executedRoles.includes('papermate-router'), 'router role should execute');
    assert(response.result.outputs.router.entryResult.runtime.executionMode === 'swarm', 'router host should drive the swarm-backed thesis path');
  });

  await test('papermate-router host dispatch surfaces errors cleanly', async () => {
    const response = await dispatch({
      goal: 'survey papers',
      executionMode: 'swarm',
      searchMode: 'browser',
      chromeRunner: async () => {
        throw new Error('simulated browser failure');
      },
      fetchImpl: async () => {
        throw new Error('simulated provider failure');
      },
    });

    assert(response.ok === true, 'team should degrade to a structured response instead of crashing');
    assert(response.result.outputs.router.entryResult.runtime.searchArtifact !== undefined, 'router should still produce a search artifact path');
  });

  console.log(`\n${testsPassed} tests passed${testsFailed > 0 ? `, ${testsFailed} failed` : ''}!`);
  process.exit(testsFailed > 0 ? 1 : 0);
})();
