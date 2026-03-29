const { runPapermateAgentTeam } = require('./papermate-agent-team');

function buildOkResponse(result) {
  return {
    ok: true,
    mode: 'papermate-router',
    result,
  };
}

function buildErrorResponse(error) {
  return {
    ok: false,
    mode: 'papermate-router',
    error: typeof error === 'string' ? error : (error.message || String(error)),
  };
}

async function dispatch(input = {}) {
  try {
    const result = await runPapermateAgentTeam(input);
    return buildOkResponse(result);
  } catch (error) {
    return buildErrorResponse(error);
  }
}

if (require.main === module) {
  const MAX_STDIN_BYTES = 10 * 1024 * 1024;
  let raw = '';
  let byteCount = 0;

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    byteCount += Buffer.byteLength(chunk, 'utf8');
    if (byteCount > MAX_STDIN_BYTES) {
      process.stdout.write(JSON.stringify(buildErrorResponse(`input exceeds ${MAX_STDIN_BYTES} bytes`)) + '\n');
      process.exit(1);
    }
    raw += chunk;
  });

  process.stdin.on('end', async () => {
    let input;
    try {
      input = JSON.parse(raw.trim() || '{}');
    } catch {
      process.stdout.write(JSON.stringify(buildErrorResponse('invalid JSON input')) + '\n');
      process.exit(1);
    }

    const result = await dispatch(input);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.ok ? 0 : 1);
  });
}

module.exports = {
  dispatch,
};
