import Decimal from 'decimal.js';
import type { MarketCandle } from '../types/ghr';

export const COMEX_TIMEFRAMES = ['5m', '15m', '1h', '4h', '1d'] as const;
export type ComexTimeframe = typeof COMEX_TIMEFRAMES[number];
export type DatabentoStatus = 'public' | 'used' | 'invalid-key' | 'access-denied' | 'empty' | 'timeout' | 'unavailable';

export interface ComexBasis {
  rawBasis: number;
  smoothedBasis: number;
  /** Latest raw GC–XAU spread as a percentage of the latest XAU price. */
  basisPct: number;
  basisSampleCount: number;
}

export interface VolumeProfileBin {
  priceLow: number;
  priceHigh: number;
  midPrice: number;
  mappedXauPrice: number;
  volume: number;
  volumePct: number;
  isPoc: boolean;
  isInValueArea: boolean;
  isHvn: boolean;
}

export interface ComexVolumeProfile {
  bins: VolumeProfileBin[];
  pocGc: number | null;
  vahGc: number | null;
  valGc: number | null;
  pocXau: number | null;
  vahXau: number | null;
  valXau: number | null;
  hvnZones: VolumeProfileBin[];
  totalVolume: number;
  hasVolumeData: boolean;
}

export interface ComexBridgeExports {
  mql5: string;
  json: string;
  pineScript: string;
  python: string;
}

type ComexBridgeData = ComexBasis & {
  timeframe: ComexTimeframe;
  fetchedAt: string;
  gcCandleAt: string | null;
  gcPrice: number | null;
  xauSpotPrice: number | null;
  profile: ComexVolumeProfile;
  dataSource: string;
  databentoUsed: boolean;
  databentoStatus: DatabentoStatus;
  databentoNote: string | null;
};

export interface ComexBridgeSnapshot extends ComexBridgeData {
  exports: ComexBridgeExports;
}

/** Inputs are chronological; match shorter windows to the end of the longer window. */
export function computeSmoothedBasis(
  gcPrices: readonly number[],
  xauPrices: readonly number[],
  alpha = 0.25,
): ComexBasis {
  const weight = new Decimal(Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 0.25);
  const size = Math.min(gcPrices.length, xauPrices.length);
  let raw = new Decimal(0);
  let ema = raw;
  let spot = raw;
  let basisSampleCount = 0;

  for (let i = 0; i < size; i++) {
    const gc = gcPrices[gcPrices.length - size + i];
    const xau = xauPrices[xauPrices.length - size + i];
    if (!Number.isFinite(gc) || !Number.isFinite(xau) || gc <= 0 || xau <= 0) continue;
    spot = new Decimal(xau);
    raw = new Decimal(gc).minus(spot);
    ema = basisSampleCount === 0 ? raw : ema.plus(raw.minus(ema).times(weight));
    basisSampleCount++;
  }

  return {
    rawBasis: raw.toNumber(),
    smoothedBasis: ema.toNumber(),
    basisPct: spot.isZero() ? 0 : raw.div(spot).times(100).toNumber(),
    basisSampleCount,
  };
}

interface VolumeProfileOptions {
  bins?: number;
  /** Fraction in [0, 1]. Defaults to 0.7. */
  valueAreaPct?: number;
  basisOffset?: number;
}

