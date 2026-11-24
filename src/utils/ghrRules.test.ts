import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_TWELVE_GATES_PASSED,
  buildCumulativePnlSeries,
  buildMonthlyConsistencyCalendar,
  buildSevenDayConsistencyCalendar,
  buildTradingCoachContext,
  calculateFourLegLadderMetrics,
  calculateGhrV32Expectancy,
  calculateGhrV32LadderMetrics,
  calculateMultiStateExpectancy,
  calculateManualTrade,
  buildCalculatorTradeFields,
  carryCycleDaysOnPortChange,
  DEFAULT_MANUAL_CALCULATOR,
  getActiveCalculator,
  getActiveConsistencyRule,
  recordCycleDayPnl,
  computeTradePricesAndMetrics,
  convertMt5PositionsToJournalRows,
  createCleanWorkspaceState,
  DEFAULT_ACCOUNTS,
  DEFAULT_STATE,
  DEFAULT_TWELVE_GATES,
  evaluateConsistencyRule,
  evaluateTradeGuardrails,
  evaluateTwelveGates,
  filterJournalTrades,
  generateLocalTacticalPlan,
  getAccountComputed,
  getBangkokIsoDate,
  getBangkokTimeHHMM,
  getCalcMetrics,
  getDefaultCalendarMonthKey,
  getTradeSession,
  normalizeBridgePositionsToMt5Records,
  normalizeMergedState,
  parseMt5DateTimeToBangkok,
  PORTFOLIO_PRESETS,
  reapplyMt5TimezoneToPositions,
  resolveAccountType,
  resolveRealtimeStateConflict,
  shiftMonthKey,
  syncCycleDaysWithJournal,
  syncQuickFromTwelveGates,
  syncQuickGateToTwelveGates,
  updateCycleDayEntry,
  buildCustomerInviteUrl,
  getDefaultCustomerPortalOrigin,
  parseCustomerPortalParams,
  SHARED_CUSTOMER_PORTAL_URL,
} from './ghrRules';
import {
  getIndexedDbWorkspaceKey,
  getLocalStorageKey,
  getStorageScopeId,
} from './idbStorage';

test('manual XAUUSD equal lots and risk-based weights use the same price ladder for recording', () => {
  const config = DEFAULT_MANUAL_CALCULATOR;
  const byLot = calculateManualTrade('BUY', 4000, 120, {
    ...config, sizing: 'BY_LOT', lotBasis: 'PER_LEG', manualLot: 0.03,
  });
  assert.equal(byLot.isValid, true);
  assert.equal(byLot.totalLot, 0.09);
  assert.equal(byLot.risk, 90);
  assert.equal(byLot.sl.price, 3990);
  assert.deepEqual(byLot.legs.map((leg) => leg.lot), [0.03, 0.03, 0.03]);
  assert.equal(byLot.outcomes.FULL_SL.pnlUsd, -90);
  assert.equal(byLot.outcomes.TRAILING_LOCK?.pnlUsd, 48);

  const byRisk = calculateManualTrade('SELL', 4000, 90, {
    ...config, weights: [50, 30, 20],
    sl: { unit: 'EXACT_PRICE', value: 4005 },
    targets: [
      { unit: 'POINTS', value: 300 },
      { unit: 'PRICE_DISTANCE', value: 6 },
      { unit: 'EXACT_PRICE', value: 3990 },
    ],
  });
  assert.equal(byRisk.isValid, true);
  assert.equal(byRisk.totalLot, 0.18);
  assert.equal(byRisk.sl.points, 500);
  assert.deepEqual(byRisk.legs.map((leg) => [leg.price, leg.points, leg.pnlUsd]), [
    [3997, 300, 27], [3994, 600, 32.4], [3990, 1000, 36],
  ]);
  assert.equal(byRisk.outcomes.TP1_ONLY.pnlUsd, -18);
  assert.equal(byRisk.outcomes.TRAILING_LOCK?.pnlUsd, 70.2);
  const trade = buildCalculatorTradeFields(byRisk, 'FULL_SWEEP');
  assert.equal(trade?.pnlUsd, 95.4);
  assert.equal(trade?.totalPts, 1900);
  assert.equal(trade?.calculatorDetails?.totalLot, 0.18);
  assert.deepEqual(trade?.calculatorDetails?.legLots.map((lot) => +lot.toFixed(5)), [0.09, 0.054, 0.036]);
  assert.equal(calculateManualTrade('BUY', 4000, 90, {
    ...config, sl: { unit: 'EXACT_PRICE', value: 4005 },
  }).isValid, false);
  const noLock = calculateManualTrade('BUY', 4000, 90, { ...config, trailingLock: false });
  assert.equal(buildCalculatorTradeFields(noLock, 'TRAILING_LOCK'), null);
});

test('manual EURUSD and NAS100 contracts support one and two targets with normalized splits', () => {
  const config = DEFAULT_MANUAL_CALCULATOR;
  const eur = calculateManualTrade('BUY', 1.105, 50, {
    ...config, instrument: 'EURUSD', legCount: 1,
    sl: { unit: 'EXACT_PRICE', value: 1.1 },
    targets: [{ unit: 'POINTS', value: 300 }, config.targets[1], config.targets[2]],
  });
  assert.equal(eur.isValid, true);
  assert.equal(eur.totalLot, 0.1);
  assert.equal(eur.sl.points, 500);
  assert.equal(eur.legs[0].price, 1.108);
  assert.equal(eur.legs[0].sharePct, 100);
  assert.equal(eur.outcomes.FULL_SWEEP.pnlUsd, 30);
  assert.equal(eur.outcomes.TRAILING_LOCK, null);
  assert.equal(buildCalculatorTradeFields(eur, 'FULL_SWEEP')?.tp2Price, 0);

  const nas = calculateManualTrade('SELL', 23000, 90, {
    ...config, instrument: 'NAS100', legCount: 2, sizing: 'BY_LOT',
    manualLot: 0.1, weights: [50, 30, 20],
    sl: { unit: 'PRICE_DISTANCE', value: 50 },
    targets: [{ unit: 'EXACT_PRICE', value: 22980 }, { unit: 'PRICE_DISTANCE', value: 40 }, config.targets[2]],
  });
  assert.equal(nas.isValid, true);
  assert.equal(nas.risk, 5);
  assert.deepEqual(nas.legs.map((leg) => leg.sharePct), [62.5, 37.5]);
  assert.equal(nas.legs[0].points, 2000);
  assert.equal(nas.outcomes.FULL_SWEEP.pnlUsd, 2.75);
  const custom = calculateManualTrade('BUY', 100, 50, {
    ...config, instrument: 'CUSTOM', legCount: 1,
    customContract: { priceDecimals: 3, pointsPerPrice: 1000, usdPerPriceMove: 20 },
    sl: { unit: 'PRICE_DISTANCE', value: 2.5 },
  });
  assert.equal(custom.totalLot, 1);
  assert.equal(custom.sl.points, 2500);
});

test('calculator and per-port consistency settings survive workspace normalization', () => {
  const legacy = normalizeMergedState({ calcRisk: 90 });
  assert.equal(getActiveCalculator(legacy).risk, 90);
  assert.equal(getActiveCalculator(legacy).legs[0].lot, 0.03);
  const restored = normalizeMergedState(JSON.parse(JSON.stringify({
    ...legacy, calcMode: 'MANUAL',
    manualCalculator: { ...DEFAULT_MANUAL_CALCULATOR, sizing: 'BY_LOT', manualLot: 0.15 },
    consistencyOverrides: { [legacy.activePort]: { consistencyCapPct: 30, minTotalUsd: 0, includeFeeRefund: true } },
  })));
  assert.equal(getActiveCalculator(restored).totalLot, 0.15);
  assert.equal(getActiveConsistencyRule(restored).consistencyCapPct, 30);
  assert.equal(getActiveConsistencyRule(restored).minTotalUsd, 0);
  assert.equal(getActiveConsistencyRule(restored).includeFeeRefund, true);
  assert.equal(getActiveConsistencyRule({ ...restored, activePort: 'other' }).consistencyCapPct, 40);
});

