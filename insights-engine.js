// AI/ML Insights Engine for Newman Runner
// Analyzes JSON reports to detect flaky tests, anomalies, failure patterns, and health scores

const fs = require('fs');
const path = require('path');

class InsightsEngine {
  constructor(reportsDir) {
    this.reportsDir = reportsDir;
    this.dataFile = path.join(reportsDir, '..', 'insights-data.json');
  }

  // Load persisted insights data
  loadPersistedData() {
    try {
      if (fs.existsSync(this.dataFile)) {
        return JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
      }
    } catch (e) {}
    return { assertionHistory: {}, responseTimeHistory: {}, runResults: [] };
  }

  // Save insights data for persistence across restarts
  savePersistedData(data) {
    try {
      fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {}
  }

  // Parse all JSON reports in the reports directory
  parseReports() {
    const reports = [];
    try {
      const files = fs.readdirSync(this.reportsDir)
        .filter(f => f.endsWith('.json') && !f.startsWith('.'));

      for (const file of files) {
        try {
          const filePath = path.join(this.reportsDir, file);
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

          // Newman JSON report structure
          if (data.run && data.run.executions) {
            reports.push({
              filename: file,
              timestamp: data.run.timings ? new Date(data.run.timings.started).toISOString() : null,
              executions: data.run.executions,
              stats: data.run.stats,
              timings: data.run.timings,
              failures: data.run.failures || []
            });
          }
        } catch (e) {
          // Skip unparseable files
        }
      }
    } catch (e) {}

    return reports.sort((a, b) => {
      if (!a.timestamp || !b.timestamp) return 0;
      return new Date(a.timestamp) - new Date(b.timestamp);
    });
  }

  // Extract structured data from reports
  extractData(reports) {
    const assertionResults = {}; // "requestName::assertionText" -> [{passed, timestamp, responseTime}]
    const responseTimesByEndpoint = {}; // "METHOD requestName" -> [{time, timestamp, statusCode}]
    const runSummaries = []; // [{timestamp, totalAssertions, failedAssertions, passRate}]
    const failureDetails = []; // [{request, assertion, error, statusCode, timestamp}]
    const requestStats = {}; // "requestName" -> {totalRuns, failures, avgTime, times[], statuses[]}

    for (const report of reports) {
      let totalAssertions = 0;
      let failedAssertions = 0;

      for (const execution of report.executions) {
        const requestName = execution.item ? execution.item.name : 'Unknown';
        const method = execution.request ? execution.request.method : 'GET';
        const endpointKey = `${method} ${requestName}`;
        const responseTime = execution.response ? (execution.response.responseTime || 0) : 0;
        const statusCode = execution.response ? execution.response.code : 0;

        // Track per-request stats
        if (!requestStats[endpointKey]) {
          requestStats[endpointKey] = { name: requestName, method, totalRuns: 0, failures: 0, times: [], statuses: [], timestamps: [] };
        }
        requestStats[endpointKey].totalRuns++;
        requestStats[endpointKey].times.push(responseTime);
        requestStats[endpointKey].statuses.push(statusCode);
        requestStats[endpointKey].timestamps.push(report.timestamp);

        // Response time
        if (execution.response) {
          if (!responseTimesByEndpoint[endpointKey]) {
            responseTimesByEndpoint[endpointKey] = [];
          }
          responseTimesByEndpoint[endpointKey].push({
            time: responseTime,
            timestamp: report.timestamp,
            statusCode
          });
        }

        // Assertions
        if (execution.assertions && execution.assertions.length > 0) {
          for (const assertion of execution.assertions) {
            totalAssertions++;
            const key = `${requestName}::${assertion.assertion}`;
            const passed = !assertion.error;

            if (!assertionResults[key]) {
              assertionResults[key] = [];
            }
            assertionResults[key].push({
              passed,
              timestamp: report.timestamp,
              responseTime
            });

            if (!passed) {
              failedAssertions++;
              requestStats[endpointKey].failures++;
              failureDetails.push({
                request: requestName,
                method,
                assertion: assertion.assertion,
                error: assertion.error ? assertion.error.message : 'Unknown error',
                statusCode,
                responseTime,
                timestamp: report.timestamp,
                reportFile: report.filename
              });
            }
          }
        }
      }

      if (totalAssertions > 0) {
        runSummaries.push({
          timestamp: report.timestamp,
          filename: report.filename,
          totalAssertions,
          failedAssertions,
          passRate: ((totalAssertions - failedAssertions) / totalAssertions) * 100
        });
      }
    }

    return { assertionResults, responseTimesByEndpoint, runSummaries, failureDetails, requestStats };
  }

  // Detect flaky tests - tests that flip between pass and fail
  detectFlaky(assertionResults) {
    const flakyTests = [];

    for (const [key, results] of Object.entries(assertionResults)) {
      if (results.length < 3) continue;

      let flips = 0;
      for (let i = 1; i < results.length; i++) {
        if (results[i].passed !== results[i - 1].passed) {
          flips++;
        }
      }

      const flipRate = flips / (results.length - 1);
      const passRate = results.filter(r => r.passed).length / results.length;

      if (flipRate >= 0.2 && passRate > 0.1 && passRate < 0.9) {
        const [requestName, assertion] = key.split('::');
        flakyTests.push({
          request: requestName,
          assertion,
          flipRate: Math.round(flipRate * 100),
          passRate: Math.round(passRate * 100),
          totalRuns: results.length,
          flips,
          lastResult: results[results.length - 1].passed ? 'passed' : 'failed',
          severity: flipRate >= 0.5 ? 'high' : flipRate >= 0.3 ? 'medium' : 'low'
        });
      }
    }

    return flakyTests.sort((a, b) => b.flipRate - a.flipRate);
  }

  // Detect response time anomalies using z-score
  detectAnomalies(responseTimesByEndpoint) {
    const anomalies = [];

    for (const [endpoint, measurements] of Object.entries(responseTimesByEndpoint)) {
      if (measurements.length < 3) continue;

      const times = measurements.map(m => m.time).filter(t => t > 0);
      if (times.length < 3) continue;

      const mean = times.reduce((a, b) => a + b, 0) / times.length;
      const stddev = Math.sqrt(times.map(t => (t - mean) ** 2).reduce((a, b) => a + b, 0) / times.length);

      if (stddev === 0 || mean === 0) continue;

      // Check the most recent measurements
      const recentCount = Math.min(3, measurements.length);
      const recentMeasurements = measurements.slice(-recentCount);

      for (const measurement of recentMeasurements) {
        if (measurement.time === 0) continue;
        const zScore = (measurement.time - mean) / stddev;

        if (zScore > 2) {
          const percentIncrease = Math.round(((measurement.time - mean) / mean) * 100);
          anomalies.push({
            endpoint,
            currentTime: measurement.time,
            baseline: Math.round(mean),
            stddev: Math.round(stddev),
            zScore: Math.round(zScore * 10) / 10,
            percentIncrease,
            timestamp: measurement.timestamp,
            severity: zScore > 3 ? 'critical' : zScore > 2.5 ? 'high' : 'medium'
          });
        }
      }
    }

    // Deduplicate by endpoint (keep worst)
    const byEndpoint = {};
    for (const a of anomalies) {
      if (!byEndpoint[a.endpoint] || a.zScore > byEndpoint[a.endpoint].zScore) {
        byEndpoint[a.endpoint] = a;
      }
    }

    return Object.values(byEndpoint).sort((a, b) => b.zScore - a.zScore);
  }

  // NEW: Identify slowest endpoints
  getSlowestEndpoints(requestStats) {
    const endpoints = Object.entries(requestStats)
      .filter(([_, s]) => s.times.length > 0)
      .map(([key, s]) => {
        const times = s.times.filter(t => t > 0);
        if (times.length === 0) return null;
        const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
        const sorted = [...times].sort((a, b) => a - b);
        const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1] || 0;
        const max = sorted[sorted.length - 1] || 0;
        return { endpoint: key, name: s.name, method: s.method, avgTime: avg, p95, maxTime: max, runs: times.length };
      })
      .filter(Boolean)
      .sort((a, b) => b.avgTime - a.avgTime);

    return endpoints.slice(0, 10);
  }

