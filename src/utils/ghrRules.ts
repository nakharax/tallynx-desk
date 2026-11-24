import type {
  AccountComputed,
  AccountInfo,
  AccountType,
  CalculatorContract,
  CalculatorInstrument,
  CalculatorLevelInput,
  ConsistencyRule,
  CycleDay,
  FiveStateProbabilities,
  GhrWorkspaceState,
  ManualCalculatorConfig,
  Mt5PositionRecord,
  Mt5ReportMeta,
  Mt5TimeOffsetSetting,
  QuickGates,
  TradeDirection,
  TradeOutcomeStatus,
  TradeRecord,
  TwelveGatesState,
} from '../types/ghr';
import { normalizeChatModelPreference } from './geminiOrchestrator';

export const ALL_TWELVE_GATES_PASSED: TwelveGatesState = {
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
};

export const DEFAULT_TWELVE_GATES: TwelveGatesState = {
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
};

export const DEFAULT_FIVE_STATE_PROBS: FiveStateProbabilities = {
  p0: 15,
  p1: 8,
  p2: 7,
  p3: 30,
  p4: 40,
  spreadCostR: 0.02,
};

export interface PropFirmPreset {
  id: string;
  accountType: AccountType;
  label: string;
  name: string;
  brokerName: string;
  brokerServer: string;
  initial: number;
  targetProfit: number;
  minDays: number;
  defaultRisk: number;
  consistencyCapPct: number;
  feeRefundUsd: number;
  profitSplitPct: number;
}

export const PORTFOLIO_PRESETS: PropFirmPreset[] = [
  {
    id: 'prop5k',
    accountType: 'PROP',
    label: 'Prop $5K (40%)',
    name: 'Prop Evaluation $5K',
    brokerName: 'Prop Firm · GHR v3.2',
    brokerServer: 'Prop-Eval-Server',
    initial: 5000,
    targetProfit: 400,
    minDays: 3,
    defaultRisk: 90,
    consistencyCapPct: 40,
    feeRefundUsd: 49,
    profitSplitPct: 90,
  },
  {
    id: 'prop6k',
    accountType: 'PROP',
    label: 'Prop $6K (40%)',
    name: 'Prop Evaluation $6K',
    brokerName: 'Prop Firm · GHR v3.2',
    brokerServer: 'Prop-Eval-Server',
    initial: 6000,
    targetProfit: 480,
    minDays: 5,
    defaultRisk: 120,
    consistencyCapPct: 40,
    feeRefundUsd: 59,
    profitSplitPct: 90,
  },
  {
    id: 'prop10k',
    accountType: 'PROP',
    label: 'Prop $10K (40%)',
    name: 'Prop Evaluation $10K',
    brokerName: 'Prop Firm · GHR v3.2',
    brokerServer: 'Prop-Eval-Server',
    initial: 10000,
    targetProfit: 800,
    minDays: 5,
    defaultRisk: 180,
    consistencyCapPct: 40,
    feeRefundUsd: 89,
    profitSplitPct: 90,
  },
  {
    id: 'prop25k',
    accountType: 'PROP',
    label: 'Prop $25K (30%)',
    name: 'Prop Evaluation $25K',
    brokerName: 'Prop Firm · GHR v3.2',
    brokerServer: 'Prop-Eval-Server',
    initial: 25000,
    targetProfit: 2000,
    minDays: 5,
    defaultRisk: 300,
    consistencyCapPct: 30,
    feeRefundUsd: 169,
    profitSplitPct: 80,
  },
  {
    id: 'prop50k',
    accountType: 'PROP',
    label: 'Prop $50K (30%)',
    name: 'Prop Evaluation $50K',
    brokerName: 'Prop Firm · GHR v3.2',
    brokerServer: 'Prop-Eval-Server',
    initial: 50000,
    targetProfit: 4000,
    minDays: 5,
    defaultRisk: 600,
    consistencyCapPct: 30,
    feeRefundUsd: 299,
    profitSplitPct: 80,
  },
  {
    id: 'personal_micro',
    accountType: 'PERSONAL',
    label: 'ส่วนตัว $500 (Micro)',
    name: 'Personal Live $500',
    brokerName: 'Personal Broker MT5',
    brokerServer: 'Broker-MT5Real',
    initial: 500,
    targetProfit: 150,
    minDays: 1,
    defaultRisk: 15,
    consistencyCapPct: 100,
    feeRefundUsd: 0,
    profitSplitPct: 100,
  },
  {
    id: 'personal_1k',
    accountType: 'PERSONAL',
    label: 'ส่วนตัว $1K (Standard)',
    name: 'Personal Standard $1K',
    brokerName: 'Personal Broker MT5',
    brokerServer: 'Broker-MT5Real',
    initial: 1000,
    targetProfit: 300,
    minDays: 1,
    defaultRisk: 30,
    consistencyCapPct: 100,
    feeRefundUsd: 0,
    profitSplitPct: 100,
  },
  {
    id: 'personal',
    accountType: 'PERSONAL',
    label: 'ส่วนตัว $3K (100%)',
    name: 'Personal Live $3K',
    brokerName: 'Personal Broker MT5',
    brokerServer: 'Broker-MT5Real',
    initial: 3000,
    targetProfit: 600,
    minDays: 1,
    defaultRisk: 60,
    consistencyCapPct: 100,
    feeRefundUsd: 0,
    profitSplitPct: 100,
  },
  {
    id: 'personal_10k',
    accountType: 'PERSONAL',
    label: 'ส่วนตัว $10K (100%)',
    name: 'Personal Live $10K',
    brokerName: 'Personal Broker MT5',
    brokerServer: 'Broker-MT5Real',
    initial: 10000,
    targetProfit: 2000,
    minDays: 1,
    defaultRisk: 150,
    consistencyCapPct: 100,
    feeRefundUsd: 0,
    profitSplitPct: 100,
  },
];

export const PROP_FIRM_PRESETS = PORTFOLIO_PRESETS;

export const DEFAULT_ACCOUNTS: Record<string, AccountInfo> = {
  port1: {
    id: 'port1',
    login: 'DEMO-6K',
    name: 'พอร์ตหลัก · Prop $6K',
    accountType: 'PROP',
    brokerName: 'Prop Firm · GHR v3.2',
    brokerServer: 'XAUUSD-Live',
    syncProvider: 'MANUAL_XLSX',
    initial: 6000.0,
    targetProfit: 480.0,
    minDays: 5,
    defaultRisk: 120,
    consistencyCapPct: 40,
    feeRefundUsd: 59,
    profitSplitPct: 90,
  },
  funded: {
    id: 'funded',
    login: 'FUNDED-90',
    name: 'พอร์ต 2 · Funded 90%',
    accountType: 'PROP',
    brokerName: 'Prop Firm · GHR v3.2',
    brokerServer: 'XAUUSD-Live',
    syncProvider: 'MANUAL_XLSX',
    initial: 6000.0,
    targetProfit: 360.0,
    minDays: 3,
    defaultRisk: 90,
    consistencyCapPct: 40,
    feeRefundUsd: 0,
    profitSplitPct: 90,
  },
};

export const CALCULATOR_CONTRACTS: Record<Exclude<CalculatorInstrument, 'CUSTOM'>, CalculatorContract> = {
  XAUUSD: { usdPerPriceMove: 100, priceDecimals: 2, pointsPerPrice: 100 },
  EURUSD: { usdPerPriceMove: 100000, priceDecimals: 5, pointsPerPrice: 100000 },
  GBPUSD: { usdPerPriceMove: 100000, priceDecimals: 5, pointsPerPrice: 100000 },
  USDJPY: { usdPerPriceMove: 100000, priceDecimals: 3, pointsPerPrice: 1000 },
  NAS100: { usdPerPriceMove: 1, priceDecimals: 2, pointsPerPrice: 100 },
  BTCUSD: { usdPerPriceMove: 1, priceDecimals: 2, pointsPerPrice: 100 },
};

export const DEFAULT_MANUAL_CALCULATOR: ManualCalculatorConfig = {
  instrument: 'XAUUSD',
  customContract: CALCULATOR_CONTRACTS.XAUUSD,
  sizing: 'BY_RISK',
  lotBasis: 'TOTAL',
  manualLot: 0.12,
  legCount: 3,
  distanceUnit: 'POINTS',
  sl: { unit: 'POINTS', value: 1000 },
  targets: [
    { unit: 'POINTS', value: 400 },
    { unit: 'POINTS', value: 800 },
    { unit: 'POINTS', value: 1200 },
  ],
  weights: [33.3, 33.3, 33.4],
  trailingLock: true,
};

export const GHR_PRESET_CALCULATOR: ManualCalculatorConfig = {
  ...DEFAULT_MANUAL_CALCULATOR,
  weights: [1, 1, 1],
};

export const DEFAULT_WORKSPACE_BRAND = 'TallyNX OS v5.0';
const LEGACY_WORKSPACE_BRAND = 'TallyNX OS v4.0';

export const DEFAULT_STATE: GhrWorkspaceState = {
  theme: 'aurora',
  privacyMasked: false,
  thbRate: 35.5,
  activePort: 'port1',
  calcDir: 'BUY',
  calcEntry: 4042.59,
  calcEntryRaw: '4042.59',
  calcRisk: 120,
  calcNote: '',
  calcMode: 'GHR_PRESET',
  manualCalculator: DEFAULT_MANUAL_CALCULATOR,
  quickGates: { g1: false, g2: false, g3: false, g4: false, g5: false },
  twelveGates: { ...DEFAULT_TWELVE_GATES },
  fiveStateProbs: { ...DEFAULT_FIVE_STATE_PROBS },
  goldenRulesAck: {
    r01: false,
    r02: false,
    r03: false,
    r04: false,
    r05: false,
    r06: false,
    r07: false,
    r08: false,
    r09: false,
    r10: false,
  },
  cooldownUntil: null,
  accounts: DEFAULT_ACCOUNTS,
  cycleDays: [
    { day: 1, note: 'วันที่ 1', profit: 0 },
    { day: 2, note: 'วันที่ 2', profit: 0 },
    { day: 3, note: 'วันที่ 3', profit: 0 },
  ],
  cycleDaysByPort: {},
  includeFeeRefund: false,
  consistencyOverrides: {},
  journalFilter: 'port1',
  journalStatusFilter: 'ALL',
  journalDateFilter: 'ALL',
  journalSessionFilter: 'ALL',
  journalSearch: '',
  showManualAddForm: false,
  showAddPortForm: false,
  showDbManager: false,
  showMt5Importer: false,
  mt5GroupMode: 'IDEA',
  mt5IncludeFees: true,
  mt5TimeOffset: 'AUTO_MT5',
  mt5RawReports: {},
  editingPortId: null,
  editingTradeId: null,
  inlineEditMode: false,
  autoSyncFormMetrics: true,
  autoCloudSync: true,
  apiEndpointUrl: '',
  apiSecretKey: '',
  lastSavedAt: null,
  journal: [],
  chatMessages: [
    {
      id: 'WELCOME-1',
      role: 'model',
      text: 'ถามเรื่องจุดเข้า 3-TP ความเสี่ยง 5 สถานะ เช็กลิสต์ 12-Gate แบบ Fail-Closed หรือเพดาน Consistency ใน GHR v3.2 เลือกหัวข้อด้านล่างหรือพิมพ์คำถามได้เลย',
      timestamp: '09:00',
      model: 'decision-1 → 3.5/3.1-flash-lite',
    },
  ],
  chatModel: 'auto',
  deskBrandName: DEFAULT_WORKSPACE_BRAND,
  deskBrandSubtitle: 'desk.tallynx.com · Real-Time Trading OS & Trade Journal',
  onboardingCompleted: false,
  showHelpGuide: false,
  showLicenseModal: false,
};

export function getBangkokIsoDate(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    const bangkokMs = date.getTime() + 7 * 60 * 60 * 1000;
    return new Date(bangkokMs).toISOString().slice(0, 10);
  }
}

export function getBangkokTimeHHMM(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    const bangkokMs = date.getTime() + 7 * 60 * 60 * 1000;
    return new Date(bangkokMs).toISOString().slice(11, 16);
  }
}

export function getBangkokTimestampStr(date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const map: Record<string, string> = {};
    parts.forEach((p) => {
      map[p.type] = p.value;
    });
    const hh = map.hour === '24' ? '00' : map.hour;
    return `${map.year}-${map.month}-${map.day} ${hh}:${map.minute}:${map.second}`;
  } catch {
    const bangkokMs = date.getTime() + 7 * 60 * 60 * 1000;
    return new Date(bangkokMs).toISOString().replace('T', ' ').slice(0, 19);
  }
}

export function createCleanWorkspaceState(overrides?: Partial<GhrWorkspaceState>): GhrWorkspaceState {
  const base: GhrWorkspaceState = JSON.parse(JSON.stringify(DEFAULT_STATE));
  return {
    ...base,
    ...overrides,
    onboardingCompleted: true,
    showHelpGuide: false,
    showLicenseModal: false,
    showDbManager: false,
  };
}