test('signed journal PnL syncs by date and losing records update the matching cycle day', () => {
  const base = computeTradePricesAndMetrics({ dir: 'BUY', entry: 4000, risk: 120, status: 'FULL_SL' });
  const row = { ...base, id: 'T-loss', port: 'port1', date: '2026-11-19', time: '09:30', dir: 'BUY' as const, note: 'Session' };
  const synced = syncCycleDaysWithJournal([], [
    { ...row, pnlUsd: -120.99 },
    { ...row, id: 'T-win', pnlUsd: 30.36 },
    { ...row, id: 'T-other', port: 'port2', pnlUsd: 900 },
  ], 'port1');
  assert.equal(synced[0].profit, -90.63);
  assert.equal(synced[0].date, '2026-11-19');
  const edited = updateCycleDayEntry(synced, 0, { profit: -90.6351 });
  assert.equal(edited[0].profit, -90.64);
  assert.equal(edited[0].date, synced[0].date);
  const recorded = recordCycleDayPnl(edited, '2026-11-19', -9.36);
  assert.equal(recorded[0].profit, -100);
  assert.equal(recorded[2].profit, 0);
  assert.equal(recordCycleDayPnl(recorded, '2026-11-20', -10)[1].profit, -10);
});

test('switching ports preserves each worksheet and initializes a new port with signed journal totals', () => {
  const otherPort = 'funded';
  const loss = computeTradePricesAndMetrics({ dir: 'BUY', entry: 4000, risk: 45, status: 'FULL_SL' });
  const start = normalizeMergedState({
    cycleDays: [{ day: 1, note: 'Edited on port 1', profit: -90.63 }],
    journal: [{ ...loss, id: 'other-port-loss', port: otherPort, date: '2026-11-19', time: '09:30', dir: 'BUY', note: '' }],
  });
  const initial = carryCycleDaysOnPortChange(start, { ...start, activePort: otherPort });
  assert.deepEqual(initial.cycleDays.map((day) => day.profit), [-45, 0, 0]);
  const edited = { ...initial, cycleDays: updateCycleDayEntry(initial.cycleDays, 0, { profit: 35 }) };
  const restored = carryCycleDaysOnPortChange(edited, { ...edited, activePort: start.activePort });
  assert.deepEqual(restored.cycleDays, start.cycleDays);
  assert.equal(restored.cycleDaysByPort?.[otherPort][0].profit, 35);
});

test('losing days reduce net profit and increase best-day share, including when net is non-positive', () => {
  const days = [142.74, 119.13, -90.63, 168.35].map((profit, i) => ({ day: i + 1, note: '', profit }));
  const result = evaluateConsistencyRule(days, false, 35.5, { consistencyCapPct: 40 });
  assert.equal(result.totalProfit, 339.59);
  assert.equal(result.bestDay, 168.35);
  assert.equal(result.bestDayPct.toFixed(1), '49.6');
  assert.equal(result.losingDaysCount, 1);
  assert.equal(result.isPass, false);
  assert.equal(result.extraProfitNeeded, 81.29);
  const zeroNet = evaluateConsistencyRule([{ day: 1, note: '', profit: 50 }, { day: 2, note: '', profit: -50 }], false, 35.5);
  assert.equal(zeroNet.bestDayPct, 100);
  assert.equal(zeroNet.minTotalNeeded, 125);
  assert.equal(zeroNet.extraProfitNeeded, 125);
  assert.equal(zeroNet.netPayoutThb, 0);
  const negativeNet = evaluateConsistencyRule([{ day: 1, note: '', profit: 80 }, { day: 2, note: '', profit: -110 }], false, 35.5);
  assert.equal(negativeNet.totalProfit, -30);
  assert.equal(negativeNet.bestDayPct, 100);
  assert.equal(negativeNet.extraProfitNeeded, 230);
  const loss = evaluateConsistencyRule([{ day: 1, note: '', profit: -90.63 }], true, 35.5, { feeRefundUsd: 15 });
  assert.equal(loss.bestDay, 0);
  assert.equal(loss.bestDayPct, 0);
  assert.equal(loss.share90Usd, 0);
  assert.equal(loss.netPayoutUsd, 15);
  assert.equal(loss.isPass, false);
});

test('consistency overrides apply the cap, minimum days, minimum net profit and payout split', () => {
  const days = [60, 60, 60, 20, 0].map((profit, i) => ({ day: i + 1, note: '', profit }));
  assert.equal(evaluateConsistencyRule(days, false, 35, { consistencyCapPct: 20 }).isPass, false);
  assert.equal(evaluateConsistencyRule(days, false, 35, { consistencyCapPct: 30 }).isPass, true);
  const custom = evaluateConsistencyRule(days, true, 35, {
    consistencyCapPct: 50, minDays: 5, minTotalUsd: 300, profitSplitPct: 75, feeRefundUsd: 20,
  });
  assert.equal(custom.isPass, false);
  assert.equal(custom.tradingDaysCount, 4);
  assert.equal(custom.extraProfitNeeded, 100);
  assert.equal(custom.netPayoutUsd, 170);
  assert.equal(custom.netPayoutThb, 5950);
  assert.equal(evaluateConsistencyRule(days, false, 35, { consistencyCapPct: 50, minDays: 4, minTotalUsd: 0 }).isPass, true);
});

test('getCalcMetrics computes 3-TP ladder and risk rewards accurately for BUY and SELL', () => {
  const buyMetrics = getCalcMetrics('BUY', 4042.59, 120);
  assert.equal(buyMetrics.lotLeg, '0.04');
  assert.equal(buyMetrics.slPrice, '4032.59');
  assert.equal(buyMetrics.tp1Price, '4046.59');
  assert.equal(buyMetrics.tp2Price, '4050.59');
  assert.equal(buyMetrics.tp3Price, '4054.59');
  assert.equal(buyMetrics.fullSweepUsd, 96);
  assert.equal(buyMetrics.tlHitUsd, 64);
  assert.equal(buyMetrics.tp1OnlyUsd, -64);
  assert.equal(buyMetrics.fullSlUsd, -120);

  const sellMetrics = getCalcMetrics('SELL', 4000.0, 90);
  assert.equal(sellMetrics.lotLeg, '0.03');
  assert.equal(sellMetrics.slPrice, '4010.00');
  assert.equal(sellMetrics.tp1Price, '3996.00');
  assert.equal(sellMetrics.tp2Price, '3992.00');
  assert.equal(sellMetrics.tp3Price, '3988.00');
  assert.equal(sellMetrics.fullSweepUsd, 72);
  assert.equal(sellMetrics.tlHitUsd, 48);
});

test('computeTradePricesAndMetrics returns correct points and PnL for all outcomes', () => {
  const full = computeTradePricesAndMetrics({ dir: 'BUY', entry: 4050, risk: 120, status: 'FULL_SWEEP' });
  assert.equal(full.totalPts, 2400);
  assert.equal(full.rr, 0.8);
  assert.equal(full.pnlUsd, 96);

  const tl = computeTradePricesAndMetrics({ dir: 'SELL', entry: 4050, risk: 120, status: 'TRAILING_LOCK' });
  assert.equal(tl.totalPts, 1600);
  assert.equal(tl.pnlUsd, 64);

  const sl = computeTradePricesAndMetrics({ dir: 'BUY', entry: 4050, risk: 120, status: 'FULL_SL' });
  assert.equal(sl.totalPts, -3000);
  assert.equal(sl.rr, -1);
  assert.equal(sl.pnlUsd, -120);
});

test('evaluateConsistencyRule validates 40% best-day cap and payout calculations', () => {
  const passCycle = evaluateConsistencyRule(
    [
      { day: 1, note: 'D1', profit: 120 },
      { day: 2, note: 'D2', profit: 120 },
      { day: 3, note: 'D3', profit: 120 },
    ],
    true,
    35.5
  );
  assert.equal(passCycle.totalProfit, 360);
  assert.equal(passCycle.isPass, true);
  assert.equal(passCycle.netPayoutUsd, 383); // 324 + 59 refund

  const failCycle = evaluateConsistencyRule(
    [
      { day: 1, note: 'D1', profit: 200 },
      { day: 2, note: 'D2', profit: 100 },
      { day: 3, note: 'D3', profit: 100 },
    ],
    false,
    35.5
  );
  assert.equal(failCycle.bestDayPct, 50);
  assert.equal(failCycle.isPass, false);
  assert.equal(failCycle.extraProfitNeeded, 100); // needs 500 total so 200 is 40%
});

