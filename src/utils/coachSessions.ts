import type { ChatMessage, ChatSessionRecord } from '../types/ghr';

export const DEFAULT_SESSION_TITLE = 'แชทวางแผนเทรดใหม่';
const MAX_TITLE_LEN = 46;

export function createChatSession(opts?: {
  id?: string;
  title?: string;
  activePortId?: string;
  welcomeMessage?: ChatMessage;
  mode?: 'text' | 'voice' | 'live';
  nowIso?: string;
}): ChatSessionRecord {
  const nowIso = opts?.nowIso || new Date().toISOString();
  const id =
    opts?.id || `CS-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const messages = opts?.welcomeMessage ? [opts.welcomeMessage] : [];
  return {
    id,
    title: opts?.title?.trim() || deriveSessionTitle(messages, DEFAULT_SESSION_TITLE),
    createdAt: nowIso,
    updatedAt: nowIso,
    pinned: false,
    activePortId: opts?.activePortId,
    mode: opts?.mode || 'text',
    messages,
  };
}

export function deriveSessionTitle(
  messages: ChatMessage[],
  fallback = DEFAULT_SESSION_TITLE,
): string {
  const firstUser = messages.find((m) => m.role === 'user' && m.text.trim().length > 0);
  if (!firstUser) return fallback;
  const cleaned = firstUser.text
    .replace(/^\/(?:plan|chart|12gate|risk|search|journal|voice|live|new)\b\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const effective = cleaned || firstUser.text.replace(/\s+/g, ' ').trim();
  if (!effective) return fallback;
  return effective.length > MAX_TITLE_LEN
    ? `${effective.slice(0, MAX_TITLE_LEN - 1)}…`
    : effective;
}

export function sortSessionsByRecent(
  sessions: ChatSessionRecord[],
): ChatSessionRecord[] {
  return [...sessions].sort((a, b) => {
    const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
    if (pinDiff !== 0) return pinDiff;
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  });
}

export function upsertSession(
  sessions: ChatSessionRecord[],
  session: ChatSessionRecord,
  maxSessions = 40,
): ChatSessionRecord[] {
  const idx = sessions.findIndex((s) => s.id === session.id);
  const next = idx >= 0
    ? sessions.map((s) => (s.id === session.id ? session : s))
    : [session, ...sessions];
  const sorted = sortSessionsByRecent(next);
  if (sorted.length <= maxSessions) return sorted;
  const pinned = sorted.filter((s) => s.pinned);
  const unpinned = sorted.filter((s) => !s.pinned);
  return [...pinned, ...unpinned].slice(0, maxSessions);
}

export function deleteSessionById(
  sessions: ChatSessionRecord[],
  id: string,
): ChatSessionRecord[] {
  return sessions.filter((s) => s.id !== id);
}

export function togglePinSession(
  sessions: ChatSessionRecord[],
  id: string,
): ChatSessionRecord[] {
  return sortSessionsByRecent(
    sessions.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s)),
  );
}

export function renameSession(
  sessions: ChatSessionRecord[],
  id: string,
  title: string,
): ChatSessionRecord[] {
  const clean = title.replace(/\s+/g, ' ').trim().slice(0, 64);
  if (!clean) return sessions;
  return sessions.map((s) => (s.id === id ? { ...s, title: clean } : s));
}

export function filterSessions(
  sessions: ChatSessionRecord[],
  query: string,
): ChatSessionRecord[] {
  const q = query.trim().toLowerCase();
  const sorted = sortSessionsByRecent(sessions);
  if (!q) return sorted;
  return sorted.filter((s) => {
    if (s.title.toLowerCase().includes(q)) return true;
    return s.messages.some((m) => m.text.toLowerCase().includes(q));
  });
}

export function getMostRecentOtherSession(
  sessions: ChatSessionRecord[],
  activeSessionId: string,
): ChatSessionRecord | null {
  const others = sessions
    .filter((s) => s.id !== activeSessionId)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return others[0] ?? null;
}

export function migrateLegacyChatMessages(
  legacyMessages?: ChatMessage[],
  activePortId?: string,
): ChatSessionRecord[] {
  const cleanMessages = Array.isArray(legacyMessages)
    ? legacyMessages.filter((m) => m && typeof m.text === 'string' && m.text.trim().length > 0)
    : [];
  if (cleanMessages.length === 0) {
    return [createChatSession({ activePortId })];
  }
  const hasUserMsg = cleanMessages.some((m) => m.role === 'user');
  const title = hasUserMsg
    ? deriveSessionTitle(cleanMessages, DEFAULT_SESSION_TITLE)
    : 'AI Live Desk · Session หลัก';
  return [
    createChatSession({
      id: 'CS-PRIMARY',
      title,
      activePortId,
      welcomeMessage: undefined,
    }),
  ].map((s) => ({
    ...s,
    messages: cleanMessages,
    lastModel: cleanMessages[cleanMessages.length - 1]?.model,
  }));
}
