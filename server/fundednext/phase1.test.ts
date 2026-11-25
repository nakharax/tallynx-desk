import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import express from 'express';
import { createFundedNextRouter } from './router.js';
import { FundedNextWorker } from '../../worker/index.js';
import { SqlitePilotStore } from './sqliteStore.js';
import { InMemoryPilotStore } from './store.js';
import { KmsEnvelopeCipher, LocalAesGcmKmsProvider, redactSecrets } from './cryptoEnvelope.js';
import { createFundedNextRuntime, OAuthPkceManager } from './oauthPkce.js';
import { McpReadError, normalizeExecution, normalizeSnapshot } from './mcpConnector.js';
import { toDecimalString } from './decimalMath.js';
import { createFundedNextVpsHandler } from './vpsHubHandler.js';
import { createRemoteVpsPilotServices } from './vpsClient.js';
import {
  ReplayNonceCache,
  signVpsRpcRequest,
  verifyVpsRpcRequest,
  VPS_RPC_MAX_SKEW_MS,
} from './vpsRpc.js';
import { createApp } from '../../server.js';

const cipher = new KmsEnvelopeCipher(new LocalAesGcmKmsProvider(Buffer.alloc(32, 7)));
const token = { accessToken: 'sample-access-value', refreshToken: 'sample-refresh-value', tokenExpiresAt: 10_000 };
const at = '2026-11-18T12:00:00.000Z';

async function seedPilot(store: InMemoryPilotStore, uid: string) {
  await store.setAllowlisted(uid, true);
}

async function seedAccounts(store: InMemoryPilotStore, uid: string) {
  await seedPilot(store, uid);
  await store.activateConnection(uid, `connection-${uid}`, await cipher.encryptTokens(token));
  const lease = await store.leaseNext('seed', 1_000);
  assert.ok(lease);
  await store.saveAccounts(lease, ['a', 'b', 'c', 'd'].map(accountId => ({
    accountId, login: accountId, rawPayload: {}, fetchedAt: at,
  })));
  await store.finish(lease);
  return store.listAccounts(uid);
}

async function listen(app: express.Express, t: { after: (fn: () => void) => void }) {
  const server = app.listen(0, '127.0.0.1');
  t.after(() => server.close());
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}

test('legacy FundedNext routes consistently require the pilot connection flow', async (t) => {
  const origin = await listen(createApp(), t);
  for (const [path, method, body] of [
    ['/fundednext-live', 'POST', { token: 'legacy' }],
    ['/sync-readonly', 'POST', { provider: 'FUNDEDNEXT_MCP', token: 'legacy' }],
    ['/fundednext-oauth/start', 'POST', { mcpUrl: 'invalid' }],
    ['/fundednext-oauth/callback', 'GET', undefined],
    ['/fundednext-oauth/refresh', 'POST', { refreshToken: 'legacy' }],
  ] as const) {
    const response = await fetch(origin + '/api/mt5' + path, {
      method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body),
    });
    assert.equal(response.status, 409, path);
    assert.deepEqual(await response.json(), {
      ok: false, code: 'reconnect_required', status: 'reconnect_required',
      error: 'Reconnect FundedNext through the pilot connection flow.',
    });
  }
});

test('pilot OAuth popup returns only connection metadata and emits a safe error result', async (t) => {
  const store = new InMemoryPilotStore();
  await seedPilot(store, 'alice');
  const app = express();
  const oauth = new OAuthPkceManager({
    store, cipher, authorizationEndpoint: 'https://broker.example/authorize', clientId: 'pilot-client',
    redirectUri: 'https://desk.example/api/fundednext/oauth/callback', fetchTokens: async () => token,
  });
  app.use('/api/fundednext', createFundedNextRouter({ verifyIdToken: async () => ({ uid: 'alice' }), services: () => ({ store, oauth }) }));
  const origin = await listen(app, t);
  const start = await fetch(origin + '/api/fundednext/connections', { method: 'POST', headers: { Authorization: 'Bearer alice' } });
  const cookie = start.headers.get('set-cookie')!.split(';', 1)[0];
  const { authorizeUrl } = await start.json();
  const state = new URL(authorizeUrl).searchParams.get('state');
  const url = origin + '/api/fundednext/oauth/callback?state=' + state + '&code=sample-authorization-code';
  const request = () => fetch(url, { headers: { Accept: 'text/html', cookie } });
  const callback = await request();
  assert.equal(callback.status, 200);
  assert.match(callback.headers.get('content-type')!, /^text\/html/);
  const html = await callback.text();
  assert.doesNotMatch(html, /access[_-]?token|refresh[_-]?token|sample-access-value|sample-refresh-value|sample-authorization-code/i);
  assert.match(html, /tallynx_fn_pilot_oauth/);
  assert.match(html, /postMessage/);
  assert.match(html, /window\.close/);
  const result = JSON.parse(html.match(/const result = (.*);/)![1]);
  assert.deepEqual(result, { type: 'TALLYNX_FN_PILOT_OAUTH_RESULT', ok: true, connectionId: result.connectionId, status: 'CONNECTED' });
  assert.match(result.connectionId, /^[\w-]+$/);
  const replay = await request();
  assert.equal(replay.status, 400);
  const failureHtml = await replay.text();
  assert.match(replay.headers.get('content-type')!, /^text\/html/);
  assert.deepEqual(JSON.parse(failureHtml.match(/const result = (.*);/)![1]), {
    type: 'TALLYNX_FN_PILOT_OAUTH_RESULT', ok: false, error: 'Invalid or expired OAuth session',
  });
});

