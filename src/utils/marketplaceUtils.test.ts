import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLocalLiveChartAnalysis,
  buildSparklinePoints,
  calibrateCandlesToLiveSpot,
  computeLiveChartTelemetryFromCandles,
  computeVerifiedSetupMetrics,
  filterAndSortMarketplaceListings,
  hasSha256MarketplaceProof,
  isIntegrityVerifiedSetup,
  maskMt5Login,
  mergeMarketplaceListings,
  validateVerifiedMt5Positions,
} from './marketplaceUtils';
import { createCleanWorkspaceState } from './ghrRules';
import { MarketCandle, MarketplaceDeskSetup, Mt5PositionRecord } from '../types/ghr';

test('computeLiveChartTelemetryFromCandles calculates EMA, RSI, ATR, and trend bias accurately', () => {
  const candles: MarketCandle[] = [];
  for (let i = 0; i < 60; i++) {
    const close = 3900 + i * 2.5;
    candles.push({
      ts: 1731500000000 + i * 3600000,
      timeLabel: `11-${String(i).padStart(2, '0')}`,
      open: close - 2,
      high: close + 4,
      low: close - 3,
      close,
      volume: 100 + i,
    });
  }

  const telemetry = computeLiveChartTelemetryFromCandles('XAUUSD', '1h', candles, 'TestFeed');
  assert.equal(telemetry.symbol, 'XAUUSD');
  assert.equal(telemetry.timeframe, '1h');
  assert.equal(telemetry.trendBias, 'BULLISH');
  assert.ok(telemetry.ema20 > telemetry.ema50);
  assert.ok(telemetry.rsi14 > 70);
  assert.ok(telemetry.atr14 > 5);
  assert.ok(telemetry.resistanceLevel > telemetry.supportLevel);
});

test('buildLocalLiveChartAnalysis summarizes live telemetry against active 3-TP plan without signals', () => {
  const candles: MarketCandle[] = Array.from({ length: 30 }, (_, i) => ({
    ts: 1731500000000 + i * 900000,
    timeLabel: `Bar${i}`,
    open: 4000 - i,
    high: 4002 - i,
    low: 3997 - i,
    close: 3998 - i,
  }));
  const t = computeLiveChartTelemetryFromCandles('XAUUSD', '15m', candles, 'Yahoo');
  const state = createCleanWorkspaceState();
  const analysis = buildLocalLiveChartAnalysis(t, state);

  assert.equal(t.trendBias, 'BEARISH');
  assert.ok(analysis.includes('XAUUSD'));
  assert.ok(analysis.includes('RSI(14)'));
  assert.ok(analysis.includes('12-Gate'));
});

test('calibrateCandlesToLiveSpot aligns Futures proxy series onto exact OANDA Spot scale', () => {
  const now = Date.now();
  const futuresCandles: MarketCandle[] = [
    { ts: now - 1800000, timeLabel: '11-16 04:45', open: 3876, high: 3878, low: 3873, close: 3875 },
    { ts: now - 900000, timeLabel: '11-16 05:00', open: 3875, high: 3876, low: 3873, close: 3874.2 },
  ];
  const calibrated = calibrateCandlesToLiveSpot(futuresCandles, 3865.35, '15m', true);
  assert.equal(calibrated.length, 2);
  assert.equal(calibrated[calibrated.length - 1].close, 3865.35);
  assert.ok(calibrated[0].close < 3867 && calibrated[0].close > 3865);
});

