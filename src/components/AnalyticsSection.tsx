import React, { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowRight, Calculator, ChartNoAxesColumn, RefreshCw, ShieldAlert, ShieldCheck, TrendingUp, Users } from 'lucide-react';
import type { GuardrailAlert, RealtimeAnalyticsSummary } from '../utils/realtimeGuardrails';
import { navigateDeskTabs } from '../utils/navigateDeskTabs';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { GhrWorkspaceState, TradeRecord } from '../types/ghr';
import { DESK_I18N, deskText, formatAccountDisplayName, maskWorkspaceEmail, type DeskLanguage } from '../utils/deskI18n';
import { canFallbackToUsdWorkspace, formatPilotAmount } from '../utils/fundedNextPilot';
import type { PilotTelemetryView } from '../utils/fundedNextPilot';
import type { AnyLivePositionInput, LiveTelemetryPoint } from '../utils/liveTelemetryBuffer';
import { LivePositionMonitorCard, type LiveMonitorControlState } from './LivePositionMonitorCard';
import { PropAutopsyCard } from './PropAutopsyCard';
import {
  buildMonthlyConsistencyCalendar,
  buildSevenDayConsistencyCalendar,
  DEFAULT_TWELVE_GATES,
  evaluateConsistencyRule,
  evaluateTwelveGates,
  fmtUSD,
  getAccountComputed,
  getActiveConsistencyRule,
  getBangkokIsoDate,
  getBangkokTimestampStr,
  getDefaultCalendarMonthKey,
  workspaceBrandDisplayName,
  shiftMonthKey,
} from '../utils/ghrRules';