test('pilot HTTP API verifies the caller, scopes account reads and queues sync', async (t) => {
  const store = new InMemoryPilotStore();
  const app = express();
  app.use(express.json());
  const pilots = new Set(['alice', 'bob']);
  app.use('/api/fundednext', createFundedNextRouter({
    verifyIdToken: async token => pilots.has(token) ? {uid: token} : null,
    services: () => ({ store, oauth: {
      start: async () => ({ authorizeUrl: 'https://example.test/auth', browserSession: 's'.repeat(43) }),
      callback: async () => ({ connectionId: 'c', status: 'CONNECTED' as const })
    } })
  }));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => server.close());
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const { port } = address;
  async function request(path: string, uid?: string, method = 'GET', body?: object, cookie?: string) {
    return fetch(`http://127.0.0.1:${port}/api/fundednext${path}`, {
      method, headers: { ...(uid && {Authorization: `Bearer ${uid}`}), ...(cookie && { cookie }), 'content-type': 'application/json' },
      body: body && JSON.stringify(body)
    });
  }
  assert.equal((await request('/accounts')).status, 401);
  assert.equal((await request('/accounts','bogus')).status, 401);
  assert.equal((await request('/accounts','alice')).status, 403);
  await seedPilot(store, 'alice');
  await seedPilot(store, 'bob');
  const start = await request('/connections', 'alice', 'POST');
  assert.equal(start.status, 201);
  assert.match(start.headers.get('set-cookie')!, /HttpOnly/i);
  assert.match(start.headers.get('set-cookie')!, /SameSite=Lax/i);
  assert.deepEqual(Object.keys(await start.json()), ['authorizeUrl']);
  const cookie = start.headers.get('set-cookie')!.split(';', 1)[0];
  const callback = '/oauth/callback?state=state&code=code';
  assert.equal((await request(callback)).status, 401);
  assert.equal((await request(callback, 'bob', 'GET', undefined, cookie)).status, 403);
  assert.deepEqual(await (await request(callback, undefined, 'GET', undefined, cookie)).json(), { connectionId: 'c', status: 'CONNECTED' });
  const accounts = await seedAccounts(store, 'alice');
  const directory = await request(`/accounts?connectionId=${accounts[0].connectionId}`, 'alice');
  assert.equal((await directory.json()).connectionStatus, 'CONNECTED');
  assert.equal((await request(`/accounts?connectionId=${accounts[0].connectionId}`, 'bob')).status, 404);
  const accountPath = '/accounts/' + accounts[0].id;
  for (const [path, method, body] of [
    [accountPath + '/snapshot', 'GET'], [accountPath + '/executions', 'GET'],
    [accountPath + '/sync', 'POST'], [accountPath + '/tracking', 'PATCH', {tracked: true}],
    ['/connections/' + accounts[0].connectionId, 'DELETE']
  ] as const) {
    assert.ok([403,404].includes((await request(path,'bob',method,body)).status));
  }
  assert.deepEqual((await (await request('/accounts','bob')).json()).accounts, []);
  for (const [index, account] of accounts.entries()) {
    const response = await request('/accounts/'+account.id+'/tracking','alice','PATCH',{tracked: true});
    assert.equal(response.status, index < 3 ? 200 : 409);
  }
  const sync = async () => request(accountPath+'/sync','alice','POST');
  const first = await sync();
  assert.equal(first.status,202);
  assert.deepEqual(await first.json(), await (await sync()).json());
  const input = {importId:'batch',rows:[{note:'uncertain legacy match'}]};
  const send = async () => (await request('/journal-imports','alice','POST',input)).json();
  assert.deepEqual(await send(), {imported:1,unlinked:1});
  assert.deepEqual(await send(), {imported:1,unlinked:1});
  assert.equal((await request('/connections/' + accounts[0].connectionId, 'alice', 'DELETE')).status, 200);
  for (const [path, method, body] of [
    [accountPath + '/snapshot', 'GET', undefined], [accountPath + '/tracking', 'PATCH', { tracked: true }],
    [accountPath + '/sync', 'POST', undefined],
  ] as const) {
    const response = await request(path, 'alice', method, body);
    assert.equal(response.status, 409);
    const result = await response.json();
    assert.equal(result.code, 'reconnect_required');
    assert.equal(result.status, 'reconnect_required');
  }
});

test('pilot sync completeness follows worker progress and broker evidence', async () => {
  const store = new InMemoryPilotStore({ now: () => 0 });
  const [account] = await seedAccounts(store, 'alice');
  await store.setTracked('alice', account.connectionId, account.id, true);
  const state = () => store.getAccountSnapshotState('alice', account.id);
  assert.deepEqual(await state(), { snapshot: null, syncStatus: 'SYNCING' });
  const snapshot = await store.leaseNext('worker', 1000);
  assert.ok(snapshot && snapshot.type === 'SNAPSHOT');
  await store.saveSnapshot(snapshot, normalizeSnapshot(account.accountId, {
    balance: '100', equity: '101', initial_balance: '100', net_profit: '0', timestamp: at, currency: 'USD',
  }, [], at));
  await store.finish(snapshot);
  const backfill = await store.leaseNext('worker', 1000);
  assert.ok(backfill && backfill.type === 'BACKFILL_PAGE');
  await store.finish(backfill, {
    nextRunAt: 0, cursor: { stage: 'history', cycleIds: [], cycleIndex: 0, page: 2, token: null, seen: [], seenPages: [] },
  });
  assert.equal((await state()).syncStatus, 'PARTIAL');
  const continuation = await store.leaseNext('worker', 1000);
  assert.ok(continuation);
  await store.finish(continuation);
  assert.equal((await state()).syncStatus, 'COMPLETE');
  assert.equal((await state()).snapshot?.sourceTimestampRaw, at);
  assert.equal((await state()).snapshot?.fetchedAt, at);
  await store.enqueueSync('alice', account.id);
  assert.equal((await state()).syncStatus, 'SYNCING');
  const incremental = await store.leaseNext('worker', 1000);
  assert.ok(incremental && incremental.type === 'INCREMENTAL');
  await store.finish(incremental, { status: 'DEGRADED', blockedReason: 'Broker synchronization temporarily unavailable' });
  assert.equal((await state()).syncStatus, 'DEGRADED');
  await store.disconnect('alice', account.connectionId);
  assert.deepEqual(await state(), { snapshot: null, syncStatus: 'RECONNECT_REQUIRED' });
});

test('OAuth consumes a correctly bound state once and rejects expired state', async () => {
  let now = 0;
  let exchanges = 0;
  const store = new InMemoryPilotStore({ now: () => now });
  await seedPilot(store, 'alice');
  await seedPilot(store, 'bob');
  let verifier = '';
  const oauth = new OAuthPkceManager({
    store, cipher, now: () => now,
    authorizationEndpoint: 'https://broker.example/authorize',
    clientId: 'pilot-client', redirectUri: 'https://desk.example/api/fundednext/oauth/callback',
    fetchTokens: async ({ codeVerifier }) => { exchanges++; verifier = codeVerifier; return token; },
  });
  await assert.rejects(oauth.start('outside-pilot'));
  const started = await oauth.start('alice');
  const callback = { state: started.state, code: 'code', browserSession: started.browserSession, uid: 'alice' };
  assert.ok(started.browserSession.length >= 43);
  await assert.rejects(oauth.callback({ ...callback, uid: 'bob' }));
  await assert.rejects(oauth.callback({ ...callback, browserSession: 'wrong' }));
  const simultaneous = await Promise.allSettled([oauth.callback(callback), oauth.callback(callback)]);
  assert.equal(simultaneous.filter(result => result.status === 'fulfilled').length, 1);
  const connected = simultaneous.find(result => result.status === 'fulfilled');
  assert.ok(connected && connected.status === 'fulfilled');
  assert.deepEqual(Object.keys(connected.value).sort(), ['connectionId', 'status']);
  assert.equal(connected.value.status, 'CONNECTED');
  assert.match(verifier, /^[\w-]{43,}$/);
  const authorization = new URL(started.authorizeUrl);
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(authorization.searchParams.get('code_challenge'), createHash('sha256').update(verifier).digest('base64url'));
  const expiring = await oauth.start('alice');
  now += 600_001;
  await assert.rejects(oauth.callback({ ...callback, ...expiring }));
  assert.equal(exchanges, 1);
});

