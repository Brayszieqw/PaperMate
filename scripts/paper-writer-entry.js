const { runPaperWriterSmoke, runPaperWriterActiveSmoke } = require('./paper-writer-runtime-smoke');
const {
  startRun,
  advancePaperWriterPhase,
  pauseRun,
  summarizeRun,
  shouldPauseRun,
  buildUserCheckpointView,
  createNextActionPlan,
  buildRunUiPayload,
} = require('./paper-writer-runtime-state');
const { createRoutePacket, createArtifactRef } = require('./paper-writer-runtime-interface');
const { buildMockCandidateSet, buildRealCandidateSet } = require('./paper-writer-search-layer');
const { createRuntimeId } = require('./paper-writer-utils');

function classifyGoal(goal) {
  const text = String(goal || '').toLowerCase();

  const focusRules = {
    review: { priority: 100, signals: ['review', '检查', '审一下', '审', '核验', 'claim', 'evidence', '过度结论'] },
    'revision-loop': { priority: 80, signals: ['修改意见', '导师意见', '老师意见', '改一版', '修订', 'revision'] },
    'proposal-outline': { priority: 70, signals: ['开题', '提纲', '研究方案', '方案说明', '开题报告'] },
    'topic-framing': { priority: 65, signals: ['缩题', '收束', '研究问题', '选题', '题目范围'] },
    'defense-prep': { priority: 60, signals: ['答辩', '老师会问', '提问', '为什么选这个方向', '为什么这样做'] },
    library: { priority: 50, signals: ['笔记', '文献库', '资料库', '整理', '索引'] },
    ops: { priority: 45, signals: ['pdf', '精读', '翻译', 'latex', '实验设置', '指标'] },
    draft: { priority: 40, signals: ['draft', '起草', '写', '改写', 'related work', '草稿'] },
  };

  let bestFocus = 'mixed';
  let bestScore = 0;

  for (const [focus, rule] of Object.entries(focusRules)) {
    const hits = rule.signals.filter((signal) => text.includes(signal.toLowerCase())).length;
    const score = hits === 0 ? 0 : hits * 10 + rule.priority;

    if (score > bestScore) {
      bestFocus = focus;
      bestScore = score;
    }
  }

  return bestFocus;
}

