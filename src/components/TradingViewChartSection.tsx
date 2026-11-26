import React, { useEffect, useRef, useState } from 'react';
import { Activity, ArrowUpRight, Radio } from 'lucide-react';
import { useLiveChartFeed } from '../utils/useLiveChartFeed';
import { deskText, type DeskLanguage } from '../utils/deskI18n';
import type { DeskTheme } from '../utils/webHandoff';

interface TradingViewChartSectionProps {
  lang?: DeskLanguage;
  deskTheme?: DeskTheme;
  onOpenAiRisk: () => void;
  onOpenComex: () => void;
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

const TIMEFRAME_OPTIONS: { value: TimeframeInterval; label: string }[] = [
  { value: '1', label: 'M1' },
  { value: '5', label: 'M5' },
  { value: '15', label: 'M15' },
  { value: '60', label: 'H1' },
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
    : feed && (chartError || feed.staleCache) ? t('Showing the last available feed', 'แสดงข้อมูลล่าสุดที่มี')
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
  const [embedError, setEmbedError] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = '';
    setEmbedError(false);

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
    script.onerror = () => setEmbedError(true);
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
      script.onerror = null;
      widgetWrap.remove();
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
      {embedError && <p className="tv-embed-error" role="status">{deskText(lang, 'TradingView could not load.', 'ไม่สามารถโหลด TradingView ได้')}</p>}
    </div>
  );
};

export const TradingViewChartSection: React.FC<TradingViewChartSectionProps> = ({
  lang = 'en',
  deskTheme = 'alabaster',
  onOpenAiRisk,
  onOpenComex,
}) => {
  const [symbol, setSymbol] = useState<BrokerSymbol>('OANDA:XAUUSD');
  const [interval, setIntervalState] = useState<TimeframeInterval>('15');
  const [layoutMode, setLayoutMode] = useState<'SINGLE' | 'DUAL_GHR'>('DUAL_GHR');
  const [chartThemeOverride, setChartThemeOverride] = useState<'light' | 'dark'>();
  const chartTheme = chartThemeOverride ?? (deskTheme === 'obsidian' ? 'dark' : 'light');
  const t = (en: string, th: string) => deskText(lang, en, th);
  const timeframe = FEED_TIMEFRAMES[layoutMode === 'DUAL_GHR' ? '5' : interval];

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
                title={t('Show H1 and M5 charts side by side', 'แสดงกราฟ H1 และ M5 พร้อมกัน')}
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
                    title={t(`Timeframe ${tf.label}`, `กรอบเวลา ${tf.label}`)}
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

        <div className="chart-quant-links">
          <button type="button" className="btn sm" onClick={onOpenAiRisk}>
            {t('AI Risk', 'ความเสี่ยง AI')} <ArrowUpRight size={14} aria-hidden="true" />
          </button>
          <button type="button" className="btn sm" onClick={onOpenComex}>
            {t('COMEX Bridge', 'สะพานข้อมูล COMEX')} <ArrowUpRight size={14} aria-hidden="true" />
          </button>
        </div>

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
                titleBadge={t('H1 market structure', 'โครงสร้างตลาด H1')}
              />
              <SingleTradingViewEmbed
                symbol={symbol}
                interval="5"
                theme={chartTheme}
                lang={lang}
                titleBadge={t('M5 price action', 'การเคลื่อนไหวราคา M5')}
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
    </section>
  );
};
