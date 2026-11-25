import type { EntitlementRecord, GhrWorkspaceState } from '../types/ghr';

export const MAX_FIRESTORE_WORKSPACE_PAYLOAD_BYTES = 900_000;
export const TARGET_FIRESTORE_COMPACTION_BYTES = 860_000;

const utf8Encoder = new TextEncoder();

export interface MinimalAuthUser {
  uid: string;
  email?: string | null;
  emailVerified?: boolean;
}

/**
 * Returns the UTF-8 byte length of a string, matching Firestore Security Rules `string.size()`.
 */
export function measureUtf8ByteLength(value: string): number {
  return utf8Encoder.encode(value).length;
}

/**
 * Evaluates whether the caller holds verified admin authority via custom claim,
 * `/admins/{uid}` membership, or an active server-backed `ADMIN` entitlement.
 */
export function hasAdminAccess(
  user: MinimalAuthUser | null | undefined,
  entitlement?: EntitlementRecord | null,
  hasClaimOrDocAdmin?: boolean
): boolean {
  if (!user) return false;
  if (user.emailVerified && hasClaimOrDocAdmin === true) return true;
  return entitlement?.plan === 'ADMIN' && entitlement?.status === 'ACTIVE';
}

/**
 * Evaluates whether the user has an active paid/trial/admin tier.
 */
export function hasProOrHigherAccess(
  user: MinimalAuthUser | null | undefined,
  entitlement?: EntitlementRecord | null,
  hasClaimOrDocAdmin?: boolean
): boolean {
  if (hasAdminAccess(user, entitlement, hasClaimOrDocAdmin)) return true;
  if (!entitlement || entitlement.status !== 'ACTIVE') return false;
  return (
    entitlement.plan === 'TRIAL' ||
    entitlement.plan === 'PRO' ||
    entitlement.plan === 'LIFETIME'
  );
}

/**
 * Validates that an existing entitlement is not suspended before license redemption
 * and preserves the real persisted status.
 */
export function assertRedemptionAllowed(
  existingEntitlement: Pick<EntitlementRecord, 'status'> | null | undefined
): void {
  if (existingEntitlement?.status === 'SUSPENDED') {
    throw new Error(
      'บัญชีสิทธิ์ใช้งานของคุณถูกระงับชั่วคราว (SUSPENDED) กรุณาติดต่อผู้ดูแลระบบ'
    );
  }
}

/**
 * Progressively compacts workspace state and verifies the serialized payload fits
 * strictly inside Firestore's 900,000-byte `payloadJson` security rule limit.
 */
export async function buildBoundedWorkspacePayload(
  state: GhrWorkspaceState,
  compress: (rawJson: string) => Promise<string>,
  hardLimitBytes: number = MAX_FIRESTORE_WORKSPACE_PAYLOAD_BYTES
): Promise<string> {
  const softTargetBytes = Math.min(TARGET_FIRESTORE_COMPACTION_BYTES, hardLimitBytes);

  const tryEncode = async (candidateState: GhrWorkspaceState): Promise<{ payload: string; bytes: number }> => {
    const payload = await compress(JSON.stringify(candidateState));
    return { payload, bytes: measureUtf8ByteLength(payload) };
  };

  let current = await tryEncode(state);
  if (current.bytes <= softTargetBytes) {
    return current.payload;
  }

  // 1. Strip raw MT5 spreadsheet caches first
  const slimState: GhrWorkspaceState = {
    ...state,
    mt5RawReports: {},
  };
  current = await tryEncode(slimState);
  if (current.bytes <= softTargetBytes) {
    return current.payload;
  }

  // 2. Trim chat history to the most recent 20 messages
  const compactChatState: GhrWorkspaceState = {
    ...slimState,
    chatMessages: (slimState.chatMessages || []).slice(-20),
  };
  current = await tryEncode(compactChatState);
  if (current.bytes <= hardLimitBytes - 20_000) {
    return current.payload;
  }

  // 3. Progressively trim oldest journal rows (keeping newest head) until <= hardLimitBytes
  let journalCap = compactChatState.journal.length;
  while (journalCap > 0 && current.bytes > hardLimitBytes - 20_000) {
    journalCap = journalCap > 200 ? Math.floor(journalCap * 0.7) : Math.max(0, journalCap - 25);
    current = await tryEncode({
      ...compactChatState,
      journal: compactChatState.journal.slice(0, journalCap),
    });
  }

  if (current.bytes <= hardLimitBytes) {
    return current.payload;
  }

  // 4. Last-resort strip of cycle history caches and chatMessages if accounts metadata is still large
  const minimalState: GhrWorkspaceState = {
    ...compactChatState,
    journal: [],
    chatMessages: [],
    cycleDays: [],
    cycleDaysByPort: {},
  };
  current = await tryEncode(minimalState);
  if (current.bytes <= hardLimitBytes) {
    return current.payload;
  }

  throw new Error(
    `ข้อมูล Workspace มีขนาด ${current.bytes.toLocaleString()} ไบต์ เกินขีดจำกัด ${hardLimitBytes.toLocaleString()} ไบต์ของ Cloud Firestore`
  );
}
