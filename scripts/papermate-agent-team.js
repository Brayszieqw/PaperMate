const fs = require('node:fs');
const path = require('node:path');
const { runPaperWriterEntry } = require('./paper-writer-entry');
const { shouldUsePaperWriterAgentTeam, runPaperWriterAgentTeam } = require('./paper-writer-agent-team');

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function asText(value, fallback = '') {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
}

function inferTaskType(input = {}) {
  if (input.taskType) return input.taskType;
  const goal = asText(input.goal || input.question || input.prompt, '').toLowerCase();
  if (!goal) return 'mixed';
  if (/(paper|thesis|related work|literature|proposal|biomedical|qa|论文|文献|开题|答辩)/i.test(goal)) return 'research';
  if (/(bug|fix|refactor|test|code|script|implement|coding|修复|实现)/i.test(goal)) return 'coding';
  if (/(explain|what|why|how|说明|解释)/i.test(goal)) return 'answer';
  return 'mixed';
}

function inferComplexity(input = {}) {
  if (input.complexity) return input.complexity;
  const goal = asText(input.goal || input.question || input.prompt, '');
  const fileCount = asArray(input.files).length;
  if (goal.length > 180 || fileCount > 3) return 'high';
  if (goal.length > 80 || fileCount > 1) return 'medium';
  return 'low';
}

function isThesisWorkflow(input = {}) {
  const goal = asText(input.goal || input.question || input.prompt, '').toLowerCase();
  return /(paper|thesis|related work|literature|proposal|biomedical|qa|论文|文献|开题|答辩)/i.test(goal);
}

function needsRepoInspection(input = {}) {
  return inferTaskType(input) === 'coding' || asArray(input.files).length > 0 || input.inspectRepo === true;
}

function needsSnapshot(input = {}) {
  return inferTaskType(input) === 'coding' || input.requiresWrite === true;
}

function needsReviewer(input = {}, plannerOutput = {}) {
  return plannerOutput.reviewer_needed === 'yes' || inferTaskType(input) === 'coding' || input.forceReview === true;
}

function shouldEnableObservability(input = {}, plannerOutput = {}) {
  return input.executionMode === 'swarm' || plannerOutput.complexity === 'high' || input.enableMonitoring === true;
}

function shouldEnableOptimization(input = {}, plannerOutput = {}) {
  return input.optimize === true || plannerOutput.complexity === 'high';
}

function shouldEnableLogging(input = {}) {
  return input.enableLogging === true || input.logSummary === true;
}

function buildRouterFinalResult({ planner, sourceBundle, synthesisArtifact, oracleDecision, entryResult } = {}) {
  const sourceItems = asArray(sourceBundle?.items);
  const selectedSources = sourceItems.slice(0, 3).map((item) => ({
    title: item.title || '[untitled source]',
    provider: item.provider || item.provider_name || 'unknown_provider',
    selection_reason: item.selection_reason || null,
  }));
  const recommendedPath = oracleDecision?.chosen_path || 'continue with the smallest safe path';
  const summary = synthesisArtifact?.conclusion || 'No synthesis artifact available yet.';
  const nextAction = entryResult?.meta?.routePacket?.recommended_next_agent || planner?.owner || 'paper-writer';

  return {
    constrainedByArtifacts: true,
    task_type: planner?.task_type || 'mixed',
    complexity: planner?.complexity || 'unknown',
    recommended_path: recommendedPath,
    next_action: nextAction,
    selected_sources: selectedSources,
    synthesis_summary: summary,
    guardrails: asArray(oracleDecision?.remaining_guards),
    evidence_count: sourceItems.length,
  };
}

