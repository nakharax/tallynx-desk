import { strict as assert } from 'node:assert';
import test from 'node:test';
import { normalizeExecution, normalizeSnapshot, reconcileTrade, readHistoryPage, readSnapshot, retryDelay } from './mcpConnector.js';
import type { HistoryCursor } from './brokerTypes.js';

const at = '2026-11-18T12:00:00.000Z';
const raw = { deal_id: '1', ticket: '99', symbol: 'XAUUSD', type: 'buy', lots: '0.01',
  open_time_str: '2026-11-18 12:00:00', close_time_str: '2026-11-18T14:00:00+02:00',
  profit: '9007199254740993.10', commission: '-0.07', swap: '0.02', fee: '-0.01' };

test('fees, gross profit and net profit retain fractional precision past 2^53', () => {
  const trade = normalizeExecution('42', raw, at);
  assert.equal(trade.netPnl, '9007199254740993.04');
  assert.equal(trade.openedAt, null);
  assert.equal(trade.closedAt, at);
  assert.deepEqual(trade.rawPayload, raw);
  assert.ok(trade.unverifiedFields.includes('openedAt'));
  assert.equal(normalizeExecution('42', { ...raw, lots: undefined, volume: 400 }, at).volume, null);
});

test('same execution ignores fetch time but revises changed broker data', () => {
  const first = normalizeExecution('42', raw, at);
  const same = normalizeExecution('42', { ...raw }, '2026-11-19T00:00:00Z');
  assert.equal(reconcileTrade(first, same), first);
  const changed = normalizeExecution('42', { ...raw, profit: '1' }, at);
  assert.equal(reconcileTrade(first, changed).revision, 2);
  assert.equal(first.id, changed.id);
  assert.notEqual(first.id, normalizeExecution('42', { ...raw, deal_id: '2' }, at).id);
});

test('cashflow does not enter trade P&L and account evidence stays nullable', () => {
  const cash = normalizeExecution('42', { type: 'deposit', profit: '123.01', ticket: 'a' }, at);
  assert.equal(cash.cashflowAmount, '123.01');
  assert.equal(cash.netPnl, null);
  const account = normalizeSnapshot('42', { equity: '10.30', balance: '10.10' }, [], at);
  assert.equal(account.floatingPnl, '0.2');
  assert.equal(account.marketQuietConfirmed, false);
  assert.equal(normalizeSnapshot('42', {}, [], at).floatingPnl, null);
  assert.equal(normalizeSnapshot('42', {}, [], at).digest, normalizeSnapshot('42', {}, [], 'later').digest);
});

test('cycle discovery and each history page resume independently past legacy limits', async () => {
  let cursor: HistoryCursor | null = null;
  const ids = new Set<string>();
  let running = 0;
  for (let job = 0; job < 100; job++) {
    const result = await readHistoryPage('42', cursor, async (tool, args) => {
      if (tool === 'get_account_cycles') return { trading_cycles: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }], current_page: 1, last_page: 1 };
      assert.equal(tool, 'get_cycle_trading_history');
      const page = Number(args.page);
      return { trades: { data: [
        { ...raw, deal_id: String(args.cycle_id) + '-' + page },
        { ticket: 'open', close_time_str: 'Currently Running' },
      ], current_page: page, last_page: 16 } };
    }, at);
    for (const trade of result.trades) ids.add(trade.id);
    running += result.openPositions.length;
    if (result.status === 'COMPLETE') break;
    assert.equal(result.blockedReason, null);
    cursor = structuredClone(result.cursor);
  }
  assert.equal(ids.size, 64);
  assert.equal(running, 64);
});

test('duplicate broker cursors never mark history complete', async () => {
  const call = async () => ({ trading_cycles: [{ id: 1 }], next_cursor: 'again' });
  const first = await readHistoryPage('42', null, call, at);
  const second = await readHistoryPage('42', first.cursor, call, at);
  assert.equal(second.status, 'PARTIAL');
  assert.ok(second.blockedReason);
});

test('jitter follows Retry-After seconds or HTTP date', () => {
  assert.equal(retryDelay('3', 0, () => 0), 3000);
  assert.ok(retryDelay('Thu, 01 Jan 1970 00:00:05 GMT', 1000, () => 0.5) > 4000);
});

test('readSnapshot supports FundedNext nested account_details/stats overview and numeric lots while redacting passwords', async () => {
  const snapshot = await readSnapshot('4613642', async (tool, args) => {
    assert.equal(args.account_id, 4613642);
    if (tool === 'get_account_overview') {
      return {
        account_details: { login: 14359161, initial_balance: 6000, password: 'secret', investor_password: 'secret' },
        stats: { balance: 6172.23, equity: 6177.51, profit: 172.23 },
      };
    }
    assert.equal(tool, 'get_running_trades');
    return {
      trades: {
        current_page: 1, last_page: 1,
        data: [{
          id: 421634299, account_id: 4613642, symbol: 'XAUUSD', type: 0, type_str: 'Buy',
          lots: 0.04, volume: 4, open_price: 3786.5, sl: 3776.5, tp: 3798.5,
          open_time_str: '2026.11.18 06:30:13', profit: '-5.560000', close_time_str: 'Currently Running',
        }],
      },
    };
  }, at);

  assert.equal(snapshot.balance, '6172.23');
  assert.equal(snapshot.equity, '6177.51');
  assert.equal(snapshot.initialBalance, '6000');
  assert.equal(snapshot.netProfit, '172.23');
  assert.equal(snapshot.floatingPnl, '5.28');
  assert.equal(snapshot.openPositions.length, 1);
  assert.equal(snapshot.openPositions[0].volume, '0.04');
  assert.equal(snapshot.openPositions[0].side, 'BUY');
  assert.equal((snapshot.rawPayload as Record<string, unknown>).password, undefined);
  assert.equal((snapshot.rawPayload as Record<string, unknown>).investor_password, undefined);
  assert.ok(!snapshot.missingFields.length);
});

test('normalizeExecution computes netPnl cleanly when broker omits optional fee', () => {
  const trade = normalizeExecution('4613642', {
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
  }, at, '6124296');
  assert.equal(trade.netPnl, '15.6');
  assert.equal(trade.grossPnl, '15.84');
});