test('getAccountComputed aggregates portfolio balance, unique trading days, and status badge', () => {
  const sampleJournal = [
    {
      ...computeTradePricesAndMetrics({ dir: 'BUY', entry: 4040, risk: 120, status: 'FULL_SWEEP' }),
      id: 'T-1',
      port: 'port1',
      date: '2026-11-09',
      time: '10:00',
      dir: 'BUY' as const,
      note: 'Win 1',
    },
    {
      ...computeTradePricesAndMetrics({ dir: 'SELL', entry: 4050, risk: 120, status: 'TRAILING_LOCK' }),
      id: 'T-2',
      port: 'port1',
      date: '2026-11-10',
      time: '14:30',
      dir: 'SELL' as const,
      note: 'Win 2',
    },
  ];
  const comp = getAccountComputed(DEFAULT_ACCOUNTS, sampleJournal, 'port1');
  assert.equal(comp.profit, 160);
  assert.equal(comp.balance, 6160);
  assert.equal(comp.currentDays, 2);
  assert.equal(comp.rem, 320);
});

test('resolveRealtimeStateConflict merges offline and online journal entries without data loss', () => {
  const localState = {
    ...DEFAULT_STATE,
    lastSavedAt: '2026-11-10T10:05:00.000Z',
    journal: [
      {
        ...computeTradePricesAndMetrics({ dir: 'BUY', entry: 4042, risk: 120, status: 'FULL_SWEEP' }),
        id: 'OFFLINE-1',
        port: 'port1',
        date: '2026-11-10',
        time: '10:05',
        dir: 'BUY' as const,
        note: 'Offline trade',
      },
    ],
  };

  const remoteState = {
    ...DEFAULT_STATE,
    lastSavedAt: '2026-11-10T10:02:00.000Z',
    journal: [
      {
        ...computeTradePricesAndMetrics({ dir: 'SELL', entry: 4060, risk: 120, status: 'TRAILING_LOCK' }),
        id: 'CLOUD-1',
        port: 'port1',
        date: '2026-11-10',
        time: '10:02',
        dir: 'SELL' as const,
        note: 'Cloud trade',
      },
    ],
  };

  const merged = resolveRealtimeStateConflict(localState, remoteState);
  assert.equal(merged.winner, 'MERGED');
  assert.equal(merged.state.journal.length, 2);
});

test('convertMt5PositionsToJournalRows clusters 3-leg GHR ideas accurately', () => {
  const baseTs = new Date('2026-11-10T09:00:00Z').getTime();
  const positions = [
    {
      ticket: '101',
      symbol: 'XAUUSD',
      dir: 'BUY' as const,
      openDate: '2026-11-10',
      openTime: '09:00',
      openTs: baseTs,
      closeDate: '2026-11-10',
      closeTime: '09:30',
      closeTs: baseTs + 1800000,
      volume: 0.04,
      openPrice: 4040,
      slPrice: 4030,
      tpPrice: 4044,
      closePrice: 4044,
      commission: -0.28,
      swap: 0,
      rawProfit: 16,
      netProfit: 15.72,
      comment: 'TP1',
    },
    {
      ticket: '102',
      symbol: 'XAUUSD',
      dir: 'BUY' as const,
      openDate: '2026-11-10',
      openTime: '09:00',
      openTs: baseTs + 2000,
      closeDate: '2026-11-10',
      closeTime: '09:45',
      closeTs: baseTs + 2700000,
      volume: 0.04,
      openPrice: 4040,
      slPrice: 4030,
      tpPrice: 4048,
      closePrice: 4048,
      commission: -0.28,
      swap: 0,
      rawProfit: 32,
      netProfit: 31.72,
      comment: 'TP2',
    },
    {
      ticket: '103',
      symbol: 'XAUUSD',
      dir: 'BUY' as const,
      openDate: '2026-11-10',
      openTime: '09:00',
      openTs: baseTs + 4000,
      closeDate: '2026-11-10',
      closeTime: '10:10',
      closeTs: baseTs + 4200000,
      volume: 0.04,
      openPrice: 4040,
      slPrice: 4030,
      tpPrice: 4052,
      closePrice: 4052,
      commission: -0.28,
      swap: 0,
      rawProfit: 48,
      netProfit: 47.72,
      comment: 'TP3',
    },
  ];

  const rows = convertMt5PositionsToJournalRows(
    { holderName: 'Trader', login: '14370024', broker: 'FTMO', currency: 'USD', initialDeposit: 6000, summaryNetProfit: 95.16 },
    positions,
    'port1',
    'IDEA',
    true
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'FULL_SWEEP');
  assert.equal(rows[0].totalPts, 2400);
  assert.equal(rows[0].pnlUsd, 95.16);
});

test('buildCumulativePnlSeries builds chronological cumulative PnL, equity, drawdown, and gradient offset', () => {
  // Journal is stored newest-first; buildCumulativePnlSeries reverses to chronological order
  const sampleJournal = [
    {
      ...computeTradePricesAndMetrics({ dir: 'BUY', entry: 4050, risk: 120, status: 'TRAILING_LOCK' }),
      id: 'T-3',
      port: 'port1',
      date: '2026-11-11',
      time: '15:00',
      dir: 'BUY' as const,
      note: 'Trade 3 (+64)',
    },
    {
      ...computeTradePricesAndMetrics({ dir: 'SELL', entry: 4048, risk: 120, status: 'FULL_SL' }),
      id: 'T-2',
      port: 'port1',
      date: '2026-11-10',
      time: '12:00',
      dir: 'SELL' as const,
      note: 'Trade 2 (-120)',
    },
    {
      ...computeTradePricesAndMetrics({ dir: 'BUY', entry: 4040, risk: 120, status: 'FULL_SWEEP' }),
      id: 'T-1',
      port: 'port1',
      date: '2026-11-09',
      time: '09:30',
      dir: 'BUY' as const,
      note: 'Trade 1 (+96)',
    },
  ];

  const series = buildCumulativePnlSeries(DEFAULT_ACCOUNTS, sampleJournal, 'port1');
  assert.equal(series.points.length, 4); // #0 start + 3 trades
  assert.equal(series.points[0].cumulativePnl, 0);
  assert.equal(series.points[1].cumulativePnl, 96); // Trade 1
  assert.equal(series.points[2].cumulativePnl, -24); // Trade 2 (96 - 120)
  assert.equal(series.points[2].drawdownUsd, -120);
  assert.equal(series.points[3].cumulativePnl, 40); // Trade 3 (-24 + 64)
  assert.equal(series.currentCumulativePnl, 40);
  assert.equal(series.currentEquity, 6040);
  assert.equal(series.peakPnl, 96);
  assert.equal(series.maxDrawdownUsd, -120);
  assert.equal(series.gradientSplitOffset, 0.8); // 96 / (96 - (-24)) = 96 / 120 = 0.8
});

test('updateCycleDayEntry and syncCycleDaysWithJournal persist Daily Notes alongside daily profit data', () => {
  const initialDays = [
    { day: 1, note: 'วันที่ 1', profit: 0 },
    { day: 2, note: 'วันที่ 2', profit: 0 },
    { day: 3, note: 'วันที่ 3', profit: 0 },
  ];

  // Update note and profit on Day 1 and Day 2
  const step1 = updateCycleDayEntry(initialDays, 0, {
    note: 'เทรดตามระบบ H1 HVN วินัยครบ',
    profit: 120,
  });
  const step2 = updateCycleDayEntry(step1, 1, {
    note: 'รอ M5 ย่อแล้วเข้า Buy Limit',
    profit: 96,
  });

  assert.equal(step2[0].note, 'เทรดตามระบบ H1 HVN วินัยครบ');
  assert.equal(step2[0].profit, 120);
  assert.equal(step2[1].note, 'รอ M5 ย่อแล้วเข้า Buy Limit');
  assert.equal(step2[1].profit, 96);

  // Syncing from journal preserves custom Daily Notes while updating daily profit
  const sampleJournal = [
    {
      ...computeTradePricesAndMetrics({ dir: 'BUY', entry: 4040, risk: 120, status: 'FULL_SWEEP' }),
      id: 'T-10',
      port: 'port1',
      date: '2026-11-10',
      time: '09:30',
      dir: 'BUY' as const,
      note: 'Break H1',
    },
  ];

  const synced = syncCycleDaysWithJournal(step2, sampleJournal, 'port1');
  assert.equal(synced.length, 3);
  assert.equal(synced[0].profit, 96);
  assert.equal(synced[0].note, 'เทรดตามระบบ H1 HVN วินัยครบ'); // Custom note preserved
  assert.equal(synced[1].note, 'รอ M5 ย่อแล้วเข้า Buy Limit'); // Custom note preserved on day 2
});

