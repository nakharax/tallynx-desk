import React, { useEffect, useState } from 'react';
import { ArrowUpRight, ChartLine, Maximize2, Minimize2, Users, X } from 'lucide-react';
import {
  GuardrailAlert,
  LiveDeskParticipant,
  RealtimeAnalyticsSummary,
} from '../utils/realtimeGuardrails';
import { ChatMessage, ChatModelId, GhrWorkspaceState, LiveChartTelemetry } from '../types/ghr';
import { deskText, type DeskLanguage } from '../utils/deskI18n';
import type { DeskPageSnapshot } from '../utils/ghrRules';
import {
  formatChartPrice,
  LIVE_CHART_SYMBOLS,
  LIVE_CHART_TIMEFRAMES,
  useLiveChartFeed,
} from '../utils/useLiveChartFeed';
import type { QuickDeskAction } from './TradingCoachChat';

const TradingCoachChat = React.lazy(() =>
  import('./TradingCoachChat').then((module) => ({ default: module.TradingCoachChat }))
);

export interface DeskRoomMessage {
  id: string;
  handle: string;
  text: string;
  symbol?: string;
  createdAt: string;
  isTradeIdea?: boolean;
}

interface RightDockPanelProps {
  lang?: DeskLanguage;
  open: boolean;
  onClose: () => void;
  onOpenMall: () => void;
  workspaceState: GhrWorkspaceState;
  pageSnapshot: DeskPageSnapshot;
  isOnline: boolean;
  alerts: GuardrailAlert[];
  analytics: RealtimeAnalyticsSummary;
  currentUserUid?: string | null;
  platformAccessAllowed?: boolean;
  currentUserLabel: string;
  rMultipleToday?: number;
  status: LiveDeskParticipant['status'];
  onStatusChange: (status: LiveDeskParticipant['status']) => void;
  requestedSymbol?: string | null;
  onClearRequestedSymbol?: () => void;
  pendingCoachPrompt?: string | null;
  onClearPendingCoachPrompt?: () => void;
  focusCoachTick?: number;
  onUpdateCoachMessages: (messages: ChatMessage[]) => void;
  onUpdateCoachModel: (model: ChatModelId) => void;
  onResetCoachChat: () => void;
  onQuickDeskAction?: (action: QuickDeskAction) => void;
  onNotify: (msg: string) => void;
}

const GUARDRAIL_TITLES_TH: Record<GuardrailAlert['code'], string> = {
  REVENGE_TRADE: 'เตือนการเทรดเอาคืน',
  OVER_LOT: 'เตือนความเสี่ยงจากขนาดออเดอร์',
  OFF_SESSION_LEAK: 'เตือนช่วงเวลาที่ผลเทรดอ่อนตัว',
  DAILY_DD_NEAR_LIMIT: 'เตือนใกล้ถึงขีดจำกัดขาดทุนรายวัน',
};

const SESSION_NAMES = { ASIA: 'Asia', LONDON: 'London', NEW_YORK: 'New York' } as const;

function formatBiggestLeak(analytics: RealtimeAnalyticsSummary, lang: DeskLanguage): string {
  if (lang === 'th') return analytics.biggestLeakText;
  const worst = Object.values(analytics.sessions)
    .filter((session) => session.totalTrades >= 2 && session.netPnlUsd < 0)
    .sort((a, b) => a.netPnlUsd - b.netPnlUsd)[0];
  return worst
    ? `${SESSION_NAMES[worst.session]} had the largest net loss (win rate ${worst.winRatePct}%, net ${worst.netPnlUsd.toFixed(2)} USD, average ${worst.avgR}R).`
    : 'No clear performance leak across sessions.';
}

