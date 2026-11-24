import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMcpToolArgs,
  extractFundedNextCycleIds,
  extractFundedNextPagination,
  extractMcpToolPayload,
  normalizeFundedNextAccounts,
  normalizeFundedNextTrades,
  parseMcpJsonOrSseResponse,
  pickFundedNextMcpTools,
} from './fundedNextMcp.js';
import {
  canFallbackToUsdWorkspace,
  convertPilotExecutionsToPositions,
  formatPilotAmount,
  loadCachedPilotSnapshot,
  planPilotPortAssignments,
  readPilotAccount,
  saveCachedPilotSnapshot,
} from './fundedNextPilot.js';
import type { AccountInfo } from '../types/ghr.js';

test('parseMcpJsonOrSseResponse handles both application/json and text/event-stream envelopes', () => {
  const plain = parseMcpJsonOrSseResponse('{"jsonrpc":"2.0","id":1,"result":{"tools":[]}}', 'application/json');
  assert.ok(plain?.result);

  const sseBody = [
    'event: message',
    'data: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progress":50}}',
    '',
    'event: message',
    'data: {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"{\\"trades\\":[{\\"ticket\\":101,\\"symbol\\":\\"XAUUSD\\",\\"type\\":\\"LONG\\",\\"volume\\":\\"0.04\\",\\"openPrice\\":\\"3,850.50\\",\\"profit\\":120}]}"}]}}',
    '',
  ].join('\n');

  const sse = parseMcpJsonOrSseResponse(sseBody, 'text/event-stream');
  assert.equal(sse?.id, 2);
  const extracted = extractMcpToolPayload(sse?.result);
  const trades = normalizeFundedNextTrades(extracted);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].ticket, 101);
  assert.equal(trades[0].type, 'BUY');
  assert.equal(trades[0].volume, 0.04);
  assert.equal(trades[0].openPrice, 3850.5);
  assert.equal(trades[0].profit, 120);
});

test('extractMcpToolPayload unwraps JSON objects wrapped inside fenced markdown text content', () => {
  const result = {
    content: [
      {
        type: 'text',
        text: '```json\n{"accounts":[{"account_id":"FN-9001","login":14384682,"balance":6250,"initial_balance":6000}]}\n```',
      },
    ],
  };
  const accounts = normalizeFundedNextAccounts(extractMcpToolPayload(result));
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].id, 'FN-9001');
  assert.equal(accounts[0].login, '14384682');
  assert.equal(accounts[0].initialBalance, 6000);
});

test('pickFundedNextMcpTools filters billing order_history & FAQ tools and prioritizes trading_history / trade_journal', () => {
  const { accountTool, tradeTools } = pickFundedNextMcpTools([
    { name: 'get_news_trading_rules', description: 'News trading rule explanations' },
    { name: 'get_order_history', description: 'Billing & Plans past purchases and add-ons' },
    { name: 'get_trading_objectives', description: 'Profit targets and consistency rules' },
    { name: 'your_accounts', description: 'See all trading accounts with plan type and phase' },
    {
      name: 'get_trading_history',
      description: 'Trade-by-trade breakdown with entry, exit, and result',
      inputSchema: {
        type: 'object',
        properties: {
          login: { type: 'string' },
          account_id: { type: 'string' },
          limit: { type: 'integer' },
          days: { type: 'integer' },
        },
      },
    },
    { name: 'get_trade_journal', description: 'Detailed journal with notes, symbols, and session analysis' },
  ]);

  assert.equal(accountTool?.name, 'your_accounts');
  assert.equal(tradeTools[0]?.name, 'get_trading_history');
  assert.ok(!tradeTools.some((t) => t.name === 'get_order_history'));

  const args = buildMcpToolArgs(tradeTools[0], { accountId: 'FN-UUID-1', login: '14359161', lookbackDays: 30 });
  assert.deepEqual(args, { login: '14359161', account_id: 'FN-UUID-1', limit: 50, days: 30 });

  const cycleIds = extractFundedNextCycleIds({
    trading_cycles: [
      { id: 6124295, account_id: 4613642 },
      { id: 6124296, account_id: 4613642 },
    ],
  });
  assert.deepEqual(cycleIds, [6124296, 6124295]);
});

