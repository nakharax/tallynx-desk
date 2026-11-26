import type { LiveChartTelemetry } from '../types/ghr';
import { asRecord } from './aiProviderConfig.js';

export const LIVE_CHART_SYMBOLS = [
  'XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'NAS100', 'US30', 'BTCUSD',
] as const;

export const LIVE_CHART_TIMEFRAMES = ['5m', '15m', '1h', '4h', '1d'] as const;

export function formatChartPrice(price: number, symbol: string): string {
  if (!Number.isFinite(price)) return '—';
  const decimals = symbol === 'USDJPY' ? 3 : symbol === 'EURUSD' || symbol === 'GBPUSD' ? 5 : 2;
  return price.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const numericFields = [
  'currentPrice', 'prevClose', 'changeAbs', 'changePct', 'intradayHigh', 'intradayLow',
  'ema20', 'ema50', 'rsi14', 'atr14', 'supportLevel', 'resistanceLevel',
] as const;

export async function fetchLiveChartTelemetryApi(
  symbol: string, timeframe: string, signal?: AbortSignal,
): Promise<LiveChartTelemetry> {
  const response = await fetch(
    `/api/market/live-chart?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`,
    { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) },
  );
  const data = asRecord(await response.json().catch(() => null));
  const telemetry = asRecord(data?.telemetry);
  if (!response.ok || data?.ok !== true || !telemetry || telemetry.symbol !== symbol || telemetry.timeframe !== timeframe ||
      typeof telemetry.source !== 'string' || typeof telemetry.fetchedAt !== 'string' || !Number.isFinite(Date.parse(telemetry.fetchedAt)) ||
      !Array.isArray(telemetry.candles) || !numericFields.every(field => Number.isFinite(telemetry[field])) ||
      (telemetry.trendBias !== 'BULLISH' && telemetry.trendBias !== 'BEARISH' && telemetry.trendBias !== 'NEUTRAL')) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'Live chart telemetry is unavailable.');
  }
  return { ...telemetry as unknown as LiveChartTelemetry, staleCache: data.cacheStatus === 'STALE_FALLBACK' };
}
