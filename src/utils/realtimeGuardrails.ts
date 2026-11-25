import type { TradeRecord } from '../types/ghr';
import { getTradeSession } from './ghrRules';
export { LIVE_TELEMETRY_POLL_MS } from './liveTelemetryBuffer';

export interface RealtimeTelemetrySnapshot {
  balance: number;
  equity: number;
  floatingPnlUsd: number;
  dailyRealizedPnlUsd: number;
  dailyDrawdownLimitUsd: number;
  dailyDrawdownUsedUsd: number;
  dailyDrawdownUsedPct: number;
  status: 'NOMINAL' | 'CAUTION' | 'CRITICAL';
  streamMode: 'WS_LIVE' | 'SSE_LIVE' | 'CLOUD_API' | 'MANUAL_XLSX' | 'OFFLINE_IDB';
  readOnlyVerified: true;
}

export function resolveTelemetryStreamMode(
  isOnline: boolean,
  syncProvider?: string | null,
  hasActiveSse: boolean = true
): RealtimeTelemetrySnapshot['streamMode'] {
  if (!isOnline) return 'OFFLINE_IDB';
  if (syncProvider === 'LIVE_BRIDGE') {
    return hasActiveSse ? 'SSE_LIVE' : 'OFFLINE_IDB';
  }
  if (
    syncProvider === 'MYFXBOOK_API' ||
    syncProvider === 'FUNDEDNEXT_MCP' ||
    syncProvider === 'PROJECTX_API'
  ) {
    return 'CLOUD_API';
  }
  return 'MANUAL_XLSX';
}

export interface SessionMetricsSummary {
  session: 'ASIA' | 'LONDON' | 'NEW_YORK';
  totalTrades: number;
  wins: number;
  winRatePct: number;
  netPnlUsd: number;
  avgR: number;
}

export interface RealtimeAnalyticsSummary {
  sessions: Record<'ASIA' | 'LONDON' | 'NEW_YORK', SessionMetricsSummary>;
  overallWinRatePct: number;
  avgRMultiple: number;
  profitFactor: number;
  biggestLeakText: string;
}

export interface GuardrailAlert {
  id: string;
  code: 'REVENGE_TRADE' | 'OVER_LOT' | 'OFF_SESSION_LEAK' | 'DAILY_DD_NEAR_LIMIT';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  metricBadge: string;
}

export interface LiveDeskParticipant {
  id: string;
  handle: string;
  role: string;
  symbol: string;
  status: 'HOLDING_ORDER' | 'WAITING_SETUP' | 'CLOSED_FOR_DAY';
  statusLabelTh: string;
  rMultipleToday: number;
  updatedAt: string;
}

export function classifyTradeSession(timeHHMM: string): 'ASIA' | 'LONDON' | 'NEW_YORK' {
  const parts = String(timeHHMM || '').trim().split(':');
  const hour = Number.parseInt(parts[0] || '', 10);
  if (!Number.isFinite(hour)) return 'NEW_YORK';
  const session = getTradeSession(timeHHMM);
  return session === 'NY' ? 'NEW_YORK' : session;
}

export function computeRealtimeTelemetryBar(
  account: { initial: number; balance: number },
  journal: TradeRecord[],
  activePort: string,
  todayIso: string,
  floatingPnlUsd: number = 0,
  streamMode: RealtimeTelemetrySnapshot['streamMode'] = 'SSE_LIVE',
  dailyLossLimitUsdOverride?: number
): RealtimeTelemetrySnapshot {
  const portTradesToday = (journal || []).filter(
    (t) => t.port === activePort && t.date === todayIso
  );
  const dailyRealizedPnlUsd = +portTradesToday
    .reduce((acc, t) => acc + (Number(t.pnlUsd) || 0), 0)
    .toFixed(2);
  const cleanFloat = +Number(floatingPnlUsd || 0).toFixed(2);
  const balance = +Number(account.balance || 0).toFixed(2);
  const equity = +(balance + cleanFloat).toFixed(2);
  const initial = Math.max(100, Number(account.initial || 10000));
  const dailyDrawdownLimitUsd =
    typeof dailyLossLimitUsdOverride === 'number' && Number.isFinite(dailyLossLimitUsdOverride) && dailyLossLimitUsdOverride > 0
      ? +dailyLossLimitUsdOverride.toFixed(2)
      : +(initial * 0.05).toFixed(2);
  const netToday = dailyRealizedPnlUsd + cleanFloat;
  const dailyDrawdownUsedUsd = +(netToday < 0 ? Math.abs(netToday) : 0).toFixed(2);
  const dailyDrawdownUsedPct = Math.min(
    100,
    +((dailyDrawdownUsedUsd / Math.max(1, dailyDrawdownLimitUsd)) * 100).toFixed(1)
  );
  const status: RealtimeTelemetrySnapshot['status'] =
    dailyDrawdownUsedPct >= 80
      ? 'CRITICAL'
      : dailyDrawdownUsedPct >= 50
        ? 'CAUTION'
        : 'NOMINAL';

  return {
    balance,
    equity,
    floatingPnlUsd: cleanFloat,
    dailyRealizedPnlUsd,
    dailyDrawdownLimitUsd,
    dailyDrawdownUsedUsd,
    dailyDrawdownUsedPct,
    status,
    streamMode,
    readOnlyVerified: true,
  };
}

