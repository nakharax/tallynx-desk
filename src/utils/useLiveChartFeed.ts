import { useCallback, useEffect, useRef, useState } from 'react';
import type { LiveChartTelemetry } from '../types/ghr';
import { formatLiveChartTelemetryForPrompt } from './marketplaceUtils';

export { LIVE_CHART_SYMBOLS, LIVE_CHART_TIMEFRAMES } from './liveChartMarkets';

export function formatChartPrice(price: number, symbol: string): string {
  const decimals =
    symbol.includes('JPY') || (symbol.includes('USD') && price < 20) ? 4 : 2;
  return Number.isFinite(price)
    ? price.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : '0.00';
}

export async function fetchLiveChartTelemetryApi(
  symbol: string,
  timeframe: string
): Promise<LiveChartTelemetry> {
  const res = await fetch(
    `/api/market/live-chart?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`
  );
  const data = await res.json();
  if (!res.ok || !data?.ok || !data?.telemetry) {
    throw new Error(data?.error || 'ไม่สามารถดึงราคาตลาดสดได้ในขณะนี้');
  }
  return data.telemetry as LiveChartTelemetry;
}

export function resolveStructureTimeframe(primaryTf: string): string {
  const tf = primaryTf.toLowerCase();
  if (tf === '5m' || tf === '15m') return '1h';
  if (tf === '1h') return '4h';
  return '1d';
}

export function formatDualLiveChartTelemetryForPrompt(
  primary: LiveChartTelemetry,
  structure?: LiveChartTelemetry | null
): string {
  const parts = [`[Primary Execution TF]\n${formatLiveChartTelemetryForPrompt(primary)}`];
  if (structure && structure.timeframe !== primary.timeframe) {
    parts.push(
      `[Higher Structure TF (${structure.timeframe.toUpperCase()})]\n${formatLiveChartTelemetryForPrompt(structure)}`
    );
  }
  return parts.join('\n\n');
}

interface UseLiveChartFeedOptions {
  enabled?: boolean;
  initialSymbol?: string;
  initialTimeframe?: string;
  pollIntervalMs?: number;
  fetchStructureTf?: boolean;
}

export function useLiveChartFeed({
  enabled = true,
  initialSymbol = 'XAUUSD',
  initialTimeframe = '15m',
  pollIntervalMs = 10000,
  fetchStructureTf = true,
}: UseLiveChartFeedOptions = {}) {
  const [chartSymbol, setChartSymbol] = useState<string>(initialSymbol);
  const [chartTimeframe, setChartTimeframe] = useState<string>(initialTimeframe);
  const [liveTelemetry, setLiveTelemetry] = useState<LiveChartTelemetry | null>(null);
  const [structureTelemetry, setStructureTelemetry] = useState<LiveChartTelemetry | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [autoPoll, setAutoPoll] = useState<boolean>(true);
  const requestId = useRef(0);

  const refreshTelemetry = useCallback(
    async (
      sym: string = chartSymbol,
      tf: string = chartTimeframe
    ): Promise<LiveChartTelemetry | null> => {
      const id = ++requestId.current;
      setChartLoading(true);
      setChartError(null);
      try {
        const structureTf = resolveStructureTimeframe(tf);
        const [primaryResult, structureResult] = await Promise.all([
          fetchLiveChartTelemetryApi(sym, tf),
          fetchStructureTf && structureTf !== tf
            ? fetchLiveChartTelemetryApi(sym, structureTf).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (id === requestId.current) {
          setLiveTelemetry(primaryResult);
          setStructureTelemetry(structureResult);
        }
        return primaryResult;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'ดึงข้อมูลกราฟสดไม่สำเร็จ';
        if (id === requestId.current) setChartError(msg);
        return null;
      } finally {
        if (id === requestId.current) setChartLoading(false);
      }
    },
    [chartSymbol, chartTimeframe, fetchStructureTf]
  );

  useEffect(() => {
    if (!enabled) {
      setChartLoading(false);
      return;
    }
    void refreshTelemetry(chartSymbol, chartTimeframe);
    return () => { requestId.current++; };
  }, [enabled, chartSymbol, chartTimeframe, refreshTelemetry]);

  useEffect(() => {
    if (!enabled || !autoPoll || pollIntervalMs <= 0) return;
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void refreshTelemetry(chartSymbol, chartTimeframe);
    }, pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, autoPoll, pollIntervalMs, chartSymbol, chartTimeframe, refreshTelemetry]);

  return {
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
  };
}
