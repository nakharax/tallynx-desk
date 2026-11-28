import { asRecord, type PlatformAiRole } from '../../src/utils/aiProviderConfig.js';

export interface VerifiedAiCaller {
  uid: string;
  email: string;
  emailVerified?: boolean;
  displayName?: string;
  customAttributes?: string;
}

export function readFirebaseLookupCaller(payload: unknown, requireVerifiedEmail: boolean): VerifiedAiCaller | null {
  const users = asRecord(payload)?.users;
  const user = asRecord(Array.isArray(users) ? users[0] : undefined);
  if (!user || typeof user.localId !== 'string' || !user.localId.trim() || user.disabled === true ||
      (requireVerifiedEmail && user.emailVerified !== true)) return null;
  const displayName = typeof user.displayName === 'string' && user.displayName.trim()
    ? user.displayName.trim().slice(0, 80)
    : undefined;
  return {
    uid: user.localId,
    email: typeof user.email === 'string' ? user.email : '',
    emailVerified: user.emailVerified === true,
    ...(displayName ? { displayName } : {}),
    customAttributes: typeof user.customAttributes === 'string' ? user.customAttributes : undefined,
  };
}

export interface PlatformAiPrivilege {
  eligible: boolean;
  role: PlatformAiRole;
  uid: string | null;
}

export interface PrivilegeDependencies {
  verifyFirebaseBearerToken: (authorization: string | undefined) => Promise<VerifiedAiCaller | null>;
  projectId?: string;
  databaseId?: string;
  env?: Partial<Record<'FOUNDER_EMAILS' | 'FOUNDER_UIDS' | 'ADMIN_EMAILS' | 'BOOTSTRAP_ADMIN_EMAILS' | 'VITE_BOOTSTRAP_ADMIN_EMAILS', string>>;
  fetcher?: typeof fetch;
  now?: () => number;
}

type PrivilegeCache = Map<string, { expiresAt: number; role: PlatformAiRole }>;
const caches = new WeakMap<PrivilegeDependencies, PrivilegeCache>();

function listed(value: string, list: string | undefined, ignoreCase = false): boolean {
  if (!value || !list) return false;
  return list.split(/[\s,;]+/).some(entry => ignoreCase ? entry.toLowerCase() === value.toLowerCase() : entry === value);
}

function claimsFrom(value: string | undefined) {
  try {
    return value ? asRecord(JSON.parse(value)) : undefined;
  } catch {
    return undefined;
  }
}

function field(document: Record<string, unknown> | undefined, name: string): unknown {
  return asRecord(asRecord(document?.fields)?.[name])?.stringValue;
}

async function lookupFirestoreRole(uid: string, authorization: string, deps: PrivilegeDependencies): Promise<PlatformAiRole> {
  const fetcher = deps.fetcher ?? fetch;
  const now = deps.now ?? Date.now;
  const ttl = 60_000;
  const project = deps.projectId;
  if (!project) return null;
  const database = deps.databaseId || '(default)';
  let cache = caches.get(deps);
  if (!cache) {
    cache = new Map();
    caches.set(deps, cache);
  }
  const cached = cache.get(uid);
  if (cached && cached.expiresAt > now()) return cached.role;
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases/${encodeURIComponent(database)}/documents`;
  async function read(collection: 'admins' | 'entitlements') {
    try {
      const response = await fetcher(`${base}/${collection}/${encodeURIComponent(uid)}`, {
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(4_000),
        redirect: 'error',
      });
      if (response.status === 404) return { complete: true };
      if (!response.ok) return { complete: false };
      return { complete: true, document: asRecord(await response.json()) };
    } catch {
      return { complete: false };
    }
  }

  const [admin, entitlement] = await Promise.all([read('admins'), read('entitlements')]);
  const activePlan = field(entitlement.document, 'ownerId') === uid && field(entitlement.document, 'status') === 'ACTIVE'
    ? field(entitlement.document, 'plan') : undefined;
  const role = field(admin.document, 'uid') === uid || activePlan === 'ADMIN'
    ? 'ADMIN' : activePlan === 'LIFETIME' ? 'LIFETIME' : null;
  if (admin.complete && entitlement.complete) {
    if (cache.size >= 1_000) {
      for (const [key, entry] of cache) {
        if (entry.expiresAt <= now()) cache.delete(key);
      }
      const oldest = cache.keys().next().value;
      if (cache.size >= 1_000 && oldest !== undefined) cache.delete(oldest);
    }
    cache.set(uid, { expiresAt: now() + ttl, role });
  }
  return role;
}

export async function resolvePlatformAiPrivilege(authorization: string | undefined, deps: PrivilegeDependencies): Promise<PlatformAiPrivilege> {
  if (!authorization || !/^Bearer [^\s]+$/.test(authorization)) return { eligible: false, role: null, uid: null };
  const caller = await deps.verifyFirebaseBearerToken(authorization).catch(() => null);
  if (!caller) return { eligible: false, role: null, uid: null };
  const env = deps.env ?? {};
  const claims = claimsFrom(caller.customAttributes);
  const email = caller.emailVerified === true ? caller.email.trim() : '';
  let role: PlatformAiRole;
  if (claims?.founder === true || listed(caller.uid, env.FOUNDER_UIDS) || listed(email, env.FOUNDER_EMAILS, true)) {
    role = 'FOUNDER';
  } else if (claims?.admin === true ||
    [env.ADMIN_EMAILS, env.BOOTSTRAP_ADMIN_EMAILS, env.VITE_BOOTSTRAP_ADMIN_EMAILS].some(list => listed(email, list, true))) {
    role = 'ADMIN';
  } else {
    role = await lookupFirestoreRole(caller.uid, authorization, deps);
  }
  return { eligible: role !== null, role, uid: caller.uid };
}
