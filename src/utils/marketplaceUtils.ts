import {
  GhrWorkspaceState,
  LiveChartTelemetry,
  MarketCandle,
  MarketplaceDeskSetup,
  Mt5PositionRecord,
  Mt5VerificationChannel,
  VerifiedSetupMetrics,
} from '../types/ghr';
import { fmtUSD, getCalcMetrics } from './ghrRules';

export const MARKETPLACE_PAGE_SIZE = 24;
const SHA256_HEX_RE = /^[a-f0-9]{64}$/i;

export type MarketplaceSortBy = 'PF_DESC' | 'WINRATE_DESC' | 'PROFIT_DESC' | 'PRICE_ASC';

export interface MarketplaceFilterOptions {
  searchQuery: string;
  symbolFilter: string;
  channelFilter: 'ALL' | Mt5VerificationChannel;
  directionFilter: 'ALL' | 'BUY' | 'SELL' | 'BOTH';
  sortBy: MarketplaceSortBy;
}

export function isIntegrityVerifiedSetup(item: MarketplaceDeskSetup): boolean {
  return Boolean(
    item &&
      item.id &&
      item.proofHash &&
      item.proofHash.length >= 16 &&
      item.metrics &&
      Number.isFinite(item.metrics.tradeCount) &&
      item.metrics.tradeCount > 0 &&
      item.blueprint,
  );
}

export function hasSha256MarketplaceProof(item: MarketplaceDeskSetup): boolean {
  return SHA256_HEX_RE.test(item.proofHash) && item.metrics.tradeCount > 0;
}

export function mergeMarketplaceListings(
  remote: readonly MarketplaceDeskSetup[],
  local: readonly MarketplaceDeskSetup[],
): MarketplaceDeskSetup[] {
  const byId = new Map<string, MarketplaceDeskSetup>();
  for (let i = 0; i < local.length; i += 1) {
    const item = local[i];
    if (isIntegrityVerifiedSetup(item)) byId.set(item.id, item);
  }
  for (let i = 0; i < remote.length; i += 1) {
    const item = remote[i];
    if (isIntegrityVerifiedSetup(item)) byId.set(item.id, item);
  }
  return Array.from(byId.values()).sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

export function filterAndSortMarketplaceListings(
  listings: readonly MarketplaceDeskSetup[],
  options: MarketplaceFilterOptions,
): MarketplaceDeskSetup[] {
  const { searchQuery, symbolFilter, channelFilter, directionFilter, sortBy } = options;
  const q = searchQuery.trim().toLowerCase();
  const hasQuery = q.length > 0;
  const list: MarketplaceDeskSetup[] = [];

  for (let i = 0; i < listings.length; i += 1) {
    const item = listings[i];
    if (!isIntegrityVerifiedSetup(item)) continue;
    if (symbolFilter !== 'ALL' && item.blueprint.primarySymbol.toUpperCase() !== symbolFilter) {
      continue;
    }
    if (channelFilter !== 'ALL' && item.verificationChannel !== channelFilter) continue;
    if (directionFilter !== 'ALL' && item.blueprint.directionMode !== directionFilter) {
      continue;
    }
    if (hasQuery) {
      const matched =
        item.title.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q) ||
        item.sellerName.toLowerCase().includes(q) ||
        item.brokerName.toLowerCase().includes(q) ||
        item.blueprint.primarySymbol.toLowerCase().includes(q);
      if (!matched) continue;
    }
    list.push(item);
  }

  return list.sort((a, b) => {
    if (sortBy === 'PF_DESC') return b.metrics.profitFactor - a.metrics.profitFactor;
    if (sortBy === 'WINRATE_DESC') return b.metrics.winRatePct - a.metrics.winRatePct;
    if (sortBy === 'PROFIT_DESC') return b.metrics.netProfitUsd - a.metrics.netProfitUsd;
    return a.priceUsd - b.priceUsd;
  });
}

