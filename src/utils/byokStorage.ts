import { useMemo, useSyncExternalStore } from 'react';
import {
  AI_HEADERS, asRecord, buildDatabentoRequestHeaders, buildDeskAiRequestHeaders, isByokKeyFormat, isOpenAiApiKey,
  normalizeAiModel, normalizeAiProvider, normalizeHeaderSecret, readCodexOauthCredential,
  type AiProvider, type AiRequestCredential, type CodexOauthCredential,
} from './aiProviderConfig.js';

export interface ByokCredentials {
  provider?: AiProvider;
  models: Partial<Record<AiProvider, string>>;
  googleKey?: string;
  openrouterKey?: string;
  openAiKey?: string;
  codex?: CodexOauthCredential;
  databentoKey?: string;
}

type Scope = string | null | undefined;
type LocalStore = Pick<Storage, 'getItem' | 'setItem'>;
type DeskIdentity = { uid: string; getIdToken: () => Promise<string> };
const STORAGE_CHANGED = 'tallynx-byok-credentials-changed';
const refreshes = new Map<string, Promise<ByokCredentials>>();

export function byokStorageKey(uid: Scope): string {
  // Reserve the guest slot even if a Firebase project uses a custom UID named "guest".
  const scope = uid ? uid === 'guest' ? '%67uest' : encodeURIComponent(uid) : 'guest';
  return `TALLYNX_BYOK_CREDENTIALS_V1_${scope}`;
}

function readStoredValue(uid: Scope, storage?: LocalStore): string | null {
  try {
    return (storage ?? globalThis.localStorage)?.getItem(byokStorageKey(uid)) ?? null;
  } catch {
    return null;
  }
}

function parseStoredValue(raw: string | null): ByokCredentials {
  try {
    const value = asRecord(raw ? JSON.parse(raw) : null);
    if (!value) return { models: {} };
    const models: ByokCredentials['models'] = {};
    const savedModels = asRecord(value.models);
    for (const provider of ['platform', 'google', 'openrouter', 'codex_oauth'] as const) {
      const model = normalizeAiModel(provider, savedModels?.[provider]);
      if (model) models[provider] = model;
    }
    const google = normalizeHeaderSecret(value.googleKey);
    const openrouter = normalizeHeaderSecret(value.openrouterKey);
    const openai = normalizeHeaderSecret(value.openAiKey);
    const openAiKey = openai && isOpenAiApiKey(openai) ? openai : undefined;
    return {
      provider: normalizeAiProvider(value.provider),
      models,
      googleKey: google && isByokKeyFormat('google', google) ? google : undefined,
      openrouterKey: openrouter && isByokKeyFormat('openrouter', openrouter) ? openrouter : undefined,
      openAiKey,
      codex: openAiKey ? undefined : readCodexOauthCredential(value.codex),
      databentoKey: buildDatabentoRequestHeaders(value.databentoKey)[AI_HEADERS.databento],
    };
  } catch {
    return { models: {} };
  }
}

export function loadByokCredentials(uid: Scope, storage?: LocalStore): ByokCredentials {
  return parseStoredValue(readStoredValue(uid, storage));
}

export function getDatabentoRequestHeaders(uid: Scope): Record<string, string> {
  return buildDatabentoRequestHeaders(loadByokCredentials(uid).databentoKey);
}

export function saveByokCredentials(uid: Scope, credentials: ByokCredentials, storage?: LocalStore): boolean {
  const key = byokStorageKey(uid);
  try {
    const target = storage ?? globalThis.localStorage;
    if (!target) return false;
    target.setItem(key, JSON.stringify(parseStoredValue(JSON.stringify(credentials))));
    if (!storage && typeof window !== 'undefined') window.dispatchEvent(new Event(STORAGE_CHANGED));
    return true;
  } catch {
    return false;
  }
}