test('extractMcpToolPayload & normalizeFundedNextTrades handle FundedNext nested trades.data paginator and trailing internal text', () => {
  const mcpResult = {
    content: [
      {
        type: 'text',
        text:
          '{"cycle":{"id":6124296,"is_current":true},"trades":{"current_page":1,"last_page":2,"data":[{"ticket":294011,"symbol":"XAUUSD","type":{"label":"Buy"},"lots":"0.04 lots","open_price":"$3,850.10","close_price":"3,858.10","open_time_str":"2026-11-16 10:00:00","close_time_str":"2026-11-16 10:30:00","profit":"+$32.00"}]}}\n[INTERNAL — FOR AI, NOT CUSTOMER]',
      },
    ],
  };

  const payload = extractMcpToolPayload(mcpResult);
  const trades = normalizeFundedNextTrades(payload);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].ticket, 294011);
  assert.equal(trades[0].volume, 0.04);
  assert.equal(trades[0].openPrice, 3850.1);
  assert.equal(trades[0].profit, 32);

  const pag = extractFundedNextPagination(payload);
  assert.deepEqual(pag, { hasMeta: true, currentPage: 1, lastPage: 2 });
});

test('normalizeFundedNextTrades derives implied lots when FundedNext get_cycle_trading_history returns lots="0.00" and skips Currently Running trades', () => {
  const raw = {
    trades: {
      data: [
        {
          ticket: 294043992,
          symbol: 'XAUUSD',
          type: 1,
          lots: '0.00',
          open_price: 3870.8,
          close_price: 3869.48,
          open_time_str: '2026.11.17 04:59:22',
          close_time_str: 'Currently Running',
          profit: 5.28,
        },
        {
          ticket: 292088056,
          symbol: 'XAUUSD',
          type: 1,
          lots: '0.00',
          open_price: 4049.12,
          close_price: 4045,
          open_time_str: '2026.11.11 05:47:36',
          close_time_str: '2026.11.11 05:56:22',
          profit: 16.48,
        },
        {
          ticket: 289359468,
          symbol: 'XAUUSD',
          type: 0,
          lots: '0.00',
          open_price: 3945.86,
          close_price: 3935.8,
          open_time_str: '2026.11.03 16:24:39',
          close_time_str: '2026.11.03 17:08:19',
          profit: -60.36,
        },
      ],
    },
  };

  const trades = normalizeFundedNextTrades(raw);
  assert.equal(trades.length, 2);
  assert.equal(trades[0].ticket, 292088056);
  assert.equal(trades[0].type, 'SELL');
  assert.equal(trades[0].volume, 0.04);
  assert.equal(trades[1].ticket, 289359468);
  assert.equal(trades[1].type, 'BUY');
  assert.equal(trades[1].volume, 0.06);
});

test('normalizeFundedNextTrades rescales centi-lot / MT5 integer lots (e.g. 4 or 400 -> 0.04) when matched against price delta & profit', () => {
  const scaled = normalizeFundedNextTrades({
    trades: [
      {
        id: 501,
        symbol: 'XAUUSD',
        type: 'SELL',
        lots: 4,
        open_price: 4049.12,
        close_price: 4045.0,
        open_time_str: '2026.11.17 05:47:36',
        close_time_str: '2026.11.17 05:56:22',
        profit: 16.48,
      },
      {
        id: 502,
        symbol: 'XAUUSD',
        type: 'BUY',
        lots: 4,
        open_price: 4050.0,
        close_price: 4050.0,
        open_time_str: '2026.11.17 06:00:00',
        close_time_str: '2026.11.17 06:05:00',
        profit: 0,
      },
    ],
  });
  assert.equal(scaled.length, 2);
  assert.equal(scaled[0].volume, 0.04);
  assert.equal(scaled[1].volume, 0.04);
});

test('normalizeFundedNextTrades prefers naive open_time_str over numeric open_time to preserve MT5 server clock for ICT offset conversion', () => {
  const trades = normalizeFundedNextTrades({
    trades: [
      {
        ticket: 901,
        symbol: 'XAUUSD',
        type: 1,
        lots: 0.04,
        open_price: 3870.8,
        close_price: 3869.48,
        open_time: 1794891562,
        open_time_str: '2026.11.17 04:59:22',
        close_time: 1794892162,
        close_time_str: '2026.11.17 05:09:22',
        profit: 5.28,
      },
    ],
  });
  assert.equal(trades.length, 1);
  assert.equal(trades[0].openTime, '2026.11.17 04:59:22');
  assert.equal(trades[0].closeTime, '2026.11.17 05:09:22');
});

