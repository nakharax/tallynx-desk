import test from 'node:test';
import assert from 'node:assert/strict';
import type { MarketCandle } from '../types/ghr';
import { computeQuantSupervisionSnapshot } from './quantSupervisionEngine.ts';
import {
  buildDeterministicSupervisionReport,
  buildRiskSupervisionResponseSchema,
  parseRiskSuperviseRequest,
  RISK_SUPERVISE_FORBIDDEN_FIELDS,
  sanitizeAiRiskSupervisionReport,
} from './riskSupervisionReport.ts';

function candles(prices: number[], volumes: number[] = []): MarketCandle[] {
  return prices.map((close, i) => ({
    ts: i * 86_400_000,
    timeLabel: String(i),
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: volumes[i],
  }));
}

function near(actual: number | null, expected: number) {
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-8, `Expected ${expected}, got ${actual}`);
}

test('VWAP weights typical price by volume and skips bars without volume', () => {
  const series = candles([10, 20, 30, 40], [0, 2, 0, 1]);
  series[1].high = 24;
  const result = computeQuantSupervisionSnapshot('XAUUSD', '1d', series);
  assert.deepEqual(result.vwapSeries.slice(0, 3), [null, 21, 21]);
  near(result.vwap, 82 / 3);
  assert.equal(result.hasVolumeData, true);
});

test('EMA20 and SMA50 align with candles and have full-window warm-up', () => {
  const result = computeQuantSupervisionSnapshot('XAUUSD', '1d', candles(Array.from({ length: 51 }, (_, i) => i + 100)));
  assert.equal(result.ema20Series[18], null);
  near(result.ema20Series[19], 109.5);
  near(result.ema20, 140.5);
  assert.equal(result.sma50Series[48], null);
  near(result.sma50Series[49], 124.5);
  near(result.sma50, 125.5);
});

test('Wilder RSI smooths losses and handles rising, declining and flat samples', () => {
  const rising = Array.from({ length: 15 }, (_, i) => 100 + i);
  near(computeQuantSupervisionSnapshot('XAUUSD', '1d', candles(rising)).rsi14, 100);
  near(computeQuantSupervisionSnapshot('XAUUSD', '1d', candles([...rising, 113])).rsi14, 100 * 13 / 14);
  near(computeQuantSupervisionSnapshot('XAUUSD', '1d', candles([...rising].reverse())).rsi14, 0);
  near(computeQuantSupervisionSnapshot('XAUUSD', '1d', candles(rising.map(() => 100))).rsi14, 50);
});

test('MACD uses 12/26 EMAs and a 9-period signal EMA', () => {
  const prices = Array.from({ length: 34 }, (_, i) => 100 + i);
  const unready = computeQuantSupervisionSnapshot('XAUUSD', '1d', candles(prices.slice(0, 33)));
  assert.equal(unready.macd.signal, null);
  const result = computeQuantSupervisionSnapshot('XAUUSD', '1d', candles(prices));
  near(result.macd.line, 7);
  near(result.macd.signal, 7);
  near(result.macd.histogram, 0);
});

test('Bollinger bands use 20-period population deviation and aligned bands', () => {
  const result = computeQuantSupervisionSnapshot('XAUUSD', '1d', candles(Array.from({ length: 20 }, (_, i) => 100 + i)));
  const sigma = Math.sqrt(33.25);
  assert.equal(result.bollingerSeries[18], null);
  near(result.bollinger.middle, 109.5);
  near(result.bollinger.upper, 109.5 + 2 * sigma);
  near(result.bollinger.lower, 109.5 - 2 * sigma);
  near(result.bollinger.bandwidthPct, 400 * sigma / 109.5);
  near(result.bollinger.zScore, 9.5 / sigma);
  const flat = computeQuantSupervisionSnapshot('XAUUSD', '1d', candles(Array<number>(20).fill(100)));
  assert.equal(flat.bollinger.zScore, 0);
});

test('ATR14 includes gaps and applies Wilder smoothing', () => {
  const result = computeQuantSupervisionSnapshot('XAUUSD', '1d', candles([...Array<number>(14).fill(100), 110]));
  near(result.atr14, 37 / 14);
  near(result.atrPctOfPrice, 100 * 37 / (14 * 110));
});

