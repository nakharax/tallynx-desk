import React, { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Monitor,
  Moon,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
} from 'lucide-react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import {
  AccountInfo,
  DeskSetupBlueprint,
  EntitlementRecord,
  GhrWorkspaceState,
  MarketplaceDeskSetup,
  ManualCalculatorConfig,
  Mt5PositionRecord,
  Mt5ReportMeta,
  Mt5TimeOffsetSetting,
  QuickGates,
  SnapshotItem,
  SyncLogEntry,
  TradeDirection,
  TradeOutcomeStatus,
  TradeRecord,
} from './types/ghr';
import { MALL_CHANNELS, type MallSetupBlueprint, type MallStatus, type MallZoneId } from './types/mallChat';
import {
  buildCalculatorTradeFields,
  CALCULATOR_CONTRACTS,
  calculateFourLegLadderMetrics,
  carryCycleDaysOnPortChange,
  computeTradePricesAndMetrics,
  convertMt5PositionsToJournalRows,
  createCleanWorkspaceState,
  DEFAULT_STATE,
  DEFAULT_WORKSPACE_BRAND,
  DEFAULT_TWELVE_GATES,
  DeskPageSnapshot,
  evaluateConsistencyRule,
  evaluateTwelveGates,
  filterJournalTrades,
  fmtUSD,
  formatCalculatorLot,
  FourLegStateRow,
  getAccountComputed,
  getActiveCalculator,
  getActiveConsistencyRule,
  getBangkokIsoDate,
  getBangkokTimeHHMM,
  getSavedCycleDaysForPort,
  GHR_PRESET_CALCULATOR,
  normalizeMergedState,
  normalizeMt5TimeOffsetSetting,
  parseCustomerPortalParams,
  reapplyMt5TimezoneToPositions,
  recordCycleDayPnl,
  resolveAccountType,
  resolveRealtimeStateConflict,
  workspaceBrandDisplayName,
  syncCycleDaysWithJournal,
  syncQuickFromTwelveGates,
  syncQuickGateToTwelveGates,
  updateCycleDayEntry,
} from './utils/ghrRules';
import { clearLegacyFundedNextAuth } from './utils/fundedNextMcp';
import {
  canFallbackToUsdWorkspace,
  connectFundedNextPilot,
  convertPilotExecutionsToPositions,
  formatPilotAmount,
  FUNDEDNEXT_POLL_MS,
  isPilotReconnect,
  LIVE_TELEMETRY_POLL_MS,
  listPilotAccounts,
  loadCachedPilotSnapshot,
  planPilotPortAssignments,
  readLiveBridgeTelemetry,
  readPilotAccount,
  readPilotLiveSnapshot,
  saveCachedPilotSnapshot,
} from './utils/fundedNextPilot';
import type {
  LiveBridgeTelemetryResponse,
  PilotPortChange,
  PilotPortStats,
  PilotRead,
  PilotReadState,
  PilotTelemetryView,
} from './utils/fundedNextPilot';
import {
  appendLiveTelemetryPoint,
  computeLivePositionMetrics,
  formatTelemetryTimeLabel,
  type AnyLivePositionInput,
  type LiveTelemetryPoint,
} from './utils/liveTelemetryBuffer';
import type { LiveMonitorControlState } from './components/LivePositionMonitorCard';
import {
  clearOfflineQueue,
  deleteSnapshotFromIndexedDB,
  enqueueOfflineMutation,
  getLocalStorageKey,
  getOfflineQueueItems,
  getRecentSnapshots,
  getStorageScopeId,
  loadLocalState,
  loadWorkspaceFromIndexedDB,
  saveLocalState,
  saveWorkspaceToIndexedDB,
} from './utils/idbStorage';
import { buildTradesArchiveCsv, decodeCloudWorkspacePayload } from './utils/cloudPayloadCodec';
import {
  auth,
  consumeGoogleRedirectResult,
  db,
  fetchOrInitEntitlement,
  formatFirebaseAuthError,
  handleFirestoreError,
  isAdminUser,
  isProOrHigher,
  OperationType,
  pushWorkspaceToFirestore,
  resolveUserAdminStatus,
  signInWithGooglePopup,
  signOutFirebase,
  testFirestoreConnection,
} from './services/firebase';
import { useOnlineStatus } from './hooks/usePWAInstall';
import { PWAInstallButton } from './components/PWAInstallButton';
import { DeskDialog } from './components/DeskDialog';
import { WorkspaceSkeleton } from './components/WorkspaceSkeleton';
import { WorkspaceSidebar } from './components/WorkspaceSidebar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { NewsBlackoutRadar } from './components/NewsBlackoutRadar';
import type { Mt5ReadOnlySyncRequest } from './components/TradeJournalSection';
import type { MallEntry } from './components/CommunityMallSection';

const SettingsPageSection = React.lazy(() =>
  import('./components/SettingsPageSection').then((m) => ({ default: m.SettingsPageSection }))
);

const AccountSwitcher = React.lazy(() =>
  import('./components/AccountSwitcher').then((m) => ({ default: m.AccountSwitcher }))
);
const CalculatorPanel = React.lazy(() =>
  import('./components/CalculatorPanel').then((m) => ({ default: m.CalculatorPanel }))
);
const WebSandboxCalculator = React.lazy(() =>
  import('./components/WebSandboxCalculator').then((m) => ({ default: m.WebSandboxCalculator }))
);
const ConsistencyPanel = React.lazy(() =>
  import('./components/ConsistencyPanel').then((m) => ({ default: m.ConsistencyPanel }))
);
const CommandPalette = React.lazy(() =>
  import('./components/CommandPalette').then((m) => ({ default: m.CommandPalette }))
);
const RightDockPanel = React.lazy(() =>
  import('./components/RightDockPanel').then((m) => ({ default: m.RightDockPanel }))
);
const TradeJournalSection = React.lazy(() =>
  import('./components/TradeJournalSection').then((m) => ({ default: m.TradeJournalSection }))
);
const DatabaseSyncCenter = React.lazy(() =>
  import('./components/DatabaseSyncCenter').then((m) => ({ default: m.DatabaseSyncCenter }))
);
const DeskReferenceCardsSection = React.lazy(() =>
  import('./components/DeskReferenceCardsSection').then((m) => ({
    default: m.DeskReferenceCardsSection,
  }))
);
const AnalyticsSection = React.lazy(() =>
  import('./components/AnalyticsSection').then((m) => ({ default: m.AnalyticsSection }))
);
const DeskMarketplaceSection = React.lazy(() =>
  import('./components/DeskMarketplaceSection').then((m) => ({
    default: m.DeskMarketplaceSection,
  }))
);
const CommunityMallSection = React.lazy(() =>
  import('./components/CommunityMallSection').then((m) => ({ default: m.CommunityMallSection }))
);
const PropRulesSection = React.lazy(() =>
  import('./components/PropRulesSection').then((m) => ({
    default: m.PropRulesSection,
  }))
);
const TradingViewChartSection = React.lazy(() =>
  import('./components/TradingViewChartSection').then((m) => ({
    default: m.TradingViewChartSection,
  }))
);
const HelpGuideModal = React.lazy(() =>
  import('./components/HelpGuideModal').then((m) => ({ default: m.HelpGuideModal }))
);
const LicenseAccessModal = React.lazy(() =>
  import('./components/LicenseAccessModal').then((m) => ({ default: m.LicenseAccessModal }))
);
import {
  computeRealtimeAnalytics,
  computeRealtimeTelemetryBar,
  detectBehavioralGuardrails,
  resolveTelemetryStreamMode,
} from './utils/realtimeGuardrails';
import { findMatchingPropFirm } from './utils/propFirmCatalog';
import {
  DESK_I18N,
  DeskLanguage,
  deskText,
  formatAccountDisplayName,
  formatMt5SyncMessage,
  persistDeskLanguage,
  resolveInitialDeskLanguage,
} from './utils/deskI18n';
import {
  buildWebPortalUrl,
  deskThemeToWeb,
  parseWebHandoff,
  resolveDeskSection,
  resolveDeskTheme,
  stripWebHandoffParams,
  updateDeskPageUrl,
  type DeskSectionId,
  type DeskTheme,
} from './utils/webHandoff';

const WEB_PORTAL_URL = import.meta.env.VITE_TREDYN_WEB_URL?.trim() || 'https://tallynx.com/';
const DESK_THEME_KEY = 'TREDYN_THEME';
const LEGACY_DESK_THEME_KEY = 'TREDYN_DESK_THEME';
const DESK_ROOM_KEY = 'nx_ghr_room_mode_v1';

type DeskRoomMode = 'clean' | 'night' | 'daylight';

type DeskPillar = 'mall' | 'portfolio' | 'plan' | 'rules' | 'settings';

const DEFAULT_INSTRUMENT_ENTRY: Record<string, number> = {
  XAUUSD: 2650,
  EURUSD: 1.085,
  GBPUSD: 1.275,
  USDJPY: 152.5,
  NAS100: 21200,
  BTCUSD: 92000,
};

function getDeskPillar(section: string): DeskPillar {
  if (section === 'sec-mall' || section === 'sec-marketplace') return 'mall';
  if (section === 'sec-accounts' || section === 'journal-root') return 'portfolio';
  if (section === 'calculator-root' || section === 'desk-cards-root' || section === 'tv-chart-root') return 'plan';
  if (section === 'sec-proprules') return 'rules';
  return 'settings';
}

function toWorkspacePage(section: DeskSectionId) {
  // These two internal IDs are also used by the coach and existing navigation.
  if (section === 'sec-calc') return 'calculator-root';
  if (section === 'sec-market') return 'sec-marketplace';
  return section;
}

interface DeskToastAction {
  label: string;
  labelTh: string;
  onClick: () => void;
}

const BROADCAST_CHANNEL_NAME = 'TALLYNX_OS_REALTIME_BUS_V40';

const GOOGLE_SIGN_IN_MESSAGES = new Map([
  ['ยกเลิกการเข้าสู่ระบบด้วย Google', 'Google sign-in was cancelled.'],
  ['โดเมนนี้ยังไม่ได้รับอนุญาตใน Firebase Authentication (Authorized domains)', 'This domain is not authorized for Firebase Authentication.'],
  ['เครือข่ายขัดข้อง ไม่สามารถเชื่อมต่อ Google Sign-In ได้', 'A network error prevented Google sign-in.'],
]);

function playCooldownChime() {
  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.14);
      gain.gain.setValueAtTime(0.08, ctx.currentTime + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.14 + 0.55);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.14);
      osc.stop(ctx.currentTime + idx * 0.14 + 0.56);
    });
  } catch {
    // ignore audio restrictions
  }
}

interface CooldownBannerProps {
  cooldownUntil: number | null;
  lang: DeskLanguage;
  onExpire: () => void;
  onEndEarly: () => void;
}

const CooldownBanner: React.FC<CooldownBannerProps> = React.memo(
  ({ cooldownUntil, lang, onExpire, onEndEarly }) => {
    const [remainingSec, setRemainingSec] = useState<number>(() =>
      cooldownUntil ? Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)) : 0
    );
    const expiredForRef = useRef<number | null>(null);

    useEffect(() => {
      if (!cooldownUntil) {
        setRemainingSec(0);
        expiredForRef.current = null;
        return;
      }
      const updateCooldown = () => {
        const diff = Math.ceil((cooldownUntil - Date.now()) / 1000);
        if (diff > 0) {
          setRemainingSec(diff);
        } else {
          setRemainingSec(0);
          window.clearInterval(timer);
          if (expiredForRef.current !== cooldownUntil) {
            expiredForRef.current = cooldownUntil;
            onExpire();
          }
        }
      };
      const timer = window.setInterval(updateCooldown, 1000);
      const onVisibility = () => {
        if (document.visibilityState === 'visible') updateCooldown();
      };
      document.addEventListener('visibilitychange', onVisibility);
      updateCooldown();
      return () => {
        window.clearInterval(timer);
        document.removeEventListener('visibilitychange', onVisibility);
      };
    }, [cooldownUntil, onExpire]);

    if (remainingSec <= 0) return null;

    return (
      <div
        style={{
          padding: '12px 16px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--rose-soft)',
          border: '1px solid var(--rose-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <strong style={{ color: 'var(--rose)', fontSize: '13px', fontWeight: 600 }}>
          {deskText(lang, '15-Minute Post-Stop Cooldown', 'พักเทรด 15 นาทีหลังชน SL')} (
          <span id="cooldown-timer-text" className="mono">
            {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, '0')}
          </span>
          )
        </strong>
        <button type="button" className="btn sm rose" onClick={onEndEarly}>
          {deskText(lang, 'End cooldown', 'สิ้นสุดเวลาพัก')}
        </button>
      </div>
    );
  }
);

CooldownBanner.displayName = 'CooldownBanner';

