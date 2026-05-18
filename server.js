const express = require('express');
const multer = require('multer');
const newman = require('newman');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

const app = express();
const PORT = 4500;

// Use env vars (set by Electron main.js) or fall back to local dirs (standalone mode)
const collectionsDir = process.env.NEWMAN_COLLECTIONS_DIR || path.join(__dirname, 'collections');
const environmentsDir = process.env.NEWMAN_ENVIRONMENTS_DIR || path.join(__dirname, 'environments');
const reportsDir = process.env.NEWMAN_REPORTS_DIR || path.join(__dirname, 'reports');
const publicDir = process.env.NEWMAN_PUBLIC_DIR || path.join(__dirname, 'public');

[collectionsDir, environmentsDir, reportsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Multer config for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'collection') cb(null, collectionsDir);
    else if (file.fieldname === 'environment') cb(null, environmentsDir);
    else cb(null, __dirname);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});
const upload = multer({ storage });

// Serve static files
app.use(express.static(publicDir));
app.use('/reports', express.static(reportsDir));
app.use(express.json());

// Store run history and logs in memory
const runHistory = [];
const runLogs = {}; // runId -> array of log lines
const scheduledJobs = []; // { id, collection, folders[], targetEnv, sprintNumber, environment, scheduleType, scheduleTime, nextRun, status, lastRun, lastStatus }
let schedulerInterval = null;

// ===== SCHEDULER ENGINE =====
function startScheduler() {
  if (schedulerInterval) return;
  schedulerInterval = setInterval(() => {
    const now = new Date();
    scheduledJobs.forEach(job => {
      if (job.status !== 'active') return;
      const nextRun = new Date(job.nextRun);
      if (now >= nextRun) {
        // Time to run this job
        runScheduledJob(job);
        // Calculate next run
        if (job.scheduleType === 'once') {
          job.status = 'completed';
        } else if (job.scheduleType === 'daily') {
          const next = new Date(nextRun);
          next.setDate(next.getDate() + 1);
          job.nextRun = next.toISOString();
        } else if (job.scheduleType === 'hourly') {
          const next = new Date(nextRun);
          next.setHours(next.getHours() + 1);
          job.nextRun = next.toISOString();
        } else if (job.scheduleType === 'every30min') {
          const next = new Date(nextRun);
          next.setMinutes(next.getMinutes() + 30);
          job.nextRun = next.toISOString();
        }
      }
    });
  }, 10000); // Check every 10 seconds
}

function runScheduledJob(job) {
  job.lastStatus = 'running';
  const folders = job.folders && job.folders.length > 0 ? job.folders : [''];
  folders.forEach((folder, idx) => {
    const body = {
      collection: job.collection,
      environment: job.environment || '',
      folder: folder,
      targetEnv: job.targetEnv || '',
      sprintNumber: job.sprintNumber || '',
      reportTitle: folder ? `${job.name}-${folder}` : job.name,
      iterationCount: 1,
      delayRequest: 0,
      customVars: []
    };
    // Simulate internal run
    setTimeout(() => triggerRun(body, job), idx * 2000); // stagger by 2s
  });
  job.lastRun = new Date().toISOString();
}

