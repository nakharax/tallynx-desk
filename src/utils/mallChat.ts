import {
  MALL_ZONES,
  isMt5VerifiedMallPost,
  type MallChatMessage,
  type MallZoneId,
  type MallZoneSummary,
} from '../types/mallChat';
import type { DeskLanguage } from './deskI18n';

export type MallPostFilter = 'ALL' | 'BLUEPRINTS' | 'VERIFIED' | 'THREADS';

export const MALL_FEED_WINDOW_STEP = 40;

export interface MallZoneMetrics {
  summary?: MallZoneSummary;
  messageCount?: number;
  blueprintCount?: number;
  verifiedCount?: number;
  previewText?: string;
}

function compareIsoAsc(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Merges incoming Mall messages into an existing sorted zone array.
 * Preserves array referential identity when no updates are provided and uses
 * an O(N) fast append path for single chronological live SSE arrivals.
 */
export function mergeMallMessages(
  previous: MallChatMessage[],
  updates: MallChatMessage[],
): MallChatMessage[] {
  if (updates.length === 0) return previous;

  if (updates.length === 1) {
    const incoming = updates[0];
    let existingIndex = -1;
    for (let i = previous.length - 1; i >= 0; i -= 1) {
      if (previous[i].id === incoming.id) {
        existingIndex = i;
        break;
      }
    }
    if (existingIndex === -1) {
      if (
        previous.length === 0 ||
        compareIsoAsc(previous[previous.length - 1].createdAt, incoming.createdAt) <= 0
      ) {
        return [...previous, incoming];
      }
    } else if (previous[existingIndex].createdAt === incoming.createdAt) {
      const next = previous.slice();
      next[existingIndex] = incoming;
      return next;
    }
  }

  const merged = new Map<string, MallChatMessage>();
  for (let i = 0; i < previous.length; i += 1) {
    const item = previous[i];
    merged.set(item.id, item);
  }
  for (let i = 0; i < updates.length; i += 1) {
    const item = updates[i];
    merged.set(item.id, item);
  }

  return Array.from(merged.values()).sort(
    (a, b) => compareIsoAsc(a.createdAt, b.createdAt) || compareIsoAsc(a.id, b.id),
  );
}

export interface MallFilterOptions {
  filter: MallPostFilter;
  symbol: string;
  query: string;
  getLocalizedText?: (message: MallChatMessage) => string;
}

export function filterMallPosts(
  posts: readonly MallChatMessage[],
  options: MallFilterOptions,
): MallChatMessage[] {
  const { filter, symbol, query, getLocalizedText } = options;
  const normalizedQuery = query.trim().toLowerCase();
  const hasFilter = filter !== 'ALL';
  const hasSymbol = symbol !== 'ALL';
  const hasQuery = normalizedQuery.length > 0;

  if (!hasFilter && !hasSymbol && !hasQuery) {
    return posts as MallChatMessage[];
  }

  const result: MallChatMessage[] = [];
  for (let i = 0; i < posts.length; i += 1) {
    const item = posts[i];

    if (hasFilter) {
      if (filter === 'BLUEPRINTS' && !item.setupBlueprint) continue;
      if (filter === 'VERIFIED' && !isMt5VerifiedMallPost(item)) continue;
      if (filter === 'THREADS' && item.replyCount <= 0) continue;
    }

    if (
      hasSymbol &&
      item.symbol !== symbol &&
      item.setupBlueprint?.primarySymbol !== symbol &&
      item.snapshotAttachment?.symbol !== symbol
    ) {
      continue;
    }

    if (hasQuery) {
      const localized = getLocalizedText ? getLocalizedText(item) : item.text;
      const matches =
        item.text.toLowerCase().includes(normalizedQuery) ||
        (localized !== item.text && localized.toLowerCase().includes(normalizedQuery)) ||
        item.handle.toLowerCase().includes(normalizedQuery) ||
        (item.symbol !== undefined && item.symbol.toLowerCase().includes(normalizedQuery)) ||
        (item.setupBlueprint?.title !== undefined &&
          item.setupBlueprint.title.toLowerCase().includes(normalizedQuery));
      if (!matches) continue;
    }

    result.push(item);
  }

  return result;
}

export function selectPinnedBlueprints(
  zonePosts: readonly MallChatMessage[],
  limit = 2,
): MallChatMessage[] {
  if (zonePosts.length === 0 || limit <= 0) return [];

  const candidates: MallChatMessage[] = [];
  for (let i = 0; i < zonePosts.length; i += 1) {
    const item = zonePosts[i];
    if (item.setupBlueprint && (item.authorRole === 'example' || item.setupBlueprint.proofHash)) {
      candidates.push(item);
    }
  }
  if (candidates.length === 0) return [];

  candidates.sort((a, b) => compareIsoAsc(a.createdAt, b.createdAt));

  const deduped = new Map<string, MallChatMessage>();
  for (let i = 0; i < candidates.length; i += 1) {
    const item = candidates[i];
    deduped.set(item.setupBlueprint!.listingId ?? item.id, item);
  }

  return Array.from(deduped.values())
    .sort(
      (a, b) =>
        Number(Boolean(b.setupBlueprint?.proofHash)) - Number(Boolean(a.setupBlueprint?.proofHash)) ||
        compareIsoAsc(b.createdAt, a.createdAt),
    )
    .slice(0, limit);
}

export function sliceVisibleMallWindow<T>(
  items: readonly T[],
  windowSize: number,
): { visible: T[]; hiddenCount: number } {
  const safeWindow = Math.max(1, windowSize);
  if (items.length <= safeWindow) {
    return { visible: items as T[], hiddenCount: 0 };
  }
  const hiddenCount = items.length - safeWindow;
  return {
    visible: items.slice(hiddenCount),
    hiddenCount,
  };
}

export function computeZoneMetricsMap(
  zones: readonly MallZoneSummary[],
  messagesByZone: Partial<Record<MallZoneId, MallChatMessage[]>>,
): Record<MallZoneId, MallZoneMetrics> {
  const summaryById = new Map<MallZoneId, MallZoneSummary>();
  for (let i = 0; i < zones.length; i += 1) {
    summaryById.set(zones[i].id, zones[i]);
  }

  const out = {} as Record<MallZoneId, MallZoneMetrics>;
  for (let i = 0; i < MALL_ZONES.length; i += 1) {
    const id = MALL_ZONES[i].id;
    const summary = summaryById.get(id);
    const localList = messagesByZone[id];

    let blueprintCount = summary?.blueprintCount;
    let verifiedCount = summary?.verifiedPostCount;
    if ((blueprintCount === undefined || verifiedCount === undefined) && localList) {
      let localBlueprints = 0;
      let localVerified = 0;
      for (let j = 0; j < localList.length; j += 1) {
        const post = localList[j];
        if (!post.threadRootId) {
          if (post.setupBlueprint) localBlueprints += 1;
          if (isMt5VerifiedMallPost(post)) localVerified += 1;
        }
      }
      if (blueprintCount === undefined) blueprintCount = localBlueprints;
      if (verifiedCount === undefined) verifiedCount = localVerified;
    }

    out[id] = {
      summary,
      messageCount: summary?.messageCount ?? localList?.length,
      blueprintCount,
      verifiedCount,
      previewText: summary?.latestMessagePreview?.text,
    };
  }
  return out;
}

const timeFormatters = new Map<DeskLanguage, Intl.DateTimeFormat>();
const dateTimeFormatters = new Map<DeskLanguage, Intl.DateTimeFormat>();
const dateFormatters = new Map<DeskLanguage, Intl.DateTimeFormat>();

function getTimeFormatter(lang: DeskLanguage): Intl.DateTimeFormat {
  let fmt = timeFormatters.get(lang);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' });
    timeFormatters.set(lang, fmt);
  }
  return fmt;
}

function getDateTimeFormatter(lang: DeskLanguage): Intl.DateTimeFormat {
  let fmt = dateTimeFormatters.get(lang);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(lang, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    dateTimeFormatters.set(lang, fmt);
  }
  return fmt;
}

function getDateFormatter(lang: DeskLanguage): Intl.DateTimeFormat {
  let fmt = dateFormatters.get(lang);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(lang);
    dateFormatters.set(lang, fmt);
  }
  return fmt;
}

export function formatMallTime(iso: string, lang: DeskLanguage): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return iso;
  return getTimeFormatter(lang).format(ts);
}

export function formatMallDateTime(iso: string, lang: DeskLanguage): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return iso;
  return getDateTimeFormatter(lang).format(ts);
}

export function formatMallDate(iso: string, lang: DeskLanguage): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return iso;
  return getDateFormatter(lang).format(ts);
}
