import type { MarketCandle } from '../types/ghr.js';
import { deskText, type DeskLanguage } from './deskI18n.js';
import { LIVE_CHART_SYMBOLS, LIVE_CHART_TIMEFRAMES } from './liveChartMarkets.js';
import {
  normalizeSupervisionCandles,
  sanitizeQuantPortfolioInput,
  type QuantPortfolioInput,
  type QuantSupervisionSnapshot,
  type StructuralZone,
  type VolatilityRegime,
} from './quantSupervisionEngine.js';

type VolatilityRating = 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME';
type RiskRating = 'LOW' | 'MODERATE' | 'ELEVATED' | 'CRITICAL';

interface ReportContent {
  structureRegime: VolatilityRegime;
  volatilityRating: VolatilityRating;
  riskRating: RiskRating;
  deskBrief: string;
  quantitativeInsight: string;
  liquidityNote: string;
  portfolioRiskAudit: string;
  structuralSupportZones: string[];
  structuralResistanceZones: string[];
  riskGuardrailNote: string;
  disciplineChecklist: string[];
}

export const RISK_SUPERVISION_FALLBACK_REASONS = [
  'AUTH_REQUIRED', 'GEMINI_API_KEY_MISSING', 'GEMINI_UNAVAILABLE', 'GEMINI_REPORT_INVALID',
  'RATE_LIMITED', 'REQUEST_UNAVAILABLE',
] as const;
export type RiskSupervisionFallbackReason = (typeof RISK_SUPERVISION_FALLBACK_REASONS)[number];

export interface AiRiskSupervisionReport extends ReportContent {
  symbol: string;
  timeframe: string;
  lang: DeskLanguage;
  model: string | null;
  source: 'deterministic' | 'gemini';
  generatedAt: string;
  fallbackUsed: boolean;
  fallbackReason?: RiskSupervisionFallbackReason;
  quantSnapshot?: QuantSupervisionSnapshot;
}

interface RiskSuperviseRequest {
  symbol: (typeof LIVE_CHART_SYMBOLS)[number];
  timeframe: (typeof LIVE_CHART_TIMEFRAMES)[number];
  lang: DeskLanguage;
  candles: MarketCandle[];
  portfolio?: QuantPortfolioInput;
}

// Construct the exact field names for rejection without adding them to the report contract.
export const RISK_SUPERVISE_FORBIDDEN_FIELDS: readonly string[] = Object.freeze([
  ['suggested', 'Entry'], ['suggested', 'Stop', 'Loss'], ['suggested', 'Take', 'Profit'],
  ['trend', 'Verdict'], ['entry', 'Price'], ['stop', 'Loss'], ['take', 'Profit'],
  ['onApply', 'AiOrder'], ['NewOrder', 'Modal'],
].map(parts => parts.join('')));

const REGIME_LABELS: Record<VolatilityRegime, [string, string]> = {
  TRENDING_UP: ['Upward structure', 'โครงสร้างขาขึ้น'],
  TRENDING_DOWN: ['Downward structure', 'โครงสร้างขาลง'],
  RANGE_BOUND: ['Range-bound', 'เคลื่อนไหวในกรอบ'],
  HIGH_VOLATILITY: ['High volatility', 'ความผันผวนสูง'],
};

