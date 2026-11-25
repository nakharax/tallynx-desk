import React, { useEffect, useId, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Link2,
  Pause,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { deskText, type DeskLanguage } from '../utils/deskI18n';
import { formatPilotAmount } from '../utils/fundedNextPilot';
import { fmtUSD } from '../utils/ghrRules';
import {
  computeLivePositionMetrics,
  formatTelemetryTimeLabel,
  sliceLiveTelemetryWindow,
  type AnyLivePositionInput,
  type LivePositionRow,
  type LiveTelemetryPoint,
  type LiveTelemetryWindow,
} from '../utils/liveTelemetryBuffer';

export type LiveTelemetryProvider = 'FUNDEDNEXT_MCP' | 'LIVE_BRIDGE' | 'NONE';

export interface LiveMonitorControlState {
  provider: LiveTelemetryProvider;
  connected: boolean;
  paused: boolean;
  tabVisible: boolean;
  syncing: boolean;
  reconnectRequired: boolean;
  pollIntervalMs: number;
  nextPollAt: number | null;
  lastSyncAt: string | null;
  latencyMs: number | null;
  error: string | null;
  currency: string;
  balance: number | null;
  equity: number | null;
  floatingPnl: number | null;
  marginUsedUsd: number | null;
  freeMarginUsd: number | null;
  marginLevelPct: number | null;
  dailyLossUsedUsd: number | null;
  dailyLossLimitUsd: number;
  netRealizedProfit: number;
  bestDayProfit: number;
  todayRealizedProfitUsd: number;
  consistencyCapPct: number;
  hasConsistencyCap: boolean;
  privacyMasked?: boolean;
  rateFloorMs?: number | null;
  nextSafeSyncAt?: string | null;
  onTogglePause: () => void;
  onForceRefresh: () => void;
  onOpenSyncModal?: () => void;
}

export interface LivePositionMonitorCardProps {
  lang?: DeskLanguage;
  accountName: string;
  accountLogin?: string;
  livePositions: readonly AnyLivePositionInput[];
  telemetrySeries: readonly LiveTelemetryPoint[];
  liveMonitor: LiveMonitorControlState;
  onOpenSyncModal?: () => void;
}

const WINDOW_OPTIONS: readonly { id: LiveTelemetryWindow; en: string; th: string }[] = [
  { id: 'ALL', en: 'All ticks', th: 'ทั้งหมด' },
  { id: '2M', en: 'Last 2m', th: '2 นาทีล่าสุด' },
  { id: '6M', en: 'Last 6m', th: '6 นาทีล่าสุด' },
];

function formatAmount(
  value: number | null | undefined,
  currency: string,
  signed = false,
  masked = false
): string {
  if (masked) return '•••••';
  if (value == null || !Number.isFinite(value)) return '—';
  if (!currency || currency === 'USD') {
    return fmtUSD(value, signed);
  }
  return formatPilotAmount(value, currency, signed);
}

function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—';
  if (value >= 1000) return value.toFixed(2);
  if (value >= 10) return value.toFixed(3);
  return value.toFixed(5);
}

function formatDuration(minutes: number | null, lang: DeskLanguage): string {
  if (minutes == null || !Number.isFinite(minutes)) return '—';
  if (minutes < 1) return deskText(lang, '<1m', '<1น.');
  if (minutes < 60) return deskText(lang, `${minutes}m`, `${minutes}น.`);
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours < 24) {
    return remMin > 0
      ? deskText(lang, `${hours}h ${remMin}m`, `${hours}ชม. ${remMin}น.`)
      : deskText(lang, `${hours}h`, `${hours}ชม.`);
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return deskText(lang, `${days}d ${remHours}h`, `${days}วัน ${remHours}ชม.`);
}

function formatSyncTime(iso: string | null): string {
  if (!iso) return '—';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return '—';
  return `${formatTelemetryTimeLabel(parsed, 'Asia/Bangkok')} ICT`;
}