  // NEW: Identify most failing requests
  getMostFailingRequests(requestStats) {
    const failing = Object.entries(requestStats)
      .filter(([_, s]) => s.failures > 0)
      .map(([key, s]) => {
        const failRate = Math.round((s.failures / Math.max(1, s.totalRuns)) * 100);
        return { endpoint: key, name: s.name, method: s.method, failures: s.failures, totalRuns: s.totalRuns, failRate };
      })
      .sort((a, b) => b.failRate - a.failRate);

    return failing.slice(0, 10);
  }

  // NEW: Detect performance degradation over time per endpoint
  detectDegradation(responseTimesByEndpoint) {
    const degrading = [];

    for (const [endpoint, measurements] of Object.entries(responseTimesByEndpoint)) {
      if (measurements.length < 4) continue;

      const times = measurements.filter(m => m.time > 0);
      if (times.length < 4) continue;

      // Split into first half and second half
      const mid = Math.floor(times.length / 2);
      const firstHalf = times.slice(0, mid).map(m => m.time);
      const secondHalf = times.slice(mid).map(m => m.time);

      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      if (firstAvg === 0) continue;

      const changePercent = Math.round(((secondAvg - firstAvg) / firstAvg) * 100);

      // Significant degradation: >30% slower in recent runs
      if (changePercent > 30 && secondAvg > 100) {
        degrading.push({
          endpoint,
          earlierAvg: Math.round(firstAvg),
          recentAvg: Math.round(secondAvg),
          changePercent,
          dataPoints: times.length,
          firstTimestamp: times[0].timestamp,
          lastTimestamp: times[times.length - 1].timestamp,
          severity: changePercent > 100 ? 'critical' : changePercent > 60 ? 'high' : 'medium'
        });
      }
    }

    return degrading.sort((a, b) => b.changePercent - a.changePercent).slice(0, 10);
  }