test('buildTradingCoachContext and generateLocalTacticalPlan summarize live portfolio and 3-TP setup', () => {
  const ctx = buildTradingCoachContext(DEFAULT_STATE);
  assert.ok(ctx.includes('พอร์ตหลัก · Prop $6K'));
  assert.ok(ctx.includes('BUY LIMIT @ 4042.59'));
  assert.ok(ctx.includes('SL 4032.59'));

  const plan = generateLocalTacticalPlan(DEFAULT_STATE);
  assert.ok(plan.includes('แผนปฏิบัติการเทรด GHR v3.2'));
  assert.ok(plan.includes('0.04 Lot × 3 ไม้'));
  assert.ok(plan.includes('4032.59'));
});

test('evaluateTwelveGates enforces fail-closed protocol across all 12 gates and starts at 0/12', () => {
  const initialEval = evaluateTwelveGates(DEFAULT_TWELVE_GATES);
  assert.equal(initialEval.passedCount, 0);
  assert.equal(initialEval.isAllPassed, false);
  assert.equal(initialEval.blockingCodes.length, 12);
  assert.equal(Object.values(DEFAULT_STATE.quickGates).every((v) => v === false), true);

  const fullPass = evaluateTwelveGates(ALL_TWELVE_GATES_PASSED);
  assert.equal(fullPass.passedCount, 12);
  assert.equal(fullPass.isAllPassed, true);
  assert.equal(fullPass.blockingCodes.length, 0);

  const partial = evaluateTwelveGates({
    ...ALL_TWELVE_GATES_PASSED,
    g02: false,
    g11: false,
  });
  assert.equal(partial.passedCount, 10);
  assert.equal(partial.isAllPassed, false);
  assert.deepEqual(partial.blockingCodes, ['02', '11']);
});

test('calculateFourLegLadderMetrics and calculateMultiStateExpectancy match Desk Card 01 & 02 math', () => {
  // $200 risk on $10k Standard -> 0.20 Total Lot (4 x 0.05 Lot)
  const fourLeg = calculateFourLegLadderMetrics('BUY', 4040.0, 200);
  assert.equal(fourLeg.totalLot, 0.2);
  assert.equal(fourLeg.legLot, 0.05);
  assert.equal(fourLeg.slPrice, '4030.00');
  assert.equal(fourLeg.tp1Price, '4043.00');
  assert.equal(fourLeg.tp2Price, '4046.00');
  assert.equal(fourLeg.tp3Price, '4049.00');
  assert.equal(fourLeg.tp4Price, '4052.00');

  // Verify all 5 canonical states from Desk Card 02
  assert.equal(fourLeg.states[0].rMultiple, -1.0);
  assert.equal(fourLeg.states[0].netUsd, -200);
  assert.equal(fourLeg.states[1].rMultiple, -0.675);
  assert.equal(fourLeg.states[1].netUsd, -135);
  assert.equal(fourLeg.states[2].rMultiple, -0.275);
  assert.equal(fourLeg.states[2].netUsd, -55);
  assert.equal(fourLeg.states[3].rMultiple, 0.2);
  assert.equal(fourLeg.states[3].netUsd, 40);
  assert.equal(fourLeg.states[4].rMultiple, 0.75);
  assert.equal(fourLeg.states[4].netUsd, 150);

  // Expectancy formula: E_net[R] = p0(-1.00) + p1(-0.675) + p2(-0.275) + p3(0.20) + p4(0.75) - c_cost
  const exp = calculateMultiStateExpectancy(
    {
      p0: 20,
      p1: 10,
      p2: 10,
      p3: 20,
      p4: 40,
      spreadCostR: 0.02,
    },
    200
  );
  // Gross = 0.2*(-1) + 0.1*(-0.675) + 0.1*(-0.275) + 0.2*(0.2) + 0.4*(0.75)
  //       = -0.2 - 0.0675 - 0.0275 + 0.04 + 0.30 = +0.045R
  // Net   = 0.045 - 0.02 = +0.025R -> $5.00 per $200 Idea
  assert.equal(exp.grossExpectancyR, 0.045);
  assert.equal(exp.netExpectancyR, 0.025);
  assert.equal(exp.expectedUsdPerIdea, 5);
  assert.equal(exp.positiveLockProbPct, 60);
});

test('calculateGhrV32LadderMetrics and calculateGhrV32Expectancy match GHR v3.2 3-TP Trailing Lock math', () => {
  // $120 risk on $6k Evaluation -> 0.12 Total Lot (3 x 0.04 Lot)
  const v32 = calculateGhrV32LadderMetrics('BUY', 4042.59, 120);
  assert.equal(v32.legLot, 0.04);
  assert.equal(v32.totalLot, 0.12);
  assert.equal(v32.slPrice, '4032.59');
  assert.equal(v32.tp1Price, '4046.59');
  assert.equal(v32.tp2Price, '4050.59');
  assert.equal(v32.tp3Price, '4054.59');

  // Verify all 5 GHR v3.2 states (-1.00R, -0.533R, 0.00R, +0.533R, +0.80R)
  assert.equal(v32.states[0].legPts, -3000);
  assert.equal(v32.states[0].netUsd, -120);
  assert.equal(v32.states[1].legPts, -1600);
  assert.equal(v32.states[1].netUsd, -64);
  assert.equal(v32.states[2].legPts, 0);
  assert.equal(v32.states[2].netUsd, 0);
  assert.equal(v32.states[3].legPts, 1600);
  assert.equal(v32.states[3].netUsd, 64);
  assert.equal(v32.states[4].legPts, 2400);
  assert.equal(v32.states[4].netUsd, 96);

  const expV32 = calculateGhrV32Expectancy(
    {
      p0: 15,
      p1: 15,
      p2: 0,
      p3: 30,
      p4: 40,
      spreadCostR: 0.02,
    },
    120
  );
  // Gross = 0.15*(-1.0) + 0.15*(-1600/3000) + 0 + 0.30*(1600/3000) + 0.40*(0.80)
  //       = -0.15 - 0.08 + 0.16 + 0.32 = +0.25R
  // Net   = 0.25 - 0.02 = +0.23R -> $27.60 per $120 Idea
  assert.equal(expV32.grossExpectancyR, 0.25);
  assert.equal(expV32.netExpectancyR, 0.23);
  assert.equal(expV32.expectedUsdPerIdea, 27.6);
  assert.equal(expV32.positiveLockProbPct, 70);
});

test('buildSevenDayConsistencyCalendar colors 7 trailing days by 40% rule compliance and positive PnL', () => {
  // Empty trades produce 7 trailing NO_TRADE cells ending on referenceDateStr
  const emptyCal = buildSevenDayConsistencyCalendar([], '2026-11-12');
  assert.equal(emptyCal.days.length, 7);
  assert.equal(emptyCal.days[0].date, '2026-11-06');
  assert.equal(emptyCal.days[6].date, '2026-11-12');
  assert.equal(emptyCal.activeDays, 0);
  assert.ok(emptyCal.days.every((d) => d.status === 'NO_TRADE'));

  // Mixed trading days:
  // - 2026-11-08: +$192 (2x FULL_SWEEP @ $96) -> 192 / 384 = 50% (> 40% cap) => POSITIVE_OVER_40
  // - 2026-11-09: +$96 (FULL_SWEEP) -> 96 / 384 = 25% (<= 40% cap) => MET_40
  // - 2026-11-10: -$120 (FULL_SL) => NEGATIVE
  // - 2026-11-11: +$96 (FULL_SWEEP) -> 96 / 384 = 25% (<= 40% cap) => MET_40
  // - 2026-11-12: +$120 (older day 2026-11-01 +$0; let's keep total exact at $384? Wait: 192 + 96 - 120 + 96 + 120 = 384!)
  const trades = [
    {
      ...computeTradePricesAndMetrics({ dir: 'BUY', entry: 4040, risk: 120, status: 'FULL_SWEEP' }),
      id: 'C-1',
      port: 'port1',
      date: '2026-11-08',
      time: '09:00',
      dir: 'BUY' as const,
      note: 'W1',
    },
    {
      ...computeTradePricesAndMetrics({ dir: 'BUY', entry: 4040, risk: 120, status: 'FULL_SWEEP' }),
      id: 'C-2',
      port: 'port1',
      date: '2026-11-08',
      time: '11:00',
      dir: 'BUY' as const,
      note: 'W2',
    },
    {
      ...computeTradePricesAndMetrics({ dir: 'BUY', entry: 4040, risk: 120, status: 'FULL_SWEEP' }),
      id: 'C-3',
      port: 'port1',
      date: '2026-11-09',
      time: '10:00',
      dir: 'BUY' as const,
      note: 'W3',
    },
    {
      ...computeTradePricesAndMetrics({ dir: 'SELL', entry: 4050, risk: 120, status: 'FULL_SL' }),
      id: 'C-4',
      port: 'port1',
      date: '2026-11-10',
      time: '14:00',
      dir: 'SELL' as const,
      note: 'L1',
    },
    {
      ...computeTradePricesAndMetrics({ dir: 'BUY', entry: 4045, risk: 120, status: 'FULL_SWEEP' }),
      id: 'C-5',
      port: 'port1',
      date: '2026-11-11',
      time: '16:00',
      dir: 'BUY' as const,
      note: 'W4',
    },
    {
      ...computeTradePricesAndMetrics({ dir: 'BUY', entry: 4050, risk: 150, status: 'FULL_SWEEP' }),
      id: 'C-6',
      port: 'port1',
      date: '2026-11-12',
      time: '10:30',
      dir: 'BUY' as const,
      note: 'W5',
    },
  ];

  const cal = buildSevenDayConsistencyCalendar(trades, '2026-11-12');
  assert.equal(cal.totalProfitBasis, 384);
  assert.equal(cal.activeDays, 5);
  assert.equal(cal.positiveCount, 4);
  assert.equal(cal.metCount, 3);
  assert.equal(cal.over40Count, 1);

  const byDate = Object.fromEntries(cal.days.map((d) => [d.date, d]));
  assert.equal(byDate['2026-11-06'].status, 'NO_TRADE');
  assert.equal(byDate['2026-11-08'].status, 'POSITIVE_OVER_40');
  assert.equal(byDate['2026-11-08'].sharePct, 50);
  assert.equal(byDate['2026-11-09'].status, 'MET_40');
  assert.equal(byDate['2026-11-09'].sharePct, 25);
  assert.equal(byDate['2026-11-10'].status, 'NEGATIVE');
  assert.equal(byDate['2026-11-11'].status, 'MET_40');
  assert.equal(byDate['2026-11-12'].status, 'MET_40');
  assert.equal(byDate['2026-11-12'].sharePct, 31.3);
});

