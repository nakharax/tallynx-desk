import type { RawRow, TradeExecution } from './brokerTypes.js';
import type { AccountSyncStatus, ConnectionStatus, PilotAccount, StoredSnapshot } from './store.js';
import { PilotStoreError } from './store.js';
import { assertValidRpcSecret, signVpsRpcRequest } from './vpsRpc.js';

export interface RemoteVpsPilotClientOptions {
  baseUrl: string;
  secret: string | undefined;
  fetch?: typeof fetch;
}

export interface RemoteVpsPilotServices {
  remoteRpc: true;
  oauth: {
    start(uid: string, opts?: { connectionId?: string; redirectUri?: string }): Promise<{ authorizeUrl: string; browserSession: string }>;
    callback(input: { state: string; code: string; browserSession: string; uid: string }): Promise<{ connectionId: string; status: 'CONNECTED' }>;
  };
  listDirectory(uid: string, connectionId?: string): Promise<{ accounts: PilotAccount[]; connectionStatus?: ConnectionStatus }>;
  setAccountTracked(uid: string, accountId: string, tracked: boolean): Promise<PilotAccount>;
  enqueueSync(uid: string, accountId: string): Promise<{ jobId: string; status: 'QUEUED' }>;
  getSnapshotState(uid: string, accountId: string): Promise<{ snapshot: StoredSnapshot | null; syncStatus: AccountSyncStatus }>;
  listExecutions(uid: string, accountId: string, cursor?: string, limit?: number): Promise<{ executions: TradeExecution[]; nextCursor: string | null }>;
  disconnect(uid: string, connectionId: string): Promise<{ status: string; generation: number }>;
  importJournalBatch(uid: string, importId: string, rows: RawRow[]): Promise<{ imported: number; unlinked: number }>;
}

function normalizeBaseUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) ||
      url.username || url.password || url.search || url.hash) {
    throw new Error('Invalid FundedNext VPS RPC base URL');
  }
  return url.toString().replace(/\/+$/, '');
}

export function createRemoteVpsPilotServices(options: RemoteVpsPilotClientOptions): RemoteVpsPilotServices {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const requestFetch = options.fetch ?? fetch;

  async function callRpc<T>(path: string, uid: string, payload: object): Promise<T> {
    const secret = assertValidRpcSecret(options.secret);
    const body = JSON.stringify(payload);
    const headers = signVpsRpcRequest({
      secret,
      method: 'POST',
      path,
      uid,
      body,
    });
    const response = await requestFetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...headers,
      },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(12_000),
    });
    const parsed = (await response.json().catch(() => null)) as {
      error?: string;
      code?: string;
    } | null;
    if (!response.ok) {
      if (
        response.status === 400 ||
        response.status === 403 ||
        response.status === 404 ||
        response.status === 409 ||
        response.status === 502
      ) {
        throw new PilotStoreError(
          response.status,
          typeof parsed?.error === 'string' ? parsed.error : 'FundedNext request rejected',
          parsed?.code === 'reconnect_required' ? 'reconnect_required' : undefined
        );
      }
      throw new Error(typeof parsed?.error === 'string' ? parsed.error : `FundedNext VPS RPC HTTP ${response.status}`);
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid FundedNext VPS RPC response');
    }
    return parsed as unknown as T;
  }

  return {
    remoteRpc: true,
    oauth: {
      start: (uid, opts) => callRpc('/fundednext-rpc/connections/start', uid, {
        ...(opts?.connectionId ? { connectionId: opts.connectionId } : {}),
        ...(opts?.redirectUri ? { redirectUri: opts.redirectUri } : {}),
      }),
      callback: ({ state, code, browserSession, uid }) =>
        callRpc('/fundednext-rpc/oauth/callback', uid, { state, code, browserSession }),
    },
    listDirectory: (uid, connectionId) =>
      callRpc('/fundednext-rpc/accounts/list', uid, { ...(connectionId ? { connectionId } : {}) }),
    setAccountTracked: async (uid, accountId, tracked) =>
      (await callRpc<{ account: PilotAccount }>('/fundednext-rpc/accounts/tracking', uid, { accountId, tracked })).account,
    enqueueSync: (uid, accountId) =>
      callRpc('/fundednext-rpc/accounts/sync', uid, { accountId }),
    getSnapshotState: (uid, accountId) =>
      callRpc('/fundednext-rpc/accounts/snapshot', uid, { accountId }),
    listExecutions: (uid, accountId, cursor, limit) =>
      callRpc('/fundednext-rpc/accounts/executions', uid, {
        accountId,
        ...(cursor !== undefined ? { cursor } : {}),
        ...(limit !== undefined ? { limit } : {}),
      }),
    disconnect: (uid, connectionId) =>
      callRpc('/fundednext-rpc/connections/disconnect', uid, { connectionId }),
    importJournalBatch: (uid, importId, rows) =>
      callRpc('/fundednext-rpc/journal-imports', uid, { importId, rows }),
  };
}