function createEntryRoutePacket(input = {}) {
  const goal = typeof input.goal === 'string' && input.goal.trim()
    ? input.goal.trim()
    : '[pending paper-writer goal]';
  const focus = classifyGoal(goal);

  if (focus === 'review') {
    return createRoutePacket({
      task_id: input.task_id,
      user_goal: goal,
      task_kind: 'single_step',
      domain_focus: 'review',
      current_phase: 'intake',
      risk_level: 'medium',
      evidence_state: 'usable',
      automation_mode: input.automation_mode || 'balanced',
      route_strategy: 'review_first',
      recommended_next_agent: 'paper-reviewer',
      checkpoint_needed: 'hard',
    });
  }

  if (focus === 'revision-loop') {
    return createRoutePacket({
      task_id: input.task_id,
      user_goal: goal,
      task_kind: 'compound',
      domain_focus: 'revision-loop',
      current_phase: 'intake',
      risk_level: 'medium',
      evidence_state: 'usable',
      automation_mode: input.automation_mode || 'balanced',
      route_strategy: 'staged',
      recommended_next_agent: 'paper-reviewer',
      checkpoint_needed: 'soft',
    });
  }

  if (focus === 'proposal-outline') {
    return createRoutePacket({
      task_id: input.task_id,
      user_goal: goal,
      task_kind: 'compound',
      domain_focus: 'proposal-outline',
      current_phase: 'intake',
      risk_level: 'medium',
      evidence_state: 'weak',
      automation_mode: input.automation_mode || 'balanced',
      route_strategy: 'staged',
      recommended_next_agent: 'paper-drafter',
      checkpoint_needed: input.overwrite_target ? 'hard' : 'none',
    });
  }

  if (focus === 'topic-framing') {
    return createRoutePacket({
      task_id: input.task_id,
      user_goal: goal,
      task_kind: 'single_step',
      domain_focus: 'topic-framing',
      current_phase: 'intake',
      risk_level: 'medium',
      evidence_state: 'weak',
      automation_mode: input.automation_mode || 'balanced',
      route_strategy: 'evidence_first',
      recommended_next_agent: 'paper-writer',
      checkpoint_needed: 'soft',
    });
  }

  if (focus === 'defense-prep') {
    return createRoutePacket({
      task_id: input.task_id,
      user_goal: goal,
      task_kind: 'single_step',
      domain_focus: 'defense-prep',
      current_phase: 'intake',
      risk_level: 'high',
      evidence_state: 'usable',
      automation_mode: input.automation_mode || 'balanced',
      route_strategy: 'review_first',
      recommended_next_agent: 'paper-reviewer',
      checkpoint_needed: 'hard',
    });
  }

  if (focus === 'library') {
    return createRoutePacket({
      task_id: input.task_id,
      user_goal: goal,
      task_kind: 'compound',
      domain_focus: 'library',
      current_phase: 'intake',
      risk_level: 'low',
      evidence_state: 'usable',
      automation_mode: input.automation_mode || 'balanced',
      route_strategy: 'staged',
      recommended_next_agent: 'paper-library',
      checkpoint_needed: 'none',
    });
  }

  if (focus === 'ops') {
    return createRoutePacket({
      task_id: input.task_id,
      user_goal: goal,
      task_kind: 'single_step',
      domain_focus: 'ops',
      current_phase: 'intake',
      risk_level: 'medium',
      evidence_state: 'usable',
      automation_mode: input.automation_mode || 'balanced',
      route_strategy: 'direct',
      recommended_next_agent: 'paper-research-ops',
      checkpoint_needed: 'none',
    });
  }

  if (focus === 'draft') {
    return createRoutePacket({
      task_id: input.task_id,
      user_goal: goal,
      task_kind: 'compound',
      domain_focus: 'draft',
      current_phase: 'intake',
      risk_level: 'medium',
      evidence_state: 'weak',
      automation_mode: input.automation_mode || 'balanced',
      route_strategy: 'staged',
      recommended_next_agent: 'paper-drafter',
      checkpoint_needed: input.overwrite_target ? 'hard' : 'none',
    });
  }

  return createRoutePacket({
    task_id: input.task_id,
    user_goal: goal,
    task_kind: 'single_step',
    domain_focus: 'mixed',
    current_phase: 'intake',
    risk_level: 'medium',
    evidence_state: 'weak',
    automation_mode: input.automation_mode || 'balanced',
    route_strategy: 'evidence_first',
    recommended_next_agent: 'paper-reviewer',
    checkpoint_needed: 'hard',
  });
}

function selectScenarioFromGoal(goalOrRoute) {
  const route = goalOrRoute && typeof goalOrRoute === 'object' && !Array.isArray(goalOrRoute)
    ? goalOrRoute
    : createEntryRoutePacket({ goal: goalOrRoute });

  if (route.domain_focus === 'review' || route.domain_focus === 'defense-prep' || route.route_strategy === 'review_first') {
    return 'paused-review';
  }

  if (['draft', 'library', 'proposal-outline', 'revision-loop'].includes(route.domain_focus) || route.route_strategy === 'staged') {
    return 'active-draft';
  }

  return route.domain_focus === 'ops' ? 'active-draft' : 'paused-review';
}

function createDefenseReadyLiteMeta() {
  return {
    mode: 'lite',
    prompts: [
      '为什么选这个方向？',
      '为什么选这种做法？',
      '有哪些可替代方案，为什么没选？',
      '如果老师追问，当前证据够不够回答？',
    ],
  };
}

function getWorkflowIntent(routePacket) {
  switch (routePacket?.domain_focus) {
    case 'proposal-outline':
      return 'proposal';
    case 'defense-prep':
      return 'defense';
    case 'revision-loop':
      return 'revision';
    case 'topic-framing':
      return 'framing';
    case 'draft':
      return 'draft';
    case 'review':
      return 'review';
    default:
      return 'research';
  }
}

function getRecommendedDeliverableType(workflowIntent) {
  switch (workflowIntent) {
    case 'proposal':
      return 'proposal_outline';
    case 'defense':
      return 'defense_qa_pack';
    case 'revision':
      return 'revision_tracker';
    case 'framing':
      return 'topic_scope_brief';
    case 'draft':
      return 'chapter_draft';
    case 'review':
      return 'review_verdict';
    default:
      return 'research_note';
  }
}

