import { randomUUID } from 'node:crypto';
import {
  MALL_REACTIONS, MALL_STATUSES, MALL_ZONES, isMt5VerifiedMallPost,
  type MallChatMessage, type MallFeedPage, type MallPresence, type MallSessionStatusPill,
  type MallSetupBlueprint, type MallSnapshotAttachment, type MallVerificationChannel,
  type MallVerifiedBadge, type MallZoneId, type MallZoneSummary,
} from '../../src/types/mallChat.js';

import { REFERENCE_WORKSHEETS } from '../../src/utils/referenceWorksheets.js';

export { MALL_SAFE_HARBOR, MALL_ZONES } from '../../src/types/mallChat.js';
export const DESK_ROOM_ZONE_ID = 'xauusd-session' satisfies MallZoneId;
const PRESENCE_TTL = 10 * 60_000;
const MESSAGE_LIMIT = 1_000;
const PAGE_SIZE = 40;
const RATE_WINDOW = 60_000;
const RATE_LIMIT = 10;
const RECEIPT_LIMIT = 5_000;

const absolutePrices = /\b(?:entry(?:\s+price)?|limit\s+price|stop\s+price|take\s+profit\s+price|(?:sl|tp[123]?)\s*price)\s*(?:[:=@]\s*)?\$?\d|(?:ราคาเข้า|จุดเข้า)\s*[:=@]?\s*\d/iu;
const signalPatterns = [
  absolutePrices,
  /\b(?:buy|sell|long|short)\s+(?:now\b|(?:limit|stop)\s+(?:[a-z][a-z0-9._-]+\s*)?[@:=]?\s*\d)/iu,
  /\b(?:buy|sell|long|short)\s+(?:[A-Z][A-Z0-9._-]+\s*)?(?:@|at\s+|:\s*)\s*\d/iu,
  /\[\s*trade setup\s*\]\s*(?:buy|sell|long|short)\b|\b(?:XAUUSD|EURUSD|NAS100)\s+(?:buy|sell|long|short)\s+(?:market\b|\d)/iu,
  /^\s*(?:(?:buy|sell|long|short)\s+(?:XAUUSD|EURUSD|NAS100)|(?:XAUUSD|EURUSD|NAS100)\s+(?:buy|sell|long|short))\s*[.!]?\s*$/imu,
  /\b(?:any|send|share|drop|give(?:\s+me)?|looking\s+for|need|want|get|join)\s+(?:(?:live|free|paid|vip|buy|sell|trade|trading|forex|xauusd)\s+){0,4}signals?\b/iu,
  /\b(?:live|vip|paid|premium|free)\s+(?:(?:trade|trading|forex)\s+)?signals?\b|\btrading\s+signal\s*:/iu,
  /\b(?:auto(?:mated)?[\s-]+copy[\s-]*(?:trade|trading)|copy[\s-]*(?:trade|trading)\s*(?:อัตโนมัติ|automatically|service|subscription)|(?:join|subscribe|enable|start|try|follow)\s+(?:(?:our|my|auto)\s+)?copy[\s-]*(?:trade|trading))|\bguaranteed\s+(?:profits?|returns?)\b/iu,
  /ซิก(?:แนน|แนล)\s*(?:แม่น|ฟรี|vip)|การันตี\s*(?:กำไร|ผลตอบแทน)|รับประกัน\s*กำไร|ฝาก\s*เทรด|(?:ขอ|แจก|ส่ง|ขาย|รับ)\s*(?:ซิก(?:แนน|แนล)|สัญญาณ(?:ซื้อขาย|เทรด))|(?:ซื้อ|ขาย|เข้า)\s*(?:[a-z][a-z0-9._-]+\s*)?(?:ตอนนี้|เดี๋ยวนี้|@\s*\d)/iu,
];

