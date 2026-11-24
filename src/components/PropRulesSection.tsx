import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { BookOpen, Building2, CircleAlert, CircleCheck, ExternalLink, FileText, FolderOpen, Globe, ListChecks, RefreshCw, ShieldAlert } from 'lucide-react';
import { GhrWorkspaceState } from '../types/ghr';
import {
  evaluateConsistencyRule,
  fmtUSD,
  getAccountComputed,
  getBangkokIsoDate,
  resolveAccountType,
} from '../utils/ghrRules';
import {
  findMatchingPropFirm,
  evaluatePortfolioAgainstPropFirm,
  PROP_FIRM_CATALOG,
  PortfolioRuleCheckItem,
  PropFirmLiveProbeResult,
  PropFirmMarket,
  PropFirmRuleEntry,
  SAFE_SYNC_CHANNEL_LABELS,
  SafeSyncChannelId,
} from '../utils/propFirmCatalog';
import { deskText, formatAccountDisplayName } from '../utils/deskI18n';
import type { DeskLanguage } from '../utils/deskI18n';
import { NewsBlackoutRadar } from './NewsBlackoutRadar';

interface PropRulesSectionProps {
  lang?: DeskLanguage;
  state: GhrWorkspaceState;
  isOnline: boolean;
  floatingPnlUsd: number;
  onOpenMt5SyncModal: () => void;
  onAskCoachAboutFirm?: (firmName: string) => void;
}

type RuleCopy = Pick<PropFirmRuleEntry, 'dailyLossLimitText' | 'maxDrawdownText' | 'consistencyRuleText' | 'newsTradingText' | 'vpsPolicySummary' | 'redMustReadWarning'>;

