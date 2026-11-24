export interface McpToolSchemaProperty {
  type?: string;
  description?: string;
  enum?: unknown[];
}

export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, McpToolSchemaProperty>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export interface FundedNextAccountCandidate {
  id: string;
  login: string;
  name: string;
  balance: number | null;
  equity: number | null;
  initialBalance: number | null;
  server: string;
  phase: string;
}

export interface McpToolCallTrace {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  error?: string;
  extractedCount?: number;
  validCount?: number;
  skippedCount?: number;
  skipReasons?: Record<string, number>;
  sampleRaw?: Record<string, unknown>;
  sampleKeys?: string[];
  preview?: string;
}

export interface McpRpcEnvelope {
  jsonrpc?: string;
  id?: unknown;
  result?: Record<string, unknown>;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
}

const FN_MCP_STORAGE_PREFIX = 'TALLYNX_FN_MCP_AUTH_';

export function clearLegacyFundedNextAuth(): void {
  try {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key?.startsWith(FN_MCP_STORAGE_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Legacy entries are never read, even when storage is unavailable.
  }
}

/**
 * Parses Streamable HTTP MCP responses supporting both `application/json`
 * and `text/event-stream` (`data: {...}\n\n`).
 */
export function parseMcpJsonOrSseResponse(
  rawBody: string,
  contentType?: string | null
): McpRpcEnvelope | null {
  const trimmed = (rawBody || '').trim();
  if (!trimmed) return null;

  const isSse =
    (contentType || '').toLowerCase().includes('text/event-stream') ||
    trimmed.startsWith('event:') ||
    trimmed.startsWith('data:');

  if (!isSse) {
    try {
      const parsed = JSON.parse(trimmed) as McpRpcEnvelope | McpRpcEnvelope[];
      if (Array.isArray(parsed)) {
        return parsed.find((m) => m && ('result' in m || 'error' in m)) || parsed[0] || null;
      }
      return parsed;
    } catch {
      // Fallback: inspect line-by-line SSE frames below
    }
  }

  const lines = trimmed.split(/\r?\n/);
  const payloads: McpRpcEnvelope[] = [];
  let dataBuffer: string[] = [];

  const flushEvent = () => {
    if (dataBuffer.length === 0) return;
    const joined = dataBuffer.join('\n').trim();
    dataBuffer = [];
    if (!joined || joined === '[DONE]') return;
    try {
      const parsed = JSON.parse(joined) as McpRpcEnvelope | McpRpcEnvelope[];
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object') payloads.push(item);
        }
      } else if (parsed && typeof parsed === 'object') {
        payloads.push(parsed);
      }
    } catch {
      // ignore non-JSON SSE keepalive comments/events
    }
  };

  for (const line of lines) {
    if (line.trim() === '') {
      flushEvent();
      continue;
    }
    if (line.startsWith('data:')) {
      dataBuffer.push(line.slice(5).trimStart());
    }
  }
  flushEvent();

  if (payloads.length === 0) return null;
  for (let i = payloads.length - 1; i >= 0; i--) {
    const msg = payloads[i];
    if (msg && ('result' in msg || 'error' in msg)) {
      return msg;
    }
  }
  return payloads[payloads.length - 1] || null;
}

function tryParseJsonText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  if (!candidate.startsWith('{') && !candidate.startsWith('[')) {
    return null;
  }
  try {
    return JSON.parse(candidate);
  } catch {
    // Handle MCP text responses that append `[INTERNAL — ...]` notes after valid JSON
    const closeChar = candidate[0] === '{' ? '}' : ']';
    let pos = candidate.lastIndexOf(closeChar);
    while (pos > 0) {
      try {
        return JSON.parse(candidate.slice(0, pos + 1));
      } catch {
        pos = candidate.lastIndexOf(closeChar, pos - 1);
      }
    }
    return null;
  }
}

