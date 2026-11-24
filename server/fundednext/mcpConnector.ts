import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { extractMcpToolPayload } from '../../src/utils/fundedNextMcp.js';
import type { AccountSnapshot, BrokerAccount, HistoryCursor, HistoryPage, OpenPosition, RawRow, TradeExecution } from './brokerTypes.js';
import { computeNetExecutionPnl, subDecimals, toDecimalString } from './decimalMath.js';

export const VERIFIED_READ_TOOLS = Object.freeze([
  'get_accounts', 'get_accounts_v2', 'get_account_overview', 'get_account_cycles',
  'get_cycle_trading_history', 'get_trading_history', 'get_running_trades',
] as const);
export type ReadTool = typeof VERIFIED_READ_TOOLS[number];
export type CallReadTool = (tool: ReadTool, args: RawRow) => Promise<unknown>;

export class McpReadError extends Error {
  constructor(readonly status?: number, readonly retryAfter?: string | null) {
    super('FundedNext MCP read failed');
  }
}

export class McpStreamableClient {
  private readonly client = new Client({ name: 'Tredyn Desk', version: '1.0.0' });
  private readonly transport: StreamableHTTPClientTransport;
  private connecting?: Promise<void>;
  private failure?: McpReadError;

  constructor(endpoint: string, accessToken: string, request: typeof fetch = fetch) {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid FundedNext MCP endpoint');
    this.transport = new StreamableHTTPClientTransport(url, {
      requestInit: { headers: { Authorization: 'Bearer ' + accessToken }, redirect: 'error' },
      fetch: async (input, init) => {
        const timeout = AbortSignal.timeout(12_000);
        const response = await request(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
        if ((!init?.method || init.method === 'POST') && !response.ok) {
          this.failure = new McpReadError(response.status, response.headers.get('Retry-After'));
        }
        return response;
      },
    });
  }

  async callTool(tool: string, args: RawRow = {}): Promise<unknown> {
    if (!VERIFIED_READ_TOOLS.some(allowed => allowed === tool)) throw new Error('FundedNext MCP tool is outside the read allowlist');
    this.failure = undefined;
    try {
      this.connecting ??= this.client.connect(this.transport, { timeout: 12_000 });
      await this.connecting;
      const result = await this.client.callTool({ name: tool, arguments: args }, undefined, { timeout: 12_000 });
      if (result.isError) throw new McpReadError();
      const payload = extractMcpToolPayload(result);
      if (payload === null) throw new McpReadError();
      return payload;
    } catch {
      throw this.failure ?? new McpReadError();
    }
  }

  async close() {
    try {
      if (this.transport.sessionId) await this.transport.terminateSession();
    } finally {
      await this.client.close();
    }
  }
}

function row(value: unknown): RawRow | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RawRow : null;
}

function text(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  return typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : null;
}

function evidencePayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(evidencePayload);
  const object = row(value);
  if (!object) return value;
  return Object.fromEntries(Object.keys(object).sort()
    .filter(key => !/^(?:authorization|access[_-]?token|refresh[_-]?token|client[_-]?secret|code[_-]?verifier|password|investor[_-]?password)$/i.test(key))
    .map(key => [key, evidencePayload(object[key])]));
}

function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function direction(value: unknown): OpenPosition['side'] {
  const label = row(value);
  const side = text(label ? label.label ?? label.name ?? label.value : value)?.toLowerCase();
  if (side && ['buy', 'long', '0', 'op_buy'].includes(side)) return 'BUY';
  if (side && ['sell', 'short', '1', 'op_sell'].includes(side)) return 'SELL';
  return null;
}

function lots(raw: RawRow) {
  if (typeof raw.lots === 'string') {
    if (!/^\+?(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw.lots.trim())) return null;
  } else if (typeof raw.lots !== 'number' || !Number.isFinite(raw.lots) || raw.lots <= 0) {
    return null;
  }
  const volume = toDecimalString(raw.lots);
  return volume !== '0' ? volume : null;
}

function timestamp(value: unknown) {
  const raw = typeof value === 'string' && value.trim() ? value : null;
  const input = raw?.trim();
  const zone = input?.match(/(Z|GMT|[+-]\d{2}:\d{2})$/i)?.[0] ?? null;
  if (!input || !zone) return { raw, utc: null, zone };
  const normalized = input
    .replace(/^(\d{4}-\d{2}-\d{2})\s+/, '$1T')
    .replace(/\s*(?:GMT|Z)$/i, 'Z')
    .replace(/\s+([+-]\d{2}:\d{2})$/, '$1');
  const ms = Date.parse(normalized);
  return { raw, utc: Number.isFinite(ms) ? new Date(ms).toISOString() : null, zone };
}