test('credential envelopes round trip, authenticate their metadata and redact secrets', async () => {
  const envelope = await cipher.encryptTokens(token);
  assert.deepEqual(await cipher.decryptTokens(envelope), token);
  assert.ok(!JSON.stringify(envelope).includes(token.accessToken));
  assert.notEqual((await cipher.encryptTokens(token)).ciphertext, envelope.ciphertext);
  await assert.rejects(cipher.decryptTokens({ ...envelope, tokenExpiresAt: envelope.tokenExpiresAt + 1 }));
  const redacted = redactSecrets('Bearer alpha access_token=beta&refresh_token=gamma {"client_secret":"delta x","code_verifier":"epsilon"}');
  for (const secret of ['alpha', 'beta', 'gamma', 'delta', 'epsilon']) assert.ok(!redacted.includes(secret));
});

test('worker takes a due snapshot before a queued backfill or incremental job', async () => {
  const store = new InMemoryPilotStore({ now: () => 0 });
  const [account] = await seedAccounts(store, 'alice');
  await store.setTracked('alice', account.connectionId, account.id, true);
  await store.enqueueSync('alice', account.id, 'INCREMENTAL');
  await seedPilot(store, 'bob');
  await store.activateConnection('bob', 'connection-bob', await cipher.encryptTokens(token));
  const calls: string[] = [];
  const worker = new FundedNextWorker({ store, cipher, now: () => 0, openClient: () => ({
    callTool: async tool => { calls.push(tool); return tool === 'get_running_trades' ? [] : { balance: '1', equity: '1' }; },
  }) });
  assert.equal(await worker.runOnce(), true);
  assert.deepEqual(calls, ['get_account_overview', 'get_running_trades']);
  assert.equal((await store.getSnapshot('alice', account.id))?.balance, '1');
});

test('pilot revocation blocks credential reads, new leases and manual sync requests', async () => {
  const store = new InMemoryPilotStore({ now: () => 0 });
  const [account] = await seedAccounts(store, 'alice');
  await store.setTracked('alice', account.connectionId, account.id, true);
  const lease = await store.leaseNext('worker', 1000);
  assert.ok(lease);
  assert.deepEqual(await cipher.decryptTokens(await store.readCredential(lease)), token);
  await store.activateConnection('alice', 'connection-alice-other', await cipher.encryptTokens(token));

  await store.setAllowlisted('alice', false);
  assert.equal(await store.leaseNext('another-worker', 1000), null);
  await assert.rejects(store.readCredential(lease), { status: 409 });
  await assert.rejects(store.enqueueSync('alice', account.id), { status: 403 });
  const worker = new FundedNextWorker({ store, cipher, now: () => 0, openClient: () => {
    assert.fail('Revoked pilot must not open a broker client');
  } });
  assert.equal(await worker.runOnce(), false);
});

test('concurrent workers sharing a store do not refresh the same connection concurrently', async () => {
  let now = 0;
  const store = new InMemoryPilotStore({ now: () => now });
  const [first, second] = await seedAccounts(store, 'alice');
  await store.setTracked('alice', first.connectionId, first.id, true);
  await store.setTracked('alice', second.connectionId, second.id, true);
  now = token.tokenExpiresAt;
  let entered!: () => void;
  let release!: () => void;
  const refreshing = new Promise<void>(resolve => { entered = resolve; });
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let refreshes = 0;
  const options: ConstructorParameters<typeof FundedNextWorker>[0] = {
    store, cipher, now: () => now,
    openClient: () => ({ callTool: async tool => tool === 'get_running_trades' ? [] : { balance: '1' } }),
    refreshTokens: async () => {
      refreshes++;
      entered();
      await blocked;
      return { ...token, tokenExpiresAt: now + 60_000 };
    },
  };
  const worker = new FundedNextWorker(options);
  const other = new FundedNextWorker(options);
  const firstRun = worker.runOnce();
  try {
    await refreshing;
    assert.equal(await other.runOnce(), false);
  } finally {
    release();
    await firstRun;
  }
  assert.equal(await other.runOnce(), true);
  assert.equal(refreshes, 1);
});

test('equal snapshots update heartbeat without replacing stored broker evidence', async () => {
  let now = 0;
  const store = new InMemoryPilotStore({ now: () => now });
  const [account] = await seedAccounts(store, 'alice');
  await store.setTracked('alice', account.connectionId, account.id, true);
  const lease = await store.leaseNext('worker', 1000);
  assert.ok(lease);
  const snapshot = normalizeSnapshot(account.accountId, { balance: '10' }, [], at);
  assert.equal(await store.saveSnapshot(lease, snapshot), true);
  now += 10;
  assert.equal(await store.saveSnapshot(lease, { ...snapshot, fetchedAt: 'later' }), false);
  const stored = await store.getSnapshot('alice', account.id);
  assert.equal(stored?.fetchedAt, at);
  assert.equal(stored?.lastCheckedAt, new Date(now).toISOString());
});

