const {
  loadRuntimeSchemas,
  createRoutePacket,
  createCheckpointPacket,
  createSessionMemory,
} = require('./paper-writer-runtime-interface');

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

test('loadRuntimeSchemas loads all paper-writer runtime schemas', () => {
  const schemas = loadRuntimeSchemas();

  assert(schemas && typeof schemas === 'object', 'schemas should be an object');
  assert(Object.keys(schemas).length === 6, 'should load 6 runtime schemas');
  assert(schemas.routePacket.title === 'paper-writer route packet', 'route schema title should match');
  assert(schemas.checkpointPacket.properties.ui_policy.const === 'button_first_text_fallback', 'checkpoint ui policy should be fixed');
  assert(schemas.routePacket.properties.domain_focus.enum.includes('topic-framing'), 'route schema should include topic-framing');
  assert(schemas.routePacket.properties.domain_focus.enum.includes('revision-loop'), 'route schema should include revision-loop');
  assert(schemas.phaseState.properties.phase_name.enum.includes('proposal-outline'), 'phase schema should include proposal-outline');
});

test('createRoutePacket applies defaults and accepts explicit overrides', () => {
  const packet = createRoutePacket({
    task_id: 'task-1',
    user_goal: 'draft related work',
    recommended_next_agent: 'paper-drafter',
    evidence_state: 'usable',
  });

  assert(packet.task_id === 'task-1', 'task id should be preserved');
  assert(packet.user_goal === 'draft related work', 'user goal should be preserved');
  assert(packet.recommended_next_agent === 'paper-drafter', 'next agent should be preserved');
  assert(packet.task_kind === 'single_step', 'default task kind should be single_step');
  assert(packet.checkpoint_needed === 'none', 'default checkpoint need should be none');
});

test('createCheckpointPacket enforces button-first text-fallback ui policy', () => {
  const packet = createCheckpointPacket({
    checkpoint_id: 'cp-1',
    checkpoint_type: 'review',
    current_phase: 'review',
    why_pause: 'review found unresolved risk',
    current_result_summary: 'draft has weak evidence',
    recommended_action: 'revise draft',
  });

  assert(packet.checkpoint_id === 'cp-1', 'checkpoint id should be preserved');
  assert(packet.ui_policy === 'button_first_text_fallback', 'ui policy should be fixed');
  assert(Array.isArray(packet.alternative_actions), 'alternative actions should default to an array');
  assert(packet.checkpoint_level === 'soft', 'default checkpoint level should be soft');
});

test('createSessionMemory provides stable arrays and user preference defaults', () => {
  const memory = createSessionMemory({
    task_id: 'task-2',
    current_goal: 'survey multimodal feedback papers',
  });

  assert(memory.task_id === 'task-2', 'task id should be preserved');
  assert(memory.current_goal === 'survey multimodal feedback papers', 'goal should be preserved');
  assert(Array.isArray(memory.active_artifacts), 'active_artifacts should be an array');
  assert(Array.isArray(memory.evidence_pack_ids), 'evidence_pack_ids should be an array');
  assert(memory.user_preferences.automation_mode === 'balanced', 'default automation mode should be balanced');
  assert(memory.stale_state_flag === false, 'stale state flag should default to false');
});

test('createRoutePacket generates unique ids when task_id is omitted', () => {
  const packetA = createRoutePacket({ user_goal: 'goal a' });
  const packetB = createRoutePacket({ user_goal: 'goal b' });

  assert(packetA.task_id !== 'task-pending', 'route packet should not use placeholder ids');
  assert(packetA.task_id !== packetB.task_id, 'route packets should get unique generated ids');
});

console.log(`\n${testsPassed} tests passed${testsFailed > 0 ? `, ${testsFailed} failed` : ''}!`);
process.exit(testsFailed > 0 ? 1 : 0);
