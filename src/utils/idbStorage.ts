import { ChatSessionRecord, GhrWorkspaceState, SnapshotItem } from '../types/ghr';
import { sortSessionsByRecent } from './coachSessions';
import { createCleanWorkspaceState, DEFAULT_STATE, normalizeMergedState } from './ghrRules';

export const STORAGE_KEY = 'TALLYNX_OS_V40_CLEAN_STATE';
export const LEGACY_STORAGE_KEY = 'TREDYN_GHR_V32_CLEAN_STATE';
export const IDB_NAME = 'Tredyn_GHR_DB';
export const IDB_VERSION = 3;

export interface OfflineMutationItem {
  queueId: string;
  scope?: string;
  queuedAt: string;
  reason: string;
  payload: GhrWorkspaceState;
}

export function getStorageScopeId(uid?: string | null): string {
  const clean = typeof uid === 'string' ? uid.trim().replace(/[^a-zA-Z0-9_-]/g, '') : '';
  return clean.length > 0 ? clean : 'guest';
}

export function getLegacyLocalStorageKey(uid?: string | null): string {
  const scope = getStorageScopeId(uid);
  return scope === 'guest' ? LEGACY_STORAGE_KEY : `TREDYN_GHR_V32_STATE_${scope}`;
}

export function getLocalStorageKey(uid?: string | null): string {
  const scope = getStorageScopeId(uid);
  return scope === 'guest' ? STORAGE_KEY : `TALLYNX_OS_V40_STATE_${scope}`;
}

export function getIndexedDbWorkspaceKey(uid?: string | null): string {
  const scope = getStorageScopeId(uid);
  return scope === 'guest' ? 'MAIN_STATE' : `MAIN_STATE_${scope}`;
}

function sanitizeMigratedWorkspaceBrand(state: GhrWorkspaceState): GhrWorkspaceState {
  const rawName = String(state.deskBrandName || '').trim();
  const rawSub = String(state.deskBrandSubtitle || '').trim();
  const legacyPrefix = /^tredyn|^nakhara|ghr\s*v3\.2/i;
  return {
    ...state,
    deskBrandName: !rawName || legacyPrefix.test(rawName) ? 'TallyNX OS v4.0' : rawName,
    deskBrandSubtitle:
      !rawSub || /tredyn|nakhara/i.test(rawSub)
        ? 'desk.tallynx.com · Real-Time Trading OS & Trade Journal'
        : rawSub,
  };
}

export function loadLocalState(uid?: string | null): GhrWorkspaceState {
  const scope = getStorageScopeId(uid);
  const key = getLocalStorageKey(uid);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      return sanitizeMigratedWorkspaceBrand(normalizeMergedState(JSON.parse(raw)));
    }
    const legacyKey = getLegacyLocalStorageKey(uid);
    const legacyRaw = localStorage.getItem(legacyKey);
    if (legacyRaw) {
      const migrated = sanitizeMigratedWorkspaceBrand(normalizeMergedState(JSON.parse(legacyRaw)));
      try {
        // Persist migrated copy to TallyNX key non-destructively while keeping legacy key intact
        localStorage.setItem(key, JSON.stringify(migrated));
      } catch {
        // ignore storage quota errors on localStorage
      }
      return migrated;
    }
    return sanitizeMigratedWorkspaceBrand(
      scope === 'guest'
        ? JSON.parse(JSON.stringify(DEFAULT_STATE))
        : createCleanWorkspaceState()
    );
  } catch {
    return sanitizeMigratedWorkspaceBrand(
      scope === 'guest'
        ? JSON.parse(JSON.stringify(DEFAULT_STATE))
        : createCleanWorkspaceState()
    );
  }
}

export function saveLocalState(state: GhrWorkspaceState, uid?: string | null): void {
  try {
    localStorage.setItem(getLocalStorageKey(uid), JSON.stringify(state));
  } catch {
    // ignore storage quota errors on localStorage
  }
}

export function openGhrIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('workspace')) {
        db.createObjectStore('workspace', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('snapshots')) {
        db.createObjectStore('snapshots', { keyPath: 'snapId' });
      }
      if (!db.objectStoreNames.contains('offline_queue')) {
        db.createObjectStore('offline_queue', { keyPath: 'queueId' });
      }
      if (!db.objectStoreNames.contains('chat_sessions')) {
        db.createObjectStore('chat_sessions', { keyPath: 'id' });
      }
    };
    req.onsuccess = (ev) => {
      resolve((ev.target as IDBOpenDBRequest).result);
    };
    req.onerror = (ev) => reject((ev.target as IDBOpenDBRequest).error);
  });
}

