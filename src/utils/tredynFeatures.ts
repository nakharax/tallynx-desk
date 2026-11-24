import { AccountComputed, AccountInfo, TradeRecord } from '../types/ghr';
import { evaluateConsistencyRule, getBangkokIsoDate, getTradeSession } from './ghrRules';

// =========================================================================
// 1. TELEMETRY & LIVE DESK SUMMARY (Pure Computation)
// =========================================================================
export interface SessionWinRateStats {
  asiaWrPct: number;
  londonWrPct: number;
  nyWrPct: number;
  avgR: number;
  totalTrades: number;
}

export interface DeskTelemetrySummary {
  equity: number;
  floatingPnl: number;
  todayPnlUsd: number;
  dailyLossPctUsed: number;
  dailyDdGuardStatus: 'SAFE' | 'CAUTION' | 'DANGER';
  sessions: SessionWinRateStats;
}

export function computeDeskTelemetry(
  acc: AccountComputed,
  journal: TradeRecord[],
  portId: string,
  floatingPnl = 0,
  todayIso: string = getBangkokIsoDate()
): DeskTelemetrySummary {
  const portTrades = journal.filter((j) => j.port === portId);
  const equity = +(acc.balance + floatingPnl).toFixed(2);

  const todayPnlUsd = +portTrades
    .filter((j) => (j.date || '').slice(0, 10) === todayIso)
    .reduce((sum, j) => sum + (Number(j.pnlUsd) || 0), 0)
    .toFixed(2);

  const dailyLossAmount = todayPnlUsd < 0 ? Math.abs(todayPnlUsd) : 0;
  const maxDailyUsd = Math.max(1, acc.initial * 0.05);
  const dailyLossPctUsed = +Math.min(100, (dailyLossAmount / maxDailyUsd) * 100).toFixed(1);
  const dailyDdGuardStatus: 'SAFE' | 'CAUTION' | 'DANGER' =
    dailyLossPctUsed >= 80 ? 'DANGER' : dailyLossPctUsed >= 45 ? 'CAUTION' : 'SAFE';

  const sessCounts = {
    ASIA: { win: 0, total: 0 },
    LONDON: { win: 0, total: 0 },
    NY: { win: 0, total: 0 },
  };
  let rSum = 0;

  portTrades.forEach((t) => {
    const s = getTradeSession(t.time);
    sessCounts[s].total += 1;
    if ((Number(t.pnlUsd) || 0) > 0) sessCounts[s].win += 1;
    rSum += Number(t.rr) || 0;
  });

  const calcWr = (c: { win: number; total: number }) =>
    c.total > 0 ? Math.round((c.win / c.total) * 100) : 0;

  return {
    equity,
    floatingPnl: +floatingPnl.toFixed(2),
    todayPnlUsd,
    dailyLossPctUsed,
    dailyDdGuardStatus,
    sessions: {
      asiaWrPct: calcWr(sessCounts.ASIA),
      londonWrPct: calcWr(sessCounts.LONDON),
      nyWrPct: calcWr(sessCounts.NY),
      avgR: portTrades.length > 0 ? +(rSum / portTrades.length).toFixed(2) : 0,
      totalTrades: portTrades.length,
    },
  };
}

// =========================================================================
// 2. MARKET MINI READER INDICATORS (Pure Math from OHLC Candles)
// =========================================================================
export type MarketSymbol =
  | 'XAUUSD'
  | 'EURUSD'
  | 'GBPUSD'
  | 'USDJPY'
  | 'NAS100'
  | 'US30'
  | 'BTCUSD';

export type MarketTimeframe = '5M' | '15M' | '1H' | '4H' | '1D';

export interface MarketCandle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface MarketIndicatorSnapshot {
  ema20: number;
  ema50: number;
  rsi14: number;
  atr14: number;
  support: number;
  resistance: number;
  trend: 'BULLISH' | 'BEARISH' | 'RANGE';
}

