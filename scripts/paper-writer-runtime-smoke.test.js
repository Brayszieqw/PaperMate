const { runPaperWriterSmoke, runPaperWriterActiveSmoke } = require('./paper-writer-runtime-smoke');
const { runPaperWriterEntry } = require('./paper-writer-entry');

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
  await test('runPaperWriterSmoke returns a paused review-stage orchestrator snapshot', async () => {
    const result = await runPaperWriterSmoke();

    assert(result.runtime.runStatus === 'paused', 'run status should be paused after risky review');
    assert(result.runtime.summary.currentPhase === 'review', 'summary should end in review phase');
    assert(result.runtime.pauseDecision.shouldPause === true, 'pause decision should require a pause');
    assert(result.runtime.nextPlan.shouldPause === true, 'next action plan should also indicate pause');
    assert(Array.isArray(result.runtime.activeArtifactIds), 'active artifact ids should be an array');
    assert(result.runtime.activeArtifactIds.length >= 2, 'smoke run should produce multiple artifacts');
    assert(result.ui.type === 'checkpoint-card', 'ui payload should expose a checkpoint card type');
    assert(result.ui.mode === 'button-first', 'ui payload should preserve button-first mode');
    assert(Array.isArray(result.ui.choices) && result.ui.choices.length === 3, 'ui payload should expose user choices');
    assert(typeof result.ui.title === 'string' && result.ui.title.length > 0, 'ui payload should include a title');
    assert(typeof result.ui.fallbackPrompt === 'string' && result.ui.fallbackPrompt.length > 0, 'ui payload should include a text fallback prompt');
  });

  await test('runPaperWriterActiveSmoke returns an active drafting snapshot with status-card UI', async () => {
    const result = await runPaperWriterActiveSmoke();

    assert(result.runtime.runStatus === 'running', 'active smoke should stay running');
    assert(result.runtime.summary.currentPhase === 'draft', 'active smoke should end in draft phase');
    assert(result.runtime.pauseDecision.shouldPause === false, 'active smoke should not pause');
    assert(result.ui.type === 'status-card', 'active smoke should expose a status card');
    assert(result.ui.title === 'paper-writer 正在推进', 'active smoke should use the humanized status title');
  });

  await test('runPaperWriterEntry returns runtime and ui for the paused review demo scenario', async () => {
    const result = await runPaperWriterEntry({
      goal: 'draft related work from screened papers',
      demoScenario: 'paused-review',
    });

    assert(result.runtime.runStatus === 'paused', 'entry adapter should expose paused runtime for paused-review scenario');
    assert(result.ui.type === 'checkpoint-card', 'entry adapter should expose checkpoint-card UI for paused-review scenario');
    assert(result.meta.entryMode === 'demo', 'entry adapter should mark demo entry mode');
  });

  await test('runPaperWriterEntry chooses paused review route from review-oriented goal text', async () => {
    const result = await runPaperWriterEntry({
      goal: '检查 related work 草稿里有没有过度结论并告诉我下一步',
    });

    assert(result.runtime.runStatus === 'paused', 'review-oriented goal should route to paused review flow');
    assert(result.ui.type === 'checkpoint-card', 'review-oriented goal should expose checkpoint-card UI');
    assert(result.meta.entryMode === 'route', 'route-based entry should mark route mode');
    assert(result.meta.selectedScenario === null, 'route-based review entry should not report a demo scenario');
    assert(result.meta.routePacket.domain_focus === 'review', 'review-oriented goal should expose review route focus');
  });

  await test('runPaperWriterEntry chooses active draft route from drafting goal text', async () => {
    const result = await runPaperWriterEntry({
      goal: '先筛论文，然后继续起草 related work，不需要现在停下来',
    });

    assert(result.runtime.runStatus === 'running', 'draft-oriented goal should route to active flow');
    assert(result.ui.type === 'status-card', 'draft-oriented goal should expose status-card UI');
    assert(result.meta.entryMode === 'route', 'route-based entry should mark route mode');
    assert(result.meta.selectedScenario === null, 'route-based draft entry should not report a demo scenario');
    assert(result.meta.routePacket.domain_focus === 'draft', 'draft-oriented goal should expose draft route focus');
  });

  console.log(`\n${testsPassed} tests passed${testsFailed > 0 ? `, ${testsFailed} failed` : ''}!`);
  process.exit(testsFailed > 0 ? 1 : 0);
})();