async function runPlanner(input = {}) {
  const taskType = inferTaskType(input);
  const complexity = inferComplexity(input);
  const owner = isThesisWorkflow(input) ? 'paper-writer' : (taskType === 'coding' ? 'papermate-coder' : 'papermate-router');
  const reviewerNeeded = complexity === 'high' || taskType === 'coding' ? 'yes' : 'no';
  const parallelTargets = isThesisWorkflow(input)
    ? ['papermate-librarian', 'papermate-researcher']
    : (needsRepoInspection(input) ? ['papermate-explorer'] : ['none']);

  return {
    role: 'papermate-planner',
    output: {
      task_type: taskType,
      complexity,
      owner,
      reviewer_needed: reviewerNeeded,
      optional_roles: reviewerNeeded === 'yes' ? ['papermate-reviewer'] : ['none'],
      papermates_path: taskType === 'coding' ? ['papermates/brainstorming', 'papermates/writing-plans'] : ['none'],
      parallelism: complexity === 'high' ? 'read-only' : 'none',
      parallel_targets: parallelTargets,
      estimated_files: asArray(input.files).length || 1,
      why_this_plan: [
        `task_type=${taskType}`,
        `complexity=${complexity}`,
        `owner=${owner}`,
      ],
      evidence_needed: isThesisWorkflow(input)
        ? ['candidate papers', 'selection reasons', 'draft evidence chain']
        : ['repo context'],
      steps: isThesisWorkflow(input)
        ? [
          'route the thesis task into paper-writer workflow',
          'collect literature candidates and evidence',
          'merge into one user-facing result',
        ]
        : [
          'inspect the target area',
          'perform one serial implementation',
          'verify and review before completion',
        ],
      risks: complexity === 'high' ? ['scope drift', 'insufficient verification'] : ['none'],
      clarification_needed: 'none',
    },
  };
}