export function extractMcpTextPreview(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  const resObj = result as Record<string, unknown>;
  if (Array.isArray(resObj.content)) {
    const texts = resObj.content
      .map((b) => (b && typeof b === 'object' ? String((b as Record<string, unknown>).text || '') : ''))
      .filter(Boolean)
      .join(' ');
    if (texts) return texts.slice(0, 220);
  }
  try {
    return JSON.stringify(result).slice(0, 220);
  } catch {
    return '';
  }
}

/**
 * Extracts structured objects or arrays from any standard MCP `tools/call` result
 * (`structuredContent`, direct keys, or `content[].text` JSON strings).
 */
export function extractMcpToolPayload(result: unknown): unknown {
  if (!result || typeof result !== 'object') return null;
  const resObj = result as Record<string, unknown>;

  if (resObj.structuredContent && typeof resObj.structuredContent === 'object') {
    return resObj.structuredContent;
  }

  for (const directKey of [
    'positions',
    'trades',
    'tradeHistory',
    'trade_history',
    'deals',
    'orders',
    'history',
    'accounts',
    'rows',
    'records',
    'data',
    'items',
  ]) {
    if (resObj[directKey] !== undefined) {
      return resObj;
    }
  }

  if (Array.isArray(resObj.content)) {
    const parsedItems: unknown[] = [];
    for (const block of resObj.content) {
      if (!block || typeof block !== 'object') continue;
      const b = block as Record<string, unknown>;
      if (b.json !== undefined) {
        parsedItems.push(b.json);
        continue;
      }
      if (typeof b.text === 'string') {
        const parsed = tryParseJsonText(b.text);
        if (parsed !== null) {
          parsedItems.push(parsed);
        }
      }
    }
    if (parsedItems.length === 1) return parsedItems[0];
    if (parsedItems.length > 1) return parsedItems;
  }

  return resObj;
}

function findArrayDeep(payload: unknown, preferredKeys: string[], depth = 0): Record<string, unknown>[] {
  if (!payload || depth > 6) return [];
  if (Array.isArray(payload)) {
    const objs = payload.filter(
      (x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
    );
    if (objs.length > 0) return objs;
    for (const item of payload) {
      const nested = findArrayDeep(item, preferredKeys, depth + 1);
      if (nested.length > 0) return nested;
    }
    return [];
  }
  if (typeof payload !== 'object') return [];
  const obj = payload as Record<string, unknown>;

  for (const key of preferredKeys) {
    const val = obj[key];
    if (Array.isArray(val)) {
      const rows = val.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x));
      if (rows.length > 0 || val.length === 0) return rows;
    } else if (val && typeof val === 'object') {
      // Handle Laravel LengthAwarePaginator objects like { trades: { current_page: 1, data: [...] } }
      const nested = findArrayDeep(val, [...preferredKeys, 'data', 'items', 'rows', 'records'], depth + 1);
      if (nested.length > 0) return nested;
    }
  }

  for (const containerKey of ['data', 'result', 'payload', 'response', 'records', 'rows', 'list']) {
    if (obj[containerKey] !== undefined) {
      const nested = findArrayDeep(obj[containerKey], preferredKeys, depth + 1);
      if (nested.length > 0) return nested;
    }
  }

  for (const val of Object.values(obj)) {
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
      return val.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x));
    }
  }

  return [];
}

export function extractFundedNextPagination(payload: unknown): {
  hasMeta: boolean;
  currentPage: number;
  lastPage: number;
} {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { hasMeta: false, currentPage: 1, lastPage: 1 };
  }
  const obj = payload as Record<string, unknown>;
  const candidates: Record<string, unknown>[] = [obj];
  for (const k of ['trades', 'data', 'positions', 'history', 'deals']) {
    const sub = obj[k];
    if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
      candidates.push(sub as Record<string, unknown>);
    }
  }
  for (const c of candidates) {
    if (c.current_page !== undefined && c.last_page !== undefined) {
      return {
        hasMeta: true,
        currentPage: Number(c.current_page) || 1,
        lastPage: Number(c.last_page) || 1,
      };
    }
  }
  return { hasMeta: false, currentPage: 1, lastPage: 1 };
}

