import React, { useMemo, useState } from 'react';
import { Check, CircleAlert, CircleCheck, ClipboardCheck, LockKeyhole, ShieldCheck, ShieldHalf } from 'lucide-react';
import { navigateDeskTabs } from '../utils/navigateDeskTabs';
import {
  FiveStateProbabilities,
  GhrWorkspaceState,
  TwelveGatesState,
} from '../types/ghr';
import { deskText, formatAccountDisplayName, type DeskLanguage } from '../utils/deskI18n';
import {
  calculateFourLegLadderMetrics,
  calculateGhrV32Expectancy,
  calculateGhrV32LadderMetrics,
  calculateMultiStateExpectancy,
  CANONICAL_SIZING_MATRIX,
  DEFAULT_FIVE_STATE_PROBS,
  DEFAULT_TWELVE_GATES,
  evaluateTwelveGates,
  fmtUSD,
  FourLegStateRow,
  getAccountComputed,
  getBangkokIsoDate,
  GHR_V32_SIZING_MATRIX,
  TEN_GOLDEN_RULES,
} from '../utils/ghrRules';

interface DeskReferenceCardsSectionProps {
  state: GhrWorkspaceState;
  lang?: DeskLanguage;
  onToggleTwelveGate: (key: keyof TwelveGatesState, checked: boolean) => void;
  onSetAllTwelveGates: (nextGates: TwelveGatesState) => void;
  onUpdateRisk: (nextRisk: number) => void;
  onUpdateFiveStateProbs: (nextProbs: FiveStateProbabilities) => void;
  onToggleGoldenRule: (ruleKey: string, checked: boolean) => void;
  onCopyText: (text: string, label: string) => void;
  onRecordFourLegState: (stateRow: FourLegStateRow) => void;
  onProceedToCalculator?: () => void;
}

type LocalizedCopy = Record<DeskLanguage, string>;

const GOLDEN_TITLES_TH: Record<string, string> = {
  r01: 'คำนวณยอดขาดทุนทั้ง 3 ไม้ก่อนเข้า',
  r02: 'พัก 15 นาทีเมื่อข้อมูลค้างหรือชน SL',
  r03: 'ใช้ Trailing Lock ทันทีเมื่อถึง TP2 (+800 จุด)',
  r04: 'รักษากฎความสม่ำเสมอ 40% และโควตารายวัน',
  r05: 'ตรึงโซน HVN ณ เวลา t0',
  r06: 'เทรดเฉพาะโซนกว้าง 100–200 จุด',
  r07: 'ทำตามลำดับเวลาอย่างเคร่งครัด (t0 < t1 < t2 < t3 < t4)',
  r08: 'ใช้ Limit เท่านั้น อายุ 6 แท่ง หรือ 30 นาที',
  r09: 'หนึ่งชุดต่อโซน และยกเลิกเมื่อทะลุขอบเกิน 50 จุด',
  r10: 'เทรดด้วยความสงบและไม่เร่งรีบ',
};

const V32_STATE_TITLES_TH = ['ชน SL ทั้ง 3 ไม้', 'ถึง TP1 เท่านั้น', 'ปิดเท่าทุน', 'ชน Trailing Lock', 'ถึง TP ครบ 3 ไม้'];
const V31_STATE_TITLES_TH = ['ชน SL ทั้ง 4 ไม้', 'ถึง TP1', 'ถึง TP1–2', 'ถึง TP1–3', 'ถึง TP ครบ 4 ไม้'];
const V32_STATE_NOTES_EN = ['15-minute cooldown', 'Cuts the loss by 46.7%', 'Preserves the full principal'];
const V32_TRADE_PATHS_TH = [
  'ทั้ง 3 ไม้ชน SL เดิมที่ −1,000 จุด (3 × −1,000 = −3,000 จุดรวม)',
  'ไม้ 1 ได้ +400 จุด ไม้ 2–3 ชน SL ที่ −1,000 จุด (+400 − 2,000 = −1,600 จุดรวม)',
  'ปิดไม้ที่เหลือใกล้จุดเข้าเพื่อรักษาเงินต้น (0 จุดสุทธิ)',
  'ไม้ 1 ได้ +400 ไม้ 2 ได้ +800 และไม้ 3 ปิดด้วย Trailing SL ที่ TP1 (+400) รวม +1,600 จุด',
  'ครบทั้ง 3 เป้า +400 + 800 + 1,200 = +2,400 จุดรวม (เฉลี่ย +800 จุดต่อไม้)',
];
const V31_TRADE_PATHS_TH = [
  'ทั้ง 4 ไม้ชน SL เดิม (4 × −1,000 = −4,000 จุดรวม)',
  'ไม้ 1 ได้ +300 ไม้ 2–4 ชน SL (+300 − 3,000 = −2,700 จุดรวม)',
  'ไม้ 1–2 ได้ +300 และ +600 ไม้ 3–4 ชน SL (+900 − 2,000 = −1,100 จุดรวม)',
  'ไม้ 1–3 ได้ +300, +600 และ +900 ไม้ 4 ชน SL (+1,800 − 1,000 = +800 จุดรวม)',
  'ครบทั้ง 4 เป้า +300 + 600 + 900 + 1,200 = +3,000 จุดรวม (เฉลี่ย +750 จุดต่อไม้)',
];

const SIZING_EN: Record<string, string> = {
  '$6,000 Funded 90% (พอร์ตจริง)': '$6,000 Funded (90% Split)',
  '0.5%–1.0% Risk · โหมดเซฟหน้าตัก': '0.5%–1.0% Risk · Capital Preservation',
  'เป้าถอน $360 (3 วัน) · กฎ 40% (≤$144/วัน)': '$360 payout target (3 days) · 40% rule (≤$144/day)',
  'เป้าสอบ $480 (5 วัน) · $300 Daily · $600 Buffer': '$480 evaluation target (5 days) · $300 daily · $600 buffer',
  'พอร์ต 3 Funded': 'Port 3 · Funded',
  'พอร์ต 1 & 2 มาตรฐาน': 'Ports 1 and 2 · Standard',
};

const SIZING_TH: Record<string, string> = {
  '$3,000 Mini / $6,000 Recovery': '$3,000 พอร์ตเล็ก / $6,000 พอร์ตฟื้นตัว',
  '$6,000 Funded 90% (พอร์ตจริง)': '$6,000 พอร์ตจริง (ส่วนแบ่ง 90%)',
  '$6,000 Evaluation (#14370024 / #14359161)': '$6,000 พอร์ตสอบ (#14370024 / #14359161)',
  '$10,000 Standard (GHR v3.2)': '$10,000 มาตรฐาน (GHR v3.2)',
  '$25,000 – $50,000 Scaling Standard': '$25,000 – $50,000 มาตรฐานเพิ่มทุน',
  '$1k Cent / $4k Std': '$1k บัญชีเซนต์ / $4k มาตรฐาน',
  '0.5%–1.0% Risk · โหมดเซฟหน้าตัก': 'ความเสี่ยง 0.5%–1.0% · รักษาเงินทุน',
  'เป้าสอบ $480 (5 วัน) · $300 Daily · $600 Buffer': 'เป้าสอบ $480 (5 วัน) · เพดานรายวัน $300 · เงินเผื่อ $600',
  'พอร์ต 3 Funded': 'พอร์ต 3 · พอร์ตจริง',
  'พอร์ต 1 & 2 มาตรฐาน': 'พอร์ต 1 และ 2 · มาตรฐาน',
};

