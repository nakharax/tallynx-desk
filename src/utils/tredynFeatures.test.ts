import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTradePricesAndMetrics } from './ghrRules';
import {
  buildVerifiedBlueprintMetrics,
  computeDeskTelemetry,
  computeMarketIndicators,
  computeSha256Hex,
  evaluateAccountAgainstPropRule,
  generateLiveBridgeApiKey,
  generateTredynLiveBridgeMq5,
  MarketCandle,
  PROP_FIRM_RULES,
} from './tredynFeatures';
import { AccountComputed, TradeRecord } from '../types/ghr';

test('computeMarketIndicators calculates EMA20/50, RSI14, ATR14, S/R and BULLISH trend', () => {
  const uptrendCandles: MarketCandle[] = Array.from({ length: 60 }, (_, idx) => {
    const base = 2600 + idx * 4.5;
    return {
      ts: 1700000000 + idx * 900,
      open: base - 2,
      high: base + 5,
      low: base - 4,
      close: base + 3,
    };
  });

  const ind = computeMarketIndicators(uptrendCandles, 2);
  assert.ok(ind.ema20 > ind.ema50, 'EMA20 should be above EMA50 in steady uptrend');
  assert.ok(ind.rsi14 > 65, 'RSI14 should reflect sustained bullish closes');
  assert.ok(ind.atr14 > 0, 'ATR14 should be positive');
  assert.ok(ind.resistance > ind.support, 'Resistance must exceed support');
  assert.equal(ind.trend, 'BULLISH');

  const empty = computeMarketIndicators([]);
  assert.equal(empty.trend, 'RANGE');
  assert.equal(empty.rsi14, 50);
});

test('computeDeskTelemetry summarizes Equity, Daily DD Guard, Session WRs, and Avg R', () => {
  const acc: AccountComputed = {
    id: 'port1',
    login: '14370024',
    name: 'Prop $6K',
    accountType: 'PROP',
    initial: 6000,
    targetProfit: 480,
    minDays: 5,
    defaultRisk: 120,
    profit: 120,
    balance: 6120,
    currentDays: 2,
    rem: 360,
    roiPct: 2.0,
    badge: 'ขาดอีก $360.00',
    tradeCount: 3,
  };

  const trades: TradeRecord[] = [
    {
      ...computeTradePricesAndMetrics({ dir: 'BUY', entry: 4040, risk: 120, status: 'FULL_SWEEP' }),
      id: 'T1',
      port: 'port1',
      date: '2026-11-15',
      time: '09:30', // ASIA win
      dir: 'BUY',
      note: 'Asia sweep',
    },
    {
      ...computeTradePricesAndMetrics({ dir: 'SELL', entry: 4050, risk: 120, status: 'TRAILING_LOCK' }),
      id: 'T2',
      port: 'port1',
      date: '2026-11-15',
      time: '15:00', // LONDON win
      dir: 'SELL',
      note: 'London TL',
    },
    {
      ...computeTradePricesAndMetrics({ dir: 'BUY', entry: 4060, risk: 120, status: 'FULL_SL' }),
      id: 'T3',
      port: 'port1',
      date: '2026-11-15',
      time: '21:15', // NY loss
      dir: 'BUY',
      note: 'NY loss',
    },
  ];

  const tel = computeDeskTelemetry(acc, trades, 'port1', 35.5, '2026-11-15');
  assert.equal(tel.equity, 6155.5);
  assert.equal(tel.floatingPnl, 35.5);
  assert.equal(tel.sessions.asiaWrPct, 100);
  assert.equal(tel.sessions.londonWrPct, 100);
  assert.equal(tel.sessions.nyWrPct, 0);
  assert.equal(tel.dailyDdGuardStatus, 'SAFE');
  assert.ok(tel.sessions.avgR > 0);
});

