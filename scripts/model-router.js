/**
 * model-router.js - Task complexity scoring and model selection
 *
 * Scores workers/plans on 5 dimensions (max 15 points) and routes to an
 * appropriately sized model so low-complexity tasks do not always pay for
 * frontier capacity.
 */

const MODEL_TIERS = {
  trivial: { score: [0, 3], model: 'gpt-5.4-mini', label: 'trivial' },
  simple: { score: [4, 6], model: 'gpt-5.4-mini', label: 'simple' },
  medium: { score: [7, 9], model: 'gpt-5.4', label: 'medium' },
  complex: { score: [10, 12], model: 'gpt-5.4', label: 'complex' },
  hard: { score: [13, 15], model: 'gpt-5.4', label: 'hard' },
};

/**
 * Score a single worker based on complexity dimensions
 * Returns score 0-15
 */
function scoreWorker(worker) {
  let score = 0;

  // 1. Operation type (0-3)
  if (worker.kind === 'read_file' || worker.kind === 'grep' || worker.kind === 'list_dir') {
    score += 0;
  } else if (worker.kind === 'replace_text' || worker.kind === 'insert_lines') {
    score += 1;
  } else if (worker.kind === 'create_file' || worker.kind === 'delete_lines') {
    score += 2;
  } else if (worker.kind === 'synthesize' || worker.kind === 'write_batch') {
    score += 3;
  }

  // 2. File count (0-3) - estimate from worker spec
  const fileCount = (worker.filePath ? 1 : 0) + (worker.path ? 1 : 0);
  if (fileCount === 0) {
    score += 0;
  } else if (fileCount === 1) {
    score += 1;
  } else if (fileCount <= 3) {
    score += 2;
  } else {
    score += 3;
  }

  // 3. Context requirement (0-3)
  if (!worker.regex && !worker.filePath) {
    score += 0;
  } else if (worker.kind === 'grep') {
    score += 1;
  } else if (worker.kind === 'replace_text' || worker.kind === 'insert_lines') {
    score += 2;
  } else if (worker.kind === 'synthesize') {
    score += 3;
  }

  // 4. Reasoning depth (0-3)
  if (worker.kind === 'read_file' || worker.kind === 'list_dir') {
    score += 0;
  } else if (worker.kind === 'grep' || worker.kind === 'assert_file_contains') {
    score += 1;
  } else if (worker.kind === 'replace_text' || worker.kind === 'insert_lines') {
    score += 2;
  } else if (worker.kind === 'synthesize' || worker.kind === 'write_batch') {
    score += 3;
  }

  // 5. Risk coefficient (0-3)
  if (worker.kind === 'read_file' || worker.kind === 'grep' || worker.kind === 'list_dir') {
    score += 0;
  } else if (worker.kind === 'assert_file_contains' || worker.kind === 'run_command') {
    score += 1;
  } else if (worker.kind === 'replace_text' || worker.kind === 'insert_lines') {
    score += 2;
  } else if (worker.kind === 'delete_lines' || worker.kind === 'create_file' || worker.kind === 'synthesize') {
    score += 3;
  }

  return Math.min(score, 15);
}

/**
 * Score an entire plan based on worker composition
 * Returns score 0-15
 */
function scorePlan(plan) {
  if (!plan.workers || plan.workers.length === 0) {
    return 0;
  }

  const scores = plan.workers.map(scoreWorker);
  const maxScore = Math.max(...scores);
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  // Use max score as primary indicator, with avg as secondary
  return Math.max(maxScore, avgScore);
}

/**
 * Route to appropriate model based on complexity score
 * Returns model identifier string
 */
function routeModel(score) {
  if (score <= 3) return MODEL_TIERS.trivial.model;
  if (score <= 6) return MODEL_TIERS.simple.model;
  if (score <= 9) return MODEL_TIERS.medium.model;
  if (score <= 12) return MODEL_TIERS.complex.model;
  return MODEL_TIERS.hard.model;
}

/**
 * Get tier label for a score
 */
function getTierLabel(score) {
  if (score <= 3) return MODEL_TIERS.trivial.label;
  if (score <= 6) return MODEL_TIERS.simple.label;
  if (score <= 9) return MODEL_TIERS.medium.label;
  if (score <= 12) return MODEL_TIERS.complex.label;
  return MODEL_TIERS.hard.label;
}

module.exports = {
  scoreWorker,
  scorePlan,
  routeModel,
  getTierLabel,
  MODEL_TIERS,
};
