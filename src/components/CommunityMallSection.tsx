import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUpRight,
  BarChart3,
  Box,
  Calculator,
  CheckCircle2,
  ChevronRight,
  Flame,
  Image,
  Layers3,
  ListChecks,
  MessageSquare,
  PanelRight,
  Search,
  Send,
  ShieldCheck,
  Store,
  Users,
  X,
} from 'lucide-react';
import {
  MALL_REACTIONS,
  MALL_SAFE_HARBOR,
  MALL_STATUSES,
  MALL_ZONES,
  type MallChatMessage,
  type MallEvent,
  type MallFeedPage,
  type MallPresence,
  type MallSetupBlueprint,
  type MallSnapshotAttachment,
  type MallStatus,
  type MallVerificationChannel,
  type MallZoneId,
  type MallZoneSummary,
} from '../types/mallChat';
import { deskText, type DeskLanguage } from '../utils/deskI18n';
import { fmtUSD, getBangkokTimeHHMM } from '../utils/ghrRules';
import {
  MALL_FEED_WINDOW_STEP,
  computeZoneMetricsMap,
  filterMallPosts,
  formatMallDate,
  formatMallDateTime,
  formatMallTime,
  mergeMallMessages,
  selectPinnedBlueprints,
  sliceVisibleMallWindow,
  type MallPostFilter,
  type MallZoneMetrics,
} from '../utils/mallChat';
import { classifyTradeSession } from '../utils/realtimeGuardrails';
import { BlueprintLadder } from './BlueprintLadder';
import '../styles/mall-opt.css';

export interface MallEntry {
  zoneId: MallZoneId;
  listing?: { id: string; title: string; symbol: string };
}

type SnapshotDraft = MallSnapshotAttachment & { proof: string };
type ApiProblem = { reasonEn?: string; reasonTh?: string; code?: string };

interface CommunityMallSectionProps {
  lang: DeskLanguage;
  handle: string;
  entry: MallEntry;
  online: boolean;
  currentBlueprint?: MallSetupBlueprint;
  accountName: string;
  accountBalance: string;
  riskPerIdeaUsd?: number;
  dailyLossBufferUsd?: number;
  consistencyCapPct?: number;
  gatesPassedCount: number;
  onOpenCalculator: () => void;
  onOpenMarketplace: () => void;
  haveSnapshotSource: boolean;
  getHeaders: (purpose: 'post' | 'snapshot' | 'presence') => Promise<Record<string, string>>;
  verifiedChannel?: MallVerificationChannel;
  rMultipleToday?: number;
  status: MallStatus;
  onStatusChange: (status: MallStatus) => void;
  onLoadBlueprint: (blueprint: MallSetupBlueprint) => void;
  onViewListing: (listingId: string) => void;
}

const symbols = ['ALL', 'XAUUSD', 'EURUSD', 'NAS100'] as const;
const channelLabels: Record<MallVerificationChannel, string> = {
  LIVE_BRIDGE: 'Live Bridge',
  FUNDEDNEXT_MCP: 'FundedNext MCP',
  MYFXBOOK_API: 'Myfxbook API',
  MANUAL_XLSX: 'MT5 XLSX',
};
const statusLabels: Record<MallStatus, readonly [string, string]> = {
  WAITING_SETUP: ['Waiting for a setup', 'รอแผนที่ผ่านเกณฑ์'],
  HOLDING_ORDER: ['Holding an order', 'กำลังถือออเดอร์'],
  CLOSED_FOR_DAY: ['Closed for the day', 'ปิดจบรอบวันนี้'],
};

const reactionStyles = {
  '🔥': [Flame, 'Insight', 'คมชัด', 'insight'],
  '🛡️': [ShieldCheck, 'Rule-Aligned', 'วินัยเป๊ะ', 'rules'],
  '📊': [BarChart3, 'Data-Backed', 'สถิติชัด', 'data'],
  '✅': [CheckCircle2, '12-Gate', 'ผ่านเกณฑ์', 'gates'],
} as const;

const postFilters: Record<MallPostFilter, readonly [string, string]> = {
  ALL: ['All Posts', 'ทั้งหมด'],
  BLUEPRINTS: ['3-TP Blueprints', 'บลูพรินต์ 3-TP'],
  VERIFIED: ['MT5 Verified', 'ยืนยัน MT5'],
  THREADS: ['Active Threads', 'มีคำตอบ'],
};
const postFilterKeys = Object.keys(postFilters) as MallPostFilter[];
const quickTopics = ['#XAUUSD', '#3TP-Distance', '#Consistency-40%', '#12Gate-Log'] as const;
const gateIndices = Array.from({ length: 12 }, (_, i) => i);

const benchmarks = [
  { handle: '@quant_guard_ny', channel: 'FundedNext MCP', symbol: 'NAS100', status: 'WAITING_SETUP', r: 1.2 },
  { handle: '@london_3tp_audit', channel: 'Live Bridge', symbol: 'XAUUSD', status: 'CLOSED_FOR_DAY', r: 0.85 },
  { handle: '@siam_prop_risk', channel: 'Myfxbook API', symbol: 'EURUSD', status: 'HOLDING_ORDER', r: 0.4 },
] as const;