test('getTradeSession classifies Asia, London, and NY trading hours accurately', () => {
  assert.equal(getTradeSession('08:30'), 'ASIA');
  assert.equal(getTradeSession('13:59'), 'ASIA');
  assert.equal(getTradeSession('14:00'), 'LONDON');
  assert.equal(getTradeSession('19:30'), 'LONDON');
  assert.equal(getTradeSession('20:00'), 'NY');
  assert.equal(getTradeSession('02:28'), 'NY');
});

test('syncQuickGateToTwelveGates and syncQuickFromTwelveGates stay synchronized', () => {
  const step1 = syncQuickGateToTwelveGates(
    { g1: true, g2: true, g3: true, g4: true, g5: true },
    ALL_TWELVE_GATES_PASSED,
    'g1',
    false
  );
  assert.equal(step1.quickGates.g1, false);
  assert.equal(step1.twelveGates.g06, false);

  const step2 = syncQuickGateToTwelveGates(
    step1.quickGates,
    step1.twelveGates,
    'g4',
    false
  );
  assert.equal(step2.twelveGates.g12, false);

  const backSync = syncQuickFromTwelveGates({ ...ALL_TWELVE_GATES_PASSED, g07: false, g12: false });
  assert.equal(backSync.g2, false);
  assert.equal(backSync.g4, false);
  assert.equal(backSync.g5, false);
  assert.equal(backSync.g1, true);
});

test('filterJournalTrades filters by date range, session, status, and search cleanly', () => {
  const trades = [
    {
      ...computeTradePricesAndMetrics({ dir: 'BUY', entry: 4040, risk: 120, status: 'FULL_SWEEP' }),
      id: 'F-1',
      port: 'port1',
      date: '2026-11-12',
      time: '09:15',
      dir: 'BUY' as const,
      note: 'Asia breakout',
    },
    {
      ...computeTradePricesAndMetrics({ dir: 'SELL', entry: 4050, risk: 120, status: 'TRAILING_LOCK' }),
      id: 'F-2',
      port: 'port1',
      date: '2026-11-08',
      time: '15:30',
      dir: 'SELL' as const,
      note: 'London retest',
    },
    {
      ...computeTradePricesAndMetrics({ dir: 'BUY', entry: 4035, risk: 120, status: 'FULL_SL' }),
      id: 'F-3',
      port: 'port1',
      date: '2026-10-01',
      time: '21:10',
      dir: 'BUY' as const,
      note: 'NY stop',
    },
  ];

  assert.equal(
    filterJournalTrades(trades, { portFilter: 'port1', dateFilter: 'TODAY', todayIso: '2026-11-12' }).length,
    1
  );
  assert.equal(
    filterJournalTrades(trades, { portFilter: 'port1', dateFilter: '7D', todayIso: '2026-11-12' }).length,
    2
  );
  assert.equal(
    filterJournalTrades(trades, { portFilter: 'port1', sessionFilter: 'LONDON', todayIso: '2026-11-12' })[0].id,
    'F-2'
  );
  assert.equal(
    filterJournalTrades(trades, { portFilter: 'port1', statusFilter: 'LOSS', todayIso: '2026-11-12' })[0].id,
    'F-3'
  );
});

test('evaluateTradeGuardrails flags cooldown, daily cap, and incomplete 12-Gate protocol', () => {
  const ok = evaluateTradeGuardrails({
    cooldownUntil: null,
    nowMs: 100000,
    todayTradesCount: 1,
    twelveGates: ALL_TWELVE_GATES_PASSED,
  });
  assert.equal(ok.warnings.length, 0);
  assert.equal(ok.allGatesPassed, true);

  const warned = evaluateTradeGuardrails({
    cooldownUntil: 100000 + 8 * 60000,
    nowMs: 100000,
    todayTradesCount: 3,
    twelveGates: { ...ALL_TWELVE_GATES_PASSED, g03: false },
  });
  assert.equal(warned.isCooldownActive, true);
  assert.equal(warned.cooldownRemainingMin, 8);
  assert.equal(warned.isDailyCapReached, true);
  assert.equal(warned.gatesPassed, 11);
  assert.equal(warned.warnings.length, 3);
});

test('getBangkokIsoDate and getBangkokTimeHHMM shift UTC midnight cleanly to ICT UTC+7', () => {
  const lateNightNyInUtc = new Date('2026-11-12T18:30:00.000Z');
  assert.equal(getBangkokIsoDate(lateNightNyInUtc), '2026-11-13');
  assert.equal(getBangkokTimeHHMM(lateNightNyInUtc), '01:30');
});

test('evaluateConsistencyRule supports custom 30% prop caps and 100% unlimited personal accounts', () => {
  const strict30Fail = evaluateConsistencyRule(
    [
      { day: 1, note: 'D1', profit: 350 },
      { day: 2, note: 'D2', profit: 350 },
      { day: 3, note: 'D3', profit: 300 },
    ],
    true,
    35.5,
    { consistencyCapPct: 30, feeRefundUsd: 169, profitSplitPct: 80, minDays: 3 }
  );
  assert.equal(strict30Fail.hasConsistencyCap, true);
  assert.equal(strict30Fail.capPct, 30);
  assert.equal(strict30Fail.isPass, false);
  assert.equal(strict30Fail.netPayoutUsd, 969); // 1000*0.80 + 169

  const personalUnlimited = evaluateConsistencyRule(
    [{ day: 1, note: 'All-in', profit: 500 }],
    true,
    35.5,
    { consistencyCapPct: 100, feeRefundUsd: 0, profitSplitPct: 100, minDays: 1 }
  );
  assert.equal(personalUnlimited.hasConsistencyCap, false);
  assert.equal(personalUnlimited.isPass, true);
  assert.equal(personalUnlimited.netPayoutUsd, 500);
});

test('createCleanWorkspaceState produces clean starter desk while preserving branding overrides', () => {
  const clean = createCleanWorkspaceState({ deskBrandName: 'Apex Gold Desk', thbRate: 36 });
  assert.equal(clean.journal.length, 0);
  assert.equal(clean.deskBrandName, 'Apex Gold Desk');
  assert.equal(clean.thbRate, 36);
  assert.equal(evaluateTwelveGates(clean.twelveGates).passedCount, 0);
});