function evidence(accountId: string, raw: RawRow, time: ReturnType<typeof timestamp>) {
  return {
    accountId, rawPayload: evidencePayload(raw) as RawRow,
    sourceTimestampRaw: time.raw, sourceTimestampUtc: time.utc, sourceTimezone: time.zone,
    missingFields: [] as string[], unverifiedFields: [] as string[],
  };
}

function cashflowKind(raw: RawRow): TradeExecution['kind'] {
  for (const value of [raw.kind, raw.type]) {
    const label = row(value);
    const kind = text(label ? label.label ?? label.name ?? label.value : value)?.replace(/_/g, ' ');
    if (!kind) continue;
    if (/\bdeposit\b/i.test(kind)) return 'DEPOSIT';
    if (/\bwithdrawal\b/i.test(kind)) return 'WITHDRAWAL';
    if (/\b(?:credit|balance|payout)\b/i.test(kind)) return 'OTHER_CASHFLOW';
  }
  return 'TRADE';
}

export function normalizeExecution(accountId: string, raw: RawRow, fetchedAt: string, cycleContext?: string): TradeExecution {
  const opened = timestamp(raw.open_time_str);
  const closed = timestamp(raw.close_time_str);
  const kind = cashflowKind(raw);
  const base = evidence(accountId, raw, closed.raw === null ? opened : closed);
  const volume = kind === 'TRADE' ? lots(raw) : null;
  if (kind === 'TRADE') {
    if (volume === null) base.unverifiedFields.push('volume');
    if (opened.utc === null) base.unverifiedFields.push('openedAt');
    if (closed.utc === null) base.unverifiedFields.push('closedAt');
  }
  const dealId = text(raw.deal_id ?? raw.dealId ?? raw.ticket ?? raw.id);
  if (dealId === null) base.missingFields.push('dealId');
  const cycleId = text(raw.cycle_id ?? raw.cycleId) ?? cycleContext ?? null;
  const grossPnl = kind === 'TRADE' ? toDecimalString(raw.grossPnl ?? raw.gross_pnl ?? raw.profit) : null;
  const commission = raw.commission == null ? '0' : toDecimalString(raw.commission);
  const swap = raw.swap == null ? '0' : toDecimalString(raw.swap);
  const rawFee = raw.fee ?? raw.fees;
  const fee = rawFee == null ? '0' : toDecimalString(rawFee);
  const execution = {
    ...base, dealId: dealId ?? '', cycleId, kind, volume, grossPnl, commission, swap, fee,
    symbol: text(raw.symbol),
    side: kind === 'TRADE' ? direction(raw.side ?? raw.type_str ?? raw.type) : null,
    risk: toDecimalString(raw.risk),
    openPrice: toDecimalString(raw.open_price ?? raw.openPrice),
    closePrice: toDecimalString(raw.close_price ?? raw.closePrice),
    openedAt: opened.utc, closedAt: closed.utc,
    netPnl: computeNetExecutionPnl({ kind, grossPnl, commission, swap, fee, reportedNet: raw.net_pnl ?? raw.netPnl ?? raw.net_profit }),
    cashflowAmount: kind === 'TRADE' ? null : toDecimalString(raw.cashflowAmount ?? raw.cashflow_amount ?? raw.amount ?? raw.profit),
  };
  const id = cycleId ? [accountId, cycleId, execution.dealId].join('_') : [accountId, execution.dealId].join('_');
  return { ...execution, id, fetchedAt, digest: digest(execution), revision: 1 };
}

export function reconcileTrade(existing: TradeExecution, incoming: TradeExecution): TradeExecution {
  return existing.digest === incoming.digest ? existing : { ...incoming, revision: existing.revision + 1 };
}