export function evaluateMallMessageSafeHarbor(text: string): { allowed: true } | {
  allowed: false; code: 'SIGNAL_LANGUAGE'; reasonEn: string; reasonTh: string;
} {
  const normalized = text.normalize('NFKC').replace(/\u0E4D\u0E32/g, '\u0E33').replace(/[\u200B-\u200D\uFEFF]/g, '');
  if (!signalPatterns.some((pattern) => pattern.test(normalized))) return { allowed: true };
  return {
    allowed: false,
    code: 'SIGNAL_LANGUAGE',
    reasonEn: 'Share risk rules or completed-session statistics. Live calls, signal requests, and copy-trade promotions are restricted.',
    reasonTh: 'แชร์กฎความเสี่ยงหรือสถิติของรอบที่จบแล้ว กรุณางดส่งหรือขอสัญญาณสดและโปรโมตการคัดลอกเทรด',
  };
}

type Input = Record<string, unknown>;
function object(value: unknown): Input {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Input : {};
}
function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function boundedNumber(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : undefined;
}
function identifier(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z0-9._:-]{1,120}$/i.test(value) ? value : undefined;
}
export function mallSymbol(value: unknown): string | undefined {
  const symbol = str(value, 24).toUpperCase();
  return /^[A-Z0-9][A-Z0-9._-]{0,19}$/.test(symbol) ? symbol : undefined;
}
export function mallHandle(value: unknown): string {
  const handle = str(value, 40).normalize('NFKC').replace(/^@+|[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, 39);
  return handle ? '@' + handle.toLowerCase() : '@trader_you';
}
export function isMallZoneId(value: unknown): value is MallZoneId {
  return MALL_ZONES.some((zone) => zone.id === value);
}

function safeBlueprintText(value: unknown, max: number): string {
  const text = str(value, max);
  const normalized = text.normalize('NFKC').replace(/\u0E4D\u0E32/g, '\u0E33').replace(/[\u200B-\u200D\uFEFF]/g, '');
  if (!evaluateMallMessageSafeHarbor(text).allowed
    || /\b(?:sl|tp[123]?)\s*[:=@]\s*\$?\d/iu.test(normalized)) return '';
  return text;
}

export function sanitizeMallSetupBlueprint(value: unknown): MallSetupBlueprint | undefined {
  const input = object(value);
  const title = safeBlueprintText(input.title, 90);
  const primarySymbol = mallSymbol(input.primarySymbol);
  const timeframe = safeBlueprintText(input.timeframe, 24);
  const sessionFocus = safeBlueprintText(input.sessionFocus, 24);
  const riskUsd = boundedNumber(input.riskUsd, 0.01, 1_000_000);
  const slPoints = boundedNumber(input.slPoints, 0.01, 10_000_000);
  const tp1Points = boundedNumber(input.tp1Points, 0.01, 10_000_000);
  const tp2Points = boundedNumber(input.tp2Points, 0.01, 10_000_000);
  const tp3Points = boundedNumber(input.tp3Points, 0.01, 10_000_000);
  if (!title || !primarySymbol || !timeframe || !sessionFocus || !riskUsd || !slPoints || !tp1Points || !tp2Points || !tp3Points) return undefined;
  const checklistNotes = Array.isArray(input.checklistNotes)
    ? input.checklistNotes.slice(0, 12).map((note) => safeBlueprintText(note, 150)).filter(Boolean)
    : [];
  const listingId = identifier(input.listingId);
  const proofHash = typeof input.proofHash === 'string' && /^[a-f0-9]{64}$/i.test(input.proofHash) ? input.proofHash : undefined;
  const winRatePct = boundedNumber(input.winRatePct, 0, 100);
  const profitFactor = boundedNumber(input.profitFactor, 0, 10_000);
  return {
    title, primarySymbol, timeframe, sessionFocus, riskUsd, slPoints, tp1Points, tp2Points, tp3Points, checklistNotes,
    ...(listingId && { listingId }), ...(proofHash && { proofHash }),
    ...(winRatePct !== undefined && { winRatePct }), ...(profitFactor !== undefined && { profitFactor }),
  };
}

export function sanitizeMallSnapshot(
  value: unknown,
  verifyInternal?: (snapshot: MallSnapshotAttachment, proof: unknown) => boolean,
): MallSnapshotAttachment | undefined {
  const raw = object(value);
  const snapshotId = identifier(raw.snapshotId);
  const symbol = mallSymbol(raw.symbol);
  const capturedAtMs = typeof raw.capturedAt === 'string' ? Date.parse(raw.capturedAt) : NaN;
  if (!snapshotId || !symbol || !Number.isFinite(capturedAtMs) || typeof raw.snapshotUrl !== 'string') return undefined;
  const snapshotUrl = raw.snapshotUrl;
  const rMultiple = boundedNumber(raw.rMultiple, -1_000, 1_000);
  const session = safeBlueprintText(raw.session, 40);
  const snapshot = {
    snapshotId, snapshotUrl, symbol, capturedAt: new Date(capturedAtMs).toISOString(),
    ...(rMultiple !== undefined && { rMultiple }), ...(session && { session }),
  };
  const isCdn = /^https:\/\/cdn\.tallynx\.com\/snapshots\/(?:[\w-]+\/)*[\w.-]+\.(?:svg|png|webp|jpe?g)$/i.test(snapshotUrl);
  const isInternal = snapshotUrl.length <= 24_000 && snapshotUrl.startsWith('data:image/svg+xml;utf8,') && verifyInternal?.(snapshot, raw.proof);
  return isCdn || isInternal ? snapshot : undefined;
}

function sessionPill(value: unknown): MallSessionStatusPill | undefined {
  const input = object(value);
  const status = MALL_STATUSES.find((item) => item === input.status);
  if (!status) return undefined;
  return {
    status,
    rMultipleToday: boundedNumber(input.rMultipleToday, -1_000, 1_000) ?? 0,
    sessionLabel: safeBlueprintText(input.sessionLabel, 40) || 'Today',
  };
}

export class MallChatError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly reasonEn: string,
    public readonly reasonTh: string = reasonEn,
    public readonly retryAfterSec?: number,
  ) { super(reasonEn); }
}

