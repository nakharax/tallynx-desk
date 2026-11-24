import type { Mt5PositionRecord, TradeRecord } from '../types/ghr.ts';
import { PROP_FIRM_CATALOG } from './propFirmCatalog.ts';

const BANGKOK_OFFSET_MS = 7 * 60 * 60_000;
const COOLDOWN_MS = 900_000;
const OVERSIZE_MULTIPLIER = 1.5;
const BOOTSTRAP_SEED = 20261124;
const SESSIONS = ['ASIA', 'LONDON', 'NEW_YORK'] as const;

export const AUTOPSY_CHALLENGE_MODEL = {
  runs: 1_000,
  targetPct: 8,
  dailyLossLimitPct: 5,
  overallLossLimitPct: 10,
  closeCallThresholdPct: 80,
} as const;

export type AutopsySession = (typeof SESSIONS)[number];

export interface AutopsySessionStats {
  count: number;
  winRatePct: number;
  netPnlUsd: number;
  expectancyUsd: number;
}

export interface StatementAutopsy {
  actualNetPnlUsd: number;
  preventableTiltLossUsd: number;
  counterfactualNetPnlUsd: number;
  tiltTradeCount: number;
  flaggedTickets: string[];
  equityCurve: Array<{
    step: number;
    label: string;
    actualEquity: number;
    disciplinedEquity: number;
    isTilt: boolean;
  }>;
  worstDailyLossUsd: number;
  worstDailyLossPct: number;
  bestDayUsd: number;
  bestDaySharePct: number | null;
  consistencyBreached: boolean;
  consistencyCapPct: number | null;
  closeCallWarningCount: number;
  sessions: Record<AutopsySession, AutopsySessionStats>;
  worstSession: AutopsySession | null;
  monteCarlo: {
    currentRuinPct: number;
    reducedRiskRuinPct: number;
    currentPassRatePct: number;
    reducedRiskPassRatePct: number;
  };
}

type AutopsyTrade = Pick<Mt5PositionRecord, 'ticket' | 'openTs' | 'closeTs' | 'volume' | 'netProfit'>;

function fromBangkokTime(date: string, time: string): number {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time?.trim() ?? '');
  if (!match || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
  const local = `${date}T${match[1].padStart(2, '0')}:${match[2]}:${match[3] ?? '00'}`;
  const ms = Date.parse(`${local}+07:00`);
  return Number.isFinite(ms) && new Date(ms + BANGKOK_OFFSET_MS).toISOString().startsWith(local) ? ms : NaN;
}

function hasTimestamp(ms: number): boolean {
  return ms > 0 && ms <= 8.64e15 - BANGKOK_OFFSET_MS;
}

function getTiltTrades(closes: AutopsyTrade[]): Set<AutopsyTrade> {
  const lots = closes.map(({ volume }) => volume).filter((lot) => Number.isFinite(lot) && lot > 0).sort((a, b) => a - b);
  const middle = Math.floor(lots.length / 2);
  const medianLot = lots.length ? (lots[middle] + lots[Math.floor((lots.length - 1) / 2)]) / 2 : 0;
  const opens = closes.filter(({ openTs, closeTs }) => hasTimestamp(openTs) && openTs <= closeTs)
    .sort((a, b) => a.openTs - b.openTs);
  const flagged = new Set<AutopsyTrade>();
  let closeIndex = 0;
  let lastLossAt = -Infinity;
  let lastOpenAt = -Infinity;
  let firstEntryAfterLoss = false;

  for (const trade of opens) {
    if (trade.openTs !== lastOpenAt) {
      const previousCloseIndex = closeIndex;
      while (closeIndex < closes.length) {
        const closed = closes[closeIndex];
        // A close at the same timestamp is observable only if that position was already open.
        if (closed.closeTs > trade.openTs || (closed.closeTs === trade.openTs && !(closed.openTs < trade.openTs))) break;
        if (closed.netProfit < 0) lastLossAt = closed.closeTs;
        closeIndex++;
      }
      firstEntryAfterLoss = closeIndex > previousCloseIndex && closes[closeIndex - 1].netProfit < 0;
      lastOpenAt = trade.openTs;
    }

    const insideCooldown = trade.openTs - lastLossAt <= COOLDOWN_MS;
    const oversized = medianLot > 0 && Number.isFinite(trade.volume)
      && trade.volume / medianLot >= OVERSIZE_MULTIPLIER - Number.EPSILON;
    if (insideCooldown || (firstEntryAfterLoss && oversized)) flagged.add(trade);
  }
  return flagged;
}