export default function App() {
  const [initialHandoff] = useState(() => {
    const { search, hash } = window.location;
    const sandbox = parseWebHandoff(search);
    return {
      sandbox,
      theme: resolveDeskTheme(search),
      section: resolveDeskSection(search, hash) ?? (sandbox ? 'sec-calc' : window.location.hostname === 'mall.tallynx.com' ? 'sec-mall' : 'sec-accounts'),
    };
  });
  const [webSandbox, setWebSandbox] = useState(initialHandoff.sandbox);
  const handoffConsumedRef = useRef(false);
  const [state, setState] = useState<GhrWorkspaceState>(() => loadLocalState());
  const isOnline = useOnlineStatus();

  const [idbReady, setIdbReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [entitlement, setEntitlement] = useState<EntitlementRecord | null>(null);
  const [isClaimAdmin, setIsClaimAdmin] = useState(false);
  const [inviteKey, setInviteKey] = useState<string>('');
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [toasts, setToasts] = useState<{
    id: string;
    text: string;
    textTh?: string;
    lang?: DeskLanguage;
    action?: DeskToastAction;
  }[]>([]);
  const [printRequested, setPrintRequested] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const toolsTriggerRef = useRef<HTMLButtonElement>(null);
  const [activeNavSection, setActiveNavSection] = useState<string>(() => toWorkspacePage(initialHandoff.section));
  const [mallEntry, setMallEntry] = useState<MallEntry>({ zoneId: 'lounge-general' });
  const [mallStatus, setMallStatus] = useState<MallStatus>('WAITING_SETUP');
  const [ssoMallHandle, setSsoMallHandle] = useState<string>();
  const [marketListingId, setMarketListingId] = useState<string>();
  const [guestMallHandle] = useState(() => {
    const fallback = '@guest_' + Math.random().toString(36).slice(2, 10);
    try {
      const existing = localStorage.getItem('TALLYNX_MALL_GUEST');
      if (existing && /^@guest_[a-z0-9]{1,8}$/.test(existing)) return existing;
      localStorage.setItem('TALLYNX_MALL_GUEST', fallback);
    } catch { /* Keep a session handle when storage is unavailable. */ }
    return fallback;
  });
  const [coachLiveChartSymbol, setCoachLiveChartSymbol] = useState<string | null>(null);
  const [coachPendingPrompt, setCoachPendingPrompt] = useState<string | null>(null);
  const [rightDockFocusTick, setRightDockFocusTick] = useState<number>(0);
  const [showRightDock, setShowRightDock] = useState(() => {
    try {
      return window.localStorage.getItem('TREDYN_SHOW_RIGHT_DOCK') === '1';
    } catch {
      return false;
    }
  });
  const [deskLang, setDeskLang] = useState<DeskLanguage>(() =>
    resolveInitialDeskLanguage(typeof window !== 'undefined' ? window.location.search : '')
  );
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  useEffect(() => {
    const onGlobalKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setShowCommandPalette((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onGlobalKey);
    return () => window.removeEventListener('keydown', onGlobalKey);
  }, []);
  const [manualFloatingPnlUsd, setFloatingPnlUsd] = useState(0);
  const [liveMonitorPaused, setLiveMonitorPaused] = useState(false);
  const liveMonitorPausedRef = useRef(liveMonitorPaused);
  liveMonitorPausedRef.current = liveMonitorPaused;
  const [liveTabVisible, setLiveTabVisible] = useState(() =>
    typeof document === 'undefined' ? true : document.visibilityState === 'visible'
  );
  const [liveBridgeByPort, setLiveBridgeByPort] = useState<Record<string, LiveBridgeTelemetryResponse>>({});
  const [liveTelemetrySeriesByPort, setLiveTelemetrySeriesByPort] = useState<Record<string, LiveTelemetryPoint[]>>({});
  const [liveSyncMetaByPort, setLiveSyncMetaByPort] = useState<
    Record<
      string,
      {
        syncing: boolean;
        lastSyncAt: string | null;
        latencyMs: number | null;
        nextPollAt: number | null;
        error: string | null;
      }
    >
  >({});
  const triggerLive3sPollRef = useRef<(() => void) | null>(null);
  const live3sHandlesActivePilotRef = useRef(false);
  const [pilotFeeds, setPilotFeeds] = useState<
    Record<string, PilotReadState & { uid: string; portId: string; accountId: string }>
  >({});
  const pilotFeedsRef = useRef(pilotFeeds);
  pilotFeedsRef.current = pilotFeeds;
  const activePortRef = useRef(state.activePort);
  activePortRef.current = state.activePort;
  const triggerActivePilotPollRef = useRef<(() => void) | null>(null);
  const ingestedPilotSigRef = useRef<Record<string, string>>({});
  const [pilotOAuthPort, setPilotOAuthPort] = useState<string | null>(null);
  const pilotOAuthRef = useRef<AbortController | null>(null);

  useEffect(clearLegacyFundedNextAuth, []);
  const [hasActiveSse, setHasActiveSse] = useState(false);

  useEffect(() => {
    persistDeskLanguage(deskLang);
  }, [deskLang]);

  const ui = DESK_I18N[deskLang];
  const t = (en: string, th: string) => deskText(deskLang, en, th);

  useEffect(() => {
    try {
      window.localStorage.setItem('TREDYN_SHOW_RIGHT_DOCK', showRightDock ? '1' : '0');
    } catch {
      // ignore storage errors
    }
  }, [showRightDock]);

  useEffect(() => {
    if (!isOnline || typeof window === 'undefined' || !('EventSource' in window)) {
      setHasActiveSse(false);
      return;
    }
    const es = new EventSource('/api/telemetry/stream');
    es.onopen = () => setHasActiveSse(true);
    es.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data) as { event?: string; payload?: { login?: string; receivedPositions?: number } };
        if (parsed.event === 'bridge.push' && parsed.payload) {
          triggerLive3sPollRef.current?.();
          addToast(
            `Live data received from MT5 Live Bridge (#${parsed.payload.login || '-'} · ${parsed.payload.receivedPositions ?? 0} positions)`,
            `รับข้อมูลสดจาก MT5 Live Bridge (#${parsed.payload.login || '-'} · ${parsed.payload.receivedPositions ?? 0} รายการ)`
          );
        }
      } catch {
        // ignore non-json heartbeat
      }
    };
    es.onerror = () => setHasActiveSse(false);
    return () => {
      es.close();
    };
  }, [isOnline]);
  const [deskTheme, setDeskTheme] = useState<DeskTheme>(() => {
    if (initialHandoff.theme) return initialHandoff.theme;
    try {
      const saved = window.localStorage.getItem(DESK_THEME_KEY)
        ?? window.localStorage.getItem(LEGACY_DESK_THEME_KEY);
      if (saved === 'obsidian' || saved === 'alabaster') return saved;
    } catch {
      /* ignore storage errors */
    }
    return 'obsidian';
  });
  const [deskRoomMode, setDeskRoomMode] = useState<DeskRoomMode>(() => {
    if (initialHandoff.theme === 'alabaster') return 'clean';
    try {
      const saved = window.localStorage.getItem(DESK_ROOM_KEY);
      if (saved === 'night' || saved === 'daylight' || saved === 'clean') {
        return saved;
      }
    } catch {
      /* ignore storage access errors */
    }
    return 'night';
  });

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add('theme-switching');
    root.dataset.theme = deskTheme;
    root.dataset.room = deskRoomMode;
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', deskTheme === 'obsidian' ? '#05070B' : '#FFFFFF');
    void root.offsetHeight;
    const raf = window.requestAnimationFrame(() => root.classList.remove('theme-switching'));
    return () => {
      window.cancelAnimationFrame(raf);
      root.classList.remove('theme-switching');
    };
  }, [deskTheme, deskRoomMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DESK_ROOM_KEY, deskRoomMode);
    } catch {
      /* ignore storage access errors */
    }
  }, [deskRoomMode]);

  const handleSelectRoomMode = useCallback((nextMode: DeskRoomMode) => {
    setDeskRoomMode(nextMode);
    if (nextMode === 'night' || nextMode === 'daylight') {
      setDeskTheme('obsidian');
    }
  }, []);

  const handleSelectColorTheme = useCallback((nextTheme: DeskTheme) => {
    setDeskTheme(nextTheme);
    if (nextTheme === 'alabaster') {
      setDeskRoomMode('clean');
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(DESK_THEME_KEY, deskTheme);
      window.localStorage.setItem(LEGACY_DESK_THEME_KEY, deskTheme);
    } catch {
      // ignore storage quota errors
    }
  }, [deskTheme]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const prefs = { lang: deskLang, theme: deskThemeToWeb(deskTheme) };
    let changed = false;
    for (const [key, value] of Object.entries(prefs)) {
      if (url.searchParams.has(key) && url.searchParams.get(key) !== value) {
        url.searchParams.set(key, value);
        changed = true;
      }
    }
    if (changed) window.history.replaceState(window.history.state, '', url);
  }, [deskLang, deskTheme]);

  const webPortalUrl = useMemo(
    () => buildWebPortalUrl(WEB_PORTAL_URL, deskLang, deskTheme),
    [deskLang, deskTheme],
  );
  const webPortalLabel = t('TallyNX Website', 'เว็บไซต์ TallyNX');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const isApplyingRemoteRef = useRef(false);
  const activeUidRef = useRef<string | null>(auth.currentUser?.uid || null);
  const authTransitionIdRef = useRef<number>(0);
  const stateRef = useRef<GhrWorkspaceState>(state);

  useEffect(() => {
    stateRef.current = state;
    document.body.classList.toggle('privacy-masked', !!state.privacyMasked);
  }, [state]);

  const deskBrandName = workspaceBrandDisplayName(state.deskBrandName);
  useEffect(() => {
    document.title = activeNavSection === 'sec-mall' || deskBrandName === DEFAULT_WORKSPACE_BRAND
      ? deskText(deskLang, 'TallyNX Mall — Community Mall & Trading OS', 'TallyNX Mall — คอมมูนิตี้มอลล์และระบบเทรด')
      : `${deskBrandName} — ${deskText(deskLang, 'Risk Analytics & Trade Journal', 'วิเคราะห์ความเสี่ยงและบันทึกการเทรด')}`;
  }, [activeNavSection, deskBrandName, deskLang]);

  const addToast = useCallback((text: string, textTh?: string, lang?: DeskLanguage, action?: DeskToastAction) => {
    const id = 'T-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    setToasts((prev) => [...prev, { id, text, textTh, lang, action }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, action ? 8000 : 2600);
  }, []);

  const handleGoogleLogin = useCallback(async () => {
    try {
      const outcome = await signInWithGooglePopup();
      if (outcome === 'signed_in') {
        addToast('Signed in to Google Cloud.', 'เข้าสู่ระบบ Google Cloud สำเร็จ');
      }
    } catch (err) {
      const message = formatFirebaseAuthError(err);
      addToast(GOOGLE_SIGN_IN_MESSAGES.get(message) ?? 'Could not open Google sign-in.', message);
    }
  }, [addToast]);

  const appendSyncLog = useCallback(
    (
      channel: SyncLogEntry['channel'],
      action: string,
      status: SyncLogEntry['status'] = 'SUCCESS'
    ) => {
      const entry: SyncLogEntry = {
        id: 'L-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
        timestamp: new Date().toTimeString().slice(0, 8),
        channel,
        action,
        status,
      };
      setSyncLogs((prev) => [entry, ...prev].slice(0, 20));
    },
    []
  );

  // Unified Persist & Realtime Broadcast Function
  const commitWorkspaceChange = useCallback(
    async (
      updater: (prev: GhrWorkspaceState) => GhrWorkspaceState,
      options?: { snapshotReason?: string | null; broadcastAction?: string }
    ) => {
      const previous = stateRef.current;
      const nextState = carryCycleDaysOnPortChange(previous, updater(previous));
      const nowIso = new Date().toISOString();
      const stamped: GhrWorkspaceState = {
        ...nextState,
        lastSavedAt: nowIso,
      };

      stateRef.current = stamped;
      setState(stamped);

      const scopeUid = activeUidRef.current;
      const scopeId = getStorageScopeId(scopeUid);

      // 1. Synchronous LocalStorage write (isolated per UID or 'guest')
      saveLocalState(stamped, scopeUid);

      // 2. BroadcastChannel cross-tab instant sync (isolated per scopeId)
      if (broadcastRef.current && !isApplyingRemoteRef.current) {
        try {
          broadcastRef.current.postMessage({
            type: 'WORKSPACE_MUTATION',
            ownerScope: scopeId,
            updatedAt: nowIso,
            action: options?.broadcastAction || options?.snapshotReason || 'อัปเดตข้อมูล',
            payload: stamped,
          });
          appendSyncLog('BROADCAST', options?.broadcastAction || options?.snapshotReason || 'ซิงก์ข้ามแท็บทันที');
        } catch {
          // ignore broadcast error
        }
      }

      // 3. IndexedDB persistent store + optional Time Machine snapshot (isolated per scopeUid)
      const snaps = await saveWorkspaceToIndexedDB(stamped, options?.snapshotReason || null, scopeUid);
      setIdbReady(true);
      if (activeUidRef.current === scopeUid) {
        setSnapshots(snaps);
      }
      if (options?.snapshotReason) {
        appendSyncLog('IDB', `เซฟลง IndexedDB (${options.snapshotReason})`);
      }

      // 4. Cloud Firestore or Offline Outbox Queue (strictly matching active authenticated UID)
      if (!isApplyingRemoteRef.current && stamped.autoCloudSync) {
        if (!navigator.onLine) {
          const qCount = await enqueueOfflineMutation(
            stamped,
            options?.snapshotReason || options?.broadcastAction || 'แก้ไขขณะออฟไลน์',
            scopeUid
          );
          if (activeUidRef.current === scopeUid) {
            setPendingOfflineCount(qCount);
          }
          appendSyncLog('OFFLINE_QUEUE', `เข้าคิวรอซิงก์เมื่อออนไลน์ (${qCount} รายการ)`, 'QUEUED');
        } else if (auth.currentUser && scopeUid && auth.currentUser.uid === scopeUid) {
          try {
            setCloudSyncing(true);
            await pushWorkspaceToFirestore(auth.currentUser.uid, stamped);
            setCloudSyncing(false);
            appendSyncLog('CLOUD', 'ซิงก์ขึ้น Firebase Cloud Firestore สำเร็จ');
          } catch {
            setCloudSyncing(false);
            const qCount = await enqueueOfflineMutation(stamped, 'รอซิงก์ Cloud รอบถัดไป', scopeUid);
            if (activeUidRef.current === scopeUid) {
              setPendingOfflineCount(qCount);
            }
          }
        }
      }
    },
    [appendSyncLog]
  );

  // Initialize IndexedDB, BroadcastChannel, Customer Portal Deep-Link, and Firebase Connection Validation on Mount
  useEffect(() => {
    const portalParams = parseCustomerPortalParams(window.location.search);
    if (portalParams.openPortal) {
      if (portalParams.inviteKey) {
        setInviteKey(portalParams.inviteKey);
      }
      setShowAccountsDrawer(false);
      setState((prev) => ({
        ...prev,
        showLicenseModal: true,
        showHelpGuide: false,
        showDbManager: false,
        showAddPortForm: false,
        editingPortId: null,
      }));
      try {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('key');
        cleanUrl.searchParams.delete('invite');
        cleanUrl.searchParams.delete('portal');
        window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
      } catch {
        // ignore URL cleanup restriction
      }
    }

    try {
      const searchParams = new URLSearchParams(window.location.search);
      const ssoToken = searchParams.get('sso_token');
      if (ssoToken && ssoToken.trim().length > 10) {
        fetch('/api/auth/sso-exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ssoToken: ssoToken.trim() }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data && data.ok) {
              if (typeof data.handle === 'string') {
                const handle = data.handle.normalize('NFKC').replace(/^@+|[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, 39).toLowerCase();
                if (handle) setSsoMallHandle('@' + handle);
              }
              addToast(`Connected via SSO (${data.handle || 'tallynx.com'}).`, `เชื่อมต่อ SSO (${data.handle || 'tallynx.com'}) สำเร็จ`);
              appendSyncLog('BROADCAST', `SSO Session Verified (${data.handle || 'tallynx.com'})`);
            }
          })
          .catch(() => null)
          .finally(() => {
            try {
              const cleanUrl = new URL(window.location.href);
              cleanUrl.searchParams.delete('sso_token');
              window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
            } catch {
              // ignore URL cleanup restriction
            }
          });
      }
    } catch {
      // ignore URL parsing errors
    }

    testFirestoreConnection();

    (async () => {
      const bootUid = activeUidRef.current;
      const [idbState, recentSnaps, queueItems] = await Promise.all([
        loadWorkspaceFromIndexedDB(bootUid),
        getRecentSnapshots(undefined, bootUid),
        getOfflineQueueItems(undefined, bootUid),
      ]);
      setIdbReady(true);
      if (activeUidRef.current !== bootUid) return;
      setSnapshots(recentSnaps);
      setPendingOfflineCount(queueItems.length);

      if (idbState) {
        const current = stateRef.current;
        const resolved = resolveRealtimeStateConflict(current, idbState);
        if (
          resolved.winner === 'REMOTE' ||
          resolved.winner === 'MERGED' ||
          (current.journal.length === 0 && idbState.journal.length > 0)
        ) {
          stateRef.current = resolved.state;
          setState(resolved.state);
          saveLocalState(resolved.state, bootUid);
          appendSyncLog('IDB', `กู้คืนข้อมูลจาก IndexedDB (${resolved.state.journal.length} ไม้)`);
        }
      }
    })();

    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      broadcastRef.current = bc;
      bc.onmessage = (ev) => {
        const msg = ev.data;
        const currentScopeId = getStorageScopeId(activeUidRef.current);
        if (
          msg &&
          msg.type === 'WORKSPACE_MUTATION' &&
          msg.payload &&
          (msg.ownerScope || 'guest') === currentScopeId
        ) {
          isApplyingRemoteRef.current = true;
          const resolved = resolveRealtimeStateConflict(
            stateRef.current,
            normalizeMergedState(msg.payload)
          );
          stateRef.current = resolved.state;
          setState(resolved.state);
          saveLocalState(resolved.state, activeUidRef.current);
          appendSyncLog('BROADCAST', `รับซิงก์เรียลไทม์จากแท็บอื่น: ${msg.action || 'อัปเดต'}`);
          isApplyingRemoteRef.current = false;
        }
      };
    }

    const onStorageEvent = (ev: StorageEvent) => {
      const expectedKey = getLocalStorageKey(activeUidRef.current);
      if (ev.key === expectedKey && ev.newValue) {
        try {
          const incoming = normalizeMergedState(JSON.parse(ev.newValue));
          const resolved = resolveRealtimeStateConflict(stateRef.current, incoming);
          stateRef.current = resolved.state;
          setState(resolved.state);
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', onStorageEvent);

    return () => {
      window.removeEventListener('storage', onStorageEvent);
      if (broadcastRef.current) {
        broadcastRef.current.close();
        broadcastRef.current = null;
      }
    };
  }, [appendSyncLog]);

  // Firebase Auth & Real-Time Firestore Listener (Strictly Isolated Per Google UID)
  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;
    void consumeGoogleRedirectResult();

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      const transitionId = ++authTransitionIdRef.current;
      const nextUid = user ? user.uid : null;
      const prevUid = activeUidRef.current;
      activeUidRef.current = nextUid;

      setCurrentUser(user);
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      if (!user) {
        setEntitlement(null);
        setIsClaimAdmin(false);
        setCloudSyncing(false);

        if (prevUid !== null) {
          // Signed out from a Google account -> immediately isolate back to Guest workspace
          const guestLocal = loadLocalState(null);
          const preserveLicenseModal = !!stateRef.current.showLicenseModal;
          const nextGuestState: GhrWorkspaceState = {
            ...guestLocal,
            showLicenseModal: preserveLicenseModal,
            showDbManager: false,
            showHelpGuide: false,
          };
          stateRef.current = nextGuestState;
          setState(nextGuestState);
          setSyncLogs([]);

          const [guestIdb, guestSnaps, guestQueue] = await Promise.all([
            loadWorkspaceFromIndexedDB(null),
            getRecentSnapshots(undefined, null),
            getOfflineQueueItems(undefined, null),
          ]);
          if (authTransitionIdRef.current !== transitionId) return;
          setSnapshots(guestSnaps);
          setPendingOfflineCount(guestQueue.length);
          if (guestIdb) {
            const mergedGuest: GhrWorkspaceState = {
              ...resolveRealtimeStateConflict(stateRef.current, guestIdb).state,
              showLicenseModal: !!stateRef.current.showLicenseModal,
            };
            stateRef.current = mergedGuest;
            setState(mergedGuest);
            saveLocalState(mergedGuest, null);
          }
          appendSyncLog('LOCAL', 'สลับกลับโหมดเครื่องส่วนตัว (Guest) แยกจากบัญชี Google แล้ว');
        }
        return;
      }

      // Signed in / switched to a Google account -> load ONLY this UID's isolated local cache first
      Promise.allSettled([
        fetchOrInitEntitlement(user),
        resolveUserAdminStatus(user),
      ]).then(([entResult, adminResult]) => {
        if (authTransitionIdRef.current !== transitionId) return;
        if (entResult.status === 'fulfilled') {
          setEntitlement(entResult.value);
        }
        if (adminResult.status === 'fulfilled') {
          setIsClaimAdmin(adminResult.value);
        }
      });

      const preserveLicenseModal = !!stateRef.current.showLicenseModal;
      const preserveDbManager = !!stateRef.current.showDbManager;
      if (prevUid !== nextUid) {
        const uidLocal = loadLocalState(nextUid);
        const isolatedStart: GhrWorkspaceState = {
          ...uidLocal,
          showLicenseModal: preserveLicenseModal,
          showDbManager: preserveDbManager,
          showHelpGuide: false,
        };
        stateRef.current = isolatedStart;
        setState(isolatedStart);
        setSyncLogs([]);
      }

      const [uidIdb, uidSnaps, uidQueue] = await Promise.all([
        loadWorkspaceFromIndexedDB(nextUid),
        getRecentSnapshots(undefined, nextUid),
        getOfflineQueueItems(undefined, nextUid),
      ]);
      if (authTransitionIdRef.current !== transitionId) return;

      setSnapshots(uidSnaps);
      setPendingOfflineCount(uidQueue.length);

      if (uidIdb) {
        const resolvedLocal = resolveRealtimeStateConflict(stateRef.current, uidIdb);
        const hydrated: GhrWorkspaceState = {
          ...resolvedLocal.state,
          showLicenseModal: !!stateRef.current.showLicenseModal,
          showDbManager: !!stateRef.current.showDbManager,
        };
        stateRef.current = hydrated;
        setState(hydrated);
        saveLocalState(hydrated, nextUid);
      }

      const path = `workspaces/${user.uid}`;
      const docRef = doc(db, 'workspaces', user.uid);
      unsubscribeSnapshot = onSnapshot(
        docRef,
        async (snap) => {
          if (authTransitionIdRef.current !== transitionId || activeUidRef.current !== user.uid) {
            return;
          }
          if (!snap.exists()) {
            // Seed this user's new cloud document ONLY with this user's own clean/UID-scoped workspace
            pushWorkspaceToFirestore(user.uid, stateRef.current).catch(() => {});
            appendSyncLog('CLOUD', `สร้างพื้นที่ Cloud ส่วนตัวสำหรับ ${user.email || user.uid.slice(0, 8)}`);
            return;
          }
          const data = snap.data();
          if (!data || typeof data.payloadJson !== 'string') return;
          try {
            const decodedRaw = await decodeCloudWorkspacePayload<Partial<GhrWorkspaceState>>(data.payloadJson);
            if (authTransitionIdRef.current !== transitionId || activeUidRef.current !== user.uid) {
              return;
            }
            const remoteParsed = normalizeMergedState(decodedRaw);
            const localTs = stateRef.current.lastSavedAt
              ? new Date(stateRef.current.lastSavedAt).getTime()
              : 0;
            const remoteTs = remoteParsed.lastSavedAt
              ? new Date(remoteParsed.lastSavedAt).getTime()
              : 0;

            // If this browser had no saved state for this UID yet, take Cloud verbatim without mixing defaults
            if (localTs === 0 && stateRef.current.journal.length === 0) {
              isApplyingRemoteRef.current = true;
              const cloudState: GhrWorkspaceState = {
                ...remoteParsed,
                showLicenseModal: !!stateRef.current.showLicenseModal,
                showDbManager: !!stateRef.current.showDbManager,
              };
              stateRef.current = cloudState;
              setState(cloudState);
              saveLocalState(cloudState, user.uid);
              saveWorkspaceToIndexedDB(cloudState, null, user.uid);
              appendSyncLog(
                'CLOUD',
                `โหลดข้อมูลบัญชี ${user.email || ''} จาก Cloud สำเร็จ (${cloudState.journal.length} ไม้)`
              );
              isApplyingRemoteRef.current = false;
              return;
            }

            const resolved = resolveRealtimeStateConflict(stateRef.current, remoteParsed);
            if (
              resolved.winner === 'MERGED' ||
              remoteTs > localTs + 800 ||
              (stateRef.current.journal.length === 0 && remoteParsed.journal.length > 0)
            ) {
              isApplyingRemoteRef.current = true;
              const syncedState: GhrWorkspaceState = {
                ...resolved.state,
                showLicenseModal: !!stateRef.current.showLicenseModal,
                showDbManager: !!stateRef.current.showDbManager,
              };
              stateRef.current = syncedState;
              setState(syncedState);
              saveLocalState(syncedState, user.uid);
              saveWorkspaceToIndexedDB(syncedState, null, user.uid);
              appendSyncLog(
                'CLOUD',
                `อัปเดตเรียลไทม์จาก Cloud Firestore (${syncedState.journal.length} ไม้)`,
                resolved.winner === 'MERGED' ? 'CONFLICT_RESOLVED' : 'SUCCESS'
              );
              isApplyingRemoteRef.current = false;
            }
          } catch {
            // ignore malformed JSON
          }
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.GET, path);
          } catch {
            // logged via handleFirestoreError
          }
        }
      );
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, [appendSyncLog]);

  // Flush Offline Outbox Queue Automatically When Network Reconnects (Per Active UID Scope)
  useEffect(() => {
    if (!isOnline) return;
    (async () => {
      const uid = activeUidRef.current;
      const items = await getOfflineQueueItems(undefined, uid);
      if (items.length === 0) return;

      if (auth.currentUser && uid && auth.currentUser.uid === uid) {
        try {
          setCloudSyncing(true);
          await pushWorkspaceToFirestore(auth.currentUser.uid, stateRef.current);
          await clearOfflineQueue(uid);
          if (activeUidRef.current === uid) {
            setPendingOfflineCount(0);
          }
          setCloudSyncing(false);
          appendSyncLog('OFFLINE_QUEUE', `ซิงก์คิวออฟไลน์ ${items.length} รายการขึ้น Cloud สำเร็จ`);
          addToast(`Back online · Synced ${items.length} items.`, `กลับมาออนไลน์แล้ว · ซิงก์ข้อมูล ${items.length} รายการเรียบร้อย`);
        } catch {
          setCloudSyncing(false);
        }
      } else {
        await clearOfflineQueue(uid);
        if (activeUidRef.current === uid) {
          setPendingOfflineCount(0);
        }
        appendSyncLog('IDB', `ยืนยันข้อมูลออฟไลน์ ${items.length} รายการในเครื่องเรียบร้อย`);
        addToast('Back online · All data has been saved.', 'กลับมาออนไลน์แล้ว · ข้อมูลทั้งหมดถูกบันทึกครบถ้วน');
      }
    })();
  }, [isOnline, addToast, appendSyncLog]);

  const handleCooldownExpire = useCallback(() => {
    commitWorkspaceChange((prev) => ({ ...prev, cooldownUntil: null }), {
      broadcastAction: 'ครบเวลาพักหน้าจอ 15 นาที',
    });
    playCooldownChime();
    addToast('The 15-minute trading cooldown has ended.', 'ครบเวลาพักเทรด 15 นาทีแล้ว');
  }, [commitWorkspaceChange, addToast]);

  const handleEndCooldownEarly = useCallback(() => {
    commitWorkspaceChange((prev) => ({ ...prev, cooldownUntil: null }));
  }, [commitWorkspaceChange]);

  const handleSwitchPage = useCallback((pageId: string) => {
    const normalizedId = toWorkspacePage(pageId as DeskSectionId) || pageId;
    setActiveNavSection(normalizedId);
    if (normalizedId === 'sec-mall') setShowRightDock(false);
    if (normalizedId !== 'sec-marketplace') setMarketListingId(undefined);
    if (normalizedId !== 'journal-root') setPrintRequested(false);
    try {
      const { pathname, search, hash, hostname } = window.location;
      const currentPath = pathname + search + hash;
      const params = new URLSearchParams(search);
      if (hostname === 'mall.tallynx.com' && !params.has('page')) {
        params.set('page', 'mall');
      }
      const routePath = hostname === 'mall.tallynx.com' ? pathname + '?' + params + hash : currentPath;
      const nextPath = updateDeskPageUrl(routePath, normalizedId);
      if (nextPath !== currentPath) window.history.replaceState(window.history.state, '', nextPath);
    } catch {
      // ignore history restrictions
    }
    mainRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const openMall = useCallback((zoneId: MallZoneId = 'lounge-general', listing?: Pick<MarketplaceDeskSetup, 'id' | 'title'> & { blueprint: { primarySymbol: string } }) => {
    setMallEntry({
      zoneId,
      ...(listing && { listing: { id: listing.id, title: listing.title, symbol: listing.blueprint.primarySymbol } }),
    });
    handleSwitchPage('sec-mall');
  }, [handleSwitchPage]);

  useEffect(() => {
    if (handoffConsumedRef.current) return;
    handoffConsumedRef.current = true;
    try {
      const { pathname, search, hash } = window.location;
      const currentPath = pathname + search + hash;
      const cleanPath = stripWebHandoffParams(currentPath);
      if (currentPath !== cleanPath) window.history.replaceState(window.history.state, '', cleanPath);
    } catch {
      // The calculator remains available when history replacement is restricted.
    }
    if (initialHandoff.sandbox) {
      addToast(
        'Loaded Web Sandbox values into the calculator.',
        'โหลดค่าจาก Web Sandbox เข้าเครื่องคำนวณแล้ว',
        undefined,
        initialHandoff.section === 'sec-calc' ? undefined : {
          label: 'Open calculator',
          labelTh: 'เปิดเครื่องคำนวณ',
          onClick: () => handleSwitchPage('calculator-root'),
        },
      );
    }
  }, [addToast, handleSwitchPage, initialHandoff]);

  useEffect(() => {
    const syncUrlPage = () => {
      const { search, hash } = window.location;
      const section = resolveDeskSection(search, hash);
      if (section) {
        const pageId = toWorkspacePage(section);
        setActiveNavSection(pageId);
        if (pageId !== 'journal-root') setPrintRequested(false);
        mainRef.current?.scrollTo({ top: 0, behavior: 'instant' });
      }
    };
    window.addEventListener('hashchange', syncUrlPage);
    window.addEventListener('popstate', syncUrlPage);
    return () => {
      window.removeEventListener('hashchange', syncUrlPage);
      window.removeEventListener('popstate', syncUrlPage);
    };
  }, []);

  // Filtered Journal Memo (deferred search keeps input typing responsive on large ledgers)
  const deferredJournalSearch = useDeferredValue(state.journalSearch);
  const filteredJournal = useMemo(() => {
    return filterJournalTrades(state.journal, {
      portFilter: state.journalFilter,
      statusFilter: state.journalStatusFilter,
      dateFilter: state.journalDateFilter,
      sessionFilter: state.journalSessionFilter,
      search: deferredJournalSearch,
    });
  }, [
    state.journal,
    state.journalFilter,
    state.journalStatusFilter,
    state.journalDateFilter,
    state.journalSessionFilter,
    deferredJournalSearch,
  ]);

  // Handlers
  const copyText = useCallback(
    (text: string, label: string) => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(text)
          .then(() => addToast(
            /\p{Script=Thai}/u.test(label) ? 'Copied to clipboard.' : `Copied · ${label}`,
            `คัดลอกแล้ว · ${label}`
          ))
          .catch(() => addToast('Clipboard unavailable.', 'ไม่สามารถใช้คลิปบอร์ดได้'));
      } else {
        addToast('Clipboard unavailable.', 'ไม่สามารถใช้คลิปบอร์ดได้');
      }
    },
    [addToast]
  );

  const handleRecordTradeOutcome = useCallback(
    (outcomeMode: TradeOutcomeStatus) => {
      const current = stateRef.current;
      const portKeys = Object.keys(current.accounts || {});
      if (portKeys.length === 0) {
        addToast('Add an account before recording a trade.', 'เพิ่มพอร์ตก่อนบันทึกการเทรด');
        return;
      }
      const computed = buildCalculatorTradeFields(getActiveCalculator(current), outcomeMode, current.calcMode === 'MANUAL');
      if (!computed) {
        addToast('Check the calculator inputs and selected outcome.', 'ตรวจสอบค่าที่กรอกและผลที่เลือกในเครื่องคำนวณ');
        return;
      }

      const outcomeLabels: Record<TradeOutcomeStatus, [string, string]> = {
        FULL_SWEEP: ['Full Sweep', 'ถึงครบทุกเป้า'],
        TRAILING_LOCK: ['Trailing Lock', 'ล็อกกำไร'],
        TP1_ONLY: ['TP1 Only', 'ถึง TP1 เท่านั้น'],
        BREAK_EVEN: ['Break Even', 'ปิดเท่าทุน'],
        FULL_SL: ['Stop Loss', 'ถึงจุดตัดขาดทุน'],
        CUSTOM: ['Custom', 'กำหนดเอง'],
      };
      const [labelEn, labelTh] = outcomeLabels[outcomeMode];

      const newRow: TradeRecord = {
        ...computed,
        id: 'T-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
        port: current.accounts[current.activePort] ? current.activePort : portKeys[0],
        date: getBangkokIsoDate(),
        time: getBangkokTimeHHMM(),
        dir: current.calcDir,
        note: current.calcNote,
        gatesPassedAtLog: evaluateTwelveGates(current.twelveGates).passedCount,
      };

      commitWorkspaceChange(
        (prev) => ({
          ...prev,
          journal: [newRow, ...prev.journal],
          cycleDays: recordCycleDayPnl(prev.cycleDays, newRow.date, computed.pnlUsd),
          calcNote: '',
          cooldownUntil: outcomeMode === 'FULL_SL' ? Date.now() + 15 * 60 * 1000 : prev.cooldownUntil,
        }),
        {
          snapshotReason: `บันทึก ${labelTh}`,
          broadcastAction: `บันทึกเทรด ${newRow.id} (${fmtUSD(computed.pnlUsd, true)})`,
        }
      );

      addToast(
        `Recorded · ${labelEn} (${fmtUSD(computed.pnlUsd, true)})`,
        `บันทึก ${labelTh} (${fmtUSD(computed.pnlUsd, true)})`
      );
    },
    [commitWorkspaceChange, addToast]
  );

  const handleRecordFourLegState = useCallback(
    (stateRow: FourLegStateRow) => {
      const portKeys = Object.keys(stateRef.current.accounts || {});
      if (portKeys.length === 0) {
        addToast('Add an account before recording a trade.', 'เพิ่มพอร์ตก่อนบันทึกการเทรด');
        return;
      }
      const entry = parseFloat(String(stateRef.current.calcEntry)) || 4042.59;
      const dir = stateRef.current.calcDir;
      const risk = Number(stateRef.current.calcRisk) || 120;
      const port = stateRef.current.activePort || portKeys[0];
      const dateStr = getBangkokIsoDate();
      const timeStr = getBangkokTimeHHMM();

      const isV32Row =
        stateRow.legPts === -3000 ||
        stateRow.legPts === -1600 ||
        stateRow.legPts === 0 ||
        stateRow.legPts === 1600 ||
        stateRow.legPts === 2400;

      if (isV32Row) {
        const computed = computeTradePricesAndMetrics({
          dir,
          entry,
          risk,
          status: stateRow.journalStatus,
        });
        const newRow: TradeRecord = {
          id: 'GHR-' + Date.now().toString().slice(-5),
          gatesPassedAtLog: evaluateTwelveGates(stateRef.current.twelveGates).passedCount,
          port,
          date: dateStr,
          time: timeStr,
          dir,
          ...computed,
          note: `GHR v3.2 ${stateRow.titleEn} (${stateRow.rMultiple >= 0 ? '+' : ''}${stateRow.rMultiple}R)`,
        };

        commitWorkspaceChange(
          (prev) => ({
            ...prev,
            journal: [newRow, ...prev.journal],
            cycleDays: recordCycleDayPnl(prev.cycleDays, newRow.date, newRow.pnlUsd),
            cooldownUntil: stateRow.stateIndex === 0 ? Date.now() + 15 * 60 * 1000 : prev.cooldownUntil,
          }),
          {
            snapshotReason: `บันทึก GHR v3.2 ${stateRow.titleEn}`,
            broadcastAction: `บันทึก GHR v3.2 ${newRow.id} (${fmtUSD(newRow.pnlUsd, true)})`,
          }
        );

        addToast(`Recorded · ${stateRow.titleEn} (${fmtUSD(newRow.pnlUsd, true)})`, `บันทึก ${stateRow.titleTh} (${fmtUSD(newRow.pnlUsd, true)})`);
        return;
      }

      const fourLeg = calculateFourLegLadderMetrics(dir, entry, risk);

      const newRow: TradeRecord = {
        id: 'T4-' + Date.now().toString().slice(-5),
        gatesPassedAtLog: evaluateTwelveGates(stateRef.current.twelveGates).passedCount,
        port,
        date: dateStr,
        time: timeStr,
        dir,
        entry: fourLeg.validEntry,
        risk: fourLeg.riskUsd,
        lotLeg: +fourLeg.legLot.toFixed(2),
        slPrice: parseFloat(fourLeg.slPrice) || 0,
        tp1Price: parseFloat(fourLeg.tp1Price) || 0,
        tp2Price: parseFloat(fourLeg.tp2Price) || 0,
        tp3Price: parseFloat(fourLeg.tp4Price) || 0,
        tp1Pts: stateRow.stateIndex >= 1 ? 300 : 0,
        tp2Pts: stateRow.stateIndex >= 2 ? 600 : 0,
        tp3Pts: stateRow.stateIndex === 4 ? 2100 : stateRow.stateIndex === 3 ? 900 : 0,
        slPts: stateRow.legPts < 0 ? stateRow.legPts : 0,
        totalPts: stateRow.legPts,
        rr: stateRow.rMultiple,
        pnlUsd: stateRow.netUsd,
        status: stateRow.journalStatus,
        note: `4-Leg ${stateRow.titleEn} (${stateRow.rMultiple >= 0 ? '+' : ''}${stateRow.rMultiple}R)`,
      };

      commitWorkspaceChange(
        (prev) => ({
          ...prev,
          journal: [newRow, ...prev.journal],
          cycleDays: recordCycleDayPnl(prev.cycleDays, newRow.date, newRow.pnlUsd),
          cooldownUntil: stateRow.stateIndex === 0 ? Date.now() + 15 * 60 * 1000 : prev.cooldownUntil,
        }),
        {
          snapshotReason: `บันทึก 4-Leg ${stateRow.titleEn}`,
          broadcastAction: `บันทึก 4-Leg ${newRow.id} (${fmtUSD(stateRow.netUsd, true)})`,
        }
      );

      addToast(`Recorded 4-Leg · ${stateRow.titleEn} (${fmtUSD(stateRow.netUsd, true)})`, `บันทึกแผน 4 ไม้ · ${stateRow.titleTh} (${fmtUSD(stateRow.netUsd, true)})`);
    },
    [commitWorkspaceChange, addToast]
  );

  // Import Files (.xlsx / .json / .csv)
  const handleImportFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const files = Array.from(fileList);

      for (const file of files) {
        const lower = file.name.toLowerCase();
        if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
          try {
            const buf = await file.arrayBuffer();
            const { parseMt5SpreadsheetBuffer } = await import('./utils/mt5Parser');
            const currentMt5Offset = normalizeMt5TimeOffsetSetting(stateRef.current.mt5TimeOffset);
            const { meta, positions } = parseMt5SpreadsheetBuffer(buf, file.name, currentMt5Offset);
            if (!positions || positions.length === 0) {
              addToast(`No positions found in ${file.name}.`, `ไม่พบรายการสถานะในไฟล์ ${file.name}`);
              continue;
            }

            const loginStr = meta.login || 'MT5-' + Date.now().toString().slice(-5);
            commitWorkspaceChange(
              (prev) => {
                const nextAccounts = { ...prev.accounts };
                let targetPortId = Object.keys(nextAccounts).find(
                  (pid) => String(nextAccounts[pid].login).trim() === String(loginStr).trim()
                );
                const initialCap = meta.initialDeposit >= 100 ? meta.initialDeposit : 6000;
                if (!targetPortId) {
                  targetPortId = 'port_' + loginStr;
                  const portNum = Object.keys(nextAccounts).length + 1;
                  nextAccounts[targetPortId] = {
                    id: targetPortId,
                    login: loginStr,
                    name: `พอร์ต ${portNum} · #${loginStr}`,
                    initial: initialCap,
                    targetProfit: +(initialCap * 0.08).toFixed(2),
                    minDays: 5,
                    defaultRisk: 120,
                  };
                } else if (meta.initialDeposit >= 100) {
                  nextAccounts[targetPortId] = {
                    ...nextAccounts[targetPortId],
                    initial: meta.initialDeposit,
                  };
                }

                const nextRawReports = {
                  ...prev.mt5RawReports,
                  [targetPortId]: {
                    meta,
                    positions,
                    importedAt: new Date().toISOString(),
                  },
                };

                const existingNotesById = new Map<string, string>();
                prev.journal.forEach((j) => {
                  if (j.port === targetPortId && String(j.id).startsWith('MT5-') && j.note) {
                    existingNotesById.set(String(j.id), j.note);
                  }
                });

                const nonMt5Rows = prev.journal.filter(
                  (j) => !(j.port === targetPortId && String(j.id).startsWith('MT5-'))
                );
                const rebuiltRows = convertMt5PositionsToJournalRows(
                  meta,
                  positions,
                  targetPortId,
                  prev.mt5GroupMode || 'IDEA',
                  prev.mt5IncludeFees !== false
                ).map((row) => {
                  const prevNote = existingNotesById.get(String(row.id));
                  return prevNote && prevNote !== row.note ? { ...row, note: prevNote } : row;
                });
                const nextJournal = [...rebuiltRows, ...nonMt5Rows];

                const nextCycleDays = syncCycleDaysWithJournal(
                  getSavedCycleDaysForPort(prev, targetPortId),
                  nextJournal,
                  targetPortId,
                );

                return {
                  ...prev,
                  accounts: nextAccounts,
                  mt5RawReports: nextRawReports,
                  journal: nextJournal,
                  activePort: targetPortId,
                  journalFilter: targetPortId,
                  cycleDays: nextCycleDays,
                };
              },
              {
                snapshotReason: `นำเข้า MT5 #${loginStr}`,
                broadcastAction: `นำเข้าไฟล์ MT5 #${loginStr}`,
              }
            );

            addToast(`Imported ${positions.length} MT5 positions for #${loginStr}.`, `นำเข้า ${positions.length} สถานะจากบัญชี MT5 #${loginStr} แล้ว`);
          } catch {
            addToast(`Could not read Excel file ${file.name}.`, `อ่านไฟล์ Excel ${file.name} ไม่ได้`);
          }
        } else {
          try {
            const text = (await file.text()).trim();
            if (!text) continue;
            if (lower.endsWith('.json')) {
              const parsed = JSON.parse(text);
              const incoming = parsed.state || parsed;
              commitWorkspaceChange(() => normalizeMergedState(incoming), {
                snapshotReason: `กู้คืนไฟล์ JSON (${file.name})`,
              });
              addToast('Workspace restored from JSON.', 'กู้คืนพื้นที่ทำงานจากไฟล์ JSON แล้ว');
            } else if (lower.endsWith('.csv')) {
              const lines = text
                .replace(/^\uFEFF/, '')
                .split(/\r?\n/)
                .filter((l) => l.trim() !== '');
              if (lines.length < 2) {
                addToast('No data found in the CSV file.', 'ไม่พบข้อมูลในไฟล์ CSV');
                continue;
              }
              const imported: TradeRecord[] = [];
              for (let i = 1; i < lines.length; i++) {
                const cols =
                  lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || lines[i].split(',');
                const clean = cols.map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
                if (clean.length >= 15) {
                  const portId = clean[1] || stateRef.current.activePort || 'port1';
                  const tp3Pts = Number(clean[10]) || 0;
                  const totalPts = Number(clean[12]) || 0;
                  let status: TradeOutcomeStatus = 'FULL_SL';
                  if (totalPts >= 2000) status = 'FULL_SWEEP';
                  else if (tp3Pts === 400 || totalPts >= 1200) status = 'TRAILING_LOCK';
                  else if (Number(clean[8]) > 0) status = 'TP1_ONLY';

                  const entryVal = parseFloat(clean[5]) || 4000;
                  const dirVal: TradeDirection = clean[4] === 'SELL' ? 'SELL' : 'BUY';
                  const isBuy = dirVal === 'BUY';

                  imported.push({
                    id: clean[0] || 'IMP-' + i,
                    port: portId,
                    date: clean[2] || getBangkokIsoDate(),
                    time: clean[3] || getBangkokTimeHHMM(),
                    dir: dirVal,
                    entry: entryVal,
                    risk: parseFloat(clean[6]) || 120,
                    lotLeg: parseFloat(clean[7]) || 0.04,
                    slPrice: +(isBuy ? entryVal - 10 : entryVal + 10).toFixed(2),
                    tp1Price: +(isBuy ? entryVal + 4 : entryVal - 4).toFixed(2),
                    tp2Price: +(isBuy ? entryVal + 8 : entryVal - 8).toFixed(2),
                    tp3Price: +(isBuy ? entryVal + 12 : entryVal - 12).toFixed(2),
                    tp1Pts: Number(clean[8]) || 0,
                    tp2Pts: Number(clean[9]) || 0,
                    tp3Pts,
                    slPts: Number(clean[11]) || 0,
                    totalPts,
                    rr: parseFloat(clean[13]) || 0,
                    pnlUsd: parseFloat(clean[14]) || 0,
                    status,
                    note: clean[15] || '',
                  });
                }
              }
              if (imported.length > 0) {
                commitWorkspaceChange(
                  (prev) => ({
                    ...prev,
                    journal: imported,
                  }),
                  { snapshotReason: `นำเข้า CSV (${imported.length} รายการ)` }
                );
                addToast(`Imported ${imported.length} CSV records.`, `นำเข้าข้อมูลจาก CSV แล้ว ${imported.length} รายการ`);
              }
            }
          } catch {
            addToast(`Could not read ${file.name}.`, `อ่านไฟล์ ${file.name} ไม่ได้`);
          }
        }
      }
    },
    [commitWorkspaceChange, addToast]
  );

  const exportFullDatabaseJSON = useCallback(() => {
    const backupPayload = {
      app: 'TREDYN_GHR_v3.2',
      exportedAt: new Date().toISOString(),
      version: '3.2',
      state: stateRef.current,
    };
    const jsonStr = JSON.stringify(backupPayload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TREDYN_GHR_Database_${getBangkokIsoDate()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    addToast('Workspace backup downloaded as JSON.', 'ดาวน์โหลดไฟล์สำรองพื้นที่ทำงาน (.JSON) แล้ว');
  }, [addToast]);

  const exportDriveArchiveCSV = useCallback(() => {
    const csv = buildTradesArchiveCsv(stateRef.current.accounts || {}, stateRef.current.journal || []);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TallyNX_Trade_Archive_${getBangkokIsoDate()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    addToast('CSV archive exported for Google Drive or Sheets.', 'ส่งออกไฟล์สำรอง CSV สำหรับ Google Drive หรือ Sheets แล้ว');
  }, [addToast]);

  const exportJournalCSV = useCallback(() => {
    const headers = [
      'ID',
      'Port',
      'Date',
      'Time',
      'Order',
      'Entry',
      'Risk_USD',
      'Lot_Per_Leg',
      'TP1_Pts',
      'TP2_Pts',
      'TP3_TL_Pts',
      'SL_Pts',
      'Total_Pts',
      'RR',
      'Net_USD',
      'Note',
    ];
    const rows = stateRef.current.journal.map((r) => [
      r.id,
      r.port,
      r.date,
      r.time,
      r.dir,
      r.entry,
      r.risk,
      r.lotLeg,
      r.tp1Pts,
      r.tp2Pts,
      r.tp3Pts,
      r.slPts,
      r.totalPts,
      r.rr,
      r.pnlUsd,
      `"${(r.note || '').replace(/"/g, '""')}"`,
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GHR_Trade_Journal_${getBangkokIsoDate()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    addToast('CSV downloaded.', 'ดาวน์โหลดไฟล์ CSV แล้ว');
  }, [addToast]);

  const printJournalPdfReport = useCallback(() => {
    setPrintRequested(true);
    if (activeNavSection !== 'journal-root') handleSwitchPage('journal-root');
  }, [activeNavSection, handleSwitchPage]);

  const printJournal = useCallback(() => {
    setPrintRequested(false);
    window.print();
  }, []);

  // Computed KPI values
  const acc = useMemo(
    () => getAccountComputed(state.accounts, state.journal, state.activePort),
    [state.accounts, state.journal, state.activePort]
  );
  const portsList = Object.keys(state.accounts || {});
  const [showAccountsDrawer, setShowAccountsDrawer] = useState(false);

  const openAccountsDrawer = useCallback(() => {
    setShowAccountsDrawer(true);
    commitWorkspaceChange((prev) => ({
      ...prev,
      showDbManager: false,
      showHelpGuide: false,
      showLicenseModal: false,
    }));
  }, [commitWorkspaceChange]);

  const handleOpenMallDefault = useCallback(() => openMall(), [openMall]);
  const handleOpenSettings = useCallback(() => {
    setShowAccountsDrawer(false);
    handleSwitchPage('sec-settings');
  }, [handleSwitchPage]);
  const handleOpenMt5SyncModal = useCallback(() => {
    commitWorkspaceChange((prev) => ({ ...prev, showMt5Importer: true }));
  }, [commitWorkspaceChange]);
  const handleOpenCalcPage = useCallback(() => handleSwitchPage('sec-calc'), [handleSwitchPage]);
  const handleOpenPropRulesPage = useCallback(() => handleSwitchPage('sec-proprules'), [handleSwitchPage]);
  const handleInspectDateInJournal = useCallback(
    (isoDate: string) => {
      commitWorkspaceChange((prev) => ({
        ...prev,
        journalFilter: prev.activePort,
        journalStatusFilter: 'ALL',
        journalDateFilter: 'ALL',
        journalSessionFilter: 'ALL',
        journalSearch: isoDate,
      }));
      handleSwitchPage('journal-root');
    },
    [commitWorkspaceChange, handleSwitchPage]
  );

  const handleSelectPort = useCallback(
    (pid: string) => {
      commitWorkspaceChange(
        (prev) => ({
          ...prev,
          activePort: pid,
          journalFilter: pid,
          calcRisk: prev.accounts[pid]?.defaultRisk || prev.calcRisk,
        }),
        { broadcastAction: `สลับไปยัง ${state.accounts[pid]?.name || pid}` }
      );
    },
    [commitWorkspaceChange, state.accounts]
  );

  const handleSavePort = useCallback(
    (portData: Omit<AccountInfo, 'id'>, editingId: string | null) => {
      commitWorkspaceChange(
        (prev) => {
          const nextAccounts = { ...prev.accounts };
          if (editingId && nextAccounts[editingId]) {
            const existing = nextAccounts[editingId];
            const login = portData.login || existing.login;
            const name = portData.name || existing.name;
            const nextType = portData.accountType || existing.accountType || 'PROP';
            nextAccounts[editingId] = {
              ...existing,
              id: editingId,
              login,
              name,
              accountType: nextType,
              brokerName: portData.brokerName ?? existing.brokerName ?? '',
              brokerServer: portData.brokerServer ?? existing.brokerServer ?? '',
              syncProvider: portData.syncProvider ?? existing.syncProvider ?? 'MANUAL_XLSX',
              metaApiAccountId: portData.metaApiAccountId ?? existing.metaApiAccountId,
              bridgeUrl: portData.bridgeUrl ?? existing.bridgeUrl,
              investorLabel: portData.investorLabel ?? existing.investorLabel,
              lastMt5SyncAt: portData.lastMt5SyncAt ?? existing.lastMt5SyncAt,
              initial: portData.initial,
              targetProfit: portData.targetProfit,
              minDays: portData.minDays,
              defaultRisk: portData.defaultRisk,
              consistencyCapPct:
                portData.consistencyCapPct ??
                existing.consistencyCapPct ??
                (nextType === 'PERSONAL' ? 100 : 40),
              profitSplitPct:
                portData.profitSplitPct ??
                existing.profitSplitPct ??
                (nextType === 'PERSONAL' ? 100 : 90),
              feeRefundUsd:
                portData.feeRefundUsd ??
                existing.feeRefundUsd ??
                (nextType === 'PERSONAL' ? 0 : 59),
            };
            return {
              ...prev,
              accounts: nextAccounts,
              editingPortId: null,
              showAddPortForm: false,
              calcRisk: prev.activePort === editingId ? portData.defaultRisk : prev.calcRisk,
            };
          } else {
            const portCount = Object.keys(nextAccounts).length + 1;
            const pid = 'port_' + Date.now().toString().slice(-6);
            const login = portData.login || 'P' + portCount;
            const name = portData.name || `พอร์ต ${portCount} · #${login}`;
            const nextType = portData.accountType || 'PROP';
            nextAccounts[pid] = {
              id: pid,
              login,
              name,
              accountType: nextType,
              brokerName: portData.brokerName || '',
              brokerServer: portData.brokerServer || '',
              syncProvider: portData.syncProvider || 'MANUAL_XLSX',
              metaApiAccountId: portData.metaApiAccountId,
              bridgeUrl: portData.bridgeUrl,
              investorLabel: portData.investorLabel,
              initial: portData.initial,
              targetProfit: portData.targetProfit,
              minDays: portData.minDays,
              defaultRisk: portData.defaultRisk,
              consistencyCapPct:
                portData.consistencyCapPct ?? (nextType === 'PERSONAL' ? 100 : 40),
              profitSplitPct:
                portData.profitSplitPct ?? (nextType === 'PERSONAL' ? 100 : 90),
              feeRefundUsd:
                portData.feeRefundUsd ?? (nextType === 'PERSONAL' ? 0 : 59),
            };
            return {
              ...prev,
              accounts: nextAccounts,
              activePort: pid,
              journalFilter: pid,
              calcRisk: portData.defaultRisk,
              showAddPortForm: false,
              editingPortId: null,
            };
          }
        },
        {
          snapshotReason: editingId ? 'แก้ไขพอร์ต' : 'เพิ่มพอร์ตใหม่',
        }
      );
      setShowAccountsDrawer(false);
      if (editingId) addToast('Account updated.', 'อัปเดตพอร์ตแล้ว');
      else addToast('Account added.', 'เพิ่มพอร์ตแล้ว');
    },
    [commitWorkspaceChange, addToast]
  );

  const handleSyncMt5ReadOnly = useCallback(
    async (
      params: Mt5ReadOnlySyncRequest
    ): Promise<{ ok: boolean; message: string }> => {
      if (params.provider === 'FUNDEDNEXT_MCP') {
        return { ok: false, message: 'Reconnect FundedNext through the pilot connection flow.' };
      }
      const targetAcc = stateRef.current.accounts[params.portId];
      if (!targetAcc) {
        return { ok: false, message: 'ไม่พบพอร์ตเป้าหมายสำหรับซิงก์ MT5' };
      }

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (currentUser) {
          const idToken = await currentUser.getIdToken().catch(() => '');
          if (idToken) {
            headers['Authorization'] = `Bearer ${idToken}`;
          }
        }

        const resp = await fetch('/api/mt5/sync-readonly', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            provider: params.provider,
            accountId: params.metaApiAccountId || targetAcc.metaApiAccountId || '',
            bridgeUrl: params.bridgeUrl,
            token: params.token.trim(),
            tredynApiKey: params.tredynApiKey || targetAcc.tredynApiKey || '',
            brokerName: params.brokerName || targetAcc.brokerName || '',
            brokerServer: params.brokerServer,
            login: params.login || targetAcc.login,
            investorPassword: params.investorPassword || '',
            email: params.email || '',
            password: params.password || '',
            externalAccountRef: params.externalAccountRef || targetAcc.externalAccountRef || '',
            accountName: targetAcc.name,
            lookbackDays: params.lookbackDays,
            mt5TimeOffset: normalizeMt5TimeOffsetSetting(stateRef.current.mt5TimeOffset),
          }),
        });
        const payload = (await resp.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          syncedAt?: string;
          meta?: Mt5ReportMeta & { server?: string; metaApiAccountId?: string };
          positions?: Mt5PositionRecord[];
          skippedCount?: number;
        };

        if (!resp.ok || !payload.ok) {
          const errMsg = payload.error || `ไม่สามารถซิงก์ข้อมูลได้ (HTTP ${resp.status})`;
          if (!params.silent) {
            addToast(formatMt5SyncMessage(errMsg, 'en'), errMsg);
          }
          return { ok: false, message: errMsg };
        }

        const rawPositions = Array.isArray(payload.positions) ? payload.positions : [];
        const currentMt5Offset = normalizeMt5TimeOffsetSetting(stateRef.current.mt5TimeOffset);
        const positions = reapplyMt5TimezoneToPositions(rawPositions, currentMt5Offset);
        const syncedAt = payload.syncedAt || new Date().toISOString();
        const normalizedMeta: Mt5ReportMeta = {
          holderName: payload.meta?.holderName || targetAcc.name || 'MT5 Trader',
          login: payload.meta?.login || params.login || targetAcc.login,
          broker:
            params.brokerName ||
            payload.meta?.broker ||
            targetAcc.brokerName ||
            'MT5 Read-Only',
          currency: payload.meta?.currency || 'USD',
          initialDeposit:
            Number(payload.meta?.initialDeposit) >= 100
              ? Number(payload.meta?.initialDeposit)
              : targetAcc.initial,
          summaryNetProfit:
            payload.meta?.summaryNetProfit !== undefined ? payload.meta.summaryNetProfit : null,
        };

        let rebuiltCount = 0;
        let prevMt5Count = 0;

        commitWorkspaceChange(
          (prev) => {
            const nextAccounts = { ...prev.accounts };
            const existing = nextAccounts[params.portId];
            if (existing) {
              nextAccounts[params.portId] = {
                ...existing,
                login: normalizedMeta.login || existing.login,
                brokerName: params.brokerName || existing.brokerName || normalizedMeta.broker,
                brokerServer:
                  params.brokerServer || payload.meta?.server || existing.brokerServer || '',
                syncProvider: params.provider,
                tredynApiKey: params.tredynApiKey || existing.tredynApiKey,
                autoSyncRealtime: params.autoSyncRealtime ?? existing.autoSyncRealtime,
                metaApiAccountId:
                  payload.meta?.metaApiAccountId ||
                  (params.provider === 'METAAPI_CLOUD'
                    ? params.metaApiAccountId
                    : existing.metaApiAccountId),
                bridgeUrl:
                  params.provider === 'BRIDGE_API' || params.bridgeUrl
                    ? params.bridgeUrl
                    : existing.bridgeUrl,
                externalAccountRef:
                  params.externalAccountRef || existing.externalAccountRef,
                lastMt5SyncAt: syncedAt,
              };
            }

            if (positions.length === 0) {
              return {
                ...prev,
                accounts: nextAccounts,
              };
            }

            const nextRawReports = {
              ...prev.mt5RawReports,
              [params.portId]: {
                meta: normalizedMeta,
                positions,
                importedAt: syncedAt,
              },
            };

            const existingNotesById = new Map<string, string>();
            prev.journal.forEach((j) => {
              if (j.port === params.portId && String(j.id).startsWith('MT5-')) {
                prevMt5Count++;
                if (j.note) {
                  existingNotesById.set(String(j.id), j.note);
                }
              }
            });

            const nonMt5Rows = prev.journal.filter(
              (j) => !(j.port === params.portId && String(j.id).startsWith('MT5-'))
            );
            const rebuiltRows = convertMt5PositionsToJournalRows(
              normalizedMeta,
              positions,
              params.portId,
              prev.mt5GroupMode || 'IDEA',
              prev.mt5IncludeFees !== false
            ).map((row) => {
              const prevNote = existingNotesById.get(String(row.id));
              return prevNote && prevNote !== row.note ? { ...row, note: prevNote } : row;
            });
            rebuiltCount = rebuiltRows.length;
            const nextJournal = [...rebuiltRows, ...nonMt5Rows];

            const nextCycleDays = syncCycleDaysWithJournal(
              getSavedCycleDaysForPort(prev, params.portId),
              nextJournal,
              params.portId,
            );

            return {
              ...prev,
              accounts: nextAccounts,
              mt5RawReports: nextRawReports,
              journal: nextJournal,
              activePort: params.portId,
              journalFilter: params.portId,
              cycleDays: nextCycleDays,
            };
          },
          {
            snapshotReason: `MT5 Read-Only Sync #${normalizedMeta.login}`,
            broadcastAction: `ซิงก์ MT5 Read-Only #${normalizedMeta.login}`,
          }
        );

        const successMsg =
          positions.length === 0
            ? `เชื่อมต่อ #${normalizedMeta.login || 'FundedNext'} สำเร็จ (ยังไม่พบออเดอร์ที่ปิดแล้วในช่วง ${params.lookbackDays} วัน)`
            : `ซิงก์ #${normalizedMeta.login || 'FundedNext'} สำเร็จ: ดึง ${positions.length} โพซิชั่น → รวมเป็น ${rebuiltCount} รายการใน Journal`;
        if (!params.silent || rebuiltCount > prevMt5Count) {
          addToast(formatMt5SyncMessage(successMsg, 'en'), successMsg);
        }
        return { ok: true, message: successMsg };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดระหว่างเชื่อมต่อ MT5 Read-Only';
        if (!params.silent) {
          addToast(formatMt5SyncMessage(msg, 'en'), msg);
        }
        return { ok: false, message: msg };
      }
    },
    [currentUser, commitWorkspaceChange, addToast]
  );

  const firebaseUid = currentUser?.uid || null;
  const getPilotIdToken = useCallback(async () => {
    return currentUser ? await currentUser.getIdToken().catch(() => null) : null;
  }, [currentUser]);

  useEffect(() => () => pilotOAuthRef.current?.abort(), [firebaseUid]);

  const handleConnectPilot = useCallback(async (portId: string, connectionId?: string) => {
    if (!firebaseUid || activeUidRef.current !== firebaseUid) throw new Error('กรุณาเข้าสู่ระบบ Desk');
    if (pilotOAuthRef.current) throw new Error('มีหน้าต่างเชื่อมต่อ FundedNext เปิดอยู่แล้ว');
    const controller = new AbortController();
    pilotOAuthRef.current = controller;
    setPilotOAuthPort(portId);
    try {
      const result = await connectFundedNextPilot(getPilotIdToken, connectionId, controller.signal);
      if (controller.signal.aborted || activeUidRef.current !== firebaseUid) return;
      await commitWorkspaceChange(prev => {
        const port = prev.accounts[portId];
        if (!port) return prev;
        const sameConnection = port.fundedNextConnectionId === result.connectionId;
        return {
          ...prev,
          accounts: {
            ...prev.accounts,
            [portId]: {
              ...port,
              fundedNextConnectionId: result.connectionId,
              fundedNextAccountId: sameConnection ? port.fundedNextAccountId : undefined,
              autoSyncRealtime: port.syncProvider === 'FUNDEDNEXT_MCP' && !sameConnection ? false : port.autoSyncRealtime,
            },
          },
        };
      });
      setPilotFeeds(prev => {
        const next = { ...prev };
        delete next[portId];
        return next;
      });
      delete ingestedPilotSigRef.current[portId];
      return result;
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    } finally {
      pilotOAuthRef.current = null;
      setPilotOAuthPort(null);
    }
  }, [firebaseUid, getPilotIdToken, commitWorkspaceChange]);

  const cancelPilotOAuth = useCallback(() => pilotOAuthRef.current?.abort(), []);

  const updatePilotPorts = useCallback(async (uid: string, change: PilotPortChange) => {
    if (activeUidRef.current !== uid) return;
    await commitWorkspaceChange(prev => {
      if (activeUidRef.current !== uid) return prev;
      if (change.type === 'discover') {
        const planned = planPilotPortAssignments(prev.accounts, change.accounts);
        if (!planned.changed) return prev;
        return { ...prev, accounts: planned.nextAccounts };
      }
      if (change.type === 'stop') {
        const accounts = Object.fromEntries(Object.entries(prev.accounts).map(([id, account]) => [
          id,
          account.syncProvider === 'FUNDEDNEXT_MCP' &&
          ((change.accountId && account.fundedNextAccountId === change.accountId) ||
            (change.connectionId && account.fundedNextConnectionId === change.connectionId))
            ? { ...account, autoSyncRealtime: false }
            : account,
        ]));
        return { ...prev, accounts };
      }
      let portId = change.portId;
      if (change.type === 'select') {
        const boundPort = Object.entries(prev.accounts).find(([, account]) => account.fundedNextAccountId === change.account.id);
        if (boundPort) {
          portId = boundPort[0];
        } else {
          const planned = planPilotPortAssignments(prev.accounts, [change.account]);
          if (change.createNewPort || planned.addedPortIds.length > 0) {
            const nextActivePid = planned.addedPortIds[0] ??
              Object.keys(planned.nextAccounts).find(pid => planned.nextAccounts[pid].fundedNextAccountId === change.account.id) ??
              change.portId;
            return {
              ...prev,
              accounts: planned.nextAccounts,
              activePort: nextActivePid,
              journalFilter: nextActivePid,
            };
          }
        }
      }
      const port = prev.accounts[portId];
      if (!port) return prev;
      const next = change.type === 'select' ? {
        ...port,
        syncProvider: 'FUNDEDNEXT_MCP' as const,
        fundedNextConnectionId: change.account.connectionId,
        fundedNextAccountId: change.account.id,
        login: change.account.login || port.login,
        brokerName: port.brokerName || 'FundedNext Official MCP',
        autoSyncRealtime: true,
      } : { ...port, autoSyncRealtime: change.enabled };
      return {
        ...prev,
        ...(portId !== change.portId ? { activePort: portId, journalFilter: portId } : {}),
        accounts: { ...prev.accounts, [portId]: next },
      };
    });
  }, [commitWorkspaceChange]);

  const reconcilePilotExecutionsIntoWorkspace = useCallback(({ uid, portId, accountId, data }: {
    uid: string; portId: string; accountId: string; data: PilotRead;
  }) => {
    const curState = stateRef.current;
    if (activeUidRef.current !== uid || curState.accounts[portId]?.fundedNextAccountId !== accountId) return;
    if (data.syncStatus === 'SYNCING' || data.hasMoreExecutions) return;
    const mt5TimeOffset = normalizeMt5TimeOffsetSetting(curState.mt5TimeOffset);
    const groupMode = curState.mt5GroupMode || 'IDEA';
    const includeFees = curState.mt5IncludeFees !== false;
    const snapInitial = Number(data.snapshot?.initialBalance);
    const syncedAt = data.snapshot?.fetchedAt || data.snapshot?.lastCheckedAt || new Date().toISOString();
    const nextSig = JSON.stringify([
      uid,
      accountId,
      data.executions.map(e => `${e.id}:${e.digest}`).sort().join('|'),
      data.snapshot?.balance,
      data.snapshot?.netProfit,
      data.snapshot?.currency,
      data.snapshot?.initialBalance,
      groupMode,
      includeFees,
      mt5TimeOffset,
    ]);
    if (ingestedPilotSigRef.current[portId] === nextSig) return;

    const positions = convertPilotExecutionsToPositions(data.executions, mt5TimeOffset);

    return commitWorkspaceChange(prev => {
      const target = prev.accounts[portId];
      if (activeUidRef.current !== uid || target?.fundedNextAccountId !== accountId) return prev;
      const resolvedInitial =
        Number.isFinite(snapInitial) && snapInitial >= 100 ? snapInitial : target.initial;
      const nextAccounts: Record<string, AccountInfo> = {
        ...prev.accounts,
        [portId]: {
          ...target,
          initial: resolvedInitial,
          brokerName: target.brokerName || 'FundedNext Official MCP',
          lastMt5SyncAt: syncedAt,
        },
      };
      if (positions.length === 0) {
        ingestedPilotSigRef.current[portId] = nextSig;
        return { ...prev, accounts: nextAccounts };
      }

      const normalizedMeta: Mt5ReportMeta = {
        holderName: target.name || 'FundedNext Trader',
        login: target.login || portId,
        broker: target.brokerName || 'FundedNext Official MCP',
        currency: data.snapshot?.currency || 'USD',
        initialDeposit: resolvedInitial,
        summaryNetProfit:
          data.snapshot?.netProfit != null && Number.isFinite(Number(data.snapshot.netProfit))
            ? Number(data.snapshot.netProfit)
            : null,
      };
      const nextRawReports = {
        ...prev.mt5RawReports,
        [portId]: { meta: normalizedMeta, positions, importedAt: syncedAt },
      };

      const existingNotesById = new Map<string, string>();
      prev.journal.forEach(j => {
        if (j.port === portId && String(j.id).startsWith('MT5-') && j.note) {
          existingNotesById.set(String(j.id), j.note);
        }
      });
      const nonMt5Rows = prev.journal.filter(
        j => !(j.port === portId && String(j.id).startsWith('MT5-'))
      );
      const rebuiltRows = convertMt5PositionsToJournalRows(
        normalizedMeta,
        positions,
        portId,
        prev.mt5GroupMode || 'IDEA',
        prev.mt5IncludeFees !== false
      ).map(row => {
        const prevNote = existingNotesById.get(String(row.id));
        return prevNote && prevNote !== row.note ? { ...row, note: prevNote } : row;
      });
      const nextJournal = [...rebuiltRows, ...nonMt5Rows];

      const nextCycleDays = portId === prev.activePort
        ? syncCycleDaysWithJournal(prev.cycleDays, nextJournal, portId)
        : prev.cycleDays;

      ingestedPilotSigRef.current[portId] = nextSig;
      return {
        ...prev,
        accounts: nextAccounts,
        mt5RawReports: nextRawReports,
        journal: nextJournal,
        cycleDays: nextCycleDays,
      };
    });
  }, [commitWorkspaceChange]);

  useEffect(() => {
    if (!firebaseUid) return;
    const controller = new AbortController();
    void listPilotAccounts(getPilotIdToken, undefined, controller.signal)
      .then(result => {
        if (!controller.signal.aborted && activeUidRef.current === firebaseUid && result.accounts.length > 0) {
          void updatePilotPorts(firebaseUid, { type: 'discover', accounts: result.accounts });
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [firebaseUid, getPilotIdToken, updatePilotPorts]);

  const pilotPollTargets = useMemo(() => {
    return Object.entries(state.accounts || {})
      .filter(
        ([portId, acc]) =>
          acc.syncProvider === 'FUNDEDNEXT_MCP' &&
          acc.autoSyncRealtime === true &&
          Boolean(acc.fundedNextAccountId) &&
          pilotOAuthPort !== portId
      )
      .map(([portId, acc]) => ({ portId, accountId: acc.fundedNextAccountId as string }))
      .sort((a, b) => a.portId.localeCompare(b.portId));
  }, [state.accounts, pilotOAuthPort]);

  const pilotPollTargetsKey = pilotPollTargets.map(t => `${t.portId}:${t.accountId}`).join('|');

  const activePort = state.accounts[state.activePort];
  const activeIsPilot = activePort?.syncProvider === 'FUNDEDNEXT_MCP';
  const activePilotAccountId = activeIsPilot ? activePort.fundedNextAccountId : undefined;
  const activePilotAutoSync = activeIsPilot && activePort.autoSyncRealtime === true;
  const activePilotCandidate = activeIsPilot ? pilotFeeds[state.activePort] : undefined;
  const activePilotFeed =
    activePilotAutoSync &&
    activePilotCandidate?.uid === firebaseUid &&
    activePilotCandidate.portId === state.activePort &&
    activePilotCandidate.accountId === activePilotAccountId
      ? activePilotCandidate
      : null;

  useEffect(() => {
    if (!firebaseUid || pilotPollTargets.length === 0) return;
    const controller = new AbortController();
    let busy = false;
    const blockedReconnect = new Set<string>();
    const nextPollAtByPort = new Map<string, number>();
    const errorStreakByPort = new Map<string, number>();
    const INACTIVE_POLL_MS = 60_000;
    const MAX_BACKOFF_MS = 300_000;

    const poll = async (forceActive = false) => {
      if (busy || controller.signal.aborted || document.visibilityState !== 'visible') return;
      const now = Date.now();
      const dueTargets = pilotPollTargets.filter(({ portId }) => {
        if (blockedReconnect.has(portId)) return false;
        if (live3sHandlesActivePilotRef.current && portId === activePortRef.current) return false;
        if (forceActive && portId === activePortRef.current && (errorStreakByPort.get(portId) ?? 0) === 0) return true;
        return (nextPollAtByPort.get(portId) ?? 0) <= now;
      });
      if (dueTargets.length === 0) return;
      busy = true;
      try {
        await Promise.allSettled(
          dueTargets.map(async ({ portId, accountId }) => {
            if (blockedReconnect.has(portId) || controller.signal.aborted) return;
            const scope = { uid: firebaseUid, portId, accountId };
            const currentFeed = pilotFeedsRef.current[portId];
            const previousData =
              currentFeed &&
              currentFeed.uid === scope.uid &&
              currentFeed.portId === scope.portId &&
              currentFeed.accountId === scope.accountId
                ? currentFeed.data
                : null;
            try {
              const data = await readPilotAccount(getPilotIdToken, accountId, controller.signal, {
                previous: previousData,
              });
              if (!controller.signal.aborted && activeUidRef.current === firebaseUid) {
                errorStreakByPort.set(portId, 0);
                const interval = portId === activePortRef.current ? FUNDEDNEXT_POLL_MS : INACTIVE_POLL_MS;
                nextPollAtByPort.set(portId, Date.now() + interval);
                if (data.snapshot) {
                  saveCachedPilotSnapshot(scope.uid, scope.portId, scope.accountId, data.snapshot);
                }
                setPilotFeeds(prev => ({ ...prev, [portId]: { ...scope, data, error: null, reconnect: false } }));
                await reconcilePilotExecutionsIntoWorkspace({ ...scope, data });
              }
            } catch (error) {
              if (controller.signal.aborted || activeUidRef.current !== firebaseUid) return;
              const isRec = isPilotReconnect(error);
              if (isRec) blockedReconnect.add(portId);
              const streak = Math.min((errorStreakByPort.get(portId) ?? 0) + 1, 5);
              errorStreakByPort.set(portId, streak);
              const backoff = Math.min(MAX_BACKOFF_MS, FUNDEDNEXT_POLL_MS * 2 ** streak);
              nextPollAtByPort.set(portId, Date.now() + backoff);
              setPilotFeeds(prev => {
                const previous = prev[portId];
                return {
                  ...prev,
                  [portId]: {
                    ...scope,
                    reconnect: isRec,
                    data:
                      !isRec &&
                      previous?.uid === scope.uid &&
                      previous.portId === scope.portId &&
                      previous.accountId === scope.accountId
                        ? previous.data
                        : null,
                    error: error instanceof Error ? error.message : 'FundedNext Pilot is temporarily unavailable',
                  },
                };
              });
            }
          })
        );
      } finally {
        busy = false;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void poll(true);
    };
    triggerActivePilotPollRef.current = () => void poll(true);
    void poll(true);
    const timer = window.setInterval(() => void poll(false), FUNDEDNEXT_POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      triggerActivePilotPollRef.current = null;
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [firebaseUid, pilotPollTargetsKey, getPilotIdToken, reconcilePilotExecutionsIntoWorkspace]);

  useEffect(() => {
    triggerActivePilotPollRef.current?.();
  }, [state.activePort]);

  const activeBridgeKey = activePort?.syncProvider === 'LIVE_BRIDGE' ? (activePort.tredynApiKey || '').trim() : '';

  useEffect(() => {
    const portId = state.activePort;
    const provider = activePort?.syncProvider;
    const isPilotLive =
      provider === 'FUNDEDNEXT_MCP' &&
      Boolean(firebaseUid) &&
      Boolean(activePilotAccountId) &&
      pilotOAuthPort !== portId;
    const isBridgeLive = provider === 'LIVE_BRIDGE' && Boolean(activeBridgeKey);
    const canAutoPoll =
      isOnline &&
      !liveMonitorPaused &&
      ((isPilotLive && activePilotAutoSync) || isBridgeLive);

    live3sHandlesActivePilotRef.current = Boolean(canAutoPoll && isPilotLive);

    if (!isPilotLive && !isBridgeLive) {
      triggerLive3sPollRef.current = null;
      return;
    }

    const controller = new AbortController();
    let inFlight = false;

    const appendSeriesPoint = (
      balanceVal: number,
      equityVal: number,
      floatingVal: number,
      openCount: number,
      dailyLimitOverride: number | null,
      dailyUsedOverride: number | null
    ) => {
      const curState = stateRef.current;
      const targetPort = curState.accounts?.[portId];
      const todayIso = getBangkokIsoDate();
      const todayRealized = (curState.journal || [])
        .filter((item) => item.port === portId && item.date === todayIso)
        .reduce((sum, item) => sum + (Number(item.pnlUsd) || 0), 0);
      const initialCap = Math.max(100, Number(targetPort?.initial || 10000));
      const dailyLimit =
        dailyLimitOverride != null && Number.isFinite(dailyLimitOverride) && dailyLimitOverride > 0
          ? dailyLimitOverride
          : +(initialCap * 0.05).toFixed(2);
      const metricsForFloor = computeLivePositionMetrics(
        [],
        balanceVal,
        equityVal,
        dailyLimit,
        0,
        0,
        40,
        {
          todayRealizedProfitUsd: todayRealized,
          dailyLossUsedUsd: dailyUsedOverride,
        }
      );
      const ts = Date.now();
      setLiveTelemetrySeriesByPort((prev) => ({
        ...prev,
        [portId]: appendLiveTelemetryPoint(prev[portId] ?? [], {
          ts,
          timeLabel: formatTelemetryTimeLabel(ts, 'Asia/Bangkok'),
          balance: balanceVal,
          equity: equityVal,
          floatingPnl: floatingVal,
          dailyFloorBalance: metricsForFloor.summary.dailyFloorBalance,
          openPositionsCount: openCount,
        }),
      }));
    };

    const pollLiveNow = async (force = false) => {
      if (controller.signal.aborted || !isOnline || inFlight) return;
      if (!force && (liveMonitorPausedRef.current || document.visibilityState !== 'visible')) return;
      if (!force && isPilotLive && !activePilotAutoSync) return;

      inFlight = true;
      setLiveSyncMetaByPort((prev) => ({
        ...prev,
        [portId]: {
          syncing: true,
          lastSyncAt: prev[portId]?.lastSyncAt ?? null,
          latencyMs: prev[portId]?.latencyMs ?? null,
          nextPollAt: prev[portId]?.nextPollAt ?? null,
          error: prev[portId]?.error ?? null,
        },
      }));

      const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      try {
        if (isPilotLive && firebaseUid && activePilotAccountId) {
          const currentFeed = pilotFeedsRef.current[portId];
          const previousData =
            currentFeed &&
            currentFeed.uid === firebaseUid &&
            currentFeed.portId === portId &&
            currentFeed.accountId === activePilotAccountId
              ? currentFeed.data
              : null;
          const data = await readPilotLiveSnapshot(getPilotIdToken, activePilotAccountId, controller.signal, {
            previous: previousData,
            requireVisible: !force,
          });
          if (!data || controller.signal.aborted || activeUidRef.current !== firebaseUid) return;
          const elapsedMs = Math.max(
            1,
            Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt)
          );
          const scope = { uid: firebaseUid, portId, accountId: activePilotAccountId };
          if (data.snapshot) {
            saveCachedPilotSnapshot(scope.uid, scope.portId, scope.accountId, data.snapshot);
          }
          setPilotFeeds((prev) => ({ ...prev, [portId]: { ...scope, data, error: null, reconnect: false } }));
          void reconcilePilotExecutionsIntoWorkspace({ ...scope, data });

          const live = data.liveTelemetry;
          const snap = data.snapshot;
          const rawBal = live?.balance ?? (snap?.balance != null ? Number(snap.balance) : null);
          const rawEq = live?.equity ?? (snap?.equity != null ? Number(snap.equity) : rawBal);
          const rawFloat = live?.floatingPnl ?? (snap?.floatingPnl != null ? Number(snap.floatingPnl) : null);
          const openPos = live?.openPositions ?? snap?.openPositions ?? [];
          if (rawBal != null && Number.isFinite(rawBal)) {
            const safeEq = rawEq != null && Number.isFinite(rawEq) ? rawEq : rawBal;
            const safeFloat = rawFloat != null && Number.isFinite(rawFloat) ? rawFloat : safeEq - rawBal;
            appendSeriesPoint(
              rawBal,
              safeEq,
              safeFloat,
              openPos.length,
              live?.dailyLossLimitUsd ?? null,
              live?.dailyLossUsedUsd ?? null
            );
          }

          const syncAt = snap?.lastCheckedAt || snap?.fetchedAt || new Date().toISOString();
          const nextDelay = live?.rateFloorMs && live.rateFloorMs > LIVE_TELEMETRY_POLL_MS
            ? live.rateFloorMs
            : LIVE_TELEMETRY_POLL_MS;
          setLiveSyncMetaByPort((prev) => ({
            ...prev,
            [portId]: {
              syncing: false,
              lastSyncAt: syncAt,
              latencyMs: elapsedMs,
              nextPollAt: canAutoPoll ? Date.now() + nextDelay : null,
              error: snap?.blockedReason ?? null,
            },
          }));
        } else if (isBridgeLive) {
          const idToken = await getPilotIdToken();
          const res = await readLiveBridgeTelemetry(
            { tredynApiKey: activeBridgeKey, idToken, requireVisible: !force },
            controller.signal
          );
          if (!res || controller.signal.aborted) return;
          const elapsedMs = Math.max(
            1,
            Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt)
          );
          setLiveBridgeByPort((prev) => ({ ...prev, [portId]: res }));
          if (res.live.floatingPnl != null && Number.isFinite(res.live.floatingPnl)) {
            setFloatingPnlUsd(Number(res.live.floatingPnl));
          }
          const fallbackBal = Number(stateRef.current.accounts?.[portId]?.initial || 0);
          const rawBal = res.live.balance ?? fallbackBal;
          const rawEq = res.live.equity ?? rawBal + Number(res.live.floatingPnl ?? 0);
          const rawFloat = res.live.floatingPnl ?? rawEq - rawBal;
          if (Number.isFinite(rawBal)) {
            appendSeriesPoint(
              rawBal,
              Number.isFinite(rawEq) ? rawEq : rawBal,
              Number.isFinite(rawFloat) ? rawFloat : 0,
              res.live.openPositions?.length ?? res.openPositions?.length ?? 0,
              res.live.dailyLossLimitUsd ?? null,
              res.live.dailyLossUsedUsd ?? null
            );
          }
          setLiveSyncMetaByPort((prev) => ({
            ...prev,
            [portId]: {
              syncing: false,
              lastSyncAt: res.syncedAt || new Date().toISOString(),
              latencyMs: elapsedMs,
              nextPollAt: canAutoPoll ? Date.now() + LIVE_TELEMETRY_POLL_MS : null,
              error: null,
            },
          }));
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        const msg = error instanceof Error ? error.message : 'Live telemetry sync error';
        if (isPilotLive && isPilotReconnect(error) && firebaseUid && activePilotAccountId) {
          setPilotFeeds((prev) => ({
            ...prev,
            [portId]: {
              uid: firebaseUid,
              portId,
              accountId: activePilotAccountId,
              data: prev[portId]?.data ?? null,
              error: msg,
              reconnect: true,
            },
          }));
        }
        setLiveSyncMetaByPort((prev) => ({
          ...prev,
          [portId]: {
            syncing: false,
            lastSyncAt: prev[portId]?.lastSyncAt ?? null,
            latencyMs: prev[portId]?.latencyMs ?? null,
            nextPollAt: canAutoPoll ? Date.now() + LIVE_TELEMETRY_POLL_MS : null,
            error: msg,
          },
        }));
      } finally {
        inFlight = false;
      }
    };

    const onVisible = () => {
      const visible = document.visibilityState === 'visible';
      setLiveTabVisible(visible);
      if (visible && canAutoPoll) {
        void pollLiveNow(false);
      }
    };

    triggerLive3sPollRef.current = () => {
      void pollLiveNow(true);
    };

    if (canAutoPoll && document.visibilityState === 'visible') {
      void pollLiveNow(false);
    }

    const timer = canAutoPoll
      ? window.setInterval(() => void pollLiveNow(false), LIVE_TELEMETRY_POLL_MS)
      : null;
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      live3sHandlesActivePilotRef.current = false;
      triggerLive3sPollRef.current = null;
      controller.abort();
      if (timer !== null) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [
    state.activePort,
    activePort?.syncProvider,
    activePilotAccountId,
    activePilotAutoSync,
    activeBridgeKey,
    firebaseUid,
    isOnline,
    liveMonitorPaused,
    pilotOAuthPort,
    getPilotIdToken,
    reconcilePilotExecutionsIntoWorkspace,
  ]);

  const cachedPilotSnapshotsByPort = useMemo(() => {
    const out: Record<string, PilotTelemetryView> = {};
    if (!firebaseUid) return out;
    for (const [portId, accCfg] of Object.entries(state.accounts || {})) {
      if (accCfg.syncProvider !== 'FUNDEDNEXT_MCP' || !accCfg.fundedNextAccountId) continue;
      const cached = loadCachedPilotSnapshot(firebaseUid, portId, accCfg.fundedNextAccountId);
      if (cached) out[portId] = cached;
    }
    return out;
  }, [firebaseUid, state.accounts, pilotFeeds]);

  const pilotBalancesByPortString = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [portId, accCfg] of Object.entries(state.accounts || {})) {
      if (accCfg.syncProvider !== 'FUNDEDNEXT_MCP' || !accCfg.fundedNextAccountId) continue;
      const feed = pilotFeeds[portId];
      const liveSnap =
        feed && feed.uid === firebaseUid && feed.accountId === accCfg.fundedNextAccountId ? feed.data?.snapshot : null;
      const snap = liveSnap ?? cachedPilotSnapshotsByPort[portId];
      if (snap && snap.balance != null) {
        out[portId] = formatPilotAmount(snap.balance, snap.currency);
      }
    }
    return out;
  }, [pilotFeeds, cachedPilotSnapshotsByPort, firebaseUid, state.accounts]);

  const pilotBalancesByPortNumeric = useMemo(() => {
    const out: Record<string, PilotPortStats> = {};
    for (const [portId, accCfg] of Object.entries(state.accounts || {})) {
      if (accCfg.syncProvider !== 'FUNDEDNEXT_MCP' || !accCfg.fundedNextAccountId) continue;
      const feed = pilotFeeds[portId];
      const liveSnap =
        feed && feed.uid === firebaseUid && feed.accountId === accCfg.fundedNextAccountId ? feed.data?.snapshot : null;
      const snap = liveSnap ?? cachedPilotSnapshotsByPort[portId];
      if (snap && snap.balance != null && Number.isFinite(Number(snap.balance))) {
        out[portId] = {
          balance: Number(snap.balance),
          profit: snap.netProfit != null && Number.isFinite(Number(snap.netProfit)) ? Number(snap.netProfit) : undefined,
          currency: snap.currency,
        };
      }
    }
    return out;
  }, [pilotFeeds, cachedPilotSnapshotsByPort, firebaseUid, state.accounts]);

  const pilotSnapshot = activePilotFeed?.data?.snapshot;
  const cachedActivePilotSnapshot = activeIsPilot ? cachedPilotSnapshotsByPort[state.activePort] ?? null : null;
  const effectivePilotSnapshot: PilotTelemetryView | null | undefined = activeIsPilot
    ? pilotSnapshot ?? cachedActivePilotSnapshot
    : undefined;
  const floatingPnlUsd = activeIsPilot
    ? pilotSnapshot?.currency === 'USD' ? Number(pilotSnapshot.floatingPnl ?? 0) : 0
    : manualFloatingPnlUsd;
  const displayBalance = activeIsPilot
    ? effectivePilotSnapshot?.balance != null
      ? formatPilotAmount(effectivePilotSnapshot.balance, effectivePilotSnapshot.currency)
      : canFallbackToUsdWorkspace(effectivePilotSnapshot?.currency)
        ? fmtUSD(acc.balance)
        : '—'
    : fmtUSD(acc.balance);
  const pilotReconnect = activeIsPilot && (!activePort.fundedNextConnectionId || activePilotFeed?.reconnect);

  const openActivePilot = () => {
    void commitWorkspaceChange(prev => ({ ...prev, journalFilter: prev.activePort, showMt5Importer: true }));
  };

  const handleUpdateMt5Settings = useCallback(
    (groupMode: 'IDEA' | 'POSITION', includeFees: boolean, nextTimeOffset?: Mt5TimeOffsetSetting) => {
      const resolvedOffset =
        nextTimeOffset !== undefined
          ? normalizeMt5TimeOffsetSetting(nextTimeOffset)
          : normalizeMt5TimeOffsetSetting(stateRef.current.mt5TimeOffset);
      commitWorkspaceChange(
        (prev) => {
          let nextJournal = [...prev.journal];
          const nextRawReports = { ...(prev.mt5RawReports || {}) };
          let nextCycleDays = prev.cycleDays;
          Object.keys(prev.accounts || {}).forEach((pid) => {
            const stored = nextRawReports[pid];
            if (stored && Array.isArray(stored.positions)) {
              const shiftedPositions = reapplyMt5TimezoneToPositions(stored.positions, resolvedOffset);
              nextRawReports[pid] = {
                ...stored,
                positions: shiftedPositions,
              };
              const existingNotes = new Map<string, string>();
              nextJournal.forEach((j) => {
                if (j.port === pid && String(j.id).startsWith('MT5-') && j.note) {
                  existingNotes.set(String(j.id), j.note);
                }
              });
              const nonMt5 = nextJournal.filter(
                (j) => !(j.port === pid && String(j.id).startsWith('MT5-'))
              );
              const rebuilt = convertMt5PositionsToJournalRows(
                stored.meta,
                shiftedPositions,
                pid,
                groupMode,
                includeFees
              ).map((row) => {
                const prevNote = existingNotes.get(String(row.id));
                return prevNote && prevNote !== row.note ? { ...row, note: prevNote } : row;
              });
              nextJournal = [...rebuilt, ...nonMt5];
              if (pid === prev.activePort && rebuilt.length > 0) {
                nextCycleDays = syncCycleDaysWithJournal(prev.cycleDays, nextJournal, pid);
              }
            }
          });
          return {
            ...prev,
            mt5GroupMode: groupMode,
            mt5IncludeFees: includeFees,
            mt5TimeOffset: resolvedOffset,
            mt5RawReports: nextRawReports,
            journal: nextJournal,
            cycleDays: nextCycleDays,
          };
        },
        { snapshotReason: 'ปรับตั้งค่า MT5 / Timezone' }
      );
      if (nextTimeOffset !== undefined) {
        addToast('MT5 time offset updated and sessions recalculated in ICT.', 'อัปเดตเวลาชดเชย MT5 และคำนวณช่วงตลาดใหม่ตามเวลาไทย (ICT) แล้ว');
      } else {
        addToast('MT5 trade display updated.', 'อัปเดตการแสดงรายการเทรด MT5 แล้ว');
      }
    },
    [commitWorkspaceChange, addToast]
  );

  const handleDeletePort = useCallback(
    (pid: string) => {
      const portName = state.accounts[pid]?.name || pid;
      commitWorkspaceChange(
        (prev) => {
          const nextAccounts = { ...prev.accounts };
          delete nextAccounts[pid];
          const remaining = Object.keys(nextAccounts);
          const nextActive = prev.activePort === pid ? remaining[0] || '' : prev.activePort;
          return {
            ...prev,
            accounts: nextAccounts,
            editingPortId: prev.editingPortId === pid ? null : prev.editingPortId,
            journal: prev.journal.filter((j) => j.port !== pid),
            activePort: nextActive,
            journalFilter: prev.journalFilter === pid ? 'ALL' : prev.journalFilter,
          };
        },
        { snapshotReason: `ลบพอร์ต ${portName}` }
      );
      addToast(`Deleted ${formatAccountDisplayName(portName, 'en')}.`, `ลบ ${portName} แล้ว`);
    },
    [commitWorkspaceChange, addToast, state.accounts]
  );

  const handleToggleAddPortForm = useCallback(
    (show: boolean, editId?: string | null) => {
      commitWorkspaceChange((prev) => ({
        ...prev,
        showAddPortForm: show && !editId,
        editingPortId: editId || null,
      }));
    },
    [commitWorkspaceChange]
  );

  const activePageTitle =
    activeNavSection === 'tv-chart-root'
      ? ui.pageTitles.liveChart
      : activeNavSection === 'calculator-root'
      ? ui.pageTitles.calculator
      : activeNavSection === 'desk-cards-root'
      ? ui.pageTitles.twelveGate
      : activeNavSection === 'journal-root'
      ? ui.pageTitles.journal
      : activeNavSection === 'sec-marketplace'
      ? ui.pageTitles.marketplace
      : activeNavSection === 'sec-mall'
      ? ui.pageTitles.community
      : activeNavSection === 'sec-proprules'
      ? ui.pageTitles.propRules
      : activeNavSection === 'sec-settings'
      ? ui.pageTitles.settings
      : ui.pageTitles.analysis;

  const realtimeAnalytics = useMemo(
    () => computeRealtimeAnalytics(state.journal, state.activePort),
    [state.journal, state.activePort]
  );

  const today = getBangkokIsoDate();
  const isMallPage = activeNavSection === 'sec-mall';
  const mallHandle = currentUser?.email ? '@' + currentUser.email.split('@')[0].normalize('NFKC').toLowerCase().slice(0, 39) : ssoMallHandle ?? guestMallHandle;
  const mallCalculator = useMemo(() => isMallPage ? getActiveCalculator(state) : undefined, [isMallPage, state]);
  const mallBlueprint = useMemo<MallSetupBlueprint | undefined>(() => {
    if (!mallCalculator) return undefined;
    const calc = mallCalculator;
    const config = state.calcMode === 'MANUAL' ? state.manualCalculator : GHR_PRESET_CALCULATOR;
    const useAbsolutePrice = config && [config.sl, ...config.targets].some((level) => level.unit === 'EXACT_PRICE');
    if ((useAbsolutePrice && !calc.isValid) || calc.legs.length !== 3) return undefined;
    if (![calc.risk, calc.sl.points, ...calc.legs.map((leg) => leg.points)].every((value) => Number.isFinite(value) && value > 0)) return undefined;
    return {
      title: deskText(deskLang, 'Calculator risk blueprint', 'บลูพรินต์ความเสี่ยงจากเครื่องคำนวณ'),
      primarySymbol: calc.instrument, timeframe: state.calcMode === 'MANUAL' ? 'MULTI-TF' : 'M5', sessionFocus: 'ALL',
      riskUsd: Number(calc.risk.toFixed(2)), slPoints: calc.sl.points,
      tp1Points: calc.legs[0].points, tp2Points: calc.legs[1].points, tp3Points: calc.legs[2].points,
      checklistNotes: [],
    };
  }, [deskLang, mallCalculator, state.calcMode, state.manualCalculator]);
  function loadDistanceBlueprint(bp: MallSetupBlueprint, direction?: TradeDirection) {
    const instrument = Object.keys(CALCULATOR_CONTRACTS).find(symbol => symbol === bp.primarySymbol.toUpperCase()) as Exclude<ManualCalculatorConfig['instrument'], 'CUSTOM'> | undefined;
    if (!instrument) {
      addToast('Calculator loading requires a supported instrument.', 'การโหลดต้องใช้สัญลักษณ์ที่เครื่องคำนวณรองรับ');
      return;
    }
    const points = (value: number) => ({ unit: 'POINTS' as const, value });
    commitWorkspaceChange(prev => {
      const currentInstrument = (prev.calcMode === 'MANUAL' ? prev.manualCalculator?.instrument : 'XAUUSD') ?? 'XAUUSD';
      const fallbackEntry = DEFAULT_INSTRUMENT_ENTRY[instrument] ?? 2650;
      const nextEntry = currentInstrument === instrument && prev.calcEntry > 0 ? prev.calcEntry : fallbackEntry;
      return {
        ...prev,
        calcMode: 'MANUAL',
        calcRisk: bp.riskUsd,
        calcEntry: nextEntry,
        calcEntryRaw: String(nextEntry),
        calcDir: direction ?? prev.calcDir,
        calcNote: [bp.title, ...bp.checklistNotes].join(' | '),
        manualCalculator: {
          ...GHR_PRESET_CALCULATOR,
          instrument,
          sl: points(bp.slPoints),
          targets: [points(bp.tp1Points), points(bp.tp2Points), points(bp.tp3Points)],
        },
      };
    }, { snapshotReason: '3-TP risk blueprint · ' + bp.title });
    handleSwitchPage('calculator-root');
    addToast('Loaded 3-TP risk distances into Calculator.', 'โหลดระยะความเสี่ยง 3-TP เข้าเครื่องคำนวณแล้ว');
  }

  const mallSessionR = useMemo(() => {
    if (state.privacyMasked) return undefined;
    const closed = state.journal.filter((trade) => trade.port === state.activePort && trade.date === today && trade.risk > 0 && Number.isFinite(trade.pnlUsd));
    if (!closed.length) return undefined;
    return Number(closed.reduce((sum, trade) => sum + trade.pnlUsd / trade.risk, 0).toFixed(2));
  }, [state.activePort, state.journal, state.privacyMasked, today]);
  const mallChannel = MALL_CHANNELS.find((channel) => channel === acc.syncProvider);
  const mallBridgeKey = mallChannel === 'LIVE_BRIDGE' ? acc.tredynApiKey : undefined;
  const mallAccount = mallChannel === 'FUNDEDNEXT_MCP' ? acc.fundedNextAccountId : mallChannel === 'MYFXBOOK_API' ? acc.login : undefined;
  const mallHeaders = useCallback(async (purpose: 'post' | 'snapshot' | 'presence'): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {};
    if (state.privacyMasked) return headers;
    if (purpose === 'snapshot' && mallChannel) headers['X-TallyNX-Mall-Channel'] = mallChannel;
    if (mallBridgeKey) headers['X-Tredyn-Api-Key'] = mallBridgeKey;
    if (mallAccount) {
      headers['X-TallyNX-Mall-Account'] = mallAccount;
      const token = await currentUser?.getIdToken().catch(() => undefined);
      if (token) headers.Authorization = 'Bearer ' + token;
    }
    return headers;
  }, [currentUser, mallAccount, mallBridgeKey, mallChannel, state.privacyMasked]);
  const cycleRuleStatus = useMemo(() => {
    const rule = getActiveConsistencyRule(state);
    return {
      rule,
      consistency: evaluateConsistencyRule(state.cycleDays, rule.includeFeeRefund, state.thbRate, rule),
    };
  }, [
    state.accounts,
    state.activePort,
    state.consistencyOverrides,
    state.includeFeeRefund,
    state.cycleDays,
    state.thbRate,
  ]);

  const twelveGatePassedCount = useMemo(
    () => evaluateTwelveGates(state.twelveGates).passedCount,
    [state.twelveGates]
  );

  const calculatorPage = useMemo(() => {
    if (activeNavSection !== 'calculator-root') return null;
    return {
      calc: getActiveCalculator(state),
      ...cycleRuleStatus,
      tradesToday: state.journal.filter((trade) => trade.port === state.activePort && trade.date === today).length,
    };
  }, [activeNavSection, state, cycleRuleStatus, today]);

  const telemetryMode = resolveTelemetryStreamMode(isOnline, acc.syncProvider, hasActiveSse);
  const telemetry = useMemo(
    () => computeRealtimeTelemetryBar(acc, state.journal, state.activePort, today, floatingPnlUsd, telemetryMode),
    [acc, state.journal, state.activePort, today, floatingPnlUsd, telemetryMode]
  );
  const activeFirmId = activeIsPilot ? 'fundednext' : findMatchingPropFirm(activePort?.name, activePort?.brokerName, activePort?.brokerServer)?.id;
  const shieldCurrency = effectivePilotSnapshot?.currency ?? state.mt5RawReports?.[state.activePort]?.meta.currency;
  const shieldHeadroom = activePort && canFallbackToUsdWorkspace(shieldCurrency)
    ? fmtUSD(Math.max(0, telemetry.dailyDrawdownLimitUsd - telemetry.dailyDrawdownUsedUsd))
    : '—';
  const shieldConsistency = activePort && cycleRuleStatus.consistency.totalProfit > 0
    ? `${cycleRuleStatus.consistency.bestDayPct.toFixed(1)}%`
    : '—';

  const behavioralAlerts = useMemo(
    () =>
      detectBehavioralGuardrails(
        state.journal,
        state.activePort,
        state.calcRisk,
        today,
        floatingPnlUsd,
        acc.initial
      ),
    [state.journal, state.activePort, state.calcRisk, today, floatingPnlUsd, acc.initial]
  );

  const analyticsPosture = useMemo(
    () => ({
      sessions: realtimeAnalytics.sessions,
      alerts: behavioralAlerts,
      equityUsd: telemetry.equity,
      floatingPnlUsd: activePort ? telemetry.floatingPnlUsd : undefined,
      avgRMultiple: Object.values(realtimeAnalytics.sessions).some((session) => session.totalTrades > 0)
        ? realtimeAnalytics.avgRMultiple
        : undefined,
      dailyLossUsedPct: activePort && !activeIsPilot ? telemetry.dailyDrawdownUsedPct : undefined,
      dailyBufferUsd:
        activePort && (!activeIsPilot || canFallbackToUsdWorkspace(effectivePilotSnapshot?.currency))
          ? Math.max(0, telemetry.dailyDrawdownLimitUsd - telemetry.dailyDrawdownUsedUsd)
          : undefined,
    }),
    [
      realtimeAnalytics.sessions,
      realtimeAnalytics.avgRMultiple,
      behavioralAlerts,
      telemetry.equity,
      telemetry.floatingPnlUsd,
      telemetry.dailyDrawdownUsedPct,
      telemetry.dailyDrawdownLimitUsd,
      activePort,
      activeIsPilot,
      effectivePilotSnapshot?.currency,
    ]
  );

  const activeLiveBridge = activePort?.syncProvider === 'LIVE_BRIDGE' ? liveBridgeByPort[state.activePort] : undefined;
  const activeLivePositions = useMemo<AnyLivePositionInput[]>(() => {
    if (activeIsPilot) {
      return (
        activePilotFeed?.data?.liveTelemetry?.openPositions ??
        effectivePilotSnapshot?.openPositions ??
        []
      );
    }
    if (activePort?.syncProvider === 'LIVE_BRIDGE') {
      return activeLiveBridge?.live?.openPositions ?? activeLiveBridge?.openPositions ?? [];
    }
    return [];
  }, [
    activeIsPilot,
    activePilotFeed?.data?.liveTelemetry?.openPositions,
    effectivePilotSnapshot?.openPositions,
    activePort?.syncProvider,
    activeLiveBridge,
  ]);

  const activeTelemetrySeries = useMemo<LiveTelemetryPoint[]>(
    () => liveTelemetrySeriesByPort[state.activePort] ?? [],
    [liveTelemetrySeriesByPort, state.activePort]
  );

  const liveMonitorState = useMemo<LiveMonitorControlState>(() => {
    const meta = liveSyncMetaByPort[state.activePort];
    const provider = activeIsPilot
      ? 'FUNDEDNEXT_MCP'
      : activePort?.syncProvider === 'LIVE_BRIDGE'
        ? 'LIVE_BRIDGE'
        : 'NONE';
    const connected =
      provider === 'FUNDEDNEXT_MCP'
        ? Boolean(firebaseUid && activePort?.fundedNextConnectionId && activePilotAccountId && !pilotReconnect)
        : provider === 'LIVE_BRIDGE'
          ? Boolean(activeBridgeKey)
          : false;
    const todayRealizedProfitUsd = (state.journal || [])
      .filter((t) => t.port === state.activePort && t.date === today)
      .reduce((sum, t) => sum + (Number(t.pnlUsd) || 0), 0);

    const pilotLive = activePilotFeed?.data?.liveTelemetry;
    const pilotBal =
      pilotLive?.balance ??
      (effectivePilotSnapshot?.balance != null && Number.isFinite(Number(effectivePilotSnapshot.balance))
        ? Number(effectivePilotSnapshot.balance)
        : null);
    const pilotEq =
      pilotLive?.equity ??
      (effectivePilotSnapshot?.equity != null && Number.isFinite(Number(effectivePilotSnapshot.equity))
        ? Number(effectivePilotSnapshot.equity)
        : pilotBal);
    const pilotFloat =
      pilotLive?.floatingPnl ??
      (effectivePilotSnapshot?.floatingPnl != null && Number.isFinite(Number(effectivePilotSnapshot.floatingPnl))
        ? Number(effectivePilotSnapshot.floatingPnl)
        : null);

    const bridgeLive = activeLiveBridge?.live;
    const balance =
      provider === 'FUNDEDNEXT_MCP'
        ? pilotBal
        : provider === 'LIVE_BRIDGE'
          ? bridgeLive?.balance ?? acc.balance
          : null;
    const equity =
      provider === 'FUNDEDNEXT_MCP'
        ? pilotEq
        : provider === 'LIVE_BRIDGE'
          ? bridgeLive?.equity ?? (balance !== null ? balance + Number(bridgeLive?.floatingPnl ?? manualFloatingPnlUsd) : null)
          : null;
    const floatingPnl =
      provider === 'FUNDEDNEXT_MCP'
        ? pilotFloat
        : provider === 'LIVE_BRIDGE'
          ? bridgeLive?.floatingPnl ?? manualFloatingPnlUsd
          : null;
    const currency =
      provider === 'FUNDEDNEXT_MCP'
        ? effectivePilotSnapshot?.currency || 'USD'
        : provider === 'LIVE_BRIDGE'
          ? activeLiveBridge?.meta?.currency || 'USD'
          : 'USD';
    const dailyLossLimitUsd =
      provider === 'FUNDEDNEXT_MCP'
        ? pilotLive?.dailyLossLimitUsd ?? Math.max(100, Number(acc.initial || 10000) * 0.05)
        : provider === 'LIVE_BRIDGE'
          ? bridgeLive?.dailyLossLimitUsd ?? Math.max(100, Number(acc.initial || 10000) * 0.05)
          : Math.max(100, Number(acc.initial || 10000) * 0.05);
    const netRealizedProfit =
      provider === 'FUNDEDNEXT_MCP' && effectivePilotSnapshot?.netProfit != null && Number.isFinite(Number(effectivePilotSnapshot.netProfit))
        ? Number(effectivePilotSnapshot.netProfit)
        : acc.profit;

    return {
      provider,
      connected,
      paused: liveMonitorPaused || (provider === 'FUNDEDNEXT_MCP' && !activePilotAutoSync),
      tabVisible: liveTabVisible,
      syncing: Boolean(meta?.syncing),
      reconnectRequired: Boolean(pilotReconnect),
      pollIntervalMs: LIVE_TELEMETRY_POLL_MS,
      nextPollAt: meta?.nextPollAt ?? null,
      lastSyncAt:
        meta?.lastSyncAt ??
        (provider === 'FUNDEDNEXT_MCP'
          ? effectivePilotSnapshot?.lastCheckedAt ?? effectivePilotSnapshot?.fetchedAt ?? null
          : activeLiveBridge?.syncedAt ?? null),
      latencyMs: meta?.latencyMs ?? null,
      error: meta?.error ?? activePilotFeed?.error ?? null,
      currency,
      balance,
      equity,
      floatingPnl,
      marginUsedUsd: provider === 'FUNDEDNEXT_MCP' ? pilotLive?.margin ?? null : bridgeLive?.margin ?? null,
      freeMarginUsd: provider === 'FUNDEDNEXT_MCP' ? pilotLive?.freeMargin ?? null : bridgeLive?.freeMargin ?? null,
      marginLevelPct: provider === 'FUNDEDNEXT_MCP' ? pilotLive?.marginLevelPct ?? null : bridgeLive?.marginLevelPct ?? null,
      dailyLossUsedUsd: provider === 'FUNDEDNEXT_MCP' ? pilotLive?.dailyLossUsedUsd ?? null : bridgeLive?.dailyLossUsedUsd ?? null,
      dailyLossLimitUsd,
      netRealizedProfit,
      bestDayProfit: cycleRuleStatus.consistency.bestDay,
      todayRealizedProfitUsd,
      consistencyCapPct: cycleRuleStatus.consistency.capPct,
      hasConsistencyCap: cycleRuleStatus.consistency.hasConsistencyCap,
      privacyMasked: state.privacyMasked,
      rateFloorMs: provider === 'FUNDEDNEXT_MCP' ? pilotLive?.rateFloorMs ?? null : null,
      nextSafeSyncAt: provider === 'FUNDEDNEXT_MCP' ? pilotLive?.nextSafeSyncAt ?? null : null,
      onTogglePause: () => {
        if (provider === 'FUNDEDNEXT_MCP' && !activePilotAutoSync && firebaseUid) {
          void updatePilotPorts(firebaseUid, { type: 'autoSync', portId: state.activePort, enabled: true });
          setLiveMonitorPaused(false);
          return;
        }
        setLiveMonitorPaused((prev) => !prev);
      },
      onForceRefresh: () => triggerLive3sPollRef.current?.(),
      onOpenSyncModal: handleOpenMt5SyncModal,
    };
  }, [
    liveSyncMetaByPort,
    state.activePort,
    state.journal,
    state.privacyMasked,
    activeIsPilot,
    activePort?.syncProvider,
    activePort?.fundedNextConnectionId,
    firebaseUid,
    activePilotAccountId,
    pilotReconnect,
    activeBridgeKey,
    today,
    activePilotFeed,
    effectivePilotSnapshot,
    activeLiveBridge,
    acc.balance,
    acc.initial,
    acc.profit,
    manualFloatingPnlUsd,
    liveMonitorPaused,
    activePilotAutoSync,
    liveTabVisible,
    cycleRuleStatus.consistency.bestDay,
    cycleRuleStatus.consistency.capPct,
    cycleRuleStatus.consistency.hasConsistencyCap,
    handleOpenMt5SyncModal,
    updatePilotPorts,
  ]);

  const activePageSnapshot = useMemo<DeskPageSnapshot>(() => {
    const filteredCount = filteredJournal.length;
    const filteredPnl = +filteredJournal
      .reduce((sum, item) => sum + (Number(item.pnlUsd) || 0), 0)
      .toFixed(2);
    const filteredWins = filteredJournal.filter((item) => (Number(item.pnlUsd) || 0) > 0).length;
    const filteredWinRate =
      filteredCount > 0 ? +((filteredWins / filteredCount) * 100).toFixed(1) : 0;

    const filterBits = [
      state.journalFilter && state.journalFilter !== 'ALL' ? `Port:${state.journalFilter}` : 'Port:ALL',
      state.journalStatusFilter !== 'ALL' ? `Status:${state.journalStatusFilter}` : null,
      state.journalDateFilter && state.journalDateFilter !== 'ALL' ? `Date:${state.journalDateFilter}` : null,
      state.journalSessionFilter && state.journalSessionFilter !== 'ALL' ? `Session:${state.journalSessionFilter}` : null,
      state.journalSearch.trim() ? `Search:"${state.journalSearch.trim()}"` : null,
    ].filter(Boolean);

    const recentTrades = filteredJournal
      .slice(0, 5)
      .map(
        (t) =>
          `${t.date} ${t.dir} ${t.status} ${fmtUSD(t.pnlUsd, true)} (RR ${t.rr}${
            t.note ? `, ${t.note.slice(0, 28)}` : ''
          })`
      );

    return {
      activePageId: activeNavSection,
      activePageTitle,
      filteredJournalCount: filteredCount,
      filteredJournalPnlUsd: filteredPnl,
      filteredJournalWinRatePct: filteredWinRate,
      activeFiltersSummary: filterBits.join(' · '),
      recentFilteredTrades: recentTrades,
      sessionAnalyticsSummary: `WR ${realtimeAnalytics.overallWinRatePct}%, PF ${realtimeAnalytics.profitFactor}, Avg ${realtimeAnalytics.avgRMultiple}R, Leak: ${realtimeAnalytics.biggestLeakText}`,
      guardrailAlertsSummary:
        behavioralAlerts.length > 0
          ? behavioralAlerts.map((a) => `${a.title} (${a.metricBadge})`).join(' | ')
          : 'วินัยปกติ (0 แจ้งเตือน)',
      floatingPnlUsd,
    };
  }, [
    activeNavSection,
    activePageTitle,
    filteredJournal,
    state.journalFilter,
    state.journalStatusFilter,
    state.journalDateFilter,
    state.journalSessionFilter,
    state.journalSearch,
    realtimeAnalytics,
    behavioralAlerts,
    floatingPnlUsd,
  ]);

  const renderAccountSwitcher = (onCloseModal?: () => void) => (
    <AccountSwitcher
      lang={deskLang}
      state={state}
      activePilotBalance={activeIsPilot && displayBalance !== '—' ? displayBalance : undefined}
      pilotBalancesByPort={pilotBalancesByPortString}
      pilotStatsByPort={pilotBalancesByPortNumeric}
      onSelectPort={(pid) => {
        handleSelectPort(pid);
        if (onCloseModal) setShowAccountsDrawer(false);
      }}
      onSavePort={handleSavePort}
      onDeletePort={handleDeletePort}
      onToggleAddForm={handleToggleAddPortForm}
      onCloseModal={onCloseModal}
    />
  );

  const renderDbSyncCenter = (onClose?: () => void) => (
    <DatabaseSyncCenter
      lang={deskLang}
      state={state}
      isOnline={isOnline}
      idbReady={idbReady}
      currentUser={currentUser}
      cloudSyncing={cloudSyncing}
      pendingOfflineCount={pendingOfflineCount}
      snapshots={snapshots}
      syncLogs={syncLogs}
      onClose={onClose}
      onGoogleLogin={handleGoogleLogin}
      onGoogleLogout={async () => {
        await signOutFirebase();
        addToast('Signed out of Cloud. Local data is still available.', 'ออกจากคลาวด์แล้ว ข้อมูลในเครื่องยังอยู่ครบ');
      }}
      onCreateSnapshot={async () => {
        const snaps = await saveWorkspaceToIndexedDB(
          stateRef.current,
          'ผู้ใช้สร้างจุดเซฟมือ',
          activeUidRef.current
        );
        setSnapshots(snaps);
        appendSyncLog('IDB', 'สร้างจุดเซฟ Snapshot ใน IndexedDB');
        addToast('Local snapshot created in IndexedDB.', 'สร้างจุดบันทึกใน IndexedDB แล้ว');
      }}
      onRestoreSnapshot={(snapId) => {
        const snap = snapshots.find((s) => s.snapId === snapId);
        if (!snap) return;
        commitWorkspaceChange(() => normalizeMergedState(snap.payload), {
          snapshotReason: `กู้คืนจาก ${snapId}`,
          broadcastAction: `กู้คืนฐานข้อมูลจาก ${snapId}`,
        });
        addToast(`Database restored (${snap.tradeCount} trades).`, `กู้คืนฐานข้อมูลแล้ว (${snap.tradeCount} ไม้)`);
      }}
      onDeleteSnapshot={async (snapId) => {
        const snaps = await deleteSnapshotFromIndexedDB(snapId, activeUidRef.current);
        setSnapshots(snaps);
        addToast('Snapshot deleted.', 'ลบจุดบันทึกแล้ว');
      }}
      onCloudPushNow={async () => {
        if (!currentUser) {
          addToast('Sign in to Google Cloud to sync.', 'เข้าสู่ระบบ Google Cloud ก่อนซิงก์');
          return;
        }
        try {
          setCloudSyncing(true);
          await pushWorkspaceToFirestore(currentUser.uid, stateRef.current);
          setCloudSyncing(false);
          appendSyncLog('CLOUD', 'บังคับซิงก์ขึ้น Cloud Firestore สำเร็จ');
          addToast('Synced to Cloud Firestore.', 'ซิงก์ข้อมูลขึ้น Cloud Firestore แล้ว');
        } catch {
          setCloudSyncing(false);
          addToast('Cloud Firestore sync failed.', 'ซิงก์ข้อมูลกับ Cloud Firestore ไม่สำเร็จ');
        }
      }}
      onCloudPullNow={async () => {
        if (!currentUser) {
          addToast('Sign in to Google Cloud to retrieve your data.', 'เข้าสู่ระบบ Google Cloud ก่อนดึงข้อมูล');
          return;
        }
        try {
          setCloudSyncing(true);
          const snap = await getDoc(doc(db, 'workspaces', currentUser.uid));
          setCloudSyncing(false);
          if (!snap.exists() || !snap.data().payloadJson) {
            addToast('No backup found in Cloud Firestore.', 'ยังไม่มีข้อมูลสำรองใน Cloud Firestore');
            return;
          }
          const cloudDecoded = await decodeCloudWorkspacePayload<Partial<GhrWorkspaceState>>(
            snap.data().payloadJson
          );
          const cloudState = normalizeMergedState(cloudDecoded);
          commitWorkspaceChange(() => cloudState, {
            snapshotReason: 'ดึงข้อมูลจาก Cloud Firestore',
          });
          addToast(
            `Retrieved ${cloudState.journal.length} trades from Cloud.`,
            `ดึงข้อมูลจาก Cloud สำเร็จ (${cloudState.journal.length} รายการเทรด)`
          );
        } catch {
          setCloudSyncing(false);
          addToast('Could not retrieve data from Cloud.', 'ดึงข้อมูลจากคลาวด์ไม่สำเร็จ');
        }
      }}
      onExportFullJson={exportFullDatabaseJSON}
      onExportDriveCsv={exportDriveArchiveCSV}
      onTriggerImportFile={() => {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
          fileInputRef.current.click();
        }
      }}
      onUpdateApiConfig={(url, key) =>
        commitWorkspaceChange((prev) => ({
          ...prev,
          apiEndpointUrl: url.trim(),
          apiSecretKey: key.trim(),
        }))
      }
      onApiPushNow={async () => {
        const url = (stateRef.current.apiEndpointUrl || '').trim();
        if (!url) {
          addToast('Enter a REST API endpoint URL.', 'ระบุ URL ของ REST API ก่อน');
          return;
        }
        try {
          setCloudSyncing(true);
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          if (stateRef.current.apiSecretKey) {
            headers['Authorization'] = `Bearer ${stateRef.current.apiSecretKey}`;
          }
          const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              app: 'TREDYN_GHR_v3.2',
              updatedAt: new Date().toISOString(),
              state: stateRef.current,
            }),
          });
          setCloudSyncing(false);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          addToast('Data sent to the REST API (POST).', 'ส่งข้อมูลไปยัง REST API แล้ว (POST)');
        } catch (err) {
          setCloudSyncing(false);
          addToast(
            'Could not connect to the REST API.',
            `เชื่อมต่อ REST API ไม่สำเร็จ: ${
              err instanceof Error ? err.message : 'Error'
            }`
          );
        }
      }}
      onApiPullNow={async () => {
        const url = (stateRef.current.apiEndpointUrl || '').trim();
        if (!url) {
          addToast('Enter a REST API endpoint URL.', 'ระบุ URL ของ REST API ก่อน');
          return;
        }
        try {
          setCloudSyncing(true);
          const headers: Record<string, string> = {};
          if (stateRef.current.apiSecretKey) {
            headers['Authorization'] = `Bearer ${stateRef.current.apiSecretKey}`;
          }
          const res = await fetch(url, { method: 'GET', headers });
          setCloudSyncing(false);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const data = await res.json();
          const incoming = data.state || data;
          commitWorkspaceChange(() => normalizeMergedState(incoming), {
            snapshotReason: 'ดึงข้อมูลจาก REST API',
          });
          addToast('Retrieved data from the REST API.', 'ดึงข้อมูลจาก REST API แล้ว');
        } catch (err) {
          setCloudSyncing(false);
          addToast(
            'Could not retrieve data from the REST API.',
            `เชื่อมต่อ REST API ไม่สำเร็จ: ${
              err instanceof Error ? err.message : 'Error'
            }`
          );
        }
      }}
      onUpdateBranding={(brandName, subtitle) => {
        commitWorkspaceChange(
          (prev) => ({
            ...prev,
            deskBrandName: brandName.trim() || DEFAULT_WORKSPACE_BRAND,
            deskBrandSubtitle: subtitle.trim() || 'desk.tallynx.com · Risk Analytics & Trade Journal',
          }),
          { snapshotReason: 'ปรับชื่อแบรนด์ White-Label' }
        );
        addToast('Desk branding saved.', 'บันทึกชื่อแบรนด์โต๊ะเทรดแล้ว');
      }}
      onUpdateMt5TimeOffset={(nextTimeOffset) =>
        handleUpdateMt5Settings(
          stateRef.current.mt5GroupMode || 'IDEA',
          stateRef.current.mt5IncludeFees !== false,
          nextTimeOffset
        )
      }
      onResetFactory={async () => {
        const snaps = await saveWorkspaceToIndexedDB(
          stateRef.current,
          'สำรองก่อน Factory Reset',
          activeUidRef.current
        );
        setSnapshots(snaps);
        setShowAccountsDrawer(false);
        commitWorkspaceChange(
          (prev) =>
            createCleanWorkspaceState({
              theme: prev.theme,
              thbRate: prev.thbRate,
              deskBrandName: prev.deskBrandName,
              deskBrandSubtitle: prev.deskBrandSubtitle,
              showDbManager: false,
            }),
          { snapshotReason: 'Factory Reset พอร์ตเริ่มต้น' }
        );
        addToast('Default accounts restored. Your previous workspace is available in Snapshots.', 'รีเซ็ตพอร์ตเป็นค่าเริ่มต้นแล้ว กู้คืนข้อมูลเดิมได้จากจุดบันทึก');
      }}
    />
  );

  const loadingModule = (
    <WorkspaceSkeleton label={t('Loading workspace...', 'กำลังโหลดหน้าทำงาน...')} />
  );

  const activePillar = getDeskPillar(activeNavSection);
  const pillarSubtabs: Record<DeskPillar, Array<{ id: string; label: string }>> = {
    mall: [
      { id: 'sec-mall', label: t('Mall Lounge', 'ห้องคอมมูนิตี้มอลล์') },
      { id: 'sec-marketplace', label: t('Strategy Market', 'ตลาดชุดตั้งค่า') },
    ],
    portfolio: [
      { id: 'sec-accounts', label: t('Overview & Risk', 'ภาพรวมและความเสี่ยง') },
      { id: 'journal-root', label: t('Trade Journal', 'สมุดบันทึกเทรด') },
    ],
    plan: [
      { id: 'calculator-root', label: t('3-TP Calc', 'คำนวณ 3-TP') },
      { id: 'desk-cards-root', label: t('12-Gate & Rules', '12-Gate & กฎเหล็ก') },
      { id: 'tv-chart-root', label: t('Live Chart', 'กราฟสด') },
    ],
    rules: [],
    settings: [],
  };
  const activeSubtabs = pillarSubtabs[activePillar];

  return (
    <div className="fx-app-layout">
      {deskRoomMode !== 'clean' && <div className="fx-room-backdrop" aria-hidden="true" />}
      {/* ================================================================= */}
      {/* LEFT VERTICAL 5-PILLAR RAIL (v5.0)                                */}
      {/* ================================================================= */}
      <WorkspaceSidebar
        lang={deskLang}
        activePillar={activePillar}
        onOpenMall={handleOpenMallDefault}
        onSwitchPage={handleSwitchPage}
        onOpenSettings={handleOpenSettings}
      />

      {/* ================================================================= */}
      {/* MAIN CONTENT VIEWPORT                                             */}
      {/* ================================================================= */}
      <div className="fx-main-area">
        <header className="topbar" id="main-topbar">
          <div className="topbar-inner">
            {/* LEFT: Brand, Active Port Selector + Health Pill, Command Palette */}
            <div className="fx-breadcrumb">
              <button type="button" className="mall-top-brand" onClick={() => openMall()} title="mall.tallynx.com · Community Mall & Risk OS">
                <strong>TALLY<span className="mall-top-brand-accent">NX</span></strong>
                <small>{activePageTitle}</small>
              </button>

              <div
                className="fx-bc-port-wrap"
                title={activePort ? `${activePort.login} (${formatAccountDisplayName(activePort.name, deskLang)})` : undefined}
              >
                {activePort && (
                  <>
                    <span className="fx-bc-port-label mono" aria-hidden="true">
                      {`${activePort.login} · ${formatAccountDisplayName(activePort.name, deskLang)}`}
                    </span>
                    <svg className="fx-bc-port-chevron ico" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </>
                )}
                <select
                  aria-label={t('Select Active Account', 'เลือกพอร์ตที่ใช้งาน')}
                  className="fx-bc-port-select mono"
                  value={state.activePort}
                  onChange={(e) => handleSelectPort(e.target.value)}
                >
                  {(() => {
                    const propPids = portsList.filter(
                      (pid) => resolveAccountType(state.accounts[pid]) === 'PROP'
                    );
                    const personalPids = portsList.filter(
                      (pid) => resolveAccountType(state.accounts[pid]) === 'PERSONAL'
                    );
                    return (
                      <>
                        {propPids.length > 0 && (
                          <optgroup label={ui.topbar.propGroupLabel}>
                            {propPids.map((pid) => {
                              const p = state.accounts[pid];
                              return (
                                <option key={pid} value={pid}>
                                  {p.login} ({formatAccountDisplayName(p.name, deskLang)})
                                </option>
                              );
                            })}
                          </optgroup>
                        )}
                        {personalPids.length > 0 && (
                          <optgroup label={ui.topbar.personalGroupLabel}>
                            {personalPids.map((pid) => {
                              const p = state.accounts[pid];
                              return (
                                <option key={pid} value={pid}>
                                  {p.login} ({formatAccountDisplayName(p.name, deskLang)})
                                </option>
                              );
                            })}
                          </optgroup>
                        )}
                      </>
                    );
                  })()}
                </select>
              </div>

              <button
                type="button"
                className="topbar-health-pill mono"
                onClick={() => handleSwitchPage('sec-accounts')}
                title={t('Open Portfolio Overview & Risk Buffers', 'ดูภาพรวมพอร์ตและวงเงินขาดทุน')}
              >
                <span
                  className={`db-dot ${
                    !isOnline
                      ? 'offline'
                      : cloudSyncing
                      ? 'syncing'
                      : telemetry.dailyDrawdownUsedPct >= 80
                      ? 'warn'
                      : 'cloud'
                  }`}
                />
                <span className="sensitive-val">{state.privacyMasked ? '••••' : displayBalance}</span>
                {activePort && !activeIsPilot && (
                  <small>{Math.round(telemetry.dailyDrawdownUsedPct)}% DD</small>
                )}
              </button>

              <button
                type="button"
                className="topbar-cmd-trigger"
                onClick={() => setShowCommandPalette(true)}
                aria-label={t('Open Command Palette (Ctrl+K)', 'เปิดแถบคำสั่งด่วน (Ctrl+K)')}
                title={t('Jump anywhere or run action (Ctrl / ⌘ + K)', 'ค้นหาหน้าทำงานหรือคำสั่งด่วน (Ctrl / ⌘ + K)')}
              >
                <Search size={13} aria-hidden="true" />
                <span className="topbar-cmd-text">{t('Jump or run...', 'ค้นหา / คำสั่ง...')}</span>
                <kbd className="mono">⌘K</kbd>
              </button>
            </div>

            {/* RIGHT: 1-Click Theme, Language, In-Place MT5 Sync, AI Coach, Plan, Tools */}
            <div className="topbar-controls">
              <button
                type="button"
                className="topbar-icon-btn"
                id="btn-top-theme"
                onClick={() => handleSelectColorTheme(deskTheme === 'obsidian' ? 'alabaster' : 'obsidian')}
                aria-label={deskTheme === 'obsidian' ? ui.topbar.themeToLight : ui.topbar.themeToDark}
                title={deskTheme === 'obsidian' ? ui.topbar.themeToLight : ui.topbar.themeToDark}
              >
                {deskTheme === 'obsidian' ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
              </button>

              <button
                type="button"
                className={`topbar-icon-btn ${deskRoomMode !== 'clean' ? 'active' : ''}`}
                id="btn-top-room"
                onClick={() => {
                  const next: DeskRoomMode =
                    deskRoomMode === 'clean' ? 'night' : deskRoomMode === 'night' ? 'daylight' : 'clean';
                  handleSelectRoomMode(next);
                  addToast(
                    next === 'night'
                      ? 'Night Trading Room Glass enabled.'
                      : next === 'daylight'
                        ? 'Daylight Trading Studio Glass enabled.'
                        : 'Returned to clean workspace canvas.',
                    next === 'night'
                      ? 'เปิดโหมดพื้นหลังห้องเทรดกลางคืน (Glass)'
                      : next === 'daylight'
                        ? 'เปิดโหมดพื้นหลังห้องเทรดสว่าง (Daylight Studio)'
                        : 'กลับสู่พื้นหลังโต๊ะทำงานแบบเรียบสะอาด'
                  );
                }}
                aria-label={t('Switch Trading Room Backdrop', 'สลับพื้นหลังห้องเทรด')}
                title={
                  deskRoomMode === 'clean'
                    ? t('Trading Room Backdrop: Clean (Click for Night Room)', 'พื้นหลัง: เรียบสะอาด (คลิกเพื่อเปิดห้องเทรดกลางคืน)')
                    : deskRoomMode === 'night'
                      ? t('Trading Room Backdrop: Night Room (Click for Daylight Studio)', 'พื้นหลัง: ห้องเทรดกลางคืน (คลิกเพื่อสลับห้องสว่าง)')
                      : t('Trading Room Backdrop: Daylight Studio (Click for Clean)', 'พื้นหลัง: ห้องสว่าง (คลิกเพื่อกลับพื้นเรียบ)')
                }
              >
                <Monitor size={15} aria-hidden="true" />
              </button>

              <div className="topbar-lang-switch" role="group" aria-label={t('Switch Language', 'เปลี่ยนภาษา')}>
                <button
                  type="button"
                  aria-pressed={deskLang === 'en'}
                  onClick={() => setDeskLang('en')}
                >
                  EN
                </button>
                <button
                  type="button"
                  aria-pressed={deskLang === 'th'}
                  onClick={() => setDeskLang('th')}
                >
                  TH
                </button>
              </div>

              <button
                type="button"
                className="btn sm"
                id="btn-top-import"
                aria-label={ui.topbar.importMt5Cta}
                title={ui.topbar.importMt5Title}
                onClick={() => {
                  setShowToolsMenu(false);
                  commitWorkspaceChange((prev) => ({
                    ...prev,
                    showMt5Importer: true,
                  }));
                }}
              >
                <RefreshCw size={13} aria-hidden="true" />
                <span className="topbar-import-label">{t('Sync MT5', 'ซิงก์ MT5')}</span>
                <span className="topbar-import-short" aria-hidden="true">MT5</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                id="import-csv-input"
                accept=".xlsx,.xls,.csv,.json"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => handleImportFiles(e.target.files)}
              />

              <button
                type="button"
                className={`btn sm topbar-coach-btn ${showRightDock ? 'primary' : ''}`}
                aria-pressed={showRightDock}
                onClick={() => setShowRightDock((prev) => !prev)}
                title={t('Toggle AI Coach & Risk Guardrails dock', 'เปิด/ปิดผู้ช่วย AI Coach และตัวคุมความเสี่ยง')}
              >
                <Sparkles size={13} aria-hidden="true" />
                <span>{t('AI Coach', 'โค้ช AI')}</span>
                {behavioralAlerts.length > 0 && (
                  <span className="topbar-alert-badge mono" title={t(`${behavioralAlerts.length} guardrail alerts`, `เตือนความเสี่ยง ${behavioralAlerts.length} รายการ`)}>
                    {behavioralAlerts.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                className={`topbar-plan-btn ${
                  isAdminUser(currentUser, entitlement, isClaimAdmin) || isProOrHigher(currentUser, entitlement, isClaimAdmin)
                    ? 'pro'
                    : ''
                }`}
                id="btn-top-license"
                title={ui.topbar.accountPlanTitle}
                onClick={() => {
                  setShowToolsMenu(false);
                  setShowAccountsDrawer(false);
                  commitWorkspaceChange((prev) => ({
                    ...prev,
                    showLicenseModal: true,
                    showHelpGuide: false,
                    showDbManager: false,
                    showAddPortForm: false,
                    editingPortId: null,
                  }));
                }}
              >
                <span className="mono">
                  {isAdminUser(currentUser, entitlement, isClaimAdmin)
                    ? 'PRO+'
                    : entitlement?.plan || (currentUser ? 'FREE' : ui.topbar.signIn)}
                </span>
              </button>

              <div
                className="topbar-tools"
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setShowToolsMenu(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && showToolsMenu) {
                    event.preventDefault();
                    toolsTriggerRef.current?.focus();
                    setShowToolsMenu(false);
                  }
                }}
              >
                <button
                  type="button"
                  className="topbar-text-btn"
                  aria-expanded={showToolsMenu}
                  aria-controls={showToolsMenu ? 'desk-tools' : undefined}
                  ref={toolsTriggerRef}
                  onClick={() => setShowToolsMenu((v) => !v)}
                  title={ui.topbar.moreTools}
                >
                  <span>{ui.topbar.moreTools}</span>
                </button>

                {showToolsMenu && (
                  <div id="desk-tools" className="topbar-tools-menu">
                    <div className="mobile-tools-extras">
                      <div className="topbar-lang-switch" role="group" aria-label={t('Switch Language', 'เปลี่ยนภาษา')}>
                        <button
                          type="button"
                          aria-pressed={deskLang === 'en'}
                          onClick={() => setDeskLang('en')}
                        >
                          EN
                        </button>
                        <button
                          type="button"
                          aria-pressed={deskLang === 'th'}
                          onClick={() => setDeskLang('th')}
                        >
                          TH
                        </button>
                      </div>
                      <button
                        type="button"
                        className="btn xs"
                        style={{ flex: 1, justifyContent: 'center' }}
                        onClick={() => {
                          setShowToolsMenu(false);
                          setShowAccountsDrawer(false);
                          commitWorkspaceChange((prev) => ({
                            ...prev,
                            showLicenseModal: true,
                            showHelpGuide: false,
                            showDbManager: false,
                            showAddPortForm: false,
                            editingPortId: null,
                          }));
                        }}
                      >
                        <span className="mono">
                          {isAdminUser(currentUser, entitlement, isClaimAdmin)
                            ? 'PRO+'
                            : entitlement?.plan || (currentUser ? 'FREE' : ui.topbar.signIn)}
                        </span>
                      </button>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        padding: '4px 6px',
                        borderRadius: '6px',
                        background: 'var(--bg-subtle)',
                        fontSize: '11.5px',
                      }}
                    >
                      <span style={{ color: 'var(--text-secondary)' }}>{ui.topbar.thbRateLabel}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <span>{t('THB', '฿')}</span>
                        <input
                          id="top-thb-rate"
                          type="number"
                          step="0.1"
                          aria-label={ui.topbar.thbRateLabel}
                          value={state.thbRate}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 35.5;
                            commitWorkspaceChange((prev) => ({ ...prev, thbRate: val }));
                          }}
                          className="fx-top-thb-input mono"
                          style={{ width: '52px', textAlign: 'right' }}
                        />
                      </span>
                    </div>

                    <button
                      type="button"
                      className="btn xs"
                      style={{ justifyContent: 'flex-start' }}
                      onClick={() => {
                        setShowToolsMenu(false);
                        setShowCommandPalette(true);
                      }}
                    >
                      {t('Command Palette (⌘K)', 'แถบคำสั่งด่วน (⌘K)')}
                    </button>

                    <button
                      type="button"
                      className="btn xs"
                      style={{ justifyContent: 'flex-start' }}
                      onClick={() => {
                        setShowToolsMenu(false);
                        openAccountsDrawer();
                      }}
                    >
                      {ui.analytics.managePortsCount}
                    </button>

                    <button
                      type="button"
                      className="btn xs"
                      style={{ justifyContent: 'flex-start' }}
                      onClick={() => {
                        commitWorkspaceChange((prev) => ({
                          ...prev,
                          privacyMasked: !prev.privacyMasked,
                        }));
                        toolsTriggerRef.current?.focus();
                        setShowToolsMenu(false);
                      }}
                    >
                      {state.privacyMasked ? ui.topbar.privacyShow : ui.topbar.privacyHide}
                    </button>

                    <button
                      type="button"
                      className="btn xs"
                      style={{ justifyContent: 'flex-start' }}
                      onClick={() => {
                        toolsTriggerRef.current?.focus();
                        setShowToolsMenu(false);
                        printJournalPdfReport();
                      }}
                    >
                      {ui.topbar.printPdf}
                    </button>

                    <button
                      type="button"
                      className="btn xs"
                      style={{ justifyContent: 'flex-start' }}
                      onClick={() => {
                        toolsTriggerRef.current?.focus();
                        setShowToolsMenu(false);
                        setShowAccountsDrawer(false);
                        commitWorkspaceChange((prev) => ({
                          ...prev,
                          showHelpGuide: true,
                          showLicenseModal: false,
                          showDbManager: false,
                          showAddPortForm: false,
                          editingPortId: null,
                        }));
                      }}
                    >
                      {ui.topbar.helpGuide}
                    </button>

                    <button
                      type="button"
                      className="btn xs"
                      style={{ justifyContent: 'flex-start' }}
                      onClick={() => {
                        setShowToolsMenu(false);
                        handleSwitchPage('sec-settings');
                      }}
                    >
                      {ui.pageTitles.settings}
                    </button>

                    <a
                      href={webPortalUrl}
                      className="btn xs web-portal-link"
                      onClick={() => setShowToolsMenu(false)}
                    >
                      {webPortalLabel}
                    </a>

                    <div style={{ display: 'flex', justifyContent: 'flex-start', paddingTop: '2px' }}>
                      <PWAInstallButton lang={deskLang} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="saas-shell">
          {!isMallPage && (
            <section className="preflight-shield" aria-label={t('Pre-Flight Shield Status', 'สถานะตรวจความเสี่ยงก่อนเทรด')}>
              <strong><ShieldCheck size={15} aria-hidden="true" />{t('Pre-Flight Shield Status', 'สถานะตรวจความเสี่ยงก่อนเทรด')}</strong>
              <button
                className="preflight-metric"
                type="button"
                onClick={() => handleSwitchPage('sec-calc')}
                title={t('Daily loss headroom under the 5% model. Open Plan.', 'วงเงินขาดทุนรายวันที่เหลือตามแบบจำลอง 5% เปิดหน้าแผน')}
              >
                {t('Daily DD Headroom', 'วงเงินขาดทุนรายวันที่เหลือ')} <span className="mono">{state.privacyMasked && shieldHeadroom !== '—' ? '••••' : shieldHeadroom}</span>
              </button>
              <button
                className="preflight-metric"
                type="button"
                onClick={() => handleSwitchPage('sec-calc')}
                title={t('Best-day share of cycle profit. Open Plan.', 'สัดส่วนกำไรวันสูงสุดต่อกำไรสุทธิของรอบ เปิดหน้าแผน')}
              >
                {t('Consistency', 'สัดส่วนกำไรวันสูงสุด')} <span className="mono">{state.privacyMasked && shieldConsistency !== '—' ? '••••' : shieldConsistency}</span>
              </button>
              <NewsBlackoutRadar lang={deskLang} firmId={activeFirmId} onOpenRules={handleOpenPropRulesPage} />
            </section>
          )}
          {activeSubtabs.length > 1 && (
            <nav className="workspace-subtabs" aria-label={t('Workspace views', 'มุมมองย่อยในหมวดนี้')}>
              {activeSubtabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`workspace-subtab ${activeNavSection === tab.id ? 'is-active' : ''}`}
                  aria-current={activeNavSection === tab.id ? 'page' : undefined}
                  onClick={() => handleSwitchPage(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          )}
          {!isMallPage && pilotReconnect && (
            <div role="status" style={{ padding: '8px 16px', background: 'var(--rose-soft)', color: 'var(--rose)', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <strong>{t('Reconnect Required', 'ต้องเชื่อมต่อใหม่')}</strong>
              <span>{t('Reconnect through FundedNext Pilot to resume syncing this account.', 'เชื่อมต่อผ่าน FundedNext Pilot เพื่อซิงก์พอร์ตนี้ต่อ')}</span>
              <button type="button" className="btn xs primary" disabled={Boolean(pilotOAuthPort)} onClick={() => {
                openActivePilot();
                if (firebaseUid) {
                  void handleConnectPilot(state.activePort, activePort.fundedNextConnectionId)
                    .catch((error: unknown) => {
                      const message = error instanceof Error ? error.message : '';
                      const english = message === 'กรุณาเข้าสู่ระบบ Desk'
                        ? 'Sign in to Desk first.'
                        : message === 'มีหน้าต่างเชื่อมต่อ FundedNext เปิดอยู่แล้ว'
                        ? 'A FundedNext connection window is already open.'
                        : message && !/\p{Script=Thai}/u.test(message) ? message : 'Could not connect to FundedNext.';
                      addToast(english, message || 'เชื่อมต่อ FundedNext ไม่สำเร็จ');
                    });
                }
              }}>{firebaseUid ? t('Reconnect FundedNext', 'เชื่อมต่อ FundedNext ใหม่') : t('Open FundedNext Pilot', 'เปิด FundedNext Pilot')}</button>
            </div>
          )}
          <div className="desk-workspace">
          <main className={`container${isMallPage ? ' mall-workspace' : ''}`} ref={mainRef}>
            <section id="print-report-header" className="print-only-header">
              <div>
                <div style={{ fontSize: '16px', fontWeight: 600, color: '#18181B' }}>
                  {deskBrandName} · {t('Trade Journal & Portfolio Report', 'สมุดบันทึกเทรดและรายงานพอร์ต')}
                </div>
                <div style={{ fontSize: '12px', color: '#52525B', marginTop: '2px' }}>
                  {state.deskBrandSubtitle === DEFAULT_STATE.deskBrandSubtitle || !state.deskBrandSubtitle
                    ? t('desk.tallynx.com · Risk Analytics & Trade Journal', 'desk.tallynx.com · วิเคราะห์ความเสี่ยงและบันทึกการเทรด')
                    : state.deskBrandSubtitle}
                  {' · '}{t('Selected Account', 'พอร์ตที่เลือก')}: <strong>{formatAccountDisplayName(acc.name, deskLang)}</strong> ({t('Login', 'บัญชี')} #{acc.login})
                </div>
              </div>
              <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#18181B' }}>
                  {ui.analytics.balance}: {displayBalance}{activeIsPilot ? ` · ${t('Journal PnL', 'กำไร/ขาดทุนจากสมุดเทรด')} ${fmtUSD(acc.profit, true)}` : ` (${fmtUSD(acc.profit, true)})`}
                </div>
                <div style={{ fontSize: '11px', color: '#52525B' }}>
                  {t(`Trading days: ${acc.currentDays}/${acc.minDays} · ${acc.tradeCount} trades`, `วันเทรดสะสม: ${acc.currentDays}/${acc.minDays} วัน · ${acc.tradeCount} ไม้`)}
                </div>
              </div>
            </section>

            <CooldownBanner
              cooldownUntil={state.cooldownUntil}
              lang={deskLang}
              onExpire={handleCooldownExpire}
              onEndEarly={handleEndCooldownEarly}
            />

            {/* Multi-Layer Database & Cloud Sync Control Center (Modal Overlay) */}
            {state.showDbManager && activeNavSection !== 'sec-settings' && (
              <DeskDialog
                label={t('Database and Cloud Sync Center', 'ศูนย์จัดการฐานข้อมูลและซิงก์คลาวด์')}
                onClose={() => commitWorkspaceChange((prev) => ({ ...prev, showDbManager: false }))}
                panelClassName="desk-settings-dialog"
                fallback={loadingModule}
              >
                {renderDbSyncCenter(() =>
                  commitWorkspaceChange((prev) => ({ ...prev, showDbManager: false }))
                )}
              </DeskDialog>
            )}

            {/* Onboarding / MT5 Help Guide Modal */}
            {state.showHelpGuide && (
              <DeskDialog
                label={t('Getting Started Guide', 'คู่มือเริ่มต้นใช้งาน')}
                onClose={() => commitWorkspaceChange((prev) => ({
                    ...prev,
                    showHelpGuide: false,
                    onboardingCompleted: true,
                  }))}
                fallback={loadingModule}
              >
                  <HelpGuideModal
                    lang={deskLang}
                    brandName={deskBrandName}
                    onClose={() =>
                      commitWorkspaceChange((prev) => ({
                        ...prev,
                        showHelpGuide: false,
                        onboardingCompleted: true,
                      }))
                    }
                    onOpenImportFile={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                        fileInputRef.current.click();
                      }
                    }}
                  />
              </DeskDialog>
            )}

            {/* Commercial License & Admin Key Management Modal */}
            {state.showLicenseModal && (
              <DeskDialog
                label={t('Plan Access and License Key', 'สิทธิ์การใช้งานและคีย์ใบอนุญาต')}
                onClose={() => commitWorkspaceChange((prev) => ({ ...prev, showLicenseModal: false }))}
                fallback={loadingModule}
              >
                  <LicenseAccessModal
                    lang={deskLang}
                    brandName={deskBrandName}
                    currentUser={currentUser}
                    entitlement={entitlement}
                    isClaimAdmin={isClaimAdmin}
                    inviteKey={inviteKey}
                    onClearInviteKey={() => setInviteKey('')}
                    onClose={() =>
                      commitWorkspaceChange((prev) => ({ ...prev, showLicenseModal: false }))
                    }
                    onGoogleLogin={handleGoogleLogin}
                    onGoogleLogout={async () => {
                      await signOutFirebase();
                      setEntitlement(null);
                      setIsClaimAdmin(false);
                      addToast('Signed out. Local data is still available.', 'ออกจากระบบแล้ว ข้อมูลในเครื่องยังอยู่ครบ');
                    }}
                    onEntitlementUpdated={(next) => setEntitlement(next)}
                    onNotify={(msg) => addToast(msg, undefined, deskLang)}
                  />
              </DeskDialog>
            )}

            {/* Optional Expandable Accounts Modal when clicking "Accounts" in Breadcrumb */}
            {(showAccountsDrawer || state.showAddPortForm || !!state.editingPortId) && (
              <DeskDialog
                label={t('Manage and Switch Accounts', 'จัดการและสลับบัญชีพอร์ต')}
                fallback={loadingModule}
                onClose={() => {
                  setShowAccountsDrawer(false);
                  commitWorkspaceChange((prev) => ({
                    ...prev,
                    showAddPortForm: false,
                    editingPortId: null,
                  }));
                }}
              >
                {renderAccountSwitcher(() => {
                  setShowAccountsDrawer(false);
                  commitWorkspaceChange((prev) => ({
                    ...prev,
                    showAddPortForm: false,
                    editingPortId: null,
                  }));
                })}
              </DeskDialog>
            )}

            {/* ===================================================================== */}
            {/* PAGE 1: PRIMARY ACCOUNT ANALYSIS DASHBOARD (sec-accounts)             */}
            {/* ===================================================================== */}
          <React.Suspense fallback={loadingModule}>
            {activeNavSection === 'sec-accounts' && (
              <AnalyticsSection
                state={state}
                posture={analyticsPosture}
                filteredJournal={filteredJournal}
                ownerEmail={currentUser?.email || null}
                lang={deskLang}
                pilotTelemetry={activeIsPilot ? effectivePilotSnapshot ?? null : undefined}
                livePositions={activeLivePositions}
                telemetrySeries={activeTelemetrySeries}
                liveMonitor={liveMonitorState}
                onManageAccounts={openAccountsDrawer}
                onOpenMt5SyncModal={handleOpenMt5SyncModal}
                onOpenCalculator={handleOpenCalcPage}
                onOpenMall={handleOpenMallDefault}
                onInspectDateInJournal={handleInspectDateInJournal}
              />
            )}

            {/* ===================================================================== */}
            {/* PAGE 2: LIVE XAU/USD TRADINGVIEW CHART (tv-chart-root)                */}
            {/* ===================================================================== */}
            {activeNavSection === 'tv-chart-root' && (
              <TradingViewChartSection
                deskTheme={deskTheme}
                lang={deskLang}
                state={state}
                onUpdateDir={(dir: TradeDirection) =>
                  commitWorkspaceChange((prev) => ({ ...prev, calcDir: dir }))
                }
                onUpdateEntry={(raw: string, num: number) =>
                  commitWorkspaceChange((prev) => ({
                    ...prev,
                    calcEntryRaw: raw,
                    calcEntry: num,
                  }))
                }
                onCopyText={copyText}
                onAnalyzeInCoach={(sym: string) => {
                  setCoachLiveChartSymbol(sym);
                  setCoachPendingPrompt(
                    `วิเคราะห์กราฟสด ${sym} พร้อมสรุปโครงสร้าง EMA20/EMA50, RSI(14), ATR(14), แนวรับ-แนวต้าน และแผนความเสี่ยง 3-TP ปัจจุบัน`
                  );
                  setRightDockFocusTick((n) => n + 1);
                  setShowRightDock(true);
                }}
              />
            )}

            {/* ===================================================================== */}
            {/* PAGE 3: CALCULATOR & CONSISTENCY (calculator-root) */}
            {/* ===================================================================== */}
            {calculatorPage && (
              <div id="sec-calc" className="fx-analysis-root desk-calculator">
                {webSandbox && (
                  <WebSandboxCalculator
                    lang={deskLang}
                    preset={webSandbox}
                    onChange={setWebSandbox}
                    onDismiss={() => setWebSandbox(undefined)}
                  />
                )}
                <div className="fx-kpi-row-4 desk-kpi-band" role="group" aria-label={t('Calculator overview', 'ภาพรวมเครื่องคำนวณ')}>
                  <div className="fx-stat-card">
                    <div className="fx-stat-label">{t('Current Balance', 'ยอดคงเหลือปัจจุบัน')}</div>
                    <div className="fx-stat-val mono sensitive-val">
                      {displayBalance}
                    </div>
                    <div className="fx-stat-sub mono sensitive-val">
                      {activeIsPilot ? t('Journal PnL', 'กำไร/ขาดทุนจากสมุดเทรด') : t('Cumulative PnL', 'กำไร/ขาดทุนสะสม')} {fmtUSD(acc.profit, true)} / {t('Target', 'เป้า')} {fmtUSD(acc.targetProfit)}
                    </div>
                  </div>

                  <div className="fx-stat-card">
                    <div className="fx-stat-label">{t("Today's Quota", 'โควตาเทรดวันนี้')}</div>
                    <div className="fx-stat-val mono">
                      {calculatorPage.tradesToday} / 3 {ui.analytics.tradesUnit}
                    </div>
                    <div className="fx-stat-sub mono">
                      {t('Cycle days', 'วันในรอบ')} {calculatorPage.consistency.tradingDaysCount}/{calculatorPage.consistency.minDays} · {calculatorPage.consistency.hasConsistencyCap
                        ? t(`${calculatorPage.consistency.capPct}% cap`, `เพดาน ${calculatorPage.consistency.capPct}%`)
                        : t('Cap off', 'ปิดเพดาน')}
                    </div>
                  </div>

                  <div className="fx-stat-card" data-kpi="loss-budget">
                    <div className="fx-stat-label">
                      {acc.accountType === 'PERSONAL'
                        ? t('Daily Loss Limit (5% Guard)', 'วงเงินขาดทุนรายวัน (เกณฑ์ 5%)')
                        : t('Daily Loss Budget (5% Cap)', 'วงเงินขาดทุนรายวัน (เพดาน 5%)')}
                    </div>
                    <div className="fx-stat-val mono sensitive-val">
                      {fmtUSD(+(acc.initial * 0.05).toFixed(2))}
                    </div>
                    <div className="fx-stat-sub mono sensitive-val">
                      {acc.accountType === 'PERSONAL'
                        ? `${t('10% DD Guard', 'เกณฑ์ขาดทุน 10%')} ${fmtUSD(+(acc.initial * 0.1).toFixed(2))} · ${ui.analytics.personalMode}`
                        : `${t('Max Drawdown Buffer', 'วงเงินขาดทุนสูงสุดที่เหลือ')} ${fmtUSD(+(acc.initial * 0.1).toFixed(2))}`}
                    </div>
                  </div>

                  <div className="fx-stat-card">
                    <div className="fx-stat-label">{t('Risk per Idea', 'ความเสี่ยงต่อแผนเทรด')}</div>
                    <div className="fx-stat-val mono sensitive-val">
                      {calculatorPage.calc.isValid ? fmtUSD(calculatorPage.calc.risk) : '—'}
                    </div>
                    <div className="fx-stat-sub mono sensitive-val">
                      {calculatorPage.calc.isValid
                        ? t(
                          `${formatCalculatorLot(calculatorPage.calc.totalLot)} L · ${calculatorPage.calc.legs.length} TP · Full ${fmtUSD(calculatorPage.calc.outcomes.FULL_SWEEP.pnlUsd, true)}`,
                          `${formatCalculatorLot(calculatorPage.calc.totalLot)} ล็อต · ${calculatorPage.calc.legs.length} เป้า · ครบเป้า ${fmtUSD(calculatorPage.calc.outcomes.FULL_SWEEP.pnlUsd, true)}`,
                        )
                        : t('Check calculator inputs', 'ตรวจสอบค่าในเครื่องคำนวณ')}
                    </div>
                  </div>
                </div>

                <div className="workspace-grid">
                  <CalculatorPanel
                    lang={deskLang}
                    state={state}
                    calc={calculatorPage.calc}
                    onUpdateMode={(calcMode) =>
                      commitWorkspaceChange((prev) => ({
                        ...prev,
                        calcMode,
                        calcRisk: calcMode === 'GHR_PRESET' && !(prev.calcRisk > 0) ? DEFAULT_STATE.calcRisk : prev.calcRisk,
                      }))
                    }
                    onUpdateConfig={(manualCalculator) =>
                      commitWorkspaceChange((prev) => ({ ...prev, calcMode: 'MANUAL', manualCalculator }))
                    }
                    onUpdateDir={(dir: TradeDirection) =>
                      commitWorkspaceChange((prev) => ({ ...prev, calcDir: dir }))
                    }
                    onUpdateEntry={(raw: string, num: number) =>
                      commitWorkspaceChange((prev) => ({
                      ...prev,
                      calcEntryRaw: raw,
                      calcEntry: num,
                    }))
                  }
                  onUpdateRisk={(nextRisk, unlock) =>
                    commitWorkspaceChange((prev) => ({
                      ...prev,
                      calcRisk: nextRisk,
                      ...(unlock ? { calcMode: 'MANUAL', manualCalculator: GHR_PRESET_CALCULATOR } : {}),
                    }))
                  }
                  onUpdateNote={(note: string) =>
                    commitWorkspaceChange((prev) => ({ ...prev, calcNote: note }))
                  }
                  onToggleGate={(gateKey: keyof QuickGates, checked: boolean) =>
                    commitWorkspaceChange((prev) => {
                      const synced = syncQuickGateToTwelveGates(
                        prev.quickGates,
                        prev.twelveGates,
                        gateKey,
                        checked
                      );
                      return {
                        ...prev,
                        quickGates: synced.quickGates,
                        twelveGates: synced.twelveGates,
                      };
                    })
                  }
                  onCopyText={copyText}
                  onRecordTrade={handleRecordTradeOutcome}
                />

                <ConsistencyPanel
                  lang={deskLang}
                  state={state}
                  rule={calculatorPage.rule}
                  evaluation={calculatorPage.consistency}
                  calc={calculatorPage.calc}
                  onUpdateRule={(patch) =>
                    commitWorkspaceChange((prev) => ({
                      ...prev,
                      consistencyOverrides: {
                        ...prev.consistencyOverrides,
                        [prev.activePort]: { ...prev.consistencyOverrides?.[prev.activePort], ...patch },
                      },
                    }))
                  }
                  onResetRule={() =>
                    commitWorkspaceChange((prev) => {
                      const consistencyOverrides = { ...prev.consistencyOverrides };
                      delete consistencyOverrides[prev.activePort];
                      return { ...prev, consistencyOverrides };
                    })
                  }
                  onSyncFromJournal={() => {
                    const pTrades = stateRef.current.journal.filter(
                      (j) => j.port === stateRef.current.activePort
                    );
                    if (pTrades.length === 0) {
                      addToast('This account has no journal entries yet.', 'พอร์ตนี้ยังไม่มีรายการในสมุดเทรด');
                      return;
                    }
                    commitWorkspaceChange(
                      (prev) => ({
                        ...prev,
                        cycleDays: syncCycleDaysWithJournal(
                          prev.cycleDays,
                          prev.journal,
                          prev.activePort
                        ),
                      }),
                      {
                        snapshotReason: 'ซิงก์กำไรรายวันจาก Journal',
                      }
                    );
                    const accountName = stateRef.current.accounts[stateRef.current.activePort]?.name;
                    addToast(
                      accountName ? `Daily PnL loaded from ${formatAccountDisplayName(accountName, 'en')}.` : 'Daily PnL loaded.',
                      accountName ? `ดึงกำไร/ขาดทุนรายวันจาก ${accountName} แล้ว` : 'ดึงกำไร/ขาดทุนรายวันแล้ว'
                    );
                  }}
                  onSetPreset={(preset) => {
                    let nextDays = stateRef.current.cycleDays;
                    if (preset === 'zero') {
                      nextDays = [
                        { day: 1, note: '', profit: 0 },
                        { day: 2, note: '', profit: 0 },
                        { day: 3, note: '', profit: 0 },
                      ];
                    } else if (preset === 'std3') {
                      nextDays = [
                        { day: 1, note: '1 Full + 1 TL', profit: 120 },
                        { day: 2, note: '1 Full + 1 TL', profit: 120 },
                        { day: 3, note: '1 Full + 1 TL', profit: 120 },
                      ];
                    } else if (preset === 'mix3') {
                      nextDays = [
                        { day: 1, note: '2 Full', profit: 144 },
                        { day: 2, note: '1 Full + 1 TL', profit: 120 },
                        { day: 3, note: '1 Full + 1 TL', profit: 120 },
                      ];
                    }
                    commitWorkspaceChange((prev) => ({ ...prev, cycleDays: nextDays }), {
                      snapshotReason: 'ปรับตารางกำไรขาดทุนรายวัน',
                    });
                  }}
                  onAddDay={() =>
                    commitWorkspaceChange((prev) => ({
                      ...prev,
                      cycleDays: [
                        ...prev.cycleDays,
                        { day: prev.cycleDays.length + 1, note: '', profit: 0 },
                      ],
                    }))
                  }
                  onRemoveDay={() =>
                    commitWorkspaceChange((prev) => ({
                      ...prev,
                      cycleDays:
                        prev.cycleDays.length > 3
                          ? prev.cycleDays.slice(0, -1)
                          : prev.cycleDays,
                    }))
                  }
                  onUpdateDayProfit={(idx, profit) =>
                    commitWorkspaceChange(
                      (prev) => ({
                        ...prev,
                        cycleDays: updateCycleDayEntry(prev.cycleDays, idx, { profit }),
                      }),
                      { broadcastAction: `อัปเดตกำไรวันที่ ${idx + 1}` }
                    )
                  }
                  onUpdateDayNote={(idx, note) =>
                    commitWorkspaceChange(
                      (prev) => ({
                        ...prev,
                        cycleDays: updateCycleDayEntry(prev.cycleDays, idx, { note }),
                      }),
                      { broadcastAction: `บันทึก Daily Notes วันที่ ${idx + 1}` }
                    )
                  }
                />
                </div>
              </div>
            )}

            {/* ===================================================================== */}
            {/* PAGE 4: PRE-TRADE 12-GATE PROTOCOL & 5-STATE LADDER (desk-cards-root) */}
            {/* ===================================================================== */}
            {activeNavSection === 'desk-cards-root' && (
              <DeskReferenceCardsSection
                state={state}
                lang={deskLang}
                onProceedToCalculator={() => handleSwitchPage('calculator-root')}
                onToggleTwelveGate={(key, checked) =>
                  commitWorkspaceChange((prev) => {
                    const nextTwelve = {
                      ...(prev.twelveGates || DEFAULT_TWELVE_GATES),
                      [key]: checked,
                    };
                    const nextQuick = { ...prev.quickGates };
                    if (key === 'g06') nextQuick.g1 = checked;
                    if (key === 'g07') nextQuick.g2 = checked;
                    if (key === 'g09') nextQuick.g3 = checked;
                    if (key === 'g12') {
                      nextQuick.g4 = checked;
                      nextQuick.g5 = checked;
                    }
                    return {
                      ...prev,
                      twelveGates: nextTwelve,
                      quickGates: nextQuick,
                    };
                  })
                }
                onSetAllTwelveGates={(nextGates) =>
                  commitWorkspaceChange(
                    (prev) => ({
                      ...prev,
                      twelveGates: nextGates,
                      quickGates: syncQuickFromTwelveGates(nextGates),
                    }),
                    { broadcastAction: 'อัปเดตด่านตรวจ 12-Gate Fail-Closed Protocol' }
                  )
                }
                onUpdateRisk={(nextRisk) => {
                  commitWorkspaceChange(
                    (prev) => ({
                      ...prev,
                      calcRisk: nextRisk,
                    }),
                    { broadcastAction: `ปรับความเสี่ยงต่อ Idea เป็น $${nextRisk}` }
                  );
                  addToast(`Risk per idea set to $${nextRisk}.`, `ตั้งความเสี่ยงต่อแผนเทรดเป็น $${nextRisk} แล้ว`);
                }}
                onUpdateFiveStateProbs={(nextProbs) =>
                  commitWorkspaceChange((prev) => ({
                    ...prev,
                    fiveStateProbs: nextProbs,
                  }))
                }
                onToggleGoldenRule={(ruleKey, checked) =>
                  commitWorkspaceChange((prev) => ({
                    ...prev,
                    goldenRulesAck: {
                      ...(prev.goldenRulesAck || {}),
                      [ruleKey]: checked,
                    },
                  }))
                }
                onCopyText={copyText}
                onRecordFourLegState={handleRecordFourLegState}
              />
            )}

            {/* ===================================================================== */}
            {/* PAGE 5: TRADE JOURNAL & MT5 REPORT LEDGER (journal-root)              */}
            {/* ===================================================================== */}
            {activeNavSection === 'journal-root' && (
              <TradeJournalSection
                lang={deskLang}
                state={state}
                firebaseUid={currentUser?.uid || null}
                onGetIdToken={async () => (currentUser ? await currentUser.getIdToken().catch(() => null) : null)}
                pilotFeed={activePilotFeed}
                pilotPolling={activePilotAutoSync && Boolean(activePilotAccountId && firebaseUid)}
                pilotOAuthPort={pilotOAuthPort}
                onConnectPilot={handleConnectPilot}
                onCancelPilotOAuth={cancelPilotOAuth}
                onUpdatePilotPorts={updatePilotPorts}
                filteredJournal={filteredJournal}
                onToggleMt5Importer={() =>
                  commitWorkspaceChange((prev) => ({
                    ...prev,
                    showMt5Importer: !prev.showMt5Importer,
                  }))
                }
                onSyncMt5ReadOnly={handleSyncMt5ReadOnly}
                onUpdateMt5Settings={handleUpdateMt5Settings}
                onTriggerImportFile={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                    fileInputRef.current.click();
                  }
                }}
                onExportCsv={exportJournalCSV}
                onPrintPdf={printJournal}
                printRequested={printRequested}
                onToggleInlineEdit={() => {
                  const nextMode = !stateRef.current.inlineEditMode;
                  commitWorkspaceChange((prev) => ({ ...prev, inlineEditMode: nextMode }));
                  if (nextMode) addToast('Inline editing enabled.', 'เปิดโหมดแก้ไขในตารางแล้ว');
                  else addToast('Inline editing disabled.', 'ปิดโหมดแก้ไขในตารางแล้ว');
                }}
                onOpenTradeForm={(show, editTradeId) =>
                  commitWorkspaceChange((prev) => ({
                    ...prev,
                    showManualAddForm: show,
                    editingTradeId: editTradeId,
                  }))
                }
                onSaveFullEditTrade={(record, isEditing) => {
                  commitWorkspaceChange(
                    (prev) => {
                      let nextJournal: TradeRecord[];
                      if (isEditing && prev.editingTradeId) {
                        const idx = prev.journal.findIndex(
                          (t) => t.id === prev.editingTradeId
                        );
                        if (idx !== -1) {
                          nextJournal = [...prev.journal];
                          nextJournal[idx] = record;
                        } else {
                          nextJournal = [record, ...prev.journal];
                        }
                      } else {
                        nextJournal = [record, ...prev.journal];
                      }
                      return {
                        ...prev,
                        journal: nextJournal,
                        editingTradeId: null,
                        showManualAddForm: false,
                      };
                    },
                    {
                      snapshotReason: isEditing
                        ? `Full Edit ไม้ ${record.id}`
                        : `เพิ่มไม้ ${record.id}`,
                      broadcastAction: `${isEditing ? 'แก้ไข' : 'เพิ่ม'}ไม้ ${record.id}`,
                    }
                  );
                  addToast(
                    `${isEditing ? 'Updated trade' : 'Added trade'} ${record.id} (${fmtUSD(record.pnlUsd, true)}).`,
                    `${isEditing ? 'บันทึก Full Edit' : 'เพิ่มรายการเทรด'} ${record.id} (${fmtUSD(
                      record.pnlUsd,
                      true
                    )}) เรียบร้อย`
                  );
                }}
                onInlineUpdateTrade={(tradeId, field, value) =>
                  commitWorkspaceChange(
                    (prev) => ({
                      ...prev,
                      journal: prev.journal.map((r) =>
                        r.id === tradeId ? { ...r, [field]: value } : r
                      ),
                    }),
                    { broadcastAction: `แก้ไขตารางสดไม้ ${tradeId}` }
                  )
                }
                onDuplicateTrade={(tradeId) => {
                  const orig = stateRef.current.journal.find((t) => t.id === tradeId);
                  if (!orig) return;
                  const { gatesPassedAtLog: _sourceGateCount, ...originalFields } = orig;
                  const copy: TradeRecord = {
                    ...originalFields,
                    id: 'T-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
                    time: getBangkokTimeHHMM(),
                    note: orig.note ? orig.note + ' (Copy)' : 'รายการคัดลอก',
                  };
                  commitWorkspaceChange(
                    (prev) => ({
                      ...prev,
                      journal: [copy, ...prev.journal],
                    }),
                    { snapshotReason: `คัดลอกไม้ ${orig.id}` }
                  );
                  addToast(`Trade copied as ${copy.id}.`, `คัดลอกเป็นรายการใหม่ (${copy.id}) แล้ว`);
                }}
                onDeleteTrade={(tradeId) => {
                  commitWorkspaceChange(
                    (prev) => ({
                      ...prev,
                      editingTradeId:
                        prev.editingTradeId === tradeId ? null : prev.editingTradeId,
                      journal: prev.journal.filter((r) => r.id !== tradeId),
                    }),
                    { snapshotReason: `ลบไม้ ${tradeId}` }
                  );
                  addToast('Trade deleted.', 'ลบรายการเทรดแล้ว');
                }}
                onSetStatusFilter={(statusFilter) =>
                  commitWorkspaceChange((prev) => ({
                    ...prev,
                    journalStatusFilter: statusFilter,
                  }))
                }
                onSetDateFilter={(dateFilter) =>
                  commitWorkspaceChange((prev) => ({
                    ...prev,
                    journalDateFilter: dateFilter,
                  }))
                }
                onSetSessionFilter={(sessionFilter) =>
                  commitWorkspaceChange((prev) => ({
                    ...prev,
                    journalSessionFilter: sessionFilter,
                  }))
                }
                onSetPortFilter={(portFilter) =>
                  commitWorkspaceChange((prev) => ({
                    ...prev,
                    journalFilter: portFilter,
                    activePort: portFilter !== 'ALL' ? portFilter : prev.activePort,
                  }))
                }
                onSetSearch={(search) =>
                  commitWorkspaceChange((prev) => ({
                    ...prev,
                    journalSearch: search,
                  }))
                }
                onClearAllData={async () => {
                  await saveWorkspaceToIndexedDB(
                    stateRef.current,
                    'ก่อนรีเซ็ตข้อมูลทั้งหมด',
                    activeUidRef.current
                  );
                  commitWorkspaceChange(
                    () => createCleanWorkspaceState({ theme: stateRef.current.theme, thbRate: stateRef.current.thbRate }),
                    { snapshotReason: 'รีเซ็ตข้อมูลเริ่มต้น' }
                  );
                  addToast(
                    'Default workspace restored. Your previous workspace is available in Database settings.',
                    'รีเซ็ตข้อมูลเป็นค่าเริ่มต้นแล้ว (สามารถกู้คืนได้จากปุ่ม ฐานข้อมูล)'
                  );
                }}
                onToggleAutoSyncForm={(checked) =>
                  commitWorkspaceChange((prev) => ({
                    ...prev,
                    autoSyncFormMetrics: checked,
                  }))
                }
              />
            )}

            {/* ===================================================================== */}
            {/* PAGE 6: DESK-IDEA MARKETPLACE (sec-marketplace)                       */}
            {/* ===================================================================== */}
            {activeNavSection === 'sec-marketplace' && (
              <DeskMarketplaceSection
                lang={deskLang}
                state={state}
                isOnline={isOnline}
                focusListingId={marketListingId}
                onConsumeListingFocus={() => setMarketListingId(undefined)}
                onShareToMall={(listing) => openMall('setup-showroom', listing)}
                onLoadReference={loadDistanceBlueprint}
                onApplyBlueprint={(bp: DeskSetupBlueprint, setupTitle: string) => {
                  if (Object.hasOwn(CALCULATOR_CONTRACTS, bp.primarySymbol.toUpperCase())) {
                    loadDistanceBlueprint({ ...bp, title: setupTitle }, bp.directionMode === 'SELL' ? 'SELL' : 'BUY');
                    return;
                  }
                  commitWorkspaceChange(
                    (prev) => ({
                      ...prev,
                      calcDir: bp.directionMode === 'SELL' ? 'SELL' : 'BUY',
                      calcRisk: bp.riskUsd,
                      calcNote: `[${setupTitle}] ${bp.primarySymbol} (${bp.timeframe}) · SL ${bp.slPoints}p / TP ${bp.tp1Points}-${bp.tp2Points}-${bp.tp3Points}p · ${bp.checklistNotes.join(' | ')}`,
                    }),
                    { snapshotReason: `โหลด Blueprint จาก Marketplace: ${setupTitle}` }
                  );
                  handleSwitchPage('calculator-root');
                  addToast('Loaded the blueprint into Calculator and 12-Gate.', `โหลดแผน "${setupTitle}" ลงเครื่องคำนวณและ 12-Gate แล้ว`);
                }}
                onMarkSetupPurchased={(setupId: string) => {
                  commitWorkspaceChange((prev) => {
                    const existing = prev.purchasedSetupIds || [];
                    if (existing.includes(setupId)) return prev;
                    return { ...prev, purchasedSetupIds: [...existing, setupId] };
                  });
                }}
                onOpenMt5SyncModal={() => {
                  commitWorkspaceChange((prev) => ({ ...prev, showMt5Importer: true }));
                }}
                onSelectPortfolio={(portId: string) => {
                  commitWorkspaceChange((prev) => ({
                    ...prev,
                    activePort: portId,
                    journalFilter: portId,
                  }));
                }}
              />
            )}

            {isMallPage && (
              <CommunityMallSection
                key={mallEntry.zoneId + ':' + (mallEntry.listing?.id || '')}
                lang={deskLang}
                handle={mallHandle}
                entry={mallEntry}
                online={isOnline}
                currentBlueprint={mallBlueprint}
                haveSnapshotSource={!state.privacyMasked && Boolean(mallBridgeKey || (mallAccount && currentUser))}
                getHeaders={mallHeaders}
                verifiedChannel={state.privacyMasked ? undefined : mallChannel}
                rMultipleToday={mallSessionR}
                status={mallStatus}
                onStatusChange={setMallStatus}
                accountName={activePort ? formatAccountDisplayName(activePort.name, deskLang) : '—'}
                accountBalance={state.privacyMasked ? '••••' : activePort ? displayBalance : '—'}
                riskPerIdeaUsd={activePort && !state.privacyMasked ? mallCalculator?.risk : undefined}
                dailyLossBufferUsd={activePort && !state.privacyMasked && (!activeIsPilot || canFallbackToUsdWorkspace(effectivePilotSnapshot?.currency))
                  ? Math.max(0, telemetry.dailyDrawdownLimitUsd - telemetry.dailyDrawdownUsedUsd) : undefined}
                consistencyCapPct={activePort ? cycleRuleStatus.rule.consistencyCapPct : undefined}
                gatesPassedCount={twelveGatePassedCount}
                onOpenCalculator={() => handleSwitchPage('calculator-root')}
                onOpenMarketplace={() => handleSwitchPage('sec-marketplace')}
                onLoadBlueprint={loadDistanceBlueprint}
                onViewListing={(listingId) => {
                  setMarketListingId(listingId);
                  handleSwitchPage('sec-marketplace');
                }}
              />
            )}

            {/* ===================================================================== */}
            {/* PAGE 7: PROPRULES REAL-TIME CHECKER (sec-proprules / #proprules)      */}
            {/* ===================================================================== */}
            {activeNavSection === 'sec-proprules' && (
              <PropRulesSection
                lang={deskLang}
                state={state}
                isOnline={isOnline}
                floatingPnlUsd={floatingPnlUsd}
                onOpenMt5SyncModal={() => {
                  commitWorkspaceChange((prev) => ({ ...prev, showMt5Importer: true }));
                }}
                onAskCoachAboutFirm={(firmName: string) => {
                  setCoachPendingPrompt(
                    `ช่วยวิเคราะห์ความเสี่ยงพอร์ตปัจจุบันเทียบกับกฎล่าสุดของ ${firmName} (Daily DD, Max DD, Consistency Rule และนโยบาย VPS/Sync)`
                  );
                  setShowRightDock(true);
                  setRightDockFocusTick((n) => n + 1);
                }}
              />
            )}

            {/* ===================================================================== */}
            {/* PAGE 9: SETTINGS, PORTFOLIO MANAGEMENT & SYNC CENTER (sec-settings)   */}
            {/* ===================================================================== */}
            {activeNavSection === 'sec-settings' && (
              <SettingsPageSection
                lang={deskLang}
                deskTheme={deskTheme}
                roomMode={deskRoomMode}
                thbRate={state.thbRate}
                privacyMasked={state.privacyMasked}
                onChangeTheme={handleSelectColorTheme}
                onChangeRoomMode={handleSelectRoomMode}
                onChangeLang={setDeskLang}
                onChangeThbRate={(val) => commitWorkspaceChange((prev) => ({ ...prev, thbRate: val }))}
                onTogglePrivacyMask={() =>
                  commitWorkspaceChange((prev) => ({
                    ...prev,
                    privacyMasked: !prev.privacyMasked,
                  }))
                }
                accountsContent={renderAccountSwitcher()}
                syncContent={renderDbSyncCenter()}
              />
            )}
          </React.Suspense>

          {state.showMt5Importer && activeNavSection !== 'journal-root' && (
            <React.Suspense fallback={null}>
              <TradeJournalSection
                modalOnly
                lang={deskLang}
                state={state}
                firebaseUid={currentUser?.uid || null}
                onGetIdToken={async () => (currentUser ? await currentUser.getIdToken().catch(() => null) : null)}
                pilotFeed={activePilotFeed}
                pilotPolling={activePilotAutoSync && Boolean(activePilotAccountId && firebaseUid)}
                pilotOAuthPort={pilotOAuthPort}
                onConnectPilot={handleConnectPilot}
                onCancelPilotOAuth={cancelPilotOAuth}
                onUpdatePilotPorts={updatePilotPorts}
                filteredJournal={filteredJournal}
                onToggleMt5Importer={() =>
                  commitWorkspaceChange((prev) => ({
                    ...prev,
                    showMt5Importer: false,
                  }))
                }
                onSyncMt5ReadOnly={handleSyncMt5ReadOnly}
                onUpdateMt5Settings={handleUpdateMt5Settings}
                onTriggerImportFile={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                    fileInputRef.current.click();
                  }
                }}
                onExportCsv={exportJournalCSV}
                onPrintPdf={printJournal}
                printRequested={printRequested}
                onToggleInlineEdit={() => {}}
                onOpenTradeForm={() => {}}
                onSaveFullEditTrade={() => {}}
                onInlineUpdateTrade={() => {}}
                onDuplicateTrade={() => {}}
                onDeleteTrade={() => {}}
                onSetStatusFilter={() => {}}
                onSetDateFilter={() => {}}
                onSetSessionFilter={() => {}}
                onSetPortFilter={() => {}}
                onSetSearch={() => {}}
                onToggleAutoSyncForm={() => {}}
              />
            </React.Suspense>
          )}
          </main>
          {showRightDock && (
            <React.Suspense fallback={null}>
              <RightDockPanel
                lang={deskLang}
                open={showRightDock}
                onClose={() => setShowRightDock(false)}
                onOpenMall={() => openMall('xauusd-session')}
                workspaceState={state}
                pageSnapshot={activePageSnapshot}
                isOnline={isOnline}
                hasProAccess={isProOrHigher(currentUser, entitlement, isClaimAdmin)}
                alerts={behavioralAlerts}
                analytics={realtimeAnalytics}
                currentUserUid={currentUser?.uid ?? null}
                currentUserLabel={mallHandle}
                rMultipleToday={mallSessionR}
                status={mallStatus}
                onStatusChange={setMallStatus}
                requestedSymbol={coachLiveChartSymbol}
                onClearRequestedSymbol={() => setCoachLiveChartSymbol(null)}
                pendingCoachPrompt={coachPendingPrompt}
                onClearPendingCoachPrompt={() => setCoachPendingPrompt(null)}
                focusCoachTick={rightDockFocusTick}
                onOpenLicenseModal={() => {
                  setShowAccountsDrawer(false);
                  commitWorkspaceChange((prev) => ({
                    ...prev,
                    showLicenseModal: true,
                    showHelpGuide: false,
                    showDbManager: false,
                    showAddPortForm: false,
                    editingPortId: null,
                  }));
                }}
                onUpdateCoachMessages={(chatMessages) =>
                  commitWorkspaceChange(
                    (prev) => ({ ...prev, chatMessages }),
                    { broadcastAction: 'อัปเดตบทสนทนา AI Live Desk' }
                  )
                }
                onUpdateCoachModel={(chatModel) =>
                  commitWorkspaceChange((prev) => ({ ...prev, chatModel }))
                }
                onResetCoachChat={() => {
                  commitWorkspaceChange(
                    (prev) => ({
                      ...prev,
                      chatMessages: DEFAULT_STATE.chatMessages,
                    }),
                    { broadcastAction: 'รีเซ็ตบทสนทนา AI Live Desk' }
                  );
                  addToast('Chat history cleared.', 'ล้างประวัติการสนทนาแล้ว');
                }}
                onQuickDeskAction={(action) => {
                  if (action.type === 'RISK') {
                    const nextRisk = Math.max(5, Number(action.value) || 120);
                    commitWorkspaceChange((prev) => ({ ...prev, calcRisk: nextRisk }));
                    addToast(`Risk per idea set to $${nextRisk}.`, `ตั้งความเสี่ยงต่อแผนเทรดเป็น $${nextRisk} แล้ว`);
                  } else if (action.type === 'PAGE') {
                    handleSwitchPage(String(action.value));
                  } else if (action.type === 'MT5_SYNC') {
                    commitWorkspaceChange((prev) => ({ ...prev, showMt5Importer: true }));
                  }
                }}
                onNotify={(msg) => addToast(msg, undefined, deskLang)}
              />
            </React.Suspense>
          )}
          </div>
        </div>

        <div id="toast-stack" className="toast-stack" aria-live="polite">
          {toasts.filter((toast) => !toast.lang || toast.lang === deskLang).map((toast) => (
            <div key={toast.id} className="toast">
              {deskLang === 'th' ? toast.textTh ?? toast.text : toast.text}
              {toast.action && (
                <button
                  type="button"
                  className="btn xs"
                  onClick={() => {
                    toast.action?.onClick();
                    setToasts((prev) => prev.filter((item) => item.id !== toast.id));
                  }}
                >
                  {t(toast.action.label, toast.action.labelTh)}
                </button>
              )}
            </div>
          ))}
        </div>

        {showCommandPalette && (
          <React.Suspense fallback={null}>
            <CommandPalette
              open={showCommandPalette}
              onClose={() => setShowCommandPalette(false)}
              lang={deskLang}
              theme={deskTheme === 'obsidian' ? 'dark' : 'light'}
              activeNavSection={activeNavSection}
              accounts={state.accounts}
              activePort={state.activePort}
              onSwitchPage={handleSwitchPage}
              onSelectAccount={handleSelectPort}
              onOpenMt5Sync={() =>
                commitWorkspaceChange((prev) => ({ ...prev, showMt5Importer: true }))
              }
              onToggleTheme={() =>
                setDeskTheme((prev) => (prev === 'obsidian' ? 'alabaster' : 'obsidian'))
              }
              onToggleLanguage={() => setDeskLang((prev) => (prev === 'en' ? 'th' : 'en'))}
              onToggleAiCoach={() => setShowRightDock((prev) => !prev)}
            />
          </React.Suspense>
        )}

        <MobileBottomNav
          lang={deskLang}
          activePillar={activePillar}
          onOpenMall={handleOpenMallDefault}
          onSwitchPage={handleSwitchPage}
        />
      </div>
    </div>
  );
}
