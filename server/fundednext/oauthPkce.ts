import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  createGoogleAccessTokenSource,
  GcpCloudKmsProvider,
  KmsEnvelopeCipher,
  LocalAesGcmKmsProvider,
} from './cryptoEnvelope.js';
import type { FundedNextTokens } from './cryptoEnvelope.js';
import { FirestoreRestPilotStore, PilotStoreError } from './store.js';
import type { PilotStore } from './store.js';

export const PKCE_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_MCP_URL = 'https://mcp.fundednext.com/mcp';
export const OAUTH_CALLBACK_PATH = '/api/fundednext/oauth/callback';
export const DEFAULT_OAUTH_REDIRECT_URI = `https://desk.tallynx.com${OAUTH_CALLBACK_PATH}`;
export const DEFAULT_TRUSTED_DESK_ORIGINS = Object.freeze([
  'https://desk.tallynx.com',
  'https://mall.tallynx.com',
  'https://tallynx-desk.vercel.app',
  'https://tredyn-desk.vercel.app',
]);
const oauthOrigin = 'https://mcp.fundednext.com';
const nonce = () => randomBytes(32).toString('base64url');
const browserHash = (browserSession: string) => createHash('sha256').update(browserSession).digest('hex');

function isLocalhostOrigin(url: URL): boolean {
  return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
}

function parseTrustedOrigin(raw: string | undefined): string | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if ((url.protocol !== 'https:' && !isLocalhostOrigin(url)) || url.username || url.password || url.hash) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function collectTrustedOrigins(extraOrigins: Iterable<string> = []): Set<string> {
  const trusted = new Set<string>(DEFAULT_TRUSTED_DESK_ORIGINS);
  const envRedirectOrigin = parseTrustedOrigin(process.env.FUNDEDNEXT_OAUTH_REDIRECT_URI);
  if (envRedirectOrigin) trusted.add(envRedirectOrigin);
  for (const part of String(process.env.FUNDEDNEXT_ALLOWED_ORIGINS ?? '').split(',')) {
    const origin = parseTrustedOrigin(part);
    if (origin) trusted.add(origin);
  }
  for (const extra of extraOrigins) {
    const origin = parseTrustedOrigin(extra);
    if (origin) trusted.add(origin);
  }
  return trusted;
}

export function isTrustedDeskRedirectUri(
  rawUri: string,
  options: { allowLocalhost?: boolean; extraOrigins?: Iterable<string> } = {}
): string | null {
  try {
    const url = new URL(rawUri);
    if (url.pathname !== OAUTH_CALLBACK_PATH || url.search || url.hash || url.username || url.password) {
      return null;
    }
    const trusted = collectTrustedOrigins(options.extraOrigins);
    const allowLocalhost = options.allowLocalhost ?? process.env.NODE_ENV !== 'production';
    if (url.protocol === 'https:' && trusted.has(url.origin)) {
      return `${url.origin}${OAUTH_CALLBACK_PATH}`;
    }
    if (isLocalhostOrigin(url) && (allowLocalhost || trusted.has(url.origin))) {
      return `${url.origin}${OAUTH_CALLBACK_PATH}`;
    }
    return null;
  } catch {
    return null;
  }
}

export function resolveTrustedDeskRedirectUri(
  headers: Record<string, string | string[] | undefined>,
  options: { protocol?: string; allowLocalhost?: boolean } = {}
): string | undefined {
  const rawProto = Array.isArray(headers['x-forwarded-proto'])
    ? headers['x-forwarded-proto'][0]
    : headers['x-forwarded-proto'];
  const protoCandidate = String(rawProto ?? '').split(',')[0].trim().toLowerCase();
  const proto = protoCandidate === 'http' || protoCandidate === 'https'
    ? protoCandidate
    : (options.protocol === 'http' || options.protocol === 'https' ? options.protocol : 'https');
  const rawHost = Array.isArray(headers['x-forwarded-host'])
    ? headers['x-forwarded-host'][0]
    : (headers['x-forwarded-host'] ?? (Array.isArray(headers.host) ? headers.host[0] : headers.host));
  const host = String(rawHost ?? '').split(',')[0].trim();
  if (!host || /[^a-zA-Z0-9.:-]/.test(host)) {
    return undefined;
  }
  return isTrustedDeskRedirectUri(`${proto}://${host}${OAUTH_CALLBACK_PATH}`, {
    allowLocalhost: options.allowLocalhost,
  }) ?? undefined;
}

