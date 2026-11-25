import type { OpenPosition, TradeExecution } from '../../server/fundednext/brokerTypes';
import type { AccountSyncStatus, ConnectionStatus, PilotAccount, StoredSnapshot } from '../../server/fundednext/store';
import type { AccountInfo, Mt5PositionRecord, Mt5TimeOffsetSetting, TradeRecord } from '../types/ghr';
import { normalizeFundedNextTrades } from './fundedNextMcp';
import { normalizeBridgePositionsToMt5Records, resolveAccountType } from './ghrRules';
import { LIVE_TELEMETRY_POLL_MS } from './liveTelemetryBuffer';
export { LIVE_TELEMETRY_POLL_MS };

export const FUNDEDNEXT_PILOT_SOURCE = 'FundedNext Official MCP (Pilot Server-Managed)';
export const FUNDEDNEXT_POLL_MS = 15_000;
const popupType = 'TALLYNX_FN_PILOT_OAUTH_RESULT';
const popupChannel = 'tallynx_fn_pilot_oauth';

export type PilotTokenGetter = () => Promise<string | null>;
export type PilotAccountChoice = Pick<PilotAccount, 'id' | 'accountId' | 'login' | 'connectionId' | 'tracked'>;
export interface PilotLiveTelemetry {
  balance: number | null;
  equity: number | null;
  floatingPnl: number | null;
  margin: number | null;
  freeMargin: number | null;
  marginLevelPct: number | null;
  dailyLossUsedUsd: number | null;
  dailyLossLimitUsd: number | null;
  consistencyLiveImpactPct: number | null;
  openPositionsCount: number;
  openPositions: OpenPosition[];
  rateFloorMs: number;
  nextSafeSyncAt: string | null;
  syncTriggered: boolean;
}

export type PilotExecutions = { executions: TradeExecution[]; nextCursor: string | null };
export type PilotRead = PilotExecutions & {
  snapshot: StoredSnapshot | null;
  syncStatus: AccountSyncStatus;
  hasMoreExecutions: boolean;
  liveTelemetry?: PilotLiveTelemetry | null;
};
export type PilotReadState = { data: PilotRead | null; error: string | null; reconnect: boolean };
export type PilotPortStats = { balance: number; profit?: number; currency?: string | null };
type PilotAccounts = { accounts: PilotAccountChoice[]; connectionStatus?: ConnectionStatus };
type Connected = { connectionId: string; status: 'CONNECTED' };
export type PilotPortChange =
  | { type: 'select'; portId: string; account: PilotAccountChoice; createNewPort?: boolean }
  | { type: 'discover'; accounts: PilotAccountChoice[] }
  | { type: 'autoSync'; portId: string; enabled: boolean }
  | { type: 'stop'; connectionId?: string; accountId?: string };

export class FundedNextPilotError extends Error {
  constructor(message: string, readonly httpStatus: number, readonly reconnect: boolean, readonly syncStatus?: AccountSyncStatus) {
    super(message);
  }
}

export const isPilotReconnect = (error: unknown) => error instanceof FundedNextPilotError && error.reconnect;
export const isPilotReconnectStatus = (status: unknown) => typeof status === 'string' && status.toLowerCase() === 'reconnect_required';
export const canFallbackToUsdWorkspace = (currency: string | null | undefined) => !currency || currency === 'USD';

export type PilotTelemetryView = Partial<
  Pick<
    StoredSnapshot,
    | 'balance'
    | 'equity'
    | 'floatingPnl'
    | 'netProfit'
    | 'initialBalance'
    | 'currency'
    | 'fetchedAt'
    | 'lastCheckedAt'
    | 'status'
    | 'blockedReason'
    | 'rawPayload'
  >
> & {
  openPositions?: StoredSnapshot['openPositions'];
  margin?: number | null;
  freeMargin?: number | null;
  marginLevelPct?: number | null;
  dailyLossUsedUsd?: number | null;
  dailyLossLimitUsd?: number | null;
  consistencyLiveImpactPct?: number | null;
};

export interface ReadPilotAccountOptions {
  previous?: PilotRead | null;
  forceExecutions?: boolean;
  live?: boolean;
}

export interface LiveBridgeTelemetryPosition {
  ticket: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  lots: number;
  openPrice: number;
  currentPrice: number | null;
  slPrice: number | null;
  tpPrice: number | null;
  floatingPnl: number;
  swap: number;
  commission: number;
  openTime: string | number | null;
  comment?: string;
}

