import assert from 'node:assert/strict';
import test from 'node:test';
import type { Mt5PositionRecord, TradeRecord } from '../types/ghr.ts';
import { analyzeStatementAutopsy, analyzeTradeRecordsAutopsy, buildSampleBrokenChallengePositions } from './statementAutopsy.ts';

const samplePosition = buildSampleBrokenChallengePositions().positions[0];

function position(ticket: string, open: string, close: string, pnl: number, volume = 0.1): Mt5PositionRecord {
  return {
    ...samplePosition,
    ticket,
    openDate: open.slice(0, 10),
    openTime: open.slice(11),
    openTs: Date.parse(`${open}+07:00`),
    closeDate: close.slice(0, 10),
    closeTime: close.slice(11),
    closeTs: Date.parse(`${close}+07:00`),
    volume,
    rawProfit: pnl,
    netProfit: pnl,
    commission: 0,
  };
}

test('builds a 50,000 USD XAUUSD sample with three doubled entries after stops', () => {
  const sample = buildSampleBrokenChallengePositions();
  assert.deepEqual(sample, buildSampleBrokenChallengePositions());
  assert.equal(sample.initialBalance, 50_000);
  assert.equal(sample.positions.length, 18);
  assert.equal(new Set(sample.positions.map((trade) => trade.ticket)).size, 18);
  assert.ok(sample.positions.every((trade) => trade.symbol === 'XAUUSD' && trade.closeTs > trade.openTs));
  for (const index of [3, 8, 12]) {
    const stop = sample.positions[index - 1];
    const next = sample.positions[index];
    assert.equal(stop.closePrice, stop.slPrice);
    assert.ok(stop.netProfit < 0);
    assert.equal(next.volume, stop.volume * 2);
    assert.ok(next.openTs > stop.closeTs && next.openTs - stop.closeTs <= 900_000);
  }
});

test('replays the sample with synchronized equity and reports its concentrated day', () => {
  const { positions, initialBalance, firmId } = buildSampleBrokenChallengePositions();
  const result = analyzeStatementAutopsy([...positions].reverse(), initialBalance, firmId);
  assert.equal(result.actualNetPnlUsd, 3_750);
  assert.equal(result.preventableTiltLossUsd, 2_860);
  assert.equal(result.counterfactualNetPnlUsd, 6_610);
  assert.equal(result.tiltTradeCount, 3);
  assert.deepEqual(result.flaggedTickets, ['SAMPLE-4', 'SAMPLE-9', 'SAMPLE-13']);
  assert.equal(result.equityCurve.length, 19);
  assert.equal(result.equityCurve[0].actualEquity, initialBalance);
  assert.deepEqual(result.equityCurve.filter((point) => point.isTilt).map((point) => point.step), [4, 9, 13]);
  assert.equal(result.equityCurve[4].disciplinedEquity, result.equityCurve[3].disciplinedEquity);
  assert.equal(result.equityCurve[18].actualEquity, initialBalance + 3_750);
  assert.equal(result.equityCurve[18].disciplinedEquity, initialBalance + 6_610);
  assert.equal(result.worstDailyLossUsd, 2_100);
  assert.equal(result.worstDailyLossPct, 4.2);
  assert.equal(result.closeCallWarningCount, 1);
  assert.equal(result.bestDayUsd, 3_270);
  assert.equal(result.bestDaySharePct, 87.2);
  assert.equal(result.consistencyCapPct, 40);
  assert.equal(result.consistencyBreached, true);
  assert.equal(result.worstSession, 'NEW_YORK');
});

test('counts the exact cooldown boundary and excludes flagged winners from the replay', () => {
  const positions = [
    position('stop', '2026-11-02T08:30', '2026-11-02T09:00', -100),
    position('already-open', '2026-11-02T08:56', '2026-11-02T09:03', 10),
    position('same-timestamp', '2026-11-02T09:00', '2026-11-02T09:05', 60),
    position('at-limit', '2026-11-02T09:15', '2026-11-02T09:16', -80),
    position('outside', '2026-11-02T09:15:01', '2026-11-02T09:19', 200),
  ];
  const result = analyzeStatementAutopsy(positions, 10_000, 'ftmo');
  assert.deepEqual(result.flaggedTickets, ['same-timestamp', 'at-limit']);
  assert.equal(result.actualNetPnlUsd, 90);
  assert.equal(result.preventableTiltLossUsd, 80);
  assert.equal(result.counterfactualNetPnlUsd, 110);
});