function triggerRun(body, job) {
  const { collection, environment, iterationCount, delayRequest, folder, reportTitle, customVars, targetEnv, sprintNumber } = body;
  const collectionPath = path.join(collectionsDir, collection);
  if (!fs.existsSync(collectionPath)) return;

  let runCollectionPath = collectionPath;
  if (targetEnv || sprintNumber) {
    try {
      const colData = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
      if (colData.event && Array.isArray(colData.event)) {
        colData.event.forEach(evt => {
          if (evt.listen === 'prerequest' && evt.script && evt.script.exec) {
            evt.script.exec = evt.script.exec.map(line => {
              if (targetEnv && line.match(/^\s*var\s+environment\s*=/)) return `var environment = "${targetEnv}"`;
              if (sprintNumber && line.match(/^\s*var\s+sprintNumber\s*=/)) return `var sprintNumber = "${sprintNumber}";`;
              return line;
            });
          }
        });
      }
      const tempName = `_temp_run_${Date.now()}_${collection}`;
      runCollectionPath = path.join(collectionsDir, tempName);
      fs.writeFileSync(runCollectionPath, JSON.stringify(colData, null, 2), 'utf8');
    } catch (e) { return; }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeName = reportTitle ? reportTitle.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '-') : null;
  const reportName = safeName ? `${safeName}.html` : `report-${timestamp}.html`;
  const jsonReportName = safeName ? `${safeName}.json` : `report-${timestamp}.json`;
  const reportPath = path.join(reportsDir, reportName);
  const jsonReportPath = path.join(reportsDir, jsonReportName);

  const newmanOptions = {
    collection: runCollectionPath,
    reporters: ['htmlextra', 'json', 'cli'],
    reporter: { htmlextra: { export: reportPath, title: (runEntry.automated ? '\u{1F916} [AUTO] ' : '') + (reportTitle || `Run - ${collection}`), browserTitle: reportTitle || 'Newman Report', showOnlyFails: false }, json: { export: jsonReportPath } }
  };
  if (folder) newmanOptions.folder = folder;
  if (environment) { const envPath = path.join(environmentsDir, environment); if (fs.existsSync(envPath)) newmanOptions.environment = envPath; }

  const runId = Date.now().toString() + Math.random().toString(36).slice(2, 6);
  const runEntry = { id: runId, collection, folder: folder || 'All', environment: environment || 'None', startTime: new Date().toISOString(), status: 'running', reportName: null, summary: null, automated: true };
  runHistory.unshift(runEntry);
  runLogs[runId] = [];
  const addLog = (type, msg) => { runLogs[runId].push({ time: new Date().toISOString(), type, message: msg }); };
  addLog('info', `[SCHEDULED] Starting: ${collection}${folder ? ' / ' + folder : ''}`);

  const run = newman.run(newmanOptions);
  run.on('beforeItem', (err, args) => { if (args && args.item) addLog('request', `→ ${args.item.name}`); });
  run.on('request', (err, args) => { if (err) addLog('error', `Request error: ${err.message}`); else if (args && args.response) addLog('response', `← ${args.response.code} (${args.response.responseTime}ms)`); });
  run.on('assertion', (err, args) => { if (err) addLog('fail', `✗ ${args.assertion} — ${err.message}`); else addLog('pass', `✓ ${args.assertion}`); });
  run.on('done', (err, summary) => {
    const entry = runHistory.find(r => r.id === runId);
    if (err) { entry.status = 'error'; entry.summary = { error: err.message }; addLog('error', `Run failed: ${err.message}`); if (job) job.lastStatus = 'failed'; }
    else { const stats = summary.run.stats; entry.status = stats.assertions.failed > 0 ? 'failed' : 'passed'; entry.reportName = reportName; entry.endTime = new Date().toISOString(); entry.summary = { totalRequests: stats.requests.total, failedRequests: stats.requests.failed, totalAssertions: stats.assertions.total, failedAssertions: stats.assertions.failed, totalDuration: summary.run.timings.completed - summary.run.timings.started }; addLog('info', `Completed — ${stats.assertions.total} assertions, ${stats.assertions.failed} failed`); if (job) job.lastStatus = entry.status; }
    if (runCollectionPath !== collectionPath && fs.existsSync(runCollectionPath)) { try { fs.unlinkSync(runCollectionPath); } catch(e) {} }
  });
}

startScheduler();

// API: Get uploaded collections
app.get('/api/collections', (req, res) => {
  const files = fs.readdirSync(collectionsDir).filter(f => f.endsWith('.json') && !f.endsWith('.postman_test_run.json') && !f.startsWith('_temp_run_'));
  res.json(files);
});

// API: Get uploaded environments
app.get('/api/environments', (req, res) => {
  const files = fs.readdirSync(environmentsDir).filter(f => f.endsWith('.json'));
  res.json(files);
});

