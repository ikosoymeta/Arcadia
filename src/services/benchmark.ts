import type { BenchmarkResult, BenchmarkSuite, WebVitalsResult } from '../types';
import { sendBenchmarkMessage } from './claude';

const BENCHMARK_PROMPTS = [
  {
    name: 'Simple Q&A',
    prompt: 'What is the capital of France? Answer in one sentence.',
  },
  {
    name: 'Code Generation',
    prompt: 'Write a TypeScript function that implements binary search on a sorted array. Include type annotations.',
  },
  {
    name: 'Long Output',
    prompt: 'Write a comprehensive guide to React hooks including useState, useEffect, useContext, useReducer, useMemo, useCallback, and useRef. Include code examples for each.',
  },
  {
    name: 'Complex Reasoning',
    prompt: 'Explain the time complexity of quicksort in best, average, and worst cases. Then implement it in TypeScript with proper type annotations and explain each step.',
  },
  {
    name: 'HTML Generation',
    prompt: 'Create a complete HTML page with CSS that displays a responsive dashboard with 4 metric cards, a navigation bar, and a chart placeholder. Use modern CSS grid/flexbox. Include all CSS inline in a <style> tag.',
  },
  {
    name: 'Multi-step Analysis',
    prompt: 'Compare and contrast REST, GraphQL, and gRPC APIs. Create a table showing their strengths and weaknesses, then recommend when to use each one.',
  },
];

export async function runBenchmarkSuite(
  apiKey: string,
  model: string,
  onProgress: (completed: number, total: number, current: string) => void,
): Promise<BenchmarkSuite> {
  const results: BenchmarkResult[] = [];
  const total = BENCHMARK_PROMPTS.length;

  for (let i = 0; i < BENCHMARK_PROMPTS.length; i++) {
    const bp = BENCHMARK_PROMPTS[i];
    onProgress(i, total, bp.name);

    try {
      const renderStart = performance.now();
      const result = await sendBenchmarkMessage(bp.prompt, apiKey, model);
      const renderTime = performance.now() - renderStart - result.totalTime;

      const br: BenchmarkResult = {
        id: crypto.randomUUID(),
        name: bp.name,
        prompt: bp.prompt,
        ttft: result.ttft,
        totalTime: result.totalTime,
        tokensPerSecond: result.tokensPerSecond,
        renderTime: Math.max(0, renderTime),
        totalTokens: result.totalTokens,
        timestamp: Date.now(),
        status: result.ttft > 3000 || result.tokensPerSecond < 10 ? 'slow' : 'pass',
      };

      results.push(br);
    } catch (err: any) {
      results.push({
        id: crypto.randomUUID(),
        name: bp.name,
        prompt: bp.prompt,
        ttft: 0,
        totalTime: 0,
        tokensPerSecond: 0,
        renderTime: 0,
        totalTokens: 0,
        timestamp: Date.now(),
        status: 'fail',
      });
    }
  }

  onProgress(total, total, 'Complete');

  const webVitals = await collectWebVitals();

  return {
    id: crypto.randomUUID(),
    results,
    webVitals,
    timestamp: Date.now(),
  };
}

async function collectWebVitals(): Promise<WebVitalsResult> {
  const result: WebVitalsResult = {};

  try {
    const { onLCP, onFID, onCLS, onTTFB, onINP } = await import('web-vitals');

    await Promise.race([
      new Promise<void>((resolve) => {
        let collected = 0;
        const check = () => { collected++; if (collected >= 3) resolve(); };

        onLCP((metric) => { result.lcp = metric.value; check(); });
        onFID((metric) => { result.fid = metric.value; check(); });
        onCLS((metric) => { result.cls = metric.value; check(); });
        onTTFB((metric) => { result.ttfb = metric.value; check(); });
        onINP((metric) => { result.inp = metric.value; check(); });
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch {
    // web-vitals may not fire in all contexts
  }

  return result;
}

export function identifyWorstCases(suite: BenchmarkSuite): {
  metric: string;
  value: number;
  benchmark: string;
  severity: 'critical' | 'warning';
  suggestion: string;
}[] {
  const issues: ReturnType<typeof identifyWorstCases> = [];

  for (const r of suite.results) {
    if (r.status === 'fail') {
      issues.push({
        metric: 'Status',
        value: 0,
        benchmark: r.name,
        severity: 'critical',
        suggestion: 'Request failed. Check API key, network, or rate limits.',
      });
      continue;
    }

    if (r.ttft > 3000) {
      issues.push({
        metric: 'TTFT',
        value: r.ttft,
        benchmark: r.name,
        severity: r.ttft > 5000 ? 'critical' : 'warning',
        suggestion: 'High time-to-first-token. Consider using a faster model (Haiku) or reducing prompt size.',
      });
    }

    if (r.tokensPerSecond < 15) {
      issues.push({
        metric: 'Tokens/sec',
        value: r.tokensPerSecond,
        benchmark: r.name,
        severity: r.tokensPerSecond < 5 ? 'critical' : 'warning',
        suggestion: 'Low throughput. Network latency may be high, or the model is overloaded.',
      });
    }

    if (r.renderTime > 500) {
      issues.push({
        metric: 'Render Time',
        value: r.renderTime,
        benchmark: r.name,
        severity: r.renderTime > 1000 ? 'critical' : 'warning',
        suggestion: 'Slow rendering. Consider virtualizing long message lists or debouncing preview updates.',
      });
    }
  }

  // Web vitals issues
  if (suite.webVitals.lcp && suite.webVitals.lcp > 2500) {
    issues.push({
      metric: 'LCP',
      value: suite.webVitals.lcp,
      benchmark: 'Web Vitals',
      severity: suite.webVitals.lcp > 4000 ? 'critical' : 'warning',
      suggestion: 'Largest Contentful Paint is slow. Optimize initial render, reduce bundle size.',
    });
  }

  if (suite.webVitals.cls && suite.webVitals.cls > 0.1) {
    issues.push({
      metric: 'CLS',
      value: suite.webVitals.cls,
      benchmark: 'Web Vitals',
      severity: suite.webVitals.cls > 0.25 ? 'critical' : 'warning',
      suggestion: 'Layout shift detected. Set explicit dimensions on images/containers.',
    });
  }

  return issues.sort((a, b) => (a.severity === 'critical' ? -1 : 1) - (b.severity === 'critical' ? -1 : 1));
}
