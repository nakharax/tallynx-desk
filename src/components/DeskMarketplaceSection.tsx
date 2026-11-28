import React, { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Database, Fingerprint, Layers3, ShieldCheck, Store } from 'lucide-react';
import { BlueprintLadder } from './BlueprintLadder';
import { MarketplaceReferenceLibrary } from './MarketplaceReferenceLibrary';
import type { MallSetupBlueprint } from '../types/mallChat';
import { REFERENCE_WORKSHEETS } from '../utils/referenceWorksheets';
import { navigateDeskTabs } from '../utils/navigateDeskTabs';
import { DeskDialog } from './DeskDialog';
import { auth } from '../services/firebase';
import type {
  DeskSetupBlueprint,
  GhrWorkspaceState,
  MarketplaceDeskSetup,
  Mt5VerificationChannel,
} from '../types/ghr';
import { fmtUSD } from '../utils/ghrRules';
import {
  MARKETPLACE_PAGE_SIZE,
  buildSparklinePoints,
  computeVerifiedSetupMetrics,
  filterAndSortMarketplaceListings,
  hasSha256MarketplaceProof,
  isIntegrityVerifiedSetup,
  maskMt5Login,
  mergeMarketplaceListings,
  validateVerifiedMt5Positions,
  type MarketplaceSortBy,
} from '../utils/marketplaceUtils';
import { deskText, formatAccountDisplayName } from '../utils/deskI18n';
import type { DeskLanguage } from '../utils/deskI18n';
import '../styles/mall-opt.css';

const LOCAL_VERIFIED_CACHE_KEY = 'TREDYN_MARKETPLACE_VERIFIED_CACHE_V1';
type MarketplaceCopy = readonly [english: string, thai: string];
type BlueprintSession = DeskSetupBlueprint['sessionFocus'];

const SESSION_LABELS: Record<BlueprintSession, MarketplaceCopy> = {
  NY: ['New York', 'นิวยอร์ก'],
  LONDON: ['London', 'ลอนดอน'],
  ASIA: ['Asia', 'เอเชีย'],
  ALL: ['All sessions', 'ทุกช่วงตลาด'],
};

function marketplaceError(error: unknown, english: string, thai: string): MarketplaceCopy {
  const detail = error instanceof Error ? error.message : '';
  if (!detail) return [english, thai];
  return /[\u0e00-\u0e7f]/.test(detail) ? [english, detail] : [detail, thai];
}

function formatDirection(direction: string, lang: DeskLanguage): string {
  if (direction === 'BUY') return deskText(lang, 'Buy', 'ซื้อ');
  if (direction === 'SELL') return deskText(lang, 'Sell', 'ขาย');
  if (direction === 'BOTH') return deskText(lang, 'Buy & sell', 'ซื้อและขาย');
  return direction;
}

interface DeskMarketplaceSectionProps {
  lang?: DeskLanguage;
  state: GhrWorkspaceState;
  isOnline: boolean;
  focusListingId?: string;
  onConsumeListingFocus: () => void;
  onShareToMall: (listing: { id: string; title: string; blueprint: { primarySymbol: string } }) => void;
  onLoadReference: (blueprint: MallSetupBlueprint) => void;
  onApplyBlueprint: (blueprint: DeskSetupBlueprint, setupTitle: string) => void;
  onMarkSetupPurchased: (setupId: string) => void;
  onOpenMt5SyncModal: () => void;
  onSelectPortfolio: (portId: string) => void;
}

const CHANNEL_META: Record<
  Mt5VerificationChannel,
  { label: string; toneClass: string; badgeText: MarketplaceCopy }
> = {
  LIVE_BRIDGE: {
    label: 'Live Bridge (.ex5)',
    toneClass: 'mkt-seal emerald',
    badgeText: ['MT5 EA Live Verified', 'ยืนยันจาก MT5 EA แบบสด'],
  },
  DIRECT_INVESTOR: {
    label: 'Investor Password',
    toneClass: 'mkt-seal',
    badgeText: ['Read-Only Broker Verified', 'ยืนยันจากโบรกเกอร์แบบอ่านอย่างเดียว'],
  },
  METAAPI_CLOUD: {
    label: 'MetaApi Cloud',
    toneClass: 'mkt-seal',
    badgeText: ['MetaApi Feed Verified', 'ยืนยันจาก MetaApi'],
  },
  MANUAL_XLSX: {
    label: 'MT5 Statement (.xlsx)',
    toneClass: 'mkt-seal',
    badgeText: ['MT5 Report Verified', 'ยืนยันจากรายงาน MT5'],
  },
  FUNDEDNEXT_MCP: {
    label: 'FundedNext MCP',
    toneClass: 'mkt-seal emerald',
    badgeText: ['FundedNext MCP Verified', 'ยืนยันจาก FundedNext MCP'],
  },
  MYFXBOOK_API: {
    label: 'Myfxbook Cloud API',
    toneClass: 'mkt-seal emerald',
    badgeText: ['Myfxbook Feed Verified', 'ยืนยันจาก Myfxbook'],
  },
  PROJECTX_API: {
    label: 'ProjectX / TopstepX',
    toneClass: 'mkt-seal emerald',
    badgeText: ['Futures API Verified', 'ยืนยันจาก Futures API'],
  },
};

function loadLocalVerifiedCache(): MarketplaceDeskSetup[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_VERIFIED_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isIntegrityVerifiedSetup);
  } catch {
    return [];
  }
}

function saveLocalVerifiedCache(items: MarketplaceDeskSetup[]): void {
  try {
    const clean = items.filter(isIntegrityVerifiedSetup);
    window.localStorage.setItem(LOCAL_VERIFIED_CACHE_KEY, JSON.stringify(clean));
  } catch {
    // Ignore storage quota errors
  }
}

function mapPortChannel(provider?: string): Mt5VerificationChannel {
  switch (provider) {
    case 'LIVE_BRIDGE':
      return 'LIVE_BRIDGE';
    case 'FUNDEDNEXT_MCP':
      return 'FUNDEDNEXT_MCP';
    case 'MYFXBOOK_API':
      return 'MYFXBOOK_API';
    default:
      return 'MANUAL_XLSX';
  }
}

interface EquitySparklineProps {
  curve: ReadonlyArray<{ label: string; equityUsd: number; pnlUsd: number }>;
  netProfit: number;
  lang: DeskLanguage;
}