const EXAMPLE_MESSAGE_COPY: Record<string, { en: string; th: string }> = {
  'example-lounge-general-1': {
    en: 'No trades today. We still logged our opening risk budget, the last drawdown check, and when we closed the desk.',
    th: 'วันนี้ไม่ได้เทรด แต่เรายังจดงบความเสี่ยงตอนเปิดโต๊ะ ผลเช็ก Drawdown ล่าสุด และเวลาปิดโต๊ะ',
  },
  'example-lounge-general-2': {
    en: 'On zero-trade days I log the rollover reset time and remaining drawdown headroom. When swap or rollover fees apply overnight, which cycle do you assign them to?',
    th: 'วันที่ไม่มีดีล ผมเก็บเวลารีเซ็ตรอบและวงเงินขาดทุนคงเหลือไว้ในบันทึก ถ้ามีค่าธรรมเนียมข้ามวัน คุณลงรายการไว้ที่รอบไหน?',
  },
  'example-lounge-general-3': {
    en: 'This EURUSD worksheet uses a fixed cash budget. Compare all three distances in broker points before discussing how the same budget behaves across sessions.',
    th: 'เวิร์กชีต EURUSD นี้ใช้งบความเสี่ยงคงที่ เทียบระยะทั้ง 3 เป้าเป็น Point ของโบรกเกอร์ก่อน แล้วค่อยวิเคราะห์ผลต่างข้ามเซสชัน',
  },
  'example-lounge-general-4': {
    en: 'I store both the MT5 statement timestamp and the firm rule date side by side so rollover fees stay traceable to the exact cycle without editing balances.',
    th: 'ผมเก็บทั้งเวลาจาก Statement และวันที่ตามกฎพอร์ต จึงย้อนดูได้ว่าค่าธรรมเนียมนั้นอยู่ในรอบไหนโดยไม่ต้องแก้ยอดเดิม',
  },
  'example-xauusd-session-1': {
    en: 'London close example. The journal shows +0.60R net after 0.12R in costs on a gross result of +0.72R.',
    th: 'ตัวอย่างรอบลอนดอน ในสมุดเทรดลงยอดสุทธิ +0.60R จากกำไร +0.72R หักค่าใช้จ่าย 0.12R',
  },
  'example-xauusd-session-2': {
    en: 'In a statement audit, how do you treat partial closes? Counting each fill as a separate risk decision changes the denominator of the win rate.',
    th: 'เวลาตรวจ Statement พอร์ต คุณนับรายการปิดบางส่วน (Partial Close) อย่างไร? ถ้านับแยกเป็นคนละไม้จะทำให้ตัวหารของ Win Rate เปลี่ยนไป',
  },
  'example-xauusd-session-3': {
    en: 'Compare all three target distances in R of the same fixed budget first, then reconcile against net realized R after commissions on closed London sessions.',
    th: 'เทียบระยะทั้งสามระดับเป็น R ของงบเดียวกันก่อน แล้วจึงเทียบกับ R ที่เกิดขึ้นจริงหลังหักค่าใช้จ่ายในรอบลอนดอนที่ปิดแล้ว',
  },
  'example-xauusd-session-4': {
    en: 'Group the fills by position identifier and keep the original tickets in the review. This preserves costs while counting each completed position once.',
    th: 'จัดกลุ่มออเดอร์ตาม Position ID แต่เก็บเลข Ticket เดิมไว้ในหมายเหตุ วิธีนี้เก็บค่าคอมมิชชันครบและนับ 1 การตัดสินใจต่อ 1 แผน',
  },
  'example-prop-rules-qa-1': {
    en: 'Consistency worksheet. For a rule defined as best day divided by net cycle profit, a $240 best day over a $600 cycle is 40%. Record the rule version beside the denominator.',
    th: 'เวิร์กชีตกฎ Consistency: หากคำนวณจากวันที่กำไรสูงสุดหารด้วยกำไรสุทธิทั้งรอบ กำไร $240 จากรอบ $600 คือ 40% จดเวอร์ชันของกฎคู่กับตัวหารเสมอ',
  },
  'example-prop-rules-qa-2': {
    en: 'Prop firms reset daily drawdown on broker server time rather than ICT. For trades held across rollover, what timestamp proof do you save for daily loss audits?',
    th: 'เวลาที่กองทุนรีเซ็ตวันต่างจากเวลาไทย ถ้าดีลปิดคร่อมรอบ คุณเก็บหลักฐานเวลาอะไรไว้ให้ตรวจยอดขาดทุนรายวันซ้ำได้?',
  },
  'example-prop-rules-qa-3': {
    en: 'Use the index worksheet to compare one modeled loss with your remaining daily loss limit. Log commissions separately.',
    th: 'ใช้เวิร์กชีตดัชนีเทียบขาดทุนจำลอง 1 ไม้กับวงเงินขาดทุนที่เหลือวันนี้ แล้วจดค่าคอมแยกไว้',
  },
  'example-prop-rules-qa-4': {
    en: 'I store broker server time, ICT time, and the prop firm timezone together, then aggregate daily results strictly on the firm day boundary.',
    th: 'ผมเก็บเวลาเซิร์ฟเวอร์ เวลาไทย และเขตเวลาที่ระบุในกฎของพอร์ตไว้ด้วยกัน จากนั้นรวมยอดตามวันของกองทุน',
  },
  'example-setup-showroom-1': {
    en: 'Gold worksheet for a fixed $60 risk budget. Inspect the stop and all three target distances, then check the point convention against the historical report.',
    th: 'เวิร์กชีตทองคำสำหรับงบความเสี่ยงคงที่ $60 ตรวจระยะ SL และ TP ทั้ง 3 เป้า แล้วเทียบหน่วย Point ให้ตรงกับรีพอร์ตย้อนหลัง',
  },
  'example-setup-showroom-2': {
    en: 'This EURUSD worksheet uses 5-digit broker points. When reconciling backtests, how do you verify pip-to-point conversion?',
    th: 'เวิร์กชีต EURUSD นี้ใช้ Point ตามสเปก 5 ตำแหน่ง เวลาเทียบผลย้อนหลัง คุณตรวจการแปลง Pip เป็น Point อย่างไร?',
  },
  'example-setup-showroom-3': {
    en: 'Index worksheet. Compare the distance ladder with the available loss buffer, then document whether the closed-session sample used the same contract size.',
    th: 'เวิร์กชีตดัชนี NAS100 เทียบขั้นบันได 3-TP กับวงเงินขาดทุนคงเหลือ และระบุขนาด Contract Size ที่ใช้เทียบเสมอ',
  },
  'example-setup-showroom-4': {
    en: 'I record contract precision digits and points-per-pip from the broker spec, then reverse-calculate one distance to verify consistency.',
    th: 'ผมจดจำนวนหลักทศนิยมและจำนวน Point ต่อ Pip จากสเปกสัญญา แล้วลองแปลงระยะหนึ่งรายการกลับเพื่อตรวจทาน',
  },
};

function formatR(value: number) {
  return (value > 0 ? '+' : '') + value.toFixed(2) + 'R';
}

function contextKey(room: MallZoneId, rootId?: string) {
  return room + '/' + (rootId ?? '');
}

async function mallRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/mall' + url, init);
  const data = await response.json();
  if (!response.ok || data.ok === false) throw data as ApiProblem;
  return data as T;
}

const BLUEPRINT_LEVELS = [undefined, 'SL', 'TP1', 'TP2', 'TP3'] as const;

interface BlueprintCardProps {
  blueprint: MallSetupBlueprint;
  lang: DeskLanguage;
  compact?: boolean;
  onInspect?: (blueprint: MallSetupBlueprint) => void;
  onLoadBlueprint: (blueprint: MallSetupBlueprint) => void;
}

const BlueprintCard = memo(function BlueprintCard({
  blueprint,
  lang,
  compact,
  onInspect,
  onLoadBlueprint,
}: BlueprintCardProps) {
  const t = (en: string, th: string) => deskText(lang, en, th);
  const values = [
    blueprint.riskUsd,
    blueprint.slPoints,
    blueprint.tp1Points,
    blueprint.tp2Points,
    blueprint.tp3Points,
  ];
  return (
    <div className={'mall-blueprint' + (compact ? ' is-compact' : '')}>
      <div className="mall-card-top">
        <span className="mall-card-icon">
          <Layers3 size={16} />
        </span>
        <div>
          <strong>{blueprint.title}</strong>
          <small className="mono">
            {blueprint.primarySymbol} · {blueprint.timeframe} ·{' '}
            <span className="session-label" data-session={blueprint.sessionFocus}>
              {blueprint.sessionFocus}
            </span>
          </small>
        </div>
      </div>
      {(blueprint.proofHash ||
        blueprint.winRatePct !== undefined ||
        blueprint.profitFactor !== undefined) && (
        <div className="ticket-seals mono">
          {blueprint.proofHash && (
            <span>
              <ShieldCheck size={12} />
              {blueprint.proofKind === 'reference'
                ? t('Worksheet SHA-256', 'SHA-256 เวิร์กชีต')
                : t('SHA-256 Verified', 'ยืนยัน SHA-256')}
            </span>
          )}
          {blueprint.winRatePct !== undefined && (
            <span>
              {t('Win rate', 'อัตราชนะ')} {blueprint.winRatePct.toFixed(1)}%
            </span>
          )}
          {blueprint.profitFactor !== undefined && (
            <span data-tone="telemetry">PF {blueprint.profitFactor.toFixed(2)}</span>
          )}
        </div>
      )}
      <BlueprintLadder distances={blueprint} lang={lang} />
      <dl className="mall-levels">
        {BLUEPRINT_LEVELS.map((level, i) => (
          <div key={level ?? 'risk'} data-level={level}>
            <dt>
              {level ?? t('Risk $', 'เสี่ยง $')}
              {level && <small> (pts)</small>}
            </dt>
            <dd className="mono">{values[i].toLocaleString(lang, { maximumFractionDigits: 4 })}</dd>
          </div>
        ))}
      </dl>
      <div className="ticket-actions">
        {onInspect && (
          <button
            className="mall-text-button"
            type="button"
            onClick={() => onInspect(blueprint)}
          >
            <PanelRight size={13} />
            {t('Inspect in Drawer', 'ตรวจสอบบลูพรินต์ 3-TP')}
          </button>
        )}
        <button
          className="mall-text-button"
          type="button"
          onClick={() => onLoadBlueprint(blueprint)}
        >
          <Calculator size={13} />
          {t('Load to Calculator', 'โหลดเข้าเครื่องคำนวณ')}
        </button>
      </div>
    </div>
  );
});

interface MallMessageCardProps {
  message: MallChatMessage;
  lang: DeskLanguage;
  handle: string;
  online: boolean;
  compact?: boolean;
  isReactionPending: boolean;
  onInspect: (blueprint: MallSetupBlueprint) => void;
  onLoadBlueprint: (blueprint: MallSetupBlueprint) => void;
  onReact: (message: MallChatMessage, emoji: (typeof MALL_REACTIONS)[number]) => void;
  onReply: (messageId: string) => void;
}

