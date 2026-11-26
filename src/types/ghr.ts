export type TradeDirection = 'BUY' | 'SELL';

export type TradeOutcomeStatus =
  | 'FULL_SWEEP'
  | 'TRAILING_LOCK'
  | 'TP1_ONLY'
  | 'BREAK_EVEN'
  | 'FULL_SL'
  | 'CUSTOM';

export type AccountType = 'PROP' | 'PERSONAL';

export type Mt5SyncProvider =
  | 'MANUAL_XLSX'
  | 'DIRECT_INVESTOR'
  | 'LIVE_BRIDGE'
  | 'METAAPI_CLOUD'
  | 'BRIDGE_API'
  | 'FUNDEDNEXT_MCP'
  | 'MYFXBOOK_API'
  | 'PROJECTX_API';

export type Mt5TimeOffsetSetting = 'AUTO_MT5' | number;

export interface AccountInfo {
  id: string;
  login: string;
  name: string;
  accountType?: AccountType;
  brokerName?: string;
  brokerServer?: string;
  syncProvider?: Mt5SyncProvider;
  tredynApiKey?: string;
  autoSyncRealtime?: boolean;
  fundedNextConnectionId?: string;
  fundedNextAccountId?: string;
  metaApiAccountId?: string;
  bridgeUrl?: string;
  externalAccountRef?: string;
  investorLabel?: string;
  lastMt5SyncAt?: string | null;
  initial: number;
  targetProfit: number;
  minDays: number;
  defaultRisk: number;
  consistencyCapPct?: number;
  feeRefundUsd?: number;
  profitSplitPct?: number;
}

export interface AccountComputed extends AccountInfo {
  accountType: AccountType;
  profit: number;
  balance: number;
  currentDays: number;
  rem: number;
  roiPct: number;
  badge: string;
  tradeCount: number;
}

export interface TradeRecord {
  id: string;
  port: string;
  date: string;
  time: string;
  dir: TradeDirection;
  entry: number;
  risk: number;
  lotLeg: number;
  slPrice: number;
  tp1Price: number;
  tp2Price: number;
  tp3Price: number;
  tp1Pts: number;
  tp2Pts: number;
  tp3Pts: number;
  slPts: number;
  totalPts: number;
  rr: number;
  pnlUsd: number;
  status: TradeOutcomeStatus;
  note: string;
  calculatorDetails?: CalculatorTradeDetails;
  gatesPassedAtLog?: number;
}

export interface CycleDay {
  day: number;
  note: string;
  profit: number;
  date?: string;
}

export type CalculatorMode = 'GHR_PRESET' | 'MANUAL';
export type CalculatorInstrument = 'XAUUSD' | 'EURUSD' | 'GBPUSD' | 'USDJPY' | 'NAS100' | 'BTCUSD' | 'CUSTOM';
export type CalculatorDistanceUnit = 'POINTS' | 'PRICE_DISTANCE';

export interface CalculatorContract {
  usdPerPriceMove: number;
  priceDecimals: 2 | 3 | 4 | 5;
  pointsPerPrice: number;
}

export interface CalculatorLevelInput {
  unit: CalculatorDistanceUnit | 'EXACT_PRICE';
  value: number;
}

export interface ManualCalculatorConfig {
  instrument: CalculatorInstrument;
  customContract: CalculatorContract;
  sizing: 'BY_RISK' | 'BY_LOT';
  lotBasis: 'TOTAL' | 'PER_LEG';
  manualLot: number;
  legCount: 1 | 2 | 3;
  distanceUnit: CalculatorDistanceUnit;
  sl: CalculatorLevelInput;
  targets: [CalculatorLevelInput, CalculatorLevelInput, CalculatorLevelInput];
  weights: [number, number, number];
  trailingLock: boolean;
}

export interface CalculatorTradeDetails {
  instrument: CalculatorInstrument;
  contract: CalculatorContract;
  totalLot: number;
  legLots: number[];
}

export interface ConsistencyRule {
  consistencyCapPct: number;
  minDays: number;
  minTotalUsd: number;
  profitSplitPct: number;
  feeRefundUsd: number;
  includeFeeRefund: boolean;
}

