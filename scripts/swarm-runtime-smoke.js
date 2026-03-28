const { runSwarm, SwarmAbortError } = require('./swarm-runtime');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const result = await runSwarm({
    goal: 'Pick the smallest safe implementation path from multiple read branches, then write one merged summary.',
    parallelReadWorkers: 2,
    workers: [
      {
        id: 'read-slow-a',
        owner: 'gpt-explorer',
        roleHint: 'slow-repo-scan',
        goal: 'Scan repo tree slowly',
        deliverable: 'facts',
        run: async (ctx) => {
          for (let i = 0; i < 10; i += 1) {
            await sleep(25);
            ctx.checkCancelled();
          }
          return {
            facts: ['repo scan finished'],
            evidenceRefs: ['repo://scan-a'],
          };
        },
      },
      {
        id: 'read-fast-b',
        owner: 'gpt-librarian',
        roleHint: 'fast-doc-compare',
        goal: 'Find enough evidence quickly',
        deliverable: 'decision input',
        run: async () => ({
          facts: ['official docs already identify one safe path'],
          evidenceRefs: ['docs://safe-path'],
          decisions: ['choose-safe-path'],
        }),
      },
      {
        id: 'read-queued-c',
        owner: 'gpt-researcher',
        roleHint: 'secondary-compare',
        goal: 'Secondary comparison if needed',
        deliverable: 'backup evidence',
        run: async () => ({
          facts: ['secondary comparison ran'],
          evidenceRefs: ['compare://backup'],
        }),
      },
      {
        id: 'writer-merge',
        owner: 'gpt-coder',
        roleHint: 'single-writer-summary',
        goal: 'Write the merged result after read phase',
        deliverable: 'merged summary',
        writeAccess: true,
        run: async (ctx) => {
          const snapshot = ctx.snapshot();
          return {
            facts: [`writer merged ${snapshot.facts.length} fact(s)`],
            decisions: ['writer-ran-once'],
            summary: {
              chosenPath: snapshot.decisions[0] || 'no-decision',
              evidenceCount: snapshot.evidenceRefs.length,
            },
          };
        },
      },
    ],
    stopWhen: ({ blackboard }) => {
      if (blackboard.decisions.includes('choose-safe-path')) return 'enough evidence found';
      return false;
    },
  });

  const smoke = {
    mode: result.mode,
    stopReason: result.stopReason,
    startedReadWorkers: result.startedReadWorkers,
    skippedReadWorkers: result.skippedReadWorkers,
    abortedReadWorkers: result.abortedReadWorkers,
    writerUsed: result.writerUsed,
    finalBlackboard: result.blackboard,
    eventTypes: [...new Set(result.events.map((event) => event.type))],
    readStatuses: result.readResults.map((item) => ({ workerId: item.workerId, status: item.status })),
  };

  console.log(JSON.stringify(smoke, null, 2));
}

main().catch((error) => {
  if (error instanceof SwarmAbortError) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
});