function subscribe(listener: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key === null || event.key.startsWith('TALLYNX_BYOK_CREDENTIALS_V1_')) listener();
  }
  window.addEventListener(STORAGE_CHANGED, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(STORAGE_CHANGED, listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useByokCredentials(uid: Scope): ByokCredentials {
  const raw = useSyncExternalStore(subscribe, () => readStoredValue(uid), () => null);
  return useMemo(() => parseStoredValue(raw), [raw]);
}

export function selectDeskAiCredential(credentials: ByokCredentials, capability: 'text' | 'voice' = 'text'): AiRequestCredential | undefined {
  const provider = capability === 'voice' && credentials.provider !== 'platform' && credentials.googleKey
    ? 'google' : credentials.provider;
  switch (provider) {
    case 'platform': return { provider, model: credentials.models.platform };
    case 'google': return { provider, model: credentials.models.google, key: credentials.googleKey };
    case 'openrouter':
      return { provider, model: credentials.models.openrouter, ...(capability === 'text' ? { key: credentials.openrouterKey } : {}) };
    case 'codex_oauth':
      return {
        provider, model: credentials.models.codex_oauth,
        ...(capability === 'text' ? {
          key: credentials.openAiKey ?? credentials.codex?.accessToken,
          chatgptAccountId: credentials.codex?.chatgptAccountId,
        } : {}),
      };
    default: return undefined;
  }
}

export function canRequestDeskAi(credentials: ByokCredentials, uid: Scope, capability: 'text' | 'voice' = 'text'): boolean {
  const connection = selectDeskAiCredential(credentials, capability);
  return connection && connection.provider !== 'platform' ? Boolean(connection.key) : Boolean(uid);
}

export async function refreshCodexOauthIfNeeded(uid: Scope): Promise<ByokCredentials> {
  const scope = byokStorageKey(uid);
  const pending = refreshes.get(scope);
  if (pending) return pending;
  async function refresh() {
    const current = loadByokCredentials(uid);
    const codex = current.codex;
    if (current.provider !== 'codex_oauth' || !codex?.refreshToken || !codex.expiresAt ||
        codex.expiresAt > Date.now() + 60_000) return current;
    try {
      const response = await fetch('/api/ai/codex-oauth/refresh', {
        method: 'POST',
        headers: { [AI_HEADERS.key]: codex.refreshToken },
        signal: AbortSignal.timeout(15_000),
        redirect: 'error',
        cache: 'no-store',
      });
      if (!response.ok) return loadByokCredentials(uid);
      const updated = readCodexOauthCredential(asRecord(await response.json())?.credential);
      const latest = loadByokCredentials(uid);
      if (!updated || latest.codex?.accessToken !== codex.accessToken || latest.codex.refreshToken !== codex.refreshToken) return latest;
      if (codex.chatgptAccountId && updated.chatgptAccountId && updated.chatgptAccountId !== codex.chatgptAccountId) return latest;
      const next = {
        ...latest,
        codex: {
          ...updated,
          chatgptAccountId: updated.chatgptAccountId ?? codex.chatgptAccountId,
          accountEmail: updated.accountEmail ?? codex.accountEmail,
          planType: updated.planType ?? codex.planType,
          refreshToken: updated.refreshToken ?? codex.refreshToken,
        },
      };
      return saveByokCredentials(uid, next) ? next : latest;
    } catch {
      return loadByokCredentials(uid);
    }
  }

  // Refresh tokens can rotate, so tabs on the same browser use one refresh at a time.
  const refreshPromise = (globalThis.navigator?.locks
    ? navigator.locks.request(`${scope}:codex-refresh`, refresh) : refresh())
    .finally(() => refreshes.delete(scope));
  refreshes.set(scope, refreshPromise);
  return refreshPromise;
}

export async function getDeskAiRequestHeaders(user: DeskIdentity | null, capability: 'text' | 'voice' = 'text'): Promise<Record<string, string>> {
  const uid = user?.uid;
  const [credentials, token] = await Promise.all([
    capability === 'text' ? refreshCodexOauthIfNeeded(uid) : loadByokCredentials(uid),
    user?.getIdToken().catch(() => null),
  ]);
  return { 'Content-Type': 'application/json', ...buildDeskAiRequestHeaders(selectDeskAiCredential(credentials, capability), token) };
}