test('flags a 1.5x median lot on the first subsequent entry after a loss', () => {
  const positions = [
    position('baseline', '2026-11-02T08:30', '2026-11-02T09:00', 70),
    position('stop', '2026-11-02T09:10', '2026-11-02T09:15', -100),
    position('sized-up', '2026-11-02T09:40', '2026-11-02T09:50', -100, 0.15),
    position('second-entry', '2026-11-02T09:42', '2026-11-02T09:51', 150, 0.2),
    position('next-day', '2026-11-03T09:42', '2026-11-03T09:51', 150),
  ];
  assert.deepEqual(analyzeStatementAutopsy(positions, 10_000).flaggedTickets, ['sized-up']);
});

test('uses realized intraday lows and counts close calls below the daily loss limit once per day', () => {
  const positions = [
    position('daily-limit', '2026-11-02T08:00', '2026-11-02T09:00', -1_250),
    position('close-call', '2026-11-03T08:00', '2026-11-03T09:00', -1_000),
    position('partial-recovery', '2026-11-03T10:00', '2026-11-03T11:00', 50),
    position('lower-low', '2026-11-03T12:00', '2026-11-03T13:00', -100),
    position('recovery', '2026-11-03T14:00', '2026-11-03T15:00', 1_500),
    position('below-warning', '2026-11-04T08:00', '2026-11-04T09:00', -999),
  ];
  const result = analyzeStatementAutopsy(positions, 25_000, 'fundednext');
  assert.equal(result.closeCallWarningCount, 1);
  assert.equal(result.worstDailyLossUsd, 1_250);
  assert.equal(result.worstDailyLossPct, 5);
  assert.equal(result.bestDayUsd, 450);
  assert.equal(result.bestDaySharePct, null);
  assert.equal(result.consistencyBreached, false);
});

test('rolls daily loss at Bangkok midnight and uses the selected firm cap', () => {
  const wins = [
    position('before-midnight', '2026-11-02T23:45', '2026-11-02T23:59', 400),
    position('after-midnight', '2026-11-02T23:46', '2026-11-03T00:00', 300),
    position('next-day', '2026-11-04T10:00', '2026-11-04T10:15', 300),
  ];
  const exact = analyzeStatementAutopsy(wins, 10_000, 'fundednext');
  assert.equal(exact.bestDaySharePct, 40);
  assert.equal(exact.consistencyBreached, false);

  const concentrated = [{ ...wins[0], netProfit: 460 }, ...wins.slice(1)];
  assert.equal(analyzeStatementAutopsy(concentrated, 10_000, 'fundednext').consistencyBreached, true);
  const fundingPips = analyzeStatementAutopsy(concentrated, 10_000, 'fundingpips');
  assert.equal(fundingPips.consistencyCapPct, 45);
  assert.equal(fundingPips.consistencyBreached, false);
  const noCap = analyzeStatementAutopsy(concentrated, 10_000, 'ftmo');
  assert.equal(noCap.consistencyCapPct, null);
  assert.equal(noCap.consistencyBreached, false);
  assert.equal(analyzeStatementAutopsy(wins.map((trade) => ({ ...trade, netProfit: -300 })), 10_000).worstDailyLossUsd, 300);
});

test('groups by Bangkok close time across all session boundaries', () => {
  const positions = [
    position('early', '2026-11-02T04:00', '2026-11-02T05:59', -120),
    position('asia-start', '2026-11-02T05:30', '2026-11-02T06:00', 100),
    position('asia-end', '2026-11-02T13:30', '2026-11-02T13:59', 60),
    position('london-start', '2026-11-02T13:40', '2026-11-02T14:00', -20),
    position('london-end', '2026-11-02T19:30', '2026-11-02T19:59', 80),
    position('ny-start', '2026-11-02T19:40', '2026-11-02T20:00', -40),
  ];
  const result = analyzeStatementAutopsy(positions, 10_000);
  assert.deepEqual(result.sessions, {
    ASIA: { count: 2, winRatePct: 100, netPnlUsd: 160, expectancyUsd: 80 },
    LONDON: { count: 2, winRatePct: 50, netPnlUsd: 60, expectancyUsd: 30 },
    NEW_YORK: { count: 2, winRatePct: 0, netPnlUsd: -160, expectancyUsd: -80 },
  });
  assert.equal(result.worstSession, 'NEW_YORK');
  assert.equal(analyzeStatementAutopsy([positions[1]], 10_000).worstSession, 'ASIA');
});

