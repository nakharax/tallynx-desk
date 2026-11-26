import { Router } from 'express';
import type { MarketCandle } from '../../src/types/ghr.js';
import { AI_HEADERS, asRecord, buildDatabentoRequestHeaders } from '../../src/utils/aiProviderConfig.js';
import {
  buildComexBridgeSnapshot, COMEX_TIMEFRAMES, type ComexTimeframe, type DatabentoStatus,
} from '../../src/utils/comexBridgeEngine.js';

interface ComexBridgeDeps {
  fetchLiveSpotQuote: (symbol: 'XAUUSD') => Promise<{ price: number } | null>;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const PUBLIC_TTL = 15_000;
const DATABENTO_BASE = 'https://hist.databento.com/v0/';
const DATASET = 'GLBX.MDP3';

const TIMEFRAME_CONFIG = {
  '5m': { interval: '5m', range: '5d', ms: 5 * MINUTE, schema: 'ohlcv-1m', sourceMs: MINUTE, days: 5 },
  '15m': { interval: '15m', range: '5d', ms: 15 * MINUTE, schema: 'ohlcv-1m', sourceMs: MINUTE, days: 7 },
  '1h': { interval: '60m', range: '1mo', ms: HOUR, schema: 'ohlcv-1h', sourceMs: HOUR, days: 30 },
  '4h': { interval: '60m', range: '3mo', ms: 4 * HOUR, schema: 'ohlcv-1h', sourceMs: HOUR, days: 90 },
  '1d': { interval: '1d', range: '6mo', ms: DAY, schema: 'ohlcv-1d', sourceMs: DAY, days: 180 },
} satisfies Record<ComexTimeframe, { interval: string; range: string; ms: number; schema: string; sourceMs: number; days: number }>;

const DATABENTO_NOTES: Record<DatabentoStatus, string | null> = {
  public: null,
  used: 'GC bars are from your Databento historical feed. The spot quote is fetched separately.',
  'invalid-key': 'The Databento key format is invalid. Using public Yahoo Finance GC=F bars.',
  'access-denied': 'Databento denied access to GC history. Using public Yahoo Finance GC=F bars.',
  empty: 'Databento returned no usable GC bars. Using public Yahoo Finance GC=F bars.',
  timeout: 'The Databento request timed out. Using public Yahoo Finance GC=F bars.',
  unavailable: 'Databento is currently unavailable. Using public Yahoo Finance GC=F bars.',
};

/** Only public, credential-free inputs enter this cache. Keys are bounded by the supported timeframes. */
function createPublicCache<Key, Value>(load: (key: Key) => Promise<Value | null>) {
  const entries = new Map<Key, { value: Value; expires: number }>();
  const pending = new Map<Key, Promise<Value | null>>();
  return (key: Key): Promise<Value | null> => {
    const entry = entries.get(key);
    if (entry && Date.now() < entry.expires) return Promise.resolve(entry.value);
    const inFlight = pending.get(key);
    if (inFlight) return inFlight;

    const request = load(key).then(value => {
      if (value !== null) entries.set(key, { value, expires: Date.now() + PUBLIC_TTL });
      return value;
    }).finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  };
}

function positiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function makeCandle(
  ts: unknown, open: unknown, high: unknown, low: unknown, close: unknown, volume: unknown,
): MarketCandle | null {
  if (!positiveNumber(ts) || ts > 8.64e15 || !positiveNumber(open) || !positiveNumber(high) ||
      !positiveNumber(low) || !positiveNumber(close) || low > Math.min(open, close) || high < Math.max(open, close)) {
    return null;
  }
  return { ts, timeLabel: new Date(ts).toISOString(), open, high, low, close,
    volume: positiveNumber(volume) ? volume : 0 };
}

function bucketStart(ts: number, ms: number): number {
  return Math.floor(ts / ms) * ms;
}

function aggregateBars(candles: readonly MarketCandle[], ms: number): MarketCandle[] {
  const buckets = new Map<number, MarketCandle>();
  for (const candle of candles) {
    const ts = bucketStart(candle.ts, ms);
    const prior = buckets.get(ts);
    if (!prior) {
      buckets.set(ts, { ...candle, ts, timeLabel: new Date(ts).toISOString() });
      continue;
    }
    prior.high = Math.max(prior.high, candle.high);
    prior.low = Math.min(prior.low, candle.low);
    prior.close = candle.close;
    prior.volume = (prior.volume ?? 0) + (candle.volume ?? 0);
  }
  return [...buckets.values()];
}

function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

async function loadYahooBars(symbol: 'GC=F' | 'XAUUSD=X', timeframe: ComexTimeframe): Promise<MarketCandle[] | null> {
  try {
    const { interval, range, ms } = TIMEFRAME_CONFIG[timeframe];
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
    url.search = new URLSearchParams({ interval, range }).toString();
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (TallyNXDesk/3.2)' },
      signal: AbortSignal.timeout(symbol === 'GC=F' ? 7_000 : 4_000),
    });
    if (!response.ok) return null;
    const payload = asRecord(await response.json());
    const result = asRecord(array(asRecord(payload?.chart)?.result)[0]);
    const quote = asRecord(array(asRecord(result?.indicators)?.quote)[0]);
    const timestamps = array(result?.timestamp);
    const open = array(quote?.open);
    const high = array(quote?.high);
    const low = array(quote?.low);
    const close = array(quote?.close);
    const volume = array(quote?.volume);
    const candles: MarketCandle[] = [];
    timestamps.forEach((timestamp, index) => {
      if (!positiveNumber(timestamp)) return;
      const candle = makeCandle(timestamp * 1000, open[index], high[index], low[index], close[index], volume[index]);
      if (candle) candles.push(candle);
    });
    if (!candles.length) return null;
    candles.sort((a, b) => a.ts - b.ts);
    return timeframe === '4h' ? aggregateBars(candles, ms) : candles;
  } catch {
    return null;
  }
}