interface OAuthClient {
  clientId: string;
  clientSecret?: string;
}

interface TokenExchange extends OAuthClient {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

interface PkceOptions {
  store: PilotStore;
  cipher: KmsEnvelopeCipher;
  authorizationEndpoint: string;
  redirectUri: string;
  clientId?: string;
  clientSecret?: string;
  resource?: string;
  allowLocalhost?: boolean;
  isAllowlisted?: (uid: string) => boolean | Promise<boolean>;
  registerClient?: (redirectUri: string) => Promise<string>;
  fetchTokens: (exchange: TokenExchange) => Promise<FundedNextTokens>;
  now?: () => number;
}

export class OAuthPkceManager {
  private readonly now: () => number;

  constructor(private readonly options: PkceOptions) {
    this.now = options.now ?? Date.now;
  }

  async start(uid: string, opts: { connectionId?: string; redirectUri?: string } = {}) {
    await this.requirePilot(uid);
    const defaultRedirectUri = checkedUrl(this.options.redirectUri, true);
    let redirectUri = defaultRedirectUri;
    if (opts.redirectUri !== undefined) {
      const validated = isTrustedDeskRedirectUri(opts.redirectUri, {
        allowLocalhost: this.options.allowLocalhost,
        extraOrigins: [new URL(defaultRedirectUri).origin],
      });
      if (!validated) {
        throw new PilotStoreError(400, 'Invalid redirect URI');
      }
      redirectUri = validated;
    }
    const authorizeUrl = new URL(checkedUrl(this.options.authorizationEndpoint));
    const previous = opts.connectionId ? await this.options.store.getConnection(uid, opts.connectionId) : null;
    const clientId = this.options.clientId ?? await this.options.registerClient?.(redirectUri);
    if (!clientId) throw new Error('FundedNext OAuth client configuration is required');
    const state = nonce();
    const codeVerifier = nonce();
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const browserSession = nonce();
    await this.options.store.putPkceSession(state, {
      uid, browserSessionHash: browserHash(browserSession), codeVerifier,
      expiresAt: this.now() + PKCE_TTL_MS, connectionId: previous?.id ?? nonce(),
      expectedGeneration: previous?.generation ?? 0, clientId, redirectUri,
    });
    const params = {
      response_type: 'code', client_id: clientId, redirect_uri: redirectUri, scope: 'mcp:read', state,
      code_challenge: codeChallenge, code_challenge_method: 'S256', resource: this.options.resource,
    };
    for (const [key, value] of Object.entries(params)) if (value !== undefined) authorizeUrl.searchParams.set(key, value);
    return { authorizeUrl: authorizeUrl.toString(), browserSession, state };
  }

  async callback(input: { state: string; code: string; browserSession: string; uid: string }) {
    const { state, code, browserSession, uid } = input;
    if (!/^[\w-]{43}$/.test(state) || !/^[\w-]{43}$/.test(browserSession) || !code || code.length > 4096) {
      throw new PilotStoreError(400, 'Invalid or expired OAuth session');
    }
    await this.requirePilot(uid);
    const session = await this.options.store.consumePkceSession(state, uid, browserHash(browserSession), this.now());
    if (!session) throw new PilotStoreError(400, 'Invalid or expired OAuth session');
    const clientSecret = session.clientId === this.options.clientId ? this.options.clientSecret : undefined;
    const redirectUri = checkedUrl(session.redirectUri ?? this.options.redirectUri, true);
    const tokens = await this.options.fetchTokens({
      code, codeVerifier: session.codeVerifier, redirectUri,
      clientId: session.clientId, clientSecret,
    });
    const envelope = await this.options.cipher.encryptTokens({ ...tokens, clientId: session.clientId, clientSecret });
    await this.requirePilot(uid);
    await this.options.store.activateConnection(uid, session.connectionId, envelope, this.now(), session.expectedGeneration, true);
    return { connectionId: session.connectionId, status: 'CONNECTED' as const };
  }