const STARTER_BASE_EPOCH_MS = Date.parse('2026-11-20T04:00:00.000Z');
const STARTER_VERSION = 2;
type EditorialPost = Pick<MallChatMessage, 'handle' | 'text' | 'symbol' | 'setupBlueprint' | 'sessionStatusPill' | 'verifiedBadge'>;

const sampleAudit: MallVerifiedBadge = {
  channel: 'MANUAL_XLSX', brokerName: 'Editorial sample', verifiedAt: '2026-11-19T16:00:00.000Z',
};
const [goldSheet, fxSheet, indexSheet] = REFERENCE_WORKSHEETS;
const starterPosts: Record<MallZoneId, EditorialPost[]> = {
  'lounge-general': [
    { handle: '@mall_editorial', text: 'Flat-day journal review. We record the opening risk budget, the last drawdown check and the time the desk signed off. A zero-P&L session can still have a complete audit trail.' },
    { handle: '@siam_prop_risk', text: 'วันที่ไม่มีดีล ผมเก็บเวลารีเซ็ตรอบและวงเงินขาดทุนคงเหลือไว้ในบันทึก ถ้ามีค่าธรรมเนียมข้ามวัน คุณลงรายการไว้ที่รอบไหน?' },
    { handle: '@asia_review', symbol: 'EURUSD', setupBlueprint: fxSheet.blueprint, text: 'This EURUSD worksheet uses a fixed cash budget. Compare all three distances in broker points before discussing how the same budget behaves across sessions.' },
    { handle: '@journal_desk', text: 'ผมเก็บทั้งเวลาจาก statement และวันที่ตามกฎพอร์ต จึงย้อนดูได้ว่าค่าธรรมเนียมนั้นอยู่ในรอบไหนโดยไม่ต้องแก้ยอดเดิม' },
  ],
  'xauusd-session': [
    { handle: '@xau_london_desk', symbol: 'XAUUSD', text: 'London close review. In this sample the gross result was +0.72R and costs were 0.12R. The journal therefore closes at +0.60R.', sessionStatusPill: { status: 'CLOSED_FOR_DAY', rMultipleToday: 0.6, sessionLabel: 'London' } },
    { handle: '@mt5_reconcile', symbol: 'XAUUSD', verifiedBadge: sampleAudit, text: 'In a statement audit, how do you treat partial closes? Counting each fill as a separate risk decision changes the denominator of the win rate.' },
    { handle: '@london_3tp_audit', symbol: 'XAUUSD', setupBlueprint: goldSheet.blueprint, text: 'เทียบระยะทั้งสามระดับเป็น R ของงบเดียวกันก่อน แล้วจึงเทียบกับ R ที่เกิดขึ้นจริงหลังหักค่าใช้จ่ายในรอบลอนดอนที่ปิดแล้ว' },
    { handle: '@xau_london_desk', text: 'Group the fills by position identifier and keep the original tickets in the review. This preserves the costs while counting each completed position once.' },
  ],
  'prop-rules-qa': [
    { handle: '@prop_rule_auditor', text: 'Consistency worksheet. For a rule defined as best day divided by net cycle profit, a $240 best day over a $600 cycle is 40%. Record the rule version beside the denominator.' },
    { handle: '@siam_prop_risk', text: 'เวลาที่กองทุนรีเซ็ตวันต่างจากเวลาไทย ถ้าดีลปิดคร่อมรอบ คุณเก็บหลักฐานเวลาอะไรไว้ให้ตรวจยอดขาดทุนรายวันซ้ำได้?' },
    { handle: '@risk_control', symbol: 'NAS100', setupBlueprint: indexSheet.blueprint, text: 'Use the index worksheet to compare one modeled loss with remaining daily headroom. Log any commissions separately so the distance budget and historical costs stay traceable.' },
    { handle: '@prop_rule_auditor', text: 'ผมเก็บเวลาเซิร์ฟเวอร์ เวลาไทย และเขตเวลาที่ระบุในกฎของพอร์ตไว้ด้วยกัน จากนั้นรวมยอดตามวันของกองทุน' },
  ],
  'setup-showroom': [
    { handle: '@showroom_curator', symbol: 'XAUUSD', setupBlueprint: goldSheet.blueprint, text: 'Gold worksheet for a fixed $60 risk budget. Inspect the stop and all three target distances, then check the point convention against the historical report.' },
    { handle: '@asia_review', symbol: 'EURUSD', setupBlueprint: fxSheet.blueprint, text: 'เวิร์กชีต EURUSD นี้ใช้ point ตามสเปกห้าตำแหน่ง เวลาเทียบผลย้อนหลัง คุณตรวจการแปลง pip เป็น point อย่างไร?' },
    { handle: '@quant_guard_ny', symbol: 'NAS100', setupBlueprint: indexSheet.blueprint, text: 'Index worksheet. Compare the distance ladder with the available loss buffer, then document whether the closed-session sample used the same contract size.' },
    { handle: '@showroom_curator', text: 'ผมจดจำนวนหลักทศนิยมและจำนวน point ต่อ pip จากสเปกสัญญา แล้วลองแปลงระยะหนึ่งรายการกลับเพื่อตรวจทาน' },
  ],
};