export function fmtUSD(n: number | string, plus = false): string {
  const val = Number(n) || 0;
  const sign = val < 0 ? '-' : plus && val > 0 ? '+' : '';
  return (
    sign +
    '$' +
    Math.abs(val).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export function fmtTHB(n: number | string): string {
  const val = Math.round(Number(n) || 0);
  return '฿' + val.toLocaleString('th-TH');
}

const LEGACY_BRAND_PATTERNS = [
  ['xp', 'firm'].join(''),
  ['nakhara', 'x'].join(''),
  'nakhara',
  'tredyn',
  'ghr v3.2',
  'engine)',
];

function isLegacyBrandString(val: unknown): boolean {
  const cleaned = String(val || '').trim().toLowerCase();
  if (!cleaned) return true;
  return LEGACY_BRAND_PATTERNS.some((token) => cleaned.includes(token));
}

export function sanitizeWorkspaceBrandName(val: unknown): string {
  const str = String(val || '').trim();
  if (!str) return DEFAULT_WORKSPACE_BRAND;
  if (isLegacyBrandString(str)) {
    // Older workspace migrations persist the v4 brand in their saved payload.
    return LEGACY_WORKSPACE_BRAND;
  }
  return str;
}

export function workspaceBrandDisplayName(value: unknown): string {
  const name = sanitizeWorkspaceBrandName(value);
  return name === LEGACY_WORKSPACE_BRAND ? DEFAULT_WORKSPACE_BRAND : name;
}

export function normalizeMergedState(parsed: Partial<GhrWorkspaceState> | null | undefined): GhrWorkspaceState {
  const merged: GhrWorkspaceState = {
    ...JSON.parse(JSON.stringify(DEFAULT_STATE)),
    ...(parsed || {}),
    theme: 'aurora',
  };

  if (typeof merged.calcEntryRaw !== 'string') {
    merged.calcEntryRaw = String(merged.calcEntry || 4042.59);
  }
  merged.calcMode = merged.calcMode === 'MANUAL' ? 'MANUAL' : 'GHR_PRESET';
  merged.manualCalculator = normalizeManualCalculator(merged.manualCalculator);
  if (!merged.consistencyOverrides || typeof merged.consistencyOverrides !== 'object' || Array.isArray(merged.consistencyOverrides)) {
    merged.consistencyOverrides = {};
  }
  if (!merged.accounts || typeof merged.accounts !== 'object' || Object.keys(merged.accounts).length === 0) {
    merged.accounts = JSON.parse(JSON.stringify(DEFAULT_ACCOUNTS));
  }
  if (!Array.isArray(merged.journal)) {
    merged.journal = [];
  }
  if (!Array.isArray(merged.cycleDays) || merged.cycleDays.length === 0) {
    merged.cycleDays = JSON.parse(JSON.stringify(DEFAULT_STATE.cycleDays));
  }
  if (!merged.cycleDaysByPort || typeof merged.cycleDaysByPort !== 'object' || Array.isArray(merged.cycleDaysByPort)) {
    merged.cycleDaysByPort = {};
  }
  if (!Array.isArray(merged.chatMessages) || merged.chatMessages.length === 0) {
    merged.chatMessages = JSON.parse(JSON.stringify(DEFAULT_STATE.chatMessages));
  }
  merged.chatModel = normalizeChatModelPreference(merged.chatModel);
  if (!merged.twelveGates || typeof merged.twelveGates !== 'object') {
    merged.twelveGates = { ...DEFAULT_TWELVE_GATES };
  } else {
    merged.twelveGates = {
      ...DEFAULT_TWELVE_GATES,
      ...merged.twelveGates,
    };
  }
  if (!merged.fiveStateProbs || typeof merged.fiveStateProbs !== 'object') {
    merged.fiveStateProbs = { ...DEFAULT_FIVE_STATE_PROBS };
  } else {
    merged.fiveStateProbs = {
      ...DEFAULT_FIVE_STATE_PROBS,
      ...merged.fiveStateProbs,
    };
  }
  if (!merged.goldenRulesAck || typeof merged.goldenRulesAck !== 'object') {
    merged.goldenRulesAck = { ...DEFAULT_STATE.goldenRulesAck };
  }
  if (!merged.mt5RawReports || typeof merged.mt5RawReports !== 'object') {
    merged.mt5RawReports = {};
  }
  if (!merged.mt5GroupMode) {
    merged.mt5GroupMode = 'IDEA';
  }
  if (typeof merged.mt5IncludeFees !== 'boolean') {
    merged.mt5IncludeFees = true;
  }
  const hadMt5TimeOffsetSetting =
    parsed?.mt5TimeOffset !== undefined && parsed?.mt5TimeOffset !== null;
  merged.mt5TimeOffset = normalizeMt5TimeOffsetSetting(parsed?.mt5TimeOffset);
  if (!merged.journalDateFilter) {
    merged.journalDateFilter = 'ALL';
  }
  if (!merged.journalSessionFilter) {
    merged.journalSessionFilter = 'ALL';
  }
  merged.deskBrandName = sanitizeWorkspaceBrandName(merged.deskBrandName);
  if (isLegacyBrandString(merged.deskBrandSubtitle)) {
    merged.deskBrandSubtitle = DEFAULT_STATE.deskBrandSubtitle;
  }
  merged.showHelpGuide = false;
  merged.showLicenseModal = false;

  const portKeys = Object.keys(merged.accounts);
  if (portKeys.length > 0 && !merged.accounts[merged.activePort]) {
    merged.activePort = portKeys[0];
  }
  if (merged.activePort && merged.accounts[merged.activePort] && merged.journalFilter !== 'ALL') {
    if (!merged.accounts[merged.journalFilter]) {
      merged.journalFilter = merged.activePort;
    }
  }

  // One-time lossless migration for workspaces cached before MT5->ICT timezone conversion existed
  if (!hadMt5TimeOffsetSetting && Object.keys(merged.mt5RawReports).length > 0) {
    let migratedAnyReport = false;
    const migratedReports = { ...merged.mt5RawReports };
    let nextJournal = [...merged.journal];
    Object.keys(migratedReports).forEach((pid) => {
      const report = migratedReports[pid];
      if (!report || !Array.isArray(report.positions) || report.positions.length === 0) return;
      const needsMigration = report.positions.some((p) => !p.rawOpenTime);
      if (!needsMigration) return;
      const migratedPositions = reapplyMt5TimezoneToPositions(
        report.positions,
        merged.mt5TimeOffset || 'AUTO_MT5'
      );
      migratedReports[pid] = { ...report, positions: migratedPositions };
      migratedAnyReport = true;
      const nonMt5 = nextJournal.filter((j) => !(j.port === pid && String(j.id).startsWith('MT5-')));
      const existingNotes = new Map<string, string>();
      nextJournal.forEach((j) => {
        if (j.port === pid && String(j.id).startsWith('MT5-') && j.note) {
          existingNotes.set(String(j.id), j.note);
        }
      });
      const rebuilt = convertMt5PositionsToJournalRows(
        report.meta,
        migratedPositions,
        pid,
        merged.mt5GroupMode || 'IDEA',
        merged.mt5IncludeFees !== false
      ).map((row) => {
        const prevNote = existingNotes.get(String(row.id));
        return prevNote && prevNote !== row.note ? { ...row, note: prevNote } : row;
      });
      nextJournal = [...rebuilt, ...nonMt5];
    });
    if (migratedAnyReport) {
      merged.mt5RawReports = migratedReports;
      merged.journal = nextJournal;
    }
  }

  return merged;
}

export function resolveAccountType(account?: Partial<AccountInfo> | null): AccountType {
  if (account?.accountType === 'PERSONAL' || account?.accountType === 'PROP') {
    return account.accountType;
  }
  if (account?.consistencyCapPct !== undefined && Number(account.consistencyCapPct) >= 100) {
    return 'PERSONAL';
  }
  return 'PROP';
}

export function getAccountComputed(
  accounts: Record<string, AccountInfo>,
  journal: TradeRecord[],
  pid: string
): AccountComputed {
  const fallback: AccountInfo = {
    id: 'none',
    login: '-',
    name: 'ยังไม่มีพอร์ต',
    accountType: 'PROP',
    initial: 6000.0,
    targetProfit: 480.0,
    minDays: 5,
    defaultRisk: 120,
  };
  const base = pid && accounts[pid] ? accounts[pid] : fallback;
  const accountType = resolveAccountType(base);
  const portTrades = pid ? journal.filter((j) => j.port === pid) : [];
  const profit = +portTrades.reduce((s, j) => s + (Number(j.pnlUsd) || 0), 0).toFixed(2);
  const balance = +(base.initial + profit).toFixed(2);
  const uniqueDates = new Set(portTrades.map((j) => j.date).filter(Boolean));
  const currentDays = uniqueDates.size;
  const rem = Math.max(0, +(base.targetProfit - profit).toFixed(2));
  const roiPct = base.initial > 0 ? +((profit / base.initial) * 100).toFixed(2) : 0;

  let badge = '';
  if (!pid || !accounts[pid]) {
    badge = 'รอสร้างพอร์ต';
  } else if (accountType === 'PERSONAL') {
    if (base.targetProfit > 0 && profit >= base.targetProfit) {
      badge = `ถึงเป้าสะสม (+${roiPct.toFixed(1)}%)`;
    } else if (profit > 0) {
      badge = `กำลังเติบโต +${roiPct.toFixed(1)}%`;
    } else if (profit < 0) {
      badge = `Drawdown ${roiPct.toFixed(1)}%`;
    } else {
      badge = 'พอร์ตส่วนตัว · พร้อมเทรด';
    }
  } else if (profit >= base.targetProfit && currentDays >= base.minDays) {
    badge = 'ผ่านเกณฑ์ครบ';
  } else if (profit >= base.targetProfit) {
    badge = `ผ่านกำไร · รอวัน (${currentDays}/${base.minDays})`;
  } else if (pid === 'funded') {
    badge = profit > 0 ? `กำไร +${fmtUSD(profit)}` : 'พร้อมเทรด 90%';
  } else {
    badge = rem > 0 ? `ขาดอีก ${fmtUSD(rem)}` : 'พร้อมเทรด';
  }

  return {
    ...base,
    accountType,
    profit,
    balance,
    currentDays,
    rem,
    roiPct,
    badge,
    tradeCount: portTrades.length,
  };
}

export interface CalcMetricsResult {
  isBuy: boolean;
  validEntry: number;
  risk: number;
  lotLeg: string;
  slPrice: string;
  tp1Price: string;
  tp2Price: string;
  tp3Price: string;
  usdTp1: number;
  usdTp2: number;
  usdTp3: number;
  fullSweepUsd: number;
  tlHitUsd: number;
  tp1OnlyUsd: number;
  fullSlUsd: number;
}

export function getCalcMetrics(calcDir: TradeDirection, calcEntry: number | string, calcRisk: number | string): CalcMetricsResult {
  const isBuy = calcDir === 'BUY';
  const parsedEntry = parseFloat(String(calcEntry));
  const validEntry = !isNaN(parsedEntry) && parsedEntry > 0 ? parsedEntry : 0;
  const risk = Number(calcRisk) || 120;
  const lotLeg = (risk / 3000).toFixed(2);

  const slNum = validEntry > 0 ? (isBuy ? validEntry - 10.0 : validEntry + 10.0) : 0;
  const tp1Num = validEntry > 0 ? (isBuy ? validEntry + 4.0 : validEntry - 4.0) : 0;
  const tp2Num = validEntry > 0 ? (isBuy ? validEntry + 8.0 : validEntry - 8.0) : 0;
  const tp3Num = validEntry > 0 ? (isBuy ? validEntry + 12.0 : validEntry - 12.0) : 0;

  const slPrice = validEntry > 0 && slNum > 0 ? slNum.toFixed(2) : '—';
  const tp1Price = validEntry > 0 && tp1Num > 0 ? tp1Num.toFixed(2) : '—';
  const tp2Price = validEntry > 0 && tp2Num > 0 ? tp2Num.toFixed(2) : '—';
  const tp3Price = validEntry > 0 && tp3Num > 0 ? tp3Num.toFixed(2) : '—';

  const usdTp1 = +((risk / 3) * 0.4).toFixed(2);
  const usdTp2 = +((risk / 3) * 0.8).toFixed(2);
  const usdTp3 = +((risk / 3) * 1.2).toFixed(2);

  const fullSweepUsd = +(usdTp1 + usdTp2 + usdTp3).toFixed(2);
  const tlHitUsd = +(usdTp1 + usdTp2 + usdTp1).toFixed(2);
  const tp1OnlyUsd = +(usdTp1 - 2 * (risk / 3)).toFixed(2);
  const fullSlUsd = -risk;

  return {
    isBuy,
    validEntry,
    risk,
    lotLeg,
    slPrice,
    tp1Price,
    tp2Price,
    tp3Price,
    usdTp1,
    usdTp2,
    usdTp3,
    fullSweepUsd,
    tlHitUsd,
    tp1OnlyUsd,
    fullSlUsd,
  };
}

export interface ComputeTradeParams {
  dir: TradeDirection;
  entry: number | string;
  risk: number | string;
  lotLeg?: number | string;
  slPrice?: number | string;
  tp1Price?: number | string;
  tp2Price?: number | string;
  tp3Price?: number | string;
  status?: TradeOutcomeStatus;
}

export function computeTradePricesAndMetrics(params: ComputeTradeParams) {
  const isBuy = params.dir === 'BUY';
  const entry = parseFloat(String(params.entry)) || 4000;
  const risk = parseFloat(String(params.risk)) || 120;
  const lotLeg =
    params.lotLeg !== undefined && params.lotLeg !== ''
      ? parseFloat(String(params.lotLeg))
      : +(risk / 3000).toFixed(2);

  const defaultSl = +(isBuy ? entry - 10 : entry + 10).toFixed(2);
  const defaultTp1 = +(isBuy ? entry + 4 : entry - 4).toFixed(2);
  const defaultTp2 = +(isBuy ? entry + 8 : entry - 8).toFixed(2);
  const defaultTp3 = +(isBuy ? entry + 12 : entry - 12).toFixed(2);

  const slPrice =
    params.slPrice !== undefined && params.slPrice !== '' ? parseFloat(String(params.slPrice)) : defaultSl;
  const tp1Price =
    params.tp1Price !== undefined && params.tp1Price !== '' ? parseFloat(String(params.tp1Price)) : defaultTp1;
  const tp2Price =
    params.tp2Price !== undefined && params.tp2Price !== '' ? parseFloat(String(params.tp2Price)) : defaultTp2;
  const tp3Price =
    params.tp3Price !== undefined && params.tp3Price !== '' ? parseFloat(String(params.tp3Price)) : defaultTp3;

  let tp1Pts = 0,
    tp2Pts = 0,
    tp3Pts = 0,
    slPts = 0,
    totalPts = 0,
    rr = 0,
    pnlUsd = 0;
  const status: TradeOutcomeStatus = params.status || 'FULL_SWEEP';

  if (status === 'FULL_SWEEP') {
    tp1Pts = 400;
    tp2Pts = 800;
    tp3Pts = 1200;
    slPts = 0;
    totalPts = 2400;
    rr = 0.8;
    pnlUsd = +(risk * 0.8).toFixed(2);
  } else if (status === 'TRAILING_LOCK') {
    tp1Pts = 400;
    tp2Pts = 800;
    tp3Pts = 400;
    slPts = 0;
    totalPts = 1600;
    rr = 0.533;
    pnlUsd = +((risk / 3) * 1.6).toFixed(2);
  } else if (status === 'TP1_ONLY') {
    tp1Pts = 400;
    tp2Pts = 0;
    tp3Pts = 0;
    slPts = -2000;
    totalPts = -1600;
    rr = -0.533;
    pnlUsd = -((risk / 3) * 1.6).toFixed(2);
  } else if (status === 'BREAK_EVEN') {
    tp1Pts = 0;
    tp2Pts = 0;
    tp3Pts = 0;
    slPts = 0;
    totalPts = 0;
    rr = 0.0;
    pnlUsd = 0.0;
  } else if (status === 'FULL_SL') {
    tp1Pts = 0;
    tp2Pts = 0;
    tp3Pts = 0;
    slPts = -3000;
    totalPts = -3000;
    rr = -1.0;
    pnlUsd = -risk;
  }

  return {
    entry,
    risk,
    lotLeg,
    slPrice,
    tp1Price,
    tp2Price,
    tp3Price,
    tp1Pts,
    tp2Pts,
    tp3Pts,
    slPts,
    totalPts,
    rr,
    pnlUsd,
    status,
  };
}

function finiteNumber(value: unknown, fallback = 0): number {
  if (value == null || value === '') return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return Math.min(max, Math.max(min, finiteNumber(value, fallback)));
}

export function normalizeManualCalculator(config?: Partial<ManualCalculatorConfig>): ManualCalculatorConfig {
  const defaults = DEFAULT_MANUAL_CALCULATOR;
  const instrument = config?.instrument;
  const contract = config?.customContract;
  const level = (input: CalculatorLevelInput | undefined, fallback: CalculatorLevelInput): CalculatorLevelInput => ({
    unit: input?.unit === 'EXACT_PRICE' || input?.unit === 'PRICE_DISTANCE' ? input.unit : 'POINTS',
    value: Math.max(0, finiteNumber(input?.value, fallback.value)),
  });

  return {
    instrument: instrument === 'CUSTOM' || (instrument && Object.hasOwn(CALCULATOR_CONTRACTS, instrument)) ? instrument : defaults.instrument,
    customContract: {
      usdPerPriceMove: Math.max(0, finiteNumber(contract?.usdPerPriceMove, defaults.customContract.usdPerPriceMove)),
      pointsPerPrice: Math.max(0, finiteNumber(contract?.pointsPerPrice, defaults.customContract.pointsPerPrice)),
      priceDecimals: Math.round(clampNumber(contract?.priceDecimals, 2, 5, 2)) as CalculatorContract['priceDecimals'],
    },
    sizing: config?.sizing === 'BY_LOT' ? 'BY_LOT' : 'BY_RISK',
    lotBasis: config?.lotBasis === 'PER_LEG' ? 'PER_LEG' : 'TOTAL',
    manualLot: Math.max(0, finiteNumber(config?.manualLot, defaults.manualLot)),
    legCount: config?.legCount === 1 || config?.legCount === 2 ? config.legCount : 3,
    distanceUnit: config?.distanceUnit === 'PRICE_DISTANCE' ? 'PRICE_DISTANCE' : 'POINTS',
    sl: level(config?.sl, defaults.sl),
    targets: [
      level(config?.targets?.[0], defaults.targets[0]),
      level(config?.targets?.[1], defaults.targets[1]),
      level(config?.targets?.[2], defaults.targets[2]),
    ],
    weights: [
      Math.max(0, finiteNumber(config?.weights?.[0], defaults.weights[0])),
      Math.max(0, finiteNumber(config?.weights?.[1], defaults.weights[1])),
      Math.max(0, finiteNumber(config?.weights?.[2], defaults.weights[2])),
    ],
    trailingLock: typeof config?.trailingLock === 'boolean' ? config.trailingLock : defaults.trailingLock,
  };
}

export function getCalculatorContract(config: ManualCalculatorConfig, entry: number): CalculatorContract {
  if (config.instrument === 'CUSTOM') return config.customContract;
  const preset = CALCULATOR_CONTRACTS[config.instrument];
  if (config.instrument !== 'USDJPY') return preset;
  // Standard FX lot in JPY, converted to USD at the modeled entry rate.
  return { ...preset, usdPerPriceMove: entry > 0 ? preset.usdPerPriceMove / entry : 0 };
}

type CalculatorOutcome = Pick<TradeRecord, 'tp1Pts' | 'tp2Pts' | 'tp3Pts' | 'slPts' | 'totalPts' | 'rr' | 'pnlUsd'>;

export function calculateManualTrade(dir: TradeDirection, rawEntry: number | string, rawRisk: number | string, config: ManualCalculatorConfig) {
  const sign = dir === 'BUY' ? 1 : -1;
  const inputEntry = finiteNumber(rawEntry);
  const entry = +inputEntry.toFixed(getCalculatorContract(config, inputEntry).priceDecimals);
  const contract = getCalculatorContract(config, entry);
  const { priceDecimals, pointsPerPrice, usdPerPriceMove } = contract;
  const resolveLevel = (input: CalculatorLevelInput, side: number) => {
    const distance = input.unit === 'POINTS' ? input.value / pointsPerPrice : input.value;
    const price = input.unit === 'EXACT_PRICE'
      ? +input.value.toFixed(priceDecimals)
      : entry > 0 ? +(entry + side * distance).toFixed(priceDecimals) : 0;
    const priceDistance = input.unit === 'EXACT_PRICE' || entry > 0
      ? +((price - entry) * side).toFixed(priceDecimals)
      : +distance.toFixed(priceDecimals);
    return { price, priceDistance, points: +(priceDistance * pointsPerPrice).toFixed(8) };
  };

  const sl = resolveLevel(config.sl, -sign);
  const perLegLot = config.sizing === 'BY_LOT' && config.lotBasis === 'PER_LEG';
  const weights = config.weights.slice(0, config.legCount).map((weight) => perLegLot || config.legCount === 1 ? 1 : weight);
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const riskPerLot = sl.priceDistance * usdPerPriceMove;
  const totalLot = config.sizing === 'BY_LOT'
    ? config.manualLot * (perLegLot ? config.legCount : 1)
    : riskPerLot > 0 ? finiteNumber(rawRisk) / riskPerLot : 0;
  const risk = totalLot > 0 && riskPerLot > 0
    ? config.sizing === 'BY_RISK' ? finiteNumber(rawRisk) : totalLot * riskPerLot
    : 0;

  const legs = config.targets.slice(0, config.legCount).map((target, index) => {
    const level = resolveLevel(target, sign);
    const weight = weightSum > 0 ? weights[index] / weightSum : 0;
    const lot = perLegLot ? config.manualLot : totalLot * weight;
    const grossUsd = level.priceDistance * usdPerPriceMove * lot;
    return {
      ...level,
      lot,
      sharePct: weight * 100,
      grossUsd,
      pnlUsd: +grossUsd.toFixed(2),
      rr: risk > 0 ? grossUsd / risk : 0,
    };
  });

  const stopsValid = sl.price > 0 && sl.priceDistance > 0;
  const targetsValid = legs.every((leg, index) =>
    leg.price > 0 && leg.priceDistance > (index === 0 ? 0 : legs[index - 1].priceDistance)
  );
  const sizingValid = Number.isFinite(pointsPerPrice) && pointsPerPrice > 0
    && Number.isFinite(risk) && risk > 0 && Number.isFinite(totalLot) && totalLot > 0
    && legs.every((leg) => Number.isFinite(leg.grossUsd) && Number.isFinite(leg.lot) && leg.lot > 0);
  const validation = entry <= 0 ? 'ENTRY' : !stopsValid || !targetsValid ? 'LEVELS' : !sizingValid ? 'SIZING' : null;

  const outcome = (hits: number, locked = false, breakEven = false): CalculatorOutcome => {
    const points = legs.map((leg, index) => (index < hits ? leg.points : locked ? legs[0].points : 0));
    const slPts = locked || breakEven || hits === legs.length ? 0 : -(legs.length - hits) * sl.points;
    const grossUsd = breakEven ? 0 : legs.reduce((sum, leg, index) =>
      sum + (index < hits ? leg.grossUsd : locked ? legs[0].priceDistance * usdPerPriceMove * leg.lot : -riskPerLot * leg.lot), 0
    );
    return {
      tp1Pts: points[0] ?? 0,
      tp2Pts: points[1] ?? 0,
      tp3Pts: points[2] ?? 0,
      slPts,
      totalPts: +(points.reduce((sum, pts) => sum + pts, slPts).toFixed(8)),
      rr: risk > 0 ? grossUsd / risk : 0,
      pnlUsd: +grossUsd.toFixed(2),
    };
  };

  return {
    instrument: config.instrument,
    contract,
    entry,
    risk,
    totalLot,
    sl,
    legs,
    isValid: validation === null,
    validation,
    outcomes: {
      FULL_SWEEP: outcome(legs.length),
      TRAILING_LOCK: config.trailingLock && legs.length === 3 ? outcome(2, true) : null,
      TP1_ONLY: outcome(1),
      FULL_SL: { ...outcome(0), rr: risk > 0 ? -1 : 0, pnlUsd: +(-risk).toFixed(2) },
      BREAK_EVEN: outcome(0, false, true),
    },
  };
}

export function getActiveCalculator(state: GhrWorkspaceState) {
  const manual = state.calcMode === 'MANUAL';
  return calculateManualTrade(
    state.calcDir,
    state.calcEntry,
    manual ? state.calcRisk : Number(state.calcRisk) || 120,
    manual ? (state.manualCalculator ?? DEFAULT_MANUAL_CALCULATOR) : GHR_PRESET_CALCULATOR,
  );
}

export function buildCalculatorTradeFields(
  calc: ReturnType<typeof calculateManualTrade>,
  status: TradeOutcomeStatus,
  includeDetails = true,
): Omit<TradeRecord, 'id' | 'port' | 'date' | 'time' | 'dir' | 'note'> | null {
  const outcome = status === 'CUSTOM' ? null : calc.outcomes[status];
  if (!calc.isValid || !outcome) return null;
  return {
    ...outcome,
    status,
    entry: calc.entry,
    risk: calc.risk,
    lotLeg: calc.legs[0].lot,
    slPrice: calc.sl.price,
    tp1Price: calc.legs[0].price,
    tp2Price: calc.legs[1]?.price ?? 0,
    tp3Price: calc.legs[2]?.price ?? 0,
    ...(includeDetails ? { calculatorDetails: {
      instrument: calc.instrument,
      contract: calc.contract,
      totalLot: calc.totalLot,
      legLots: calc.legs.map((leg) => leg.lot),
    } } : {}),
  };
}

export function formatCalculatorLot(lot: number): string {
  if (!Number.isFinite(lot) || lot <= 0) return '—';
  return lot < 1e-10 ? lot.toPrecision(10) : new Intl.NumberFormat('en-US', {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 10,
  }).format(lot);
}

export type ConsistencyRuleOptions = Partial<Omit<ConsistencyRule, 'includeFeeRefund'>>;

export function getActiveConsistencyRule(state: GhrWorkspaceState): ConsistencyRule {
  const account = state.accounts[state.activePort];
  const override = state.consistencyOverrides?.[state.activePort];
  const isPersonal = resolveAccountType(account) === 'PERSONAL';
  const accountCap = account?.consistencyCapPct ?? (isPersonal ? 100 : 40);
  const consistencyCapPct = clampNumber(override?.consistencyCapPct, 5, 100, accountCap <= 0 ? 100 : accountCap);
  const hasCap = accountCap > 0 && accountCap < 100;
  return {
    consistencyCapPct,
    minDays: Math.round(clampNumber(override?.minDays, 1, 30, account?.minDays ?? (hasCap ? 3 : 1))),
    minTotalUsd: clampNumber(override?.minTotalUsd, 0, Infinity, hasCap ? 120 : 1),
    profitSplitPct: clampNumber(override?.profitSplitPct, 10, 100, account?.profitSplitPct ?? 90),
    feeRefundUsd: clampNumber(override?.feeRefundUsd, 0, Infinity, account?.feeRefundUsd ?? (isPersonal ? 0 : 59)),
    includeFeeRefund: typeof override?.includeFeeRefund === 'boolean' ? override.includeFeeRefund : state.includeFeeRefund,
  };
}

export function evaluateConsistencyRule(
  cycleDays: CycleDay[],
  includeFeeRefund: boolean,
  thbRate: number,
  options?: ConsistencyRuleOptions
) {
  const capPct = finiteNumber(options?.consistencyCapPct, 40);
  const hasConsistencyCap = capPct > 0 && capPct < 100;
  const feeRefundUsd = clampNumber(options?.feeRefundUsd, 0, Infinity, 59);
  const profitSplitPct = clampNumber(options?.profitSplitPct, 10, 100, 90);
  const minTotalUsd = clampNumber(options?.minTotalUsd, 0, Infinity, hasConsistencyCap ? 120 : 1);
  const minDays = Math.round(clampNumber(options?.minDays, 1, 30, hasConsistencyCap ? 3 : 1));

  const profits = cycleDays.map((d) => finiteNumber(d.profit));
  const totalProfit = +profits.reduce((sum, profit) => sum + profit, 0).toFixed(2);
  const bestDay = profits.reduce((best, profit) => Math.max(best, profit), 0);
  const bestDayPct = totalProfit > 0 ? (bestDay / totalProfit) * 100 : bestDay > 0 ? 100 : 0;
  const capPassed = !hasConsistencyCap || bestDayPct <= capPct + 0.001;
  const tradingDaysCount = cycleDays.filter((day, index) => cycleDayDate(day) || profits[index] !== 0).length;
  const losingDaysCount = profits.filter((profit) => profit < 0).length;
  const isPass = totalProfit >= minTotalUsd && capPassed && tradingDaysCount >= minDays;

  const minTotalNeeded =
    hasConsistencyCap && bestDay > 0 ? Math.max(minTotalUsd, bestDay / (capPct / 100)) : minTotalUsd;
  const extraProfitNeeded = Math.max(0, Math.ceil((minTotalNeeded - totalProfit) * 100 - 1e-9) / 100);

  const shareUsd = +(Math.max(0, totalProfit) * (profitSplitPct / 100)).toFixed(2);
  const netPayoutUsd = +(shareUsd + (includeFeeRefund ? feeRefundUsd : 0)).toFixed(2);
  const netPayoutThb = Math.round(netPayoutUsd * Math.max(0, finiteNumber(thbRate)));

  return {
    totalProfit,
    bestDay,
    bestDayPct,
    isPass,
    capPct,
    capPassed,
    hasConsistencyCap,
    tradingDaysCount,
    losingDaysCount,
    minDays,
    minTotalUsd,
    profitSplitPct,
    feeRefundUsd,
    minTotalNeeded,
    extraProfitNeeded,
    share90Usd: shareUsd,
    netPayoutUsd,
    netPayoutThb,
  };
}

export function isPlaceholderDayNote(note: string | undefined, dayNumber: number): boolean {
  if (!note) return true;
  const trimmed = note.trim();
  return trimmed === '' || trimmed === `วันที่ ${dayNumber}` || trimmed === 'เพิ่มวัน';
}

export function updateCycleDayEntry(
  cycleDays: CycleDay[],
  idx: number,
  patch: Partial<Pick<CycleDay, 'profit' | 'note'>>
): CycleDay[] {
  return cycleDays.map((item, i) => {
    if (i !== idx) return item;
    const nextProfit =
      patch.profit !== undefined ? +finiteNumber(patch.profit, item.profit).toFixed(2) : item.profit;
    const nextNote = patch.note !== undefined ? patch.note : item.note;
    return {
      ...item,
      profit: nextProfit,
      note: nextNote,
    };
  });
}

function cycleDayDate(day: CycleDay): string | undefined {
  return day.date || /^\d{4}-\d{2}-\d{2}(?=$| ·)/.exec(day.note || '')?.[0];
}

export function recordCycleDayPnl(cycleDays: CycleDay[], date: string, pnl: number): CycleDay[] {
  const matchingIndex = cycleDays.findIndex((day) => cycleDayDate(day) === date);
  const hasDatedDays = cycleDays.some(cycleDayDate);
  const emptyIndex = cycleDays.findIndex((day) =>
    !cycleDayDate(day) && finiteNumber(day.profit) === 0 && isPlaceholderDayNote(day.note, day.day)
  );
  const index = matchingIndex >= 0
    ? matchingIndex
    : !hasDatedDays && cycleDays.some((day) => finiteNumber(day.profit) !== 0)
      ? cycleDays.length - 1
      : emptyIndex;
  if (index < 0) {
    return [...cycleDays, { day: cycleDays.length + 1, date, note: '', profit: +finiteNumber(pnl).toFixed(2) }];
  }
  return cycleDays.map((day, i) => i === index
    ? { ...day, date, profit: +(finiteNumber(day.profit) + finiteNumber(pnl)).toFixed(2) }
    : day
  );
}

export function syncCycleDaysWithJournal(
  existingDays: CycleDay[],
  journal: TradeRecord[],
  portId: string
): CycleDay[] {
  const portTrades = journal.filter((j) => j.port === portId);
  if (portTrades.length === 0) return existingDays;

  const byDate = new Map<string, { pnl: number; notes: Set<string> }>();
  portTrades.forEach((t) => {
    const date = t.date || '';
    const summary = byDate.get(date) ?? { pnl: 0, notes: new Set<string>() };
    summary.pnl += finiteNumber(t.pnlUsd);
    const note = t.note?.trim();
    if (note) summary.notes.add(note);
    byDate.set(date, summary);
  });

  const datedDays = new Map<string, CycleDay>();
  for (const day of existingDays) {
    const date = cycleDayDate(day);
    if (date) datedDays.set(date, day);
  }
  const sortedDays = [...byDate.entries()].sort(([dateA], [dateB]) => dateA.localeCompare(dateB));
  const syncedDays: CycleDay[] = sortedDays.map(([date, summary], idx) => {
    const atIndex = existingDays[idx];
    const prevDay = datedDays.get(date)
      ?? (atIndex && !cycleDayDate(atIndex) ? atIndex : undefined);
    const hasCustomPrevNote =
      prevDay && !isPlaceholderDayNote(prevDay.note, prevDay.day) && !/^\d{4}-\d{2}-\d{2}(?:$| ·)/.test(prevDay.note.trim());
    const tradeNotesSummary = [...summary.notes].slice(0, 2).join(', ');
    const defaultSyncedNote = [date, tradeNotesSummary].filter(Boolean).join(' · ');

    return {
      day: idx + 1,
      ...(date ? { date } : {}),
      note: hasCustomPrevNote ? prevDay.note : defaultSyncedNote,
      profit: +summary.pnl.toFixed(2),
    };
  });

  while (syncedDays.length < 3) {
    const idx = syncedDays.length;
    const prevDay = existingDays[idx];
    const keepNote = prevDay && !cycleDayDate(prevDay) && !isPlaceholderDayNote(prevDay.note, idx + 1) ? prevDay.note : '';
    syncedDays.push({
      day: idx + 1,
      note: keepNote,
      profit: 0,
    });
  }

  return syncedDays;
}

export function getSavedCycleDaysForPort(state: GhrWorkspaceState, portId: string): CycleDay[] {
  if (state.activePort === portId) return state.cycleDays;
  const saved = state.cycleDaysByPort?.[portId];
  return Array.isArray(saved) && saved.length > 0 ? saved : DEFAULT_STATE.cycleDays;
}

export function carryCycleDaysOnPortChange(previous: GhrWorkspaceState, next: GhrWorkspaceState): GhrWorkspaceState {
  // A workspace replacement (for example, snapshot restore) supplies its own worksheets.
  if (previous.activePort === next.activePort || previous.cycleDaysByPort !== next.cycleDaysByPort) return next;
  const saved = getSavedCycleDaysForPort(previous, next.activePort);
  const cycleDaysByPort = { ...next.cycleDaysByPort };
  if (Object.hasOwn(next.accounts, previous.activePort)) cycleDaysByPort[previous.activePort] = previous.cycleDays;
  delete cycleDaysByPort[next.activePort];
  const cycleDays = next.cycleDays !== previous.cycleDays
    ? next.cycleDays
    : saved === DEFAULT_STATE.cycleDays ? syncCycleDaysWithJournal(saved, next.journal, next.activePort) : saved;
  return { ...next, cycleDays, cycleDaysByPort };
}

export type ConsistencyDayStatus =
  | 'MET_40'
  | 'POSITIVE_OVER_40'
  | 'NEGATIVE'
  | 'BREAK_EVEN'
  | 'NO_TRADE';

export interface SevenDayHeatmapCell {
  date: string;
  weekdayShort: string;
  shortDate: string;
  pnl: number;
  tradeCount: number;
  sharePct: number;
  status: ConsistencyDayStatus;
}

export interface SevenDayConsistencySummary {
  days: SevenDayHeatmapCell[];
  totalProfitBasis: number;
  metCount: number;
  over40Count: number;
  positiveCount: number;
  activeDays: number;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function shiftIsoDateUtc(baseIsoDate: string, deltaDays: number): string {
  const parts = baseIsoDate.split('-').map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    const bangkokToday = getBangkokIsoDate();
    return shiftIsoDateUtc(bangkokToday, deltaDays);
  }
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + deltaDays));
  return dt.toISOString().slice(0, 10);
}