// API: Upload collection
app.post('/api/upload/collection', upload.single('collection'), (req, res) => {
  res.json({ success: true, filename: req.file.originalname });
});

// API: Upload environment
app.post('/api/upload/environment', upload.single('environment'), (req, res) => {
  res.json({ success: true, filename: req.file.originalname });
});

// Helper: recursively build tree structure from collection items
function buildTree(items, parentPath = '') {
  if (!items || !Array.isArray(items)) return [];
  return items.map(item => {
    const currentPath = parentPath ? `${parentPath}/${item.name}` : item.name;
    const node = { name: item.name, path: currentPath };
    if (item.item && Array.isArray(item.item)) {
      node.type = 'folder';
      node.children = buildTree(item.item, currentPath);
    } else {
      node.type = 'request';
      node.method = item.request ? (item.request.method || 'GET') : 'GET';
    }
    return node;
  });
}

// API: Get full tree structure of a collection
app.get('/api/collection-tree/:collection', (req, res) => {
  const collectionPath = path.join(collectionsDir, req.params.collection);
  if (!fs.existsSync(collectionPath)) {
    return res.status(404).json({ error: 'Collection not found' });
  }
  try {
    const data = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
    const items = data.item || [];
    const tree = buildTree(items);
    res.json({ name: data.info ? data.info.name : req.params.collection, tree });
  } catch (e) {
    res.status(500).json({ error: 'Failed to parse collection: ' + e.message });
  }
});

// API: Get folders from a collection (flat list)
app.get('/api/folders/:collection', (req, res) => {
  const collectionPath = path.join(collectionsDir, req.params.collection);
  if (!fs.existsSync(collectionPath)) {
    return res.status(404).json({ error: 'Collection not found' });
  }
  try {
    const data = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
    const items = data.item || [];
    const folders = [];
    function extractFolders(items, prefix = '') {
      items.forEach(item => {
        if (item.item) {
          const p = prefix ? `${prefix}/${item.name}` : item.name;
          folders.push(p);
          extractFolders(item.item, p);
        }
      });
    }
    extractFolders(items);
    res.json(folders);
  } catch (e) {
    res.status(500).json({ error: 'Failed to parse collection' });
  }
});

