import type { OpenPosition } from '../../server/fundednext/brokerTypes';
import type { Mt5PositionRecord, TradeDirection } from '../types/ghr';
import { CALCULATOR_CONTRACTS } from './ghrRules';

export const LIVE_TELEMETRY_POLL_MS = 3_000;
export const LIVE_TELEMETRY_MAX_SAMPLES = 120; // 6 minutes @ 3s interval

export type LiveTelemetryWindow = 'ALL' | '2M' | '6M';

export interface LiveTelemetryPoint {
  ts: number;
  timeLabel: string;
  balance: number;
  equity: number;
  floatingPnl: number;
  dailyFloorBalance: number;
  openPositionsCount: number;
}

export interface LiveOpenPositionInput {
  ticket?: string | number | null;
  id?: string | number | null;
  positionId?: string | number | null;
  symbol?: string | null;
  side?: string | number | null;
  dir?: string | number | null;
  type?: string | number | null;
  type_str?: string | null;
  lots?: number | string | null;
  volume?: number | string | null;
  openPrice?: number | string | null;
  open_price?: number | string | null;
  currentPrice?: number | string | null;
  current_price?: number | string | null;
  closePrice?: number | string | null;
  close_price?: number | string | null;
  price?: number | string | null;
  mark_price?: number | string | null;
  slPrice?: number | string | null;
  stopLoss?: number | string | null;
  stop_loss?: number | string | null;
  sl?: number | string | null;
  tpPrice?: number | string | null;
  takeProfit?: number | string | null;
  take_profit?: number | string | null;
  tp?: number | string | null;
  risk?: number | string | null;
  floatingPnl?: number | string | null;
  floating_pnl?: number | string | null;
  profit?: number | string | null;
  rawProfit?: number | string | null;
  netProfit?: number | string | null;
  swap?: number | string | null;
  commission?: number | string | null;
  openedAt?: string | number | null;
  openTime?: string | number | null;
  open_time_str?: string | null;
  open_time?: string | number | null;
  sourceTimestampUtc?: string | null;
  sourceTimestampRaw?: string | null;
  fetchedAt?: string | null;
  rawPayload?: Record<string, unknown> | null;
}

export type AnyLivePositionInput = OpenPosition | Mt5PositionRecord | LiveOpenPositionInput;

export interface LivePositionRow {
  ticket: string;
  symbol: string;
  side: TradeDirection;
  lots: number;
  openPrice: number;
  currentPrice: number | null;
  slPrice: number | null;
  tpPrice: number | null;
  slRiskUsd: number | null;
  floatingPnl: number;
  floatingPct: number;
  swap: number;
  commission: number;
  durationMin: number | null;
  pipsDelta: number | null;
  openedAtIso: string | null;
  hasStopLoss: boolean;
}

export interface LivePortfolioSummary {
  openCount: number;
  totalLots: number;
  buyLots: number;
  sellLots: number;
  netExposureLots: number;
  totalFloatingPnl: number;
  totalRiskAtSlUsd: number;
  unprotectedPositionsCount: number;
  marginUsedUsd: number | null;
  freeMarginUsd: number | null;
  marginLevelPct: number | null;
  dailyLossLimitUsd: number;
  dailyLossUsedUsd: number;
  dailyDdRemainingUsd: number;
  dailyDdUsedPct: number;
  dailyFloorBalance: number;
  projectedTotalProfit: number;
  projectedTodayProfit: number;
  projectedBestDaySharePct: number;
  consistencyCapPct: number;
  isConsistencyBreachedIfClosedNow: boolean;
}

export interface LivePositionMetricsResult {
  positions: LivePositionRow[];
  summary: LivePortfolioSummary;
}

export interface LivePositionMetricsOptions {
  nowMs?: number;
  marginUsedUsd?: number | null;
  freeMarginUsd?: number | null;
  marginLevelPct?: number | null;
  todayRealizedProfitUsd?: number;
  dailyLossUsedUsd?: number | null;
}

interface InstrumentSpec {
  usdPerPriceMove: number;
  pipSize: number;
  priceDecimals: number;
}