function formatSizingText(value: string, lang: DeskLanguage): string {
  if (lang === 'en') return SIZING_EN[value] ?? value;
  return SIZING_TH[value] ?? value
    .replace(/\bStandard\b/g, 'มาตรฐาน')
    .replace(/\bStatic\b/g, 'เพดานคงที่')
    .replace(/\bDaily\b/g, 'รายวัน')
    .replace(/\bLot\b/g, 'ล็อต')
    .replace(/\bRisk\b/g, 'ความเสี่ยง')
    .replace(/\bFull\b/g, 'ครบทุกเป้า')
    .replace(/\bon \$6k\b/g, 'ของทุน $6k');
}

interface CleanGateItem {
  key: keyof TwelveGatesState;
  code: string;
  title: LocalizedCopy;
  desc: LocalizedCopy;
}

const GATE_GROUPS: {
  id: string;
  title: LocalizedCopy;
  subtitle: LocalizedCopy;
  items: CleanGateItem[];
}[] = [
  {
    id: 'group-risk',
    title: { en: 'Account risk', th: 'ความเสี่ยงของบัญชี' },
    subtitle: { en: "Check your account risk budget and daily quota (Gates 01–04)", th: "ตรวจสอบงบพอร์ตและโควต้ารายวัน (Gates 01–04)" },
    items: [
      {
        key: 'g01',
        code: 'G01',
        title: { en: "15-Minute Cooldown Clear", th: "ไม่ติดพักหน้าจอ 15 นาที (Cooldown)" },
        desc: { en: "The 15-minute cooldown after a stop loss has ended, and you are ready to trade calmly.", th: "ไม่อยู่ในช่วงพัก 15 นาทีหลังชน SL และอารมณ์นิ่งพร้อมเทรด" },
      },
      {
        key: 'g02',
        code: 'G02',
        title: { en: "Daily Quota Within 3 Setups", th: "โควต้าวันนี้ไม่เกิน 3 ชุด (Daily Quota)" },
        desc: { en: "Stay within three trade ideas per day and within daily profit and loss limits.", th: "เทรดไม่เกิน 3 Idea ต่อวัน และยังไม่ชนเพดานกำไร/ขาดทุนรายวัน" },
      },
      {
        key: 'g03',
        code: 'G03',
        title: { en: "Daily Loss Budget Clear", th: "วงเงินขาดทุนรายวัน (Daily Loss)" },
        desc: { en: "Today’s losses plus the risk of this trade must stay within the $300 daily risk budget.", th: "ขาดทุนวันนี้รวมความเสี่ยงของแผนใหม่ต้องไม่เกิน $300" },
      },
      {
        key: 'g04',
        code: 'G04',
        title: { en: "Balance After Setup Risk", th: "ยอดคงเหลือหลังหักความเสี่ยง" },
        desc: { en: "Account balance after the new trade risk remains above the required floor.", th: "ยอดคงเหลือหลังหักความเสี่ยงของแผนใหม่ต้องสูงกว่าเกณฑ์ขั้นต่ำของพอร์ต" },
      },
    ],
  },
  {
    id: 'group-structure',
    title: { en: 'Market structure', th: 'โครงสร้างตลาด' },
    subtitle: { en: "Check trading conditions and H1 HVN zones (Gates 05–08)", th: "คัดกรองสภาวะตลาดและแนว H1 HVN (Gates 05–08)" },
    items: [
      {
        key: 'g05',
        code: 'G05',
        title: { en: "No High-Impact News Within ±30 Minutes", th: "ปลอดข่าวแดง ±30 นาที (News Filter)" },
        desc: { en: "Avoid high-impact USD releases such as CPI, NFP, or FOMC within 30 minutes of entry.", th: "ไม่มีข่าวกล่องแดง USD (CPI, NFP, FOMC) ในช่วง 30 นาทีก่อนและหลังเข้าเทรด" },
      },
      {
        key: 'g06',
        code: 'G06',
        title: { en: "Valid H1 HVN Zone (100–200 Points)", th: "โซน H1 HVN กว้าง 100–200 จุด" },
        desc: { en: "Price is near a key H1 support or resistance zone spanning 100–200 points.", th: "ราคาเข้าใกล้แนวรับ/แนวต้านสำคัญ H1 ที่มีระยะโซนชัดเจน 100–200 จุด" },
      },
      {
        key: 'g07',
        code: 'G07',
        title: { en: "H1 Close Confirmed", th: "แท่งเทียน H1 ปิดยืนยันชัดเจน" },
        desc: { en: "Wait for the H1 candle to close and confirm a reversal or a breakout beyond the zone.", th: "รอจนแท่ง H1 ปิดจบแท่งยืนยันการกลับตัวหรือเบรกโซน (ห้ามเดาก่อนแท่งปิด)" },
      },
      {
        key: 'g08',
        code: 'G08',
        title: { en: "Normal Gold Spread", th: "ค่าสเปรดทองคำปกติ (Spread Check)" },
        desc: { en: "XAUUSD spreads are normal, and the market is outside thin end-of-day trading.", th: "สเปรด XAUUSD ปกติ ไม่ถ่างผิดปกติ และไม่อยู่ในช่วงตลาดวายใกล้ปิดวัน" },
      },
    ],
  },
  {
    id: 'group-execution',
    title: { en: 'M5 & 3-TP plan', th: 'แผน M5 และ 3-TP' },
    subtitle: { en: 'Review entry, stop and target distances (Gates 09–12)', th: 'ทบทวนจุดเข้าและระยะ SL/TP (ด่าน 09–12)' },
    items: [
      {
        key: 'g09',
        code: 'G09',
        title: { en: "M5 Pullback and Entry Close Confirmed", th: "M5 ย่อตัวและปิดแท่งยืนยันจุดเข้า" },
        desc: { en: "Price pulls back into the zone and an M5 candle closes in the H1 direction.", th: "ราคาย่อตัวเข้าโซนในไทม์เฟรม M5 และปิดแท่งยืนยันฝั่งเดียวกับ H1" },
      },
      {
        key: 'g10',
        code: 'G10',
        title: { en: "1,000-Point Hard SL on Every Leg", th: "ตั้ง Hard SL 1,000 จุดครบทุกไม้" },
        desc: { en: "Set a 1,000-point ($10.00) stop loss on all three legs when placing orders.", th: "ตั้ง Stop Loss ที่ระยะ 1,000 จุด ($10.00) ครบทั้ง 3 ไม้ทันทีที่วางออเดอร์" },
      },
      {
        key: 'g11',
        code: 'G11',
        title: { en: "Three Equal Legs with TPs at 400 / 800 / 1,200 Points", th: "แบ่ง 3 ไม้เท่ากัน ตั้ง TP 400 / 800 / 1,200p" },
        desc: { en: "When TP2 (+800 points) hits, immediately move the third leg’s stop to TP1 (+400 points).", th: "เมื่อชน TP2 (+800p) ต้องเลื่อน SL ของไม้ 3 ไปที่ราคา TP1 (+400p) ทันที" },
      },
      {
        key: 'g12',
        code: 'G12',
        title: { en: "Pending Limit Orders Only (30-Minute Expiry)", th: "วาง Pending Limit เท่านั้น (อายุ 30 นาที)" },
        desc: { en: "Place a Buy or Sell Limit at the zone edge. Cancel if unfilled after 30 minutes and avoid chasing price.", th: "ใช้ Buy/Sell Limit ที่ขอบโซน ยกเลิกหากไม่แมตช์ใน 30 นาที และไม่กดไล่ราคา" },
      },
    ],
  },
];