export function buildSparklinePoints(
  curve: ReadonlyArray<{ equityUsd: number }> | undefined,
  width = 180,
  height = 38,
): string | null {
  if (!curve || curve.length < 2) return null;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < curve.length; i += 1) {
    const v = curve[i].equityUsd;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = Math.max(max - min, 1);
  const padBottom = 4;
  const usableHeight = Math.max(height - 10, 1);
  const denom = curve.length - 1;
  const coords = new Array<string>(curve.length);
  for (let i = 0; i < curve.length; i += 1) {
    const x = (i / denom) * width;
    const y = height - padBottom - ((curve[i].equityUsd - min) / span) * usableHeight;
    coords[i] = `${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return coords.join(' ');
}

export function computeEmaSeries(closes: number[], period: number): number[] {
  if (closes.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [closes[0]];
  for (let i = 1; i < closes.length; i++) {
    out.push(closes[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

export function computeRsi14(closes: number[], period: number = 14): number {
  if (closes.length <= period) return 50;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum += Math.abs(diff);
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return +(100 - 100 / (1 + rs)).toFixed(2);
}

export function computeAtr14(candles: MarketCandle[], period: number = 14): number {
  if (candles.length < 2) return 0;
  const startIdx = Math.max(1, candles.length - period);
  let sum = 0;
  let count = 0;
  for (let i = startIdx; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prevClose),
      Math.abs(c.low - prevClose)
    );
    sum += tr;
    count++;
  }
  return count > 0 ? +(sum / count).toFixed(4) : 0;
}

const TIMEFRAME_MS_MAP: Record<string, number> = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

/**
 * Aligns candle OHLC series with a live spot quote (e.g. OANDA:XAUUSD or Swissquote Spot).
 * When shiftWholeSeries is true (e.g. COMEX Futures GC=F calibrated to Spot XAU/USD),
 * shifts historical closes/highs/lows by the futures-to-spot basis offset so EMA & S/R match spot.
 */
export function calibrateCandlesToLiveSpot(
  candles: MarketCandle[],
  liveSpotPrice: number,
  timeframe: string,
  shiftWholeSeries: boolean
): MarketCandle[] {
  if (!Number.isFinite(liveSpotPrice) || liveSpotPrice <= 0 || candles.length === 0) {
    return candles;
  }

  const last = candles[candles.length - 1];
  const rawDelta = liveSpotPrice - last.close;
  // Guard against aberrant ticks (>5% spread deviation)
  if (Math.abs(rawDelta) / liveSpotPrice > 0.05) {
    return candles;
  }

  let series = candles.map((c) => ({ ...c }));
  if (shiftWholeSeries && Math.abs(rawDelta) > 1e-8) {
    series = series.map((c) => ({
      ...c,
      open: +(c.open + rawDelta).toFixed(4),
      high: +(c.high + rawDelta).toFixed(4),
      low: +(c.low + rawDelta).toFixed(4),
      close: +(c.close + rawDelta).toFixed(4),
    }));
  }

  const latest = series[series.length - 1];
  const tfMs = TIMEFRAME_MS_MAP[timeframe] || 15 * 60 * 1000;
  const nowMs = Date.now();
  const isStaleBar = nowMs - latest.ts > tfMs * 1.5;

  if (isStaleBar) {
    const dt = new Date(nowMs);
    const label =
      timeframe === '1d'
        ? dt.toISOString().slice(5, 10)
        : `${dt.toISOString().slice(5, 10)} ${dt.toISOString().slice(11, 16)}`;
    const prevClose = latest.close;
    series.push({
      ts: nowMs,
      timeLabel: label,
      open: prevClose,
      high: Math.max(prevClose, liveSpotPrice),
      low: Math.min(prevClose, liveSpotPrice),
      close: +liveSpotPrice.toFixed(4),
      volume: 0,
    });
  } else {
    latest.close = +liveSpotPrice.toFixed(4);
    latest.high = +Math.max(latest.high, liveSpotPrice).toFixed(4);
    latest.low = +Math.min(latest.low, liveSpotPrice).toFixed(4);
  }

  return series;
}

export function computeLiveChartTelemetryFromCandles(
  symbol: string,
  timeframe: string,
  candles: MarketCandle[],
  source: string
): LiveChartTelemetry {
  const valid = candles.filter(
    (c) =>
      Number.isFinite(c.open) &&
      Number.isFinite(c.high) &&
      Number.isFinite(c.low) &&
      Number.isFinite(c.close) &&
      c.close > 0
  );
  if (valid.length === 0) {
    throw new Error(`No valid OHLC candles available for ${symbol}`);
  }

  const closes = valid.map((c) => c.close);
  const latest = valid[valid.length - 1];
  const prev = valid.length >= 2 ? valid[valid.length - 2] : latest;
  const ema20Arr = computeEmaSeries(closes, 20);
  const ema50Arr = computeEmaSeries(closes, 50);
  const ema20 = +(ema20Arr[ema20Arr.length - 1] ?? latest.close).toFixed(4);
  const ema50 = +(ema50Arr[ema50Arr.length - 1] ?? latest.close).toFixed(4);
  const rsi14 = computeRsi14(closes, 14);
  const atr14 = computeAtr14(valid, 14);

  const recentStart = Math.max(0, valid.length - 24);
  let highMax = -Infinity;
  let lowMin = Infinity;
  for (let i = recentStart; i < valid.length; i++) {
    const c = valid[i];
    if (c.high > highMax) highMax = c.high;
    if (c.low < lowMin) lowMin = c.low;
  }
  const intradayHigh = +highMax.toFixed(4);
  const intradayLow = +lowMin.toFixed(4);

  let trendBias: LiveChartTelemetry['trendBias'] = 'NEUTRAL';
  if (latest.close > ema20 && ema20 > ema50) {
    trendBias = 'BULLISH';
  } else if (latest.close < ema20 && ema20 < ema50) {
    trendBias = 'BEARISH';
  }

  const changeAbs = +(latest.close - prev.close).toFixed(4);
  const changePct = prev.close > 0 ? +((changeAbs / prev.close) * 100).toFixed(3) : 0;

  return {
    symbol: symbol.toUpperCase(),
    timeframe,
    source,
    fetchedAt: new Date().toISOString(),
    currentPrice: +latest.close.toFixed(4),
    prevClose: +prev.close.toFixed(4),
    changeAbs,
    changePct,
    intradayHigh,
    intradayLow,
    ema20,
    ema50,
    rsi14,
    atr14,
    trendBias,
    supportLevel: intradayLow,
    resistanceLevel: intradayHigh,
    candles: valid.slice(-60),
  };
}

export function formatLiveChartTelemetryForPrompt(t: LiveChartTelemetry): string {
  const recentBars = t.candles
    .slice(-8)
    .map(
      (c) =>
        `${c.timeLabel}: O=${c.open.toFixed(2)} H=${c.high.toFixed(2)} L=${c.low.toFixed(2)} C=${c.close.toFixed(2)}`
    )
    .join('\n');

  return [
    `Symbol: ${t.symbol} | Timeframe: ${t.timeframe} | Source: ${t.source} (${t.fetchedAt})`,
    `Spot Price: ${t.currentPrice.toFixed(2)} | Bar Change: ${t.changeAbs >= 0 ? '+' : ''}${t.changeAbs.toFixed(2)} (${t.changePct >= 0 ? '+' : ''}${t.changePct.toFixed(2)}%)`,
    `Trend Structure (EMA20 vs EMA50): ${t.trendBias} | EMA20=${t.ema20.toFixed(2)} | EMA50=${t.ema50.toFixed(2)}`,
    `RSI(14): ${t.rsi14.toFixed(1)} | ATR(14): ${t.atr14.toFixed(2)}`,
    `24-Bar Range Support/Low: ${t.supportLevel.toFixed(2)} | Resistance/High: ${t.resistanceLevel.toFixed(2)}`,
    `Latest 8 OHLC Bars:\n${recentBars}`,
  ].join('\n');
}

export function buildLocalLiveChartAnalysis(
  t: LiveChartTelemetry,
  state: GhrWorkspaceState
): string {
  const m = getCalcMetrics(state.calcDir, state.calcEntry, state.calcRisk);
  const priceDecimals = t.currentPrice >= 100 ? 2 : 4;
  const distToEntry =
    m.validEntry > 0 && t.symbol.includes('XAU')
      ? Math.abs(t.currentPrice - m.validEntry)
      : null;
  const rsiRegime =
    t.rsi14 >= 70
      ? 'Overbought (ระวังแรงขายทำกำไร / รอย่อ)'
      : t.rsi14 <= 30
      ? 'Oversold (ระวังแรงดีดกลับ / รอแท่งยืนยัน)'
      : 'Balanced Momentum (โซนสมดุล)';
  const biasLabel =
    t.trendBias === 'BULLISH'
      ? 'ขาขึ้น (Price > EMA20 > EMA50)'
      : t.trendBias === 'BEARISH'
      ? 'ขาลง (Price < EMA20 < EMA50)'
      : 'Sideway / Transition (รอการยืนยันทิศทาง)';

  const ghrSlPriceSpan = 10.0; // 1,000 points on XAUUSD = $10 move
  const atrNote =
    t.symbol.includes('XAU') && t.atr14 > 0
      ? `ATR(14) ปัจจุบัน = $${t.atr14.toFixed(2)} เทียบกับระยะ SL มาตรฐาน GHR $10.00 (-1,000p) = ${(
          ghrSlPriceSpan / t.atr14
        ).toFixed(2)}× ATR`
      : `ATR(14) ปัจจุบัน = ${t.atr14.toFixed(priceDecimals)}`;

  return [
    `📊 **วิเคราะห์กราฟสด (${t.symbol} · ${t.timeframe})** [แหล่งข้อมูล: ${t.source}]`,
    `• **ราคาปัจจุบัน:** ${t.currentPrice.toFixed(priceDecimals)} (${t.changePct >= 0 ? '+' : ''}${t.changePct.toFixed(2)}%)`,
    `• **โครงสร้างแนวโน้ม:** ${biasLabel} | EMA20 = ${t.ema20.toFixed(priceDecimals)} / EMA50 = ${t.ema50.toFixed(priceDecimals)}`,
    `• **โมเมนตัม & ความผันผวน:** RSI(14) = ${t.rsi14.toFixed(1)} (${rsiRegime}) · ${atrNote}`,
    `• **แนวรับ / แนวต้าน (24 แท่งล่าสุด):** Support ${t.supportLevel.toFixed(priceDecimals)} · Resistance ${t.resistanceLevel.toFixed(priceDecimals)}`,
    '',
    `🛡️ **เทียบกับแผน GHR v3.2 ปัจจุบัน:**`,
    distToEntry !== null
      ? `• แผนตั้ง ${state.calcDir} Limit @ ${m.validEntry.toFixed(2)} (ห่างจากราคาตลาด ${distToEntry.toFixed(2)} ดอลลาร์ = ~${Math.round(distToEntry * 100)} จุด)`
      : `• โหมดคำนวณโต๊ะปัจจุบัน: ${state.calcDir} · ความเสี่ยง ${fmtUSD(m.risk)} (${m.lotLeg} Lot × 3 ไม้)`,
    `• **กฎ Safe Harbor & 12-Gate:** โปรดตรวจสอบ Gate 1–2 (H1 ปิดยืนยันโครงสร้าง) และ Gate 3 (M5 ย่อตัวไม่ไล่ราคา) ก่อนวาง Limit (เครื่องมือวิเคราะห์เชิงโครงสร้างและความเสี่ยง ไม่ใช่สัญญาณซื้อขาย)`,
  ].join('\n');
}

export function maskMt5Login(login: string): string {
  const clean = String(login || '').trim().replace(/^#/, '');
  if (!clean) return '****';
  if (clean.length <= 4) return clean[0] + '***';
  return `${clean.slice(0, 3)}***${clean.slice(-2)}`;
}

export function validateVerifiedMt5Positions(
  positions: unknown[]
): { valid: Mt5PositionRecord[]; rejectedCount: number } {
  if (!Array.isArray(positions)) {
    return { valid: [], rejectedCount: 0 };
  }
  const valid: Mt5PositionRecord[] = [];
  let rejectedCount = 0;

  for (const raw of positions) {
    if (!raw || typeof raw !== 'object') {
      rejectedCount++;
      continue;
    }
    const r = raw as Partial<Mt5PositionRecord>;
    const ticket = String(r.ticket || '').trim();
    const symbol = String(r.symbol || '').trim().toUpperCase();
    const dir = r.dir === 'SELL' ? 'SELL' : r.dir === 'BUY' ? 'BUY' : null;
    const openPrice = Number(r.openPrice);
    const closePrice = Number(r.closePrice);
    const volume = Number(r.volume);
    const netProfit = Number(r.netProfit);
    const closeDate = String(r.closeDate || '').trim();

    if (
      !ticket ||
      !symbol ||
      !dir ||
      !Number.isFinite(openPrice) ||
      openPrice <= 0 ||
      !Number.isFinite(closePrice) ||
      closePrice <= 0 ||
      !Number.isFinite(volume) ||
      volume <= 0 ||
      !Number.isFinite(netProfit) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(closeDate)
    ) {
      rejectedCount++;
      continue;
    }

    valid.push({
      ticket,
      symbol,
      dir,
      openDate: String(r.openDate || closeDate),
      openTime: String(r.openTime || '00:00'),
      openTs: Number(r.openTs) || Number(r.closeTs) || Date.now(),
      closeDate,
      closeTime: String(r.closeTime || '00:00'),
      closeTs: Number(r.closeTs) || Date.now(),
      volume: +volume.toFixed(2),
      openPrice,
      slPrice: Number(r.slPrice) || 0,
      tpPrice: Number(r.tpPrice) || 0,
      closePrice,
      commission: Number(r.commission) || 0,
      swap: Number(r.swap) || 0,
      rawProfit: Number(r.rawProfit ?? netProfit),
      netProfit: +netProfit.toFixed(2),
      comment: String(r.comment || ''),
    });
  }

  return { valid, rejectedCount };
}

export function computeVerifiedSetupMetrics(
  positions: Mt5PositionRecord[],
  initialDeposit: number = 10000,
  alreadyValidated: boolean = false
): VerifiedSetupMetrics {
  const valid = alreadyValidated ? positions : validateVerifiedMt5Positions(positions).valid;
  if (valid.length === 0) {
    throw new Error('Cannot build verified setup metrics: 0 valid MT5 positions provided.');
  }

  const sorted = [...valid].sort((a, b) => a.closeTs - b.closeTs);
  const startCap = initialDeposit > 0 ? initialDeposit : 10000;

  let winCount = 0;
  let lossCount = 0;
  let grossProfitUsd = 0;
  let grossLossUsd = 0;
  let runningPnl = 0;
  let peakEquity = startCap;
  let maxDrawdownUsd = 0;
  let maxDrawdownPct = 0;
  const symbolSet = new Set<string>();
  const dayProfitMap = new Map<string, number>();

  const fullCurve: Array<{ label: string; equityUsd: number; pnlUsd: number }> = [];

  for (const pos of sorted) {
    symbolSet.add(pos.symbol);
    dayProfitMap.set(
      pos.closeDate,
      +((dayProfitMap.get(pos.closeDate) || 0) + pos.netProfit).toFixed(2)
    );

    if (pos.netProfit >= 0) {
      winCount++;
      grossProfitUsd += pos.netProfit;
    } else {
      lossCount++;
      grossLossUsd += Math.abs(pos.netProfit);
    }

    runningPnl = +(runningPnl + pos.netProfit).toFixed(2);
    const equityNow = +(startCap + runningPnl).toFixed(2);
    if (equityNow > peakEquity) {
      peakEquity = equityNow;
    }
    const ddUsd = +(peakEquity - equityNow).toFixed(2);
    const ddPct = peakEquity > 0 ? +((ddUsd / peakEquity) * 100).toFixed(2) : 0;
    if (ddUsd > maxDrawdownUsd) maxDrawdownUsd = ddUsd;
    if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;

    fullCurve.push({
      label: pos.closeDate,
      equityUsd: equityNow,
      pnlUsd: runningPnl,
    });
  }

  const tradeCount = sorted.length;
  const winRatePct = +((winCount / tradeCount) * 100).toFixed(1);
  const profitFactor =
    grossLossUsd > 0
      ? +(grossProfitUsd / grossLossUsd).toFixed(2)
      : grossProfitUsd > 0
      ? 9.99
      : 0;
  const avgLoss = lossCount > 0 ? grossLossUsd / lossCount : 0;
  const avgWin = winCount > 0 ? grossProfitUsd / winCount : 0;
  const avgR =
    avgLoss > 0
      ? +(((winCount * avgWin - lossCount * avgLoss) / (tradeCount * avgLoss))).toFixed(2)
      : runningPnl > 0
      ? 1.0
      : 0;

  let bestPositiveDay = 0;
  dayProfitMap.forEach((p) => {
    if (p > bestPositiveDay) bestPositiveDay = p;
  });
  const consistencyBestDayPct =
    runningPnl > 0 ? +((bestPositiveDay / runningPnl) * 100).toFixed(1) : 0;

  // Downsample curve to max 40 points while keeping endpoints intact
  const step = Math.max(1, Math.floor(fullCurve.length / 40));
  const equityCurve = fullCurve.filter(
    (_pt, idx) => idx === 0 || idx === fullCurve.length - 1 || idx % step === 0
  );

  const sampleDeals = sorted
    .slice(-8)
    .reverse()
    .map((p) => ({
      ticket: `#${p.ticket.slice(0, 4)}***${p.ticket.slice(-2)}`,
      symbol: p.symbol,
      dir: p.dir,
      closeDate: p.closeDate,
      netProfit: p.netProfit,
      volume: p.volume,
    }));

  return {
    tradeCount,
    winCount,
    lossCount,
    winRatePct,
    profitFactor,
    netProfitUsd: +runningPnl.toFixed(2),
    grossProfitUsd: +grossProfitUsd.toFixed(2),
    grossLossUsd: +grossLossUsd.toFixed(2),
    maxDrawdownUsd: +maxDrawdownUsd.toFixed(2),
    maxDrawdownPct: +maxDrawdownPct.toFixed(2),
    avgR,
    consistencyBestDayPct,
    symbols: Array.from(symbolSet),
    firstTradeDate: sorted[0].closeDate,
    lastTradeDate: sorted[sorted.length - 1].closeDate,
    equityCurve,
    sampleDeals,
  };
}