test('evaluateAccountAgainstPropRule flags Apex 30% cap violation accurately', () => {
  const apexRule = PROP_FIRM_RULES.find((r) => r.id === 'apex')!;
  assert.ok(apexRule);

  const acc: AccountComputed = {
    id: 'port1',
    login: 'APEX-50K',
    name: 'Futures 50K',
    accountType: 'PROP',
    initial: 50000,
    targetProfit: 3000,
    minDays: 7,
    defaultRisk: 300,
    profit: 1000,
    balance: 51000,
    currentDays: 2,
    rem: 2000,
    roiPct: 2,
    badge: 'ขาดอีก $2000',
    tradeCount: 2,
  };

  // Day 1 makes $800, Day 2 makes $200 -> best day = 80% > 30% Apex rule
  const trades: TradeRecord[] = [
    {
      ...computeTradePricesAndMetrics({ dir: 'BUY', entry: 4040, risk: 1000, status: 'FULL_SWEEP' }),
      id: 'A1',
      port: 'port1',
      date: '2026-11-10',
      time: '10:00',
      dir: 'BUY',
      note: 'Big day',
    },
    {
      ...computeTradePricesAndMetrics({ dir: 'BUY', entry: 4045, risk: 250, status: 'FULL_SWEEP' }),
      id: 'A2',
      port: 'port1',
      date: '2026-11-11',
      time: '10:00',
      dir: 'BUY',
      note: 'Small day',
    },
  ];

  const cmp = evaluateAccountAgainstPropRule(acc, trades, apexRule, 35.5);
  assert.equal(cmp.consistencyOk, false);
  assert.equal(cmp.minDaysOk, false);
  assert.equal(cmp.overallVerdict, 'WARNING');
});

test('buildVerifiedBlueprintMetrics & computeSha256Hex produce deterministic SHA-256 verification digest', async () => {
  const trades: TradeRecord[] = [
    {
      ...computeTradePricesAndMetrics({ dir: 'BUY', entry: 4040, risk: 120, status: 'FULL_SWEEP' }),
      id: 'MK-1',
      port: 'port1',
      date: '2026-11-12',
      time: '14:00',
      dir: 'BUY',
      note: 'Setup A',
    },
    {
      ...computeTradePricesAndMetrics({ dir: 'SELL', entry: 4050, risk: 120, status: 'FULL_SL' }),
      id: 'MK-2',
      port: 'port1',
      date: '2026-11-13',
      time: '15:00',
      dir: 'SELL',
      note: 'Setup B',
    },
  ];

  const metrics = buildVerifiedBlueprintMetrics(trades, { login: '14370024', brokerServer: 'FTMO-Server' });
  assert.equal(metrics.tradesCount, 2);
  assert.equal(metrics.winRatePct, 50);
  assert.equal(metrics.netPnlUsd, -24);
  assert.equal(metrics.profitFactor, 0.8);

  const hash1 = await computeSha256Hex(metrics.canonicalDigestInput);
  const hash2 = await computeSha256Hex(metrics.canonicalDigestInput);
  assert.equal(hash1.length, 64);
  assert.equal(hash1, hash2);
});

test('generateLiveBridgeApiKey & generateTredynLiveBridgeMq5 format valid EA source', () => {
  const key = generateLiveBridgeApiKey('port1');
  assert.ok(key.startsWith('trd_live_port1_'));
  const mq5 = generateTredynLiveBridgeMq5({
    endpointUrl: 'https://desk.example.com/api/mt5/live-bridge/push',
    apiKey: key,
    symbolFilter: 'XAUUSD',
  });
  assert.ok(mq5.includes('#property strict'));
  assert.ok(mq5.includes(key));
  assert.ok(mq5.includes('https://desk.example.com/api/mt5/live-bridge/push'));
  assert.ok(mq5.includes('WebRequest("POST"'));

  const fallbackMq5 = generateTredynLiveBridgeMq5({
    endpointUrl: '',
    apiKey: key,
  });
  assert.ok(fallbackMq5.includes('https://YOUR_DOMAIN/api/mt5/live-bridge/push'));
});
