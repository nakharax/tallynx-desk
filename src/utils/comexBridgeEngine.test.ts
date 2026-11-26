import assert from 'node:assert/strict';
import test from 'node:test';
import type { MarketCandle } from '../types/ghr';
import { asRecord } from './aiProviderConfig.ts';
import { buildComexBridgeSnapshot, computeSmoothedBasis, computeVolumeProfile } from './comexBridgeEngine.ts';

function candle(low: number, high: number, volume?: number): MarketCandle {
  return { ts: 0, timeLabel: '', open: low, low, high, close: high, volume };
}

test('EMA uses paired basis observations and the latest spot price for the raw spread percentage', () => {
  const result = computeSmoothedBasis([100.1, 100.4, 100.7], [100, 100, 100], 0.5);
  assert.deepEqual(result, { rawBasis: 0.7, smoothedBasis: 0.475, basisPct: 0.7, basisSampleCount: 3 });
  assert.deepEqual(computeSmoothedBasis([99, 101], [102]), {
    rawBasis: -1, smoothedBasis: -1, basisPct: -0.9803921568627451, basisSampleCount: 1,
  });
  assert.equal(computeSmoothedBasis([], []).basisSampleCount, 0);
  assert.equal(computeSmoothedBasis([100], [0]).basisPct, 0);
});

test('volume is distributed over the candle range and a flat bar on the upper edge lands in the final bin', () => {
  const profile = computeVolumeProfile([candle(100, 104, 80), candle(104, 104, 20)], { bins: 4, basisOffset: 0.1 });
  assert.deepEqual(profile.bins.map(bin => [bin.priceLow, bin.priceHigh, bin.volume, bin.volumePct]), [
    [100, 101, 20, 20], [101, 102, 20, 20], [102, 103, 20, 20], [103, 104, 40, 40],
  ]);
  assert.equal(profile.totalVolume, 100);
  assert.equal(profile.pocGc, 103.5);
  assert.equal(profile.pocXau, 103.4);
  assert.equal(profile.bins[0].mappedXauPrice, 100.4);
});

test('the 70% value area grows contiguously from the POC and distinct secondary peaks become liquidity walls', () => {
  const profile = computeVolumeProfile([
    candle(100, 106, 0), candle(100.5, 100.5, 12), candle(101.5, 101.5, 2),
    candle(102.5, 102.5, 55), candle(103.5, 103.5, 15), candle(104.5, 104.5, 4), candle(105.5, 105.5, 12),
  ], { bins: 6, basisOffset: 1.25 });
  assert.deepEqual([profile.valGc, profile.pocGc, profile.vahGc], [102, 102.5, 104]);
  assert.deepEqual([profile.valXau, profile.pocXau, profile.vahXau], [100.75, 101.25, 102.75]);
  assert.equal(profile.bins.filter(bin => bin.isInValueArea).reduce((sum, bin) => sum + bin.volumePct, 0), 70);
  assert.deepEqual(profile.hvnZones.map(zone => [zone.midPrice, zone.mappedXauPrice]), [[100.5, 99.25], [105.5, 104.25]]);
  assert.equal(profile.bins.filter(bin => bin.isHvn).length, 2);
});

test('empty and zero-volume profiles have no levels, and a single flat candle creates a usable level', () => {
  for (const candles of [[], [candle(100, 105)], [candle(100, 100, 0)]]) {
    const profile = computeVolumeProfile(candles);
    assert.deepEqual([profile.pocGc, profile.valGc, profile.vahGc], [null, null, null]);
    assert.equal(profile.hasVolumeData, false);
    assert.equal(profile.totalVolume, 0);
    assert.ok(profile.bins.every(bin => bin.volumePct === 0));
    assert.deepEqual(profile.hvnZones, []);
  }
  const flat = computeVolumeProfile([candle(100, 100, 25)], { basisOffset: -0.4 });
  assert.equal(flat.bins.length, 1);
  assert.equal(flat.bins[0].volumePct, 100);
  assert.deepEqual([flat.pocXau, flat.valXau, flat.vahXau], [100.4, 100.4, 100.4]);
});

test('all exports describe the same mapped analytical levels and contain no execution or directional instructions', () => {
  const snapshot = buildComexBridgeSnapshot({
    timeframe: '15m', fetchedAt: '2026-11-25T12:00:00.000Z', candles: [candle(100, 100, 25)],
    gcPrices: [100.5], xauPrices: [100], dataSource: 'Test data', databentoUsed: false,
  });
  const { mql5, json, pineScript, python } = snapshot.exports;
  assert.match(mql5, /#property indicator_chart_window[\s\S]*OBJ_HLINE[\s\S]*AddLevel\("POC", 99\.5\)/);
  assert.match(pineScript, /^\/\/@version=5\nindicator\([\s\S]*hline\(99\.5, title="POC"/);
  assert.match(python, /os\.environ\["DATABENTO_API_KEY"\]/);
  assert.match(python, /historical\.timeseries\.get_range\(/);
  assert.match(python, /live\.subscribe\(/);
  assert.match(python, /BASIS = Decimal\("0\.5"\)/);
  const payload = asRecord(JSON.parse(json));
  assert.equal(payload?.readOnly, true);
  assert.equal(asRecord(payload?.profile)?.pocXau, 99.5);
  for (const template of Object.values(snapshot.exports)) {
    assert.doesNotMatch(template, /\b(?:OrderSend(?:Async)?|trade\s*\.\s*(?:Buy|Sell)|strategy\s*[.(]|alertcondition|suggestedEntry|SL|TP|buy|sell)\b/i);
  }
});

test('exports omit price lines when the source bars have no volume', () => {
  const { exports } = buildComexBridgeSnapshot({
    timeframe: '15m', fetchedAt: '2026-11-25T12:00:00.000Z', candles: [],
    gcPrices: [101], xauPrices: [100], dataSource: 'Test data', databentoUsed: false,
  });
  assert.doesNotMatch(exports.mql5, /AddLevel\("/);
  assert.doesNotMatch(exports.pineScript, /hline\(/);
  assert.match(exports.pineScript, /plot\(float\(na\)/);
  assert.equal(asRecord(asRecord(JSON.parse(exports.json))?.profile)?.pocXau, null);
});