export interface QuickGates {
  g1: boolean;
  g2: boolean;
  g3: boolean;
  g4: boolean;
  g5: boolean;
}

export interface Mt5PositionRecord {
  ticket: string;
  symbol: string;
  dir: TradeDirection;
  openDate: string;
  openTime: string;
  openTs: number;
  closeDate: string;
  closeTime: string;
  closeTs: number;
  rawOpenTime?: string;
  rawCloseTime?: string;
  volume: number;
  openPrice: number;
  slPrice: number;
  tpPrice: number;
  closePrice: number;
  commission: number;
  swap: number;
  rawProfit: number;
  netProfit: number;
  comment: string;
}

export interface Mt5ReportMeta {
  holderName: string;
  login: string;
  broker: string;
  currency: string;
  initialDeposit: number;
  summaryNetProfit: number | null;
}

export interface Mt5RawReport {
  meta: Mt5ReportMeta;
  positions: Mt5PositionRecord[];
  importedAt: string;
}

export interface TwelveGatesState {
  g01: boolean;
  g02: boolean;
  g03: boolean;
  g04: boolean;
  g05: boolean;
  g06: boolean;
  g07: boolean;
  g08: boolean;
  g09: boolean;
  g10: boolean;
  g11: boolean;
  g12: boolean;
}

export interface FiveStateProbabilities {
  p0: number;
  p1: number;
  p2: number;
  p3: number;
  p4: number;
  spreadCostR: number;
}

export interface GhrWorkspaceState {
  theme: 'aurora';
  privacyMasked: boolean;
  thbRate: number;
  activePort: string;
  calcDir: TradeDirection;
  calcEntry: number;
  calcEntryRaw: string;
  calcRisk: number;
  calcNote: string;
  calcMode?: CalculatorMode;
  manualCalculator?: ManualCalculatorConfig;
  quickGates: QuickGates;
  twelveGates?: TwelveGatesState;
  fiveStateProbs?: FiveStateProbabilities;
  goldenRulesAck?: Record<string, boolean>;
  cooldownUntil: number | null;
  accounts: Record<string, AccountInfo>;
  cycleDays: CycleDay[];
  cycleDaysByPort?: Record<string, CycleDay[]>;
  includeFeeRefund: boolean;
  consistencyOverrides?: Record<string, Partial<ConsistencyRule>>;
  journalFilter: string;
  journalStatusFilter: 'ALL' | 'FULL_SWEEP' | 'TRAILING_LOCK' | 'LOSS';
  journalDateFilter?: 'ALL' | 'TODAY' | '7D' | '30D';
  journalSessionFilter?: 'ALL' | 'ASIA' | 'LONDON' | 'NY';
  journalSearch: string;
  showManualAddForm: boolean;
  showAddPortForm: boolean;
  showDbManager: boolean;
  showMt5Importer: boolean;
  mt5GroupMode: 'IDEA' | 'POSITION';
  mt5IncludeFees: boolean;
  mt5TimeOffset?: Mt5TimeOffsetSetting;
  mt5RawReports: Record<string, Mt5RawReport>;
  editingPortId: string | null;
  editingTradeId: string | null;
  inlineEditMode: boolean;
  autoSyncFormMetrics: boolean;
  autoCloudSync: boolean;
  apiEndpointUrl: string;
  apiSecretKey: string;
  lastSavedAt: string | null;
  journal: TradeRecord[];
  chatMessages?: ChatMessage[];
  chatModel?: ChatModelId;
  deskBrandName?: string;
  deskBrandSubtitle?: string;
  onboardingCompleted?: boolean;
  showHelpGuide?: boolean;
  showLicenseModal?: boolean;
  purchasedSetupIds?: string[];
}