  // NEW: Detect error rate spikes per endpoint
  detectErrorSpikes(requestStats) {
    const spikes = [];

    for (const [key, stats] of Object.entries(requestStats)) {
      if (stats.totalRuns < 3) continue;

      // Check if recent runs have more errors than earlier
      const mid = Math.floor(stats.statuses.length / 2);
      const firstHalf = stats.statuses.slice(0, mid);
      const secondHalf = stats.statuses.slice(mid);

      const firstErrors = firstHalf.filter(s => s >= 400 || s === 0).length;
      const secondErrors = secondHalf.filter(s => s >= 400 || s === 0).length;

      const firstRate = firstHalf.length > 0 ? firstErrors / firstHalf.length : 0;
      const secondRate = secondHalf.length > 0 ? secondErrors / secondHalf.length : 0;

      // Error rate increased significantly
      if (secondRate > firstRate + 0.2 && secondErrors >= 2) {
        spikes.push({
          endpoint: key,
          name: stats.name,
          method: stats.method,
          earlierErrorRate: Math.round(firstRate * 100),
          recentErrorRate: Math.round(secondRate * 100),
          recentErrors: secondErrors,
          totalRuns: stats.totalRuns
        });
      }
    }

    return spikes.sort((a, b) => b.recentErrorRate - a.recentErrorRate).slice(0, 10);
  }