test('customer portal URL builder & parser normalize dev origins and deep-link license keys', () => {
  assert.equal(
    getDefaultCustomerPortalOrigin('https://ais-dev-demo-123.asia-east1.run.app'),
    'https://ais-pre-demo-123.asia-east1.run.app'
  );
  assert.equal(
    getDefaultCustomerPortalOrigin('http://localhost:3000'),
    SHARED_CUSTOMER_PORTAL_URL
  );
  assert.equal(
    buildCustomerInviteUrl('https://desk.example.com/', ' ghr-pro-ab12-cd34 '),
    'https://desk.example.com/?key=GHR-PRO-AB12-CD34'
  );
  assert.equal(
    buildCustomerInviteUrl('https://desk.example.com/'),
    'https://desk.example.com/?portal=login'
  );
  assert.deepEqual(parseCustomerPortalParams('?key=ghr-pro-9999-aaaa'), {
    inviteKey: 'GHR-PRO-9999-AAAA',
    openPortal: true,
  });
  assert.deepEqual(parseCustomerPortalParams('?portal=login'), {
    inviteKey: '',
    openPortal: true,
  });
  assert.deepEqual(parseCustomerPortalParams('?autostart=1'), {
    inviteKey: '',
    openPortal: false,
  });
});

test('storage scope and keys strictly isolate Guest, Admin UID, and Customer Trial UID', () => {
  assert.equal(getStorageScopeId(null), 'guest');
  assert.equal(getStorageScopeId(''), 'guest');
  assert.equal(getStorageScopeId('uid_admin_001'), 'uid_admin_001');

  const guestLs = getLocalStorageKey(null);
  const adminLs = getLocalStorageKey('uid_admin_001');
  const trialLs = getLocalStorageKey('uid_trial_002');
  assert.notEqual(guestLs, adminLs);
  assert.notEqual(adminLs, trialLs);
  assert.notEqual(guestLs, trialLs);

  const guestIdb = getIndexedDbWorkspaceKey(null);
  const adminIdb = getIndexedDbWorkspaceKey('uid_admin_001');
  const trialIdb = getIndexedDbWorkspaceKey('uid_trial_002');
  assert.notEqual(guestIdb, adminIdb);
  assert.notEqual(adminIdb, trialIdb);
});

test('shiftMonthKey and getDefaultCalendarMonthKey handle year rollovers and fallback to latest trade month', () => {
  assert.equal(shiftMonthKey('2026-01', -1), '2025-12');
  assert.equal(shiftMonthKey('2026-12', 1), '2027-01');
  assert.equal(shiftMonthKey('2026-11', -2), '2026-09');

  assert.equal(getDefaultCalendarMonthKey([], '2026-11-12'), '2026-11');

  const octoberOnlyTrades = [
    {
      ...computeTradePricesAndMetrics({ dir: 'BUY', entry: 4040, risk: 120, status: 'FULL_SWEEP' }),
      id: 'M-OLD-1',
      port: 'port1',
      date: '2026-10-18',
      time: '10:00',
      dir: 'BUY' as const,
      note: 'Oct trade',
    },
  ];
  assert.equal(getDefaultCalendarMonthKey(octoberOnlyTrades, '2026-11-12'), '2026-10');
});

test('buildMonthlyConsistencyCalendar highlights winning, over-cap, losing, and break-even days with streaks', () => {
  const emptyNov = buildMonthlyConsistencyCalendar([], {
    monthKey: '2026-11',
    referenceDateStr: '2026-11-12',
  });
  assert.equal(emptyNov.monthLabel, 'Nov 2026');
  assert.equal(emptyNov.cells.length, 35); // Nov 1 2026 = Sunday, Nov 30 = Monday -> 5 rows = 35 cells
  assert.equal(emptyNov.activeDays, 0);
  assert.equal(emptyNov.winningDays, 0);
  assert.equal(emptyNov.losingDays, 0);
  assert.equal(emptyNov.cells.find((c) => c.date === '2026-11-12')?.isToday, true);

  // Aug 2026 starts Saturday (Aug 1 = Sat) and has 31 days -> 6 rows = 42 cells
  const augCal = buildMonthlyConsistencyCalendar([], { monthKey: '2026-08' });
  assert.equal(augCal.cells.length, 42);
  assert.equal(augCal.cells[0].isCurrentMonth, false);
  assert.equal(augCal.cells[6].date, '2026-08-01');
  assert.equal(augCal.cells[6].isCurrentMonth, true);

  const novTrades = [
    // Nov 02: +$96 (25% of $384 -> MET_40)
    {
      ...computeTradePricesAndMetrics({ dir: 'BUY', entry: 4040, risk: 120, status: 'FULL_SWEEP' }),
      id: 'MC-1',
      port: 'port1',
      date: '2026-11-02',
      time: '09:00',
      dir: 'BUY' as const,
      note: 'W1',
    },
    // Nov 03: +$96 (25% -> MET_40, Win streak = 2)
    {
      ...computeTradePricesAndMetrics({ dir: 'BUY', entry: 4042, risk: 120, status: 'FULL_SWEEP' }),
      id: 'MC-2',
      port: 'port1',
      date: '2026-11-03',
      time: '10:30',
      dir: 'BUY' as const,
      note: 'W2',
    },
    // Nov 05: -$120 (NEGATIVE, Loss streak = 1)
    {
      ...computeTradePricesAndMetrics({ dir: 'SELL', entry: 4050, risk: 120, status: 'FULL_SL' }),
      id: 'MC-3',
      port: 'port1',
      date: '2026-11-05',
      time: '14:00',
      dir: 'SELL' as const,
      note: 'L1',
    },
    // Nov 06: $0 (BREAK_EVEN)
    {
      ...computeTradePricesAndMetrics({ dir: 'BUY', entry: 4045, risk: 120, status: 'BREAK_EVEN' }),
      id: 'MC-4',
      port: 'port1',
      date: '2026-11-06',
      time: '15:00',
      dir: 'BUY' as const,
      note: 'BE1',
    },
    // Nov 10: +$192 + $120 = +$312? Let's make Nov 10 = 2x FULL_SWEEP (+$192) and Nov 12 = +$120 -> Net = 96+96-120+0+192+120 = 384
    {
      ...computeTradePricesAndMetrics({ dir: 'BUY', entry: 4040, risk: 120, status: 'FULL_SWEEP' }),
      id: 'MC-5',
      port: 'port1',
      date: '2026-11-10',
      time: '09:15',
      dir: 'BUY' as const,
      note: 'W3a',
    },
    {
      ...computeTradePricesAndMetrics({ dir: 'BUY', entry: 4044, risk: 120, status: 'FULL_SWEEP' }),
      id: 'MC-6',
      port: 'port1',
      date: '2026-11-10',
      time: '11:20',
      dir: 'BUY' as const,
      note: 'W3b',
    },
    {
      ...computeTradePricesAndMetrics({ dir: 'BUY', entry: 4050, risk: 150, status: 'FULL_SWEEP' }),
      id: 'MC-7',
      port: 'port1',
      date: '2026-11-12',
      time: '16:00',
      dir: 'BUY' as const,
      note: 'W4',
    },
  ];

  const propSummary = buildMonthlyConsistencyCalendar(novTrades, {
    monthKey: '2026-11',
    referenceDateStr: '2026-11-12',
    consistencyCapPct: 40,
  });

  assert.equal(propSummary.monthlyNetPnl, 384);
  assert.equal(propSummary.activeDays, 6);
  assert.equal(propSummary.winningDays, 4);
  assert.equal(propSummary.losingDays, 1);
  assert.equal(propSummary.breakEvenDays, 1);
  assert.equal(propSummary.metCapCount, 3);
  assert.equal(propSummary.overCapCount, 1);
  assert.equal(propSummary.dayWinRatePct, 66.7);
  assert.equal(propSummary.longestWinStreak, 2);
  assert.equal(propSummary.longestLossStreak, 1);
  assert.equal(propSummary.bestDayDate, '2026-11-10');
  assert.equal(propSummary.bestDayPnl, 192);
  assert.equal(propSummary.worstDayDate, '2026-11-05');
  assert.equal(propSummary.worstDayPnl, -120);

  const cellMap = Object.fromEntries(propSummary.cells.map((c) => [c.date, c]));
  assert.equal(cellMap['2026-11-02'].status, 'MET_40');
  assert.equal(cellMap['2026-11-05'].status, 'NEGATIVE');
  assert.equal(cellMap['2026-11-06'].status, 'BREAK_EVEN');
  assert.equal(cellMap['2026-11-10'].status, 'POSITIVE_OVER_40');
  assert.equal(cellMap['2026-11-10'].tradeCount, 2);
  assert.equal(cellMap['2026-11-10'].winCount, 2);

  // Personal 100% accounts should treat all winning days as MET_40 (no over-cap warning)
  const personalSummary = buildMonthlyConsistencyCalendar(novTrades, {
    monthKey: '2026-11',
    referenceDateStr: '2026-11-12',
    consistencyCapPct: 100,
  });
  assert.equal(personalSummary.hasConsistencyCap, false);
  assert.equal(personalSummary.overCapCount, 0);
  assert.equal(personalSummary.metCapCount, 4);
  assert.equal(personalSummary.cells.find((c) => c.date === '2026-11-10')?.status, 'MET_40');
});