export function computeEmaSeries(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

export function computeRsi14(closes: number[], period = 14): number {
  if (closes.length < 2) return 50;
  const lookback = Math.min(period, closes.length - 1);
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - lookback; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / lookback;
  const avgLoss = losses / lookback;
  if (avgLoss === 0) return avgGain > 0 ? 100 : 50;
  const rs = avgGain / avgLoss;
  return +(100 - 100 / (1 + rs)).toFixed(1);
}

export function computeMarketIndicators(
  candles: MarketCandle[],
  decimals = 2
): MarketIndicatorSnapshot {
  if (!Array.isArray(candles) || candles.length === 0) {
    return {
      ema20: 0,
      ema50: 0,
      rsi14: 50,
      atr14: 0,
      support: 0,
      resistance: 0,
      trend: 'RANGE',
    };
  }
  const closes = candles.map((c) => c.close);
  const ema20Arr = computeEmaSeries(closes, 20);
  const ema50Arr = computeEmaSeries(closes, 50);
  const ema20 = +ema20Arr[ema20Arr.length - 1].toFixed(decimals);
  const ema50 = +ema50Arr[ema50Arr.length - 1].toFixed(decimals);
  const rsi14 = computeRsi14(closes, 14);

  const trList: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (i === 0) {
      trList.push(c.high - c.low);
    } else {
      const prevClose = candles[i - 1].close;
      trList.push(
        Math.max(
          c.high - c.low,
          Math.abs(c.high - prevClose),
          Math.abs(c.low - prevClose)
        )
      );
    }
  }
  const recentTr = trList.slice(-14);
  const atr14 = +(
    recentTr.reduce((s, v) => s + v, 0) / Math.max(1, recentTr.length)
  ).toFixed(decimals);

  const srWindow = candles.slice(-24);
  const support = +Math.min(...srWindow.map((c) => c.low)).toFixed(decimals);
  const resistance = +Math.max(...srWindow.map((c) => c.high)).toFixed(decimals);

  const lastPrice = closes[closes.length - 1];
  const spreadThreshold = Math.max(atr14 * 0.15, lastPrice * 0.0004);
  let trend: 'BULLISH' | 'BEARISH' | 'RANGE' = 'RANGE';
  if (ema20 > ema50 + spreadThreshold && lastPrice >= ema20) {
    trend = 'BULLISH';
  } else if (ema20 < ema50 - spreadThreshold && lastPrice <= ema20) {
    trend = 'BEARISH';
  }

  return {
    ema20,
    ema50,
    rsi14,
    atr14,
    support,
    resistance,
    trend,
  };
}

// =========================================================================
// 3. PROP RULES CENTER CATALOG & ACCOUNT COMPLIANCE EVALUATOR
// =========================================================================
export type PropFirmCategory = 'CFD' | 'FUTURES';

export interface PropFirmRuleProfile {
  id: string;
  name: string;
  category: PropFirmCategory;
  badge: string;
  challengeTargetPct: string;
  dailyDdRule: string;
  maxDdRule: string;
  consistencyPct: number | null;
  consistencyNote: string;
  profitSplit: string;
  payoutCycle: string;
  minTradingDays: string;
  syncPolicy: string;
  allowedEAs: string;
  officialUrl: string;
  highlights: string[];
}