function toFiniteNumber(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    const obj = val as Record<string, unknown>;
    return toFiniteNumber(obj.value ?? obj.amount ?? obj.raw ?? obj.formatted ?? null);
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    const direct = Number(trimmed.replace(/[$,\s]/g, ''));
    if (Number.isFinite(direct)) return direct;
    // Handle decorated numbers like "0.04 lots", "3,850.25 USD", "+$45.20"
    const match = trimmed.replace(/,/g, '').match(/[-+]?\d+(?:\.\d+)?/);
    if (match) {
      const n = Number(match[0]);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function extractTradeDirectionString(rawVal: unknown): string {
  if (rawVal === undefined || rawVal === null) return '';
  if (typeof rawVal === 'object' && !Array.isArray(rawVal)) {
    const obj = rawVal as Record<string, unknown>;
    return extractTradeDirectionString(obj.label ?? obj.name ?? obj.value ?? obj.type ?? '');
  }
  const s = String(rawVal).trim();
  const up = s.toUpperCase();
  if (up === 'LONG' || up === 'BID' || up === 'OP_BUY' || up === '0' || up === 'B' || up === 'BOUGHT') {
    return 'BUY';
  }
  if (up === 'SHORT' || up === 'ASK' || up === 'OP_SELL' || up === '1' || up === 'S' || up === 'SOLD') {
    return 'SELL';
  }
  return s;
}

function toIsoDateTimeString(val: unknown): unknown {
  if (typeof val === 'number' && Number.isFinite(val) && val > 1_000_000_000) {
    const ms = val < 10_000_000_000 ? val * 1000 : val;
    return new Date(ms).toISOString();
  }
  if (typeof val === 'string' && /^\d{10,13}$/.test(val.trim())) {
    const num = Number(val.trim());
    const ms = num < 10_000_000_000 ? num * 1000 : num;
    return new Date(ms).toISOString();
  }
  return val;
}

export function normalizeFundedNextAccounts(payload: unknown): FundedNextAccountCandidate[] {
  const rows = findArrayDeep(payload, ['accounts', 'challenges', 'portfolios', 'items', 'rows', 'records', 'data']);
  if (rows.length === 0 && payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const obj = payload as Record<string, unknown>;
    if (obj.account && typeof obj.account === 'object') {
      rows.push(obj.account as Record<string, unknown>);
    } else if (obj.login || obj.accountId || obj.account_id || obj.accountNumber || obj.account_number) {
      rows.push(obj);
    }
  }

  const out: FundedNextAccountCandidate[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const login = String(
      row.login ??
        row.accountNumber ??
        row.account_number ??
        row.mt5Login ??
        row.mt5_login ??
        row.account_login ??
        row.id ??
        row.accountId ??
        row.account_id ??
        ''
    ).trim();
    const id = String(row.accountId ?? row.account_id ?? row.uuid ?? row.id ?? login).trim();
    if (!id && !login) continue;
    const dedupeKey = `${id}:${login}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    out.push({
      id: id || login,
      login: login || id,
      name: String(
        row.name ?? row.accountName ?? row.account_name ?? row.label ?? row.type ?? `FundedNext #${login || id}`
      ),
      balance: toFiniteNumber(row.balance ?? row.currentBalance ?? row.current_balance),
      equity: toFiniteNumber(row.equity ?? row.currentEquity ?? row.current_equity),
      initialBalance: toFiniteNumber(
        row.initialBalance ??
          row.initial_balance ??
          row.startingBalance ??
          row.starting_balance ??
          row.accountSize ??
          row.account_size ??
          row.size
      ),
      server: String(row.server ?? row.brokerServer ?? row.broker_server ?? row.platform ?? 'FundedNext-MCP'),
      phase: String(row.phase ?? row.challengePhase ?? row.challenge_phase ?? row.status ?? row.type ?? ''),
    });
  }
  return out;
}

