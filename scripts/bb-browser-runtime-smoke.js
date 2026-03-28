const fs = require('fs');
const path = require('path');
const { searchArxivWithBbBrowser } = require('./bb-browser-adapter');

async function main() {
  const repoRoot = path.join(__dirname, '..');
  const cliPath = path.join(repoRoot, 'third_party', 'bb-browser', 'dist', 'cli.js');
  const extensionDist = path.join(repoRoot, 'third_party', 'bb-browser', 'packages', 'extension', 'dist');
  const adapterRepo = path.join(process.env.USERPROFILE || '', '.bb-browser', 'bb-sites');
  const cdpPortFile = path.join(process.env.USERPROFILE || '', '.bb-browser', 'browser', 'cdp-port');

  const report = {
    cliExists: fs.existsSync(cliPath),
    extensionDistExists: fs.existsSync(extensionDist),
    adapterRepoExists: fs.existsSync(adapterRepo),
    cdpPortFileExists: fs.existsSync(cdpPortFile),
    daemonStatus: null,
    browserSearch: null,
  };

  for (const url of ['http://localhost:19824/status', 'http://127.0.0.1:19824/status']) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        report.daemonStatus = await response.json();
        report.daemonStatus.url = url;
        break;
      }
    } catch (error) {
      report.daemonStatus = { running: false, error: error.message, url };
    }
  }

  try {
    const payload = await searchArxivWithBbBrowser({
      query: 'transformer',
      count: 3,
      cliPath,
    });
    report.browserSearch = {
      ok: true,
      count: payload.count || 0,
      sampleTitle: Array.isArray(payload.papers) && payload.papers[0] ? payload.papers[0].title : null,
    };
  } catch (error) {
    report.browserSearch = {
      ok: false,
      error: error.message,
    };
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.browserSearch && report.browserSearch.ok ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
