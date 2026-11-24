import type { LiveChartTelemetry } from '../types/ghr';

export const LIVE_CHART_CACHE_TTL_MS = 3000;
export const LIVE_CHART_STALE_FALLBACK_MS = 30000;

export type LiveChartCacheStatus = 'HIT' | 'COALESCED' | 'MISS' | 'STALE_FALLBACK';

interface CachedTelemetryEntry {
  telemetry: LiveChartTelemetry;
  cachedAtMs: number;
}

export interface LiveChartCacheLookupResult {
  telemetry: LiveChartTelemetry;
  cacheStatus: LiveChartCacheStatus;
  ageMs: number;
}

/**
 * Coalesced TTL + stale-if-error cache for /api/market/live-chart.
 * Collapses concurrent upstream spot/candle requests per symbol+timeframe into a single fetch.
 */
export class LiveChartResponseCache {
  private readonly store = new Map<string, CachedTelemetryEntry>();
  private readonly inFlight = new Map<string, Promise<LiveChartTelemetry>>();

  constructor(
    private readonly ttlMs: number = LIVE_CHART_CACHE_TTL_MS,
    private readonly staleFallbackMs: number = LIVE_CHART_STALE_FALLBACK_MS,
    private readonly maxEntries: number = 120
  ) {}

  async getOrFetch(
    cacheKey: string,
    fetcher: () => Promise<LiveChartTelemetry>,
    options: { forceRefresh?: boolean; nowMs?: () => number } = {}
  ): Promise<LiveChartCacheLookupResult> {
    const getNow = options.nowMs ?? Date.now;
    const now = getNow();
    const cached = this.store.get(cacheKey);

    if (!options.forceRefresh && cached && now - cached.cachedAtMs < this.ttlMs) {
      return {
        telemetry: cached.telemetry,
        cacheStatus: 'HIT',
        ageMs: Math.max(0, now - cached.cachedAtMs),
      };
    }

    const existingFlight = !options.forceRefresh ? this.inFlight.get(cacheKey) : undefined;
    if (existingFlight) {
      try {
        const telemetry = await existingFlight;
        return {
          telemetry,
          cacheStatus: 'COALESCED',
          ageMs: 0,
        };
      } catch (err) {
        if (cached && getNow() - cached.cachedAtMs <= this.staleFallbackMs) {
          return {
            telemetry: cached.telemetry,
            cacheStatus: 'STALE_FALLBACK',
            ageMs: Math.max(0, getNow() - cached.cachedAtMs),
          };
        }
        throw err;
      }
    }

    const flightPromise = fetcher()
      .then((telemetry) => {
        if (this.store.size >= this.maxEntries && !this.store.has(cacheKey)) {
          const oldestKey = this.store.keys().next().value;
          if (oldestKey) this.store.delete(oldestKey);
        }
        this.store.set(cacheKey, {
          telemetry,
          cachedAtMs: getNow(),
        });
        return telemetry;
      })
      .finally(() => {
        if (this.inFlight.get(cacheKey) === flightPromise) {
          this.inFlight.delete(cacheKey);
        }
      });

    this.inFlight.set(cacheKey, flightPromise);

    try {
      const telemetry = await flightPromise;
      return {
        telemetry,
        cacheStatus: 'MISS',
        ageMs: 0,
      };
    } catch (err) {
      if (cached && getNow() - cached.cachedAtMs <= this.staleFallbackMs) {
        return {
          telemetry: cached.telemetry,
          cacheStatus: 'STALE_FALLBACK',
          ageMs: Math.max(0, getNow() - cached.cachedAtMs),
        };
      }
      throw err;
    }
  }

  size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
    this.inFlight.clear();
  }
}