test('convertPilotExecutionsToPositions converts Firestore executions with rawPayload lots="0.00" and planPilotPortAssignments maps multi-port tracks', () => {
  const executions: Parameters<typeof convertPilotExecutionsToPositions>[0] = [
    {
      id: '4613642_6124296_294621270',
      accountId: '4613642',
      dealId: '294621270',
      cycleId: '6124296',
      kind: 'TRADE',
      symbol: 'XAUUSD',
      side: 'BUY',
      volume: null,
      risk: null,
      grossPnl: '15.84',
      commission: '-0.24',
      swap: '0',
      fee: null,
      netPnl: null,
      cashflowAmount: null,
      openPrice: '3786.5',
      closePrice: '3790.46',
      openedAt: null,
      closedAt: null,
      sourceTimestampRaw: '2026-11-18 07:26:44',
      sourceTimestampUtc: null,
      sourceTimezone: null,
      fetchedAt: '2026-11-18T05:50:00.000Z',
      digest: 'abc',
      revision: 1,
      missingFields: [],
      unverifiedFields: ['volume', 'openedAt', 'closedAt'],
      rawPayload: {
        ticket: 294621270,
        symbol: 'XAUUSD',
        type: 0,
        lots: '0.00',
        open_price: 3786.5,
        close_price: 3790.46,
        open_time_str: '2026.11.18 06:30:13',
        close_time_str: '2026-11-18 07:26:44',
        profit: 15.84,
        commission: -0.24,
        swap: 0,
      },
    },
  ];
  const positions = convertPilotExecutionsToPositions(executions);
  assert.equal(positions.length, 1);
  assert.equal(positions[0].volume, 0.04);
  assert.equal(positions[0].netProfit, 15.6);

  const [execution] = executions;
  const otherCycle = { ...execution, id: `${execution.id}-other`, cycleId: 'other' };
  const overlapping = convertPilotExecutionsToPositions([execution, otherCycle, execution]);
  assert.deepEqual(overlapping.map(row => row.ticket).sort(), [
    `${execution.dealId}_${execution.cycleId}`, `${execution.dealId}_other`,
  ].sort());

  const planned = planPilotPortAssignments(
    {
      p1: {
        id: 'p1',
        name: 'Prop #14359161',
        login: '14359161',
        initial: 6000,
        targetProfit: 480,
        minDays: 5,
        defaultRisk: 120,
      },
    },
    [
      { id: 'doc1', accountId: '4613642', login: '14359161', connectionId: 'conn1', tracked: true },
      { id: 'doc2', accountId: '4517465', login: '14338344', connectionId: 'conn1', tracked: true },
      { id: 'doc3', accountId: '4811064', login: '14405772', connectionId: 'conn1', tracked: false },
    ]
  );
  assert.equal(planned.changed, true);
  assert.deepEqual(planned.addedPortIds, ['fn_4517465']);
  assert.equal(planned.nextAccounts.p1.fundedNextAccountId, 'doc1');
  assert.equal(planned.nextAccounts.fn_4517465.login, '14338344');
  assert.equal(planned.nextAccounts.fn_4517465.autoSyncRealtime, true);
});

test('pilot assignments prioritize exact bindings and only adopt eligible unbound login matches', () => {
  const port = (id: string, login: string, overrides: Partial<AccountInfo> = {}): AccountInfo => ({
    id, login, name: id, initial: 6000, targetProfit: 480, minDays: 5, defaultRisk: 120, ...overrides,
  });
  const accounts = {
    earlier: port('earlier', 'shared'),
    exact: port('exact', 'old', { fundedNextAccountId: 'exact-doc' }),
    personal: port('personal', 'personal', { consistencyCapPct: 100 }),
    bound: port('bound', 'bound', { fundedNextAccountId: 'other-doc' }),
    bridge: port('bridge', 'bridge', { syncProvider: 'LIVE_BRIDGE' }),
    manual: port('manual', 'manual', { syncProvider: 'MANUAL_XLSX' }),
  };
  const choice = (id: string, login: string) => ({ id, accountId: id, connectionId: 'conn', login, tracked: true });
  const planned = planPilotPortAssignments(accounts, [
    choice('exact-doc', 'shared'),
    choice('personal-doc', 'personal'),
    choice('bound-doc', 'bound'),
    choice('bridge-doc', 'bridge'),
    choice('manual-doc', 'manual'),
    choice('manual-doc', 'manual'),
  ]);

  assert.equal(planned.nextAccounts.exact.fundedNextAccountId, 'exact-doc');
  assert.equal(planned.nextAccounts.exact.login, 'shared');
  for (const id of ['earlier', 'personal', 'bound', 'bridge'] as const) {
    assert.equal(planned.nextAccounts[id], accounts[id]);
  }
  assert.equal(planned.nextAccounts.manual.fundedNextAccountId, 'manual-doc');
  assert.deepEqual(planned.addedPortIds, ['fn_personal-doc', 'fn_bound-doc', 'fn_bridge-doc']);
  const boundIds = Object.values(planned.nextAccounts).flatMap(port => port.fundedNextAccountId ?? []);
  assert.equal(new Set(boundIds).size, boundIds.length);
});

