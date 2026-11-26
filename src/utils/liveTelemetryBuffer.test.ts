import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LIVE_TELEMETRY_MAX_SAMPLES,
  LIVE_TELEMETRY_POLL_MS,
  appendLiveTelemetryPoint,
  computeLivePositionMetrics,
  downsampleLiveTelemetry,
  formatTelemetryTimeLabel,
  resolveNextLivePollAt,
  sliceLiveTelemetryWindow,
  type LiveTelemetryPoint,
} from './liveTelemetryBuffer';

test('schedules the next poll using the server deadline and a finite 3s client floor', () => {
  const now = Date.parse('2026-11-26T08:00:00Z');
  assert.equal(resolveNextLivePollAt(now, 12_000, '2026-11-26T08:00:06Z'), now + 6000);
  assert.equal(resolveNextLivePollAt(now, 12_000, '2026-11-26T07:59:59Z'), now + 3000);
  assert.equal(resolveNextLivePollAt(now, 12_000, 'invalid'), now + 12_000);
  assert.equal(resolveNextLivePollAt(now, Infinity, 'invalid'), now + 3000);
});

test('LIVE_TELEMETRY_POLL_MS is 3 seconds and buffer caps at 120 samples immutably', () => {
  assert.equal(LIVE_TELEMETRY_POLL_MS, 3_000);
  assert.equal(LIVE_TELEMETRY_MAX_SAMPLES, 120);

  let buffer: LiveTelemetryPoint[] = [];
  const startTs = 1_795_000_000_000;
  for (let i = 0; i < 130; i++) {
    const ts = startTs + i * LIVE_TELEMETRY_POLL_MS;
    const prevRef = buffer;
    buffer = appendLiveTelemetryPoint(buffer, {
      ts,
      timeLabel: formatTelemetryTimeLabel(ts),
      balance: 10_000,
      equity: 10_000 + i,
      floatingPnl: i,
      dailyFloorBalance: 9_500,
      openPositionsCount: 1,
    });
    assert.notEqual(buffer, prevRef);
  }

  assert.equal(buffer.length, 120);
  assert.equal(buffer[0].ts, startTs + 10 * LIVE_TELEMETRY_POLL_MS);
  assert.equal(buffer[119].ts, startTs + 129 * LIVE_TELEMETRY_POLL_MS);
});

test('appendLiveTelemetryPoint handles out-of-order, same-timestamp, and NaN points safely', () => {
  const t1 = 1_795_000_000_000;
  const t2 = t1 + 3_000;
  let buf = appendLiveTelemetryPoint([], {
    ts: t2,
    timeLabel: '10:00:03',
    balance: 6000,
    equity: 6010,
    floatingPnl: 10,
    dailyFloorBalance: 5700,
    openPositionsCount: 1,
  });

  // Stale out-of-order tick is ignored
  buf = appendLiveTelemetryPoint(buf, {
    ts: t1,
    timeLabel: '10:00:00',
    balance: 6000,
    equity: 5999,
    floatingPnl: -1,
    dailyFloorBalance: 5700,
    openPositionsCount: 1,
  });
  assert.equal(buf.length, 1);
  assert.equal(buf[0].ts, t2);

  // Same-timestamp replaces cleanly
  buf = appendLiveTelemetryPoint(buf, {
    ts: t2,
    timeLabel: '10:00:03',
    balance: 6000,
    equity: 6025,
    floatingPnl: 25,
    dailyFloorBalance: 5700,
    openPositionsCount: 2,
  });
  assert.equal(buf.length, 1);
  assert.equal(buf[0].equity, 6025);
  assert.equal(buf[0].openPositionsCount, 2);

  // NaN point is dropped cleanly
  buf = appendLiveTelemetryPoint(buf, {
    ts: t2 + 3_000,
    timeLabel: '10:00:06',
    balance: Number.NaN,
    equity: 6030,
    floatingPnl: 30,
    dailyFloorBalance: 5700,
    openPositionsCount: 2,
  });
  assert.equal(buf.length, 1);
});

test('sliceLiveTelemetryWindow and downsampleLiveTelemetry are deterministic', () => {
  const base = 1_795_000_000_000;
  let buf: LiveTelemetryPoint[] = [];
  for (let i = 0; i < 120; i++) {
    const ts = base + i * 3_000;
    buf = appendLiveTelemetryPoint(buf, {
      ts,
      timeLabel: formatTelemetryTimeLabel(ts),
      balance: 6000,
      equity: 6000 + (i % 7) * 5,
      floatingPnl: (i % 7) * 5,
      dailyFloorBalance: 5700,
      openPositionsCount: 1,
    });
  }
  const last2m = sliceLiveTelemetryWindow(buf, '2M');
  assert.equal(last2m.length, 41); // 120_000ms inclusive: 40 intervals + endpoint
  assert.equal(last2m[last2m.length - 1].ts, buf[buf.length - 1].ts);

  const downsampled = downsampleLiveTelemetry(buf, 20);
  assert.ok(downsampled.length <= 20);
  assert.equal(downsampled[0].ts, buf[0].ts);
  assert.equal(downsampled[downsampled.length - 1].ts, buf[buf.length - 1].ts);
});

