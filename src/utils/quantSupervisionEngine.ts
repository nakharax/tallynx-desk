import Decimal from 'decimal.js';
import type { MarketCandle } from '../types/ghr';
import type { LIVE_CHART_TIMEFRAMES } from './liveChartMarkets';

export type VolatilityRegime = 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGE_BOUND' | 'HIGH_VOLATILITY';

export interface StructuralZone {
  level: number;
  bandLow: number;
  bandHigh: number;
  kind: 'SUPPORT' | 'RESISTANCE';
  strength: 'HIGH' | 'MEDIUM';
  touches: number;
  label: string;
}

export interface QuantPortfolioInput {
  equityUsd: number;
  balanceUsd?: number;
  dailyLossLimitUsd?: number;
  dailyLossUsedUsd?: number;
  openRiskUsd?: number;
  exposureLots?: number;
  accountType?: 'PROP' | 'PERSONAL';
}

interface BollingerBands {
  upper: number;
  middle: number;
  lower: number;
  bandwidthPct: number;
  zScore: number;
}

interface PortfolioRiskAudit {
  equityUsd: number | null;
  var95Usd: number | null;
  var95Pct: number | null;
  dailyDdUsedPct: number | null;
  dailyDdBufferUsd: number | null;
  openRiskUsd: number | null;
  riskPosture: 'SAFE' | 'CAUTION' | 'ELEVATED' | 'CRITICAL';
  notes: string[];
}

export interface QuantSupervisionSnapshot {
  symbol: string;
  timeframe: string;
  candleCount: number;
  lastPrice: number | null;
  vwap: number | null;
  vwapSeries: (number | null)[];
  ema20: number | null;
  ema20Series: (number | null)[];
  sma50: number | null;
  sma50Series: (number | null)[];
  rsi14: number | null;
  macd: { line: number | null; signal: number | null; histogram: number | null };
  bollinger: { [K in keyof BollingerBands]: number | null };
  bollingerSeries: (BollingerBands | null)[];
  atr14: number | null;
  atrPctOfPrice: number | null;
  volatilityRegime: VolatilityRegime;
  structuralSupportZones: StructuralZone[];
  structuralResistanceZones: StructuralZone[];
  portfolioRiskAudit: PortfolioRiskAudit;
  hasVolumeData: boolean;
}

const D = Decimal.clone({ precision: 30, rounding: Decimal.ROUND_HALF_UP });
const BARS_PER_DAY = { '5m': 288, '15m': 96, '1h': 24, '4h': 6, '1d': 1 } satisfies
  Record<(typeof LIVE_CHART_TIMEFRAMES)[number], number>;
const NORMAL_QUANTILE_95 = '1.644853626951472';
const MAX_MAGNITUDE = 1e15;
const EMPTY_BOLLINGER = { upper: null, middle: null, lower: null, bandwidthPct: null, zScore: null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedNumber(value: unknown, min = 0): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= MAX_MAGNITUDE;
}

export function normalizeSupervisionCandles(input: readonly unknown[]): MarketCandle[] {
  const byTime = new Map<number, MarketCandle>();
  for (const bar of input) {
    if (!isRecord(bar)) continue;
    const { ts, open, high, low, close, volume } = bar;
    if (!isBoundedNumber(ts) || !Number.isSafeInteger(ts) ||
        !isBoundedNumber(open, 1e-12) || !isBoundedNumber(high, 1e-12) ||
        !isBoundedNumber(low, 1e-12) || !isBoundedNumber(close, 1e-12) ||
        low > Math.min(open, close) || high < Math.max(open, close)) continue;
    byTime.set(ts, {
      ts, timeLabel: new Date(ts).toISOString().slice(5, 16).replace('T', ' '),
      open, high, low, close, ...(isBoundedNumber(volume) ? { volume } : {}),
    });
  }
  return [...byTime.values()].sort((left, right) => left.ts - right.ts);
}