export function buildSevenDayConsistencyCalendar(
  trades: TradeRecord[],
  referenceDateStr?: string,
  capPct = 40,
): SevenDayConsistencySummary {
  const refDate =
    referenceDateStr && /^\d{4}-\d{2}-\d{2}$/.test(referenceDateStr)
      ? referenceDateStr
      : getBangkokIsoDate();

  const byDate: Record<string, { pnl: number; count: number }> = {};
  let totalNetPnl = 0;

  trades.forEach((t) => {
    const d = (t.date || '').slice(0, 10);
    const pnl = Number(t.pnlUsd) || 0;
    totalNetPnl += pnl;
    if (!d) return;
    if (!byDate[d]) {
      byDate[d] = { pnl: 0, count: 0 };
    }
    byDate[d].pnl = +(byDate[d].pnl + pnl).toFixed(2);
    byDate[d].count += 1;
  });

  const sumPositiveDays = Object.values(byDate).reduce(
    (sum, item) => sum + (item.pnl > 0 ? item.pnl : 0),
    0
  );
  const totalProfitBasis = +(totalNetPnl > 0 ? totalNetPnl : sumPositiveDays).toFixed(2);

  const days: SevenDayHeatmapCell[] = [];
  let metCount = 0;
  let over40Count = 0;
  let positiveCount = 0;
  let activeDays = 0;

  for (let offset = -6; offset <= 0; offset += 1) {
    const iso = shiftIsoDateUtc(refDate, offset);
    const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
    const utcDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const entry = byDate[iso];
    const tradeCount = entry ? entry.count : 0;
    const pnl = entry ? entry.pnl : 0;

    let sharePct = 0;
    let status: ConsistencyDayStatus = 'NO_TRADE';

    if (tradeCount > 0) {
      activeDays += 1;
      if (pnl > 0) {
        positiveCount += 1;
        sharePct = totalProfitBasis > 0 ? +((pnl / totalProfitBasis) * 100).toFixed(1) : 100;
        if (capPct >= 100 || sharePct <= capPct + 0.001) {
          status = 'MET_40';
          metCount += 1;
        } else {
          status = 'POSITIVE_OVER_40';
          over40Count += 1;
        }
      } else if (pnl < 0) {
        status = 'NEGATIVE';
      } else {
        status = 'BREAK_EVEN';
      }
    }

    days.push({
      date: iso,
      weekdayShort: WEEKDAY_SHORT[utcDay] || '',
      shortDate: `${iso.slice(5, 7)}/${iso.slice(8, 10)}`,
      pnl,
      tradeCount,
      sharePct,
      status,
    });
  }

  return {
    days,
    totalProfitBasis,
    metCount,
    over40Count,
    positiveCount,
    activeDays,
  };
}

export interface MonthlyCalendarCell {
  date: string;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  weekdayIndex: number;
  weekdayShort: string;
  pnl: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  breakEvenCount: number;
  sharePct: number;
  status: ConsistencyDayStatus;
}

export interface MonthlyConsistencySummary {
  monthKey: string;
  year: number;
  monthIndex: number;
  monthLabel: string;
  capPct: number;
  hasConsistencyCap: boolean;
  cells: MonthlyCalendarCell[];
  monthlyNetPnl: number;
  totalProfitBasis: number;
  activeDays: number;
  winningDays: number;
  losingDays: number;
  breakEvenDays: number;
  dayWinRatePct: number;
  metCapCount: number;
  overCapCount: number;
  bestDayDate: string | null;
  bestDayPnl: number;
  bestDaySharePct: number;
  worstDayDate: string | null;
  worstDayPnl: number;
  longestWinStreak: number;
  longestLossStreak: number;
  tradesCount: number;
}