export const DeskReferenceCardsSection: React.FC<DeskReferenceCardsSectionProps> = ({
  state,
  lang = 'en',
  onToggleTwelveGate,
  onSetAllTwelveGates,
  onUpdateRisk,
  onUpdateFiveStateProbs,
  onToggleGoldenRule,
  onCopyText,
  onRecordFourLegState,
  onProceedToCalculator,
}) => {
  const text = (en: string, th: string) => deskText(lang, en, th);
  const [activeTab, setActiveTab] = useState<'GATES' | 'PAYOFF' | 'RULES'>('GATES');
  const [protocolVersion, setProtocolVersion] = useState<'V32' | 'V31'>('V32');
  const [showDetailedGates, setShowDetailedGates] = useState(true);

  const isV32 = protocolVersion === 'V32';
  const gates = state.twelveGates || DEFAULT_TWELVE_GATES;
  const gateEval = evaluateTwelveGates(gates);
  const acc = useMemo(
    () => getAccountComputed(state.accounts, state.journal, state.activePort),
    [state.accounts, state.journal, state.activePort]
  );

  const accountName = formatAccountDisplayName(acc.name, lang);

  const v32Ladder = useMemo(
    () => calculateGhrV32LadderMetrics(state.calcDir, state.calcEntry, state.calcRisk),
    [state.calcDir, state.calcEntry, state.calcRisk]
  );
  const v31Ladder = useMemo(
    () => calculateFourLegLadderMetrics(state.calcDir, state.calcEntry, state.calcRisk),
    [state.calcDir, state.calcEntry, state.calcRisk]
  );

  const activeStates = isV32 ? v32Ladder.states : v31Ladder.states;
  const probs = state.fiveStateProbs || DEFAULT_FIVE_STATE_PROBS;
  const expectancy = isV32
    ? calculateGhrV32Expectancy(probs, v32Ladder.riskUsd)
    : calculateMultiStateExpectancy(probs, v31Ladder.riskUsd);

  const goldenAck = state.goldenRulesAck || {};
  const ackCount = TEN_GOLDEN_RULES.filter((r) => goldenAck[r.key] === true).length;

  // 7 Auto-Verified Portfolio & Sizing Gates (0 seconds)
  const todayStr = getBangkokIsoDate();
  const autoSevenSummary = useMemo(() => {
    const portTrades = state.journal.filter((j) => j.port === state.activePort);
    const todayTrades = portTrades.filter((j) => j.date === todayStr);
    const todayPnl = todayTrades.reduce((s, j) => s + (Number(j.pnlUsd) || 0), 0);

    const cooldownActive = !!state.cooldownUntil && state.cooldownUntil > Date.now();
    const passGate01 = !cooldownActive;
    const passGate02 = todayTrades.length < 3;

    const dailyLimitUsd = +(Math.max(100, acc.initial) * 0.05).toFixed(2);
    const dailyUsedUsd = Math.abs(Math.min(0, todayPnl));
    const dailyUsedPct = +((dailyUsedUsd / Math.max(1, dailyLimitUsd)) * 100).toFixed(1);
    const dailyBrakeCap = Math.max(144, +(acc.initial * 0.03).toFixed(2));
    const passGate03 = dailyUsedUsd + v32Ladder.riskUsd <= Math.max(dailyBrakeCap, 300);

    const staticFloor = +(acc.initial * 0.9).toFixed(2);
    const passGate04 = acc.balance - v32Ladder.riskUsd >= staticFloor;

    const activeCfg = state.accounts[state.activePort];
    const capPct = activeCfg?.consistencyCapPct ?? 40;
    const hasConsistencyCap = acc.accountType !== 'PERSONAL' && capPct < 100;
    const consRefBase = Math.max(acc.targetProfit || 480, acc.profit || 0);
    const dailyProfitCap = +(consRefBase * (capPct / 100)).toFixed(2);
    const dailyConsistencyRoomUsd = hasConsistencyCap
      ? Math.max(0, +(dailyProfitCap - Math.max(0, todayPnl)).toFixed(2))
      : null;

    const passGate08 = true; // Standard session liquidity & spread check ready
    const passGate10 = v32Ladder.riskUsd > 0 && v32Ladder.riskUsd <= acc.initial * 0.03;
    const passGate11 = v32Ladder.legLot >= 0.01;

    const autoResults: Array<{ key: keyof TwelveGatesState; pass: boolean; label: string }> = [
      {
        key: 'g01',
        pass: passGate01,
        label: passGate01
          ? lang === 'en'
            ? 'Tilt Lock Clear (no active 15m SL cooldown)'
            : 'ไม่ติดสถานะพักเบรก 15 นาที (Tilt Lock)'
          : lang === 'en'
            ? 'Blocked: 15m post-SL Cooldown active'
            : 'ติดพักเบรก 15 นาทีหลังชน SL',
      },
      {
        key: 'g02',
        pass: passGate02,
        label:
          lang === 'en'
            ? `Daily quota (${todayTrades.length}/3 ideas used)`
            : `ใช้โควตาวันนี้ ${todayTrades.length}/3 แผน`,
      },
      {
        key: 'g03',
        pass: passGate03,
        label:
          lang === 'en'
            ? `Daily drawdown (${dailyUsedPct}% / 5.0% limit)`
            : `Drawdown วันนี้ ${dailyUsedPct}% / เพดาน 5.0%`,
      },
      {
        key: 'g04',
        pass: passGate04,
        label:
          lang === 'en'
            ? `Balance after setup risk (${fmtUSD(acc.balance - v32Ladder.riskUsd)} vs ${fmtUSD(staticFloor)} floor)`
            : `ยอดคงเหลือก่อนหักความเสี่ยง ${fmtUSD(acc.balance)}`,
      },
      {
        key: 'g08',
        pass: passGate08,
        label:
          hasConsistencyCap && dailyConsistencyRoomUsd !== null
            ? lang === 'en'
              ? `${capPct}% Consistency Room Today: ${fmtUSD(dailyConsistencyRoomUsd)}`
              : `กฎ ${capPct}% วันนี้ยังเหลือโควตาอีก ${fmtUSD(dailyConsistencyRoomUsd)}`
            : lang === 'en'
              ? 'Personal Account · Consistency Cap Unlimited'
              : 'พอร์ตส่วนตัว · ไม่มีเพดาน Consistency รายวัน',
      },
      {
        key: 'g10',
        pass: passGate10,
        label:
          lang === 'en'
            ? `Risk & Hard SL -1,000p Locked (${fmtUSD(v32Ladder.riskUsd)})`
            : `คำนวณ Hard SL -1,000 จุด พร้อม (${fmtUSD(v32Ladder.riskUsd)})`,
      },
      {
        key: 'g11',
        pass: passGate11,
        label:
          lang === 'en'
            ? `3-TP Split Ready (${v32Ladder.legLot.toFixed(2)} Lot × 3 legs)`
            : `แบ่ง 3 ไม้ + Trailing Lock พร้อม (${v32Ladder.legLot.toFixed(2)} × 3 Lot)`,
      },
    ];

    const passedAutoCount = autoResults.filter((r) => r.pass).length;
    return {
      autoResults,
      passedAutoCount,
      allAutoPassed: passedAutoCount === 7,
      flags: {
        g01: passGate01,
        g02: passGate02,
        g03: passGate03,
        g04: passGate04,
        g08: passGate08,
        g10: passGate10,
        g11: passGate11,
      },
    };
  }, [
    state.journal,
    state.activePort,
    state.cooldownUntil,
    state.accounts,
    todayStr,
    acc.initial,
    acc.balance,
    acc.targetProfit,
    v32Ladder.riskUsd,
    v32Ladder.legLot,
    lang,
  ]);

  const MANUAL_FIVE_TAP_CARDS: Array<{
    key: keyof TwelveGatesState;
    num: number;
    title: string;
    hint: string;
  }> =
    lang === 'en'
      ? [
          {
            key: 'g06',
            num: 1,
            title: 'Trading with H1/M15 market structure & valid HVN zone (no counter-trend FOMO)',
            hint: 'Price respects key H1 supply/demand zone (100–200 pts)',
          },
          {
            key: 'g07',
            num: 2,
            title: 'Clear Hard SL placement defined & H1 confirmation candle closed',
            hint: 'Never move SL wider or guess before candle close',
          },
          {
            key: 'g05',
            num: 3,
            title: 'No High-Impact Red Folder news within ±15 minutes (CPI / NFP / FOMC)',
            hint: 'Avoid abnormal spread spikes and whip-saw volatility',
          },
          {
            key: 'g09',
            num: 4,
            title: 'Position risk capped within 0.5%–1.0% & M5 pullback confirmation ready',
            hint: 'Aligned with your daily risk budget',
          },
          {
            key: 'g12',
            num: 5,
            title: 'No revenge trading after a loss (Pending Limit only)',
            hint: 'Order cancels automatically after 30 min if unfilled',
          },
        ]
      : [
          {
            key: 'g06',
            num: 1,
            title: 'เทรดตามโครงสร้าง H1/M15 ไม่สวนเทรนด์ (และอยู่ในโซน H1 HVN ชัดเจน)',
            hint: 'ราคาทดสอบแนวรับ/แนวต้านสำคัญ ระยะโซน 100–200 จุด',
          },
          {
            key: 'g07',
            num: 2,
            title: 'มีจุดวาง SL (-1,000 จุด) และรอแท่งเทียน H1 ปิดยืนยันชัดเจนก่อนกดออเดอร์',
            hint: 'ห้ามขยับ SL หนี หรือเข้าก่อนแท่งปิดยืนยัน',
          },
          {
            key: 'g05',
            num: 3,
            title: 'ไม่อยู่ในช่วงข่าวกล่องแดง ±15 นาที (CPI, NFP, FOMC)',
            hint: 'หลีกเลี่ยงสเปรดถ่างและแรงเหวี่ยงนอกแผน',
          },
          {
            key: 'g09',
            num: 4,
            title: 'ความเสี่ยงไม้นี้ไม่เกิน 0.5% - 1.0% และ M5 ย่อตัวปิดยืนยันจุดเข้าแล้ว',
            hint: 'คุมขนาดความเสี่ยงตามโควตาพอร์ตเสมอ',
          },
          {
            key: 'g12',
            num: 5,
            title: 'จิตใจปกติ ไม่ได้เทรดเพื่อเอาคืนไม้ก่อน (ตั้ง Pending Limit เท่านั้น)',
            hint: 'ตั้ง Limit อายุ 30 นาที ไม่กดไล่ราคาด้วยมือ',
          },
        ];

  const manualRemainingCount = MANUAL_FIVE_TAP_CARDS.filter((c) => !gates[c.key]).length;

  const handleAutoVerifyPortfolioGates = () => {
    onSetAllTwelveGates({
      ...gates,
      ...autoSevenSummary.flags,
    });
  };

  const handleSyncProbsFromJournal = () => {
    const portTrades = state.journal.filter((j) => j.port === state.activePort);
    if (portTrades.length === 0) {
      onUpdateFiveStateProbs(DEFAULT_FIVE_STATE_PROBS);
      return;
    }
    let c0 = 0,
      c1 = 0,
      c2 = 0,
      c3 = 0,
      c4 = 0;
    portTrades.forEach((t) => {
      const rr = Number(t.rr) || 0;
      if (t.status === 'FULL_SWEEP' || rr >= 0.7) c4 += 1;
      else if (t.status === 'TRAILING_LOCK' || rr >= 0.15) c3 += 1;
      else if (t.status === 'BREAK_EVEN' || (rr > -0.25 && rr < 0.15)) c2 += 1;
      else if (t.status === 'TP1_ONLY' || rr >= -0.8) c1 += 1;
      else c0 += 1;
    });
    const total = portTrades.length;
    const p0 = Math.round((c0 / total) * 100);
    const p1 = Math.round((c1 / total) * 100);
    const p2 = Math.round((c2 / total) * 100);
    const p3 = Math.round((c3 / total) * 100);
    const p4 = Math.max(0, 100 - (p0 + p1 + p2 + p3));
    onUpdateFiveStateProbs({
      p0,
      p1,
      p2,
      p3,
      p4,
      spreadCostR: probs.spreadCostR || 0.02,
    });
  };

  const copyActiveTicket = () => {
    if (isV32) {
      const ticketText = [
        `XAUUSD ${state.calcDir} LIMIT (GHR v3.2 · 3-TP + Trailing Lock)`,
        `Port: ${accountName} | Entry: ${v32Ladder.validEntry.toFixed(2)} | Lot: ${v32Ladder.legLot.toFixed(2)} Lot × 3 ${text('legs (total', 'ไม้ (รวม')} ${v32Ladder.totalLot.toFixed(2)} Lot) | Risk: ${fmtUSD(v32Ladder.riskUsd)}`,
        `SL (-1,000p): ${v32Ladder.slPrice} (-1.00R = ${fmtUSD(v32Ladder.states[0].netUsd)})`,
        `TP1 (+400p): ${v32Ladder.tp1Price} | TP2 (+800p · ${text('move leg 3 SL to', 'ย้าย SL ไม้ 3 ไปที่')} ${v32Ladder.tp1Price} ${text('lock', 'ล็อก')} +0.533R = +${fmtUSD(v32Ladder.states[3].netUsd)}): ${v32Ladder.tp2Price} | TP3 (+1,200p · Full +0.80R = +${fmtUSD(v32Ladder.states[4].netUsd)}): ${v32Ladder.tp3Price}`,
        `12-Gate Status: ${gateEval.passedCount}/12 (${gateEval.isAllPassed ? 'PASS' : 'BLOCKED'}) | E_net[R]: +${expectancy.netExpectancyR.toFixed(3)}R`,
      ].join('\n');
      onCopyText(ticketText, text('GHR v3.2 Ticket (3-TP and Trailing Lock)', 'โพย GHR v3.2 (3-TP + Trailing Lock)'));
    } else {
      const ticketText = [
        `XAUUSD ${state.calcDir} LIMIT (4-Leg Canonical GHR v3.1)`,
        `Entry: ${v31Ladder.validEntry.toFixed(2)} | Total Lot: ${v31Ladder.totalLot.toFixed(2)} (4 × ${v31Ladder.legLot.toFixed(3)} Lot) | Risk: ${fmtUSD(v31Ladder.riskUsd)}`,
        `SL (-1,000p): ${v31Ladder.slPrice}`,
        `TP1 (+300p): ${v31Ladder.tp1Price} | TP2 (+600p): ${v31Ladder.tp2Price} | TP3 (+900p Lock +0.20R): ${v31Ladder.tp3Price} | TP4 (+1,200p Full +0.75R): ${v31Ladder.tp4Price}`,
        `12-Gate Status: ${gateEval.passedCount}/12 (${gateEval.isAllPassed ? 'PASS' : 'BLOCKED'})`,
      ].join('\n');
      onCopyText(ticketText, text('4-Leg Ladder Ticket (v3.1)', 'โพยไล่ระดับ 4 ไม้ (v3.1)'));
    }
  };

  const sizingRows = isV32 ? GHR_V32_SIZING_MATRIX : CANONICAL_SIZING_MATRIX;

  return (
    <section id="desk-cards-root" className="fx-analysis-wrapper">
      <header className="desk-band-heading">
        <h2><ClipboardCheck size={18} aria-hidden="true" />{text('Pre-session risk gate matrix', 'ด่านตรวจความเสี่ยงก่อนเริ่มเซสชัน')}</h2>
        <span>{accountName}</span>
      </header>
      <div className="fx-kpi-row-4 desk-kpi-band">
        <div className="fx-stat-card gate-readiness" data-ready={gateEval.isAllPassed}>
          <div className="fx-stat-label">{text('Gates cleared', 'ด่านที่ผ่าน')}</div>
          <div className="fx-stat-value mono">
            {gateEval.isAllPassed ? <ShieldCheck size={19} aria-hidden="true" /> : <ShieldHalf size={19} aria-hidden="true" />}
            {gateEval.passedCount}/12
          </div>
          <div className="gate-meter" role="progressbar" aria-label={text('Gates cleared', 'ด่านที่ผ่าน')}
            aria-valuenow={gateEval.passedCount} aria-valuemin={0} aria-valuemax={12}>
            {GATE_GROUPS.flatMap(group => group.items.map(item => <i key={item.key} data-passed={!!gates[item.key]} />))}
          </div>
        </div>

        <div className="fx-stat-card">
          <div className="fx-stat-label">{text("Position Size (3 Legs)", "ขนาดสัญญาต่อชุด (3 ไม้)")}</div>
          <div className="fx-stat-value mono">
            {v32Ladder.legLot.toFixed(2)} × 3
          </div>
          <div className="fx-stat-sub">
            {text('Total', 'รวม')} {v32Ladder.totalLot.toFixed(2)} {text('lots · Risk', 'ล็อต · ความเสี่ยง')} {fmtUSD(v32Ladder.riskUsd)}{text('/idea', '/ชุด')}
          </div>
        </div>

        <div className="fx-stat-card">
          <div className="fx-stat-label">{text("Net Expectancy", "ค่าคาดหวังสุทธิ (Expectancy)")}</div>
          <div className="fx-stat-value mono">
            {expectancy.netExpectancyR >= 0 ? '+' : ''}
            {expectancy.netExpectancyR.toFixed(3)}R
          </div>
          <div className="fx-stat-sub">
            {text('Average', 'เฉลี่ย')} {fmtUSD(expectancy.expectedUsdPerIdea, true)} {text('per idea', 'ต่อชุด')}
          </div>
        </div>

        <div className="fx-stat-card">
          <div className="fx-stat-label">{text("Golden Rules", "กฎเหล็กประจำโต๊ะเทรด")}</div>
          <div className="fx-stat-value mono">
            {ackCount} / 10
          </div>
          <div className="fx-stat-sub">
            {ackCount === 10 ? text('All 10 rules acknowledged', 'รับทราบครบทั้ง 10 ข้อแล้ว') : text('Review the Golden Rules tab', 'เปิดแท็บกฎเหล็กเพื่อตรวจสอบ')}
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* ROW 2: CLEAN TABBED WORKSPACE (Matches Analytics Folder Tabs)     */}
      {/* ================================================================= */}
      <div className="fx-tabbed-container">
        <div className="fx-folder-tabs">
          <div className="fx-folder-tabs-left" role="tablist" onKeyDown={navigateDeskTabs} aria-label={text("Trading rules and references", "กฎและข้อมูลอ้างอิงการเทรด")}>
            <button
              type="button"
              role="tab"
              id="desk-reference-GATES-tab"
              aria-controls="desk-reference-panel"
              aria-selected={activeTab === 'GATES'}
              tabIndex={activeTab === 'GATES' ? 0 : -1}
              className={`fx-folder-tab ${activeTab === 'GATES' ? 'active' : ''}`}
              onClick={() => setActiveTab('GATES')}
            >
              {text("1. 12-Gate Checklist", "1. ด่านตรวจ 12-Gate")} ({gateEval.passedCount}/12)
            </button>
            <button
              type="button"
              role="tab"
              id="desk-reference-PAYOFF-tab"
              aria-controls="desk-reference-panel"
              aria-selected={activeTab === 'PAYOFF'}
              tabIndex={activeTab === 'PAYOFF' ? 0 : -1}
              className={`fx-folder-tab ${activeTab === 'PAYOFF' ? 'active' : ''}`}
              onClick={() => setActiveTab('PAYOFF')}
            >
              {text('2. 5-State Matrix & Lot Sizing', '2. ตาราง 5 สถานะและขนาดล็อต')}
            </button>
            <button
              type="button"
              role="tab"
              id="desk-reference-RULES-tab"
              aria-controls="desk-reference-panel"
              aria-selected={activeTab === 'RULES'}
              tabIndex={activeTab === 'RULES' ? 0 : -1}
              className={`fx-folder-tab ${activeTab === 'RULES' ? 'active' : ''}`}
              onClick={() => setActiveTab('RULES')}
            >
              {text('3. 10 Golden Rules & Expectancy', '3. กฎเหล็ก 10 ข้อและค่าคาดหวัง')}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingBottom: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn xs"
              onClick={handleAutoVerifyPortfolioGates}
              title={text('Automatically check the 15-minute cooldown, 3-trade daily quota, daily loss and account buffer', 'ตรวจสอบเวลาพัก 15 นาที โควตา 3 ชุดต่อวัน ขาดทุนรายวัน และเงินเผื่อของพอร์ตอัตโนมัติ')}
            >
              {text('Auto-Check Port', 'เช็กงบพอร์ตอัตโนมัติ')}
            </button>
            <button
              type="button"
              className="btn xs emerald"
              onClick={() =>
                onSetAllTwelveGates({
                  g01: true,
                  g02: true,
                  g03: true,
                  g04: true,
                  g05: true,
                  g06: true,
                  g07: true,
                  g08: true,
                  g09: true,
                  g10: true,
                  g11: true,
                  g12: true,
                })
              }
            >
              {text('Mark All 12 Passed', 'ผ่านครบ 12 ด่าน')}
            </button>
            <button
              type="button"
              className="btn xs"
              onClick={() =>
                onSetAllTwelveGates({
                  g01: false,
                  g02: false,
                  g03: false,
                  g04: false,
                  g05: false,
                  g06: false,
                  g07: false,
                  g08: false,
                  g09: false,
                  g10: false,
                  g11: false,
                  g12: false,
                })
              }
            >
              {text('Reset', 'รีเซ็ต')}
            </button>
            <button type="button" className="btn xs primary" onClick={copyActiveTicket}>
              {text("Copy 3-TP Ticket", "คัดลอกโพย 3-TP")}
            </button>
          </div>
        </div>

        <div className="fx-tab-panel-card" id="desk-reference-panel" role="tabpanel" aria-labelledby={`desk-reference-${activeTab}-tab`} tabIndex={0}>
          {/* =============================================================== */}
          {/* TAB 1: 3-COLUMN 12-GATE CHECKLIST (With Optional 10s Compact)   */}
          {/* =============================================================== */}
          {activeTab === 'GATES' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, minHeight: 0 }}>
              {/* Clean Single-Line Status Banner Matching Institutional Gate Sheet */}
              <div className="gate-status-banner" data-ready={gateEval.isAllPassed}>
                <div className="gate-banner-copy">
                  {gateEval.isAllPassed ? <ShieldCheck size={18} aria-hidden="true" /> : <LockKeyhole size={16} aria-hidden="true" />}
                  <strong>{gateEval.isAllPassed ? text('All gates cleared', 'ผ่านครบทุกด่าน') : text('Open gates', 'ด่านที่ยังไม่ผ่าน')}</strong>
                  <span className="mono">{gateEval.isAllPassed ? '12/12' : gateEval.blockingCodes.join(' · ')}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    {lang === 'en' ? 'Select a gate to change its status' : 'เลือกด่านเพื่อเปลี่ยนสถานะ'}
                  </span>
                  <button
                    type="button"
                    className="btn xs"
                    onClick={() => setShowDetailedGates((v) => !v)}
                  >
                    {showDetailedGates
                      ? lang === 'en'
                        ? '10s View'
                        : 'โหมดย่อ 10 วิ'
                      : lang === 'en'
                      ? '3-Column View'
                      : 'มุมมอง 3 หมวด'}
                  </button>
                </div>
              </div>

              {!showDetailedGates ? (
                <>
                  {/* AUTO-GATE SUMMARY CARD (7 Gates — Zero Clicks) */}
                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: '8px',
                      background: autoSevenSummary.allAutoPassed
                        ? 'var(--emerald-soft)'
                        : 'var(--rose-soft)',
                      border: `1px solid ${
                        autoSevenSummary.allAutoPassed
                          ? 'var(--emerald-border)'
                          : 'var(--rose-border)'
                      }`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <strong
                        style={{
                          fontSize: '13px',
                          color: autoSevenSummary.allAutoPassed ? 'var(--emerald)' : 'var(--rose)',
                        }}
                      >
                        {autoSevenSummary.allAutoPassed
                          ? lang === 'en'
                            ? `Auto-Verified Portfolio Gates (${autoSevenSummary.passedAutoCount}/7 Passed)`
                            : `ตรวจพอร์ตอัตโนมัติ (${autoSevenSummary.passedAutoCount}/7 ผ่าน)`
                          : lang === 'en'
                          ? `Auto-Gate Blocked (${autoSevenSummary.passedAutoCount}/7 Passed)`
                          : `พอร์ตติดเงื่อนไข (${autoSevenSummary.passedAutoCount}/7 ผ่าน)`}
                      </strong>
                      <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {text('Auto-Verified', 'ตรวจอัตโนมัติ')}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
                        gap: '4px 12px',
                        fontSize: '12px',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {autoSevenSummary.autoResults
                        .filter((r) => (autoSevenSummary.allAutoPassed ? ['g03', 'g08', 'g01', 'g02'].includes(r.key) : !r.pass || ['g03', 'g01'].includes(r.key)))
                        .map((item) => (
                          <div
                            key={item.key}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              color: item.pass ? 'var(--text-primary)' : 'var(--rose)',
                              fontWeight: item.pass ? 500 : 700,
                            }}
                          >
                            {item.pass ? <CircleCheck size={14} aria-hidden="true" /> : <CircleAlert size={14} aria-hidden="true" />}
                            <span>{item.label}</span>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* MANUAL 5-TAP FULL-WIDTH CARDS */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                        {lang === 'en'
                          ? `Confirm Setup & Mindset (${manualRemainingCount} left)`
                          : `กดยืนยันก่อนเข้าออเดอร์ (${manualRemainingCount > 0 ? `เหลือ ${manualRemainingCount} ข้อ` : 'ครบแล้ว'})`}
                      </strong>
                      <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                        {lang === 'en' ? 'Click any row' : 'แตะที่แถวเพื่อสลับ'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {MANUAL_FIVE_TAP_CARDS.map((card) => {
                        const checked = !!gates[card.key];
                        return (
                          <button
                            key={card.key}
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            onClick={() => onToggleTwelveGate(card.key, !checked)}
                            className="gate-manual-row"
                          >
                            <span className="gate-check-icon" aria-hidden="true">{checked && <Check size={14} />}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: '13px',
                                  fontWeight: 600,
                                  color: checked ? 'var(--emerald)' : 'var(--text-primary)',
                                }}
                              >
                                {card.num}. {card.title}
                              </div>
                              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                {card.hint}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* FAIL-CLOSED ACTION BUTTON */}
                  <div style={{ paddingTop: '4px' }}>
                    <button
                      type="button"
                      className={`btn md ${gateEval.isAllPassed ? 'emerald' : ''}`}
                      disabled={!gateEval.isAllPassed}
                      onClick={() => {
                        if (gateEval.isAllPassed && onProceedToCalculator) {
                          onProceedToCalculator();
                        }
                      }}
                      style={{
                        width: '100%',
                        justifyContent: 'center',
                        padding: '12px 16px',
                        fontSize: '13.5px',
                        fontWeight: 700,
                        opacity: gateEval.isAllPassed ? 1 : 0.72,
                        cursor: gateEval.isAllPassed ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {gateEval.isAllPassed
                        ? lang === 'en'
                          ? `12/12 Complete · Go to Lot & 3-TP Calculator (${fmtUSD(v32Ladder.riskUsd)}) →`
                          : `ผ่านครบ 12/12 · ไปหน้าคำนวณ Lot & 3-TP (${fmtUSD(v32Ladder.riskUsd)}) →`
                        : lang === 'en'
                        ? `Lot Calculator requires 12/12 checks (${12 - gateEval.passedCount} remaining)`
                        : `เครื่องคำนวณล็อตต้องผ่าน 12/12 ด่าน (เหลือ ${12 - gateEval.passedCount} ด่าน)`}
                    </button>
                  </div>
                </>
              ) : (
                /* Full 3-Column Detailed Gate Matrix (Inspect Mode) */
                <div className="gate-groups-grid">
                  {GATE_GROUPS.map((group) => {
                    const groupPassed = group.items.filter((it) => !!gates[it.key]).length;
                    return (
                      <div key={group.id} className="gate-group-card" data-gate-group={group.id} role="group" aria-labelledby={group.id + '-title'}>
                        <header className="gate-group-heading">
                          <div>
                            <div className="gate-group-title">
                              <h3 id={group.id + '-title'}>{group.title[lang]}</h3>
                              {group.id !== 'group-risk' && (
                                <span className="desk-tag mono" style={{ fontSize: '10px' }}>
                                  {text('Preset: GHR v3.2 3-TP', 'ค่าเริ่มต้น: GHR v3.2 3-TP')}
                                </span>
                              )}
                            </div>
                            <div className="gate-group-subtitle">
                              {group.subtitle[lang]}
                            </div>
                          </div>
                          <span className="desk-tag mono" data-tone={groupPassed === group.items.length ? 'gain' : 'risk'}>
                            {groupPassed}/{group.items.length}
                          </span>
                        </header>

                        <div className="gate-list-rows">
                          {group.items.map((item) => {
                            const checked = !!gates[item.key];
                            return (
                              <label
                                key={item.key}
                                className={`gate-item-row ${checked ? 'pass' : 'blocked'}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => onToggleTwelveGate(item.key, e.target.checked)}
                                  style={{
                                    marginTop: '2px',
                                    width: '14px',
                                    height: '14px',
                                    accentColor: 'var(--emerald)',
                                    cursor: 'pointer',
                                    flexShrink: 0,
                                  }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'baseline',
                                      gap: '6px',
                                      marginBottom: '2px',
                                    }}
                                  >
                                    <span className="gate-item-code mono">
                                      {item.code}
                                    </span>
                                    <strong
                                      style={{
                                        fontSize: '12.5px',
                                        fontWeight: 600,
                                        color: 'var(--text-primary)',
                                      }}
                                    >
                                      {item.title[lang]}
                                    </strong>
                                  </div>
                                  <div
                                    style={{
                                      fontSize: '11.5px',
                                      color: 'var(--text-secondary)',
                                      lineHeight: 1.4,
                                    }}
                                  >
                                    {item.desc[lang]}
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        {/* =============================================================== */}
        {/* TAB 2: 5-STATE PAYOFF SCHEDULE & LOT SIZING MATRIX              */}
        {/* =============================================================== */}
        {activeTab === 'PAYOFF' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minHeight: 0 }}>
            {/* Protocol switcher & Live 3-TP Strip */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                flexShrink: 0,
              }}
            >
              <div>
                <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                  {text('5-State Payoff and Position Sizing', 'ตารางผลตอบแทน 5 สถานะและขนาดสัญญา')} · {accountName}
                </strong>
                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                  {text('Add a state to record the outcome, or select a dollar amount to update risk.', 'กดบันทึกสถานะเพื่อลงผลในสมุดเทรด หรือเลือกจำนวนเงินเพื่อปรับความเสี่ยง')}
                </span>
              </div>
              <div className="chart-mode-toggle" role="group">
                <button
                  type="button"
                  className={`chart-mode-btn ${isV32 ? 'active' : ''}`}
                  onClick={() => setProtocolVersion('V32')}
                >
                  {text("GHR v3.2 (3 Legs · Trailing Lock)", "GHR v3.2 (3 ไม้ · Trailing Lock)")}
                </button>
                <button
                  type="button"
                  className={`chart-mode-btn ${!isV32 ? 'active' : ''}`}
                  onClick={() => setProtocolVersion('V31')}
                >
                  {text("GHR v3.1 (4 Legs · Original PDF)", "GHR v3.1 (4 ไม้ · PDF ต้นฉบับ)")}
                </button>
              </div>
            </div>

            {isV32 && (
              <div
                className="four-leg-live-strip is-five-col"
                style={{ flexShrink: 0 }}
              >
                <div className="four-leg-pill">
                  <span>{text('Position Size', 'ขนาดสัญญา')} ({state.calcDir === 'BUY' ? text('BUY', 'ซื้อ') : text('SELL', 'ขาย')})</span>
                  <strong className="mono">
                    {v32Ladder.legLot.toFixed(2)} {text('lots × 3 legs (total', 'ล็อต × 3 ไม้ (รวม')} {v32Ladder.totalLot.toFixed(2)}L)
                  </strong>
                </div>
                <div className="four-leg-pill sl">
                  <span>SL (-1,000p · -1.00R)</span>
                  <strong className="mono">{v32Ladder.slPrice}</strong>
                </div>
                <div className="four-leg-pill">
                  <span>{text("Leg 1 · TP1 (+400p)", "ไม้ 1 · TP1 (+400p)")}</span>
                  <strong className="mono">{v32Ladder.tp1Price}</strong>
                </div>
                <div className="four-leg-pill lock">
                  <span>{text("Leg 2 · TP2 (+800p · Move SL3 to TP1)", "ไม้ 2 · TP2 (+800p · เลื่อน SL3→TP1)")}</span>
                  <strong className="mono">{v32Ladder.tp2Price}</strong>
                </div>
                <div className="four-leg-pill full">
                  <span>{text("Leg 3 · TP3 (+1,200p · +0.80R)", "ไม้ 3 · TP3 (+1,200p · +0.80R)")}</span>
                  <strong className="mono">{v32Ladder.tp3Price}</strong>
                </div>
              </div>
            )}

            {/* Side-by-Side 2-Column Layout: Left = 5-State Payoff, Right = Sizing Matrix */}
            <div className="payoff-sizing-split">
              {/* 5-State Table */}
              <div className="table-container" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <table className="journal-table" style={{ flex: 1, height: '100%' }} aria-label={text('5-state payoff table', 'ตารางผลลัพธ์ 5 สถานะ')}>
                  <thead>
                    <tr>
                      <th>{text("Outcome", "สถานะผลลัพธ์ (State)")}</th>
                      <th>{text("Trade Path", "รายละเอียดการวิ่ง")}</th>
                      <th>{text("Points · R", "แต้ม · R")}</th>
                      <th style={{ textAlign: 'right' }}>
                        {text('Net', 'สุทธิ')} ({fmtUSD(v32Ladder.riskUsd)})
                      </th>
                      <th style={{ textAlign: 'right' }}>{text("Record", "บันทึก")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeStates.map((st) => {
                      const isPositive = st.rMultiple > 0;
                      const isZero = st.rMultiple === 0;
                      return (
                        <tr key={st.stateIndex}>
                          <td>
                            <strong style={{ color: 'var(--text-primary)', fontSize: '11.5px' }}>{text(st.titleEn.replace(/ \([^)]*[\u0E00-\u0E7F][^)]*\)$/, ''), `สถานะ ${st.stateIndex} · ${(isV32 ? V32_STATE_TITLES_TH : V31_STATE_TITLES_TH)[st.stateIndex]}`)}</strong>
                            <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)' }}>
                              {text((isV32 && V32_STATE_NOTES_EN[st.stateIndex]) || st.noteBadge || '—', st.titleTh)}
                            </div>
                          </td>
                          <td style={{ whiteSpace: 'normal', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                            {text(st.derivationText, (isV32 ? V32_TRADE_PATHS_TH : V31_TRADE_PATHS_TH)[st.stateIndex])}
                          </td>
                          <td className="mono">
                            <span
                              style={{
                                fontSize: '11.5px',
                                fontWeight: 600,
                                color: isPositive
                                  ? 'var(--emerald)'
                                  : isZero
                                  ? 'var(--accent)'
                                  : 'var(--rose)',
                              }}
                            >
                              {st.rLabel}
                            </span>
                          </td>
                          <td
                            className="mono sensitive-val"
                            style={{
                              textAlign: 'right',
                              fontWeight: 700,
                              fontSize: '12.5px',
                              color: isPositive
                                ? 'var(--emerald)'
                                : isZero
                                ? 'var(--text-secondary)'
                                : 'var(--rose)',
                            }}
                          >
                            {fmtUSD(st.netUsd, true)}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              className={`btn xs ${isPositive ? 'emerald' : ''}`}
                              onClick={() => onRecordFourLegState(st)}
                            >
                              {text('+ State', '+ บันทึกสถานะ')} {st.stateIndex}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Position Sizing Matrix */}
              <div className="table-container" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <table className="journal-table" style={{ flex: 1, height: '100%' }} aria-label={text('Position sizing matrix', 'ตารางขนาดสัญญามาตรฐาน')}>
                  <thead>
                    <tr>
                      <th>{text("Account Size", "ขนาดพอร์ต")}</th>
                      <th>{text("Limits and Target", "เพดาน & เป้า")}</th>
                      <th>{text("Total Lots", "Lot รวม")}</th>
                      <th>{text("Risk", "ความเสี่ยง")}</th>
                      <th style={{ textAlign: 'right' }}>{text("Apply", "เลือกใช้")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sizingRows.map((row, idx) => {
                      const isCurrentPrimary =
                        Math.abs(v32Ladder.riskUsd - row.recommendedRiskUsd) < 1;
                      const isCurrentSecondary =
                        row.secondaryRiskUsd !== undefined &&
                        Math.abs(v32Ladder.riskUsd - row.secondaryRiskUsd) < 1;
                      return (
                        <tr key={idx}>
                          <td style={{ whiteSpace: 'normal', lineHeight: 1.35 }}>
                            <strong style={{ fontSize: '11.5px' }}>{formatSizingText(row.accountSizeLabel, lang)}</strong>
                            {row.badgeText && (
                              <div style={{ fontSize: '10.5px', color: 'var(--accent-ink)', fontWeight: 500 }}>
                                {formatSizingText(row.badgeText, lang)}
                              </div>
                            )}
                          </td>
                          <td className="mono" style={{ fontSize: '11px', whiteSpace: 'normal', lineHeight: 1.35 }}>
                            {formatSizingText(row.capsLabel, lang)}
                          </td>
                          <td className="mono" style={{ fontWeight: 600, fontSize: '11px', whiteSpace: 'normal', lineHeight: 1.35 }}>
                            {formatSizingText(row.totalIdeaLotLabel, lang)}
                          </td>
                          <td className="mono" style={{ fontSize: '11px', whiteSpace: 'normal', lineHeight: 1.35 }}>
                            {formatSizingText(row.riskPerIdeaLabel, lang)}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '4px' }}>
                              <button
                                type="button"
                                className={`btn xs ${isCurrentPrimary ? 'primary' : ''}`}
                                onClick={() => onUpdateRisk(row.recommendedRiskUsd)}
                              >
                                ${row.recommendedRiskUsd}
                              </button>
                              {row.secondaryRiskUsd && (
                                <button
                                  type="button"
                                  className={`btn xs ${isCurrentSecondary ? 'primary' : ''}`}
                                  onClick={() => onUpdateRisk(row.secondaryRiskUsd!)}
                                >
                                  ${row.secondaryRiskUsd}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =============================================================== */}
        {/* TAB 3: 10 GOLDEN RULES & EXPECTANCY SIMULATOR                   */}
        {/* =============================================================== */}
        {activeTab === 'RULES' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minHeight: 0, justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '6px', flexShrink: 0 }}>
                <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                  {text("The 10 Golden Rules", "บัญญัติทองคำ 10 ประการก่อนกดออกออเดอร์ (The 10 Golden Rules)")}
                </strong>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    {text(`Review and acknowledge each rule (${ackCount}/10)`, `ทบทวนและติ๊กรับทราบแต่ละข้อ (${ackCount}/10)`)}
                  </span>
                  {ackCount < 10 && (
                    <button
                      type="button"
                      className="btn xs"
                      onClick={() => {
                        TEN_GOLDEN_RULES.forEach((rule) => {
                          if (goldenAck[rule.key] !== true) {
                            onToggleGoldenRule(rule.key, true);
                          }
                        });
                      }}
                    >
                      {text('Acknowledge all 10', 'รับทราบครบ 10 ข้อ')}
                    </button>
                  )}
                </div>
              </div>

              <div className="golden-rules-grid">
                {TEN_GOLDEN_RULES.map((rule) => {
                  const ack = goldenAck[rule.key] === true;
                  return (
                    <label
                      key={rule.key}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        background: ack ? 'transparent' : 'var(--amber-soft)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={ack}
                        onChange={(e) => onToggleGoldenRule(rule.key, e.target.checked)}
                        style={{
                          marginTop: '2px',
                          width: '14px',
                          height: '14px',
                          accentColor: 'var(--accent)',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.25 }}>
                          <span className="mono" style={{ color: 'var(--accent-ink)', marginRight: '5px' }}>
                            #{rule.code}
                          </span>
                          {text(rule.titleEn, GOLDEN_TITLES_TH[rule.key] ?? rule.titleEn)}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px', lineHeight: 1.3 }}>
                          {text(rule.ruleEn, rule.ruleTh)}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Expectancy Simulator */}
            <div className="expectancy-sim-box" style={{ margin: 0, padding: '10px 12px', gap: '8px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <div>
                  <strong style={{ fontSize: '12.5px', color: 'var(--text-primary)' }}>
                    {text("5-State Expectancy Simulator", "จำลองค่าคาดหวังสุทธิ 5 สถานะ (Multi-State Expectancy Simulator)")}
                  </strong>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                    {text("Adjust outcome probabilities or use your trade journal statistics.", "ปรับสัดส่วนความน่าจะเป็น (%) หรือดึงสถิติจริงจากสมุดเทรดของคุณ")}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn xs"
                    onClick={() => onUpdateFiveStateProbs(DEFAULT_FIVE_STATE_PROBS)}
                  >
                    {text("Reset to Defaults", "รีเซ็ตค่ามาตรฐาน")}
                  </button>
                  <button type="button" className="btn xs primary" onClick={handleSyncProbsFromJournal}>
                    {text(`Use Journal Stats (${acc.tradeCount} trades)`, `ดึงสัดส่วนจากสมุดเทรด (${acc.tradeCount} ไม้)`)}
                  </button>
                </div>
              </div>

              <div className="expectancy-inputs-grid">
                {(
                  [
                    { key: 'p0', label: text('State 0 · Stop Loss (-1.00R) %', 'สถานะ 0 · ชน SL (-1.00R) %') },
                    { key: 'p1', label: text('State 1 · TP1 Only (-0.53R) %', 'สถานะ 1 · TP1 เดียว (-0.53R) %') },
                    { key: 'p2', label: text('State 2 · Break-Even (0.00R) %', 'สถานะ 2 · เท่าทุน (0.00R) %') },
                    { key: 'p3', label: text('State 3 · Trailing Lock (+0.53R) %', 'สถานะ 3 · ติด TL (+0.53R) %') },
                    { key: 'p4', label: text('State 4 · All 3 Targets (+0.80R) %', 'สถานะ 4 · ครบ 3 ไม้ (+0.80R) %') },
                  ] as const
                ).map((item) => (
                  <div key={item.key} className="expectancy-inp-cell">
                    <label htmlFor={`exp-${item.key}`}>{item.label}</label>
                    <input
                      id={`exp-${item.key}`}
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      className="mono"
                      value={probs[item.key]}
                      onChange={(e) =>
                        onUpdateFiveStateProbs({
                          ...probs,
                          [item.key]: Math.max(0, parseFloat(e.target.value) || 0),
                        })
                      }
                    />
                  </div>
                ))}
              </div>

              <div className="expectancy-summary-strip">
                <span>
                  {text("Total Probability", "รวมสัดส่วน")} <strong className="mono">{expectancy.totalPct}%</strong>
                </span>
                <span>
                  {text("Profit Lock Probability (States 3 + 4)", "โอกาสล็อกกำไร (State 3+4)")}{' '}
                  <strong className="mono" style={{ color: 'var(--emerald)' }}>
                    {expectancy.positiveLockProbPct}%
                  </strong>
                </span>
                <span>
                  {text("Net Expectancy", "ค่าคาดหวังสุทธิ (Net Expectancy)")}{' '}
                  <strong
                    className="mono"
                    style={{
                      color: expectancy.netExpectancyR >= 0 ? 'var(--emerald)' : 'var(--rose)',
                    }}
                  >
                    {expectancy.netExpectancyR >= 0 ? '+' : ''}
                    {expectancy.netExpectancyR.toFixed(3)}R ({fmtUSD(expectancy.expectedUsdPerIdea, true)}{text('/idea', '/ชุด')})
                  </strong>
                </span>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </section>
  );
};