export interface LiveBridgeTelemetryResponse {
  ok: boolean;
  provider: 'LIVE_BRIDGE';
  syncedAt: string;
  meta: {
    holderName: string;
    login: string;
    broker: string;
    server: string;
    currency: string;
    initialDeposit: number;
    summaryNetProfit: number | null;
  };
  live: {
    balance: number | null;
    equity: number | null;
    floatingPnl: number | null;
    margin: number | null;
    freeMargin: number | null;
    marginLevelPct: number | null;
    dailyLossUsedUsd: number | null;
    dailyLossLimitUsd: number | null;
    openPositions: LiveBridgeTelemetryPosition[];
  };
  openPositions: LiveBridgeTelemetryPosition[];
  positionsCount: number;
}

export function isTelemetryTabVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

const inFlightTelemetryRequests = new Map<string, Promise<unknown>>();

function awaitWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      value => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      err => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      }
    );
  });
}

/**
 * Deduplicates concurrent in-flight requests under the same key so 3-second polling
 * never queues overlapping HTTP fetches if an upstream response takes > 3s.
 */
export function runDeduplicatedTelemetryRequest<T>(
  key: string,
  work: () => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  let shared = inFlightTelemetryRequests.get(key) as Promise<T> | undefined;
  if (!shared) {
    shared = work().finally(() => {
      if (inFlightTelemetryRequests.get(key) === shared) {
        inFlightTelemetryRequests.delete(key);
      }
    });
    inFlightTelemetryRequests.set(key, shared);
  }
  return awaitWithAbort(shared, signal);
}

/**
 * Checks whether an account's 3-second live telemetry request is already in flight.
 */
export function hasInFlightTelemetryRequest(key: string): boolean {
  return inFlightTelemetryRequests.has(key);
}

const PILOT_SNAP_CACHE_PREFIX = 'tallynx_pilot_snap_v1';
const pilotCacheKey = (uid: string, portId: string, accountId: string) =>
  `${PILOT_SNAP_CACHE_PREFIX}:${uid}:${portId}:${accountId}`;