test('resolveAccountType and getAccountComputed support Personal Live accounts with ROI badges', () => {
  const personalPreset = PORTFOLIO_PRESETS.find((p) => p.id === 'personal');
  assert.ok(personalPreset);
  assert.equal(personalPreset.accountType, 'PERSONAL');
  assert.equal(personalPreset.consistencyCapPct, 100);
  assert.equal(personalPreset.profitSplitPct, 100);

  const personalAccounts = {
    pers1: {
      id: 'pers1',
      login: '88012345',
      name: 'Personal Exness $3K',
      accountType: 'PERSONAL' as const,
      brokerName: 'Exness',
      brokerServer: 'Exness-MT5Real',
      initial: 3000,
      targetProfit: 300,
      minDays: 1,
      defaultRisk: 60,
      consistencyCapPct: 100,
      profitSplitPct: 100,
      feeRefundUsd: 0,
    },
    inferredPersonal: {
      id: 'inferredPersonal',
      login: '88099999',
      name: 'Legacy Personal',
      initial: 1000,
      targetProfit: 100,
      minDays: 1,
      defaultRisk: 30,
      consistencyCapPct: 100,
    },
  };

  assert.equal(resolveAccountType(personalAccounts.pers1), 'PERSONAL');
  assert.equal(resolveAccountType(personalAccounts.inferredPersonal), 'PERSONAL');
  assert.equal(resolveAccountType(DEFAULT_ACCOUNTS.port1), 'PROP');

  // Empty state -> ready badge
  const emptyPersonal = getAccountComputed(personalAccounts, [], 'pers1');
  assert.equal(emptyPersonal.accountType, 'PERSONAL');
  assert.equal(emptyPersonal.roiPct, 0);
  assert.equal(emptyPersonal.badge, 'พอร์ตส่วนตัว · พร้อมเทรด');

  // Growing (+$150 on $3,000 = +5.0%)
  const growingTrades = [
    {
      ...computeTradePricesAndMetrics({ dir: 'BUY', entry: 4040, risk: 150, status: 'FULL_SWEEP' }),
      id: 'P-1',
      port: 'pers1',
      date: '2026-11-10',
      time: '09:00',
      dir: 'BUY' as const,
      note: 'Win',
      pnlUsd: 150,
    },
  ];
  const growing = getAccountComputed(personalAccounts, growingTrades, 'pers1');
  assert.equal(growing.roiPct, 5);
  assert.equal(growing.badge, 'กำลังเติบโต +5.0%');

  // Reached goal (+$300 on $3,000 = +10.0%)
  const targetTrades = [
    ...growingTrades,
    {
      ...growingTrades[0],
      id: 'P-2',
      date: '2026-11-11',
      pnlUsd: 150,
    },
  ];
  const hitGoal = getAccountComputed(personalAccounts, targetTrades, 'pers1');
  assert.equal(hitGoal.roiPct, 10);
  assert.equal(hitGoal.badge, 'ถึงเป้าสะสม (+10.0%)');

  // Drawdown (-$150 on $3,000 = -5.0%)
  const lossTrades = [
    {
      ...computeTradePricesAndMetrics({ dir: 'SELL', entry: 4040, risk: 150, status: 'FULL_SL' }),
      id: 'P-3',
      port: 'pers1',
      date: '2026-11-12',
      time: '14:00',
      dir: 'SELL' as const,
      note: 'Loss',
      pnlUsd: -150,
    },
  ];
  const drawdown = getAccountComputed(personalAccounts, lossTrades, 'pers1');
  assert.equal(drawdown.roiPct, -5);
  assert.equal(drawdown.badge, 'Drawdown -5.0%');
});

test('normalizeBridgePositionsToMt5Records normalizes MT5 JSON feeds, skips balance items, and clusters 3-leg ideas', () => {
  const rawBridgeFeed = [
    { type: 'DEAL_TYPE_BALANCE', profit: 3000, ticket: 'bal-1' },
    { type: 'CREDIT', profit: 500, ticket: 'cred-1' },
    {
      ticket: '501',
      symbol: 'XAUUSDm',
      dir: 'BUY',
      openTime: '2026.11.10 09:00:00',
      closeTime: '2026.11.10 09:30:00',
      volume: 0.04,
      openPrice: 4040,
      closePrice: 4044,
      sl: 4030,
      tp: 4044,
      commission: -0.28,
      swap: 0,
      rawProfit: 16,
      comment: 'Leg 1',
    },
    {
      ticket: '502',
      symbol: 'XAUUSDm',
      type: '0',
      openTime: '2026.11.10 09:00:02',
      closeTime: '2026.11.10 09:45:00',
      lots: 0.04,
      priceOpen: 4040,
      priceClose: 4048,
      commission: -0.28,
      swap: 0,
      profit: 32,
      comment: 'Leg 2',
    },
    {
      ticket: '503',
      symbol: 'XAUUSDm',
      side: 'BUY',
      openTime: 1794301204, // epoch seconds ~ 2026-11-10T09:00:04Z
      closeTime: 1794304804,
      volume: 0.04,
      openPrice: 4040,
      closePrice: 4052,
      commission: -0.28,
      swap: 0,
      rawProfit: 48,
      comment: 'Leg 3',
    },
    // Duplicate ticket 503 updates cleanly without duplicating position count
    {
      ticket: '503',
      symbol: 'XAUUSDm',
      side: 'BUY',
      openTime: '2026.11.10 09:00:04',
      closeTime: '2026.11.10 10:00:04',
      volume: 0.04,
      openPrice: 4040,
      closePrice: 4052,
      commission: -0.28,
      swap: 0,
      rawProfit: 48,
      comment: 'Leg 3 updated',
    },
  ];

  const { positions, skippedCount } = normalizeBridgePositionsToMt5Records(rawBridgeFeed, '2026-11-10');
  assert.equal(skippedCount, 2);
  assert.equal(positions.length, 3);
  assert.equal(positions[0].openDate, '2026-11-10');
  assert.equal(positions[0].netProfit, 15.72);
  assert.equal(positions[2].comment, 'Leg 3 updated');

  const journalRows = convertMt5PositionsToJournalRows(
    {
      holderName: 'Personal User',
      login: '88012345',
      broker: 'Exness',
      currency: 'USD',
      initialDeposit: 3000,
      summaryNetProfit: 95.16,
    },
    positions,
    'pers1',
    'IDEA',
    true
  );

  assert.equal(journalRows.length, 1);
  assert.equal(journalRows[0].status, 'FULL_SWEEP');
  assert.equal(journalRows[0].pnlUsd, 95.16);
});

test('buildTradingCoachContext and generateLocalTacticalPlan adapt cleanly for Personal accounts without 40% warnings', () => {
  const personalState = {
    ...DEFAULT_STATE,
    activePort: 'pers1',
    accounts: {
      pers1: {
        id: 'pers1',
        login: '88012345',
        name: 'Personal Exness $3K',
        accountType: 'PERSONAL' as const,
        brokerName: 'Exness',
        brokerServer: 'Exness-MT5Real',
        initial: 3000,
        targetProfit: 300,
        minDays: 1,
        defaultRisk: 60,
        consistencyCapPct: 100,
        profitSplitPct: 100,
        feeRefundUsd: 0,
      },
    },
    calcRisk: 60,
    cycleDays: [{ day: 1, note: '2026-11-10', profit: 144 }],
  };

  const ctx = buildTradingCoachContext(personalState);
  assert.ok(ctx.includes('พอร์ตส่วนตัว'));
  assert.ok(ctx.includes('Exness'));
  assert.ok(ctx.includes('ไม่จำกัด % รายวัน'));

  const plan = generateLocalTacticalPlan(personalState);
  assert.ok(plan.includes('พอร์ตส่วนตัว'));
  assert.ok(plan.includes('100% Split'));
  assert.ok(!plan.includes('เกิน 40%'));
});