export function computeVolumeProfile(
  candles: readonly MarketCandle[],
  { bins = 24, valueAreaPct = 0.7, basisOffset = 0 }: VolumeProfileOptions = {},
): ComexVolumeProfile {
  const offset = new Decimal(Number.isFinite(basisOffset) ? basisOffset : 0);
  const valid = candles.filter(({ low, high }) => Number.isFinite(low) && Number.isFinite(high) && high >= low);
  let min = Infinity;
  let max = -Infinity;
  for (const candle of valid) {
    min = Math.min(min, candle.low);
    max = Math.max(max, candle.high);
  }
  const count = !valid.length ? 0 : min === max ? 1
    : Math.max(1, Math.min(48, Number.isFinite(bins) ? Math.trunc(bins) : 24));
  const bottom = new Decimal(count ? min : 0);
  const top = new Decimal(count ? max : 0);
  const width = count ? top.minus(bottom).div(count) : new Decimal(0);
  const edges = Array.from({ length: count + 1 }, (_, index) => index === count ? top : bottom.plus(width.times(index)));
  const upperEdges = edges.slice(1);
  const volumes = Array.from({ length: count }, () => new Decimal(0));
  let total = new Decimal(0);

  for (const candle of valid) {
    const volume = candle.volume ?? 0;
    if (!Number.isFinite(volume) || volume <= 0) continue;
    const amount = new Decimal(volume);
    total = total.plus(amount);
    if (width.isZero()) {
      volumes[0] = volumes[0].plus(amount);
      continue;
    }

    const low = new Decimal(candle.low);
    const high = new Decimal(candle.high);
    const first = low.eq(top) ? count - 1 : upperEdges.findIndex(edge => edge.gt(low));
    if (low.eq(high)) {
      volumes[first] = volumes[first].plus(amount);
      continue;
    }

    // OHLCV gives no trades by price. Estimate volume uniformly across each candle's price range.
    const last = upperEdges.findIndex(edge => edge.gte(high));
    const range = high.minus(low);
    let allocated = new Decimal(0);
    for (let index = first; index <= last; index++) {
      const cumulative = index === last ? amount : upperEdges[index].minus(low).div(range).times(amount);
      volumes[index] = volumes[index].plus(cumulative.minus(allocated));
      allocated = cumulative;
    }
  }

  let poc = -1;
  let lower = -1;
  let upper = -1;
  const hvn = new Set<number>();
  if (total.gt(0)) {
    poc = volumes.reduce((best, volume, index) => volume.gt(volumes[best]) ? index : best, 0);
    lower = upper = poc;
    let cumulative = volumes[poc];
    const fraction = Number.isFinite(valueAreaPct) ? Math.max(0, Math.min(1, valueAreaPct)) : 0.7;
    const target = total.times(fraction);
    while (cumulative.lt(target) && (lower > 0 || upper < count - 1)) {
      if (upper === count - 1 || (lower > 0 && volumes[lower - 1].gte(volumes[upper + 1]))) {
        cumulative = cumulative.plus(volumes[--lower]);
      } else {
        cumulative = cumulative.plus(volumes[++upper]);
      }
    }

    // The strongest three distinct local peaks outside the POC, with ties resolved by lower price.
    const peaks = volumes
      .map((volume, index) => ({ volume, index }))
      .filter(({ volume, index }) => index !== poc && volume.gt(volumes[index - 1] ?? 0) && volume.gte(volumes[index + 1] ?? 0))
      .sort((a, b) => b.volume.cmp(a.volume) || a.index - b.index);
    for (const { index } of peaks.slice(0, 3)) hvn.add(index);
  }

  const profileBins = volumes.map((volume, index): VolumeProfileBin => {
    const priceLow = edges[index];
    const priceHigh = edges[index + 1];
    const mid = priceLow.plus(priceHigh).div(2);
    return {
      priceLow: priceLow.toNumber(),
      priceHigh: priceHigh.toNumber(),
      midPrice: mid.toNumber(),
      mappedXauPrice: mid.minus(offset).toNumber(),
      volume: volume.toNumber(),
      volumePct: total.isZero() ? 0 : volume.div(total).times(100).toNumber(),
      isPoc: index === poc,
      isInValueArea: index >= lower && index <= upper,
      isHvn: hvn.has(index),
    };
  });

  return {
    bins: profileBins,
    pocGc: profileBins[poc]?.midPrice ?? null,
    vahGc: upper < 0 ? null : edges[upper + 1].toNumber(),
    valGc: lower < 0 ? null : edges[lower].toNumber(),
    pocXau: profileBins[poc]?.mappedXauPrice ?? null,
    vahXau: upper < 0 ? null : edges[upper + 1].minus(offset).toNumber(),
    valXau: lower < 0 ? null : edges[lower].minus(offset).toNumber(),
    hvnZones: Array.from(hvn, index => profileBins[index]),
    totalVolume: total.toNumber(),
    hasVolumeData: total.gt(0),
  };
}