  // NEW: Correlation analysis - find requests that fail together
  detectCorrelatedFailures(failureDetails) {
    // Group failures by timestamp (same run)
    const failuresByRun = {};
    for (const f of failureDetails) {
      const runKey = f.timestamp || 'unknown';
      if (!failuresByRun[runKey]) failuresByRun[runKey] = [];
      failuresByRun[runKey].push(f.request);
    }

    // Find pairs that fail together
    const pairCounts = {};
    const requestFailCounts = {};

    for (const [_, requests] of Object.entries(failuresByRun)) {
      const unique = [...new Set(requests)];
      unique.forEach(r => { requestFailCounts[r] = (requestFailCounts[r] || 0) + 1; });

      for (let i = 0; i < unique.length; i++) {
        for (let j = i + 1; j < unique.length; j++) {
          const pair = [unique[i], unique[j]].sort().join(' <-> ');
          pairCounts[pair] = (pairCounts[pair] || 0) + 1;
        }
      }
    }

    const totalRuns = Object.keys(failuresByRun).length;
    const correlations = Object.entries(pairCounts)
      .filter(([_, count]) => count >= 2)
      .map(([pair, count]) => {
        const [req1, req2] = pair.split(' <-> ');
        const coOccurrence = count / Math.min(requestFailCounts[req1] || 1, requestFailCounts[req2] || 1);
        return { pair, request1: req1, request2: req2, coOccurrences: count, correlation: Math.round(coOccurrence * 100) };
      })
      .filter(c => c.correlation >= 50)
      .sort((a, b) => b.correlation - a.correlation);

    return correlations.slice(0, 8);
  }

