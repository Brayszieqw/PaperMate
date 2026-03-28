const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

const DEFAULT_BROWSER_URL = process.env.CHROME_DEVTOOLS_BROWSER_URL || 'http://127.0.0.1:19825';
const DEFAULT_BB_SITES_DIR = path.join(process.env.USERPROFILE || process.env.HOME || '', '.bb-browser', 'bb-sites');
const ALLOW_UNTRUSTED_BB_SITES = process.env.PAPERMATE_ALLOW_UNTRUSTED_BB_SITES === '1';

function getDefaultBrowserUrl() {
  return DEFAULT_BROWSER_URL;
}

function getDefaultBbSitesDir() {
  return DEFAULT_BB_SITES_DIR;
}

function normalizeBrowserUrl(browserUrl = DEFAULT_BROWSER_URL) {
  return String(browserUrl).trim().replace(/\/+$/, '');
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}: ${url}`);
  }
  return response.json();
}

async function getBrowserWebSocketUrl(browserUrl = DEFAULT_BROWSER_URL) {
  const payload = await fetchJson(`${normalizeBrowserUrl(browserUrl)}/json/version`);
  if (!payload.webSocketDebuggerUrl) {
    throw new Error(`No browser websocket endpoint found at ${browserUrl}`);
  }
  return payload.webSocketDebuggerUrl;
}

async function listPageTargets(browserUrl = DEFAULT_BROWSER_URL) {
  const payload = await fetchJson(`${normalizeBrowserUrl(browserUrl)}/json/list`);
  return Array.isArray(payload) ? payload.filter((item) => item.type === 'page') : [];
}

function parseSiteMeta(adapterSource) {
  const metaMatch = String(adapterSource || '').match(/\/\*\s*@meta\s*\n([\s\S]*?)\*\//);
  if (!metaMatch) {
    return null;
  }

  try {
    return JSON.parse(metaMatch[1]);
  } catch {
    return null;
  }
}

function assertSafeSiteName(siteName) {
  const normalized = String(siteName || '').trim();
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0) {
    throw new Error('resolveSiteAdapterPath requires a siteName');
  }

  for (const segment of segments) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(segment)) {
      throw new Error(`invalid site adapter path segment: ${segment}`);
    }
  }

  return segments;
}

function isSubPath(rootDir, candidatePath) {
  const relative = path.relative(rootDir, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveSiteAdapterPath(siteName, options = {}) {
  const sitesDir = path.resolve(options.sitesDir || process.env.BB_SITES_DIR || DEFAULT_BB_SITES_DIR);
  const segments = assertSafeSiteName(siteName);
  const adapterPath = path.resolve(sitesDir, ...segments) + '.js';

  if (!isSubPath(sitesDir, adapterPath)) {
    throw new Error(`site adapter path escapes sitesDir: ${siteName}`);
  }

  return adapterPath;
}

function hashAdapterSource(source) {
  return createHash('sha256').update(String(source || ''), 'utf8').digest('hex');
}

function ensureTrustedAdapterExecution(adapter, options = {}) {
  if (options.allowUntrustedAdapters === true || ALLOW_UNTRUSTED_BB_SITES) {
    return;
  }

  throw new Error(
    `Refusing to execute local bb-sites adapter without explicit opt-in: ${adapter.adapterPath}. `
      + 'Set PAPERMATE_ALLOW_UNTRUSTED_BB_SITES=1 or pass allowUntrustedAdapters: true.'
  );
}

function loadSiteAdapter(siteName, options = {}) {
  const adapterPath = resolveSiteAdapterPath(siteName, options);
  if (!fs.existsSync(adapterPath)) {
    throw new Error(`Site adapter not found: ${adapterPath}`);
  }

  const resolvedSitesDir = path.resolve(options.sitesDir || process.env.BB_SITES_DIR || DEFAULT_BB_SITES_DIR);
  const realAdapterPath = fs.realpathSync(adapterPath);
  if (!isSubPath(resolvedSitesDir, realAdapterPath)) {
    throw new Error(`Resolved site adapter escapes trusted sitesDir: ${realAdapterPath}`);
  }

  const source = fs.readFileSync(adapterPath, 'utf8');
  const meta = parseSiteMeta(source) || {};
  const body = source.replace(/\/\*\s*@meta[\s\S]*?\*\//, '').trim();

  return {
    adapterPath,
    realAdapterPath,
    source,
    sourceHash: hashAdapterSource(source),
    meta,
    body,
  };
}

function matchDomain(targetUrl, domain) {
  if (!targetUrl || !domain) {
    return false;
  }

  try {
    const url = new URL(targetUrl);
    return url.hostname === domain || url.hostname.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

async function cdpCommand(wsUrl, method, params = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    let settled = false;
    let timer = null;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { socket.close(); } catch {}
      fn(value);
    };

    timer = setTimeout(() => {
      finish(reject, new Error(`CDP command timed out: ${method}`));
    }, 15000);

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({
        id: 1,
        method,
        params,
      }));
    }, { once: true });

    socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data.toString());
        if (payload.id !== 1) {
          return;
        }
        if (payload.error) {
          finish(reject, new Error(payload.error.message || `CDP error for ${method}`));
          return;
        }
        finish(resolve, payload.result);
      } catch (error) {
        finish(reject, error);
      }
    });

    socket.addEventListener('error', (error) => {
      finish(reject, error.error || new Error(`WebSocket error for ${method}`));
    }, { once: true });
  });
}

async function createTarget(browserUrl, url) {
  const browserWsUrl = await getBrowserWebSocketUrl(browserUrl);
  const result = await cdpCommand(browserWsUrl, 'Target.createTarget', { url });
  return result.targetId;
}

async function ensurePageTarget(browserUrl, domain) {
  const targets = await listPageTargets(browserUrl);
  const existing = targets.find((target) => matchDomain(target.url, domain));
  if (existing) {
    return existing;
  }

  const url = `https://${domain}/`;
  const targetId = await createTarget(browserUrl, url);
  const deadline = Date.now() + 10000;

  while (Date.now() < deadline) {
    const nextTargets = await listPageTargets(browserUrl);
    const created = nextTargets.find((target) => target.id === targetId) || nextTargets.find((target) => matchDomain(target.url, domain));
    if (created) {
      return created;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for a page target for ${domain}`);
}

async function evaluateOnPage(pageWsUrl, expression) {
  const result = await cdpCommand(pageWsUrl, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  return result.result ? result.result.value : null;
}

async function runChromeSiteAdapter({ siteName, args = {}, browserUrl = DEFAULT_BROWSER_URL, sitesDir, runner, allowUntrustedAdapters } = {}) {
  if (typeof runner === 'function') {
    return runner({ siteName, args, browserUrl, sitesDir });
  }

  const adapter = loadSiteAdapter(siteName, { sitesDir });
  ensureTrustedAdapterExecution(adapter, { allowUntrustedAdapters });
  const domain = adapter.meta?.domain;
  if (!domain) {
    throw new Error(`Adapter ${siteName} is missing a domain declaration`);
  }

  const target = await ensurePageTarget(browserUrl, domain);
  if (!target.webSocketDebuggerUrl) {
    throw new Error(`No page websocket endpoint found for ${siteName}`);
  }

  const expression = `(() => {
    const __fn = ${adapter.body};
    return Promise.resolve(__fn(${JSON.stringify(args)})).then((value) => JSON.stringify(value));
  })()`;

  const payload = await evaluateOnPage(target.webSocketDebuggerUrl, expression);
  const parsedPayload = typeof payload === 'string' ? JSON.parse(payload) : payload;

  if (parsedPayload && typeof parsedPayload === 'object' && Object.prototype.hasOwnProperty.call(parsedPayload, 'error')) {
    throw new Error(parsedPayload.hint ? `${parsedPayload.error} (${parsedPayload.hint})` : String(parsedPayload.error));
  }

  return parsedPayload;
}

async function searchArxivWithChromeDevtools(options = {}) {
  const query = options.query;
  const count = options.count || 10;

  try {
    const payload = await runChromeSiteAdapter({
      siteName: 'arxiv/search',
      args: {
        query,
        count,
      },
      browserUrl: options.browserUrl,
      sitesDir: options.sitesDir,
      runner: options.runner,
      allowUntrustedAdapters: options.allowUntrustedAdapters,
    });

    if (payload && Array.isArray(payload.papers) && payload.papers.length > 0) {
      return payload;
    }
  } catch (error) {
    if (options.allowGoogleFallback === false) {
      throw error;
    }
  }

  const googlePayload = await searchGoogleWithChromeDevtools({
    query: `site:arxiv.org ${query}`,
    count,
    browserUrl: options.browserUrl,
    sitesDir: options.sitesDir,
    runner: options.runner,
    allowUntrustedAdapters: options.allowUntrustedAdapters,
  });

  const papers = (googlePayload.results || []).map((item) => {
    const url = item.url || '';
    const match = url.match(/arxiv\.org\/(?:abs|pdf)\/([^/?#]+)/i);
    return {
      id: match ? match[1].replace(/\.pdf$/i, '') : url,
      title: item.title || '[untitled arXiv result]',
      abstract: item.snippet || null,
      authors: [],
      published: null,
      categories: [],
      url,
      pdf: url.includes('/pdf/') ? url : null,
    };
  });

  return {
    query,
    totalResults: papers.length,
    count: papers.length,
    papers,
    fallback: 'google-site-search',
  };
}

async function searchGoogleWithChromeDevtools(options = {}) {
  return runChromeSiteAdapter({
    siteName: 'google/search',
    args: {
      query: options.query,
      count: options.count || 10,
    },
    browserUrl: options.browserUrl,
    sitesDir: options.sitesDir,
    runner: options.runner,
    allowUntrustedAdapters: options.allowUntrustedAdapters,
  });
}

async function searchStackOverflowWithChromeDevtools(options = {}) {
  return runChromeSiteAdapter({
    siteName: 'stackoverflow/search',
    args: {
      query: options.query,
      count: options.count || 10,
    },
    browserUrl: options.browserUrl,
    sitesDir: options.sitesDir,
    runner: options.runner,
    allowUntrustedAdapters: options.allowUntrustedAdapters,
  });
}

async function getWikipediaSummaryWithChromeDevtools(options = {}) {
  return runChromeSiteAdapter({
    siteName: 'wikipedia/summary',
    args: {
      title: options.title,
    },
    browserUrl: options.browserUrl,
    sitesDir: options.sitesDir,
    runner: options.runner,
    allowUntrustedAdapters: options.allowUntrustedAdapters,
  });
}

async function searchWebWithChromeDevtools(options = {}) {
  const siteName = options.siteName || 'google/search';

  if (siteName === 'arxiv/search') {
    return searchArxivWithChromeDevtools(options);
  }

  if (siteName === 'stackoverflow/search') {
    return searchStackOverflowWithChromeDevtools(options);
  }

  if (siteName === 'wikipedia/summary') {
    return getWikipediaSummaryWithChromeDevtools(options);
  }

  return searchGoogleWithChromeDevtools(options);
}

module.exports = {
  DEFAULT_BROWSER_URL,
  DEFAULT_BB_SITES_DIR,
  getDefaultBrowserUrl,
  getDefaultBbSitesDir,
  normalizeBrowserUrl,
  getBrowserWebSocketUrl,
  listPageTargets,
  resolveSiteAdapterPath,
  loadSiteAdapter,
  runChromeSiteAdapter,
  searchArxivWithChromeDevtools,
  searchGoogleWithChromeDevtools,
  searchStackOverflowWithChromeDevtools,
  getWikipediaSummaryWithChromeDevtools,
  searchWebWithChromeDevtools,
};