const MONTH_SHORT_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function parseMonthKey(monthKey: string | undefined, fallbackIsoDate: string): { year: number; monthIndex: number; normalized: string } {
  const match = /^(\d{4})-(\d{2})$/.exec((monthKey || '').trim());
  if (match) {
    const y = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
      return {
        year: y,
        monthIndex: m - 1,
        normalized: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`,
      };
    }
  }
  const fbMatch = /^(\d{4})-(\d{2})/.exec(fallbackIsoDate);
  const y = fbMatch ? parseInt(fbMatch[1], 10) : 2026;
  const m = fbMatch ? parseInt(fbMatch[2], 10) : 1;
  return {
    year: y,
    monthIndex: m - 1,
    normalized: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`,
  };
}

export function shiftMonthKey(monthKey: string, deltaMonths: number): string {
  const { year, monthIndex } = parseMonthKey(monthKey, getBangkokIsoDate());
  const dt = new Date(Date.UTC(year, monthIndex + deltaMonths, 1));
  const nextYear = dt.getUTCFullYear();
  const nextMonth = dt.getUTCMonth() + 1;
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}`;
}

export function getDefaultCalendarMonthKey(
  trades: TradeRecord[],
  referenceDateStr?: string
): string {
  const refDate =
    referenceDateStr && /^\d{4}-\d{2}-\d{2}$/.test(referenceDateStr)
      ? referenceDateStr
      : getBangkokIsoDate();
  const currentMonth = refDate.slice(0, 7);
  if (!Array.isArray(trades) || trades.length === 0) {
    return currentMonth;
  }
  const hasCurrentMonthTrades = trades.some((t) => (t.date || '').slice(0, 7) === currentMonth);
  if (hasCurrentMonthTrades) {
    return currentMonth;
  }
  let latestMonth = '';
  trades.forEach((t) => {
    const mk = (t.date || '').slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(mk) && mk > latestMonth) {
      latestMonth = mk;
    }
  });
  return latestMonth || currentMonth;
}

export interface MonthlyCalendarOptions {
  monthKey?: string;
  referenceDateStr?: string;
  consistencyCapPct?: number;
}

export function buildMonthlyConsistencyCalendar(
  trades: TradeRecord[],
  options?: MonthlyCalendarOptions
): MonthlyConsistencySummary {
  const refDate =
    options?.referenceDateStr && /^\d{4}-\d{2}-\d{2}$/.test(options.referenceDateStr)
      ? options.referenceDateStr
      : getBangkokIsoDate();

  const { year, monthIndex, normalized: monthKey } = parseMonthKey(options?.monthKey, refDate);
  const rawCap =
    options?.consistencyCapPct !== undefined ? Number(options.consistencyCapPct) : 40;
  const capPct = Number.isFinite(rawCap) && rawCap > 0 ? rawCap : 40;
  const hasConsistencyCap = capPct > 0 && capPct < 100;

  const byDate: Record<
    string,
    { pnl: number; count: number; winCount: number; lossCount: number; breakEvenCount: number }
  > = {};

  let monthlyNetPnl = 0;
  let tradesCount = 0;

  trades.forEach((t) => {
    const d = (t.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    if (d.slice(0, 7) !== monthKey) return;

    const pnl = Number(t.pnlUsd) || 0;
    monthlyNetPnl = +(monthlyNetPnl + pnl).toFixed(2);
    tradesCount += 1;

    if (!byDate[d]) {
      byDate[d] = { pnl: 0, count: 0, winCount: 0, lossCount: 0, breakEvenCount: 0 };
    }
    byDate[d].pnl = +(byDate[d].pnl + pnl).toFixed(2);
    byDate[d].count += 1;
    if (pnl > 0) byDate[d].winCount += 1;
    else if (pnl < 0) byDate[d].lossCount += 1;
    else byDate[d].breakEvenCount += 1;
  });

  const sumPositiveDays = Object.values(byDate).reduce(
    (sum, item) => sum + (item.pnl > 0 ? item.pnl : 0),
    0
  );
  const totalProfitBasis = +(monthlyNetPnl > 0 ? monthlyNetPnl : sumPositiveDays).toFixed(2);

  let activeDays = 0;
  let winningDays = 0;
  let losingDays = 0;
  let breakEvenDays = 0;
  let metCapCount = 0;
  let overCapCount = 0;
  let bestDayDate: string | null = null;
  let bestDayPnl = 0;
  let bestDaySharePct = 0;
  let worstDayDate: string | null = null;
  let worstDayPnl = 0;
  let longestWinStreak = 0;
  let longestLossStreak = 0;
  let curWinStreak = 0;
  let curLossStreak = 0;

  const sortedActiveDates = Object.keys(byDate).sort();
  const statusMap: Record<string, { status: ConsistencyDayStatus; sharePct: number }> = {};

  sortedActiveDates.forEach((iso) => {
    const entry = byDate[iso];
    activeDays += 1;

    if (entry.pnl > 0) {
      winningDays += 1;
      curWinStreak += 1;
      curLossStreak = 0;
      if (curWinStreak > longestWinStreak) longestWinStreak = curWinStreak;

      const sharePct =
        totalProfitBasis > 0 ? +((entry.pnl / totalProfitBasis) * 100).toFixed(1) : 100;

      if (!hasConsistencyCap || sharePct <= capPct + 0.001) {
        statusMap[iso] = { status: 'MET_40', sharePct };
        metCapCount += 1;
      } else {
        statusMap[iso] = { status: 'POSITIVE_OVER_40', sharePct };
        overCapCount += 1;
      }

      if (bestDayDate === null || entry.pnl > bestDayPnl) {
        bestDayDate = iso;
        bestDayPnl = entry.pnl;
        bestDaySharePct = sharePct;
      }
    } else if (entry.pnl < 0) {
      losingDays += 1;
      curLossStreak += 1;
      curWinStreak = 0;
      if (curLossStreak > longestLossStreak) longestLossStreak = curLossStreak;

      statusMap[iso] = { status: 'NEGATIVE', sharePct: 0 };

      if (worstDayDate === null || entry.pnl < worstDayPnl) {
        worstDayDate = iso;
        worstDayPnl = entry.pnl;
      }
    } else {
      breakEvenDays += 1;
      curWinStreak = 0;
      curLossStreak = 0;
      statusMap[iso] = { status: 'BREAK_EVEN', sharePct: 0 };
    }
  });

  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  const cells: MonthlyCalendarCell[] = [];
  for (let i = 0; i < totalCells; i += 1) {
    const dt = new Date(Date.UTC(year, monthIndex, 1 + i - firstWeekday));
    const iso = dt.toISOString().slice(0, 10);
    const isCurrentMonth = iso.slice(0, 7) === monthKey;
    const entry = isCurrentMonth ? byDate[iso] : undefined;
    const resolved = isCurrentMonth ? statusMap[iso] : undefined;

    cells.push({
      date: iso,
      dayOfMonth: dt.getUTCDate(),
      isCurrentMonth,
      isToday: iso === refDate,
      weekdayIndex: dt.getUTCDay(),
      weekdayShort: WEEKDAY_SHORT[dt.getUTCDay()] || '',
      pnl: entry ? entry.pnl : 0,
      tradeCount: entry ? entry.count : 0,
      winCount: entry ? entry.winCount : 0,
      lossCount: entry ? entry.lossCount : 0,
      breakEvenCount: entry ? entry.breakEvenCount : 0,
      sharePct: resolved ? resolved.sharePct : 0,
      status: resolved ? resolved.status : 'NO_TRADE',
    });
  }

  const dayWinRatePct =
    activeDays > 0 ? +((winningDays / activeDays) * 100).toFixed(1) : 0;

  return {
    monthKey,
    year,
    monthIndex,
    monthLabel: `${MONTH_SHORT_NAMES[monthIndex] || ''} ${year}`,
    capPct,
    hasConsistencyCap,
    cells,
    monthlyNetPnl,
    totalProfitBasis,
    activeDays,
    winningDays,
    losingDays,
    breakEvenDays,
    dayWinRatePct,
    metCapCount,
    overCapCount,
    bestDayDate,
    bestDayPnl,
    bestDaySharePct,
    worstDayDate,
    worstDayPnl,
    longestWinStreak,
    longestLossStreak,
    tradesCount,
  };
}

export function convertMt5PositionsToJournalRows(
  _accountMeta: Mt5ReportMeta,
  positions: Mt5PositionRecord[],
  portId: string,
  groupMode: 'IDEA' | 'POSITION',
  includeFees: boolean
): TradeRecord[] {
  if (!Array.isArray(positions) || positions.length === 0) return [];

  const sorted = [...positions].sort((a, b) => (a.openTs || 0) - (b.openTs || 0));

  if (groupMode === 'POSITION') {
    return sorted
      .map((p, idx) => {
        const isBuy = p.dir === 'BUY';
        const pts = Math.round((isBuy ? p.closePrice - p.openPrice : p.openPrice - p.closePrice) * 100);
        const pnl = includeFees ? p.netProfit : p.rawProfit;
        const riskEst = Math.max(10, +(p.volume * 3000).toFixed(2));
        const rr = +(pnl / riskEst).toFixed(3);

        let status: TradeOutcomeStatus = 'CUSTOM';
        if (pts >= 1000) status = 'FULL_SWEEP';
        else if (pts >= 350) status = 'TRAILING_LOCK';
        else if (Math.abs(pts) <= 50) status = 'BREAK_EVEN';
        else if (pts < -50) status = 'FULL_SL';

        return {
          id: 'MT5-' + (p.ticket || idx + 1),
          port: portId,
          date: p.openDate,
          time: p.openTime,
          dir: p.dir,
          entry: +p.openPrice.toFixed(2),
          risk: riskEst,
          lotLeg: +p.volume.toFixed(2),
          slPrice: p.slPrice > 0 ? +p.slPrice.toFixed(2) : +(isBuy ? p.openPrice - 10 : p.openPrice + 10).toFixed(2),
          tp1Price: p.tpPrice > 0 ? +p.tpPrice.toFixed(2) : +(isBuy ? p.openPrice + 4 : p.openPrice - 4).toFixed(2),
          tp2Price: p.tpPrice > 0 ? +p.tpPrice.toFixed(2) : +(isBuy ? p.openPrice + 8 : p.openPrice - 8).toFixed(2),
          tp3Price: p.tpPrice > 0 ? +p.tpPrice.toFixed(2) : +(isBuy ? p.openPrice + 12 : p.openPrice - 12).toFixed(2),
          tp1Pts: pts > 0 ? pts : 0,
          tp2Pts: 0,
          tp3Pts: 0,
          slPts: pts < 0 ? pts : 0,
          totalPts: pts,
          rr,
          pnlUsd: +pnl.toFixed(2),
          status,
          note: `MT5 #${p.ticket} (${p.volume.toFixed(2)}L · ปิด ${p.closePrice.toFixed(2)}${p.comment ? ' · ' + p.comment : ''})`,
        };
      })
      .reverse();
  }

  const clusters: {
    dir: TradeDirection;
    openDate: string;
    openTime: string;
    openTs: number;
    avgEntry: number;
    legs: Mt5PositionRecord[];
  }[] = [];

  sorted.forEach((pos) => {
    const lastCluster = clusters.length > 0 ? clusters[clusters.length - 1] : null;
    const timeDiffMs = lastCluster ? Math.abs((pos.openTs || 0) - (lastCluster.openTs || 0)) : Infinity;
    const priceDiff = lastCluster ? Math.abs(pos.openPrice - lastCluster.avgEntry) : Infinity;

    if (
      lastCluster &&
      lastCluster.dir === pos.dir &&
      lastCluster.openDate === pos.openDate &&
      lastCluster.legs.length < 3 &&
      timeDiffMs <= 5 * 60 * 1000 &&
      priceDiff <= 2.5
    ) {
      lastCluster.legs.push(pos);
      const sumEntry = lastCluster.legs.reduce((s, l) => s + l.openPrice, 0);
      lastCluster.avgEntry = +(sumEntry / lastCluster.legs.length).toFixed(2);
    } else {
      clusters.push({
        dir: pos.dir,
        openDate: pos.openDate,
        openTime: pos.openTime,
        openTs: pos.openTs,
        avgEntry: +pos.openPrice.toFixed(2),
        legs: [pos],
      });
    }
  });

  return clusters
    .map((c, idx) => {
      const isBuy = c.dir === 'BUY';
      const legs = c.legs;
      const legPts = legs.map((l) => Math.round((isBuy ? l.closePrice - l.openPrice : l.openPrice - l.closePrice) * 100));
      const totalVolume = +legs.reduce((s, l) => s + l.volume, 0).toFixed(2);
      const avgLegLot = +(totalVolume / legs.length).toFixed(2);
      const estIdeaRisk = Math.max(15, +(totalVolume * 1000).toFixed(2));

      const tp1Pts = legPts[0] !== undefined && legPts[0] > 0 ? legPts[0] : 0;
      const tp2Pts = legPts[1] !== undefined && legPts[1] > 0 ? legPts[1] : 0;
      const tp3Pts = legPts[2] !== undefined && legPts[2] > 0 ? legPts[2] : 0;
      const slPts = legPts.filter((pts) => pts < 0).reduce((s, pts) => s + pts, 0);
      const totalPts = legPts.reduce((s, pts) => s + pts, 0);

      const rawSum = +legs.reduce((s, l) => s + l.rawProfit, 0).toFixed(2);
      const netSum = +legs.reduce((s, l) => s + l.netProfit, 0).toFixed(2);
      const pnlUsd = includeFees ? netSum : rawSum;
      const rr = +(pnlUsd / estIdeaRisk).toFixed(3);

      const positiveLegs = legPts.filter((pts) => pts > 80).length;
      let status: TradeOutcomeStatus = 'CUSTOM';
      if (legs.length >= 3 && positiveLegs === 3 && Math.max(...legPts) >= 950) {
        status = 'FULL_SWEEP';
      } else if (positiveLegs >= 2 && totalPts > 0) {
        status = 'TRAILING_LOCK';
      } else if (positiveLegs === 1 && totalPts < 0) {
        status = 'TP1_ONLY';
      } else if (Math.abs(pnlUsd) <= 3) {
        status = 'BREAK_EVEN';
      } else if (pnlUsd < 0) {
        status = 'FULL_SL';
      } else if (pnlUsd > 0) {
        status = 'FULL_SWEEP';
      }

      const slRecorded = legs.find((l) => l.slPrice > 0);
      const tpPrices = legs
        .map((l) => l.tpPrice)
        .filter((v) => v > 0)
        .sort((a, b) => (isBuy ? a - b : b - a));

      const slPrice = slRecorded ? +slRecorded.slPrice.toFixed(2) : +(isBuy ? c.avgEntry - 10 : c.avgEntry + 10).toFixed(2);
      const tp1Price = tpPrices[0] ? +tpPrices[0].toFixed(2) : +(isBuy ? c.avgEntry + 4 : c.avgEntry - 4).toFixed(2);
      const tp2Price = tpPrices[1] ? +tpPrices[1].toFixed(2) : +(isBuy ? c.avgEntry + 8 : c.avgEntry - 8).toFixed(2);
      const tp3Price = tpPrices[2] ? +tpPrices[2].toFixed(2) : +(isBuy ? c.avgEntry + 12 : c.avgEntry - 12).toFixed(2);

      const ticketsNote = legs.map((l) => `#${l.ticket}`).join(', ');
      return {
        id: `MT5-${legs[0].ticket || idx + 1}`,
        port: portId,
        date: c.openDate,
        time: c.openTime,
        dir: c.dir,
        entry: c.avgEntry,
        risk: estIdeaRisk,
        lotLeg: avgLegLot,
        slPrice,
        tp1Price,
        tp2Price,
        tp3Price,
        tp1Pts,
        tp2Pts,
        tp3Pts,
        slPts,
        totalPts,
        rr,
        pnlUsd,
        status,
        note: `MT5 (${legs.length} ไม้ · ${totalVolume.toFixed(2)}L) ${ticketsNote}`,
      };
    })
    .reverse();
}

export const MT5_TIME_OFFSET_OPTIONS: Array<{ value: string; label: string; shortLabel: string }> = [
  {
    value: 'AUTO_MT5',
    label: 'อัตโนมัติ (MT5 Server → เวลาไทย ICT: +5 ชม. ฤดูหนาว / +4 ชม. ฤดูร้อน)',
    shortLabel: 'Auto (+4/+5h → ไทย)',
  },
  {
    value: '5',
    label: '+5 ชม. (MT5 Winter GMT+2 → ไทย GMT+7)',
    shortLabel: '+5h (GMT+2 → ไทย)',
  },
  {
    value: '4',
    label: '+4 ชม. (MT5 Summer GMT+3 → ไทย GMT+7)',
    shortLabel: '+4h (GMT+3 → ไทย)',
  },
  {
    value: '7',
    label: '+7 ชม. (UTC GMT+0 → ไทย GMT+7)',
    shortLabel: '+7h (UTC → ไทย)',
  },
  {
    value: '0',
    label: '0 ชม. (เวลาไทยอยู่แล้ว / ไม่ชดเชย)',
    shortLabel: '0h (ไม่ชดเชย)',
  },
];

export function normalizeMt5TimeOffsetSetting(raw: unknown): Mt5TimeOffsetSetting {
  if (raw === 'AUTO_MT5' || raw === '' || raw === null || raw === undefined) {
    return 'AUTO_MT5';
  }
  const n = Number(raw);
  if (Number.isFinite(n)) {
    return Math.max(-12, Math.min(14, Math.round(n)));
  }
  return 'AUTO_MT5';
}

export function resolveMt5AutoOffsetToBangkokHours(
  year: number,
  month: number,
  day: number,
  hour = 12,
  minute = 0
): number {
  try {
    const probeMs = Date.UTC(year, month - 1, day, Math.max(0, Math.min(23, hour)), minute, 0) - 2 * 3600_000;
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date(probeMs));
    const tzName = parts.find((p) => p.type === 'timeZoneName')?.value || '';
    const m = /GMT([+-]\d{1,2})(?::(\d{2}))?/.exec(tzName);
    if (m) {
      const nyUtcOffset = parseInt(m[1], 10);
      // Standard Prop Firm MT5 servers run NY+7 (GMT+3 in EDT / GMT+2 in EST)
      const mt5UtcOffset = nyUtcOffset + 7;
      return 7 - mt5UtcOffset;
    }
  } catch {
    // fallback below
  }
  // US DST fallback: 2nd Sunday of March through 1st Sunday of November -> +4h, else +5h
  if (month > 3 && month < 11) return 4;
  if (month < 3 || month > 11) return 5;
  if (month === 3) {
    const firstSun = 1 + ((7 - new Date(Date.UTC(year, 2, 1)).getUTCDay()) % 7);
    const secondSun = firstSun + 7;
    return day >= secondSun ? 4 : 5;
  }
  const firstNovSun = 1 + ((7 - new Date(Date.UTC(year, 10, 1)).getUTCDay()) % 7);
  return day < firstNovSun ? 4 : 5;
}

export function resolveMt5TimeOffsetHours(
  mt5TimeOffset: Mt5TimeOffsetSetting | undefined,
  year: number,
  month: number,
  day: number,
  hour = 12,
  minute = 0
): number {
  const normalized = normalizeMt5TimeOffsetSetting(mt5TimeOffset);
  if (typeof normalized === 'number') {
    return normalized;
  }
  return resolveMt5AutoOffsetToBangkokHours(year, month, day, hour, minute);
}

function serializeRawTimestampCandidate(raw: unknown): string | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    const ms = raw > 1e12 ? raw : raw * 1000;
    return new Date(ms).toISOString();
  }
  const s = String(raw ?? '').trim();
  return s || undefined;
}

function parseFlexibleDateTime(
  raw: unknown,
  fallbackIsoDate: string,
  mt5TimeOffset: Mt5TimeOffsetSetting = 'AUTO_MT5'
): { date: string; time: string; ts: number } {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    const ms = raw > 1e12 ? raw : raw * 1000;
    const dt = new Date(ms);
    return {
      date: getBangkokIsoDate(dt),
      time: getBangkokTimeHHMM(dt),
      ts: ms,
    };
  }
  const str = String(raw || '').trim();
  if (!str) {
    return { date: fallbackIsoDate, time: '12:00', ts: Date.parse(`${fallbackIsoDate}T12:00:00+07:00`) || 0 };
  }

  // If explicit timezone offset / Z is attached, Date.parse recovers exact UTC instant -> convert directly to Asia/Bangkok
  if (/(?:Z|GMT|[+-]\d{2}:?\d{2})$/i.test(str)) {
    const dotToDash = str.replace(/^(\d{4})\.(\d{2})\.(\d{2})/, '$1-$2-$3');
    const parsedMs = Date.parse(dotToDash.includes('T') ? dotToDash : dotToDash.replace(' ', 'T'));
    if (Number.isFinite(parsedMs)) {
      const dt = new Date(parsedMs);
      return {
        date: getBangkokIsoDate(dt),
        time: getBangkokTimeHHMM(dt),
        ts: parsedMs,
      };
    }
  }

  // Naive MT5 / Broker server timestamp: YYYY.MM.DD HH:mm(:ss) or YYYY-MM-DD[T ]HH:mm(:ss)
  const ymdMatch = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/.exec(
    str
  );
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10);
    const day = parseInt(ymdMatch[3], 10);
    const hour = ymdMatch[4] !== undefined ? parseInt(ymdMatch[4], 10) : 12;
    const minute = ymdMatch[5] !== undefined ? parseInt(ymdMatch[5], 10) : 0;
    const second = ymdMatch[6] !== undefined ? parseInt(ymdMatch[6], 10) : 0;
    const shiftHours = resolveMt5TimeOffsetHours(mt5TimeOffset, year, month, day, hour, minute);
    const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
    // Shift from MT5 Server wall clock -> Bangkok (GMT+7): UTC instant = naiveUtcMs + (shiftHours - 7)h
    const instantMs = naiveUtcMs + (shiftHours - 7) * 3_600_000;
    const dt = new Date(instantMs);
    return {
      date: getBangkokIsoDate(dt),
      time: getBangkokTimeHHMM(dt),
      ts: instantMs,
    };
  }

  // US/Myfxbook format MM/DD/YYYY HH:mm(:ss)
  const mdyMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(str);
  if (mdyMatch) {
    const month = parseInt(mdyMatch[1], 10);
    const day = parseInt(mdyMatch[2], 10);
    const year = parseInt(mdyMatch[3], 10);
    const hour = mdyMatch[4] !== undefined ? parseInt(mdyMatch[4], 10) : 12;
    const minute = mdyMatch[5] !== undefined ? parseInt(mdyMatch[5], 10) : 0;
    const second = mdyMatch[6] !== undefined ? parseInt(mdyMatch[6], 10) : 0;
    const shiftHours = resolveMt5TimeOffsetHours(mt5TimeOffset, year, month, day, hour, minute);
    const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
    const instantMs = naiveUtcMs + (shiftHours - 7) * 3_600_000;
    const dt = new Date(instantMs);
    return {
      date: getBangkokIsoDate(dt),
      time: getBangkokTimeHHMM(dt),
      ts: instantMs,
    };
  }

  const normalized = str.replace(/^(\d{4})\.(\d{2})\.(\d{2})/, '$1-$2-$3');
  const parsedMs = Date.parse(normalized);
  if (Number.isFinite(parsedMs)) {
    const dt = new Date(parsedMs);
    return {
      date: getBangkokIsoDate(dt),
      time: getBangkokTimeHHMM(dt),
      ts: parsedMs,
    };
  }
  const isoMatch = /(\d{4}-\d{2}-\d{2})/.exec(normalized);
  const timeMatch = /(\d{2}:\d{2})/.exec(normalized);
  const datePart = isoMatch ? isoMatch[1] : fallbackIsoDate;
  const timePart = timeMatch ? timeMatch[1] : '12:00';
  return {
    date: datePart,
    time: timePart,
    ts: Date.parse(`${datePart}T${timePart}:00+07:00`) || 0,
  };
}

