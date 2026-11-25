import { createHash } from 'node:crypto';
import type { AccountSnapshot, BrokerAccount, HistoryCursor, RawRow, TradeExecution } from './brokerTypes.js';
import type { FundedNextCredentialEnvelope } from './cryptoEnvelope.js';
import { reconcileTrade } from './mcpConnector.js';

export const JOB_PRIORITY = ['SNAPSHOT', 'INITIAL_DISCOVERY', 'BACKFILL_PAGE', 'INCREMENTAL'] as const;
export type SyncType = typeof JOB_PRIORITY[number];
export type ConnectionStatus = 'CONNECTED' | 'DEGRADED' | 'RECONNECT_REQUIRED' | 'DISCONNECTED';
export type AccountSyncStatus = 'SYNCING' | 'PARTIAL' | 'COMPLETE' | 'DEGRADED' | 'RECONNECT_REQUIRED';

export class PilotStoreError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409 | 502 | 503, message: string, readonly code?: 'reconnect_required') { super(message); }
}

interface LeaseLock {
  jobId: string;
  fencingToken: number;
  expiresAt: number;
}

interface Connection {
  id: string;
  ownerUid: string;
  generation: number;
  status: ConnectionStatus;
  connectedAt: number;
  lock: LeaseLock | null;
  blockedReason: string | null;
  statusJobId: string | null;
}

export interface PilotAccount extends BrokerAccount {
  id: string;
  ownerUid: string;
  connectionId: string;
  tracked: boolean;
}

export type StoredSnapshot = AccountSnapshot & { lastCheckedAt: string; status: ConnectionStatus; blockedReason: string | null };
type AccountDocument = PilotAccount & { snapshot?: AccountSnapshot; lastCheckedAt?: string };

type JobStatus = 'QUEUED' | 'LEASED' | 'COMPLETE' | 'CANCELLED' | 'PARTIAL';
interface SyncJob {
  id: string;
  uid: string;
  connectionId: string;
  connectionKey: string;
  generation: number;
  accountRef: string | null;
  type: SyncType;
  status: JobStatus;
  availableAt?: number;
  fencingToken: number;
  workerId: string | null;
  leaseExpiresAt: number | null;
  cursor: HistoryCursor | null;
  blockedReason: string | null;
}

export type JobLease = SyncJob & {
  status: 'LEASED';
  workerId: string;
  leaseExpiresAt: number;
  accountId: string | null;
};

interface FinishOptions {
  nextRunAt?: number;
  cursor?: HistoryCursor | null;
  status?: 'CONNECTED' | 'DEGRADED' | 'RECONNECT_REQUIRED';
  blockedReason?: string;
}

export interface PkceSession {
  uid: string;
  browserSessionHash: string;
  codeVerifier: string;
  expiresAt: number;
  connectionId: string;
  expectedGeneration: number;
  clientId: string;
  redirectUri?: string;
}

type Collection = 'pilot_allowlist' | 'fundednext_connections' | 'fundednext_credentials' | 'account_snapshots'
  | 'trade_executions' | 'journal_annotations' | 'sync_jobs';
export type CollectionPath = Collection | `trade_executions/${string}/items` | `journal_annotations/${string}/${'entries' | 'imports'}`;
export type Query = { field: string; op?: 'EQUAL' | 'LESS_THAN_OR_EQUAL' | 'IN'; value: string | number | string[]; after?: string; limit?: number };

export interface Transaction {
  get<T>(path: string): Promise<T | null>;
  getMany<T>(paths: string[]): Promise<Map<string, T>>;
  list<T>(collection: CollectionPath, query: Query): Promise<{ id: string; data: T }[]>;
  put(path: string, data: object, mask?: string[]): void;
  delete(path: string): void;
}

