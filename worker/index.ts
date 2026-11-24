import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { redactSecrets } from '../server/fundednext/cryptoEnvelope.js';
import type { FundedNextTokens, KmsEnvelopeCipher } from '../server/fundednext/cryptoEnvelope.js';
import { discoverAccounts, McpReadError, McpStreamableClient, readHistoryPage, readSnapshot, retryDelay } from '../server/fundednext/mcpConnector.js';
import type { CallReadTool } from '../server/fundednext/mcpConnector.js';
import { createFundedNextRuntimeForStore, DEFAULT_MCP_URL, OAuthTokenError } from '../server/fundednext/oauthPkce.js';
import { SqlitePilotStore } from '../server/fundednext/sqliteStore.js';
import { PilotStoreError } from '../server/fundednext/store.js';
import type { JobLease, PilotStore } from '../server/fundednext/store.js';
import { createFundedNextVpsHandler } from '../server/fundednext/vpsHubHandler.js';

const ACTIVE_SNAPSHOT_MS = 15_000;
const QUIET_SNAPSHOT_MS = 60_000;
const JOB_LEASE_MS = 120_000;
const IDLE_POLL_MS = 15_000;
const MAX_POLL_BACKOFF_MS = 160_000;
const REFRESH_MARGIN_MS = 30_000;

interface ReadClient {
  callTool: CallReadTool;
  close?: () => void | Promise<void>;
}

interface WorkerOptions {
  store: PilotStore;
  cipher: KmsEnvelopeCipher;
  openClient?: (tokens: FundedNextTokens) => ReadClient;
  refreshTokens?: (tokens: FundedNextTokens) => Promise<FundedNextTokens>;
  workerId?: string;
  now?: () => number;
  logger?: (message: string) => void;
}

export class FundedNextWorker {
  private readonly now: () => number;
  private readonly id: string;
  private readonly openClient: (tokens: FundedNextTokens) => ReadClient;
  private readonly refreshing = new Map<string, Promise<FundedNextTokens>>();
  private running = false;
  private consecutivePollErrors = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private polling?: Promise<void>;
  private readonly metrics = {
    leased: 0, completed: 0, continued: 0, degraded: 0, reconnectRequired: 0, staleLeases: 0,
    snapshotsWritten: 0, snapshotHeartbeats: 0, executionsWritten: 0, refreshes: 0, pollErrors: 0,
  };

  constructor(private readonly options: WorkerOptions) {
    this.id = options.workerId ?? randomUUID();
    this.now = options.now ?? Date.now;
    this.openClient = options.openClient ?? (tokens => new McpStreamableClient(DEFAULT_MCP_URL, tokens.accessToken));
  }

  getMetrics() {
    return { ...this.metrics };
  }

  async runOnce(): Promise<boolean> {
    const lease = await this.options.store.leaseNext(this.id, JOB_LEASE_MS);
    if (!lease) return false;
    this.metrics.leased++;
    try {
      const envelope = await this.options.store.readCredential(lease);
      const tokens = await this.options.cipher.decryptTokens(envelope);
      const expiring = tokens.tokenExpiresAt <= this.now() + REFRESH_MARGIN_MS;
      if (expiring && (this.options.refreshTokens || tokens.tokenExpiresAt <= this.now())) {
        const refreshed = await this.refresh(lease);
        await this.useClient(lease, refreshed);
      } else {
        try {
          await this.useClient(lease, tokens);
        } catch (error) {
          if (!isUnauthorized(error)) throw error;
          const refreshed = await this.refresh(lease, tokens.accessToken);
          await this.useClient(lease, refreshed);
        }
      }
    } catch (error) {
      if (isStaleLease(error)) this.metrics.staleLeases++;
      else await this.recordFailure(lease, error);
    }
    this.log('FundedNext pilot metrics ' + JSON.stringify(this.getMetrics()));
    return true;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.schedule(0);
  }

  wake() {
    if (!this.running || this.polling) return;
    clearTimeout(this.timer);
    this.schedule(0);
  }

