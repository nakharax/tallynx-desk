export const AI_HEADERS = {
  provider: 'X-TallyNX-AI-Provider',
  model: 'X-TallyNX-AI-Model',
  key: 'X-TallyNX-AI-Key',
  account: 'X-TallyNX-Codex-Account-Id',
  databento: 'X-TallyNX-Databento-Key',
  oauthCode: 'X-TallyNX-Codex-Code',
  oauthVerifier: 'X-TallyNX-Codex-Verifier',
  oauthState: 'X-TallyNX-Codex-State',
} as const;

export const AI_MODEL_CATALOG = {
  platform: [
    'auto',
    'gemini-4-neon',
    'gemini-4-carbon',
    'gemini-4-argon',
    'gemini-4-hydrogen',
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
  ],
  google: [
    'gemini-4-neon',
    'gemini-4-carbon',
    'gemini-4-argon',
    'gemini-4-hydrogen',
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemma-4-31b-it',
  ],
  openrouter: [
    'google/gemini-4-neon',
    'google/gemini-4-carbon',
    'google/gemini-4-argon',
    'google/gemini-4-hydrogen',
    'google/gemini-3.8-flash',
    'openai/gpt-6.2-astra',
    'openai/gpt-6.2-sol',
    'openai/gpt-5.4',
    'openai/o3',
    'anthropic/claude-opus-5.5',
    'anthropic/claude-sonnet-5.5',
    'anthropic/claude-haiku-5.5',
    'anthropic/claude-fable-5.2',
    'anthropic/claude-sonnet-4',
    'x-ai/grok-4.7',
    'x-ai/grok-4.6',
    'x-ai/grok-4',
    'deepseek/deepseek-v4.1-flash',
    'deepseek/deepseek-v4-pro',
    'deepseek/deepseek-r1',
    'qwen/qwen4-max',
    'qwen/qwen3.8-max-prime',
    'qwen/qwen3-next-80b-a3b-instruct',
    'openrouter/auto',
  ],
  codex_oauth: [
    'gpt-6.2-astra',
    'gpt-6.2-sol',
    'gpt-6.1-sol',
    'gpt-5.4',
    'gpt-5.3-codex',
    'o3',
  ],
} as const;

export const AI_MODEL_BADGES: Readonly<Record<string, string>> = {
  'gemini-4-neon': 'Frontier · Fast',
  'gemini-4-carbon': 'Flagship · Deep',
  'gemini-4-argon': 'Frontier · Balanced',
  'gemini-4-hydrogen': 'Workhorse · Free Tier',
  'gemini-3.8-flash': 'Flash · 1M',
  'gemini-3.5-flash-lite': 'Lite · Balanced',
  'gemini-3.1-flash-lite': 'Lite · Ultra-Fast',
  'gemma-4-31b-it': 'Open · 31B',
  'gpt-6.2-astra': 'Flagship · Codex',
  'gpt-6.2-sol': 'Daily · Codex',
  'gpt-6.1-sol': 'Fast · Codex',
  'gpt-5.4': 'Legacy Frontier',
  'gpt-5.3-codex': 'Legacy Codex',
  'o3': 'Reasoning',
  'google/gemini-4-neon': 'Frontier · Fast',
  'google/gemini-4-carbon': 'Flagship · Deep',
  'google/gemini-4-argon': 'Frontier · Balanced',
  'google/gemini-4-hydrogen': 'Workhorse · 1M',
  'google/gemini-3.8-flash': 'Flash · 1M',
  'openai/gpt-6.2-astra': 'Flagship',
  'openai/gpt-6.2-sol': 'Balanced',
  'openai/gpt-5.4': 'Legacy Frontier',
  'openai/o3': 'Reasoning',
  'anthropic/claude-opus-5.5': 'Flagship',
  'anthropic/claude-sonnet-5.5': 'Balanced',
  'anthropic/claude-haiku-5.5': 'Fast',
  'anthropic/claude-fable-5.2': 'Creative · Reasoning',
  'anthropic/claude-sonnet-4': 'Legacy',
  'x-ai/grok-4.7': 'Flagship',
  'x-ai/grok-4.6': 'Balanced',
  'x-ai/grok-4': 'Standard',
  'deepseek/deepseek-v4.1-flash': 'Fast · Reasoning',
  'deepseek/deepseek-v4-pro': 'Flagship',
  'deepseek/deepseek-r1': 'Reasoning',
  'qwen/qwen4-max': 'Flagship',
  'qwen/qwen3.8-max-prime': 'Balanced',
  'qwen/qwen3-next-80b-a3b-instruct': 'MoE · 80B',
  'openrouter/auto': 'Auto Router',
};