const path = (collection: CollectionPath, id: string) => collection + '/' + id;
const key = (...parts: (string | number | null)[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const validId = (id: string) => /^[a-zA-Z0-9_-]{1,128}$/.test(id);
const userDocumentId = (uid: string) => validId(uid) ? uid : key('user', uid);
const allowlistPath = (uid: string) => path('pilot_allowlist', userDocumentId(uid));
const connectionPath = (id: string) => path('fundednext_connections', id);
const credentialPath = (id: string) => path('fundednext_credentials', id);
const accountPath = (id: string) => path('account_snapshots', id);
const executionCollection = (id: string): CollectionPath => `trade_executions/${id}/items`;
const journalCollection = (uid: string, kind: 'entries' | 'imports'): CollectionPath => `journal_annotations/${userDocumentId(uid)}/${kind}`;
const jobPath = (id: string) => path('sync_jobs', id);
const oauthPath = (uid: string, state: string) => allowlistPath(uid) + '/oauth_sessions/' + key(state);
const active = (job: SyncJob) => job.status === 'QUEUED' || job.status === 'LEASED';
const runnable = (status: ConnectionStatus) => status === 'CONNECTED' || status === 'DEGRADED';
const staleLease = () => new PilotStoreError(409, 'Sync lease is no longer current');
const notFound = () => new PilotStoreError(404, 'FundedNext resource not found');
const reconnectRequired = () => new PilotStoreError(409, 'Reconnect this FundedNext connection', 'reconnect_required');
export const MAX_JOURNAL_ROWS = 200;

function accountView({ snapshot: _, lastCheckedAt: __, ...account }: AccountDocument): PilotAccount {
  return account;
}

function snapshotView(account: AccountDocument, connection: Connection): StoredSnapshot | null {
  if (!account.snapshot) return null;
  return {
    ...account.snapshot, lastCheckedAt: account.lastCheckedAt ?? account.snapshot.fetchedAt,
    status: connection.status, blockedReason: connection.blockedReason,
  };
}

function queued(job: SyncJob, availableAt: number, cursor: HistoryCursor | null = null): SyncJob {
  return { ...job, availableAt, cursor, status: 'QUEUED', workerId: null, leaseExpiresAt: null, blockedReason: null };
}

function settled(job: SyncJob, status: 'COMPLETE' | 'CANCELLED' | 'PARTIAL', blockedReason: string | null = null): SyncJob {
  const { availableAt: _, ...rest } = job;
  return { ...rest, status, blockedReason, workerId: null, leaseExpiresAt: null };
}

type ImportSummary = { imported: number; unlinked: number };
type ExecutionDocument = TradeExecution & { ownerUid: string; accountRef: string; connectionId: string };
type ExecutionRecord = { id: string; data: ExecutionDocument };

export abstract class PilotStore {
  protected constructor(protected readonly now: () => number) {}
  protected abstract transact<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;

  isAllowlisted(uid: string) {
    return this.transact(async tx => (await tx.get<{ enabled: boolean }>(allowlistPath(uid)))?.enabled === true);
  }

  async setAllowlisted(uid: string, enabled: boolean) {
    await this.transact(async tx => { tx.put(allowlistPath(uid), { uid, enabled }, ['uid', 'enabled']); });
  }

  async putPkceSession(state: string, session: PkceSession) {
    await this.transact(async tx => {
      if (await tx.get(oauthPath(session.uid, state))) throw new PilotStoreError(409, 'OAuth state already exists');
      tx.put(oauthPath(session.uid, state), { ...session, purgeAt: new Date(session.expiresAt) });
    });
  }

  consumePkceSession(state: string, uid: string, browserSessionHash: string, now: number) {
    return this.transact(async tx => {
      const ref = oauthPath(uid, state);
      const [session, pilot] = await Promise.all([
        tx.get<PkceSession>(ref), tx.get<{ enabled: boolean }>(allowlistPath(uid)),
      ]);
      if (pilot?.enabled !== true || !session || session.uid !== uid) return null;
      if (session.expiresAt <= Math.max(now, this.now())) {
        tx.delete(ref);
        return null;
      }
      if (session.browserSessionHash !== browserSessionHash) return null;
      tx.delete(ref);
      return session;
    });
  }

  getConnection(uid: string, id: string) {
    return this.transact(tx => this.ownConnection(tx, uid, id));
  }

  async activateConnection(uid: string, id: string, envelope: FundedNextCredentialEnvelope,
    connectedAt = this.now(), expectedGeneration = 0, requireAllowlist = false) {
    if (!validId(id)) throw new PilotStoreError(400, 'Invalid connection identifier');
    return this.transact(async tx => {
      const ref = connectionPath(id);
      const existing = await tx.get<Connection>(ref);
      if (existing && existing.ownerUid !== uid) throw notFound();
      if (requireAllowlist && (await tx.get<{ enabled: boolean }>(allowlistPath(uid)))?.enabled !== true) {
        throw new PilotStoreError(403, 'FundedNext pilot access required');
      }
      if ((existing?.generation ?? 0) !== expectedGeneration) throw new PilotStoreError(409, 'Connection changed during authorization');
      const oldJobs = existing ? await this.connectionJobs(tx, existing) : [];
      const accounts = existing ? await this.ownedAccounts(tx, uid) : [];
      const connection: Connection = {
        id, ownerUid: uid, generation: expectedGeneration + 1, status: 'CONNECTED', connectedAt,
        lock: null, blockedReason: null, statusJobId: null,
      };
      this.cancelJobs(tx, oldJobs);
      tx.put(ref, connection);
      tx.put(credentialPath(id), { ownerUid: uid, connectionId: id, generation: connection.generation, envelope });
      const now = this.now();
      this.createOrQueue(tx, connection, null, 'INITIAL_DISCOVERY', now, null);
      for (const account of accounts.filter(account => account.tracked && account.connectionId === id)) {
        this.createOrQueue(tx, connection, account.id, 'SNAPSHOT', now, null);
        this.createOrQueue(tx, connection, account.id, 'BACKFILL_PAGE', now, null);
      }
      return connection;
    });
  }

  disconnect(uid: string, id: string) {
    return this.transact(async tx => {
      const connection = await this.ownConnection(tx, uid, id);
      if (connection.status === 'DISCONNECTED') return { status: connection.status, generation: connection.generation };
      const [jobs, accounts] = await Promise.all([this.connectionJobs(tx, connection), this.ownedAccounts(tx, uid)]);
      const status = 'DISCONNECTED';
      const generation = connection.generation + 1;
      tx.put(connectionPath(id), { ...connection, status, generation, lock: null, blockedReason: null, statusJobId: null });
      tx.delete(credentialPath(id));
      this.cancelJobs(tx, jobs);
      for (const account of accounts.filter(account => account.tracked && account.connectionId === id)) {
        tx.put(accountPath(account.id), { tracked: false }, ['tracked']);
      }
      return { status, generation };
    });
  }

  listAccounts(uid: string) {
    return this.transact(async tx => (await this.ownedAccounts(tx, uid))
      .map(accountView).sort((a, b) => a.accountId.localeCompare(b.accountId) || a.id.localeCompare(b.id)));
  }

  getAccount(uid: string, id: string) {
    return this.transact(async tx => accountView(await this.ownAccount(tx, uid, id)));
  }

  getSnapshot(uid: string, id: string): Promise<StoredSnapshot | null> {
    return this.transact(async tx => {
      const account = await this.ownAccount(tx, uid, id);
      if (!account.snapshot) return null;
      const connection = await this.ownConnection(tx, uid, account.connectionId);
      return snapshotView(account, connection);
    });
  }

  getAccountSnapshotState(uid: string, id: string): Promise<{ snapshot: StoredSnapshot | null; syncStatus: AccountSyncStatus }> {
    return this.transact(async tx => {
      const account = await this.ownAccount(tx, uid, id);
      const connection = await this.ownConnection(tx, uid, account.connectionId);
      if (!runnable(connection.status)) return { snapshot: null, syncStatus: 'RECONNECT_REQUIRED' };
      const snapshot = snapshotView(account, connection);
      if (connection.status === 'DEGRADED') return { snapshot, syncStatus: 'DEGRADED' };
      const [backfill, incremental] = await Promise.all([
        this.findJob(tx, connection, account.id, 'BACKFILL_PAGE'),
        this.findJob(tx, connection, account.id, 'INCREMENTAL'),
      ]);
      if (account.tracked && ((!snapshot && backfill?.status === 'COMPLETE') ||
        (backfill && active(backfill) && !backfill.cursor) || (incremental && active(incremental)))) {
        return { snapshot, syncStatus: 'SYNCING' };
      }
      const complete = account.tracked && backfill?.status === 'COMPLETE' && incremental?.status !== 'PARTIAL' &&
        snapshot && !snapshot.missingFields.length && !snapshot.unverifiedFields.length &&
        snapshot.openPositions.every(position => !position.missingFields.length && !position.unverifiedFields.length);
      return { snapshot, syncStatus: complete ? 'COMPLETE' : 'PARTIAL' };
    });
  }

  setTracked(uid: string, connectionId: string, accountId: string, tracked: boolean) {
    return this.transact(async tx => {
      const connection = await this.ownConnection(tx, uid, connectionId);
      const id = this.accountRef(connection, accountId);
      const candidate = /^[a-f0-9]{64}$/.test(accountId) ? accountId : id;
      const account = await tx.get<AccountDocument>(accountPath(candidate));
      const current = account?.connectionId === connectionId && account.ownerUid === uid
        ? account : candidate === id ? null : await tx.get<AccountDocument>(accountPath(id));
      if (!current || current.ownerUid !== uid || current.connectionId !== connectionId) throw notFound();
      if (tracked && !runnable(connection.status)) throw reconnectRequired();
      if (current.tracked === tracked) return accountView(current);
      if (tracked) {
        const accounts = await this.ownedAccounts(tx, uid);
        if (accounts.filter(account => account.tracked).length >= 3) {
          throw new PilotStoreError(409, 'A pilot can track up to three accounts');
        }
        const [snapshot, backfill] = await Promise.all([
          this.findJob(tx, connection, current.id, 'SNAPSHOT'),
          this.findJob(tx, connection, current.id, 'BACKFILL_PAGE'),
        ]);
        this.createOrQueue(tx, connection, current.id, 'SNAPSHOT', this.now(), snapshot);
        if (backfill?.status !== 'COMPLETE') this.createOrQueue(tx, connection, current.id, 'BACKFILL_PAGE', this.now(), backfill);
      } else {
        const jobs = (await this.connectionJobs(tx, connection)).filter(job => job.accountRef === current.id && active(job));
        this.cancelJobs(tx, jobs);
        if (jobs.some(job => job.id === connection.lock?.jobId)) {
          tx.put(connectionPath(connectionId), { lock: null }, ['lock']);
        }
      }
      tx.put(accountPath(current.id), { tracked }, ['tracked']);
      return accountView({ ...current, tracked });
    });
  }

  enqueueSync(uid: string, accountRef: string, type: SyncType = 'INCREMENTAL') {
    return this.transact(async tx => {
      if ((await tx.get<{ enabled: boolean }>(allowlistPath(uid)))?.enabled !== true) {
        throw new PilotStoreError(403, 'FundedNext pilot access required');
      }
      const account = await this.ownAccount(tx, uid, accountRef);
      const connection = await this.ownConnection(tx, uid, account.connectionId);
      if (!runnable(connection.status)) throw reconnectRequired();
      if (type === 'INITIAL_DISCOVERY') throw new PilotStoreError(400, 'Invalid account sync type');
      const existing = await this.findJob(tx, connection, account.id, type);
      const job = this.createOrQueue(tx, connection, account.id, type, this.now(), existing);
      return { jobId: job.id, status: 'QUEUED' as const };
    });
  }

  async leaseNext(workerId: string, ttlMs: number): Promise<JobLease | null> {
    if (!workerId || !Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new Error('Invalid sync lease configuration');
    return this.transact(async tx => {
      const jobs = (await tx.list<SyncJob>('sync_jobs', { field: 'availableAt', op: 'LESS_THAN_OR_EQUAL', value: this.now() }))
        .map(({ data }) => data).filter(active);
      jobs.sort((a, b) => JOB_PRIORITY.indexOf(a.type) - JOB_PRIORITY.indexOf(b.type)
        || (a.availableAt ?? 0) - (b.availableAt ?? 0) || a.id.localeCompare(b.id));
      for (const job of jobs) {
        const connection = await tx.get<Connection>(connectionPath(job.connectionId));
        if (!connection || connection.ownerUid !== job.uid || connection.generation !== job.generation || !runnable(connection.status)) continue;
        if (connection.lock && connection.lock.expiresAt > this.now()) continue;
        if ((await tx.get<{ enabled: boolean }>(allowlistPath(job.uid)))?.enabled !== true) continue;
        const account = job.accountRef ? await tx.get<AccountDocument>(accountPath(job.accountRef)) : null;
        if (job.accountRef && (!account || account.ownerUid !== job.uid || account.connectionId !== job.connectionId)) continue;
        const leaseExpiresAt = this.now() + ttlMs;
        const fencingToken = job.fencingToken + 1;
        const leased = { ...job, status: 'LEASED', workerId, fencingToken, leaseExpiresAt, availableAt: leaseExpiresAt } as const;
        tx.put(jobPath(job.id), leased);
        tx.put(connectionPath(connection.id), { lock: { jobId: job.id, fencingToken, expiresAt: leaseExpiresAt } }, ['lock']);
        return { ...leased, accountId: account?.accountId ?? null };
      }
      return null;
    });
  }

  readCredential(lease: JobLease) {
    return this.transact(async tx => {
      await this.checkLease(tx, lease);
      const document = await tx.get<{ ownerUid: string; generation: number; envelope: FundedNextCredentialEnvelope }>(credentialPath(lease.connectionId));
      if (!document || document.ownerUid !== lease.uid || document.generation !== lease.generation) throw staleLease();
      return document.envelope;
    });
  }

  replaceCredential(lease: JobLease, envelope: FundedNextCredentialEnvelope) {
    return this.transact(async tx => {
      await this.checkLease(tx, lease);
      tx.put(credentialPath(lease.connectionId), { ownerUid: lease.uid, connectionId: lease.connectionId, generation: lease.generation, envelope });
    });
  }

  async saveAccounts(lease: JobLease, accounts: BrokerAccount[]) {
    const unique = [...new Map(accounts.map(account => [account.accountId, account])).values()];
    for (let index = 0; index < Math.max(1, unique.length); index += 100) {
      await this.transact(async tx => {
        const { connection, job } = await this.checkLease(tx, lease);
        if (job.type !== 'INITIAL_DISCOVERY') throw staleLease();
        const batch = unique.slice(index, index + 100).map(account => {
          const id = this.accountRef(connection, account.accountId);
          return { ref: accountPath(id), account, id };
        });
        const read = await tx.getMany<AccountDocument>(batch.map(({ ref }) => ref));
        for (const { ref, account, id } of batch) {
          const existing = read.get(ref);
          tx.put(ref, { ...existing, ...account, id, ownerUid: connection.ownerUid, connectionId: connection.id, tracked: existing?.tracked ?? false });
        }
      });
    }
  }

  saveSnapshot(lease: JobLease, snapshot: AccountSnapshot, options?: { queueIncrementalOnBalanceChange?: boolean }) {
    return this.transact(async tx => {
      const { job, connection } = await this.checkLease(tx, lease);
      if (!job.accountRef || job.type !== 'SNAPSHOT') throw staleLease();
      const ref = accountPath(job.accountRef);
      const account = await tx.get<AccountDocument>(ref);
      if (!account || account.accountId !== snapshot.accountId) throw staleLease();
      const previous = account.snapshot;
      if (options?.queueIncrementalOnBalanceChange && previous &&
          (previous.balance !== snapshot.balance || previous.netProfit !== snapshot.netProfit)) {
        const existing = await this.findJob(tx, connection, account.id, 'INCREMENTAL');
        this.createOrQueue(tx, connection, account.id, 'INCREMENTAL', this.now(), existing);
      }
      const lastCheckedAt = new Date(this.now()).toISOString();
      const changed = previous?.digest !== snapshot.digest;
      if (changed) tx.put(ref, { snapshot, lastCheckedAt }, ['snapshot', 'lastCheckedAt']);
      else tx.put(ref, { lastCheckedAt }, ['lastCheckedAt']);
      return changed;
    });
  }

  async saveExecutions(lease: JobLease, executions: TradeExecution[]) {
    let changed = 0;
    for (let index = 0; index < Math.max(1, executions.length); index += 100) {
      changed += await this.transact(async tx => {
        const { job } = await this.checkLease(tx, lease);
        if (!job.accountRef || (job.type !== 'BACKFILL_PAGE' && job.type !== 'INCREMENTAL')) throw staleLease();
        const account = await tx.get<AccountDocument>(accountPath(job.accountRef));
        if (!account) throw staleLease();
        const batch = executions.slice(index, index + 100).map(execution => {
          if (execution.accountId !== account.accountId || !execution.dealId) throw staleLease();
          return { ref: path(executionCollection(account.id), key(execution.cycleId, execution.dealId)), execution };
        });
        const pending = new Map<string, ExecutionDocument>();
        const current = await tx.getMany<ExecutionDocument>([...new Set(batch.map(({ ref }) => ref))]);
        for (const { ref, execution } of batch) {
          const existing = pending.get(ref) ?? current.get(ref);
          const next = existing ? reconcileTrade(existing, execution) : execution;
          if (next !== existing) pending.set(ref, { ...next, ownerUid: job.uid, accountRef: account.id, connectionId: job.connectionId });
        }
        for (const [ref, execution] of pending) tx.put(ref, execution);
        return pending.size;
      });
    }
    return changed;
  }

  finish(lease: JobLease, options: FinishOptions = {}) {
    return this.transact(async tx => {
      const { job, connection } = await this.checkLease(tx, lease);
      const terminal = options.status === 'RECONNECT_REQUIRED';
      const siblings = terminal ? await this.connectionJobs(tx, connection) : [];
      const next = options.nextRunAt !== undefined && !terminal
        ? queued(job, options.nextRunAt, options.cursor ?? null)
        : settled(job, options.blockedReason ? 'PARTIAL' : 'COMPLETE', options.blockedReason ?? null);
      tx.put(jobPath(job.id), next);
      const updatesStatus = options.status !== undefined &&
        (options.status !== 'CONNECTED' || connection.status !== 'DEGRADED' || connection.statusJobId === job.id);
      if (updatesStatus) {
        tx.put(connectionPath(connection.id), {
          lock: null, status: options.status, blockedReason: options.blockedReason ?? null,
          statusJobId: options.blockedReason ? job.id : null,
        }, ['lock', 'status', 'blockedReason', 'statusJobId']);
      } else {
        tx.put(connectionPath(connection.id), { lock: null }, ['lock']);
      }
      this.cancelJobs(tx, siblings.filter(other => other.id !== job.id));
    });
  }

  listExecutions(uid: string, accountId: string, cursor?: string, limit = 50) {
    if ((cursor !== undefined && !/^[a-f0-9]{64}$/.test(cursor)) || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
      throw new PilotStoreError(400, 'Invalid execution pagination');
    }
    return this.transact(async tx => {
      const account = await this.ownAccount(tx, uid, accountId);
      const rows = await tx.list<ExecutionDocument>(executionCollection(account.id), {
        field: 'ownerUid', value: uid, after: cursor, limit: limit + 1,
      });
      const page = rows.slice(0, limit);
      const executions = page.map(({ data: { ownerUid: _, accountRef: __, connectionId: ___, ...execution } }) => execution);
      return { executions, nextCursor: rows.length > limit ? page.at(-1)?.id ?? null : null };
    });
  }

  importJournalBatch(uid: string, importId: string, rows: RawRow[]): Promise<ImportSummary> {
    if (!/^[a-zA-Z0-9_.:-]{1,128}$/.test(importId) || !rows.length || rows.length > MAX_JOURNAL_ROWS) {
      throw new PilotStoreError(400, 'Invalid journal import');
    }
    return this.transact(async tx => {
      const ref = path(journalCollection(uid, 'imports'), key(importId));
      const existing = await tx.get<{ summary: ImportSummary }>(ref);
      if (existing) return existing.summary;
      const criteria = rows.map(row => ({
        dealId: journalId(row.dealId ?? row.deal_id ?? row.ticket),
        accountId: journalId(row.accountId ?? row.account_id),
        cycleId: journalId(row.cycleId ?? row.cycle_id),
        connectionId: journalId(row.connectionId),
        executionId: journalId(row.executionId),
        executionKey: journalId(row.executionKey),
      }));
      const candidates = new Map<string, ExecutionRecord>();
      if (criteria.some(match => match.dealId || match.executionId || match.executionKey)) {
        for (const account of await this.ownedAccounts(tx, uid)) {
          const relevant = criteria.filter(match => (!match.accountId || match.accountId === account.id || match.accountId === account.accountId)
            && (!match.connectionId || match.connectionId === account.connectionId));
          const collection = executionCollection(account.id);
          for (const field of ['dealId', 'executionId'] as const) {
            const values = [...new Set(relevant.map(match => match[field]).filter(value => value !== null))];
            for (let start = 0; start < values.length; start += 30) {
              const matches = await tx.list<ExecutionDocument>(collection,
                { field: field === 'executionId' ? 'id' : field, op: 'IN', value: values.slice(start, start + 30) });
              for (const match of matches) candidates.set(path(collection, match.id), match);
            }
          }
          const exactKeys = [...new Set(relevant.map(match => match.executionKey)
            .filter((value): value is string => value !== null && /^[a-f0-9]{64}$/.test(value)))];
          for (const [ref, data] of await tx.getMany<ExecutionDocument>(exactKeys.map(id => path(collection, id)))) {
            candidates.set(ref, { data, id: ref.split('/').at(-1)! });
          }
        }
      }
      let unlinked = 0;
      const now = new Date(this.now());
      for (const [index, row] of rows.entries()) {
        const { dealId, accountId, cycleId, connectionId, executionId, executionKey } = criteria[index];
        const matches = dealId || executionId || executionKey ? [...candidates.values()].filter(({ data, id }) =>
          data.ownerUid === uid && data.kind === 'TRADE' && (!dealId || dealId === data.dealId) &&
          (!accountId || accountId === data.accountId || accountId === data.accountRef) &&
          (!cycleId || cycleId === data.cycleId) && (!connectionId || connectionId === data.connectionId) &&
          (!executionId || executionId === data.id) && (!executionKey || executionKey === id)) : [];
        const match = matches.length === 1 ? matches[0] : null;
        if (!match) unlinked++;
        const note = row.note ?? row.notes;
        const tags = Array.isArray(row.tags)
          ? row.tags.filter((value): value is string => typeof value === 'string' && value.length > 0 && value.length <= 40).slice(0, 20)
          : [];
        tx.put(path(journalCollection(uid, 'entries'), key(importId, index)), {
          ownerUid: uid, importId, note: typeof note === 'string' ? note.slice(0, 5000) : '', tags,
          legacyUnlinked: !match, accountId: match?.data.accountRef ?? null, executionKey: match?.id ?? null,
          createdAt: now, updatedAt: now,
        });
      }
      const summary = { imported: rows.length, unlinked };
      tx.put(ref, { uid, importId, summary });
      return summary;
    });
  }

  private accountRef(connection: Connection, accountId: string) {
    return key(connection.ownerUid, connection.id, accountId);
  }

  private async ownedAccounts(tx: Transaction, uid: string) {
    return (await tx.list<AccountDocument>('account_snapshots', { field: 'ownerUid', value: uid })).map(({ data }) => data);
  }

  private async ownConnection(tx: Transaction, uid: string, id: string) {
    if (!validId(id)) throw notFound();
    const connection = await tx.get<Connection>(connectionPath(id));
    if (!connection || connection.ownerUid !== uid) throw notFound();
    return connection;
  }

  private async ownAccount(tx: Transaction, uid: string, id: string) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw notFound();
    const account = await tx.get<AccountDocument>(accountPath(id));
    if (!account || account.ownerUid !== uid) throw notFound();
    return account;
  }

  private async connectionJobs(tx: Transaction, connection: Connection) {
    return (await tx.list<SyncJob>('sync_jobs', { field: 'connectionKey', value: key(connection.ownerUid, connection.id) }))
      .map(({ data }) => data);
  }

  private cancelJobs(tx: Transaction, jobs: SyncJob[]) {
    for (const job of jobs) if (active(job)) tx.put(jobPath(job.id), settled(job, 'CANCELLED'));
  }

  private jobId(connection: Connection, accountRef: string | null, type: SyncType) {
    return key(connection.ownerUid, connection.id, connection.generation, accountRef, type);
  }

  private findJob(tx: Transaction, connection: Connection, accountRef: string, type: SyncType) {
    return tx.get<SyncJob>(jobPath(this.jobId(connection, accountRef, type)));
  }

  private createOrQueue(tx: Transaction, connection: Connection, accountRef: string | null, type: SyncType, now: number, existing: SyncJob | null) {
    if (existing && active(existing)) return existing;
    const job = queued(existing ?? {
      id: this.jobId(connection, accountRef, type), uid: connection.ownerUid, connectionId: connection.id,
      connectionKey: key(connection.ownerUid, connection.id), generation: connection.generation, accountRef, type,
      status: 'QUEUED', fencingToken: 0, workerId: null, leaseExpiresAt: null, cursor: null, blockedReason: null,
    }, now, type === 'BACKFILL_PAGE' ? existing?.cursor ?? null : null);
    tx.put(jobPath(job.id), job);
    return job;
  }

  private async checkLease(tx: Transaction, lease: JobLease) {
    const [connection, job, pilot] = await Promise.all([
      tx.get<Connection>(connectionPath(lease.connectionId)), tx.get<SyncJob>(jobPath(lease.id)),
      tx.get<{ enabled: boolean }>(allowlistPath(lease.uid)),
    ]);
    if (pilot?.enabled !== true || !connection || connection.ownerUid !== lease.uid || connection.generation !== lease.generation || !runnable(connection.status) ||
        !job || job.status !== 'LEASED' || job.connectionId !== connection.id || job.generation !== lease.generation ||
        job.fencingToken !== lease.fencingToken || job.workerId !== lease.workerId || !job.leaseExpiresAt || job.leaseExpiresAt <= this.now() ||
        connection.lock?.jobId !== job.id || connection.lock.fencingToken !== job.fencingToken) throw staleLease();
    return { connection, job };
  }
}

function journalId(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : null;
}

export class InMemoryPilotStore extends PilotStore {
  private readonly documents = new Map<string, object>();
  private serial: Promise<unknown> = Promise.resolve();

  constructor(options: { now?: () => number } = {}) { super(options.now ?? Date.now); }

  protected transact<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    const run = this.serial.then(async () => {
      const writes = new Map<string, object | null>();
      const tx: Transaction = {
        get: async <D>(ref: string) => structuredClone(this.documents.get(ref) ?? null) as D | null,
        getMany: async <D>(refs: string[]) => new Map(refs.flatMap(ref => {
          const data = this.documents.get(ref);
          return data ? [[ref, structuredClone(data) as D] as const] : [];
        })),
        list: async <D>(collection: CollectionPath, query: Query) => {
          const prefix = collection + '/';
          const matches: { id: string; data: D }[] = [];
          for (const [ref, data] of this.documents) {
            if (!ref.startsWith(prefix)) continue;
            const id = ref.slice(prefix.length);
            if (id.includes('/') || (query.after !== undefined && id <= query.after)) continue;
            const value = (data as RawRow)[query.field];
            const matched = query.op === 'LESS_THAN_OR_EQUAL' && typeof value === 'number' && value <= Number(query.value) ||
              query.op === 'IN' && Array.isArray(query.value) && typeof value === 'string' && query.value.includes(value) ||
              (!query.op || query.op === 'EQUAL') && value === query.value;
            if (matched) {
              matches.push({ id, data: structuredClone(data) as D });
            }
          }
          return matches.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).slice(0, query.limit ?? matches.length);
        },
        put: (ref, data, mask) => writes.set(ref, structuredClone(mask ? { ...this.documents.get(ref), ...data } : data)),
        delete: ref => writes.set(ref, null),
      };
      const result = await work(tx);
      for (const [ref, data] of writes) {
        if (data === null) this.documents.delete(ref);
        else this.documents.set(ref, data);
      }
      return result;
    });
    this.serial = run.catch(() => undefined);
    return run;
  }
}