export function loadCachedPilotSnapshot(
  uid: string | null | undefined,
  portId: string,
  accountId: string | undefined
): PilotTelemetryView | null {
  if (typeof window === 'undefined' || !uid || !portId || !accountId) return null;
  try {
    const raw = window.localStorage.getItem(pilotCacheKey(uid, portId, accountId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      balance: typeof parsed.balance === 'string' ? parsed.balance : null,
      equity: typeof parsed.equity === 'string' ? parsed.equity : null,
      netProfit: typeof parsed.netProfit === 'string' ? parsed.netProfit : null,
      initialBalance: typeof parsed.initialBalance === 'string' ? parsed.initialBalance : null,
      currency: typeof parsed.currency === 'string' ? parsed.currency : null,
      fetchedAt: typeof parsed.fetchedAt === 'string' ? parsed.fetchedAt : undefined,
      lastCheckedAt: typeof parsed.lastCheckedAt === 'string' ? parsed.lastCheckedAt : undefined,
    };
  } catch {
    return null;
  }
}

export function saveCachedPilotSnapshot(
  uid: string,
  portId: string,
  accountId: string,
  snapshot: StoredSnapshot | null | undefined
): void {
  if (typeof window === 'undefined' || !uid || !portId || !accountId || !snapshot) return;
  try {
    window.localStorage.setItem(
      pilotCacheKey(uid, portId, accountId),
      JSON.stringify({
        balance: snapshot.balance ?? null,
        equity: snapshot.equity ?? null,
        netProfit: snapshot.netProfit ?? null,
        initialBalance: snapshot.initialBalance ?? null,
        currency: snapshot.currency ?? null,
        fetchedAt: snapshot.fetchedAt,
        lastCheckedAt: snapshot.lastCheckedAt,
      })
    );
  } catch {
    // ignore storage quota errors
  }
}

export function formatPilotAmount(value: string | number | null | undefined, currency: string | null | undefined, plus = false) {
  if (value == null) return '—';
  const trimmed = typeof value === 'number' ? `${plus && value > 0 ? '+' : ''}${value.toFixed(2)}` : value.trim();
  const match = trimmed.match(/^([+-]?\d+)(\.\d+)?$/);
  const formatted = match
    ? `${match[1].replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${match[2] ?? ''}`
    : trimmed;
  return `${formatted}${currency ? ` ${currency}` : ''}`;
}

export async function requestFundedNext<T>(getToken: PilotTokenGetter, path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error('กรุณาเข้าสู่ระบบ Desk เพื่อใช้ FundedNext Pilot');
  return fetchPilot<T>(token, path, init);
}

async function fetchPilot<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/fundednext${path}`, {
    ...init,
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(init?.body && { 'Content-Type': 'application/json' }) },
  });
  const body = await response.json().catch(() => null);
  const reconnect = [body?.code, body?.status, body?.snapshot?.status].some(isPilotReconnectStatus);
  if (!response.ok || reconnect || !body) {
    const error = typeof body?.error === 'string' ? body.error : `FundedNext Pilot (HTTP ${response.status})`;
    throw new FundedNextPilotError(error, response.status, reconnect, body?.syncStatus);
  }
  return body as T;
}

export function listPilotAccounts(getToken: PilotTokenGetter, connectionId?: string, signal?: AbortSignal) {
  const query = connectionId ? `?connectionId=${encodeURIComponent(connectionId)}` : '';
  return requestFundedNext<PilotAccounts>(getToken, `/accounts${query}`, { signal });
}

export async function readPilotAccount(
  getToken: PilotTokenGetter,
  id: string,
  signal: AbortSignal,
  options?: ReadPilotAccountOptions
): Promise<PilotRead> {
  const isLive = options?.live === true;
  const dedupeKey = `fn-pilot:${id}:${isLive ? 'live' : 'std'}`;
  return runDeduplicatedTelemetryRequest(
    dedupeKey,
    async () => {
      const token = await getToken();
      if (!token) throw new Error('กรุณาเข้าสู่ระบบ Desk เพื่อใช้ FundedNext Pilot');
      const path = `/accounts/${encodeURIComponent(id)}`;
      const snapshotQuery = isLive ? `${path}/snapshot?live=1` : `${path}/snapshot`;
      const fetchSnapshot = async (): Promise<
        Pick<PilotRead, 'snapshot' | 'syncStatus' | 'liveTelemetry'>
      > => {
        try {
          return await fetchPilot<Pick<PilotRead, 'snapshot' | 'syncStatus' | 'liveTelemetry'>>(token, snapshotQuery, {
            signal,
          });
        } catch (error) {
          if (error instanceof FundedNextPilotError && error.httpStatus === 404 && error.syncStatus) {
            return { snapshot: null, syncStatus: error.syncStatus, liveTelemetry: null };
          }
          throw error;
        }
      };
      const fetchAllExecutions = async (): Promise<PilotExecutions> => {
        const all: TradeExecution[] = [];
        const seen = new Set<string>();
        let cursor: string | undefined;
        for (let pageIndex = 0; pageIndex < 25; pageIndex++) {
          const qs = new URLSearchParams({ limit: '200' });
          if (cursor) qs.set('cursor', cursor);
          const page = await fetchPilot<PilotExecutions>(token, `${path}/executions?${qs.toString()}`, { signal });
          for (const row of page.executions) {
            if (!seen.has(row.id)) {
              seen.add(row.id);
              all.push(row);
            }
          }
          if (!page.nextCursor || page.nextCursor === cursor) {
            return { executions: all, nextCursor: page.nextCursor ?? null };
          }
          cursor = page.nextCursor;
        }
        return { executions: all, nextCursor: cursor ?? null };
      };
      const prev = options?.previous ?? null;
      if (prev && !options?.forceExecutions && prev.executions.length > 0 && !prev.hasMoreExecutions) {
        const evidence = await fetchSnapshot();
        const snap = evidence.snapshot;
        const prevSnap = prev.snapshot;
        const snapshotChanged =
          !snap ||
          !prevSnap ||
          snap.fetchedAt !== prevSnap.fetchedAt ||
          snap.digest !== prevSnap.digest ||
          snap.balance !== prevSnap.balance ||
          snap.netProfit !== prevSnap.netProfit ||
          snap.initialBalance !== prevSnap.initialBalance ||
          snap.currency !== prevSnap.currency;
        const activeSync = evidence.syncStatus === 'SYNCING' || evidence.syncStatus === 'PARTIAL';
        if (!snapshotChanged && !activeSync) {
          return {
            ...evidence,
            executions: prev.executions,
            nextCursor: prev.nextCursor,
            hasMoreExecutions: prev.hasMoreExecutions,
          };
        }
        const execs = await fetchAllExecutions();
        return { ...evidence, ...execs, hasMoreExecutions: execs.nextCursor !== null };
      }
      const [snapshot, executions] = await Promise.allSettled([
        fetchSnapshot(),
        fetchAllExecutions(),
      ]);
      if (snapshot.status === 'rejected') throw snapshot.reason;
      if (executions.status === 'rejected') throw executions.reason;
      return { ...snapshot.value, ...executions.value, hasMoreExecutions: executions.value.nextCursor !== null };
    },
    signal
  );
}

export async function readPilotLiveSnapshot(
  getToken: PilotTokenGetter,
  id: string,
  signal: AbortSignal,
  options?: { previous?: PilotRead | null; requireVisible?: boolean }
): Promise<PilotRead | null> {
  if (options?.requireVisible !== false && !isTelemetryTabVisible()) {
    return null;
  }
  return readPilotAccount(getToken, id, signal, {
    previous: options?.previous,
    live: true,
  });
}

export async function readLiveBridgeTelemetry(
  params: { tredynApiKey: string; idToken?: string | null; requireVisible?: boolean },
  signal?: AbortSignal
): Promise<LiveBridgeTelemetryResponse | null> {
  if (params.requireVisible !== false && !isTelemetryTabVisible()) {
    return null;
  }
  const apiKey = params.tredynApiKey.trim();
  if (!apiKey) {
    throw new Error('Missing tredyn-api-key for Live Bridge telemetry');
  }
  return runDeduplicatedTelemetryRequest(
    `live-bridge:${apiKey}`,
    async () => {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'X-Tredyn-Api-Key': apiKey,
      };
      if (params.idToken) {
        headers.Authorization = `Bearer ${params.idToken}`;
      }
      const response = await fetch('/api/mt5/live-bridge/live', {
        method: 'GET',
        headers,
        signal,
      });
      const body = (await response.json().catch(() => null)) as
        | (LiveBridgeTelemetryResponse & { error?: string; code?: string })
        | null;
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error || `Live Bridge telemetry (HTTP ${response.status})`);
      }
      return body;
    },
    signal
  );
}

export function convertPilotExecutionsToPositions(
  executions: TradeExecution[],
  mt5TimeOffset: Mt5TimeOffsetSetting = 'AUTO_MT5'
): Mt5PositionRecord[] {
  if (!Array.isArray(executions) || executions.length === 0) return [];
  const uniqueExecutions = new Map(executions.map(exec => [exec.id, exec]));
  const trades = [...uniqueExecutions.values()].filter(exec => exec.kind === 'TRADE');
  const cyclesByDeal = new Map<string, Set<string | null>>();
  for (const { dealId, cycleId } of trades) {
    if (!dealId) continue;
    const cycles = cyclesByDeal.get(dealId) ?? new Set<string | null>();
    cycles.add(cycleId);
    cyclesByDeal.set(dealId, cycles);
  }
  const usedTickets = new Set<string>();
  const rawTrades = trades.map((exec) => {
    const payload = exec.rawPayload && typeof exec.rawPayload === 'object' ? exec.rawPayload : {};
    const baseTicket = String(exec.dealId || payload.ticket || exec.id).trim() || exec.id;
    const preferredTicket = (cyclesByDeal.get(exec.dealId)?.size ?? 0) > 1
      ? `${baseTicket}_${exec.cycleId ?? ''}`
      : baseTicket;
    let ticket = preferredTicket;
    for (let suffix = 2; usedTickets.has(ticket); suffix++) {
      ticket = `${preferredTicket}_${suffix}`;
    }
    usedTickets.add(ticket);
    return {
      ...payload,
      ticket,
      symbol: exec.symbol ?? payload.symbol,
      type: exec.side ?? payload.type_str ?? payload.type,
      volume: exec.volume ?? payload.volume,
      lots: exec.volume ?? payload.lots,
      open_price: exec.openPrice ?? payload.open_price,
      close_price: exec.closePrice ?? payload.close_price,
      profit: exec.grossPnl ?? payload.profit,
      commission: exec.commission ?? payload.commission ?? 0,
      swap: exec.swap ?? payload.swap ?? 0,
      ...(exec.netPnl != null ? { net_pnl: exec.netPnl } : {}),
      ...(exec.openedAt ? { openTime: exec.openedAt } : {}),
      ...(exec.closedAt ? { closeTime: exec.closedAt } : {}),
    };
  });
  if (rawTrades.length === 0) return [];
  const normalized = normalizeFundedNextTrades({ trades: rawTrades });
  const { positions } = normalizeBridgePositionsToMt5Records(normalized, undefined, mt5TimeOffset);
  return positions;
}

export function planPilotPortAssignments(
  accounts: Record<string, AccountInfo>,
  discoveredAccounts: PilotAccountChoice[]
): { nextAccounts: Record<string, AccountInfo>; addedPortIds: string[]; changed: boolean } {
  const tracked = discoveredAccounts.filter((item) => item.tracked);
  if (tracked.length === 0) {
    return { nextAccounts: accounts, addedPortIds: [], changed: false };
  }
  const nextAccounts: Record<string, AccountInfo> = { ...accounts };
  const addedPortIds: string[] = [];
  let changed = false;

  for (const item of tracked) {
    const loginStr = (item.login || item.accountId || '').trim();
    const ports = Object.entries(nextAccounts);
    const match = ports.find(([, acc]) => acc.fundedNextAccountId === item.id) ??
      ports.find(([, acc]) =>
        loginStr !== '' && acc.login?.trim() === loginStr && !acc.fundedNextAccountId &&
        resolveAccountType(acc) !== 'PERSONAL' &&
        (!acc.syncProvider || acc.syncProvider === 'FUNDEDNEXT_MCP' || acc.syncProvider === 'MANUAL_XLSX')
      );

    if (match) {
      const [matchedPid, existing] = match;
      const needsUpdate =
        existing.syncProvider !== 'FUNDEDNEXT_MCP' ||
        existing.fundedNextConnectionId !== item.connectionId ||
        existing.fundedNextAccountId !== item.id ||
        (loginStr && existing.login?.trim() !== loginStr);
      if (needsUpdate) {
        nextAccounts[matchedPid] = {
          ...existing,
          syncProvider: 'FUNDEDNEXT_MCP',
          fundedNextConnectionId: item.connectionId,
          fundedNextAccountId: item.id,
          login: loginStr || existing.login,
          brokerName: existing.brokerName || 'FundedNext Official MCP',
          autoSyncRealtime: existing.autoSyncRealtime ?? true,
        };
        changed = true;
      }
      continue;
    }

    const sanitizedAccountId = (item.accountId || item.id).replace(/[^a-zA-Z0-9_-]/g, '');
    let newPid = `fn_${sanitizedAccountId || 'port'}`;
    let suffix = 2;
    while (nextAccounts[newPid]) {
      newPid = `fn_${sanitizedAccountId}_${suffix++}`;
    }
    nextAccounts[newPid] = {
      id: newPid,
      accountType: 'PROP',
      name: `FundedNext #${loginStr || item.accountId}`,
      login: loginStr || item.accountId,
      brokerName: 'FundedNext Official MCP',
      brokerServer: 'XAUUSD-Live',
      initial: 6000,
      targetProfit: 480,
      minDays: 5,
      defaultRisk: 120,
      consistencyCapPct: 40,
      profitSplitPct: 90,
      feeRefundUsd: 59,
      syncProvider: 'FUNDEDNEXT_MCP',
      fundedNextConnectionId: item.connectionId,
      fundedNextAccountId: item.id,
      autoSyncRealtime: true,
    };
    addedPortIds.push(newPid);
    changed = true;
  }

  return { nextAccounts, addedPortIds, changed };
}