test('computeLivePositionMetrics normalizes FundedNext & Live Bridge open positions and computes prop guardrails', () => {
  const nowMs = Date.parse('2026-11-25T10:30:00.000Z');
  const result = computeLivePositionMetrics(
    [
      {
        id: '421634299',
        accountId: '4613642',
        symbol: 'XAUUSD',
        side: 'BUY',
        volume: '0.04',
        openPrice: '3800.00',
        stopLoss: '3790.00',
        takeProfit: '3812.00',
        risk: null,
        floatingPnl: '48.00',
        fetchedAt: '2026-11-25T10:30:00.000Z',
        sourceTimestampRaw: '2026.11.25 10:00:00',
        sourceTimestampUtc: '2026-11-25T10:00:00.000Z',
        sourceTimezone: 'Z',
        missingFields: [],
        unverifiedFields: [],
        rawPayload: {
          current_price: 3812.0,
          swap: -0.4,
          commission: -0.24,
        },
      },
      {
        ticket: '551122',
        symbol: 'XAUUSD',
        side: 'SELL',
        lots: 0.02,
        openPrice: 3810.0,
        currentPrice: 3812.0,
        slPrice: null, // Naked position without SL!
        tpPrice: 3800.0,
        floatingPnl: -4.0,
        swap: 0,
        commission: 0,
        openTime: '2026-11-25T10:15:00.000Z',
      },
    ],
    6100, // balance
    6144, // equity
    300,  // dailyLossLimitUsd (5% of 6000)
    100,  // netRealizedProfit
    40,   // bestDayProfit
    40,   // consistencyCapPct
    {
      nowMs,
      marginUsedUsd: 300,
      todayRealizedProfitUsd: 30,
    }
  );

  assert.equal(result.positions.length, 2);

  const p1 = result.positions[0];
  assert.equal(p1.ticket, '421634299');
  assert.equal(p1.side, 'BUY');
  assert.equal(p1.lots, 0.04);
  assert.equal(p1.currentPrice, 3812);
  assert.equal(p1.slRiskUsd, 40); // |3800 - 3790| * 0.04 * 100 = 40
  assert.equal(p1.pipsDelta, 120); // (3812 - 3800) / 0.1 = 120 pips
  assert.equal(p1.durationMin, 30);
  assert.equal(p1.swap, -0.4);
  assert.equal(p1.commission, -0.24);
  assert.equal(p1.hasStopLoss, true);

  const p2 = result.positions[1];
  assert.equal(p2.side, 'SELL');
  assert.equal(p2.slPrice, null);
  assert.equal(p2.slRiskUsd, null);
  assert.equal(p2.hasStopLoss, false);
  assert.equal(p2.pipsDelta, -20); // (3810 - 3812) / 0.1 = -20 pips
  assert.equal(p2.durationMin, 15);

  const s = result.summary;
  assert.equal(s.openCount, 2);
  assert.equal(s.buyLots, 0.04);
  assert.equal(s.sellLots, 0.02);
  assert.equal(s.totalLots, 0.06);
  assert.equal(s.netExposureLots, 0.02);
  assert.equal(s.totalFloatingPnl, 44);
  assert.equal(s.totalRiskAtSlUsd, 40);
  assert.equal(s.unprotectedPositionsCount, 1);
  assert.equal(s.marginLevelPct, 2048); // 6144 / 300 * 100 = 2048.0%
  assert.equal(s.freeMarginUsd, 5844);
  assert.equal(s.dailyLossUsedUsd, 0);
  assert.equal(s.dailyDdRemainingUsd, 300);
  assert.equal(s.dailyFloorBalance, 5770); // (6100 - 30) - 300 = 5770
  // If closed now: today profit = 30 + 44 = 74; total profit = 100 + 44 = 144 -> 74/144 = 51.4% > 40%!
  assert.equal(s.projectedTodayProfit, 74);
  assert.equal(s.projectedTotalProfit, 144);
  assert.equal(s.projectedBestDaySharePct, 51.4);
  assert.equal(s.isConsistencyBreachedIfClosedNow, true);
});

test('computeLivePositionMetrics handles trailing SL in profit and negative daily DD correctly', () => {
  const res = computeLivePositionMetrics(
    [
      {
        ticket: 'T-LOCKED',
        symbol: 'XAUUSD',
        side: 'BUY',
        lots: 0.05,
        openPrice: 3800,
        slPrice: 3804, // SL moved above entry (locked profit)
        floatingPnl: 25,
      },
      {
        ticket: 'T-LOSS',
        symbol: 'EURUSD',
        side: 'SELL',
        lots: 0.1,
        openPrice: 1.085,
        currentPrice: 1.087,
        slPrice: 1.09,
        floatingPnl: -200,
      },
    ],
    9900,
    9725,
    500,
    -100,
    50,
    40,
    { todayRealizedProfitUsd: -100 }
  );

  assert.equal(res.positions[0].slRiskUsd, 0);
  assert.equal(res.positions[1].slRiskUsd, 50); // (1.090 - 1.085) * 0.1 * 100_000 = 50
  assert.equal(res.summary.totalFloatingPnl, -175);
  assert.equal(res.summary.dailyLossUsedUsd, 275); // |-100 + -175|
  assert.equal(res.summary.dailyDdRemainingUsd, 225);
  assert.equal(res.summary.dailyDdUsedPct, 55);
});