type FirestoreValue = {
  nullValue?: null; booleanValue?: boolean; stringValue?: string; integerValue?: string;
  doubleValue?: number; referenceValue?: string; timestampValue?: string;
  mapValue?: { fields?: FirestoreFields }; arrayValue?: { values?: FirestoreValue[] };
};
type FirestoreFields = Record<string, FirestoreValue>;
type FirestoreDocument = { name: string; fields?: FirestoreFields };
type FirestoreWrite = { update: FirestoreDocument; updateMask?: { fieldPaths: string[] } } | { delete: string };

function encodeFields(data: object): FirestoreFields {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined).map(([key, value]) =>
    [key, key === 'rawPayload' ? { stringValue: JSON.stringify(value) } : encodeValue(value)]));
}

function encodeValue(value: unknown): FirestoreValue {
  if (value == null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isSafeInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
  throw new Error('Unsupported Firestore value');
}

function decodeFields(fields: FirestoreFields = {}): RawRow {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key,
    key === 'rawPayload' && value.stringValue !== undefined ? JSON.parse(value.stringValue) : decodeValue(value)]));
}

function decodeValue(value: FirestoreValue): unknown {
  if (value.mapValue) return decodeFields(value.mapValue.fields);
  if (value.arrayValue) return (value.arrayValue.values ?? []).map(decodeValue);
  if (value.integerValue !== undefined) return Number(value.integerValue);
  return value.stringValue ?? value.booleanValue ?? value.doubleValue ?? value.timestampValue ?? value.referenceValue ?? null;
}