export async function saveWorkspaceToIndexedDB(
  state: GhrWorkspaceState,
  snapshotReason?: string | null,
  uid?: string | null
): Promise<SnapshotItem[]> {
  const scope = getStorageScopeId(uid);
  const wsKey = getIndexedDbWorkspaceKey(uid);
  try {
    const db = await openGhrIndexedDB();
    const tx = db.transaction(['workspace', 'snapshots'], 'readwrite');
    const wsStore = tx.objectStore('workspace');
    const snapStore = tx.objectStore('snapshots');

    const serialized: GhrWorkspaceState = JSON.parse(JSON.stringify(state));
    wsStore.put({
      id: wsKey,
      scope,
      updatedAt: state.lastSavedAt || new Date().toISOString(),
      tradeCount: state.journal.length,
      portCount: Object.keys(state.accounts || {}).length,
      payload: serialized,
    });

    if (snapshotReason) {
      const snapId = `SNAP-${scope.slice(0, 8)}-${Date.now()}`;
      snapStore.put({
        snapId,
        scope,
        createdAt: new Date().toISOString(),
        reason: snapshotReason,
        tradeCount: state.journal.length,
        portCount: Object.keys(state.accounts || {}).length,
        payload: serialized,
      });
    }

    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = (e) => rej(e);
    });

    return await getRecentSnapshots(db, uid);
  } catch {
    return [];
  }
}

export async function getRecentSnapshots(
  existingDb?: IDBDatabase,
  uid?: string | null
): Promise<SnapshotItem[]> {
  const targetScope = getStorageScopeId(uid);
  try {
    const db = existingDb || (await openGhrIndexedDB());
    const tx = db.transaction(['snapshots'], 'readonly');
    const store = tx.objectStore('snapshots');
    const allReq = store.getAll();
    const allItems = await new Promise<SnapshotItem[]>((res, rej) => {
      allReq.onsuccess = () => res((allReq.result as SnapshotItem[]) || []);
      allReq.onerror = (e) => rej(e);
    });

    const scopedItems = allItems.filter((item) => (item.scope || 'guest') === targetScope);
    scopedItems.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const top8 = scopedItems.slice(0, 8);

    if (scopedItems.length > 8) {
      const cleanTx = db.transaction(['snapshots'], 'readwrite');
      const cleanStore = cleanTx.objectStore('snapshots');
      scopedItems.slice(8).forEach((old) => cleanStore.delete(old.snapId));
    }
    return top8;
  } catch {
    return [];
  }
}

export async function loadWorkspaceFromIndexedDB(uid?: string | null): Promise<GhrWorkspaceState | null> {
  const wsKey = getIndexedDbWorkspaceKey(uid);
  try {
    const db = await openGhrIndexedDB();
    const tx = db.transaction(['workspace'], 'readonly');
    const store = tx.objectStore('workspace');
    const getReq = store.get(wsKey);
    const record = await new Promise<{ payload?: GhrWorkspaceState; updatedAt?: string } | undefined>((res, rej) => {
      getReq.onsuccess = () => res(getReq.result);
      getReq.onerror = (e) => rej(e);
    });
    if (record && record.payload) {
      return normalizeMergedState(record.payload);
    }
    return null;
  } catch {
    return null;
  }
}

export async function deleteSnapshotFromIndexedDB(
  snapId: string,
  uid?: string | null
): Promise<SnapshotItem[]> {
  try {
    const db = await openGhrIndexedDB();
    const tx = db.transaction(['snapshots'], 'readwrite');
    tx.objectStore('snapshots').delete(snapId);
    await new Promise<void>((res) => {
      tx.oncomplete = () => res();
    });
    return await getRecentSnapshots(db, uid);
  } catch {
    return [];
  }
}

