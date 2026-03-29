const {
  createPapermateAgentRegistry,
  runPapermateAgentTeam,
  inferTaskType,
  inferComplexity,
  isThesisWorkflow,
} = require('./papermate-agent-team');

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
  await test('task inference recognizes thesis workflow tasks', async () => {
    assert(inferTaskType({ goal: 'draft related work for a thesis' }) === 'research', 'thesis goal should infer research');
    assert(inferComplexity({ goal: 'draft related work for a thesis', files: ['a', 'b'] }) === 'medium', 'multiple files should raise complexity');
    assert(isThesisWorkflow({ goal: 'prepare a thesis related work section' }) === true, 'thesis goal should be detected');
  });

  await test('registry exposes executable handlers for every papermate role', async () => {
    const registry = createPapermateAgentRegistry();
    const expectedRoles = [
      'papermate-router',
      'papermate-planner',
      'papermate-explorer',
      'papermate-librarian',
      'papermate-researcher',
      'papermate-oracle',
      'papermate-validator',
      'papermate-checkpoint',
      'papermate-snapshot',
      'papermate-coder',
      'papermate-reviewer',
      'papermate-monitor',
      'papermate-optimizer',
      'papermate-logger',
    ];

    for (const role of expectedRoles) {
      assert(typeof registry[role] === 'function', `${role} should have an executable handler`);
    }
  });

  await test('full papermate agent team executes all concrete roles', async () => {
    const result = await runPapermateAgentTeam({
      goal: 'survey papers and draft related work for a biomedical QA thesis',
      executionMode: 'swarm',
      searchMode: 'mock',
    });

    assert(result.mode === 'papermate-agent-team', 'team mode should be exposed');
    assert(Array.isArray(result.executedRoles) && result.executedRoles.length === 14, 'team should report all executable papermate roles');
    assert(result.executedRoles.includes('papermate-router'), 'router should execute');
    assert(result.executedRoles.includes('papermate-planner'), 'planner should execute');
    assert(result.executedRoles.includes('papermate-explorer'), 'explorer should execute');
    assert(result.executedRoles.includes('papermate-librarian'), 'librarian should execute');
    assert(result.executedRoles.includes('papermate-oracle'), 'oracle should execute');
    assert(result.executedRoles.includes('papermate-validator'), 'validator should execute');
    assert(result.executedRoles.includes('papermate-checkpoint'), 'checkpoint should execute');
    assert(result.executedRoles.includes('papermate-snapshot'), 'snapshot should execute');
    assert(result.executedRoles.includes('papermate-coder'), 'coder should execute');
    assert(result.executedRoles.includes('papermate-researcher'), 'researcher should execute');
    assert(result.executedRoles.includes('papermate-reviewer'), 'reviewer should execute');
    assert(result.executedRoles.includes('papermate-monitor'), 'monitor should execute');
    assert(result.executedRoles.includes('papermate-optimizer'), 'optimizer should execute');
    assert(result.executedRoles.includes('papermate-logger'), 'logger should execute');
    assert(result.outputs.router.entryResult.runtime.executionMode === 'swarm', 'router should invoke the executable paper-writer team path');
  });

  console.log(`\n${testsPassed} tests passed${testsFailed > 0 ? `, ${testsFailed} failed` : ''}!`);
  process.exit(testsFailed > 0 ? 1 : 0);
})();