function formatGuardrailDetail(alert: GuardrailAlert, lang: DeskLanguage): string {
  if (lang === 'th') return alert.detail;
  switch (alert.code) {
    case 'REVENGE_TRADE':
      return alert.detail
        .replace(/^เปิดออเดอร์ซ้ำภายใน (\d+) นาทีหลังไม้ก่อนหน้าขาดทุน แนะนำพัก cooldown 15 นาที$/, 'A new trade opened within $1 minutes of a loss. Take a 15-minute cooldown.')
        .replace(/^พบการขาดทุนสะสม (\d+) ไม้ในวันเดียว ควรหยุดทบทวน 12-Gate ก่อนเข้าเพิ่ม$/, '$1 trades closed at a loss today. Pause and review the 12-Gate checklist before another entry.');
    case 'OVER_LOT':
      return alert.detail.replace(/^ความเสี่ยงต่อ Idea ปัจจุบัน \((\$[^)]+)\) สูงกว่าค่ากลางพอร์ต \((\$[^)]+)\) ถึง (\S+) เท่า$/, (_, risk, median, ratio) => `Current risk per idea (${risk}) is ${ratio}× the account median (${median}).`);
    case 'OFF_SESSION_LEAK':
      return alert.detail.replace(/^ช่วง (ASIA|LONDON|NEW_YORK) มี Winrate (\S+)% จาก (\d+) ไม้ \(สุทธิ (\S+) USD\)$/, (_, session: keyof typeof SESSION_NAMES, winRate, trades, pnl) => `${SESSION_NAMES[session]} recorded a ${winRate}% win rate across ${trades} trades (net ${pnl} USD).`);
    case 'DAILY_DD_NEAR_LIMIT':
      return alert.detail.replace(/^ใช้งบขาดทุนรายวันไปแล้ว (\S+)% \(([^)]+)\)$/, 'Daily loss budget used: $1% ($2).');
  }
}

function formatTrendBias(bias: LiveChartTelemetry['trendBias'], lang: DeskLanguage): string {
  const labels = { BULLISH: 'ขาขึ้น', BEARISH: 'ขาลง', NEUTRAL: 'เป็นกลาง' } as const;
  return deskText(lang, bias, labels[bias]);
}