test('pilot history reports when the page limit leaves a continuation cursor', async t => {
  let pageCount = 0;
  let totalPages = 26;
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    const path = new URL(url, 'https://desk.example');
    if (path.pathname.endsWith('/snapshot')) return Response.json({ snapshot: null, syncStatus: 'COMPLETE' });
    const prior = pageCount ? `cursor-${pageCount}` : null;
    assert.equal(path.searchParams.get('cursor'), prior);
    pageCount++;
    return Response.json({
      executions: [{ id: `execution-${pageCount}` }],
      nextCursor: pageCount < totalPages ? `cursor-${pageCount}` : null,
    });
  });
  const read = () => readPilotAccount(async () => 'test-token', 'account', new AbortController().signal);

  const capped = await read();
  assert.equal(pageCount, 25);
  assert.equal(capped.executions.length, 25);
  assert.equal(capped.nextCursor, 'cursor-25');
  assert.equal(capped.hasMoreExecutions, true);

  pageCount = 0;
  totalPages = 25;
  const complete = await read();
  assert.equal(complete.executions.length, 25);
  assert.equal(complete.nextCursor, null);
  assert.equal(complete.hasMoreExecutions, false);
});

test('readPilotAccount skips execution reads on steady-state polls until snapshot changes', async t => {
  let snapshotFetches = 0;
  let executionFetches = 0;
  let currentBalance = '6236.07';
  let currentFetchedAt = '2026-11-18T10:00:00.000Z';
  let currentDigest = 'digest-1';
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    const path = new URL(url, 'https://desk.example');
    if (path.pathname.endsWith('/snapshot')) {
      snapshotFetches++;
      return Response.json({
        snapshot: {
          accountId: 'acc-1',
          balance: currentBalance,
          equity: currentBalance,
          floatingPnl: '0',
          netProfit: '236.07',
          initialBalance: '6000',
          currency: 'USD',
          openPositions: [],
          fetchedAt: currentFetchedAt,
          lastCheckedAt: '2026-11-18T10:05:00.000Z',
          digest: currentDigest,
          status: 'CONNECTED',
          blockedReason: null,
          sourceTimestampRaw: null,
          sourceTimestampUtc: null,
          sourceTimezone: null,
          missingFields: [],
          unverifiedFields: [],
          rawPayload: {},
        },
        syncStatus: 'COMPLETE',
      });
    }
    executionFetches++;
    return Response.json({
      executions: [{ id: 'exec-1', kind: 'TRADE' }],
      nextCursor: null,
    });
  });

  const first = await readPilotAccount(async () => 'test-token', 'acc-1', new AbortController().signal);
  assert.equal(snapshotFetches, 1);
  assert.equal(executionFetches, 1);

  const steady = await readPilotAccount(async () => 'test-token', 'acc-1', new AbortController().signal, {
    previous: first,
  });
  assert.equal(snapshotFetches, 2);
  assert.equal(executionFetches, 1);
  assert.equal(steady.executions.length, 1);

  currentBalance = '6280.00';
  currentFetchedAt = '2026-11-18T10:06:00.000Z';
  currentDigest = 'digest-2';
  await readPilotAccount(async () => 'test-token', 'acc-1', new AbortController().signal, {
    previous: steady,
  });
  assert.equal(snapshotFetches, 3);
  assert.equal(executionFetches, 2);
});