export function sanitizeQuantPortfolioInput(input: unknown): QuantPortfolioInput | undefined {
  if (!isRecord(input) || !isBoundedNumber(input.equityUsd, -MAX_MAGNITUDE)) return undefined;
  const portfolio: QuantPortfolioInput = { equityUsd: input.equityUsd };
  if (isBoundedNumber(input.balanceUsd, -MAX_MAGNITUDE)) portfolio.balanceUsd = input.balanceUsd;
  if (isBoundedNumber(input.dailyLossLimitUsd, 1e-6)) portfolio.dailyLossLimitUsd = input.dailyLossLimitUsd;
  const metrics = ['dailyLossUsedUsd', 'openRiskUsd', 'exposureLots'] as const;
  for (const metric of metrics) {
    if (isBoundedNumber(input[metric])) portfolio[metric] = input[metric];
  }
  if (input.accountType === 'PROP' || input.accountType === 'PERSONAL') portfolio.accountType = input.accountType;
  return portfolio;
}

function mean(values: readonly Decimal[]): Decimal {
  return values.reduce((sum, value) => sum.plus(value), new D(0)).div(values.length);
}

function standardDeviation(values: readonly Decimal[], center: Decimal, denominator: number): Decimal {
  return values.reduce((sum, value) => sum.plus(value.minus(center).pow(2)), new D(0))
    .div(denominator).sqrt();
}

function ema(values: readonly Decimal[], period: number): (Decimal | null)[] {
  let value: Decimal | null = null;
  const alpha = new D(2).div(period + 1);
  return values.map((price, index) => {
    if (index < period - 1) return null;
    value = value === null ? mean(values.slice(0, period)) : value.plus(price.minus(value).mul(alpha));
    return value;
  });
}

function wilderAverage(values: readonly Decimal[], period: number): Decimal | null {
  if (values.length < period) return null;
  return values.slice(period).reduce(
    (average, next) => average.mul(period - 1).plus(next).div(period),
    mean(values.slice(0, period)),
  );
}

function computeRsi14(closes: readonly Decimal[]): number | null {
  const changes = closes.slice(1).map((close, index) => close.minus(closes[index]));
  const gains = wilderAverage(changes.map(change => D.max(change, 0)), 14);
  const losses = wilderAverage(changes.map(change => D.max(change.neg(), 0)), 14);
  if (gains === null || losses === null) return null;
  if (losses.isZero()) return gains.isZero() ? 50 : 100;
  return gains.div(gains.plus(losses)).mul(100).toNumber();
}

function computeMacd(closes: readonly Decimal[]): QuantSupervisionSnapshot['macd'] {
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const lines = slow.slice(25).map((value, index) => fast[index + 25]!.minus(value!));
  const line = lines.at(-1);
  const signal = ema(lines, 9).at(-1);
  return {
    line: line?.toNumber() ?? null,
    signal: signal?.toNumber() ?? null,
    histogram: line && signal ? line.minus(signal).toNumber() : null,
  };
}

function computeStructuralZones(
  candles: readonly MarketCandle[], kind: StructuralZone['kind'], atr: Decimal | null, lastPrice: Decimal,
): StructuralZone[] {
  const recent = candles.slice(-120);
  const isSupport = kind === 'SUPPORT';
  const property = isSupport ? 'low' : 'high';
  const neighborOffsets = [-2, -1, 1, 2];
  const clusters: { total: Decimal; touches: number; lastTouch: number }[] = [];
  const tolerance = D.max(lastPrice.mul('0.0005'), D.min(atr?.mul('0.35') ?? 0, lastPrice.mul('0.008')));

  for (let index = 2; index < recent.length - 2; index++) {
    const value = recent[index][property];
    if (!neighborOffsets.every(offset => isSupport
      ? value < recent[index + offset][property]
      : value > recent[index + offset][property])) continue;
    const level = new D(value);
    if (isSupport ? level.gt(lastPrice) : level.lt(lastPrice)) continue;
    const cluster = clusters.find(candidate => candidate.total.div(candidate.touches).minus(level).abs().lte(tolerance));
    if (cluster) {
      cluster.total = cluster.total.plus(level);
      cluster.touches++;
      cluster.lastTouch = index;
    } else {
      clusters.push({ total: level, touches: 1, lastTouch: index });
    }
  }

  return clusters.sort((a, b) => b.touches - a.touches || b.lastTouch - a.lastTouch).slice(0, 3)
    .map(({ total, touches }) => {
      const level = total.div(touches);
      const band = D.min(tolerance, level.mul('0.02'));
      return {
        level: level.toNumber(),
        bandLow: level.minus(band).toNumber(),
        bandHigh: level.plus(band).toNumber(),
        kind,
        strength: touches >= 3 ? 'HIGH' : 'MEDIUM',
        touches,
        label: isSupport ? 'Observed support' : 'Observed resistance',
      };
    });
}

