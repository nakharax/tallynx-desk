import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RawRow } from './brokerTypes.js';
import type { OAuthPkceManager } from './oauthPkce.js';
import { PilotStoreError } from './store.js';
import type { PilotStore } from './store.js';
import { ReplayNonceCache, verifyVpsRpcRequest } from './vpsRpc.js';

const MAX_RPC_BODY_BYTES = 2 * 1024 * 1024;

export interface FundedNextVpsHubOptions {
  store: PilotStore;
  oauth: Pick<OAuthPkceManager, 'start' | 'callback'>;
  secret: string | undefined;
  onWake?: () => void;
  now?: () => number;
}

function writeJson(res: ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function readRawBody(req: IncomingMessage): Promise<string> {
  const contentLength = Number(req.headers['content-length'] ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_RPC_BODY_BYTES) {
    throw new PilotStoreError(400, 'RPC payload too large');
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_RPC_BODY_BYTES) {
      throw new PilotStoreError(400, 'RPC payload too large');
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseJsonObject(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new PilotStoreError(400, 'Invalid RPC JSON object');
  }
  return parsed as Record<string, unknown>;
}

export function createFundedNextVpsHandler(options: FundedNextVpsHubOptions) {
  const nonces = new ReplayNonceCache();

  async function requireAllowlisted(uid: string) {
    if (!uid || !(await options.store.isAllowlisted(uid))) {
      throw new PilotStoreError(403, 'FundedNext pilot access required');
    }
  }

  return async function handleVpsRpc(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const rawUrl = req.url ?? '/';
    const pathname = rawUrl.split('?', 1)[0];
    if (!pathname.startsWith('/fundednext-rpc/')) return false;

    if (req.method !== 'POST') {
      writeJson(res, 405, { error: 'Method not allowed' });
      return true;
    }

    let rawBody: string;
    try {
      rawBody = await readRawBody(req);
    } catch (error) {
      if (error instanceof PilotStoreError) {
        writeJson(res, error.status, { error: error.message });
      } else {
        writeJson(res, 400, { error: 'Invalid RPC body' });
      }
      return true;
    }

    const verified = verifyVpsRpcRequest({
      secret: options.secret,
      method: req.method,
      path: pathname,
      headers: req.headers,
      body: rawBody,
      nonces,
      now: options.now,
    });
    if (!verified.ok) {
      writeJson(res, verified.status, { error: verified.error });
      return true;
    }

    const uid = verified.uid;
    try {
      const body = parseJsonObject(rawBody);
      await requireAllowlisted(uid);

      switch (pathname) {
        case '/fundednext-rpc/connections/start': {
          const connectionId = body.connectionId;
          if (connectionId !== undefined && (typeof connectionId !== 'string' || !connectionId || connectionId.length > 128)) {
            throw new PilotStoreError(400, 'Invalid connection identifier');
          }
          writeJson(res, 201, await options.oauth.start(uid, { connectionId }));
          return true;
        }

        case '/fundednext-rpc/oauth/callback': {
          const state = body.state;
          const code = body.code;
          const browserSession = body.browserSession;
          if (typeof state !== 'string' || typeof code !== 'string' || typeof browserSession !== 'string') {
            throw new PilotStoreError(400, 'Invalid or expired OAuth session');
          }
          const result = await options.oauth.callback({ state, code, browserSession, uid });
          options.onWake?.();
          writeJson(res, 200, result);
          return true;
        }

        case '/fundednext-rpc/accounts/list': {
          const connectionId = body.connectionId;
          if (connectionId !== undefined && typeof connectionId !== 'string') {
            throw new PilotStoreError(400, 'Invalid connection identifier');
          }
          const connection = connectionId ? await options.store.getConnection(uid, connectionId) : null;
          const accounts = await options.store.listAccounts(uid);
          writeJson(res, 200, { accounts, ...(connection && { connectionStatus: connection.status }) });
          return true;
        }

        case '/fundednext-rpc/accounts/tracking': {
          const accountId = body.accountId;
          const tracked = body.tracked;
          if (typeof accountId !== 'string' || typeof tracked !== 'boolean') {
            throw new PilotStoreError(400, 'Invalid tracking request');
          }
          const existing = await options.store.getAccount(uid, accountId);
          const account = await options.store.setTracked(uid, existing.connectionId, existing.id, tracked);
          if (tracked) options.onWake?.();
          writeJson(res, 200, { account });
          return true;
        }

        case '/fundednext-rpc/accounts/sync': {
          const accountId = body.accountId;
          if (typeof accountId !== 'string') {
            throw new PilotStoreError(400, 'Invalid account identifier');
          }
          const result = await options.store.enqueueSync(uid, accountId);
          options.onWake?.();
          writeJson(res, 202, result);
          return true;
        }

        case '/fundednext-rpc/accounts/snapshot': {
          const accountId = body.accountId;
          if (typeof accountId !== 'string') {
            throw new PilotStoreError(400, 'Invalid account identifier');
          }
          writeJson(res, 200, await options.store.getAccountSnapshotState(uid, accountId));
          return true;
        }

        case '/fundednext-rpc/accounts/executions': {
          const accountId = body.accountId;
          const cursor = body.cursor;
          const limit = body.limit;
          if (
            typeof accountId !== 'string' ||
            (cursor !== undefined && typeof cursor !== 'string') ||
            (limit !== undefined && typeof limit !== 'number')
          ) {
            throw new PilotStoreError(400, 'Invalid execution pagination');
          }
          writeJson(res, 200, await options.store.listExecutions(uid, accountId, cursor, limit));
          return true;
        }

        case '/fundednext-rpc/connections/disconnect': {
          const connectionId = body.connectionId;
          if (typeof connectionId !== 'string') {
            throw new PilotStoreError(400, 'Invalid connection identifier');
          }
          writeJson(res, 200, await options.store.disconnect(uid, connectionId));
          return true;
        }

        case '/fundednext-rpc/journal-imports': {
          const importId = body.importId;
          const rows = body.rows;
          if (typeof importId !== 'string' || !Array.isArray(rows)) {
            throw new PilotStoreError(400, 'Invalid journal import');
          }
          writeJson(res, 200, await options.store.importJournalBatch(uid, importId, rows as RawRow[]));
          return true;
        }

        default:
          writeJson(res, 404, { error: 'Unknown FundedNext RPC endpoint' });
          return true;
      }
    } catch (error) {
      if (error instanceof PilotStoreError) {
        writeJson(res, error.status, {
          error: error.message,
          ...(error.code ? { code: error.code } : {}),
        });
      } else {
        writeJson(res, 503, { error: 'FundedNext VPS service error' });
      }
      return true;
    }
  };
}