export function extractFundedNextCycleIds(payload: unknown): Array<string | number> {
  const rows = findArrayDeep(payload, ['trading_cycles', 'cycles', 'data', 'items', 'rows']);
  const ids: Array<string | number> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const rawId = row.cycle_id ?? row.cycleId ?? row.id;
    if (rawId === undefined || rawId === null || rawId === '') continue;
    const key = String(rawId);
    if (seen.has(key)) continue;
    seen.add(key);
    const num = Number(rawId);
    ids.push(Number.isFinite(num) && typeof rawId === 'number' ? num : Number.isFinite(num) && /^\d+$/.test(key) ? num : key);
  }
  // Sort newest / highest cycle ID first so current trading cycle comes first
  return ids.sort((a, b) => Number(b) - Number(a) || String(b).localeCompare(String(a)));
}

function deriveImpliedLotSize(
  symbol: string,
  openPrice: number,
  closePrice: number,
  profit: number
): number {
  const delta = Math.abs(closePrice - openPrice);
  const absProfit = Math.abs(profit);
  if (delta <= 0 || absProfit <= 0 || openPrice <= 0) {
    return 0.01;
  }
  const sym = symbol.toUpperCase();
  let unitValueUsdPerLot = 100_000;
  if (sym.includes('XAU') || sym.includes('GOLD') || (!sym && openPrice >= 1500 && openPrice <= 10000)) {
    unitValueUsdPerLot = 100;
  } else if (sym.includes('XAG') || sym.includes('SILVER')) {
    unitValueUsdPerLot = 5000;
  } else if (sym.includes('BTC') || sym.includes('ETH') || sym.includes('SOL') || sym.includes('US30') || sym.includes('NAS') || sym.includes('NDX') || sym.includes('SPX') || sym.includes('US500') || sym.includes('GER')) {
    unitValueUsdPerLot = 1;
  } else if (sym.endsWith('JPY') && closePrice > 50) {
    unitValueUsdPerLot = 100_000 / closePrice;
  } else if (sym.startsWith('USD') && !sym.endsWith('USD') && closePrice > 0.2) {
    unitValueUsdPerLot = 100_000 / closePrice;
  }
  const rawLots = absProfit / (delta * unitValueUsdPerLot);
  if (!Number.isFinite(rawLots) || rawLots <= 0) return 0.01;
  return +Math.max(0.01, Math.min(100, rawLots)).toFixed(2);
}

function normalizeReportedOrImpliedLot(
  reportedVolume: number,
  symbol: string,
  openPrice: number,
  closePrice: number,
  profit: number,
  batchDivisor: 1 | 100 | 10000
): number {
  if (reportedVolume <= 0) {
    return openPrice > 0 ? deriveImpliedLotSize(symbol, openPrice, closePrice, profit) : 0;
  }
  if (openPrice > 0 && closePrice !== openPrice && Math.abs(profit) > 0) {
    const implied = deriveImpliedLotSize(symbol, openPrice, closePrice, profit);
    if (reportedVolume >= 50 && Math.abs(reportedVolume / 10000 - implied) <= Math.max(0.02, implied * 0.25)) {
      return +Math.max(0.01, reportedVolume / 10000).toFixed(2);
    }
    if (reportedVolume >= 0.5 && Math.abs(reportedVolume / 100 - implied) <= Math.max(0.02, implied * 0.25)) {
      return +Math.max(0.01, reportedVolume / 100).toFixed(2);
    }
  }
  return +Math.max(0.01, reportedVolume / batchDivisor).toFixed(2);
}