test('snapshot writes queue one incremental sync on a balance or net profit change', async () => {
  let now = 0;
  const store = new InMemoryPilotStore({ now: () => now });
  const [account] = await seedAccounts(store, 'alice');
  await store.setTracked('alice', account.connectionId, account.id, true);
  const takeSnapshot = async () => {
    const lease = await store.leaseNext('worker', 1000);
    assert.ok(lease && lease.type === 'SNAPSHOT');
    return lease;
  };
  const write = (lease: Awaited<ReturnType<typeof takeSnapshot>>, balance: string, netProfit: string, equity = balance) =>
    store.saveSnapshot(lease, normalizeSnapshot(account.accountId, {
      balance, equity, initial_balance: '100', net_profit: netProfit, timestamp: at, currency: 'USD',
    }, [], at), { queueIncrementalOnBalanceChange: true });
  const state = () => store.getAccountSnapshotState('alice', account.id);

  const first = await takeSnapshot();
  assert.equal(await write(first, '100', '0'), true);
  await store.finish(first, { nextRunAt: 10 });
  const backfill = await store.leaseNext('worker', 1000);
  assert.ok(backfill && backfill.type === 'BACKFILL_PAGE');
  await store.finish(backfill);
  assert.equal((await state()).syncStatus, 'COMPLETE');
  assert.equal(await store.leaseNext('worker', 1000), null);

  now = 10;
  const second = await takeSnapshot();
  assert.equal(await write(second, '100', '0', '101'), true);
  assert.equal((await state()).syncStatus, 'COMPLETE');
  const saving = write(second, '105', '0');
  const observing = state();
  assert.equal(await saving, true);
  const observed = await observing;
  assert.equal(observed.snapshot?.balance, '105');
  assert.equal(observed.syncStatus, 'SYNCING');
  assert.equal(await write(second, '105', '0'), false);
  await store.finish(second, { nextRunAt: 20 });
  const incremental = await store.leaseNext('worker', 1000);
  assert.ok(incremental && incremental.type === 'INCREMENTAL');
  await store.finish(incremental);
  assert.equal(await store.leaseNext('worker', 1000), null);

  now = 20;
  const third = await takeSnapshot();
  assert.equal(await write(third, '105', '5'), true);
  assert.equal((await state()).syncStatus, 'SYNCING');
});

test('trade PnL treats omitted costs as zero and rejects explicitly malformed costs', () => {
  const raw = { deal_id: 'a', type: 'buy', profit: '15.84', commission: '-0.24', swap: '0' };
  const trade = normalizeExecution('account', raw, at);
  assert.equal(trade.fee, '0');
  assert.equal(trade.netPnl, '15.6');
  for (const field of ['commission', 'swap', 'fee'] as const) {
    const invalid = normalizeExecution('account', { ...raw, [field]: 'invalid' }, at);
    assert.equal(invalid[field], null);
    assert.equal(invalid.netPnl, null);
  }
  for (const value of ['1e999999999999999999999', '1e-999999999999999999999', '-2e999999999999999999999']) {
    assert.equal(toDecimalString(value), null);
  }
  assert.equal(toDecimalString('1e-256'), `0.${'0'.repeat(255)}1`);
  assert.equal(toDecimalString('9007199254740993.10'), '9007199254740993.1');
});

test('disconnect preserves snapshots and rejects late writes from the old generation', async () => {
  const store = new InMemoryPilotStore();
  const [account] = await seedAccounts(store, 'alice');
  await store.setTracked('alice', account.connectionId, account.id, true);
  const lease = await store.leaseNext('worker', 1000);
  assert.ok(lease);
  const snapshot = normalizeSnapshot(account.accountId, { balance: '10' }, [], at);
  await store.saveSnapshot(lease, snapshot);
  const disconnected = await store.disconnect('alice', account.connectionId);
  assert.ok(disconnected.generation > lease.generation);
  await assert.rejects(store.enqueueSync('alice', account.id), { code: 'reconnect_required' });
  await assert.rejects(store.saveSnapshot(lease, normalizeSnapshot(account.accountId, { balance: '20' }, [], at)));
  await assert.rejects(store.finish(lease));
  assert.equal((await store.getSnapshot('alice', account.id))?.balance, '10');
});

test('degraded snapshot polls retain evidence and confirmed quiet polls wait sixty seconds', async () => {
  let now = 0;
  const store = new InMemoryPilotStore({ now: () => now });
  const [account] = await seedAccounts(store, 'alice');
  await store.enqueueSync('alice', account.id, 'SNAPSHOT');
  let shouldFail = false;
  let snapshots = 0;
  const worker = new FundedNextWorker({ store, cipher, now: () => now,
    refreshTokens: async () => ({ ...token, tokenExpiresAt: now + 120_000 }),
    openClient: () => ({ callTool: async tool => {
      if (tool === 'get_running_trades') return [];
      snapshots++;
      if (shouldFail) throw new McpReadError(429, '20');
      return { equity: '11', market_closed: true };
    } }),
  });
  assert.equal(await worker.runOnce(), true);
  now = 59_999;
  assert.equal(await worker.runOnce(), false);
  now++;
  shouldFail = true;
  assert.equal(await worker.runOnce(), true);
  const snapshot = await store.getSnapshot('alice', account.id);
  assert.equal(snapshot?.equity, '11');
  assert.equal(snapshot?.status, 'DEGRADED');
  assert.equal(snapshot?.lastCheckedAt, new Date(0).toISOString());
  now += 19_999;
  assert.equal(await worker.runOnce(), false);
  assert.equal(snapshots, 2);
});

test('journal imports link only exact unique executions and are idempotent', async () => {
  const store = new InMemoryPilotStore({ now: () => 0 });
  const [first, second] = await seedAccounts(store, 'alice');
  for (const account of [first, second]) {
    await store.enqueueSync('alice', account.id);
    const lease = await store.leaseNext('worker', 1000);
    assert.ok(lease);
    await store.saveExecutions(lease, ['one', 'two'].map(deal_id =>
      normalizeExecution(account.accountId, { deal_id, type: 'buy', lots: '1.00' }, at)));
    await store.finish(lease);
  }
  const page = await store.listExecutions('alice', first.id, undefined, 1);
  assert.equal(page.executions.length, 1);
  assert.ok(page.nextCursor);
  const next = await store.listExecutions('alice', first.id, page.nextCursor, 1);
  assert.equal(next.nextCursor, null);
  assert.notEqual(next.executions[0].id, page.executions[0].id);
  const result = await store.importJournalBatch('alice', 'journal-1', [
    { accountId: first.id, dealId: 'one', note: 'Exact source' },
    { dealId: 'one', note: 'Ambiguous account' },
    { executionId: second.accountId + '_two', note: 'Exact execution' },
  ]);
  assert.deepEqual(result, { imported: 3, unlinked: 1 });
  assert.deepEqual(await store.importJournalBatch('alice', 'journal-1', [{ note: 'Retry payload' }]), result);
});