export function parseMt5DateTimeToBangkok(
  raw: unknown,
  fallbackIsoDate: string = getBangkokIsoDate(),
  mt5TimeOffset: Mt5TimeOffsetSetting = 'AUTO_MT5'
): { date: string; time: string; ts: number } {
  return parseFlexibleDateTime(raw, fallbackIsoDate, mt5TimeOffset);
}

export function reapplyMt5TimezoneToPositions(
  positions: Mt5PositionRecord[],
  mt5TimeOffset: Mt5TimeOffsetSetting = 'AUTO_MT5'
): Mt5PositionRecord[] {
  if (!Array.isArray(positions)) return [];
  return positions.map((pos) => {
    const fallbackOpen = pos.openDate && /^\d{4}-\d{2}-\d{2}$/.test(pos.openDate) ? pos.openDate : getBangkokIsoDate();
    const rawOpen = pos.rawOpenTime || `${pos.openDate} ${pos.openTime || '12:00'}:00`;
    const rawClose =
      pos.rawCloseTime ||
      (pos.closeDate && pos.closeTime ? `${pos.closeDate} ${pos.closeTime}:00` : rawOpen);
    const openParsed = parseFlexibleDateTime(rawOpen, fallbackOpen, mt5TimeOffset);
    const closeParsed = parseFlexibleDateTime(rawClose, openParsed.date, mt5TimeOffset);
    return {
      ...pos,
      openDate: openParsed.date,
      openTime: openParsed.time,
      openTs: openParsed.ts,
      closeDate: closeParsed.date,
      closeTime: closeParsed.time,
      closeTs: closeParsed.ts,
      rawOpenTime: rawOpen,
      rawCloseTime: rawClose,
    };
  });
}

export function normalizeBridgePositionsToMt5Records(
  rawItems: unknown[],
  referenceDateStr?: string,
  mt5TimeOffset: Mt5TimeOffsetSetting = 'AUTO_MT5'
): { positions: Mt5PositionRecord[]; skippedCount: number } {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { positions: [], skippedCount: 0 };
  }
  const fallbackDate =
    referenceDateStr && /^\d{4}-\d{2}-\d{2}$/.test(referenceDateStr)
      ? referenceDateStr
      : getBangkokIsoDate();

  const dedupeMap = new Map<string, Mt5PositionRecord>();
  let skippedCount = 0;

  rawItems.forEach((raw, idx) => {
    if (!raw || typeof raw !== 'object') {
      skippedCount += 1;
      return;
    }
    const row = raw as Record<string, unknown>;
    const rawType = String(row.dir || row.type || row.side || row.action || '').toUpperCase();
    if (
      rawType.includes('BALANCE') ||
      rawType.includes('CREDIT') ||
      rawType.includes('BONUS') ||
      rawType.includes('DEPOSIT') ||
      rawType.includes('WITHDRAW')
    ) {
      skippedCount += 1;
      return;
    }

    let dir: TradeDirection | null = null;
    if (rawType.includes('SELL') || rawType === '1') dir = 'SELL';
    else if (rawType.includes('BUY') || rawType === '0') dir = 'BUY';

    if (!dir) {
      skippedCount += 1;
      return;
    }

    const openPrice = Number(row.openPrice ?? row.priceOpen ?? row.entryPrice ?? row.price ?? 0);
    const closePrice = Number(row.closePrice ?? row.priceClose ?? row.exitPrice ?? openPrice);
    const volume = Number(row.volume ?? row.lots ?? row.lot ?? 0);
    const rawProfit = Number(row.rawProfit ?? row.profit ?? 0);
    const commission = Number(row.commission ?? 0);
    const swap = Number(row.swap ?? 0);
    const netProfit =
      row.netProfit !== undefined && Number.isFinite(Number(row.netProfit))
        ? +Number(row.netProfit).toFixed(2)
        : +(rawProfit + commission + swap).toFixed(2);

    if (!Number.isFinite(openPrice) || openPrice <= 0 || !Number.isFinite(volume) || volume <= 0) {
      skippedCount += 1;
      return;
    }

    const ticket = String(row.ticket ?? row.positionId ?? row.dealId ?? row.id ?? `B-${idx + 1}`).trim();
    const symbol = String(row.symbol || 'XAUUSD').trim() || 'XAUUSD';

    const openRawCandidate =
      row.openDate &&
      /^\d{4}[.\-/]\d{2}[.\-/]\d{2}$/.test(String(row.openDate).trim()) &&
      row.openTime &&
      /^\d{1,2}:\d{2}(?::\d{2})?$/.test(String(row.openTime).trim())
        ? `${String(row.openDate).trim()} ${String(row.openTime).trim()}`
        : row.openTime ?? row.time ?? row.openDate;
    const closeRawCandidate =
      row.closeDate &&
      /^\d{4}[.\-/]\d{2}[.\-/]\d{2}$/.test(String(row.closeDate).trim()) &&
      row.closeTime &&
      /^\d{1,2}:\d{2}(?::\d{2})?$/.test(String(row.closeTime).trim())
        ? `${String(row.closeDate).trim()} ${String(row.closeTime).trim()}`
        : row.closeTime ?? row.closeDate ?? openRawCandidate;

    const rawOpenTimeStr =
      typeof row.rawOpenTime === 'string' && row.rawOpenTime.trim()
        ? row.rawOpenTime.trim()
        : serializeRawTimestampCandidate(openRawCandidate);
    const rawCloseTimeStr =
      typeof row.rawCloseTime === 'string' && row.rawCloseTime.trim()
        ? row.rawCloseTime.trim()
        : serializeRawTimestampCandidate(closeRawCandidate);

    const openParsed = parseFlexibleDateTime(rawOpenTimeStr ?? openRawCandidate, fallbackDate, mt5TimeOffset);
    const closeParsed = parseFlexibleDateTime(rawCloseTimeStr ?? closeRawCandidate, openParsed.date, mt5TimeOffset);

    dedupeMap.set(ticket, {
      ticket,
      symbol,
      dir,
      openDate: openParsed.date,
      openTime: openParsed.time,
      openTs: openParsed.ts,
      closeDate: closeParsed.date,
      closeTime: closeParsed.time,
      closeTs: closeParsed.ts,
      rawOpenTime: rawOpenTimeStr,
      rawCloseTime: rawCloseTimeStr,
      volume: +volume.toFixed(2),
      openPrice: +openPrice.toFixed(2),
      slPrice: Number(row.slPrice ?? row.stopLoss ?? row.sl ?? 0) || 0,
      tpPrice: Number(row.tpPrice ?? row.takeProfit ?? row.tp ?? 0) || 0,
      closePrice: +(Number.isFinite(closePrice) && closePrice > 0 ? closePrice : openPrice).toFixed(2),
      commission: +commission.toFixed(2),
      swap: +swap.toFixed(2),
      rawProfit: +rawProfit.toFixed(2),
      netProfit,
      comment: String(row.comment || '').trim(),
    });
  });

  const positions = Array.from(dedupeMap.values()).sort((a, b) => (a.openTs || 0) - (b.openTs || 0));
  return { positions, skippedCount };
}

export function resolveRealtimeStateConflict(
  localState: GhrWorkspaceState,
  remoteState: GhrWorkspaceState
): { winner: 'LOCAL' | 'REMOTE' | 'MERGED'; state: GhrWorkspaceState } {
  const localTs = localState.lastSavedAt ? new Date(localState.lastSavedAt).getTime() : 0;
  const remoteTs = remoteState.lastSavedAt ? new Date(remoteState.lastSavedAt).getTime() : 0;

  // Merge unique trade journal entries by ID so offline records are never lost when reconnecting
  const tradeMap = new Map<string, TradeRecord>();
  // Older side first so newer side overwrites same ID
  const olderFirst = localTs >= remoteTs ? [remoteState.journal, localState.journal] : [localState.journal, remoteState.journal];
  olderFirst[0]?.forEach((t) => tradeMap.set(t.id, t));
  olderFirst[1]?.forEach((t) => tradeMap.set(t.id, t));

  const mergedJournal = Array.from(tradeMap.values()).sort((a, b) => {
    const dtA = `${a.date}T${a.time || '00:00'}`;
    const dtB = `${b.date}T${b.time || '00:00'}`;
    return dtB.localeCompare(dtA);
  });

  const mergedAccounts = {
    ...(remoteState.accounts || {}),
    ...(localState.accounts || {}),
  };

  const base = remoteTs > localTs ? remoteState : localState;
  const merged = normalizeMergedState({
    ...base,
    accounts: mergedAccounts,
    journal: mergedJournal,
    lastSavedAt: new Date(Math.max(localTs, remoteTs, Date.now())).toISOString(),
  });

  if (mergedJournal.length > Math.max(localState.journal.length, remoteState.journal.length)) {
    return { winner: 'MERGED', state: merged };
  }
  return {
    winner: remoteTs > localTs ? 'REMOTE' : 'LOCAL',
    state: merged,
  };
}

export interface CumulativePnlPoint {
  step: number;
  label: string;
  tradeId: string;
  dateLabel: string;
  dir: TradeDirection | 'START';
  status: TradeOutcomeStatus | 'START';
  tradePnl: number;
  cumulativePnl: number;
  equity: number;
  peakPnl: number;
  drawdownUsd: number;
  targetProfit: number;
  targetEquity: number;
  totalPts: number;
  rr: number;
  note: string;
}

export interface CumulativePnlSeriesResult {
  points: CumulativePnlPoint[];
  initialCapital: number;
  targetProfit: number;
  targetEquity: number;
  currentCumulativePnl: number;
  currentEquity: number;
  peakPnl: number;
  maxDrawdownUsd: number;
  gradientSplitOffset: number;
}

export function buildCumulativePnlSeries(
  accounts: Record<string, AccountInfo>,
  journal: TradeRecord[],
  activePort: string
): CumulativePnlSeriesResult {
  const acc = getAccountComputed(accounts, journal, activePort);
  const chronologicalTrades = journal
    .filter((j) => j.port === acc.id)
    .slice()
    .reverse();

  const targetEquity = +(acc.initial + acc.targetProfit).toFixed(2);
  const points: CumulativePnlPoint[] = [
    {
      step: 0,
      label: '#0',
      tradeId: 'START',
      dateLabel: 'จุดเริ่มต้นพอร์ต',
      dir: 'START',
      status: 'START',
      tradePnl: 0,
      cumulativePnl: 0,
      equity: acc.initial,
      peakPnl: 0,
      drawdownUsd: 0,
      targetProfit: acc.targetProfit,
      targetEquity,
      totalPts: 0,
      rr: 0,
      note: `ทุนเริ่มต้น ${fmtUSD(acc.initial)}`,
    },
  ];

  let runningPnl = 0;
  let peakPnl = 0;
  let maxDrawdownUsd = 0;

  chronologicalTrades.forEach((t, idx) => {
    const tradePnl = +(Number(t.pnlUsd) || 0).toFixed(2);
    runningPnl = +(runningPnl + tradePnl).toFixed(2);
    if (runningPnl > peakPnl) {
      peakPnl = runningPnl;
    }
    const drawdownUsd = +(runningPnl - peakPnl).toFixed(2);
    if (drawdownUsd < maxDrawdownUsd) {
      maxDrawdownUsd = drawdownUsd;
    }

    points.push({
      step: idx + 1,
      label: `#${idx + 1}`,
      tradeId: t.id,
      dateLabel: `${t.date || ''}${t.time ? ' · ' + t.time : ''}`.trim() || `ไม้ที่ ${idx + 1}`,
      dir: t.dir,
      status: t.status,
      tradePnl,
      cumulativePnl: runningPnl,
      equity: +(acc.initial + runningPnl).toFixed(2),
      peakPnl,
      drawdownUsd,
      targetProfit: acc.targetProfit,
      targetEquity,
      totalPts: Number(t.totalPts) || 0,
      rr: Number(t.rr) || 0,
      note: t.note || '',
    });
  });

  const pnlValues = points.map((p) => p.cumulativePnl);
  const dataMax = Math.max(...pnlValues, 0);
  const dataMin = Math.min(...pnlValues, 0);
  const gradientSplitOffset =
    dataMax <= 0 ? 0 : dataMin >= 0 ? 1 : +(dataMax / (dataMax - dataMin)).toFixed(4);

  return {
    points,
    initialCapital: acc.initial,
    targetProfit: acc.targetProfit,
    targetEquity,
    currentCumulativePnl: runningPnl,
    currentEquity: +(acc.initial + runningPnl).toFixed(2),
    peakPnl,
    maxDrawdownUsd,
    gradientSplitOffset,
  };
}

export interface TwelveGateDefinition {
  key: keyof TwelveGatesState;
  code: string;
  titleEn: string;
  titleTh: string;
  criterion: string;
  criterionV31?: string;
}

export const TWELVE_GATE_DEFINITIONS: TwelveGateDefinition[] = [
  {
    key: 'g01',
    code: '01',
    titleEn: 'Heartbeat & Cooldown Clear',
    titleTh: 'ข้อมูล MT5 ล่าสุดและช่วงพัก 15 นาที',
    criterion:
      'ข้อมูล mt5_heartbeats อายุไม่เกิน 30 วินาที (FRESH) และพ้นช่วงพัก 15 นาทีหลังชน Full SL',
    criterionV31:
      'mt5_heartbeats age is ≤ 30 seconds; system status is FRESH (never STALE or UNKNOWN).',
  },
  {
    key: 'g02',
    code: '02',
    titleEn: 'Kill-Switch & Daily Quota Clear',
    titleTh: 'ปุ่มหยุดฉุกเฉิน & โควต้า 3 ไม้/วัน',
    criterion:
      'ไม่มีสถานะ HALT ค้าง และจำนวนเทรดวันนี้ของพอร์ตยังไม่เกินโควต้า 2–3 Idea/วัน (ป้องกัน Overtrade).',
    criterionV31:
      'No active HALT event exists in REQUESTED, COMMITTED, or MT5_CONFIRMED state.',
  },
  {
    key: 'g03',
    code: '03',
    titleEn: 'Daily Risk Brake ($300 / 5%)',
    titleTh: 'งบขาดทุนรายวันพอร์ต $6,000',
    criterion:
      'ขาดทุนสะสมวันนี้ + ความเสี่ยงไม้นี้ (1R = $90–$120) อยู่ภายใต้เพดาน Daily Loss $300 (เบรกภายใน 2.0%–2.4%).',
    criterionV31:
      "Today's realized + floating loss plus new setup risk (1R) stays below the internal 2.0%–2.4% daily brake.",
  },
  {
    key: 'g04',
    code: '04',
    titleEn: 'Max Buffer $600 & 95% Static Floor',
    titleTh: 'ยอดขั้นต่ำหลังหักความเสี่ยง',
    criterion:
      'min(Balance, Equity) − New_Setup_Risk ต้องสูงกว่า Static Floor $5,700 (พอร์ต $6,000, Max Buffer $600)',
    criterionV31:
      'min(Balance, Equity) − New_Setup_Risk must stay above the 95% static floor.',
  },
  {
    key: 'g05',
    code: '05',
    titleEn: 'Zone Time-Freeze (t0)',
    titleTh: 'แช่แข็งโซน H1 HVN ที่ t0',
    criterion:
      'โซน H1 HVN ดึงจากแท่ง H1 ที่ปิดแล้ว 120 แท่งก่อนเวลา t0 (เช่น [4041.20, 4042.80]) ภายในอายุ 24 แท่ง (24-bar TTL).',
    criterionV31:
      'H1 HVN zone extracted from 120 closed H1 bars prior to t0 (e.g., [4091.20, 4092.80]) within 24-bar TTL.',
  },
  {
    key: 'g06',
    code: '06',
    titleEn: 'Canonical Zone Width (100–200p)',
    titleTh: 'ความกว้างโซน 100–200 Points',
    criterion:
      'ความกว้างโซน H1 HVN (U − L) อยู่ระหว่าง 100–200 Points ($1.00–$2.00) เท่านั้น (ซิงก์กับประตู 1 · ข้ามทันทีหากเกิน 200p).',
    criterionV31:
      'Frozen HVN zone width (U − L) is strictly within 100–200 Points ($1.00–$2.00) (e.g., 160 pts; skip if >200 pts).',
  },
  {
    key: 'g07',
    code: '07',
    titleEn: 'H1 Trigger Close (t1)',
    titleTh: 'แท่ง H1 ปิดยืนยันรูปแบบ',
    criterion:
      'แท่ง H1 ปิดที่ t1 > t0 ยืนยันท่า Break & Hold (เนื้อเทียน ≥50%) หรือ Rejection (ไส้เทียน ≥40%) (ซิงก์กับประตู 2).',
    criterionV31:
      'Closed H1 candle at t1 > t0 confirmed either Break & Hold (≥50% body) or Rejection (≥40% wick).',
  },
  {
    key: 'g08',
    code: '08',
    titleEn: 'Zero Zone Invalidation',
    titleTh: 'โซนยังไม่ถูกทำลาย (<50p)',
    criterion:
      'ตั้งแต่เวลา t1 ยังไม่มีแท่งเทียนใดปิดทะลุขอบป้องกันของโซนเกิน 50 Points ($0.50).',
    criterionV31:
      'Since t1, no candle has closed beyond the protective zone boundary by more than 50 Points ($0.50).',
  },
  {
    key: 'g09',
    code: '09',
    titleEn: 'M5 Retest & Confirm (t2, t3)',
    titleTh: 'M5 ย่อแตะโซนและปิดยืนยัน',
    criterion:
      'เรียงลำดับเวลาเคร่งครัด: M5 ย่อแตะโซนครั้งแรกที่ t2 > t1 ตามด้วยแท่ง M5 ปิดยืนยันที่ t3 ≥ t2 (ซิงก์กับประตู 3).',
    criterionV31:
      'Strict sequence verified: M5 first touch at t2 > t1 followed by M5 confirmation close at t3 ≥ t2.',
  },
  {
    key: 'g10',
    code: '10',
    titleEn: 'One Setup Per Zone ID',
    titleTh: 'ห้ามยิงซ้ำโซนเดิม',
    criterion:
      'zone_id และ setup_hash นี้ยังไม่เคยถูกใช้เทรดมาก่อน (จำกัด 1 Idea ต่อ 1 โซน HVN ที่แช่แข็งไว้).',
    criterionV31:
      'zone_id and setup_hash have never been traded before (strictly 1 setup per frozen HVN zone).',
  },
  {
    key: 'g11',
    code: '11',
    titleEn: 'Spread, News & 40% Rule Filter',
    titleTh: 'สเปรด ข่าว & คุมกฎ 40%',
    criterion:
      'สเปรด XAUUSD ปกติ (≤ 25 pts) นอกช่วงข่าวแรง (CPI/NFP/FOMC) และกำไรวันนี้ไม่ทำให้ Best Day เกิน 40% ของรอบถอน.',
    criterionV31:
      'Current XAUUSD spread is normal (≤ 25 pts) and outside high-impact macro news windows (CPI/NFP/FOMC).',
  },
  {
    key: 'g12',
    code: '12',
    titleEn: 'GHR v3.2 3-TP + Trailing Lock & 30m Expiry',
    titleTh: 'คำสั่งครบ 3 ไม้ + TL + หมดอายุ 30 นาที',
    criterion:
      '3 ไม้ = 1 Idea (Lot/ไม้ = Risk ÷ 3,000): Pending Limit 3 ไม้ เท่ากันที่ SL = -1,000p, TP1 = +400p, TP2 = +800p (ย้าย SL ไม้ 3 ไป TP1), TP3 = +1,200p พร้อมตั้งหมดอายุ 30 นาที (6 แท่ง M5 · ซิงก์ประตู 4–5).',
    criterionV31:
      '4 Legs = 1 Idea (Risk 1%–2%): Placed as 4 equal Pending Limit legs with SL = 1,000 pts, TP = 300 / 600 / 900 / 1,200 pts, and 30-min (6 M5) expiry.',
  },
];