const ENGLISH_FIRM_RULES: Record<string, Partial<RuleCopy>> = {
  fundednext: {
    consistencyRuleText: '40% best-day rule on some plans, including Express or Futures. Check your account model.',
    newsTradingText: 'Allowed during the Challenge. Funded accounts may restrict trading within 5 minutes of major news.',
    vpsPolicySummary: 'VPS use is prohibited for accounts of $50,000 or more. Smaller accounts require a private VPS running an EA.',
    redMustReadWarning: 'For accounts of $50,000 or more, use FundedNext Official MCP or upload an .xlsx report to avoid breaching VPS or shared IP rules.',
  },
  ftmo: {
    dailyLossLimitText: '5% (2-Step Standard) or 3% (1-Step), based on equity at 00:00 CE(S)T.',
    consistencyRuleText: '1-Step has a best-day rule. 2-Step has no fixed cap but checks for gambling or all-in trades.',
    newsTradingText: 'Swing accounts can trade news. Standard accounts cannot open or close trades within 2 minutes of major news.',
    vpsPolicySummary: 'Only a private VPS with a dedicated IP and a receipt in your name is allowed. Avoid shared IPs and switching VPN countries.',
    redMustReadWarning: 'Keep the receipt showing your name and dedicated IP. Do not sign in through a shared VPS or public VPN during manual review.',
  },
  the5ers: {
    dailyLossLimitText: '5% daily pause (High Stakes). Bootcamp and Hyper Growth limits vary.',
    consistencyRuleText: 'Strict rules for stop losses per order and consistent risk sizing.',
    newsTradingText: 'Depends on the plan. Bracket orders and high-frequency arbitrage are prohibited around news.',
    vpsPolicySummary: 'A private VPS with a dedicated IP is allowed for personal EAs and scripts, provided they do not copy across account owners.',
    redMustReadWarning: 'Avoid sharing a VPS with other traders. The server records IP addresses even for investor-password access, which can trigger a copy-trading review.',
  },
  fundingpips: {
    dailyLossLimitText: '3%–5%, depending on the Zero, 1-Step or 2-Step model.',
    maxDrawdownText: '5%–10%, balance-based or static depending on the model.',
    consistencyRuleText: 'Some models, including Zero or Pro, have a 45% consistency rule. Recheck it before requesting a payout.',
    newsTradingText: 'Allowed during evaluation. For Master or Funded accounts, check the restrictions within 5 minutes of major news.',
    vpsPolicySummary: 'Shared IPs and group trading are closely monitored. Use a private VPS with a dedicated IP or a home computer.',
    redMustReadWarning: 'FundingPips monitors duplicate IPs across accounts. Prefer the Myfxbook Cloud API or an .xlsx report and avoid shared VPS services.',
  },
  alphacapital: {
    dailyLossLimitText: '4%–5%, depending on the Alpha Pro or Alpha Swing model.',
    consistencyRuleText: '40%–50% best-day or consistency cap, depending on the model. Check the client dashboard.',
    newsTradingText: 'Alpha Pro restricts trading within 2 minutes of major news. Alpha Swing allows news trading and weekend holding.',
    vpsPolicySummary: 'Only a VPS with a dedicated IP is allowed. The firm may request your VPS receipt before approving a payout.',
    redMustReadWarning: 'The firm may ask for a dedicated-IP invoice matching the account owner’s name. Myfxbook API or a personal computer avoids this VPS requirement.',
  },
  e8markets: {
    dailyLossLimitText: '2.5%–4%, configurable in some E8 One, Signature or Classic presets.',
    maxDrawdownText: '4%–10%, end-of-day trailing or static depending on the preset.',
    consistencyRuleText: '40% best-day rule on some models, such as the E8 One funded stage.',
    newsTradingText: 'Generally allowed. Watch for slippage and check your plan’s payout terms in E8X.',
    vpsPolicySummary: 'Shared VPS use is prohibited. Changes in IP country or time zone during trading are monitored.',
    redMustReadWarning: 'Avoid repeatedly changing IP country or using public VPNs. Sync through Myfxbook API or an .xlsx report to avoid creating a new account IP log.',
  },
  topstep: {
    dailyLossLimitText: 'Optional daily loss limit in Trading Combine, e.g. $1,000 on a $50K account.',
    maxDrawdownText: 'End-of-day trailing maximum loss limit, locked at the starting balance.',
    consistencyRuleText: '55% consistency rule for Trading Combine. Express Funded Account (XFA) has separate criteria.',
    newsTradingText: 'Allowed for futures under CME rules with suitable risk limits and stop orders.',
    vpsPolicySummary: 'TopstepX runs in a browser. NinjaTrader or Rithmic requires a private dedicated VPS.',
    redMustReadWarning: 'TopstepX does not need a VPS. Connect through the ProjectX / TopstepX Cloud API to import statistics into TallyNX Desk.',
  },
  apex: {
    dailyLossLimitText: 'Fixed daily loss limit for EOD Evaluation. No daily loss limit for Intraday Evaluation.',
    maxDrawdownText: 'Intraday or end-of-day trailing drawdown. For PA, trailing stops at the initial balance plus $100.',
    consistencyRuleText: '50% windfall or consistency rule before payout in PA, or 30% on some older plans.',
    newsTradingText: 'Avoid one-sided flipping or adding to losing trades without a defined stop around news.',
    vpsPolicySummary: 'Private VPS services in Chicago are allowed to reduce latency. Do not share VPS access or manage other traders’ accounts from the same IP.',
    redMustReadWarning: 'Performance Accounts have a 50% consistency cap and limits on contract size or adding to positions around news. Use a private VPS reserved for your own account.',
  },
  tpt: {
    dailyLossLimitText: 'No daily loss limit. Risk is limited by trailing drawdown.',
    consistencyRuleText: '50% best-day rule in Test. PRO Funded has no consistency cap.',
    newsTradingText: 'Allowed in Test. Check the restrictions within 1 minute of high-impact news in PRO Live.',
    vpsPolicySummary: 'Rithmic or NinjaTrader requires a private dedicated VPS. Shared IPs are prohibited.',
    redMustReadWarning: 'PRO Sim-Funded switches from end-of-day to intraday trailing drawdown, which follows unrealized profits immediately. Follow your risk and exit plan closely.',
  },
  mffu: {
    dailyLossLimitText: 'No daily loss limit for Rapid or Pro. Builder has a soft daily loss limit.',
    consistencyRuleText: '50% for Rapid or Pro and 30% for Rapid EOD. Builder is checked at payout.',
    newsTradingText: 'Check your account model. Some sim-funded plans restrict trading within 2 minutes of major news.',
    vpsPolicySummary: 'Shared VPS and proxy services are prohibited, as is using the same IP to manage accounts for different owners.',
    redMustReadWarning: 'Check your plan’s drawdown type (intraday, end-of-day or static) and best-day percentage before requesting a payout in the MFFU dashboard.',
  },
};

function getRuleCopy(firm: PropFirmRuleEntry, lang: DeskLanguage): RuleCopy {
  return lang === 'en' ? { ...firm, ...ENGLISH_FIRM_RULES[firm.id] } : firm;
}

function getSyncChannelLabel(channel: SafeSyncChannelId, lang: DeskLanguage): string {
  if (channel === 'MANUAL_XLSX' && lang === 'en') return 'MT5 report (.xlsx)';
  return SAFE_SYNC_CHANNEL_LABELS[channel] || channel;
}