function resolveVolatilityRegime(
  closes: readonly Decimal[], trueRanges: readonly Decimal[], atr: Decimal | null,
  ema20: number | null, barsPerDay: number,
): VolatilityRegime {
  const price = closes.at(-1);
  if (!price || closes.length < 2) return 'RANGE_BOUND';
  const lastRange = trueRanges.at(-1)!;
  const baseline = mean(trueRanges.slice(-15, -1));
  const spike = lastRange.gt(baseline.mul(3)) && lastRange.div(price).gte('0.005');
  if (spike || (atr && atr.div(price).mul(new D(barsPerDay).sqrt()).gte('0.08'))) return 'HIGH_VOLATILITY';

  const reference = closes.at(-15);
  if (reference && atr && ema20 !== null) {
    const change = price.minus(reference);
    const threshold = D.max(atr.mul('1.5'), price.mul('0.001'));
    if (change.gt(threshold) && price.gt(ema20)) return 'TRENDING_UP';
    if (change.lt(threshold.neg()) && price.lt(ema20)) return 'TRENDING_DOWN';
  }
  return 'RANGE_BOUND';
}

function computePortfolioRisk(
  closes: readonly Decimal[], barsPerDay: number, input?: QuantPortfolioInput,
): PortfolioRiskAudit {
  const equity = input ? new D(input.equityUsd) : null;
  const limit = input?.dailyLossLimitUsd ? new D(input.dailyLossLimitUsd) : null;
  const loss = input?.dailyLossUsedUsd;
  const openRisk = input?.openRiskUsd;
  const remaining = limit && loss !== undefined ? D.max(limit.minus(loss), 0) : null;
  const usedPct = limit && loss !== undefined ? new D(loss).div(limit).mul(100) : null;
  const returns = closes.slice(1).map((close, index) => close.div(closes[index]).minus(1));
  // Zero-drift normal model on sample returns, scaled by nominal bars per day.
  const varRatio = returns.length >= 2
    ? standardDeviation(returns, mean(returns), returns.length - 1).mul(NORMAL_QUANTILE_95).mul(new D(barsPerDay).sqrt())
    : null;
  const varUsd = equity?.gt(0) && varRatio ? equity.mul(varRatio) : null;
  const notes: string[] = [];
  if (usedPct === null) notes.push('Daily loss limit or usage is unavailable.');
  if (varUsd === null) notes.push('Positive equity and at least two observed returns are required for the USD estimate.');
  else notes.push('One-day VaR scales the selected market’s return volatility by equity. It omits position-level exposure and correlations.');
  const openRiskExceedsBuffer = remaining !== null && openRisk !== undefined && openRisk > 0 && remaining.lt(openRisk);
  if (openRiskExceedsBuffer) notes.push('Reported open risk exceeds the remaining daily drawdown buffer.');

  let riskPosture: PortfolioRiskAudit['riskPosture'] = 'SAFE';
  if (usedPct?.gte(100) || equity?.lte(0)) riskPosture = 'CRITICAL';
  else if (usedPct?.gte(75) || openRiskExceedsBuffer || (varUsd !== null && varRatio?.gte('0.10'))) riskPosture = 'ELEVATED';
  else if (usedPct?.gte(50) || usedPct === null || varUsd === null || varRatio?.gte('0.05')) riskPosture = 'CAUTION';

  return {
    equityUsd: equity?.toNumber() ?? null,
    var95Usd: varUsd?.toNumber() ?? null,
    var95Pct: varRatio?.mul(100).toNumber() ?? null,
    dailyDdUsedPct: usedPct?.toNumber() ?? null,
    dailyDdBufferUsd: remaining?.toNumber() ?? null,
    openRiskUsd: openRisk ?? null,
    riskPosture,
    notes,
  };
}

