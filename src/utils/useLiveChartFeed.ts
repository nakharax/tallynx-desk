import { useCallback, useEffect, useRef, useState } from 'react';
import type { LiveChartTelemetry } from '../types/ghr';
import { formatLiveChartTelemetryForPrompt } from './marketplaceUtils';
import { fetchLiveChartTelemetryApi } from './liveChartMarkets';

export { LIVE_CHART_SYMBOLS, LIVE_CHART_TIMEFRAMES, fetchLiveChartTelemetryApi, formatChartPrice } from './liveChartMarkets';

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
  const activeRequest = useRef<AbortController | null>(null);

  const refreshTelemetry = useCallback(
    async (
      sym: string = chartSymbol,
      tf: string = chartTimeframe
    ): Promise<LiveChartTelemetry | null> => {
      if (!enabled || sym !== chartSymbol || tf !== chartTimeframe) return null;
      activeRequest.current?.abort();
      const controller = new AbortController();
      activeRequest.current = controller;
      setChartLoading(true);
      try {
        const structureTf = resolveStructureTimeframe(tf);
        const [primaryResult, structureResult] = await Promise.all([
          fetchLiveChartTelemetryApi(sym, tf, controller.signal),
          fetchStructureTf && structureTf !== tf
            ? fetchLiveChartTelemetryApi(sym, structureTf, controller.signal).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (activeRequest.current !== controller) return null;
        setLiveTelemetry(primaryResult);
        setStructureTelemetry(structureResult);
        setChartError(null);
        return primaryResult;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'ดึงข้อมูลกราฟสดไม่สำเร็จ';
        if (activeRequest.current === controller) setChartError(msg);
        return null;
      } finally {
        if (activeRequest.current === controller) {
          activeRequest.current = null;
          controller.abort();
          setChartLoading(false);
        }
      }
    },
    [chartSymbol, chartTimeframe, enabled, fetchStructureTf]
  );

  useEffect(() => {
    if (!enabled) {
      setChartLoading(false);
      return;
    }
    setChartError(null);
    void refreshTelemetry(chartSymbol, chartTimeframe);
    return () => {
      const request = activeRequest.current;
      activeRequest.current = null;
      request?.abort();
    };
  }, [enabled, chartSymbol, chartTimeframe, refreshTelemetry]);

  useEffect(() => {
    if (!enabled || !autoPoll || pollIntervalMs <= 0) return;
    const timer = window.setInterval(() => {
      if (activeRequest.current || document.visibilityState !== 'visible') return;
      void refreshTelemetry(chartSymbol, chartTimeframe);
    }, pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, autoPoll, pollIntervalMs, chartSymbol, chartTimeframe, refreshTelemetry]);

  return {
    chartSymbol,
    setChartSymbol,
    chartTimeframe,
    setChartTimeframe,
    liveTelemetry: enabled && liveTelemetry?.symbol === chartSymbol && liveTelemetry.timeframe === chartTimeframe ? liveTelemetry : null,
    structureTelemetry: enabled && structureTelemetry?.symbol === chartSymbol &&
      structureTelemetry.timeframe === resolveStructureTimeframe(chartTimeframe) ? structureTelemetry : null,
    chartLoading,
    chartError,
    autoPoll,
    setAutoPoll,
    refreshTelemetry,
  };
}