const EquitySparkline = memo(function EquitySparkline({
  curve,
  netProfit,
  lang,
}: EquitySparklineProps) {
  const points = useMemo(() => buildSparklinePoints(curve, 180, 38), [curve]);
  if (!points) return null;
  const label = deskText(
    lang,
    `Historical equity curve (${netProfit >= 0 ? '+' : ''}${fmtUSD(netProfit)})`,
    `เส้นกราฟ Equity ย้อนหลัง (${netProfit >= 0 ? '+' : ''}${fmtUSD(netProfit)})`,
  );
  return (
    <svg
      viewBox="0 0 180 38"
      role="img"
      aria-label={label}
      style={{ width: '100%', height: '38px', display: 'block' }}
    >
      <polyline
        fill="none"
        stroke={netProfit >= 0 ? 'var(--emerald)' : 'var(--rose)'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
});

interface MarketplaceListingCardProps {
  item: MarketplaceDeskSetup;
  lang: DeskLanguage;
  isOwned: boolean;
  isBusy: boolean;
  onInspect: (setup: MarketplaceDeskSetup) => void;
  onAcquire: (setup: MarketplaceDeskSetup) => void;
  onShareToMall: (setup: MarketplaceDeskSetup) => void;
}

const MarketplaceListingCard = memo(function MarketplaceListingCard({
  item,
  lang,
  isOwned,
  isBusy,
  onInspect,
  onAcquire,
  onShareToMall,
}: MarketplaceListingCardProps) {
  const t = (english: string, thai: string) => deskText(lang, english, thai);
  const channelInfo = CHANNEL_META[item.verificationChannel] || CHANNEL_META.MANUAL_XLSX;
  const canShare = hasSha256MarketplaceProof(item);

  return (
    <article className="mkt-card">
      <div className="mkt-card-content">
        <header className="mkt-card-heading">
          <div className="mkt-card-badges">
            <span className={channelInfo.toneClass}>
              {t(...channelInfo.badgeText)}
              {item.proofOrigin === 'CLIENT_SUBMITTED' ? ` · ${t('Snapshot', 'สแนปช็อต')}` : ''}
            </span>
            <span className="mkt-card-price mono" data-free={item.priceUsd === 0}>
              {item.priceUsd === 0
                ? t('Free setup', 'แผนฟรี')
                : `$${item.priceUsd.toFixed(0)} · ${t('Soon', 'เร็ว ๆ นี้')}`}
            </span>
          </div>
          <div>
            <h3>{item.title}</h3>
            <div className="mkt-card-broker">
              {t('By ', 'โดย ')}
              <strong>{item.sellerName}</strong> ·{' '}
              <span className="mono">
                {item.brokerName} ({maskMt5Login(item.maskedLogin)})
              </span>
            </div>
          </div>
        </header>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <span className="pill blue">{item.blueprint.primarySymbol}</span>
          <span className="pill">{item.blueprint.timeframe}</span>
          <span
            className={`pill ${
              item.blueprint.directionMode === 'BUY'
                ? 'emerald'
                : item.blueprint.directionMode === 'SELL'
                  ? 'rose'
                  : 'blue'
            }`}
          >
            {formatDirection(item.blueprint.directionMode, lang)}
          </span>
          <span className="pill">
            {item.metrics.tradeCount}
            {t(' MT5 Deals', ' ดีล MT5')}
          </span>
        </div>

        <p
          style={{
            margin: 0,
            fontSize: '12px',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}
        >
          {item.summary}
        </p>

        <EquitySparkline
          curve={item.metrics.equityCurve}
          netProfit={item.metrics.netProfitUsd}
          lang={lang}
        />

        <div className="mkt-card-metrics">
          <div className="mkt-metric-cell">
            <span className="mkt-metric-label">{t('Win Rate', 'อัตราชนะ')}</span>
            <span className="mkt-metric-val" style={{ color: 'var(--emerald-ink)' }}>
              {item.metrics.winRatePct.toFixed(1)}%
            </span>
          </div>
          <div className="mkt-metric-cell">
            <span className="mkt-metric-label">{t('Profit Factor', 'Profit Factor')}</span>
            <span className="mkt-metric-val" style={{ color: 'var(--blue)' }}>
              {item.metrics.profitFactor.toFixed(2)}
            </span>
          </div>
          <div className="mkt-metric-cell">
            <span className="mkt-metric-label">{t('Max DD', 'ขาดทุนสะสมสูงสุด')}</span>
            <span className="mkt-metric-val" style={{ color: 'var(--rose-ink)' }}>
              {item.metrics.maxDrawdownPct.toFixed(1)}%
            </span>
          </div>
          <div className="mkt-metric-cell">
            <span className="mkt-metric-label">{t('Net P&L', 'กำไร/ขาดทุนสุทธิ')}</span>
            <span
              className="mkt-metric-val"
              style={{
                color:
                  item.metrics.netProfitUsd >= 0 ? 'var(--emerald-ink)' : 'var(--rose-ink)',
              }}
            >
              {item.metrics.netProfitUsd >= 0 ? '+' : ''}
              {fmtUSD(item.metrics.netProfitUsd)}
            </span>
          </div>
        </div>
        <BlueprintLadder lang={lang} distances={item.blueprint} />
      </div>

      <div className="mkt-card-actions">
        {canShare && (
          <button
            type="button"
            className="btn sm mkt-share-to-mall"
            onClick={() => onShareToMall(item)}
          >
            {t('Share to Mall Showroom', 'แชร์เข้าห้อง Mall Showroom')}
          </button>
        )}
        <button type="button" className="btn sm" onClick={() => onInspect(item)}>
          {t('View MT5 proof', 'ตรวจ Proof MT5')}
        </button>

        <button
          type="button"
          className={`btn sm ${isOwned ? 'emerald' : item.priceUsd > 0 ? '' : 'primary'}`}
          disabled={isBusy || (!isOwned && item.priceUsd > 0)}
          title={
            !isOwned && item.priceUsd > 0
              ? t(
                  'Paid checkout is coming soon — free community blueprints ($0) are available now.',
                  'ระบบชำระเงินสำหรับแผนมีค่าใช้จ่ายกำลังจะเปิดเร็ว ๆ นี้ — ใช้แผนฟรี ($0) ได้ทันที',
                )
              : undefined
          }
          onClick={() => onAcquire(item)}
        >
          {isBusy
            ? t('Working…', 'กำลังดำเนินการ...')
            : isOwned
              ? t('Load into Calculator →', 'โหลดลง Calculator →')
              : item.priceUsd === 0
                ? t('Get free setup & load it', 'รับฟรี & โหลดลง Desk')
                : t(
                    `Checkout coming soon ($${item.priceUsd.toFixed(0)})`,
                    `ระบบชำระเงินเร็ว ๆ นี้ ($${item.priceUsd.toFixed(0)})`,
                  )}
        </button>
      </div>
    </article>
  );
});

interface SavedBlueprintCardProps {
  item: MarketplaceDeskSetup;
  lang: DeskLanguage;
  onInspect: (setup: MarketplaceDeskSetup) => void;
  onShareToMall: (setup: MarketplaceDeskSetup) => void;
  onLoad: (setup: MarketplaceDeskSetup) => void;
}

const SavedBlueprintCard = memo(function SavedBlueprintCard({
  item,
  lang,
  onInspect,
  onShareToMall,
  onLoad,
}: SavedBlueprintCardProps) {
  const t = (english: string, thai: string) => deskText(lang, english, thai);
  return (
    <article className="mkt-card">
      <div>
        <h4 className="mkt-section-title">{item.title}</h4>
        <ul className="mkt-library-meta">
          <li className="mono">
            {item.blueprint.primarySymbol} · {item.blueprint.timeframe}
          </li>
          <li>{formatDirection(item.blueprint.directionMode, lang)}</li>
          <li>
            {t('Risk', 'ความเสี่ยง')} <span className="mono">{fmtUSD(item.blueprint.riskUsd)}</span>
          </li>
          <li>
            SL <span className="mono">{item.blueprint.slPoints}</span> {t('pts', 'แต้ม')}
          </li>
        </ul>
      </div>
      <div className="mkt-card-actions">
        <button type="button" className="btn sm" onClick={() => onInspect(item)}>
          {t('MT5 proof', 'หลักฐาน MT5')}
        </button>
        {hasSha256MarketplaceProof(item) && (
          <button
            type="button"
            className="btn sm mkt-share-to-mall"
            onClick={() => onShareToMall(item)}
          >
            {t('Share to Mall Showroom', 'แชร์เข้าห้อง Mall Showroom')}
          </button>
        )}
        <button type="button" className="btn sm emerald" onClick={() => onLoad(item)}>
          {t('Load blueprint', 'โหลดบลูพรินต์')}
        </button>
      </div>
    </article>
  );
});

interface PublishedBlueprintCardProps {
  item: MarketplaceDeskSetup;
  lang: DeskLanguage;
  isBusy: boolean;
  onShareToMall: (setup: MarketplaceDeskSetup) => void;
  onDelist: (setupId: string) => void;
}

const PublishedBlueprintCard = memo(function PublishedBlueprintCard({
  item,
  lang,
  isBusy,
  onShareToMall,
  onDelist,
}: PublishedBlueprintCardProps) {
  const t = (english: string, thai: string) => deskText(lang, english, thai);
  return (
    <article className="mkt-card">
      <div>
        <h4 className="mkt-section-title">{item.title}</h4>
        <div className="mkt-proof-block">
          <div className="mkt-caption">{t('SHA-256 proof', 'หลักฐาน SHA-256')}</div>
          <div className="mkt-proof-hash">{item.proofHash}</div>
        </div>
      </div>
      <div className="mkt-card-actions">
        {hasSha256MarketplaceProof(item) && (
          <button
            type="button"
            className="btn sm mkt-share-to-mall"
            onClick={() => onShareToMall(item)}
          >
            {t('Share to Mall Showroom', 'แชร์เข้าห้อง Mall Showroom')}
          </button>
        )}
        <span className="mkt-caption">
          <span className="mono">{item.buyerCount}</span> {t('acquired', 'ครั้งที่เพิ่มเข้าคลัง')}
        </span>
        <button
          type="button"
          className="btn sm rose"
          disabled={isBusy}
          onClick={() => onDelist(item.id)}
        >
          {isBusy ? t('Removing…', 'กำลังนำออก…') : t('Remove listing', 'นำออกจากตลาด')}
        </button>
      </div>
    </article>
  );
});

export const DeskMarketplaceSection: React.FC<DeskMarketplaceSectionProps> = ({
  lang = 'en',
  state,
  isOnline,
  focusListingId,
  onConsumeListingFocus,
  onShareToMall,
  onLoadReference,
  onApplyBlueprint,
  onMarkSetupPurchased,
  onOpenMt5SyncModal,
  onSelectPortfolio,
}) => {
  const t = (english: string, thai: string) => deskText(lang, english, thai);
  const [activeTab, setActiveTab] = useState<'BUY' | 'SELL' | 'LIBRARY'>('BUY');
  const [listings, setListings] = useState<MarketplaceDeskSetup[]>(() => loadLocalVerifiedCache());
  const listingsRef = useRef(listings);
  listingsRef.current = listings;
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<MarketplaceCopy | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<MarketplaceCopy | null>(null);
  const [justPublished, setJustPublished] = useState<MarketplaceDeskSetup | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Browse filters
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const isSearchStale = searchQuery !== deferredSearchQuery;
  const [symbolFilter, setSymbolFilter] = useState('ALL');
  const [channelFilter, setChannelFilter] = useState<'ALL' | Mt5VerificationChannel>('ALL');
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'BUY' | 'SELL' | 'BOTH'>('ALL');
  const [sortBy, setSortBy] = useState<MarketplaceSortBy>('PF_DESC');
  const [visibleCount, setVisibleCount] = useState(MARKETPLACE_PAGE_SIZE);

  // Proof Inspector modal
  const [inspectSetup, setInspectSetup] = useState<MarketplaceDeskSetup | null>(null);

  // Publish form states
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [priceUsd, setPriceUsd] = useState<number>(0);
  const [sellerName, setSellerName] = useState(
    () =>
      auth.currentUser?.displayName ||
      auth.currentUser?.email?.split('@')[0] ||
      'Verified Desk Trader',
  );
  const [bpSymbol, setBpSymbol] = useState('XAUUSD');
  const [bpTimeframe, setBpTimeframe] = useState('15m');
  const [bpSession, setBpSession] = useState<BlueprintSession>('NY');
  const [bpDirection, setBpDirection] = useState<'BUY' | 'SELL' | 'BOTH'>('BOTH');
  const [bpRiskUsd, setBpRiskUsd] = useState<number>(state.calcRisk || 300);
  const [bpSlPoints, setBpSlPoints] = useState<number>(200);
  const [bpTp1Points, setBpTp1Points] = useState<number>(400);
  const [bpTp2Points, setBpTp2Points] = useState<number>(800);
  const [bpTp3Points, setBpTp3Points] = useState<number>(1500);
  const [bpChecklistInput, setBpChecklistInput] = useState<string | null>(state.calcNote || null);
  const bpChecklistText =
    bpChecklistInput ??
    t(
      'MT5 trade sample, risk assumptions, and SL/TP settings',
      'ดีล MT5 ที่ใช้วิเคราะห์ สมมติฐานความเสี่ยง และค่า SL/TP',
    );
  const [publishing, setPublishing] = useState(false);

  const listingPriceUsd = Math.max(0, Number(priceUsd) || 0);
  const blueprintFields = useMemo(
    () => ({
      primarySymbol: bpSymbol.trim().toUpperCase() || 'XAUUSD',
      timeframe: bpTimeframe.trim() || '15m',
      sessionFocus: bpSession,
      directionMode: bpDirection,
      riskUsd: Math.max(10, Number(bpRiskUsd) || 300),
      slPoints: Math.max(10, Number(bpSlPoints) || 200),
      tp1Points: Math.max(10, Number(bpTp1Points) || 400),
      tp2Points: Math.max(10, Number(bpTp2Points) || 800),
      tp3Points: Math.max(10, Number(bpTp3Points) || 1500),
    }),
    [
      bpSymbol,
      bpTimeframe,
      bpSession,
      bpDirection,
      bpRiskUsd,
      bpSlPoints,
      bpTp1Points,
      bpTp2Points,
      bpTp3Points,
    ],
  );

  const currentUid = auth.currentUser?.uid || null;
  const purchasedIds = useMemo(
    () => new Set(state.purchasedSetupIds || []),
    [state.purchasedSetupIds],
  );

  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setErrorMsg(null);
    const cached = loadLocalVerifiedCache();

    void (async () => {
      try {
        const res = await fetch('/api/marketplace/listings', { signal: abort.signal });
        const data = await res.json();
        if (abort.signal.aborted) return;
        if (!res.ok || !data?.ok || !Array.isArray(data.listings)) {
          throw new Error(data?.error || '');
        }
        const merged = mergeMarketplaceListings(data.listings as MarketplaceDeskSetup[], cached);
        setListings(merged);
        saveLocalVerifiedCache(merged);
      } catch (err) {
        if (abort.signal.aborted) return;
        setListings(cached);
        if (isOnline) {
          setErrorMsg(
            marketplaceError(
              err,
              "Couldn't refresh marketplace listings. Showing cached listings.",
              'โหลดรายการตลาดไม่ได้ กำลังแสดงรายการที่บันทึกไว้',
            ),
          );
        }
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    })();

    return () => abort.abort();
  }, [isOnline]);

  useEffect(() => {
    if (!focusListingId) return;
    if (REFERENCE_WORKSHEETS.some((item) => item.id === focusListingId)) {
      setActiveTab('BUY');
      return;
    }
    const listing = listings.find((item) => item.id === focusListingId);
    if (listing) {
      setInspectSetup(listing);
      onConsumeListingFocus();
    } else if (!loading) {
      setErrorMsg([
        'This Marketplace listing is currently unavailable.',
        'รายการ Marketplace นี้ยังไม่พร้อมใช้งาน',
      ]);
    }
  }, [focusListingId, listings, loading, onConsumeListingFocus]);

  // Reset pagination when browse filters change
  useEffect(() => {
    setVisibleCount(MARKETPLACE_PAGE_SIZE);
  }, [deferredSearchQuery, symbolFilter, channelFilter, directionFilter, sortBy]);

  // Lazily audit user portfolios only when the SELL tab is active
  const portfolioAudits = useMemo(() => {
    if (activeTab !== 'SELL') return [];
    const accountList = Object.values(state.accounts || {});
    return accountList.map((acc) => {
      const rawReport = state.mt5RawReports?.[acc.id];
      const rawPositions = rawReport?.positions || [];
      const { valid, rejectedCount } = validateVerifiedMt5Positions(rawPositions);
      const initialDep = rawReport?.meta?.initialDeposit || acc.initial || 10000;
      const metrics = valid.length > 0 ? computeVerifiedSetupMetrics(valid, initialDep, true) : null;
      const channel = mapPortChannel(acc.syncProvider);
      return {
        acc,
        rawReport,
        validPositions: valid,
        rejectedCount,
        metrics,
        channel,
        isVerified: valid.length > 0 && metrics !== null,
      };
    });
  }, [activeTab, state.accounts, state.mt5RawReports]);

  const selectedAudit = useMemo(
    () => portfolioAudits.find((p) => p.acc.id === state.activePort) || portfolioAudits[0] || null,
    [portfolioAudits, state.activePort],
  );

  const verifiedListingsCount = useMemo(() => {
    let count = 0;
    for (let i = 0; i < listings.length; i += 1) {
      if (hasSha256MarketplaceProof(listings[i])) count += 1;
    }
    return count;
  }, [listings]);

  const filteredListings = useMemo(
    () =>
      filterAndSortMarketplaceListings(listings, {
        searchQuery: deferredSearchQuery,
        symbolFilter,
        channelFilter,
        directionFilter,
        sortBy,
      }),
    [listings, deferredSearchQuery, symbolFilter, channelFilter, directionFilter, sortBy],
  );

  const visibleListings = useMemo(
    () =>
      filteredListings.length <= visibleCount
        ? filteredListings
        : filteredListings.slice(0, visibleCount),
    [filteredListings, visibleCount],
  );

  const remainingCount = Math.max(0, filteredListings.length - visibleListings.length);
  const hasBrowseFilters =
    searchQuery.trim().length > 0 ||
    symbolFilter !== 'ALL' ||
    channelFilter !== 'ALL' ||
    directionFilter !== 'ALL';

  const myPublishedListings = useMemo(() => {
    return listings.filter(
      (item) =>
        isIntegrityVerifiedSetup(item) &&
        ((currentUid && item.sellerUid === currentUid) || item.sellerUid === 'local-verified'),
    );
  }, [listings, currentUid]);

  const myAcquiredListings = useMemo(() => {
    return listings.filter(
      (item) =>
        isIntegrityVerifiedSetup(item) &&
        (purchasedIds.has(item.id) || (currentUid && item.sellerUid === currentUid)),
    );
  }, [listings, purchasedIds, currentUid]);

  const resetBrowseFilters = useCallback(() => {
    setSearchQuery('');
    setSymbolFilter('ALL');
    setChannelFilter('ALL');
    setDirectionFilter('ALL');
  }, []);

  const handleInspectSetup = useCallback((setup: MarketplaceDeskSetup) => {
    setInspectSetup(setup);
  }, []);

  const handleLoadLibraryBlueprint = useCallback(
    (item: MarketplaceDeskSetup) => {
      onApplyBlueprint(item.blueprint, item.title);
      setNoticeMsg([
        `Loaded “${item.title}” into the Calculator and 12-Gate.`,
        `โหลด "${item.title}" ลง Calculator & 12-Gate เรียบร้อย`,
      ]);
    },
    [onApplyBlueprint],
  );

  const handleAcquireSetup = useCallback(
    async (setup: MarketplaceDeskSetup) => {
      setErrorMsg(null);
      setNoticeMsg(null);
      const alreadyOwned =
        purchasedIds.has(setup.id) || (currentUid && setup.sellerUid === currentUid);

      if (alreadyOwned) {
        onApplyBlueprint(setup.blueprint, setup.title);
        setNoticeMsg([
          `Loaded “${setup.title}” into the Calculator and 12-Gate.`,
          `โหลด Blueprint "${setup.title}" ลง Calculator & 12-Gate เรียบร้อยแล้ว`,
        ]);
        return;
      }

      if (setup.priceUsd > 0) {
        setErrorMsg([
          'Paid marketplace checkout is not yet active. Free community blueprints ($0) are available now.',
          'ระบบชำระเงินสำหรับแผนมีค่าใช้จ่ายยังไม่เปิดใช้งาน สามารถใช้งานแผนชุมชนฟรี ($0) ได้ทันที',
        ]);
        return;
      }

      const user = auth.currentUser;
      if (!user) {
        setErrorMsg([
          'Sign in with Google to add a setup to your library.',
          'เข้าสู่ระบบด้วย Google เพื่อเพิ่มชุดตั้งค่าในคลัง',
        ]);
        return;
      }

      setBusyId(setup.id);
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/marketplace/purchase', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ setupId: setup.id }),
        });
        const data = await res.json();
        if (res.status === 501 || data?.error === 'PAYMENT_GATEWAY_REQUIRED') {
          setErrorMsg([
            data?.message || 'Paid marketplace checkout is not yet active. Free community blueprints ($0) are available now.',
            'ระบบชำระเงินสำหรับแผนมีค่าใช้จ่ายยังไม่เปิดใช้งาน สามารถใช้งานแผนชุมชนฟรี ($0) ได้ทันที',
          ]);
          return;
        }
        if (!res.ok || !data?.ok) {
          throw new Error(data?.error || '');
        }
        const next = listingsRef.current.map((item) =>
          item.id === setup.id
            ? { ...item, buyerCount: data.buyerCount ?? item.buyerCount + 1 }
            : item,
        );
        setListings(next);
        saveLocalVerifiedCache(next);
        onMarkSetupPurchased(setup.id);
        onApplyBlueprint(setup.blueprint, setup.title);
        setNoticeMsg([
          `Added “${setup.title}” to the Calculator for free.`,
          `โหลดชุดตั้งค่า “${setup.title}” เข้าเครื่องคำนวณแล้ว (ฟรี)`,
        ]);
      } catch (err) {
        setErrorMsg(marketplaceError(err, "Couldn't add the setup", 'เพิ่มชุดตั้งค่าไม่ได้'));
      } finally {
        setBusyId(null);
      }
    },
    [purchasedIds, currentUid, onApplyBlueprint, onMarkSetupPurchased],
  );

  const handlePublishSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setNoticeMsg(null);

    if (!selectedAudit || !selectedAudit.isVerified || !selectedAudit.metrics) {
      setErrorMsg([
        'The selected account needs verified MT5 history from Live Bridge (.ex5), an official cloud API or an MT5 .xlsx report.',
        'พอร์ตที่เลือกยังไม่ผ่านการยืนยันข้อมูล MT5 จริง (ต้องมีประวัติเทรดจาก Live Bridge (.ex5), Cloud API ทางการ หรือ MT5 .xlsx)',
      ]);
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setErrorMsg([
        'Sign in with Google to publish a verified desk setup.',
        'กรุณาเข้าสู่ระบบ Google ก่อนลงขายหรือเผยแพร่ Verified Desk Setup',
      ]);
      return;
    }

    const cleanTitle = title.trim();
    const cleanSummary = summary.trim();
    if (cleanTitle.length < 4) {
      setErrorMsg([
        'Enter a setup name of at least 4 characters.',
        'กรุณาตั้งชื่อ Setup อย่างน้อย 4 ตัวอักษร',
      ]);
      return;
    }
    if (cleanSummary.length < 10) {
      setErrorMsg([
        'Describe the setup rules or instructions in at least 10 characters.',
        'กรุณาระบุคำอธิบายกติกา / วิธีใช้งาน Desk Setup อย่างน้อย 10 ตัวอักษร',
      ]);
      return;
    }

    const notesArray = bpChecklistText
      .split(/\n|\+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const blueprint: DeskSetupBlueprint = {
      ...blueprintFields,
      checklistNotes: notesArray.length > 0 ? notesArray : ['Checklist 3-TP Standard'],
      executionPlaybook: cleanSummary,
    };

    setPublishing(true);
    try {
      const token = await user.getIdToken();
      const acc = selectedAudit.acc;
      const meta = selectedAudit.rawReport?.meta;
      const publishHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };
      if (selectedAudit.channel === 'LIVE_BRIDGE' && acc.tredynApiKey?.trim()) {
        publishHeaders['X-TallyNX-Api-Key'] = acc.tredynApiKey.trim();
      }
      const res = await fetch('/api/marketplace/publish', {
        method: 'POST',
        headers: publishHeaders,
        body: JSON.stringify({
          title: cleanTitle,
          summary: cleanSummary,
          priceUsd: listingPriceUsd,
          sellerName: sellerName.trim() || 'Verified Desk Trader',
          verificationChannel: selectedAudit.channel,
          brokerName: meta?.broker || 'MT5 Verified Broker',
          brokerServer: acc.investorLabel || meta?.broker || 'Verified-MT5-Server',
          login: meta?.login || acc.login || acc.id,
          initialDeposit: meta?.initialDeposit || acc.initial || 10000,
          mt5Positions: selectedAudit.validPositions,
          blueprint,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data?.listing) {
        throw new Error(data?.error || '');
      }

      const published = data.listing as MarketplaceDeskSetup;
      setJustPublished(published);
      const next = mergeMarketplaceListings([published], listingsRef.current);
      setListings(next);
      saveLocalVerifiedCache(next);
      onMarkSetupPurchased(published.id);
      setTitle('');
      setSummary('');
      setActiveTab('BUY');
      setNoticeMsg([
        `Published “${published.title}”. The server verified ${published.metrics.tradeCount} MT5 deals and issued a proof hash.`,
        `เผยแพร่ "${published.title}" สำเร็จ! เซิร์ฟเวอร์ตรวจสอบ ${published.metrics.tradeCount} ดีล MT5 จริงและออก Proof Hash เรียบร้อย`,
      ]);
    } catch (err) {
      setErrorMsg(marketplaceError(err, "Couldn't publish the setup", 'เผยแพร่แผนเทรดไม่ได้'));
    } finally {
      setPublishing(false);
    }
  };

  const handleDelistSetup = useCallback(async (setupId: string) => {
    const user = auth.currentUser;
    if (!user) {
      setErrorMsg(['Sign in to manage your listings.', 'กรุณาเข้าสู่ระบบเพื่อจัดการประกาศของคุณ']);
      return;
    }
    setBusyId(setupId);
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/marketplace/listings/${encodeURIComponent(setupId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || '');
      }
      const next = listingsRef.current.filter((item) => item.id !== setupId);
      setListings(next);
      saveLocalVerifiedCache(next);
      setNoticeMsg([
        'The setup was removed from the marketplace.',
        'นำ Setup ออกจาก Marketplace แล้ว',
      ]);
    } catch (err) {
      setErrorMsg(marketplaceError(err, "Couldn't remove the listing", 'นำประกาศออกจากตลาดไม่ได้'));
    } finally {
      setBusyId(null);
    }
  }, []);

  return (
    <section id="sec-market" className="mkt-page">
      {/* Header / Safe Harbor Banner */}
      <div className="mkt-hero">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '680px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h2 className="card-title" style={{ margin: 0 }}>
              <span className="market-emblem">
                <Store size={18} />
              </span>
              <span>{t('Desk Marketplace', 'ตลาดชุดตั้งค่า')}</span>
            </h2>
            <span className="mkt-seal">{t('MT5-verified listings', 'รายการที่ตรวจจาก MT5')}</span>
          </div>
          <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {t(
              'Compare 3-TP setups using past MT5 trade stats and a SHA-256 proof hash.',
              'เทียบแผน 3-TP จากสถิติเทรดย้อนหลังใน MT5 พร้อมแฮช SHA-256',
            )}{' '}
            <strong>
              {t('For risk and statistical analysis only.', 'สำหรับวิเคราะห์ความเสี่ยงและสถิติเท่านั้น')}
            </strong>
          </p>
        </div>

        <div
          className="mkt-tabs"
          role="tablist"
          onKeyDown={navigateDeskTabs}
          aria-label={t('Marketplace views', 'หน้าตลาดชุดตั้งค่า')}
        >
          <button
            type="button"
            role="tab"
            id="marketplace-BUY-tab"
            aria-controls="marketplace-panel"
            aria-selected={activeTab === 'BUY'}
            tabIndex={activeTab === 'BUY' ? 0 : -1}
            className={`mkt-tab-btn ${activeTab === 'BUY' ? 'active' : ''}`}
            onClick={() => setActiveTab('BUY')}
          >
            {t('Browse & Buy (', 'เลือกดูและซื้อ (')}
            {filteredListings.length})
          </button>
          <button
            type="button"
            role="tab"
            id="marketplace-SELL-tab"
            aria-controls="marketplace-panel"
            aria-selected={activeTab === 'SELL'}
            tabIndex={activeTab === 'SELL' ? 0 : -1}
            className={`mkt-tab-btn ${activeTab === 'SELL' ? 'active' : ''}`}
            onClick={() => setActiveTab('SELL')}
          >
            {t('Sell Verified Setup', 'ขายแผนเทรดที่ยืนยันแล้ว')}
          </button>
          <button
            type="button"
            role="tab"
            id="marketplace-LIBRARY-tab"
            aria-controls="marketplace-panel"
            aria-selected={activeTab === 'LIBRARY'}
            tabIndex={activeTab === 'LIBRARY' ? 0 : -1}
            className={`mkt-tab-btn ${activeTab === 'LIBRARY' ? 'active' : ''}`}
            onClick={() => setActiveTab('LIBRARY')}
          >
            {t('My Library (', 'คลังของฉัน (')}
            {myAcquiredListings.length + myPublishedListings.length})
          </button>
        </div>
      </div>

      <dl className="market-trust-tape" aria-label={t('Marketplace telemetry', 'สถิติตลาดชุดตั้งค่า')}>
        <div className="market-trust-tile">
          <dt>
            <span className="market-trust-icon" aria-hidden="true">
              <ShieldCheck size={16} />
            </span>
            {t('Verified listings', 'รายการที่ยืนยันแล้ว')}
          </dt>
          <dd>{loading && !listings.length ? '—' : verifiedListingsCount}</dd>
        </div>
        <div className="market-trust-tile">
          <dt>
            <span className="market-trust-icon" aria-hidden="true">
              <Layers3 size={16} />
            </span>
            {t('Reference worksheets', 'เวิร์กชีตอ้างอิง')}
          </dt>
          <dd>{REFERENCE_WORKSHEETS.length}</dd>
        </div>
        <div className="market-trust-tile">
          <dt>
            <span className="market-trust-icon" aria-hidden="true">
              <Fingerprint size={16} />
            </span>
            {t('Proof algorithm', 'อัลกอริทึมหลักฐาน')}
          </dt>
          <dd>SHA-256</dd>
        </div>
      </dl>

      {noticeMsg && (
        <div
          role="status"
          aria-live="polite"
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--emerald-border)',
            background: 'var(--emerald-soft)',
            color: 'var(--emerald)',
            fontSize: '12.5px',
            fontWeight: 600,
          }}
        >
          {t(...noticeMsg)}
          {justPublished && hasSha256MarketplaceProof(justPublished) && (
            <div className="mkt-publish-share">
              <button
                type="button"
                className="btn sm mkt-share-to-mall"
                onClick={() => onShareToMall(justPublished)}
              >
                {t('Share to Mall Showroom', 'แชร์เข้าห้อง Mall Showroom')}
              </button>
            </div>
          )}
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--rose-border)',
            background: 'var(--rose-soft)',
            color: 'var(--rose)',
            fontSize: '12.5px',
            fontWeight: 600,
          }}
        >
          {t(...errorMsg)}
        </div>
      )}

      <div
        className="mkt-tab-panel"
        id="marketplace-panel"
        role="tabpanel"
        aria-labelledby={`marketplace-${activeTab}-tab`}
        tabIndex={0}
      >
        {/* TAB 1: BROWSE & BUY */}
        {activeTab === 'BUY' && (
          <>
            <MarketplaceReferenceLibrary
              lang={lang}
              hasListings={listings.length > 0}
              focusId={focusListingId}
              onConsumeFocus={onConsumeListingFocus}
              onShare={onShareToMall}
              onLoad={onLoadReference}
            />
            <h3 className="market-listings-title">
              <Database size={16} />
              {t('Verified MT5 listings', 'รายการที่ตรวจจาก MT5')}
            </h3>
            <div className="mkt-filter-bar">
              <input
                type="search"
                aria-label={t('Search setups', 'ค้นหาชุดตั้งค่า')}
                placeholder={t(
                  'Search setups, symbols, brokers…',
                  'ค้นหาชุดตั้งค่า สินทรัพย์ โบรกเกอร์…',
                )}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <select
                className="mono"
                aria-label={t('Filter by symbol', 'กรองตามสินทรัพย์')}
                value={symbolFilter}
                onChange={(e) => setSymbolFilter(e.target.value)}
              >
                <option value="ALL">{t('All symbols', 'ทุกสินทรัพย์')}</option>
                <option value="XAUUSD">XAUUSD</option>
                <option value="EURUSD">EURUSD</option>
                <option value="GBPUSD">GBPUSD</option>
                <option value="USDJPY">USDJPY</option>
                <option value="NAS100">NAS100</option>
                <option value="BTCUSD">BTCUSD</option>
              </select>
              <select
                aria-label={t('Filter by data source', 'กรองตามแหล่งข้อมูล')}
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value as 'ALL' | Mt5VerificationChannel)}
              >
                <option value="ALL">{t('All sources', 'ทุกแหล่งข้อมูล')}</option>
                <option value="LIVE_BRIDGE">Live Bridge (.ex5)</option>
                <option value="MYFXBOOK_API">Myfxbook</option>
                <option value="FUNDEDNEXT_MCP">FundedNext</option>
                <option value="PROJECTX_API">ProjectX / TopstepX</option>
                <option value="MANUAL_XLSX">{t('MT5 Statement (.xlsx)', 'รายงาน MT5 (.xlsx)')}</option>
              </select>
              <select
                aria-label={t('Filter by side', 'กรองตามฝั่ง')}
                value={directionFilter}
                onChange={(e) =>
                  setDirectionFilter(e.target.value as 'ALL' | 'BUY' | 'SELL' | 'BOTH')
                }
              >
                <option value="ALL">{t('All directions', 'ทุกฝั่ง')}</option>
                <option value="BUY">{formatDirection('BUY', lang)}</option>
                <option value="SELL">{formatDirection('SELL', lang)}</option>
                <option value="BOTH">{formatDirection('BOTH', lang)}</option>
              </select>
              <select
                aria-label={t('Sort setups', 'เรียงชุดตั้งค่า')}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as MarketplaceSortBy)}
              >
                <option value="PF_DESC">{t('Profit factor ↓', 'Profit Factor ↓')}</option>
                <option value="WINRATE_DESC">{t('Win rate ↓', 'อัตราชนะ ↓')}</option>
                <option value="PROFIT_DESC">{t('Net P&L ↓', 'กำไร/ขาดทุนสุทธิ ↓')}</option>
                <option value="PRICE_ASC">{t('Price ↑', 'ราคา ↑')}</option>
              </select>
            </div>

            {hasBrowseFilters && listings.length > 0 && (
              <div className="mkt-filter-summary" role="status" aria-live="polite">
                <span>
                  {t(
                    `Showing ${filteredListings.length} of ${listings.length} verified setups`,
                    `แสดง ${filteredListings.length} จาก ${listings.length} ชุดตั้งค่าที่ยืนยันแล้ว`,
                  )}
                </span>
                <button type="button" onClick={resetBrowseFilters}>
                  {t('Clear filters', 'ล้างตัวกรอง')}
                </button>
              </div>
            )}

            {loading ? (
              <div className="mkt-empty-state" role="status" aria-live="polite">
                <strong style={{ fontSize: '14px' }}>
                  {t('Loading MT5 listings…', 'กำลังโหลดรายการ MT5…')}
                </strong>
              </div>
            ) : filteredListings.length === 0 ? (
              <div className="market-listing-empty" role="status" aria-live="polite">
                <span>
                  {listings.length
                    ? t('No listings match these filters.', 'ไม่มีรายการตรงกับตัวกรอง')
                    : t('No published MT5 listings yet.', 'ยังไม่มีรายการ MT5 ที่เผยแพร่')}
                </span>
                {listings.length ? (
                  <button type="button" className="btn sm" onClick={resetBrowseFilters}>
                    {t('Clear filters', 'ล้างตัวกรอง')}
                  </button>
                ) : (
                  <button type="button" className="btn sm" onClick={() => setActiveTab('SELL')}>
                    {t('Publish a verified setup', 'เผยแพร่ชุดตั้งค่าที่ตรวจสอบแล้ว')}
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="mkt-cards-grid" data-stale={isSearchStale || undefined}>
                  {visibleListings.map((item) => {
                    const isOwned = Boolean(
                      purchasedIds.has(item.id) || (currentUid && item.sellerUid === currentUid),
                    );
                    return (
                      <MarketplaceListingCard
                        key={item.id}
                        item={item}
                        lang={lang}
                        isOwned={isOwned}
                        isBusy={busyId === item.id}
                        onInspect={handleInspectSetup}
                        onAcquire={handleAcquireSetup}
                        onShareToMall={onShareToMall}
                      />
                    );
                  })}
                </div>
                {remainingCount > 0 && (
                  <div className="mkt-load-more">
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => setVisibleCount((prev) => prev + MARKETPLACE_PAGE_SIZE)}
                    >
                      {t(
                        `Show more setups (${remainingCount} remaining)`,
                        `แสดงชุดตั้งค่าเพิ่มเติม (อีก ${remainingCount} รายการ)`,
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* TAB 2: SELL VERIFIED SETUP */}
        {activeTab === 'SELL' && (
          <div className="mkt-publish-grid">
            <form className="card" onSubmit={(e) => void handlePublishSetup(e)}>
              <div className="card-header">
                <div>
                  <h3 className="card-title">
                    {t('Publish a verified blueprint', 'เผยแพร่บลูพรินต์ที่ยืนยันแล้ว')}
                  </h3>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {t(
                      'Select an account with MT5 trade history for server verification.',
                      'เลือกบัญชีที่มีประวัติ MT5 เพื่อให้เซิร์ฟเวอร์ตรวจสอบ',
                    )}
                  </p>
                </div>
              </div>

              <div className="form-grid">
                <div className="form-field mkt-field-wide">
                  <label htmlFor="mkt-mt5-account">{t('MT5 account', 'บัญชี MT5')}</label>
                  <select
                    id="mkt-mt5-account"
                    value={selectedAudit?.acc.id || ''}
                    onChange={(e) => {
                      onSelectPortfolio(e.target.value);
                    }}
                  >
                    {portfolioAudits.length === 0 && (
                      <option value="">{t('No MT5 accounts', 'ไม่มีบัญชี MT5')}</option>
                    )}
                    {portfolioAudits.map((p) => (
                      <option key={p.acc.id} value={p.acc.id}>
                        {formatAccountDisplayName(p.acc.name, lang)} ·{' '}
                        {p.isVerified
                          ? t(`${p.validPositions.length} MT5 deals`, `${p.validPositions.length} ดีล MT5`)
                          : t('No eligible MT5 deals', 'ไม่มีดีล MT5 ที่ใช้ตรวจสอบได้')}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field mkt-field-wide">
                  <label htmlFor="mkt-title">{t('Blueprint name', 'ชื่อบลูพรินต์')}</label>
                  <input
                    id="mkt-title"
                    type="text"
                    required
                    placeholder={t(
                      'e.g. XAUUSD New York risk profile',
                      'เช่น โปรไฟล์ความเสี่ยง XAUUSD ช่วงนิวยอร์ก',
                    )}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>

                <div className="form-field mkt-field-wide">
                  <label htmlFor="mkt-summary">
                    {t('Blueprint methodology', 'วิธีวิเคราะห์ของบลูพรินต์')}
                  </label>
                  <textarea
                    id="mkt-summary"
                    rows={3}
                    required
                    placeholder={t(
                      'Describe the MT5 sample, risk assumptions, and SL/TP settings.',
                      'อธิบายชุดข้อมูล MT5 สมมติฐานความเสี่ยง และค่า SL/TP',
                    )}
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="mkt-price">
                    {t('Price (USD · 0 for free)', 'ราคา (USD · 0 คือฟรี)')}
                  </label>
                  <input
                    id="mkt-price"
                    type="number"
                    min={0}
                    step={1}
                    value={priceUsd}
                    onChange={(e) => setPriceUsd(Number(e.target.value))}
                  />
                  {listingPriceUsd > 0 && (
                    <small style={{ fontSize: '11px', color: 'var(--amber)' }}>
                      {t(
                        'Paid checkout is coming soon. Set $0 so traders can load your blueprint immediately.',
                        'ระบบชำระเงินจะเปิดเร็ว ๆ นี้ หากตั้งเป็น $0 เทรดเดอร์จะโหลดแผนของคุณได้ทันที',
                      )}
                    </small>
                  )}
                </div>

                <div className="form-field">
                  <label htmlFor="mkt-seller">{t('Seller alias', 'ชื่อผู้เผยแพร่')}</label>
                  <input
                    id="mkt-seller"
                    type="text"
                    value={sellerName}
                    onChange={(e) => setSellerName(e.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="mkt-symbol">{t('Symbol', 'สินทรัพย์')}</label>
                  <input
                    id="mkt-symbol"
                    className="mono"
                    type="text"
                    value={bpSymbol}
                    onChange={(e) => setBpSymbol(e.target.value)}
                  />
                </div>

                <div className="mkt-inline-2">
                  <div className="form-field">
                    <label htmlFor="mkt-timeframe">{t('Timeframe', 'กรอบเวลา')}</label>
                    <input
                      id="mkt-timeframe"
                      className="mono"
                      type="text"
                      value={bpTimeframe}
                      onChange={(e) => setBpTimeframe(e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="mkt-session">{t('Session', 'ช่วงตลาด')}</label>
                    <select
                      id="mkt-session"
                      value={bpSession}
                      onChange={(e) => setBpSession(e.target.value as BlueprintSession)}
                    >
                      {Object.entries(SESSION_LABELS).map(([session, label]) => (
                        <option key={session} value={session}>
                          {t(...label)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-field">
                  <label htmlFor="mkt-direction">
                    {t('Blueprint direction', 'ฝั่งของบลูพรินต์')}
                  </label>
                  <select
                    id="mkt-direction"
                    value={bpDirection}
                    onChange={(e) => setBpDirection(e.target.value as 'BUY' | 'SELL' | 'BOTH')}
                  >
                    <option value="BOTH">{formatDirection('BOTH', lang)}</option>
                    <option value="BUY">{formatDirection('BUY', lang)}</option>
                    <option value="SELL">{formatDirection('SELL', lang)}</option>
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="mkt-risk">{t('Risk (USD)', 'ความเสี่ยง (USD)')}</label>
                  <input
                    id="mkt-risk"
                    type="number"
                    min={10}
                    required
                    value={bpRiskUsd || ''}
                    onChange={(e) => setBpRiskUsd(Number(e.target.value))}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="mkt-sl">{t('SL (pts)', 'SL (แต้ม)')}</label>
                  <input
                    id="mkt-sl"
                    type="number"
                    min={10}
                    required
                    value={bpSlPoints || ''}
                    onChange={(e) => setBpSlPoints(Number(e.target.value))}
                  />
                </div>

                <div className="mkt-inline-3">
                  <div className="form-field">
                    <label htmlFor="mkt-tp1">{t('TP1 (pts)', 'TP1 (แต้ม)')}</label>
                    <input
                      id="mkt-tp1"
                      type="number"
                      min={10}
                      required
                      value={bpTp1Points || ''}
                      onChange={(e) => setBpTp1Points(Number(e.target.value))}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="mkt-tp2">{t('TP2 (pts)', 'TP2 (แต้ม)')}</label>
                    <input
                      id="mkt-tp2"
                      type="number"
                      min={10}
                      required
                      value={bpTp2Points || ''}
                      onChange={(e) => setBpTp2Points(Number(e.target.value))}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="mkt-tp3">{t('TP3 (pts)', 'TP3 (แต้ม)')}</label>
                    <input
                      id="mkt-tp3"
                      type="number"
                      min={10}
                      required
                      value={bpTp3Points || ''}
                      onChange={(e) => setBpTp3Points(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="form-field mkt-field-wide">
                  <label htmlFor="mkt-checklist">
                    {t(
                      'Checklist notes (+ or new line)',
                      'บันทึกรายการตรวจ (คั่นด้วย + หรือขึ้นบรรทัดใหม่)',
                    )}
                  </label>
                  <textarea
                    id="mkt-checklist"
                    rows={2}
                    value={bpChecklistText}
                    onChange={(e) => setBpChecklistInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="mkt-publish-actions">
                <button
                  type="submit"
                  className="btn primary"
                  disabled={publishing || !selectedAudit?.isVerified}
                >
                  {publishing
                    ? t('Verifying MT5 history…', 'กำลังตรวจประวัติ MT5…')
                    : t('Verify & publish', 'ตรวจสอบและเผยแพร่')}
                </button>
              </div>
            </form>

            {/* Right Audit Column */}
            <div className="card mkt-audit">
              <div className="card-header">
                <h3 className="card-title">{t('MT5 account audit', 'ตรวจสอบบัญชี MT5')}</h3>
              </div>
              {selectedAudit?.isVerified && selectedAudit.metrics ? (
                <div className="mkt-audit-results">
                  <div className="mkt-seal emerald" style={{ alignSelf: 'flex-start' }}>
                    {CHANNEL_META[selectedAudit.channel].label}
                  </div>
                  <dl>
                    <div className="fx-kv-row">
                      <dt className="fx-kv-key">{t('Account', 'บัญชี')}</dt>
                      <dd className="fx-kv-val">
                        {formatAccountDisplayName(selectedAudit.acc.name, lang)}
                      </dd>
                    </div>
                    <div className="fx-kv-row">
                      <dt className="fx-kv-key">{t('Broker · login', 'โบรกเกอร์ · เลขบัญชี')}</dt>
                      <dd className="fx-kv-val mono">
                        {selectedAudit.rawReport?.meta?.broker || 'MT5'} ·{' '}
                        {maskMt5Login(
                          selectedAudit.rawReport?.meta?.login || selectedAudit.acc.login,
                        )}
                      </dd>
                    </div>
                    <div className="fx-kv-row">
                      <dt className="fx-kv-key">
                        {t('Eligible MT5 deals', 'ดีล MT5 ที่ใช้ตรวจสอบได้')}
                      </dt>
                      <dd className="fx-kv-val mono">{selectedAudit.metrics.tradeCount}</dd>
                    </div>
                  </dl>

                  <EquitySparkline
                    curve={selectedAudit.metrics.equityCurve}
                    netProfit={selectedAudit.metrics.netProfitUsd}
                    lang={lang}
                  />

                  <div className="mkt-card-metrics">
                    <div className="mkt-metric-cell">
                      <span className="mkt-metric-label">{t('Win Rate', 'อัตราชนะ')}</span>
                      <span className="mkt-metric-val" style={{ color: 'var(--emerald-ink)' }}>
                        {selectedAudit.metrics.winRatePct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="mkt-metric-cell">
                      <span className="mkt-metric-label">{t('Profit Factor', 'Profit Factor')}</span>
                      <span className="mkt-metric-val" style={{ color: 'var(--blue)' }}>
                        {selectedAudit.metrics.profitFactor.toFixed(2)}
                      </span>
                    </div>
                    <div className="mkt-metric-cell">
                      <span className="mkt-metric-label">{t('Max DD', 'ขาดทุนสะสมสูงสุด')}</span>
                      <span className="mkt-metric-val" style={{ color: 'var(--rose-ink)' }}>
                        {selectedAudit.metrics.maxDrawdownPct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="mkt-metric-cell">
                      <span className="mkt-metric-label">{t('Net P&L', 'กำไร/ขาดทุนสุทธิ')}</span>
                      <span
                        className="mkt-metric-val"
                        style={{
                          color:
                            selectedAudit.metrics.netProfitUsd >= 0
                              ? 'var(--emerald-ink)'
                              : 'var(--rose-ink)',
                        }}
                      >
                        {fmtUSD(selectedAudit.metrics.netProfitUsd)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    padding: '16px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--rose-border)',
                    background: 'var(--rose-soft)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <strong style={{ color: 'var(--rose)', fontSize: '13.5px' }}>
                    {t('MT5 verification required', 'ต้องตรวจสอบข้อมูล MT5')}
                  </strong>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '12px',
                      color: 'var(--text-primary)',
                      lineHeight: 1.55,
                    }}
                  >
                    {selectedAudit && selectedAudit.rejectedCount > 0
                      ? t(
                          `${selectedAudit.rejectedCount} incomplete records. MT5 tickets and net P&L are required.`,
                          `พบ ${selectedAudit.rejectedCount} รายการไม่สมบูรณ์ ต้องมีเลข Ticket และกำไร/ขาดทุนสุทธิจาก MT5`,
                        )
                      : t(
                          'Import MT5 trade history to verify this listing.',
                          'นำเข้าประวัติ MT5 เพื่อตรวจสอบรายการนี้',
                        )}
                  </p>
                  <div>
                    <button type="button" className="btn sm blue" onClick={onOpenMt5SyncModal}>
                      {t('Sync MT5 account', 'ซิงก์บัญชี MT5')}
                    </button>
                  </div>
                </div>
              )}

              <section
                className="mkt-blueprint-preview"
                aria-labelledby="mkt-blueprint-preview-title"
              >
                <header>
                  <h4 id="mkt-blueprint-preview-title" className="mkt-section-title">
                    {t('Blueprint Verification Summary', 'สรุปการตรวจสอบบลูพรินต์')}
                  </h4>
                  <p className="mkt-caption">{t('Listing preview', 'ตัวอย่างก่อนเผยแพร่')}</p>
                </header>
                <dl>
                  <div className="fx-kv-row">
                    <dt className="fx-kv-key">{t('Symbol', 'สินทรัพย์')}</dt>
                    <dd className="fx-kv-val mono">{blueprintFields.primarySymbol}</dd>
                  </div>
                  <div className="fx-kv-row">
                    <dt className="fx-kv-key">{t('Timeframe · Session', 'กรอบเวลา · ช่วงตลาด')}</dt>
                    <dd className="fx-kv-val">
                      <span className="mono">{blueprintFields.timeframe}</span> ·{' '}
                      <span className="session-label" data-session={blueprintFields.sessionFocus}>
                        {t(...SESSION_LABELS[blueprintFields.sessionFocus])}
                      </span>
                    </dd>
                  </div>
                  <div className="fx-kv-row">
                    <dt className="fx-kv-key">{t('Direction', 'ฝั่ง')}</dt>
                    <dd className="fx-kv-val">
                      {formatDirection(blueprintFields.directionMode, lang)}
                    </dd>
                  </div>
                  <div className="fx-kv-row">
                    <dt className="fx-kv-key">{t('Risk (USD)', 'ความเสี่ยง (USD)')}</dt>
                    <dd className="fx-kv-val mono">
                      {bpRiskUsd > 0 ? fmtUSD(bpRiskUsd) : '—'}
                    </dd>
                  </div>
                  <div className="fx-kv-row">
                    <dt className="fx-kv-key">
                      {t('SL / TP1 / TP2 / TP3 (pts)', 'SL / TP1 / TP2 / TP3 (แต้ม)')}
                    </dt>
                    <dd className="fx-kv-val mono">
                      {[bpSlPoints, bpTp1Points, bpTp2Points, bpTp3Points]
                        .map((n) => (n > 0 ? n : '—'))
                        .join(' / ')}
                    </dd>
                  </div>
                  <div className="fx-kv-row">
                    <dt className="fx-kv-key">{t('Price', 'ราคา')}</dt>
                    <dd className="fx-kv-val mono">
                      {listingPriceUsd === 0 ? t('Free', 'ฟรี') : fmtUSD(listingPriceUsd)}
                    </dd>
                  </div>
                </dl>
                <BlueprintLadder
                  lang={lang}
                  distances={{
                    slPoints: bpSlPoints,
                    tp1Points: bpTp1Points,
                    tp2Points: bpTp2Points,
                    tp3Points: bpTp3Points,
                  }}
                />
              </section>
              <section className="mkt-pipeline">
                <h4 className="mkt-section-title">
                  <Fingerprint size={16} />
                  {t('SHA-256 verification pipeline', 'ขั้นตอนการตรวจสอบ SHA-256')}
                </h4>
                <ol>
                  <li data-ready={!!selectedAudit?.isVerified}>
                    <div>
                      <strong>{t('Screen closed MT5 deals', 'คัดกรองดีล MT5 ที่ปิดแล้ว')}</strong>
                      <span>
                        {selectedAudit?.isVerified
                          ? t(
                              `${selectedAudit.validPositions.length} eligible deals`,
                              `ผ่านเกณฑ์ ${selectedAudit.validPositions.length} ดีล`,
                            )
                          : t('Awaiting eligible MT5 history', 'รอประวัติ MT5 ที่ผ่านเกณฑ์')}
                      </span>
                    </div>
                  </li>
                  <li data-ready={publishing}>
                    <div>
                      <strong>
                        {t('Recalculate historical metrics', 'คำนวณสถิติย้อนหลังบนเซิร์ฟเวอร์')}
                      </strong>
                      <span>
                        {publishing
                          ? t('Verification requested', 'ส่งคำขอตรวจสอบแล้ว')
                          : t(
                              'Server checks tickets and net P&L on submission.',
                              'เซิร์ฟเวอร์ตรวจเลขดีลและกำไรสุทธิเมื่อส่งข้อมูล',
                            )}
                      </span>
                    </div>
                  </li>
                  <li>
                    <div>
                      <strong>{t('Generate the SHA-256 hash', 'สร้างแฮช SHA-256')}</strong>
                      <span>
                        {t(
                          'The listing shows the hash after publication.',
                          'ดูแฮชที่เซิร์ฟเวอร์สร้างได้หลังลงประกาศ',
                        )}
                      </span>
                    </div>
                  </li>
                </ol>
              </section>
            </div>
          </div>
        )}

        {/* TAB 3: MY LIBRARY */}
        {activeTab === 'LIBRARY' && (
          <div className="mkt-library">
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  {t('Saved blueprints', 'บลูพรินต์ในคลัง')} ({myAcquiredListings.length})
                </h3>
              </div>
              {myAcquiredListings.length === 0 ? (
                <p className="mkt-caption">
                  {t(
                    'No saved blueprints. Browse the Marketplace to add one.',
                    'ยังไม่มีบลูพรินต์ในคลัง เลือกเพิ่มได้จากตลาด',
                  )}
                </p>
              ) : (
                <div className="mkt-cards-grid">
                  {myAcquiredListings.map((item) => (
                    <SavedBlueprintCard
                      key={item.id}
                      item={item}
                      lang={lang}
                      onInspect={handleInspectSetup}
                      onShareToMall={onShareToMall}
                      onLoad={handleLoadLibraryBlueprint}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  {t('Published blueprints', 'บลูพรินต์ที่เผยแพร่')} ({myPublishedListings.length})
                </h3>
              </div>
              {myPublishedListings.length === 0 ? (
                <p className="mkt-caption">
                  {t('No published blueprints.', 'ยังไม่มีบลูพรินต์ที่เผยแพร่')}
                </p>
              ) : (
                <div className="mkt-cards-grid">
                  {myPublishedListings.map((item) => (
                    <PublishedBlueprintCard
                      key={item.id}
                      item={item}
                      lang={lang}
                      isBusy={busyId === item.id}
                      onShareToMall={onShareToMall}
                      onDelist={handleDelistSetup}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Proof Inspector Modal */}
      {inspectSetup && (
        <DeskDialog
          label={t('MT5 audit proof', 'หลักฐานการตรวจ MT5')}
          onClose={() => setInspectSetup(null)}
          panelClassName="mkt-proof-dialog"
        >
          <div className="desk-modal-header">
            <div>
              <h3 className="mkt-section-title">
                {t('MT5 audit proof', 'หลักฐานการตรวจ MT5')} · {inspectSetup.title}
              </h3>
              <div className="mkt-caption">
                {inspectSetup.brokerName} · {inspectSetup.brokerServer} ·{' '}
                {maskMt5Login(inspectSetup.maskedLogin)}
              </div>
            </div>
            <button type="button" className="btn sm" onClick={() => setInspectSetup(null)}>
              {t('Close', 'ปิด')}
            </button>
          </div>

          <div className="mkt-proof-content">
            <div className="mkt-proof-block">
              <div className="mkt-caption">{t('SHA-256 proof hash', 'แฮชหลักฐาน SHA-256')}</div>
              <div className="mkt-proof-hash">{inspectSetup.proofHash}</div>
            </div>

            <EquitySparkline
              curve={inspectSetup.metrics.equityCurve}
              netProfit={inspectSetup.metrics.netProfitUsd}
              lang={lang}
            />

            <div>
              <h4 id="mkt-proof-deals-title" className="mkt-section-title">
                {t('Verified MT5 deals', 'ดีล MT5 ที่ยืนยันแล้ว')} (
                {inspectSetup.metrics.sampleDeals.length}
                {t(' of ', ' จาก ')}
                {inspectSetup.metrics.tradeCount})
              </h4>
              <div
                className="mkt-proof-deals"
                role="region"
                aria-labelledby="mkt-proof-deals-title"
                tabIndex={0}
              >
                <table className="journal-table" aria-labelledby="mkt-proof-deals-title">
                  <thead>
                    <tr>
                      <th>Ticket</th>
                      <th>{t('Symbol', 'สินทรัพย์')}</th>
                      <th>{t('Dir', 'ฝั่ง')}</th>
                      <th>{t('Lots', 'ล็อต')}</th>
                      <th>{t('Net P&L', 'P&L สุทธิ')}</th>
                      <th>{t('Closed', 'วันที่ปิด')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspectSetup.metrics.sampleDeals.map((d) => (
                      <tr key={d.ticket}>
                        <td className="mono">{d.ticket}</td>
                        <td className="mono">{d.symbol}</td>
                        <td
                          className="mono"
                          style={{
                            color: d.dir === 'BUY' ? 'var(--emerald)' : 'var(--rose)',
                            fontWeight: 600,
                          }}
                        >
                          {d.dir}
                        </td>
                        <td className="mono">{d.volume.toFixed(2)}</td>
                        <td
                          className="mono"
                          style={{
                            color: d.netProfit >= 0 ? 'var(--emerald)' : 'var(--rose)',
                            fontWeight: 600,
                          }}
                        >
                          {d.netProfit >= 0 ? '+' : ''}
                          {fmtUSD(d.netProfit)}
                        </td>
                        <td className="mono">{d.closeDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </DeskDialog>
      )}
    </section>
  );
};
