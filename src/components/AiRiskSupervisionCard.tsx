import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Activity, ShieldCheck } from 'lucide-react';
import { auth } from '../services/firebase';
import type { LiveChartTelemetry, MarketCandle } from '../types/ghr';
import { deskText, type DeskLanguage } from '../utils/deskI18n';
import {
  computeQuantSupervisionSnapshot,
  normalizeSupervisionCandles,
  sanitizeQuantPortfolioInput,
  type QuantPortfolioInput,
  type QuantSupervisionSnapshot,
} from '../utils/quantSupervisionEngine';
import {
  buildDeterministicSupervisionReport,
  readRiskSupervisionResponse,
  riskSupervisionRegimeLabel,
  type AiRiskSupervisionReport,
  type RiskSupervisionFallbackReason,
} from '../utils/riskSupervisionReport';
import { formatChartPrice, LIVE_CHART_SYMBOLS, LIVE_CHART_TIMEFRAMES, useLiveChartFeed } from '../utils/useLiveChartFeed';
import { AI_MODEL_CATALOG, getActiveDeskAiStatus } from '../utils/aiProviderConfig';
import { getDeskAiRequestHeaders, selectDeskAiCredential, useByokCredentials } from '../utils/byokStorage';
import { AiAndDataKeysDialogButton } from './AiAndDataKeysCard';

interface AiRiskSupervisionCardProps {
  lang: DeskLanguage;
  initialTimeframe: string;
  portfolio?: QuantPortfolioInput;
  accountScope: string;
  platformAccessAllowed?: boolean;
}

const OVERLAYS = [
  { id: 'vwap', en: 'VWAP', th: 'VWAP' },
  { id: 'ema', en: 'EMA20', th: 'EMA20' },
  { id: 'sma', en: 'SMA50', th: 'SMA50' },
  { id: 'bollinger', en: 'Bollinger bands', th: 'กรอบ Bollinger' },
  { id: 'zones', en: 'Structural S/R zones', th: 'โซนแนวรับ/แนวต้าน' },
] as const;
type Overlay = (typeof OVERLAYS)[number]['id'];
const PLOT_WIDTH = 600;
const PRICE_HEIGHT = 208;
const ACTIVITY_HEIGHT = 50;

function seriesPath(series: readonly (number | null)[], x: (i: number) => number, y: (price: number) => number): string {
  let drawing = false;
  return series.map((value, index) => {
    if (value === null) {
      drawing = false;
      return '';
    }
    const point = `${drawing ? 'L' : 'M'}${x(index)},${y(value)}`;
    drawing = true;
    return point;
  }).join(' ');
}

