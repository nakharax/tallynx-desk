import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowUpRight, Camera, Copy, Layers3, Radio, X } from 'lucide-react';
import { GhrWorkspaceState, TradeDirection } from '../types/ghr';
import { fmtUSD, formatCalculatorLot, getActiveCalculator } from '../utils/ghrRules';
import { useLiveChartFeed } from '../utils/useLiveChartFeed';
import { deskText, type DeskLanguage } from '../utils/deskI18n';
import type { DeskTheme } from '../utils/webHandoff';
import type { QuantPortfolioInput } from '../utils/quantSupervisionEngine';
import { AiRiskSupervisionCard } from './AiRiskSupervisionCard';

interface TradingViewChartSectionProps {
  state: GhrWorkspaceState;
  lang?: DeskLanguage;
  deskTheme?: DeskTheme;
  riskSupervisionPortfolio?: QuantPortfolioInput;
  onUpdateDir: (dir: TradeDirection) => void;
  onUpdateEntry: (raw: string, num: number) => void;
  onCopyText: (text: string, label: string) => void;
  onAnalyzeInCoach?: (symbol: string) => void;
}

type BrokerSymbol =
  | 'OANDA:XAUUSD'
  | 'FOREXCOM:XAUUSD'
  | 'PEPPERSTONE:XAUUSD'
  | 'CAPITALCOM:GOLD';

type TimeframeInterval = '1' | '5' | '15' | '60' | '240' | 'D';

const BROKER_OPTIONS: { value: BrokerSymbol; label: string }[] = [
  { value: 'OANDA:XAUUSD', label: 'OANDA · XAU/USD' },
  { value: 'FOREXCOM:XAUUSD', label: 'FOREX.com · XAU/USD' },
  { value: 'PEPPERSTONE:XAUUSD', label: 'Pepperstone · XAU/USD' },
  { value: 'CAPITALCOM:GOLD', label: 'Capital.com · GOLD Spot' },
];

const TIMEFRAME_OPTIONS: { value: TimeframeInterval; label: string; badge?: [string, string] }[] = [
  { value: '1', label: 'M1' },
  { value: '5', label: 'M5', badge: ['Gate 3 Entry', 'Gate 3 จุดเข้า'] },
  { value: '15', label: 'M15' },
  { value: '60', label: 'H1', badge: ['Gates 1–2 Structure', 'Gate 1–2 โครงสร้าง'] },
  { value: '240', label: 'H4' },
  { value: 'D', label: 'D1' },
];
const FEED_TIMEFRAMES: Record<TimeframeInterval, string | null> = {
  '1': null, '5': '5m', '15': '15m', '60': '1h', '240': '4h', D: '1d',
};

function ChartTelemetryTape({ timeframe, lang }: { timeframe: string | null; lang: DeskLanguage }) {
  const t = (en: string, th: string) => deskText(lang, en, th);
  const { liveTelemetry, chartError } = useLiveChartFeed({
    enabled: timeframe !== null, initialSymbol: 'XAUUSD', initialTimeframe: timeframe ?? '5m',
    fetchStructureTf: false, pollIntervalMs: 30000,
  });
  const feed = liveTelemetry?.timeframe === timeframe ? liveTelemetry : null;
  const bias = feed?.trendBias;
  const source = !timeframe ? t('M1 indicators unavailable', 'ไม่มีข้อมูลตัวชี้วัด M1')
    : chartError ? t('Feed unavailable', 'แหล่งข้อมูลไม่พร้อมใช้งาน')
    : feed ? feed.source : t('Loading indicators…', 'กำลังโหลดตัวชี้วัด…');
  return (
    <div className="chart-tape">
      <div className="chart-tape-source">
        <strong><Radio size={15} aria-hidden="true" /> XAUUSD · {(timeframe ?? '1m').toUpperCase()}</strong>
        <small>{source}{feed && <> · <time dateTime={feed.fetchedAt}>{new Date(feed.fetchedAt).toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })} ICT</time></>}</small>
      </div>
      <div><small>EMA20 / 50</small><strong>{feed ? feed.ema20.toFixed(2) + ' / ' + feed.ema50.toFixed(2) : '—'}</strong></div>
      <div><small>RSI14</small><strong>{feed?.rsi14.toFixed(1) ?? '—'}</strong></div>
      <div><small>ATR14</small><strong>{feed?.atr14.toFixed(2) ?? '—'}</strong></div>
      <div><small>{t('Trend bias', 'แนวโน้ม')}</small><strong data-bias={bias}>
        {bias === 'BULLISH' ? t('Bullish', 'ขาขึ้น') : bias === 'BEARISH' ? t('Bearish', 'ขาลง') : bias === 'NEUTRAL' ? t('Neutral', 'เป็นกลาง') : '—'}
      </strong></div>
    </div>
  );
}