export interface CanonicalSizingRow {
  accountSizeLabel: string;
  capsLabel: string;
  totalIdeaLotLabel: string;
  riskPerIdeaLabel: string;
  recommendedRiskUsd: number;
  secondaryRiskUsd?: number;
  badgeText?: string;
}

export const GHR_V32_SIZING_MATRIX: CanonicalSizingRow[] = [
  {
    accountSizeLabel: '$3,000 Mini / $6,000 Recovery',
    capsLabel: '0.5%–1.0% Risk · โหมดเซฟหน้าตัก',
    totalIdeaLotLabel: '0.03–0.06 Lot (3 × 0.01–0.02 Lot)',
    riskPerIdeaLabel: 'Risk $30–$60 · Full +$24/+$48 · TL +$16/+$32',
    recommendedRiskUsd: 30,
    secondaryRiskUsd: 60,
  },
  {
    accountSizeLabel: '$6,000 Funded 90% (พอร์ตจริง)',
    capsLabel: 'เป้าถอน $360 (3 วัน) · กฎ 40% (≤$144/วัน)',
    totalIdeaLotLabel: '0.09 Lot (3 × 0.03 Lot)',
    riskPerIdeaLabel: 'Risk $90.00 (1.5% on $6k) · Full +$72 · TL +$48',
    recommendedRiskUsd: 90,
    badgeText: 'พอร์ต 3 Funded',
  },
  {
    accountSizeLabel: '$6,000 Evaluation (#14370024 / #14359161)',
    capsLabel: 'เป้าสอบ $480 (5 วัน) · $300 Daily · $600 Buffer',
    totalIdeaLotLabel: '0.12 Lot (3 × 0.04 Lot)',
    riskPerIdeaLabel: 'Risk $120.00 (2.0% on $6k) · Full +$96 · TL +$64',
    recommendedRiskUsd: 120,
    secondaryRiskUsd: 150,
    badgeText: 'พอร์ต 1 & 2 มาตรฐาน',
  },
  {
    accountSizeLabel: '$10,000 Standard (GHR v3.2)',
    capsLabel: '$500 Static · $300 Daily (1.2%–1.8%)',
    totalIdeaLotLabel: '0.12–0.18 Lot (3 × 0.04–0.06 Lot)',
    riskPerIdeaLabel: 'Risk $120–$180 · Full +$96/+$144 · TL +$64/+$96',
    recommendedRiskUsd: 120,
    secondaryRiskUsd: 180,
  },
  {
    accountSizeLabel: '$25,000 – $50,000 Scaling Standard',
    capsLabel: '$1,250–$2,500 Static · $750–$1,500 Daily',
    totalIdeaLotLabel: '0.30–0.60 Lot (3 × 0.10–0.20 Lot)',
    riskPerIdeaLabel: 'Risk $300–$600 · Full +$240/+$480 · TL +$160/+$320',
    recommendedRiskUsd: 300,
    secondaryRiskUsd: 600,
  },
];

export const CANONICAL_SIZING_MATRIX: CanonicalSizingRow[] = [
  {
    accountSizeLabel: '$1k Cent / $4k Std',
    capsLabel: '5% Static · 3% Daily',
    totalIdeaLotLabel: '0.04 Lot (4 × 0.01 Lot)',
    riskPerIdeaLabel: '1,000 × $0.04 = $40.00 (1% on $4k)',
    recommendedRiskUsd: 40,
  },
  {
    accountSizeLabel: '$10,000 Standard',
    capsLabel: '$500 Static · $300 Daily',
    totalIdeaLotLabel: '0.12–0.20 Lot (4 × 0.03–0.05)',
    riskPerIdeaLabel: '$120–$200 (1.2%–2.0%) · 1% = $100',
    recommendedRiskUsd: 120,
    secondaryRiskUsd: 200,
  },
  {
    accountSizeLabel: '$25,000 Standard',
    capsLabel: '$1,250 Static · $750 Daily',
    totalIdeaLotLabel: '0.24–0.48 Lot (4 × 0.06–0.12)',
    riskPerIdeaLabel: '$240–$480 (0.96%–1.92%)',
    recommendedRiskUsd: 240,
    secondaryRiskUsd: 480,
  },
  {
    accountSizeLabel: '$50,000 Standard',
    capsLabel: '$2,500 Static · $1,500 Daily',
    totalIdeaLotLabel: '0.48–1.00 Lot (4 × 0.12–0.25)',
    riskPerIdeaLabel: '$480–$1,000 (0.96%–2.00%)',
    recommendedRiskUsd: 480,
    secondaryRiskUsd: 1000,
  },
  {
    accountSizeLabel: '$100,000 Standard',
    capsLabel: '$5,000 Static · $3,000 Daily',
    totalIdeaLotLabel: '1.00–2.00 Lot (4 × 0.25–0.50)',
    riskPerIdeaLabel: '$1,000–$2,000 (1.00%–2.00%)',
    recommendedRiskUsd: 1000,
    secondaryRiskUsd: 2000,
  },
];

export interface GoldenRuleDefinition {
  key: string;
  code: string;
  titleEn: string;
  ruleEn: string;
  ruleTh: string;
}

export const TEN_GOLDEN_RULES: GoldenRuleDefinition[] = [
  {
    key: 'r01',
    code: '01',
    titleEn: 'Know Your Exact 3-Leg Dollar Loss First',
    ruleEn:
      'Never ask how much you can win until you verify your 1.5%–2.0% Idea risk across all 3 legs (Lot/Leg = Risk ÷ 3,000) at SL = 1,000 pts.',
    ruleTh:
      'ห้ามถามว่าจะชนะเท่าไร จนกว่าจะคำนวณความเสี่ยงต่อ 1 Idea (เช่น พอร์ตสอบ $120 = 0.04L×3, พอร์ตจริง $90 = 0.03L×3) ที่ SL 1,000 pts ชัดเจน',
  },
  {
    key: 'r02',
    code: '02',
    titleEn: 'Stale Data or SL Hit Equals 15-Min Cooldown HALT',
    ruleEn:
      'Telemetry older than 30 seconds or a Full SL hit triggers an immediate mandatory 15-minute screen cooldown.',
    ruleTh:
      'ข้อมูลค้างเกิน 30 วินาที หรือเพิ่งชน Full SL ต้องพักหน้าจอ Cooldown 15 นาทีทันที ห้ามเปิดไม้แก้มือเด็ดขาด',
  },
  {
    key: 'r03',
    code: '03',
    titleEn: 'Mandatory Trailing Lock at TP2 (+800 pts)',
    ruleEn:
      'As soon as Leg 2 hits TP2 (+800 pts), immediately move Leg 3 SL from -1,000 pts to TP1 (+400 pts) to lock in +0.533R (+1,600 pts).',
    ruleTh:
      'เมื่อราคาชน TP2 (+800p) ต้องเลื่อน SL ของไม้ 3 ไปที่ราคา TP1 (+400p) ทันที เพื่อล็อกกำไรสุทธิ +0.533R (+$64 บนความเสี่ยง $120)',
  },
  {
    key: 'r04',
    code: '04',
    titleEn: 'Respect the 40% Consistency Rule & Daily Quota',
    ruleEn:
      'Cap execution at 2–3 Ideas/day and pace daily profit (e.g., 1 Full + 1 TL) so no single day exceeds 40% of your 3-day payout cycle.',
    ruleTh:
      'เทรดไม่เกิน 2–3 Idea/วัน และคุมจังหวะกำไรรายวันให้สม่ำเสมอ เพื่อไม่ให้วันสูงสุดเกิน 40% ของกำไรรวมรอบถอน 3 วัน',
  },
  {
    key: 'r05',
    code: '05',
    titleEn: 'Freeze HVN Zones at t0',
    ruleEn: 'Lock [L, U] from 120 closed H1 bars before price arrives; never recompute with future bars.',
    ruleTh: 'แช่แข็งโซน H1 HVN ตั้งแต่เวลา t0 ห้ามนำแท่งเทียนอนาคตมาขยับขอบโซนเด็ดขาด',
  },
  {
    key: 'r06',
    code: '06',
    titleEn: 'Trade Only 100–200 Point Zones',
    ruleEn: 'Skip zones narrower than $1.00 or wider than $2.00 (e.g., valid 160-pt zone [4041.20–4042.80]).',
    ruleTh: 'คัดเฉพาะโซน H1 HVN ที่มีความกว้าง 100–200 Points เท่านั้น (ตรงกับเช็กลิสต์ประตู 1)',
  },
  {
    key: 'r07',
    code: '07',
    titleEn: 'Respect Strict Chronology (t0 < t1 < t2 < t3 < t4)',
    ruleEn: 'Wait for H1 close (t1), M5 touch (t2), and M5 confirmation close (t3) before placing limits.',
    ruleTh: 'ต้องรอ H1 ปิดยืนยัน จากนั้นให้ M5 ย่อแตะโซนและปิดยืนยันก่อนวาง Limit (ด่าน 2 และ 3)',
  },
  {
    key: 'r08',
    code: '08',
    titleEn: 'Limit Orders Only with 6-Bar (30-Min) Expiry',
    ruleEn: 'Never chase impulses with Market orders; cancel unfilled Pending Limits after 30 mins (6 M5 bars).',
    ruleTh: 'ใช้ Pending Limit 3 ไม้ พร้อมตั้งเวลาหมดอายุ 30 นาที (6 แท่ง M5) และห้ามกดมือไล่ราคาเด็ดขาด (ประตู 4 & 5)',
  },
  {
    key: 'r09',
    code: '09',
    titleEn: 'One Setup Per Zone ID & 50-Pt Invalidation',
    ruleEn: 'If a zone closes >50 pts beyond its protective edge, invalidate and walk away.',
    ruleTh: 'หนึ่งโซนยิงได้เพียง 1 Idea เท่านั้น หากแท่งเทียนปิดทะลุขอบป้องกันเกิน 50 Points ให้ยกเลิกแผนทันที',
  },
  {
    key: 'r10',
    code: '10',
    titleEn: 'Good Trading Is Quiet and Boring',
    ruleEn: 'Excitement or urgency is a warning sign of a rule violation.',
    ruleTh: 'การเทรด GHR v3.2 ที่ดีต้องสงบและน่าเบื่อ หากหัวใจเต้นแรงแปลว่าคุณกำลังละเมิดกฎ',
  },
];

export interface TwelveGatesEvaluation {
  passedCount: number;
  totalCount: number;
  isAllPassed: boolean;
  blockingCodes: string[];
  statusLabel: string;
}

export function evaluateTwelveGates(gates: TwelveGatesState | undefined): TwelveGatesEvaluation {
  const safeGates = gates || DEFAULT_TWELVE_GATES;
  const blockingCodes: string[] = [];
  let passedCount = 0;

  TWELVE_GATE_DEFINITIONS.forEach((def) => {
    if (safeGates[def.key]) {
      passedCount += 1;
    } else {
      blockingCodes.push(def.code);
    }
  });

  const isAllPassed = passedCount === TWELVE_GATE_DEFINITIONS.length;
  return {
    passedCount,
    totalCount: TWELVE_GATE_DEFINITIONS.length,
    isAllPassed,
    blockingCodes,
    statusLabel: isAllPassed
      ? 'PASS 12/12 · อนุมัติวางคำสั่ง GHR v3.2 Limit'
      : `FAIL-CLOSED · ติดด่านตรวจ (${passedCount}/12)`,
  };
}

export interface FourLegStateRow {
  stateIndex: 0 | 1 | 2 | 3 | 4;
  titleEn: string;
  titleTh: string;
  derivationText: string;
  legPts: number;
  rMultiple: number;
  rLabel: string;
  noteBadge?: string;
  netUsd: number;
  canonical200Usd: number;
  canonical100Usd: number;
  journalStatus: TradeOutcomeStatus;
}

export interface GhrV32LadderMetrics {
  isBuy: boolean;
  validEntry: number;
  riskUsd: number;
  totalLot: number;
  legLot: number;
  slPrice: string;
  tp1Price: string;
  tp2Price: string;
  tp3Price: string;
  states: FourLegStateRow[];
}

export function calculateGhrV32LadderMetrics(
  dir: TradeDirection,
  entry: number | string,
  riskInput: number | string
): GhrV32LadderMetrics {
  const isBuy = dir === 'BUY';
  const parsedEntry = parseFloat(String(entry));
  const validEntry = !isNaN(parsedEntry) && parsedEntry > 0 ? parsedEntry : 0;
  const riskUsd = Math.max(10, Number(riskInput) || 120);

  // GHR v3.2: 3 Equal Legs at SL = 1,000 pts -> Lot per Leg = Risk_USD / 3,000, Total Lot = Risk_USD / 1,000
  const legLot = +(riskUsd / 3000).toFixed(2);
  const totalLot = +(legLot * 3).toFixed(2);

  const slNum = validEntry > 0 ? (isBuy ? validEntry - 10.0 : validEntry + 10.0) : 0;
  const tp1Num = validEntry > 0 ? (isBuy ? validEntry + 4.0 : validEntry - 4.0) : 0;
  const tp2Num = validEntry > 0 ? (isBuy ? validEntry + 8.0 : validEntry - 8.0) : 0;
  const tp3Num = validEntry > 0 ? (isBuy ? validEntry + 12.0 : validEntry - 12.0) : 0;

  const fmtP = (v: number) => (validEntry > 0 && v > 0 ? v.toFixed(2) : '—');

  const states: FourLegStateRow[] = [
    {
      stateIndex: 0,
      titleEn: 'State 0: Full Stop-Out (ชน SL ครบ 3 ไม้)',
      titleTh: 'แพ้ครบ 3 ไม้ที่ -1,000 pts (พักหน้าจอ 15 นาที)',
      derivationText: 'All 3 legs hit initial SL at -1,000 pts (3 × -1,000 = -3,000 leg-pts).',
      legPts: -3000,
      rMultiple: -1.0,
      rLabel: '-3,000 / 3,000 = -1.00R',
      noteBadge: 'Cooldown 15 นาที',
      netUsd: +(-1.0 * riskUsd).toFixed(2),
      canonical200Usd: -120.0,
      canonical100Usd: -90.0,
      journalStatus: 'FULL_SL',
    },
    {
      stateIndex: 1,
      titleEn: 'State 1: TP1 (+400p) Hit Only',
      titleTh: 'เก็บแค่ TP1 (+400p) แล้วกลับตัวชน SL ไม้ 2–3',
      derivationText: 'Leg 1 banks +400 pts; Legs 2–3 stop at -1,000 pts (+400 − 2,000 = -1,600 leg-pts).',
      legPts: -1600,
      rMultiple: -0.533,
      rLabel: '-1,600 / 3,000 = -0.533R',
      noteBadge: 'ลดขาดทุนลง 46.7%',
      netUsd: +(-((riskUsd / 3) * 1.6)).toFixed(2),
      canonical200Usd: -64.0,
      canonical100Usd: -48.0,
      journalStatus: 'TP1_ONLY',
    },
    {
      stateIndex: 2,
      titleEn: 'State 2: Break-Even Protect (เท่าทุน)',
      titleTh: 'เก็บ TP1 / คัดล็อกหน้าทุน ปิดความเสี่ยงเป็นศูนย์',
      derivationText: 'Protective exit near Entry / breakeven defense across remaining legs (0 net leg-pts).',
      legPts: 0,
      rMultiple: 0.0,
      rLabel: '0 / 3,000 = 0.00R',
      noteBadge: 'รักษาเงินต้น 100%',
      netUsd: 0.0,
      canonical200Usd: 0.0,
      canonical100Usd: 0.0,
      journalStatus: 'BREAK_EVEN',
    },
    {
      stateIndex: 3,
      titleEn: 'State 3: Trailing Lock Hit (+1,600p)',
      titleTh: 'ชน TP1 (+400) + TP2 (+800) และไม้ 3 จบที่ SL หน้า TP1 (+400)',
      derivationText:
        'Leg 1 (+400) + Leg 2 (+800) + Leg 3 Trailing SL at TP1 (+400) = +1,600 leg-pts.',
      legPts: 1600,
      rMultiple: 0.533,
      rLabel: '+1,600 / 3,000 = +0.533R',
      noteBadge: 'Trailing Lock (+0.533R Locked!)',
      netUsd: +(((riskUsd / 3) * 1.6)).toFixed(2),
      canonical200Usd: 64.0,
      canonical100Usd: 48.0,
      journalStatus: 'TRAILING_LOCK',
    },
    {
      stateIndex: 4,
      titleEn: 'State 4: Full 3-TP Sweep (+2,400p)',
      titleTh: 'ชนะครบทั้ง 3 ไม้ (+400 / +800 / +1,200 pts)',
      derivationText:
        'Legs 1–3 bank +400 + 800 + 1,200 = +2,400 leg-pts (avg +800 pts/leg).',
      legPts: 2400,
      rMultiple: 0.8,
      rLabel: '+2,400 / 3,000 = +0.80R',
      noteBadge: 'Full 3-TP Sweep (+0.80R)',
      netUsd: +(0.8 * riskUsd).toFixed(2),
      canonical200Usd: 96.0,
      canonical100Usd: 72.0,
      journalStatus: 'FULL_SWEEP',
    },
  ];

  return {
    isBuy,
    validEntry,
    riskUsd,
    totalLot,
    legLot,
    slPrice: fmtP(slNum),
    tp1Price: fmtP(tp1Num),
    tp2Price: fmtP(tp2Num),
    tp3Price: fmtP(tp3Num),
    states,
  };
}