  async stop() {
    this.running = false;
    clearTimeout(this.timer);
    await this.polling;
  }

  private schedule(delay: number) {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      const pending = this.poll().finally(() => {
        if (this.polling === pending) this.polling = undefined;
      });
      this.polling = pending;
    }, delay);
  }

  private async poll() {
    let delay = IDLE_POLL_MS;
    try {
      if (await this.runOnce()) delay = 0;
      this.consecutivePollErrors = 0;
    } catch (error) {
      this.metrics.pollErrors++;
      this.consecutivePollErrors = Math.min(this.consecutivePollErrors + 1, 5);
      delay = Math.min(MAX_POLL_BACKOFF_MS, IDLE_POLL_MS * 2 ** (this.consecutivePollErrors - 1));
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown';
      this.log(`FundedNext pilot poll error backoffMs=${delay} detail=${detail}`);
      this.log('FundedNext pilot metrics ' + JSON.stringify(this.getMetrics()));
    } finally {
      this.schedule(delay);
    }
  }

  private log(message: string) {
    this.options.logger?.(redactSecrets(message));
  }

  private refresh(lease: JobLease, rejectedAccessToken?: string) {
    const key = lease.connectionId + ':' + lease.generation;
    const existing = this.refreshing.get(key);
    if (existing) return existing;
    const pending = this.refreshCurrent(lease, rejectedAccessToken).finally(() => this.refreshing.delete(key));
    this.refreshing.set(key, pending);
    return pending;
  }

  private async refreshCurrent(lease: JobLease, rejectedAccessToken?: string) {
    const current = await this.options.cipher.decryptTokens(await this.options.store.readCredential(lease));
    if (rejectedAccessToken !== undefined ? current.accessToken !== rejectedAccessToken :
      current.tokenExpiresAt > this.now() + REFRESH_MARGIN_MS) return current;
    if (!this.options.refreshTokens || !current.refreshToken) throw new OAuthTokenError(true);
    const updated = await this.options.refreshTokens(current);
    if (updated.tokenExpiresAt <= this.now()) throw new OAuthTokenError(false);
    const next = {
      ...updated,
      refreshToken: updated.refreshToken ?? current.refreshToken,
      clientId: updated.clientId ?? current.clientId,
      clientSecret: updated.clientSecret ?? current.clientSecret,
    };
    await this.options.store.replaceCredential(lease, await this.options.cipher.encryptTokens(next));
    this.metrics.refreshes++;
    return next;
  }

  private async useClient(lease: JobLease, tokens: FundedNextTokens) {
    const client = this.openClient(tokens);
    const callTool: CallReadTool = (tool, args) => {
      if (this.now() >= lease.leaseExpiresAt) return Promise.reject(new PilotStoreError(409, 'Sync lease expired'));
      return client.callTool(tool, args);
    };
    try {
      await this.process(lease, callTool);
    } finally {
      await Promise.resolve().then(() => client.close?.()).catch(() => undefined);
    }
  }

  private async process(lease: JobLease, callTool: CallReadTool) {
    const { store } = this.options;
    const fetchedAt = () => new Date(this.now()).toISOString();
    if (lease.type === 'INITIAL_DISCOVERY') {
      await store.saveAccounts(lease, await discoverAccounts(callTool, fetchedAt()));
      await store.finish(lease, { status: 'CONNECTED' });
      this.metrics.completed++;
      return;
    }
    if (!lease.accountId) throw new Error('Account sync has no broker account');
    if (lease.type === 'SNAPSHOT') {
      const snapshot = await readSnapshot(lease.accountId, callTool, fetchedAt());
      if (await store.saveSnapshot(lease, snapshot, { queueIncrementalOnBalanceChange: true })) {
        this.metrics.snapshotsWritten++;
      } else {
        this.metrics.snapshotHeartbeats++;
      }
      const interval = snapshot.marketQuietConfirmed ? QUIET_SNAPSHOT_MS : ACTIVE_SNAPSHOT_MS;
      await store.finish(lease, { status: 'CONNECTED', nextRunAt: this.now() + interval });
      this.metrics.completed++;
      return;
    }
    const result = await readHistoryPage(lease.accountId, lease.cursor, callTool, fetchedAt());
    if (result.blockedReason) {
      await store.finish(lease, { status: 'DEGRADED', blockedReason: result.blockedReason });
      this.metrics.degraded++;
      return;
    }
    this.metrics.executionsWritten += await store.saveExecutions(lease, result.trades);
    if (result.status === 'PARTIAL') {
      await store.finish(lease, { nextRunAt: this.now(), cursor: result.cursor });
      this.metrics.continued++;
    } else {
      await store.finish(lease, { status: 'CONNECTED' });
      this.metrics.completed++;
    }
  }

  private async recordFailure(lease: JobLease, error: unknown) {
    const reconnect = isUnauthorized(error) || (error instanceof OAuthTokenError && error.reconnect);
    const header = error instanceof McpReadError || error instanceof OAuthTokenError ? error.retryAfter : null;
    const status = error instanceof McpReadError ? error.status : error instanceof PilotStoreError ? error.status : undefined;
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown';
    this.log(`FundedNext pilot failure type=${lease.type} status=${status ?? 'none'} reconnect=${reconnect} detail=${detail}`);
    try {
      if (reconnect) {
        await this.options.store.finish(lease, { status: 'RECONNECT_REQUIRED', blockedReason: 'Broker authorization required' });
        this.metrics.reconnectRequired++;
      } else {
        const now = this.now();
        await this.options.store.finish(lease, {
          status: 'DEGRADED', blockedReason: 'Broker synchronization temporarily unavailable',
          nextRunAt: now + Math.max(ACTIVE_SNAPSHOT_MS, retryDelay(header, now)), cursor: lease.cursor,
        });
        this.metrics.degraded++;
      }
    } catch (failure) {
      if (!isStaleLease(failure)) throw failure;
      this.metrics.staleLeases++;
    }
  }
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof McpReadError && (error.status === 401 || error.status === 403);
}