export const RightDockPanel: React.FC<RightDockPanelProps> = ({
  lang = 'en',
  open,
  onClose,
  onOpenMall,
  workspaceState,
  pageSnapshot,
  isOnline,
  alerts,
  analytics,
  currentUserUid,
  platformAccessAllowed = false,
  currentUserLabel: _currentUserLabel,
  rMultipleToday: _rMultipleToday,
  status: _myStatus,
  onStatusChange: _onStatusChange,
  requestedSymbol,
  onClearRequestedSymbol,
  pendingCoachPrompt,
  onClearPendingCoachPrompt,
  focusCoachTick,
  onUpdateCoachMessages,
  onUpdateCoachModel,
  onResetCoachChat,
  onQuickDeskAction,
  onNotify: _onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<'COACH' | 'GUARDRAIL'>(() => {
    try {
      const saved = window.localStorage.getItem('TREDYN_DOCK_TAB');
      return saved === 'GUARDRAIL' ? 'GUARDRAIL' : 'COACH';
    } catch {
      return 'COACH';
    }
  });
  const [showChartStrip, setShowChartStrip] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('TREDYN_DOCK_CHART_STRIP') === '1';
    } catch {
      return false;
    }
  });
  const [wideDock, setWideDock] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('TREDYN_DOCK_WIDE') === '1';
    } catch {
      return false;
    }
  });
  const [internalCoachPrompt, setInternalCoachPrompt] = useState<string | null>(null);

  const [initialSym] = useState(() => {
    try {
      return window.localStorage.getItem('TREDYN_DOCK_SYMBOL') || 'XAUUSD';
    } catch {
      return 'XAUUSD';
    }
  });
  const [initialTf] = useState(() => {
    try {
      return window.localStorage.getItem('TREDYN_DOCK_TF') || '15m';
    } catch {
      return '15m';
    }
  });

  const {
    chartSymbol,
    setChartSymbol,
    chartTimeframe,
    setChartTimeframe,
    liveTelemetry,
    structureTelemetry,
    chartLoading,
    chartError,
    autoPoll,
    setAutoPoll,
    refreshTelemetry,
  } = useLiveChartFeed({
    enabled: open,
    initialSymbol: initialSym,
    initialTimeframe: initialTf,
    pollIntervalMs: 10000,
    fetchStructureTf: true,
  });

  useEffect(() => {
    try {
      window.localStorage.setItem('TREDYN_DOCK_TAB', activeTab);
    } catch {
      // ignore storage errors
    }
  }, [activeTab]);

  useEffect(() => {
    try {
      window.localStorage.setItem('TREDYN_DOCK_WIDE', wideDock ? '1' : '0');
    } catch {
      // ignore storage errors
    }
  }, [wideDock]);

  useEffect(() => {
    try {
      window.localStorage.setItem('TREDYN_DOCK_CHART_STRIP', showChartStrip ? '1' : '0');
    } catch {
      // ignore storage errors
    }
  }, [showChartStrip]);

  useEffect(() => {
    try {
      window.localStorage.setItem('TREDYN_DOCK_SYMBOL', chartSymbol);
      window.localStorage.setItem('TREDYN_DOCK_TF', chartTimeframe);
    } catch {
      // ignore storage errors
    }
  }, [chartSymbol, chartTimeframe]);

  useEffect(() => {
    if (requestedSymbol && requestedSymbol.trim()) {
      setChartSymbol(requestedSymbol.trim().toUpperCase());
      setActiveTab('COACH');
      onClearRequestedSymbol?.();
    }
  }, [requestedSymbol, setChartSymbol, onClearRequestedSymbol]);

  useEffect(() => {
    if (focusCoachTick && focusCoachTick > 0) {
      setActiveTab('COACH');
    }
  }, [focusCoachTick]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('dialog[open]')) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const t = (en: string, th: string) => deskText(lang, en, th);
  const biggestLeak = formatBiggestLeak(analytics, lang);
  const accountCount = Object.keys(workspaceState.accounts || {}).length;

  return (
    <>
      <div className="right-dock-backdrop" aria-hidden="true" onClick={onClose} />
      <aside
        aria-label={t("TallyNX AI Live Desk Right Dock", "แผงขวา TallyNX AI Live Desk")}
        className={wideDock ? 'right-dock-aside is-wide' : 'right-dock-aside'}
      >
      {/* Header */}
      <div className="right-dock-header">
        <div className="right-dock-tabs" role="group" aria-label={t("Live Desk views", "มุมมอง Live Desk")}>
          <button
            type="button"
            className="btn xs"
            aria-pressed={activeTab === 'COACH'}
            onClick={() => setActiveTab('COACH')}
          >
            <span className="right-dock-tab-label">{t('AI Coach', 'โค้ช AI')}</span>
          </button>
          <button
            type="button"
            className="btn xs"
            aria-pressed={activeTab === 'GUARDRAIL'}
            onClick={() => setActiveTab('GUARDRAIL')}
          >
            <span className="right-dock-tab-label">{t('Guardrails', 'คุมความเสี่ยง')}</span>{' '}
            <span className="mono" data-alerts={alerts.length > 0}>({alerts.length})</span>
          </button>
        </div>
        <div className="right-dock-tools" role="group" aria-label={t("Live Desk panel controls", "ตัวควบคุมแผง Live Desk")}>
          <button
            type="button"
            className="btn xs"
            onClick={onOpenMall}
            title={t('Open Community Mall', 'เปิดห้อง Community Mall')}
          >
            <Users size={12} aria-hidden="true" />
            <span>{t('Mall', 'มอลล์')}</span>
            <ArrowUpRight size={11} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn xs right-dock-expand-btn"
            aria-label={wideDock ? t('Collapse panel', 'ย่อแผง') : t('Expand panel', 'ขยายแผง')}
            aria-pressed={wideDock}
            onClick={() => setWideDock((v) => !v)}
            title={wideDock ? t('Collapse panel (390px)', 'ย่อความกว้างแผง (390px)') : t('Expand panel (520px)', 'ขยายแผง (520px)')}
          >
            {wideDock ? <Minimize2 size={12} aria-hidden="true" /> : <Maximize2 size={12} aria-hidden="true" />}
            <span>{wideDock ? t('Collapse', 'ย่อ') : t('Expand', 'ขยาย')}</span>
          </button>
          <button
            type="button"
            className="btn xs"
            aria-label={showChartStrip ? t('Hide live chart strip', 'ซ่อนแถบกราฟสด') : t('Show live chart strip', 'แสดงแถบกราฟสด')}
            aria-expanded={showChartStrip}
            onClick={() => setShowChartStrip((v) => !v)}
            title={showChartStrip ? t('Hide live chart', 'ซ่อนกราฟสด') : t('Show live chart strip', 'แสดงแถบกราฟสด')}
          >
            <ChartLine size={13} aria-hidden="true" />
            <span>{t('Chart', 'กราฟ')}</span>
          </button>
          <button type="button" className="btn xs" onClick={onClose} aria-label={t("Close right dock", "ปิดแผงขวา")}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Active Page Context Bar */}
      <div className="right-dock-context">
        <div className="right-dock-page" title={pageSnapshot.activePageTitle}>
          {t("Reading:", "กำลังอ่านหน้า:")} <strong>{pageSnapshot.activePageTitle}</strong>
        </div>
        <div className="right-dock-context-summary">
          {liveTelemetry && (
            <>
              <span className="mono">{liveTelemetry.symbol} {formatChartPrice(liveTelemetry.currentPrice, liveTelemetry.symbol)}</span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span>
            {pageSnapshot.activePageId === 'journal-root' && typeof pageSnapshot.filteredJournalCount === 'number'
              ? `${pageSnapshot.filteredJournalCount} ${t(pageSnapshot.filteredJournalCount === 1 ? 'Trade' : 'Trades', 'ไม้')}`
              : `${accountCount} ${t(accountCount === 1 ? 'Port' : 'Ports', 'พอร์ต')}`}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className={activeTab === 'COACH' ? 'right-dock-body is-coach-mode' : 'right-dock-body'}>
        {/* Collapsible Live Chart Reader Strip (Shared across AI Coach, Guardrail, Live Desk) */}
        {showChartStrip && (
          <div className="right-dock-chart">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <select
                  aria-label={t("Live chart symbol", "เลือกสัญลักษณ์ของกราฟสด")}
                  value={chartSymbol}
                  onChange={(e) => setChartSymbol(e.target.value)}
                  style={{ fontSize: '11px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                >
                  {LIVE_CHART_SYMBOLS.map((sym) => (
                    <option key={sym} value={sym}>{sym}</option>
                  ))}
                </select>
                <select
                  aria-label={t("Live chart timeframe", "เลือกกรอบเวลาของกราฟสด")}
                  value={chartTimeframe}
                  onChange={(e) => setChartTimeframe(e.target.value)}
                  style={{ fontSize: '11px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                >
                  {LIVE_CHART_TIMEFRAMES.map((tf) => (
                    <option key={tf} value={tf}>{tf.toUpperCase()}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  type="button"
                  className={`btn xs ${autoPoll ? 'emerald' : ''}`}
                  onClick={() => setAutoPoll((v) => !v)}
                  style={{ fontSize: '10px', padding: '2px 6px' }}
                  title={t("Auto-refresh the live chart every 10 seconds", "อัปเดตกราฟสดอัตโนมัติทุก 10 วินาที")}
                >
                  {autoPoll ? t('● Live', '● สด') : t('Paused', 'พักอยู่')}
                </button>
                <button
                  type="button"
                  className="btn xs"
                  onClick={() => void refreshTelemetry(chartSymbol, chartTimeframe)}
                  disabled={chartLoading}
                  style={{ fontSize: '10px', padding: '2px 6px' }}
                  aria-label={t("Refresh live chart", "รีเฟรชกราฟสด")}
                >
                  {chartLoading ? '...' : '↻'}
                </button>
              </div>
            </div>

            {chartError ? (
              <div style={{ fontSize: '11px', color: 'var(--rose)' }}>{t('Unable to refresh live chart data.', 'อัปเดตข้อมูลกราฟสดไม่สำเร็จ')}</div>
            ) : liveTelemetry ? (
              <>
                <div className="right-dock-chart-quote">
                  <div className="mono" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {formatChartPrice(liveTelemetry.currentPrice, liveTelemetry.symbol)}{' '}
                    <span style={{ fontSize: '10.5px', fontWeight: 600, color: liveTelemetry.changePct >= 0 ? 'var(--emerald)' : 'var(--rose)' }}>
                      {liveTelemetry.changePct >= 0 ? '+' : ''}{liveTelemetry.changePct.toFixed(2)}%
                    </span>
                  </div>
                  <span
                    className={`pill ${
                      liveTelemetry.trendBias === 'BULLISH'
                        ? 'emerald'
                        : liveTelemetry.trendBias === 'BEARISH'
                          ? 'rose'
                          : 'blue'
                    }`}
                    style={{ fontSize: '10px', padding: '1px 7px' }}
                  >
                    {formatTrendBias(liveTelemetry.trendBias, lang)}
                  </span>
                </div>

                <div className="mono right-dock-chart-metrics">
                  <div>EMA20/50: <strong>{formatChartPrice(liveTelemetry.ema20, liveTelemetry.symbol)}</strong> / {formatChartPrice(liveTelemetry.ema50, liveTelemetry.symbol)}</div>
                  <div>RSI(14): <strong style={{ color: liveTelemetry.rsi14 >= 70 ? 'var(--rose)' : liveTelemetry.rsi14 <= 30 ? 'var(--emerald)' : 'var(--text-primary)' }}>{liveTelemetry.rsi14.toFixed(1)}</strong> · ATR <strong>{liveTelemetry.atr14.toFixed(2)}</strong></div>
                  <div>{t('Support:', 'แนวรับ:')} <strong style={{ color: 'var(--emerald)' }}>{formatChartPrice(liveTelemetry.supportLevel, liveTelemetry.symbol)}</strong></div>
                  <div>{t('Resistance:', 'แนวต้าน:')} <strong style={{ color: 'var(--rose)' }}>{formatChartPrice(liveTelemetry.resistanceLevel, liveTelemetry.symbol)}</strong></div>
                </div>
                <div className="mono right-dock-chart-meta">
                  <span>{liveTelemetry.source}</span>
                  <span>
                    {new Intl.DateTimeFormat(t('en-GB', 'th-TH'), {
                      timeZone: 'Asia/Bangkok',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: false,
                    }).format(new Date(liveTelemetry.fetchedAt))} ICT
                  </span>
                </div>

                {structureTelemetry && (
                  <div
                    className="mono"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '6px',
                      padding: '4px 7px',
                      borderRadius: '4px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-color)',
                      fontSize: '10px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <span>
                      {t('Structure', 'โครงสร้าง')} <strong>{structureTelemetry.timeframe.toUpperCase()}</strong>:{' '}
                      <strong
                        style={{
                          color:
                            structureTelemetry.trendBias === 'BULLISH'
                              ? 'var(--emerald)'
                              : structureTelemetry.trendBias === 'BEARISH'
                              ? 'var(--rose)'
                              : 'var(--blue)',
                        }}
                      >
                        {formatTrendBias(structureTelemetry.trendBias, lang)}
                      </strong>
                    </span>
                    <span>
                      EMA20 {formatChartPrice(structureTelemetry.ema20, structureTelemetry.symbol)} · RSI {structureTelemetry.rsi14.toFixed(0)}
                    </span>
                  </div>
                )}

                {(() => {
                  const candles = liveTelemetry.candles.slice(-28);
                  if (candles.length < 2) return null;
                  const closes = candles.map((c) => c.close);
                  const minP = Math.min(...closes);
                  const maxP = Math.max(...closes);
                  const span = Math.max(maxP - minP, 1e-6);
                  const pts = closes
                    .map((c, idx) => `${((idx / (closes.length - 1)) * 160).toFixed(1)},${(26 - ((c - minP) / span) * 20).toFixed(1)}`)
                    .join(' ');
                  const strokeColor = liveTelemetry.trendBias === 'BULLISH' ? 'var(--emerald)' : liveTelemetry.trendBias === 'BEARISH' ? 'var(--rose)' : 'var(--blue)';
                  return (
                    <svg viewBox="0 0 160 28" style={{ width: '100%', height: '28px', display: 'block' }} aria-label={t(`${liveTelemetry.symbol} mini chart`, `กราฟย่อ ${liveTelemetry.symbol}`)}>
                      <polyline fill="none" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" points={pts} />
                    </svg>
                  );
                })()}
              </>
            ) : (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t('Loading live chart for', 'กำลังโหลดกราฟสด')} {chartSymbol} ({chartTimeframe})…</div>
            )}
          </div>
        )}

        {activeTab === 'COACH' ? (
          <div className="right-dock-coach">
            <React.Suspense fallback={<div className="desk-module-status" role="status">{t('Loading coach…', 'กำลังโหลดโค้ช…')}</div>}>
            <TradingCoachChat
              compactDock
              lang={lang}
              currentUserUid={currentUserUid}
              platformAccessAllowed={platformAccessAllowed}
              state={workspaceState}
              pageSnapshot={pageSnapshot}
              isOnline={isOnline}
              onUpdateMessages={onUpdateCoachMessages}
              onUpdateModel={onUpdateCoachModel}
              onResetChat={onResetCoachChat}
              externalLiveTelemetry={liveTelemetry}
              externalStructureTelemetry={structureTelemetry}
              externalChartSymbol={chartSymbol}
              externalChartTimeframe={chartTimeframe}
              externalChartLoading={chartLoading}
              onExternalRefreshChart={() => refreshTelemetry(chartSymbol, chartTimeframe)}
              onQuickDeskAction={onQuickDeskAction}
              pendingPrompt={internalCoachPrompt || pendingCoachPrompt}
              onClearPendingPrompt={() => {
                setInternalCoachPrompt(null);
                onClearPendingCoachPrompt?.();
              }}
            />
            </React.Suspense>
          </div>
        ) : (
          <>
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '6px',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="refero-dots" aria-hidden="true">
                  <span style={{ width: '6px', height: '6px' }} />
                  <span style={{ width: '6px', height: '6px' }} />
                </span>
                <span>{t("Session analytics · updates after trades close", "สถิติตามช่วงเวลา · อัปเดตเมื่อปิดออเดอร์")}</span>
              </div>
              <div className="mono" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px' }}>
                <div>{t("Win rate:", "อัตราชนะ:")} <strong>{analytics.overallWinRatePct}%</strong></div>
                <div>{t("Profit factor:", "Profit Factor:")} <strong>{analytics.profitFactor}</strong></div>
                <div>{t("Asia win rate:", "อัตราชนะเอเชีย:")} <strong>{analytics.sessions.ASIA.winRatePct}%</strong></div>
                <div>{t("London win rate:", "อัตราชนะลอนดอน:")} <strong>{analytics.sessions.LONDON.winRatePct}%</strong></div>
                <div>{t("New York win rate:", "อัตราชนะนิวยอร์ก:")} <strong>{analytics.sessions.NEW_YORK.winRatePct}%</strong></div>
                <div>{t("Avg R:", "R เฉลี่ย:")} <strong>{analytics.avgRMultiple >= 0 ? '+' : ''}{analytics.avgRMultiple}R</strong></div>
              </div>
              <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                <strong>{t('Performance leak:', 'จุดที่ฉุดผลเทรด:')}</strong> {biggestLeak}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11.5px', fontWeight: 600, marginBottom: '6px' }}>
                {t("Trading discipline guardrails", "ระบบตรวจวินัยการเทรด")}
              </div>
              {alerts.length === 0 ? (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: '6px',
                    background: 'var(--emerald-soft)',
                    border: '1px solid var(--emerald-border)',
                    color: 'var(--emerald)',
                    fontSize: '11.5px',
                  }}
                >
                  {t("No signs of revenge trading or oversized positions.", "ไม่พบสัญญาณเทรดเอาคืนหรือเปิดออเดอร์เกินขนาด")}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {alerts.map((al) => (
                    <div
                      key={al.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        background: al.severity === 'critical' ? 'var(--rose-soft)' : 'var(--amber-soft)',
                        border: `1px solid ${al.severity === 'critical' ? 'var(--rose-border)' : 'var(--amber-border)'}`,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                        <strong style={{ fontSize: '11.5px', color: al.severity === 'critical' ? 'var(--rose)' : 'var(--amber)' }}>
                          {lang === 'th' ? GUARDRAIL_TITLES_TH[al.code] : al.title}
                        </strong>
                        <span className="mono" style={{ fontSize: '10px', fontWeight: 600 }}>
                          {lang === 'th' ? al.metricBadge.replace(/m gap$/, ' นาที').replace(/ losses$/, ' ไม้ขาดทุน').replace(/x median risk$/, ' เท่าของความเสี่ยงมัธยฐาน') : al.metricBadge}
                        </span>
                      </div>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                        {formatGuardrailDetail(al, lang)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              className="btn sm primary"
              style={{ width: '100%' }}
              onClick={() => {
                const chartLine = liveTelemetry
                  ? `กราฟสด ${liveTelemetry.symbol} ${liveTelemetry.timeframe} @ ${formatChartPrice(liveTelemetry.currentPrice, liveTelemetry.symbol)} (Trend ${liveTelemetry.trendBias}, EMA20 ${formatChartPrice(liveTelemetry.ema20, liveTelemetry.symbol)} / EMA50 ${formatChartPrice(liveTelemetry.ema50, liveTelemetry.symbol)}, RSI ${liveTelemetry.rsi14.toFixed(1)}, ATR ${liveTelemetry.atr14.toFixed(2)})`
                  : `กราฟ ${chartSymbol} (${chartTimeframe})`;
                setInternalCoachPrompt(
                  `วิเคราะห์${chartLine} ร่วมกับสถิติพอร์ตล่าสุด (Winrate ${analytics.overallWinRatePct}%, PF ${analytics.profitFactor}, จุดรั่วไหล: ${analytics.biggestLeakText}) และตรวจสอบแผน 3-TP ปัจจุบัน`
                );
                setActiveTab('COACH');
              }}
            >
              {t("Send chart and guardrails to AI Coach →", "ส่งกราฟสดและข้อมูลความเสี่ยงให้โค้ช AI →")}
            </button>
          </>
        )}
      </div>
      </aside>
    </>
  );
};