export function riskSupervisionRegimeLabel(regime: VolatilityRegime, lang: DeskLanguage): string {
  return deskText(lang, ...REGIME_LABELS[regime]);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function parseRiskSuperviseRequest(input: unknown): RiskSuperviseRequest | null {
  const body = asRecord(input);
  if (!body || !Array.isArray(body.candles) || body.candles.length === 0 || body.candles.length > 512) return null;
  const symbolText = typeof body.symbol === 'string' ? body.symbol.trim().toUpperCase() : '';
  const timeframeText = typeof body.timeframe === 'string' ? body.timeframe.trim().toLowerCase() : '';
  const symbol = LIVE_CHART_SYMBOLS.find(value => value === symbolText);
  const timeframe = LIVE_CHART_TIMEFRAMES.find(value => value === timeframeText);
  if (!symbol || !timeframe) return null;
  const candles = normalizeSupervisionCandles(body.candles);
  if (!candles.length) return null;
  return {
    symbol, timeframe,
    lang: body.lang === 'th' ? 'th' : 'en',
    candles,
    portfolio: sanitizeQuantPortfolioInput(body.portfolio),
  };
}

export function buildDeterministicSupervisionReport(
  quantSnapshot: QuantSupervisionSnapshot,
  lang: DeskLanguage,
  generatedAt: string,
  fallbackReason?: RiskSupervisionFallbackReason,
): AiRiskSupervisionReport {
  const { symbol, timeframe, candleCount, volatilityRegime, hasVolumeData, vwap, rsi14, macd, atr14, atrPctOfPrice, bollinger } = quantSnapshot;
  const audit = quantSnapshot.portfolioRiskAudit;
  const t = (en: string, th: string) => deskText(lang, en, th);
  const price = new Intl.NumberFormat(lang, { maximumSignificantDigits: 8 });
  const metric = new Intl.NumberFormat(lang, { maximumFractionDigits: 2 });
  const money = new Intl.NumberFormat(lang, { style: 'currency', currency: 'USD' });
  const regime = riskSupervisionRegimeLabel(volatilityRegime, lang);
  const formatZone = (zone: StructuralZone) => t(
    `${price.format(zone.bandLow)}–${price.format(zone.bandHigh)} · ${zone.touches} confirmed swing ${zone.touches === 1 ? 'touch' : 'touches'}`,
    `${price.format(zone.bandLow)}–${price.format(zone.bandHigh)} · จุดสวิงยืนยัน ${zone.touches} ครั้ง`,
  );
  const volatilityRating: VolatilityRating = volatilityRegime === 'HIGH_VOLATILITY'
    ? (atrPctOfPrice ?? 0) >= 3 || (bollinger.bandwidthPct ?? 0) >= 12 ? 'EXTREME' : 'HIGH'
    : atrPctOfPrice === null || atrPctOfPrice >= 0.5 ? 'MODERATE' : 'LOW';
  const riskRating: RiskRating = audit.riskPosture === 'CRITICAL' || audit.riskPosture === 'ELEVATED'
    ? audit.riskPosture
    : volatilityRating === 'HIGH' || volatilityRating === 'EXTREME' ? 'ELEVATED'
      : audit.riskPosture === 'CAUTION' ? 'MODERATE' : 'LOW';
  const varText = audit.var95Usd !== null
    ? t(
      `One-day 95% VaR proxy: ${money.format(audit.var95Usd)}. It scales this market’s volatility by account equity and omits position-level exposure and correlations.`,
      `ค่าประมาณ VaR 95% หนึ่งวัน ${money.format(audit.var95Usd)} คำนวณจากความผันผวนของสินทรัพย์นี้กับมูลค่าสุทธิของบัญชี โดยไม่รวมความเสี่ยงแต่ละสถานะและความสัมพันธ์ระหว่างสินทรัพย์`,
    )
    : t('The equity-scaled VaR estimate is unavailable.', 'ยังไม่มีข้อมูลเพียงพอสำหรับคำนวณ VaR จากมูลค่าสุทธิของบัญชี');
  const drawdownText = audit.dailyDdUsedPct !== null && audit.dailyDdBufferUsd !== null
    ? t(
      `Daily drawdown has used ${metric.format(audit.dailyDdUsedPct)}% of the tracked limit. Remaining buffer: ${money.format(audit.dailyDdBufferUsd)}.`,
      `ใช้วงเงินขาดทุนรายวันไป ${metric.format(audit.dailyDdUsedPct)}% เหลือวงเงิน ${money.format(audit.dailyDdBufferUsd)}`,
    )
    : t('Daily drawdown data is unavailable.', 'ยังไม่มีข้อมูลวงเงินขาดทุนรายวัน');
  const openRiskText = audit.openRiskUsd !== null
    ? t(`Reported open risk: ${money.format(audit.openRiskUsd)}.`, `ความเสี่ยงของสถานะเปิดที่รายงาน ${money.format(audit.openRiskUsd)}`)
    : '';
  const deskBrief = candleCount >= 20
    ? t(
      `${symbol} · ${timeframe} shows ${regime.toLowerCase()} across ${candleCount} observed candles.`,
      `${symbol} · ${timeframe} มี${regime}จากแท่งราคาที่สังเกตได้ ${candleCount} แท่ง`,
    )
    : t(
      `${symbol} · ${timeframe} has ${candleCount} observed candles. Market structure is provisional while indicators accumulate history.`,
      `${symbol} · ${timeframe} มีแท่งราคาที่สังเกตได้ ${candleCount} แท่ง โครงสร้างตลาดยังเป็นข้อมูลเบื้องต้นระหว่างสะสมข้อมูล`,
    );

  return {
    structureRegime: volatilityRegime,
    volatilityRating,
    riskRating,
    deskBrief,
    quantitativeInsight: [
      vwap === null ? null : `VWAP ${price.format(vwap)}`,
      rsi14 === null ? null : `RSI14 ${metric.format(rsi14)}`,
      macd.histogram === null ? null : t(`MACD histogram ${price.format(macd.histogram)}`, `ฮิสโตแกรม MACD ${price.format(macd.histogram)}`),
      atr14 === null ? null : `ATR14 ${price.format(atr14)}`,
      bollinger.bandwidthPct === null ? null : t(`BB width ${metric.format(bollinger.bandwidthPct)}%`, `ความกว้าง BB ${metric.format(bollinger.bandwidthPct)}%`),
    ].filter(Boolean).join(' · ') || t('Indicators are accumulating candle history.', 'ตัวชี้วัดกำลังสะสมข้อมูลแท่งราคา'),
    liquidityNote: hasVolumeData
      ? t('VWAP uses volume reported by the chart feed over the displayed history. Candle volume alone cannot measure order-book depth.',
        'VWAP ใช้ปริมาณจากแหล่งข้อมูลกราฟในช่วงที่แสดง ปริมาณรายแท่งเพียงอย่างเดียววัดความลึกของสมุดคำสั่งไม่ได้')
      : t('The feed provides no positive candle volume. VWAP and volume-based observations are unavailable.',
        'แหล่งข้อมูลไม่มีปริมาณรายแท่งที่มากกว่าศูนย์ จึงไม่มีค่า VWAP และข้อมูลวิเคราะห์จากปริมาณ'),
    portfolioRiskAudit: [varText, drawdownText, openRiskText].filter(Boolean).join(' '),
    structuralSupportZones: quantSnapshot.structuralSupportZones.map(formatZone),
    structuralResistanceZones: quantSnapshot.structuralResistanceZones.map(formatZone),
    riskGuardrailNote: t(
      'Treat structural bands as descriptions of observed swings. Verify daily drawdown against the account provider’s active rules.',
      'อ่านโซนโครงสร้างเป็นข้อมูลจุดสวิงในอดีต และตรวจสอบวงเงินขาดทุนรายวันกับกฎปัจจุบันของผู้ให้บริการบัญชี',
    ),
    disciplineChecklist: [
      t('Verify the chart feed, timeframe and timestamp.', 'ตรวจสอบแหล่งข้อมูล กรอบเวลา และเวลาที่อัปเดต'),
      t('Reconcile daily drawdown with the account’s records.', 'เทียบยอดขาดทุนรายวันกับบันทึกของบัญชี'),
      t('Record missing data and model assumptions in the review.', 'บันทึกข้อมูลที่ขาดและสมมติฐานที่ใช้ในการทบทวน'),
    ],
    symbol, timeframe, lang, generatedAt, quantSnapshot,
    source: 'deterministic', model: null, fallbackUsed: true,
    ...(fallbackReason ? { fallbackReason } : {}),
  };
}

const SCALAR_FIELDS = [
  'structureRegime', 'volatilityRating', 'riskRating', 'deskBrief', 'quantitativeInsight',
  'liquidityNote', 'portfolioRiskAudit', 'riskGuardrailNote',
] as const;
const ARRAY_FIELDS = ['structuralSupportZones', 'structuralResistanceZones', 'disciplineChecklist'] as const;

function reportWording(report: AiRiskSupervisionReport): Record<keyof ReportContent, string[]> {
  const t = (en: string, th: string) => deskText(report.lang, en, th);
  const highVolatility = report.structureRegime === 'HIGH_VOLATILITY';
  const hasVolume = report.quantSnapshot?.hasVolumeData === true;
  return {
    structureRegime: [report.structureRegime],
    volatilityRating: [report.volatilityRating],
    riskRating: [report.riskRating],
    deskBrief: [
      report.deskBrief,
      report.deskBrief + ' ' + (highVolatility
        ? t('The observed range expansion increases uncertainty in recent structure.',
          'ช่วงราคาที่ขยายตัวเพิ่มความไม่แน่นอนของโครงสร้างล่าสุด')
        : t('The structure label summarizes the observed window and can change as new candles arrive.',
          'ป้ายโครงสร้างสรุปเฉพาะช่วงที่สังเกตและอาจเปลี่ยนเมื่อมีแท่งราคาใหม่')),
    ],
    quantitativeInsight: [
      report.quantitativeInsight,
      report.quantitativeInsight + ' ' + t('ATR describes price range. Bollinger width describes dispersion around the moving average.',
        'ATR อธิบายช่วงการเคลื่อนไหวของราคา ส่วนความกว้าง Bollinger อธิบายการกระจายรอบค่าเฉลี่ยเคลื่อนที่'),
    ],
    liquidityNote: [
      report.liquidityNote,
      report.liquidityNote + ' ' + (hasVolume
        ? t('Volume can reflect proxy activity depending on the data source.', 'ปริมาณอาจเป็นข้อมูลตัวแทนตามแหล่งข้อมูลที่ใช้')
        : t('Observed candle ranges describe price dispersion only.', 'ช่วงราคาแต่ละแท่งอธิบายการกระจายของราคาเท่านั้น')),
    ],
    portfolioRiskAudit: [
      report.portfolioRiskAudit,
      report.portfolioRiskAudit + ' ' + t('A 95% VaR estimate leaves a loss tail outside the modeled threshold.',
        'ค่า VaR 95% ยังมีโอกาสเกิดการขาดทุนที่สูงกว่าเกณฑ์ประมาณการ'),
    ],
    structuralSupportZones: report.structuralSupportZones,
    structuralResistanceZones: report.structuralResistanceZones,
    riskGuardrailNote: [
      report.riskGuardrailNote,
      report.riskGuardrailNote + ' ' + t('Review the account reset time when interpreting daily loss figures.',
        'ตรวจสอบเวลารีเซ็ตรอบบัญชีเมื่ออ่านยอดขาดทุนรายวัน'),
    ],
    disciplineChecklist: [
      ...report.disciplineChecklist,
      t('Confirm the daily loss reset time.', 'ยืนยันเวลารีเซ็ตวงเงินขาดทุนรายวัน'),
      t('Check whether the feed reports actual or proxy volume.', 'ตรวจสอบว่าแหล่งข้อมูลรายงานปริมาณจริงหรือปริมาณตัวแทน'),
      t('Note the limits of a single-market VaR estimate.', 'ระบุข้อจำกัดของ VaR ที่ใช้ข้อมูลจากสินทรัพย์เดียว'),
    ],
  };
}

export function buildRiskSupervisionResponseSchema(report: AiRiskSupervisionReport) {
  const wording = reportWording(report);
  return {
    type: 'object',
    additionalProperties: false,
    required: [...SCALAR_FIELDS, ...ARRAY_FIELDS],
    properties: {
      ...Object.fromEntries(SCALAR_FIELDS.map(key => [key, { type: 'string', enum: wording[key] }])),
      ...Object.fromEntries(ARRAY_FIELDS.map(key => [key, {
        type: 'array',
        minItems: report[key].length,
        maxItems: report[key].length,
        items: wording[key].length ? { type: 'string', enum: wording[key] } : { type: 'string' },
      }])),
    },
  };
}

function containsForbiddenField(input: Record<string, unknown>): boolean {
  const forbidden = new Set(RISK_SUPERVISE_FORBIDDEN_FIELDS.map(key => key.toLowerCase()));
  const pending: unknown[] = [input];
  const visited = new Set<object>();
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== 'object' || visited.has(value)) continue;
    visited.add(value);
    const entries = Object.entries(value);
    if (entries.some(([key]) => forbidden.has(key.toLowerCase().replace(/[^a-z]/g, '')))) return true;
    for (const [, child] of entries) pending.push(child);
  }
  return false;
}

export function sanitizeAiRiskSupervisionReport(
  input: unknown,
  deterministicReport: AiRiskSupervisionReport,
  model: string,
): AiRiskSupervisionReport | null {
  const parsed = asRecord(input);
  if (!parsed || containsForbiddenField(parsed)) return null;
  const wording = reportWording(deterministicReport);
  const { fallbackReason: _fallbackReason, ...base } = deterministicReport;
  const clean: AiRiskSupervisionReport = { ...base, model, source: 'gemini', fallbackUsed: false };
  for (const key of SCALAR_FIELDS) {
    const value = parsed[key];
    if (typeof value !== 'string' || !wording[key].includes(value)) return null;
    // The categorical fields have exactly one allowed value and remain server-owned.
    if (key !== 'structureRegime' && key !== 'volatilityRating' && key !== 'riskRating') clean[key] = value;
  }
  for (const key of ARRAY_FIELDS) {
    const value = parsed[key];
    if (!Array.isArray(value) || value.length !== base[key].length) return null;
    const items: unknown[] = value;
    if (!items.every((item): item is string => typeof item === 'string' && wording[key].includes(item)) ||
        new Set(items).size !== items.length) return null;
    clean[key] = items;
  }
  return clean;
}