function isStaleLease(error: unknown): boolean {
  return error instanceof PilotStoreError && error.status === 409;
}

async function seedAllowlistFromEnv(store: SqlitePilotStore) {
  const raw = String(process.env.FUNDEDNEXT_ALLOWLIST_UIDS ?? '').trim();
  if (!raw) return;
  const uids = [...new Set(raw.split(',').map(part => part.trim()).filter(Boolean))];
  for (const uid of uids) {
    await store.setAllowlisted(uid, true);
  }
}

async function main() {
  const dbPath = process.env.FUNDEDNEXT_SQLITE_PATH?.trim() || resolve(process.cwd(), 'pilot.db');
  const store = new SqlitePilotStore({ dbPath });
  await seedAllowlistFromEnv(store);
  const runtime = createFundedNextRuntimeForStore(store);
  const worker = new FundedNextWorker({
    ...runtime,
    openClient: tokens => new McpStreamableClient(runtime.mcpUrl, tokens.accessToken),
    logger: console.info,
  });
  const handleRpc = createFundedNextVpsHandler({
    store,
    oauth: runtime.oauth,
    secret: process.env.FUNDEDNEXT_VPS_RPC_SECRET,
    onWake: () => worker.wake(),
  });
  const port = Number(process.env.PORT ?? '8766');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid worker port');
  const server = createServer((req, res) => {
    void (async () => {
      if (req.method === 'GET' && req.url === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ ok: true, storage: 'sqlite', metrics: worker.getMetrics() }));
        return;
      }
      if (await handleRpc(req, res)) return;
      res.writeHead(404).end();
    })().catch(() => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Worker internal error' }));
      }
    });
  });
  server.once('error', () => {
    console.error('FundedNext worker health server failed');
    process.exitCode = 1;
    void worker.stop();
    store.close();
  });
  server.listen(port, '127.0.0.1', () => worker.start());
  const shutdown = () => {
    server.close();
    void worker.stop().finally(() => store.close());
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch(() => {
    console.error('FundedNext worker configuration is invalid');
    process.exitCode = 1;
  });
}