test('createFundedNextRuntime initializes envelope cipher cleanly with FUNDEDNEXT_MASTER_KEY and defaults', async () => {
  const prevMaster = process.env.FUNDEDNEXT_MASTER_KEY;
  const prevKms = process.env.FUNDEDNEXT_KMS_KEY_NAME;
  const prevProject = process.env.FUNDEDNEXT_FIRESTORE_PROJECT_ID;
  try {
    delete process.env.FUNDEDNEXT_KMS_KEY_NAME;
    process.env.FUNDEDNEXT_MASTER_KEY = 'a'.repeat(64);
    process.env.FUNDEDNEXT_FIRESTORE_PROJECT_ID = 'test-project';
    const runtime = createFundedNextRuntime();
    const env = await runtime.cipher.encryptTokens(token);
    assert.equal(env.kmsKeyVersion, 'local/1');
    assert.deepEqual(await runtime.cipher.decryptTokens(env), token);
  } finally {
    if (prevMaster === undefined) delete process.env.FUNDEDNEXT_MASTER_KEY;
    else process.env.FUNDEDNEXT_MASTER_KEY = prevMaster;
    if (prevKms !== undefined) process.env.FUNDEDNEXT_KMS_KEY_NAME = prevKms;
    if (prevProject === undefined) delete process.env.FUNDEDNEXT_FIRESTORE_PROJECT_ID;
    else process.env.FUNDEDNEXT_FIRESTORE_PROJECT_ID = prevProject;
  }
});

test('worker automatically queues incremental history sync when a tracked balance changes', async () => {
  let now = 0;
  const store = new InMemoryPilotStore({ now: () => now });
  const [account] = await seedAccounts(store, 'alice');
  await store.setTracked('alice', account.connectionId, account.id, true);
  let bal = '6172.95';
  let incrementalRuns = 0;
  const worker = new FundedNextWorker({
    store, cipher, now: () => now,
    refreshTokens: async () => ({ ...token, tokenExpiresAt: now + 120_000 }),
    openClient: () => ({
      callTool: async tool => {
        if (tool === 'get_account_overview') return { balance: bal, equity: bal, net_profit: bal };
        if (tool === 'get_running_trades') return [];
        if (tool === 'get_account_cycles') { incrementalRuns++; return { trading_cycles: [] }; }
        return [];
      },
    }),
  });
  await worker.runOnce(); // SNAPSHOT #1
  await worker.runOnce(); // initial BACKFILL_PAGE
  assert.equal(incrementalRuns, 1);
  now = 20_000;
  bal = '6236.07';
  await worker.runOnce(); // SNAPSHOT #2 detects balance change -> queues INCREMENTAL
  await worker.runOnce(); // executes INCREMENTAL immediately
  assert.equal(incrementalRuns, 2);
});

test('vpsRpc HMAC signing rejects short secrets, skew, tampering and replayed nonces', () => {
  const secret = 'k'.repeat(64);
  const nonces = new ReplayNonceCache();
  let now = 1_795_000_000_000;
  const path = '/fundednext-rpc/accounts/list';
  const body = JSON.stringify({ connectionId: 'conn-1' });
  const headers = signVpsRpcRequest({
    secret,
    method: 'POST',
    path,
    uid: 'alice',
    body,
    now,
    nonce: 'a'.repeat(32),
  });

  const valid = verifyVpsRpcRequest({
    secret,
    method: 'POST',
    path,
    headers,
    body,
    nonces,
    now: () => now,
  });
  assert.deepEqual(valid, { ok: true, uid: 'alice' });

  // Nonce replay must be rejected
  assert.equal(
    verifyVpsRpcRequest({ secret, method: 'POST', path, headers, body, nonces, now: () => now }).ok,
    false
  );

  // Tampered UID / body / path rejected
  const h2 = signVpsRpcRequest({ secret, method: 'POST', path, uid: 'alice', body, now, nonce: 'b'.repeat(32) });
  assert.equal(
    verifyVpsRpcRequest({ secret, method: 'POST', path, headers: { ...h2, 'x-tredyn-uid': 'bob' }, body, nonces, now: () => now }).ok,
    false
  );
  assert.equal(
    verifyVpsRpcRequest({ secret, method: 'POST', path: '/fundednext-rpc/accounts/sync', headers: h2, body, nonces, now: () => now }).ok,
    false
  );
  assert.equal(
    verifyVpsRpcRequest({ secret, method: 'POST', path, headers: h2, body: body + ' ', nonces, now: () => now }).ok,
    false
  );

  // Clock skew > 30s rejected & short secret fails closed
  assert.equal(
    verifyVpsRpcRequest({
      secret,
      method: 'POST',
      path,
      headers: h2,
      body,
      nonces,
      now: () => now + VPS_RPC_MAX_SKEW_MS + 1,
    }).ok,
    false
  );
  assert.deepEqual(
    verifyVpsRpcRequest({ secret: 'short', method: 'POST', path, headers: h2, body, nonces, now: () => now }),
    { ok: false, status: 503, error: 'FundedNext VPS RPC secret is not configured' }
  );
});

test('SqlitePilotStore persists accounts, snapshots, masked updates, executions, and journal across restarts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fn-sqlite-'));
  const dbPath = join(dir, 'pilot.db');
  let now = 1000;
  try {
    const store1 = new SqlitePilotStore({ dbPath, now: () => now });
    await store1.setAllowlisted('alice', true);
    assert.equal(await store1.isAllowlisted('alice'), true);
    assert.equal(await store1.isAllowlisted('bob'), false);

    await store1.activateConnection('alice', 'conn-1', await cipher.encryptTokens(token));
    const discLease = await store1.leaseNext('w1', 5000);
    assert.ok(discLease && discLease.type === 'INITIAL_DISCOVERY');
    await store1.saveAccounts(discLease, [
      { accountId: '4613642', login: '14359161', rawPayload: {}, fetchedAt: at },
      { accountId: '4811064', login: '14405772', rawPayload: {}, fetchedAt: at },
    ]);
    await store1.finish(discLease, { status: 'CONNECTED' });

    const [acc] = await store1.listAccounts('alice');
    await store1.setTracked('alice', acc.connectionId, acc.id, true);
    const snapLease = await store1.leaseNext('w1', 5000);
    assert.ok(snapLease && snapLease.type === 'SNAPSHOT');
    await store1.saveSnapshot(snapLease, normalizeSnapshot(acc.accountId, { balance: '6236.07', equity: '6236.07' }, [], at));
    await store1.finish(snapLease, { status: 'CONNECTED', nextRunAt: now + 60_000 });

    const backfillLease = await store1.leaseNext('w1', 5000);
    assert.ok(backfillLease && backfillLease.type === 'BACKFILL_PAGE');
    await store1.saveExecutions(backfillLease, [
      normalizeExecution(acc.accountId, { deal_id: 'deal-1', type: 'buy', lots: '0.04', profit: '42.00' }, at),
    ]);
    await store1.finish(backfillLease, { status: 'CONNECTED' });
    store1.close();

    // Reopen fresh SqlitePilotStore against same file -> everything survives
    const store2 = new SqlitePilotStore({ dbPath, now: () => now });
    try {
      assert.equal(await store2.isAllowlisted('alice'), true);
      const list = await store2.listAccounts('alice');
      assert.equal(list.length, 2);
      const state = await store2.getAccountSnapshotState('alice', acc.id);
      assert.equal(state.snapshot?.balance, '6236.07');
      const execs = await store2.listExecutions('alice', acc.id, undefined, 10);
      assert.equal(execs.executions.length, 1);
      assert.equal(execs.executions[0].dealId, 'deal-1');
      const imported = await store2.importJournalBatch('alice', 'imp-1', [{ deal_id: 'deal-1', note: 'Clean setup' }]);
      assert.deepEqual(imported, { imported: 1, unlinked: 0 });
    } finally {
      store2.close();
    }
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch {
      // Windows temp folder lock from Defender may linger briefly after DB close
    }
  }
});

