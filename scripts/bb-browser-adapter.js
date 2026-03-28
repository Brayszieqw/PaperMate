const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_BB_BROWSER_CLI_PATH = path.join(__dirname, '..', 'third_party', 'bb-browser', 'dist', 'cli.js');

function getDefaultBbBrowserCliPath() {
  return DEFAULT_BB_BROWSER_CLI_PATH;
}

function resolveBbBrowserInvocation(options = {}) {
  const configuredPath = options.cliPath || process.env.BB_BROWSER_CLI || DEFAULT_BB_BROWSER_CLI_PATH;
  const cliPath = typeof configuredPath === 'string' ? configuredPath.trim() : '';

  if (cliPath.endsWith('.js') && fs.existsSync(cliPath)) {
    return {
      command: process.execPath,
      args: [cliPath],
      cwd: path.dirname(cliPath),
      cliPath,
    };
  }

  return {
    command: cliPath || 'bb-browser',
    args: [],
    cwd: options.cwd || process.cwd(),
    cliPath,
  };
}

function parseBbBrowserJson(rawOutput, context) {
  try {
    return JSON.parse(rawOutput);
  } catch {
    throw new Error(`${context} returned non-JSON output`);
  }
}

async function runBbBrowserJson(argv = [], options = {}) {
  if (typeof options.runner === 'function') {
    return options.runner(argv, options);
  }

  const invocation = resolveBbBrowserInvocation(options);
  const result = spawnSync(invocation.command, [...invocation.args, ...argv], {
    cwd: options.cwd || invocation.cwd,
    env: { ...process.env, ...(options.env || {}) },
    encoding: 'utf8',
  });

  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || '').trim();
  const context = `bb-browser ${argv.join(' ')}`.trim();

  if (stdout) {
    const parsed = parseBbBrowserJson(stdout, context);
    if (result.status === 0) {
      return parsed;
    }
    if (parsed && typeof parsed === 'object' && parsed.success === false) {
      return parsed;
    }
  }

  const message = stderr || stdout || `${context} exited with code ${result.status}`;
  throw new Error(message);
}

function unwrapBbBrowserEnvelope(payload, context = 'bb-browser') {
  if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'success')) {
    if (payload.success === false) {
      throw new Error(payload.error || `${context} failed`);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'data')) {
      return payload.data;
    }
  }

  return payload;
}

async function runBbBrowserSiteCommand({ siteName, args = [], runner, cliPath, cwd, env } = {}) {
  if (!siteName) {
    throw new Error('runBbBrowserSiteCommand requires siteName');
  }

  const argv = ['site', siteName, ...args.filter((value) => value !== undefined && value !== null).map((value) => String(value)), '--json'];
  const payload = await runBbBrowserJson(argv, { runner, cliPath, cwd, env });
  return unwrapBbBrowserEnvelope(payload, `bb-browser site ${siteName}`);
}

async function searchArxivWithBbBrowser(options = {}) {
  return runBbBrowserSiteCommand({
    siteName: 'arxiv/search',
    args: [options.query, options.count || 10],
    runner: options.runner,
    cliPath: options.cliPath,
    cwd: options.cwd,
    env: options.env,
  });
}

async function searchGoogleWithBbBrowser(options = {}) {
  return runBbBrowserSiteCommand({
    siteName: 'google/search',
    args: [options.query, options.count || 10],
    runner: options.runner,
    cliPath: options.cliPath,
    cwd: options.cwd,
    env: options.env,
  });
}

async function searchStackOverflowWithBbBrowser(options = {}) {
  return runBbBrowserSiteCommand({
    siteName: 'stackoverflow/search',
    args: [options.query, options.count || 10],
    runner: options.runner,
    cliPath: options.cliPath,
    cwd: options.cwd,
    env: options.env,
  });
}

async function getWikipediaSummaryWithBbBrowser(options = {}) {
  return runBbBrowserSiteCommand({
    siteName: 'wikipedia/summary',
    args: [options.title],
    runner: options.runner,
    cliPath: options.cliPath,
    cwd: options.cwd,
    env: options.env,
  });
}

async function searchWebWithBbBrowser(options = {}) {
  const siteName = options.siteName || 'google/search';

  if (siteName === 'arxiv/search') {
    return searchArxivWithBbBrowser(options);
  }

  if (siteName === 'stackoverflow/search') {
    return searchStackOverflowWithBbBrowser(options);
  }

  if (siteName === 'wikipedia/summary') {
    return getWikipediaSummaryWithBbBrowser(options);
  }

  return searchGoogleWithBbBrowser(options);
}

module.exports = {
  DEFAULT_BB_BROWSER_CLI_PATH,
  getDefaultBbBrowserCliPath,
  resolveBbBrowserInvocation,
  runBbBrowserJson,
  unwrapBbBrowserEnvelope,
  runBbBrowserSiteCommand,
  searchArxivWithBbBrowser,
  searchGoogleWithBbBrowser,
  searchStackOverflowWithBbBrowser,
  getWikipediaSummaryWithBbBrowser,
  searchWebWithBbBrowser,
};