function starterMessages(zoneId: MallZoneId): MallChatMessage[] {
  return starterPosts[zoneId].map((post, index) => ({
    ...post, id: 'example-' + zoneId + '-' + (index + 1), clientMessageId: 'example-' + (index + 1),
    zoneId, authorRole: 'example',
    createdAt: new Date(STARTER_BASE_EPOCH_MS - (4 - index) * 60_000).toISOString(),
    replyCount: 0, reactions: {},
    ...(index === 3 && { threadRootId: 'example-' + zoneId + '-2' }),
  }));
}

export function toDeskRoomMessage(message: MallChatMessage) {
  return {
    id: message.id, handle: message.handle, text: message.text, symbol: message.symbol || 'XAUUSD',
    createdAt: message.createdAt.slice(11, 16), isTradeIdea: false,
  };
}

const statusTh: Record<MallPresence['status'], string> = {
  WAITING_SETUP: 'รอแผนที่ผ่านเกณฑ์', HOLDING_ORDER: 'กำลังถือออเดอร์', CLOSED_FOR_DAY: 'ปิดจบวันแล้ว',
};

export function toDeskRoomPresence(item: MallPresence) {
  return {
    ...item, role: item.verifiedChannel ? 'Verified Trader' : 'Trader',
    statusLabelTh: statusTh[item.status], updatedAt: item.updatedAt.slice(11, 16),
  };
}