export async function connectFundedNextPilot(getToken: PilotTokenGetter, connectionId: string | undefined, signal: AbortSignal) {
  const popup = window.open('', '_blank', 'popup,width=540,height=700');
  if (!popup) throw new Error('กรุณาอนุญาตหน้าต่างป๊อปอัปสำหรับ FundedNext');
  const run = async () => {
    let expectedConnectionId = connectionId;
    let authorizeUrl: string;
    try {
      ({ authorizeUrl } = await requestFundedNext<{ authorizeUrl: string }>(getToken, '/connections', {
        method: 'POST', body: JSON.stringify(expectedConnectionId ? { connectionId: expectedConnectionId } : {}), signal,
      }));
    } catch (error) {
      if (!(error instanceof FundedNextPilotError) || error.httpStatus !== 404 || !expectedConnectionId) {
        throw error;
      }
      expectedConnectionId = undefined;
      ({ authorizeUrl } = await requestFundedNext<{ authorizeUrl: string }>(getToken, '/connections', {
        method: 'POST', body: JSON.stringify({}), signal,
      }));
    }
    const destination = new URL(authorizeUrl);
    const redirect = destination.searchParams.get('redirect_uri');
    if (destination.protocol !== 'https:' || !redirect || new URL(redirect).origin !== window.location.origin) {
      throw new Error('FundedNext OAuth callback is configured for a different Desk origin');
    }
    signal.throwIfAborted();
    const result = await new Promise<Connected>((resolve, reject) => {
      let channel: BroadcastChannel | undefined;
      try { channel = new BroadcastChannel(popupChannel); } catch { /* Use the opener when unavailable. */ }
      const timer = window.setTimeout(() => finish(new Error('หมดเวลารอ FundedNext กรุณาเชื่อมต่อใหม่')), 600_000);
      const abort = () => finish(signal.reason);
      function finish(error: Error | null, connected?: Connected) {
        window.clearTimeout(timer);
        window.removeEventListener('message', fromOpener);
        signal.removeEventListener('abort', abort);
        channel?.close();
        if (connected) resolve(connected);
        else reject(error);
      }
      function receive(data: Record<string, unknown> | null) {
        if (!data || data.type !== popupType) return;
        if (data.ok === false) {
          finish(new Error(typeof data.error === 'string' ? data.error : 'เชื่อมต่อ FundedNext ไม่สำเร็จ'));
        } else if (data.ok === true && data.status === 'CONNECTED' && typeof data.connectionId === 'string' &&
          /^[\w-]{1,128}$/.test(data.connectionId) && (!expectedConnectionId || data.connectionId === expectedConnectionId)) {
          finish(null, { connectionId: data.connectionId, status: data.status });
        }
      }
      function fromOpener(event: MessageEvent) {
        if (event.origin === window.location.origin && event.source === popup) receive(event.data);
      }
      window.addEventListener('message', fromOpener);
      signal.addEventListener('abort', abort, { once: true });
      // A browser that isolates the provider popup can sever the opener and mark its handle closed.
      if (channel) channel.onmessage = event => { if (popup.closed) receive(event.data); };
      try { popup.location.replace(destination.toString()); }
      catch { finish(new Error('ไม่สามารถเปิดหน้าล็อกอิน FundedNext ได้')); }
    });
    const { connectionStatus } = await listPilotAccounts(getToken, result.connectionId, signal);
    if (!connectionStatus || connectionStatus === 'DISCONNECTED') {
      throw new Error('ไม่สามารถยืนยันการเชื่อมต่อ FundedNext ได้');
    }
    return result;
  };
  try {
    if (!navigator.locks) return await run();
    return await navigator.locks.request(popupChannel, { ifAvailable: true }, lock => {
      if (!lock) throw new Error('มีหน้าต่างเชื่อมต่อ FundedNext เปิดอยู่แล้ว');
      return run();
    });
  } finally {
    popup.close();
  }
}

export async function migratePilotJournal(getToken: PilotTokenGetter, portId: string, rows: TradeRecord[], signal: AbortSignal) {
  const sorted = rows.filter(row => row.port === portId).sort((a, b) => a.id.localeCompare(b.id));
  const summary = { imported: 0, unlinked: 0 };
  for (let start = 0; start < sorted.length; start += 200) {
    const batch = sorted.slice(start, start + 200);
    const orderedRows = batch.map(row => Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))));
    const bytes = new TextEncoder().encode(JSON.stringify([portId, orderedRows]));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const importId = 'desk-journal-v1:' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const result = await requestFundedNext<typeof summary>(getToken, '/journal-imports', {
      method: 'POST', body: JSON.stringify({ importId, rows: batch }), signal,
    });
    summary.imported += result.imported;
    summary.unlinked += result.unlinked;
  }
  return summary;
}