  // NEW: Status code distribution analysis
  getStatusCodeDistribution(requestStats) {
    const distribution = {};
    for (const [_, stats] of Object.entries(requestStats)) {
      for (const code of stats.statuses) {
        if (code === 0) continue;
        distribution[code] = (distribution[code] || 0) + 1;
      }
    }

    const total = Object.values(distribution).reduce((a, b) => a + b, 0);
    return Object.entries(distribution)
      .map(([code, count]) => ({ code: parseInt(code), count, percentage: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count);
  }

  // Classify failures by root cause
  classifyFailures(failureDetails) {
    const categories = {
      auth: { label: 'Authentication/Authorization (401/403)', count: 0, examples: [] },
      serverError: { label: 'Server Errors (5xx)', count: 0, examples: [] },
      timeout: { label: 'Timeouts / Connection Errors', count: 0, examples: [] },
      notFound: { label: 'Not Found (404)', count: 0, examples: [] },
      dataMismatch: { label: 'Data/Assertion Mismatches', count: 0, examples: [] },
      rateLimit: { label: 'Rate Limiting (429)', count: 0, examples: [] },
      other: { label: 'Other Failures', count: 0, examples: [] }
    };

    for (const failure of failureDetails) {
      let category = 'other';
      const errorLower = (failure.error || '').toLowerCase();
      const statusCode = failure.statusCode;

      if (statusCode === 401 || statusCode === 403 || errorLower.includes('unauthorized') || errorLower.includes('forbidden') || errorLower.includes('token')) {
        category = 'auth';
      } else if (statusCode >= 500 && statusCode < 600) {
        category = 'serverError';
      } else if (statusCode === 429) {
        category = 'rateLimit';
      } else if (statusCode === 404) {
        category = 'notFound';
      } else if (errorLower.includes('timeout') || errorLower.includes('econnrefused') || errorLower.includes('econnreset') || errorLower.includes('socket')) {
        category = 'timeout';
      } else if (errorLower.includes('expected') || errorLower.includes('to equal') || errorLower.includes('to have') || errorLower.includes('assert') || errorLower.includes('to be')) {
        category = 'dataMismatch';
      }

      categories[category].count++;
      if (categories[category].examples.length < 3) {
        categories[category].examples.push({
          request: failure.request,
          error: failure.error.substring(0, 120),
          statusCode: failure.statusCode
        });
      }
    }

    const total = failureDetails.length || 1;
    const result = [];
    for (const [key, cat] of Object.entries(categories)) {
      if (cat.count > 0) {
        result.push({
          category: key,
          label: cat.label,
          count: cat.count,
          percentage: Math.round((cat.count / total) * 100),
          examples: cat.examples
        });
      }
    }

    return result.sort((a, b) => b.count - a.count);
  }

  // Calculate overall health score (0-100)
  calculateHealth(runSummaries, flakyTests, anomalies, degrading) {
    if (runSummaries.length === 0) {
      return { score: 0, trend: 'neutral', message: 'No data available' };
    }

    // Base score from pass rate (weighted toward recent runs)
    const recentRuns = runSummaries.slice(-5);
    const weights = recentRuns.map((_, i) => i + 1);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const weightedPassRate = recentRuns.reduce((sum, run, i) => sum + (run.passRate * weights[i]), 0) / totalWeight;

    let score = weightedPassRate;

    // Penalize for flaky tests
    score -= Math.min(15, flakyTests.length * 3);

    // Penalize for anomalies
    score -= Math.min(10, anomalies.length * 2);

    // Penalize for degradation
    score -= Math.min(10, degrading.length * 2);

    score = Math.max(0, Math.min(100, Math.round(score)));

    // Calculate trend
    let trend = 'stable';
    if (runSummaries.length >= 3) {
      const older = runSummaries.slice(0, Math.floor(runSummaries.length / 2));
      const newer = runSummaries.slice(Math.floor(runSummaries.length / 2));
      const olderAvg = older.reduce((s, r) => s + r.passRate, 0) / older.length;
      const newerAvg = newer.reduce((s, r) => s + r.passRate, 0) / newer.length;

      if (newerAvg - olderAvg > 3) trend = 'improving';
      else if (olderAvg - newerAvg > 3) trend = 'degrading';
    }

    let message = '';
    if (score >= 90) message = 'Tests are healthy and stable';
    else if (score >= 70) message = 'Generally good, some issues to address';
    else if (score >= 50) message = 'Needs attention — multiple issues detected';
    else message = 'Critical — significant test failures';

    return { score, trend, message, passRate: Math.round(weightedPassRate) };
  }

  // Generate smart recommendations
  generateRecommendations(flakyTests, anomalies, failurePatterns, health, degrading, errorSpikes, correlations) {
    const recommendations = [];

    // Flaky test recommendations
    if (flakyTests.length > 0) {
      const highFlaky = flakyTests.filter(f => f.severity === 'high');
      if (highFlaky.length > 0) {
        recommendations.push({
          priority: 'high', icon: '⚠️',
          title: `${highFlaky.length} highly flaky test(s) need immediate attention`,
          detail: `"${highFlaky[0].request}" flips ${highFlaky[0].flipRate}% of the time. Consider adding retry logic or fixing the underlying instability.`,
          category: 'flaky'
        });
      } else {
        recommendations.push({
          priority: 'medium', icon: '🔄',
          title: `${flakyTests.length} flaky test(s) detected`,
          detail: `Tests that intermittently pass/fail reduce confidence. Review test dependencies and timing assumptions.`,
          category: 'flaky'
        });
      }
    }

    // Degradation recommendations
    if (degrading.length > 0) {
      const worst = degrading[0];
      recommendations.push({
        priority: 'high', icon: '📉',
        title: `${worst.endpoint} is ${worst.changePercent}% slower than before`,
        detail: `Response time went from ${worst.earlierAvg}ms to ${worst.recentAvg}ms. This endpoint is degrading over time — investigate backend changes.`,
        category: 'degradation'
      });
    }

    // Anomaly recommendations
    if (anomalies.length > 0) {
      const critical = anomalies.filter(a => a.severity === 'critical');
      if (critical.length > 0) {
        recommendations.push({
          priority: 'high', icon: '🔴',
          title: `${critical[0].endpoint} is critically slow`,
          detail: `Response time ${critical[0].currentTime}ms vs baseline ${critical[0].baseline}ms (+${critical[0].percentIncrease}%). Investigate backend performance.`,
          category: 'performance'
        });
      } else {
        recommendations.push({
          priority: 'medium', icon: '🟡',
          title: `${anomalies.length} endpoint(s) showing performance anomalies`,
          detail: `Response times are above normal baseline. Monitor for further degradation.`,
          category: 'performance'
        });
      }
    }

    // Error spike recommendations
    if (errorSpikes.length > 0) {
      recommendations.push({
        priority: 'high', icon: '🚨',
        title: `Error rate spiking on ${errorSpikes[0].name}`,
        detail: `Error rate went from ${errorSpikes[0].earlierErrorRate}% to ${errorSpikes[0].recentErrorRate}% in recent runs. Something changed.`,
        category: 'errors'
      });
    }

    // Correlation recommendations
    if (correlations.length > 0) {
      recommendations.push({
        priority: 'medium', icon: '🔗',
        title: `Correlated failures detected`,
        detail: `"${correlations[0].request1}" and "${correlations[0].request2}" fail together ${correlations[0].correlation}% of the time — likely share a common dependency.`,
        category: 'correlation'
      });
    }

    // Failure pattern recommendations
    for (const pattern of failurePatterns.slice(0, 2)) {
      if (pattern.category === 'auth' && pattern.percentage > 20) {
        recommendations.push({
          priority: 'high', icon: '🔑',
          title: 'Auth failures dominate — token may be expiring mid-run',
          detail: `${pattern.percentage}% of failures are auth-related. Consider refreshing tokens between requests or extending token TTL.`,
          category: 'auth'
        });
      } else if (pattern.category === 'serverError' && pattern.percentage > 20) {
        recommendations.push({
          priority: 'high', icon: '🔥',
          title: 'Backend instability detected',
          detail: `${pattern.percentage}% of failures are 5xx server errors. The API may be under stress or have bugs.`,
          category: 'server'
        });
      } else if (pattern.category === 'timeout' && pattern.percentage > 15) {
        recommendations.push({
          priority: 'medium', icon: '⏱️',
          title: 'Timeout issues detected',
          detail: `${pattern.percentage}% of failures are timeouts. Consider increasing timeout thresholds or investigating network latency.`,
          category: 'timeout'
        });
      }
    }

    // Health trend
    if (health.trend === 'degrading') {
      recommendations.push({
        priority: 'medium', icon: '📊',
        title: 'Test health is trending downward',
        detail: 'Recent runs have lower pass rates than earlier runs. Review recent changes that may have introduced regressions.',
        category: 'trend'
      });
    }

    // Positive
    if (health.score >= 90 && flakyTests.length === 0 && anomalies.length === 0 && degrading.length === 0) {
      recommendations.push({
        priority: 'low', icon: '✅',
        title: 'All systems healthy',
        detail: 'Tests are passing consistently with stable response times. Keep up the good work!',
        category: 'positive'
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  // Main analysis function
  analyze() {
    const reports = this.parseReports();

    if (reports.length === 0) {
      return {
        status: 'no_data',
        message: 'No JSON reports found. Run some tests first to generate insights.',
        reportsAnalyzed: 0
      };
    }

    const { assertionResults, responseTimesByEndpoint, runSummaries, failureDetails, requestStats } = this.extractData(reports);

    const flakyTests = this.detectFlaky(assertionResults);
    const anomalies = this.detectAnomalies(responseTimesByEndpoint);
    const failurePatterns = this.classifyFailures(failureDetails);
    const degrading = this.detectDegradation(responseTimesByEndpoint);
    const slowestEndpoints = this.getSlowestEndpoints(requestStats);
    const mostFailing = this.getMostFailingRequests(requestStats);
    const errorSpikes = this.detectErrorSpikes(requestStats);
    const correlatedFailures = this.detectCorrelatedFailures(failureDetails);
    const statusDistribution = this.getStatusCodeDistribution(requestStats);
    const health = this.calculateHealth(runSummaries, flakyTests, anomalies, degrading);
    const recommendations = this.generateRecommendations(flakyTests, anomalies, failurePatterns, health, degrading, errorSpikes, correlatedFailures);

    // Persist data
    this.savePersistedData({
      lastAnalysis: new Date().toISOString(),
      runSummaries
    });

    return {
      status: 'ok',
      reportsAnalyzed: reports.length,
      analyzedAt: new Date().toISOString(),
      health,
      flakyTests: flakyTests.slice(0, 10),
      anomalies: anomalies.slice(0, 10),
      failurePatterns,
      degrading: degrading.slice(0, 10),
      slowestEndpoints,
      mostFailing,
      errorSpikes,
      correlatedFailures,
      statusDistribution: statusDistribution.slice(0, 10),
      recommendations,
      runSummaries: runSummaries.slice(-20),
      totalFailures: failureDetails.length,
      endpointsTracked: Object.keys(responseTimesByEndpoint).length,
      assertionsTracked: Object.keys(assertionResults).length
    };
  }
}

module.exports = InsightsEngine;