function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), seed | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function simulateChallenge(pnls: number[], tradesPerDay: number[], balance: number): StatementAutopsy['monteCarlo'] {
  const { runs, targetPct, dailyLossLimitPct, overallLossLimitPct } = AUTOPSY_CHALLENGE_MODEL;
  const random = mulberry32(BOOTSTRAP_SEED);
  const target = balance * targetPct / 100;
  const dailyLimit = balance * dailyLossLimitPct / 100;
  const overallLimit = balance * overallLossLimitPct / 100;
  const scales = [1, 0.5];
  const ruinCounts = [0, 0];
  const passCounts = [0, 0];

  if (balance > 0 && pnls.length > 0) {
    for (let run = 0; run < runs; run++) {
      const totalPnl = [0, 0];
      const finished = [false, false];

      for (const count of tradesPerDay) {
        const dayPnl = [0, 0];
        for (let trade = 0; trade < count && !(finished[0] && finished[1]); trade++) {
          // Both risk levels use the same bootstrap draws and the observed trading-day lengths.
          const pnl = pnls[Math.floor(random() * pnls.length)];
          for (let risk = 0; risk < scales.length; risk++) {
            if (finished[risk]) continue;
            const scaledPnl = pnl * scales[risk];
            dayPnl[risk] += scaledPnl;
            totalPnl[risk] += scaledPnl;
            if (dayPnl[risk] <= -dailyLimit || totalPnl[risk] <= -overallLimit) {
              ruinCounts[risk]++;
              finished[risk] = true;
            } else if (totalPnl[risk] >= target) {
              passCounts[risk]++;
              finished[risk] = true;
            }
          }
        }
        if (finished[0] && finished[1]) break;
      }
    }
  }

  return {
    currentRuinPct: ruinCounts[0] * 100 / runs,
    reducedRiskRuinPct: ruinCounts[1] * 100 / runs,
    currentPassRatePct: passCounts[0] * 100 / runs,
    reducedRiskPassRatePct: passCounts[1] * 100 / runs,
  };
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

function analyzeTrades(input: AutopsyTrade[], initialBalance: number, firmId?: string): StatementAutopsy {
  const balance = Number.isFinite(initialBalance) && initialBalance > 0 ? initialBalance : 0;
  const closes = input.filter(({ closeTs, netProfit }) => hasTimestamp(closeTs) && Number.isFinite(netProfit))
    .sort((a, b) => a.closeTs - b.closeTs || (a.openTs || Infinity) - (b.openTs || Infinity)
      || (a.ticket < b.ticket ? -1 : Number(a.ticket > b.ticket)));
  const tilt = getTiltTrades(closes);
  const flaggedTickets: string[] = [];
  const equityCurve: StatementAutopsy['equityCurve'] = [
    { step: 0, label: 'Start', actualEquity: balance, disciplinedEquity: balance, isTilt: false },
  ];
  const days = new Map<string, { pnl: number; lowestPnl: number; count: number }>();
  const sessionTotals = {
    ASIA: { count: 0, wins: 0, pnl: 0 },
    LONDON: { count: 0, wins: 0, pnl: 0 },
    NEW_YORK: { count: 0, wins: 0, pnl: 0 },
  };
  let actualNet = 0;
  let counterfactualNet = 0;
  let tiltLoss = 0;

  for (const trade of closes) {
    const isTilt = tilt.has(trade);
    actualNet += trade.netProfit;
    if (isTilt) {
      flaggedTickets.push(trade.ticket);
      tiltLoss += Math.max(0, -trade.netProfit);
    } else {
      counterfactualNet += trade.netProfit;
    }

    const bangkok = new Date(trade.closeTs + BANGKOK_OFFSET_MS);
    const localIso = bangkok.toISOString();
    const date = localIso.slice(0, 10);
    const hour = bangkok.getUTCHours();
    const session = sessionTotals[hour < 6 || hour >= 20 ? 'NEW_YORK' : hour < 14 ? 'ASIA' : 'LONDON'];
    session.count++;
    session.wins += Number(trade.netProfit > 0);
    session.pnl += trade.netProfit;

    const day = days.get(date) ?? { pnl: 0, lowestPnl: 0, count: 0 };
    day.pnl += trade.netProfit;
    day.lowestPnl = Math.min(day.lowestPnl, roundMoney(day.pnl));
    day.count++;
    days.set(date, day);

    equityCurve.push({
      step: equityCurve.length,
      label: `${date} ${localIso.slice(11, 16)}`,
      actualEquity: roundMoney(balance + actualNet),
      disciplinedEquity: roundMoney(balance + counterfactualNet),
      isTilt,
    });
  }

  const sessions = {} as StatementAutopsy['sessions'];
  let worstSession: AutopsySession | null = null;
  for (const session of SESSIONS) {
    const { count, wins, pnl } = sessionTotals[session];
    sessions[session] = {
      count,
      winRatePct: count ? wins * 100 / count : 0,
      netPnlUsd: roundMoney(pnl),
      expectancyUsd: count ? roundMoney(pnl / count) : 0,
    };
    if (count && (!worstSession || pnl < sessionTotals[worstSession].pnl)) worstSession = session;
  }

  const { dailyLossLimitPct, closeCallThresholdPct } = AUTOPSY_CHALLENGE_MODEL;
  const dailyLimit = balance * dailyLossLimitPct / 100;
  const tradesPerDay: number[] = [];
  let worstDailyLossUsd = 0;
  let closeCallWarningCount = 0;
  let bestDayUsd = 0;
  for (const { pnl, lowestPnl, count } of days.values()) {
    const loss = Math.abs(lowestPnl);
    worstDailyLossUsd = Math.max(worstDailyLossUsd, loss);
    bestDayUsd = Math.max(bestDayUsd, roundMoney(pnl));
    tradesPerDay.push(count);
    if (loss >= dailyLimit * closeCallThresholdPct / 100 && loss < dailyLimit) closeCallWarningCount++;
  }

  const actualNetPnlUsd = roundMoney(actualNet);
  const bestDaySharePct = actualNetPnlUsd > 0 ? bestDayUsd * 100 / actualNetPnlUsd : null;
  const consistencyCapPct = PROP_FIRM_CATALOG.find(({ id }) => id === firmId)?.consistencyCapPct ?? null;

  return {
    actualNetPnlUsd,
    preventableTiltLossUsd: roundMoney(tiltLoss),
    counterfactualNetPnlUsd: roundMoney(counterfactualNet),
    tiltTradeCount: tilt.size,
    flaggedTickets,
    equityCurve,
    worstDailyLossUsd,
    worstDailyLossPct: balance > 0 ? worstDailyLossUsd * 100 / balance : 0,
    bestDayUsd,
    bestDaySharePct,
    consistencyBreached: bestDaySharePct !== null && consistencyCapPct !== null && bestDaySharePct > consistencyCapPct,
    consistencyCapPct,
    closeCallWarningCount,
    sessions,
    worstSession,
    monteCarlo: simulateChallenge(closes.map(({ netProfit }) => netProfit), tradesPerDay, balance),
  };
}

export function analyzeStatementAutopsy(positions: readonly Mt5PositionRecord[], initialBalance: number, firmId?: string): StatementAutopsy {
  return analyzeTrades(positions.map((position) => ({
    ticket: position.ticket,
    volume: position.volume,
    netProfit: position.netProfit,
    openTs: hasTimestamp(position.openTs) ? position.openTs : fromBangkokTime(position.openDate, position.openTime),
    closeTs: hasTimestamp(position.closeTs) ? position.closeTs : fromBangkokTime(position.closeDate, position.closeTime),
  })), initialBalance, firmId);
}

export function analyzeTradeRecordsAutopsy(records: readonly TradeRecord[], initialBalance: number, firmId?: string): StatementAutopsy {
  return analyzeTrades(records.map((record) => {
    // Journal rows have one recorded time. Use it for both sides of the replay.
    const timestamp = fromBangkokTime(record.date, record.time);
    return {
      ticket: record.id,
      openTs: timestamp,
      closeTs: timestamp,
      volume: record.calculatorDetails?.totalLot ?? record.lotLeg,
      netProfit: record.pnlUsd,
    };
  }), initialBalance, firmId);
}

export function buildSampleBrokenChallengePositions(): { initialBalance: number; firmId: string; positions: Mt5PositionRecord[] } {
  const trades = [
    ['09', '09:10', '09:48', 'BUY', 0.5, 450, 2642.30],
    ['09', '15:00', '15:37', 'SELL', 0.5, 590, 2658.90],
    ['09', '21:15', '21:46', 'BUY', 0.5, -400, 2651.20],
    ['09', '21:54', '22:08', 'BUY', 1, -660, 2644.10],
    ['10', '09:12', '10:02', 'BUY', 0.5, 680, 2635.90],
    ['10', '15:17', '16:00', 'SELL', 0.5, 670, 2652.40],
    ['11', '15:40', '16:15', 'SELL', 0.5, 100, 2639.80],
    ['11', '20:38', '21:08', 'BUY', 0.5, -850, 2642.20],
    ['11', '21:18', '21:27', 'BUY', 1, -1350, 2627.60],
    ['12', '09:03', '09:38', 'SELL', 0.5, 490, 2618.50],
    ['12', '15:04', '15:51', 'BUY', 0.5, 550, 2611.10],
    ['12', '20:25', '20:46', 'SELL', 0.5, -500, 2624.70],
    ['12', '20:57', '21:12', 'SELL', 1, -850, 2634.00],
    ['13', '08:24', '09:50', 'BUY', 0.5, 1050, 2641.50],
    ['13', '15:12', '16:30', 'BUY', 0.5, 1090, 2665.60],
    ['13', '20:20', '21:38', 'BUY', 0.5, 1130, 2693.40],
    ['16', '14:31', '16:13', 'SELL', 0.5, 790, 2712.10],
    ['17', '08:55', '10:17', 'BUY', 0.5, 770, 2695.90],
  ] as const;

  const positions = trades.map(([day, openTime, closeTime, dir, volume, netProfit, openPrice], index) => {
    const date = `2026-11-${day}`;
    const direction = dir === 'BUY' ? 1 : -1;
    const commission = -7 * volume;
    const rawProfit = netProfit - commission;
    const closePrice = roundMoney(openPrice + direction * rawProfit / (100 * volume));
    return {
      ticket: `SAMPLE-${index + 1}`,
      symbol: 'XAUUSD',
      dir,
      openDate: date,
      openTime,
      openTs: fromBangkokTime(date, openTime),
      closeDate: date,
      closeTime,
      closeTs: fromBangkokTime(date, closeTime),
      volume,
      openPrice,
      slPrice: netProfit < 0 ? closePrice : roundMoney(openPrice - direction * 6.5),
      tpPrice: netProfit > 0 ? closePrice : roundMoney(openPrice + direction * 14),
      closePrice,
      commission,
      swap: 0,
      rawProfit,
      netProfit,
      comment: netProfit < 0 ? 'Stop loss' : 'Take profit',
    };
  });
  return { initialBalance: 50_000, firmId: 'fundednext', positions };
}
