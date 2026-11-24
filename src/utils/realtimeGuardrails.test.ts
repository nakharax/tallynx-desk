import test from 'node:test';
import assert from 'node:assert/strict';
import type { TradeRecord } from '../types/ghr';
import {
  classifyTradeSession,
  computeRealtimeAnalytics,
  computeRealtimeTelemetryBar,
  detectBehavioralGuardrails,
  generateOrderSnapshotSvgDataUrl,
  resolveTelemetryStreamMode,
} from './realtimeGuardrails';
import { LEGACY_STORAGE_KEY, STORAGE_KEY, loadLocalState } from './idbStorage';
import { sanitizeWorkspaceBrandName } from './ghrRules';

function sampleTrade(overrides: Partial<TradeRecord> = {}): TradeRecord {
  return {
    id: 'T-101',
    port: 'port1',
    date: '2026-11-15',
    time: '15:00',
    dir: 'BUY',
    entry: 2650,
    risk: 120,
    lotLeg: 0.04,
    slPrice: 2640,
    tp1Price: 2654,
    tp2Price: 2658,
    tp3Price: 2662,
    tp1Pts: 400,
    tp2Pts: 800,
    tp3Pts: 1200,
    slPts: 0,
    totalPts: 2400,
    rr: 0.8,
    pnlUsd: 96,
    status: 'FULL_SWEEP',
    note: 'H1 demand setup',
    ...overrides,
  };
}

test('classifyTradeSession segments ICT hours into ASIA, LONDON, NEW_YORK', () => {
  assert.equal(classifyTradeSession('09:30'), 'ASIA');
  assert.equal(classifyTradeSession('15:15'), 'LONDON');
  assert.equal(classifyTradeSession('21:45'), 'NEW_YORK');
});

test('computeRealtimeTelemetryBar calculates equity and daily drawdown gauge accurately', () => {
  const trades = [
    sampleTrade({ pnlUsd: -300, status: 'FULL_SL', time: '14:10' }),
  ];
  const snap = computeRealtimeTelemetryBar(
    { initial: 10000, balance: 9700 },
    trades,
    'port1',
    '2026-11-15',
    -150
  );
  assert.equal(snap.equity, 9550);
  assert.equal(snap.dailyDrawdownLimitUsd, 500);
  assert.equal(snap.dailyDrawdownUsedUsd, 450);
  assert.equal(snap.dailyDrawdownUsedPct, 90);
  assert.equal(snap.status, 'CRITICAL');
  assert.equal(snap.readOnlyVerified, true);
});

test('computeRealtimeAnalytics aggregates per-session winrates and profit factor', () => {
  const trades = [
    sampleTrade({ id: '1', time: '09:30', pnlUsd: 96, status: 'FULL_SWEEP' }),
    sampleTrade({ id: '2', time: '15:30', pnlUsd: -120, status: 'FULL_SL' }),
    sampleTrade({ id: '3', time: '16:15', pnlUsd: -120, status: 'FULL_SL' }),
    sampleTrade({ id: '4', time: '20:30', pnlUsd: 120, status: 'FULL_SWEEP' }),
  ];
  const stats = computeRealtimeAnalytics(trades, 'port1');
  assert.equal(stats.overallWinRatePct, 50);
  assert.equal(stats.sessions.LONDON.totalTrades, 2);
  assert.equal(stats.sessions.LONDON.winRatePct, 0);
  assert.ok(stats.biggestLeakText.includes('LONDON'));
});

test('detectBehavioralGuardrails catches revenge trades and over-lot risk', () => {
  const trades = [
    sampleTrade({ id: 'a1', time: '20:00', risk: 100, pnlUsd: -100, status: 'FULL_SL' }),
    sampleTrade({ id: 'a2', time: '20:10', risk: 100, pnlUsd: -100, status: 'FULL_SL' }),
  ];
  const alerts = detectBehavioralGuardrails(trades, 'port1', 250, '2026-11-15', 0, 10000);
  const codes = alerts.map((a) => a.code);
  assert.ok(codes.includes('REVENGE_TRADE'));
  assert.ok(codes.includes('OVER_LOT'));
});

test('generateOrderSnapshotSvgDataUrl encodes valid SVG with blue/red/green levels', () => {
  const url = generateOrderSnapshotSvgDataUrl(sampleTrade());
  assert.ok(url.startsWith('data:image/svg+xml;utf8,'));
  const decoded = decodeURIComponent(url.replace('data:image/svg+xml;utf8,', ''));
  assert.ok(decoded.includes('cdn.tallynx.com/snapshots/T-101.svg'));
  assert.ok(decoded.includes('#3B82F6'));
  assert.ok(decoded.includes('#EF4444'));
  assert.ok(decoded.includes('#10B981'));
});

test('loadLocalState migrates legacy Tredyn storage to TallyNX non-destructively', () => {
  const store = new Map<string, string>();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const mockLocalStorage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: mockLocalStorage,
  });

  try {
    const legacyPayload = JSON.stringify({
      deskBrandName: 'Tredyn · GHR v3.2',
      deskBrandSubtitle: 'Legacy Tredyn Journal',
      journal: [sampleTrade()],
    });
    store.set(LEGACY_STORAGE_KEY, legacyPayload);

    const migrated = loadLocalState();
    assert.equal(migrated.deskBrandName, 'TallyNX OS v4.0');
    assert.equal(migrated.deskBrandSubtitle, 'desk.tallynx.com · Real-Time Trading OS & Trade Journal');
    assert.equal(migrated.journal.length, 1);
    assert.equal(migrated.journal[0]?.id, 'T-101');
    assert.ok(store.has(STORAGE_KEY), 'Expected migrated payload written to TallyNX STORAGE_KEY');
    assert.equal(store.get(LEGACY_STORAGE_KEY), legacyPayload, 'Expected legacy key preserved untouched');
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, 'localStorage', descriptor);
    } else {
      delete (globalThis as Record<string, unknown>).localStorage;
    }
  }
});

test('resolveTelemetryStreamMode distinguishes manual xlsx vs live bridge vs cloud API vs offline', () => {
  assert.equal(resolveTelemetryStreamMode(true, 'MANUAL_XLSX'), 'MANUAL_XLSX');
  assert.equal(resolveTelemetryStreamMode(true, undefined), 'MANUAL_XLSX');
  assert.equal(resolveTelemetryStreamMode(true, 'LIVE_BRIDGE', true), 'SSE_LIVE');
  assert.equal(resolveTelemetryStreamMode(true, 'FUNDEDNEXT_MCP'), 'CLOUD_API');
  assert.equal(resolveTelemetryStreamMode(false, 'LIVE_BRIDGE', true), 'OFFLINE_IDB');
});

test('sanitizeWorkspaceBrandName enforces TallyNX OS v4.0 on legacy names while preserving custom white-labels', () => {
  assert.equal(sanitizeWorkspaceBrandName('GHR v3.2 Desk'), 'TallyNX OS v4.0');
  assert.equal(sanitizeWorkspaceBrandName('Tredyn OS'), 'TallyNX OS v4.0');
  assert.equal(sanitizeWorkspaceBrandName('Apex Gold Desk'), 'Apex Gold Desk');
});