function getEnglishCheckCopy(
  check: PortfolioRuleCheckItem,
  firm: PropFirmRuleEntry,
  activeSync: string,
  accountInitialUsd: number
): { label: string; detail: string } {
  const rule = getRuleCopy(firm, 'en');
  if (check.id === 'sync-safety') {
    const channelLabels = firm.safeSyncChannels.map((channel) => getSyncChannelLabel(channel, 'en'));
    if (check.severity === 'CRITICAL') {
      return {
        label: 'Account sync channel disabled',
        detail: `The account uses a retired channel (${activeSync}). Switch to ${channelLabels.join(' or ')}.`,
      };
    }
    if (check.severity === 'PASS') {
      const channel = firm.safeSyncChannels.find((item) => item === activeSync);
      return {
        label: 'Sync channel allowed',
        detail: `${channel ? getSyncChannelLabel(channel, 'en') : activeSync} follows ${firm.shortName}’s policy.`,
      };
    }
    if (check.label.startsWith('กฎห้ามใช้ VPS') && firm.vpsBannedOverUsd !== null) {
      return {
        label: `VPS prohibited for accounts of $${firm.vpsBannedOverUsd.toLocaleString('en-US')} or more`,
        detail: `For this $${accountInitialUsd.toLocaleString('en-US')} ${firm.shortName} account, use Live Bridge on a personal computer or switch to FundedNext Official MCP or .xlsx.`,
      };
    }
    return {
      label: 'Review the account sync channel',
      detail: `${firm.shortName} (${getMarketLabel(firm.market)}) recommends ${channelLabels.join(' or ')}.`,
    };
  }
  if (check.id === 'consistency') {
    if (firm.consistencyCapPct === null) {
      return { label: 'Firm consistency rules', detail: rule.consistencyRuleText };
    }
    const bestDay = check.label.match(/\d+(?:\.\d+)?%/)?.[0];
    const label = bestDay ? `Best-day consistency (${bestDay} / ${firm.consistencyCapPct}% cap)` : 'Best-day consistency';
    const remaining = check.detail.match(/\d+(?:\.\d+)?%/)?.[0];
    const detail = check.severity === 'CRITICAL'
      ? `The best trading day exceeds ${firm.shortName}’s ${firm.consistencyCapPct}% cap. The share is measured against total profit before payout.`
      : check.severity === 'WARN' && remaining
        ? `${remaining} of headroom remains before reaching the consistency cap.`
        : `The best trading day is within ${firm.shortName}’s ${firm.consistencyCapPct}% cap.`;
    return { label, detail };
  }
  const drawdown = check.label.match(/\d+(?:\.\d+)?%/)?.[0];
  const amount = check.detail.match(/[+-]\$\d+(?:\.\d+)?/)?.[0];
  const limit = `Firm limit: ${rule.dailyLossLimitText}`;
  if (check.severity === 'CRITICAL') {
    return {
      label: drawdown ? `Daily drawdown (${drawdown})` : 'Daily drawdown',
      detail: `${amount ? `Today’s net loss including open positions is ${amount}. ` : ''}${limit}`,
    };
  }
  return {
    label: drawdown ? `Daily drawdown buffer (${drawdown} used today)` : 'Daily drawdown buffer',
    detail: amount ? `Equity buffer against a 10% drawdown: ${amount}. ${limit}` : limit,
  };
}

const PROBE_TIME_FORMATTERS: Record<DeskLanguage, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }),
  th: new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }),
};

function formatProbeTimeBkk(lang: DeskLanguage, iso?: string | null): string {
  const t = (english: string, thai: string) => deskText(lang, english, thai);
  if (!iso) return t("Awaiting check", "รอตรวจสอบ");
  try {
    return PROBE_TIME_FORMATTERS[lang].format(new Date(iso));
  } catch {
    return iso;
  }
}

function getMarketLabel(market: PropFirmMarket): string {
  if (market === 'CFD_FUTURES') return 'CFD / Futures';
  return market;
}

function getProbeColor(status?: PropFirmLiveProbeResult['probeStatus']): string {
  if (status === 'LIVE_OK') return 'var(--emerald)';
  if (status === 'UNREACHABLE') return 'var(--rose)';
  return 'var(--amber)';
}

function getProbeLabel(lang: DeskLanguage, probe?: PropFirmLiveProbeResult): string {
  const t = (english: string, thai: string) => deskText(lang, english, thai);
  if (!probe) return t("Checking status", "กำลังตรวจสถานะ");
  if (probe.probeStatus === 'LIVE_OK') {
    return t(`Responding (HTTP ${probe.httpStatus || 200} · ${probe.latencyMs} ms)`, `ตอบสนองปกติ (HTTP ${probe.httpStatus || 200} · ${probe.latencyMs}ms)`);
  }
  if (probe.probeStatus === 'CF_PROTECTED') {
    return t(`Online (bot protection · HTTP ${probe.httpStatus || 403})`, `ออนไลน์ (ป้องกันบอต · HTTP ${probe.httpStatus || 403})`);
  }
  return t(`Unreachable (HTTP ${probe.httpStatus || 0})`, `ไม่ตอบสนอง (HTTP ${probe.httpStatus || 0})`);
}

