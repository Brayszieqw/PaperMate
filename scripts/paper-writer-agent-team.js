const { runSwarm } = require('./swarm-runtime');
const { createCacheStore } = require('./cache-store');
const { buildMockCandidateSet, buildRealCandidateSet } = require('./paper-writer-search-layer');

function shouldUsePaperWriterAgentTeam(routePacket, options = {}) {
  const focus = routePacket?.domain_focus;
  return options.executionMode === 'swarm'
    && ['draft', 'library', 'mixed', 'scout', 'proposal-outline'].includes(focus);
}

async function buildSearchArtifactForTeam(routePacket, options = {}) {
  const searchMode = options.searchMode || 'mock';

  return searchMode === 'real' || searchMode === 'browser' || searchMode === 'hybrid'
    ? buildRealCandidateSet({
      query: routePacket.user_goal,
      providers: options.searchProviders || (searchMode === 'browser' || searchMode === 'hybrid' ? ['chrome_cdp_arxiv', 'openalex', 'crossref'] : undefined),
      fetchImpl: options.fetchImpl,
      chromeRunner: options.chromeRunner || options.bbBrowserRunner,
      browserUrl: options.browserUrl,
      sitesDir: options.sitesDir,
    })
    : buildMockCandidateSet({
      query: routePacket.user_goal,
      providers: options.searchProviders,
    });
}

function summarizePaperWriterAgentTeam(swarmResult = {}, searchArtifact = null, cache = null) {
  return {
    mode: swarmResult.mode || 'swarm',
    finalStatus: swarmResult.finalStatus || 'unknown',
    stopReason: swarmResult.stopReason || null,
    startedReadWorkers: Array.isArray(swarmResult.startedReadWorkers) ? [...swarmResult.startedReadWorkers] : [],
    skippedReadWorkers: Array.isArray(swarmResult.skippedReadWorkers) ? [...swarmResult.skippedReadWorkers] : [],
    abortedReadWorkers: Array.isArray(swarmResult.abortedReadWorkers) ? [...swarmResult.abortedReadWorkers] : [],
    writerUsed: swarmResult.writerUsed === true,
    verificationPassed: swarmResult.verificationPassed !== false,
    readStatuses: Array.isArray(swarmResult.readResults)
      ? swarmResult.readResults.map((item) => ({ workerId: item.workerId, status: item.status }))
      : [],
    blackboard: swarmResult.blackboard || null,
    itemCount: Array.isArray(searchArtifact?.items) ? searchArtifact.items.length : 0,
    cacheStats: cache && typeof cache.getStats === 'function' ? cache.getStats() : null,
  };
}

function createThesisScoutTeamWorkers(routePacket, options = {}) {
  const workflowIntent = options.workflowIntent || 'research';

  return [
    {
      id: 'paper-scout-search',
      owner: 'paper-scout',
      roleHint: 'candidate-search',
      goal: 'Build a literature candidate set for the current thesis task',
      deliverable: 'literature_candidate_set',
      run: async () => {
        const searchArtifact = await buildSearchArtifactForTeam(routePacket, options);
        const itemCount = Array.isArray(searchArtifact.items) ? searchArtifact.items.length : 0;
        const providersUsed = Array.isArray(searchArtifact.trace?.providers_used) ? searchArtifact.trace.providers_used : [];
        return {
          facts: [`candidate set built with ${itemCount} item(s)`],
          evidenceRefs: providersUsed.map((providerName) => `provider:${providerName}`),
          decisions: [`search-mode:${options.searchMode || 'mock'}`],
          openQuestions: itemCount === 0 ? ['no search candidates found; broaden query or switch providers'] : [],
          searchArtifact,
        };
      },
    },
    {
      id: 'paper-scout-brief',
      owner: 'papermate-researcher',
      roleHint: 'thesis-workflow-brief',
      goal: 'Produce thesis-scout guidance for the current workflow',
      deliverable: 'swarm guidance facts',
      run: async () => ({
        facts: [
          `workflow-intent:${workflowIntent}`,
          `next-agent:${routePacket.recommended_next_agent || 'paper-writer'}`,
        ],
        decisions: ['swarm-scout-ran'],
        openQuestions: routePacket.domain_focus === 'proposal-outline'
          ? ['confirm proposal scope before turning shortlist into a formal outline']
          : [],
      }),
    },
    {
      id: 'paper-scout-merge',
      owner: 'paper-writer',
      roleHint: 'single-writer-scout-merge',
      goal: 'Merge scout-team findings into one runtime-facing result',
      deliverable: 'swarm scout summary',
      phase: 'write',
      writeAccess: true,
      run: async (ctx) => {
        const searchReadResult = ctx.readResults.find((item) => item.result?.searchArtifact);
        const searchArtifact = searchReadResult?.result?.searchArtifact || null;
        const snapshot = ctx.snapshot();
        const itemCount = Array.isArray(searchArtifact?.items) ? searchArtifact.items.length : 0;

        return {
          facts: [`swarm writer merged ${snapshot.facts.length} fact(s)`],
          decisions: ['swarm-scout-complete'],
          searchArtifact,
          swarmSummary: {
            stage: routePacket.domain_focus,
            workflowIntent,
            itemCount,
            decisionCount: snapshot.decisions.length,
            evidenceRefCount: snapshot.evidenceRefs.length,
            nextAgent: routePacket.recommended_next_agent || 'paper-writer',
          },
        };
      },
    },
  ];
}

async function runPaperWriterAgentTeam(routePacket, options = {}) {
  const cache = createCacheStore();
  const workers = createThesisScoutTeamWorkers(routePacket, options);

  const swarmResult = await runSwarm({
    goal: routePacket.user_goal,
    parallelReadWorkers: 2,
    cache,
    workers,
  });

  const searchArtifact = swarmResult.writerResult?.searchArtifact || null;

  return {
    searchArtifact,
    teamExecution: summarizePaperWriterAgentTeam(swarmResult, searchArtifact, cache),
    teamSummary: swarmResult.writerResult?.swarmSummary || null,
  };
}

module.exports = {
  shouldUsePaperWriterAgentTeam,
  buildSearchArtifactForTeam,
  summarizePaperWriterAgentTeam,
  createThesisScoutTeamWorkers,
  runPaperWriterAgentTeam,
};
