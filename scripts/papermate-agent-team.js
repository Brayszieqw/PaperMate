const fs = require('node:fs');
const path = require('node:path');
const { createCacheStore } = require('./cache-store');
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
  if (/(paper|thesis|related work|literature|proposal|答辩|开题|文献)/i.test(goal)) return 'research';
  if (/(bug|fix|refactor|test|code|script|实现|修复)/i.test(goal)) return 'coding';
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
  return /(paper|thesis|related work|literature|proposal|biomedical|qa|答辩|开题|文献|论文)/i.test(goal);
}

async function runPlanner(input = {}) {
  const taskType = inferTaskType(input);
  const complexity = inferComplexity(input);
  const owner = isThesisWorkflow(input) ? 'paper-writer' : (taskType === 'coding' ? 'papermate-coder' : 'papermate-router');
  const reviewerNeeded = complexity === 'high' || taskType === 'coding' ? 'yes' : 'no';
  const parallelTargets = isThesisWorkflow(input)
    ? ['papermate-explorer', 'papermate-librarian', 'papermate-researcher']
    : ['papermate-explorer'];

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
      parallel_targets: complexity === 'high' ? parallelTargets : ['none'],
      estimated_files: asArray(input.files).length || 1,
      why_this_plan: [
        `task_type=${taskType}`,
        `complexity=${complexity}`,
        `owner=${owner}`,
      ],
      evidence_needed: isThesisWorkflow(input) ? ['candidate papers', 'selection reasons', 'draft evidence chain'] : ['repo context'],
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
  const sourcePool = asArray(input.sourcePool);
  const ranked = sourcePool.length > 0
    ? sourcePool.map((source, index) => `${index === 0 ? 'official' : 'secondary'}: ${source}`)
    : ['official: no external source pool provided'];
  return {
    role: 'papermate-librarian',
    output: {
      topic: asText(input.goal || input.question || input.prompt, '[pending topic]'),
      sources_ranked: ranked,
      key_points: sourcePool.length > 0 ? ['source pool prepared for synthesis'] : ['no external sources provided'],
      conflicts: [],
      gaps: sourcePool.length > 0 ? [] : ['external source pool not provided'],
      handoff: ['pass ranked sources to papermate-researcher'],
    },
  };
}

async function runResearcher(input = {}) {
  const evidence = asArray(input.evidence || input.sourcePool);
  return {
    role: 'papermate-researcher',
    output: {
      question: asText(input.goal || input.question || input.prompt, '[pending research goal]'),
      conclusion: evidence.length > 0 ? ['evidence synthesized into a short conclusion set'] : ['insufficient evidence for a strong conclusion'],
      evidence,
      caveats: evidence.length > 0 ? [] : ['missing external or retrieved evidence'],
      recommendation: [evidence.length > 0 ? 'continue with drafting or decision-making' : 'collect more sources first'],
    },
  };
}