// API: Run collection
app.post('/api/run', (req, res) => {
  const { collection, environment, iterationCount, delayRequest, folder, reportTitle, customVars, targetEnv, sprintNumber } = req.body;

  if (!collection) {
    return res.status(400).json({ error: 'Collection is required' });
  }

  const collectionPath = path.join(collectionsDir, collection);
  if (!fs.existsSync(collectionPath)) {
    return res.status(404).json({ error: 'Collection file not found' });
  }

  // If targetEnv or sprintNumber provided, modify collection pre-request script
  let runCollectionPath = collectionPath;
  if (targetEnv || sprintNumber) {
    try {
      const colData = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
      if (colData.event && Array.isArray(colData.event)) {
        colData.event.forEach(evt => {
          if (evt.listen === 'prerequest' && evt.script && evt.script.exec) {
            evt.script.exec = evt.script.exec.map(line => {
              // Replace environment variable
              if (targetEnv && line.match(/^\s*var\s+environment\s*=/)) {
                return `var environment = "${targetEnv}" // Options: Dev / Preprod / GBS / Sprint / sdp-east-Preprod`;
              }
              // Replace sprintNumber variable
              if (sprintNumber && line.match(/^\s*var\s+sprintNumber\s*=/)) {
                return `var sprintNumber = "${sprintNumber}"; // Used only if environment === "Sprint"`;
              }
              return line;
            });
          }
        });
      }
      // Write to a temp file
      const tempName = `_temp_run_${Date.now()}_${collection}`;
      runCollectionPath = path.join(collectionsDir, tempName);
      fs.writeFileSync(runCollectionPath, JSON.stringify(colData, null, 2), 'utf8');
    } catch (e) {
      return res.status(500).json({ error: 'Failed to modify collection: ' + e.message });
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeName = reportTitle ? reportTitle.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '-') : null;
  const reportName = safeName ? `${safeName}.html` : `report-${timestamp}.html`;
  const jsonReportName = safeName ? `${safeName}.json` : `report-${timestamp}.json`;
  const reportPath = path.join(reportsDir, reportName);
  const jsonReportPath = path.join(reportsDir, jsonReportName);

  const newmanOptions = {
    collection: runCollectionPath,
    reporters: ['htmlextra', 'json', 'cli'],
    reporter: {
      htmlextra: {
        export: reportPath,
        title: reportTitle || `Newman Run - ${collection}`,
        browserTitle: reportTitle || 'Newman Report',
        showOnlyFails: false
      },
      json: {
        export: jsonReportPath
      }
    }
  };

  if (folder) {
    newmanOptions.folder = folder;
  }

  if (environment) {
    const envPath = path.join(environmentsDir, environment);
    if (fs.existsSync(envPath)) {
      newmanOptions.environment = envPath;
    }
  }

  // Inject custom variables as environment overrides
  if (customVars && Array.isArray(customVars) && customVars.length > 0) {
    const envVars = customVars
      .filter(v => v.key && v.key.trim())
      .map(v => ({ key: v.key.trim(), value: v.value || '' }));
    if (envVars.length > 0) {
      newmanOptions.envVar = envVars;
    }
  }

  if (iterationCount && iterationCount > 1) {
    newmanOptions.iterationCount = parseInt(iterationCount);
  }

  if (delayRequest && delayRequest > 0) {
    newmanOptions.delayRequest = parseInt(delayRequest);
  }

  const runId = Date.now().toString();
  const runEntry = {
    id: runId,
    collection,
    folder: folder || 'All',
    environment: environment || 'None',
    startTime: new Date().toISOString(),
    status: 'running',
    reportName: null,
    summary: null
  };
  runHistory.unshift(runEntry);
  runLogs[runId] = [];

  const addLog = (type, msg) => {
    runLogs[runId].push({ time: new Date().toISOString(), type, message: msg });
  };

  addLog('info', `Starting run: ${collection}${folder ? ' / Folder: ' + folder : ''}`);
  addLog('info', `Environment: ${environment || 'None'}`);

  // Run newman with event listeners for logging
  const run = newman.run(newmanOptions);

  run.on('start', () => {
    addLog('info', 'Newman run started...');
  });

  run.on('beforeItem', (err, args) => {
    if (args && args.item) {
      addLog('request', `→ ${args.item.name}`);
    }
  });

  run.on('request', (err, args) => {
    if (err) {
      addLog('error', `Request error: ${err.message}`);
    } else if (args && args.response) {
      const status = args.response.code;
      const time = args.response.responseTime;
      addLog('response', `← ${status} (${time}ms)`);
    }
  });

  run.on('assertion', (err, args) => {
    if (err) {
      addLog('fail', `✗ ${args.assertion} — ${err.message}`);
    } else {
      addLog('pass', `✓ ${args.assertion}`);
    }
  });

  run.on('done', (err, summary) => {
    const entry = runHistory.find(r => r.id === runId);
    if (err) {
      entry.status = 'error';
      entry.summary = { error: err.message };
      addLog('error', `Run failed: ${err.message}`);
    } else {
      const stats = summary.run.stats;
      entry.status = stats.assertions.failed > 0 ? 'failed' : 'passed';
      entry.reportName = reportName;
      entry.endTime = new Date().toISOString();
      entry.summary = {
        totalRequests: stats.requests.total,
        failedRequests: stats.requests.failed,
        totalAssertions: stats.assertions.total,
        failedAssertions: stats.assertions.failed,
        totalDuration: summary.run.timings.completed - summary.run.timings.started
      };
      addLog('info', `Run completed — ${stats.assertions.total} assertions, ${stats.assertions.failed} failed, ${(entry.summary.totalDuration / 1000).toFixed(1)}s`);
    }
    // Clean up temp collection file
    if (runCollectionPath !== collectionPath && fs.existsSync(runCollectionPath)) {
      try { fs.unlinkSync(runCollectionPath); } catch(e) {}
    }
  });

  res.json({ message: 'Run started', runId });
});

// API: Get logs for a run
app.get('/api/logs/:runId', (req, res) => {
  const logs = runLogs[req.params.runId] || [];
  res.json(logs);
});

// API: Get all run IDs with logs
app.get('/api/logs', (req, res) => {
  const entries = runHistory.map(r => ({ id: r.id, collection: r.collection, folder: r.folder, status: r.status, startTime: r.startTime }));
  res.json(entries);
});

// API: Get run history
app.get('/api/history', (req, res) => {
  res.json(runHistory);
});

// API: Download reports as zip (must be before /api/reports to avoid route conflict)
app.get('/api/reports/download-zip', (req, res) => {
  const files = fs.readdirSync(reportsDir).filter(f => f.endsWith('.html') || f.endsWith('.json'));
  if (files.length === 0) {
    return res.status(404).json({ error: 'No reports to download' });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const zipName = `newman-reports-${timestamp}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => { res.status(500).end(); });
  archive.pipe(res);

  files.forEach(file => {
    archive.file(path.join(reportsDir, file), { name: file });
  });

  archive.finalize();
});

// API: Download a single report as zip
app.get('/api/reports/download-zip/:filename', (req, res) => {
  const filePath = path.join(reportsDir, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Report not found' });
  }

  const baseName = req.params.filename.replace('.html', '');
  const zipName = `${baseName}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => { res.status(500).end(); });
  archive.pipe(res);
  archive.file(filePath, { name: req.params.filename });
  archive.finalize();
});

// ===== SCHEDULER API =====
app.get('/api/schedules', (req, res) => {
  res.json(scheduledJobs);
});

app.post('/api/schedules', (req, res) => {
  const { name, collection, folders, targetEnv, sprintNumber, environment, scheduleType, scheduleTime } = req.body;
  if (!collection || !scheduleType || !scheduleTime) {
    return res.status(400).json({ error: 'collection, scheduleType, and scheduleTime are required' });
  }
  const job = {
    id: Date.now().toString(),
    name: name || `Job-${Date.now()}`,
    collection,
    folders: folders || [],
    targetEnv: targetEnv || '',
    sprintNumber: sprintNumber || '',
    environment: environment || '',
    scheduleType, // once, daily, hourly, every30min
    scheduleTime, // ISO string for first run
    nextRun: scheduleTime,
    status: 'active',
    lastRun: null,
    lastStatus: null,
    createdAt: new Date().toISOString()
  };
  scheduledJobs.push(job);
  res.json({ success: true, job });
});

app.delete('/api/schedules/:id', (req, res) => {
  const idx = scheduledJobs.findIndex(j => j.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Job not found' });
  scheduledJobs.splice(idx, 1);
  res.json({ success: true });
});

app.patch('/api/schedules/:id', (req, res) => {
  const job = scheduledJobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (req.body.status) job.status = req.body.status;
  res.json({ success: true, job });
});

// API: Get reports list
app.get('/api/reports', (req, res) => {
  const files = fs.readdirSync(reportsDir)
    .filter(f => f.endsWith('.html') || f.endsWith('.json'))
    .sort()
    .reverse();
  res.json(files);
});

const server = app.listen(PORT, () => {
  console.log(`\n  Newman Runner UI is running at: http://localhost:${PORT}\n`);
  process.env.NEWMAN_ACTUAL_PORT = PORT.toString();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const altPort = PORT + 1;
    console.log(`Port ${PORT} is busy, trying ${altPort}...`);
    app.listen(altPort, () => {
      console.log(`\n  Newman Runner UI is running at: http://localhost:${altPort}\n`);
      process.env.NEWMAN_ACTUAL_PORT = altPort.toString();
    });
  }
});