const EMPTY_TRADES: readonly TradeRecord[] = [];
const TH_MONTH_FORMATTER = new Intl.DateTimeFormat('th-TH-u-ca-gregory', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_TH = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const ANALYSIS_VIEWS = [
  { id: 'overview', en: 'Overview', th: 'ภาพรวม' },
  { id: 'performance', en: 'Performance', th: 'ผลเทรด' },
  { id: 'calendar', en: 'Calendar', th: 'ปฏิทิน' },
  { id: 'account', en: 'Account', th: 'บัญชี' },
] as const;
const PERFORMANCE_VIEWS = [
  { id: 'trend', en: 'Growth', th: 'การเติบโต' },
  { id: 'charts', en: 'Trade outcomes', th: 'ชนะและแพ้' },
  { id: 'stats', en: 'Stats', th: 'สถิติ' },
] as const;
const CALENDAR_VIEWS = [
  { id: 'week', en: '7 days', th: '7 วัน' },
  { id: 'month', en: 'Month', th: 'รายเดือน' },
] as const;

function AnalysisTabs<Id extends string>({ views, selected, onSelect, group, label, lang }: {
  views: readonly { id: Id; en: string; th: string }[];
  selected: Id;
  onSelect: (id: Id) => void;
  group: 'view' | 'performance' | 'calendar';
  label: string;
  lang: DeskLanguage;
}) {
  return (
    <div className={group === 'view' ? 'analysis-view-tabs' : 'analysis-subview-tabs'} role="tablist" aria-label={label} onKeyDown={navigateDeskTabs}>
      {views.map(({ id, en, th }) => (
        <button
          key={id}
          id={`analysis-${group}-${id}-tab`}
          type="button"
          role="tab"
          aria-controls={`analysis-${group}-panel`}
          aria-selected={selected === id}
          tabIndex={selected === id ? 0 : -1}
          onClick={() => onSelect(id)}
        >
          {deskText(lang, en, th)}
        </button>
      ))}
    </div>
  );
}

function formatWeekday(label: string, lang: DeskLanguage): string {
  return lang === 'th' ? WEEKDAYS_TH[WEEKDAYS_EN.indexOf(label)] ?? label : label;
}

const KineticNodesCanvas = React.lazy(() =>
  import('./KineticNodesCanvas').then((module) => ({ default: module.KineticNodesCanvas }))
);

interface AnalyticsSectionProps {
  state: GhrWorkspaceState;
  filteredJournal: TradeRecord[];
  ownerEmail?: string | null;
  lang?: DeskLanguage;
  pilotTelemetry?: PilotTelemetryView | null;
  livePositions?: readonly AnyLivePositionInput[];
  telemetrySeries?: readonly LiveTelemetryPoint[];
  liveMonitor?: LiveMonitorControlState;
  posture?: {
    sessions: RealtimeAnalyticsSummary['sessions'];
    dailyBufferUsd?: number;
    dailyLossUsedPct?: number;
    equityUsd?: number;
    floatingPnlUsd?: number;
    avgRMultiple?: number;
    alerts: GuardrailAlert[];
  };
  onManageAccounts: () => void;
  onInspectDateInJournal?: (isoDate: string) => void;
  onOpenMt5SyncModal?: () => void;
  onOpenCalculator?: () => void;
  onOpenMall?: () => void;
}

interface GrowthChartPoint {
  step: number;
  label: string;
  dateLabel: string;
  growthPct: number;
  cumulativePnl: number;
  equity: number;
  lots: number;
  tradePnl: number;
  tradeId: string;
  dir: string;
  note: string;
}

export const AnalyticsSection: React.FC<AnalyticsSectionProps> = React.memo(({
  state,
  filteredJournal,
  ownerEmail,
  lang = 'en',
  pilotTelemetry,
  livePositions,
  telemetrySeries,
  liveMonitor,
  posture,
  onManageAccounts,
  onInspectDateInJournal,
  onOpenMt5SyncModal,
  onOpenCalculator,
  onOpenMall,
}) => {
  const text = (en: string, th: string) => deskText(lang, en, th);
  const copy = DESK_I18N[lang].analytics;
  const [activeView, setActiveView] = useState<(typeof ANALYSIS_VIEWS)[number]['id']>('overview');
  const [performanceView, setPerformanceView] = useState<(typeof PERFORMANCE_VIEWS)[number]['id']>('trend');
  const [calendarView, setCalendarView] = useState<(typeof CALENDAR_VIEWS)[number]['id']>('week');
  const [accountView, setAccountView] = useState<'DETAILS' | 'FINANCIALS'>('DETAILS');
  const [growthMetric, setGrowthMetric] = useState<'GROWTH' | 'PNL' | 'EQUITY'>('GROWTH');
  const [zoomSlice, setZoomSlice] = useState<'ALL' | 'RECENT_15'>('ALL');
  const [bottomTab, setBottomTab] = useState<'DAILY' | 'HOURLY' | 'NODES_3D'>('DAILY');
  const [barMode, setBarMode] = useState<'COUNT' | 'USD'>('COUNT');
  const [calendarMonthKey, setCalendarMonthKey] = useState<string>(() =>
    getBangkokIsoDate().slice(0, 7)
  );
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null);

  const acc = useMemo(
    () => getAccountComputed(state.accounts, state.journal, state.activePort),
    [state.accounts, state.journal, state.activePort]
  );
  const accountName = formatAccountDisplayName(acc.name, lang);

  const portTrades = useMemo(
    () => state.journal.filter((j) => j.port === state.activePort),
    [state.journal, state.activePort]
  );

  const activeTrades = state.accounts[state.activePort] ? portTrades : filteredJournal;

  const todayStr = getBangkokIsoDate();
  const { todayCount, todayPnl } = useMemo(() => {
    let count = 0;
    let pnl = 0;
    for (const j of portTrades) {
      if (j.date === todayStr) {
        count++;
        pnl += Number(j.pnlUsd) || 0;
      }
    }
    return { todayCount: count, todayPnl: pnl };
  }, [portTrades, todayStr]);

  // Weekly PnL (last 7 days in Bangkok UTC+7)
  const sevenDaysAgo = useMemo(() => {
    const [y, m, d] = todayStr.split('-').map((n) => parseInt(n, 10));
    const dt = new Date(Date.UTC(y, m - 1, d - 7));
    return dt.toISOString().slice(0, 10);
  }, [todayStr]);

  const weeklyPnl = useMemo(() => {
    let total = 0;
    for (const j of portTrades) {
      if ((j.date || '') >= sevenDaysAgo) {
        total += Number(j.pnlUsd) || 0;
      }
    }
    return total;
  }, [portTrades, sevenDaysAgo]);

  const {
    winCount,
    lossCount,
    longCount,
    longWins,
    shortCount,
    shortWins,
    totalTrades,
    winRatio,
    lossRatio,
    avgWin,
    avgLoss,
    rrrVal,
    profitFactor,
  } = useMemo(() => {
    let totalWinAmt = 0;
    let winCount = 0;
    let totalLossAmt = 0;
    let lossCount = 0;
    let longCount = 0;
    let longWins = 0;
    let shortCount = 0;
    let shortWins = 0;
    let totalR = 0;

    for (const j of activeTrades) {
      const val = Number(j.pnlUsd) || 0;
      const rrVal = Number(j.rr) || 0;
      totalR += rrVal;
      if (val > 0) {
        totalWinAmt += val;
        winCount++;
      } else if (val < 0) {
        totalLossAmt += Math.abs(val);
        lossCount++;
      }
      if (j.dir === 'BUY') {
        longCount++;
        if (val > 0) longWins++;
      } else {
        shortCount++;
        if (val > 0) shortWins++;
      }
    }

    const totalTrades = activeTrades.length;
    const winRatio = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;
    const lossRatio = totalTrades > 0 ? (lossCount / totalTrades) * 100 : 0;
    const avgWin = winCount > 0 ? totalWinAmt / winCount : 0;
    const avgLoss = lossCount > 0 ? totalLossAmt / lossCount : 0;
    const rrrVal = avgLoss > 0 ? avgWin / avgLoss : totalTrades > 0 ? totalR / totalTrades : 0.8;
    const profitFactor =
      totalLossAmt > 0 ? totalWinAmt / totalLossAmt : totalWinAmt > 0 ? 9.99 : 0;

    return {
      winCount,
      lossCount,
      longCount,
      longWins,
      shortCount,
      shortWins,
      totalTrades,
      winRatio,
      lossRatio,
      avgWin,
      avgLoss,
      rrrVal,
      profitFactor,
    };
  }, [activeTrades]);

  const risk = Number(state.calcRisk) || 120;
  const maxBuffer = Math.max(0, acc.balance - acc.initial * 0.9);
  const roiPct = acc.initial > 0 ? (acc.profit / acc.initial) * 100 : 0;

  const twelveGateInfo = useMemo(
    () => evaluateTwelveGates(state.twelveGates || DEFAULT_TWELVE_GATES),
    [state.twelveGates]
  );
  const activeAccCfg = state.accounts[state.activePort];
  const consistencyRule = useMemo(
    () => getActiveConsistencyRule(state),
    [state.accounts, state.activePort, state.consistencyOverrides, state.includeFeeRefund]
  );
  const consistencyInfo = useMemo(
    () =>
      evaluateConsistencyRule(
        state.cycleDays,
        consistencyRule.includeFeeRefund,
        state.thbRate,
        consistencyRule
      ),
    [state.cycleDays, state.thbRate, consistencyRule]
  );
  const consistencyCalendar = useMemo(
    () => buildSevenDayConsistencyCalendar(portTrades, todayStr, consistencyRule.consistencyCapPct),
    [portTrades, todayStr, consistencyRule.consistencyCapPct]
  );

  useEffect(() => {
    setCalendarMonthKey(getDefaultCalendarMonthKey(portTrades, todayStr));
    setSelectedCalDate(null);
  }, [state.activePort, portTrades.length, todayStr]);

  const monthlyCalendar = useMemo(
    () =>
      buildMonthlyConsistencyCalendar(portTrades, {
        monthKey: calendarMonthKey,
        referenceDateStr: todayStr,
        consistencyCapPct: consistencyRule.consistencyCapPct,
      }),
    [portTrades, calendarMonthKey, todayStr, consistencyRule.consistencyCapPct]
  );

  const monthLabel = useMemo(
    () =>
      lang === 'en'
        ? monthlyCalendar.monthLabel
        : TH_MONTH_FORMATTER.format(new Date(`${monthlyCalendar.monthKey}-01T00:00:00Z`)),
    [lang, monthlyCalendar.monthLabel, monthlyCalendar.monthKey]
  );
  const tradeCountLabel = (count: number) => `${count} ${text(count === 1 ? 'trade' : 'trades', 'ไม้')}`;
  const compactTradeCount = (count: number) => text(`${count}T`, `${count} ไม้`);

  const selectedCalendarCell = useMemo(() => {
    if (selectedCalDate) {
      const match = monthlyCalendar.cells.find(
        (c) => c.date === selectedCalDate && c.isCurrentMonth
      );
      if (match) return match;
    }
    if (monthlyCalendar.bestDayDate) {
      return monthlyCalendar.cells.find((c) => c.date === monthlyCalendar.bestDayDate) || null;
    }
    return null;
  }, [monthlyCalendar, selectedCalDate]);

  // Build Growth Over Time chart data (with Lots bars + Growth % / PnL / Equity)
  const growthData: GrowthChartPoint[] = useMemo(() => {
    const chronological = [...portTrades].reverse();
    const initCap = acc.initial > 0 ? acc.initial : 6000;

    if (chronological.length === 0) {
      // Clean baseline trajectory points when account has 0 trades yet
      const baseDate = getBangkokIsoDate();
      return [
        {
          step: 0,
          label: `${baseDate} 08:00`,
          dateLabel: `${baseDate} 08:00`,
          growthPct: 0,
          cumulativePnl: 0,
          equity: initCap,
          lots: 0,
          tradePnl: 0,
          tradeId: 'START',
          dir: 'START',
          note: deskText(lang, 'Port starting point', 'จุดเริ่มต้นพอร์ต'),
        },
        {
          step: 1,
          label: `${baseDate} 12:00`,
          dateLabel: `${baseDate} 12:00`,
          growthPct: 0,
          cumulativePnl: 0,
          equity: initCap,
          lots: 0,
          tradePnl: 0,
          tradeId: 'NOW',
          dir: 'START',
          note: deskText(lang, 'Ready to record the first trade', 'พร้อมบันทึกออเดอร์แรก'),
        },
      ];
    }

    const pts: GrowthChartPoint[] = [
      {
        step: 0,
        label: chronological[0]?.date || deskText(lang, 'Start', 'เริ่มต้น'),
        dateLabel: `${chronological[0]?.date || ''} 00:00`,
        growthPct: 0,
        cumulativePnl: 0,
        equity: initCap,
        lots: 0,
        tradePnl: 0,
        tradeId: 'START',
        dir: 'START',
        note: deskText(lang, 'Port starting point', 'เริ่มต้นพอร์ต'),
      },
    ];

    let runningPnl = 0;
    chronological.forEach((t, idx) => {
      const pnl = Number(t.pnlUsd) || 0;
      runningPnl = +(runningPnl + pnl).toFixed(2);
      const eq = +(initCap + runningPnl).toFixed(2);
      const gPct = +((runningPnl / initCap) * 100).toFixed(3);
      const noteLotMatch = /·\s*([\d.]+)L\)/.exec(t.note || '');
      const parsedTotalLots = noteLotMatch ? Number(noteLotMatch[1]) : NaN;
      const totalLots = Number.isFinite(parsedTotalLots) && parsedTotalLots > 0
        ? +parsedTotalLots.toFixed(2)
        : String(t.id || '').startsWith('MT5-') && (t.note || '').includes('(1 ไม้')
        ? +(Number(t.lotLeg) || 0.04).toFixed(2)
        : +((Number(t.lotLeg) || 0.04) * 3).toFixed(2);
      const baseTimeLabel = `${t.date.slice(5)} ${t.time || ''}`.trim();
      pts.push({
        step: idx + 1,
        label: chronological.length > 1 ? `#${idx + 1} ${t.date.slice(5)}` : baseTimeLabel,
        dateLabel: `${t.date} ${t.time || ''}`.trim(),
        growthPct: gPct,
        cumulativePnl: runningPnl,
        equity: eq,
        lots: totalLots,
        tradePnl: pnl,
        tradeId: t.id,
        dir: t.dir,
        note: t.note || '',
      });
    });

    if (zoomSlice === 'RECENT_15' && pts.length > 15) {
      return pts.slice(-15);
    }
    return pts;
  }, [portTrades, acc.initial, zoomSlice, lang]);

  // Daily Won / Lost Stacked Bar Data
  const dailyBarData = useMemo(() => {
    const map: Record<
      string,
      { label: string; wonCount: number; lostCount: number; wonUsd: number; lostUsd: number }
    > = {};

    const chronological = [...activeTrades].reverse();
    chronological.forEach((t) => {
      const d = t.date || 'UNSPECIFIED';
      if (!map[d]) {
        map[d] = {
          label: t.date ? d.slice(5) : deskText(lang, 'No date', 'ไม่ระบุ'),
          wonCount: 0,
          lostCount: 0,
          wonUsd: 0,
          lostUsd: 0,
        };
      }
      const pnl = Number(t.pnlUsd) || 0;
      if (pnl >= 0) {
        map[d].wonCount += 1;
        map[d].wonUsd = +(map[d].wonUsd + pnl).toFixed(2);
      } else {
        map[d].lostCount += 1;
        map[d].lostUsd = +(map[d].lostUsd + Math.abs(pnl)).toFixed(2);
      }
    });

    const keys = Object.keys(map).sort();
    if (keys.length === 0) {
      return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d) => ({
        label: formatWeekday(d, lang),
        wonCount: 0,
        lostCount: 0,
        wonUsd: 0,
        lostUsd: 0,
      }));
    }
    return keys.slice(-10).map((k) => map[k]);
  }, [activeTrades, lang]);

  // Hourly Won / Lost Stacked Bar Data
  const hourlyBarData = useMemo(() => {
    const map: Record<
      string,
      { label: string; wonCount: number; lostCount: number; wonUsd: number; lostUsd: number }
    > = {};

    activeTrades.forEach((t) => {
      const hr = (t.time || '12:00').slice(0, 2) + ':00';
      if (!map[hr]) {
        map[hr] = {
          label: hr,
          wonCount: 0,
          lostCount: 0,
          wonUsd: 0,
          lostUsd: 0,
        };
      }
      const pnl = Number(t.pnlUsd) || 0;
      if (pnl >= 0) {
        map[hr].wonCount += 1;
        map[hr].wonUsd = +(map[hr].wonUsd + pnl).toFixed(2);
      } else {
        map[hr].lostCount += 1;
        map[hr].lostUsd = +(map[hr].lostUsd + Math.abs(pnl)).toFixed(2);
      }
    });

    const keys = Object.keys(map).sort();
    if (keys.length === 0) {
      return ['09:00', '13:00', '15:00', '19:00', '21:00'].map((h) => ({
        label: h,
        wonCount: 0,
        lostCount: 0,
        wonUsd: 0,
        lostUsd: 0,
      }));
    }
    return keys.map((k) => map[k]);
  }, [activeTrades]);

  const activeBarSeries = bottomTab === 'HOURLY' ? hourlyBarData : dailyBarData;

  const firstTradeDate =
    portTrades.length > 0
      ? `${portTrades[portTrades.length - 1].date} ${portTrades[portTrades.length - 1].time || '09:00'}`
      : getBangkokIsoDate() + ' 08:00:00';

  const lastSyncIso =
    activeAccCfg?.lastMt5SyncAt ||
    pilotTelemetry?.lastCheckedAt ||
    pilotTelemetry?.fetchedAt ||
    state.lastSavedAt;
  const lastUpdatedStr = lastSyncIso
    ? getBangkokTimestampStr(new Date(lastSyncIso))
    : getBangkokTimestampStr();

  const isPilot = activeAccCfg?.syncProvider === 'FUNDEDNEXT_MCP';
  const pilotCurrency = pilotTelemetry?.currency;
  const allowUsdFallback = !isPilot || canFallbackToUsdWorkspace(pilotCurrency);
  const pilotInitial = Number(pilotTelemetry?.initialBalance);
  const pilotProfit =
    pilotTelemetry?.netProfit != null && Number.isFinite(Number(pilotTelemetry.netProfit))
      ? Number(pilotTelemetry.netProfit)
      : undefined;
  const displayProfit = isPilot
    ? pilotProfit !== undefined
      ? pilotProfit
      : allowUsdFallback
        ? acc.profit
        : undefined
    : acc.profit;
  const pilotRoiPct = pilotProfit !== undefined && Number.isFinite(pilotInitial) && pilotInitial > 0
    ? (pilotProfit / pilotInitial) * 100
    : undefined;
  const displayRoiPct = isPilot
    ? pilotRoiPct !== undefined
      ? pilotRoiPct
      : allowUsdFallback
        ? roiPct
        : undefined
    : roiPct;

  const pilotBalanceText =
    pilotTelemetry?.balance != null
      ? formatPilotAmount(pilotTelemetry.balance, pilotCurrency)
      : allowUsdFallback
        ? fmtUSD(acc.balance)
        : '—';
  const pilotEquityText =
    pilotTelemetry?.equity != null
      ? formatPilotAmount(pilotTelemetry.equity, pilotCurrency)
      : pilotTelemetry?.balance != null
        ? formatPilotAmount(pilotTelemetry.balance, pilotCurrency)
        : allowUsdFallback
          ? fmtUSD(acc.balance)
          : '—';
  const floatingPnl = isPilot ? pilotTelemetry?.floatingPnl : posture?.floatingPnlUsd;
  const bridge = liveMonitor?.provider === 'LIVE_BRIDGE' && liveMonitor.connected ? liveMonitor : undefined;
  const floatingPnlText = isPilot
    ? formatPilotAmount(pilotTelemetry?.floatingPnl, pilotCurrency, true)
    : bridge?.floatingPnl != null ? formatPilotAmount(bridge.floatingPnl, bridge.currency, true)
      : floatingPnl == null || !Number.isFinite(Number(floatingPnl)) ? '—' : fmtUSD(Number(floatingPnl), true);
  const pilotProfitText =
    pilotProfit !== undefined
      ? formatPilotAmount(pilotProfit, pilotCurrency, true)
      : allowUsdFallback
        ? fmtUSD(acc.profit, true)
        : '—';

  // SVG Gauge calculation for Won | Lost semi-circle
  const radius = 44;
  const circumference = Math.PI * radius; // ~138.23
  const winArcLength =
    totalTrades > 0 ? (winCount / totalTrades) * circumference : 0;
  const autopsyCard = (
    <PropAutopsyCard
      key={state.activePort}
      lang={lang}
      account={activeAccCfg}
      report={activeAccCfg ? state.mt5RawReports?.[state.activePort] : undefined}
      journal={activeAccCfg ? portTrades : EMPTY_TRADES}
      mt5TimeOffset={state.mt5TimeOffset}
      privacyMasked={state.privacyMasked}
      onApplyGuardrailsToPlan={onOpenCalculator}
    />
  );

  return (
    <section id="sec-accounts" className="fx-analysis-root fx-workstation" aria-labelledby="analysis-overview-title">
      <h1 id="analysis-overview-title">{text('Portfolio analysis', 'วิเคราะห์พอร์ต')}</h1>
      <AnalysisTabs views={ANALYSIS_VIEWS} selected={activeView} onSelect={setActiveView}
        group="view" label={text('Analysis views', 'มุมมองการวิเคราะห์')} lang={lang} />
      <section id="analysis-view-panel" className="analysis-view" data-view={activeView} role="tabpanel" aria-labelledby={`analysis-view-${activeView}-tab`} tabIndex={0}>
      {!activeAccCfg ? (<>
        <div className="desk-module-status analysis-empty">
          <h2>{text('No account selected', 'ยังไม่ได้เลือกบัญชี')}</h2>
          <button type="button" className="btn xs" onClick={onManageAccounts} aria-haspopup="dialog">
            {text('Manage accounts', 'จัดการบัญชี')}
          </button>
        </div>
        {activeView === 'overview' && autopsyCard}
      </>) : <>
      {activeView === 'overview' && <>
      {liveMonitor && (
        <LivePositionMonitorCard
          lang={lang}
          accountName={accountName}
          accountLogin={activeAccCfg.login}
          livePositions={livePositions ?? []}
          telemetrySeries={telemetrySeries ?? []}
          liveMonitor={liveMonitor}
          onOpenSyncModal={onOpenMt5SyncModal}
        />
      )}

      <div className="fx-kpi-row-4 desk-kpi-band analysis-overview-kpis" role="group" aria-label={text('Portfolio metrics', 'ตัวชี้วัดพอร์ต')}>
        <div className="fx-stat-card">
          <div className="fx-stat-label">{copy.balance}</div>
          <div className="fx-stat-val mono sensitive-val">
            {isPilot ? pilotBalanceText : bridge?.balance != null ? formatPilotAmount(bridge.balance, bridge.currency) : fmtUSD(acc.balance)}
          </div>
        </div>

        <div className="fx-stat-card">
          <div className="fx-stat-label">{copy.equity}</div>
          <div className="fx-stat-val mono sensitive-val">
            {isPilot ? pilotEquityText : bridge?.equity != null ? formatPilotAmount(bridge.equity, bridge.currency) : fmtUSD(posture?.equityUsd ?? acc.balance)}
          </div>
        </div>

        <div className="fx-stat-card">
          <div className="fx-stat-label">{copy.growth}</div>
          <div className="fx-stat-val mono" data-negative={(displayRoiPct ?? 0) < -0.001} data-positive={(displayRoiPct ?? 0) >= 0.005}>
            {displayRoiPct === undefined ? '—' : `${displayRoiPct > 0 ? '+' : ''}${displayRoiPct.toFixed(2)}%`}
          </div>
        </div>

        <div className="fx-stat-card">
          <div className="fx-stat-label">{copy.profit}</div>
          <div
            className="fx-stat-val mono sensitive-val"
            data-negative={(displayProfit ?? 0) < 0}
            data-positive={(displayProfit ?? 0) > 0}
          >
            {isPilot ? pilotProfitText : fmtUSD(acc.profit, true)}
          </div>
        </div>
      </div>

      {autopsyCard}

      <div className="analysis-overview-grid">
        <section className="card analysis-overview-main" aria-label={text('Portfolio overview insight', 'มุมมองหลักของพอร์ต')}>
          {portTrades.length > 0 ? (
            <>
              <div className="card-header" style={{ paddingBottom: '8px' }}>
                <div>
                  <h2 className="card-title desk-icon-title">
                    <TrendingUp size={16} aria-hidden="true" />
                    {copy.growthOverTime}
                  </h2>
                  <div className="fx-meta-inline mono">
                    {accountName} · {tradeCountLabel(portTrades.length)}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn xs"
                  onClick={() => setActiveView('performance')}
                >
                  <span>{text('Full analytics', 'ดูกราฟเต็ม')}</span>
                  <ArrowRight size={12} aria-hidden="true" />
                </button>
              </div>
              <div className="fx-chart-frame" style={{ height: '220px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={growthData} margin={{ top: 8, right: 12, left: -12, bottom: 2 }}>
                    <defs>
                      <linearGradient id="fxOverviewFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--desk-chart-line)" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="var(--desk-chart-line)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border-color)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      minTickGap={24}
                      tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
                      axisLine={{ stroke: 'var(--border-strong)' }}
                      tickLine={false}
                    />
                    <YAxis
                      width={46}
                      tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                    />
                    <ReferenceLine y={0} stroke="var(--border-strong)" strokeDasharray="3 3" />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        fontSize: '11.5px',
                      }}
                      formatter={(val) => [`${Number(val ?? 0).toFixed(2)}%`, copy.growth]}
                    />
                    <Area
                      type="monotone"
                      dataKey="growthPct"
                      stroke="var(--desk-chart-line)"
                      strokeWidth={2}
                      fill="url(#fxOverviewFill)"
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <div className="analysis-quickstart-card">
              <div className="analysis-quickstart-head">
                <span className="desk-tag mono">{accountName}</span>
                <h3>{text('Get started with this account', 'เริ่มใช้พอร์ตนี้')}</h3>
                <p>
                  {text(
                    'No closed trades recorded for this account yet.',
                    'พอร์ตนี้ยังไม่มีบันทึกเทรดที่ปิดแล้ว'
                  )}
                </p>
              </div>
              <div className="analysis-quickstart-steps">
                <button
                  type="button"
                  className="analysis-step-btn"
                  onClick={() => (onOpenMt5SyncModal ? onOpenMt5SyncModal() : onManageAccounts())}
                >
                  <span className="analysis-step-ico"><RefreshCw size={15} aria-hidden="true" /></span>
                  <span className="analysis-step-copy">
                    <strong>{text('1. Connect MT5 or Import .xlsx', '1. เชื่อมต่อ MT5 หรือนำเข้า .xlsx')}</strong>
                    <small>{text('Read-only FundedNext MCP, Myfxbook, or Excel report', 'ซิงก์แบบอ่านอย่างเดียวผ่าน FundedNext MCP หรือ Myfxbook หรือนำเข้าไฟล์ Excel จาก MT5')}</small>
                  </span>
                  <ArrowRight size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="analysis-step-btn"
                  onClick={() => (onOpenCalculator ? onOpenCalculator() : setActiveView('account'))}
                >
                  <span className="analysis-step-ico"><Calculator size={15} aria-hidden="true" /></span>
                  <span className="analysis-step-copy">
                    <strong>{text('2. Size Your Next 3-TP Setup', '2. คำนวณ Lot และแผน 3-TP')}</strong>
                    <small>{text('Calculate lot sizes from your dollar risk and check the consistency cap.', 'คำนวณล็อตจากงบความเสี่ยงเป็นดอลลาร์ แล้วเช็กเพดาน Consistency')}</small>
                  </span>
                  <ArrowRight size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="analysis-step-btn"
                  onClick={() => (onOpenMall ? onOpenMall() : setActiveView('performance'))}
                >
                  <span className="analysis-step-ico"><Users size={15} aria-hidden="true" /></span>
                  <span className="analysis-step-copy">
                    <strong>{text('3. Open Community Mall', '3. เข้าห้อง Community Mall')}</strong>
                    <small>{text('Compare 3-TP blueprints and read notes from closed sessions.', 'เทียบแผน 3-TP และอ่านบันทึกรอบเทรดที่จบแล้ว')}</small>
                  </span>
                  <ArrowRight size={14} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </section>

        {posture && (
          <section className="risk-posture" aria-labelledby="analysis-risk-title">
            <header className="desk-band-heading">
              <h2 id="analysis-risk-title"><Activity size={17} aria-hidden="true" />{text('Trading risk', 'ความเสี่ยงการเทรด')}</h2>
              <span className="posture-alerts" data-alert={posture.alerts.length > 0}>
                {posture.alerts.length ? <ShieldAlert size={14} aria-hidden="true" /> : <ShieldCheck size={14} aria-hidden="true" />}
                {posture.alerts.length ? text(`${posture.alerts.length} alerts`, `แจ้งเตือน ${posture.alerts.length} รายการ`) : text('No alerts', 'ไม่มีการแจ้งเตือน')}
              </span>
            </header>
            <div className="posture-grid">
              <div className="posture-cell">
                <small>{text('Daily loss buffer', 'วงเงินขาดทุนรายวันที่เหลือ')}</small>
                <strong className="mono sensitive-val" data-negative={posture.dailyBufferUsd != null && posture.dailyBufferUsd <= 0}>
                  {posture.dailyBufferUsd == null ? '—' : fmtUSD(posture.dailyBufferUsd)}
                </strong>
                {posture.dailyLossUsedPct != null && (
                  <small>{text('Limit used', 'ใช้วงเงินแล้ว')} <span className="mono">{posture.dailyLossUsedPct}%</span></small>
                )}
              </div>
              <div className="posture-cell">
                <small>{text('Consistency cap', 'เพดานกำไรรายวัน')}</small>
                <strong className="mono">{consistencyInfo.hasConsistencyCap ? consistencyInfo.capPct + '%' : text('Off', 'ปิด')}</strong>
              </div>
              <div className="posture-cell posture-sessions">
                <small>{text('Session win rates', 'อัตราชนะตามเซสชัน')}</small>
                <div>{Object.values(posture.sessions).map(session => (
                  <div key={session.session} className="session-rate" data-session={session.session}>
                    <span>{session.session === 'ASIA' ? text('Asia', 'เอเชีย') : session.session === 'LONDON' ? text('London', 'ลอนดอน') : text('NY', 'นิวยอร์ก')}</span>
                    <b className="mono">{session.totalTrades ? session.winRatePct + '%' : '—'}</b>
                    <span className="session-rate-track" aria-hidden="true"><span style={{ width: session.winRatePct + '%' }} /></span>
                  </div>
                ))}</div>
              </div>
            </div>
            <dl className="analysis-risk-readings">
              <div>
                <dt>{text('Floating P&L', 'กำไร/ขาดทุนลอยตัว')}</dt>
                <dd className="mono sensitive-val" data-negative={Number(floatingPnl) < 0}>{floatingPnlText}</dd>
              </div>
              <div>
                <dt>{text('Avg. R', 'R เฉลี่ย')}</dt>
                <dd className="mono" data-negative={(posture.avgRMultiple ?? 0) < 0}>
                  {posture.avgRMultiple == null ? '—' : posture.avgRMultiple + 'R'}
                </dd>
              </div>
              {isPilot && (
                <div>
                  <dt>{text('Open positions', 'สถานะที่เปิดอยู่')}</dt>
                  <dd className="mono">{pilotTelemetry?.openPositions?.length ?? '—'}</dd>
                </div>
              )}
            </dl>
          </section>
        )}
      </div>

      <section className="card analysis-week-strip" aria-label={copy.consistency7d}>
        <header className="fx-consistency-head">
          <div className="fx-consistency-title-group">
            <h3 className="fx-card-heading">{copy.consistency7d}</h3>
            <span className="fx-consistency-meta mono">
              {!consistencyInfo.hasConsistencyCap
                ? text(`Cap off · ${consistencyCalendar.activeDays} active days`, `ปิดเพดาน · เทรด ${consistencyCalendar.activeDays} วัน`)
                : text(`${consistencyCalendar.metCount}/${consistencyCalendar.activeDays} days within ${consistencyInfo.capPct}% cap`, `ผ่านเพดาน ${consistencyInfo.capPct}% จำนวน ${consistencyCalendar.metCount}/${consistencyCalendar.activeDays} วัน`)}
            </span>
          </div>
          <button type="button" className="btn xs" onClick={() => setActiveView('calendar')}>
            <span>{copy.openMonthlyCal}</span>
            <ArrowRight size={12} aria-hidden="true" />
          </button>
        </header>
        <div className="fx-consistency-grid">
          {consistencyCalendar.days.map((day) => {
            const statusClass =
              day.status === 'MET_40'
                ? 'is-met40'
                : day.status === 'POSITIVE_OVER_40'
                ? 'is-pos-over'
                : day.status === 'NEGATIVE'
                ? 'is-neg'
                : day.status === 'BREAK_EVEN'
                ? 'is-even'
                : 'is-empty';
            return (
              <button
                key={day.date}
                type="button"
                className={`fx-heatmap-cell fx-heatmap-cell-btn ${statusClass}`}
                onClick={() => (day.tradeCount > 0 && onInspectDateInJournal ? onInspectDateInJournal(day.date) : setActiveView('calendar'))}
              >
                <div className="fx-heatmap-top">
                  <span className="fx-heatmap-day">{formatWeekday(day.weekdayShort, lang)} {day.shortDate}</span>
                  <span className="fx-heatmap-trades mono">{day.tradeCount > 0 ? compactTradeCount(day.tradeCount) : '—'}</span>
                </div>
                <div className="fx-heatmap-bottom">
                  <span className="fx-heatmap-pnl mono sensitive-val">{day.tradeCount > 0 ? fmtUSD(day.pnl, true) : '$0'}</span>
                  <span className="fx-heatmap-share mono">
                    {day.pnl > 0 ? `${day.sharePct}%` : day.status === 'NEGATIVE' ? text('LOSS', 'ขาดทุน') : '—'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
      </>}

      {activeView === 'account' && (
        <div className="fx-tabbed-container">
          <div className="analysis-account-controls">
            <div className="fx-folder-tabs" role="tablist" onKeyDown={navigateDeskTabs} aria-label={text('Account views', 'มุมมองบัญชี')}>
            <button
              type="button"
              role="tab"
              id="analysis-account-DETAILS-tab"
              aria-controls="analysis-account-panel"
              aria-selected={accountView === 'DETAILS'}
              tabIndex={accountView === 'DETAILS' ? 0 : -1}
              className={`fx-folder-tab ${accountView === 'DETAILS' ? 'active' : ''}`}
              onClick={() => setAccountView('DETAILS')}
            >
              {copy.tabDetails}
            </button>
            <button
              type="button"
              role="tab"
              id="analysis-account-FINANCIALS-tab"
              aria-controls="analysis-account-panel"
              aria-selected={accountView === 'FINANCIALS'}
              tabIndex={accountView === 'FINANCIALS' ? 0 : -1}
              className={`fx-folder-tab ${accountView === 'FINANCIALS' ? 'active' : ''}`}
              onClick={() => setAccountView('FINANCIALS')}
            >
              {copy.tabFinancials}
            </button>
            </div>
            <button type="button" className="btn xs analysis-manage-accounts" onClick={onManageAccounts} aria-haspopup="dialog">
              {text('Manage accounts', 'จัดการบัญชี')}
            </button>
          </div>

          <div className="fx-tab-panel-card fx-account-panel" id="analysis-account-panel" role="tabpanel" aria-labelledby={`analysis-account-${accountView}-tab`} tabIndex={0}>
            {accountView === 'DETAILS' && (
              <div className="fx-kv-table">
                <div className="fx-kv-row">
                  <span className="fx-kv-key">{copy.account}</span>
                  <span className="fx-kv-val mono">
                    {acc.login} <strong>({accountName})</strong>
                  </span>
                </div>
                <div className="fx-kv-row">
                  <span className="fx-kv-key">{copy.broker}</span>
                  <span className="fx-kv-val">
                    {acc.brokerName || (acc.accountType === 'PERSONAL' ? text('Personal Broker MT5', 'โบรกเกอร์ MT5 ส่วนตัว') : text('Prop Firm MT5', 'กองทุน MT5'))}
                  </span>
                </div>
                <div className="fx-kv-row">
                  <span className="fx-kv-key">{copy.brokerServer}</span>
                  <span className="fx-kv-val mono">
                    {acc.brokerServer || (acc.accountType === 'PERSONAL' ? 'Broker-MT5Real' : 'XAUUSD-Live')}
                  </span>
                </div>
                <div className="fx-kv-row">
                  <span className="fx-kv-key">{copy.mt5Sync}</span>
                  <span className="fx-kv-val mono">
                    {acc.syncProvider === 'LIVE_BRIDGE'
                      ? 'Live Bridge (.ex5)'
                      : acc.syncProvider === 'FUNDEDNEXT_MCP'
                      ? text('FundedNext Official MCP', 'MCP ทางการของ FundedNext')
                      : acc.syncProvider === 'MYFXBOOK_API'
                      ? 'Myfxbook Cloud API'
                      : acc.syncProvider === 'PROJECTX_API'
                      ? 'ProjectX / TopstepX API'
                      : text('Manual (.xlsx)', 'นำเข้าเอง (.xlsx)')}
                  </span>
                </div>
                <div className="fx-kv-row">
                  <span className="fx-kv-key">{copy.client}</span>
                  <span className="fx-kv-val">
                    {workspaceBrandDisplayName(state.deskBrandName)} · {ownerEmail?.includes('@') ? maskWorkspaceEmail(ownerEmail) : text('Guest Workspace', 'พื้นที่ทำงานผู้เยี่ยมชม')}
                  </span>
                </div>
                <div className="fx-kv-row">
                  <span className="fx-kv-key">{copy.type}</span>
                  <span className="fx-kv-val">
                    {acc.accountType === 'PERSONAL' ? text('Personal', 'พอร์ตส่วนตัว') : text('Prop', 'พอร์ตกองทุน')}
                    {' · '}{text(`${consistencyRule.profitSplitPct}% split`, `ส่วนแบ่ง ${consistencyRule.profitSplitPct}%`)}
                    {' · '}{consistencyInfo.hasConsistencyCap ? text(`${consistencyInfo.capPct}% cap`, `เพดาน ${consistencyInfo.capPct}%`) : text('Cap off', 'ปิดเพดาน')}
                  </span>
                </div>
                <div className="fx-kv-row">
                  <span className="fx-kv-key">{copy.currency}</span>
                  <span className="fx-kv-val mono">{isPilot && pilotCurrency && pilotCurrency !== 'USD' ? pilotCurrency : `USD (${text('THB ', '฿')}${state.thbRate})`}</span>
                </div>
                <div className="fx-kv-row">
                  <span className="fx-kv-key">{copy.leverageLot}</span>
                  <span className="fx-kv-val mono">
                    100 ({(risk / 3000).toFixed(2)}L × 3)
                  </span>
                </div>
                <div className="fx-kv-row">
                  <span className="fx-kv-key">{copy.startedTrading}</span>
                  <span className="fx-kv-val mono">{firstTradeDate}</span>
                </div>
                <div className="fx-kv-row">
                  <span className="fx-kv-key">{copy.lastUpdated}</span>
                  <span className="fx-kv-val mono">{lastUpdatedStr}</span>
                </div>
              </div>
            )}

            {accountView === 'FINANCIALS' && (
              <div className="fx-kv-table">
                <div className="fx-kv-row">
                  <span className="fx-kv-key">{copy.initialDeposit}</span>
                  <span className="fx-kv-val mono sensitive-val">{fmtUSD(acc.initial)}</span>
                </div>
                <div className="fx-kv-row">
                  <span className="fx-kv-key">
                    {acc.accountType === 'PERSONAL' ? copy.targetGoal : copy.targetProfit}
                  </span>
                  <span className="fx-kv-val mono sensitive-val">+{fmtUSD(acc.targetProfit)}</span>
                </div>
                <div className="fx-kv-row">
                  <span className="fx-kv-key">{copy.targetRemaining}</span>
                  <span className="fx-kv-val mono sensitive-val">{fmtUSD(acc.rem)}</span>
                </div>
                <div className="fx-kv-row">
                  <span className="fx-kv-key">{copy.dailyQuota}</span>
                  <span className="fx-kv-val mono">{todayCount} / 3 {copy.tradesUnit}</span>
                </div>
                <div className="fx-kv-row">
                  <span className="fx-kv-key">
                    {acc.accountType === 'PERSONAL' ? copy.dailyStopGuard : copy.dailyLossRem}
                  </span>
                  <span className="fx-kv-val mono sensitive-val">
                    {posture?.dailyBufferUsd == null ? '—' : fmtUSD(posture.dailyBufferUsd)}
                  </span>
                </div>
                <div className="fx-kv-row">
                  <span className="fx-kv-key">
                    {acc.accountType === 'PERSONAL' ? copy.drawdown10Guard : copy.maxDdBuffer}
                  </span>
                  <span className="fx-kv-val mono sensitive-val">
                    {fmtUSD(maxBuffer)} ({risk > 0 ? (maxBuffer / risk).toFixed(1) : '0.0'} {copy.tradesUnit})
                  </span>
                </div>
                <div className="fx-kv-row">
                  <span className="fx-kv-key">{copy.riskPerIdea}</span>
                  <span className="fx-kv-val mono sensitive-val">{fmtUSD(risk)}</span>
                </div>
                <div className="fx-kv-row">
                  <span className="fx-kv-key">{copy.tradingDays}</span>
                  <span className="fx-kv-val mono">
                    {acc.accountType === 'PERSONAL'
                      ? `${acc.currentDays} ${copy.daysUnit} (${acc.tradeCount} ${copy.tradesUnit})`
                      : `${acc.currentDays} / ${acc.minDays} ${copy.daysUnit}`}
                  </span>
                </div>
                <div className="fx-kv-row">
                  <span className="fx-kv-key">{text('12-Gate Protocol', 'ด่านตรวจ 12 ข้อ')}</span>
                  <span className="fx-kv-val mono">{twelveGateInfo.passedCount} / 12 {copy.gatesUnit}</span>
                </div>
                <div className="fx-kv-row">
                  <span className="fx-kv-key">
                    {consistencyInfo.hasConsistencyCap ? text(`${consistencyInfo.capPct}% Consistency`, `ความสม่ำเสมอ ${consistencyInfo.capPct}%`) : text('Account Rule', 'กฎพอร์ต')}
                  </span>
                  <span className="fx-kv-val">
                    {consistencyInfo.hasConsistencyCap
                      ? consistencyInfo.isPass
                        ? `${copy.passedRule} (≤${consistencyInfo.capPct}%)`
                        : copy.accumulating
                      : copy.noPctLimitPersonal}
                  </span>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {activeView === 'performance' && (
        <AnalysisTabs views={PERFORMANCE_VIEWS} selected={performanceView} onSelect={setPerformanceView}
          group="performance" label={text('Performance views', 'มุมมองผลเทรด')} lang={lang} />
      )}
      {activeView === 'calendar' && (
        <AnalysisTabs views={CALENDAR_VIEWS} selected={calendarView} onSelect={setCalendarView}
          group="calendar" label={text('Calendar views', 'มุมมองปฏิทิน')} lang={lang} />
      )}

      {activeView === 'performance' && (
        <div className="analysis-subview" id="analysis-performance-panel" role="tabpanel" aria-labelledby={`analysis-performance-${performanceView}-tab`} tabIndex={0}>
          {performanceView === 'trend' && (
            <div className="fx-tab-panel-card" id="cumulative-pnl-chart-card">
                <div className="fx-chart-header">
                  <h2 className="fx-card-heading">{copy.growthOverTime}</h2>

                  <div className="fx-chart-legend">
                    <span className="fx-legend-item">
                      <span className="fx-swatch-lots" />
                      {text('Lots', 'ล็อต')}
                    </span>
                    <span className="fx-legend-item">
                      <span className="fx-swatch-growth" />
                      {growthMetric === 'GROWTH'
                        ? copy.growth
                        : growthMetric === 'PNL'
                        ? text('Profit ($)', 'กำไร ($)')
                        : text('Equity ($)', 'มูลค่าพอร์ต ($)')}
                    </span>
                  </div>

                  <div className="fx-chart-actions">
                    <button
                      type="button"
                      className="fx-blue-btn"
                      onClick={() => {
                        setZoomSlice((prev) => (prev === 'ALL' ? 'RECENT_15' : 'ALL'));
                        setGrowthMetric('GROWTH');
                      }}
                      title={text('Change the growth chart zoom', 'เปลี่ยนช่วงเวลาบนกราฟการเติบโต')}
                    >
                      {zoomSlice === 'ALL' ? text('Reset Zoom', 'รีเซ็ตการซูม') : text('Show All', 'แสดงทั้งหมด')}
                    </button>

                    <select
                      className="fx-select"
                      aria-label={text('Choose a growth chart metric', 'เลือกตัวชี้วัดบนกราฟการเติบโต')}
                      value={growthMetric}
                      onChange={(e) =>
                        setGrowthMetric(e.target.value as 'GROWTH' | 'PNL' | 'EQUITY')
                      }
                    >
                      <option value="GROWTH">{copy.growth}</option>
                      <option value="PNL">{text('Profit ($)', 'กำไร ($)')}</option>
                      <option value="EQUITY">{text('Equity ($)', 'มูลค่าพอร์ต ($)')}</option>
                    </select>
                  </div>
                </div>

                <div className="fx-chart-frame fx-chart-frame-growth">
                  {portTrades.length === 0 ? (
                    <div className="desk-chart-empty"><ChartNoAxesColumn size={22} aria-hidden="true" />
                      <strong>{text('No portfolio history yet', 'ยังไม่มีประวัติของพอร์ตนี้')}</strong>
                      <span>{text('Record a trade or import MT5 history to plot account growth.', 'บันทึกการเทรดหรือนำเข้าประวัติ MT5 เพื่อดูการเติบโตของพอร์ต')}</span>
                    </div>
                  ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={growthData}
                      margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                    >
                      <defs>
                        <linearGradient id="fxGrowthFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--desk-chart-line)" stopOpacity={0.15} />
                          <stop offset="100%" stopColor="var(--desk-chart-line)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>

                      <CartesianGrid stroke="var(--border-color)" vertical={false} />

                      <XAxis
                        dataKey="label"
                        angle={-38}
                        textAnchor="end"
                        height={50}
                        minTickGap={22}
                        tick={{
                          fontSize: 10,
                          fill: 'var(--text-muted)',
                          fontFamily: 'var(--font-mono)',
                        }}
                        axisLine={{ stroke: 'var(--border-strong)' }}
                        tickLine={{ stroke: 'var(--border-strong)' }}
                      />

                      <YAxis
                        yAxisId="left"
                        width="auto"
                        tick={{
                          fontSize: 10,
                          fill: 'var(--text-muted)',
                          fontFamily: 'var(--font-mono)',
                        }}
                        axisLine={{ stroke: 'var(--border-strong)' }}
                        tickLine={false}
                        tickFormatter={(v: number) => {
                          if (growthMetric === 'GROWTH') return `${v.toFixed(0)}%`;
                          return `$${v.toLocaleString()}`;
                        }}
                      />

                      <YAxis
                        yAxisId="lots"
                        orientation="right"
                        hide={true}
                        domain={[0, (dataMax: number) => Math.max(dataMax * 4, 1.2)]}
                      />

                      <Tooltip
                        formatter={(value: unknown, name: unknown) => {
                          const num = Number(value) || 0;
                          const label = String(name || '');
                          if (label === text('Lots', 'ล็อต')) return [`${num.toFixed(2)} ${text('lot', 'ล็อต')}`, label];
                          if (growthMetric === 'GROWTH') return [`${num.toFixed(2)}%`, copy.growth];
                          return [fmtUSD(num, growthMetric === 'PNL'), label];
                        }}
                        labelStyle={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                        }}
                        contentStyle={{
                          background: 'var(--bg-surface-solid)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          boxShadow: 'var(--shadow-md)',
                          fontSize: '11.5px',
                          color: 'var(--text-primary)',
                        }}
                      />

                      <ReferenceLine
                        yAxisId="left"
                        y={growthMetric === 'EQUITY' ? acc.initial : 0}
                        stroke="var(--border-strong)"
                        strokeDasharray="3 3"
                      />

                      <Bar
                        yAxisId="lots"
                        dataKey="lots"
                        name={text('Lots', 'ล็อต')}
                        fill="var(--desk-chart-volume)"
                        barSize={6}
                        radius={[2, 2, 0, 0]}
                        isAnimationActive={false}
                      />

                      <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey={
                          growthMetric === 'GROWTH'
                            ? 'growthPct'
                            : growthMetric === 'PNL'
                            ? 'cumulativePnl'
                            : 'equity'
                        }
                        name={
                          growthMetric === 'GROWTH'
                            ? copy.growth
                            : growthMetric === 'PNL'
                            ? copy.profit
                            : copy.equity
                        }
                        stroke="var(--desk-chart-line)"
                        strokeWidth={2}
                        fill="url(#fxGrowthFill)"
                        dot={{ r: 2, fill: 'var(--desk-chart-line)', strokeWidth: 0 }}
                        activeDot={{ r: 4, fill: 'var(--desk-chart-line)', stroke: 'var(--bg-surface-solid)', strokeWidth: 2 }}
                        isAnimationActive={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                  )}
                </div>
            </div>
          )}

      {performanceView === 'charts' && (
        <div className="fx-tabbed-container" id="sec-analytics">
          <div className="fx-folder-tabs" role="tablist" onKeyDown={navigateDeskTabs} aria-label={text('Trade outcomes and 3D views', 'ผลเทรดและมุมมอง 3 มิติ')}>
            <div className="fx-folder-tabs-left">
              <button
                type="button"
                role="tab"
                id="analysis-outcomes-DAILY-tab"
                aria-controls="analysis-outcomes-panel"
                aria-selected={bottomTab === 'DAILY'}
                tabIndex={bottomTab === 'DAILY' ? 0 : -1}
                className={`fx-folder-tab ${bottomTab === 'DAILY' ? 'active' : ''}`}
                onClick={() => setBottomTab('DAILY')}
              >
                {copy.dailyTab}
              </button>
              <button
                type="button"
                role="tab"
                id="analysis-outcomes-HOURLY-tab"
                aria-controls="analysis-outcomes-panel"
                aria-selected={bottomTab === 'HOURLY'}
                tabIndex={bottomTab === 'HOURLY' ? 0 : -1}
                className={`fx-folder-tab ${bottomTab === 'HOURLY' ? 'active' : ''}`}
                onClick={() => setBottomTab('HOURLY')}
              >
                {copy.hourlyTab}
              </button>
              <button
                type="button"
                role="tab"
                id="analysis-outcomes-NODES_3D-tab"
                aria-controls="analysis-outcomes-panel"
                aria-selected={bottomTab === 'NODES_3D'}
                tabIndex={bottomTab === 'NODES_3D' ? 0 : -1}
                className={`fx-folder-tab ${bottomTab === 'NODES_3D' ? 'active' : ''}`}
                onClick={() => setBottomTab('NODES_3D')}
              >
                {copy.matrix3dTab}
              </button>
            </div>
          </div>

          <div className="fx-tab-panel-card" id="analysis-outcomes-panel" role="tabpanel" aria-labelledby={`analysis-outcomes-${bottomTab}-tab`} tabIndex={0}>
            {bottomTab === 'NODES_3D' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', height: '100%' }}>
                <div className="fx-chart-header" style={{ marginBottom: '4px' }}>
                  <h3 className="fx-card-heading">{text('3D Trade Map', 'แผนที่รายการเทรด 3 มิติ')}</h3>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    {accountName} · {tradeCountLabel(portTrades.length)}
                  </span>
                </div>
                <React.Suspense fallback={<div className="desk-module-status" role="status">{text('Loading 3D view…', 'กำลังโหลดมุมมอง 3 มิติ…')}</div>}>
                  <KineticNodesCanvas lang={lang} activePort={state.activePort} trades={portTrades} />
                </React.Suspense>
              </div>
            ) : (
              <>
                <div className="fx-chart-header">
                  <h3 className="fx-card-heading">
                    {bottomTab === 'DAILY' ? text('Won / lost per day', 'ชนะ / แพ้รายวัน') : text('Won / lost per hour', 'ชนะ / แพ้รายชั่วโมง')}
                  </h3>

                  <div className="fx-chart-legend">
                    <span className="fx-legend-item">
                      <span className="fx-swatch-won" />
                      {text('Trades won', 'ออเดอร์ชนะ')}
                    </span>
                    <span className="fx-legend-item">
                      <span className="fx-swatch-lost" />
                      {text('Trades lost', 'ออเดอร์แพ้')}
                    </span>
                  </div>

                  <select
                    className="fx-select"
                    aria-label={text('Choose an outcomes chart metric', 'เลือกตัวชี้วัดบนกราฟผลเทรด')}
                    value={barMode}
                    onChange={(e) => setBarMode(e.target.value as 'COUNT' | 'USD')}
                  >
                    <option value="COUNT">{text('Won vs lost', 'ชนะเทียบกับแพ้')}</option>
                    <option value="USD">{text('Profit vs loss ($)', 'กำไรเทียบกับขาดทุน ($)')}</option>
                  </select>
                </div>

                <div className="fx-chart-frame fx-chart-frame-outcomes">
                  {totalTrades === 0 ? (
                    <div className="desk-chart-empty"><ChartNoAxesColumn size={22} aria-hidden="true" />
                      <strong>{text('No recorded outcomes', 'ยังไม่มีผลการเทรดที่บันทึกไว้')}</strong>
                    </div>
                  ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={activeBarSeries}
                      margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                      barCategoryGap="24%"
                    >
                      <CartesianGrid stroke="var(--border-color)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{
                          fontSize: 10.5,
                          fill: 'var(--text-muted)',
                          fontFamily: 'var(--font-mono)',
                        }}
                        axisLine={{ stroke: 'var(--border-strong)' }}
                        tickLine={false}
                      />
                      <YAxis
                        width="auto"
                        tick={{
                          fontSize: 10.5,
                          fill: 'var(--text-muted)',
                          fontFamily: 'var(--font-mono)',
                        }}
                        axisLine={{ stroke: 'var(--border-strong)' }}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--bg-surface-solid)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          fontSize: '11.5px',
                          color: 'var(--text-primary)',
                        }}
                      />
                      <Bar
                        dataKey={barMode === 'COUNT' ? 'wonCount' : 'wonUsd'}
                        name={text('Trades won', 'ออเดอร์ชนะ')}
                        stackId="a"
                        fill="var(--emerald)"
                        maxBarSize={36}
                        isAnimationActive={false}
                      />
                      <Bar
                        dataKey={barMode === 'COUNT' ? 'lostCount' : 'lostUsd'}
                        name={text('Trades lost', 'ออเดอร์แพ้')}
                        stackId="a"
                        fill="var(--rose)"
                        maxBarSize={36}
                        radius={[2, 2, 0, 0]}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {performanceView === 'stats' && <>
      <div className="fx-kpi-row-6">
        <div className="fx-stat-card compact">
          <div className="fx-stat-label">{copy.dailyProfit}</div>
          <div className="fx-stat-val sm mono sensitive-val">
            {fmtUSD(todayPnl)}
            {todayPnl !== 0 && (
              <span className={`fx-stat-tri ${todayPnl > 0 ? 'up' : 'down'}`}>
                {todayPnl > 0 ? '▲' : '▼'}
              </span>
            )}
          </div>
        </div>

        <div className="fx-stat-card compact">
          <div className="fx-stat-label">{copy.weeklyProfit}</div>
          <div className="fx-stat-val sm mono sensitive-val">
            {fmtUSD(weeklyPnl)}
            {weeklyPnl !== 0 && (
              <span className={`fx-stat-tri ${weeklyPnl > 0 ? 'up' : 'down'}`}>
                {weeklyPnl > 0 ? '▲' : '▼'}
              </span>
            )}
          </div>
        </div>

        <div className="fx-stat-card compact">
          <div className="fx-stat-label">{copy.cumulativeProfit}</div>
          <div className="fx-stat-val sm mono sensitive-val">
            {fmtUSD(acc.profit)}
            {acc.profit !== 0 && (
              <span className={`fx-stat-tri ${acc.profit > 0 ? 'up' : 'down'}`}>
                {acc.profit > 0 ? '▲' : '▼'}
              </span>
            )}
          </div>
        </div>

        <div className="fx-stat-card compact">
          <div className="fx-stat-label">{copy.winRatio}</div>
          <div className="fx-stat-val sm mono">{totalTrades ? winRatio.toFixed(2) + '%' : '—'}</div>
        </div>

        <div className="fx-stat-card compact" data-kpi="reward-risk">
          <div className="fx-stat-label">{copy.rrr}</div>
          <div className="fx-stat-val sm mono">{totalTrades ? rrrVal.toFixed(2) : '—'}</div>
        </div>

        <div className="fx-stat-card compact" data-kpi="profit-factor">
          <div className="fx-stat-label">{copy.profitFactor}</div>
          <div className="fx-stat-val sm mono">{totalTrades ? profitFactor.toFixed(3) : '—'}</div>
        </div>
      </div>
      <div className="analysis-stat-details">
        <div className="fx-chart-card">
          <div className="fx-chart-header">
            <h3 className="fx-card-heading">{copy.tradeStatsTitle}</h3>
          </div>

          <div className="fx-kv-table">
            <div className="fx-kv-row">
              <span className="fx-kv-key">{copy.totalTrades}</span>
              <span className="fx-kv-val mono">{totalTrades}</span>
            </div>
            <div className="fx-kv-row">
              <span className="fx-kv-key">{copy.wonTrades}</span>
              <span className="fx-kv-val mono">
                {winCount} ({winRatio.toFixed(0)}%)
              </span>
            </div>
            <div className="fx-kv-row">
              <span className="fx-kv-key">{copy.lostTrades}</span>
              <span className="fx-kv-val mono">
                {lossCount} ({lossRatio.toFixed(0)}%)
              </span>
            </div>
            <div className="fx-kv-row">
              <span className="fx-kv-key">{copy.longs}</span>
              <span className="fx-kv-val mono">
                {longCount} ({longCount > 0 ? Math.round((longWins / longCount) * 100) : 0}% {copy.winSuffix})
              </span>
            </div>
            <div className="fx-kv-row">
              <span className="fx-kv-key">{copy.shorts}</span>
              <span className="fx-kv-val mono">
                {shortCount} ({shortCount > 0 ? Math.round((shortWins / shortCount) * 100) : 0}% {copy.winSuffix})
              </span>
            </div>
            <div className="fx-kv-row">
              <span className="fx-kv-key">{copy.avgWin}</span>
              <span className="fx-kv-val mono sensitive-val">{avgWin.toFixed(3)}</span>
            </div>
            <div className="fx-kv-row">
              <span className="fx-kv-key">{copy.avgLoss}</span>
              <span className="fx-kv-val mono sensitive-val">{(-avgLoss).toFixed(3)}</span>
            </div>
          </div>
        </div>

        {/* RIGHT: STACKED TRADES COUNT CARD + WON|LOST GAUGE CARD */}
        <div className="fx-right-stack">
          <div className="fx-stat-card">
            <div className="fx-stat-label">{copy.tradesLabel}</div>
            <div className="fx-stat-val lg mono">{totalTrades}</div>
          </div>

          <div className="fx-stat-card fx-outcome-gauge">
            <div className="fx-stat-label">
              {copy.wonLostLabel}
            </div>
            <div className="fx-gauge-wrap">
              <svg viewBox="0 0 120 68" className="fx-gauge-svg">
                {/* Base red arc (Lost) */}
                <path
                  d="M 16 58 A 44 44 0 0 1 104 58"
                  fill="none"
                  stroke={totalTrades ? 'var(--rose)' : 'var(--border-strong)'}
                  strokeWidth="14"
                  strokeLinecap="butt"
                />
                {/* Foreground green arc (Won) */}
                <path
                  d="M 16 58 A 44 44 0 0 1 104 58"
                  fill="none"
                  stroke="var(--emerald)"
                  strokeWidth="14"
                  strokeLinecap="butt"
                  strokeDasharray={`${winArcLength} ${circumference}`}
                />
              </svg>
              <div className="fx-gauge-caption mono">
                {winCount} | {lossCount}
              </div>
            </div>
          </div>
        </div>
      </div>
      </>}
        </div>
      )}

      {activeView === 'calendar' && (
        <div className="analysis-subview" id="analysis-calendar-panel" role="tabpanel" aria-labelledby={`analysis-calendar-${calendarView}-tab`} tabIndex={0}>
          {calendarView === 'week' ? (
      <div
        className="fx-consistency-strip"
        data-testid="consistency-calendar-7d"
        aria-label={text('7-Day Consistency Calendar Heatmap', 'ปฏิทินความสม่ำเสมอ 7 วัน')}
      >
        <div className="fx-consistency-head">
          <div className="fx-consistency-title-group">
            <h3 className="fx-card-heading" style={{ fontSize: '12.5px' }}>
              {copy.consistency7d}
            </h3>
            <span className="fx-consistency-meta mono">
              {!consistencyInfo.hasConsistencyCap
                ? text(`Cap off · ${consistencyCalendar.activeDays} active days`, `ปิดเพดาน · เทรด ${consistencyCalendar.activeDays} วัน`)
                : text(`${consistencyCalendar.metCount}/${consistencyCalendar.activeDays} days within ${consistencyInfo.capPct}% cap`, `ผ่านเพดาน ${consistencyInfo.capPct}% จำนวน ${consistencyCalendar.metCount}/${consistencyCalendar.activeDays} วัน`)}
            </span>
          </div>

          <div className="fx-consistency-legend">
            {!consistencyInfo.hasConsistencyCap ? (
              <span className="fx-heatmap-leg-item">
                <span className="fx-heatmap-swatch met40" />
                {copy.winDayLegend}
              </span>
            ) : (
              <>
                <span className="fx-heatmap-leg-item">
                  <span className="fx-heatmap-swatch met40" />
                  {text('Within cap', 'ผ่านเกณฑ์')} ≤{consistencyInfo.capPct}%
                </span>
                <span className="fx-heatmap-leg-item">
                  <span className="fx-heatmap-swatch pos-over" />
                  {text('Positive', 'กำไร')} (&gt;{consistencyInfo.capPct}%)
                </span>
              </>
            )}
            <span className="fx-heatmap-leg-item">
              <span className="fx-heatmap-swatch neg" />
              {copy.lossLegend}
            </span>
            <span className="fx-heatmap-leg-item">
              <span className="fx-heatmap-swatch empty" />
              {copy.noTradeLegend}
            </span>
          </div>
        </div>

        <div className="fx-consistency-grid">
          {consistencyCalendar.days.map((day) => {
            const statusClass =
              day.status === 'MET_40'
                ? 'is-met40'
                : day.status === 'POSITIVE_OVER_40'
                ? 'is-pos-over'
                : day.status === 'NEGATIVE'
                ? 'is-neg'
                : day.status === 'BREAK_EVEN'
                ? 'is-even'
                : 'is-empty';

            const statusText =
              day.status === 'MET_40'
                ? consistencyInfo.hasConsistencyCap
                  ? text(`Within the ${consistencyInfo.capPct}% cap (${day.sharePct}% of total profit)`, `ผ่านเพดาน ${consistencyInfo.capPct}% (คิดเป็น ${day.sharePct}% ของกำไรรวม)`)
                  : text('Profitable day', 'วันที่มีกำไร')
                : day.status === 'POSITIVE_OVER_40'
                ? text(`Profitable, over the ${consistencyInfo.capPct}% cap (${day.sharePct}%)`, `กำไรเกินเพดาน ${consistencyInfo.capPct}% (${day.sharePct}%)`)
                : day.status === 'NEGATIVE'
                ? text('Net loss day', 'วันขาดทุนสุทธิ')
                : day.status === 'BREAK_EVEN'
                ? text('Break-even ($0.00)', 'เท่าทุน ($0.00)')
                : text('No trades', 'ไม่มีรายการเทรด');

            const tooltipText = `${day.date} (${formatWeekday(day.weekdayShort, lang)}) · ${tradeCountLabel(day.tradeCount)} · ${fmtUSD(
              day.pnl,
              true
            )} · ${statusText}${onInspectDateInJournal && day.tradeCount > 0 ? text(' (open in Trade Journal)', ' (เปิดในสมุดเทรด)') : ''}`;

            return (
              <button
                key={day.date}
                type="button"
                className={`fx-heatmap-cell fx-heatmap-cell-btn ${statusClass}`}
                data-date={day.date}
                data-status={day.status}
                title={tooltipText}
                aria-label={tooltipText}
                onClick={() => onInspectDateInJournal && onInspectDateInJournal(day.date)}
              >
                <div className="fx-heatmap-top">
                  <span className="fx-heatmap-day">
                    {formatWeekday(day.weekdayShort, lang)} {day.shortDate}
                  </span>
                  <span className="fx-heatmap-trades mono">
                    {day.tradeCount > 0 ? compactTradeCount(day.tradeCount) : '—'}
                  </span>
                </div>
                <div className="fx-heatmap-bottom">
                  <span className="fx-heatmap-pnl mono sensitive-val">
                    {day.tradeCount > 0 ? fmtUSD(day.pnl, true) : '$0'}
                  </span>
                  <span className="fx-heatmap-share mono">
                    {day.pnl > 0 ? `${day.sharePct}%` : day.status === 'NEGATIVE' ? text('LOSS', 'ขาดทุน') : '—'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
          ) : (
            <div className="fx-tab-panel-card">
              <div className="fx-monthly-cal-wrap" data-testid="monthly-consistency-calendar">
                <div className="fx-monthly-cal-header">
                  <div className="fx-monthly-cal-nav">
                    <button
                      type="button"
                      className="fx-cal-nav-btn"
                      aria-label={text('Previous month', 'เดือนก่อนหน้า')}
                      onClick={() => {
                        setCalendarMonthKey((prev) => shiftMonthKey(prev, -1));
                        setSelectedCalDate(null);
                      }}
                    >
                      ‹
                    </button>
                    <h2 className="fx-card-heading mono fx-cal-month-title">
                      {monthLabel}
                    </h2>
                    <button
                      type="button"
                      className="fx-cal-nav-btn"
                      aria-label={text('Next month', 'เดือนถัดไป')}
                      onClick={() => {
                        setCalendarMonthKey((prev) => shiftMonthKey(prev, 1));
                        setSelectedCalDate(null);
                      }}
                    >
                      ›
                    </button>
                    {calendarMonthKey !== todayStr.slice(0, 7) && (
                      <button
                        type="button"
                        className="fx-cal-today-btn"
                        onClick={() => {
                          setCalendarMonthKey(todayStr.slice(0, 7));
                          setSelectedCalDate(todayStr);
                        }}
                      >
                        {text('Today', 'วันนี้')}
                      </button>
                    )}
                    <span className="fx-readout-sep" aria-hidden="true">
                      ·
                    </span>
                    <span
                      className={`mono sensitive-val fx-cal-net-val ${
                        monthlyCalendar.monthlyNetPnl > 0
                          ? 'is-win'
                          : monthlyCalendar.monthlyNetPnl < 0
                          ? 'is-loss'
                          : ''
                      }`}
                    >
                      {text('Net', 'สุทธิ')} {fmtUSD(monthlyCalendar.monthlyNetPnl, true)}
                    </span>
                    <span className="fx-readout-sep" aria-hidden="true">
                      ·
                    </span>
                    <span className="mono fx-cal-active-count">
                      {monthlyCalendar.activeDays}{text('d', ' วัน')} ({compactTradeCount(monthlyCalendar.tradesCount)})
                    </span>
                  </div>

                  <div className="fx-consistency-legend">
                    <span className="fx-heatmap-leg-item">
                      <span className="fx-heatmap-swatch met40" />
                      {monthlyCalendar.hasConsistencyCap
                        ? text(`Win (≤${monthlyCalendar.capPct}%)`, `กำไร (≤${monthlyCalendar.capPct}%)`)
                        : copy.winDayLegend}
                    </span>
                    {monthlyCalendar.hasConsistencyCap && (
                      <span className="fx-heatmap-leg-item">
                        <span className="fx-heatmap-swatch pos-over" />
                        {text('Over', 'เกิน')} {monthlyCalendar.capPct}%
                      </span>
                    )}
                    <span className="fx-heatmap-leg-item">
                      <span className="fx-heatmap-swatch neg" />
                      {copy.lossLegend}
                    </span>
                    <span className="fx-heatmap-leg-item">
                      <span className="fx-heatmap-swatch empty" />
                      {copy.noTradeLegend}
                    </span>
                  </div>
                  <div className="fx-cal-inline-metrics mono">
                    <span className="fx-cal-metric-win">
                      {text('Winning days', 'วันกำไร')} {monthlyCalendar.winningDays}
                    </span>
                    <span className="fx-readout-sep" aria-hidden="true">
                      ·
                    </span>
                    <span className="fx-cal-metric-loss">
                      {text('Losing days', 'วันขาดทุน')} {monthlyCalendar.losingDays}
                    </span>
                    <span className="fx-readout-sep" aria-hidden="true">
                      ·
                    </span>
                    <span>{text('Day win rate', 'อัตราวันกำไร')} {monthlyCalendar.dayWinRatePct.toFixed(0)}%</span>
                    {monthlyCalendar.longestWinStreak > 0 && (
                      <>
                        <span className="fx-readout-sep" aria-hidden="true">
                          ·
                        </span>
                        <span>{text('Streak', 'ชนะติดกัน')} {monthlyCalendar.longestWinStreak}{text('W', ' วัน')}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="fx-monthly-scroll" role="group" aria-label={copy.monthlyCalendar}>
                  <div className="fx-monthly-weekdays" aria-hidden="true">
                    {WEEKDAYS_EN.map((wd) => (
                      <div key={wd} className="fx-monthly-weekday-lbl">
                        {formatWeekday(wd, lang)}
                      </div>
                    ))}
                  </div>

                  <div
                    className="fx-monthly-grid"
                    style={{
                      gridTemplateRows: `repeat(${Math.max(
                        4,
                        Math.ceil(monthlyCalendar.cells.length / 7)
                      )}, minmax(var(--analysis-calendar-row-min, 37px), 1fr))`,
                    }}
                  >
                    {monthlyCalendar.cells.map((cell) => {
                      const statusClass = !cell.isCurrentMonth
                        ? 'is-outside'
                        : cell.status === 'MET_40'
                        ? 'is-met40'
                        : cell.status === 'POSITIVE_OVER_40'
                        ? 'is-pos-over'
                        : cell.status === 'NEGATIVE'
                        ? 'is-neg'
                        : cell.status === 'BREAK_EVEN'
                        ? 'is-even'
                        : 'is-empty';

                      const isSelected =
                        selectedCalendarCell?.date === cell.date && cell.isCurrentMonth;

                      const statusDesc =
                        cell.status === 'MET_40'
                          ? monthlyCalendar.hasConsistencyCap
                            ? text(`Winning day (≤${monthlyCalendar.capPct}% cap, ${cell.sharePct}% share)`, `วันกำไร (เพดาน ≤${monthlyCalendar.capPct}% สัดส่วน ${cell.sharePct}%)`)
                            : text('Winning day', 'วันกำไร')
                          : cell.status === 'POSITIVE_OVER_40'
                          ? text(`Winning day over ${monthlyCalendar.capPct}% cap (${cell.sharePct}% share)`, `วันกำไรเกินเพดาน ${monthlyCalendar.capPct}% (สัดส่วน ${cell.sharePct}%)`)
                          : cell.status === 'NEGATIVE'
                          ? text('Losing day', 'วันขาดทุน')
                          : cell.status === 'BREAK_EVEN'
                          ? text('Break-even day', 'วันเท่าทุน')
                          : text('No trades', 'ไม่มีรายการเทรด');

                      const ariaText = `${cell.date}: ${tradeCountLabel(cell.tradeCount)}, ${fmtUSD(
                        cell.pnl,
                        true
                      )}, ${statusDesc}`;

                      return (
                        <button
                          key={cell.date}
                          type="button"
                          disabled={!cell.isCurrentMonth}
                          tabIndex={cell.isCurrentMonth ? 0 : -1}
                          aria-label={ariaText}
                          title={ariaText}
                          data-date={cell.date}
                          data-status={cell.status}
                          onClick={() => {
                            if (!cell.isCurrentMonth) return;
                            setSelectedCalDate(cell.date);
                          }}
                          onDoubleClick={() => {
                            if (
                              cell.isCurrentMonth &&
                              cell.tradeCount > 0 &&
                              onInspectDateInJournal
                            ) {
                              onInspectDateInJournal(cell.date);
                            }
                          }}
                          className={`fx-monthly-cell ${statusClass} ${
                            cell.isToday && cell.isCurrentMonth ? 'is-today' : ''
                          } ${isSelected ? 'is-selected' : ''}`}
                        >
                          <div className="fx-monthly-cell-top">
                            <span className="fx-monthly-daynum mono">{cell.dayOfMonth}</span>
                            {cell.isCurrentMonth && cell.tradeCount > 0 && (
                              <span className="fx-monthly-trades mono">{compactTradeCount(cell.tradeCount)}</span>
                            )}
                          </div>

                          <div className="fx-monthly-cell-bot">
                            {cell.isCurrentMonth && cell.tradeCount > 0 ? (
                              <>
                                <span className="fx-monthly-pnl mono sensitive-val">
                                  {cell.pnl === 0
                                    ? '$0'
                                    : fmtUSD(cell.pnl, true).replace(/\.00$/, '')}
                                </span>
                                <span className="fx-monthly-tag mono">
                                  {cell.pnl > 0
                                    ? monthlyCalendar.hasConsistencyCap
                                      ? `${cell.sharePct.toFixed(0)}%`
                                      : text('WIN', 'กำไร')
                                    : cell.pnl < 0
                                    ? text('LOSS', 'ขาดทุน')
                                    : text('BE', 'เท่าทุน')}
                                </span>
                              </>
                            ) : (
                              <span className="fx-monthly-empty-dash">—</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="fx-monthly-cal-footer">
                  {selectedCalendarCell && selectedCalendarCell.tradeCount > 0 ? (
                    <>
                      <div className="fx-inline-readout-strip">
                        <strong className="mono">{selectedCalendarCell.date}</strong>
                        <span>({formatWeekday(selectedCalendarCell.weekdayShort, lang)})</span>
                        <span className="fx-readout-sep" aria-hidden="true">
                          ·
                        </span>
                        <span className="mono">
                          {selectedCalendarCell.winCount}{text('W', ' ชนะ')} / {selectedCalendarCell.lossCount}{text('L', ' แพ้')}
                        </span>
                        <span className="fx-readout-sep" aria-hidden="true">
                          ·
                        </span>
                        <span
                          className={`mono sensitive-val fx-cal-net-val ${
                            selectedCalendarCell.pnl > 0
                              ? 'is-win'
                              : selectedCalendarCell.pnl < 0
                              ? 'is-loss'
                              : ''
                          }`}
                        >
                          {fmtUSD(selectedCalendarCell.pnl, true)}
                        </span>
                        {selectedCalendarCell.pnl > 0 &&
                          monthlyCalendar.hasConsistencyCap && (
                            <>
                              <span className="fx-readout-sep" aria-hidden="true">
                                ·
                              </span>
                              <span
                                style={{
                                  color:
                                    selectedCalendarCell.status === 'POSITIVE_OVER_40'
                                      ? 'var(--amber)'
                                      : 'var(--emerald)',
                                  fontWeight: 600,
                                }}
                              >
                                {selectedCalendarCell.sharePct}% {text('of monthly profit', 'ของกำไรเดือน')} (
                                {selectedCalendarCell.status === 'POSITIVE_OVER_40'
                                  ? text(`over ${monthlyCalendar.capPct}%`, `เกิน ${monthlyCalendar.capPct}%`)
                                  : text(`within ≤${monthlyCalendar.capPct}%`, `ผ่าน ≤${monthlyCalendar.capPct}%`)}
                                )
                              </span>
                            </>
                          )}
                      </div>
                      {onInspectDateInJournal && (
                        <button
                          type="button"
                          className="fx-cal-inspect-btn"
                          onClick={() => onInspectDateInJournal(selectedCalendarCell.date)}
                        >
                          {text('View in Trade Journal →', 'ดูในสมุดเทรด →')}
                        </button>
                      )}
                    </>
                  ) : monthlyCalendar.tradesCount === 0 ? (
                    <div className="fx-inline-readout-strip">
                      <span>
                        {text(`No trades in ${monthLabel}`, `ไม่มีรายการเทรดในเดือน ${monthLabel}`)}
                      </span>
                    </div>
                  ) : (
                    <div className="fx-inline-readout-strip">
                      <span>{text('Select a trading day to see its results', 'เลือกวันที่มีรายการเพื่อดูรายละเอียดรายวัน')}</span>
                      {monthlyCalendar.bestDayDate && (
                        <>
                          <span className="fx-readout-sep" aria-hidden="true">
                            ·
                          </span>
                          <span className="mono sensitive-val fx-cal-metric-win">
                            {text('Best', 'ดีที่สุด')} {monthlyCalendar.bestDayDate} (
                            {fmtUSD(monthlyCalendar.bestDayPnl, true)})
                          </span>
                        </>
                      )}
                      {monthlyCalendar.worstDayDate && (
                        <>
                          <span className="fx-readout-sep" aria-hidden="true">
                            ·
                          </span>
                          <span className="mono sensitive-val fx-cal-metric-loss">
                            {text('Worst', 'แย่ที่สุด')} {monthlyCalendar.worstDayDate} (
                            {fmtUSD(monthlyCalendar.worstDayPnl, true)})
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      </>}
      </section>
    </section>
  );
});

AnalyticsSection.displayName = 'AnalyticsSection';