export function normalizeOpenPosition(accountId: string, raw: RawRow, fetchedAt: string): OpenPosition {
  const opened = timestamp(raw.open_time_str);
  const base = evidence(accountId, raw, opened);
  const volume = lots(raw);
  if (volume === null) base.unverifiedFields.push('volume');
  if (opened.utc === null) base.unverifiedFields.push('openedAt');
  const id = text(raw.position_id ?? raw.positionId ?? raw.ticket ?? raw.id ?? raw.deal_id);
  if (id === null) base.missingFields.push('id');
  return {
    ...base, id: id ?? digest(base.rawPayload), fetchedAt, volume,
    symbol: text(raw.symbol),
    side: direction(raw.side ?? raw.type_str ?? raw.type),
    openPrice: toDecimalString(raw.open_price ?? raw.openPrice),
    stopLoss: toDecimalString(raw.stop_loss ?? raw.stopLoss ?? raw.sl),
    takeProfit: toDecimalString(raw.take_profit ?? raw.takeProfit ?? raw.tp),
    risk: toDecimalString(raw.risk),
    floatingPnl: toDecimalString(raw.floating_pnl ?? raw.floatingPnl ?? raw.profit),
  };
}

export function normalizeSnapshot(accountId: string, raw: RawRow, positions: RawRow[], fetchedAt: string): AccountSnapshot {
  const base = evidence(accountId, raw, timestamp(raw.timestamp ?? raw.updated_at ?? raw.server_time));
  const balance = toDecimalString(raw.balance ?? raw.currentBalance ?? raw.current_balance);
  const equity = toDecimalString(raw.equity ?? raw.currentEquity ?? raw.current_equity);
  const initialBalance = toDecimalString(raw.initialBalance ?? raw.initial_balance);
  const netProfit = toDecimalString(raw.netProfit ?? raw.net_profit ?? raw.profit);
  for (const [key, value] of Object.entries({ balance, equity, initialBalance, netProfit })) {
    if (value === null) base.missingFields.push(key);
  }
  const snapshot = {
    ...base, balance, equity, initialBalance, netProfit,
    currency: text(raw.currency ?? raw.account_currency),
    floatingPnl: subDecimals(equity, balance),
    marketQuietConfirmed: raw.market_closed === true || raw.marketQuietConfirmed === true,
  };
  const openPositions = positions.map(item => normalizeOpenPosition(accountId, item, fetchedAt))
    .sort((a, b) => a.id === b.id ? digest(a.rawPayload).localeCompare(digest(b.rawPayload)) : a.id < b.id ? -1 : 1);
  return { ...snapshot, openPositions, fetchedAt,
    digest: digest({ ...snapshot, openPositions: openPositions.map(({ fetchedAt: _, ...position }) => position) }) };
}

const dataKeys = ['data', 'items', 'rows', 'records', 'result', 'payload'];
const historyKeys = ['trades', 'trade_history', 'deals', 'positions', 'history', 'orders'];

function dataPage(payload: unknown, keys: string[], parents: RawRow[] = []): { rows: RawRow[]; metadata: RawRow[] } | null {
  if (Array.isArray(payload)) {
    const rows = payload.map(row);
    return rows.every(item => item !== null) ? { rows, metadata: parents } : null;
  }
  const object = row(payload);
  if (!object || parents.length >= 12) return null;
  const metadata = [object, ...parents];
  for (const key of [...keys, ...dataKeys]) {
    const found = dataPage(object[key], keys, metadata);
    if (found) return found;
  }
  return null;
}

interface Page { rows: RawRow[]; reportedPage: number | null; nextPage: number | null; nextToken: string | null }

function parsePage(payload: unknown, keys: string[], requestedPage: number): Page {
  const data = dataPage(payload, keys);
  if (!data) throw new McpReadError();
  const metadata = data.metadata.flatMap(item => [item, row(item.pagination), row(item.meta)].filter(value => value !== null));
  if (metadata.some(item => item.ok === false || item.success === false || Boolean(item.error))) throw new McpReadError();
  const field = (...keys: string[]) => metadata.flatMap(item => keys.map(key => item[key])).find(value => value != null);
  const pageNumber = (value: unknown) => {
    const number = Number(text(value));
    return Number.isSafeInteger(number) && number > 0 ? number : null;
  };
  const reportedPage = pageNumber(field('current_page', 'currentPage'));
  const current = reportedPage ?? requestedPage;
  const lastPage = pageNumber(field('last_page', 'lastPage', 'total_pages', 'totalPages'));
  const nextToken = text(field('next_cursor', 'nextCursor', 'next_page_token', 'nextPageToken'));
  const explicitPage = pageNumber(field('next_page', 'nextPage'));
  const hasNext = field('has_more', 'hasMore') === true || text(field('next_page_url', 'nextPageUrl')) !== null;
  if (hasNext && lastPage !== null && current >= lastPage && !nextToken && explicitPage === null) throw new McpReadError();
  const nextPage = explicitPage ?? (nextToken || hasNext || (lastPage !== null && current < lastPage) ? current + 1 : null);
  return { rows: data.rows, reportedPage, nextPage, nextToken };
}

