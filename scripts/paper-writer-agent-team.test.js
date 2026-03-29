const {
  shouldUsePaperWriterAgentTeam,
  createThesisScoutTeamWorkers,
  runPaperWriterAgentTeam,
} = require('./paper-writer-agent-team');

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
  await test('shouldUsePaperWriterAgentTeam enables swarm only for search-oriented routes', async () => {
    const enabled = shouldUsePaperWriterAgentTeam(
      { domain_focus: 'draft' },
      { executionMode: 'swarm' }
    );
    const disabled = shouldUsePaperWriterAgentTeam(
      { domain_focus: 'ops' },
      { executionMode: 'swarm' }
    );

    assert(enabled === true, 'draft route should enable the paper-writer agent team');
    assert(disabled === false, 'ops route should not enable the paper-writer agent team');
  });

  await test('createThesisScoutTeamWorkers returns a concrete multi-worker team', async () => {
    const workers = createThesisScoutTeamWorkers({
      user_goal: 'survey biomedical RAG papers',
      domain_focus: 'draft',
      recommended_next_agent: 'paper-drafter',
    }, {
      workflowIntent: 'draft',
      searchMode: 'mock',
    });

    assert(Array.isArray(workers) && workers.length === 3, 'team should contain 3 workers');
    assert(workers[0].owner === 'paper-scout', 'first worker should be a scout worker');
    assert(workers[1].owner === 'papermate-researcher', 'second worker should be a researcher worker');
    assert(workers[2].writeAccess === true, 'third worker should be the single writer');
  });

  await test('runPaperWriterAgentTeam executes a real team and returns structured output', async () => {
    const result = await runPaperWriterAgentTeam({
      user_goal: 'survey biomedical RAG papers',
      domain_focus: 'draft',
      recommended_next_agent: 'paper-drafter',
    }, {
      workflowIntent: 'draft',
      searchMode: 'mock',
    });

    assert(result.searchArtifact !== null, 'team execution should return a search artifact');
    assert(result.searchArtifact.artifact_type === 'literature_candidate_set', 'team should produce a literature candidate set');
    assert(result.teamExecution.mode === 'swarm', 'team execution summary should expose swarm mode');
    assert(Array.isArray(result.teamExecution.startedReadWorkers) && result.teamExecution.startedReadWorkers.length >= 2, 'team execution should start multiple read workers');
    assert(result.teamSummary !== null, 'team execution should return a team summary');
    assert(result.teamSummary.itemCount === result.searchArtifact.items.length, 'team summary should reflect candidate-set size');
  });

  console.log(`\n${testsPassed} tests passed${testsFailed > 0 ? `, ${testsFailed} failed` : ''}!`);
  process.exit(testsFailed > 0 ? 1 : 0);
})();
