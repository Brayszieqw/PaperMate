const { getDefaultBrowserUrl, listPageTargets } = require('./chrome-devtools-adapter');

async function main() {
  const browserUrl = process.env.CHROME_DEVTOOLS_BROWSER_URL || getDefaultBrowserUrl();
  const report = {
    browserUrl,
    reachable: false,
    targets: [],
    error: null,
  };

  try {
    const version = await fetch(`${browserUrl.replace(/\/+$/, '')}/json/version`);
    report.reachable = version.ok;
    if (!version.ok) {
      report.error = `status ${version.status}`;
    } else {
      const targets = await listPageTargets(browserUrl);
      report.targets = targets.map((target) => ({
        title: target.title,
        url: target.url,
        type: target.type,
      }));
    }
  } catch (error) {
    report.error = error.message;
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.reachable ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