export function computeRealtimeAnalytics(
  journal: TradeRecord[],
  activePort: string
): RealtimeAnalyticsSummary {
  const portTrades = (journal || []).filter((t) => t.port === activePort);
  const buckets: Record<'ASIA' | 'LONDON' | 'NEW_YORK', TradeRecord[]> = {
    ASIA: [],
    LONDON: [],
    NEW_YORK: [],
  };

  for (const t of portTrades) {
    buckets[classifyTradeSession(t.time)].push(t);
  }

  const buildSession = (session: 'ASIA' | 'LONDON' | 'NEW_YORK'): SessionMetricsSummary => {
    const rows = buckets[session];
    const totalTrades = rows.length;
    const wins = rows.filter((r) => Number(r.pnlUsd) > 0).length;
    const winRatePct = totalTrades > 0 ? +((wins / totalTrades) * 100).toFixed(1) : 0;
    const netPnlUsd = +rows.reduce((sum, r) => sum + (Number(r.pnlUsd) || 0), 0).toFixed(2);
    const totalR = rows.reduce(
      (sum, r) => sum + Number(r.pnlUsd || 0) / Math.max(1, Number(r.risk || 120)),
      0
    );
    const avgR = totalTrades > 0 ? +(totalR / totalTrades).toFixed(2) : 0;
    return { session, totalTrades, wins, winRatePct, netPnlUsd, avgR };
  };

  const sessions: Record<'ASIA' | 'LONDON' | 'NEW_YORK', SessionMetricsSummary> = {
    ASIA: buildSession('ASIA'),
    LONDON: buildSession('LONDON'),
    NEW_YORK: buildSession('NEW_YORK'),
  };

  const totalCount = portTrades.length;
  const totalWins = portTrades.filter((t) => Number(t.pnlUsd) > 0).length;
  const overallWinRatePct = totalCount > 0 ? +((totalWins / totalCount) * 100).toFixed(1) : 0;

  let grossProfit = 0;
  let grossLoss = 0;
  let rSum = 0;
  for (const t of portTrades) {
    const pnl = Number(t.pnlUsd) || 0;
    if (pnl > 0) grossProfit += pnl;
    else if (pnl < 0) grossLoss += Math.abs(pnl);
    rSum += pnl / Math.max(1, Number(t.risk || 120));
  }

  const avgRMultiple = totalCount > 0 ? +(rSum / totalCount).toFixed(2) : 0;
  const profitFactor =
    grossLoss > 0 ? +(grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? 3.5 : 0;

  const populated = (Object.values(sessions) as SessionMetricsSummary[]).filter(
    (s) => s.totalTrades >= 2
  );
  populated.sort((a, b) => a.netPnlUsd - b.netPnlUsd);

  let biggestLeakText = 'ยังไม่พบจุดรั่วไหลชัดเจน — สถิติแต่ละ Session อยู่ในเกณฑ์สมดุล';
  if (populated.length > 0 && populated[0].netPnlUsd < 0) {
    const worst = populated[0];
    biggestLeakText = `ช่วง ${worst.session} Winrate ${worst.winRatePct}% (สุทธิ ${worst.netPnlUsd.toFixed(
      2
    )} USD / เฉลี่ย ${worst.avgR}R) เป็นจุดที่ลด Equity มากที่สุด`;
  }

  return {
    sessions,
    overallWinRatePct,
    avgRMultiple,
    profitFactor,
    biggestLeakText,
  };
}

function toMinutesOfDay(timeHHMM: string): number | null {
  const m = String(timeHHMM || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number.parseInt(m[1], 10);
  const mm = Number.parseInt(m[2], 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

export function detectBehavioralGuardrails(
  journal: TradeRecord[],
  activePort: string,
  currentRiskUsd: number,
  todayIso: string,
  floatingPnlUsd: number = 0,
  initialBalance: number = 10000
): GuardrailAlert[] {
  const alerts: GuardrailAlert[] = [];
  const portTrades = (journal || []).filter((t) => t.port === activePort);
  const todayTrades = portTrades.filter((t) => t.date === todayIso);

  // 1. Revenge Trade detection: 2+ consecutive losses today or re-entry <= 20m after a loss
  if (todayTrades.length >= 2) {
    const sorted = [...todayTrades].sort((a, b) =>
      String(a.time || '').localeCompare(String(b.time || ''))
    );
    const latest = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    const prevLoss = Number(prev.pnlUsd) < 0 || prev.status === 'FULL_SL';
    const mLatest = toMinutesOfDay(latest.time);
    const mPrev = toMinutesOfDay(prev.time);
    const deltaMin = mLatest !== null && mPrev !== null ? Math.abs(mLatest - mPrev) : 999;
    const lossesToday = sorted.filter(
      (t) => Number(t.pnlUsd) < 0 || t.status === 'FULL_SL'
    ).length;

    if ((prevLoss && deltaMin <= 20) || lossesToday >= 2) {
      alerts.push({
        id: 'guard-revenge',
        code: 'REVENGE_TRADE',
        severity: 'critical',
        title: 'Revenge Trade Guardrail',
        detail:
          prevLoss && deltaMin <= 20
            ? `เปิดออเดอร์ซ้ำภายใน ${deltaMin} นาทีหลังไม้ก่อนหน้าขาดทุน แนะนำพัก cooldown 15 นาที`
            : `พบการขาดทุนสะสม ${lossesToday} ไม้ในวันเดียว ควรหยุดทบทวน 12-Gate ก่อนเข้าเพิ่ม`,
        metricBadge: deltaMin <= 20 ? `${deltaMin}m gap` : `${lossesToday} losses`,
      });
    }
  }

  // 2. Over-lot detection against rolling portfolio median risk
  const historicalRisks = portTrades
    .map((t) => Number(t.risk))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  const baselineRisk =
    historicalRisks.length > 0
      ? historicalRisks[Math.floor(historicalRisks.length / 2)]
      : 120;
  if (Number(currentRiskUsd) > baselineRisk * 1.35) {
    const ratio = +(Number(currentRiskUsd) / Math.max(1, baselineRisk)).toFixed(2);
    alerts.push({
      id: 'guard-overlot',
      code: 'OVER_LOT',
      severity: 'warning',
      title: 'Over-Lot Risk Warning',
      detail: `ความเสี่ยงต่อ Idea ปัจจุบัน ($${currentRiskUsd}) สูงกว่าค่ากลางพอร์ต ($${baselineRisk}) ถึง ${ratio} เท่า`,
      metricBadge: `${ratio}x median risk`,
    });
  }

  // 3. Off-session statistical leak detection
  const analytics = computeRealtimeAnalytics(journal, activePort);
  (Object.values(analytics.sessions) as SessionMetricsSummary[]).forEach((sess) => {
    if (sess.totalTrades >= 3 && sess.winRatePct < 40 && sess.netPnlUsd < 0) {
      alerts.push({
        id: `guard-session-${sess.session.toLowerCase()}`,
        code: 'OFF_SESSION_LEAK',
        severity: 'warning',
        title: `Off-Session Leak (${sess.session})`,
        detail: `ช่วง ${sess.session} มี Winrate ${sess.winRatePct}% จาก ${sess.totalTrades} ไม้ (สุทธิ ${sess.netPnlUsd.toFixed(
          0
        )} USD)`,
        metricBadge: `${sess.winRatePct}% WR`,
      });
    }
  });

  // 4. Daily Drawdown near 5% ceiling
  const telemetry = computeRealtimeTelemetryBar(
    { initial: initialBalance, balance: initialBalance },
    journal,
    activePort,
    todayIso,
    floatingPnlUsd
  );
  if (telemetry.dailyDrawdownUsedPct >= 75) {
    alerts.push({
      id: 'guard-daily-dd',
      code: 'DAILY_DD_NEAR_LIMIT',
      severity: telemetry.dailyDrawdownUsedPct >= 90 ? 'critical' : 'warning',
      title: 'Daily Drawdown Buffer Alert',
      detail: `ใช้งบขาดทุนรายวันไปแล้ว ${telemetry.dailyDrawdownUsedPct}% ($${telemetry.dailyDrawdownUsedUsd} / $${telemetry.dailyDrawdownLimitUsd})`,
      metricBadge: `${telemetry.dailyDrawdownUsedPct}% DD`,
    });
  }

  return alerts;
}

export function generateOrderSnapshotSvgDataUrl(
  trade: Pick<
    TradeRecord,
    | 'id'
    | 'dir'
    | 'entry'
    | 'slPrice'
    | 'tp1Price'
    | 'tp2Price'
    | 'tp3Price'
    | 'date'
    | 'time'
    | 'status'
    | 'pnlUsd'
  >
): string {
  const isBuy = trade.dir === 'BUY';
  const entry = Number(trade.entry || 2650);
  const sl = Number(trade.slPrice || (isBuy ? entry - 10 : entry + 10));
  const tp1 = Number(trade.tp1Price || (isBuy ? entry + 4 : entry - 4));
  const tp2 = Number(trade.tp2Price || (isBuy ? entry + 8 : entry - 8));
  const tp3 = Number(trade.tp3Price || (isBuy ? entry + 12 : entry - 12));
  const pnl = Number(trade.pnlUsd || 0);
  const pnlText = `${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toFixed(2)}`;
  const pnlColor = pnl >= 0 ? '#10B981' : '#EF4444';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 300" width="640" height="300">
  <rect width="640" height="300" rx="10" fill="#0A0B0D"/>
  <rect x="0" y="0" width="640" height="36" fill="#121418"/>
  <title>cdn.tallynx.com/snapshots/${trade.id}.svg</title>
  <text x="16" y="22" font-family="monospace" font-size="11" fill="#D5CEC7" font-weight="700">TallyNX · JOURNAL SNAPSHOT</text>
  <text x="624" y="22" text-anchor="end" font-family="monospace" font-size="11" fill="${pnlColor}" font-weight="700">${trade.dir} @ ${entry.toFixed(2)} (${pnlText})</text>
  <g stroke="#1E222B" stroke-width="1">
    <line x1="20" y1="80" x2="620" y2="80"/>
    <line x1="20" y1="140" x2="620" y2="140"/>
    <line x1="20" y1="200" x2="620" y2="200"/>
    <line x1="20" y1="255" x2="620" y2="255"/>
  </g>
  <line x1="36" y1="78" x2="540" y2="78" stroke="#10B981" stroke-width="1.5" stroke-dasharray="5 4"/>
  <text x="546" y="82" font-family="monospace" font-size="10" fill="#10B981">TP3 ${tp3.toFixed(2)}</text>
  <line x1="36" y1="106" x2="540" y2="106" stroke="#10B981" stroke-opacity="0.7" stroke-width="1" stroke-dasharray="3 3"/>
  <text x="546" y="110" font-family="monospace" font-size="10" fill="#34D399">TP2 ${tp2.toFixed(2)}</text>
  <line x1="36" y1="132" x2="540" y2="132" stroke="#10B981" stroke-opacity="0.5" stroke-width="1" stroke-dasharray="3 3"/>
  <text x="546" y="136" font-family="monospace" font-size="10" fill="#6EE7B7">TP1 ${tp1.toFixed(2)}</text>
  <line x1="36" y1="176" x2="540" y2="176" stroke="#3B82F6" stroke-width="2"/>
  <text x="546" y="180" font-family="monospace" font-size="10.5" font-weight="700" fill="#60A5FA">ENTRY ${entry.toFixed(2)}</text>
  <line x1="36" y1="238" x2="540" y2="238" stroke="#EF4444" stroke-width="1.5" stroke-dasharray="5 4"/>
  <text x="546" y="242" font-family="monospace" font-size="10" fill="#F87171">SL ${sl.toFixed(2)}</text>
  <path d="M50 212 L100 198 L155 206 L210 185 L265 176 L330 ${pnl >= 0 ? '118' : '232'} L410 ${pnl >= 0 ? '86' : '238'}" fill="none" stroke="${pnl >= 0 ? '#10B981' : '#EF4444'}" stroke-width="2.6" stroke-linecap="round"/>
  <circle cx="265" cy="176" r="5.5" fill="#3B82F6" stroke="#FFFFFF" stroke-width="1.5"/>
  <text x="16" y="286" font-family="monospace" font-size="10" fill="#9CA3AF">Timestamp: ${trade.date} ${trade.time} (ICT) · Outcome: ${trade.status} · Read-Only Ledger Captured</text>
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
