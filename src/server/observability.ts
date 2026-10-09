import { performance } from 'node:perf_hooks';
export class Metrics {
  private requests = new Map<string, { count: number; errors: number; durations: number[] }>();
  start(): number { return performance.now(); }
  observe(route: string, status: number, start: number) {
    const key = `${route}:${Math.floor(status / 100)}xx`;
    const value = this.requests.get(key) ?? { count: 0, errors: 0, durations: [] };
    value.count++; value.errors += status >= 500 ? 1 : 0; value.durations.push(performance.now() - start);
    if (value.durations.length > 1024) value.durations.shift(); this.requests.set(key, value);
  }
  snapshot() {
    return [...this.requests].map(([route_status, value]) => {
      const sorted = [...value.durations].sort((a, b) => a - b);
      const percentile = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
      return { route_status, count: value.count, errors: value.errors, p50_ms: percentile(.5), p95_ms: percentile(.95), p99_ms: percentile(.99), window_samples: sorted.length };
    });
  }
}