async function runOracle(input = {}) {
  const options = asArray(input.options);
  const chosen = options[0] || 'continue with the smallest safe path';
  return {
    role: 'papermate-oracle',
    output: {
      chosen_path: chosen,
      rejected_paths: options.slice(1),
      reasoning: ['prefer the smallest route with enough evidence and the lowest write risk'],
      remaining_guards: ['keep writer serial', 'verify before finalizing'],
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

function createPapermateAgentRegistry() {
  return {
    'papermate-router': async (input = {}) => {
      if (isThesisWorkflow(input)) {
        const planner = await runPlanner(input);
        const teamResult = shouldUsePaperWriterAgentTeam({ domain_focus: 'draft' }, { executionMode: input.executionMode || 'swarm' })
          ? await runPaperWriterAgentTeam({
            user_goal: asText(input.goal || input.question || input.prompt, '[pending thesis goal]'),
            domain_focus: input.domainFocus || 'draft',
            recommended_next_agent: 'paper-drafter',
          }, {
            workflowIntent: 'draft',
            searchMode: input.searchMode || 'mock',
            searchProviders: input.searchProviders,
            fetchImpl: input.fetchImpl,
            chromeRunner: input.chromeRunner,
            browserUrl: input.browserUrl,
            sitesDir: input.sitesDir,
          })
          : null;

        const entryResult = await runPaperWriterEntry({
          goal: input.goal || input.question || input.prompt,
          executionMode: input.executionMode || 'swarm',
          searchMode: input.searchMode || 'mock',
          searchProviders: input.searchProviders,
          fetchImpl: input.fetchImpl,
          chromeRunner: input.chromeRunner,
          browserUrl: input.browserUrl,
          sitesDir: input.sitesDir,
        });

        return {
          role: 'papermate-router',
          output: {
            planner: planner.output,
            teamResult,
            entryResult,
          },
        };
      }

      return {
        role: 'papermate-router',
        output: {
          planner: (await runPlanner(input)).output,
          explorer: (await runExplorer(input)).output,
          reviewer_needed: inferTaskType(input) === 'coding',
        },
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
  const cache = createCacheStore();
  const events = [];

  const invoke = async (role, payload = {}) => {
    const handler = registry[role];
    if (typeof handler !== 'function') {
      throw new Error(`unknown papermate role: ${role}`);
    }
    const result = await handler({ ...input, ...payload, cache, events });
    events.push({ role, status: 'completed' });
    return result;
  };

  const planner = await invoke('papermate-planner');
  const explorer = await invoke('papermate-explorer');
  const librarian = await invoke('papermate-librarian', {
    sourcePool: input.sourcePool || ['OpenAI docs', 'PaperMate docs'],
  });
  const oracle = await invoke('papermate-oracle', {
    options: ['keep the thesis workflow narrow', 'expand into broad autonomous drafting'],
  });
  const validator = await invoke('papermate-validator');
  const checkpoint = await invoke('papermate-checkpoint', {
    checkpointType: 'route',
    summary: 'confirm the next execution path',
    choices: ['continue', 'revise plan', 'pause'],
  });
  const snapshot = await invoke('papermate-snapshot');
  const coder = await invoke('papermate-coder', {
    verification: ['implementation delegated to runtime integration'],
  });
  const researcher = await invoke('papermate-researcher', {
    evidence: [...asArray(planner.output.evidence_needed), ...asArray(librarian.output.sources_ranked)],
  });
  const reviewer = await invoke('papermate-reviewer', {
    summary: 'team-wide review pass',
    verdict: 'pass',
    strengths: ['all requested papermate roles executed'],
  });
  const monitor = await invoke('papermate-monitor', { events });
  const optimizer = await invoke('papermate-optimizer', { events });
  const logger = await invoke('papermate-logger', {
    facts: [
      ...asArray(explorer.output.findings),
      ...asArray(researcher.output.conclusion),
    ],
  });
  const router = await invoke('papermate-router', {
    executionMode: input.executionMode || 'swarm',
    searchMode: input.searchMode || 'mock',
  });

  return {
    mode: 'papermate-agent-team',
    executedRoles: [
      'papermate-planner',
      'papermate-explorer',
      'papermate-librarian',
      'papermate-oracle',
      'papermate-validator',
      'papermate-checkpoint',
      'papermate-snapshot',
      'papermate-coder',
      'papermate-researcher',
      'papermate-reviewer',
      'papermate-monitor',
      'papermate-optimizer',
      'papermate-logger',
      'papermate-router',
    ],
    outputs: {
      planner: planner.output,
      explorer: explorer.output,
      librarian: librarian.output,
      oracle: oracle.output,
      validator: validator.output,
      checkpoint: checkpoint.output,
      snapshot: snapshot.output,
      coder: coder.output,
      researcher: researcher.output,
      reviewer: reviewer.output,
      monitor: monitor.output,
      optimizer: optimizer.output,
      logger: logger.output,
      router: router.output,
    },
  };
}

module.exports = {
  inferTaskType,
  inferComplexity,
  isThesisWorkflow,
  createPapermateAgentRegistry,
  runPapermateAgentTeam,
};