export type AiProvider = keyof typeof AI_MODEL_CATALOG;
export type ByokProvider = Exclude<AiProvider, 'platform'>;
export type PlatformAiRole = 'FOUNDER' | 'ADMIN' | 'LIFETIME' | null;
export type ProviderConnectionState = 'connected' | 'expired' | 'disconnected' | 'unavailable';

export interface ProviderStatusInput {
  googleKey?: string;
  openrouterKey?: string;
  openAiKey?: string;
  codex?: CodexOauthCredential;
  databentoKey?: string;
}

export function getAiProviderConnectionState(
  provider: AiProvider,
  credentials: ProviderStatusInput,
  platform?: { eligible: boolean; configured: boolean } | null,
  now = Date.now(),
): ProviderConnectionState {
  if (provider === 'platform') {
    if (!platform) return 'disconnected';
    if (!platform.eligible) return 'disconnected';
    return platform.configured ? 'connected' : 'unavailable';
  }
  if (provider === 'google') {
    return credentials.googleKey && isByokKeyFormat('google', credentials.googleKey) ? 'connected' : 'disconnected';
  }
  if (provider === 'openrouter') {
    return credentials.openrouterKey && isByokKeyFormat('openrouter', credentials.openrouterKey) ? 'connected' : 'disconnected';
  }
  if (credentials.openAiKey && isOpenAiApiKey(credentials.openAiKey)) return 'connected';
  if (credentials.codex?.accessToken && isByokKeyFormat('codex_oauth', credentials.codex.accessToken, credentials.codex.chatgptAccountId)) {
    if (
      typeof credentials.codex.expiresAt === 'number' &&
      credentials.codex.expiresAt <= now &&
      !credentials.codex.refreshToken
    ) {
      return 'expired';
    }
    return 'connected';
  }
  return 'disconnected';
}

export function isDatabentoConnected(key: string | undefined): boolean {
  return Boolean(buildDatabentoRequestHeaders(key)[AI_HEADERS.databento]);
}

export function getActiveDeskAiStatus(
  credentials: ProviderStatusInput & { provider?: AiProvider },
  uid: string | null | undefined,
  now = Date.now(),
): { provider: AiProvider | null; state: ProviderConnectionState } {
  const provider = credentials.provider ?? null;
  if (provider === 'google' || provider === 'openrouter' || provider === 'codex_oauth') {
    return {
      provider,
      state: getAiProviderConnectionState(provider, credentials, null, now),
    };
  }
  if (provider === 'platform') {
    return { provider: 'platform', state: uid ? 'connected' : 'disconnected' };
  }
  // No explicit provider selected yet: check whether any personal key is saved, or signed-in platform default.
  for (const candidate of ['google', 'codex_oauth', 'openrouter'] as const) {
    const state = getAiProviderConnectionState(candidate, credentials, null, now);
    if (state === 'connected') return { provider: candidate, state };
  }
  return { provider: uid ? 'platform' : null, state: uid ? 'connected' : 'disconnected' };
}

export interface CodexJwtMetadata {
  accountEmail?: string;
  planType?: string;
  chatgptAccountId?: string;
  /** Epoch milliseconds. */
  expiresAt?: number;
}

export interface CodexOauthCredential extends CodexJwtMetadata {
  accessToken: string;
  refreshToken?: string;
}

export interface AiRequestCredential {
  provider: AiProvider;
  key?: string;
  model?: string;
  chatgptAccountId?: string;
}

export const CODEX_CALLBACK_URI = 'http://localhost:1455/auth/callback';

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

export function normalizeAiProvider(value: unknown): AiProvider | undefined {
  if (typeof value !== 'string') return undefined;
  const provider = value.trim().toLowerCase();
  if (provider === 'gemini') return 'google';
  if (provider === 'openai' || provider === 'codex') return 'codex_oauth';
  return Object.hasOwn(AI_MODEL_CATALOG, provider) ? provider as AiProvider : undefined;
}

