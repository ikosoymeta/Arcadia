import { useState } from 'react';
import { useConnection } from '../../store/ConnectionContext';
import { runBenchmarkSuite, identifyWorstCases } from '../../services/benchmark';
import type { BenchmarkSuite } from '../../types';
import { storage } from '../../services/storage';
import styles from './Benchmark.module.css';

export function BenchmarkPanel() {
  const { activeConnection } = useConnection();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0, current: '' });
  const [latestSuite, setLatestSuite] = useState<BenchmarkSuite | null>(() => {
    const all = storage.getBenchmarks();
    return all.length > 0 ? all[all.length - 1] : null;
  });

  const handleRun = async () => {
    if (!activeConnection) return;
    setRunning(true);

    try {
      const suite = await runBenchmarkSuite(
        activeConnection.apiKey,
        activeConnection.model,
        (completed, total, current) => setProgress({ completed, total, current }),
        activeConnection.baseUrl,
      );
      setLatestSuite(suite);
      const all = storage.getBenchmarks();
      storage.saveBenchmarks([...all, suite]);
    } finally {
      setRunning(false);
    }
  };

  const issues = latestSuite ? identifyWorstCases(latestSuite) : [];

  const getMaxTime = () => {
    if (!latestSuite) return 1;
    return Math.max(...latestSuite.results.map(r => r.totalTime), 1);
  };

  return (
    <div className={styles.benchmarkPanel}>
      <div className={styles.title}>Performance Benchmarks</div>
      <div className={styles.subtitle}>
        Run benchmark prompts against your Claude connection to measure latency, throughput, and rendering performance.
      </div>

      <button
        className={styles.runBtn}
        onClick={handleRun}
        disabled={running || !activeConnection}
      >
        {running ? 'Running...' : !activeConnection ? 'Configure connection first' : 'Run Benchmark Suite'}
      </button>

      {running && (
        <div className={styles.progress}>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${(progress.completed / Math.max(progress.total, 1)) * 100}%` }}
            />
          </div>
          <div className={styles.progressText}>
            {progress.completed}/{progress.total} — {progress.current}
          </div>
        </div>
      )}

      {latestSuite && (
        <>
          {/* Issues / Worst Cases */}
          {issues.length > 0 && (
            <div className={styles.issuesSection}>
              <div className={styles.issuesTitle}>Issues Detected</div>
              {issues.map((issue, i) => (
                <div key={i} className={`${styles.issueCard} ${styles[issue.severity]}`}>
                  <span className={styles.issueBenchmark}>{issue.benchmark}</span> — {issue.metric}: {
                    typeof issue.value === 'number' && issue.value > 0
                      ? `${issue.value.toFixed(0)}${issue.metric.includes('sec') ? ' t/s' : 'ms'}`
                      : 'Failed'
                  }
                  <br />
                  {issue.suggestion}
                </div>
              ))}
            </div>
          )}

          {/* Web Vitals */}
          <div className={styles.webVitals}>
            {latestSuite.webVitals.lcp !== undefined && (
              <div className={styles.vitalCard}>
                <div className={styles.vitalLabel}>LCP</div>
                <div className={styles.vitalValue}>{latestSuite.webVitals.lcp.toFixed(0)}ms</div>
              </div>
            )}
            {latestSuite.webVitals.fid !== undefined && (
              <div className={styles.vitalCard}>
                <div className={styles.vitalLabel}>FID</div>
                <div className={styles.vitalValue}>{latestSuite.webVitals.fid.toFixed(0)}ms</div>
              </div>
            )}
            {latestSuite.webVitals.cls !== undefined && (
              <div className={styles.vitalCard}>
                <div className={styles.vitalLabel}>CLS</div>
                <div className={styles.vitalValue}>{latestSuite.webVitals.cls.toFixed(3)}</div>
              </div>
            )}
            {latestSuite.webVitals.ttfb !== undefined && (
              <div className={styles.vitalCard}>
                <div className={styles.vitalLabel}>TTFB</div>
                <div className={styles.vitalValue}>{latestSuite.webVitals.ttfb.toFixed(0)}ms</div>
              </div>
            )}
            {latestSuite.webVitals.inp !== undefined && (
              <div className={styles.vitalCard}>
                <div className={styles.vitalLabel}>INP</div>
                <div className={styles.vitalValue}>{latestSuite.webVitals.inp.toFixed(0)}ms</div>
              </div>
            )}
          </div>

          {/* Bar Chart */}
          <div className={styles.barChart}>
            <div className={styles.barChartTitle}>Response Time (ms)</div>
            {latestSuite.results.map(r => {
              const pct = (r.totalTime / getMaxTime()) * 100;
              const speed = r.totalTime < 3000 ? 'fast' : r.totalTime < 8000 ? 'medium' : 'slow';
              return (
                <div key={r.id} className={styles.bar}>
                  <div className={styles.barLabel}>{r.name}</div>
                  <div className={styles.barTrack}>
                    <div
                      className={`${styles.barFill} ${styles[speed]}`}
                      style={{ width: `${Math.max(pct, 5)}%` }}
                    >
                      {r.totalTime.toFixed(0)}ms
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Results Grid */}
          <div className={styles.resultsGrid}>
            {latestSuite.results.map(r => (
              <div key={r.id} className={styles.resultCard}>
                <div>
                  <div className={styles.resultName}>{r.name}</div>
                  <div className={styles.resultMetrics}>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>TTFT</span>
                      <span className={styles.metricValue}>{r.ttft.toFixed(0)}ms</span>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>Total</span>
                      <span className={styles.metricValue}>{(r.totalTime / 1000).toFixed(1)}s</span>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>Speed</span>
                      <span className={styles.metricValue}>{r.tokensPerSecond.toFixed(1)} t/s</span>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>Tokens</span>
                      <span className={styles.metricValue}>{r.totalTokens}</span>
                    </div>
                  </div>
                </div>
                <span className={`${styles.statusBadge} ${styles[r.status]}`}>{r.status}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {!latestSuite && !running && (
        <div className={styles.noData}>
          No benchmark data yet. Click "Run Benchmark Suite" to get started.
        </div>
      )}
    </div>
  );
}