export const PropRulesSection: React.FC<PropRulesSectionProps> = React.memo(({
  lang = 'en',
  state,
  isOnline,
  floatingPnlUsd,
  onOpenMt5SyncModal,
  onAskCoachAboutFirm,
}) => {
  const t = (english: string, thai: string) => deskText(lang, english, thai);
  const activeAccount = state.accounts[state.activePort];
  const acc = useMemo(
    () => getAccountComputed(state.accounts, state.journal, state.activePort),
    [state.accounts, state.journal, state.activePort]
  );

  const consistency = useMemo(
    () =>
      evaluateConsistencyRule(state.cycleDays, state.includeFeeRefund, state.thbRate, {
        consistencyCapPct: acc.consistencyCapPct,
        feeRefundUsd: acc.feeRefundUsd,
        profitSplitPct: acc.profitSplitPct,
      }),
    [
      state.cycleDays,
      state.includeFeeRefund,
      state.thbRate,
      acc.consistencyCapPct,
      acc.feeRefundUsd,
      acc.profitSplitPct,
    ]
  );

  const todayIso = getBangkokIsoDate();
  const todayPnlUsd = useMemo(
    () =>
      state.journal
        .filter((t) => t.port === state.activePort && t.date === todayIso)
        .reduce((sum, t) => sum + (Number(t.pnlUsd) || 0), 0),
    [state.journal, state.activePort, todayIso]
  );

  const bestDaySharePct = useMemo(() => {
    const cycleValues = Object.values(state.cycleDays || {}).map((d) => Number(d.profit) || 0);
    const maxDay = cycleValues.length > 0 ? Math.max(...cycleValues) : 0;
    if (consistency.totalProfit <= 0 || maxDay <= 0) return 0;
    return +((maxDay / consistency.totalProfit) * 100).toFixed(1);
  }, [state.cycleDays, consistency.totalProfit]);

  const detectedFirm = useMemo(
    () =>
      findMatchingPropFirm(
        activeAccount?.name,
        activeAccount?.brokerName,
        activeAccount?.brokerServer
      ),
    [activeAccount?.name, activeAccount?.brokerName, activeAccount?.brokerServer]
  );

  const defaultFirmId = detectedFirm?.id ?? PROP_FIRM_CATALOG[0].id;
  const [selectedFirmId, setSelectedFirmId] = useState<string>(defaultFirmId);
  const [marketFilter, setMarketFilter] = useState<'ALL' | 'CFD' | 'FUTURES'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoMonitor, setAutoMonitor] = useState(true);
  const [showUniversalRules, setShowUniversalRules] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState<{ offline: boolean; detail?: string } | null>(null);
  const [lastCheckedIso, setLastCheckedIso] = useState<string | null>(null);
  const [probesById, setProbesById] = useState<Record<string, PropFirmLiveProbeResult>>({});

  useEffect(() => {
    setSelectedFirmId(defaultFirmId);
  }, [defaultFirmId]);

  const runLiveProbe = useCallback(
    async (forceRefresh = false) => {
      if (!isOnline) {
        setProbeError({ offline: true });
        return;
      }
      setProbing(true);
      setProbeError(null);
      try {
        const url = forceRefresh ? '/api/proprules/live?refresh=1' : '/api/proprules/live';
        const resp = await fetch(url);
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }
        const data = (await resp.json()) as {
          ok?: boolean;
          checkedAtIso?: string;
          probes?: PropFirmLiveProbeResult[];
        };
        if (data.ok && Array.isArray(data.probes)) {
          const map: Record<string, PropFirmLiveProbeResult> = {};
          for (const p of data.probes) {
            map[p.id] = p;
          }
          setProbesById(map);
          setLastCheckedIso(data.checkedAtIso || new Date().toISOString());
        }
      } catch (err) {
        setProbeError({ offline: false, detail: err instanceof Error ? err.message : undefined });
      } finally {
        setProbing(false);
      }
    },
    [isOnline]
  );

  useEffect(() => {
    void runLiveProbe(false);
  }, [runLiveProbe]);

  useEffect(() => {
    if (!autoMonitor || !isOnline) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void runLiveProbe(true);
      }
    }, 60000);
    return () => window.clearInterval(timer);
  }, [autoMonitor, isOnline, runLiveProbe]);

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const filteredFirms = useMemo(() => {
    const q = deferredSearchQuery.trim().toLowerCase();
    return PROP_FIRM_CATALOG.filter((firm) => {
      if (marketFilter === 'CFD' && firm.market === 'FUTURES') return false;
      if (marketFilter === 'FUTURES' && firm.market === 'CFD') return false;
      if (!q) return true;
      const copy = getRuleCopy(firm, lang);
      return (
        firm.name.toLowerCase().includes(q) ||
        copy.vpsPolicySummary.toLowerCase().includes(q) ||
        copy.consistencyRuleText.toLowerCase().includes(q) ||
        copy.dailyLossLimitText.toLowerCase().includes(q) ||
        firm.vpsPolicySummary.toLowerCase().includes(q) ||
        firm.consistencyRuleText.toLowerCase().includes(q) ||
        firm.dailyLossLimitText.toLowerCase().includes(q) ||
        firm.safeSyncChannels.some((c) => c.toLowerCase().includes(q))
      );
    });
  }, [marketFilter, deferredSearchQuery, lang]);

  const selectedFirm = useMemo(() => {
    const exactInFiltered = filteredFirms.find((f) => f.id === selectedFirmId);
    if (exactInFiltered) return exactInFiltered;
    if (filteredFirms.length > 0) return filteredFirms[0];
    return PROP_FIRM_CATALOG.find((f) => f.id === selectedFirmId) || PROP_FIRM_CATALOG[0];
  }, [filteredFirms, selectedFirmId]);

  const livePortfolioChecks = useMemo(
    () =>
      evaluatePortfolioAgainstPropFirm({
        firm: selectedFirm,
        accountInitialUsd: acc.initial,
        accountBalanceUsd: acc.balance,
        todayPnlUsd,
        floatingPnlUsd,
        bestDaySharePct,
        syncProvider: activeAccount?.syncProvider,
      }),
    [
      selectedFirm,
      acc.initial,
      acc.balance,
      todayPnlUsd,
      floatingPnlUsd,
      bestDaySharePct,
      activeAccount?.syncProvider,
    ]
  );

  const onlineProbeCount = useMemo(() => {
    return Object.values(probesById).filter(
      (p) => p.probeStatus === 'LIVE_OK' || p.probeStatus === 'CF_PROTECTED'
    ).length;
  }, [probesById]);

  const accountScope = resolveAccountType(activeAccount);
  const firmCopy = getRuleCopy(selectedFirm, lang);
  const localizedProbeError = probeError?.offline
    ? t("Offline. Showing saved rules. Connect to the internet to check firm websites.", "ออฟไลน์ กำลังแสดงกฎที่บันทึกไว้ เชื่อมต่ออินเทอร์เน็ตเพื่อตรวจสถานะเว็บไซต์กองทุน")
    : t("Couldn't check firm websites live", "ตรวจสถานะเว็บไซต์กองทุนไม่ได้");
  const selectedProbe = probesById[selectedFirm.id];
  const passCount = livePortfolioChecks.filter((c) => c.severity === 'PASS').length;
  const riskCount = livePortfolioChecks.filter((c) => c.severity === 'CRITICAL').length;
  const officialHost = useMemo(() => {
    try {
      return new URL(selectedFirm.websiteUrl).hostname.replace(/^www\./, '');
    } catch {
      return selectedFirm.websiteUrl;
    }
  }, [selectedFirm.websiteUrl]);

  const reviewItems = [
    { label: t('Daily drawdown', 'ขาดทุนรายวัน'), rule: firmCopy.dailyLossLimitText, checkId: 'daily-dd' },
    { label: t('Maximum drawdown', 'ขาดทุนสะสมสูงสุด'), rule: firmCopy.maxDrawdownText,
      detail: t('Equity relative to starting balance', 'ส่วนต่างของอิควิตี้เทียบกับยอดเริ่มต้น') + ' · ' + fmtUSD(acc.balance + floatingPnlUsd - acc.initial, true) },
    { label: t('Consistency cap', 'เพดานกำไรรายวัน'), rule: firmCopy.consistencyRuleText, checkId: 'consistency' },
    { label: t('News restrictions', 'ข้อจำกัดช่วงข่าว'), rule: firmCopy.newsTradingText },
    { label: t('Weekend holding', 'การถือข้ามสัปดาห์'), rule: selectedFirm.id === 'alphacapital'
      ? t('Alpha Swing permits weekend holding.', 'Alpha Swing อนุญาตให้ถือข้ามสัปดาห์')
      : t('Confirm the holding window for your account model in the official rules.', 'เช็กในกฎทางการว่าบัญชีรุ่นนี้ถือสถานะได้นานแค่ไหน') },
    { label: t('VPS & IP policy', 'นโยบาย VPS และ IP'), rule: firmCopy.vpsPolicySummary },
    { label: t('Read-only sync', 'การซิงก์แบบอ่านอย่างเดียว'), rule: selectedFirm.safeSyncChannels.map(ch => getSyncChannelLabel(ch, lang)).join(' · '), checkId: 'sync-safety' },
  ];

  return (
    <section id="sec-proprules" className="proprules-workspace">
      <NewsBlackoutRadar lang={lang} firmId={selectedFirm.id} firmName={selectedFirm.shortName} />
      {/* ================================================================= */}
      {/* TOP BAR: Quiet Header, Filters & Collapsible Universal Red Rule   */}
      {/* ================================================================= */}
      <div className="card proprules-controls">
        <div className="prop-directory-heading">
          <div>
            <h2 className="desk-icon-title"><Building2 size={19} aria-hidden="true" />{t('Prop rules directory', 'สารบัญกฎกองทุน')}</h2>
            <p>{t('Account', 'บัญชี')} · {formatAccountDisplayName(acc.name, lang)}</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span className="desk-tag mono">
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: isOnline ? 'var(--emerald)' : 'var(--rose)',
                }}
              />
              {probing
                ? t("Checking…", "กำลังตรวจ...")
                : <>{t(`${onlineProbeCount}/${PROP_FIRM_CATALOG.length} online`, `ออนไลน์ ${onlineProbeCount}/${PROP_FIRM_CATALOG.length}`)} · {formatProbeTimeBkk(lang, lastCheckedIso)}</>}
            </span>

            <button
              type="button"
              className={`btn xs ${autoMonitor ? 'primary' : ''}`}
              aria-pressed={autoMonitor}
              onClick={() => setAutoMonitor((v) => !v)}
              title={t("Check firm websites automatically every 60 seconds", "ตรวจสถานะเว็บกองทุนอัตโนมัติทุก 60 วินาที")}
            >
              {autoMonitor ? t("Auto 60s: on", "Auto 60s: เปิด") : t("Auto 60s: off", "Auto 60s: ปิด")}
            </button>

            <button
              type="button"
              className="btn xs"
              onClick={() => void runLiveProbe(true)}
              disabled={probing}
            >
              <RefreshCw size={12} aria-hidden="true" />{t("Refresh", "รีเฟรช")}
            </button>
          </div>
        </div>

        {/* Single Clean Filter Row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {(
              [
                { id: 'ALL', label: t(`All (${PROP_FIRM_CATALOG.length})`, `ทั้งหมด (${PROP_FIRM_CATALOG.length})`) },
                { id: 'CFD', label: 'CFD' },
                { id: 'FUTURES', label: 'Futures' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`btn sm ${marketFilter === opt.id ? 'primary' : ''}`}
                aria-pressed={marketFilter === opt.id}
                onClick={() => setMarketFilter(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <input
            type="search"
            aria-label={t('Search prop firms and rules', 'ค้นหากองทุนและกฎ')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("Search firm, consistency, VPS or Rithmic", "ค้นหาชื่อกองทุน, Consistency, VPS หรือ Rithmic")}
            style={{
              flex: '1 1 240px',
              maxWidth: '380px',
              padding: '7px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-subtle)',
              color: 'var(--text-primary)',
              fontSize: '12.5px',
            }}
          />
        </div>

        {/* Concise 1-Line Red Compliance Notice (Expandable to 3 Core Rules) */}
        <div
          style={{
            padding: '9px 12px',
            borderRadius: '8px',
            background: 'var(--rose-soft)',
            border: '1px solid var(--rose-border)',
            color: 'var(--rose)',
            fontSize: '12px',
            lineHeight: 1.5,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            <span>
              <strong>{t("Evaluation and payout rules", "กฎการสอบและการถอนกำไร")}</strong>{t(" Use read-only sync. Firm rules restrict cross-owner trade copying and cross-country IP sharing. Check each firm’s rules for closing positions before major news.", " ซิงก์แบบ Read-Only เท่านั้น · ห้าม Copy Trade ข้ามบุคคลหรือแชร์ IP ต่างประเทศ · ปิดออร์เดอร์ก่อนข่าวแรงตามกฎกองทุน")}
            </span>
            <button
              type="button"
              aria-expanded={showUniversalRules}
              aria-controls={showUniversalRules ? 'prop-universal-rules' : undefined}
              onClick={() => setShowUniversalRules((v) => !v)}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--rose)',
                fontSize: '11.5px',
                fontWeight: 700,
                textDecoration: 'underline',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {showUniversalRules ? t("Hide rules", "ซ่อนรายละเอียด") : t("Read the 3 rules", "อ่านกฎ 3 ข้อ")}
            </button>
          </div>

          {showUniversalRules && (
            <div id="prop-universal-rules" style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--rose-border)', display: 'grid', gap: '4px' }}>
              <div>{t("1. Sync with read-only investor access, an .xlsx report or an open API. Firms require authorized tools for order placement.", "1. ซิงก์ด้วย Investor Read-Only, รายงาน .xlsx หรือ Open API กองทุนกำหนดให้ส่งคำสั่งผ่านเครื่องมือที่อนุญาตเท่านั้น")}</div>
              <div>{t("2. Avoid cross-account hedging, arbitrage, tick scalping, and shared VPS services that can reuse other traders’ IP addresses.", "2. ห้ามใช้วิธี Hedging ข้ามบัญชี, Arbitrage, Tick Scalping หรือ Shared VPS ที่อาจทำให้ IP ซ้ำกับบัญชีผู้อื่น")}</div>
              <div>{t("3. Avoid opening or closing trades in the 2–5 minutes around high-impact news (NFP, CPI, FOMC) and keep daily profit within the consistency cap.", "3. หลีกเลี่ยงการเปิด-ปิดออเดอร์ช่วง ±2 ถึง ±5 นาทีรอบข่าวแดง (NFP, CPI, FOMC) และควบคุมกำไรรายวันไม่ให้เกิน Consistency Cap")}</div>
            </div>
          )}
        </div>

        {probeError && (
          <div style={{ fontSize: '12px', color: 'var(--amber)' }}>
            {localizedProbeError}
            {probeError.detail && !/[\u0e00-\u0e7f]/.test(probeError.detail) && ` (${probeError.detail})`}
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* MASTER-DETAIL SPLIT: Left Firm List | Right Single Focused Rulebook */}
      {/* ================================================================= */}
      <div className="proprules-split-grid">
        {/* LEFT PANE: Quiet Firm Selector List */}
        <aside className="card proprules-firms">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 8px 8px',
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--text-muted)',
              borderBottom: '1px solid var(--border-color)',
              marginBottom: '6px',
            }}
          >
            <span>{t("Prop firms", "รายชื่อกองทุน")}</span>
            <span className="mono">{filteredFirms.length}{t(" firms", " แห่ง")}</span>
          </div>

          {filteredFirms.length === 0 ? (
            <div style={{ padding: '20px 10px', textAlign: 'center', fontSize: '12.5px', color: 'var(--text-muted)' }}>
<FolderOpen size={18} aria-hidden="true" />{t("No firms match your search.", "ไม่พบกองทุนที่ตรงกับคำค้นหา")}
            </div>
          ) : (
            <div className="prop-selector-list">
              {filteredFirms.map((firm) => {
                const probe = probesById[firm.id];
                const isSelected = firm.id === selectedFirm.id;
                const isDetected = firm.id === detectedFirm?.id;
                return (
                  <button
                    key={firm.id}
                    type="button"
                    className={`proprules-firm-row ${isSelected ? 'active' : ''}`}
                    aria-pressed={isSelected}
                    onClick={() => setSelectedFirmId(firm.id)}
                  >
                    <span className="prop-firm-name">
                      <strong>{firm.name}</strong>
                      <small><i style={{ background: getProbeColor(probe?.probeStatus) }} aria-hidden="true" />{getProbeLabel(lang, probe)}</small>
                    </span>
                    <span className="prop-firm-tags">
                      <span className="desk-tag mono">{firm.market === 'CFD_FUTURES' ? 'CFD/FUT' : firm.market}</span>
                      {isDetected && <span className="desk-tag" data-tone="gain">{t('This account', 'บัญชีนี้')}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* RIGHT PANE: Focused Rulebook & Portfolio Fit */}
        {filteredFirms.length > 0 && <article className="card prop-dossier" aria-labelledby="prop-dossier-title">
          <header className="prop-dossier-heading">
            <div>
              <div className="prop-firm-identity"><FileText size={20} aria-hidden="true" />
                <h3 id="prop-dossier-title">{selectedFirm.name}</h3>
                <span className="desk-tag mono">{getMarketLabel(selectedFirm.market)}</span>
              </div>
              <p><Globe size={12} aria-hidden="true" /><span className="mono">{officialHost}</span>
                <span>{getProbeLabel(lang, selectedProbe)}</span>
                {selectedFirm.id === detectedFirm?.id && <span>{t('Current account', 'บัญชีปัจจุบัน')}</span>}
              </p>
            </div>
          </header>
            <div className="prop-reference-links">
              <a
                href={selectedFirm.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn xs"
              >
                <Globe size={13} aria-hidden="true" />{t('Official website', 'เว็บไซต์ทางการ')}<ExternalLink size={11} aria-hidden="true" />
              </a>
              <a
                href={selectedFirm.rulesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn xs"
              >
                <BookOpen size={13} aria-hidden="true" />{t('Rules / FAQ', 'กฎ / FAQ')}<ExternalLink size={11} aria-hidden="true" />
              </a>
              {selectedFirm.portalUrl && (
                <a
                  href={selectedFirm.portalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn xs"
                >
                  {selectedFirm.portalLabel || t('Portal', 'พอร์ทัล')} <ExternalLink size={11} aria-hidden="true" />
                </a>
              )}
              <button type="button" className="btn xs" onClick={onOpenMt5SyncModal}>
                {t("Sync account", "ซิงก์พอร์ต")}
              </button>
              {onAskCoachAboutFirm && (
                <button
                  type="button"
                  className="btn xs primary"
                  onClick={() => onAskCoachAboutFirm(selectedFirm.name)}
                >
                  {t("Ask AI Coach", "ถาม AI Coach")}
                </button>
              )}
            </div>
          <section className="prop-audit" aria-label={t('Account rule checks', 'ตรวจสอบกฎของพอร์ต')}>
            <div className="prop-audit-heading">
              <h4 className="desk-icon-title"><ListChecks size={16} aria-hidden="true" />{t('Account rule checks', 'ตรวจสอบกฎของพอร์ต')}</h4>
              {activeAccount && <span className="desk-tag mono" data-tone={riskCount ? 'risk' : passCount === livePortfolioChecks.length ? 'gain' : undefined}>
                {t('Checks passed', 'ผ่านการตรวจ')} {passCount}/{livePortfolioChecks.length}
              </span>}
            </div>
            <p>{formatAccountDisplayName(acc.name, lang)} · {accountScope === 'PROP' ? t('Prop firm', 'บัญชีกองทุน') : t('Personal', 'บัญชีส่วนตัว')}
              <span className="mono sensitive-val"> · {t('Balance', 'ยอดคงเหลือ')} {fmtUSD(acc.balance)} · {t('Today', 'วันนี้')} {fmtUSD(todayPnlUsd, true)}</span>
            </p>
            <dl className="prop-audit-rows">
              {reviewItems.map(item => {
                const check = activeAccount && livePortfolioChecks.find(check => check.id === item.checkId);
                const evidence = check && (lang === 'en' ? getEnglishCheckCopy(check, selectedFirm, activeAccount.syncProvider || 'MANUAL_XLSX', acc.initial) : check);
                const StatusIcon = check?.severity === 'PASS' ? CircleCheck : check?.severity === 'CRITICAL' ? ShieldAlert : CircleAlert;
                return (
                  <div key={item.label} className="prop-audit-row" data-severity={check ? check.severity : undefined}>
                    <dt>{item.label}</dt>
                    <dd><strong>{item.rule}</strong>
                      {evidence && <p>{evidence.label} · {evidence.detail}</p>}
                      {item.detail && activeAccount && <p className="mono sensitive-val">{item.detail}</p>}
                    </dd>
                    <dd>{check ? (
                      <span className="desk-tag" data-tone={check.severity === 'PASS' ? 'gain' : check.severity === 'WARN' ? 'warn' : 'risk'}>
                        <StatusIcon size={12} aria-hidden="true" />
                        {check.severity === 'PASS' ? t('Pass', 'ผ่าน') : check.severity === 'WARN' ? t('Caution', 'ระวัง') : t('Breach risk', 'เสี่ยงผิดกฎ')}
                      </span>
                    ) : <a className="prop-review-link" href={selectedFirm.rulesUrl} target="_blank" rel="noopener noreferrer">
                      {t('Review terms', 'ตรวจข้อกำหนด')} <ExternalLink size={11} aria-hidden="true" />
                    </a>}</dd>
                  </div>
                );
              })}
            </dl>
          </section>

          {/* 3. Specific Firm Red Compliance Rule */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'var(--rose-soft)',
              border: '1px solid var(--rose-border)',
              color: 'var(--rose)',
              fontSize: '12.5px',
              fontWeight: 600,
              lineHeight: 1.55,
            }}
          >
            {t("Important restrictions (", "ข้อห้ามสำคัญ (")}{selectedFirm.name}): {firmCopy.redMustReadWarning}
          </div>

        </article>}
      </div>

      {/* Bottom Legal Disclaimer in RED */}
      <div
        style={{
          padding: '10px 14px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--rose-soft)',
          border: '1px solid var(--rose-border)',
          color: 'var(--rose)',
          fontSize: '11.5px',
          fontWeight: 600,
          lineHeight: 1.5,
        }}
      >
        {t("Prop firm rules can change by account model and over time. Use this summary for risk management and consult the firm’s current official terms before trading or requesting a payout. Not financial advice.", "หมายเหตุสำคัญ: กฎของแต่ละ Prop Firm อาจปรับเปลี่ยนได้ตามรุ่นบัญชีและช่วงเวลา ระบบสรุปเพื่อช่วยควบคุมความเสี่ยงเท่านั้น โปรดตรวจสอบเงื่อนไขล่าสุดจากเว็บไซต์ทางการของกองทุนก่อนเทรดหรือขอ Payout ทุกครั้ง (Not Financial Advice)")}
      </div>
    </section>
  );
});

PropRulesSection.displayName = 'PropRulesSection';