  private async requirePilot(uid: string) {
    if (!uid || !(await this.options.store.isAllowlisted(uid)) ||
        (this.options.isAllowlisted && !await this.options.isAllowlisted(uid))) {
      throw new PilotStoreError(403, 'FundedNext pilot access required');
    }
  }
}

function checkedUrl(value: string, allowLocal = false) {
  const url = new URL(value);
  const local = allowLocal && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !local) || url.username || url.password || url.hash) throw new Error('Invalid FundedNext OAuth URL');
  return url.toString();
}

export class OAuthTokenError extends Error {
  constructor(readonly reconnect: boolean, readonly retryAfter?: string | null, readonly oauthError?: string) {
    super('FundedNext OAuth token request failed');
  }
}

async function requestTokens(
  endpoint: string,
  input: Record<string, string>,
  previousRefreshToken?: string,
  requestFetch: typeof fetch = fetch
): Promise<FundedNextTokens> {
  const response = await requestFetch(checkedUrl(endpoint), {
    method: 'POST', headers: { Accept: 'application/json' }, body: new URLSearchParams(input),
    redirect: 'error', signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json().catch(() => ({})) as {
    access_token?: string; refresh_token?: string; expires_in?: number | string; error?: string;
  };
  if (!response.ok || !result || result.error) {
    const reconnect = response.status === 401 || response.status === 403 ||
      ['invalid_grant', 'invalid_client', 'invalid_token'].includes(result?.error ?? '');
    throw new OAuthTokenError(reconnect, response.headers.get('Retry-After'), result?.error);
  }
  const expiresIn = Number(result.expires_in);
  if (typeof result.access_token !== 'string' || !result.access_token || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new OAuthTokenError(false);
  }
  return {
    accessToken: result.access_token,
    refreshToken: typeof result.refresh_token === 'string' && result.refresh_token ? result.refresh_token : previousRefreshToken,
    tokenExpiresAt: Date.now() + Math.floor(expiresIn * 1000),
  };
}

function clientParams({ clientId, clientSecret }: OAuthClient) {
  return { client_id: clientId, ...(clientSecret ? { client_secret: clientSecret } : {}) };
}

function parseMasterKeyBytes(raw: string | undefined): Buffer | undefined {
  const value = String(raw || '').trim();
  if (!value) return undefined;
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, 'hex');
  const b64 = Buffer.from(value, 'base64');
  return b64.length === 32 ? b64 : undefined;
}

function readFirebaseAppletDefaults(): { projectId?: string; firestoreDatabaseId?: string } {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8');
    return JSON.parse(raw) as { projectId?: string; firestoreDatabaseId?: string };
  } catch {
    return {};
  }
}

