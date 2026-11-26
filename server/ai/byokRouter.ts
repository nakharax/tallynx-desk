import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import express, { type RequestHandler } from 'express';
import {
  AI_HEADERS, AI_MODEL_CATALOG, CODEX_CALLBACK_URI, asRecord, buildDatabentoRequestHeaders, normalizeCodexAccountId, normalizeHeaderSecret,
  readCodexOauthCredential,
} from '../../src/utils/aiProviderConfig.js';
import { GEMINI_DECISION_MODEL, GEMINI_FLASH_LITE_31, GEMINI_FLASH_LITE_35, GEMINI_38_LIVE } from '../../src/utils/geminiOrchestrator.js';
import { CODEX_ORIGINATOR, aiRateSubject, readPersonalAiConnection, verifyPersonalAiConnection } from './byokProvider.js';
import type { PlatformAiPrivilege } from './platformPrivilege.js';

const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const AUTH_ORIGIN = 'https://auth.openai.com';
const OAUTH_WINDOW_MS = 10 * 60_000;

interface ByokRouterDependencies {
  resolvePlatformAiPrivilege: (authorization: string | undefined) => Promise<PlatformAiPrivilege>;
  isPlatformConfigured: () => boolean;
  checkDistributedRateLimit: (key: string, maxRequests?: number) => Promise<{ allowed: boolean; retryAfterSec: number }>;
  env?: Partial<Record<'OPENAI_CODEX_OAUTH_CLIENT_ID' | 'OPENAI_CODEX_OAUTH_REDIRECT_URI', string>>;
  fetcher?: typeof fetch;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

function oauthState(verifier: string, expiresAt: number, clientId: string, redirectUri: string): string {
  return `${expiresAt}.${digest(JSON.stringify(['codex-state', verifier, expiresAt, clientId, redirectUri]))}`;
}

function resolveRedirectUri(value: string): string | null {
  try {
    const url = new URL(value);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
      url.username || url.password || url.hash || url.search) return null;
    return value;
  } catch {
    return null;
  }
}