interface SingleTradingViewEmbedProps {
  symbol: BrokerSymbol;
  interval: TimeframeInterval;
  theme: 'light' | 'dark';
  lang: DeskLanguage;
  titleBadge?: string;
}

const SingleTradingViewEmbed: React.FC<SingleTradingViewEmbedProps> = ({
  symbol,
  interval,
  theme,
  lang,
  titleBadge,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = '';

    const widgetWrap = document.createElement('div');
    widgetWrap.className = 'tradingview-widget-container';
    widgetWrap.style.position = 'absolute';
    widgetWrap.style.inset = '0';
    widgetWrap.style.width = '100%';
    widgetWrap.style.height = '100%';

    const widgetInner = document.createElement('div');
    widgetInner.className = 'tradingview-widget-container__widget';
    widgetInner.style.width = '100%';
    widgetInner.style.height = '100%';
    widgetWrap.appendChild(widgetInner);

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: 'Asia/Bangkok',
      theme,
      style: '1',
      locale: lang === 'th' ? 'th_TH' : 'en',
      enable_publishing: false,
      allow_symbol_change: true,
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: true,
      calendar: false,
      hide_volume: false,
      withdateranges: true,
      details: false,
      hotlist: false,
      studies: ['STD;EMA', 'STD;RSI'],
      support_host: 'https://www.tradingview.com',
    });

    widgetWrap.appendChild(script);
    container.appendChild(widgetWrap);

    return () => {
      if (container) {
        container.innerHTML = '';
      }
    };
  }, [symbol, interval, theme, lang]);

  return (
    <div className="tv-embed" data-chart-theme={theme}>
      {titleBadge && (
        <div className="tv-embed-heading">
          <span>{titleBadge}</span>
          <span className="mono tv-embed-symbol">
            {symbol} · TF {interval === '60' ? 'H1' : interval === '240' ? 'H4' : interval === 'D' ? 'D1' : `M${interval}`}
          </span>
        </div>
      )}
      <div ref={containerRef} className="tv-embed-canvas" />
    </div>
  );
};