export async function enqueueOfflineMutation(
  state: GhrWorkspaceState,
  reason: string,
  uid?: string | null
): Promise<number> {
  const scope = getStorageScopeId(uid);
  try {
    const db = await openGhrIndexedDB();
    const tx = db.transaction(['offline_queue'], 'readwrite');
    const store = tx.objectStore('offline_queue');
    const item: OfflineMutationItem = {
      queueId: `Q-${scope.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      scope,
      queuedAt: new Date().toISOString(),
      reason,
      payload: JSON.parse(JSON.stringify(state)),
    };
    store.put(item);
    await new Promise<void>((res) => {
      tx.oncomplete = () => res();
    });
    const list = await getOfflineQueueItems(db, uid);
    return list.length;
  } catch {
    return 0;
  }
}

export async function getOfflineQueueItems(
  existingDb?: IDBDatabase,
  uid?: string | null
): Promise<OfflineMutationItem[]> {
  const targetScope = getStorageScopeId(uid);
  try {
    const db = existingDb || (await openGhrIndexedDB());
    const tx = db.transaction(['offline_queue'], 'readonly');
    const store = tx.objectStore('offline_queue');
    const req = store.getAll();
    const allItems = await new Promise<OfflineMutationItem[]>((res, rej) => {
      req.onsuccess = () => res((req.result as OfflineMutationItem[]) || []);
      req.onerror = (e) => rej(e);
    });
    const scopedItems = allItems.filter((item) => (item.scope || 'guest') === targetScope);
    scopedItems.sort((a, b) => String(a.queuedAt).localeCompare(String(b.queuedAt)));
    return scopedItems;
  } catch {
    return [];
  }
}

export async function clearOfflineQueue(uid?: string | null): Promise<void> {
  const targetScope = getStorageScopeId(uid);
  try {
    const db = await openGhrIndexedDB();
    const items = await getOfflineQueueItems(db, uid);
    if (items.length === 0) return;
    const tx = db.transaction(['offline_queue'], 'readwrite');
    const store = tx.objectStore('offline_queue');
    items.forEach((item) => {
      if ((item.scope || 'guest') === targetScope) {
        store.delete(item.queueId);
      }
    });
    await new Promise<void>((res) => {
      tx.oncomplete = () => res();
    });
  } catch {
    // ignore
  }
}

export function getChatSessionsStorageKey(uid?: string | null): string {
  const scope = getStorageScopeId(uid);
  return `TALLYNX_CHAT_SESSIONS_V1_${scope}`;
}

export function loadChatSessionsSync(uid?: string | null): ChatSessionRecord[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(getChatSessionsStorageKey(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? sortSessionsByRecent(parsed as ChatSessionRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveChatSessionsSync(sessions: ChatSessionRecord[], uid?: string | null): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(
      getChatSessionsStorageKey(uid),
      JSON.stringify(sortSessionsByRecent(sessions).slice(0, 40)),
    );
  } catch {
    // ignore localStorage quota errors
  }
}

interface StoredChatSessionDoc extends ChatSessionRecord {
  scope: string;
  sessionId?: string;
}

export async function loadChatSessionsFromIndexedDB(
  uid?: string | null,
): Promise<ChatSessionRecord[]> {
  const targetScope = getStorageScopeId(uid);
  const syncFallback = loadChatSessionsSync(uid);
  try {
    const db = await openGhrIndexedDB();
    if (!db.objectStoreNames.contains('chat_sessions')) {
      return syncFallback;
    }
    const tx = db.transaction(['chat_sessions'], 'readonly');
    const store = tx.objectStore('chat_sessions');
    const req = store.getAll();
    const allDocs = await new Promise<StoredChatSessionDoc[]>((res, rej) => {
      req.onsuccess = () => res((req.result as StoredChatSessionDoc[]) || []);
      req.onerror = (e) => rej(e);
    });
    const prefix = `${targetScope}::`;
    const scoped = allDocs
      .filter((doc) => (doc.scope || 'guest') === targetScope && typeof doc.id === 'string')
      .map(({ scope: _scope, sessionId, id, ...rest }) => ({
        ...rest,
        id: sessionId || (id.startsWith(prefix) ? id.slice(prefix.length) : id),
      }) as ChatSessionRecord);
    if (scoped.length > 0) {
      const sorted = sortSessionsByRecent(scoped);
      saveChatSessionsSync(sorted, uid);
      return sorted;
    }
    return syncFallback;
  } catch {
    return syncFallback;
  }
}

export async function saveChatSessionsToIndexedDB(
  sessions: ChatSessionRecord[],
  uid?: string | null,
): Promise<void> {
  const targetScope = getStorageScopeId(uid);
  const capped = sortSessionsByRecent(sessions).slice(0, 40);
  saveChatSessionsSync(capped, uid);
  try {
    const db = await openGhrIndexedDB();
    if (!db.objectStoreNames.contains('chat_sessions')) return;
    const readTx = db.transaction(['chat_sessions'], 'readonly');
    const readReq = readTx.objectStore('chat_sessions').getAll();
    const existing = await new Promise<StoredChatSessionDoc[]>((res) => {
      readReq.onsuccess = () => res((readReq.result as StoredChatSessionDoc[]) || []);
      readReq.onerror = () => res([]);
    });

    const tx = db.transaction(['chat_sessions'], 'readwrite');
    const store = tx.objectStore('chat_sessions');
    const keepIds = new Set(capped.map((s) => `${targetScope}::${s.id}`));
    for (const doc of existing) {
      if ((doc.scope || 'guest') === targetScope && !keepIds.has(doc.id)) {
        store.delete(doc.id);
      }
    }
    for (const s of capped) {
      store.put({
        ...JSON.parse(JSON.stringify(s)),
        id: `${targetScope}::${s.id}`,
        scope: targetScope,
        sessionId: s.id,
      });
    }
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = (e) => rej(e);
    });
  } catch {
    // localStorage fallback already persisted synchronously
  }
}
