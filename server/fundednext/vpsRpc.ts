import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const VPS_RPC_HEADER_TS = 'x-tredyn-ts';
export const VPS_RPC_HEADER_NONCE = 'x-tredyn-nonce';
export const VPS_RPC_HEADER_UID = 'x-tredyn-uid';
export const VPS_RPC_HEADER_SIG = 'x-tredyn-sig';

export const VPS_RPC_MAX_SKEW_MS = 30_000;
const NONCE_TTL_MS = 65_000;
const MAX_NONCES = 10_000;

export function assertValidRpcSecret(secret: string | undefined): string {
  const trimmed = String(secret ?? '').trim();
  if (trimmed.length < 32) {
    throw new Error('FUNDEDNEXT_VPS_RPC_SECRET must be at least 32 characters');
  }
  return trimmed;
}

function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export function buildRpcSigningInput(input: {
  method: string;
  path: string;
  ts: string;
  nonce: string;
  uid: string;
  body: string | Buffer;
}): string {
  return [
    input.method.toUpperCase(),
    input.path,
    input.ts,
    input.nonce,
    input.uid,
    sha256Hex(input.body),
  ].join('\n');
}

export function signVpsRpcRequest(input: {
  secret: string;
  method: string;
  path: string;
  uid: string;
  body: string | Buffer;
  now?: number;
  nonce?: string;
}): Record<string, string> {
  const secret = assertValidRpcSecret(input.secret);
  const uid = input.uid.trim();
  if (!uid || uid.length > 256 || /[\r\n]/.test(uid)) {
    throw new Error('Invalid RPC caller UID');
  }
  const ts = String(input.now ?? Date.now());
  const nonce = input.nonce ?? randomBytes(16).toString('hex');
  const payload = buildRpcSigningInput({
    method: input.method,
    path: input.path,
    ts,
    nonce,
    uid,
    body: input.body,
  });
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return {
    [VPS_RPC_HEADER_TS]: ts,
    [VPS_RPC_HEADER_NONCE]: nonce,
    [VPS_RPC_HEADER_UID]: uid,
    [VPS_RPC_HEADER_SIG]: sig,
  };
}

export class ReplayNonceCache {
  private readonly seen = new Map<string, number>();

  consume(nonce: string, now = Date.now()): boolean {
    if (this.seen.size > 0) {
      const cutoff = now - NONCE_TTL_MS;
      for (const [key, seenAt] of this.seen) {
        if (seenAt < cutoff) this.seen.delete(key);
        else break;
      }
    }
    if (this.seen.has(nonce)) return false;
    if (this.seen.size >= MAX_NONCES) {
      const oldest = this.seen.keys().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
    this.seen.set(nonce, now);
    return true;
  }
}

function readHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | null {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value) && value.length === 1 && typeof value[0] === 'string') {
    return value[0].trim();
  }
  return null;
}

export function verifyVpsRpcRequest(input: {
  secret: string | undefined;
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: string | Buffer;
  nonces: ReplayNonceCache;
  now?: () => number;
}): { ok: true; uid: string } | { ok: false; status: 401 | 503; error: string } {
  const secretRaw = String(input.secret ?? '').trim();
  if (secretRaw.length < 32) {
    return { ok: false, status: 503, error: 'FundedNext VPS RPC secret is not configured' };
  }
  const ts = readHeader(input.headers, VPS_RPC_HEADER_TS);
  const nonce = readHeader(input.headers, VPS_RPC_HEADER_NONCE);
  const uid = readHeader(input.headers, VPS_RPC_HEADER_UID);
  const sig = readHeader(input.headers, VPS_RPC_HEADER_SIG);

  if (!ts || !/^\d{10,16}$/.test(ts)) {
    return { ok: false, status: 401, error: 'Missing or invalid RPC timestamp' };
  }
  if (!nonce || !/^[a-f0-9]{32}$/.test(nonce)) {
    return { ok: false, status: 401, error: 'Missing or invalid RPC nonce' };
  }
  if (!uid || uid.length > 256 || /[\r\n]/.test(uid)) {
    return { ok: false, status: 401, error: 'Missing or invalid RPC caller' };
  }
  if (!sig || !/^[a-f0-9]{64}$/.test(sig)) {
    return { ok: false, status: 401, error: 'Missing or invalid RPC signature' };
  }

  const now = (input.now ?? Date.now)();
  if (Math.abs(now - Number(ts)) > VPS_RPC_MAX_SKEW_MS) {
    return { ok: false, status: 401, error: 'Expired RPC request timestamp' };
  }

  const expected = createHmac('sha256', secretRaw)
    .update(
      buildRpcSigningInput({
        method: input.method,
        path: input.path,
        ts,
        nonce,
        uid,
        body: input.body,
      })
    )
    .digest();
  const actual = Buffer.from(sig, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, status: 401, error: 'Invalid RPC signature' };
  }

  if (!input.nonces.consume(nonce, now)) {
    return { ok: false, status: 401, error: 'Replayed RPC nonce' };
  }

  return { ok: true, uid };
}