export const PROP_FIRM_RULES: PropFirmRuleProfile[] = [
  {
    id: 'ftmo',
    name: 'FTMO',
    category: 'CFD',
    badge: 'Standard 2-Step / 1-Step',
    challengeTargetPct: 'Phase 1: 10% · Phase 2: 5%',
    dailyDdRule: '5% ของ Balance เริ่มต้นวัน (รวม Floating)',
    maxDdRule: '10% Static Max Loss',
    consistencyPct: null,
    consistencyNote: 'ไม่มีเพดาน Consistency Rule แต่ห้าม Martingale/Gambling',
    profitSplit: '80% – 90%',
    payoutCycle: 'ทุก 14 วัน (On-Demand หลัง 14 วัน)',
    minTradingDays: '4 วัน',
    syncPolicy: 'แนะนำ .xlsx / Myfxbook API หรือ EA บน IP ส่วนตัวเท่านั้น',
    allowedEAs: 'อนุญาต EA ส่วนตัว (ต้องไม่ชน 200+ orders/วัน หรือ Shared HFT IP)',
    officialUrl: 'https://ftmo.com/en/trading-objectives/',
    highlights: [
      'คิด Daily DD ตาม Balance 00:00 CE(S)T + ค่า Floating',
      '1-Step / Swing ถือข้ามสัปดาห์และข่าวได้ตามประเภทบัญชี',
    ],
  },
  {
    id: 'fundednext',
    name: 'FundedNext',
    category: 'CFD',
    badge: 'Stellar / Evaluation',
    challengeTargetPct: 'Stellar 2-Step: 8% / 5% · 1-Step: 10%',
    dailyDdRule: '5% Balance/Equity (Stellar 1-Step: 3%)',
    maxDdRule: '10% Balance-Based (1-Step: 6% Trailing)',
    consistencyPct: 40,
    consistencyNote: 'บางแผน/Challenge ตรวจ 40% Best Day + โบนัส 15% ช่วง Challenge',
    profitSplit: '80% – 95%',
    payoutCycle: 'ครั้งแรก 21 วัน / ถัดไปทุก 14 วัน (หรือ 24 ชม. Add-on)',
    minTradingDays: '5 วัน',
    syncPolicy: 'มี FundedNext Official MCP / Bridge EA บน Dedicated IP ส่วนตัว',
    allowedEAs: 'อนุญาต EA ส่วนตัว ห้าม Copy Trade ต่างเจ้าของ / Shared VPS',
    officialUrl: 'https://help.fundednext.com/',
    highlights: [
      'รองรับการตรวจสิทธิ์ผ่าน Official API / MCP สำหรับผู้ถือบัญชี',
      'ระวังกฎ Single IP Policy: ห้ามส่ง Investor Password ให้ Shared Cloud VPS',
    ],
  },
  {
    id: 'the5ers',
    name: 'The5ers',
    category: 'CFD',
    badge: 'High Stakes / Bootcamp',
    challengeTargetPct: 'High Stakes: 8% / 5% · Bootcamp: 6% ต่อสเตจ',
    dailyDdRule: '5% ของ Balance/Equity ณ วันใหม่ (00:00 Server)',
    maxDdRule: '10% Static Stop-Out',
    consistencyPct: null,
    consistencyNote: 'ตรวจวินัย Risk per Idea (ห้ามเสี่ยงเกิน 2% ต่อหนึ่งไอเดียชัดเจน)',
    profitSplit: '80% – 100%',
    payoutCycle: 'ทุก 14 วัน',
    minTradingDays: '3 วันทำกำไร (>0.5%)',
    syncPolicy: 'ซิงก์แบบอ่านอย่างเดียวด้วยรายงาน .xlsx จาก MT5 หรือ Myfxbook',
    allowedEAs: 'ต้องวาง SL ทุกออเดอร์บน Bootcamp · EA ส่วนตัวอนุญาตเฉพาะผู้ถือบัญชีเดียว',
    officialUrl: 'https://the5ers.com/',
    highlights: [
      'Strict SL Policy บนแผน Bootcamp และตรวจ Risk Management',
      'Scaling Plan เติบโตได้สูงสุด $4M',
    ],
  },
  {
    id: 'fundingpips',
    name: 'FundingPips',
    category: 'CFD',
    badge: 'Zero / 1-Step / 2-Step',
    challengeTargetPct: '2-Step: 8% / 5% · 1-Step: 10%',
    dailyDdRule: '5% (2-Step) / 4% (1-Step) · คิดจาก max(Balance, Equity)',
    maxDdRule: '10% (2-Step) / 6% (1-Step)',
    consistencyPct: 40,
    consistencyNote: 'แผน Zero ใช้เกณฑ์ Consistency 15%–40% · ห้าม News 2 นาทีก่อน-หลัง',
    profitSplit: '80% – 100%',
    payoutCycle: 'Tuesday Payday (ทุก 5 / 14 วันตามโหมด)',
    minTradingDays: '3 วัน',
    syncPolicy: 'Import .xlsx / Match-Trader / cTrader / Myfxbook API',
    allowedEAs: 'ห้าม Third-Party Signal EA / Shared VPS เด็ดขาด',
    officialUrl: 'https://www.fundingpips.com/',
    highlights: [
      'คิด Daily Loss จากค่าที่สูงกว่าของ Balance หรือ Equity ต้นวัน',
      'ระวังกฎ ±2 นาทีรอบ High-Impact News บนบัญชี Funded',
    ],
  },
  {
    id: 'apex',
    name: 'Apex Trader Funding',
    category: 'FUTURES',
    badge: 'Futures Rithmic / Tradovate',
    challengeTargetPct: '6% (เช่น $50K เป้า $3,000)',
    dailyDdRule: 'ไม่มี Daily Pause ตายตัว (คุมเองตาม 30% MAE Rule)',
    maxDdRule: 'Intraday Trailing Threshold (EOD บางแผน)',
    consistencyPct: 30,
    consistencyNote: '30% Consistency Rule เข้มงวด (วันกำไรสูงสุดห้ามเกิน 30% ของยอดรวม)',
    profitSplit: '100% แรก $25K · ถัดไป 90%',
    payoutCycle: 'ทุก 8 วันเทรด (ขั้นต่ำ 5 วันกำไร $50+)',
    minTradingDays: '7 วัน',
    syncPolicy: 'ProjectX / Tradovate CSV หรือ Report Import (ห้าม Shared VPN/VPS)',
    allowedEAs: 'ไม่อนุญาต Fully Automated Bots ช่วง PA บนบัญชีทั่วไป',
    officialUrl: 'https://support.apextraderfunding.com/',
    highlights: [
      'Trailing Drawdown ตาม High-Water Mark ระหว่างวัน',
      'กฎ 30% MAE: ห้ามถือ Floating ติดลบเกิน 30% ของกำไรสะสมต้นวัน',
    ],
  },
  {
    id: 'topstep_tpt',
    name: 'Take Profit Trader',
    category: 'FUTURES',
    badge: 'Futures Daily PRO Payout',
    challengeTargetPct: '6% (เช่น $50K เป้า $3,000)',
    dailyDdRule: 'ไม่มี Daily Limit แยกใน PRO · ตรวจ EOD ช่วง Test',
    maxDdRule: 'EOD ช่วง Test → Intraday Trailing ช่วง PRO จนพ้น Buffer',
    consistencyPct: 50,
    consistencyNote: '50% Consistency ในรอบ Test (วันเดียวห้ามเกิน 50% ของเป้ากำไร)',
    profitSplit: '80% (90% PRO+)',
    payoutCycle: 'ถอนได้ทุกวันทันทีเมื่อพ้น Buffer Zone',
    minTradingDays: '5 วัน',
    syncPolicy: 'ProjectX API / CSV Import ทางการ',
    allowedEAs: 'เน้น Manual Execution · ห้าม Grid / News Straddle',
    officialUrl: 'https://takeprofittrader.com/',
    highlights: [
      'เมื่อ Balance พ้น Safety Buffer ในบัญชี PRO ถอนกำไรได้รายวัน',
      'ช่วง Evaluation ใช้ End-of-Day Trailing Drawdown',
    ],
  },
  {
    id: 'myfundedfutures',
    name: 'MyFundedFutures',
    category: 'FUTURES',
    badge: 'Starter / Expert / Milestone',
    challengeTargetPct: '6% (Starter $50K เป้า $3,000)',
    dailyDdRule: 'ไม่มี Daily Loss Limit (Starter Plus) / 2.2% (บางแผน)',
    maxDdRule: 'EOD Trailing Max Loss (เช่น $2,000 บน $50K)',
    consistencyPct: 40,
    consistencyNote: 'Starter ใช้ 40% Consistency Rule ตลอดถึงยอดถอน',
    profitSplit: '100% แรก $10K · ถัดไป 90%',
    payoutCycle: 'ทุก 5 วันกำไร (14 วันตามแผน)',
    minTradingDays: '5 วัน',
    syncPolicy: 'ProjectX / Tradovate Read-Only Sync',
    allowedEAs: 'อนุญาต TradingView Bridge แบบ Manual Confirm บน IP เจ้าของ',
    officialUrl: 'https://help.myfundedfutures.com/',
    highlights: [
      'End-of-Day Drawdown ช่วยให้ทนการเหวี่ยงระหว่างวันได้ดีกว่า Intraday',
      'รองรับโหมด Scaling Contract ตามขนาดทุน',
    ],
  },
];

