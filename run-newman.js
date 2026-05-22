// Child process script to run Newman
// Receives options via stdin, sends logs via stdout as JSON lines
const newman = require('newman');

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  const { newmanOptions, customHeaders, customQueryParams } = JSON.parse(input);

  const run = newman.run(newmanOptions);

  run.on('start', () => {
    sendLog('info', 'Newman run started...');
  });

  if (customHeaders && customHeaders.length > 0 || customQueryParams && customQueryParams.length > 0) {
    run.on('beforeRequest', (err, args) => {
      if (args && args.request) {
        if (customHeaders) customHeaders.forEach(h => { args.request.headers.add({ key: h.key, value: h.value || '' }); });
        if (customQueryParams) customQueryParams.forEach(q => { args.request.url.query.add({ key: q.key, value: q.value || '' }); });
      }
    });
  }

  run.on('beforeItem', (err, args) => {
    if (args && args.item) sendLog('request', '→ ' + args.item.name);
  });

  run.on('request', (err, args) => {
    if (err) sendLog('error', 'Request error: ' + err.message);
    else if (args && args.response) sendLog('response', '← ' + args.response.code + ' (' + args.response.responseTime + 'ms)');
  });

  run.on('assertion', (err, args) => {
    if (err) sendLog('fail', '✗ ' + args.assertion + ' — ' + err.message);
    else sendLog('pass', '✓ ' + args.assertion);
  });

  run.on('done', (err, summary) => {
    if (err) {
      sendResult({ status: 'error', error: err.message });
    } else {
      const stats = summary.run.stats;
      sendResult({
        status: stats.assertions.failed > 0 ? 'failed' : 'passed',
        totalRequests: stats.requests.total,
        failedRequests: stats.requests.failed,
        totalAssertions: stats.assertions.total,
        failedAssertions: stats.assertions.failed,
        totalDuration: summary.run.timings.completed - summary.run.timings.started
      });
    }
  });
});

function sendLog(type, message) {
  process.stdout.write(JSON.stringify({ type: 'log', logType: type, message }) + '\n');
}

function sendResult(result) {
  process.stdout.write(JSON.stringify({ type: 'result', ...result }) + '\n');
  setTimeout(() => process.exit(0), 500);
}