function getSupportedInternalStages() {
  return [
    'topic-framing',
    'paper-scout',
    'paper-library',
    'proposal-outline',
    'paper-drafter',
    'paper-research-ops',
    'paper-reviewer',
    'defense-prep',
    'revision-loop',
  ];
}

function shouldAttachSearchArtifact(routePacket) {
  return ['draft', 'library', 'mixed', 'scout', 'proposal-outline'].includes(routePacket.domain_focus);
}

async function attachSearchArtifactToEntryResult(result, routePacket) {
  if (!shouldAttachSearchArtifact(routePacket)) {
    return result;
  }

  const searchArtifact = await buildMockCandidateSet({
    query: routePacket.user_goal,
  });
  const activeArtifactIds = Array.isArray(result.runtime?.activeArtifactIds)
    ? [...result.runtime.activeArtifactIds]
    : [];

  if (!activeArtifactIds.includes(searchArtifact.artifact_id)) {
    activeArtifactIds.unshift(searchArtifact.artifact_id);
  }

  return {
    ...result,
    runtime: {
      ...result.runtime,
      activeArtifactIds,
      searchArtifact,
    },
  };
}

async function attachSearchArtifactToEntryResultWithMode(result, routePacket, options = {}) {
  if (!shouldAttachSearchArtifact(routePacket)) {
    return result;
  }

  const searchMode = options.searchMode || 'mock';
  const searchArtifact = searchMode === 'real' || searchMode === 'browser' || searchMode === 'hybrid'
    ? await buildRealCandidateSet({
      query: routePacket.user_goal,
      providers: options.searchProviders || (searchMode === 'browser' || searchMode === 'hybrid' ? ['chrome_cdp_arxiv', 'openalex', 'crossref'] : undefined),
      fetchImpl: options.fetchImpl,
      chromeRunner: options.chromeRunner || options.bbBrowserRunner,
      browserUrl: options.browserUrl,
      sitesDir: options.sitesDir,
    })
    : await buildMockCandidateSet({
      query: routePacket.user_goal,
      providers: options.searchProviders,
    });

  const activeArtifactIds = Array.isArray(result.runtime?.activeArtifactIds)
    ? [...result.runtime.activeArtifactIds]
    : [];

  if (!activeArtifactIds.includes(searchArtifact.artifact_id)) {
    activeArtifactIds.unshift(searchArtifact.artifact_id);
  }

  return {
    ...result,
    runtime: {
      ...result.runtime,
      activeArtifactIds,
      searchArtifact,
    },
  };
}