const MallMessageCard = memo(function MallMessageCard({
  message,
  lang,
  handle,
  online,
  compact = false,
  isReactionPending,
  onInspect,
  onLoadBlueprint,
  onReact,
  onReply,
}: MallMessageCardProps) {
  const t = (en: string, th: string) => deskText(lang, en, th);
  const badge = message.verifiedBadge;
  const setup = message.setupBlueprint;
  const chart = message.snapshotAttachment;
  const session = message.sessionStatusPill;
  const localizedText =
    (message.authorRole === 'example' && EXAMPLE_MESSAGE_COPY[message.id]?.[lang]) || message.text;

  return (
    <article className={'mall-message' + (compact ? ' is-compact' : '')}>
      <span className="mall-avatar" aria-hidden="true">
        {message.handle.replace(/^@/, '').slice(0, 2).toUpperCase()}
      </span>
      <div className="mall-message-content">
        <div className="mall-message-meta">
          <strong>{message.handle}</strong>
          {message.authorRole === 'example' && <span className="mall-tag">{t('Example', 'ตัวอย่าง')}</span>}
          {badge && (
            <span
              className="mall-tag mall-verified"
              title={badge.brokerName + ' · ' + badge.verifiedAt}
            >
              <ShieldCheck size={12} />
              {message.authorRole === 'example' && t('Sample · ', 'ตัวอย่าง · ')}
              {channelLabels[badge.channel]}
            </span>
          )}
          {message.symbol && <span className="mall-tag mono">{message.symbol}</span>}
          <time
            className="mono"
            dateTime={message.createdAt}
            title={formatMallDateTime(message.createdAt, lang)}
          >
            {formatMallTime(message.createdAt, lang)}
          </time>
        </div>
        {localizedText && <p>{localizedText}</p>}
        {session && (
          <span className="mall-session-pill" data-session={session.sessionLabel}>
            <Activity size={12} />{' '}
            {session.sessionLabel === 'Today' ? t('Today', 'วันนี้') : session.sessionLabel} ·{' '}
            {t(...statusLabels[session.status])} · <b className="mono">{formatR(session.rMultipleToday)}</b>
          </span>
        )}
        {setup && (
          <BlueprintCard
            lang={lang}
            blueprint={setup}
            compact={compact}
            onLoadBlueprint={onLoadBlueprint}
            onInspect={onInspect}
          />
        )}
        {chart && (
          <figure className="mall-snapshot">
            <img
              src={chart.snapshotUrl}
              alt={t('Closed trade snapshot for ', 'ภาพรายการเทรดที่ปิดแล้วของ ') + chart.symbol}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
            />
            <figcaption>
              <Image size={13} /> {t('Read-only snapshot', 'ภาพบันทึกแบบอ่านอย่างเดียว')} ·{' '}
              {chart.symbol} · {formatMallDate(chart.capturedAt, lang)}
              {chart.session && ' · ' + chart.session}
              {chart.rMultiple !== undefined && ' · ' + formatR(chart.rMultiple)}
            </figcaption>
          </figure>
        )}
        <div className="mall-message-actions">
          {MALL_REACTIONS.map((emoji) => {
            const reactors = message.reactions[emoji] ?? [];
            const [Icon, en, th, reaction] = reactionStyles[emoji];
            return (
              <button
                type="button"
                key={emoji}
                data-reaction={reaction}
                title={reactors.join(', ') || t(en, th)}
                aria-pressed={reactors.includes(handle)}
                disabled={!online || isReactionPending}
                onClick={() => onReact(message, emoji)}
              >
                <Icon size={13} aria-hidden="true" />
                {t(en, th)}
                <span className="mono">{reactors.length}</span>
              </button>
            );
          })}
          {!compact && (
            <button type="button" onClick={() => onReply(message.id)}>
              <MessageSquare size={12} />{' '}
              {message.replyCount > 0
                ? message.replyCount + ' ' + t('replies', 'คำตอบ')
                : t('Reply', 'ตอบกลับ')}
            </button>
          )}
        </div>
      </div>
    </article>
  );
});

interface MallZoneNavProps {
  lang: DeskLanguage;
  zoneId: MallZoneId;
  zoneMetrics: Record<MallZoneId, MallZoneMetrics>;
  unread: Partial<Record<MallZoneId, number>>;
  sending: boolean;
  onSwitchZone: (next: MallZoneId) => void;
}

const MallZoneNav = memo(function MallZoneNav({
  lang,
  zoneId,
  zoneMetrics,
  unread,
  sending,
  onSwitchZone,
}: MallZoneNavProps) {
  const t = (en: string, th: string) => deskText(lang, en, th);
  return (
    <nav className="mall-zones" aria-label={t('Mall zones', 'ห้องในมอลล์')}>
      {MALL_ZONES.map((item) => {
        const metrics = zoneMetrics[item.id];
        const count = metrics.messageCount;
        const sheets = metrics.blueprintCount;
        return (
          <button
            key={item.id}
            type="button"
            data-zone={item.id}
            aria-current={zoneId === item.id ? 'page' : undefined}
            title={metrics.previewText || t(item.titleEn, item.titleTh)}
            disabled={sending}
            onClick={() => onSwitchZone(item.id)}
          >
            <span className="zone-name">
              <strong>{t(item.titleEn, item.titleTh)}</strong>
              <code>#{item.id}</code>
            </span>
            <span className="zone-counts mono">
              <small
                data-unread={!!unread[item.id]}
                title={t('Posts', 'โพสต์')}
                aria-label={t('Posts', 'โพสต์') + ' ' + (count ?? '—')}
              >
                <MessageSquare size={10} />
                {count ?? '—'}
              </small>
              <small
                title={t('Blueprints', 'บลูพรินต์')}
                aria-label={t('Blueprints', 'บลูพรินต์') + ' ' + (sheets ?? '—')}
              >
                <Layers3 size={10} />
                {sheets ?? '—'}
              </small>
            </span>
          </button>
        );
      })}
    </nav>
  );
});