test('one-day VaR uses return sample deviation and scales by equity and timeframe', () => {
  const series = candles([100, 110, 110, 99]);
  const portfolio = { equityUsd: 10_000, dailyLossLimitUsd: 500, dailyLossUsedUsd: 400, openRiskUsd: 120 };
  const result = computeQuantSupervisionSnapshot('XAUUSD', '1d', series, portfolio).portfolioRiskAudit;
  near(result.var95Pct, 16.44853626951472);
  near(result.var95Usd, 1644.853626951472);
  near(result.dailyDdUsedPct, 80);
  near(result.dailyDdBufferUsd, 100);
  near(result.openRiskUsd, 120);
  assert.equal(result.riskPosture, 'ELEVATED');
  const intraday = computeQuantSupervisionSnapshot('XAUUSD', '4h', series, portfolio).portfolioRiskAudit;
  near(intraday.var95Usd, 1644.853626951472 * Math.sqrt(6));
  const breached = computeQuantSupervisionSnapshot('XAUUSD', '1d', series, { ...portfolio, dailyLossUsedUsd: 600 }).portfolioRiskAudit;
  assert.equal(breached.dailyDdUsedPct, 120);
  assert.equal(breached.dailyDdBufferUsd, 0);
  assert.equal(breached.riskPosture, 'CRITICAL');
});

test('confirmed swing highs and lows form bounded zones with repeated touches', () => {
  const result = computeQuantSupervisionSnapshot('XAUUSD', '15m', candles([
    100, 98, 91, 98, 100, 104, 109, 104, 100, 98, 91, 98, 100, 104, 109, 104, 100, 98, 91, 98, 100,
  ]));
  const [support] = result.structuralSupportZones;
  const [resistance] = result.structuralResistanceZones;
  assert.equal(support.level, 90);
  assert.equal(support.touches, 3);
  assert.equal(support.strength, 'HIGH');
  assert.equal(resistance.level, 110);
  assert.equal(resistance.touches, 2);
  assert.equal(resistance.strength, 'MEDIUM');
  for (const zone of [support, resistance]) assert.ok(zone.bandLow < zone.level && zone.level < zone.bandHigh);
});

test('trend classification describes historical movement and volatility spikes take priority', () => {
  const rising = Array.from({ length: 40 }, (_, i) => 100 + i);
  assert.equal(computeQuantSupervisionSnapshot('XAUUSD', '1d', candles(rising)).volatilityRegime, 'TRENDING_UP');
  assert.equal(computeQuantSupervisionSnapshot('XAUUSD', '1d', candles([...rising].reverse())).volatilityRegime, 'TRENDING_DOWN');
  const flat = Array<number>(30).fill(100);
  assert.equal(computeQuantSupervisionSnapshot('XAUUSD', '1d', candles(flat)).volatilityRegime, 'RANGE_BOUND');
  const spike = computeQuantSupervisionSnapshot('XAUUSD', '1d', candles([...flat, 500]), { equityUsd: 10_000 });
  assert.equal(spike.volatilityRegime, 'HIGH_VOLATILITY');
  assert.ok(spike.atr14 !== null && spike.atr14 > 20);
  assert.ok(spike.portfolioRiskAudit.var95Usd !== null && Number.isFinite(spike.portfolioRiskAudit.var95Usd));
});

test('empty, single and zero-volume samples expose unavailable values without NaN', () => {
  const empty = computeQuantSupervisionSnapshot('XAUUSD', '15m', []);
  assert.equal(empty.lastPrice, null);
  assert.equal(empty.atr14, null);
  assert.equal(empty.portfolioRiskAudit.var95Usd, null);
  assert.deepEqual(empty.vwapSeries, []);
  const single = computeQuantSupervisionSnapshot('XAUUSD', '15m', candles([100], [2]));
  assert.equal(single.lastPrice, 100);
  assert.equal(single.vwap, 100);
  assert.equal(single.ema20, null);
  assert.equal(single.rsi14, null);
  assert.deepEqual(single.structuralSupportZones, []);
  const noVolume = computeQuantSupervisionSnapshot('XAUUSD', '15m', candles([100, 101], [0, 0]));
  assert.equal(noVolume.hasVolumeData, false);
  assert.equal(noVolume.vwap, null);
  assert.deepEqual(noVolume.vwapSeries, [null, null]);
  assert.equal(noVolume.portfolioRiskAudit.dailyDdUsedPct, null);
});