export interface MallChatStore {
  starterVersion?: number;
  messages: MallChatMessage[];
  reactionReceipts: string[];
}

export function createMallChatEngine(options: {
  now?: () => number;
  newId?: () => string;
  stored?: MallChatStore;
  legacyMessages?: unknown[];
  persist?: (store: MallChatStore) => void;
} = {}) {
  const now = options.now ?? Date.now;
  const newId = options.newId ?? randomUUID;
  const rooms = new Map<MallZoneId, MallChatMessage[]>(MALL_ZONES.map(({ id }) => [id, []]));
  for (const message of options.stored?.messages ?? []) {
    if (message && isMallZoneId(message.zoneId)) rooms.get(message.zoneId)!.push(message);
  }
  const reactionReceipts = new Set(options.stored?.reactionReceipts ?? []);
  const presence = new Map<MallZoneId, Map<string, MallPresence>>(MALL_ZONES.map(({ id }) => [id, new Map()]));
  const legacyPresence = new Map<string, MallPresence>();
  const rates = new Map<string, number[]>();
  let nextRateSweep = 0;

  const save = () => options.persist?.({ starterVersion: STARTER_VERSION, messages: [...rooms.values()].flat(), reactionReceipts: [...reactionReceipts] });
  const room = (zoneId: MallZoneId) => rooms.get(zoneId)!;
  function trimRoom(zoneId: MallZoneId) {
    const messages = room(zoneId);
    if (messages.length <= MESSAGE_LIMIT) return;
    const roots = new Set(messages.filter((message) => !message.threadRootId).map((message) => message.id));
    const retained = new Set<string>();
    for (let index = messages.length - 1; index >= 0 && retained.size < MESSAGE_LIMIT; index -= 1) {
      const { id, threadRootId } = messages[index];
      if (threadRootId && !retained.has(threadRootId)) {
        if (retained.size === MESSAGE_LIMIT - 1 || !roots.has(threadRootId)) continue;
        retained.add(threadRootId);
      }
      retained.add(id);
    }
    const counts = new Map<string, number>();
    const connected = messages.filter(({ id, threadRootId }) => {
      if (!retained.has(id)) return false;
      if (threadRootId) counts.set(threadRootId, (counts.get(threadRootId) ?? 0) + 1);
      return true;
    });
    rooms.set(zoneId, connected.map((message) => {
      const replyCount = counts.get(message.id) ?? 0;
      return replyCount === message.replyCount ? message : { ...message, replyCount };
    }));
  }

  function importLegacyMessages(entries: unknown[]) {
    const messages = room(DESK_ROOM_ZONE_ID);
    const existingIds = new Set(messages.map((message) => message.id));
    let changed = false;
    for (const entry of entries.slice(-60)) {
      const input = object(entry);
      const id = identifier(input.id);
      const text = str(input.text, 500);
      if (!id || existingIds.has(id) || !text || input.isTradeIdea === true || !evaluateMallMessageSafeHarbor(text).allowed) continue;
      const rawDate = str(input.createdAt, 40);
      const assumedDate = new Date(now()).toISOString().slice(0, 10);
      const stamp = Date.parse(/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(rawDate) ? assumedDate + 'T' + rawDate + ':00Z' : rawDate);
      messages.push({
        id, text, clientMessageId: id, zoneId: DESK_ROOM_ZONE_ID, handle: mallHandle(input.handle),
        authorRole: 'trader', symbol: mallSymbol(input.symbol) || 'XAUUSD',
        createdAt: new Date(Number.isFinite(stamp) ? stamp : now()).toISOString(), replyCount: 0, reactions: {},
      });
      existingIds.add(id);
      changed = true;
    }
    if (changed) {
      messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      trimRoom(DESK_ROOM_ZONE_ID);
    }
    return changed;
  }

  if (!options.stored) importLegacyMessages(options.legacyMessages ?? []);
  if (options.stored?.starterVersion !== STARTER_VERSION) {
    for (const { id } of MALL_ZONES) {
      const existing = room(id);
      if (existing.length >= MESSAGE_LIMIT) continue;
      const byId = new Map(existing.map(item => [item.id, item]));
      for (const post of starterMessages(id)) {
        const previous = byId.get(post.id);
        // Retain the original worksheet and wording wherever a trader has already responded.
        if (previous && (previous.authorRole !== 'example' || previous.replyCount || Object.keys(previous.reactions).length)) continue;
        byId.set(post.id, post);
      }
      const merged = [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const replyCounts = new Map<string, number>();
      for (const item of merged) {
        if (item.threadRootId) replyCounts.set(item.threadRootId, (replyCounts.get(item.threadRootId) ?? 0) + 1);
      }
      rooms.set(id, merged.map(item => ({ ...item, replyCount: replyCounts.get(item.id) ?? 0 })));
      trimRoom(id);
    }
    save();
  }

  function activePresence(zoneId: MallZoneId): MallPresence[] {
    const traders = presence.get(zoneId)!;
    const cutoff = now() - PRESENCE_TTL;
    for (const [id, trader] of traders) {
      if (Date.parse(trader.updatedAt) <= cutoff) traders.delete(id);
    }
    const active = new Map(traders);
    if (zoneId === DESK_ROOM_ZONE_ID) {
      for (const [id, trader] of legacyPresence) {
        if (Date.parse(trader.updatedAt) <= cutoff) legacyPresence.delete(id);
        else if (!active.has(id)) active.set(id, trader);
      }
    }
    return [...active.values()].sort((a, b) => Number(Boolean(b.verifiedChannel)) - Number(Boolean(a.verifiedChannel)) || b.updatedAt.localeCompare(a.updatedAt));
  }

  function list(zoneId: MallZoneId, cursor?: string, threadRootId?: string): MallFeedPage {
    const all = room(zoneId);
    const messages = threadRootId
      ? all.filter((item) => item.id === threadRootId || item.threadRootId === threadRootId)
      : all.filter((item) => !item.threadRootId);
    const cursorIndex = cursor ? messages.findIndex((message) => message.id === cursor) : -1;
    if (cursor && cursorIndex < 0) return { messages: [], presence: activePresence(zoneId), cursor: null };
    const end = cursorIndex >= 0 ? cursorIndex : messages.length;
    const start = Math.max(0, end - PAGE_SIZE);
    return { messages: messages.slice(start, end), presence: activePresence(zoneId), cursor: start > 0 ? messages[start].id : null };
  }

  function zones(): MallZoneSummary[] {
    return MALL_ZONES.map((zone) => {
      const recent = room(zone.id).at(-1);
      const online = activePresence(zone.id);
      return {
        ...zone, presence: online, activeCount: online.length, messageCount: room(zone.id).length,
        blueprintCount: room(zone.id).filter(item => !item.threadRootId && item.setupBlueprint).length,
        verifiedPostCount: room(zone.id).filter(item => !item.threadRootId && isMt5VerifiedMallPost(item)).length,
        latestMessagePreview: recent ? { id: recent.id, handle: recent.handle, text: recent.text, createdAt: recent.createdAt } : null,
      };
    });
  }

  function useRate(handle: string, ip: string, ts: number) {
    if (ts >= nextRateSweep) {
      for (const [key, timestamps] of rates) {
        if (timestamps.at(-1)! <= ts - RATE_WINDOW) rates.delete(key);
      }
      nextRateSweep = ts + RATE_WINDOW;
    }
    const buckets = ['handle:' + handle, 'ip:' + ip].map((key) =>
      [key, (rates.get(key) ?? []).filter((time) => time > ts - RATE_WINDOW)] as const);
    const delay = Math.max(...buckets.map(([, timestamps]) =>
      timestamps.length >= RATE_LIMIT ? Math.ceil((timestamps[0] + RATE_WINDOW - ts) / 1000) : 0));
    if (delay > 0) throw new MallChatError(429, 'RATE_LIMITED', 'Message limit reached. Try again shortly.', 'ส่งข้อความถึงขีดจำกัดแล้ว กรุณารอสักครู่', delay);
    for (const [key, timestamps] of buckets) rates.set(key, [...timestamps, ts]);
  }

  function post(zoneId: MallZoneId, input: Input, ip: string, trusted: {
    setupBlueprint?: MallSetupBlueprint;
    verifiedBadge?: MallVerifiedBadge;
    verifyInternalSnapshot?: Parameters<typeof sanitizeMallSnapshot>[1];
  } = {}) {
    const handle = mallHandle(input.handle);
    const clientMessageId = identifier(input.clientMessageId);
    if (!clientMessageId) throw new MallChatError(400, 'INVALID_MESSAGE_ID', 'A valid client message ID is required.');
    const messages = room(zoneId);
    const existing = messages.find((item) => item.handle === handle && item.clientMessageId === clientMessageId);
    if (existing) return { message: existing, created: false };

    const text = str(input.text, 2_000);
    const verdict = evaluateMallMessageSafeHarbor(text);
    if ('code' in verdict) throw new MallChatError(422, verdict.code, verdict.reasonEn, verdict.reasonTh);
    if (input.isTradeIdea === true) {
      throw new MallChatError(422, 'SIGNAL_LANGUAGE', 'Share a risk or completed-session review.', 'แชร์การทบทวนความเสี่ยงหรือรอบที่จบแล้ว');
    }
    const rawBlueprint = object(input.setupBlueprint);
    if (rawBlueprint.listingId && !trusted.setupBlueprint) {
      throw new MallChatError(400, 'INVALID_LISTING', 'This verified Marketplace listing is unavailable.', 'รายการ Marketplace ที่ยืนยันนี้ไม่พร้อมใช้งาน');
    }
    const setupBlueprint = trusted.setupBlueprint || sanitizeMallSetupBlueprint({
      ...rawBlueprint, proofHash: undefined, winRatePct: undefined, profitFactor: undefined,
    });
    const snapshotAttachment = sanitizeMallSnapshot(input.snapshotAttachment, trusted.verifyInternalSnapshot);
    const sessionStatusPill = sessionPill(input.sessionStatusPill);
    if ((input.setupBlueprint != null && !setupBlueprint) || (input.snapshotAttachment != null && !snapshotAttachment) || (input.sessionStatusPill != null && !sessionStatusPill)) {
      throw new MallChatError(400, 'INVALID_ATTACHMENT', 'One of the attachments is invalid or unavailable.', 'ไฟล์แนบไม่ถูกต้องหรือไม่พร้อมใช้งาน');
    }
    if (!(text || setupBlueprint || snapshotAttachment || sessionStatusPill)) {
      throw new MallChatError(400, 'EMPTY_MESSAGE', 'Enter a message or add an attachment.', 'พิมพ์ข้อความหรือเพิ่มไฟล์แนบ');
    }
    const threadRootId = identifier(input.threadRootId);
    const rootIndex = threadRootId ? messages.findIndex((item) => item.id === threadRootId && !item.threadRootId) : -1;
    if (input.threadRootId != null && rootIndex < 0) throw new MallChatError(404, 'THREAD_NOT_FOUND', 'This thread is no longer available.', 'ไม่พบเธรดนี้');

    const ts = now();
    useRate(handle, ip, ts);
    const symbol = mallSymbol(input.symbol) || setupBlueprint?.primarySymbol || snapshotAttachment?.symbol || (zoneId === DESK_ROOM_ZONE_ID ? 'XAUUSD' : undefined);
    const message: MallChatMessage = {
      id: newId(), clientMessageId, zoneId, handle, text, authorRole: 'trader', createdAt: new Date(ts).toISOString(),
      replyCount: 0, reactions: {}, ...(symbol && { symbol }), ...(threadRootId && { threadRootId }),
      ...(trusted.verifiedBadge && { verifiedBadge: trusted.verifiedBadge }),
      ...(setupBlueprint && { setupBlueprint }), ...(snapshotAttachment && { snapshotAttachment }), ...(sessionStatusPill && { sessionStatusPill }),
    };
    messages.push(message);
    if (rootIndex >= 0) messages[rootIndex] = { ...messages[rootIndex], replyCount: messages[rootIndex].replyCount + 1 };
    trimRoom(zoneId);
    save();
    return { message, created: true, threadRoot: threadRootId ? room(zoneId).find((item) => item.id === threadRootId) : undefined };
  }

  function react(zoneId: MallZoneId, messageId: string, input: Input) {
    const emoji = MALL_REACTIONS.find((allowed) => allowed === input.emoji);
    const clientReactionId = identifier(input.clientReactionId);
    const active = typeof input.active === 'boolean' ? input.active : undefined;
    if (!emoji || (!clientReactionId && active === undefined)) {
      throw new MallChatError(400, 'INVALID_REACTION', 'Choose a supported reaction and provide a reaction ID or desired state.', 'เลือกอีโมจิที่รองรับและระบุรหัสหรือสถานะของรีแอ็กชัน');
    }
    const messages = room(zoneId);
    const index = messages.findIndex((message) => message.id === messageId);
    if (index < 0) throw new MallChatError(404, 'MESSAGE_NOT_FOUND', 'This message is no longer available.', 'ไม่พบข้อความนี้');
    const message = messages[index];
    const handle = mallHandle(input.handle);
    const receipt = clientReactionId && JSON.stringify([zoneId, messageId, emoji, handle, clientReactionId]);
    if (receipt && reactionReceipts.has(receipt)) return { message, changed: false };

    const reactors = new Set(message.reactions[emoji] ?? []);
    const hadReaction = reactors.has(handle);
    const shouldReact = active ?? !hadReaction;
    if (shouldReact && reactors.size >= 500 && !hadReaction) {
      throw new MallChatError(429, 'REACTION_LIMIT', 'This reaction has reached its capacity.', 'รีแอ็กชันนี้เต็มแล้ว');
    }
    if (receipt) {
      reactionReceipts.add(receipt);
      if (reactionReceipts.size > RECEIPT_LIMIT) reactionReceipts.delete(reactionReceipts.values().next().value!);
    }
    const reactions = { ...message.reactions };
    if (shouldReact) reactors.add(handle);
    else reactors.delete(handle);
    if (reactors.size > 0) reactions[emoji] = [...reactors];
    else delete reactions[emoji];
    const updated = { ...message, reactions };
    messages[index] = updated;
    save();
    return { message: updated, changed: shouldReact !== hadReaction };
  }

  function updatePresence(zoneId: MallZoneId, input: Input, verifiedChannel?: MallVerificationChannel) {
    const handle = mallHandle(input.handle);
    const pill = sessionPill(input) ?? { status: 'WAITING_SETUP' as const, rMultipleToday: 0, sessionLabel: 'Today' };
    activePresence(zoneId);
    presence.get(zoneId)!.set(handle, {
      id: handle, handle, ...pill, symbol: mallSymbol(input.symbol) || 'XAUUSD',
      updatedAt: new Date(now()).toISOString(), ...(verifiedChannel && { verifiedChannel }),
    });
    return activePresence(zoneId);
  }

  function replaceLegacyPresence(entries: unknown[]) {
    legacyPresence.clear();
    const updatedAt = new Date(now()).toISOString();
    for (const entry of entries) {
      const input = object(entry);
      if (!str(input.handle, 40)) continue;
      const handle = mallHandle(input.handle);
      const pill = sessionPill(input);
      if (pill) legacyPresence.set(handle, { id: handle, handle, ...pill, symbol: mallSymbol(input.symbol) || 'XAUUSD', updatedAt });
    }
  }

  return {
    zones, list, post, react, updatePresence, activePresence, replaceLegacyPresence,
    deskMessages: () => room(DESK_ROOM_ZONE_ID).filter((message) => !message.threadRootId && message.authorRole !== 'example').slice(-30).map(toDeskRoomMessage),
    mergeDeskMessages: (entries: unknown[]) => { if (importLegacyMessages(entries)) save(); },
  };
}