export function CommunityMallSection({
  lang,
  handle,
  entry,
  online,
  currentBlueprint,
  haveSnapshotSource,
  getHeaders,
  verifiedChannel,
  rMultipleToday,
  status,
  onStatusChange,
  onLoadBlueprint,
  onViewListing,
  accountName,
  accountBalance,
  riskPerIdeaUsd,
  dailyLossBufferUsd,
  consistencyCapPct,
  gatesPassedCount,
  onOpenCalculator,
  onOpenMarketplace,
}: CommunityMallSectionProps) {
  const t = (en: string, th: string) => deskText(lang, en, th);
  const [zoneId, setZoneId] = useState(entry.zoneId);
  const zone = useMemo(() => MALL_ZONES.find((value) => value.id === zoneId)!, [zoneId]);
  const [zones, setZones] = useState<MallZoneSummary[]>([]);
  const [unread, setUnread] = useState<Partial<Record<MallZoneId, number>>>({});
  const [messages, setMessages] = useState<Partial<Record<MallZoneId, MallChatMessage[]>>>({});
  const loadedMessages = useRef(messages);
  const [presence, setPresence] = useState<Partial<Record<MallZoneId, MallPresence[]>>>({});
  const [cursors, setCursors] = useState<Record<string, string | null>>({});
  const [filter, setFilter] = useState<MallPostFilter>('ALL');
  const [ictTime, setIctTime] = useState(() => getBangkokTimeHHMM());
  const currentSession = useMemo(() => classifyTradeSession(ictTime), [ictTime]);

  useEffect(() => {
    const syncClock = () => {
      if (document.hidden) return;
      setIctTime(getBangkokTimeHHMM());
    };
    const timer = window.setInterval(syncClock, 15_000);
    document.addEventListener('visibilitychange', syncClock);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', syncClock);
    };
  }, []);

  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const isSearchStale = query !== deferredQuery;
  const [symbol, setSymbol] = useState<(typeof symbols)[number]>('ALL');
  const [renderWindow, setRenderWindow] = useState(MALL_FEED_WINDOW_STEP);
  const [showJumpLatest, setShowJumpLatest] = useState(false);
  const [thread, setThread] = useState<string>();
  const [inspected, setInspected] = useState<MallSetupBlueprint>();
  const [inspectorOpen, setInspectorOpen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 1200,
  );
  const inspectorRef = useRef<HTMLElement>(null);
  const inspectorToggleRef = useRef<HTMLButtonElement>(null);
  const closeInspector = useCallback(() => {
    if (inspectorRef.current?.contains(document.activeElement)) {
      inspectorToggleRef.current?.focus({ preventScroll: true });
    }
    setInspectorOpen(false);
  }, []);

  useEffect(() => {
    if (!inspectorOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !document.querySelector('dialog[open]')
      ) {
        closeInspector();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inspectorOpen, closeInspector]);

  const [draft, setDraft] = useState('');
  const [listing, setListing] = useState(entry.listing);
  const [attachBlueprint, setAttachBlueprint] = useState(false);
  const [attachSession, setAttachSession] = useState(false);
  const [snapshot, setSnapshot] = useState<SnapshotDraft>();
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const connectedRef = useRef(false);
  const [feedError, setFeedError] = useState(false);
  const [feedback, setFeedback] = useState<ApiProblem>();
  const [reactionPending, setReactionPending] = useState<string>();
  const [paging, setPaging] = useState(false);
  const activeZone = useRef(zoneId);
  const activeThread = useRef(thread);
  const feedRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const followFeed = useRef(false);
  const keepScroll = useRef<{ height: number; top: number } | undefined>(undefined);
  const lastPost = useRef<{ fingerprint: string; id: string } | undefined>(undefined);
  const seenEvents = useRef(new Set<string>());
  const clock = useRef(0);
  const revisions = useRef(new Map<string, number>());
  const lastFeedSyncAt = useRef<Record<string, number>>({});
  const lastPresenceAt = useRef(0);

  const zoneMessages = useMemo(() => messages[zoneId] ?? [], [messages, zoneId]);
  const members = useMemo(() => (online ? presence[zoneId] ?? [] : []), [online, presence, zoneId]);
  const peers = useMemo(() => members.filter((member) => member.handle !== handle), [members, handle]);
  const selfOnline = useMemo(() => members.some((member) => member.handle === handle), [members, handle]);
  const root = useMemo(
    () => (thread ? zoneMessages.find((item) => item.id === thread) : undefined),
    [zoneMessages, thread],
  );
  const replies = useMemo(
    () => (thread ? zoneMessages.filter((item) => item.threadRootId === thread) : []),
    [zoneMessages, thread],
  );
  const symbolForPresence = symbol === 'ALL' ? currentBlueprint?.primarySymbol || 'XAUUSD' : symbol;

  const upsert = useCallback((room: MallZoneId, updates: MallChatMessage[], since?: number) => {
    if (since === undefined) {
      clock.current += 1;
      for (let i = 0; i < updates.length; i += 1) {
        revisions.current.set(updates[i].id, clock.current);
      }
    }
    const current =
      since === undefined
        ? updates
        : updates.filter((item) => (revisions.current.get(item.id) ?? 0) <= since);
    if (current.length) {
      const prevRoom = loadedMessages.current[room] ?? [];
      const nextRoom = mergeMallMessages(prevRoom, current);
      if (nextRoom !== prevRoom) {
        loadedMessages.current = { ...loadedMessages.current, [room]: nextRoom };
        setMessages(loadedMessages.current);
      }
    }
  }, []);

  const refreshFeed = useCallback(
    async (room: MallZoneId, rootId?: string, cursor?: string, signal?: AbortSignal) => {
      const started = clock.current;
      const params = new URLSearchParams();
      if (rootId) params.set('threadRootId', rootId);
      if (cursor) params.set('cursor', cursor);
      const page = await mallRequest<MallFeedPage>('/zones/' + room + '/messages?' + params, {
        signal,
      });
      if (signal?.aborted) return;
      const key = contextKey(room, rootId);
      lastFeedSyncAt.current[key] = Date.now();
      const existingList = loadedMessages.current[room];
      const existing = new Set<string>();
      if (existingList) {
        for (let i = 0; i < existingList.length; i += 1) {
          const item = existingList[i];
          if (rootId ? item.threadRootId === rootId : !item.threadRootId) {
            existing.add(item.id);
          }
        }
      }
      const hasGap =
        existing.size > 0 &&
        page.cursor !== null &&
        !page.messages.some((item) => existing.has(item.id));
      upsert(room, page.messages, started);
      setPresence((previous) => ({ ...previous, [room]: page.presence }));
      setCursors((previous) =>
        !cursor && !hasGap && key in previous ? previous : { ...previous, [key]: page.cursor },
      );
    },
    [upsert],
  );

  const refreshZones = useCallback(async (signal?: AbortSignal) => {
    const data = await mallRequest<{ zones: MallZoneSummary[] }>('/zones', { signal });
    if (!signal?.aborted) setZones(data.zones);
  }, []);

  useEffect(() => {
    activeZone.current = zoneId;
    activeThread.current = thread;
  }, [zoneId, thread]);

  useEffect(() => {
    const abort = new AbortController();
    setFeedError(false);
    void refreshFeed(zoneId, undefined, undefined, abort.signal).catch(() => {
      if (!abort.signal.aborted) setFeedError(true);
    });
    if (thread) {
      void refreshFeed(zoneId, thread, undefined, abort.signal).catch(() => {
        if (!abort.signal.aborted) setFeedError(true);
      });
    }
    return () => abort.abort();
  }, [zoneId, thread, refreshFeed]);

  useEffect(() => {
    if (!online) {
      connectedRef.current = false;
      setConnected(false);
      return;
    }
    const abort = new AbortController();
    let hasOpenedOnce = false;
    let zoneRefreshTimer: number | undefined;
    let lastReconcileAt = Date.now();

    const refreshActive = (force = false) => {
      const room = activeZone.current;
      const rootId = activeThread.current;
      const now = Date.now();
      lastReconcileAt = now;
      void refreshZones(abort.signal).catch(() => {});
      const mainKey = contextKey(room);
      if (force || now - (lastFeedSyncAt.current[mainKey] ?? 0) > 1_500) {
        void refreshFeed(room, undefined, undefined, abort.signal)
          .then(() => {
            if (!abort.signal.aborted && activeZone.current === room) setFeedError(false);
          })
          .catch(() => {});
      }
      if (rootId) {
        const threadKey = contextKey(room, rootId);
        if (force || now - (lastFeedSyncAt.current[threadKey] ?? 0) > 1_500) {
          void refreshFeed(room, rootId, undefined, abort.signal).catch(() => {});
        }
      }
    };

    const stream = new EventSource('/api/mall/stream');
    stream.onopen = () => {
      connectedRef.current = true;
      setConnected(true);
      if (hasOpenedOnce) {
        refreshActive(true);
      } else {
        hasOpenedOnce = true;
      }
    };
    stream.onerror = () => {
      connectedRef.current = false;
      setConnected(false);
    };
    stream.onmessage = (event) => {
      let envelope: { event: string; payload: MallEvent };
      try {
        envelope = JSON.parse(event.data);
      } catch {
        return;
      }
      if (envelope.event === 'mall.heartbeat') return;
      const payload = envelope.payload;
      if (envelope.event === 'mall.presence' && payload.type === 'presence') {
        setPresence((previous) => ({ ...previous, [payload.zoneId]: payload.presence }));
      } else if (envelope.event === 'mall.chat' && payload.type !== 'presence') {
        upsert(
          payload.zoneId,
          payload.threadRoot ? [payload.message, payload.threadRoot] : [payload.message],
        );
        if (payload.type === 'message' && !seenEvents.current.has(payload.message.id)) {
          seenEvents.current.add(payload.message.id);
          if (seenEvents.current.size > 1_000) {
            seenEvents.current.delete(seenEvents.current.values().next().value!);
          }
          if (payload.zoneId !== activeZone.current) {
            setUnread((previous) => ({
              ...previous,
              [payload.zoneId]: (previous[payload.zoneId] ?? 0) + 1,
            }));
          }
          if (zoneRefreshTimer === undefined) {
            zoneRefreshTimer = window.setTimeout(() => {
              zoneRefreshTimer = undefined;
              void refreshZones(abort.signal).catch(() => {});
            }, 250);
          }
        }
      }
    };

    // Initial zones metadata fetch (zone feed itself is already loaded by the zoneId effect)
    void refreshZones(abort.signal).catch(() => {});

    const onVisibilityChange = () => {
      if (!document.hidden && Date.now() - lastReconcileAt > 15_000) {
        refreshActive(false);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Gentle reconciliation fallback: skip while tab is hidden, back off when SSE is healthy
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      const minInterval = connectedRef.current ? 90_000 : 30_000;
      if (Date.now() - lastReconcileAt >= minInterval) {
        refreshActive(false);
      }
    }, 30_000);

    return () => {
      connectedRef.current = false;
      stream.close();
      abort.abort();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(timer);
      window.clearTimeout(zoneRefreshTimer);
    };
  }, [online, refreshFeed, refreshZones, upsert]);

  useEffect(() => {
    if (!online) return;
    const abort = new AbortController();
    const publish = async () => {
      if (document.hidden) return;
      lastPresenceAt.current = Date.now();
      const headers = await getHeaders('presence');
      if (abort.signal.aborted) return;
      if (!headers.Authorization && !headers['X-TallyNX-Api-Key'] && !headers['X-Tredyn-Api-Key']) return;
      const result = await mallRequest<{ presence: MallPresence[] }>(
        '/zones/' + zoneId + '/presence',
        {
          method: 'POST',
          signal: abort.signal,
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({
            handle,
            status,
            symbol: symbolForPresence,
            rMultipleToday,
            verifiedChannel,
          }),
        },
      );
      if (!abort.signal.aborted) {
        setPresence((previous) => ({ ...previous, [zoneId]: result.presence }));
      }
    };
    const submitPresence = () => {
      void publish().catch(() => {});
    };
    const onVisible = () => {
      if (!document.hidden && Date.now() - lastPresenceAt.current > 45_000) {
        submitPresence();
      }
    };
    submitPresence();
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(submitPresence, 60_000);
    return () => {
      abort.abort();
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [getHeaders, handle, online, rMultipleToday, status, symbolForPresence, verifiedChannel, zoneId]);

  const getLocalizedExampleText = useCallback(
    (message: MallChatMessage) =>
      (message.authorRole === 'example' && EXAMPLE_MESSAGE_COPY[message.id]?.[lang]) ||
      message.text,
    [lang],
  );

  const zonePosts = useMemo(
    () => zoneMessages.filter((item) => !item.threadRootId),
    [zoneMessages],
  );
  const zoneMetrics = useMemo(() => computeZoneMetricsMap(zones, messages), [zones, messages]);
  const activeMetrics = zoneMetrics[zoneId];
  const blueprintCount = activeMetrics.blueprintCount ?? 0;
  const verifiedCount = activeMetrics.verifiedCount ?? 0;

  const filteredPosts = useMemo(
    () =>
      filterMallPosts(zonePosts, {
        filter,
        symbol,
        query: deferredQuery,
        getLocalizedText: getLocalizedExampleText,
      }),
    [zonePosts, filter, symbol, deferredQuery, getLocalizedExampleText],
  );

  const { visible, hiddenCount } = useMemo(
    () => sliceVisibleMallWindow(filteredPosts, renderWindow),
    [filteredPosts, renderWindow],
  );

  const pinned = useMemo(() => selectPinnedBlueprints(zonePosts, 2), [zonePosts]);
  const hasActiveFilters = filter !== 'ALL' || symbol !== 'ALL' || query.trim().length > 0;

  // Anchor scroll BEFORE paint so prepending older messages never flashes/jumps
  useLayoutEffect(() => {
    const feed = feedRef.current;
    if (!feed) return;
    if (keepScroll.current) {
      feed.scrollTop = keepScroll.current.top + feed.scrollHeight - keepScroll.current.height;
      keepScroll.current = undefined;
    } else if (followFeed.current) {
      feed.scrollTop = feed.scrollHeight;
      setShowJumpLatest(false);
    }
  }, [visible, zoneId]);

  const switchZone = useCallback(
    (next: MallZoneId) => {
      if (next === activeZone.current) return;
      followFeed.current = false;
      keepScroll.current = undefined;
      if (feedRef.current) feedRef.current.scrollTop = 0;
      activeZone.current = next;
      activeThread.current = undefined;
      setZoneId(next);
      setUnread((previous) => (previous[next] ? { ...previous, [next]: 0 } : previous));
      setThread(undefined);
      setInspected(undefined);
      if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 1200px)').matches) {
        closeInspector();
      }
      setQuery('');
      setSymbol('ALL');
      setFilter('ALL');
      setRenderWindow(MALL_FEED_WINDOW_STEP);
      setShowJumpLatest(false);
      setFeedback(undefined);
      if (next !== 'setup-showroom') setListing(undefined);
    },
    [closeInspector],
  );

  const toggleInspector = useCallback(() => {
    if (inspectorOpen) {
      closeInspector();
      return;
    }
    setInspectorOpen(true);
    if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 1200px)').matches) {
      window.requestAnimationFrame(() => inspectorRef.current?.focus({ preventScroll: true }));
    }
  }, [inspectorOpen, closeInspector]);

  const inspect = useCallback((blueprint: MallSetupBlueprint) => {
    setInspected(blueprint);
    setThread(undefined);
    setInspectorOpen(true);
    window.requestAnimationFrame(() => inspectorRef.current?.focus({ preventScroll: true }));
  }, []);

  const reply = useCallback((id: string) => {
    setThread(id);
    setInspected(undefined);
    setFeedback(undefined);
    setInspectorOpen(true);
    window.requestAnimationFrame(() => composerRef.current?.focus({ preventScroll: true }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilter('ALL');
    setSymbol('ALL');
    setQuery('');
    setRenderWindow(MALL_FEED_WINDOW_STEP);
  }, []);

  const showEarlierWindow = useCallback(() => {
    const feed = feedRef.current;
    if (feed) {
      keepScroll.current = { height: feed.scrollHeight, top: feed.scrollTop };
    }
    setRenderWindow((current) => current + MALL_FEED_WINDOW_STEP);
  }, []);

  const jumpToLatest = useCallback(() => {
    const feed = feedRef.current;
    if (!feed) return;
    followFeed.current = true;
    setShowJumpLatest(false);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    feed.scrollTo({ top: feed.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, []);

  async function loadOlder(rootId?: string) {
    const cursor = cursors[contextKey(zoneId, rootId)];
    if (!cursor || paging) return;
    const feed = feedRef.current;
    if (!rootId && feed) keepScroll.current = { height: feed.scrollHeight, top: feed.scrollTop };
    setPaging(true);
    try {
      await refreshFeed(zoneId, rootId, cursor);
      if (!rootId) {
        setRenderWindow((current) => current + MALL_FEED_WINDOW_STEP);
      }
    } catch {
      keepScroll.current = undefined;
      setFeedError(true);
    } finally {
      setPaging(false);
    }
  }

  async function toggleSnapshot() {
    if (snapshot) {
      setSnapshot(undefined);
      return;
    }
    setSnapshotBusy(true);
    setFeedback(undefined);
    try {
      const headers = await getHeaders('snapshot');
      const result = await mallRequest<{ snapshot: SnapshotDraft }>('/snapshots/latest', {
        headers,
      });
      setSnapshot(result.snapshot);
    } catch {
      setFeedback({
        reasonEn: 'No server-verified closed MT5 trade snapshot is available for this workspace.',
        reasonTh:
          'ยังไม่มีภาพรายการ MT5 ที่ปิดแล้วและผ่านการตรวจสอบจากเซิร์ฟเวอร์สำหรับพื้นที่ทำงานนี้',
      });
    } finally {
      setSnapshotBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || !online) return;
    const setupBlueprint = listing
      ? { listingId: listing.id }
      : attachBlueprint
        ? currentBlueprint
        : undefined;
    const text = draft.trim();
    const sessionStatusPill =
      attachSession && rMultipleToday !== undefined
        ? { status, rMultipleToday, sessionLabel: 'Today' }
        : undefined;
    if (!text && !setupBlueprint && !snapshot && !sessionStatusPill) return;
    const body = {
      handle,
      text,
      symbol: symbol === 'ALL' ? listing?.symbol : symbol,
      threadRootId: thread,
      setupBlueprint,
      snapshotAttachment: snapshot,
      sessionStatusPill,
      verifiedChannel,
    };
    const fingerprint = JSON.stringify([zoneId, body]);
    if (lastPost.current?.fingerprint !== fingerprint) {
      lastPost.current = { fingerprint, id: crypto.randomUUID() };
    }
    setSending(true);
    setFeedback(undefined);
    try {
      const headers = await getHeaders('post');
      const result = await mallRequest<{
        message: MallChatMessage;
        threadRoot?: MallChatMessage;
      }>('/zones/' + zoneId + '/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ ...body, clientMessageId: lastPost.current.id }),
      });
      followFeed.current = true;
      upsert(
        zoneId,
        result.threadRoot ? [result.message, result.threadRoot] : [result.message],
      );
      setDraft('');
      setListing(undefined);
      setAttachBlueprint(false);
      setAttachSession(false);
      setSnapshot(undefined);
      lastPost.current = undefined;
    } catch (error) {
      setFeedback(error as ApiProblem);
    } finally {
      setSending(false);
    }
  }

  const reactionPendingRef = useRef(reactionPending);
  reactionPendingRef.current = reactionPending;

  const handleReact = useCallback(
    async (message: MallChatMessage, emoji: (typeof MALL_REACTIONS)[number]) => {
      if (!online || reactionPendingRef.current) return;
      setReactionPending(message.id);
      try {
        const headers = await getHeaders('post');
        const result = await mallRequest<{ message: MallChatMessage }>(
          '/zones/' + message.zoneId + '/messages/' + message.id + '/reactions',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify({
              handle,
              emoji,
              active: !message.reactions[emoji]?.includes(handle),
              clientReactionId: crypto.randomUUID(),
            }),
          },
        );
        upsert(message.zoneId, [result.message]);
      } catch (error) {
        setFeedback(error as ApiProblem);
      } finally {
        setReactionPending(undefined);
      }
    },
    [online, handle, upsert, getHeaders],
  );

  const handleFeedScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    followFeed.current = distanceFromBottom < 60;
    const shouldShowJump = distanceFromBottom > 280 && el.scrollHeight > el.clientHeight + 280;
    setShowJumpLatest((prev) => (prev === shouldShowJump ? prev : shouldShowJump));
  }, []);

  return (
    <section
      id="sec-mall"
      className="mall-shell"
      aria-label={t('TallyNX Community Mall', 'TallyNX คอมมูนิตี้มอลล์')}
      data-inspector={inspectorOpen}
    >
      <aside className="mall-sidebar">
        <div className="mall-brand">
          <span>
            <MessageSquare size={16} aria-hidden="true" />
          </span>
          <strong>{t('Trader zones', 'ห้องเทรดเดอร์')}</strong>
        </div>
        <MallZoneNav
          lang={lang}
          zoneId={zoneId}
          zoneMetrics={zoneMetrics}
          unread={unread}
          sending={sending}
          onSwitchZone={switchZone}
        />
        <div className="mall-presence">
          <label className="mall-status-picker">
            <span>
              {t('Your status', 'สถานะของคุณ')} <small>{handle}</small>
            </span>
            <select
              value={status}
              onChange={(event) => onStatusChange(event.target.value as MallStatus)}
            >
              {MALL_STATUSES.map((item) => (
                <option key={item} value={item}>
                  {t(...statusLabels[item])}
                </option>
              ))}
            </select>
          </label>
          <details className="mall-directory">
            <summary className="mall-presence-heading">
              <Users size={14} aria-hidden="true" />
              {t('Trader directory', 'เทรดเดอร์ในห้อง')}
            </summary>
            <ul className="mall-members">
              <li className="mall-self">
                <span
                  className="mall-status-dot"
                  data-live={selfOnline}
                  data-status={status}
                  aria-hidden="true"
                />
                <div>
                  <strong>
                    <span>{handle}</span>
                    <em>{t('You', 'คุณ')}</em>
                  </strong>
                  <small>
                    {symbolForPresence} · {t(...statusLabels[status])}
                  </small>
                </div>
                <span className="mall-r mono">
                  {rMultipleToday === undefined ? '—' : formatR(rMultipleToday)}
                </span>
              </li>
              {peers.map((member) => (
                <li key={member.id}>
                  <span
                    className="mall-status-dot"
                    data-live="true"
                    data-status={member.status}
                    aria-hidden="true"
                  />
                  <div>
                    <strong>{member.handle}</strong>
                    <small>
                      {member.symbol} · {t(...statusLabels[member.status])}
                    </small>
                    {member.verifiedChannel && (
                      <small>{channelLabels[member.verifiedChannel]}</small>
                    )}
                  </div>
                  <span className="mall-r mono">{formatR(member.rMultipleToday)}</span>
                </li>
              ))}
              {peers.length < 3 &&
                benchmarks.map((desk) => (
                  <li className="mall-benchmark" key={'benchmark-' + desk.handle}>
                    <Layers3 size={12} aria-hidden="true" />
                    <div>
                      <em>{t('Sample trader', 'เทรดเดอร์ตัวอย่าง')}</em>
                      <strong>{desk.handle}</strong>
                      <small>
                        {desk.channel} · {desk.symbol}
                      </small>
                      <small>{t(...statusLabels[desk.status])}</small>
                    </div>
                    <span className="mall-r mono">{formatR(desk.r)}</span>
                  </li>
                ))}
            </ul>
          </details>
        </div>
      </aside>

      <div className="mall-center">
        <header className="mall-zone-header">
          <div className="mall-zone-heading">
            <div className="mall-zone-intro">
              <div className="mall-zone-title-line">
                <h1>{t(zone.titleEn, zone.titleTh)}</h1>
                <span className="session-clock mono" data-session={currentSession}>
                  <Activity size={12} />
                  {currentSession.replace('_', ' ')} <b>{ictTime} ICT</b>
                </span>
                <span className="mall-connection" data-live={connected && online}>
                  <i aria-hidden="true" />{' '}
                  {connected && online
                    ? t('Feed connected', 'เชื่อมต่อฟีดแล้ว')
                    : online
                      ? t('Connecting', 'กำลังเชื่อมต่อ')
                      : t('Offline', 'ออฟไลน์')}
                </span>
              </div>
              <p>{t(zone.descriptionEn, zone.descriptionTh)}</p>
            </div>
            <div className="mall-zone-tools">
              <span className="mall-desk-pill mono" title={accountName}>
                <span className="sensitive-val">{accountBalance}</span>
                <span aria-hidden="true">·</span>12G {gatesPassedCount}/12
              </span>
              <span
                className="mall-zone-counts-pill mono"
                title={t(
                  `${blueprintCount} blueprints · ${verifiedCount} MT5 verified`,
                  `${blueprintCount} บลูพรินต์ · ยืนยัน MT5 ${verifiedCount}`,
                )}
              >
                <Layers3 size={12} />
                {blueprintCount} · <ShieldCheck size={12} />
                {verifiedCount}
              </span>
              <button
                className="btn xs mall-inspector-toggle"
                type="button"
                ref={inspectorToggleRef}
                aria-expanded={inspectorOpen}
                aria-controls={inspectorOpen ? 'mall-inspector' : undefined}
                aria-label={t('Toggle room details', 'เปิดหรือปิดรายละเอียดห้อง')}
                onClick={toggleInspector}
              >
                <PanelRight size={14} aria-hidden="true" />
                <span>
                  {inspectorOpen
                    ? t('Hide details', 'ซ่อนรายละเอียด')
                    : t('My Desk & Thread', 'พอร์ตและเธรด')}
                </span>
              </button>
            </div>
          </div>

          <div className="mall-zone-toolbar">
            <div
              className="mall-filter-pills"
              role="group"
              aria-label={t('Post type', 'ประเภทโพสต์')}
            >
              {postFilterKeys.map((key) => (
                <button
                  type="button"
                  key={key}
                  aria-pressed={filter === key}
                  onClick={() => {
                    setFilter(key);
                    setRenderWindow(MALL_FEED_WINDOW_STEP);
                  }}
                >
                  {t(postFilters[key][0], postFilters[key][1])}
                </button>
              ))}
            </div>
            <div
              className="mall-filters"
              role="search"
              aria-label={t('Search room posts', 'ค้นหาโพสต์ในห้อง')}
            >
              <label className="mall-search">
                <Search size={14} aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('Search zone...', 'ค้นหา...')}
                  aria-label={t('Search this zone', 'ค้นหาในห้องนี้')}
                />
                {query && (
                  <button
                    type="button"
                    className="mall-search-clear"
                    aria-label={t('Clear search', 'ล้างคำค้นหา')}
                    onClick={() => setQuery('')}
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                )}
              </label>
              <label className="mall-filter">
                <select
                  value={symbol}
                  onChange={(event) => {
                    setSymbol(event.target.value as (typeof symbols)[number]);
                    setRenderWindow(MALL_FEED_WINDOW_STEP);
                  }}
                  aria-label={t('Filter by symbol', 'กรองตามสัญลักษณ์')}
                >
                  {symbols.map((value) => (
                    <option key={value} value={value}>
                      {value === 'ALL' ? t('All symbols', 'ทุกสินทรัพย์') : value}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </header>

        <div className="mall-harbor">
          <ShieldCheck size={13} aria-hidden="true" />
          <span>{MALL_SAFE_HARBOR[lang]}</span>
        </div>

        {hasActiveFilters && (
          <div className="mall-filter-status" role="status" aria-live="polite">
            <span>
              {t(
                `Showing ${filteredPosts.length} of ${zonePosts.length} posts`,
                `แสดง ${filteredPosts.length} จาก ${zonePosts.length} โพสต์`,
              )}
            </span>
            <button type="button" onClick={resetFilters}>
              {t('Reset filters', 'ล้างตัวกรอง')}
            </button>
          </div>
        )}

        <div
          className="mall-feed"
          aria-label={t('Zone messages', 'ข้อความในห้อง')}
          data-stale={isSearchStale || undefined}
          ref={feedRef}
          onScroll={handleFeedScroll}
        >
          {cursors[contextKey(zoneId)] && (
            <button
              type="button"
              className="mall-text-button mall-older"
              disabled={paging}
              onClick={() => void loadOlder()}
            >
              {paging
                ? t('Loading older messages…', 'กำลังโหลดข้อความก่อนหน้า…')
                : t('Load older messages', 'โหลดข้อความก่อนหน้า')}
            </button>
          )}
          {hiddenCount > 0 && (
            <button
              type="button"
              className="mall-window-banner"
              onClick={showEarlierWindow}
            >
              {t(
                `Show earlier loaded posts (${hiddenCount} more)`,
                `แสดงโพสต์ที่โหลดไว้ก่อนหน้า (อีก ${hiddenCount} รายการ)`,
              )}
            </button>
          )}
          {feedError && (
            <p className="mall-muted" role="status" aria-live="polite">
              {t(
                'The feed will retry when the connection is available.',
                'ระบบจะลองโหลดข้อความอีกครั้งเมื่อเชื่อมต่อได้',
              )}
            </p>
          )}
          {!visible.length &&
            (messages[zoneId] ? (
              <p className="mall-empty" role="status" aria-live="polite">
                {t('No posts match your filters.', 'ไม่มีโพสต์ตรงกับตัวกรอง')}
              </p>
            ) : (
              <div
                className="mall-feed-skeleton"
                role="status"
                aria-label={t('Loading zone messages', 'กำลังโหลดข้อความในห้อง')}
              >
                <div className="mall-feed-skeleton-card" />
                <div className="mall-feed-skeleton-card" />
              </div>
            ))}
          {visible.map((item) => (
            <MallMessageCard
              key={item.id}
              message={item}
              lang={lang}
              handle={handle}
              online={online}
              isReactionPending={reactionPending === item.id}
              onInspect={inspect}
              onLoadBlueprint={onLoadBlueprint}
              onReact={handleReact}
              onReply={reply}
            />
          ))}
          {showJumpLatest && visible.length > 0 && (
            <button
              type="button"
              className="mall-jump-latest"
              onClick={jumpToLatest}
            >
              <ArrowDown size={13} aria-hidden="true" />
              {t('Jump to latest', 'ไปที่ข้อความล่าสุด')}
            </button>
          )}
        </div>

        <form className="mall-composer" onSubmit={(event) => void submit(event)}>
          {thread && (
            <div className="mall-draft-label">
              <MessageSquare size={13} /> {t('Replying in thread', 'กำลังตอบในเธรด')}{' '}
              {root?.handle}
              <button
                type="button"
                className="btn mall-icon-button"
                aria-label={t('Close reply', 'ปิดการตอบกลับ')}
                onClick={() => setThread(undefined)}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          )}
          {listing && (
            <div className="mall-draft-label">
              <Box size={14} /> {listing.title}
              <button
                type="button"
                className="btn mall-icon-button"
                aria-label={t('Remove listing attachment', 'ลบรายการที่แนบ')}
                onClick={() => setListing(undefined)}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          )}
          <div className="mall-topics">
            {quickTopics.map((topic) => (
              <button
                type="button"
                key={topic}
                disabled={sending || (draft.trimEnd() + ' ' + topic).trim().length > 2000}
                onClick={() => {
                  setDraft((value) => (value.trimEnd() + ' ' + topic).trimStart());
                  composerRef.current?.focus();
                }}
              >
                {topic}
              </button>
            ))}
          </div>
          <textarea
            ref={composerRef}
            aria-keyshortcuts="Control+Enter Meta+Enter"
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                (event.ctrlKey || event.metaKey) &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            maxLength={2_000}
            value={draft}
            readOnly={sending}
            onChange={(event) => {
              setDraft(event.target.value);
              setFeedback(undefined);
            }}
            aria-label={t('Mall message', 'ข้อความมอลล์')}
            placeholder={t(
              'Share a risk note or a lesson from your journal…',
              'แชร์เรื่องความเสี่ยงหรือข้อสังเกตจากรอบเทรดล่าสุด…',
            )}
          />
          <div className="mall-composer-actions">
            <div className="mall-attachments">
              <button
                type="button"
                aria-label={t(
                  'Attach Current 3-TP Risk Blueprint',
                  'แนบบลูพรินต์ความเสี่ยง 3-TP ปัจจุบัน',
                )}
                aria-pressed={attachBlueprint}
                disabled={!currentBlueprint || !!listing || sending}
                onClick={() => setAttachBlueprint((prev) => !prev)}
              >
                <Box size={13} /> {t('3-TP blueprint', 'บลูพรินต์ 3-TP')}
              </button>
              <button
                type="button"
                aria-label={t(
                  'Attach Latest Verified Trade Snapshot',
                  'แนบภาพรายการเทรดที่ยืนยันล่าสุด',
                )}
                aria-pressed={!!snapshot}
                disabled={!online || !haveSnapshotSource || snapshotBusy || sending}
                onClick={() => void toggleSnapshot()}
              >
                <Image size={13} />{' '}
                {snapshotBusy ? t('Loading…', 'กำลังโหลด…') : t('Verified snapshot', 'ภาพเทรดที่ยืนยัน')}
              </button>
              <button
                type="button"
                aria-label={t("Share Today's Session R Summary", 'แชร์สรุปค่า R ของวันนี้')}
                aria-pressed={attachSession}
                disabled={rMultipleToday === undefined || sending}
                onClick={() => setAttachSession((prev) => !prev)}
              >
                <Activity size={13} /> {t('Session R', 'ค่า R ของรอบ')}
              </button>
            </div>
            <button
              type="submit"
              className="btn primary mall-send"
              title={t('Send (Ctrl / ⌘ + Enter)', 'ส่ง (Ctrl / ⌘ + Enter)')}
              disabled={
                !online ||
                sending ||
                (!draft.trim() && !listing && !snapshot && !attachBlueprint && !attachSession)
              }
            >
              <Send size={14} aria-hidden="true" />
              {sending ? t('Sending…', 'กำลังส่ง…') : t('Send', 'ส่ง')}
            </button>
          </div>
          {feedback && (
            <p className="mall-error" role="alert">
              {(lang === 'th' ? feedback.reasonTh : feedback.reasonEn) ||
                t(
                  'The request could not be completed. Please try again.',
                  'ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง',
                )}
            </p>
          )}
        </form>
      </div>

      {inspectorOpen && (
        <div className="mall-drawer-backdrop" aria-hidden="true" onClick={closeInspector} />
      )}
      {inspectorOpen && (
        <aside
          id="mall-inspector"
          className="mall-inspector mall-drawer"
          ref={inspectorRef}
          tabIndex={-1}
          aria-label={t('Inspector panel', 'แผงตรวจสอบ')}
        >
          <header>
            <h2>
              {thread
                ? t('Thread', 'เธรด')
                : inspected
                  ? t('Setup inspector', 'ตรวจสอบชุดตั้งค่า')
                  : t('Zone briefing', 'สรุปห้อง')}
            </h2>
            <button
              type="button"
              className="btn mall-icon-button"
              aria-label={t('Collapse inspector', 'พับแผงตรวจสอบ')}
              onClick={closeInspector}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </header>
          <div className="mall-inspector-body">
            {thread ? (
              <>
                <button
                  type="button"
                  className="mall-text-button"
                  onClick={() => setThread(undefined)}
                >
                  {t('Back to zone briefing', 'กลับไปที่สรุปห้อง')}
                </button>
                {root && (
                  <MallMessageCard
                    message={root}
                    lang={lang}
                    handle={handle}
                    online={online}
                    compact
                    isReactionPending={reactionPending === root.id}
                    onInspect={inspect}
                    onLoadBlueprint={onLoadBlueprint}
                    onReact={handleReact}
                    onReply={reply}
                  />
                )}
                {cursors[contextKey(zoneId, thread)] && (
                  <button
                    type="button"
                    className="mall-text-button"
                    disabled={paging}
                    onClick={() => void loadOlder(thread)}
                  >
                    {t('Load older replies', 'โหลดคำตอบก่อนหน้า')}
                  </button>
                )}
                {replies.length ? (
                  replies.map((item) => (
                    <MallMessageCard
                      key={item.id}
                      message={item}
                      lang={lang}
                      handle={handle}
                      online={online}
                      compact
                      isReactionPending={reactionPending === item.id}
                      onInspect={inspect}
                      onLoadBlueprint={onLoadBlueprint}
                      onReact={handleReact}
                      onReply={reply}
                    />
                  ))
                ) : (
                  <p className="mall-muted">{t('No replies yet.', 'ยังไม่มีคำตอบ')}</p>
                )}
              </>
            ) : inspected ? (
              <>
                <button
                  type="button"
                  className="mall-text-button"
                  onClick={() => setInspected(undefined)}
                >
                  {t('Back to zone briefing', 'กลับไปที่สรุปห้อง')}
                </button>
                <BlueprintCard
                  blueprint={inspected}
                  lang={lang}
                  compact
                  onLoadBlueprint={onLoadBlueprint}
                />
                {inspected.checklistNotes.length > 0 && (
                  <ul className="mall-checklist">
                    {inspected.checklistNotes.map((note, index) => (
                      <li key={index}>{note}</li>
                    ))}
                  </ul>
                )}
                {inspected.proofHash && (
                  <div className="mall-details">
                    <span>{t('SHA-256 proof', 'หลักฐาน SHA-256')}</span>
                    <code>{inspected.proofHash}</code>
                  </div>
                )}
                {inspected.winRatePct !== undefined && (
                  <p className="mall-muted">
                    {t('Historical win rate', 'อัตราชนะย้อนหลัง')}{' '}
                    <span className="mono">{inspected.winRatePct.toFixed(1)}%</span>
                    {inspected.profitFactor !== undefined && (
                      <>
                        {' '}
                        · PF <span className="mono">{inspected.profitFactor.toFixed(2)}</span>
                      </>
                    )}
                  </p>
                )}
                {inspected.listingId && (
                  <button
                    type="button"
                    className="btn mall-inspector-action"
                    onClick={() => onViewListing(inspected.listingId!)}
                  >
                    {t('View in Marketplace', 'ดูใน Marketplace')} <ArrowUpRight size={14} />
                  </button>
                )}
              </>
            ) : (
              <>
                <section className="mall-risk-book" aria-labelledby="mall-risk-title">
                  <div className="mall-inspector-title">
                    <Activity size={15} aria-hidden="true" />
                    <h3 id="mall-risk-title">
                      {t('Active Desk Risk', 'ความเสี่ยงของพอร์ตปัจจุบัน')}
                    </h3>
                  </div>
                  <strong className="risk-account">{accountName}</strong>
                  <dl className="risk-metrics">
                    <div>
                      <dt>{t('Balance', 'ยอดคงเหลือ')}</dt>
                      <dd className="sensitive-val">{accountBalance}</dd>
                    </div>
                    <div>
                      <dt>{t('Risk / idea', 'ความเสี่ยงต่อแผน')}</dt>
                      <dd className="sensitive-val">
                        {riskPerIdeaUsd === undefined ? '—' : fmtUSD(riskPerIdeaUsd)}
                      </dd>
                    </div>
                    <div data-tone="risk">
                      <dt>{t('Daily DD buffer', 'วงเงินขาดทุนที่เหลือ')}</dt>
                      <dd className="sensitive-val">
                        {dailyLossBufferUsd === undefined ? '—' : fmtUSD(dailyLossBufferUsd)}
                      </dd>
                    </div>
                    <div data-tone="warn">
                      <dt>{t('Consistency cap', 'เพดานความสม่ำเสมอ')}</dt>
                      <dd>
                        {consistencyCapPct === undefined
                          ? '—'
                          : consistencyCapPct >= 100
                            ? t('Off', 'ปิด')
                            : consistencyCapPct + '%'}
                      </dd>
                    </div>
                  </dl>
                  <div className="gate-total">
                    <ListChecks size={14} />
                    12-Gate <b className="mono">{gatesPassedCount}/12</b>
                  </div>
                  <div className="gate-meter" aria-hidden="true">
                    {gateIndices.map((i) => (
                      <i key={i} data-passed={i < gatesPassedCount} />
                    ))}
                  </div>
                  <button type="button" className="risk-open" onClick={onOpenCalculator}>
                    <Calculator size={14} />
                    {t('Open 3-TP Calculator', 'เปิดเครื่องคำนวณ 3-TP')}
                    <ArrowUpRight size={14} />
                  </button>
                </section>
                <section className="mall-pinned" aria-labelledby="mall-pinned-title">
                  <div className="mall-inspector-title">
                    <Layers3 size={15} aria-hidden="true" />
                    <h3 id="mall-pinned-title">
                      {t('Pinned 3-TP blueprints', 'ชุดตั้งค่าที่ปักหมุด')}
                    </h3>
                  </div>
                  {pinned.map((item) => (
                    <BlueprintCard
                      key={item.id}
                      blueprint={item.setupBlueprint!}
                      compact
                      lang={lang}
                      onLoadBlueprint={onLoadBlueprint}
                      onInspect={inspect}
                    />
                  ))}
                  {!pinned.length && (
                    <p className="mall-muted">
                      {t('No pinned 3-TP blueprints yet.', 'ยังไม่มีบลูพรินต์ 3-TP ที่ปักหมุด')}
                    </p>
                  )}
                </section>
                <section className="mall-guardrails" aria-labelledby="mall-guardrails-title">
                  <div className="mall-inspector-title">
                    <ShieldCheck size={15} aria-hidden="true" />
                    <h3 id="mall-guardrails-title">
                      {t('Discipline guardrails', 'กรอบวินัยในการเทรด')}
                    </h3>
                  </div>
                  <ul className="mall-checklist">
                    <li>
                      {t(
                        'Review daily loss and drawdown limits.',
                        'ทบทวนวงเงินขาดทุนรายวันและขีดจำกัด Drawdown',
                      )}
                    </li>
                    <li>
                      {t(
                        'Record realized R from closed trades.',
                        'บันทึกค่า R ที่เกิดขึ้นจริงจากรายการที่ปิดแล้ว',
                      )}
                    </li>
                    <li>
                      {t('Share SL and TP distances with units.', 'แชร์ระยะ SL และ TP พร้อมหน่วย')}
                    </li>
                  </ul>
                  <button className="mall-text-button" type="button" onClick={onOpenMarketplace}>
                    <Store size={13} />
                    {t('Browse Marketplace', 'เปิดตลาดชุดตั้งค่า')}
                    <ChevronRight size={13} />
                  </button>
                  {zoneId !== 'setup-showroom' && (
                    <button
                      className="mall-text-button"
                      type="button"
                      onClick={() => switchZone('setup-showroom')}
                    >
                      {t('Open Setup Showroom', 'เปิดโชว์รูมชุดตั้งค่า')} <ChevronRight size={13} />
                    </button>
                  )}
                </section>
              </>
            )}
          </div>
        </aside>
      )}
    </section>
  );
}