function buildSearchSummary(searchArtifact) {
  if (!searchArtifact) {
    return null;
  }

  const itemCount = Array.isArray(searchArtifact.items) ? searchArtifact.items.length : 0;
  const providersUsed = Array.isArray(searchArtifact.trace?.providers_used) ? [...searchArtifact.trace.providers_used] : [];
  const queryVariants = Array.isArray(searchArtifact.trace?.query_variants) ? [...searchArtifact.trace.query_variants] : [];
  const traceNotes = searchArtifact.trace?.notes || '';
  const isRealProviderFlow = traceNotes.includes('real provider');
  const isMockProviderFlow = traceNotes.includes('mock provider');
  const isBrowserBackedFlow = traceNotes.includes('chrome-devtools') || traceNotes.includes('browser-backed');
  const hasProviderWarnings = traceNotes.includes('provider warnings:');

  return {
    itemCount,
    mode: isMockProviderFlow ? 'mock' : (isBrowserBackedFlow ? 'browser' : (isRealProviderFlow ? 'real' : 'unknown')),
    providersUsed,
    queryVariants,
    queryVariantCount: queryVariants.length,
    summary: isMockProviderFlow
      ? `已生成 ${itemCount} 篇模拟候选论文（mock），仅用于离线演示或流程联调。`
      : isBrowserBackedFlow
        ? `已汇集 ${itemCount} 篇候选论文，包含 browser-backed 检索来源：${providersUsed.join(' / ')}`
        : `已汇集 ${itemCount} 篇候选论文，来源：${providersUsed.join(' / ')}`,
    selectionRationale: isMockProviderFlow
      ? '当前结果来自模拟 provider，用于验证路由、artifact 和 UI 流程，不应直接当作真实文献结论使用。'
      : isBrowserBackedFlow
        ? '当前结果优先合并 browser-backed arXiv 检索与公开 API 检索，用于提高论文召回与证据覆盖。'
        : '当前优先保留与任务主题直接相关、可进入后续写作或证据整理的候选论文。',
    supportFocus: isMockProviderFlow ? ['demo', 'workflow-validation'] : ['background', 'method', 'claim-support'],
    defenseHint: isMockProviderFlow
      ? '如果需要进入真实写作或答辩准备，应切换到 real 搜索并重新收集证据。'
      : '如果老师追问为什么先看这些论文，可回答：它们与当前问题域更接近，而且更容易直接支撑后续章节写作与论证。',
    warning: isMockProviderFlow
      ? '当前为 mock 检索结果，不能直接作为真实文献依据。'
      : (hasProviderWarnings ? traceNotes.split('provider warnings:')[1].trim() : null),
    browserBackedNote: isBrowserBackedFlow ? '当前检索包含 Chrome DevTools 驱动的浏览器侧 provider；若本地浏览器链路不可用，会自动退回公开 API provider。' : null,
    rewriteNote: queryVariants.length > 1 ? `当前检索使用了 ${queryVariants.length} 个 query variants 做多视角召回。` : null,
    dedupNote: isRealProviderFlow ? '当前结果已经过最小 DOI/标题去重，减少了多源重复论文。' : null,
    canonicalPreferenceNote: isRealProviderFlow ? '若同一论文同时出现多个来源，当前会优先保留更像正式发表版本的记录。' : null,
  };
}

function buildDeliverableArtifactSkeleton({ workflowIntent, recommendedDeliverableType }) {
  if (!['proposal', 'defense', 'revision'].includes(workflowIntent)) {
    return null;
  }

  const summaryMap = {
    proposal: '开题提纲与研究方案骨架已就绪，可继续补背景、方法与预期贡献。',
    defense: '答辩问答包骨架已就绪，可继续补老师可能追问的问题与回答依据。',
    revision: '修改跟踪骨架已就绪，可继续登记已改、未改与待补证据项。',
  };

  return createArtifactRef({
    artifact_type: recommendedDeliverableType,
    producer: 'paper-writer',
    summary: summaryMap[workflowIntent],
    source_refs: [],
    risk_flags: [],
  });
}

function attachDeliverableArtifactToEntryResult(result, workflowIntent, recommendedDeliverableType) {
  const deliverableArtifact = buildDeliverableArtifactSkeleton({ workflowIntent, recommendedDeliverableType });
  if (!deliverableArtifact) {
    return result;
  }

  const activeArtifactIds = Array.isArray(result.runtime?.activeArtifactIds)
    ? [...result.runtime.activeArtifactIds]
    : [];

  if (!activeArtifactIds.includes(deliverableArtifact.artifact_id)) {
    activeArtifactIds.unshift(deliverableArtifact.artifact_id);
  }

  return {
    ...result,
    runtime: {
      ...result.runtime,
      activeArtifactIds,
      deliverableArtifact,
    },
  };
}

function getRoutePhase(routePacket) {
  const phase = routePacket?.domain_focus;
  const supported = ['topic-framing', 'proposal-outline', 'draft', 'ops', 'review', 'defense-prep', 'revision-loop', 'library'];
  return supported.includes(phase) ? phase : 'intake';
}