interface ComexBridgeInput {
  timeframe: ComexTimeframe;
  fetchedAt: string;
  candles: readonly MarketCandle[];
  gcPrices: readonly number[];
  xauPrices: readonly number[];
  bins?: number;
  dataSource: string;
  databentoUsed: boolean;
  databentoStatus?: DatabentoStatus;
  databentoNote?: string | null;
}

export function buildComexBridgeSnapshot(input: ComexBridgeInput): ComexBridgeSnapshot {
  const basis = computeSmoothedBasis(input.gcPrices, input.xauPrices);
  const lastBar = new Date(input.candles.at(-1)?.ts ?? NaN);
  const gcPrice = input.gcPrices.at(-1);
  const xauSpotPrice = input.xauPrices.at(-1);
  const data: ComexBridgeData = {
    ...basis,
    timeframe: input.timeframe,
    fetchedAt: input.fetchedAt,
    gcCandleAt: Number.isFinite(lastBar.getTime()) ? lastBar.toISOString() : null,
    gcPrice: gcPrice !== undefined && Number.isFinite(gcPrice) && gcPrice > 0 ? gcPrice : null,
    xauSpotPrice: xauSpotPrice !== undefined && Number.isFinite(xauSpotPrice) && xauSpotPrice > 0 ? xauSpotPrice : null,
    profile: computeVolumeProfile(input.candles, { bins: input.bins, basisOffset: basis.smoothedBasis }),
    dataSource: input.dataSource,
    databentoUsed: input.databentoUsed,
    databentoStatus: input.databentoStatus ?? (input.databentoUsed ? 'used' : 'public'),
    databentoNote: input.databentoNote ?? null,
  };
  return {
    ...data,
    exports: {
      mql5: generateMql5ReadOnlyIndicator(data),
      json: generateBridgeJsonExport(data),
      pineScript: generatePineScriptV5Indicator(data),
      python: generatePythonDatabentoScript(data),
    },
  };
}

function mappedLevels(profile: ComexVolumeProfile): { name: string; price: string }[] {
  const levels = [
    { name: 'POC', price: profile.pocXau },
    { name: 'VAH', price: profile.vahXau },
    { name: 'VAL', price: profile.valXau },
    ...profile.hvnZones.map((zone, index) => ({ name: `HVN ${index + 1}`, price: zone.mappedXauPrice })),
  ];
  return levels.flatMap(({ name, price }) => price !== null && Number.isFinite(price)
    ? [{ name, price: new Decimal(price).toDecimalPlaces(8).toFixed() }] : []);
}

export function generateMql5ReadOnlyIndicator(snapshot: ComexBridgeData): string {
  const lines = mappedLevels(snapshot.profile).map(({ name, price }) =>
    `   if (!AddLevel("${name}", ${price})) return(INIT_FAILED);`).join('\n');
  return `// TallyNX COMEX-to-Spot snapshot. Read-only analytical levels for XAUUSD.
#property indicator_chart_window
#property indicator_plots 0

string prefix;

bool AddLevel(const string label, const double price)
{
   string name = prefix + label;
   if (!ObjectCreate(0, name, OBJ_HLINE, 0, 0, price)) return(false);
   ObjectSetString(0, name, OBJPROP_TEXT, label);
   ObjectSetInteger(0, name, OBJPROP_COLOR, label == "POC" ? clrGold : clrSteelBlue);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   return(true);
}

int OnInit()
{
   if (StringFind(_Symbol, "XAUUSD") < 0) return(INIT_FAILED);
   prefix = "TallyNX_COMEX_" + IntegerToString(GetMicrosecondCount()) + "_";
${lines ? lines + '\n' : ''}   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   if (prefix != "") ObjectsDeleteAll(0, prefix, 0, OBJ_HLINE);
}

int OnCalculate(const int rates_total, const int prev_calculated,
                const int begin, const double &price[])
{
   return(rates_total);
}
`;
}