async function runExplorer(input = {}) {
  const cwd = path.resolve(input.cwd || process.cwd());
  const limit = input.limit || 30;
  const entries = await fs.promises.readdir(cwd, { withFileTypes: true });
  const names = entries.slice(0, limit).map((entry) => entry.name + (entry.isDirectory() ? '/' : ''));
  return {
    role: 'papermate-explorer',
    output: {
      target: cwd,
      findings: [`top-level entries inspected: ${names.length}`],
      entrypoints: names.filter((name) => /^(agents|commands|docs|scripts|skills)\//.test(name)),
      dependencies: ['filesystem'],
      impact_scope: names,
      unknowns: [],
    },
  };
}

async function runLibrarian(input = {}) {
  const candidateItems = asArray(input.candidateSet?.items);
  const sourcePool = asArray(input.sourcePool);
  const ranked = candidateItems.length > 0
    ? candidateItems.slice(0, 6).map((item, index) => ({
      level: index < 3 ? 'official' : 'secondary',
      title: item.title,
      provider: item.provider_name,
      selection_reason: item.selection_reason || null,
      claim_support_scope: item.claim_support_scope || null,
      url: item.url || null,
      doi: item.doi || null,
    }))
    : sourcePool.map((source, index) => ({
      level: index === 0 ? 'official' : 'secondary',
      title: String(source),
      provider: 'manual_source_pool',
      selection_reason: null,
      claim_support_scope: null,
      url: null,
      doi: null,
    }));

  const sourceBundle = {
    artifact_type: 'source_bundle',
    topic: asText(input.goal || input.question || input.prompt, '[pending topic]'),
    item_count: ranked.length,
    items: ranked,
  };

  return {
    role: 'papermate-librarian',
    output: {
      topic: sourceBundle.topic,
      sources_ranked: ranked,
      source_bundle: sourceBundle,
      key_points: ranked.length > 0 ? ['source bundle prepared for synthesis'] : ['no external sources provided'],
      conflicts: [],
      gaps: ranked.length > 0 ? [] : ['external source pool not provided'],
      handoff: ['pass ranked sources to papermate-researcher'],
    },
  };
}

async function runResearcher(input = {}) {
  const sourceBundle = input.sourceBundle || null;
  const sourceItems = asArray(sourceBundle?.items);
  const evidence = sourceItems.length > 0 ? sourceItems : asArray(input.evidence || input.sourcePool);
  const topTitles = evidence.slice(0, 3).map((item) => item.title || String(item));
  const synthesisArtifact = {
    artifact_type: 'research_synthesis',
    topic: asText(input.goal || input.question || input.prompt, '[pending research goal]'),
    highlights: topTitles,
    evidence_count: evidence.length,
    conclusion: evidence.length > 0
      ? `Synthesis prepared from ${evidence.length} ranked source(s) with focus on ${topTitles.join('; ')}`
      : 'Insufficient evidence for a strong synthesis',
  };

  return {
    role: 'papermate-researcher',
    output: {
      question: synthesisArtifact.topic,
      synthesis_artifact: synthesisArtifact,
      conclusion: evidence.length > 0 ? [synthesisArtifact.conclusion] : ['insufficient evidence for a strong conclusion'],
      evidence,
      caveats: evidence.length > 0 ? [] : ['missing external or retrieved evidence'],
      recommendation: [evidence.length > 0 ? 'continue with drafting or decision-making' : 'collect more sources first'],
    },
  };
}

async function runOracle(input = {}) {
  const options = asArray(input.options);
  const chosen = options[0] || 'continue with the smallest safe path';
  const synthesisArtifact = input.synthesisArtifact || null;
  return {
    role: 'papermate-oracle',
    output: {
      chosen_path: chosen,
      rejected_paths: options.slice(1),
      reasoning: ['prefer the smallest route with enough evidence and the lowest write risk'],
      remaining_guards: ['keep writer serial', 'verify before finalizing'],
      decision_basis: synthesisArtifact
        ? `decision informed by synthesis artifact with ${synthesisArtifact.evidence_count} source(s)`
        : 'decision based on route heuristics only',
    },
  };
}

async function runValidator(input = {}) {
  const command = asText(input.command, '');
  const hasDangerousPattern = /(rm -rf|git push --force|drop table|delete from|terraform destroy|npm publish)/i.test(command);
  const allowExecute = hasDangerousPattern ? 'deny' : (command ? 'conditional' : 'allow');
  return {
    role: 'papermate-validator',
    output: {
      risk_level: hasDangerousPattern ? 'critical' : (command ? 'medium' : 'low'),
      allow_execute: allowExecute,
      findings: command ? [`command inspected: ${command}`] : ['no executable command provided'],
      required_guards: hasDangerousPattern ? ['explicit user confirmation required'] : ['parameterize input and keep scope narrow'],
      safe_alternative: hasDangerousPattern ? ['replace destructive command with read-only inspection or narrower operation'] : ['none'],
    },
  };
}

async function runCheckpoint(input = {}) {
  const choices = asArray(input.choices).length > 0 ? asArray(input.choices) : ['continue', 'pause', 'revise'];
  return {
    role: 'papermate-checkpoint',
    output: {
      checkpoint_type: asText(input.checkpointType, 'route'),
      summary: asText(input.summary, '[pending checkpoint summary]'),
      recommended_choice: choices[0],
      choices,
    },
  };
}

async function runSnapshot(input = {}) {
  return {
    role: 'papermate-snapshot',
    output: {
      snapshot_id: asText(input.snapshotId, `snapshot-${Date.now()}`),
      mode: 'logical',
      note: 'snapshot role is implemented as a runtime step; actual git snapshot execution remains host-controlled',
    },
  };
}

async function runCoder(input = {}) {
  return {
    role: 'papermate-coder',
    output: {
      intent: asText(input.goal || input.question || input.prompt, '[pending implementation goal]'),
      files_changed: asArray(input.files),
      verification: asArray(input.verification).length > 0 ? asArray(input.verification) : ['verification delegated to caller'],
      residual_risks: asArray(input.risks).length > 0 ? asArray(input.risks) : ['none'],
    },
  };
}

async function runReviewer(input = {}) {
  return {
    role: 'papermate-reviewer',
    output: {
      summary: asText(input.summary, 'independent review completed'),
      verdict: asText(input.verdict, 'pass'),
      strengths: asArray(input.strengths).length > 0 ? asArray(input.strengths) : ['serial execution path preserved'],
      issues: asArray(input.issues).length > 0 ? asArray(input.issues) : ['none'],
      blockers: asArray(input.blockers),
      suggestions: asArray(input.suggestions),
      missing_checks: asArray(input.missingChecks),
      risk_level: asText(input.riskLevel, 'low'),
      recommendation: asArray(input.recommendation).length > 0 ? asArray(input.recommendation) : ['ready for next step'],
    },
  };
}

async function runMonitor(input = {}) {
  const events = asArray(input.events);
  return {
    role: 'papermate-monitor',
    output: {
      plugin_health: 'unknown',
      telemetry_gap: events.length > 0 ? 'minor' : 'major',
      health: events.length > 0 ? 'warning' : 'critical',
      evidence: events.length > 0 ? [`events observed: ${events.length}`] : ['no execution events provided'],
      missing_signals: events.length > 0 ? [] : ['execution trace'],
      chain_anomalies: [],
      resource_risks: [],
      fallback_mode: 'minimal',
      recommended_actions: events.length > 0 ? ['continue with minimal observability'] : ['collect execution trace first'],
    },
  };
}

async function runOptimizer(input = {}) {
  const events = asArray(input.events);
  return {
    role: 'papermate-optimizer',
    output: {
      opportunities: events.length > 0 ? ['reduce duplicate read-only work', 'tighten route selection'] : ['need more history before optimizing'],
      recommendation: events.length > 0 ? ['keep writer serial and narrow team width'] : ['collect more run history'],
    },
  };
}

async function runLogger(input = {}) {
  const facts = asArray(input.facts);
  return {
    role: 'papermate-logger',
    output: {
      summary: `logged ${facts.length} fact(s)`,
      relative_dir: 'logs',
      file_name: 'papermate-summary.md',
    },
  };
}

function buildPapermateExecutionPlan(input = {}, plannerOutput = null) {
  const planner = plannerOutput || {
    task_type: inferTaskType(input),
    complexity: inferComplexity(input),
    reviewer_needed: inferTaskType(input) === 'coding' ? 'yes' : 'no',
  };

  const roles = ['papermate-planner', 'papermate-validator'];

  if (isThesisWorkflow(input)) {
    roles.push('papermate-librarian', 'papermate-researcher', 'papermate-oracle');
  }

  if (needsRepoInspection(input)) {
    roles.push('papermate-explorer');
  }

  if (needsSnapshot(input)) {
    roles.push('papermate-snapshot', 'papermate-coder');
  }

  if (input.requireCheckpoint === true) {
    roles.push('papermate-checkpoint');
  }

  if (needsReviewer(input, planner)) {
    roles.push('papermate-reviewer');
  }

  if (shouldEnableObservability(input, planner)) {
    roles.push('papermate-monitor');
  }

  if (shouldEnableOptimization(input, planner)) {
    roles.push('papermate-optimizer');
  }

  if (shouldEnableLogging(input)) {
    roles.push('papermate-logger');
  }

  roles.push('papermate-router');

  return {
    task_type: planner.task_type,
    complexity: planner.complexity,
    roles: Array.from(new Set(roles)),
  };
}

function createPapermateAgentRegistry() {
  return {
    'papermate-router': async (input = {}) => {
      if (isThesisWorkflow(input)) {
        const planner = await runPlanner(input);
        const teamResult = input.teamResult
          || (shouldUsePaperWriterAgentTeam({ domain_focus: input.domainFocus || 'draft' }, { executionMode: input.executionMode || 'swarm' })
            ? await runPaperWriterAgentTeam({
              user_goal: asText(input.goal || input.question || input.prompt, '[pending thesis goal]'),
              domain_focus: input.domainFocus || 'draft',
              recommended_next_agent: 'paper-drafter',
            }, {
              workflowIntent: input.workflowIntent || 'draft',
              searchMode: input.searchMode || 'mock',
              searchProviders: input.searchProviders,
              fetchImpl: input.fetchImpl,
              chromeRunner: input.chromeRunner,
              browserUrl: input.browserUrl,
              sitesDir: input.sitesDir,
            })
            : null);

        const entryResult = input.entryResult || await runPaperWriterEntry({
          goal: input.goal || input.question || input.prompt,
          executionMode: input.executionMode || 'swarm',
          searchMode: input.searchMode || 'mock',
          searchProviders: input.searchProviders,
          fetchImpl: input.fetchImpl,
          chromeRunner: input.chromeRunner,
          browserUrl: input.browserUrl,
          sitesDir: input.sitesDir,
        });

        const effectiveSourceBundle = input.sourceBundle
          || teamResult?.searchArtifact
          || null;

        return {
          role: 'papermate-router',
          output: {
            planner: planner.output,
            source_bundle: effectiveSourceBundle,
            synthesis_artifact: input.synthesisArtifact || null,
            oracle_decision: input.oracleDecision || null,
            teamResult,
            entryResult,
            final_result: buildRouterFinalResult({
              planner: planner.output,
              sourceBundle: effectiveSourceBundle,
              synthesisArtifact: input.synthesisArtifact || null,
              oracleDecision: input.oracleDecision || null,
              entryResult,
            }),
          },
        };
      }

      const planner = await runPlanner(input);
      const output = {
        planner: planner.output,
      };

      if (needsRepoInspection(input)) {
        output.explorer = (await runExplorer(input)).output;
      }

      output.reviewer_needed = needsReviewer(input, planner.output);
      output.final_result = buildRouterFinalResult({
        planner: planner.output,
        sourceBundle: input.sourceBundle || null,
        synthesisArtifact: input.synthesisArtifact || null,
        oracleDecision: input.oracleDecision || null,
        entryResult: input.entryResult || null,
      });

      return {
        role: 'papermate-router',
        output,
      };
    },
    'papermate-planner': runPlanner,
    'papermate-explorer': runExplorer,
    'papermate-librarian': runLibrarian,
    'papermate-researcher': runResearcher,
    'papermate-oracle': runOracle,
    'papermate-validator': runValidator,
    'papermate-checkpoint': runCheckpoint,
    'papermate-snapshot': runSnapshot,
    'papermate-coder': runCoder,
    'papermate-reviewer': runReviewer,
    'papermate-monitor': runMonitor,
    'papermate-optimizer': runOptimizer,
    'papermate-logger': runLogger,
  };
}

async function runPapermateAgentTeam(input = {}) {
  const registry = createPapermateAgentRegistry();
  const events = [];

  const invoke = async (role, payload = {}) => {
    const handler = registry[role];
    if (typeof handler !== 'function') {
      throw new Error(`unknown papermate role: ${role}`);
    }
    const result = await handler({ ...input, ...payload, events });
    events.push({ role, status: 'completed' });
    return result;
  };

  const planner = await invoke('papermate-planner');
  const executionPlan = buildPapermateExecutionPlan(input, planner.output);
  const outputs = {
    planner: planner.output,
  };
  const thesisCandidateSet = isThesisWorkflow(input) && shouldUsePaperWriterAgentTeam({ domain_focus: input.domainFocus || 'draft' }, { executionMode: input.executionMode || 'swarm' })
    ? await runPaperWriterAgentTeam({
      user_goal: asText(input.goal || input.question || input.prompt, '[pending thesis goal]'),
      domain_focus: input.domainFocus || 'draft',
      recommended_next_agent: 'paper-drafter',
    }, {
      workflowIntent: input.workflowIntent || 'draft',
      searchMode: input.searchMode || 'mock',
      searchProviders: input.searchProviders,
      fetchImpl: input.fetchImpl,
      chromeRunner: input.chromeRunner,
      browserUrl: input.browserUrl,
      sitesDir: input.sitesDir,
    })
    : null;

  if (thesisCandidateSet) {
    outputs.thesisCandidateSet = thesisCandidateSet;
  }

  const validator = await invoke('papermate-validator');
  outputs.validator = validator.output;

  let explorer = null;
  if (executionPlan.roles.includes('papermate-explorer')) {
    explorer = await invoke('papermate-explorer');
    outputs.explorer = explorer.output;
  }

  let librarian = null;
  if (executionPlan.roles.includes('papermate-librarian')) {
    librarian = await invoke('papermate-librarian', {
      candidateSet: input.candidateSet || thesisCandidateSet?.searchArtifact || null,
      sourcePool: input.sourcePool || ['OpenAI docs', 'PaperMate docs'],
    });
    outputs.librarian = librarian.output;
  }

  let researcher = null;
  if (executionPlan.roles.includes('papermate-researcher')) {
    researcher = await invoke('papermate-researcher', {
      sourceBundle: librarian?.output?.source_bundle || null,
      evidence: [
        ...asArray(planner.output.evidence_needed),
        ...asArray(librarian?.output?.sources_ranked),
      ],
    });
    outputs.researcher = researcher.output;
  }

  let oracle = null;
  if (executionPlan.roles.includes('papermate-oracle')) {
    oracle = await invoke('papermate-oracle', {
      options: ['keep the thesis workflow narrow', 'expand into broad autonomous drafting'],
      synthesisArtifact: researcher?.output?.synthesis_artifact || null,
    });
    outputs.oracle = oracle.output;
  }

  let checkpoint = null;
  if (executionPlan.roles.includes('papermate-checkpoint')) {
    checkpoint = await invoke('papermate-checkpoint', {
      checkpointType: 'route',
      summary: 'confirm the next execution path',
      choices: ['continue', 'revise plan', 'pause'],
    });
    outputs.checkpoint = checkpoint.output;
  }

  let snapshot = null;
  if (executionPlan.roles.includes('papermate-snapshot')) {
    snapshot = await invoke('papermate-snapshot');
    outputs.snapshot = snapshot.output;
  }

  let coder = null;
  if (executionPlan.roles.includes('papermate-coder')) {
    coder = await invoke('papermate-coder', {
      verification: ['implementation delegated to runtime integration'],
    });
    outputs.coder = coder.output;
  }

  let reviewer = null;
  if (executionPlan.roles.includes('papermate-reviewer')) {
    reviewer = await invoke('papermate-reviewer', {
      summary: 'team-wide review pass',
      verdict: 'pass',
      strengths: ['all requested papermate roles executed'],
    });
    outputs.reviewer = reviewer.output;
  }

  let monitor = null;
  if (executionPlan.roles.includes('papermate-monitor')) {
    monitor = await invoke('papermate-monitor', { events });
    outputs.monitor = monitor.output;
  }

  let optimizer = null;
  if (executionPlan.roles.includes('papermate-optimizer')) {
    optimizer = await invoke('papermate-optimizer', { events });
    outputs.optimizer = optimizer.output;
  }

  let logger = null;
  if (executionPlan.roles.includes('papermate-logger')) {
    logger = await invoke('papermate-logger', {
      facts: [
        ...asArray(explorer?.output?.findings),
        ...asArray(researcher?.output?.conclusion),
      ],
    });
    outputs.logger = logger.output;
  }

  const router = await invoke('papermate-router', {
    executionMode: input.executionMode || 'swarm',
    searchMode: input.searchMode || 'mock',
    candidateSet: input.candidateSet || thesisCandidateSet?.searchArtifact || null,
    sourceBundle: librarian?.output?.source_bundle || null,
    synthesisArtifact: researcher?.output?.synthesis_artifact || null,
    oracleDecision: oracle?.output || null,
    teamResult: thesisCandidateSet || null,
  });
  outputs.router = router.output;

  return {
    mode: 'papermate-agent-team',
    executionPlan,
    executedRoles: executionPlan.roles,
    outputs,
  };
}

module.exports = {
  inferTaskType,
  inferComplexity,
  isThesisWorkflow,
  needsRepoInspection,
  needsSnapshot,
  needsReviewer,
  shouldEnableObservability,
  shouldEnableOptimization,
  shouldEnableLogging,
  buildPapermateExecutionPlan,
  createPapermateAgentRegistry,
  buildRouterFinalResult,
  runPapermateAgentTeam,
};