export interface PropRulePortComparison {
  ruleId: string;
  firmName: string;
  consistencyOk: boolean;
  consistencyMessage: string;
  minDaysOk: boolean;
  minDaysMessage: string;
  dailyDdHeadroomUsd: number;
  dailyDdHeadroomPct: number;
  maxDdHeadroomUsd: number;
  recommendedDailyMaxUsd: number;
  overallVerdict: 'PASS' | 'WARNING' | 'RISK';
}

export function evaluateAccountAgainstPropRule(
  acc: AccountComputed,
  trades: TradeRecord[],
  rule: PropFirmRuleProfile,
  thbRate = 35.5
): PropRulePortComparison {
  const portTrades = trades.filter((t) => t.port === acc.id);
  const dailyMap: Record<string, number> = {};
  portTrades.forEach((t) => {
    const d = (t.date || '').slice(0, 10) || 'UNKNOWN';
    dailyMap[d] = +(Number(dailyMap[d] || 0) + (Number(t.pnlUsd) || 0)).toFixed(2);
  });

  const daysArr = Object.entries(dailyMap).map(([d, pnl], idx) => ({
    day: idx + 1,
    note: d,
    profit: Math.max(0, pnl),
  }));

  const targetCap = rule.consistencyPct ?? acc.consistencyCapPct ?? 100;
  const cons = evaluateConsistencyRule(daysArr, false, thbRate, {
    consistencyCapPct: targetCap,
    profitSplitPct: acc.profitSplitPct ?? 80,
    minTotalUsd: Math.max(100, acc.targetProfit * 0.25),
    minDays: acc.minDays || 3,
  });

  const consistencyOk = !cons.hasConsistencyCap || cons.bestDayPct <= targetCap + 0.01;
  const consistencyMessage = cons.hasConsistencyCap
    ? cons.totalProfit <= 0
      ? `ยังไม่มีกำไรสะสม (เกณฑ์ Best Day ≤ ${targetCap}%)`
      : consistencyOk
      ? `ผ่าน: วันสูงสุด ${cons.bestDayPct.toFixed(1)}% ≤ ${targetCap}%`
      : `เกินเกณฑ์: วันสูงสุด ${cons.bestDayPct.toFixed(1)}% > ${targetCap}% (ต้องทำเพิ่มอีก $${cons.extraProfitNeeded.toFixed(0)})`
    : 'ค่ายนี้ไม่มีเพดาน % Consistency รายวัน';

  const minDaysOk = acc.currentDays >= acc.minDays;
  const minDaysMessage = `เทรดแล้ว ${acc.currentDays}/${acc.minDays} วัน`;

  const todayIso = getBangkokIsoDate();
  const todayPnl = dailyMap[todayIso] || 0;
  const dailyCapUsd = acc.initial * 0.05;
  const dailyUsed = todayPnl < 0 ? Math.abs(todayPnl) : 0;
  const dailyDdHeadroomUsd = +Math.max(0, dailyCapUsd - dailyUsed).toFixed(2);
  const dailyDdHeadroomPct = +Math.max(0, 100 - (dailyUsed / Math.max(1, dailyCapUsd)) * 100).toFixed(1);

  const maxCapUsd = acc.initial * 0.1;
  const maxUsed = acc.profit < 0 ? Math.abs(acc.profit) : 0;
  const maxDdHeadroomUsd = +Math.max(0, maxCapUsd - maxUsed).toFixed(2);

  const recommendedDailyMaxUsd =
    rule.consistencyPct && acc.targetProfit > 0
      ? +((acc.targetProfit * (rule.consistencyPct / 100)) * 0.9).toFixed(2)
      : +(acc.defaultRisk * 1.33).toFixed(2);

  const overallVerdict: 'PASS' | 'WARNING' | 'RISK' =
    dailyDdHeadroomPct < 35 || maxDdHeadroomUsd < acc.initial * 0.03
      ? 'RISK'
      : !consistencyOk || !minDaysOk
      ? 'WARNING'
      : 'PASS';

  return {
    ruleId: rule.id,
    firmName: rule.name,
    consistencyOk,
    consistencyMessage,
    minDaysOk,
    minDaysMessage,
    dailyDdHeadroomUsd,
    dailyDdHeadroomPct,
    maxDdHeadroomUsd,
    recommendedDailyMaxUsd,
    overallVerdict,
  };
}