test('End-to-end Vercel BFF <-> HMAC VPS RPC <-> SqlitePilotStore + Worker syncs cleanly', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'fn-e2e-'));
  const dbPath = join(dir, 'pilot.db');
  const rpcSecret = 's'.repeat(64);
  const store = new SqlitePilotStore({ dbPath });
  await store.setAllowlisted('alice', true);
  let woke = 0;

  const oauth = new OAuthPkceManager({
    store,
    cipher,
    authorizationEndpoint: 'https://broker.example/authorize',
    clientId: 'pilot-client',
    redirectUri: 'https://desk.example/api/fundednext/oauth/callback',
    fetchTokens: async () => ({ ...token, tokenExpiresAt: Date.now() + 120_000 }),
  });

  const handleRpc = createFundedNextVpsHandler({
    store,
    oauth,
    secret: rpcSecret,
    onWake: () => {
      woke++;
    },
  });

  const vpsServer = createServer((req, res) => {
    void handleRpc(req, res).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  vpsServer.listen(0, '127.0.0.1');
  await once(vpsServer, 'listening');
  const vpsAddr = vpsServer.address();
  assert.ok(vpsAddr && typeof vpsAddr === 'object');
  const vpsOrigin = `http://127.0.0.1:${vpsAddr.port}`;

  const bff = express();
  bff.use(express.json());
  bff.use(
    '/api/fundednext',
    createFundedNextRouter({
      verifyIdToken: async (tok) => (tok === 'alice' || tok === 'mallory' ? { uid: tok } : null),
      services: () => createRemoteVpsPilotServices({ baseUrl: vpsOrigin, secret: rpcSecret }),
    })
  );
  const bffOrigin = await listen(bff, t);
  t.after(() => {
    vpsServer.close();
    store.close();
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch {
      // Windows temp folder lock from Defender may linger briefly after DB close
    }
  });

  // Unallowlisted caller rejected by VPS01 inside single signed RPC hop
  const denied = await fetch(`${bffOrigin}/api/fundednext/accounts`, {
    headers: { Authorization: 'Bearer mallory' },
  });
  assert.equal(denied.status, 403);

  // Full OAuth start + callback through Vercel BFF -> HMAC RPC -> SQLite
  const start = await fetch(`${bffOrigin}/api/fundednext/connections`, {
    method: 'POST',
    headers: { Authorization: 'Bearer alice' },
  });
  assert.equal(start.status, 201);
  const cookie = start.headers.get('set-cookie')!.split(';', 1)[0];
  const { authorizeUrl } = await start.json();
  const state = new URL(authorizeUrl).searchParams.get('state');
  const cb = await fetch(`${bffOrigin}/api/fundednext/oauth/callback?state=${state}&code=auth-code`, {
    headers: { cookie, Accept: 'application/json' },
  });
  assert.equal(cb.status, 200);
  assert.equal(woke, 1);

  // Worker discovers accounts & syncs tracked snapshot in SQLite
  const worker = new FundedNextWorker({
    store,
    cipher,
    refreshTokens: async () => ({ ...token, tokenExpiresAt: Date.now() + 120_000 }),
    openClient: () => ({
      callTool: async (tool) => {
        if (tool === 'get_accounts' || tool === 'get_accounts_v2') return [{ account_id: '4613642', login: '14359161' }];
        if (tool === 'get_account_overview') return { balance: '6250.00', equity: '6250.00', net_profit: '250.00' };
        if (tool === 'get_running_trades') return [];
        if (tool === 'get_account_cycles') return { trading_cycles: [] };
        return [];
      },
    }),
  });
  assert.equal(await worker.runOnce(), true); // INITIAL_DISCOVERY

  const dirResp = await fetch(`${bffOrigin}/api/fundednext/accounts`, {
    headers: { Authorization: 'Bearer alice' },
  });
  const dirJson = await dirResp.json();
  assert.equal(dirJson.accounts.length, 1);
  const accountRef = dirJson.accounts[0].id;

  const trackResp = await fetch(`${bffOrigin}/api/fundednext/accounts/${accountRef}/tracking`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer alice', 'Content-Type': 'application/json' },
    body: JSON.stringify({ tracked: true }),
  });
  assert.equal(trackResp.status, 200);
  assert.equal(woke, 2);

  assert.equal(await worker.runOnce(), true); // SNAPSHOT
  const snapResp = await fetch(`${bffOrigin}/api/fundednext/accounts/${accountRef}/snapshot`, {
    headers: { Authorization: 'Bearer alice' },
  });
  assert.equal(snapResp.status, 200);
  const snapJson = await snapResp.json();
  assert.equal(snapJson.snapshot.balance, '6250');
});