test('validateVerifiedMt5Positions rejects invalid rows and computeVerifiedSetupMetrics computes real stats', () => {
  const rawPositions: unknown[] = [
    {
      ticket: '1001001',
      symbol: 'xauusd',
      dir: 'BUY',
      openDate: '2026-11-10',
      openTime: '14:00',
      openTs: 1762783200000,
      closeDate: '2026-11-10',
      closeTime: '14:45',
      closeTs: 1762785900000,
      volume: 0.04,
      openPrice: 4010.0,
      slPrice: 4000.0,
      tpPrice: 4022.0,
      closePrice: 4022.0,
      commission: -2.0,
      swap: 0,
      rawProfit: 146.0,
      netProfit: 144.0,
      comment: 'GHR BUY',
    },
    {
      ticket: '1001002',
      symbol: 'XAUUSD',
      dir: 'SELL',
      openDate: '2026-11-11',
      openTime: '15:00',
      openTs: 1762873200000,
      closeDate: '2026-11-11',
      closeTime: '15:20',
      closeTs: 1762874400000,
      volume: 0.04,
      openPrice: 4035.0,
      slPrice: 4045.0,
      tpPrice: 4023.0,
      closePrice: 4045.0,
      commission: -2.0,
      swap: 0,
      rawProfit: -118.0,
      netProfit: -120.0,
      comment: 'SL hit',
    },
    {
      ticket: '1001003',
      symbol: 'XAUUSD',
      dir: 'BUY',
      openDate: '2026-11-12',
      openTime: '16:00',
      openTs: 1762963200000,
      closeDate: '2026-11-12',
      closeTime: '16:55',
      closeTs: 1762966500000,
      volume: 0.04,
      openPrice: 4015.0,
      slPrice: 4005.0,
      tpPrice: 4027.0,
      closePrice: 4027.0,
      commission: -2.0,
      swap: 0,
      rawProfit: 98.0,
      netProfit: 96.0,
      comment: 'TL',
    },
    { ticket: '', symbol: 'XAUUSD', openPrice: 0 }, // bogus row should be rejected
  ];

  const { valid, rejectedCount } = validateVerifiedMt5Positions(rawPositions);
  assert.equal(valid.length, 3);
  assert.equal(rejectedCount, 1);

  const metrics = computeVerifiedSetupMetrics(valid as Mt5PositionRecord[], 10000);
  assert.equal(metrics.tradeCount, 3);
  assert.equal(metrics.winCount, 2);
  assert.equal(metrics.lossCount, 1);
  assert.equal(metrics.winRatePct, 66.7);
  assert.equal(metrics.grossProfitUsd, 240);
  assert.equal(metrics.grossLossUsd, 120);
  assert.equal(metrics.profitFactor, 2.0);
  assert.equal(metrics.netProfitUsd, 120);
  assert.equal(metrics.maxDrawdownUsd, 120);
  assert.equal(maskMt5Login('14359161'), '143***61');

  const fastMetrics = computeVerifiedSetupMetrics(valid as Mt5PositionRecord[], 10000, true);
  assert.deepEqual(fastMetrics, metrics);
});

function makeMarketplaceListing(
  overrides: Partial<MarketplaceDeskSetup> & { id: string },
): MarketplaceDeskSetup {
  return {
    title: 'XAUUSD Risk Ladder',
    summary: 'Historical MT5 statistical blueprint for London session drawdown analysis.',
    sellerUid: 'uid-1',
    sellerName: 'QuantDesk',
    priceUsd: 0,
    verificationChannel: 'LIVE_BRIDGE',
    brokerName: 'DemoBroker',
    brokerServer: 'DemoBroker-Live',
    maskedLogin: '14359161',
    proofHash: 'a'.repeat(64),
    verifiedAt: '2026-11-20T10:00:00.000Z',
    buyerCount: 3,
    createdAt: '2026-11-20T10:00:00.000Z',
    blueprint: {
      primarySymbol: 'XAUUSD',
      timeframe: '15m',
      sessionFocus: 'LONDON',
      directionMode: 'BOTH',
      riskUsd: 100,
      slPoints: 200,
      tp1Points: 400,
      tp2Points: 800,
      tp3Points: 1200,
      checklistNotes: ['Verify daily loss buffer'],
      executionPlaybook: 'Review historical sample before applying.',
    },
    metrics: {
      tradeCount: 25,
      winCount: 16,
      lossCount: 9,
      winRatePct: 64.0,
      profitFactor: 2.15,
      netProfitUsd: 1450,
      grossProfitUsd: 2650,
      grossLossUsd: 1200,
      maxDrawdownUsd: 320,
      maxDrawdownPct: 3.1,
      avgR: 0.42,
      consistencyBestDayPct: 28.5,
      symbols: ['XAUUSD'],
      firstTradeDate: '2026-10-01',
      lastTradeDate: '2026-11-19',
      equityCurve: [
        { label: '2026-10-01', equityUsd: 10000, pnlUsd: 0 },
        { label: '2026-10-15', equityUsd: 10600, pnlUsd: 600 },
        { label: '2026-11-19', equityUsd: 11450, pnlUsd: 1450 },
      ],
      sampleDeals: [],
    },
    ...overrides,
  };
}