export const TradingViewChartSection: React.FC<TradingViewChartSectionProps> = ({
  state,
  lang = 'en',
  deskTheme = 'alabaster',
  riskSupervisionPortfolio,
  onUpdateDir,
  onUpdateEntry,
  onCopyText,
  onAnalyzeInCoach,
}) => {
  const [symbol, setSymbol] = useState<BrokerSymbol>('OANDA:XAUUSD');
  const [interval, setIntervalState] = useState<TimeframeInterval>('15');
  const [layoutMode, setLayoutMode] = useState<'SINGLE' | 'DUAL_GHR'>('DUAL_GHR');
  const [chartThemeOverride, setChartThemeOverride] = useState<'light' | 'dark'>();
  const chartTheme = chartThemeOverride ?? (deskTheme === 'obsidian' ? 'dark' : 'light');
  const [snapshot, setSnapshot] = useState<{ plan: ReturnType<typeof getActiveCalculator>; dir: TradeDirection; time: string } | null>(null);
  const t = (en: string, th: string) => deskText(lang, en, th);

  const plan = useMemo(() => getActiveCalculator(state), [state]);
  const levels = [{ label: 'SL', ...plan.sl }, ...plan.legs.map((leg, i) => ({ label: 'TP' + (i + 1), ...leg }))];
  const price = (value: number) => value.toFixed(plan.contract.priceDecimals);
  const timeframe = FEED_TIMEFRAMES[layoutMode === 'DUAL_GHR' ? '5' : interval];

  const handleCopyMt5FromChart = () => {
    if (!plan.isValid) return;
    const text = [
      `${plan.instrument} ${state.calcDir} LIMIT @ ${price(plan.entry)}`,
      `SL ${price(plan.sl.price)}`,
      ...plan.legs.map((leg, i) => `TP${i + 1} ${price(leg.price)} (${formatCalculatorLot(leg.lot)} L)`),
    ].join(' | ');
    onCopyText(text, t('MT5 plan from chart', 'แผน MT5 จากกราฟ'));
  };

  return (
    <section id="tv-chart-root" className="fx-analysis-root">
      <ChartTelemetryTape key={timeframe ?? '1m'} timeframe={timeframe} lang={lang} />

      <div className="card tv-workspace">
        <div className="card-header tv-toolbar">
          <div className="tv-control-group">
            <h2 className="card-title desk-icon-title"><Activity size={16} aria-hidden="true" />{t('Live gold chart', 'กราฟทองคำสด')}</h2>
            <span className="desk-tag mono">{symbol}</span>
          </div>

          <div className="tv-control-group">
            {/* Layout Mode Toggle: Single vs Dual H1+M5 */}
            <div className="chart-mode-toggle" role="group" aria-label={t('Chart layout', 'รูปแบบการแสดงกราฟ')}>
              <button
                type="button"
                aria-pressed={layoutMode === 'DUAL_GHR'}
                className={`chart-mode-btn ${layoutMode === 'DUAL_GHR' ? 'active' : ''}`}
                onClick={() => setLayoutMode('DUAL_GHR')}
                title={t('Show H1 structure (Gates 1–2) and M5 pullback entry (Gate 3) side by side', 'แสดงกราฟ H1 สำหรับดูโครงสร้าง (Gate 1–2) และกราฟ M5 สำหรับดูจังหวะย่อเข้า (Gate 3) พร้อมกัน')}
              >
                {t('Dual chart (H1 + M5 GHR)', 'กราฟคู่ (H1 + M5 GHR)')}
              </button>
              <button
                type="button"
                aria-pressed={layoutMode === 'SINGLE'}
                className={`chart-mode-btn ${layoutMode === 'SINGLE' ? 'active' : ''}`}
                onClick={() => setLayoutMode('SINGLE')}
                title={t('Show one full-width chart', 'แสดงกราฟเดี่ยวแบบเต็มความกว้าง')}
              >
                {t('Single chart', 'กราฟเดี่ยวเต็มจอ')}
              </button>
            </div>

            {/* Timeframe Selector (when in Single Mode) */}
            {layoutMode === 'SINGLE' && (
              <div className="chart-mode-toggle" role="group" aria-label={t('Select timeframe', 'เลือกกรอบเวลา')}>
                {TIMEFRAME_OPTIONS.map((tf) => (
                  <button
                    key={tf.value}
                    type="button"
                    aria-pressed={interval === tf.value}
                    className={`chart-mode-btn ${interval === tf.value ? 'active' : ''}`}
                    onClick={() => setIntervalState(tf.value)}
                    title={tf.badge ? t(...tf.badge) : t(`Timeframe ${tf.label}`, `กรอบเวลา ${tf.label}`)}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            )}

            {/* Broker Source Selector */}
            <div className="topbar-group">
              <div className="control-pill">
                <label htmlFor="tv-broker-select" style={{ fontSize: '11px' }}>
                  {t('Broker:', 'โบรกเกอร์:')}
                </label>
                <select
                  id="tv-broker-select"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value as BrokerSymbol)}
                  style={{ fontSize: '11.5px' }}
                >
                  {BROKER_OPTIONS.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}{b.value === 'OANDA:XAUUSD' ? t(' (Standard)', ' (มาตรฐาน)') : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Light / Dark Chart Theme */}
            <button
              type="button"
              className="btn sm"
              onClick={() => setChartThemeOverride(chartTheme === 'light' ? 'dark' : 'light')}
              title={t('Toggle the TradingView chart theme', 'สลับธีมสว่างหรือมืดของกราฟ TradingView')}
            >
              {chartTheme === 'light' ? t('Dark chart', 'กราฟโหมดมืด') : t('Light chart', 'กราฟโหมดสว่าง')}
            </button>
          </div>
        </div>

        {/* Live 3-TP Reference Strip linked directly with Calculator */}
        <div className="tv-reference-bar">
          <div className="tv-plan-header">
            <strong className="desk-icon-title"><Layers3 size={15} aria-hidden="true" />{t('Calculator blueprint', 'แผนจากเครื่องคำนวณ')} · {plan.instrument}</strong>
            <span className="mono sensitive-val">{plan.isValid ? formatCalculatorLot(plan.totalLot) + ' L · ' + fmtUSD(plan.risk) : '—'}</span>
          </div>
          <div className="tv-plan-controls">
            <div className="tv-control-group">
            <div className="chart-mode-toggle">
              <button
                type="button"
                aria-pressed={state.calcDir === 'BUY'}
                className={`chart-mode-btn ${state.calcDir === 'BUY' ? 'active buy-pill' : ''}`}
                onClick={() => onUpdateDir('BUY')}
              >
                BUY LIMIT
              </button>
              <button
                type="button"
                aria-pressed={state.calcDir === 'SELL'}
                className={`chart-mode-btn ${state.calcDir === 'SELL' ? 'active sell-pill' : ''}`}
                onClick={() => onUpdateDir('SELL')}
              >
                SELL LIMIT
              </button>
            </div>

            <div className="tv-entry-field">
              <label
                htmlFor="tv-quick-entry"
                style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)' }}
              >
                {t('Entry ($):', 'จุดเข้า ($):')}
              </label>
              <input
                id="tv-quick-entry"
                type="number"
                step={10 ** -plan.contract.priceDecimals}
                className="mono"
                value={state.calcEntryRaw}
                onChange={(e) => {
                  const raw = e.target.value;
                  const num = parseFloat(raw);
                  onUpdateEntry(raw, Number.isFinite(num) ? num : 0);
                }}
              />
            </div>
            </div>
            <div className="tv-plan-actions">
            <button type="button" className="btn xs" disabled={!plan.isValid} onClick={handleCopyMt5FromChart}>
              <Copy size={13} aria-hidden="true" />{t('Copy MT5', 'คัดลอก MT5')}
            </button>
            <button
              type="button"
              className="btn xs"
              disabled={!plan.isValid && !snapshot}
              aria-expanded={!!snapshot}
              onClick={() => setSnapshot(snapshot ? null : { plan, dir: state.calcDir, time: new Date().toISOString() })}
            >
              <Camera size={13} aria-hidden="true" />{snapshot ? t('Hide snapshot', 'ซ่อนภาพแผน') : t('Snapshot', 'จับภาพแผน')}
            </button>
            {onAnalyzeInCoach && (
              <button
                type="button"
                className="btn xs primary tv-coach-cta"
                onClick={() => onAnalyzeInCoach('XAUUSD')}
                title={t('Review this symbol’s chart structure in AI Coach', 'เปิดการวิเคราะห์โครงสร้างกราฟสินทรัพย์นี้ใน AI Coach')}
              >
                {t('Analyze in AI Live Desk', 'วิเคราะห์ใน AI Live Desk')}<ArrowUpRight size={14} aria-hidden="true" />
              </button>
            )}
            </div>
          </div>
          <div className="tv-plan-levels">
            {levels.map(level => (
              <div key={level.label} data-stop={level.label === 'SL'}>
                <small>{level.label} <span>{plan.isValid ? (level.label === 'SL' ? '−' : '+') + level.points.toLocaleString(lang, { maximumFractionDigits: 4 }) + 'p' : '—'}</span></small>
                <strong className="mono">{plan.isValid ? price(level.price) : '—'}</strong>
              </div>
            ))}
          </div>
        </div>

        {snapshot && (
          <figure className="tv-plan-snapshot">
            <figcaption>
              <strong className="desk-icon-title"><Camera size={14} aria-hidden="true" />{t('Plan snapshot', 'ภาพแผนความเสี่ยง')}</strong>
              <span className="mono">{snapshot.plan.instrument} · {snapshot.dir} · {new Date(snapshot.time).toLocaleTimeString(lang, { timeZone: 'Asia/Bangkok', hour12: false })} ICT</span>
              <button type="button" className="btn xs" onClick={() => setSnapshot(null)}><X size={12} aria-hidden="true" />{t('Close', 'ปิด')}</button>
            </figcaption>
            {[
              { label: t('Entry', 'จุดเข้า'), price: snapshot.plan.entry, tone: 'entry' },
              { label: 'SL', price: snapshot.plan.sl.price, tone: 'stop' },
              ...snapshot.plan.legs.map((leg, index) => ({ label: 'TP' + (index + 1), price: leg.price, tone: 'target' })),
            ].sort((a, b) => b.price - a.price).map(level => (
              <div className="snapshot-price mono" key={level.label} data-tone={level.tone}>
                <span>{level.label}</span><i aria-hidden="true" /><strong>{level.price.toFixed(snapshot.plan.contract.priceDecimals)}</strong>
              </div>
            ))}
          </figure>
        )}

        {/* Main TradingView Chart Canvas */}
        <div
          className={layoutMode === 'DUAL_GHR' ? 'tv-canvas-grid is-dual' : 'tv-canvas-grid'}
        >
          {layoutMode === 'DUAL_GHR' ? (
            <>
              <SingleTradingViewEmbed
                symbol={symbol}
                interval="60"
                theme={chartTheme}
                lang={lang}
                titleBadge={t('1. H1 structure (Gate 1: 100–200p HVN zone · Gate 2: confirmed H1 candle close)', '1. โครงสร้างหลัก H1 (Gate 1: โซน HVN 100–200p · Gate 2: แท่ง H1 ปิดยืนยัน)')}
              />
              <SingleTradingViewEmbed
                symbol={symbol}
                interval="5"
                theme={chartTheme}
                lang={lang}
                titleBadge={t('2. M5 pullback (Gate 3: M5 candle close for a Limit setup)', '2. การย่อตัวบน M5 (Gate 3: เกณฑ์แท่ง M5 ปิดสำหรับ Limit)')}
              />
            </>
          ) : (
            <SingleTradingViewEmbed
              symbol={symbol}
              interval={interval}
              theme={chartTheme}
              lang={lang}
              titleBadge={`${t('Live chart', 'กราฟเรียลไทม์')} ${symbol} · ${t('Timeframe', 'กรอบเวลา')} ${
                TIMEFRAME_OPTIONS.find((t) => t.value === interval)?.label || interval
              }`}
            />
          )}
        </div>
      </div>
      <AiRiskSupervisionCard
        key={timeframe ?? '1m'}
        lang={lang}
        initialTimeframe={timeframe ?? '5m'}
        portfolio={state.privacyMasked ? undefined : riskSupervisionPortfolio}
        accountScope={state.activePort}
      />
    </section>
  );
};