class FirestoreRequestError extends Error {
  constructor(readonly retry: boolean) { super('Firestore transaction request failed'); }
}

export class FirestoreRestPilotStore extends PilotStore {
  private readonly root: string;
  private readonly endpoint: string;
  private readonly request: typeof fetch;

  constructor(private readonly options: {
    projectId: string; databaseId?: string; getAccessToken: () => Promise<string>;
    fetch?: typeof fetch; now?: () => number;
  }) {
    super(options.now ?? Date.now);
    const database = options.databaseId ?? '(default)';
    if (!/^[\w-]+$/.test(options.projectId) || !/^(?:\(default\)|[\w-]+)$/.test(database)) throw new Error('Invalid Firestore database configuration');
    this.root = 'projects/' + options.projectId + '/databases/' + database + '/documents';
    this.endpoint = 'https://firestore.googleapis.com/v1/' + this.root;
    this.request = options.fetch ?? fetch;
  }

  private async operation<T>(method: string, body: object, accessToken: string, parent = '') {
    const response = await this.request(this.endpoint + parent + ':' + method, {
      method: 'POST', headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const detail: { error?: { status?: string } } = await response.json().catch(() => ({}));
      throw new FirestoreRequestError(response.status === 409 || detail.error?.status === 'ABORTED');
    }
    return await response.json() as T;
  }

  protected async transact<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const accessToken = await this.options.getAccessToken();
      let transaction: string | undefined;
      try {
        const started = await this.operation<{ transaction: string }>('beginTransaction',
          { options: { readWrite: {} } }, accessToken);
        transaction = started.transaction;
        if (!transaction) throw new FirestoreRequestError(false);
        const writes: FirestoreWrite[] = [];
        const name = (ref: string) => this.root + '/' + ref;
        const getMany = async <D>(refs: string[]) => {
          const found = new Map<string, D>();
          if (!refs.length) return found;
          const records = await this.operation<{ found?: FirestoreDocument; missing?: string }[]>('batchGet',
            { documents: refs.map(name), transaction }, accessToken);
          const received = new Set(records.map(record => record.found?.name ?? record.missing));
          if (refs.some(ref => !received.has(name(ref)))) throw new FirestoreRequestError(false);
          for (const { found: doc } of records) {
            if (doc) found.set(doc.name.slice(this.root.length + 1), decodeFields(doc.fields) as D);
          }
          return found;
        };
        const tx: Transaction = {
          get: async <D>(ref: string) => (await getMany<D>([ref])).get(ref) ?? null,
          getMany,
          list: async <D>(collection: CollectionPath, query: Query) => {
            const segments = collection.split('/');
            const collectionId = segments.pop();
            const parent = segments.length ? '/' + segments.join('/') : '';
            const structuredQuery = {
              from: [{ collectionId }],
              where: { fieldFilter: { field: { fieldPath: query.field }, op: query.op ?? 'EQUAL', value: encodeValue(query.value) } },
              ...(query.op !== 'LESS_THAN_OR_EQUAL' && { orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }] }),
              ...(query.after !== undefined && { startAt: { values: [{ referenceValue: name(path(collection, query.after)) }], before: false } }),
              ...(query.limit !== undefined && { limit: query.limit }),
            };
            const results = await this.operation<{ document?: FirestoreDocument }[]>('runQuery', { structuredQuery, transaction }, accessToken, parent);
            return results.flatMap(({ document }) => document
              ? [{ id: document.name.split('/').at(-1)!, data: decodeFields(document.fields) as D }] : []);
          },
          put: (ref, data, mask) => writes.push({
            update: { name: name(ref), fields: encodeFields(data) },
            ...(mask && { updateMask: { fieldPaths: mask } }),
          }),
          delete: ref => writes.push({ delete: name(ref) }),
        };
        const result = await work(tx);
        await this.operation('commit', { transaction, writes }, accessToken);
        return result;
      } catch (error) {
        if (transaction) await this.operation('rollback', { transaction }, accessToken).catch(() => undefined);
        if (!(error instanceof FirestoreRequestError) || !error.retry || attempt >= 4) throw error;
        await new Promise(resolve => setTimeout(resolve, 20 * 2 ** attempt + Math.floor(Math.random() * 15)));
      }
    }
  }
}