interface PageCursor { page: number; token: string | null; seen: string[]; seenPages: string[] }

function advance(cursor: PageCursor, pageKey: string, response: Page) {
  const key = (page: number) => JSON.stringify([pageKey, page]);
  const token = response.nextToken;
  const tokenKey = token === null ? null : JSON.stringify([pageKey, token]);
  const seenPages = [...cursor.seenPages, key(cursor.page)];
  const repeated = cursor.seenPages.includes(key(cursor.page)) ||
    (response.reportedPage !== null && response.reportedPage !== cursor.page) ||
    (token !== null && tokenKey !== null && (cursor.seen.includes(tokenKey) || cursor.seen.includes(token) || token === cursor.token)) ||
    (response.nextPage !== null && seenPages.includes(key(response.nextPage)));
  return { repeated, seenPages, seen: tokenKey === null ? cursor.seen : [...cursor.seen, tokenKey] };
}

const brokerId = (id: string) => /^(?:0|[1-9]\d*)$/.test(id) && Number.isSafeInteger(Number(id)) ? Number(id) : id;

function pageArgs(accountId: string, cursor: PageCursor): RawRow {
  return { account_id: brokerId(accountId), page: cursor.page, ...(cursor.token !== null ? { cursor: cursor.token } : {}) };
}

function splitExecutions(accountId: string, rows: RawRow[], fetchedAt: string, cycleId?: string) {
  const trades: TradeExecution[] = [];
  const openPositions: OpenPosition[] = [];
  for (const raw of rows) {
    const reportedAccount = text(raw.account_id ?? raw.accountId);
    const reportedCycle = text(raw.cycle_id ?? raw.cycleId);
    if ((reportedAccount !== null && reportedAccount !== accountId) ||
        (cycleId && reportedCycle !== null && cycleId !== reportedCycle)) throw new McpReadError();
    if (typeof raw.close_time_str === 'string' && /currently running/i.test(raw.close_time_str)) {
      openPositions.push(normalizeOpenPosition(accountId, raw, fetchedAt));
      continue;
    }
    const trade = normalizeExecution(accountId, raw, fetchedAt, cycleId);
    if (!trade.dealId) throw new McpReadError();
    trades.push(trade);
  }
  return { trades, openPositions };
}

export async function readHistoryPage(accountId: string, cursor: HistoryCursor | null, callTool: CallReadTool, fetchedAt: string): Promise<HistoryPage> {
  const state: HistoryCursor = cursor ?? { stage: 'cycles', cycleIds: [], cycleIndex: 0, page: 1, token: null, seen: [], seenPages: [] };
  const empty = { trades: [], openPositions: [] };
  const blocked: HistoryPage = { ...empty, cursor: state, status: 'PARTIAL', blockedReason: 'Duplicate cursor detected' };
  const complete: HistoryPage = { ...empty, cursor: null, status: 'COMPLETE', blockedReason: null };
  const cycleId = state.cycleIds[state.cycleIndex];
  const cycles = state.stage === 'cycles';
  if (!cycles && cycleId === undefined) return complete;
  const pageKey = cycles ? 'cycles' : 'cycle:' + cycleId;
  if (state.seenPages.includes(JSON.stringify([pageKey, state.page]))) return blocked;
  const args = pageArgs(accountId, state);
  if (!cycles) args.cycle_id = brokerId(cycleId);
  const response = parsePage(await callTool(cycles ? 'get_account_cycles' : 'get_cycle_trading_history', args),
    cycles ? ['trading_cycles', 'cycles'] : historyKeys, state.page);
  const { repeated, seen, seenPages } = advance(state, pageKey, response);
  if (repeated) return blocked;
  const next = { ...state, seen, seenPages, page: response.nextPage ?? 1, token: response.nextToken };
  if (cycles) {
    const cycleIds = response.rows.map(raw => text(raw.cycle_id ?? raw.cycleId ?? raw.id));
    if (cycleIds.some(id => id === null)) throw new McpReadError();
    next.cycleIds = [...new Set([...state.cycleIds, ...cycleIds.filter(id => id !== null)])];
    if (response.nextPage === null) {
      if (!next.cycleIds.length) return complete;
      next.stage = 'history';
    }
    return { ...empty, cursor: next, status: 'PARTIAL', blockedReason: null };
  }
  const results = splitExecutions(accountId, response.rows, fetchedAt, cycleId);
  if (response.nextPage === null) next.cycleIndex++;
  if (next.cycleIndex >= next.cycleIds.length) return { ...complete, ...results };
  return { ...results, cursor: next, status: 'PARTIAL', blockedReason: null };
}