const EXTRA_INSTRUMENT_SPECS: Record<string, InstrumentSpec> = {
  XAGUSD: { usdPerPriceMove: 5000, pipSize: 0.01, priceDecimals: 3 },
  US30: { usdPerPriceMove: 1, pipSize: 1, priceDecimals: 2 },
  US500: { usdPerPriceMove: 1, pipSize: 0.1, priceDecimals: 2 },
  SPX500: { usdPerPriceMove: 1, pipSize: 0.1, priceDecimals: 2 },
  US100: { usdPerPriceMove: 1, pipSize: 1, priceDecimals: 2 },
  USTEC: { usdPerPriceMove: 1, pipSize: 1, priceDecimals: 2 },
  ETHUSD: { usdPerPriceMove: 1, pipSize: 0.1, priceDecimals: 2 },
};

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const cleaned = value.trim().replace(/[$,\s]/g, '').replace(/lots?$/i, '');
    if (!cleaned || cleaned === '—' || cleaned === '-') return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function roundTo(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function formatTelemetryTimeLabel(ts: number, timeZone = 'Asia/Bangkok'): string {
  if (!Number.isFinite(ts)) return '00:00:00';
  try {
    return new Date(ts).toLocaleTimeString('en-GB', {
      timeZone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return new Date(ts).toISOString().slice(11, 19);
  }
}

function sanitizeTelemetryPoint(point: LiveTelemetryPoint): LiveTelemetryPoint | null {
  if (
    !point ||
    !Number.isFinite(point.ts) ||
    point.ts <= 0 ||
    !Number.isFinite(point.balance) ||
    !Number.isFinite(point.equity)
  ) {
    return null;
  }
  const balance = roundTo(point.balance, 2);
  const equity = roundTo(point.equity, 2);
  const floatingPnl = Number.isFinite(point.floatingPnl)
    ? roundTo(point.floatingPnl, 2)
    : roundTo(equity - balance, 2);
  const dailyFloorBalance = Number.isFinite(point.dailyFloorBalance)
    ? Math.max(0, roundTo(point.dailyFloorBalance, 2))
    : 0;
  const openPositionsCount = Number.isFinite(point.openPositionsCount)
    ? Math.max(0, Math.floor(point.openPositionsCount))
    : 0;
  const timeLabel = point.timeLabel?.trim() || formatTelemetryTimeLabel(point.ts);

  return {
    ts: Math.round(point.ts),
    timeLabel,
    balance,
    equity,
    floatingPnl,
    dailyFloorBalance,
    openPositionsCount,
  };
}

/**
 * Pure immutable Ring Buffer append for 3-second live telemetry samples.
 * Keeps up to `maxSamples` (default 120 = 6 minutes @ 3s cadence) in monotonic timestamp order.
 */
export function appendLiveTelemetryPoint(
  buffer: readonly LiveTelemetryPoint[],
  rawPoint: LiveTelemetryPoint,
  maxSamples = LIVE_TELEMETRY_MAX_SAMPLES
): LiveTelemetryPoint[] {
  const limit = Math.max(1, Math.floor(maxSamples));
  const point = sanitizeTelemetryPoint(rawPoint);
  if (!point) return buffer.slice(-limit);

  if (buffer.length === 0) {
    return [point];
  }

  const last = buffer[buffer.length - 1];
  if (point.ts < last.ts) {
    // Drop stale out-of-order tick so chart X-axis stays strictly monotonic.
    return buffer.slice(-limit);
  }
  if (point.ts === last.ts) {
    return [...buffer.slice(0, -1), point].slice(-limit);
  }
  return [...buffer, point].slice(-limit);
}

/**
 * Deterministically filters buffered 3-second telemetry points by lookback window.
 */
export function sliceLiveTelemetryWindow(
  buffer: readonly LiveTelemetryPoint[],
  window: LiveTelemetryWindow,
  anchorTs?: number
): LiveTelemetryPoint[] {
  if (buffer.length === 0 || window === 'ALL') {
    return [...buffer];
  }
  const latestTs = anchorTs ?? buffer[buffer.length - 1].ts;
  const lookbackMs = window === '2M' ? 120_000 : 360_000;
  const cutoff = latestTs - lookbackMs;
  const filtered = buffer.filter((pt) => pt.ts >= cutoff);
  return filtered.length > 0 ? filtered : buffer.slice(-1);
}

/**
 * Deterministic LTTB-lite extrema-preserving downsampler for compact sparklines.
 */
export function downsampleLiveTelemetry(
  buffer: readonly LiveTelemetryPoint[],
  maxPoints: number
): LiveTelemetryPoint[] {
  const target = Math.max(2, Math.floor(maxPoints));
  if (buffer.length <= target) return [...buffer];

  const out: LiveTelemetryPoint[] = [buffer[0]];
  const innerCount = buffer.length - 2;
  const bucketCount = Math.max(1, Math.floor((target - 2) / 2));
  const bucketSize = innerCount / bucketCount;

  for (let i = 0; i < bucketCount; i++) {
    const start = 1 + Math.floor(i * bucketSize);
    const end = Math.min(buffer.length - 1, 1 + Math.floor((i + 1) * bucketSize));
    if (start >= end) continue;
    let minPt = buffer[start];
    let maxPt = buffer[start];
    for (let j = start + 1; j < end; j++) {
      const candidate = buffer[j];
      if (candidate.equity < minPt.equity) minPt = candidate;
      if (candidate.equity > maxPt.equity) maxPt = candidate;
    }
    if (minPt.ts === maxPt.ts) {
      out.push(minPt);
    } else if (minPt.ts < maxPt.ts) {
      out.push(minPt, maxPt);
    } else {
      out.push(maxPt, minPt);
    }
  }
  out.push(buffer[buffer.length - 1]);
  return out.slice(0, target);
}

function normalizeSymbolKey(rawSymbol: unknown): string {
  const base = String(rawSymbol || 'XAUUSD').trim().toUpperCase();
  const stripped = base.replace(/[._-](?:RAW|PRO|ECN|STD|M|C|I|VIP)$/i, '').replace(/[^A-Z0-9]/g, '');
  if (stripped.startsWith('GOLD')) return 'XAUUSD';
  if (stripped.startsWith('SILVER')) return 'XAGUSD';
  return stripped || base || 'XAUUSD';
}

function resolveInstrumentSpec(symbol: string, referencePrice: number): InstrumentSpec {
  const key = normalizeSymbolKey(symbol);
  if (key === 'XAUUSD' || key.startsWith('XAU')) {
    return { usdPerPriceMove: 100, pipSize: 0.1, priceDecimals: 2 };
  }
  const extra = EXTRA_INSTRUMENT_SPECS[key];
  if (extra) return extra;

  const known = CALCULATOR_CONTRACTS[key as keyof typeof CALCULATOR_CONTRACTS];
  if (known) {
    const isJpy = key.endsWith('JPY');
    const usdPerPriceMove =
      isJpy && referencePrice > 0 ? known.usdPerPriceMove / referencePrice : known.usdPerPriceMove;
    const pipSize = isJpy ? 0.01 : key === 'NAS100' || key === 'BTCUSD' ? 1 : 0.0001;
    return { usdPerPriceMove, pipSize, priceDecimals: known.priceDecimals };
  }

  if (key.length === 6 && key.endsWith('JPY')) {
    return {
      usdPerPriceMove: referencePrice > 0 ? 100_000 / referencePrice : 1000,
      pipSize: 0.01,
      priceDecimals: 3,
    };
  }
  if (key.length === 6 && /^[A-Z]{6}$/.test(key)) {
    return { usdPerPriceMove: 100_000, pipSize: 0.0001, priceDecimals: 5 };
  }
  return { usdPerPriceMove: 1, pipSize: 0.1, priceDecimals: 2 };
}

function normalizeSide(input: AnyLivePositionInput): TradeDirection {
  const rawObj = input as LiveOpenPositionInput;
  const payload = rawObj.rawPayload && typeof rawObj.rawPayload === 'object' ? rawObj.rawPayload : undefined;
  const candidate = rawObj.side ?? rawObj.dir ?? rawObj.type_str ?? rawObj.type ?? payload?.type_str ?? payload?.type;
  if (candidate && typeof candidate === 'object') {
    const obj = candidate as Record<string, unknown>;
    const text = String(obj.label ?? obj.name ?? obj.value ?? '').trim().toUpperCase();
    return text.includes('SELL') || text.includes('SHORT') || text === '1' ? 'SELL' : 'BUY';
  }
  const text = String(candidate ?? '').trim().toUpperCase();
  if (text.includes('SELL') || text.includes('SHORT') || text === '1' || text === 'OP_SELL') return 'SELL';
  return 'BUY';
}

function parseOpenedAtMs(input: LiveOpenPositionInput, payload?: Record<string, unknown>): { iso: string | null; ms: number | null } {
  const candidates = [
    input.openedAt,
    input.sourceTimestampUtc,
    input.openTime,
    input.open_time_str,
    input.open_time,
    input.sourceTimestampRaw,
    payload?.open_time_str,
    payload?.open_time,
    payload?.openTime,
    payload?.openedAt,
  ];
  for (const cand of candidates) {
    if (cand == null) continue;
    if (typeof cand === 'number' && Number.isFinite(cand) && cand > 0) {
      const ms = cand < 1e12 ? cand * 1000 : cand;
      return { iso: new Date(ms).toISOString(), ms };
    }
    if (typeof cand === 'string') {
      const trimmed = cand.trim();
      if (!trimmed) continue;
      if (/^\d{9,13}$/.test(trimmed)) {
        const num = Number(trimmed);
        const ms = num < 1e12 ? num * 1000 : num;
        return { iso: new Date(ms).toISOString(), ms };
      }
      const normalized = trimmed
        .replace(/^(\d{4})\.(\d{2})\.(\d{2})/, '$1-$2-$3')
        .replace(/^(\d{4}-\d{2}-\d{2})\s+/, '$1T')
        .replace(/\s*GMT$/i, 'Z');
      const parsed = Date.parse(normalized);
      if (Number.isFinite(parsed)) {
        return { iso: new Date(parsed).toISOString(), ms: parsed };
      }
    }
  }
  return { iso: null, ms: null };
}

function resolveLots(input: LiveOpenPositionInput, payload?: Record<string, unknown>): number {
  const direct = toFiniteNumber(input.lots ?? input.volume ?? payload?.lots ?? payload?.volume);
  if (direct !== null && direct > 0) {
    return roundTo(direct, 2);
  }
  return 0;
}

export function normalizeLivePositionRow(
  raw: AnyLivePositionInput,
  balance: number,
  nowMs = Date.now(),
  index = 0
): LivePositionRow {
  const obj = raw as LiveOpenPositionInput;
  const payload = obj.rawPayload && typeof obj.rawPayload === 'object' ? obj.rawPayload : undefined;

  const ticket = String(
    obj.ticket ?? obj.id ?? obj.positionId ?? payload?.ticket ?? payload?.position_id ?? payload?.id ?? `POS-${index + 1}`
  ).trim();
  const symbol = String(obj.symbol ?? payload?.symbol ?? 'XAUUSD').trim().toUpperCase() || 'XAUUSD';
  const side = normalizeSide(raw);
  const lots = resolveLots(obj, payload);

  const openPrice = Math.max(
    0,
    toFiniteNumber(obj.openPrice ?? obj.open_price ?? payload?.open_price ?? payload?.openPrice) ?? 0
  );
  const rawCurrent = toFiniteNumber(
    obj.currentPrice ??
      obj.current_price ??
      obj.price ??
      obj.mark_price ??
      payload?.current_price ??
      payload?.currentPrice ??
      payload?.mark_price ??
      payload?.close_price ??
      obj.closePrice ??
      obj.close_price
  );
  const currentPrice = rawCurrent !== null && rawCurrent > 0 ? rawCurrent : null;

  const rawSl = toFiniteNumber(
    obj.slPrice ?? obj.stopLoss ?? obj.stop_loss ?? obj.sl ?? payload?.stop_loss ?? payload?.stopLoss ?? payload?.sl
  );
  const slPrice = rawSl !== null && rawSl > 0 ? rawSl : null;

  const rawTp = toFiniteNumber(
    obj.tpPrice ?? obj.takeProfit ?? obj.take_profit ?? obj.tp ?? payload?.take_profit ?? payload?.takeProfit ?? payload?.tp
  );
  const tpPrice = rawTp !== null && rawTp > 0 ? rawTp : null;

  const swap = roundTo(toFiniteNumber(obj.swap ?? payload?.swap) ?? 0, 2);
  const commission = roundTo(toFiniteNumber(obj.commission ?? payload?.commission) ?? 0, 2);
  const floatingPnl = roundTo(
    toFiniteNumber(
      obj.floatingPnl ??
        obj.floating_pnl ??
        obj.netProfit ??
        obj.profit ??
        obj.rawProfit ??
        payload?.floating_pnl ??
        payload?.floatingPnl ??
        payload?.profit
    ) ?? 0,
    2
  );
  const floatingPct = balance > 0 ? roundTo((floatingPnl / balance) * 100, 2) : 0;

  const refPrice = currentPrice ?? openPrice;
  const spec = resolveInstrumentSpec(symbol, refPrice);

  let slRiskUsd: number | null = null;
  const explicitRisk = toFiniteNumber(obj.risk ?? payload?.risk);
  if (slPrice !== null && openPrice > 0 && lots > 0) {
    const pnlAtSl =
      side === 'BUY'
        ? (slPrice - openPrice) * lots * spec.usdPerPriceMove
        : (openPrice - slPrice) * lots * spec.usdPerPriceMove;
    slRiskUsd = roundTo(Math.max(0, -pnlAtSl), 2);
  } else if (explicitRisk !== null && explicitRisk >= 0) {
    slRiskUsd = roundTo(explicitRisk, 2);
  }

  let pipsDelta: number | null = null;
  if (currentPrice !== null && openPrice > 0 && spec.pipSize > 0) {
    const signedDiff = side === 'BUY' ? currentPrice - openPrice : openPrice - currentPrice;
    pipsDelta = roundTo(signedDiff / spec.pipSize, 1);
  }

  const opened = parseOpenedAtMs(obj, payload);
  const durationMin = opened.ms !== null ? Math.max(0, Math.round((nowMs - opened.ms) / 60_000)) : null;

  return {
    ticket,
    symbol,
    side,
    lots,
    openPrice: roundTo(openPrice, spec.priceDecimals),
    currentPrice: currentPrice !== null ? roundTo(currentPrice, spec.priceDecimals) : null,
    slPrice: slPrice !== null ? roundTo(slPrice, spec.priceDecimals) : null,
    tpPrice: tpPrice !== null ? roundTo(tpPrice, spec.priceDecimals) : null,
    slRiskUsd,
    floatingPnl,
    floatingPct,
    swap,
    commission,
    durationMin,
    pipsDelta,
    openedAtIso: opened.iso,
    hasStopLoss: slPrice !== null,
  };
}

/**
 * Computes per-position normalized telemetry rows AND portfolio prop-guard summary:
 * - Exposure (`totalLots`, `buyLots`, `sellLots`, `netExposureLots`)
 * - Stop-Loss Risk (`totalRiskAtSlUsd`, `unprotectedPositionsCount`)
 * - Margin & Daily DD Buffer (`marginLevelPct`, `dailyDdRemainingUsd`, `dailyDdUsedPct`, `dailyFloorBalance`)
 * - Live Consistency Impact (`projectedBestDaySharePct`: what happens to the 40% consistency cap if closed right now)
 */
export function computeLivePositionMetrics(
  positions: readonly AnyLivePositionInput[],
  balance: number,
  equity: number,
  dailyLossLimitUsd: number,
  netRealizedProfit: number,
  bestDayProfit: number,
  consistencyCapPct = 40,
  options: LivePositionMetricsOptions = {}
): LivePositionMetricsResult {
  const safeBalance = Number.isFinite(balance) ? roundTo(balance, 2) : 0;
  const safeEquity = Number.isFinite(equity) ? roundTo(equity, 2) : safeBalance;
  const nowMs = options.nowMs ?? Date.now();
  const safeDailyLimit = Number.isFinite(dailyLossLimitUsd) ? Math.max(0, roundTo(dailyLossLimitUsd, 2)) : 0;
  const safeNetRealized = Number.isFinite(netRealizedProfit) ? roundTo(netRealizedProfit, 2) : 0;
  const safeBestDay = Number.isFinite(bestDayProfit) ? roundTo(bestDayProfit, 2) : 0;
  const safeCap = Number.isFinite(consistencyCapPct) && consistencyCapPct > 0 ? consistencyCapPct : 40;
  const todayRealized = Number.isFinite(options.todayRealizedProfitUsd)
    ? roundTo(options.todayRealizedProfitUsd!, 2)
    : 0;

  const rows = (positions || []).map((pos, idx) => normalizeLivePositionRow(pos, safeBalance, nowMs, idx));

  let buyLots = 0;
  let sellLots = 0;
  let positionFloatSum = 0;
  let totalRiskAtSlUsd = 0;
  let unprotectedPositionsCount = 0;

  for (const row of rows) {
    if (row.side === 'BUY') buyLots += row.lots;
    else sellLots += row.lots;
    positionFloatSum += row.floatingPnl;
    if (row.slRiskUsd !== null) totalRiskAtSlUsd += row.slRiskUsd;
    if (!row.hasStopLoss) unprotectedPositionsCount++;
  }

  buyLots = roundTo(buyLots, 2);
  sellLots = roundTo(sellLots, 2);
  const totalLots = roundTo(buyLots + sellLots, 2);
  const netExposureLots = roundTo(buyLots - sellLots, 2);
  const totalFloatingPnl =
    rows.length > 0
      ? roundTo(positionFloatSum, 2)
      : roundTo(safeEquity - safeBalance, 2);
  totalRiskAtSlUsd = roundTo(totalRiskAtSlUsd, 2);

  const marginUsedUsd =
    options.marginUsedUsd !== undefined && options.marginUsedUsd !== null && Number.isFinite(options.marginUsedUsd)
      ? roundTo(Math.max(0, options.marginUsedUsd), 2)
      : null;
  const freeMarginUsd =
    options.freeMarginUsd !== undefined && options.freeMarginUsd !== null && Number.isFinite(options.freeMarginUsd)
      ? roundTo(options.freeMarginUsd, 2)
      : marginUsedUsd !== null
        ? roundTo(safeEquity - marginUsedUsd, 2)
        : null;
  const marginLevelPct =
    options.marginLevelPct !== undefined && options.marginLevelPct !== null && Number.isFinite(options.marginLevelPct)
      ? roundTo(Math.max(0, options.marginLevelPct), 1)
      : marginUsedUsd !== null && marginUsedUsd > 0 && safeEquity > 0
        ? roundTo((safeEquity / marginUsedUsd) * 100, 1)
        : null;

  const projectedTodayProfit = roundTo(todayRealized + totalFloatingPnl, 2);
  const dailyLossUsedUsd =
    options.dailyLossUsedUsd !== undefined && options.dailyLossUsedUsd !== null && Number.isFinite(options.dailyLossUsedUsd)
      ? roundTo(Math.max(0, options.dailyLossUsedUsd), 2)
      : projectedTodayProfit < 0
        ? roundTo(Math.abs(projectedTodayProfit), 2)
        : 0;
  const dailyDdRemainingUsd = roundTo(Math.max(0, safeDailyLimit - dailyLossUsedUsd), 2);
  const dailyDdUsedPct =
    safeDailyLimit > 0 ? Math.min(100, roundTo((dailyLossUsedUsd / safeDailyLimit) * 100, 1)) : 0;

  const startOfDayBalance = roundTo(safeBalance - todayRealized, 2);
  const dailyFloorBalance = Math.max(0, roundTo(startOfDayBalance - safeDailyLimit, 2));

  const projectedTotalProfit = roundTo(safeNetRealized + totalFloatingPnl, 2);
  const projectedBestDayProfit = Math.max(safeBestDay, projectedTodayProfit);

  let projectedBestDaySharePct = 0;
  if (projectedBestDayProfit > 0) {
    if (projectedTotalProfit <= 0) {
      projectedBestDaySharePct = 100;
    } else {
      projectedBestDaySharePct = Math.min(100, roundTo((projectedBestDayProfit / projectedTotalProfit) * 100, 1));
    }
  }

  return {
    positions: rows,
    summary: {
      openCount: rows.length,
      totalLots,
      buyLots,
      sellLots,
      netExposureLots,
      totalFloatingPnl,
      totalRiskAtSlUsd,
      unprotectedPositionsCount,
      marginUsedUsd,
      freeMarginUsd,
      marginLevelPct,
      dailyLossLimitUsd: safeDailyLimit,
      dailyLossUsedUsd,
      dailyDdRemainingUsd,
      dailyDdUsedPct,
      dailyFloorBalance,
      projectedTotalProfit,
      projectedTodayProfit,
      projectedBestDaySharePct,
      consistencyCapPct: safeCap,
      isConsistencyBreachedIfClosedNow: projectedBestDaySharePct > safeCap,
    },
  };
}