test('maps journal times and prefers the total calculator lot for sizing', () => {
  const record: TradeRecord = {
    id: 'journal-stop', port: 'active', date: '2026-11-02', time: '9:00',
    dir: 'BUY', entry: 2630, risk: 100, lotLeg: 0.1, slPrice: 2620,
    tp1Price: 2640, tp2Price: 2650, tp3Price: 2660, tp1Pts: 0, tp2Pts: 0, tp3Pts: 0,
    slPts: -1_000, totalPts: -1_000, rr: -1, pnlUsd: -100, status: 'FULL_SL', note: '',
  };
  const result = analyzeTradeRecordsAutopsy([
    record,
    {
      ...record, id: 'journal-size-up', time: '9:45', pnlUsd: -220,
      calculatorDetails: {
        totalLot: 0.2, legLots: [0.1, 0.1], instrument: 'XAUUSD',
        contract: { usdPerPriceMove: 100, priceDecimals: 2, pointsPerPrice: 100 },
      },
    },
    { ...record, id: 'journal-profit', time: '11:00', pnlUsd: 150 },
  ], 10_000, 'fundednext');
  assert.deepEqual(result.flaggedTickets, ['journal-size-up']);
  assert.equal(result.actualNetPnlUsd, -170);
  assert.equal(result.counterfactualNetPnlUsd, 50);
  assert.equal(result.sessions.ASIA.count, 3);
});

test('runs a repeatable bootstrap independent of input ordering', () => {
  const { positions, initialBalance, firmId } = buildSampleBrokenChallengePositions();
  const first = analyzeStatementAutopsy(positions, initialBalance, firmId).monteCarlo;
  assert.deepEqual(first, analyzeStatementAutopsy([...positions].reverse(), initialBalance, firmId).monteCarlo);
  assert.ok(Object.values(first).every((value) => value >= 0 && value <= 100));
  assert.ok(first.currentRuinPct + first.currentPassRatePct <= 100);
  assert.ok(first.reducedRiskRuinPct + first.reducedRiskPassRatePct <= 100);
  assert.ok(first.currentRuinPct > first.reducedRiskRuinPct);
});

test('models the daily loss, total loss and target as distinct stopping conditions', () => {
  const daily = position('daily', '2026-11-02T08:30', '2026-11-02T09:00', -500);
  assert.deepEqual(analyzeStatementAutopsy([daily], 10_000).monteCarlo, {
    currentRuinPct: 100, reducedRiskRuinPct: 0, currentPassRatePct: 0, reducedRiskPassRatePct: 0,
  });
  const overall = [2, 3, 4].map((day) => position(`day-${day}`, `2026-11-0${day}T08:30`, `2026-11-0${day}T09:00`, -400));
  assert.deepEqual(analyzeStatementAutopsy(overall, 10_000).monteCarlo, analyzeStatementAutopsy([daily], 10_000).monteCarlo);
  assert.deepEqual(analyzeStatementAutopsy([{ ...daily, netProfit: 800 }], 10_000).monteCarlo, {
    currentRuinPct: 0, reducedRiskRuinPct: 0, currentPassRatePct: 100, reducedRiskPassRatePct: 0,
  });
});

test('recovers legacy timestamps and returns empty metrics when no close can be dated', () => {
  const legacy = { ...samplePosition, openTs: 0, closeTs: 0 };
  assert.equal(analyzeStatementAutopsy([legacy], 10_000).actualNetPnlUsd, samplePosition.netProfit);
  const result = analyzeStatementAutopsy([{ ...legacy, closeDate: '' }], 10_000);
  assert.equal(result.worstSession, null);
  assert.equal(result.bestDaySharePct, null);
  assert.equal(result.equityCurve.length, 1);
  assert.deepEqual(Object.values(result.monteCarlo), [0, 0, 0, 0]);
});
