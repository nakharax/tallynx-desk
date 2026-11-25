import { initializeApp } from 'firebase/app';
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  initializeFirestore,
  orderBy,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { EntitlementRecord, GhrWorkspaceState, LicenseRecord, PlanTier } from '../types/ghr';
import { compressWorkspaceJsonForCloud } from '../utils/cloudPayloadCodec';
import {
  assertRedemptionAllowed,
  buildBoundedWorkspacePayload,
  hasAdminAccess,
  hasProOrHigherAccess,
} from '../utils/firebaseHelpers';

const rawBootstrapAdminEmails = String(
  (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_BOOTSTRAP_ADMIN_EMAILS || ''
);

export const BOOTSTRAP_ADMIN_EMAILS: readonly string[] = rawBootstrapAdminEmails
  .split(',')
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);

const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(
  app,
  {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  },
  firebaseConfig.firestoreDatabaseId
);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) {
    return typeof navigator === 'undefined' ? true : navigator.onLine;
  }
  try {
    await getDocFromServer(doc(db, 'entitlements', currentUser.uid));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return false;
    }
    return true;
  }
}

export function formatFirebaseAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'ยกเลิกการเข้าสู่ระบบด้วย Google';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'โดเมนนี้ยังไม่ได้รับอนุญาตใน Firebase Authentication (Authorized domains)';
  }
  if (code === 'auth/network-request-failed') {
    return 'เครือข่ายขัดข้อง ไม่สามารถเชื่อมต่อ Google Sign-In ได้';
  }
  return 'ไม่สามารถเปิดหน้าต่างเข้าสู่ระบบ Google ได้';
}

export async function consumeGoogleRedirectResult(): Promise<User | null> {
  try {
    const res = await getRedirectResult(auth);
    return res?.user ?? null;
  } catch (err) {
    console.warn('Google redirect sign-in check failed:', err);
    return null;
  }
}

export async function signInWithGooglePopup(): Promise<'signed_in' | 'redirecting'> {
  try {
    await signInWithPopup(auth, googleProvider);
    return 'signed_in';
  } catch (err) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code || '')
        : '';
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment'
    ) {
      await signInWithRedirect(auth, googleProvider);
      return 'redirecting';
    }
    throw err;
  }
}

export async function signOutFirebase() {
  return await signOut(auth);
}

export async function resolveUserAdminStatus(user: User | null | undefined): Promise<boolean> {
  if (!user || !user.emailVerified) return false;
  try {
    const tokenResult = await user.getIdTokenResult();
    if (tokenResult?.claims?.admin === true) {
      return true;
    }
  } catch {
    // Fall through to /admins/{uid} lookup if token claims are temporarily unavailable
  }
  try {
    const adminSnap = await getDoc(doc(db, 'admins', user.uid));
    return adminSnap.exists();
  } catch {
    return false;
  }
}

export function isAdminUser(
  user: User | null | undefined,
  entitlement?: EntitlementRecord | null,
  hasClaimAdmin?: boolean
): boolean {
  return hasAdminAccess(user, entitlement, hasClaimAdmin);
}

export function isProOrHigher(
  user: User | null | undefined,
  entitlement?: EntitlementRecord | null,
  hasClaimAdmin?: boolean
): boolean {
  return hasProOrHigherAccess(user, entitlement, hasClaimAdmin);
}