export function normalizeFundedNextTrades(payload: unknown): Record<string, unknown>[] {
  const rows = findArrayDeep(payload, [
    'positions',
    'trades',
    'account_trades',
    'trade_list',
    'tradeHistory',
    'trade_history',
    'closedTrades',
    'closed_trades',
    'closedPositions',
    'closed_positions',
    'open_positions',
    'history',
    'deals',
    'orders',
    'closed_orders',
    'transactions',
    'rows',
    'records',
    'items',
  ]);

  const filtered = rows.filter((row) => {
    // Skip unclosed floating trades ("Currently Running") from Closed Trade Journal
    const closeStr = String(row.close_time_str ?? row.closeTime ?? row.close_time ?? '').trim().toLowerCase();
    if (closeStr.includes('currently running') || closeStr === 'open' || closeStr === 'running') {
      return false;
    }
    return Boolean(
      row.symbol ||
        row.pair ||
        row.instrument ||
        row.ticker ||
        row.asset ||
        row.openPrice !== undefined ||
        row.open_price !== undefined ||
        row.price_open !== undefined ||
        row.entryPrice !== undefined ||
        row.entry_price !== undefined
    );
  });

  // Detect if batch reports MT5 centi-lots (x100, e.g. 4 = 0.04) or MT5 raw deal lots (x10000, e.g. 400 = 0.04)
  let scale100Votes = 0;
  let scale10000Votes = 0;
  let scale1Votes = 0;
  for (const row of filtered) {
    const rep = toFiniteNumber(
      row.volume ?? row.lots ?? row.lotSize ?? row.lot_size ?? row.volume_lots ?? row.lot ?? row.qty ?? row.quantity ?? row.size
    ) ?? 0;
    const op = toFiniteNumber(row.openPrice ?? row.open_price ?? row.price_open ?? row.priceOpen ?? row.entryPrice ?? row.entry_price ?? row.price ?? row.open) ?? 0;
    const cp = toFiniteNumber(row.closePrice ?? row.close_price ?? row.price_close ?? row.priceClose ?? row.exitPrice ?? row.exit_price ?? row.close) ?? op;
    const pf = toFiniteNumber(row.rawProfit ?? row.raw_profit ?? row.grossProfit ?? row.gross_profit ?? row.profit ?? row.pnl) ?? 0;
    const sym = String(
      row.symbol ?? row.symbol_name ?? row.pair ?? row.pair_name ?? row.instrument ?? row.ticker ?? row.asset ?? row.market ?? ''
    ).trim();
    if (rep > 0 && op > 0 && cp !== op && Math.abs(pf) > 0) {
      const implied = deriveImpliedLotSize(sym, op, cp, pf);
      if (rep >= 50 && Math.abs(rep / 10000 - implied) <= Math.max(0.02, implied * 0.25)) scale10000Votes++;
      else if (rep >= 0.5 && Math.abs(rep / 100 - implied) <= Math.max(0.02, implied * 0.25)) scale100Votes++;
      else if (Math.abs(rep - implied) <= Math.max(0.02, implied * 0.25)) scale1Votes++;
    }
  }
  const batchDivisor: 1 | 100 | 10000 =
    scale10000Votes > scale100Votes && scale10000Votes > scale1Votes
      ? 10000
      : scale100Votes > scale1Votes
      ? 100
      : 1;

  return filtered.map((row) => {
      const rawTypeVal =
        row.type_str ??
        row.trade_type ??
        row.type ??
        row.side ??
        row.direction ??
        row.action ??
        row.cmd ??
        row.orderType ??
        row.order_type ??
        row.deal_type ??
        row.position_type ??
        '';
      const mappedType = extractTradeDirectionString(rawTypeVal);

      const rawProfit =
        toFiniteNumber(row.rawProfit ?? row.raw_profit ?? row.grossProfit ?? row.gross_profit ?? row.profit ?? row.pnl) ?? 0;
      const netProfit = toFiniteNumber(
        row.netProfit ?? row.net_profit ?? row.netPnl ?? row.net_pnl ?? row.realizedPnl ?? row.realized_pnl
      );
      const commission = toFiniteNumber(row.commission ?? row.commissions ?? row.fee ?? row.fees) ?? 0;
      const swap = toFiniteNumber(row.swap ?? row.swaps ?? row.rollover) ?? 0;
      const symbolStr = String(
        row.symbol ?? row.symbol_name ?? row.pair ?? row.pair_name ?? row.instrument ?? row.ticker ?? row.asset ?? row.market ?? ''
      ).trim();
      const openPrice =
        toFiniteNumber(
          row.openPrice ??
            row.open_price ??
            row.price_open ??
            row.priceOpen ??
            row.entryPrice ??
            row.entry_price ??
            row.price ??
            row.open
        ) ?? 0;
      const closePrice =
        toFiniteNumber(
          row.closePrice ??
            row.close_price ??
            row.price_close ??
            row.priceClose ??
            row.exitPrice ??
            row.exit_price ??
            row.close
        ) ?? openPrice;
      const reportedVolume =
        toFiniteNumber(
          row.volume ??
            row.lots ??
            row.lotSize ??
            row.lot_size ??
            row.volume_lots ??
            row.lot ??
            row.qty ??
            row.quantity ??
            row.size
        ) ?? 0;
      const volume = normalizeReportedOrImpliedLot(
        reportedVolume,
        symbolStr,
        openPrice,
        closePrice,
        rawProfit,
        batchDivisor
      );

      const openTimeStrCandidate =
        typeof row.open_time_str === 'string' && row.open_time_str.trim() ? row.open_time_str.trim() : undefined;
      const openTimeRaw =
        row.openTime ??
        openTimeStrCandidate ??
        row.open_time ??
        row.time_open ??
        row.openedAt ??
        row.opened_at ??
        row.entryTime ??
        row.entry_time ??
        row.time ??
        row.created_at ??
        '';
      const closeTimeStrCandidate =
        typeof row.close_time_str === 'string' &&
        row.close_time_str.trim() &&
        row.close_time_str.trim().toLowerCase() !== 'currently running'
          ? row.close_time_str.trim()
          : undefined;
      const closeTimeRaw =
        row.closeTime ??
        closeTimeStrCandidate ??
        row.close_time ??
        row.time_close ??
        row.closedAt ??
        row.closed_at ??
        row.exitTime ??
        row.exit_time ??
        row.closeDate ??
        openTimeRaw;

      return {
        ...row,
        ticket:
          row.ticket ??
          row.positionId ??
          row.position_id ??
          row.tradeId ??
          row.trade_id ??
          row.orderId ??
          row.order_id ??
          row.dealId ??
          row.deal_id ??
          row.id,
        symbol: symbolStr,
        type: mappedType,
        volume,
        openTime: toIsoDateTimeString(openTimeRaw),
        closeTime: toIsoDateTimeString(closeTimeRaw),
        openPrice,
        closePrice,
        slPrice: toFiniteNumber(row.slPrice ?? row.sl_price ?? row.stopLoss ?? row.stop_loss ?? row.sl) ?? 0,
        tpPrice: toFiniteNumber(row.tpPrice ?? row.tp_price ?? row.takeProfit ?? row.take_profit ?? row.tp) ?? 0,
        commission,
        swap,
        rawProfit: netProfit !== null && row.profit === undefined ? +(netProfit - commission - swap).toFixed(2) : rawProfit,
        profit: rawProfit,
        netProfit: netProfit !== null ? netProfit : +(rawProfit + commission + swap).toFixed(2),
        comment: String(row.comment ?? row.note ?? 'FundedNext Official MCP'),
      };
    });
}