test('pilot USD fallback helper and snapshot cache stay scoped cleanly', () => {
  assert.equal(canFallbackToUsdWorkspace(undefined), true);
  assert.equal(canFallbackToUsdWorkspace(null), true);
  assert.equal(canFallbackToUsdWorkspace('USD'), true);
  assert.equal(canFallbackToUsdWorkspace('EUR'), false);
  assert.equal(formatPilotAmount(undefined, undefined), '—');

  const storage = new Map<string, string>();
  const originalWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    },
  };
  try {
    saveCachedPilotSnapshot('uid-1', 'port-1', 'acc-1', {
      accountId: 'acc-1',
      balance: '6236.07',
      equity: '6240.00',
      floatingPnl: '3.93',
      netProfit: '236.07',
      initialBalance: '6000',
      currency: 'USD',
      openPositions: [],
      fetchedAt: '2026-11-18T10:00:00.000Z',
      lastCheckedAt: '2026-11-18T10:05:00.000Z',
      digest: 'd1',
      status: 'CONNECTED',
      blockedReason: null,
      sourceTimestampRaw: null,
      sourceTimestampUtc: null,
      sourceTimezone: null,
      missingFields: [],
      unverifiedFields: [],
      marketQuietConfirmed: true,
      rawPayload: {},
    });
    const loaded = loadCachedPilotSnapshot('uid-1', 'port-1', 'acc-1');
    assert.equal(loaded?.balance, '6236.07');
    assert.equal(loaded?.currency, 'USD');
    assert.equal(loaded?.floatingPnl, undefined);
    assert.equal(loadCachedPilotSnapshot('uid-2', 'port-1', 'acc-1'), null);
  } finally {
    if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = originalWindow;
  }
});

test('connectFundedNextPilot falls back to a fresh connection when stale connectionId returns 404', async t => {
  const { connectFundedNextPilot } = await import('./fundedNextPilot.js');
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalNavigator = (globalThis as { navigator?: unknown }).navigator;
  const listeners = new Map<string, Set<(event: MessageEvent) => void>>();
  let popupClosed = false;
  const popup = {
    closed: false,
    close: () => {
      popupClosed = true;
      popup.closed = true;
    },
    location: {
      replace: () => {
        const event = {
          origin: 'https://desk.example',
          source: popup,
          data: {
            type: 'TALLYNX_FN_PILOT_OAUTH_RESULT',
            ok: true,
            status: 'CONNECTED',
            connectionId: 'fresh-conn-2',
          },
        } as unknown as MessageEvent;
        for (const fn of listeners.get('message') ?? []) fn(event);
      },
    },
  };
  (globalThis as { window?: unknown }).window = {
    location: { origin: 'https://desk.example' },
    open: () => popup,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    addEventListener: (type: string, fn: (event: MessageEvent) => void) => {
      const set = listeners.get(type) ?? new Set();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, fn: (event: MessageEvent) => void) => {
      listeners.get(type)?.delete(fn);
    },
  };
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });

  const startBodies: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    const path = new URL(url, 'https://desk.example');
    if (path.pathname === '/api/fundednext/connections') {
      const body = String(init?.body ?? '');
      startBodies.push(body);
      if (body.includes('stale-conn-1')) {
        return Response.json({ error: 'FundedNext resource not found' }, { status: 404 });
      }
      return Response.json({
        authorizeUrl: 'https://mcp.fundednext.com/oauth/authorize?redirect_uri=https%3A%2F%2Fdesk.example%2Fapi%2Ffundednext%2Foauth%2Fcallback',
      }, { status: 201 });
    }
    if (path.pathname === '/api/fundednext/accounts') {
      assert.equal(path.searchParams.get('connectionId'), 'fresh-conn-2');
      return Response.json({ accounts: [], connectionStatus: 'CONNECTED' });
    }
    throw new Error(`Unexpected URL: ${url}`);
  });

  try {
    const result = await connectFundedNextPilot(async () => 'test-token', 'stale-conn-1', new AbortController().signal);
    assert.deepEqual(result, { connectionId: 'fresh-conn-2', status: 'CONNECTED' });
    assert.deepEqual(startBodies, [
      JSON.stringify({ connectionId: 'stale-conn-1' }),
      JSON.stringify({}),
    ]);
    assert.equal(popupClosed, true);
  } finally {
    if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = originalWindow;
    if (originalNavigator === undefined) delete (globalThis as { navigator?: unknown }).navigator;
    else Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true });
  }
});