export interface MarketCandle {
  ts: number;
  timeLabel: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface LiveChartTelemetry {
  symbol: string;
  timeframe: string;
  source: string;
  fetchedAt: string;
  staleCache?: boolean;
  currentPrice: number;
  prevClose: number;
  changeAbs: number;
  changePct: number;
  intradayHigh: number;
  intradayLow: number;
  ema20: number;
  ema50: number;
  rsi14: number;
  atr14: number;
  trendBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  supportLevel: number;
  resistanceLevel: number;
  candles: MarketCandle[];
}

export type Mt5VerificationChannel =
  | 'LIVE_BRIDGE'
  | 'DIRECT_INVESTOR'
  | 'METAAPI_CLOUD'
  | 'MANUAL_XLSX'
  | 'FUNDEDNEXT_MCP'
  | 'MYFXBOOK_API'
  | 'PROJECTX_API';

export interface VerifiedSetupMetrics {
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRatePct: number;
  profitFactor: number;
  netProfitUsd: number;
  grossProfitUsd: number;
  grossLossUsd: number;
  maxDrawdownUsd: number;
  maxDrawdownPct: number;
  avgR: number;
  consistencyBestDayPct: number;
  symbols: string[];
  firstTradeDate: string;
  lastTradeDate: string;
  equityCurve: Array<{ label: string; equityUsd: number; pnlUsd: number }>;
  sampleDeals: Array<{
    ticket: string;
    symbol: string;
    dir: TradeDirection;
    closeDate: string;
    netProfit: number;
    volume: number;
  }>;
}

export interface DeskSetupBlueprint {
  directionMode: 'BUY' | 'SELL' | 'BOTH';
  primarySymbol: string;
  timeframe: string;
  sessionFocus: 'ALL' | 'ASIA' | 'LONDON' | 'NY';
  riskUsd: number;
  slPoints: number;
  tp1Points: number;
  tp2Points: number;
  tp3Points: number;
  checklistNotes: string[];
  executionPlaybook: string;
}

export interface MarketplaceDeskSetup {
  id: string;
  title: string;
  summary: string;
  priceUsd: number;
  sellerUid: string;
  sellerName: string;
  verificationChannel: Mt5VerificationChannel;
  brokerName: string;
  brokerServer: string;
  maskedLogin: string;
  proofHash: string;
  verifiedAt: string;
  createdAt: string;
  buyerCount: number;
  metrics: VerifiedSetupMetrics;
  blueprint: DeskSetupBlueprint;
}

export type PlanTier = 'FREE' | 'TRIAL' | 'PRO' | 'LIFETIME' | 'ADMIN';

export interface LicenseRecord {
  licenseKey: string;
  plan: 'TRIAL' | 'PRO' | 'LIFETIME';
  status: 'ACTIVE' | 'REVOKED';
  notes: string;
  redeemedByUid: string;
  redeemedEmail: string;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface EntitlementRecord {
  ownerId: string;
  email: string;
  plan: PlanTier;
  licenseKey: string;
  status: 'ACTIVE' | 'SUSPENDED';
}

export type ChatModelId =
  | 'auto'
  | 'gemini-4-hydrogen'
  | 'gemini-3.5-flash-lite'
  | 'gemini-3.1-flash-lite'
  | 'gemma-4-31b-it'
  | 'gemma-4-26b-a4b-it';

export interface ChatMessageSource {
  title: string;
  uri: string;
}

export interface ChatMessageAttachmentMeta {
  name: string;
  mimeType: string;
}

export interface ChatSuggestedAction {
  label: string;
  type: 'RISK' | 'PAGE' | 'MT5_SYNC';
  value: string | number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  model?: string;
  chartSummary?: string;
  imageAttached?: boolean;
  sources?: ChatMessageSource[];
  attachments?: ChatMessageAttachmentMeta[];
  routedBy?: 'decision-1' | 'heuristic' | 'manual' | 'live' | 'local';
  routeTier?: string;
  mode?: 'text' | 'voice' | 'live';
  suggestedActions?: ChatSuggestedAction[];
}

export interface ChatSessionRecord {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  pinned?: boolean;
  activePortId?: string;
  lastModel?: string;
  mode?: 'text' | 'voice' | 'live';
  messages: ChatMessage[];
}

export interface SnapshotItem {
  snapId: string;
  scope?: string;
  createdAt: string;
  reason: string;
  tradeCount: number;
  portCount: number;
  payload: GhrWorkspaceState;
}

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  channel: 'LOCAL' | 'IDB' | 'BROADCAST' | 'CLOUD' | 'OFFLINE_QUEUE';
  action: string;
  status: 'SUCCESS' | 'QUEUED' | 'CONFLICT_RESOLVED' | 'ERROR';
}

