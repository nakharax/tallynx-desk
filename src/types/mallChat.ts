export const MALL_ZONES = [
  { id: 'lounge-general', titleEn: 'Trader Lounge', titleTh: 'ลานสนทนาวินัยเทรด', descriptionEn: 'Daily routines, risk discipline, and journal reflections.', descriptionTh: 'กิจวัตร วินัยการบริหารความเสี่ยง และบทเรียนจากสมุดเทรด' },
  { id: 'xauusd-session', titleEn: 'XAUUSD & Session Review', titleTh: 'ทบทวนรอบเทรด XAUUSD', descriptionEn: 'Review completed sessions, drawdown, and realized R.', descriptionTh: 'ทบทวนรอบเทรดที่จบแล้ว การลดลงของพอร์ต และค่า R ที่เกิดขึ้นจริง' },
  { id: 'prop-rules-qa', titleEn: 'Prop Rules Q&A', titleTh: 'ถาม-ตอบกติกากองทุน', descriptionEn: 'Compare risk limits, drawdown rules, and consistency calculations.', descriptionTh: 'เปรียบเทียบวงเงินความเสี่ยง กฎ Drawdown และการคำนวณความสม่ำเสมอ' },
  { id: 'setup-showroom', titleEn: 'Verified Setup Showroom', titleTh: 'โชว์รูมชุดตั้งค่า MT5', descriptionEn: 'Inspect 3-TP risk blueprints and historical MT5 evidence.', descriptionTh: 'ตรวจสอบบลูพรินต์ความเสี่ยง 3-TP และหลักฐานย้อนหลังจาก MT5' },
] as const;

export type MallZone = (typeof MALL_ZONES)[number];
export type MallZoneId = MallZone['id'];
export const MALL_REACTIONS = ['🔥', '🛡️', '📊', '✅'] as const;
export const MALL_STATUSES = ['WAITING_SETUP', 'HOLDING_ORDER', 'CLOSED_FOR_DAY'] as const;
export const MALL_CHANNELS = ['LIVE_BRIDGE', 'FUNDEDNEXT_MCP', 'MYFXBOOK_API', 'MANUAL_XLSX'] as const;
export const MALL_SAFE_HARBOR = {
  en: 'Discuss risk management plans and verified MT5 statistics only. Not investment advice or trade signals.',
  th: 'พูดคุยแผนบริหารความเสี่ยงและสถิติ MT5 เท่านั้น ไม่ใช่คำแนะนำการลงทุนหรือส่งซิกแนล',
} as const;

export type MallStatus = (typeof MALL_STATUSES)[number];
export type MallVerificationChannel = (typeof MALL_CHANNELS)[number];
export type MallAuthorRole = 'trader' | 'example';

export interface MallVerifiedBadge {
  channel: MallVerificationChannel;
  brokerName: string;
  verifiedAt: string;
  winRatePct?: number;
  profitFactor?: number;
}

export interface MallSetupBlueprint {
  listingId?: string;
  title: string;
  primarySymbol: string;
  timeframe: string;
  sessionFocus: string;
  riskUsd: number;
  slPoints: number;
  tp1Points: number;
  tp2Points: number;
  tp3Points: number;
  checklistNotes: string[];
  proofHash?: string;
  proofKind?: 'reference';
  winRatePct?: number;
  profitFactor?: number;
}

export interface MallSnapshotAttachment {
  snapshotId: string;
  snapshotUrl: string;
  symbol: string;
  rMultiple?: number;
  session?: string;
  capturedAt: string;
}

export interface MallSessionStatusPill {
  status: MallStatus;
  rMultipleToday: number;
  sessionLabel: string;
}

export interface MallChatMessage {
  id: string;
  clientMessageId: string;
  zoneId: MallZoneId;
  handle: string;
  authorRole: MallAuthorRole;
  createdAt: string;
  text: string;
  symbol?: string;
  threadRootId?: string;
  replyCount: number;
  reactions: Record<string, string[]>;
  verifiedBadge?: MallVerifiedBadge;
  setupBlueprint?: MallSetupBlueprint;
  snapshotAttachment?: MallSnapshotAttachment;
  sessionStatusPill?: MallSessionStatusPill;
}

export interface MallPresence extends MallSessionStatusPill {
  id: string;
  handle: string;
  symbol: string;
  verifiedChannel?: MallVerificationChannel;
  updatedAt: string;
}

export type MallZoneSummary = MallZone & {
  messageCount: number;
  blueprintCount: number;
  verifiedPostCount: number;
  activeCount: number;
  presence: MallPresence[];
  latestMessagePreview: Pick<MallChatMessage, 'id' | 'handle' | 'text' | 'createdAt'> | null;
};

export function isMt5VerifiedMallPost(message: MallChatMessage): boolean {
  return message.authorRole !== 'example' && Boolean(message.verifiedBadge || message.snapshotAttachment?.snapshotUrl.startsWith('data:image/svg+xml;utf8,') ||
    (message.setupBlueprint?.proofHash && message.setupBlueprint.proofKind !== 'reference'));
}

export interface MallFeedPage {
  messages: MallChatMessage[];
  presence: MallPresence[];
  cursor: string | null;
}

export type MallEvent =
  | { type: 'message' | 'reaction'; zoneId: MallZoneId; message: MallChatMessage; threadRoot?: MallChatMessage }
  | { type: 'presence'; zoneId: MallZoneId; presence: MallPresence[] };