export interface FourLegLadderMetrics {
  isBuy: boolean;
  validEntry: number;
  riskUsd: number;
  totalLot: number;
  legLot: number;
  slPrice: string;
  tp1Price: string;
  tp2Price: string;
  tp3Price: string;
  tp4Price: string;
  states: FourLegStateRow[];
}

export function calculateFourLegLadderMetrics(
  dir: TradeDirection,
  entry: number | string,
  riskInput: number | string
): FourLegLadderMetrics {
  const isBuy = dir === 'BUY';
  const parsedEntry = parseFloat(String(entry));
  const validEntry = !isNaN(parsedEntry) && parsedEntry > 0 ? parsedEntry : 0;
  const riskUsd = Math.max(10, Number(riskInput) || 120);

  // Standard XAUUSD: 1,000 pts SL = $1,000 per 1.00 Lot -> Total Lot = Risk_USD / 1,000
  const totalLot = +(riskUsd / 1000).toFixed(2);
  const legLot = +(riskUsd / 4000).toFixed(3);

  const slNum = validEntry > 0 ? (isBuy ? validEntry - 10.0 : validEntry + 10.0) : 0;
  const tp1Num = validEntry > 0 ? (isBuy ? validEntry + 3.0 : validEntry - 3.0) : 0;
  const tp2Num = validEntry > 0 ? (isBuy ? validEntry + 6.0 : validEntry - 6.0) : 0;
  const tp3Num = validEntry > 0 ? (isBuy ? validEntry + 9.0 : validEntry - 9.0) : 0;
  const tp4Num = validEntry > 0 ? (isBuy ? validEntry + 12.0 : validEntry - 12.0) : 0;

  const fmtP = (v: number) => (validEntry > 0 && v > 0 ? v.toFixed(2) : '—');

  const states: FourLegStateRow[] = [
    {
      stateIndex: 0,
      titleEn: 'State 0: Full Stop-Out',
      titleTh: 'แพ้ครบ 4 ไม้ที่ -1,000 pts',
      derivationText: 'All 4 legs hit initial SL (4 × -1,000 = -4,000 leg-pts).',
      legPts: -4000,
      rMultiple: -1.0,
      rLabel: '-4,000 / 4,000 = -1.00R',
      netUsd: +(-1.0 * riskUsd).toFixed(2),
      canonical200Usd: -200.0,
      canonical100Usd: -100.0,
      journalStatus: 'FULL_SL',
    },
    {
      stateIndex: 1,
      titleEn: 'State 1: TP1 (+300) Hit',
      titleTh: 'ชนะไม้ 1 แพ้ไม้ 2–4 (-1,000)',
      derivationText: 'Leg 1 banks +300; Legs 2–4 stop at -1,000 (+300 − 3,000 = -2,700 leg-pts).',
      legPts: -2700,
      rMultiple: -0.675,
      rLabel: '-2,700 / 4,000 = -0.675R',
      noteBadge: 'Cuts loss by 32.5%',
      netUsd: +(-0.675 * riskUsd).toFixed(2),
      canonical200Usd: -135.0,
      canonical100Usd: -67.5,
      journalStatus: 'TP1_ONLY',
    },
    {
      stateIndex: 2,
      titleEn: 'State 2: TP1–2 (+900) Hit',
      titleTh: 'ชนะไม้ 1–2 แพ้ไม้ 3–4 (-1,000)',
      derivationText: 'Legs 1–2 bank +300, +600; Legs 3–4 stop at -1,000 (+900 − 2,000 = -1,100 leg-pts).',
      legPts: -1100,
      rMultiple: -0.275,
      rLabel: '-1,100 / 4,000 = -0.275R',
      noteBadge: 'Cuts loss by 72.5%',
      netUsd: +(-0.275 * riskUsd).toFixed(2),
      canonical200Usd: -55.0,
      canonical100Usd: -27.5,
      journalStatus: 'TP1_ONLY',
    },
    {
      stateIndex: 3,
      titleEn: 'State 3: TP1–3 (+1,800) Hit',
      titleTh: 'ชนะไม้ 1–3 แพ้ไม้ 4 (-1,000)',
      derivationText: 'Legs 1–3 bank +300, +600, +900; Leg 4 stops at -1,000 (+1,800 − 1,000 = +800 leg-pts).',
      legPts: 800,
      rMultiple: 0.2,
      rLabel: '+800 / 4,000 = +0.20R',
      noteBadge: 'Net Profit Locked!',
      netUsd: +(0.2 * riskUsd).toFixed(2),
      canonical200Usd: 40.0,
      canonical100Usd: 20.0,
      journalStatus: 'TRAILING_LOCK',
    },
    {
      stateIndex: 4,
      titleEn: 'State 4: All 4 TPs Hit',
      titleTh: 'ชนะครบทั้ง 4 ไม้ (300..1,200)',
      derivationText: 'Legs 1–4 bank +300 + 600 + 900 + 1,200 = +3,000 leg-pts (avg +750 pts/leg).',
      legPts: 3000,
      rMultiple: 0.75,
      rLabel: '+3,000 / 4,000 = +0.75R',
      noteBadge: 'Full 4-TP Sweep',
      netUsd: +(0.75 * riskUsd).toFixed(2),
      canonical200Usd: 150.0,
      canonical100Usd: 75.0,
      journalStatus: 'FULL_SWEEP',
    },
  ];

  return {
    isBuy,
    validEntry,
    riskUsd,
    totalLot,
    legLot,
    slPrice: fmtP(slNum),
    tp1Price: fmtP(tp1Num),
    tp2Price: fmtP(tp2Num),
    tp3Price: fmtP(tp3Num),
    tp4Price: fmtP(tp4Num),
    states,
  };
}

export interface MultiStateExpectancyResult {
  totalPct: number;
  grossExpectancyR: number;
  netExpectancyR: number;
  expectedUsdPerIdea: number;
  positiveLockProbPct: number;
  binaryBreakEvenGrossPct: number;
  binaryBreakEvenNetPct: number;
}

export function calculateGhrV32Expectancy(
  probs: FiveStateProbabilities | undefined,
  riskUsd: number
): MultiStateExpectancyResult {
  const safe = probs || DEFAULT_FIVE_STATE_PROBS;
  const p0 = Math.max(0, Number(safe.p0) || 0);
  const p1 = Math.max(0, Number(safe.p1) || 0);
  const p2 = Math.max(0, Number(safe.p2) || 0);
  const p3 = Math.max(0, Number(safe.p3) || 0);
  const p4 = Math.max(0, Number(safe.p4) || 0);
  const totalPct = +(p0 + p1 + p2 + p3 + p4).toFixed(2);
  const denom = totalPct > 0 ? totalPct : 100;

  const w0 = p0 / denom;
  const w1 = p1 / denom;
  const w2 = p2 / denom;
  const w3 = p3 / denom;
  const w4 = p4 / denom;

  // GHR v3.2 3-TP + Trailing Lock R-multiples:
  // State 0 = -1.00R, State 1 = -1600/3000 (-0.5333R), State 2 = 0.00R, State 3 = +1600/3000 (+0.5333R), State 4 = +0.80R
  const grossExpectancyR = +(
    w0 * -1.0 +
    w1 * (-1600 / 3000) +
    w2 * 0.0 +
    w3 * (1600 / 3000) +
    w4 * 0.8
  ).toFixed(4);
  const spreadCostR = Math.max(0, Number(safe.spreadCostR) || 0.02);
  const netExpectancyR = +(grossExpectancyR - spreadCostR).toFixed(4);
  const expectedUsdPerIdea = +(netExpectancyR * (Number(riskUsd) || 120)).toFixed(2);
  const positiveLockProbPct = +((w3 + w4) * 100).toFixed(1);

  return {
    totalPct,
    grossExpectancyR,
    netExpectancyR,
    expectedUsdPerIdea,
    positiveLockProbPct,
    binaryBreakEvenGrossPct: 55.56,
    binaryBreakEvenNetPct: 56.67,
  };
}

export function calculateMultiStateExpectancy(
  probs: FiveStateProbabilities | undefined,
  riskUsd: number
): MultiStateExpectancyResult {
  const safe = probs || DEFAULT_FIVE_STATE_PROBS;
  const p0 = Math.max(0, Number(safe.p0) || 0);
  const p1 = Math.max(0, Number(safe.p1) || 0);
  const p2 = Math.max(0, Number(safe.p2) || 0);
  const p3 = Math.max(0, Number(safe.p3) || 0);
  const p4 = Math.max(0, Number(safe.p4) || 0);
  const totalPct = +(p0 + p1 + p2 + p3 + p4).toFixed(2);
  const denom = totalPct > 0 ? totalPct : 100;

  const w0 = p0 / denom;
  const w1 = p1 / denom;
  const w2 = p2 / denom;
  const w3 = p3 / denom;
  const w4 = p4 / denom;

  const grossExpectancyR = +(
    w0 * -1.0 +
    w1 * -0.675 +
    w2 * -0.275 +
    w3 * 0.2 +
    w4 * 0.75
  ).toFixed(4);
  const spreadCostR = Math.max(0, Number(safe.spreadCostR) || 0.02);
  const netExpectancyR = +(grossExpectancyR - spreadCostR).toFixed(4);
  const expectedUsdPerIdea = +(netExpectancyR * (Number(riskUsd) || 120)).toFixed(2);
  const positiveLockProbPct = +((w3 + w4) * 100).toFixed(1);

  return {
    totalPct,
    grossExpectancyR,
    netExpectancyR,
    expectedUsdPerIdea,
    positiveLockProbPct,
    binaryBreakEvenGrossPct: 57.14,
    binaryBreakEvenNetPct: 58.29,
  };
}

export interface DeskPageSnapshot {
  activePageId: string;
  activePageTitle: string;
  filteredJournalCount?: number;
  filteredJournalPnlUsd?: number;
  filteredJournalWinRatePct?: number;
  activeFiltersSummary?: string;
  recentFilteredTrades?: string[];
  sessionAnalyticsSummary?: string;
  guardrailAlertsSummary?: string;
  floatingPnlUsd?: number;
}

export function buildTradingCoachContext(
  state: GhrWorkspaceState,
  pageSnapshot?: DeskPageSnapshot
): string {
  const activeAccount = state.accounts[state.activePort];
  const acc = getAccountComputed(state.accounts, state.journal, state.activePort);
  const calc = getCalcMetrics(state.calcDir, state.calcEntry, state.calcRisk);
  const cons = evaluateConsistencyRule(state.cycleDays, state.includeFeeRefund, state.thbRate, {
    consistencyCapPct: activeAccount?.consistencyCapPct ?? 40,
    feeRefundUsd: activeAccount?.feeRefundUsd ?? 59,
    profitSplitPct: activeAccount?.profitSplitPct ?? 90,
    minDays: activeAccount?.minDays ?? 3,
  });
  const twelveEval = evaluateTwelveGates(state.twelveGates);
  const v32Ladder = calculateGhrV32LadderMetrics(state.calcDir, state.calcEntry, state.calcRisk);
  const expV32 = calculateGhrV32Expectancy(state.fiveStateProbs, state.calcRisk);

  const gatesChecked = Object.values(state.quickGates || {}).filter(Boolean).length;
  const todayStr = getBangkokIsoDate();
  const todayTrades = state.journal.filter(
    (j) => j.port === state.activePort && j.date === todayStr
  );
  const todayPnl = +todayTrades.reduce((s, t) => s + (Number(t.pnlUsd) || 0), 0).toFixed(2);

  const cycleSummary = state.cycleDays
    .map(
      (d, idx) =>
        `วันที่ ${idx + 1}: $${Number(d.profit) || 0}${
          d.note && !isPlaceholderDayNote(d.note, idx + 1) ? ` (${d.note})` : ''
        }`
    )
    .join(' | ');

  const accountModeText =
    acc.accountType === 'PERSONAL'
      ? `พอร์ตส่วนตัว (Personal Live · Split ${cons.profitSplitPct}% · ไม่จำกัด % รายวัน)`
      : `พอร์ต Prop Firm (Cap ${cons.capPct}% · Split ${cons.profitSplitPct}%)`;

  const consistencyLine =
    cons.hasConsistencyCap
      ? `- กฎ ${cons.capPct}% Consistency Rule: กำไรรวมรอบนี้ ${fmtUSD(cons.totalProfit)} | วันสูงสุด ${cons.bestDayPct.toFixed(1)}% | สถานะ: ${cons.isPass ? 'ผ่านเกณฑ์พร้อมถอน' : cons.bestDayPct > cons.capPct ? `เกิน ${cons.capPct}% ต้องเก็บเพิ่มอีก +${fmtUSD(cons.extraProfitNeeded)}` : 'กำลังสะสมกำไร/วันทำการ'} | รับสุทธิ ${cons.profitSplitPct}%: ${fmtUSD(cons.netPayoutUsd)} (${fmtTHB(cons.netPayoutThb)})`
      : `- รอบกำไรพอร์ตส่วนตัว (ไม่จำกัด % รายวัน): กำไรรวมรอบนี้ ${fmtUSD(cons.totalProfit)} | วันสูงสุด ${cons.bestDayPct.toFixed(1)}% | รับสุทธิ ${cons.profitSplitPct}%: ${fmtUSD(cons.netPayoutUsd)} (${fmtTHB(cons.netPayoutThb)})`;

  const allPortsSummary = Object.keys(state.accounts || {})
    .map((pid) => {
      const p = getAccountComputed(state.accounts, state.journal, pid);
      const syncTag = state.accounts[pid]?.syncProvider || 'MANUAL_XLSX';
      const typeTag = p.accountType === 'PERSONAL' ? 'Personal' : 'Prop';
      return `${pid === state.activePort ? '[ACTIVE] ' : ''}${p.name} (${typeTag}): Bal ${fmtUSD(p.balance)} | PnL ${fmtUSD(p.profit, true)} (${p.roiPct.toFixed(1)}%) | Sync:${syncTag}`;
    })
    .join(' ; ');

  const blockedGateNames = twelveEval.blockingCodes
    .map((code) => {
      const def = TWELVE_GATE_DEFINITIONS.find((d) => d.code === code);
      return def ? `G${code}:${def.titleTh}` : `G${code}`;
    })
    .join(', ');

  const contextLines = [
    pageSnapshot
      ? `- หน้าจอที่ผู้ใช้เปิดดูอยู่ (Active Screen): ${pageSnapshot.activePageTitle} [${pageSnapshot.activePageId}]`
      : null,
    `- พอร์ตที่เลือก: ${acc.name} (Login: ${acc.login}) · ประเภท: ${accountModeText}`,
    `- ภาพรวมพอร์ตทั้งหมดในระบบ: ${allPortsSummary || 'ไม่มี'}`,
    `- โบรกเกอร์/เซิร์ฟเวอร์: ${acc.brokerName || (acc.accountType === 'PERSONAL' ? 'Personal Broker MT5' : 'Prop Firm · GHR v3.2')} (${acc.brokerServer || 'XAUUSD-Live'}) | MT5 Sync: ${activeAccount?.syncProvider || 'MANUAL_XLSX'}`,
    `- ทุนเริ่มต้น: ${fmtUSD(acc.initial)} | Balance ปัจจุบัน: ${fmtUSD(acc.balance)} | กำไรสะสม: ${fmtUSD(acc.profit, true)} (${acc.roiPct >= 0 ? '+' : ''}${acc.roiPct.toFixed(1)}%)`,
    `- เป้าหมายกำไร: ${fmtUSD(acc.targetProfit)} | ขาดอีก: ${fmtUSD(acc.rem)} | วันเทรดสะสม: ${acc.currentDays}/${acc.minDays} วัน (${acc.tradeCount} ไม้)`,
    `- โควต้าวันนี้ (${todayStr}): เทรดไปแล้ว ${todayTrades.length}/3 ไม้ (กำไรวันนี้ ${fmtUSD(todayPnl, true)}${
      pageSnapshot?.floatingPnlUsd ? ` | Floating: ${fmtUSD(pageSnapshot.floatingPnlUsd, true)}` : ''
    })`,
    `- โพย 3-TP + Trailing Lock (GHR v3.2): ${state.calcDir} LIMIT @ ${calc.validEntry.toFixed(2)} | ความเสี่ยง $${calc.risk}/Idea (${calc.lotLeg} Lot × 3 ไม้ = ${v32Ladder.totalLot.toFixed(2)} Lot) | SL ${calc.slPrice} (-1.00R = ${fmtUSD(v32Ladder.states[0].netUsd)}) | TP1 ${calc.tp1Price} (-0.533R = ${fmtUSD(v32Ladder.states[1].netUsd)}) | TP2 ${calc.tp2Price} (Trailing Lock +0.533R = +${fmtUSD(v32Ladder.states[3].netUsd)}) | TP3 ${calc.tp3Price} (Full Sweep +0.80R = +${fmtUSD(v32Ladder.states[4].netUsd)})`,
    `- ค่าคาดหวังสุทธิ GHR v3.2 (5-State Expectancy): E_net[R] = ${expV32.netExpectancyR >= 0 ? '+' : ''}${expV32.netExpectancyR.toFixed(3)}R (${fmtUSD(expV32.expectedUsdPerIdea, true)}/Idea · โอกาสล็อกกำไร State 3+4 = ${expV32.positiveLockProbPct}%)`,
    `- ด่านตรวจก่อนเทรด: Quick Gates ${gatesChecked}/5 ข้อ | 12-Gate Fail-Closed ${twelveEval.passedCount}/12 ข้อ (${twelveEval.statusLabel})${
      blockedGateNames ? ` | ด่านที่ยังไม่ผ่าน: ${blockedGateNames}` : ''
    }`,
    consistencyLine,
    `- รายละเอียดรายวันในรอบถอน: ${cycleSummary}`,
    pageSnapshot?.sessionAnalyticsSummary
      ? `- สถิติวิเคราะห์รายเซสชัน: ${pageSnapshot.sessionAnalyticsSummary}`
      : null,
    pageSnapshot?.guardrailAlertsSummary
      ? `- แจ้งเตือน Guardrail วินัย: ${pageSnapshot.guardrailAlertsSummary}`
      : null,
    pageSnapshot && typeof pageSnapshot.filteredJournalCount === 'number'
      ? `- สมุดเทรดที่กรองอยู่บนหน้าจอ (${pageSnapshot.activeFiltersSummary || 'ALL'}): ${pageSnapshot.filteredJournalCount} ไม้ | WinRate ${pageSnapshot.filteredJournalWinRatePct ?? 0}% | Net P/L ${fmtUSD(pageSnapshot.filteredJournalPnlUsd ?? 0, true)}${
          pageSnapshot.recentFilteredTrades && pageSnapshot.recentFilteredTrades.length > 0
            ? `\n  ล่าสุด: ${pageSnapshot.recentFilteredTrades.join(' | ')}`
            : ''
        }`
      : null,
    Array.isArray(state.purchasedSetupIds) && state.purchasedSetupIds.length > 0
      ? `- Marketplace Setups ที่บันทึก/ปลดล็อก: ${state.purchasedSetupIds.length} รายการ`
      : null,
  ].filter(Boolean) as string[];

  return contextLines.join('\n').slice(0, 5800);
}