test('request parsing requires a supported market and valid OHLC, deduplicates bars and projects portfolio fields', () => {
  const [early, late] = candles([100, 101]);
  assert.equal(parseRiskSuperviseRequest({ symbol: 'Unknown', timeframe: '1d', candles: [early] }), null);
  assert.equal(parseRiskSuperviseRequest({ symbol: 'XAUUSD', timeframe: '1m', candles: [early] }), null);
  assert.equal(parseRiskSuperviseRequest({ symbol: 'XAUUSD', timeframe: '1d', candles: [{ ...early, high: 0 }] }), null);
  const request = parseRiskSuperviseRequest({
    symbol: ' xauusd ', timeframe: '1D', lang: 'th',
    candles: [{ ...late, timeLabel: '<b>ignored</b>' }, early, late],
    portfolio: { equityUsd: 2000, dailyLossLimitUsd: 100, accountType: 'PROP', accountLogin: 'private' },
  });
  assert.equal(request?.symbol, 'XAUUSD');
  assert.equal(request?.timeframe, '1d');
  assert.equal(request?.lang, 'th');
  assert.deepEqual(request?.candles.map(candle => candle.ts), [early.ts, late.ts]);
  assert.deepEqual(request?.portfolio, { equityUsd: 2000, dailyLossLimitUsd: 100, accountType: 'PROP' });
});

test('schema and sanitizer enforce analytical wording and server-owned metadata', () => {
  const snapshot = computeQuantSupervisionSnapshot('XAUUSD', '1d', candles([100, 101]));
  const generatedAt = '2026-11-26T00:00:00.000Z';
  const fallback = buildDeterministicSupervisionReport(snapshot, 'en', generatedAt, 'GEMINI_API_KEY_MISSING');
  assert.deepEqual(fallback, buildDeterministicSupervisionReport(snapshot, 'en', generatedAt, 'GEMINI_API_KEY_MISSING'));
  const serializedFallback: unknown = JSON.parse(JSON.stringify(fallback));
  assert.deepEqual(serializedFallback, fallback);
  const schema = buildRiskSupervisionResponseSchema(fallback);
  assert.equal(schema.additionalProperties, false);
  const modelBody = Object.fromEntries(schema.required.map(key => [key, fallback[key]]));
  const clean = sanitizeAiRiskSupervisionReport({ ...modelBody, symbol: 'OTHER', model: 'untrusted' }, fallback, 'gemini-test');
  assert.equal(clean?.symbol, 'XAUUSD');
  assert.equal(clean?.model, 'gemini-test');
  assert.equal(clean?.source, 'gemini');
  assert.equal(clean?.fallbackUsed, false);
  assert.equal(clean?.fallbackReason, undefined);
  for (const field of RISK_SUPERVISE_FORBIDDEN_FIELDS) {
    assert.equal(sanitizeAiRiskSupervisionReport({ ...modelBody, ignored: [{ [field]: 123 }] }, fallback, 'gemini-test'), null);
    assert.equal(sanitizeAiRiskSupervisionReport({ ...modelBody, [field]: 123 }, fallback, 'gemini-test'), null);
  }
  assert.equal(sanitizeAiRiskSupervisionReport({ ...modelBody, deskBrief: 'Arbitrary unvetted prose' }, fallback, 'gemini-test'), null);
  assert.equal(sanitizeAiRiskSupervisionReport({ ...modelBody, structuralSupportZones: [123] }, fallback, 'gemini-test'), null);
  assert.equal(sanitizeAiRiskSupervisionReport({ ...modelBody, riskRating: 'UNDEFINED' }, fallback, 'gemini-test'), null);
  assert.equal(sanitizeAiRiskSupervisionReport({ ...modelBody, riskRating: 'CRITICAL' }, fallback, 'gemini-test'), null);
  assert.equal(sanitizeAiRiskSupervisionReport({}, fallback, 'gemini-test'), null);
  const repeated = Array<string>(3).fill(fallback.disciplineChecklist[0]);
  assert.equal(sanitizeAiRiskSupervisionReport({ ...modelBody, disciplineChecklist: repeated }, fallback, 'gemini-test'), null);
});