export async function discoverAccounts(callTool: CallReadTool, fetchedAt: string): Promise<BrokerAccount[]> {
  const accounts = new Map<string, BrokerAccount>();
  let cursor: PageCursor = { page: 1, token: null, seen: [], seenPages: [] };
  for (;;) {
    const args = { page: cursor.page, limit: 50, ...(cursor.token !== null ? { cursor: cursor.token } : {}) };
    const response = parsePage(await callTool('get_accounts', args), ['accounts', 'challenges', 'portfolios'], cursor.page);
    const { repeated, seen, seenPages } = advance(cursor, 'accounts', response);
    if (repeated) throw new McpReadError();
    for (const raw of response.rows) {
      const login = text(raw.login ?? raw.account_number ?? raw.mt5_login ?? raw.account_login);
      const accountId = text(raw.account_id ?? raw.accountId ?? raw.uuid ?? raw.id) ?? login;
      if (!accountId) throw new McpReadError();
      accounts.set(accountId, { accountId, login, rawPayload: evidencePayload(raw) as RawRow, fetchedAt });
    }
    if (response.nextPage === null) return [...accounts.values()];
    cursor = { page: response.nextPage, token: response.nextToken, seen, seenPages };
  }
}

export async function readSnapshot(accountId: string, callTool: CallReadTool, fetchedAt: string): Promise<AccountSnapshot> {
  const overview = row(await callTool('get_account_overview', { account_id: brokerId(accountId) }));
  if (!overview || overview.ok === false || overview.success === false || overview.error) throw new McpReadError();
  const wrapper = row(overview.data) ?? row(overview.result) ?? overview;
  const details = row(wrapper.account_details);
  const stats = row(wrapper.stats);
  const nested = row(wrapper.account) ?? row(wrapper.account_overview) ?? row(wrapper.overview);
  const account = nested ?? (details || stats ? { ...wrapper, ...details, ...stats } : wrapper);
  const reportedAccount = text(account.account_id ?? account.accountId);
  if ((reportedAccount !== null && reportedAccount !== accountId) ||
      !['balance', 'equity', 'currentBalance', 'current_balance', 'currentEquity', 'current_equity',
        'initialBalance', 'initial_balance', 'netProfit', 'net_profit', 'account_id', 'accountId', 'login']
        .some(key => Object.hasOwn(account, key))) throw new McpReadError();
  const positions: RawRow[] = [];
  let cursor: PageCursor = { page: 1, token: null, seen: [], seenPages: [] };
  for (;;) {
    const response = parsePage(await callTool('get_running_trades', { ...pageArgs(accountId, cursor), per_page: 50 }), historyKeys, cursor.page);
    const { repeated, seen, seenPages } = advance(cursor, 'positions', response);
    if (repeated || response.rows.some(position => {
      const reported = text(position.account_id ?? position.accountId);
      return reported !== null && reported !== accountId;
    })) throw new McpReadError();
    positions.push(...response.rows);
    if (response.nextPage === null) return normalizeSnapshot(accountId, account, positions, fetchedAt);
    cursor = { page: response.nextPage, token: response.nextToken, seen, seenPages };
  }
}

export function retryDelay(retryAfterHeader: string | null | undefined, nowMs: number, rng: () => number = Math.random): number {
  const input = retryAfterHeader?.trim() ?? '';
  const retryAt = /^\d+$/.test(input) ? nowMs + Number(input) * 1000 : Date.parse(input);
  const baseDelay = Number.isFinite(retryAt) ? Math.max(0, retryAt - nowMs) : 1000;
  const jitter = Math.floor(Math.min(Math.max(rng(), 0), 1) * Math.min(1000, Math.max(1, baseDelay / 4)));
  return baseDelay + jitter;
}