export function createFundedNextRuntimeForStore(
  store: PilotStore,
  options: { kmsKeyName?: string; getAccessToken?: () => Promise<string>; fetch?: typeof fetch } = {}
) {
  const kmsKeyName = String(options.kmsKeyName ?? '').trim();
  const masterKey = parseMasterKeyBytes(process.env.FUNDEDNEXT_MASTER_KEY);
  const cipherProvider =
    kmsKeyName && options.getAccessToken
      ? new GcpCloudKmsProvider({ keyName: kmsKeyName, getAccessToken: options.getAccessToken })
      : new LocalAesGcmKmsProvider(masterKey);
  const cipher = new KmsEnvelopeCipher(cipherProvider);
  const requestFetch = options.fetch ?? fetch;
  const mcpUrl = process.env.FUNDEDNEXT_MCP_URL ?? DEFAULT_MCP_URL;
  const resource = process.env.FUNDEDNEXT_OAUTH_RESOURCE ?? new URL(mcpUrl).origin;
  const tokenEndpoint = process.env.FUNDEDNEXT_OAUTH_TOKEN_ENDPOINT ?? oauthOrigin + '/oauth/token';
  const configuredClientId = process.env.FUNDEDNEXT_OAUTH_CLIENT_ID?.trim() || undefined;
  const registeredClients = new Map<string, string>();

  const requestTokensWithClientReset = async (
    input: Record<string, string>,
    previousRefreshToken?: string,
    redirectUri?: string
  ) => {
    try {
      return await requestTokens(tokenEndpoint, input, previousRefreshToken, requestFetch);
    } catch (error) {
      if (error instanceof OAuthTokenError && (error.oauthError === 'invalid_client' || error.oauthError === 'unauthorized_client')) {
        if (redirectUri) registeredClients.delete(redirectUri);
        else registeredClients.clear();
      }
      throw error;
    }
  };

  const oauth = new OAuthPkceManager({
    store, cipher, resource,
    authorizationEndpoint: process.env.FUNDEDNEXT_OAUTH_AUTHORIZE_ENDPOINT ?? oauthOrigin + '/oauth/authorize',
    clientId: configuredClientId,
    clientSecret: process.env.FUNDEDNEXT_OAUTH_CLIENT_SECRET,
    redirectUri:
      process.env.FUNDEDNEXT_OAUTH_REDIRECT_URI ??
      DEFAULT_OAUTH_REDIRECT_URI,
    registerClient: async redirectUri => {
      const cached = registeredClients.get(redirectUri);
      if (cached) {
        return cached;
      }
      let response: Response;
      try {
        response = await requestFetch(checkedUrl(process.env.FUNDEDNEXT_OAUTH_REGISTRATION_ENDPOINT ?? oauthOrigin + '/oauth/register'), {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            client_name: 'TallyNX Desk', redirect_uris: [redirectUri], grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'], token_endpoint_auth_method: 'none', scope: 'mcp:read',
          }),
          redirect: 'error', signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new PilotStoreError(502, 'FundedNext OAuth registration endpoint is unreachable');
      }
      if (!response.ok) {
        throw new PilotStoreError(502, `FundedNext OAuth registration failed (HTTP ${response.status})`);
      }
      const result = await response.json().catch(() => null) as { client_id?: string } | null;
      if (typeof result?.client_id !== 'string' || !result.client_id) {
        throw new PilotStoreError(502, 'Invalid FundedNext OAuth registration response');
      }
      registeredClients.set(redirectUri, result.client_id);
      return result.client_id;
    },
    fetchTokens: exchange => requestTokensWithClientReset({
      ...clientParams(exchange), grant_type: 'authorization_code', code: exchange.code,
      code_verifier: exchange.codeVerifier, redirect_uri: exchange.redirectUri, resource,
    }, undefined, exchange.redirectUri),
  });
  const refreshTokens = (tokens: FundedNextTokens) => {
    if (!tokens.refreshToken || !tokens.clientId) throw new OAuthTokenError(true);
    return requestTokensWithClientReset({ ...clientParams({ ...tokens, clientId: tokens.clientId }),
      grant_type: 'refresh_token', refresh_token: tokens.refreshToken, resource,
    }, tokens.refreshToken);
  };
  return { store, cipher, mcpUrl, oauth, refreshTokens };
}

export function createFundedNextRuntime(projectIdFallback?: string, databaseIdFallback?: string) {
  const appletCfg = readFirebaseAppletDefaults();
  const getAccessToken = createGoogleAccessTokenSource(process.env.FUNDEDNEXT_GOOGLE_SERVICE_ACCOUNT_JSON);
  const store = new FirestoreRestPilotStore({
    projectId:
      process.env.FUNDEDNEXT_FIRESTORE_PROJECT_ID ??
      process.env.GOOGLE_CLOUD_PROJECT ??
      projectIdFallback ??
      appletCfg.projectId ??
      '',
    databaseId:
      process.env.FUNDEDNEXT_FIRESTORE_DATABASE_ID ??
      databaseIdFallback ??
      appletCfg.firestoreDatabaseId,
    getAccessToken,
  });
  return createFundedNextRuntimeForStore(store, {
    kmsKeyName: process.env.FUNDEDNEXT_KMS_KEY_NAME,
    getAccessToken,
  });
}
