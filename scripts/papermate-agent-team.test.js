const {
  createPapermateAgentRegistry,
  runPapermateAgentTeam,
  inferTaskType,
  inferComplexity,
  isThesisWorkflow,
  buildPapermateExecutionPlan,
  buildRouterFinalResult,
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

  await test('execution plan selects thesis roles without forcing unrelated write roles', async () => {
    const plan = buildPapermateExecutionPlan({
      goal: 'survey papers and draft related work for a biomedical QA thesis',
      executionMode: 'swarm',
      searchMode: 'mock',
    }, {
      task_type: 'research',
      complexity: 'medium',
      reviewer_needed: 'no',
    });

    assert(plan.roles.includes('papermate-planner'), 'planner should be included');
    assert(plan.roles.includes('papermate-validator'), 'validator should be included');
    assert(plan.roles.includes('papermate-librarian'), 'librarian should be included');
    assert(plan.roles.includes('papermate-researcher'), 'researcher should be included');
    assert(plan.roles.includes('papermate-oracle'), 'oracle should be included');
    assert(plan.roles.includes('papermate-router'), 'router should be included');
    assert(plan.roles.includes('papermate-monitor'), 'monitor should be included for swarm execution');
    assert(!plan.roles.includes('papermate-coder'), 'coder should not be forced for a pure thesis routing task');
    assert(!plan.roles.includes('papermate-snapshot'), 'snapshot should not be forced for a read-first thesis task');
  });

  await test('execution plan selects coding roles for implementation tasks', async () => {
    const plan = buildPapermateExecutionPlan({
      goal: 'fix the failing host test and update one script',
      files: ['scripts/paper-writer-host.js'],
      requiresWrite: true,
    }, {
      task_type: 'coding',
      complexity: 'medium',
      reviewer_needed: 'yes',
    });

    assert(plan.roles.includes('papermate-explorer'), 'coding plan should inspect the repo');
    assert(plan.roles.includes('papermate-snapshot'), 'coding plan should include snapshot');
    assert(plan.roles.includes('papermate-coder'), 'coding plan should include coder');
    assert(plan.roles.includes('papermate-reviewer'), 'coding plan should include reviewer');
  });

  await test('full papermate agent team executes a dynamic thesis role set', async () => {
    const result = await runPapermateAgentTeam({
      goal: 'survey papers and draft related work for a biomedical QA thesis',
      executionMode: 'swarm',
      searchMode: 'mock',
    });

    assert(result.mode === 'papermate-agent-team', 'team mode should be exposed');
    assert(Array.isArray(result.executedRoles), 'team should report executed roles');
    assert(result.executedRoles.includes('papermate-router'), 'router should execute');
    assert(result.executedRoles.includes('papermate-planner'), 'planner should execute');
    assert(result.executedRoles.includes('papermate-librarian'), 'librarian should execute');
    assert(result.executedRoles.includes('papermate-researcher'), 'researcher should execute');
    assert(result.executedRoles.includes('papermate-oracle'), 'oracle should execute');
    assert(result.executedRoles.includes('papermate-validator'), 'validator should execute');
    assert(result.executedRoles.includes('papermate-monitor'), 'monitor should execute');
    assert(!result.executedRoles.includes('papermate-coder'), 'coder should not execute for this read-first thesis task');
    assert(result.outputs.thesisCandidateSet.searchArtifact !== undefined, 'thesis path should precompute a candidate set');
    assert(result.outputs.librarian.source_bundle !== undefined, 'librarian should output a source bundle');
    assert(result.outputs.librarian.source_bundle.items.every((item) => item.provider !== 'manual_source_pool'), 'librarian should consume real candidate-set sources instead of fallback pool');
    assert(result.outputs.researcher.synthesis_artifact !== undefined, 'researcher should output a synthesis artifact');
    assert(result.outputs.router.source_bundle !== null, 'router should consume the source bundle');
    assert(result.outputs.router.synthesis_artifact !== null, 'router should consume the synthesis artifact');
    assert(result.outputs.router.oracle_decision !== null, 'router should consume oracle output');
    assert(result.outputs.router.final_result !== undefined, 'router should produce a final result constrained by artifacts');
    assert(result.outputs.router.final_result.constrainedByArtifacts === true, 'router final result should declare artifact constraint');
    assert(result.outputs.router.final_result.selected_sources.length > 0, 'router final result should include selected sources');
    assert(result.outputs.router.final_result.synthesis_summary === result.outputs.router.synthesis_artifact.conclusion, 'router final result should be driven by synthesis artifact');
    assert(result.outputs.router.final_result.recommended_path === result.outputs.router.oracle_decision.chosen_path, 'router final result should be driven by oracle decision');
    assert(result.outputs.router.entryResult.runtime.executionMode === 'swarm', 'router should invoke the executable paper-writer team path');
  });

  await test('buildRouterFinalResult derives final output from upstream artifacts', async () => {
    const finalResult = buildRouterFinalResult({
      planner: { task_type: 'research', complexity: 'medium', owner: 'paper-writer' },
      sourceBundle: {
        items: [
          { title: 'Paper A', provider: 'openalex', selection_reason: 'core survey' },
          { title: 'Paper B', provider: 'crossref', selection_reason: 'benchmark grounding' },
        ],
      },
      synthesisArtifact: {
        conclusion: 'Synthesis prepared from ranked sources',
      },
      oracleDecision: {
        chosen_path: 'keep the thesis workflow narrow',
        remaining_guards: ['keep writer serial'],
      },
      entryResult: {
        meta: {
          routePacket: {
            recommended_next_agent: 'paper-drafter',
          },
        },
      },
    });

    assert(finalResult.constrainedByArtifacts === true, 'final result should be artifact-constrained');
    assert(finalResult.selected_sources.length === 2, 'final result should include the selected sources');
    assert(finalResult.synthesis_summary === 'Synthesis prepared from ranked sources', 'final result should use synthesis summary');
    assert(finalResult.recommended_path === 'keep the thesis workflow narrow', 'final result should use oracle decision');
    assert(finalResult.next_action === 'paper-drafter', 'final result should preserve next action');
  });

  console.log(`\n${testsPassed} tests passed${testsFailed > 0 ? `, ${testsFailed} failed` : ''}!`);
  process.exit(testsFailed > 0 ? 1 : 0);
})();