function buildEntryCheckpoint(routePacket) {
  if (!routePacket || routePacket.checkpoint_needed === 'none') {
    return null;
  }

  return {
    checkpoint_id: createRuntimeId('checkpoint'),
    checkpoint_type: routePacket.domain_focus === 'review' || routePacket.domain_focus === 'defense-prep' ? 'review' : 'route',
    checkpoint_level: routePacket.checkpoint_needed,
    current_phase: getRoutePhase(routePacket),
    why_pause: routePacket.domain_focus === 'defense-prep'
      ? '答辩准备阶段需要先确认当前解释链是否足够。'
      : routePacket.domain_focus === 'review'
        ? '审查阶段需要先确认风险与修改方向。'
        : '当前路线包含需要确认的关键节点。',
    current_result_summary: `${routePacket.domain_focus} 阶段已准备就绪。`,
    risk_summary: routePacket.domain_focus === 'defense-prep'
      ? '需要确认哪些理由与答辩口径已经足够稳。'
      : routePacket.domain_focus === 'review'
        ? '需要确认风险项和修改优先级。'
        : null,
    recommended_action: routePacket.recommended_next_agent === 'paper-reviewer' ? '检查风险并决定下一步' : '继续当前阶段',
    alternative_actions: routePacket.domain_focus === 'defense-prep'
      ? ['返回补证据', '先整理问答提纲']
      : ['暂停', '改走更稳路径'],
    resume_condition: '用户确认下一步后继续。',
  };
}

function buildRouteRuntimeResult(state) {
  const summary = summarizeRun(state);

  return {
    runtime: {
      taskId: state.task_id,
      runStatus: state.runStatus,
      activeArtifactIds: state.activeArtifacts.map((artifact) => artifact.artifact_id),
      summary,
      runSummary: summary,
      pauseDecision: shouldPauseRun(state),
      checkpointView: buildUserCheckpointView(state),
      nextPlan: createNextActionPlan(state),
    },
    ui: buildRunUiPayload(state),
  };
}

function attachSearchSummaryToUi(result) {
  const searchSummary = buildSearchSummary(result.runtime?.searchArtifact);
  if (!searchSummary) {
    return result;
  }

  return {
    ...result,
    ui: {
      ...result.ui,
      searchSummary,
    },
  };
}

function getStageLabel(routePacket) {
  switch (routePacket?.domain_focus) {
    case 'topic-framing':
      return '选题收束';
    case 'library':
      return '文献整理';
    case 'proposal-outline':
      return '开题提纲';
    case 'draft':
      return '正文起草';
    case 'ops':
      return '论文精读';
    case 'review':
      return '论文审查';
    case 'defense-prep':
      return '答辩准备';
    case 'revision-loop':
      return '修改闭环';
    default:
      return '论文工作流';
  }
}

function getStageCardTitle(routePacket, fallbackTitle) {
  switch (routePacket?.domain_focus) {
    case 'proposal-outline':
      return '开题提纲建议';
    case 'defense-prep':
      return '答辩准备建议';
    case 'revision-loop':
      return '修改闭环建议';
    case 'topic-framing':
      return '选题收束建议';
    default:
      return fallbackTitle;
  }
}

function attachStageLabelToUi(result, routePacket) {
  return {
    ...result,
    ui: {
      ...result.ui,
      title: getStageCardTitle(routePacket, result.ui?.title),
      stageLabel: getStageLabel(routePacket),
    },
  };
}

function buildGuidanceBlock({ routePacket, stageLabel, searchSummary, defenseReady, workflowIntent }) {
  let nextFocus = '继续按当前阶段推进下一步。';
  let deliverableHint = null;

  switch (routePacket?.domain_focus) {
    case 'topic-framing':
      nextFocus = '优先收束题目范围、明确研究问题，并说明为什么这个方向值得做。';
      break;
    case 'proposal-outline':
      nextFocus = '优先整理开题提纲、研究背景、方法思路和预期贡献。';
      deliverableHint = '建议当前产出：开题报告提纲 / 研究方案说明。';
      break;
    case 'draft':
      nextFocus = '基于当前候选论文与证据整理，继续推进章节草稿。';
      break;
    case 'library':
      nextFocus = '优先把候选论文整理成结构化笔记、概念索引和可回链资料。';
      deliverableHint = '建议当前产出：structured_note_bundle / 文献笔记包。';
      break;
    case 'ops':
      nextFocus = '优先精读单篇论文，提取实验设置、指标、方法细节与可引用证据。';
      deliverableHint = '建议当前产出：evidence_pack / 精读证据包。';
      break;
    case 'review':
      nextFocus = '优先检查风险、证据强度和可能被追问的问题。';
      break;
    case 'defense-prep':
      nextFocus = '优先准备老师可能追问的问题，并整理每个关键选择背后的理由。';
      break;
    case 'revision-loop':
      nextFocus = '优先拆解反馈意见，区分已修改、待修改和需要补证据的部分。';
      deliverableHint = '建议当前产出：修改清单 / 已改未改跟踪表。';
      break;
    default:
      break;
  }

  return {
    stage: stageLabel,
    workflowIntent,
    nextFocus,
    deliverableHint,
    searchHint: searchSummary?.summary || null,
    defensePrompts: Array.isArray(defenseReady?.prompts) ? [...defenseReady.prompts] : [],
  };
}