export function generateLocalTacticalPlan(
  state: GhrWorkspaceState,
  pageSnapshot?: DeskPageSnapshot
): string {
  const activeAccount = state.accounts[state.activePort];
  const acc = getAccountComputed(state.accounts, state.journal, state.activePort);
  const calc = getCalcMetrics(state.calcDir, state.calcEntry, state.calcRisk);
  const cons = evaluateConsistencyRule(state.cycleDays, state.includeFeeRefund, state.thbRate, {
    consistencyCapPct: activeAccount?.consistencyCapPct ?? 40,
    feeRefundUsd: activeAccount?.feeRefundUsd ?? 59,
    profitSplitPct: activeAccount?.profitSplitPct ?? 90,
    minDays: activeAccount?.minDays ?? 3,
  });
  const twelveEval = evaluateTwelveGates(state.twelveGates);
  const v32Ladder = calculateGhrV32LadderMetrics(state.calcDir, state.calcEntry, state.calcRisk);
  const expV32 = calculateGhrV32Expectancy(state.fiveStateProbs, state.calcRisk);
  const gatesChecked = Object.values(state.quickGates || {}).filter(Boolean).length;

  const fullSweepNeeded = calc.fullSweepUsd > 0 ? Math.ceil(acc.rem / calc.fullSweepUsd) : 0;
  const tlNeeded = calc.tlHitUsd > 0 ? Math.ceil(acc.rem / calc.tlHitUsd) : 0;

  const lines: string[] = [
    `📌 **แผนปฏิบัติการเทรด GHR v3.2 & Desk Cards — ${acc.name}**`,
    `1. **สถานะพอร์ตและเป้าหมาย (${acc.accountType === 'PERSONAL' ? 'พอร์ตส่วนตัว' : 'Prop Firm'})**: Balance ${fmtUSD(acc.balance)} (กำไรสะสม ${fmtUSD(acc.profit, true)} / เป้า ${fmtUSD(acc.targetProfit)}) · วันเทรด ${acc.currentDays}/${acc.minDays} วัน`,
  ];

  if (acc.rem > 0) {
    lines.push(
      `   • ขาดกำไรอีก **${fmtUSD(acc.rem)}** → ต้องการชนะ **Full 3 ไม้ อีก ${fullSweepNeeded} ครั้ง** (+${fmtUSD(calc.fullSweepUsd)}/ครั้ง) หรือ **Trailing Lock อีก ${tlNeeded} ครั้ง** (+${fmtUSD(calc.tlHitUsd)}/ครั้ง)`
    );
  } else if (acc.accountType === 'PERSONAL') {
    lines.push(
      `   • ถึงเป้าหมายสะสมแล้ว! สามารถถอนกำไรบางส่วนหรือปรับเป้าสะสมใหม่และคงวินัย 12-Gate ต่อเนื่อง`
    );
  } else {
    lines.push(
      `   • ผ่านเป้าหมายกำไรแล้ว! หากวันเทรดยังไม่ครบ (${acc.currentDays}/${acc.minDays} วัน) ให้เปิดเพียง 0.01 Lot วันละ 1 ไม้เพื่อรักษาหน้าตัก`
    );
  }

  lines.push(
    `2. **แผนเข้าออเดอร์ GHR v3.2 (3-TP + Trailing Lock · ${state.calcDir} LIMIT @ ${calc.validEntry.toFixed(2)})**:`,
    `   • **ขนาดสัญญา 3 ไม้ (1 Idea)**: **${calc.lotLeg} Lot × 3 ไม้** (รวม ${v32Ladder.totalLot.toFixed(2)} Lot · Risk ${fmtUSD(calc.risk)}) | SL = ${calc.slPrice} (-1.00R) | TP1 = ${calc.tp1Price} (+400p) | TP2 = ${calc.tp2Price} (+800p · ย้าย SL ไม้ 3 ไป ${calc.tp1Price} ล็อกกำไรสุทธิ +0.533R = +${fmtUSD(calc.tlHitUsd)}) | TP3 = ${calc.tp3Price} (+1,200p · Full Sweep +0.80R = +${fmtUSD(calc.fullSweepUsd)})`,
    `   • **สมการค่าคาดหวัง 5 สถานะ (GHR v3.2 Expectancy)**: **E_net[R] = ${expV32.netExpectancyR >= 0 ? '+' : ''}${expV32.netExpectancyR.toFixed(3)}R (${fmtUSD(expV32.expectedUsdPerIdea, true)}/Idea)** · โอกาสล็อกกำไรสุทธิ (State 3+4) = **${expV32.positiveLockProbPct}%**`,
    `   • **ด่านตรวจ 12-Gate Fail-Closed Protocol**: **ผ่าน ${twelveEval.passedCount}/12 ข้อ** | เช็กลิสต์ 5 ประตู: **${gatesChecked}/5 ข้อ**`
  );

  if (cons.hasConsistencyCap) {
    lines.push(
      `3. **แผนคุมกฎ ${cons.capPct}% Consistency Rule**:`,
      cons.isPass
        ? `   • ผ่านเกณฑ์ ${cons.capPct}% เรียบร้อย (กำไรรวม ${fmtUSD(cons.totalProfit)} · วันสูงสุด ${cons.bestDayPct.toFixed(1)}%) ยอดถอนสุทธิ **${fmtTHB(cons.netPayoutThb)} (${fmtUSD(cons.netPayoutUsd)})**`
        : cons.bestDayPct > cons.capPct
        ? `   • วันสูงสุดคิดเป็น ${cons.bestDayPct.toFixed(1)}% (เกิน ${cons.capPct}%) แนะนำให้กระจายเก็บกำไรในวันถัดไปเพิ่มอีกอย่างน้อย **+${fmtUSD(cons.extraProfitNeeded)}** เพื่อให้ยอดรวมแตะ ${fmtUSD(cons.minTotalNeeded)}`
        : `   • แนะนำคุมกำไรต่อวันให้อยู่ในกรอบ **$${Math.round(calc.fullSweepUsd)}–$${Math.round(calc.fullSweepUsd + calc.tlHitUsd)}** ต่อวัน (เช่น 1 Full + 1 TL) สม่ำเสมอ ${activeAccount?.minDays ?? 3} วันทำการ เพื่อผ่านกฎ ${cons.capPct}% แบบปลอดภัย`
    );
  } else {
    lines.push(
      `3. **สรุปรอบกำไรพอร์ตส่วนตัว (Personal Live · ${cons.profitSplitPct}% Split)**:`,
      `   • พอร์ตส่วนตัวไม่มีเพดาน % รายวัน — กำไรสะสมรอบนี้ **${fmtUSD(cons.totalProfit)}** คิดเป็นยอดรับสุทธิ **${fmtTHB(cons.netPayoutThb)} (${fmtUSD(cons.netPayoutUsd)})**`
    );
  }

  if (pageSnapshot) {
    lines.push(`4. **บริบทหน้าปัจจุบัน (${pageSnapshot.activePageTitle})**:`);
    if (pageSnapshot.activePageId === 'sec-accounts') {
      const portCount = Object.keys(state.accounts || {}).length;
      const propCount = Object.values(state.accounts || {}).filter((a) => resolveAccountType(a) === 'PROP').length;
      lines.push(
        `   • มีพอร์ตทั้งหมด **${portCount} บัญชี** (Prop Firm ${propCount} / Personal ${portCount - propCount})${
          pageSnapshot.sessionAnalyticsSummary ? ` · ${pageSnapshot.sessionAnalyticsSummary}` : ''
        }`
      );
    } else if (pageSnapshot.activePageId === 'desk-cards-root') {
      const missing = twelveEval.blockingCodes
        .slice(0, 6)
        .map((c) => {
          const def = TWELVE_GATE_DEFINITIONS.find((d) => d.code === c);
          return def ? `G${c} (${def.titleTh})` : `G${c}`;
        })
        .join(', ');
      lines.push(
        twelveEval.isAllPassed
          ? `   • ผ่านครบ 12/12 ด่านเรียบร้อย พร้อมใช้งานภายใต้กรอบความเสี่ยง`
          : `   • ด่านที่ยังรอเช็กก่อนเข้า (${twelveEval.blockingCodes.length} ข้อ): **${missing}**${
              twelveEval.blockingCodes.length > 6 ? ' ...' : ''
            }`
      );
    } else if (pageSnapshot.activePageId === 'journal-root') {
      lines.push(
        `   • ตัวกรองบนหน้าจอ (${pageSnapshot.activeFiltersSummary || 'ALL'}): แสดง **${pageSnapshot.filteredJournalCount ?? 0} ไม้** · WinRate **${pageSnapshot.filteredJournalWinRatePct ?? 0}%** · Net **${fmtUSD(pageSnapshot.filteredJournalPnlUsd ?? 0, true)}** (MT5 Sync: ${activeAccount?.syncProvider || 'MANUAL_XLSX'})`
      );
    } else if (pageSnapshot.activePageId === 'sec-marketplace') {
      lines.push(
        `   • ตรวจสอบเกณฑ์ Marketplace: Setup ทุกชิ้นเทียบความเสี่ยงต่อไม้กับพอร์ต **${acc.name}** (Risk $${calc.risk}/Idea) และตรวจ Drawdown จริงก่อนนำไปใช้`
      );
    } else if (pageSnapshot.activePageId === 'sec-proprules') {
      lines.push(
        `   • หน้า PropRules Real-Time: ตรวจพอร์ต **${acc.name}** (${acc.accountType === 'PERSONAL' ? 'Personal' : `Prop Cap ${cons.capPct}%`}) เทียบช่องทางซิงก์ (${activeAccount?.syncProvider || 'MANUAL_XLSX'}) และกฎ VPS/Consistency ของกองทุนก่อนกด Payout`
      );
    } else if (pageSnapshot.guardrailAlertsSummary) {
      lines.push(`   • Guardrail: ${pageSnapshot.guardrailAlertsSummary}`);
    }
  }

  return lines.join('\n');
}

export type TradeSessionCode = 'ASIA' | 'LONDON' | 'NY';

export function getTradeSession(timeStr: string | undefined): TradeSessionCode {
  const match = /^(\d{1,2})/.exec((timeStr || '').trim());
  const hour = match ? parseInt(match[1], 10) : 12;
  if (hour >= 6 && hour < 14) return 'ASIA';
  if (hour >= 14 && hour < 20) return 'LONDON';
  return 'NY';
}

export function syncQuickFromTwelveGates(twelveGates: TwelveGatesState): QuickGates {
  return {
    g1: !!twelveGates.g06,
    g2: !!twelveGates.g07,
    g3: !!twelveGates.g09,
    g4: !!twelveGates.g12,
    g5: !!twelveGates.g12,
  };
}

export function syncQuickGateToTwelveGates(
  prevQuick: QuickGates,
  prevTwelve: TwelveGatesState | undefined,
  key: keyof QuickGates,
  checked: boolean
): { quickGates: QuickGates; twelveGates: TwelveGatesState } {
  const nextQuick: QuickGates = { ...prevQuick, [key]: checked };
  const nextTwelve: TwelveGatesState = { ...(prevTwelve || DEFAULT_TWELVE_GATES) };
  if (key === 'g1') nextTwelve.g06 = checked;
  if (key === 'g2') nextTwelve.g07 = checked;
  if (key === 'g3') nextTwelve.g09 = checked;
  if (key === 'g4' || key === 'g5') {
    nextTwelve.g12 = !!(nextQuick.g4 && nextQuick.g5);
  }
  return { quickGates: nextQuick, twelveGates: nextTwelve };
}

export interface JournalFilterCriteria {
  portFilter?: string;
  statusFilter?: 'ALL' | 'FULL_SWEEP' | 'TRAILING_LOCK' | 'LOSS';
  dateFilter?: 'ALL' | 'TODAY' | '7D' | '30D';
  sessionFilter?: 'ALL' | 'ASIA' | 'LONDON' | 'NY';
  search?: string;
  todayIso?: string;
}

export function filterJournalTrades(
  journal: TradeRecord[],
  criteria: JournalFilterCriteria
): TradeRecord[] {
  const todayIso =
    criteria.todayIso && /^\d{4}-\d{2}-\d{2}$/.test(criteria.todayIso)
      ? criteria.todayIso
      : getBangkokIsoDate();
  const min7d = shiftIsoDateUtc(todayIso, -6);
  const min30d = shiftIsoDateUtc(todayIso, -29);
  const q = (criteria.search || '').trim().toLowerCase();

  return journal.filter((j) => {
    if (criteria.portFilter && criteria.portFilter !== 'ALL') {
      if (j.port !== criteria.portFilter && j.port.toUpperCase() !== criteria.portFilter) {
        return false;
      }
    }
    if (criteria.statusFilter === 'FULL_SWEEP' && j.status !== 'FULL_SWEEP') return false;
    if (criteria.statusFilter === 'TRAILING_LOCK' && j.status !== 'TRAILING_LOCK') return false;
    if (criteria.statusFilter === 'LOSS' && (Number(j.pnlUsd) || 0) >= 0) return false;

    const d = (j.date || '').slice(0, 10);
    if (criteria.dateFilter === 'TODAY' && d !== todayIso) return false;
    if (criteria.dateFilter === '7D' && (!d || d < min7d || d > todayIso)) return false;
    if (criteria.dateFilter === '30D' && (!d || d < min30d || d > todayIso)) return false;

    if (criteria.sessionFilter && criteria.sessionFilter !== 'ALL') {
      if (getTradeSession(j.time) !== criteria.sessionFilter) return false;
    }

    if (q !== '') {
      const sess = getTradeSession(j.time).toLowerCase();
      const hay = `${j.id} ${j.date} ${j.time} ${sess} ${j.dir} ${j.entry} ${j.status} ${
        j.note || ''
      }`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export interface TradeGuardrailSummary {
  isCooldownActive: boolean;
  cooldownRemainingMin: number;
  isDailyCapReached: boolean;
  gatesPassed: number;
  allGatesPassed: boolean;
  warnings: string[];
}

export function evaluateTradeGuardrails(params: {
  cooldownUntil: number | null;
  nowMs?: number;
  todayTradesCount: number;
  maxDailyTrades?: number;
  twelveGates: TwelveGatesState | undefined;
}): TradeGuardrailSummary {
  const nowMs = params.nowMs ?? Date.now();
  const maxDailyTrades = params.maxDailyTrades ?? 3;
  const remainingMs = params.cooldownUntil ? Math.max(0, params.cooldownUntil - nowMs) : 0;
  const isCooldownActive = remainingMs > 0;
  const cooldownRemainingMin = isCooldownActive ? Math.ceil(remainingMs / 60000) : 0;
  const isDailyCapReached = params.todayTradesCount >= maxDailyTrades;
  const twelveEval = evaluateTwelveGates(params.twelveGates);

  const warnings: string[] = [];
  if (isCooldownActive) {
    warnings.push(`ติด Cooldown หลังชน SL (เหลือ ${cooldownRemainingMin} นาที)`);
  }
  if (isDailyCapReached) {
    warnings.push(`ครบโควตาเทรดวันนี้แล้ว (${params.todayTradesCount}/${maxDailyTrades} ไม้)`);
  }
  if (!twelveEval.isAllPassed) {
    warnings.push(`12-Gate ผ่าน ${twelveEval.passedCount}/12 ด่าน`);
  }

  return {
    isCooldownActive,
    cooldownRemainingMin,
    isDailyCapReached,
    gatesPassed: twelveEval.passedCount,
    allGatesPassed: twelveEval.isAllPassed,
    warnings,
  };
}

export const SHARED_CUSTOMER_PORTAL_URL =
  'https://ais-pre-5xostjhm6vsrfzslv4eadv-688119101619.asia-east1.run.app';

export function sanitizeLicenseKey(rawKey: string): string {
  return String(rawKey || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 64);
}

export function getDefaultCustomerPortalOrigin(currentOrigin?: string): string {
  const raw = String(currentOrigin || '').trim().replace(/\/+$/, '');
  if (!raw || raw.includes('localhost') || raw.includes('127.0.0.1')) {
    return SHARED_CUSTOMER_PORTAL_URL;
  }
  if (raw.includes('://ais-dev-')) {
    return raw.replace('://ais-dev-', '://ais-pre-');
  }
  return raw;
}

export function buildCustomerInviteUrl(baseUrl: string, licenseKey?: string): string {
  const cleanBase = String(baseUrl || SHARED_CUSTOMER_PORTAL_URL).trim().replace(/\/+$/, '');
  const cleanKey = sanitizeLicenseKey(licenseKey || '');
  if (cleanKey.length >= 6) {
    return `${cleanBase}/?key=${encodeURIComponent(cleanKey)}`;
  }
  return `${cleanBase}/?portal=login`;
}

export function parseCustomerPortalParams(search: string): {
  inviteKey: string;
  openPortal: boolean;
} {
  try {
    const params = new URLSearchParams(search || '');
    const rawKey = params.get('key') || params.get('invite') || '';
    const inviteKey = sanitizeLicenseKey(rawKey);
    const hasValidInviteKey = inviteKey.length >= 6;
    const portalFlag = (params.get('portal') || '').trim().toLowerCase();
    const openPortal =
      hasValidInviteKey || portalFlag === 'login' || portalFlag === 'customer' || portalFlag === 'license';
    return {
      inviteKey: hasValidInviteKey ? inviteKey : '',
      openPortal,
    };
  } catch {
    return { inviteKey: '', openPortal: false };
  }
}