export function computeQuantSupervisionSnapshot(
  symbol: string, timeframe: string, input: readonly MarketCandle[], portfolio?: QuantPortfolioInput,
): QuantSupervisionSnapshot {
  const candles = normalizeSupervisionCandles(input);
  const closes = candles.map(candle => new D(candle.close));
  const last = closes.at(-1);
  const barsPerDay = Object.hasOwn(BARS_PER_DAY, timeframe)
    ? BARS_PER_DAY[timeframe as keyof typeof BARS_PER_DAY] : 1;
  let cumulativeVolume = new D(0);
  let cumulativeValue = new D(0);
  const vwapSeries = candles.map(candle => {
    const volume = candle.volume ?? 0;
    const typical = new D(candle.high).plus(candle.low).plus(candle.close).div(3);
    cumulativeValue = cumulativeValue.plus(typical.mul(volume));
    cumulativeVolume = cumulativeVolume.plus(volume);
    return cumulativeVolume.gt(0) ? cumulativeValue.div(cumulativeVolume).toNumber() : null;
  });
  const ema20Series = ema(closes, 20).map(value => value?.toNumber() ?? null);
  const sma50Series = closes.map((_, index) => index < 49 ? null : mean(closes.slice(index - 49, index + 1)).toNumber());
  const bollingerSeries = closes.map((close, index) => {
    if (index < 19) return null;
    const window = closes.slice(index - 19, index + 1);
    const middle = mean(window);
    const sigma = standardDeviation(window, middle, 20);
    return {
      upper: middle.plus(sigma.mul(2)).toNumber(),
      middle: middle.toNumber(),
      lower: middle.minus(sigma.mul(2)).toNumber(),
      bandwidthPct: sigma.mul(400).div(middle).toNumber(),
      zScore: sigma.isZero() ? 0 : close.minus(middle).div(sigma).toNumber(),
    };
  });
  const trueRanges = candles.map(({ high, low }, index) => {
    const range = new D(high).minus(low);
    const previous = closes[index - 1];
    return previous ? D.max(range, previous.minus(high).abs(), previous.minus(low).abs()) : range;
  });
  const atr = wilderAverage(trueRanges, 14);
  const ema20 = ema20Series.at(-1) ?? null;
  return {
    symbol, timeframe,
    candleCount: candles.length,
    lastPrice: last?.toNumber() ?? null,
    vwap: vwapSeries.at(-1) ?? null, vwapSeries,
    ema20, ema20Series,
    sma50: sma50Series.at(-1) ?? null, sma50Series,
    rsi14: computeRsi14(closes),
    macd: computeMacd(closes),
    bollinger: bollingerSeries.at(-1) ?? { ...EMPTY_BOLLINGER },
    bollingerSeries,
    atr14: atr?.toNumber() ?? null,
    atrPctOfPrice: last && atr ? atr.div(last).mul(100).toNumber() : null,
    volatilityRegime: resolveVolatilityRegime(closes, trueRanges, atr, ema20, barsPerDay),
    structuralSupportZones: last ? computeStructuralZones(candles, 'SUPPORT', atr, last) : [],
    structuralResistanceZones: last ? computeStructuralZones(candles, 'RESISTANCE', atr, last) : [],
    portfolioRiskAudit: computePortfolioRisk(closes, barsPerDay, sanitizeQuantPortfolioInput(portfolio)),
    hasVolumeData: cumulativeVolume.gt(0),
  };
}