export async function fetchOrInitEntitlement(user: User): Promise<EntitlementRecord> {
  const path = `entitlements/${user.uid}`;
  const ref = doc(db, 'entitlements', user.uid);
  const email = (user.email || `${user.uid}@user.local`).slice(0, 200);
  const hasServerAdmin = await resolveUserAdminStatus(user);

  try {
    const snap = await getDoc(ref);
    if (hasServerAdmin) {
      if (!snap.exists()) {
        await setDoc(ref, {
          ownerId: user.uid,
          email,
          plan: 'ADMIN' as PlanTier,
          licenseKey: '',
          status: 'ACTIVE' as const,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const existing = snap.data();
        if (existing.plan !== 'ADMIN' || existing.status !== 'ACTIVE') {
          await updateDoc(ref, {
            email,
            plan: 'ADMIN' as PlanTier,
            status: 'ACTIVE' as const,
            updatedAt: serverTimestamp(),
          });
        }
      }
      return {
        ownerId: user.uid,
        email,
        plan: 'ADMIN',
        licenseKey: snap.exists() ? String(snap.data().licenseKey || '') : '',
        status: 'ACTIVE',
      };
    }

    if (snap.exists()) {
      const data = snap.data();
      return {
        ownerId: String(data.ownerId || user.uid),
        email: String(data.email || email),
        plan: (data.plan as PlanTier) || 'FREE',
        licenseKey: String(data.licenseKey || ''),
        status: (data.status as 'ACTIVE' | 'SUSPENDED') || 'ACTIVE',
      };
    }

    await setDoc(ref, {
      ownerId: user.uid,
      email,
      plan: 'FREE',
      licenseKey: '',
      status: 'ACTIVE',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return {
      ownerId: user.uid,
      email,
      plan: 'FREE',
      licenseKey: '',
      status: 'ACTIVE',
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function redeemLicenseKey(user: User, rawKey: string): Promise<EntitlementRecord> {
  const cleanKey = rawKey.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (cleanKey.length < 6 || cleanKey.length > 64) {
    throw new Error('รูปแบบ License Key ไม่ถูกต้อง (ต้องมีความยาว 6–64 ตัวอักษร)');
  }

  const licPath = `licenses/${cleanKey}`;
  const licRef = doc(db, 'licenses', cleanKey);
  const entRef = doc(db, 'entitlements', user.uid);
  const email = (user.email || `${user.uid}@user.local`).slice(0, 200);

  const existingEnt = await getDoc(entRef);
  const existingStatus = existingEnt.exists()
    ? ((existingEnt.data()?.status as 'ACTIVE' | 'SUSPENDED') || 'ACTIVE')
    : 'ACTIVE';
  assertRedemptionAllowed(existingEnt.exists() ? { status: existingStatus } : null);

  let licSnap;
  try {
    licSnap = await getDoc(licRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, licPath);
  }

  if (!licSnap.exists()) {
    throw new Error('ไม่พบ License Key นี้ในระบบ กรุณาตรวจสอบตัวอักษรอีกครั้ง');
  }

  const licData = licSnap.data() as LicenseRecord;
  if (licData.status !== 'ACTIVE') {
    throw new Error('License Key นี้ถูกระงับการใช้งานแล้ว');
  }
  if (licData.redeemedByUid && licData.redeemedByUid !== user.uid) {
    throw new Error('License Key นี้ถูกผูกใช้งานกับบัญชีอื่นแล้ว');
  }

  const batch = writeBatch(db);
  if (!licData.redeemedByUid) {
    batch.update(licRef, {
      redeemedByUid: user.uid,
      redeemedEmail: email,
      updatedAt: serverTimestamp(),
    });
  }

  if (!existingEnt.exists()) {
    batch.set(entRef, {
      ownerId: user.uid,
      email,
      plan: licData.plan,
      licenseKey: cleanKey,
      status: 'ACTIVE',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.update(entRef, {
      email,
      plan: licData.plan,
      licenseKey: cleanKey,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, licPath);
  }

  return {
    ownerId: user.uid,
    email,
    plan: licData.plan,
    licenseKey: cleanKey,
    status: existingStatus,
  };
}

export async function adminListLicenses(): Promise<LicenseRecord[]> {
  const path = 'licenses';
  try {
    const q = query(collection(db, 'licenses'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as LicenseRecord);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function adminCreateLicense(
  adminUser: User,
  params: { licenseKey: string; plan: 'TRIAL' | 'PRO' | 'LIFETIME'; notes?: string }
): Promise<void> {
  const cleanKey = params.licenseKey.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (cleanKey.length < 6 || cleanKey.length > 64) {
    throw new Error('รหัส License ต้องมี 6–64 ตัวอักษร (A-Z, 0-9, -, _)');
  }
  const path = `licenses/${cleanKey}`;
  try {
    await setDoc(doc(db, 'licenses', cleanKey), {
      licenseKey: cleanKey,
      plan: params.plan,
      status: 'ACTIVE',
      notes: (params.notes || '').slice(0, 200),
      redeemedByUid: '',
      redeemedEmail: '',
      createdByUid: adminUser.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function adminToggleLicenseStatus(key: string, nextStatus: 'ACTIVE' | 'REVOKED'): Promise<void> {
  const path = `licenses/${key}`;
  try {
    await updateDoc(doc(db, 'licenses', key), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function adminDeleteLicense(key: string): Promise<void> {
  const path = `licenses/${key}`;
  try {
    await deleteDoc(doc(db, 'licenses', key));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function pushWorkspaceToFirestore(uid: string, state: GhrWorkspaceState): Promise<void> {
  const path = `workspaces/${uid}`;
  const docRef = doc(db, 'workspaces', uid);

  const payloadJson = await buildBoundedWorkspacePayload(state, compressWorkspaceJsonForCloud);
  const clientUpdatedAt = (state.lastSavedAt || new Date().toISOString()).slice(0, 64);
  const tradeCount = Math.min(100000, Math.max(0, state.journal.length));
  const portCount = Math.min(1000, Math.max(0, Object.keys(state.accounts || {}).length));

  const updateFields = {
    payloadJson,
    tradeCount,
    portCount,
    clientUpdatedAt,
    updatedAt: serverTimestamp(),
  };

  try {
    let existingSnap = await getDoc(docRef);
    if (!existingSnap.exists()) {
      const serverSnap = await getDocFromServer(docRef).catch(() => null);
      if (serverSnap) {
        existingSnap = serverSnap;
      }
    }

    if (existingSnap.exists()) {
      await updateDoc(docRef, updateFields);
      return;
    }

    try {
      await setDoc(docRef, {
        ownerId: uid.slice(0, 128),
        ...updateFields,
        createdAt: serverTimestamp(),
      });
    } catch (createErr) {
      // Handle concurrent first-create race where another tab/device created the doc first
      const serverSnap = await getDocFromServer(docRef).catch(() => null);
      if (serverSnap?.exists()) {
        await updateDoc(docRef, updateFields);
        return;
      }
      throw createErr;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