export function diagnoseSkippedTrades(
  rawPayload: unknown,
  normalizedRows: Record<string, unknown>[]
): {
  skipReasons: Record<string, number>;
  sampleRaw?: Record<string, unknown>;
} {
  const skipReasons: Record<string, number> = {};
  for (const row of normalizedRows) {
    const t = String(row.type || '').toUpperCase();
    if (
      t.includes('BALANCE') ||
      t.includes('CREDIT') ||
      t.includes('BONUS') ||
      t.includes('DEPOSIT') ||
      t.includes('WITHDRAW')
    ) {
      skipReasons.balanceRow = (skipReasons.balanceRow || 0) + 1;
    } else if (!t.includes('BUY') && !t.includes('SELL') && t !== '0' && t !== '1') {
      skipReasons.missingOrUnknownDir = (skipReasons.missingOrUnknownDir || 0) + 1;
    } else if (!Number.isFinite(Number(row.openPrice)) || Number(row.openPrice) <= 0) {
      skipReasons.invalidOpenPrice = (skipReasons.invalidOpenPrice || 0) + 1;
    } else if (!Number.isFinite(Number(row.volume)) || Number(row.volume) <= 0) {
      skipReasons.invalidVolume = (skipReasons.invalidVolume || 0) + 1;
    }
  }

  const rawRows = findArrayDeep(rawPayload, ['data', 'trades', 'positions', 'history']);
  let sampleRaw: Record<string, unknown> | undefined;
  if (rawRows[0]) {
    const r = rawRows[0];
    sampleRaw = {
      ticket: r.ticket ?? r.id,
      symbol: r.symbol,
      type: r.type,
      side: r.side,
      lots: r.lots,
      volume: r.volume,
      open_price: r.open_price,
      close_price: r.close_price,
      open_time_str: r.open_time_str,
      close_time_str: r.close_time_str,
      profit: r.profit,
    };
  }
  return { skipReasons, sampleRaw };
}