function SupervisionChart({
  candles, snapshot, lang,
}: {
  candles: MarketCandle[];
  snapshot: QuantSupervisionSnapshot;
  lang: DeskLanguage;
}) {
  const [visibility, setVisibility] = useState<Record<Overlay, boolean>>({
    vwap: true, ema: true, sma: false, bollinger: false, zones: true,
  });
  const [activeTime, setActiveTime] = useState<number | null>(null);
  const t = (en: string, th: string) => deskText(lang, en, th);
  const price = (value: number) => formatChartPrice(value, snapshot.symbol);
  const bars = candles.length;
  const activeIndex = activeTime === null ? -1 : candles.findIndex(candle => candle.ts === activeTime);
  const active = activeIndex === -1 ? null : activeIndex;
  const selected = candles[active ?? bars - 1];
  const activity = candles.map(bar => snapshot.hasVolumeData ? (bar.volume ?? 0) : bar.high - bar.low);
  const maxActivity = Math.max(...activity) || 1;
  const zones = visibility.zones ? [...snapshot.structuralSupportZones, ...snapshot.structuralResistanceZones] : [];
  const overlaySeries = [
    { id: 'vwap', values: snapshot.vwapSeries },
    { id: 'ema', values: snapshot.ema20Series },
    { id: 'sma', values: snapshot.sma50Series },
    { id: 'bollinger', values: snapshot.bollingerSeries.map(band => band?.upper ?? null) },
    { id: 'bollinger', values: snapshot.bollingerSeries.map(band => band?.lower ?? null) },
  ] as const;
  const visibleSeries = overlaySeries.filter(series => visibility[series.id]);
  const limits = [
    ...candles.flatMap(bar => [bar.low, bar.high]),
    ...zones.flatMap(zone => [zone.bandLow, zone.bandHigh]),
    ...visibleSeries.flatMap(series => series.values.filter((value): value is number => value !== null)),
  ];
  const min = Math.min(...limits);
  const max = Math.max(...limits);
  const padding = (max - min) * 0.08 || max * 0.001;
  const lower = min - padding;
  const upper = max + padding;
  const x = (index: number) => (index + 0.5) * PLOT_WIDTH / bars;
  const y = (value: number) => (upper - value) * PRICE_HEIGHT / (upper - lower);
  const barWidth = Math.min(18, (PLOT_WIDTH / bars) * 0.68);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const datetime = new Intl.DateTimeFormat(lang, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok', hourCycle: 'h23',
  });
  const unavailable = (id: Overlay) =>
    (id === 'vwap' && !snapshot.hasVolumeData) ||
    (id === 'ema' && snapshot.ema20 === null) ||
    (id === 'sma' && snapshot.sma50 === null) ||
    (id === 'bollinger' && snapshot.bollinger.middle === null) ||
    (id === 'zones' && !snapshot.structuralSupportZones.length && !snapshot.structuralResistanceZones.length);

  const trackPointer = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width > 0) {
      const index = Math.min(bars - 1, Math.max(0, Math.floor((event.clientX - box.left) * bars / box.width)));
      setActiveTime(candles[index].ts);
    }
  };
  return (
    <div className="risk-sv-chart">
      <div className="risk-sv-overlays" role="group" aria-label={t('Chart overlays', 'เส้นซ้อนบนกราฟ')}>
        {OVERLAYS.map(({ id, en, th }) => (
          <button
            key={id}
            type="button"
            className="btn xs"
            data-overlay={id}
            aria-pressed={visibility[id] && !unavailable(id)}
            disabled={unavailable(id)}
            onClick={() => setVisibility(previous => ({ ...previous, [id]: !previous[id] }))}
          >
            <i aria-hidden="true" />{t(en, th)}
          </button>
        ))}
      </div>
      <div className="risk-sv-chart-readout">
        <div>
          <small>{t('Latest price', 'ราคาล่าสุด')}</small>
          <strong className="mono">{price(candles[bars - 1].close)}</strong>
        </div>
        <div className="risk-sv-tooltip mono">
          <time dateTime={new Date(selected.ts).toISOString()}>{datetime.format(selected.ts)} ICT</time>
          <span>O {price(selected.open)}</span><span>H {price(selected.high)}</span>
          <span>L {price(selected.low)}</span><span>C {price(selected.close)}</span>
          {snapshot.hasVolumeData && selected.volume !== undefined && <span>V {selected.volume.toLocaleString(lang)}</span>}
        </div>
      </div>
      <div
        className="risk-sv-plot"
        role="group"
        tabIndex={0}
        aria-label={t('Candlestick chart. Use the left and right arrow keys to inspect candles.', 'กราฟแท่งเทียน ใช้ปุ่มลูกศรซ้ายและขวาเพื่อดูแต่ละแท่ง')}
        onBlur={() => setActiveTime(null)}
        onKeyDown={event => {
          if (event.key === 'Escape') setActiveTime(null);
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          const offset = event.key === 'ArrowRight' ? 1 : -1;
          const index = Math.max(0, Math.min(bars - 1, (active ?? bars - 1) + offset));
          setActiveTime(candles[index].ts);
        }}
      >
        <svg
          className="risk-sv-price-plot"
          viewBox={`0 0 ${PLOT_WIDTH} ${PRICE_HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          onPointerMove={trackPointer}
          onPointerDown={trackPointer}
          onPointerLeave={() => setActiveTime(null)}
          onPointerCancel={() => setActiveTime(null)}
        >
          {ticks.map(tick => <line className="risk-sv-gridline" key={tick} x1="0" x2={PLOT_WIDTH} y1={tick * PRICE_HEIGHT} y2={tick * PRICE_HEIGHT} />)}
          {zones.map(zone => (
            <rect key={zone.kind + zone.level} className="risk-sv-zone" data-kind={zone.kind}
              x="0" width={PLOT_WIDTH} y={y(zone.bandHigh)} height={y(zone.bandLow) - y(zone.bandHigh)} />
          ))}
          {candles.map((bar, index) => (
            <g key={bar.ts} className="risk-sv-candle" data-rising={bar.close >= bar.open}>
              <line x1={x(index)} x2={x(index)} y1={y(bar.high)} y2={y(bar.low)} />
              <rect x={x(index) - barWidth / 2} width={barWidth} y={y(Math.max(bar.open, bar.close))}
                height={Math.max(1, Math.abs(y(bar.open) - y(bar.close)))} />
            </g>
          ))}
          {visibleSeries.map((series, i) => (
            <path className="risk-sv-overlay-line" data-overlay={series.id} key={series.id + i} d={seriesPath(series.values, x, y)} />
          ))}
          {active !== null && <line className="risk-sv-crosshair" x1={x(active)} x2={x(active)} y1="0" y2={PRICE_HEIGHT} />}
        </svg>
        <div className="risk-sv-price-axis mono" aria-hidden="true">{ticks.map(tick => <span key={tick}>{price(upper - tick * (upper - lower))}</span>)}</div>
        <svg
          className="risk-sv-activity-plot"
          viewBox={`0 0 ${PLOT_WIDTH} ${ACTIVITY_HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          onPointerMove={trackPointer}
          onPointerDown={trackPointer}
          onPointerLeave={() => setActiveTime(null)}
          onPointerCancel={() => setActiveTime(null)}
        >
          {activity.map((value, index) => {
            const height = value / maxActivity * (ACTIVITY_HEIGHT - 3);
            return <rect key={candles[index].ts} className="risk-sv-volume-bar" data-active={active === index}
              width={barWidth} x={x(index) - barWidth / 2} y={ACTIVITY_HEIGHT - height} height={height} />;
          })}
          {active !== null && <line className="risk-sv-crosshair" x1={x(active)} x2={x(active)} y1="0" y2={ACTIVITY_HEIGHT} />}
        </svg>
        <small className="risk-sv-activity-label">{snapshot.hasVolumeData ? t('Feed volume', 'ปริมาณจากกราฟ') : t('Candle range', 'ช่วงราคาแท่งเทียน')}</small>
      </div>
    </div>
  );
}

const FALLBACK_COPY: Record<RiskSupervisionFallbackReason, [string, string]> = {
  AUTH_REQUIRED: ['Sign in to run the Gemini review. The quant audit is available here.', 'เข้าสู่ระบบเพื่อใช้ Gemini ผลตรวจสอบเชิงปริมาณแสดงอยู่ด้านล่าง'],
  BYOK_REQUIRED: ['Connect a valid provider key to run AI review. The deterministic audit is shown below.', 'เชื่อมต่อคีย์ผู้ให้บริการที่ใช้งานได้เพื่อใช้ AI ผลตรวจสอบตามสูตรแสดงด้านล่าง'],
  GEMINI_API_KEY_MISSING: ['Gemini review is unavailable for this Desk.', 'Desk นี้ยังไม่เปิดใช้การตรวจสอบด้วย Gemini'],
  GEMINI_UNAVAILABLE: ['Gemini review is temporarily unavailable.', 'Gemini ไม่พร้อมใช้งานชั่วคราว'],
  GEMINI_REPORT_INVALID: ['Gemini returned a report outside the analytical format.', 'รายงานจาก Gemini ไม่ตรงตามรูปแบบการวิเคราะห์'],
  AI_PROVIDER_UNAVAILABLE: ['The AI provider is temporarily unavailable.', 'ผู้ให้บริการ AI ไม่พร้อมใช้งานชั่วคราว'],
  AI_REPORT_INVALID: ['The provider returned a report outside the analytical format.', 'รายงานจากผู้ให้บริการไม่ตรงตามรูปแบบการวิเคราะห์'],
  INVALID_AI_MODEL: ['Choose a valid model in API Keys / Codex OAuth.', 'เลือกโมเดลที่ถูกต้องในคีย์ API / Codex OAuth'],
  RATE_LIMITED: ['The AI review limit has been reached. Try again later.', 'ถึงขีดจำกัดการตรวจสอบด้วย AI ลองใหม่ภายหลัง'],
  REQUEST_UNAVAILABLE: ['The audit request could not reach the service.', 'ไม่สามารถส่งคำขอตรวจสอบไปยังบริการได้'],
};

function SupervisionAudit({
  feed, candles, snapshot, portfolio, lang, uid, platformAccessAllowed = false,
}: {
  feed: LiveChartTelemetry;
  candles: MarketCandle[];
  snapshot: QuantSupervisionSnapshot;
  portfolio?: QuantPortfolioInput;
  lang: DeskLanguage;
  uid: string | null;
  platformAccessAllowed?: boolean;
}) {
  const byok = useByokCredentials(uid);
  const connection = selectDeskAiCredential(byok);
  const activeAiStatus = getActiveDeskAiStatus(byok, uid, undefined, platformAccessAllowed);
  const model = connection && connection.provider !== 'platform'
    ? connection.model ?? AI_MODEL_CATALOG[connection.provider][0] : undefined;
  const [result, setResult] = useState<AiRiskSupervisionReport | null>(null);
  const [pending, setPending] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    setResult(previous => previous?.fallbackReason === 'BYOK_REQUIRED' ? null : previous);
  }, [connection?.provider, connection?.model, connection?.key]);
  useEffect(() => {
    setResult(null);
    setChecked({});
    setPending(false);
    return () => {
      const request = activeRequest.current;
      activeRequest.current = null;
      request?.abort();
    };
  }, [connection?.provider, connection?.model]);
  const t = (en: string, th: string) => deskText(lang, en, th);
  const baseline = useMemo(() => buildDeterministicSupervisionReport(snapshot, lang, feed.fetchedAt), [snapshot, lang, feed.fetchedAt]);
  const report = result ?? baseline;

  async function runAudit() {
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setPending(true);
    const requestFallback = { ...baseline, fallbackReason: 'REQUEST_UNAVAILABLE' } as const;
    function finish(next: AiRiskSupervisionReport) {
      if (activeRequest.current !== controller) return;
      activeRequest.current = null;
      setResult(next);
      setChecked({});
      setPending(false);
    }
    const deadline = window.setTimeout(() => {
      controller.abort();
      finish(requestFallback);
    }, 48_000);
    controller.signal.addEventListener('abort', () => window.clearTimeout(deadline), { once: true });
    let next: AiRiskSupervisionReport = requestFallback;
    try {
      const user = auth.currentUser;
      if ((user?.uid ?? null) !== uid) return;
      const headers = await getDeskAiRequestHeaders(user);
      controller.signal.throwIfAborted();
      if ((auth.currentUser?.uid ?? null) !== uid) return;
      const response = await fetch('/api/ai/risk-supervise', {
        method: 'POST',
        headers,
        redirect: 'error',
        body: JSON.stringify({
          symbol: snapshot.symbol, timeframe: snapshot.timeframe, candles, lang, portfolio,
        }),
        signal: controller.signal,
      });
      const body: unknown = await response.json().catch(() => null);
      next = readRiskSupervisionResponse(response.status, body, baseline);
    } catch {
      // The audit captured before the request stays available during network failures.
    } finally {
      window.clearTimeout(deadline);
      finish(next);
    }
  }

  return (
    <section className="risk-sv-audit" aria-label={t('Risk audit', 'ผลตรวจสอบความเสี่ยง')} aria-busy={pending}>
      <header className="risk-sv-audit-head">
        <div className="risk-sv-provenance">
          <span className="risk-sv-badge" data-source={report.source}>
            {report.source === 'deterministic' ? t('Deterministic Quant Audit', 'การตรวจสอบเชิงปริมาณตามสูตร')
              : t('AI Risk Supervision', 'การกำกับความเสี่ยงด้วย AI')}
          </span>
          <span className="desk-conn-pill" data-state={activeAiStatus.state}>
            <span className="desk-conn-dot" data-state={activeAiStatus.state} aria-hidden="true" />
            {activeAiStatus.state === 'connected'
              ? t('AI connected', 'AI เชื่อมต่อแล้ว')
              : activeAiStatus.state === 'expired'
                ? t('AI token expired', 'โทเค็น AI หมดอายุ')
                : uid && !platformAccessAllowed
                  ? t('BYOK required', 'ต้องใช้คีย์ของคุณ')
                  : t('AI not connected', 'AI ยังไม่เชื่อม')}
          </span>
          {(result?.model ?? (!result && model)) && <span className="mono">{result?.model ?? model}</span>}
          {result && <time dateTime={result.generatedAt} className="mono">
            {new Date(result.generatedAt).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' })} ICT
          </time>}
        </div>
        <div className="byok-actions">
          <AiAndDataKeysDialogButton uid={uid} lang={lang} platformAccessAllowed={platformAccessAllowed} />
          <button type="button" className="btn primary" disabled={pending} onClick={() => void runAudit()}>
            <ShieldCheck size={16} aria-hidden="true" />
            {pending ? t('Running risk audit…', 'กำลังตรวจสอบความเสี่ยง…') : t('Run AI Risk Audit', 'ตรวจสอบความเสี่ยงด้วย AI')}
          </button>
        </div>
      </header>
      <div role="status">
        {report.fallbackReason && <p className="risk-sv-status">{t(...FALLBACK_COPY[report.fallbackReason])}</p>}
      </div>
      <div className="risk-sv-report-grid">
        <div className="risk-sv-brief">
          <h3>{t('Desk brief', 'สรุปภาพรวมตลาด')}</h3>
          <p>{report.deskBrief}</p>
        </div>
        {([
          [t('Quantitative insight', 'ข้อมูลเชิงปริมาณ'), report.quantitativeInsight],
          [t('Liquidity and data quality', 'สภาพคล่องและคุณภาพข้อมูล'), report.liquidityNote],
          [t('Portfolio risk audit', 'การตรวจสอบความเสี่ยงพอร์ต'), report.portfolioRiskAudit],
          [t('Risk guardrails', 'กรอบกำกับความเสี่ยง'), report.riskGuardrailNote],
        ]).map(([label, body]) => <div key={label}><h3>{label}</h3><p>{body}</p></div>)}
        {([
          [t('Structural support', 'โซนแนวรับเชิงโครงสร้าง'), report.structuralSupportZones],
          [t('Structural resistance', 'โซนแนวต้านเชิงโครงสร้าง'), report.structuralResistanceZones],
        ] as const).map(([label, zones]) => (
          <div key={label}>
            <h3>{label}</h3>
            {zones.length ? <ul className="risk-sv-zone-list mono">{zones.map(zone => <li key={zone}>{zone}</li>)}</ul>
              : <p>{t('No confirmed swing bands in this window.', 'ยังไม่มีโซนสวิงที่ยืนยันในช่วงนี้')}</p>}
          </div>
        ))}
      </div>
      <fieldset className="risk-sv-checklist">
        <legend>{t('Discipline checklist', 'รายการตรวจสอบวินัย')}</legend>
        {report.disciplineChecklist.map(item => (
          <label key={item}>
            <input type="checkbox" checked={checked[item] ?? false}
              onChange={event => {
                const isChecked = event.target.checked;
                setChecked(previous => ({ ...previous, [item]: isChecked }));
              }}
            />
            <span>{item}</span>
          </label>
        ))}
      </fieldset>
    </section>
  );
}

