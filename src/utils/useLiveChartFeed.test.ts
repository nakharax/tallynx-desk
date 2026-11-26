import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchLiveChartTelemetryApi, formatChartPrice } from './liveChartMarkets.ts';

test('passes cancellation through and rejects a response for a different market', async t => {
  const controller = new AbortController();
  let sentSignal: AbortSignal | null | undefined;
  t.mock.method(globalThis, 'fetch', async (_url: string, init?: RequestInit) => {
    sentSignal = init?.signal;
    return Response.json({ ok: true, telemetry: { symbol: 'BTCUSD', timeframe: '5m' } });
  });
  await assert.rejects(fetchLiveChartTelemetryApi('XAUUSD', '5m', controller.signal));
  controller.abort();
  assert.equal(sentSignal?.aborted, true);
});

test('keeps FX quote precision and shows missing prices as unavailable', () => {
  assert.equal(formatChartPrice(1.01234, 'EURUSD'), '1.01234');
  assert.equal(formatChartPrice(153.567, 'USDJPY'), '153.567');
  assert.equal(formatChartPrice(NaN, 'XAUUSD'), '—');
});

test('keeps a valid empty candle history and identifies the server stale-cache fallback', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    ok: true,
    cacheStatus: 'STALE_FALLBACK',
    telemetry: {
      symbol: 'XAUUSD', timeframe: '5m', source: 'Fixture', fetchedAt: '2026-11-26T08:00:00Z', candles: [],
      currentPrice: 2600, prevClose: 2599, changeAbs: 1, changePct: 0.04, intradayHigh: 2610, intradayLow: 2590,
      ema20: 2600, ema50: 2600, rsi14: 50, atr14: 2, supportLevel: 2595, resistanceLevel: 2605, trendBias: 'NEUTRAL',
    },
  }));
  const result = await fetchLiveChartTelemetryApi('XAUUSD', '5m');
  assert.equal(result.staleCache, true);
  assert.deepEqual(result.candles, []);
});