export function normalizeAiModel(provider: AiProvider, value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const id = value.trim();
  if (isOpenAiApiKey(id) || /^sk-or-v1-/i.test(id) || /^AIza[a-zA-Z0-9_-]{35}$/.test(id) || isCodexAccessToken(id)) return undefined;
  const model = id.toLowerCase();
  if (provider === 'platform') return AI_MODEL_CATALOG.platform.some(candidate => candidate === model) ? model : undefined;
  if (provider === 'google') {
    const googleModel = model.replace(/^models\//, '');
    return /^[a-z0-9][a-z0-9._-]{0,127}$/.test(googleModel) ? googleModel : undefined;
  }
  if (provider === 'openrouter') {
    return model.length <= 128 && /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(?::[a-z0-9._-]+)?$/.test(model)
      ? model : undefined;
  }
  return /^[a-z0-9][a-z0-9._:-]{0,127}$/.test(model) ? model : undefined;
}

export function normalizeHeaderSecret(value: unknown, maxLength = 8_000): string | undefined {
  if (typeof value !== 'string' || /[^\x20-\x7e]/.test(value)) return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength && /^[!-~]+$/.test(trimmed) ? trimmed : undefined;
}

export function normalizeCodexAccountId(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value) ? value : undefined;
}

export function isOpenAiApiKey(key: string): boolean {
  return /^sk-(?!or-v1-)[a-zA-Z0-9_-]{12,}$/.test(key);
}

export function isCodexAccessToken(key: string): boolean {
  return /^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(key);
}

export function isByokKeyFormat(provider: ByokProvider, key: string, accountId?: string): boolean {
  if (provider === 'google') return /^AIza[a-zA-Z0-9_-]{35}$/.test(key);
  if (provider === 'openrouter') return /^sk-or-v1-[a-zA-Z0-9_-]{16,}$/.test(key);
  return isOpenAiApiKey(key) || isCodexAccessToken(key) || Boolean(accountId && /^[a-zA-Z0-9._~-]{16,}$/.test(key));
}

export function buildDeskAiRequestHeaders(credential?: AiRequestCredential, firebaseToken?: string | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (firebaseToken) headers.Authorization = `Bearer ${firebaseToken}`;
  if (!credential) return headers;
  const { provider } = credential;
  headers[AI_HEADERS.provider] = provider;
  const model = normalizeAiModel(provider, credential.model);
  if (model) headers[AI_HEADERS.model] = model;
  if (provider === 'platform') return headers;
  const key = normalizeHeaderSecret(credential.key);
  const accountId = provider === 'codex_oauth' ? normalizeCodexAccountId(credential.chatgptAccountId) : undefined;
  if (key && isByokKeyFormat(provider, key, accountId)) {
    headers[AI_HEADERS.key] = key;
    if (accountId && !isOpenAiApiKey(key)) headers[AI_HEADERS.account] = accountId;
  }
  return headers;
}

export function buildDatabentoRequestHeaders(key: unknown): Record<string, string> {
  const clean = normalizeHeaderSecret(key, 256);
  return clean && /^[a-zA-Z0-9_-]+$/.test(clean) ? { [AI_HEADERS.databento]: clean } : {};
}

export function maskCredential(value: string | undefined): string {
  return value ? '••••••••' : '';
}

function displayString(value: unknown, limit: number): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= limit && !/[\x00-\x1f\x7f]/.test(value)
    ? value : undefined;
}