const NOISE_TOOL_PATTERN =
  /(rule|policy|faq|help|blog|news|calendar|objective|certificate|payout|kyc|affiliate|plan|package|price|pricing|coupon|support|ticket|notification|alert|leaderboard|contest|competition|reset|recalculate|guide|tutorial|article|terms|promo|discount|payment|billing|invoice|wallet|referral|reward|breach|clarity|country|countries|timezone|pause|addon|add_on|order_history|purchase|task_|request_history|status_history|screenshot|calculator|switch_list|eligibility|trade_targets|trade_notes|stop_losses|instrument_data|trade_symbols|resolve_account)/i;

const WRITE_TOOL_PATTERN =
  /^(create|update|delete|remove|submit|post|put|patch|send|place|open|close|modify|cancel|execute|reset|withdraw|request)_|_(create|update|delete|submit|cancel|withdraw)/i;

export function pickFundedNextMcpTools(tools: McpToolDescriptor[]): {
  accountTool?: McpToolDescriptor;
  accountTools: McpToolDescriptor[];
  tradeTools: McpToolDescriptor[];
  relevantToolNames: string[];
} {
  const safeReadTools = tools.filter((t) => !WRITE_TOOL_PATTERN.test(t.name));

  const scoredAccounts: Array<{ tool: McpToolDescriptor; score: number }> = [];
  const scoredTrades: Array<{ tool: McpToolDescriptor; score: number }> = [];
  const relevantToolNames: string[] = [];

  for (const t of safeReadTools) {
    const n = t.name.toLowerCase();
    const d = (t.description || '').toLowerCase();
    const isNoise = NOISE_TOOL_PATTERN.test(n);

    if (
      /(account|trade|order|deal|position|history|journal|portfolio|challenge|mt5|cfd|futures)/i.test(n) &&
      !isNoise
    ) {
      relevantToolNames.push(t.name);
    }

    // Score account list / overview tools
    let accScore = 0;
    if (/(list|get|fetch|user|my|all|your).*accounts?|your_accounts|account_overview|account_balance|trial_overview/.test(n) || n === 'accounts' || n === 'get_accounts') {
      accScore += 14;
    } else if (n.includes('account') && !n.includes('trade') && !n.includes('trading') && !n.includes('order') && !n.includes('history') && !n.includes('deal')) {
      accScore += 8;
    } else if (n.includes('challenge') || n.includes('portfolio')) {
      accScore += 6;
    }
    if (d.includes('list') && d.includes('account') || d.includes('all trading accounts')) accScore += 5;
    if (isNoise) accScore -= 25;
    if (accScore >= 6) {
      scoredAccounts.push({ tool: t, score: accScore });
    }

    // Score trade history / position / deal / journal tools (matches FundedNext "Trading history", "Trade journal", "Trial trading history")
    let tradeScore = 0;
    if (
      /(trading_history|trade_history|get_trades|get_account_trades|list_trades|closed_trades|trade_logs|account_trades|get_deals|deal_history|get_positions|position_history|trade_journal|trading_journal|trial_trading_history)/.test(
        n
      )
    ) {
      tradeScore += 20;
    } else if (/(^|_)(trades?|trading|positions?|deals?|journal|history)(_|$)/.test(n)) {
      tradeScore += 13;
    } else if (n.includes('trade') || n.includes('trading') || n.includes('position') || n.includes('deal') || n.includes('journal') || n.includes('history')) {
      tradeScore += 8;
    } else if (d.includes('trade-by-trade') || d.includes('trade history') || d.includes('trading history') || d.includes('closed trades') || d.includes('all trades')) {
      tradeScore += 9;
    }

    if (n.includes('analytics') || n.includes('summary') || n.includes('metrics') || n.includes('stats') || n.includes('overview') || n.includes('detail')) {
      tradeScore -= 4;
    }
    if (isNoise) tradeScore -= 25;
    if (tradeScore > 0) {
      scoredTrades.push({ tool: t, score: tradeScore });
    }
  }

  scoredAccounts.sort((a, b) => b.score - a.score);
  scoredTrades.sort((a, b) => b.score - a.score);

  const accountTools = scoredAccounts.slice(0, 6).map((x) => x.tool);
  return {
    accountTool: accountTools[0],
    accountTools,
    tradeTools: scoredTrades.slice(0, 10).map((x) => x.tool),
    relevantToolNames: relevantToolNames.slice(0, 100),
  };
}