test('createFundedNextRuntimeForStore caches dynamic client_id, resets on invalid_client, and surfaces 502 on registration failure', async (t) => {
  const store = new InMemoryPilotStore();
  await seedPilot(store, 'alice');
  const prevMaster = process.env.FUNDEDNEXT_MASTER_KEY;
  const prevClientId = process.env.FUNDEDNEXT_OAUTH_CLIENT_ID;
  const prevRedirect = process.env.FUNDEDNEXT_OAUTH_REDIRECT_URI;
  let registrations = 0;
  let failRegistration = false;
  let failTokenInvalidClient = false;

  try {
    process.env.FUNDEDNEXT_MASTER_KEY = 'b'.repeat(64);
    delete process.env.FUNDEDNEXT_OAUTH_CLIENT_ID;
    process.env.FUNDEDNEXT_OAUTH_REDIRECT_URI = 'https://desk.example/api/fundednext/oauth/callback';

    const { createFundedNextRuntimeForStore } = await import('./oauthPkce.js');
    const runtime = createFundedNextRuntimeForStore(store, {
      fetch: async (url) => {
        const target = String(url);
        if (target.endsWith('/oauth/register')) {
          registrations++;
          if (failRegistration) {
            return Response.json({ error: 'invalid_client_metadata' }, { status: 400 });
          }
          return Response.json({ client_id: `dyn_client_${registrations}` }, { status: 201 });
        }
        if (target.endsWith('/oauth/token')) {
          if (failTokenInvalidClient) {
            return Response.json({ error: 'invalid_client' }, { status: 401 });
          }
          return Response.json({ access_token: 'tok', refresh_token: 'ref', expires_in: 3600 });
        }
        throw new Error(`Unexpected fetch: ${target}`);
      },
    });

    const s1 = await runtime.oauth.start('alice');
    const s2 = await runtime.oauth.start('alice');
    assert.equal(registrations, 1);
    assert.equal(new URL(s1.authorizeUrl).searchParams.get('client_id'), 'dyn_client_1');
    assert.equal(new URL(s2.authorizeUrl).searchParams.get('client_id'), 'dyn_client_1');

    failTokenInvalidClient = true;
    await assert.rejects(
      runtime.oauth.callback({ state: s1.state, code: 'code-1', browserSession: s1.browserSession, uid: 'alice' })
    );
    failTokenInvalidClient = false;

    const s3 = await runtime.oauth.start('alice');
    assert.equal(registrations, 2);
    assert.equal(new URL(s3.authorizeUrl).searchParams.get('client_id'), 'dyn_client_2');

    // Verify 502 registration error surfaces across VPS RPC -> BFF router
    const rpcSecret = 'r'.repeat(64);
    const handleRpc = createFundedNextVpsHandler({ store, oauth: runtime.oauth, secret: rpcSecret });
    const vpsServer = createServer((req, res) => {
      void handleRpc(req, res).then((handled) => {
        if (!handled) res.writeHead(404).end();
      });
    });
    vpsServer.listen(0, '127.0.0.1');
    t.after(() => vpsServer.close());
    await once(vpsServer, 'listening');
    const vpsAddr = vpsServer.address();
    assert.ok(vpsAddr && typeof vpsAddr === 'object');
    const bff = express();
    bff.use(express.json());
    bff.use('/api/fundednext', createFundedNextRouter({
      verifyIdToken: async () => ({ uid: 'alice' }),
      services: () => createRemoteVpsPilotServices({ baseUrl: `http://127.0.0.1:${vpsAddr.port}`, secret: rpcSecret }),
    }));
    const bffOrigin = await listen(bff, t);

    // Trigger invalid_client again so next start hits /oauth/register
    failTokenInvalidClient = true;
    await assert.rejects(
      runtime.oauth.callback({ state: s3.state, code: 'code-3', browserSession: s3.browserSession, uid: 'alice' })
    );
    failRegistration = true;
    const failedStart = await fetch(`${bffOrigin}/api/fundednext/connections`, {
      method: 'POST',
      headers: { Authorization: 'Bearer alice' },
    });
    assert.equal(failedStart.status, 502);
    const failedJson = await failedStart.json() as { error?: string };
    assert.match(failedJson.error ?? '', /FundedNext OAuth registration failed \(HTTP 400\)/);
  } finally {
    if (prevMaster === undefined) delete process.env.FUNDEDNEXT_MASTER_KEY;
    else process.env.FUNDEDNEXT_MASTER_KEY = prevMaster;
    if (prevClientId === undefined) delete process.env.FUNDEDNEXT_OAUTH_CLIENT_ID;
    else process.env.FUNDEDNEXT_OAUTH_CLIENT_ID = prevClientId;
    if (prevRedirect === undefined) delete process.env.FUNDEDNEXT_OAUTH_REDIRECT_URI;
    else process.env.FUNDEDNEXT_OAUTH_REDIRECT_URI = prevRedirect;
  }
});