export function generateBridgeJsonExport(snapshot: ComexBridgeData): string {
  const { timeframe, fetchedAt, gcCandleAt, gcPrice, xauSpotPrice, rawBasis, smoothedBasis,
    basisPct, basisSampleCount, profile, dataSource, databentoUsed, databentoStatus, databentoNote } = snapshot;
  return JSON.stringify({
    readOnly: true, kind: 'comex-to-spot-analytical-levels', sourceInstrument: 'COMEX GC', mappedInstrument: 'XAU/USD',
    timeframe, fetchedAt, gcCandleAt, gcPrice, xauSpotPrice, rawBasis, smoothedBasis, basisPct, basisSampleCount,
    profile, dataSource, databentoUsed, databentoStatus, databentoNote,
  }, null, 2);
}

export function generatePineScriptV5Indicator(snapshot: ComexBridgeData): string {
  const lines = mappedLevels(snapshot.profile).map(({ name, price }) =>
    `hline(${price}, title="${name}", color=color.${name === 'POC' ? 'orange' : 'blue'})`);
  return `//@version=5
indicator("TallyNX COMEX-to-Spot · Read-only", overlay=true)
// Static analytical levels mapped to XAUUSD at the time of the snapshot.
if not str.contains(str.upper(syminfo.ticker), "XAUUSD")
    runtime.error("Use an XAUUSD chart")
${lines.length ? lines.join('\n') : 'plot(float(na), title="No volume data")'}
`;
}

export function generatePythonDatabentoScript(snapshot: ComexBridgeData): string {
  return `# Read-only Databento GC bars mapped using the fixed snapshot basis.
# Run without arguments for historical bars, or with --live for streaming bars.
import argparse
import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import databento as db

DATASET = "GLBX.MDP3"
SYMBOL = "GC.c.0"
SCHEMA = "ohlcv-1m"
BASIS = Decimal("${new Decimal(snapshot.smoothedBasis).toFixed()}")


def show_bar(record):
    if isinstance(record, db.OHLCVMsg):
        gc_close = Decimal(record.close).scaleb(-9)
        print(record.ts_event, gc_close, gc_close - BASIS, record.volume)


def main():
    parser = argparse.ArgumentParser(description="Read-only GC-to-XAU analytical mapping")
    parser.add_argument("--live", action="store_true")
    args = parser.parse_args()
    key = os.environ["DATABENTO_API_KEY"]
    print("timestamp_ns gc_close mapped_xau_close volume", flush=True)

    if args.live:
        live = db.Live(key=key)
        live.subscribe(dataset=DATASET, symbols=[SYMBOL], stype_in="continuous", schema=SCHEMA)
        live.add_callback(show_bar)
        live.start()
        try:
            live.block_for_close()
        except KeyboardInterrupt:
            live.stop()
        return

    historical = db.Historical(key=key)
    available = historical.metadata.get_dataset_range(dataset=DATASET)
    end = datetime.fromisoformat(available["schema"][SCHEMA]["end"].replace("Z", "+00:00"))
    end = min(end, datetime.now(timezone.utc))
    bars = historical.timeseries.get_range(
        dataset=DATASET, symbols=[SYMBOL], stype_in="continuous", schema=SCHEMA,
        start=end - timedelta(days=1), end=end,
    )
    bars.replay(callback=show_bar)


if __name__ == "__main__":
    main()
`;
}