type DatabentoResult =
  | { status: 'used'; candles: MarketCandle[] }
  | { status: Exclude<DatabentoStatus, 'public' | 'used' | 'invalid-key'>; candles: null };

function upstreamStatus(status: number): 'access-denied' | 'unavailable' {
  return [401, 402, 403].includes(status) ? 'access-denied' : 'unavailable';
}

function decimalField(value: unknown): number {
  if (typeof value === 'number') return value;
  return typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
}

async function loadDatabentoBars(key: string, timeframe: ComexTimeframe): Promise<DatabentoResult> {
  const signal = AbortSignal.timeout(5_000);
  const headers = { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}` };
  const { schema, sourceMs, days, ms } = TIMEFRAME_CONFIG[timeframe];
  try {
    const metadata = await fetch(`${DATABENTO_BASE}metadata.get_dataset_range?dataset=${DATASET}`, {
      headers, signal, cache: 'no-store', redirect: 'error',
    });
    if (!metadata.ok) {
      await metadata.body?.cancel();
      return { status: upstreamStatus(metadata.status), candles: null };
    }
    const range = asRecord(await metadata.json());
    const schemaRange = asRecord(asRecord(range?.schema)?.[schema]);
    const availableFrom = schemaRange?.start ?? range?.start;
    const availableTo = schemaRange?.end ?? range?.end;
    if (typeof availableFrom !== 'string' || typeof availableTo !== 'string') return { status: 'empty', candles: null };
    const end = bucketStart(Math.min(Date.parse(availableTo), Date.now()), sourceMs);
    const start = Math.max(Date.parse(availableFrom), end - days * DAY);
    if (!Number.isFinite(start) || !(start < end)) return { status: 'empty', candles: null };

    const response = await fetch(`${DATABENTO_BASE}timeseries.get_range`, {
      method: 'POST',
      headers,
      body: new URLSearchParams({
        dataset: DATASET, symbols: 'GC.c.0', stype_in: 'continuous', schema,
        start: new Date(start).toISOString(), end: new Date(end).toISOString(),
        encoding: 'json', compression: 'none', pretty_px: 'true', pretty_ts: 'true',
      }),
      signal, cache: 'no-store', redirect: 'error',
    });
    if (!response.ok) {
      await response.body?.cancel();
      return { status: upstreamStatus(response.status), candles: null };
    }

    const candles: MarketCandle[] = [];
    for (const line of (await response.text()).split('\n')) {
      if (!line.trim()) continue;
      const row = asRecord(JSON.parse(line));
      const timestamp = asRecord(row?.hd)?.ts_event;
      const ts = typeof timestamp === 'string' ? Date.parse(timestamp) : NaN;
      if (!(ts >= start && ts < end)) continue;
      const candle = makeCandle(ts, decimalField(row?.open), decimalField(row?.high),
        decimalField(row?.low), decimalField(row?.close), decimalField(row?.volume));
      if (candle) candles.push(candle);
    }
    if (!candles.length) return { status: 'empty', candles: null };
    candles.sort((a, b) => a.ts - b.ts);
    return { status: 'used', candles: sourceMs === ms ? candles : aggregateBars(candles, ms) };
  } catch {
    return { status: signal.aborted ? 'timeout' : 'unavailable', candles: null };
  }
}

export function createComexBridgeRouter({ fetchLiveSpotQuote }: ComexBridgeDeps) {
  const router = Router();
  const getPublicGc = createPublicCache((timeframe: ComexTimeframe) => loadYahooBars('GC=F', timeframe));
  const getSpotHistory = createPublicCache((timeframe: ComexTimeframe) => loadYahooBars('XAUUSD=X', timeframe));
  const getSpotQuote = createPublicCache(async (symbol: 'XAUUSD') => {
    try {
      const quote = await fetchLiveSpotQuote(symbol);
      return positiveNumber(quote?.price) ? quote.price : null;
    } catch {
      return null;
    }
  });

  router.get('/bridge/comex-gold', async (req, res) => {
    const header = req.get(AI_HEADERS.databento);
    // CDN and browser caches stay out of the response path, including keyed requests that fall back.
    res.set('Cache-Control', header === undefined ? 'no-store' : 'private, no-store');
    const timeframe = COMEX_TIMEFRAMES.find(tf => tf === (req.query.timeframe ?? '15m'));
    if (!timeframe) {
      res.status(400).json({ error: 'Unsupported COMEX bridge timeframe.' });
      return;
    }
    const binsQuery = typeof req.query.bins === 'string' ? Number(req.query.bins) : NaN;
    const bins = Number.isFinite(binsQuery) ? Math.min(48, Math.max(10, Math.trunc(binsQuery))) : 24;
    const key = buildDatabentoRequestHeaders(header)[AI_HEADERS.databento];
    try {
      const futures = async () => {
        const databento = key ? await loadDatabentoBars(key, timeframe) : null;
        return {
          status: databento?.status ?? (header === undefined ? 'public' : 'invalid-key'),
          candles: databento?.candles ?? await getPublicGc(timeframe),
        } as const;
      };
      const [spotPrice, spotHistory, { status, candles }] = await Promise.all([
        getSpotQuote('XAUUSD'),
        getSpotHistory(timeframe),
        futures(),
      ]);
      const last = candles?.at(-1);
      if (!candles || !last || spotPrice === null) {
        res.status(502).json({ error: 'COMEX futures or the XAU/USD spot quote is unavailable.' });
        return;
      }

      const { ms } = TIMEFRAME_CONFIG[timeframe];
      const historicalSpot = new Map(spotHistory?.map(bar => [bucketStart(bar.ts, ms), bar.close]));
      const gcPrices: number[] = [];
      const xauPrices: number[] = [];
      const latestBucket = bucketStart(last.ts, ms);
      for (const candle of candles) {
        const bucket = bucketStart(candle.ts, ms);
        if (bucket >= latestBucket) break;
        const spotClose = historicalSpot.get(bucket);
        if (spotClose === undefined) continue;
        gcPrices.push(candle.close);
        xauPrices.push(spotClose);
      }
      gcPrices.push(last.close);
      xauPrices.push(spotPrice);
      const databentoUsed = status === 'used';
      res.json(buildComexBridgeSnapshot({
        timeframe, bins, candles, gcPrices, xauPrices, fetchedAt: new Date().toISOString(),
        databentoUsed, databentoStatus: status, databentoNote: DATABENTO_NOTES[status],
        dataSource: databentoUsed ? 'Databento GLBX.MDP3 (BYOK) + Live XAU Spot' : 'Yahoo Finance GC=F + Live XAU Spot',
      }));
    } catch {
      res.status(502).json({ error: 'COMEX bridge data is currently unavailable.' });
    }
  });

  return router;
}