export function buildMcpToolArgs(
  tool: McpToolDescriptor | undefined,
  opts: {
    accountId?: string;
    login?: string;
    cycleId?: string | number;
    page?: number;
    lookbackDays: number;
  }
): Record<string, unknown> {
  const props = tool?.inputSchema?.properties;
  if (!props || Object.keys(props).length === 0) {
    const fallback: Record<string, unknown> = {};
    if (opts.accountId) fallback.accountId = opts.accountId;
    if (opts.cycleId !== undefined && opts.cycleId !== '') fallback.cycle_id = opts.cycleId;
    return fallback;
  }

  const args: Record<string, unknown> = {};
  const accId = (opts.accountId || '').trim();
  const loginVal = (opts.login || opts.accountId || '').trim();
  const days = Math.max(1, Math.min(365, opts.lookbackDays || 30));
  const now = new Date();
  const fromDate = new Date(now.getTime() - days * 86400 * 1000);
  const toIso = now.toISOString().slice(0, 10);
  const fromIso = fromDate.toISOString().slice(0, 10);

  for (const [key, schema] of Object.entries(props)) {
    const lk = key.toLowerCase();
    const isNumeric = schema.type === 'number' || schema.type === 'integer';
    if (loginVal && (lk === 'login' || lk === 'accountlogin' || lk === 'account_login' || lk === 'mt5_login' || lk === 'accountnumber' || lk === 'account_number')) {
      args[key] = isNumeric ? Number(loginVal) || loginVal : loginVal;
    } else if (accId && (lk === 'accountid' || lk === 'account_id' || lk === 'account' || lk === 'id' || lk === 'challenge_id' || lk === 'challengeid')) {
      args[key] = isNumeric ? Number(accId) || accId : accId;
    } else if (opts.cycleId !== undefined && opts.cycleId !== '' && (lk === 'cycleid' || lk === 'cycle_id')) {
      args[key] = isNumeric ? Number(opts.cycleId) || opts.cycleId : opts.cycleId;
    } else if (lk === 'lookbackdays' || lk === 'lookback_days' || lk === 'days') {
      args[key] = days;
    } else if (lk === 'from' || lk === 'startdate' || lk === 'start_date' || lk === 'fromdate' || lk === 'from_date') {
      args[key] = fromIso;
    } else if (lk === 'to' || lk === 'enddate' || lk === 'end_date' || lk === 'todate' || lk === 'to_date') {
      args[key] = toIso;
    } else if (lk === 'limit' || lk === 'pagesize' || lk === 'page_size' || lk === 'per_page') {
      args[key] = 50;
    } else if (lk === 'page' || lk === 'offset') {
      args[key] = lk === 'page' ? opts.page ?? 1 : 0;
    }
  }

  return args;
}