test('buildTradingCoachContext and generateLocalTacticalPlan include multi-page snapshots across journal and 12-Gate views', () => {
  const ctxJournal = buildTradingCoachContext(DEFAULT_STATE, {
    activePageId: 'journal-root',
    activePageTitle: 'Trade Journal',
    filteredJournalCount: 4,
    filteredJournalPnlUsd: 192.5,
    filteredJournalWinRatePct: 75,
    activeFiltersSummary: 'Port:ALL · Session:NY',
    recentFilteredTrades: ['2026-11-15 BUY FULL_SWEEP +$96.00 (RR 0.8)'],
    sessionAnalyticsSummary: 'WR 75%, PF 2.4',
    guardrailAlertsSummary: 'วินัยปกติ (0 แจ้งเตือน)',
  });

  assert.ok(ctxJournal.includes('Trade Journal [journal-root]'));
  assert.ok(ctxJournal.includes('ภาพรวมพอร์ตทั้งหมดในระบบ'));
  assert.ok(ctxJournal.includes('4 ไม้ | WinRate 75% | Net P/L +$192.50'));
  assert.ok(ctxJournal.includes('G01:'));

  const planGates = generateLocalTacticalPlan(DEFAULT_STATE, {
    activePageId: 'desk-cards-root',
    activePageTitle: '12-Gate Protocol',
  });
  assert.ok(planGates.includes('บริบทหน้าปัจจุบัน (12-Gate Protocol)'));
  assert.ok(planGates.includes('ด่านที่ยังรอเช็กก่อนเข้า'));
});

test('MT5 server timestamps convert accurately to Asia/Bangkok (ICT) before classifying ASIA/LONDON/NY sessions', () => {
  // November (Winter EST -> MT5 Server GMT+2 -> +5h to Bangkok ICT):
  // #86 (07:06 MT5 -> 12:06 ICT ASIA), #85 (04:59 MT5 -> 09:59 ICT ASIA), #84 (03:39 MT5 -> 08:39 ICT ASIA)
  const { positions } = normalizeBridgePositionsToMt5Records(
    [
      { ticket: '84', symbol: 'XAUUSD', type: 'BUY', volume: 0.04, openPrice: 3860, closePrice: 3864, profit: 16, openTime: '2026.11.17 03:39:00', closeTime: '2026.11.17 03:50:00' },
      { ticket: '85', symbol: 'XAUUSD', type: 'SELL', volume: 0.04, openPrice: 3870.8, closePrice: 3869.48, profit: 5.28, openTime: '2026.11.17 04:59:22', closeTime: '2026.11.17 05:10:00' },
      { ticket: '86', symbol: 'XAUUSD', type: 'BUY', volume: 0.04, openPrice: 3872, closePrice: 3875, profit: 12, openTime: '2026.11.17 07:06:00', closeTime: '2026.11.17 07:15:00' },
      // Midnight rollover check: 20:30 MT5 + 5h = next day 01:30 ICT NY
      { ticket: '87', symbol: 'XAUUSD', type: 'BUY', volume: 0.04, openPrice: 3880, closePrice: 3882, profit: 8, openTime: '2026.11.17 20:30:00', closeTime: '2026.11.17 20:45:00' },
      // Summer EDT check (Oct 29, 2026 -> MT5 Server GMT+3 -> +4h to Bangkok ICT): 10:00 -> 14:00 ICT LONDON
      { ticket: '88', symbol: 'XAUUSD', type: 'BUY', volume: 0.04, openPrice: 3800, closePrice: 3805, profit: 20, openTime: '2026.10.29 10:00:00', closeTime: '2026.10.29 10:20:00' },
      // Explicit UTC ISO timestamp (02:06Z -> 09:06 ICT directly without double-shifting)
      { ticket: '89', symbol: 'XAUUSD', type: 'BUY', volume: 0.04, openPrice: 3890, closePrice: 3892, profit: 8, openTime: '2026-11-17T02:06:00Z', closeTime: '2026-11-17T02:15:00Z' },
    ],
    '2026-11-17',
    'AUTO_MT5'
  );

  const byTicket = Object.fromEntries(positions.map((p) => [p.ticket, p]));
  assert.equal(byTicket['84'].openTime, '08:39');
  assert.equal(getTradeSession(byTicket['84'].openTime), 'ASIA');
  assert.equal(byTicket['85'].openTime, '09:59');
  assert.equal(getTradeSession(byTicket['85'].openTime), 'ASIA');
  assert.equal(byTicket['86'].openTime, '12:06');
  assert.equal(getTradeSession(byTicket['86'].openTime), 'ASIA');
  assert.equal(byTicket['87'].openDate, '2026-11-18');
  assert.equal(byTicket['87'].openTime, '01:30');
  assert.equal(getTradeSession(byTicket['87'].openTime), 'NY');
  assert.equal(byTicket['88'].openTime, '14:00');
  assert.equal(getTradeSession(byTicket['88'].openTime), 'LONDON');
  assert.equal(byTicket['89'].openTime, '09:06');
  assert.equal(byTicket['84'].rawOpenTime, '2026.11.17 03:39:00');

  // Re-applying offsets multiple times is 100% lossless (never double-shifts)
  const zeroShifted = reapplyMt5TimezoneToPositions(positions, 0);
  const zeroByTicket = Object.fromEntries(zeroShifted.map((p) => [p.ticket, p]));
  assert.equal(zeroByTicket['85'].openTime, '04:59');
  assert.equal(zeroByTicket['89'].openTime, '09:06'); // explicit Z stays 09:06 ICT

  const plusFiveShifted = reapplyMt5TimezoneToPositions(zeroShifted, 5);
  assert.equal(plusFiveShifted.find((p) => p.ticket === '85')?.openTime, '09:59');

  // Explicit Bangkok parse check for US/Myfxbook format MM/DD/YYYY HH:mm
  const myfxParsed = parseMt5DateTimeToBangkok('11/17/2026 04:59:22', '2026-11-17', 5);
  assert.equal(myfxParsed.date, '2026-11-17');
  assert.equal(myfxParsed.time, '09:59');

  // Legacy workspace migration in normalizeMergedState shifts un-migrated MT5 trades once into ICT
  const legacySavedState = {
    ...DEFAULT_STATE,
    mt5TimeOffset: undefined,
    mt5GroupMode: 'POSITION' as const,
    mt5RawReports: {
      port1: {
        meta: {
          holderName: 'Trader',
          login: '14359161',
          broker: 'FundedNext',
          currency: 'USD',
          initialDeposit: 6000,
          summaryNetProfit: 5.28,
        },
        positions: [
          {
            ticket: '85',
            symbol: 'XAUUSD',
            dir: 'SELL' as const,
            openDate: '2026-11-17',
            openTime: '04:59',
            openTs: Date.parse('2026-11-17T04:59:00+07:00'),
            closeDate: '2026-11-17',
            closeTime: '05:10',
            closeTs: Date.parse('2026-11-17T05:10:00+07:00'),
            volume: 0.04,
            openPrice: 3870.8,
            slPrice: 0,
            tpPrice: 0,
            closePrice: 3869.48,
            commission: 0,
            swap: 0,
            rawProfit: 5.28,
            netProfit: 5.28,
            comment: 'Legacy cached trade',
          },
        ],
        importedAt: '2026-11-17T05:15:00Z',
      },
    },
    journal: [
      {
        id: 'MT5-85',
        port: 'port1',
        date: '2026-11-17',
        time: '04:59',
        dir: 'SELL' as const,
        entry: 3870.8,
        risk: 40,
        lotLeg: 0.04,
        slPrice: 3880.8,
        tp1Price: 3866.8,
        tp2Price: 3862.8,
        tp3Price: 3858.8,
        tp1Pts: 132,
        tp2Pts: 0,
        tp3Pts: 0,
        slPts: 0,
        totalPts: 132,
        rr: 0.132,
        pnlUsd: 5.28,
        status: 'CUSTOM' as const,
        note: 'User personal note',
      },
    ],
  };

  const migrated = normalizeMergedState(legacySavedState);
  assert.equal(migrated.mt5TimeOffset, 'AUTO_MT5');
  assert.equal(migrated.journal[0].time, '09:59');
  assert.equal(getTradeSession(migrated.journal[0].time), 'ASIA');
  assert.equal(migrated.journal[0].note, 'User personal note');
  // Calling normalizeMergedState a second time must NOT shift 09:59 again
  const secondPass = normalizeMergedState(migrated);
  assert.equal(secondPass.journal[0].time, '09:59');
});