// =========================================================================
// 4. MARKETPLACE VERIFIED BLUEPRINTS (Strict Verified SHA-256 Digest)
// =========================================================================
export interface VerifiedSetupBlueprint {
  id: string;
  title: string;
  symbol: MarketSymbol | string;
  directionBias: 'BOTH' | 'BUY' | 'SELL';
  channelLabel: string;
  priceUsd: number;
  authorLabel: string;
  accountType: 'PROP' | 'PERSONAL';
  tradesCount: number;
  winRatePct: number;
  netPnlUsd: number;
  avgR: number;
  profitFactor: number;
  verificationHash: string;
  checklistNotes: string[];
  createdAt: string;
  isOwn?: boolean;
}

export interface BlueprintPerformanceMetrics {
  tradesCount: number;
  winRatePct: number;
  netPnlUsd: number;
  avgR: number;
  profitFactor: number;
  canonicalDigestInput: string;
}

export function buildVerifiedBlueprintMetrics(
  trades: TradeRecord[],
  account?: Partial<AccountInfo>
): BlueprintPerformanceMetrics {
  const valid = Array.isArray(trades) ? trades : [];
  const count = valid.length;
  if (count === 0) {
    return {
      tradesCount: 0,
      winRatePct: 0,
      netPnlUsd: 0,
      avgR: 0,
      profitFactor: 0,
      canonicalDigestInput: `EMPTY|${account?.login || 'NONE'}`,
    };
  }

  let wins = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let sumR = 0;
  let netPnl = 0;

  const sorted = [...valid].sort((a, b) =>
    `${a.date}_${a.time}_${a.id}`.localeCompare(`${b.date}_${b.time}_${b.id}`)
  );

  sorted.forEach((t) => {
    const p = Number(t.pnlUsd) || 0;
    netPnl += p;
    sumR += Number(t.rr) || 0;
    if (p > 0) {
      wins += 1;
      grossWin += p;
    } else if (p < 0) {
      grossLoss += Math.abs(p);
    }
  });

  const pf =
    grossLoss > 0 ? +(grossWin / grossLoss).toFixed(2) : grossWin > 0 ? 9.99 : 0;

  const sigRows = sorted
    .slice(0, 100)
    .map((t) => `${t.id}:${t.date}:${t.dir}:${Number(t.entry).toFixed(2)}:${Number(t.pnlUsd).toFixed(2)}`)
    .join(';');

  return {
    tradesCount: count,
    winRatePct: +((wins / count) * 100).toFixed(1),
    netPnlUsd: +netPnl.toFixed(2),
    avgR: +(sumR / count).toFixed(2),
    profitFactor: pf,
    canonicalDigestInput: `${account?.login || 'PORT'}|${account?.brokerServer || 'MT5'}|${count}|${netPnl.toFixed(2)}|${sigRows}`,
  };
}

