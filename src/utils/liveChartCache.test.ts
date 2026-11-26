import test from 'node:test';
import assert from 'node:assert/strict';
import type { LiveChartTelemetry } from '../types/ghr';
import { LiveChartResponseCache } from './liveChartCache';

function sampleTelemetry(currentPrice: number): LiveChartTelemetry {
  return {
    symbol: 'XAUUSD',
    timeframe: '15m',
    source: 'OANDA:XAUUSD Live (Spot-Calibrated)',
    fetchedAt: new Date().toISOString(),
    currentPrice,
    prevClose: currentPrice - 4,
    changeAbs: 4,
    changePct: 0.12,
    intradayHigh: currentPrice + 10,
    intradayLow: currentPrice - 12,
    ema20: currentPrice - 2,
    ema50: currentPrice - 5,
    rsi14: 58,
    atr14: 8.5,
    trendBias: 'BULLISH',
    supportLevel: currentPrice - 15,
    resistanceLevel: currentPrice + 15,
    candles: [],
  };
}

test('LiveChartResponseCache serves HIT within TTL and refreshes after expiry', async () => {
  let clock = 10000;
  let fetchCount = 0;
  const cache = new LiveChartResponseCache(3000, 30000);

  const fetcher = async () => {
    fetchCount += 1;
    return sampleTelemetry(3865 + fetchCount);
  };

  const first = await cache.getOrFetch('XAUUSD:15m', fetcher, { nowMs: () => clock });
  assert.equal(first.cacheStatus, 'MISS');
  assert.equal(first.telemetry.currentPrice, 3866);
  assert.equal(fetchCount, 1);

  clock += 1500;
  const second = await cache.getOrFetch('XAUUSD:15m', fetcher, { nowMs: () => clock });
  assert.equal(second.cacheStatus, 'HIT');
  assert.equal(second.telemetry.currentPrice, 3866);
  assert.equal(second.ageMs, 1500);
  assert.equal(fetchCount, 1);

  clock += 2000;
  const third = await cache.getOrFetch('XAUUSD:15m', fetcher, { nowMs: () => clock });
  assert.equal(third.cacheStatus, 'MISS');
  assert.equal(third.telemetry.currentPrice, 3867);
  assert.equal(fetchCount, 2);
});

test('LiveChartResponseCache coalesces concurrent requests into a single upstream fetch', async () => {
  let clock = 20000;
  let fetchCount = 0;
  const cache = new LiveChartResponseCache(3000, 30000);

  const fetcher = async () => {
    fetchCount += 1;
    await new Promise((r) => setTimeout(r, 25));
    return sampleTelemetry(3870);
  };

  const results = await Promise.all([
    cache.getOrFetch('XAUUSD:15m', fetcher, { nowMs: () => clock }),
    cache.getOrFetch('XAUUSD:15m', fetcher, { nowMs: () => clock }),
    cache.getOrFetch('XAUUSD:15m', fetcher, { nowMs: () => clock }),
    cache.getOrFetch('XAUUSD:15m', fetcher, { nowMs: () => clock }),
  ]);

  assert.equal(fetchCount, 1);
  assert.equal(results[0].cacheStatus, 'MISS');
  assert.deepEqual(
    results.slice(1).map((r) => r.cacheStatus),
    ['COALESCED', 'COALESCED', 'COALESCED']
  );
  assert.ok(results.every((r) => r.telemetry.currentPrice === 3870));
});

test('LiveChartResponseCache serves STALE_FALLBACK when upstream fails within grace window', async () => {
  let clock = 30000;
  const cache = new LiveChartResponseCache(3000, 30000);

  await cache.getOrFetch('XAUUSD:15m', async () => sampleTelemetry(3865.5), { nowMs: () => clock });

  clock += 5000; // expired past 3s TTL, still within 30s grace
  const fallback = await cache.getOrFetch(
    'XAUUSD:15m',
    async () => {
      throw new Error('Upstream 429');
    },
    { nowMs: () => clock }
  );

  assert.equal(fallback.cacheStatus, 'STALE_FALLBACK');
  assert.equal(fallback.telemetry.currentPrice, 3865.5);
  assert.equal(fallback.ageMs, 5000);
});

test('forced refresh joins live work and a cleared flight cannot restore cleared data', async () => {
  const cache = new LiveChartResponseCache();
  let resolveFirst!: (sample: LiveChartTelemetry) => void;
  const pending = new Promise<LiveChartTelemetry>(resolve => { resolveFirst = resolve; });
  const first = cache.getOrFetch('XAUUSD:15m', () => pending);
  const second = cache.getOrFetch('XAUUSD:15m', async () => sampleTelemetry(111), { forceRefresh: true });
  cache.clear();
  await cache.getOrFetch('XAUUSD:15m', async () => sampleTelemetry(222));
  resolveFirst(sampleTelemetry(100));
  assert.equal((await second).telemetry.currentPrice, 100);
  await first;
  assert.equal((await cache.getOrFetch('XAUUSD:15m', async () => sampleTelemetry(333))).telemetry.currentPrice, 222);
});