export function createByokRouter(deps: ByokRouterDependencies) {
  const router = express.Router();
  const fetcher = deps.fetcher ?? fetch;
  const clientId = deps.env?.OPENAI_CODEX_OAUTH_CLIENT_ID?.trim() || CODEX_CLIENT_ID;
  const redirectUri = resolveRedirectUri(deps.env?.OPENAI_CODEX_OAUTH_REDIRECT_URI?.trim() || CODEX_CALLBACK_URI);
  const limited = (name: string, maxRequests: number, handler: RequestHandler): RequestHandler => async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
      const rate = await deps.checkDistributedRateLimit(`${name}:${aiRateSubject(req)}`, maxRequests);
      if (!rate.allowed) {
        res.set('Retry-After', String(rate.retryAfterSec));
        res.status(429).json({ ok: false, code: 'RATE_LIMITED', error: 'Too many requests. Try again later.' });
        return;
      }
      await handler(req, res, next);
    } catch {
      if (!res.headersSent) res.status(502).json({ ok: false, code: 'PROVIDER_UNAVAILABLE', error: 'The provider is temporarily unavailable.' });
    }
  };

  router.get('/ai/provider-status', limited('ai-status', 180, async (req, res) => {
    const privilege = await deps.resolvePlatformAiPrivilege(req.get('Authorization'));
    res.json({
      platformEligible: privilege.eligible,
      role: privilege.role,
      platformConfigured: privilege.eligible && deps.isPlatformConfigured(),
      defaults: {
        platform: {
          chat: 'auto', decision: GEMINI_DECISION_MODEL, fast: GEMINI_FLASH_LITE_31,
          risk: GEMINI_FLASH_LITE_35, live: GEMINI_38_LIVE,
        },
        google: AI_MODEL_CATALOG.google[0],
        openrouter: AI_MODEL_CATALOG.openrouter[0],
        codex_oauth: AI_MODEL_CATALOG.codex_oauth[0],
      },
    });
  }));

  router.post('/ai/codex-oauth/start', limited('codex-start', 20, (_req, res) => {
    if (!redirectUri) {
      res.status(503).json({ ok: false, code: 'OAUTH_CONFIGURATION', error: 'The Codex redirect URI is unavailable.' });
      return;
    }
    const verifier = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + OAUTH_WINDOW_MS;
    const state = oauthState(verifier, expiresAt, clientId, redirectUri);
    const query = new URLSearchParams({
      client_id: clientId, response_type: 'code', redirect_uri: redirectUri,
      scope: 'openid profile email offline_access',
      code_challenge: digest(verifier), code_challenge_method: 'S256', state,
      id_token_add_organizations: 'true', codex_cli_simplified_flow: 'true', originator: CODEX_ORIGINATOR,
    });
    res.json({ ok: true, authorizationUrl: `${AUTH_ORIGIN}/oauth/authorize?${query}`, verifier, state, redirectUri, expiresAt });
  }));

  async function tokenRequest(params: Record<string, string>, previous?: { token: string; accountId?: string }) {
    const response = await fetcher(`${AUTH_ORIGIN}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': previous ? 'application/json' : 'application/x-www-form-urlencoded' },
      body: previous ? JSON.stringify(params) : new URLSearchParams(params),
      redirect: 'error',
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return { status: response.status };
    }
    const data = asRecord(await response.json());
    const seconds = Number(data?.expires_in);
    const credential = readCodexOauthCredential({
      ...data,
      account_id: data?.account_id ?? previous?.accountId,
      refresh_token: normalizeHeaderSecret(data?.refresh_token) ?? previous?.token,
      expiresAt: Number.isFinite(seconds) && seconds > 0 && seconds <= 31_536_000 ? Date.now() + seconds * 1000 : undefined,
    });
    return { status: response.status, credential };
  }

  router.post('/ai/codex-oauth/exchange', limited('codex-exchange', 25, async (req, res) => {
    const code = normalizeHeaderSecret(req.get(AI_HEADERS.oauthCode), 2_048);
    const verifier = req.get(AI_HEADERS.oauthVerifier);
    const state = req.get(AI_HEADERS.oauthState);
    const timestamp = state?.match(/^(\d{13})\.[a-zA-Z0-9_-]{43}$/)?.[1];
    const expiry = Number(timestamp);
    const now = Date.now();
    if (!redirectUri || !code || !verifier || !/^[a-zA-Z0-9_-]{43}$/.test(verifier) || !state || !timestamp ||
      expiry <= now || expiry > now + OAUTH_WINDOW_MS ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(oauthState(verifier, expiry, clientId, redirectUri)))) {
      res.status(400).json({ ok: false, code: 'INVALID_OAUTH_CALLBACK', error: 'Start a new Codex sign-in and paste its callback or code.' });
      return;
    }
    const result = await tokenRequest({
      client_id: clientId, grant_type: 'authorization_code', redirect_uri: redirectUri, code, code_verifier: verifier,
    });
    if (!result.credential) {
      res.status(result.status === 429 ? 429 : result.status >= 400 && result.status < 500 ? 400 : 502)
        .json({ ok: false, code: 'OAUTH_EXCHANGE_FAILED', error: 'Codex could not exchange this code. Start a new sign-in.' });
      return;
    }
    res.json({ ok: true, credential: result.credential });
  }));

  router.post('/ai/codex-oauth/refresh', limited('codex-refresh', 60, async (req, res) => {
    const refreshToken = normalizeHeaderSecret(req.get(AI_HEADERS.key));
    if (!refreshToken) {
      res.status(400).json({ ok: false, code: 'INVALID_REFRESH_TOKEN', error: 'Reconnect your Codex account.' });
      return;
    }
    const result = await tokenRequest({ client_id: clientId, grant_type: 'refresh_token', refresh_token: refreshToken }, {
      token: refreshToken, accountId: normalizeCodexAccountId(req.get(AI_HEADERS.account)),
    });
    if (!result.credential) {
      const rejected = [400, 401, 403].includes(result.status);
      res.status(rejected ? 403 : result.status === 429 ? 429 : 502).json({
        ok: false, code: rejected ? 'BYOK_REQUIRED' : result.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_UNAVAILABLE',
        error: rejected ? 'Reconnect your Codex account.' : 'Codex is temporarily unavailable.',
      });
      return;
    }
    res.json({ ok: true, credential: result.credential });
  }));

  router.post('/ai/byok/verify', limited('byok-verify', 40, async (req, res) => {
    const connection = readPersonalAiConnection(req);
    const dataKey = buildDatabentoRequestHeaders(req.get(AI_HEADERS.databento))[AI_HEADERS.databento];
    const checkDatabento = req.get(AI_HEADERS.databento) !== undefined;
    if (checkDatabento ? !dataKey || req.get(AI_HEADERS.provider) !== undefined : !connection) {
      res.status(400).json({ ok: false, code: 'INVALID_CREDENTIAL', error: 'Enter a valid credential for one provider.' });
      return;
    }
    let status: number;
    if (checkDatabento) {
      const response = await fetcher('https://hist.databento.com/v0/metadata.list_datasets', {
        headers: { Authorization: `Basic ${Buffer.from(`${dataKey}:`).toString('base64')}` },
        signal: AbortSignal.timeout(8_000),
        redirect: 'error',
      });
      status = response.status;
      await response.body?.cancel();
    } else if (connection) {
      status = await verifyPersonalAiConnection(connection, fetcher);
    } else {
      return;
    }
    if (status < 200 || status >= 300) {
      const rejected = [400, 401, 403].includes(status);
      res.status(rejected ? 403 : status === 429 ? 429 : 502).json({
        ok: false, code: rejected ? 'INVALID_CREDENTIAL' : status === 429 ? 'RATE_LIMITED' : 'PROVIDER_UNAVAILABLE',
        error: rejected ? 'The provider rejected this credential.' : 'The provider could not verify this credential right now.',
      });
      return;
    }
    res.json({ ok: true, provider: checkDatabento ? 'databento' : connection?.provider });
  }));

  return router;
}