test('Marketplace helpers filter, sort, merge, verify proof hashes, and build sparklines', () => {
  const a = makeMarketplaceListing({
    id: 'setup-a',
    title: 'Gold London Audit',
    priceUsd: 49,
    createdAt: '2026-11-20T10:00:00.000Z',
    metrics: { ...makeMarketplaceListing({ id: 'x' }).metrics, profitFactor: 2.4, winRatePct: 60, netProfitUsd: 900 },
  });
  const b = makeMarketplaceListing({
    id: 'setup-b',
    title: 'Euro NY Discipline',
    priceUsd: 0,
    verificationChannel: 'FUNDEDNEXT_MCP',
    createdAt: '2026-11-22T10:00:00.000Z',
    blueprint: { ...makeMarketplaceListing({ id: 'y' }).blueprint, primarySymbol: 'EURUSD', directionMode: 'BUY' },
    metrics: { ...makeMarketplaceListing({ id: 'y' }).metrics, profitFactor: 1.85, winRatePct: 71.5, netProfitUsd: 2100 },
  });
  const invalid = makeMarketplaceListing({ id: 'bad', proofHash: 'short' });

  assert.equal(isIntegrityVerifiedSetup(a), true);
  assert.equal(isIntegrityVerifiedSetup(invalid), false);
  assert.equal(hasSha256MarketplaceProof(a), true);
  assert.equal(hasSha256MarketplaceProof(invalid), false);

  const merged = mergeMarketplaceListings([a, invalid], [b, { ...a, buyerCount: 1 }]);
  assert.deepEqual(merged.map((item) => item.id), ['setup-b', 'setup-a']);
  assert.equal(merged[1].buyerCount, 3);

  const byPf = filterAndSortMarketplaceListings(merged, {
    searchQuery: '',
    symbolFilter: 'ALL',
    channelFilter: 'ALL',
    directionFilter: 'ALL',
    sortBy: 'PF_DESC',
  });
  assert.deepEqual(byPf.map((item) => item.id), ['setup-a', 'setup-b']);

  const byWinRate = filterAndSortMarketplaceListings(merged, {
    searchQuery: 'euro',
    symbolFilter: 'EURUSD',
    channelFilter: 'FUNDEDNEXT_MCP',
    directionFilter: 'BUY',
    sortBy: 'WINRATE_DESC',
  });
  assert.deepEqual(byWinRate.map((item) => item.id), ['setup-b']);

  const byPrice = filterAndSortMarketplaceListings(merged, {
    searchQuery: '',
    symbolFilter: 'ALL',
    channelFilter: 'ALL',
    directionFilter: 'ALL',
    sortBy: 'PRICE_ASC',
  });
  assert.deepEqual(byPrice.map((item) => item.id), ['setup-b', 'setup-a']);

  const pts = buildSparklinePoints(a.metrics.equityCurve, 180, 38);
  assert.ok(pts && pts.split(' ').length === 3);
  assert.equal(buildSparklinePoints([{ equityUsd: 10000 }], 180, 38), null);
});