function attachGuidanceToUi(result, routePacket, defenseReady, workflowIntent) {
  return {
    ...result,
    ui: {
      ...result.ui,
      guidance: buildGuidanceBlock({
        routePacket,
        stageLabel: result.ui?.stageLabel,
        searchSummary: result.ui?.searchSummary,
        defenseReady,
        workflowIntent,
      }),
    },
  };
}

async function runPaperWriterEntry(input = {}) {
  const routePacket = createEntryRoutePacket(input);
  const goal = routePacket.user_goal;
  const explicitScenario = input.demoScenario || null;
  const entryMode = explicitScenario ? 'demo' : 'route';
  const defenseReady = createDefenseReadyLiteMeta();
  const workflowIntent = getWorkflowIntent(routePacket);
  const recommendedDeliverableType = getRecommendedDeliverableType(workflowIntent);

  let baseResult;
  let selectedScenario = explicitScenario || null;

  if (explicitScenario) {
    baseResult = explicitScenario === 'active-draft'
      ? await runPaperWriterActiveSmoke()
      : await runPaperWriterSmoke();
  } else {
    let state = startRun({
      ...routePacket,
      task_id: routePacket.task_id,
      user_goal: routePacket.user_goal,
      current_phase: 'intake',
    });

    const phase = getRoutePhase(routePacket);
    if (phase !== 'intake') {
      state = advancePaperWriterPhase(state, phase, {
        owner: routePacket.recommended_next_agent || 'paper-writer',
        inputArtifacts: ['goal'],
      });
    }

    const checkpoint = buildEntryCheckpoint(routePacket);
    if (checkpoint && checkpoint.checkpoint_level !== 'soft') {
      state = pauseRun(state, checkpoint);
    }

    baseResult = buildRouteRuntimeResult(state);
  }

  // Enrich the base result in-place instead of 5 layers of shallow-copy
  let result = await attachSearchArtifactToEntryResultWithMode(baseResult, routePacket, {
    searchMode: input.searchMode || 'mock',
    searchProviders: input.searchProviders,
    fetchImpl: input.fetchImpl,
    chromeRunner: input.chromeRunner || input.bbBrowserRunner,
    browserUrl: input.browserUrl,
    sitesDir: input.sitesDir,
  });
  result = attachDeliverableArtifactToEntryResult(result, workflowIntent, recommendedDeliverableType);
  result = attachSearchSummaryToUi(result);
  result = attachStageLabelToUi(result, routePacket);
  result = attachGuidanceToUi(result, routePacket, defenseReady, workflowIntent);

  result.meta = {
    entryMode,
    goal,
    selectedScenario,
    routePacket,
    defenseReady,
    internalStages: getSupportedInternalStages(),
    workflowIntent,
    recommendedDeliverableType,
  };

  return result;
}

module.exports = {
  runPaperWriterEntry,
  selectScenarioFromGoal,
  createEntryRoutePacket,
  createDefenseReadyLiteMeta,
  getWorkflowIntent,
  getRecommendedDeliverableType,
  getSupportedInternalStages,
  shouldAttachSearchArtifact,
  attachSearchArtifactToEntryResult,
  attachSearchArtifactToEntryResultWithMode,
  buildDeliverableArtifactSkeleton,
  attachDeliverableArtifactToEntryResult,
  buildSearchSummary,
  attachSearchSummaryToUi,
  getRoutePhase,
  buildEntryCheckpoint,
  buildRouteRuntimeResult,
  getStageLabel,
  getStageCardTitle,
  attachStageLabelToUi,
  buildGuidanceBlock,
  attachGuidanceToUi,
};