export function AiRiskSupervisionCard({
  lang,
  initialTimeframe,
  portfolio,
  accountScope,
  platformAccessAllowed = false,
}: AiRiskSupervisionCardProps) {
  const [uid, setUid] = useState<string | null>(() => auth.currentUser?.uid ?? null);
  useEffect(() => auth.onAuthStateChanged(user => setUid(user?.uid ?? null)), []);
  const {
    chartSymbol, setChartSymbol, chartTimeframe, setChartTimeframe, liveTelemetry, chartError, chartLoading,
  } = useLiveChartFeed({ initialTimeframe, fetchStructureTf: false, pollIntervalMs: 30_000 });
  useEffect(() => { setChartTimeframe(initialTimeframe); }, [initialTimeframe, setChartTimeframe]);
  const t = (en: string, th: string) => deskText(lang, en, th);
  const feed = liveTelemetry?.symbol === chartSymbol && liveTelemetry.timeframe === chartTimeframe ? liveTelemetry : null;
  const candles = useMemo(() => normalizeSupervisionCandles(feed?.candles ?? []).slice(-512), [feed]);
  const safePortfolio = useMemo(() => sanitizeQuantPortfolioInput(portfolio), [portfolio]);
  const snapshot = useMemo(() => candles.length
    ? computeQuantSupervisionSnapshot(chartSymbol, chartTimeframe, candles, safePortfolio) : null,
  [chartSymbol, chartTimeframe, candles, safePortfolio]);
  const marketKey = `${chartSymbol}:${chartTimeframe}`;
  const price = (value: number | null) => value === null ? '—' : formatChartPrice(value, chartSymbol);
  const money = (value: number | null) => value === null ? '—' : new Intl.NumberFormat(lang, { style: 'currency', currency: 'USD' }).format(value);
  const metric = (value: number | null, suffix = '') => value === null ? '—' : value.toLocaleString(lang, { maximumFractionDigits: 2 }) + suffix;
  const metrics = snapshot ? [
    { label: 'VWAP', value: price(snapshot.vwap) },
    { label: 'RSI14', value: metric(snapshot.rsi14) },
    { label: t('MACD Histogram', 'ฮิสโตแกรม MACD'), value: price(snapshot.macd.histogram) },
    { label: t('BB Width %', 'ความกว้าง BB %'), value: metric(snapshot.bollinger.bandwidthPct, '%') },
    { label: 'ATR14', value: price(snapshot.atr14) },
    { label: t('Volatility regime', 'ภาวะความผันผวน'), value: snapshot.candleCount >= 20 || snapshot.volatilityRegime === 'HIGH_VOLATILITY'
      ? riskSupervisionRegimeLabel(snapshot.volatilityRegime, lang) : t('Provisional', 'เบื้องต้น'), regime: true },
    { label: t('Portfolio VaR (95%)', 'VaR พอร์ต (95%)'), value: money(snapshot.portfolioRiskAudit.var95Usd),
      detail: t('One-day, equity-scaled proxy', 'ค่าประมาณหนึ่งวันเทียบมูลค่าสุทธิ') },
    { label: t('Daily DD proximity', 'การใช้วงเงินขาดทุนรายวัน'), value: metric(snapshot.portfolioRiskAudit.dailyDdUsedPct, '%'),
      detail: snapshot.portfolioRiskAudit.dailyDdBufferUsd === null ? undefined
        : t(`${money(snapshot.portfolioRiskAudit.dailyDdBufferUsd)} remaining`, `เหลือ ${money(snapshot.portfolioRiskAudit.dailyDdBufferUsd)}`) },
  ] : [];

  return (
    <section className="card risk-supervision" aria-label={t('AI Risk & Market Structure Supervision', 'การกำกับความเสี่ยงและโครงสร้างตลาดด้วย AI')}>
      <header className="risk-sv-header">
        <h2 className="card-title desk-icon-title"><Activity size={17} aria-hidden="true" />
          {t('AI Risk & Market Structure Supervision', 'การกำกับความเสี่ยงและโครงสร้างตลาดด้วย AI')}
        </h2>
        <div className="risk-sv-market">
          <label>
            {t('Market', 'สินทรัพย์')}
            <select value={chartSymbol} onChange={event => setChartSymbol(event.target.value)}>
              {LIVE_CHART_SYMBOLS.map(symbol => <option key={symbol}>{symbol}</option>)}
            </select>
          </label>
          <label>
            {t('Timeframe', 'กรอบเวลา')}
            <select value={chartTimeframe} onChange={event => setChartTimeframe(event.target.value)}>
              {LIVE_CHART_TIMEFRAMES.map(timeframe => <option key={timeframe}>{timeframe}</option>)}
            </select>
          </label>
        </div>
      </header>
      {!feed || !snapshot ? (
        <p className="risk-sv-status" role="status">
          {chartError ? t('Candle feed unavailable. Waiting for the next update.', 'ดึงข้อมูลแท่งราคาไม่ได้ กำลังรออัปเดตครั้งถัดไป')
            : chartLoading || !feed ? t('Loading candle history…', 'กำลังโหลดข้อมูลแท่งราคา…')
              : t('The feed returned no valid candles.', 'ไม่พบข้อมูลแท่งราคาที่ใช้ได้')}
        </p>
      ) : (
        <>
          <p className="risk-sv-feed mono">
            {feed.source} · {snapshot.candleCount} {t('candles', 'แท่ง')} · {chartError || feed.staleCache
              ? t('Showing the last available feed', 'แสดงข้อมูลล่าสุดที่มี')
              : t('Feed updated', 'อัปเดตเมื่อ')}{' '}
            <time dateTime={feed.fetchedAt}>{new Date(feed.fetchedAt).toLocaleTimeString(lang, { timeZone: 'Asia/Bangkok', hour12: false })} ICT</time>
          </p>
          <SupervisionChart key={marketKey} candles={candles} snapshot={snapshot} lang={lang} />
          <dl className="risk-sv-telemetry">
            {metrics.map(({ label, value, detail, regime }) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className={regime ? 'risk-sv-badge' : 'mono'} data-regime={regime ? snapshot.volatilityRegime : undefined}>{value}</dd>
                {detail && <dd className="risk-sv-metric-detail">{detail}</dd>}
              </div>
            ))}
          </dl>
          <SupervisionAudit key={JSON.stringify([marketKey, lang, accountScope, Boolean(safePortfolio), uid])}
            feed={feed} candles={candles} snapshot={snapshot} portfolio={safePortfolio} lang={lang} uid={uid}
            platformAccessAllowed={platformAccessAllowed} />
        </>
      )}
      <footer className="risk-sv-footer"><ShieldCheck size={14} aria-hidden="true" /> Analytical &amp; Risk Supervision Only · No Trade Signals</footer>
    </section>
  );
}