test('multi-origin FundedNext OAuth enforces strict Desk allowlist, caches client_id per origin, and preserves session redirectUri in token exchange', async (t) => {
  const {
    createFundedNextRuntimeForStore,
    isTrustedDeskRedirectUri,
    resolveTrustedDeskRedirectUri,
  } = await import('./oauthPkce.js');

  assert.equal(
    resolveTrustedDeskRedirectUri({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'desk.tallynx.com, proxy.internal' }),
    'https://desk.tallynx.com/api/fundednext/oauth/callback'
  );
  assert.equal(
    resolveTrustedDeskRedirectUri({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'mall.tallynx.com' }),
    'https://mall.tallynx.com/api/fundednext/oauth/callback'
  );
  assert.equal(
    resolveTrustedDeskRedirectUri({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'tallynx-desk.vercel.app' }),
    'https://tallynx-desk.vercel.app/api/fundednext/oauth/callback'
  );
  assert.equal(
    resolveTrustedDeskRedirectUri({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'evil-clone.vercel.app' }),
    undefined
  );
  assert.equal(
    resolveTrustedDeskRedirectUri({ host: 'localhost:3000' }, { protocol: 'http', allowLocalhost: false }),
    undefined
  );
  assert.equal(
    resolveTrustedDeskRedirectUri({ host: 'localhost:3000' }, { protocol: 'http', allowLocalhost: true }),
    'http://localhost:3000/api/fundednext/oauth/callback'
  );
  assert.equal(
    isTrustedDeskRedirectUri('https://mall.tallynx.com/api/fundednext/oauth/callback?next=https://evil.test'),
    null
  );

  const dir = mkdtempSync(join(tmpdir(), 'fn-multi-origin-'));
  const store = new SqlitePilotStore({ dbPath: join(dir, 'pilot.db') });
  await store.setAllowlisted('alice', true);
  const prevMaster = process.env.FUNDEDNEXT_MASTER_KEY;
  const prevClientId = process.env.FUNDEDNEXT_OAUTH_CLIENT_ID;
  const prevRedirect = process.env.FUNDEDNEXT_OAUTH_REDIRECT_URI;
  const prevAllowed = process.env.FUNDEDNEXT_ALLOWED_ORIGINS;
  const registeredByRedirect = new Map<string, string>();
  const tokenExchanges: Array<{ redirectUri: string; clientId: string }> = [];

  try {
    process.env.FUNDEDNEXT_MASTER_KEY = 'c'.repeat(64);
    delete process.env.FUNDEDNEXT_OAUTH_CLIENT_ID;
    process.env.FUNDEDNEXT_OAUTH_REDIRECT_URI = 'https://desk.tallynx.com/api/fundednext/oauth/callback';
    process.env.FUNDEDNEXT_ALLOWED_ORIGINS = 'https://custom-desk.example';

    assert.equal(
      resolveTrustedDeskRedirectUri({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'custom-desk.example' }),
      'https://custom-desk.example/api/fundednext/oauth/callback'
    );

    const runtime = createFundedNextRuntimeForStore(store, {
      fetch: async (url, init) => {
        const target = String(url);
        if (target.endsWith('/oauth/register')) {
          const payload = JSON.parse(String(init?.body ?? '{}')) as { redirect_uris?: string[] };
          const redirectUri = payload.redirect_uris?.[0] ?? '';
          const clientId = `dyn_${registeredByRedirect.size + 1}`;
          registeredByRedirect.set(redirectUri, clientId);
          return Response.json({ client_id: clientId }, { status: 201 });
        }
        if (target.endsWith('/oauth/token')) {
          const params = new URLSearchParams(String(init?.body ?? ''));
          tokenExchanges.push({
            redirectUri: params.get('redirect_uri') ?? '',
            clientId: params.get('client_id') ?? '',
          });
          return Response.json({ access_token: 'tok-multi', refresh_token: 'ref-multi', expires_in: 3600 });
        }
        throw new Error(`Unexpected fetch: ${target}`);
      },
    });

    const rpcSecret = 'm'.repeat(64);
    const handleRpc = createFundedNextVpsHandler({ store, oauth: runtime.oauth, secret: rpcSecret, allowLocalhost: false });
    const vpsServer = createServer((req, res) => {
      void handleRpc(req, res).then((handled) => {
        if (!handled) res.writeHead(404).end();
      });
    });
    vpsServer.listen(0, '127.0.0.1');
    await once(vpsServer, 'listening');
    const vpsAddr = vpsServer.address();
    assert.ok(vpsAddr && typeof vpsAddr === 'object');
    const vpsOrigin = `http://127.0.0.1:${vpsAddr.port}`;

    const bff = express();
    bff.use(express.json());
    bff.use('/api/fundednext', createFundedNextRouter({
      verifyIdToken: async () => ({ uid: 'alice' }),
      services: () => createRemoteVpsPilotServices({ baseUrl: vpsOrigin, secret: rpcSecret }),
    }));
    const bffOrigin = await listen(bff, t);
    t.after(() => {
      vpsServer.close();
      store.close();
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      } catch {
        // ignore Windows temp lock
      }
    });

    // 1) mall.tallynx.com start -> uses mall redirect_uri & registers mall client_id
    const mallStart = await fetch(`${bffOrigin}/api/fundednext/connections`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer alice',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'mall.tallynx.com',
      },
    });
    assert.equal(mallStart.status, 201);
    const mallCookie = mallStart.headers.get('set-cookie')!.split(';', 1)[0];
    const mallAuthUrl = new URL((await mallStart.json() as { authorizeUrl: string }).authorizeUrl);
    assert.equal(mallAuthUrl.searchParams.get('redirect_uri'), 'https://mall.tallynx.com/api/fundednext/oauth/callback');
    assert.equal(mallAuthUrl.searchParams.get('client_id'), 'dyn_1');

    // 2) desk.tallynx.com start -> uses desk redirect_uri & registers separate client_id
    const deskStart = await fetch(`${bffOrigin}/api/fundednext/connections`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer alice',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'desk.tallynx.com',
      },
    });
    assert.equal(deskStart.status, 201);
    const deskAuthUrl = new URL((await deskStart.json() as { authorizeUrl: string }).authorizeUrl);
    assert.equal(deskAuthUrl.searchParams.get('redirect_uri'), 'https://desk.tallynx.com/api/fundednext/oauth/callback');
    assert.equal(deskAuthUrl.searchParams.get('client_id'), 'dyn_2');

    // 3) Repeat mall.tallynx.com start -> reuses cached dyn_1 without re-registering
    const mallStart2 = await fetch(`${bffOrigin}/api/fundednext/connections`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer alice',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'mall.tallynx.com',
      },
    });
    assert.equal(mallStart2.status, 201);
    const mallAuthUrl2 = new URL((await mallStart2.json() as { authorizeUrl: string }).authorizeUrl);
    assert.equal(mallAuthUrl2.searchParams.get('client_id'), 'dyn_1');
    assert.equal(registeredByRedirect.size, 2);

    // 4) Untrusted host header -> falls back safely to desk.tallynx.com default (never evil.vercel.app)
    const untrustedStart = await fetch(`${bffOrigin}/api/fundednext/connections`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer alice',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'evil.vercel.app',
      },
    });
    assert.equal(untrustedStart.status, 201);
    const untrustedAuthUrl = new URL((await untrustedStart.json() as { authorizeUrl: string }).authorizeUrl);
    assert.equal(untrustedAuthUrl.searchParams.get('redirect_uri'), 'https://desk.tallynx.com/api/fundednext/oauth/callback');

    // 5) Direct signed RPC attempting untrusted redirectUri is rejected fail-closed with 400
    const badBody = JSON.stringify({ redirectUri: 'https://evil.vercel.app/api/fundednext/oauth/callback' });
    const badHeaders = signVpsRpcRequest({
      secret: rpcSecret,
      method: 'POST',
      path: '/fundednext-rpc/connections/start',
      uid: 'alice',
      body: badBody,
    });
    const rejectedRpc = await fetch(`${vpsOrigin}/fundednext-rpc/connections/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...badHeaders },
      body: badBody,
    });
    assert.equal(rejectedRpc.status, 400);

    // 6) Completing mall callback passes mall redirect_uri (session.redirectUri) to /oauth/token
    const mallState = mallAuthUrl.searchParams.get('state')!;
    const mallCb = await fetch(`${bffOrigin}/api/fundednext/oauth/callback?state=${mallState}&code=code-mall`, {
      headers: { cookie: mallCookie, Accept: 'application/json' },
    });
    assert.equal(mallCb.status, 200);
    assert.deepEqual(tokenExchanges, [
      { redirectUri: 'https://mall.tallynx.com/api/fundednext/oauth/callback', clientId: 'dyn_1' },
    ]);
  } finally {
    if (prevMaster === undefined) delete process.env.FUNDEDNEXT_MASTER_KEY;
    else process.env.FUNDEDNEXT_MASTER_KEY = prevMaster;
    if (prevClientId === undefined) delete process.env.FUNDEDNEXT_OAUTH_CLIENT_ID;
    else process.env.FUNDEDNEXT_OAUTH_CLIENT_ID = prevClientId;
    if (prevRedirect === undefined) delete process.env.FUNDEDNEXT_OAUTH_REDIRECT_URI;
    else process.env.FUNDEDNEXT_OAUTH_REDIRECT_URI = prevRedirect;
    if (prevAllowed === undefined) delete process.env.FUNDEDNEXT_ALLOWED_ORIGINS;
    else process.env.FUNDEDNEXT_ALLOWED_ORIGINS = prevAllowed;
  }
});