function computeChartDomain(
  points: readonly LiveTelemetryPoint[],
  dailyFloorBalance: number
): [number | 'auto', number | 'auto'] {
  if (points.length === 0) return ['auto', 'auto'];
  let minVal = Infinity;
  let maxVal = -Infinity;
  for (const pt of points) {
    if (Number.isFinite(pt.equity)) {
      minVal = Math.min(minVal, pt.equity);
      maxVal = Math.max(maxVal, pt.equity);
    }
    if (Number.isFinite(pt.balance)) {
      minVal = Math.min(minVal, pt.balance);
      maxVal = Math.max(maxVal, pt.balance);
    }
  }
  if (!Number.isFinite(minVal) || !Number.isFinite(maxVal)) {
    return ['auto', 'auto'];
  }
  if (Number.isFinite(dailyFloorBalance) && dailyFloorBalance > 0) {
    minVal = Math.min(minVal, dailyFloorBalance);
    maxVal = Math.max(maxVal, dailyFloorBalance);
  }
  const span = Math.max(10, maxVal - minVal);
  const pad = Math.max(5, Math.round(span * 0.12));
  return [Math.max(0, Math.floor(minVal - pad)), Math.ceil(maxVal + pad)];
}

export const LivePositionMonitorCard: React.FC<LivePositionMonitorCardProps> = React.memo(({
  lang = 'en',
  accountName,
  accountLogin,
  livePositions,
  telemetrySeries,
  liveMonitor,
  onOpenSyncModal,
}) => {
  const titleId = useId();
  const gradientId = useId().replace(/:/g, '');
  const t = (en: string, th: string) => deskText(lang, en, th);
  const [windowMode, setWindowMode] = useState<LiveTelemetryWindow>('ALL');
  const [countdownSec, setCountdownSec] = useState<number>(() =>
    Math.max(1, Math.round((liveMonitor.pollIntervalMs || 3000) / 1000))
  );

  const openSync = onOpenSyncModal ?? liveMonitor.onOpenSyncModal;
  const masked = Boolean(liveMonitor.privacyMasked);
  const currency = liveMonitor.currency || 'USD';

  useEffect(() => {
    if (!liveMonitor.connected || liveMonitor.paused || !liveMonitor.tabVisible || !liveMonitor.nextPollAt) {
      setCountdownSec(Math.max(1, Math.round((liveMonitor.pollIntervalMs || 3000) / 1000)));
      return;
    }
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil(((liveMonitor.nextPollAt ?? Date.now()) - Date.now()) / 1000));
      setCountdownSec(remaining);
    };
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 500);
    return () => window.clearInterval(timer);
  }, [liveMonitor.connected, liveMonitor.paused, liveMonitor.tabVisible, liveMonitor.nextPollAt, liveMonitor.pollIntervalMs]);

  const metrics = useMemo(() => {
    const safeBalance = liveMonitor.balance ?? 0;
    const safeEquity = liveMonitor.equity ?? safeBalance;
    return computeLivePositionMetrics(
      livePositions,
      safeBalance,
      safeEquity,
      liveMonitor.dailyLossLimitUsd,
      liveMonitor.netRealizedProfit,
      liveMonitor.bestDayProfit,
      liveMonitor.consistencyCapPct,
      {
        marginUsedUsd: liveMonitor.marginUsedUsd,
        freeMarginUsd: liveMonitor.freeMarginUsd,
        marginLevelPct: liveMonitor.marginLevelPct,
        todayRealizedProfitUsd: liveMonitor.todayRealizedProfitUsd,
        dailyLossUsedUsd: liveMonitor.dailyLossUsedUsd,
      }
    );
  }, [
    livePositions,
    liveMonitor.balance,
    liveMonitor.equity,
    liveMonitor.dailyLossLimitUsd,
    liveMonitor.netRealizedProfit,
    liveMonitor.bestDayProfit,
    liveMonitor.consistencyCapPct,
    liveMonitor.marginUsedUsd,
    liveMonitor.freeMarginUsd,
    liveMonitor.marginLevelPct,
    liveMonitor.todayRealizedProfitUsd,
    liveMonitor.dailyLossUsedUsd,
  ]);

  const { positions, summary } = metrics;
  const effectiveFloatingPnl =
    liveMonitor.floatingPnl !== null && Number.isFinite(liveMonitor.floatingPnl) && positions.length === 0
      ? liveMonitor.floatingPnl
      : summary.totalFloatingPnl;
  const floatingPctOfBalance =
    liveMonitor.balance != null && liveMonitor.balance > 0
      ? (effectiveFloatingPnl / liveMonitor.balance) * 100
      : null;

  const visibleSeries = useMemo(
    () => sliceLiveTelemetryWindow(telemetrySeries, windowMode),
    [telemetrySeries, windowMode]
  );

  const chartSeries = useMemo(
    () =>
      visibleSeries.map((pt) => ({
        ...pt,
        ddRemainingUsd: Math.max(
          0,
          Math.round(((pt.equity - (pt.dailyFloorBalance || summary.dailyFloorBalance)) + Number.EPSILON) * 100) / 100
        ),
      })),
    [visibleSeries, summary.dailyFloorBalance]
  );

  const dailyFloorValue = useMemo(() => {
    const latestPointFloor = visibleSeries.length > 0 ? visibleSeries[visibleSeries.length - 1].dailyFloorBalance : 0;
    return latestPointFloor > 0 ? latestPointFloor : summary.dailyFloorBalance;
  }, [visibleSeries, summary.dailyFloorBalance]);

  const yDomain = useMemo(
    () => computeChartDomain(visibleSeries, dailyFloorValue),
    [visibleSeries, dailyFloorValue]
  );

  const providerLabel =
    liveMonitor.provider === 'FUNDEDNEXT_MCP'
      ? t('FundedNext Official MCP', 'FundedNext Official MCP')
      : liveMonitor.provider === 'LIVE_BRIDGE'
        ? t('MT5 Live Bridge (.ex5)', 'MT5 Live Bridge (.ex5)')
        : t('Manual / Offline', 'ยังไม่ได้เชื่อมต่อสด');

  const consistencyTone: 'safe' | 'caution' | 'breach' = !liveMonitor.hasConsistencyCap
    ? 'safe'
    : summary.isConsistencyBreachedIfClosedNow
      ? 'breach'
      : summary.projectedBestDaySharePct >= summary.consistencyCapPct * 0.85
        ? 'caution'
        : 'safe';

  const ddBufferTone: 'safe' | 'caution' | 'breach' =
    summary.dailyDdUsedPct >= 80 ? 'breach' : summary.dailyDdUsedPct >= 50 ? 'caution' : 'safe';

  const heartbeatLabel = !liveMonitor.connected
    ? liveMonitor.reconnectRequired
      ? t('Reconnect required', 'ต้องเชื่อมต่อใหม่')
      : t('Disconnected', 'ยังไม่เชื่อมต่อ')
    : !liveMonitor.tabVisible
      ? t('Paused · Tab hidden', 'พักชั่วคราว · ซ่อนแท็บ')
      : liveMonitor.paused
        ? t('Paused', 'หยุดชั่วคราว')
        : liveMonitor.syncing
          ? t('Syncing…', 'กำลังซิงก์…')
          : liveMonitor.rateFloorMs && liveMonitor.rateFloorMs > liveMonitor.pollIntervalMs
            ? t(
                `Quiet · ${Math.round(liveMonitor.rateFloorMs / 1000)}s floor (${countdownSec}s)`,
                `ตลาดนิ่ง · รอบ ${Math.round(liveMonitor.rateFloorMs / 1000)}วิ (${countdownSec}วิ)`
              )
            : t(`Live · 3s (${countdownSec}s)`, `สด · 3วิ (${countdownSec}วิ)`);

  // Non-intrusive prompt when disconnected or reconnect required (never fabricates live telemetry!)
  if (!liveMonitor.connected || liveMonitor.provider === 'NONE' || liveMonitor.reconnectRequired) {
    return (
      <section className="card live-cockpit live-cockpit--disconnected" aria-labelledby={titleId}>
        <div className="live-cockpit-disconnected-body">
          <div className="live-cockpit-disconnected-copy">
            <div className="live-cockpit-title-row">
              <h2 className="card-title" id={titleId}>
                <Activity size={17} aria-hidden="true" />
                {t('Live 3-Second Cockpit', 'มอนิเตอร์พอร์ตสดทุก 3 วินาที')}
              </h2>
              <span className="live-cockpit-pill mono" data-tone={liveMonitor.reconnectRequired ? 'breach' : 'neutral'}>
                {liveMonitor.reconnectRequired
                  ? t('Reconnect required', 'ต้องเชื่อมต่อใหม่')
                  : t('Disconnected', 'ยังไม่เชื่อมต่อ')}
              </span>
            </div>
            <p className="live-cockpit-muted">
              {liveMonitor.reconnectRequired
                ? t(
                    'Your live broker session requires reconnection to resume 3-second equity and open-position monitoring.',
                    'เซสชันการเชื่อมต่อหมดอายุ กรุณาเชื่อมต่อใหม่เพื่อดู Equity และสถานะที่เปิดอยู่แบบเรียลไทม์ทุก 3 วินาที'
                  )
                : liveMonitor.provider === 'LIVE_BRIDGE'
                  ? t(
                      'Configure your Tredyn API Key and attach the TredynLiveBridge (.ex5) EA in MT5 to stream real-time open positions and equity.',
                      'ตั้งค่า Tredyn API Key และรัน EA TredynLiveBridge (.ex5) ใน MT5 เพื่อสตรีม Equity และออเดอร์ที่เปิดอยู่ทุก 3 วินาที'
                    )
                  : liveMonitor.provider === 'FUNDEDNEXT_MCP'
                    ? t(
                        'Connect your FundedNext Official MCP account and enable Auto-Sync to monitor live Balance, Equity, and Open Positions every 3 seconds.',
                        'เชื่อมต่อบัญชี FundedNext Official MCP และเปิดซิงก์อัตโนมัติเพื่อมอนิเตอร์ Balance, Equity และออเดอร์ที่เปิดอยู่ทุก 3 วินาที'
                      )
                    : t(
                        'Connect FundedNext Official MCP or MT5 Live Bridge (.ex5) to monitor live Balance/Equity curves, open positions, and 40% consistency impact every 3 seconds.',
                        'เชื่อมต่อ FundedNext Official MCP หรือ MT5 Live Bridge (.ex5) เพื่อดูกราฟ Balance/Equity ออเดอร์ที่เปิดอยู่ และผลกระทบเพดาน 40% แบบเรียลไทม์ทุก 3 วินาที'
                      )}
            </p>
            {liveMonitor.error && (
              <p className="live-cockpit-error" role="status">{liveMonitor.error}</p>
            )}
          </div>
          <div className="live-cockpit-disconnected-actions">
            {openSync && (
              <button type="button" className="btn sm primary" onClick={openSync}>
                <Link2 size={14} aria-hidden="true" />
                <span>
                  {liveMonitor.reconnectRequired
                    ? t('Reconnect Sync', 'เชื่อมต่อใหม่')
                    : t('Open MT5 / FundedNext Sync', 'เชื่อมต่อ MT5 / FundedNext')}
                </span>
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="card live-cockpit" aria-labelledby={titleId}>
      <header className="live-cockpit-header">
        <div className="live-cockpit-title-group">
          <div className="live-cockpit-title-row">
            <h2 className="card-title" id={titleId}>
              <span
                className="live-cockpit-pulse"
                data-live={!liveMonitor.paused && liveMonitor.tabVisible && liveMonitor.connected}
                aria-hidden="true"
              />
              <span>{t('Live 3s Telemetry Cockpit', 'มอนิเตอร์พอร์ตสดทุก 3 วินาที')}</span>
            </h2>
            <span className="live-cockpit-pill mono" data-tone="cobalt">{providerLabel}</span>
            <span className="live-cockpit-account mono">
              {accountName}{accountLogin ? ` · #${accountLogin}` : ''}
            </span>
          </div>
          <div className="live-cockpit-meta mono">
            <span>{t('Last sync:', 'ซิงก์ล่าสุด:')} {formatSyncTime(liveMonitor.lastSyncAt)}</span>
            {liveMonitor.latencyMs !== null && (
              <span>· {liveMonitor.latencyMs} ms</span>
            )}
          </div>
        </div>

        <div className="live-cockpit-controls">
          <span
            className="live-cockpit-heartbeat mono"
            data-state={
              !liveMonitor.tabVisible || liveMonitor.paused
                ? 'paused'
                : liveMonitor.syncing
                  ? 'syncing'
                  : 'live'
            }
          >
            <Activity size={13} aria-hidden="true" />
            <span>{heartbeatLabel}</span>
          </span>
          <button
            type="button"
            className="btn xs"
            onClick={liveMonitor.onTogglePause}
            aria-pressed={liveMonitor.paused}
            title={liveMonitor.paused ? t('Resume 3s polling', 'เปิดอัปเดตทุก 3 วินาที') : t('Pause 3s polling', 'หยุดชั่วคราว')}
          >
            {liveMonitor.paused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}
            <span>{liveMonitor.paused ? t('Resume', 'เล่นต่อ') : t('Pause', 'หยุดพัก')}</span>
          </button>
          <button
            type="button"
            className="btn xs"
            onClick={liveMonitor.onForceRefresh}
            disabled={liveMonitor.syncing}
            title={t('Force refresh now', 'รีเฟรชทันที')}
          >
            <RefreshCw size={13} className={liveMonitor.syncing ? 'spin' : undefined} aria-hidden="true" />
            <span>{t('Refresh', 'รีเฟรช')}</span>
          </button>
        </div>
      </header>

      {liveMonitor.error && (
        <div className="live-cockpit-error-banner" role="status">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{liveMonitor.error}</span>
          {openSync && (
            <button type="button" className="btn xs" onClick={openSync}>
              {t('Check Sync', 'ตรวจการเชื่อมต่อ')}
            </button>
          )}
        </div>
      )}

      {/* 6-Card Institutional Prop Guard KPI Strip */}
      <dl className="live-cockpit-kpis" aria-label={t('Live account guard metrics', 'ตัวชี้วัดคุมความเสี่ยงพอร์ตสด')}>
        <div className="live-kpi-cell">
          <dt>{t('Live Balance', 'ยอดคงเหลือสด')}</dt>
          <dd className="live-kpi-val mono sensitive-val">
            {formatAmount(liveMonitor.balance, currency, false, masked)}
          </dd>
          <dd className="live-kpi-sub">{t('Closed-trade ledger', 'ยอดปิดดีลแล้ว')}</dd>
        </div>

        <div className="live-kpi-cell" data-emphasis="cobalt">
          <dt>{t('Live Equity', 'Equity สด')}</dt>
          <dd className="live-kpi-val mono sensitive-val">
            {formatAmount(liveMonitor.equity ?? liveMonitor.balance, currency, false, masked)}
          </dd>
          <dd className="live-kpi-sub">
            {t('Real-time valuation', 'มูลค่าพอร์ตปัจจุบัน')}
          </dd>
        </div>

        <div className="live-kpi-cell">
          <dt>{t('Floating PnL', 'กำไร/ขาดทุนลอยตัว')}</dt>
          <dd
            className="live-kpi-val mono sensitive-val"
            data-tone={effectiveFloatingPnl > 0 ? 'pos' : effectiveFloatingPnl < 0 ? 'neg' : 'flat'}
          >
            {formatAmount(effectiveFloatingPnl, currency, true, masked)}
          </dd>
          <dd className="live-kpi-sub mono">
            {masked
              ? '•••'
              : floatingPctOfBalance !== null
                ? `${floatingPctOfBalance > 0 ? '+' : ''}${floatingPctOfBalance.toFixed(2)}% ${t('of bal', 'ของทุน')}`
                : '—'}
          </dd>
        </div>

        <div className="live-kpi-cell">
          <dt>{t('Daily DD Buffer Left', 'วงเงินขาดทุนรายวันที่เหลือ')}</dt>
          <dd
            className="live-kpi-val mono sensitive-val"
            data-tone={ddBufferTone === 'breach' ? 'neg' : ddBufferTone === 'caution' ? 'caution' : 'pos'}
          >
            {formatAmount(summary.dailyDdRemainingUsd, currency, false, masked)}
          </dd>
          <dd className="live-kpi-sub">
            <span className="mono">{(100 - summary.dailyDdUsedPct).toFixed(1)}% {t('left', 'เหลือ')}</span>
            <span className="live-dd-bar" aria-hidden="true">
              <span
                className="live-dd-fill"
                data-tone={ddBufferTone}
                style={{ width: `${Math.min(100, Math.max(0, summary.dailyDdUsedPct))}%` }}
              />
            </span>
          </dd>
        </div>

        <div className="live-kpi-cell">
          <dt>{t('Net Exposure & Risk @ SL', 'สถานะสุทธิและความเสี่ยง @ SL')}</dt>
          <dd className="live-kpi-val mono">
            {summary.openCount === 0
              ? t('Flat (0.00 L)', 'ว่าง (0.00 L)')
              : `${summary.netExposureLots > 0 ? '+' : ''}${summary.netExposureLots.toFixed(2)} L`}
          </dd>
          <dd className="live-kpi-sub mono">
            <span>
              {t('B', 'ซื้อ')} {summary.buyLots.toFixed(2)} / {t('S', 'ขาย')} {summary.sellLots.toFixed(2)} · {t('SL Risk', 'เสี่ยง SL')}{' '}
              {formatAmount(summary.totalRiskAtSlUsd, currency, false, masked)}
            </span>
            {summary.unprotectedPositionsCount > 0 && (
              <span className="live-no-sl-badge">
                {t(`${summary.unprotectedPositionsCount} no SL`, `${summary.unprotectedPositionsCount} ไม้ไร้ SL`)}
              </span>
            )}
          </dd>
        </div>

        <div className="live-kpi-cell">
          <dt>{t('Margin Level %', 'ระดับมาร์จิ้น %')}</dt>
          <dd className="live-kpi-val mono">
            {masked
              ? '••••%'
              : summary.marginLevelPct !== null
                ? `${summary.marginLevelPct.toFixed(1)}%`
                : '—'}
          </dd>
          <dd className="live-kpi-sub mono">
            {summary.freeMarginUsd !== null
              ? `${t('Free:', 'ว่าง:')} ${formatAmount(summary.freeMarginUsd, currency, false, masked)}`
              : t('Not reported by feed', 'ฟีดยังไม่ส่งค่ามาร์จิ้น')}
          </dd>
        </div>
      </dl>

      {/* Live 40% Consistency Impact Pill + Safe Harbor Strip */}
      <div className="live-cockpit-guard-row">
        <div className="live-consistency-pill" data-tone={consistencyTone} role="status">
          {consistencyTone === 'breach' ? (
            <ShieldAlert size={15} aria-hidden="true" />
          ) : (
            <ShieldCheck size={15} aria-hidden="true" />
          )}
          <span>
            {liveMonitor.hasConsistencyCap
              ? t(
                  `If closed now: Today's profit share = ${summary.projectedBestDaySharePct.toFixed(1)}% (vs ${summary.consistencyCapPct}% cap)`,
                  `หากปิดตอนนี้: สัดส่วนกำไรวันนี้ = ${summary.projectedBestDaySharePct.toFixed(1)}% (เทียบเพดาน ${summary.consistencyCapPct}%)`
                )
              : t(
                  `If closed now: Today's profit share = ${summary.projectedBestDaySharePct.toFixed(1)}% (Consistency cap off)`,
                  `หากปิดตอนนี้: สัดส่วนกำไรวันนี้ = ${summary.projectedBestDaySharePct.toFixed(1)}% (ปิดเพดาน Consistency)`
                )}
          </span>
          {liveMonitor.hasConsistencyCap && summary.isConsistencyBreachedIfClosedNow && (
            <strong className="mono">{t('OVER CAP', 'เกินเพดาน')}</strong>
          )}
        </div>
        <span className="live-safeharbor-note">
          {t('Read-only risk telemetry · Monitoring only', 'อ่านข้อมูลความเสี่ยงเท่านั้น · ไม่ใช่คำแนะนำการเทรด')}
        </span>
      </div>

      {/* Live Balance & Equity Chart (3s Real-Time Recharts ComposedChart) */}
      <div className="live-cockpit-chart-card">
        <div className="live-cockpit-chart-head">
          <div className="live-cockpit-legend" aria-label={t('Chart series legend', 'คำอธิบายเส้นกราฟ')}>
            <span className="live-legend-item" data-series="equity">{t('Equity', 'Equity')}</span>
            <span className="live-legend-item" data-series="balance">{t('Balance', 'Balance')}</span>
            {dailyFloorValue > 0 && (
              <span className="live-legend-item" data-series="floor">
                {t('Daily DD Floor', 'แนวรับ DD รายวัน')} ({formatAmount(dailyFloorValue, currency, false, masked)})
              </span>
            )}
          </div>
          <div className="live-window-tabs" role="tablist" aria-label={t('Telemetry chart window', 'ช่วงเวลากราฟสด')}>
            {WINDOW_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={windowMode === opt.id}
                className={`live-window-btn ${windowMode === opt.id ? 'active' : ''}`}
                onClick={() => setWindowMode(opt.id)}
              >
                {deskText(lang, opt.en, opt.th)}
              </button>
            ))}
          </div>
        </div>

        {chartSeries.length === 0 ? (
          <div className="live-cockpit-chart-empty">
            {t(
              'Waiting for first 3-second telemetry sample…',
              'กำลังรอชุดข้อมูลสดชุดแรกทุก 3 วินาที…'
            )}
          </div>
        ) : (
          <div className="live-cockpit-chart-frame">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <ComposedChart data={chartSeries} margin={{ top: 10, right: 14, left: 0, bottom: 2 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0752E8" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#0752E8" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border-color)" vertical={false} />
                <XAxis
                  dataKey="timeLabel"
                  minTickGap={24}
                  tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
                  axisLine={{ stroke: 'var(--border-strong)' }}
                  tickLine={false}
                />
                <YAxis
                  domain={yDomain}
                  width={62}
                  tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => (masked ? '•••' : `$${Math.round(v).toLocaleString('en-US')}`)}
                />
                {dailyFloorValue > 0 && (
                  <ReferenceLine
                    y={dailyFloorValue}
                    stroke="var(--rose)"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                  />
                )}
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const pt = payload[0]?.payload as (LiveTelemetryPoint & { ddRemainingUsd: number }) | undefined;
                    if (!pt) return null;
                    return (
                      <div className="live-chart-tooltip mono">
                        <div className="live-tooltip-time">{pt.timeLabel} ICT</div>
                        <div>
                          <span>{t('Equity', 'Equity')}</span>
                          <strong>{formatAmount(pt.equity, currency, false, masked)}</strong>
                        </div>
                        <div>
                          <span>{t('Balance', 'Balance')}</span>
                          <strong>{formatAmount(pt.balance, currency, false, masked)}</strong>
                        </div>
                        <div>
                          <span>{t('Floating PnL', 'ลอยตัว')}</span>
                          <strong data-tone={pt.floatingPnl >= 0 ? 'pos' : 'neg'}>
                            {formatAmount(pt.floatingPnl, currency, true, masked)}
                          </strong>
                        </div>
                        <div>
                          <span>{t('DD Buffer Left', 'DD คงเหลือ')}</span>
                          <strong>{formatAmount(pt.ddRemainingUsd, currency, false, masked)}</strong>
                        </div>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="equity"
                  name={t('Equity', 'Equity')}
                  stroke="#0752E8"
                  strokeWidth={2.25}
                  fill={`url(#${gradientId})`}
                  dot={chartSeries.length <= 2 ? { r: 3, fill: '#0752E8' } : false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="balance"
                  name={t('Balance', 'Balance')}
                  stroke="var(--text-secondary)"
                  strokeWidth={1.75}
                  strokeDasharray="5 4"
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Real-Time Open Positions Table */}
      <div className="live-cockpit-positions">
        <div className="live-cockpit-positions-head">
          <h3>
            {t('Open Positions', 'ออเดอร์ที่เปิดอยู่')}
            <span className="live-cockpit-count mono">{positions.length}</span>
          </h3>
          <div className="live-cockpit-positions-summary mono">
            <span>{t('Total Lots:', 'ล็อตรวม:')} {summary.totalLots.toFixed(2)}</span>
            <span>·</span>
            <span data-tone={effectiveFloatingPnl >= 0 ? 'pos' : 'neg'}>
              {t('Net Floating:', 'ลอยตัวสุทธิ:')} {formatAmount(effectiveFloatingPnl, currency, true, masked)}
            </span>
          </div>
        </div>

        {positions.length === 0 ? (
          <div className="live-cockpit-empty-positions">
            {t('No open positions currently reported by broker.', 'ยังไม่มีออเดอร์เปิดอยู่จากโบรกเกอร์ในขณะนี้')}
          </div>
        ) : (
          <div
            className="live-cockpit-table-wrap"
            role="region"
            aria-label={t('Live open positions table', 'ตารางออเดอร์ที่เปิดอยู่แบบเรียลไทม์')}
            tabIndex={0}
          >
            <table className="live-positions-table mono">
              <thead>
                <tr>
                  <th scope="col">{t('Symbol', 'สินทรัพย์')}</th>
                  <th scope="col">{t('Side', 'ฝั่ง')}</th>
                  <th scope="col">{t('Lots', 'ล็อต')}</th>
                  <th scope="col">{t('Open → Current', 'ราคาเปิด → ปัจจุบัน')}</th>
                  <th scope="col">{t('SL / TP · Risk @ SL', 'SL / TP · เสี่ยง @ SL')}</th>
                  <th scope="col">{t('Floating PnL', 'กำไร/ขาดทุนลอยตัว')}</th>
                  <th scope="col">{t('Swap / Comm', 'Swap / ค่าคอม')}</th>
                  <th scope="col">{t('Duration', 'ระยะเวลา')}</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((pos: LivePositionRow) => {
                  const swapComm = +(pos.swap + pos.commission).toFixed(2);
                  return (
                    <tr key={pos.ticket}>
                      <td>
                        <div className="live-pos-symbol">{pos.symbol}</div>
                        <div className="live-pos-ticket">#{pos.ticket}</div>
                      </td>
                      <td>
                        <span className="live-side-badge" data-side={pos.side}>
                          {pos.side}
                        </span>
                      </td>
                      <td>{pos.lots.toFixed(2)}</td>
                      <td>
                        <div>
                          {formatPrice(pos.openPrice)} → {formatPrice(pos.currentPrice)}
                        </div>
                        {pos.pipsDelta !== null && (
                          <div className="live-pos-sub" data-tone={pos.pipsDelta >= 0 ? 'pos' : 'neg'}>
                            {pos.pipsDelta > 0 ? '+' : ''}{pos.pipsDelta.toFixed(1)} {t('pips', 'ปิ๊ป')}
                          </div>
                        )}
                      </td>
                      <td>
                        <div>
                          {pos.slPrice !== null ? (
                            <span>SL {formatPrice(pos.slPrice)}</span>
                          ) : (
                            <span className="live-no-sl-badge">{t('No SL', 'ไร้ SL')}</span>
                          )}
                          {' · '}
                          <span>TP {formatPrice(pos.tpPrice)}</span>
                        </div>
                        <div className="live-pos-sub">
                          {t('Risk:', 'เสี่ยง:')}{' '}
                          {pos.slRiskUsd !== null
                            ? formatAmount(pos.slRiskUsd, currency, false, masked)
                            : '—'}
                        </div>
                      </td>
                      <td>
                        <div
                          className="live-pos-pnl"
                          data-tone={pos.floatingPnl > 0 ? 'pos' : pos.floatingPnl < 0 ? 'neg' : 'flat'}
                        >
                          {formatAmount(pos.floatingPnl, currency, true, masked)}
                        </div>
                        <div className="live-pos-sub">
                          {masked ? '•••' : `${pos.floatingPct > 0 ? '+' : ''}${pos.floatingPct.toFixed(2)}%`}
                        </div>
                      </td>
                      <td>
                        <div data-tone={swapComm < 0 ? 'neg' : 'flat'}>
                          {formatAmount(swapComm, currency, true, masked)}
                        </div>
                        <div className="live-pos-sub">
                          {formatAmount(pos.swap, currency, true, masked)} / {formatAmount(pos.commission, currency, true, masked)}
                        </div>
                      </td>
                      <td>{formatDuration(pos.durationMin, lang)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
});