export async function computeSha256Hex(input: string): Promise<string> {
  const clean = String(input || '');
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const encoded = new TextEncoder().encode(clean);
    const buf = await globalThis.crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Pure JS deterministic fallback (only for environments without crypto.subtle)
  let h1 = 0xdeadbeef ^ clean.length;
  let h2 = 0x41c6ce57 ^ clean.length;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, '0') +
    (h2 >>> 0).toString(16).padStart(8, '0')
  ).repeat(4);
}

// =========================================================================
// 5. LIVE BRIDGE (.mq5) SOURCE CODE & API KEY GENERATOR
// =========================================================================
export function generateLiveBridgeApiKey(portId: string): string {
  const cleanPort = (portId || 'port').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'port';
  const rand =
    typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function'
      ? Array.from(globalThis.crypto.getRandomValues(new Uint8Array(8)))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
      : (Date.now().toString(16) + Math.random().toString(16).slice(2)).slice(0, 16);
  return `trd_live_${cleanPort}_${rand}`;
}

export function generateTredynLiveBridgeMq5(params: {
  endpointUrl: string;
  apiKey: string;
  symbolFilter?: string;
}): string {
  const url = params.endpointUrl || 'https://YOUR_DOMAIN/api/mt5/live-bridge/ingest';
  const key = params.apiKey || 'trd_live_port1_replace_me';
  const sym = params.symbolFilter || 'XAUUSD';

  return `//+------------------------------------------------------------------+
//|                                            TredynLiveBridge.mq5  |
//|         TallyNX Desk v4.0 — Prop-Safe Read-Only Telemetry Bridge |
//|   1) Tools -> Options -> Expert Advisors -> Allow WebRequest     |
//|   2) Add URL: ${url}
//+------------------------------------------------------------------+
#property copyright "TallyNX Desk"
#property version   "4.00"
#property strict

input string InpBridgeUrl   = "${url}";
input string InpApiKey      = "${key}";
input string InpSymbolWatch = "${sym}";
input int    InpIntervalSec = 10;
input int    InpLookbackDay = 30;

datetime g_lastSync = 0;

string EscapeJson(string s) {
   StringReplace(s, "\\\\", "\\\\\\\\");
   StringReplace(s, "\\"", "\\\\\\"");
   return s;
}

string BuildHistoryJson() {
   datetime toTime   = TimeCurrent() + 86400;
   datetime fromTime = TimeCurrent() - (InpLookbackDay * 86400);
   HistorySelect(fromTime, toTime);

   string dealsJson = "[";
   int total = HistoryDealsTotal();
   bool first = true;
   for(int i = 0; i < total; i++) {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;
      long entryType = HistoryDealGetInteger(ticket, DEAL_ENTRY);
      long dealType  = HistoryDealGetInteger(ticket, DEAL_TYPE);
      if(dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL) continue;
      if(entryType != DEAL_ENTRY_OUT && entryType != DEAL_ENTRY_OUT_BY) continue;

      string sym     = HistoryDealGetString(ticket, DEAL_SYMBOL);
      long posId     = HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
      double vol     = HistoryDealGetDouble(ticket, DEAL_VOLUME);
      double price   = HistoryDealGetDouble(ticket, DEAL_PRICE);
      double comm    = HistoryDealGetDouble(ticket, DEAL_COMMISSION);
      double swap    = HistoryDealGetDouble(ticket, DEAL_SWAP);
      double profit  = HistoryDealGetDouble(ticket, DEAL_PROFIT);
      string comment = EscapeJson(HistoryDealGetString(ticket, DEAL_COMMENT));
      long closeTs   = (long)HistoryDealGetInteger(ticket, DEAL_TIME);
      string dir     = (dealType == DEAL_TYPE_SELL) ? "BUY" : "SELL";

      if(!first) dealsJson += ",";
      first = false;
      dealsJson += StringFormat(
         "{\\"ticket\\":\\"%I64d\\",\\"symbol\\":\\"%s\\",\\"dir\\":\\"%s\\",\\"openTime\\":%I64d,\\"closeTime\\":%I64d,\\"volume\\":%.2f,\\"openPrice\\":%.2f,\\"closePrice\\":%.2f,\\"commission\\":%.2f,\\"swap\\":%.2f,\\"rawProfit\\":%.2f,\\"comment\\":\\"%s\\"}",
         posId > 0 ? posId : (long)ticket, sym, dir, closeTs - 60, closeTs, vol, price, price, comm, swap, profit, comment
      );
   }
   dealsJson += "]";

   double balance  = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity   = AccountInfoDouble(ACCOUNT_EQUITY);
   double floating = AccountInfoDouble(ACCOUNT_PROFIT);
   long   login    = AccountInfoInteger(ACCOUNT_LOGIN);
   string server   = EscapeJson(AccountInfoString(ACCOUNT_SERVER));
   string company  = EscapeJson(AccountInfoString(ACCOUNT_COMPANY));
   string name     = EscapeJson(AccountInfoString(ACCOUNT_NAME));

   return StringFormat(
      "{\\"apiKey\\":\\"%s\\",\\"meta\\":{\\"holderName\\":\\"%s\\",\\"login\\":\\"%I64d\\",\\"broker\\":\\"%s\\",\\"server\\":\\"%s\\",\\"initialDeposit\\":%.2f,\\"equity\\":%.2f,\\"floating\\":%.2f},\\"positions\\":%s}",
      InpApiKey, name, login, company, server, balance, equity, floating, dealsJson
   );
}

void PushBridgeSnapshot() {
   string json = BuildHistoryJson();
   char postData[];
   char result[];
   string resultHeaders;
   StringToCharArray(json, postData, 0, StringLen(json), CP_UTF8);
   string headers = "Content-Type: application/json\\r\\nX-Bridge-Key: " + InpApiKey + "\\r\\n";
   int res = WebRequest("POST", InpBridgeUrl, headers, 6000, postData, result, resultHeaders);
   if(res == -1) {
      Print("[TredynLiveBridge] WebRequest failed. Add URL to Tools->Options->Expert Advisors.");
   }
}

int OnInit() {
   EventSetTimer(MathMax(5, InpIntervalSec));
   PushBridgeSnapshot();
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason) {
   EventKillTimer();
}

void OnTimer() {
   PushBridgeSnapshot();
}

void OnTick() {
   if(TimeCurrent() - g_lastSync >= InpIntervalSec) {
      g_lastSync = TimeCurrent();
      PushBridgeSnapshot();
   }
}
`;
}
