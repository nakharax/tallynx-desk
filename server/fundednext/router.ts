import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import type { CookieOptions, Request, Response } from 'express';
import type { OpenPosition, RawRow, TradeExecution } from './brokerTypes.js';
import { PKCE_TTL_MS, resolveTrustedDeskRedirectUri } from './oauthPkce.js';
import { FUNDEDNEXT_LIVE_SYNC_FLOOR_MS, MAX_JOURNAL_ROWS, PilotStoreError } from './store.js';
import type { LiveSnapshotStateResult, PilotStore, StoredSnapshot } from './store.js';
import type { RemoteVpsPilotServices } from './vpsClient.js';

export interface FundedNextLiveTelemetry {
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

function toFinite(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const cleaned = value.trim().replace(/[$,\s]/g, '');
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pickRawNumber(sources: Array<Record<string, unknown> | null>, keys: string[]): number | null {
  for (const src of sources) {
    if (!src) continue;
    for (const key of keys) {
      if (key in src) {
        const val = toFinite(src[key]);
        if (val !== null) return val;
      }
    }
  }
  return null;
}

function asObj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function extractFundedNextLiveTelemetry(
  snapshot: StoredSnapshot | null,
  meta?: { rateFloorMs?: number; nextSafeSyncAt?: string | null; syncTriggered?: boolean; syncStatus?: string }
): FundedNextLiveTelemetry {
  const rateFloorMs = meta?.rateFloorMs ?? FUNDEDNEXT_LIVE_SYNC_FLOOR_MS;
  const nextSafeSyncAt = meta?.nextSafeSyncAt ?? null;
  const syncTriggered = Boolean(meta?.syncTriggered);
  if (!snapshot) {
    return {
      balance: null,
      equity: null,
      floatingPnl: null,
      margin: null,
      freeMargin: null,
      marginLevelPct: null,
      dailyLossUsedUsd: null,
      dailyLossLimitUsd: null,
      consistencyLiveImpactPct: null,
      openPositionsCount: 0,
      openPositions: [],
      rateFloorMs,
      nextSafeSyncAt,
      syncTriggered,
    };
  }

  const raw = asObj(snapshot.rawPayload);
  const sources = [raw, asObj(raw?.stats), asObj(raw?.account_details), asObj(raw?.account), asObj(raw?.overview)];

  const balance = toFinite(snapshot.balance);
  const equity = toFinite(snapshot.equity);
  const floatingPnl =
    toFinite(snapshot.floatingPnl) ??
    (balance !== null && equity !== null ? +(equity - balance).toFixed(2) : null);
  const initialBalance = toFinite(snapshot.initialBalance);
  const netProfit = toFinite(snapshot.netProfit);

  const margin = pickRawNumber(sources, ['margin', 'used_margin', 'usedMargin', 'margin_used', 'marginUsed']);
  const rawFreeMargin = pickRawNumber(sources, [
    'free_margin', 'freeMargin', 'margin_free', 'marginFree', 'available_margin', 'availableMargin',
  ]);
  const freeMargin =
    rawFreeMargin !== null
      ? +rawFreeMargin.toFixed(2)
      : margin !== null && equity !== null
        ? +(equity - margin).toFixed(2)
        : null;
  const rawMarginLevel = pickRawNumber(sources, ['margin_level', 'marginLevel', 'margin_level_pct', 'marginLevelPct']);
  const marginLevelPct =
    rawMarginLevel !== null
      ? +rawMarginLevel.toFixed(1)
      : margin !== null && margin > 0 && equity !== null && equity > 0
        ? +((equity / margin) * 100).toFixed(1)
        : null;

  const dailyLossUsedUsd = pickRawNumber(sources, [
    'daily_dd_used', 'dailyDdUsed', 'daily_loss_used', 'dailyLossUsed', 'daily_drawdown_used', 'dailyDrawdownUsed',
  ]);
  const rawDailyLimit = pickRawNumber(sources, [
    'daily_loss_limit', 'dailyLossLimit', 'max_daily_loss', 'maxDailyLoss', 'daily_drawdown_limit', 'dailyDrawdownLimit',
  ]);
  const dailyLossLimitUsd =
    rawDailyLimit !== null
      ? +Math.abs(rawDailyLimit).toFixed(2)
      : initialBalance !== null && initialBalance > 0
        ? +(initialBalance * 0.05).toFixed(2)
        : null;

  const todayProfit = pickRawNumber(sources, ['today_profit', 'todayProfit', 'daily_profit', 'dailyProfit']);
  const bestDayProfit = pickRawNumber(sources, ['best_day_profit', 'bestDayProfit']);
  let consistencyLiveImpactPct: number | null = null;
  if (netProfit !== null && floatingPnl !== null && (todayProfit !== null || bestDayProfit !== null)) {
    const projectedTotal = netProfit + floatingPnl;
    const projectedBest = Math.max(bestDayProfit ?? 0, (todayProfit ?? 0) + floatingPnl);
    if (projectedBest > 0) {
      consistencyLiveImpactPct = projectedTotal > 0 ? +Math.min(100, (projectedBest / projectedTotal) * 100).toFixed(1) : 100;
    } else {
      consistencyLiveImpactPct = 0;
    }
  }

  return {
    balance,
    equity,
    floatingPnl,
    margin: margin !== null ? +margin.toFixed(2) : null,
    freeMargin,
    marginLevelPct,
    dailyLossUsedUsd: dailyLossUsedUsd !== null ? +Math.abs(dailyLossUsedUsd).toFixed(2) : null,
    dailyLossLimitUsd,
    consistencyLiveImpactPct,
    openPositionsCount: snapshot.openPositions.length,
    openPositions: snapshot.openPositions,
    rateFloorMs,
    nextSafeSyncAt,
    syncTriggered,
  };
}

type Callback = { state: string; code: string; browserSession: string; uid: string };
interface LocalServices {
  remoteRpc?: false;
  store: PilotStore;
  oauth: {
    start(uid: string, opts?: { connectionId?: string; redirectUri?: string }): Promise<{ authorizeUrl: string; browserSession: string }>;
    callback(input: Callback): Promise<{ connectionId: string; status: 'CONNECTED' }>;
  };
}
type Services = LocalServices | RemoteVpsPilotServices;

const cookieName = 'fundednext_pkce';
const callbackPath = '/api/fundednext/oauth/callback';
const popupResultType = 'TALLYNX_FN_PILOT_OAUTH_RESULT';

function sendPopup(res: Response, result: { ok: true; connectionId: string; status: string } | { ok: false; error: string }) {
  const nonce = randomBytes(18).toString('base64');
  const message = JSON.stringify({ type: popupResultType, ...result }).replace(/</g, '\\u003c');
  const heading = result.ok ? 'FundedNext connected' : 'FundedNext connection failed';
  const detail = result.ok ? 'Return to Desk to select an account.' : result.error;
  res.set('Content-Security-Policy', `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`);
  res.type('html').send(`<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${heading}</title>
<style nonce="${nonce}">html{color-scheme:dark}body{display:grid;min-height:100vh;place-items:center;margin:0;background:#0f172a;color:#e2e8f0;font:15px system-ui}main{box-sizing:border-box;width:min(24rem,92vw);border:1px solid #334155;border-radius:12px;padding:1.5rem;background:#1e293b}h1{font-size:1.2rem;margin:0 0 .5rem}p{color:#cbd5e1;margin:0}</style>
<main><h1>${heading}</h1><p>${detail}</p></main>
<script nonce="${nonce}">
const result = ${message};
try { window.opener?.postMessage(result, window.location.origin); } catch {}
try {
  const channel = new BroadcastChannel('tallynx_fn_pilot_oauth');
  channel.postMessage(result);
  channel.close();
} catch {}
setTimeout(() => window.close(), result.ok ? 400 : 3000);
</script></html>`);
}

function popupError(status: number) {
  if (status === 400 || status === 401) return 'Invalid or expired OAuth session';
  if (status === 403) return 'FundedNext pilot access required';
  return 'Could not connect FundedNext. Return to Desk and try again.';
}

function browserSession(header?: string) {
  const cookie = header?.split(';').map(part => part.trim()).find(part => part.startsWith(cookieName + '='));
  const parts = cookie?.slice(cookieName.length + 1).split('.');
  if (!parts || parts.length !== 2) return null;
  const [encodedUid, proof] = parts;
  if (!/^[\w-]{1,684}$/.test(encodedUid) || !/^[\w-]{43}$/.test(proof)) return null;
  return { uid: Buffer.from(encodedUid, 'base64url').toString('utf8'), proof };
}

const badRequest = (message: string) => new PilotStoreError(400, message);

export function createFundedNextRouter(options: {
  verifyIdToken: (token: string) => Promise<{ uid: string } | null>;
  onExecutionsRead?: (uid: string, accountId: string, executions: TradeExecution[]) => void;
  services: () => Services;
  secureCookies?: boolean;
}) {
  const router = Router();
  const cookieOptions: CookieOptions = {
    httpOnly: true, sameSite: 'lax', secure: options.secureCookies ?? true, path: callbackPath,
  };

  function resolveHandlers(raw: Services) {
    if (raw.remoteRpc) {
      return {
        skipPreflightAllowlist: true,
        isAllowlisted: async () => true,
        oauth: raw.oauth,
        listDirectory: raw.listDirectory,
        setAccountTracked: raw.setAccountTracked,
        enqueueSync: raw.enqueueSync,
        getSnapshotState: raw.getSnapshotState,
        listExecutions: raw.listExecutions,
        disconnect: raw.disconnect,
        importJournalBatch: raw.importJournalBatch,
      };
    }
    const { store, oauth } = raw;
    return {
      skipPreflightAllowlist: false,
      isAllowlisted: (uid: string) => store.isAllowlisted(uid),
      oauth,
      listDirectory: async (uid: string, connectionId?: string) => {
        const connection = connectionId ? await store.getConnection(uid, connectionId) : null;
        return { accounts: await store.listAccounts(uid), ...(connection && { connectionStatus: connection.status }) };
      },
      setAccountTracked: async (uid: string, id: string, tracked: boolean) => {
        const account = await store.getAccount(uid, id);
        return store.setTracked(uid, account.connectionId, account.id, tracked);
      },
      enqueueSync: (uid: string, id: string) => store.enqueueSync(uid, id),
      getSnapshotState: (uid: string, id: string, opts?: { live?: boolean }): Promise<{
        snapshot: StoredSnapshot | null;
        syncStatus: import('./store.js').AccountSyncStatus;
      } & Partial<LiveSnapshotStateResult>> =>
        opts?.live ? store.requestLiveSnapshot(uid, id) : store.getAccountSnapshotState(uid, id),
      listExecutions: (uid: string, id: string, cursor?: string, limit?: number) => store.listExecutions(uid, id, cursor, limit),
      disconnect: (uid: string, id: string) => store.disconnect(uid, id),
      importJournalBatch: (uid: string, importId: string, rows: RawRow[]) => store.importJournalBatch(uid, importId, rows),
    };
  }

  type NormalizedServices = ReturnType<typeof resolveHandlers>;

  function route(handler: (req: Request, res: Response, uid: string, services: NormalizedServices) => Promise<void>, isCallback = false) {
    return async (req: Request, res: Response) => {
      res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
      const session = isCallback ? browserSession(req.headers.cookie) : null;
      const wantsPopup = isCallback && String(req.headers.accept || '').includes('text/html');
      function fail(status: number, error: string, code?: string) {
        res.status(status);
        if (wantsPopup) sendPopup(res, { ok: false, error: popupError(status) });
        else res.json(code ? { error, code, status: code } : { error });
      }
      try {
        let uid: string | undefined;
        if (req.headers.authorization !== undefined) {
          const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization);
          const identity = match ? await options.verifyIdToken(match[1]).catch(() => null) : null;
          uid = identity?.uid;
        } else if (session) {
          // A top-level OAuth redirect carries the one-time browser proof issued
          // by the Firebase-authenticated start route.
          uid = session.uid;
        }
        if (!uid) {
          fail(401, 'Authentication required');
          return;
        }
        if (session && session.uid !== uid) {
          fail(403, 'OAuth session belongs to another caller');
          return;
        }
        const services = resolveHandlers(options.services());
        if (!services.skipPreflightAllowlist && !await services.isAllowlisted(uid)) {
          fail(403, 'FundedNext pilot access required');
          return;
        }
        await handler(req, res, uid, services);
      } catch (error) {
        if (error instanceof PilotStoreError) fail(error.status, error.message, error.code);
        else fail(503, 'FundedNext pilot service is temporarily unavailable');
      }
    };
  }

  router.post('/connections', route(async (req, res, uid, { oauth }) => {
    const connectionId = req.body?.connectionId;
    if (connectionId !== undefined && (typeof connectionId !== 'string' || !connectionId || connectionId.length > 128)) {
      throw badRequest('Invalid connection identifier');
    }
    const redirectUri = resolveTrustedDeskRedirectUri(req.headers, {
      protocol: req.protocol,
      allowLocalhost: options.secureCookies === false,
    });
    const { authorizeUrl, browserSession: proof } = await oauth.start(uid, {
      ...(connectionId ? { connectionId } : {}),
      ...(redirectUri ? { redirectUri } : {}),
    });
    res.cookie(cookieName, Buffer.from(uid).toString('base64url') + '.' + proof, { ...cookieOptions, maxAge: PKCE_TTL_MS });
    res.status(201).json({ authorizeUrl });
  }));

  router.get('/oauth/callback', route(async (req, res, uid, { oauth }) => {
    const session = browserSession(req.headers.cookie);
    const { state, code } = req.query;
    if (!session || typeof state !== 'string' || typeof code !== 'string') throw badRequest('Invalid or expired OAuth session');
    const { connectionId, status } = await oauth.callback({ state, code, browserSession: session.proof, uid });
    res.clearCookie(cookieName, cookieOptions);
    if (String(req.headers.accept || '').includes('text/html')) sendPopup(res, { ok: true, connectionId, status });
    else res.json({ connectionId, status });
  }, true));

  router.get('/accounts', route(async (req, res, uid, services) => {
    const { connectionId } = req.query;
    if (connectionId !== undefined && typeof connectionId !== 'string') throw badRequest('Invalid connection identifier');
    res.json(await services.listDirectory(uid, connectionId));
  }));

  router.patch('/accounts/:id/tracking', route(async (req, res, uid, services) => {
    const tracked = req.body?.tracked;
    if (typeof tracked !== 'boolean') throw badRequest('Tracked must be a boolean');
    res.json({ account: await services.setAccountTracked(uid, req.params.id, tracked) });
  }));

  router.post('/accounts/:id/sync', route(async (req, res, uid, services) => {
    res.status(202).json(await services.enqueueSync(uid, req.params.id));
  }));

  const isLiveQuery = (req: Request) => req.query.live === '1' || req.query.live === 'true';

  router.get('/accounts/:id', route(async (req, res, uid, services) => {
    const live = isLiveQuery(req);
    const state = await services.getSnapshotState(uid, req.params.id, { live });
    if (state.syncStatus === 'RECONNECT_REQUIRED') {
      throw new PilotStoreError(409, 'Reconnect this FundedNext connection', 'reconnect_required');
    }
    res.json({
      accountId: req.params.id,
      snapshot: state.snapshot,
      syncStatus: state.syncStatus,
      liveTelemetry: extractFundedNextLiveTelemetry(state.snapshot, state),
    });
  }));

  router.get('/accounts/:id/snapshot', route(async (req, res, uid, services) => {
    const live = isLiveQuery(req);
    const state = await services.getSnapshotState(uid, req.params.id, { live });
    if (state.syncStatus === 'RECONNECT_REQUIRED') {
      throw new PilotStoreError(409, 'Reconnect this FundedNext connection', 'reconnect_required');
    }
    if (!state.snapshot) {
      res.status(404).json({
        error: 'FundedNext snapshot not found',
        syncStatus: state.syncStatus,
        ...(live ? { liveTelemetry: extractFundedNextLiveTelemetry(null, state) } : {}),
      });
      return;
    }
    if (live) {
      res.json({
        snapshot: state.snapshot,
        syncStatus: state.syncStatus,
        liveTelemetry: extractFundedNextLiveTelemetry(state.snapshot, state),
      });
      return;
    }
    res.json({ snapshot: state.snapshot, syncStatus: state.syncStatus });
  }));

  router.get('/accounts/:id/executions', route(async (req, res, uid, services) => {
    const { cursor, limit } = req.query;
    if ((cursor !== undefined && typeof cursor !== 'string') ||
        (limit !== undefined && (typeof limit !== 'string' || !/^[1-9]\d{0,2}$/.test(limit)))) {
      throw badRequest('Invalid execution pagination');
    }
    const result = await services.listExecutions(uid, req.params.id, cursor, limit === undefined ? undefined : Number(limit));
    options.onExecutionsRead?.(uid, req.params.id, result.executions);
    res.json(result);
  }));

  router.delete('/connections/:id', route(async (req, res, uid, services) => {
    res.json(await services.disconnect(uid, req.params.id));
  }));

  router.post('/journal-imports', route(async (req, res, uid, services) => {
    const { importId, rows } = req.body ?? {};
    if (typeof importId !== 'string' || !importId.trim() || !Array.isArray(rows) || rows.length > MAX_JOURNAL_ROWS ||
        rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
      throw badRequest('Invalid journal import');
    }
    res.json(await services.importJournalBatch(uid, importId.trim(), rows as RawRow[]));
  }));

  return router;
}