/** Metadata is for display and provider routing only. It is never an authorization decision. */
export function decodeCodexJwtMetadata(token: unknown): CodexJwtMetadata {
  if (typeof token !== 'string' || token.length > 24_000 || !isCodexAccessToken(token)) return {};
  try {
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    const claims = asRecord(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    if (!claims) return {};
    const auth = asRecord(claims['https://api.openai.com/auth']);
    const profile = asRecord(claims['https://api.openai.com/profile']);
    const email = displayString(claims.email ?? profile?.email, 254);
    const accountEmail = email && /^[^\s@]+@[^\s@]+$/.test(email) ? email : undefined;
    const plan = displayString(auth?.chatgpt_plan_type ?? claims.chatgpt_plan_type, 40);
    const planType = plan && /^[a-zA-Z0-9_-]+$/.test(plan) ? plan : undefined;
    const chatgptAccountId = normalizeCodexAccountId(auth?.chatgpt_account_id ?? claims.chatgpt_account_id);
    const expiresAt = typeof claims.exp === 'number' && Number.isSafeInteger(claims.exp) && claims.exp > 0 && claims.exp < 8.64e12
      ? claims.exp * 1000 : undefined;
    return {
      ...(accountEmail ? { accountEmail } : {}),
      ...(planType ? { planType } : {}),
      ...(chatgptAccountId ? { chatgptAccountId } : {}),
      ...(expiresAt ? { expiresAt } : {}),
    };
  } catch {
    return {};
  }
}

export function readCodexOauthCredential(value: unknown): CodexOauthCredential | undefined {
  const source = asRecord(value);
  if (!source) return undefined;
  const accessToken = normalizeHeaderSecret(source.accessToken ?? source.access_token);
  const idMetadata = decodeCodexJwtMetadata(source.id_token);
  const accessMetadata = decodeCodexJwtMetadata(accessToken);
  const chatgptAccountId = accessMetadata.chatgptAccountId ?? idMetadata.chatgptAccountId
    ?? normalizeCodexAccountId(source.chatgptAccountId ?? source.account_id);
  if (!accessToken || isOpenAiApiKey(accessToken) || !isByokKeyFormat('codex_oauth', accessToken, chatgptAccountId)) return undefined;
  const refreshToken = normalizeHeaderSecret(source.refreshToken ?? source.refresh_token);
  const expiry = source.expiresAt;
  const expiresAt = accessMetadata.expiresAt ?? (typeof expiry === 'number' && Number.isFinite(expiry) && expiry > 0 ? expiry : undefined);
  return {
    accessToken, ...(refreshToken ? { refreshToken } : {}),
    ...(chatgptAccountId ? { chatgptAccountId } : {}),
    accountEmail: idMetadata.accountEmail ?? accessMetadata.accountEmail ?? displayString(source.accountEmail, 254),
    planType: idMetadata.planType ?? accessMetadata.planType ?? displayString(source.planType, 40),
    expiresAt,
  };
}

export type CodexCallbackInput =
  | { kind: 'code'; code: string; state?: string }
  | { kind: 'oauth'; credential: CodexOauthCredential }
  | { kind: 'api_key'; key: string };

function sameCallbackOrigin(pasted: URL, registered: URL): boolean {
  if (pasted.origin === registered.origin) return true;
  const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);
  return (
    pasted.protocol === registered.protocol &&
    pasted.port === registered.port &&
    loopback.has(pasted.hostname.toLowerCase()) &&
    loopback.has(registered.hostname.toLowerCase())
  );
}

function normalizeCallbackPath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

export function parseCodexCallbackInput(input: string, redirectUri = CODEX_CALLBACK_URI): CodexCallbackInput | null {
  const text = input.trim();
  if (!text || text.length > 64_000) return null;
  if (text.startsWith('{')) {
    try {
      const file = asRecord(JSON.parse(text));
      const credential = readCodexOauthCredential(file?.tokens ?? file);
      const key = normalizeHeaderSecret(file?.OPENAI_API_KEY);
      if (credential) return { kind: 'oauth', credential };
      return key && isOpenAiApiKey(key) ? { kind: 'api_key', key } : null;
    } catch {
      return null;
    }
  }
  const token = normalizeHeaderSecret(text);
  if (token && isOpenAiApiKey(token)) return { kind: 'api_key', key: token };
  if (token && isCodexAccessToken(token)) {
    const credential = readCodexOauthCredential({ accessToken: token });
    return credential ? { kind: 'oauth', credential } : null;
  }
  if (/^[a-zA-Z0-9._~-]{1,2048}$/.test(text)) return { kind: 'code', code: text };
  if (/^\??(?:[^#]*&)?code=/.test(text) && !/^https?:\/\//i.test(text) && !/^(?:localhost|127\.0\.0\.1)[:/]/i.test(text)) {
    const params = new URLSearchParams(text.replace(/^\?/, ''));
    if (params.has('error')) return null;
    const codes = params.getAll('code');
    const states = params.getAll('state');
    const code = normalizeHeaderSecret(codes[0], 2048);
    const state = states.length === 1 ? normalizeHeaderSecret(states[0], 256) : undefined;
    if (codes.length === 1 && states.length <= 1 && code) {
      return state ? { kind: 'code', code, state } : { kind: 'code', code };
    }
    return null;
  }
  try {
    const candidate = /^(?:localhost|127\.0\.0\.1)(?::\d+)?\//i.test(text) ? `http://${text}` : text;
    const pasted = new URL(candidate);
    const registered = new URL(redirectUri);
    if (!sameCallbackOrigin(pasted, registered) ||
        normalizeCallbackPath(pasted.pathname) !== normalizeCallbackPath(registered.pathname) ||
        pasted.username || pasted.password || pasted.searchParams.has('error')) return null;
    const codes = pasted.searchParams.getAll('code');
    const states = pasted.searchParams.getAll('state');
    const code = normalizeHeaderSecret(codes[0], 2048);
    const state = normalizeHeaderSecret(states[0], 256);
    return codes.length === 1 && states.length === 1 && code && state ? { kind: 'code', code, state } : null;
  } catch {
    return null;
  }
}
