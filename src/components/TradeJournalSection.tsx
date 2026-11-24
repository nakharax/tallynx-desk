import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Camera, CheckCheck, ChevronLeft, ChevronRight, Copy, Download, FileInput, FilePlus2, ListFilter, PencilLine, Printer, Search, ShieldQuestion, Trash2, X } from 'lucide-react';
import { navigateDeskTabs } from '../utils/navigateDeskTabs';
import {
  AccountType,
  GhrWorkspaceState,
  Mt5SyncProvider,
  Mt5TimeOffsetSetting,
  TradeDirection,
  TradeOutcomeStatus,
  TradeRecord,
} from '../types/ghr';
import {
  computeTradePricesAndMetrics,
  evaluateTwelveGates,
  fmtTHB,
  fmtUSD,
  formatCalculatorLot,
  getBangkokIsoDate,
  getBangkokTimeHHMM,
  getTradeSession,
  MT5_TIME_OFFSET_OPTIONS,
  normalizeMt5TimeOffsetSetting,
  resolveAccountType,
} from '../utils/ghrRules';
import { generateOrderSnapshotSvgDataUrl } from '../utils/realtimeGuardrails';
import { DeskDialog } from './DeskDialog';
import { FundedNextPilotPanel } from './FundedNextPilotPanel';
import type { FundedNextPilotActions } from './FundedNextPilotPanel';
import { deskText, formatAccountDisplayName, formatTradeNoteDisplay, formatMt5SyncMessage, formatMt5TimeOffsetLabel } from '../utils/deskI18n';
import type { DeskLanguage } from '../utils/deskI18n';

export interface Mt5ReadOnlySyncRequest {
  portId: string;
  provider: Exclude<Mt5SyncProvider, 'MANUAL_XLSX'>;
  login?: string;
  investorPassword?: string;
  brokerName?: string;
  brokerServer: string;
  tredynApiKey?: string;
  autoSyncRealtime?: boolean;
  silent?: boolean;
  metaApiAccountId: string;
  bridgeUrl: string;
  token: string;
  lookbackDays: number;
  email?: string;
  password?: string;
  externalAccountRef?: string;
}

interface TradeJournalSectionProps extends FundedNextPilotActions {
  lang?: DeskLanguage;
  state: GhrWorkspaceState;
  filteredJournal: TradeRecord[];
  onToggleMt5Importer: () => void;
  onUpdateMt5Settings: (
    groupMode: 'IDEA' | 'POSITION',
    includeFees: boolean,
    timeOffset?: Mt5TimeOffsetSetting
  ) => void;
  onSyncMt5ReadOnly?: (params: Mt5ReadOnlySyncRequest) => Promise<{ ok: boolean; message: string }>;
  onTriggerImportFile: () => void;
  onExportCsv: () => void;
  onPrintPdf: () => void;
  printRequested?: boolean;
  onToggleInlineEdit: () => void;
  onOpenTradeForm: (show: boolean, editTradeId: string | null) => void;
  onSaveFullEditTrade: (record: TradeRecord, isEditing: boolean) => void;
  onInlineUpdateTrade: (tradeId: string, field: keyof TradeRecord, value: string | number) => void;
  onDuplicateTrade: (tradeId: string) => void;
  onDeleteTrade: (tradeId: string) => void;
  onSetStatusFilter: (statusFilter: 'ALL' | 'FULL_SWEEP' | 'TRAILING_LOCK' | 'LOSS') => void;
  onSetDateFilter: (dateFilter: 'ALL' | 'TODAY' | '7D' | '30D') => void;
  onSetSessionFilter: (sessionFilter: 'ALL' | 'ASIA' | 'LONDON' | 'NY') => void;
  onSetPortFilter: (portFilter: string) => void;
  onSetSearch: (search: string) => void;
  onClearAllData?: () => void;
  onToggleAutoSyncForm: (checked: boolean) => void;
  modalOnly?: boolean;
}

function downloadScriptFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const TradeJournalSection: React.FC<TradeJournalSectionProps> = React.memo(({
  lang = 'en',
  state,
  filteredJournal,
  onToggleMt5Importer,
  onUpdateMt5Settings,
  onSyncMt5ReadOnly,
  onTriggerImportFile,
  onExportCsv,
  onPrintPdf,
  printRequested,
  onToggleInlineEdit,
  onOpenTradeForm,
  onSaveFullEditTrade,
  onInlineUpdateTrade,
  onDuplicateTrade,
  onDeleteTrade,
  onSetStatusFilter,
  onSetDateFilter,
  onSetSessionFilter,
  onSetPortFilter,
  onSetSearch,
  onClearAllData: _onClearAllData,
  onToggleAutoSyncForm,
  modalOnly = false,
  ...pilotActions
}) => {
  const t = (english: string, thai: string) => deskText(lang, english, thai);
  const portKeys = useMemo(() => Object.keys(state.accounts || {}), [state.accounts]);
  const { countAll, countFull, countTl, countLoss, portTradeCounts } = useMemo(() => {
    let countAll = 0;
    let countFull = 0;
    let countTl = 0;
    let countLoss = 0;
    const portTradeCounts = new Map<string, number>();
    const portFilter = state.journalFilter;

    for (const trade of state.journal) {
      portTradeCounts.set(trade.port, (portTradeCounts.get(trade.port) ?? 0) + 1);
      if (portFilter && portFilter !== 'ALL' && trade.port !== portFilter && trade.port.toUpperCase() !== portFilter) continue;
      countAll++;
      if (trade.status === 'FULL_SWEEP') countFull++;
      if (trade.status === 'TRAILING_LOCK') countTl++;
      if ((Number(trade.pnlUsd) || 0) < 0) countLoss++;
    }
    return { countAll, countFull, countTl, countLoss, portTradeCounts };
  }, [state.journal, state.journalFilter]);

  const { displayRows, runPts, runR, runUsd, wins } = useMemo(() => {
    let runPts = 0;
    let runR = 0;
    let runUsd = 0;
    let wins = 0;
    const chronologicalRows = [...filteredJournal].reverse().map((item, index) => {
      const pnl = Number(item.pnlUsd) || 0;
      runPts += Number(item.totalPts) || 0;
      runR = +(runR + (Number(item.rr) || 0)).toFixed(2);
      runUsd = +(runUsd + pnl).toFixed(2);
      if (pnl > 0) wins++;
      return { ...item, seq: index + 1, cumPts: runPts, cumR: runR, cumUsd: runUsd };
    });
    return { displayRows: chronologicalRows.reverse(), runPts, runR, runUsd, wins };
  }, [filteredJournal]);

  useEffect(() => {
    if (!printRequested) return;
    const frame = window.requestAnimationFrame(onPrintPdf);
    return () => window.cancelAnimationFrame(frame);
  }, [printRequested, onPrintPdf]);

  const pnlThb = runUsd * state.thbRate;
  const formattedPnlThb = lang === 'th' ? fmtTHB(pnlThb) : `THB ${Math.round(pnlThb).toLocaleString('en-GB')}`;
  const totalCount = filteredJournal.length;
  const winRate = totalCount > 0 ? ((wins / totalCount) * 100).toFixed(0) : '0';
  const currentGates = useMemo(() => evaluateTwelveGates(state.twelveGates), [state.twelveGates]);
  const resetViewFilters = () => {
    onSetSearch('');
    onSetDateFilter('ALL');
    onSetSessionFilter('ALL');
    onSetStatusFilter('ALL');
    onSetPortFilter('ALL');
  };

  // Show 10 trades per page without vertical scrolling; switch pages to view older trades
  const PAGE_SIZE = 10;
  const [pageIndex, setPageIndex] = useState<number>(0);

  useEffect(() => {
    setPageIndex(0);
  }, [
    state.journalFilter,
    state.journalStatusFilter,
    state.journalDateFilter,
    state.journalSessionFilter,
    state.journalSearch,
  ]);

  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE));
  const safePageIndex = Math.min(pageIndex, totalPages - 1);
  const visibleRows = useMemo(
    () => displayRows.slice(safePageIndex * PAGE_SIZE, (safePageIndex + 1) * PAGE_SIZE),
    [displayRows, safePageIndex]
  );
  const hasMoreRows = (safePageIndex + 1) * PAGE_SIZE < displayRows.length;

  const activeFilterPortObj =
    state.journalFilter && state.journalFilter !== 'ALL'
      ? state.accounts[state.journalFilter]
      : null;
  const journalScopeLabel = activeFilterPortObj ? formatAccountDisplayName(activeFilterPortObj.name, lang) : t("All accounts", "ทุกพอร์ต");
  const targetSyncPortId =
    (state.journalFilter && state.journalFilter !== 'ALL' && state.accounts[state.journalFilter]
      ? state.journalFilter
      : state.activePort) || portKeys[0] || '';
  const targetSyncAccount = targetSyncPortId ? state.accounts[targetSyncPortId] : undefined;

  const generateTredynApiKey = (portId: string) => {
    const cleanPort = (portId || 'port').toLowerCase().replace(/[^a-z0-9]/g, '');
    const rand = Array.from({ length: 20 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
    return `trd_live_${cleanPort}_${rand}`;
  };

  const [syncAccountScope, setSyncAccountScope] = useState<AccountType>('PROP');
  const [mt5ModalTab, setMt5ModalTab] = useState<'XLSX' | 'PROP_CLOUD' | 'LIVE_BRIDGE'>(() => {
    try {
      const saved = localStorage.getItem('TALLYNX_MT5_MODAL_TAB');
      if (saved === 'XLSX' || saved === 'PROP_CLOUD' || saved === 'LIVE_BRIDGE') return saved;
    } catch {
      // ignore storage errors
    }
    return 'XLSX';
  });
  const selectMt5ModalTab = (tab: 'XLSX' | 'PROP_CLOUD' | 'LIVE_BRIDGE') => {
    setMt5ModalTab(tab);
    setSyncFeedback(null);
    try {
      localStorage.setItem('TALLYNX_MT5_MODAL_TAB', tab);
    } catch {
      // ignore
    }
  };
  const [cloudConnectorMode, setCloudConnectorMode] = useState<'MYFXBOOK_API' | 'FUNDEDNEXT_MCP' | 'PROJECTX_API'>('MYFXBOOK_API');
  const [cloudEmailOrUser, setCloudEmailOrUser] = useState('');
  const [cloudPasswordOrSecret, setCloudPasswordOrSecret] = useState('');
  const [cloudAccountRef, setCloudAccountRef] = useState('');
  const [syncTredynApiKey, setSyncTredynApiKey] = useState('');
  const [syncAutoRealtime, setSyncAutoRealtime] = useState<boolean>(false);
  const [syncLookbackDays] = useState<number>(30);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ ok: boolean; text: string | [string, string] } | null>(null);
  const syncFeedbackText = typeof syncFeedback?.text === 'string'
    ? formatMt5SyncMessage(syncFeedback.text, lang)
    : syncFeedback?.text?.[lang === 'en' ? 0 : 1];
  const [showSafetyDetails, setShowSafetyDetails] = useState(false);

  useEffect(() => {
    if (targetSyncAccount) {
      const existingKey =
        targetSyncAccount.tredynApiKey ||
        (() => {
          try {
            return localStorage.getItem(`TREDYN_API_KEY_${targetSyncPortId}`) || '';
          } catch {
            return '';
          }
        })();
      const finalKey = existingKey || generateTredynApiKey(targetSyncPortId);
      try {
        if (!existingKey) {
          localStorage.setItem(`TREDYN_API_KEY_${targetSyncPortId}`, finalKey);
        }
      } catch {
        // ignore storage errors
      }
      setSyncTredynApiKey(finalKey);
      setSyncAutoRealtime(Boolean(targetSyncAccount.autoSyncRealtime));
    }
  }, [targetSyncPortId, targetSyncAccount?.tredynApiKey, targetSyncAccount?.autoSyncRealtime]);

  useEffect(() => {
    if (state.showMt5Importer && targetSyncAccount) {
      const resolvedScope = resolveAccountType(targetSyncAccount);
      setSyncAccountScope(resolvedScope);
      let rememberedTab: 'XLSX' | 'PROP_CLOUD' | 'LIVE_BRIDGE' | null = null;
      try {
        const raw = localStorage.getItem('TALLYNX_MT5_MODAL_TAB');
        if (raw === 'XLSX' || raw === 'PROP_CLOUD' || raw === 'LIVE_BRIDGE') {
          rememberedTab = raw;
        }
      } catch {
        // ignore
      }
      if (targetSyncAccount.syncProvider === 'FUNDEDNEXT_MCP') {
        setMt5ModalTab('PROP_CLOUD');
        setCloudConnectorMode('FUNDEDNEXT_MCP');
      } else if (rememberedTab) {
        setMt5ModalTab(rememberedTab);
        if (
          targetSyncAccount.syncProvider === 'MYFXBOOK_API' ||
          targetSyncAccount.syncProvider === 'PROJECTX_API'
        ) {
          setCloudConnectorMode(targetSyncAccount.syncProvider);
        }
      } else if (targetSyncAccount.syncProvider === 'LIVE_BRIDGE') {
        setMt5ModalTab('LIVE_BRIDGE');
      } else if (
        targetSyncAccount.syncProvider === 'MYFXBOOK_API' ||
        targetSyncAccount.syncProvider === 'PROJECTX_API'
      ) {
        setMt5ModalTab('PROP_CLOUD');
        setCloudConnectorMode(targetSyncAccount.syncProvider);
      } else {
        setMt5ModalTab('XLSX');
      }
      setCloudAccountRef(
        targetSyncAccount.externalAccountRef ||
          (targetSyncAccount.login && targetSyncAccount.login !== 'DEMO-6K'
            ? targetSyncAccount.login
            : '')
      );
      setSyncFeedback(null);
    }
  }, [state.showMt5Importer, targetSyncPortId]);

  // Realtime Auto-Sync background polling when enabled on the active port (Safe channels only)
  useEffect(() => {
    const isRealtimeActive = Boolean(syncAutoRealtime || targetSyncAccount?.autoSyncRealtime);
    if (!isRealtimeActive || !onSyncMt5ReadOnly || !targetSyncPortId || syncBusy) return;

    const activeProvider: 'LIVE_BRIDGE' | 'MYFXBOOK_API' | 'FUNDEDNEXT_MCP' | 'PROJECTX_API' =
      targetSyncAccount?.syncProvider === 'MYFXBOOK_API' ||
      targetSyncAccount?.syncProvider === 'FUNDEDNEXT_MCP' ||
      targetSyncAccount?.syncProvider === 'PROJECTX_API'
        ? targetSyncAccount.syncProvider
        : mt5ModalTab === 'PROP_CLOUD'
        ? cloudConnectorMode
        : 'LIVE_BRIDGE';

    if (activeProvider === 'FUNDEDNEXT_MCP') return;

    const intervalMs = activeProvider === 'LIVE_BRIDGE' ? 10000 : 30000;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void onSyncMt5ReadOnly({
        portId: targetSyncPortId,
        provider: activeProvider,
        login: (targetSyncAccount?.login || '').trim(),
        brokerName: (targetSyncAccount?.brokerName || '').trim(),
        brokerServer: (targetSyncAccount?.brokerServer || '').trim(),
        tredynApiKey: (syncTredynApiKey || targetSyncAccount?.tredynApiKey || '').trim(),
        autoSyncRealtime: true,
        silent: true,
        metaApiAccountId: '',
        bridgeUrl: '',
        token: cloudPasswordOrSecret.trim(),
        email: cloudEmailOrUser.trim(),
        password: cloudPasswordOrSecret.trim(),
        externalAccountRef: cloudAccountRef.trim(),
        lookbackDays: syncLookbackDays,
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [
    syncAutoRealtime,
    targetSyncAccount?.autoSyncRealtime,
    targetSyncAccount?.syncProvider,
    targetSyncAccount?.login,
    targetSyncAccount?.brokerName,
    targetSyncAccount?.brokerServer,
    targetSyncAccount?.tredynApiKey,
    targetSyncPortId,
    mt5ModalTab,
    cloudConnectorMode,
    cloudEmailOrUser,
    cloudPasswordOrSecret,
    cloudAccountRef,
    syncTredynApiKey,
    syncLookbackDays,
    syncBusy,
    onSyncMt5ReadOnly,
  ]);

  const handleCopyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setSyncFeedback({ ok: true, text: [`Copied ${label}`, `คัดลอก ${label} แล้ว`] });
    } catch {
      setSyncFeedback({ ok: false, text: [`Couldn't copy ${label} automatically. Please copy it manually.`, `คัดลอก ${label} อัตโนมัติไม่ได้ กรุณาคัดลอกด้วยตนเอง`] });
    }
  };

  const handleDownloadLiveBridgeEx5 = async () => {
    const key = syncTredynApiKey.trim() || generateTredynApiKey(targetSyncPortId);
    try {
      await navigator.clipboard.writeText(key).catch(() => null);
      const resp = await fetch('/api/mt5/scripts/TredynLiveBridge.ex5');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'TredynLiveBridge.ex5';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSyncFeedback({
        ok: true,
        text: ['Downloaded TredynLiveBridge.ex5. The API key was copied. Paste it into InpTredynApiKey after attaching the bridge to a chart.', 'ดาวน์โหลด TredynLiveBridge.ex5 และคัดลอก API Key แล้ว หลังติดตั้ง Bridge บนกราฟ ให้วางคีย์ในช่อง InpTredynApiKey'],
      });
    } catch {
      setSyncFeedback({
        ok: false,
        text: ["Couldn't download the .ex5 file. Try again.", 'ดาวน์โหลดไฟล์ .ex5 ไม่ได้ กรุณาลองอีกครั้ง'],
      });
    }
  };

  const handleDownloadLiveBridgeEa = async () => {
    const key = syncTredynApiKey.trim() || generateTredynApiKey(targetSyncPortId);
    const originUrl = typeof window !== 'undefined' ? window.location.origin : 'https://desk.tallynx.com';
    try {
      const resp = await fetch(
        `/api/mt5/scripts/TredynLiveBridge.mq5?apiKey=${encodeURIComponent(key)}&baseUrl=${encodeURIComponent(originUrl)}`
      );
      const txt = await resp.text();
      downloadScriptFile('TredynLiveBridge.mq5', txt);
      setSyncFeedback({
        ok: true,
        text: ['Downloaded TredynLiveBridge.mq5 with this account’s API key included.', 'ดาวน์โหลด TredynLiveBridge.mq5 พร้อม API Key ของพอร์ตนี้แล้ว'],
      });
    } catch {
      setSyncFeedback({
        ok: false,
        text: ["Couldn't download the EA file. Try again.", 'ดาวน์โหลดไฟล์ EA ไม่ได้ กรุณาลองอีกครั้ง'],
      });
    }
  };

  const handleRunReadOnlySync = async (
    overrideProvider?: 'LIVE_BRIDGE' | 'MYFXBOOK_API' | 'PROJECTX_API'
  ) => {
    if (!onSyncMt5ReadOnly || !targetSyncPortId) return;
    const effectiveProvider = overrideProvider || (mt5ModalTab === 'PROP_CLOUD' ? cloudConnectorMode : 'LIVE_BRIDGE');
    if (effectiveProvider === 'FUNDEDNEXT_MCP') return;
    const resolvedToken = cloudPasswordOrSecret.trim();

    setSyncBusy(true);
    setSyncFeedback(null);
    try {
      const result = await onSyncMt5ReadOnly({
        portId: targetSyncPortId,
        provider: effectiveProvider,
        login: (targetSyncAccount?.login || '').trim(),
        brokerName: (targetSyncAccount?.brokerName || '').trim(),
        brokerServer: (targetSyncAccount?.brokerServer || '').trim(),
        tredynApiKey: syncTredynApiKey.trim(),
        autoSyncRealtime: syncAutoRealtime,
        metaApiAccountId: '',
        bridgeUrl: '',
        token: resolvedToken,
        email: cloudEmailOrUser.trim(),
        password: resolvedToken,
        externalAccountRef: cloudAccountRef.trim(),
        lookbackDays: syncLookbackDays,
      });
      setSyncFeedback({ ok: result.ok, text: result.message });
    } catch (err) {
      setSyncFeedback({
        ok: false,
        text: err instanceof Error ? err.message : ["Couldn't sync data", 'ซิงก์ข้อมูลไม่ได้'],
      });
    } finally {
      setSyncBusy(false);
    }
  };

  const editingTrade = state.editingTradeId
    ? state.journal.find((t) => t.id === state.editingTradeId) || null
    : null;
  const showTradeForm = state.showManualAddForm || !!editingTrade;

  // Full Edit Form State
  const [fId, setFId] = useState('');
  const [fDate, setFDate] = useState('');
  const [fTime, setFTime] = useState('');
  const [fPort, setFPort] = useState(state.activePort);
  const [fDir, setFDir] = useState<TradeDirection>('BUY');
  const [fEntry, setFEntry] = useState('4042.59');
  const [snapshotModalTrade, setSnapshotModalTrade] = useState<TradeRecord | null>(null);
  const [fRisk, setFRisk] = useState(120);
  const [fLotLeg, setFLotLeg] = useState('0.04');
  const [fSlPrice, setFSlPrice] = useState('4032.59');
  const [fTp1Price, setFTp1Price] = useState('4046.59');
  const [fTp2Price, setFTp2Price] = useState('4050.59');
  const [fTp3Price, setFTp3Price] = useState('4054.59');
  const [fOutcome, setFOutcome] = useState<TradeOutcomeStatus>('FULL_SWEEP');
  const [fTp1Pts, setFTp1Pts] = useState(400);
  const [fTp2Pts, setFTp2Pts] = useState(800);
  const [fTp3Pts, setFTp3Pts] = useState(1200);
  const [fSlPts, setFSlPts] = useState(0);
  const [fTotalPts, setFTotalPts] = useState(2400);
  const [fRr, setFRr] = useState(0.8);
  const [fPnlUsd, setFPnlUsd] = useState('96.00');
  const [fNote, setFNote] = useState('');
  const recordedLadder = editingTrade?.calculatorDetails;
  const priceDecimals = recordedLadder?.contract.priceDecimals ?? 2;

  useEffect(() => {
    if (editingTrade) {
      setFId(editingTrade.id);
      setFDate(editingTrade.date);
      setFTime(editingTrade.time);
      setFPort(editingTrade.port);
      setFDir(editingTrade.dir);
      setFEntry(Number(editingTrade.entry).toFixed(priceDecimals));
      setFRisk(Number(editingTrade.risk));
      setFLotLeg(recordedLadder ? String(editingTrade.lotLeg) : Number(editingTrade.lotLeg).toFixed(2));
      setFSlPrice(Number(editingTrade.slPrice).toFixed(priceDecimals));
      setFTp1Price(Number(editingTrade.tp1Price).toFixed(priceDecimals));
      setFTp2Price(Number(editingTrade.tp2Price).toFixed(priceDecimals));
      setFTp3Price(Number(editingTrade.tp3Price).toFixed(priceDecimals));
      setFOutcome(editingTrade.status);
      setFTp1Pts(editingTrade.tp1Pts);
      setFTp2Pts(editingTrade.tp2Pts);
      setFTp3Pts(editingTrade.tp3Pts);
      setFSlPts(editingTrade.slPts);
      setFTotalPts(editingTrade.totalPts);
      setFRr(editingTrade.rr);
      setFPnlUsd(Number(editingTrade.pnlUsd).toFixed(2));
      setFNote(editingTrade.note || '');
    } else if (state.showManualAddForm) {
      const entryNum = Number(state.calcEntry) || 4042.59;
      const riskNum = Number(state.calcRisk) || 120;
      const dirVal = state.calcDir || 'BUY';
      const comp = computeTradePricesAndMetrics({
        dir: dirVal,
        entry: entryNum,
        risk: riskNum,
        status: 'FULL_SWEEP',
      });
      setFId('T-' + Date.now().toString().slice(-5));
      setFDate(getBangkokIsoDate());
      setFTime(getBangkokTimeHHMM());
      setFPort(state.activePort || portKeys[0] || 'port1');
      setFDir(dirVal);
      setFEntry(entryNum.toFixed(2));
      setFRisk(riskNum);
      setFLotLeg(comp.lotLeg.toFixed(2));
      setFSlPrice(comp.slPrice.toFixed(2));
      setFTp1Price(comp.tp1Price.toFixed(2));
      setFTp2Price(comp.tp2Price.toFixed(2));
      setFTp3Price(comp.tp3Price.toFixed(2));
      setFOutcome('FULL_SWEEP');
      setFTp1Pts(comp.tp1Pts);
      setFTp2Pts(comp.tp2Pts);
      setFTp3Pts(comp.tp3Pts);
      setFSlPts(comp.slPts);
      setFTotalPts(comp.totalPts);
      setFRr(comp.rr);
      setFPnlUsd(comp.pnlUsd.toFixed(2));
      setFNote('');
    }
  }, [editingTrade, state.showManualAddForm, priceDecimals, recordedLadder]);

  const recalcPricesFromEntry = (dirVal: TradeDirection, entryStr: string) => {
    if (recordedLadder) return;
    const entryNum = parseFloat(entryStr) || 0;
    if (entryNum > 0) {
      const isBuy = dirVal === 'BUY';
      setFSlPrice((isBuy ? entryNum - 10 : entryNum + 10).toFixed(2));
      setFTp1Price((isBuy ? entryNum + 4 : entryNum - 4).toFixed(2));
      setFTp2Price((isBuy ? entryNum + 8 : entryNum - 8).toFixed(2));
      setFTp3Price((isBuy ? entryNum + 12 : entryNum - 12).toFixed(2));
    }
  };

  const applyOutcomePreset = (outcome: TradeOutcomeStatus, riskVal = fRisk) => {
    setFOutcome(outcome);
    if (!recordedLadder && outcome !== 'CUSTOM') {
      const comp = computeTradePricesAndMetrics({
        dir: fDir,
        entry: parseFloat(fEntry) || 4000,
        risk: riskVal,
        status: outcome,
      });
      setFTp1Pts(comp.tp1Pts);
      setFTp2Pts(comp.tp2Pts);
      setFTp3Pts(comp.tp3Pts);
      setFSlPts(comp.slPts);
      setFTotalPts(comp.totalPts);
      setFRr(comp.rr);
      setFPnlUsd(comp.pnlUsd.toFixed(2));
    }
  };

  const handleLegPtsChange = (p1: number, p2: number, p3: number, pSl: number) => {
    setFTp1Pts(p1);
    setFTp2Pts(p2);
    setFTp3Pts(p3);
    setFSlPts(pSl);
    const sumPts = p1 + p2 + p3 + pSl;
    setFTotalPts(sumPts);
    if (state.autoSyncFormMetrics && !recordedLadder) {
      const calcR = +(sumPts / 3000).toFixed(3);
      const calcUsd = +((sumPts / 3000) * fRisk).toFixed(2);
      setFRr(calcR);
      setFPnlUsd(calcUsd.toFixed(2));
    }
  };

  const handleSaveForm = () => {
    const entryNum = parseFloat(fEntry) || 0;
    if (entryNum <= (recordedLadder ? 0 : 10)) return;
    const firstLot = parseFloat(fLotLeg) || editingTrade?.lotLeg || fRisk / 3000;
    const legLots = recordedLadder ? [firstLot, ...recordedLadder.legLots.slice(1)] : [];

    const record: TradeRecord = {
      ...(editingTrade?.gatesPassedAtLog != null ? { gatesPassedAtLog: editingTrade.gatesPassedAtLog } : {}),
      id: fId.trim() || 'T-' + Date.now().toString().slice(-5),
      port: fPort || state.activePort,
      date: fDate || getBangkokIsoDate(),
      time: fTime || getBangkokTimeHHMM(),
      dir: fDir,
      entry: +entryNum.toFixed(priceDecimals),
      risk: recordedLadder ? Number(fRisk) : +Number(fRisk).toFixed(2),
      lotLeg: recordedLadder ? firstLot : +firstLot.toFixed(2),
      slPrice: +(parseFloat(fSlPrice) || 0).toFixed(priceDecimals),
      tp1Price: +(parseFloat(fTp1Price) || 0).toFixed(priceDecimals),
      tp2Price: +(parseFloat(fTp2Price) || 0).toFixed(priceDecimals),
      tp3Price: +(parseFloat(fTp3Price) || 0).toFixed(priceDecimals),
      tp1Pts: Number(fTp1Pts) || 0,
      tp2Pts: Number(fTp2Pts) || 0,
      tp3Pts: Number(fTp3Pts) || 0,
      slPts: Number(fSlPts) || 0,
      totalPts: Number(fTotalPts) || 0,
      rr: recordedLadder ? Number(fRr) : +Number(fRr).toFixed(3),
      pnlUsd: +(parseFloat(fPnlUsd) || 0).toFixed(2),
      status: fOutcome,
      note: fNote.trim() || (recordedLadder ? '' : fOutcome),
      ...(recordedLadder ? { calculatorDetails: {
        ...recordedLadder,
        legLots,
        totalLot: firstLot === editingTrade?.lotLeg ? recordedLadder.totalLot : legLots.reduce((total, lot) => total + lot, 0),
      } } : {}),
    };

    onSaveFullEditTrade(record, !!editingTrade);
  };

  if (modalOnly && !state.showMt5Importer) return null;

  const Wrapper: React.ElementType = modalOnly ? React.Fragment : 'section';
  const wrapperProps = modalOnly ? {} : { id: 'journal-root', className: 'fx-analysis-root' };
  const CardWrap: React.ElementType = modalOnly ? React.Fragment : 'div';
  const cardWrapProps = modalOnly ? {} : { className: 'card' };

  return (
    <Wrapper {...wrapperProps}>
      {!modalOnly && (
        <div className="fx-kpi-row-4 desk-kpi-band">
        <div className="fx-stat-card">
          <div className="fx-stat-label">{t("Win rate", "อัตราชนะ (Win Rate)")}</div>
          <div className="fx-stat-val mono">
            {totalCount ? winRate + '%' : '—'}
          </div>
          <div className="fx-stat-sub">
            {t("Won ", "ชนะ ")}{wins}{t(" of ", " จากทั้งหมด ")}{totalCount}{t(" trades (", " รายการ (")}{journalScopeLabel})
          </div>
        </div>

        <div className="fx-stat-card">
          <div className="fx-stat-label">{t("Net points", "แต้มสะสมสุทธิ (Total Points)")}</div>
          <div className="fx-stat-val mono" data-negative={runPts < 0}>
            {runPts > 0 ? '+' : ''}
            {runPts.toLocaleString()}p
          </div>
          <div className="fx-stat-sub">{t("Includes all trade legs in the current filters.", "คำนวณรวมครบทุกไม้ในตัวกรองปัจจุบัน")}</div>
        </div>

        <div className="fx-stat-card" data-kpi="cumulative-r">
          <div className="fx-stat-label">{t("Cumulative R", "ผลตอบแทนสะสม (Cumulative R)")}</div>
          <div className="fx-stat-val mono" data-negative={runR < 0}>
            {runR > 0 ? '+' : ''}
            {runR.toFixed(2)}R
          </div>
          <div className="fx-stat-sub">{t("Based on recorded risk ($) per trade", "เทียบจากความเสี่ยง ($) ที่บันทึกต่อไม้")}</div>
        </div>

        <div className="fx-stat-card" data-kpi="net-profit">
          <div className="fx-stat-label">{t("Net profit", "กำไรสุทธิรวม (Net Profit)")}</div>
          <div className="fx-stat-val mono sensitive-val" data-negative={runUsd < 0}>
            {fmtUSD(runUsd, true)}
          </div>
          <div className="fx-stat-sub mono sensitive-val">
            {t("Approximately ", "ประมาณ ")}{formattedPnlThb}
          </div>
        </div>
        </div>
        )}

      <CardWrap {...cardWrapProps}>
        {!modalOnly && (
          <div className="card-header journal-heading">
          <div className="journal-title-group">
            <h2 className="card-title desk-icon-title"><BookOpen size={17} aria-hidden="true" />{t("Trade Journal", "สมุดบันทึกการเทรด (Trade Journal)")}</h2>
            <span className="fx-meta-inline">
              {journalScopeLabel} · {t(`${totalCount} trades`, `${totalCount} รายการ`)}
            </span>
            <span className="desk-tag" data-tone={currentGates.isAllPassed ? 'gain' : 'risk'}>
              <CheckCheck size={13} aria-hidden="true" />{t('Current checklist', 'เช็กลิสต์ปัจจุบัน')} <b className="mono">{currentGates.passedCount}/12</b>
            </span>
          </div>

          <div className="journal-actions-wrap">
            <div className="journal-btn-group">
              <button
                type="button"
                className={`btn xs ${state.showMt5Importer ? 'primary' : ''}`}
                onClick={onToggleMt5Importer}
                title={t("Sync your MT5 journal via .xlsx, cloud API or Live Bridge (.ex5)", "ซิงก์สมุดเทรด MT5 ผ่านไฟล์ .xlsx, Cloud API หรือ Live Bridge (.ex5)")}
              >
                <FileInput size={14} aria-hidden="true" />
                <span>{t("Sync MT5 (3 options)", "ซิงก์ MT5 (3 ช่องทาง)")}</span>
                {Boolean(syncAutoRealtime || targetSyncAccount?.autoSyncRealtime) && (
                  <span
                    className="status-dot"
                    style={{ background: 'var(--emerald)', marginLeft: '2px' }}
                    title={t("Real-time auto-sync is on", "เปิด Auto-Sync Realtime อยู่")}
                  />
                )}
              </button>
              <button
                type="button"
                className="btn xs"
                onClick={onExportCsv}
                title={t("Download the journal as CSV", "ดาวน์โหลดตารางเทรดเป็นไฟล์ CSV")}
              >
                <Download size={14} aria-hidden="true" />
                <span>{t("Export CSV", "ส่งออก CSV")}</span>
              </button>
              <button
                type="button"
                className="btn xs"
                onClick={onPrintPdf}
                title={t("Print the account summary and journal as a PDF", "พิมพ์รายงานสรุปพอร์ตและ Trade Journal เป็น PDF")}
              >
                <Printer size={14} aria-hidden="true" />
                <span>{t("Print PDF", "พิมพ์ PDF")}</span>
              </button>
            </div>

            <div className="journal-btn-group">
              <button
                type="button"
                className={`btn xs ${state.inlineEditMode ? 'primary' : ''}`}
                onClick={onToggleInlineEdit}
                title={t("Edit directly in the table", "แก้ไขข้อมูลสดในตาราง")}
              >
                <span>{state.inlineEditMode ? t("Turn off inline editing", "ปิดแก้ตารางสด") : t("Edit in table", "แก้ตารางสด")}</span>
              </button>
              <button
                type="button"
                className="btn xs primary"
                onClick={() => onOpenTradeForm(!showTradeForm, null)}
              >
                {showTradeForm ? <X size={14} aria-hidden="true" /> : <FilePlus2 size={14} aria-hidden="true" />}
                {showTradeForm ? t('Close editor', 'ปิดแบบฟอร์ม') : t('Log trade', 'บันทึกการเทรด')}
              </button>
            </div>
          </div>
        </div>
        )}

        {state.showMt5Importer && (
          <DeskDialog
            label={t("MT5 import and sync", "นำเข้าและซิงก์ MT5")}
            onClose={onToggleMt5Importer}
            panelStyle={{ maxWidth: '760px', width: 'min(760px, calc(100vw - 24px))', padding: '18px 20px', overflowX: 'hidden' }}
          >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0 }}>
                {/* Modal Header */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    paddingBottom: '12px',
                    borderBottom: '1px solid var(--border-color)',
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '12px',
                      minWidth: 0,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.35 }}>
                        {t("Connect & sync an MT5 account (", "เชื่อมต่อและซิงก์พอร์ต MT5 (")}{targetSyncAccount ? formatAccountDisplayName(targetSyncAccount.name, lang) : t("Main account", "พอร์ตหลัก")})
                      </h3>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px', lineHeight: 1.4 }}>
                        {t("Choose a source for journal entries and account statistics.", "เลือกแหล่งข้อมูลสำหรับสมุดเทรดและสถิติพอร์ต")}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="topbar-icon-btn"
                      style={{ flexShrink: 0 }}
                      onClick={onToggleMt5Importer}
                      aria-label={t("Close", "ปิดหน้าต่าง")}
                    >
                      ✕
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <select
                        aria-label={t("Convert MT5 server time to ICT", "ชดเชยเวลาเซิร์ฟเวอร์ MT5 เป็นเวลาไทย")}
                        title={t("Convert MT5 server time to ICT (GMT+7)", "ชดเชยเวลาเซิร์ฟเวอร์ MT5 → เวลาไทย (ICT GMT+7)")}
                        className="btn xs"
                        style={{ height: '28px', padding: '0 8px', maxWidth: '100%' }}
                        value={
                          normalizeMt5TimeOffsetSetting(state.mt5TimeOffset) === 'AUTO_MT5'
                            ? 'AUTO_MT5'
                            : String(normalizeMt5TimeOffsetSetting(state.mt5TimeOffset))
                        }
                        onChange={(e) =>
                          onUpdateMt5Settings(
                            state.mt5GroupMode,
                            state.mt5IncludeFees,
                            normalizeMt5TimeOffsetSetting(e.target.value)
                          )
                        }
                      >
                        {MT5_TIME_OFFSET_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {formatMt5TimeOffsetLabel(opt, lang, true)}
                          </option>
                        ))}
                      </select>

                      <label className="gate-chk" style={{ fontSize: '12px', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={state.mt5IncludeFees}
                          onChange={(e) => onUpdateMt5Settings(state.mt5GroupMode, e.target.checked)}
                        />
                        <span>{t("Include fees / swap", "รวม Fee/Swap")}</span>
                      </label>
                    </div>

                    <div
                      style={{
                        display: 'inline-flex',
                        background: 'var(--bg-subtle)',
                        padding: '2px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-color)',
                        flexWrap: 'wrap',
                      }}
                    >
                      <button
                        type="button"
                        className={`btn xs ${state.mt5GroupMode === 'IDEA' ? 'primary' : ''}`}
                        onClick={() => onUpdateMt5Settings('IDEA', state.mt5IncludeFees)}
                      >
                        {t("Group 3 legs", "รวม 3 ไม้")}
                      </button>
                      <button
                        type="button"
                        className={`btn xs ${state.mt5GroupMode === 'POSITION' ? 'primary' : ''}`}
                        onClick={() => onUpdateMt5Settings('POSITION', state.mt5IncludeFees)}
                      >
                        {t("Keep positions separate", "แยก 1:1")}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Account Category Scope + Concise Red Prop Firm Rule */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                      <button
                        type="button"
                        className={`btn xs ${syncAccountScope === 'PROP' ? 'primary' : ''}`}
                        onClick={() => {
                          setSyncAccountScope('PROP');
                          setSyncFeedback(null);
                        }}
                      >
                        {t("Prop firm", "พอร์ตกองทุน (Prop Firm)")}
                      </button>
                      <button
                        type="button"
                        className={`btn xs ${syncAccountScope === 'PERSONAL' ? 'primary' : ''}`}
                        onClick={() => {
                          setSyncAccountScope('PERSONAL');
                          setSyncFeedback(null);
                        }}
                      >
                        {t("Personal account", "พอร์ตส่วนตัว (Personal)")}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowSafetyDetails((v) => !v)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                        fontSize: '11.5px',
                        fontWeight: 600,
                        color: 'var(--rose)',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                      }}
                    >
                      {showSafetyDetails ? t("Hide safety rules", "ซ่อนรายละเอียดกฎความปลอดภัย") : t("Read prop firm safety rules", "อ่านกฎความปลอดภัย Prop Firm")}
                    </button>
                  </div>

                  <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--rose)', lineHeight: 1.45 }}>
                    {syncAccountScope === 'PROP'
                      ? t("Avoid shared VPS and VPN services. The FundedNext rule prohibits VPS use for accounts of $50k or more. For sync, use only the cloud API or .xlsx.", "ห้ามใช้ Shared VPS และ VPN ตามกฎ FundedNext พอร์ต $50k+ ห้ามใช้ VPS ทุกกรณี ให้ซิงก์ผ่าน Cloud API หรือไฟล์ .xlsx เท่านั้น")
                      : t("Read-only sources include .xlsx reports, cloud API and Live Bridge (.ex5) on a personal computer.", "แหล่งข้อมูลแบบอ่านอย่างเดียว ได้แก่ รายงาน .xlsx, Cloud API และ Live Bridge (.ex5) บนคอมพิวเตอร์ส่วนตัว")}
                  </div>

                  {showSafetyDetails && (
                    <div
                      style={{
                        marginTop: '4px',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        background: 'var(--rose-soft)',
                        border: '1px solid var(--rose-border)',
                        fontSize: '11.5px',
                        color: 'var(--rose)',
                        lineHeight: 1.55,
                      }}
                    >
                      <div>{t("1. Avoid shared VPS and public VPN services. Firms can detect duplicate IP addresses and reject payouts. Investor-password sync is unavailable due to this risk.", "1. ห้ามใช้ Shared VPS หรือ Public VPN เพราะกองทุนตรวจจับ IP ซ้ำแล้วปฏิเสธการจ่ายเงินได้ (ระบบถอดช่องทาง Investor Password เสี่ยงออกแล้ว)")}</div>
                      <div>{t("2. Use FundedNext Official MCP or upload an .xlsx report for FundedNext accounts of $50,000 or more.", "2. พอร์ต FundedNext $50,000 ขึ้นไป ใช้ได้เฉพาะ FundedNext Official MCP หรืออัปโหลด .xlsx")}</div>
                      <div>{t("3. For FTMO, The5ers, Alpha Capital, Funding Pips and E8, use Myfxbook API, .xlsx or Live Bridge (.ex5) on a personal computer or private VPS with a dedicated IP.", "3. FTMO / The5ers / Alpha Capital / Funding Pips / E8 แนะนำ Myfxbook API, .xlsx หรือ Live Bridge (.ex5) บนเครื่องส่วนตัว / Private Dedicated IP VPS เท่านั้น")}</div>
                    </div>
                  )}
                </div>

                {/* Safe-Only 3-Channel Segmented Tabs (Clean Typography, Ordered by Speed) */}
                <div
                  className="mt5-sync-channel-tabs"
                  role="tablist"
                  aria-label={t('MT5 data sources', 'แหล่งข้อมูล MT5')}
                  onKeyDown={navigateDeskTabs}
                >
                  <button
                    type="button"
                    role="tab"
                    id="journal-sync-XLSX-tab"
                    aria-controls="journal-sync-panel"
                    aria-selected={mt5ModalTab === 'XLSX'}
                    tabIndex={mt5ModalTab === 'XLSX' ? 0 : -1}
                    className={`btn sm ${mt5ModalTab === 'XLSX' ? 'primary' : ''}`}
                    style={{ justifyContent: 'center', width: '100%' }}
                    onClick={() => selectMt5ModalTab('XLSX')}
                  >
                    {t("1. .XLSX file", "1. ไฟล์ .XLSX")}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    id="journal-sync-PROP_CLOUD-tab"
                    aria-controls="journal-sync-panel"
                    aria-selected={mt5ModalTab === 'PROP_CLOUD'}
                    tabIndex={mt5ModalTab === 'PROP_CLOUD' ? 0 : -1}
                    className={`btn sm ${mt5ModalTab === 'PROP_CLOUD' ? 'primary' : ''}`}
                    style={{ justifyContent: 'center', width: '100%' }}
                    onClick={() => selectMt5ModalTab('PROP_CLOUD')}
                  >
                    {t("2. Cloud API", "2. ซิงก์ผ่าน Cloud API")}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    id="journal-sync-LIVE_BRIDGE-tab"
                    aria-controls="journal-sync-panel"
                    aria-selected={mt5ModalTab === 'LIVE_BRIDGE'}
                    tabIndex={mt5ModalTab === 'LIVE_BRIDGE' ? 0 : -1}
                    className={`btn sm ${mt5ModalTab === 'LIVE_BRIDGE' ? 'primary' : ''}`}
                    style={{ justifyContent: 'center', width: '100%' }}
                    onClick={() => selectMt5ModalTab('LIVE_BRIDGE')}
                  >
                    {t("3. MT5 Live Bridge (.ex5)", "3. MT5 Live Bridge (.ex5)")}
                  </button>
                </div>

                <div id="journal-sync-panel" role="tabpanel" aria-labelledby={`journal-sync-${mt5ModalTab}-tab`} tabIndex={0}>
                {mt5ModalTab === 'PROP_CLOUD' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div
                      style={{
                        display: 'flex',
                        gap: '6px',
                        flexWrap: 'wrap',
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-subtle)',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      {(
                        [
                          { id: 'MYFXBOOK_API', label: 'Myfxbook API (FTMO / 5ers / Funding Pips)' },
                          { id: 'FUNDEDNEXT_MCP', label: 'FundedNext Official MCP' },
                          { id: 'PROJECTX_API', label: 'ProjectX / TopstepX (Futures)' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          className={`btn xs ${cloudConnectorMode === opt.id ? 'primary' : ''}`}
                          onClick={() => {
                            setCloudConnectorMode(opt.id);
                            setSyncFeedback(null);
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    {cloudConnectorMode === 'FUNDEDNEXT_MCP' ? (
                      targetSyncAccount && (
                        <FundedNextPilotPanel
                          lang={lang}
                          key={(pilotActions.firebaseUid ?? 'guest') + ':' + targetSyncPortId}
                          {...pilotActions}
                          pilotFeed={state.activePort === targetSyncPortId ? pilotActions.pilotFeed : null}
                          pilotPolling={state.activePort === targetSyncPortId && pilotActions.pilotPolling}
                          account={targetSyncAccount}
                          portId={targetSyncPortId}
                          journal={state.journal}
                        />
                      )
                    ) : (<>
                      <div
                        style={{
                          padding: '10px 12px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--emerald-soft)',
                          border: '1px solid var(--emerald-border)',
                          fontSize: '12px',
                          color: 'var(--text-primary)',
                          lineHeight: 1.5,
                        }}
                      >
                        {cloudConnectorMode === 'MYFXBOOK_API'
                          ? t("Myfxbook Cloud Sync reads trade history from the linked account, then signs out. It uses no shared VPS IP.", "Myfxbook Cloud Sync อ่านประวัติเทรดจากพอร์ตที่เชื่อมไว้แล้วออกจากระบบ โดยไม่ใช้ IP ของ Shared VPS")
                          : t("ProjectX / TopstepX Cloud API connects directly to a futures account (Topstep / Apex) from the cloud.", "ProjectX / TopstepX Cloud API: เชื่อมต่อพอร์ต Futures (Topstep / Apex) แบบ Cloud-to-Cloud โดยตรง")}
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
                          gap: '12px',
                        }}
                      >
                          <div className="field">
                            <label htmlFor="prop-cloud-user">
                              {cloudConnectorMode === 'MYFXBOOK_API'
                                ? t('1. Myfxbook email', '1. อีเมล Myfxbook')
                                : t('1. ProjectX username', '1. ชื่อผู้ใช้ ProjectX')}
                            </label>
                            <input
                              id="prop-cloud-user"
                              type="text"
                              value={cloudEmailOrUser}
                              onChange={(e) => setCloudEmailOrUser(e.target.value)}
                              placeholder={cloudConnectorMode === 'MYFXBOOK_API' ? 'trader@email.com' : 'topstep_username'}
                            />
                          </div>

                        <div className="field">
                          <label htmlFor="prop-cloud-secret">
                            {cloudConnectorMode === 'MYFXBOOK_API'
                              ? t('2. Myfxbook password', '2. รหัสผ่าน Myfxbook')
                              : t('2. ProjectX API key', '2. คีย์ API ของ ProjectX')}
                          </label>
                          <input
                            id="prop-cloud-secret"
                            type="password"
                            autoComplete="new-password"
                            value={cloudPasswordOrSecret}
                            onChange={(e) => setCloudPasswordOrSecret(e.target.value)}
                            placeholder={
                              cloudConnectorMode === 'MYFXBOOK_API'
                                ? t('Myfxbook password', 'รหัสผ่าน Myfxbook')
                                : t("Enter API key / token", "กรอก API Key / Token")
                            }
                          />
                        </div>

                        <div className="field">
                          <label htmlFor="prop-cloud-acc">
                            {t("3. Account ID (optional; defaults to the first account)", "3. Account ID (เว้นว่าง = พอร์ตแรกในบัญชี)")}
                          </label>
                          <input
                            id="prop-cloud-acc"
                            type="text"
                            className="mono"
                            value={cloudAccountRef}
                            onChange={(e) => setCloudAccountRef(e.target.value)}
                            placeholder={t("e.g. 14359161", "เช่น 14359161")}
                          />
                        </div>

                      </div>

                      {cloudConnectorMode !== 'MYFXBOOK_API' && (
                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '12px',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={syncAutoRealtime}
                            onChange={(e) => setSyncAutoRealtime(e.target.checked)}
                          />
                          <span>{t("Automatically sync via MCP (equity and floating P&L every 3 seconds, then import each trade as it closes)", "ซิงก์ MCP สดอัตโนมัติ (Equity / Floating ทุก 3 วินาที · ดึงประวัติปิดทันทีเมื่อปิดไม้)")}</span>
                        </label>
                      )}

                      {syncFeedback && (
                        <div
                          style={{
                            padding: '8px 12px',
                            borderRadius: 'var(--radius-xs)',
                            fontSize: '12px',
                            background: syncFeedback.ok ? 'var(--emerald-soft)' : 'var(--rose-soft)',
                            border: `1px solid ${syncFeedback.ok ? 'var(--emerald-border)' : 'var(--rose-border)'}`,
                            color: syncFeedback.ok ? 'var(--emerald)' : 'var(--rose)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                            <span>{syncFeedbackText}</span>
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                        <button
                          type="button"
                          className="btn sm primary"
                          disabled={syncBusy || !onSyncMt5ReadOnly || !targetSyncPortId}
                          onClick={() => void handleRunReadOnlySync(cloudConnectorMode)}
                        >
                          {syncBusy ? t("Testing and syncing…", "กำลังทดสอบ & ซิงก์...") : t("Test connection & sync →", "ทดสอบการเชื่อมต่อ & ซิงก์ (Test Connection) →")}
                        </button>
                        <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--rose)' }}>
                          {cloudConnectorMode === 'MYFXBOOK_API'
                            ? t(
                                "Read-only session login. Your credentials open a temporary Myfxbook session only and are never saved on disk.",
                                "สำคัญ: เชื่อมต่อแบบ Read-Only Session ชั่วคราวเท่านั้น และไม่บันทึกรหัสผ่านลงฐานข้อมูลเซิร์ฟเวอร์"
                              )
                            : t(
                                "Read-only OAuth. The server database does not store tokens or passwords.",
                                "สำคัญ: ไม่เก็บ Token/รหัสผ่านลงฐานข้อมูลเซิร์ฟเวอร์ (OAuth ทำงานแบบ Read-Only)"
                              )}
                        </span>
                      </div>
                    </>)}
                  </div>
                ) : mt5ModalTab === 'XLSX' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="mt5-dropzone" onClick={onTriggerImportFile} style={{ padding: '32px 20px' }}>
                      <svg
                        className="ico"
                        style={{ width: '32px', height: '32px', color: 'var(--accent-ink)' }}
                        viewBox="0 0 24 24"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {t("Drop an .xlsx file here or choose one from your device.", "ลากไฟล์ .xlsx มาวางหรือเลือกไฟล์จากเครื่อง")}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {t("Supports MT5 ReportHistory-*.xlsx files from any broker.", "รองรับไฟล์ ReportHistory-*.xlsx จาก MT5 ทุกโบรกเกอร์")}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-subtle)',
                        border: '1px solid var(--border-color)',
                        fontSize: '12px',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.6,
                      }}
                    >
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
                        {t("Export a report from MT5:", "วิธีส่งออกจาก MT5:")}
                      </div>
                      <div>{t("1. Open the ", "1. เปิดแท็บ ")}<span className="mono">History</span>{t(" tab at the bottom of MT5.", " ด้านล่างใน MT5")}</div>
                      <div>{t("2. Right-click and choose ", "2. คลิกขวาเลือก ")}<span className="mono">Report → Open XML (.xlsx)</span></div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '10px',
                        paddingTop: '4px',
                      }}
                    >
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>
                        {t("Reads order history only and cannot place trades.", "อ่านเฉพาะประวัติออเดอร์ ไม่มีสิทธิ์ส่งคำสั่งเทรด")}
                      </span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button type="button" className="btn sm" onClick={onToggleMt5Importer}>
                          {t("Cancel", "ยกเลิก")}
                        </button>
                        <button type="button" className="btn sm primary" onClick={onTriggerImportFile}>
                          {t("Upload & analyze", "อัปโหลดและวิเคราะห์")}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div
                      style={{
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--rose-soft)',
                        border: '1px solid var(--rose-border)',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'var(--rose)',
                        lineHeight: 1.5,
                      }}
                    >
                      {t("Live Bridge (.ex5) safety: Use a personal computer or private VPS with a dedicated IP and a receipt in your name. For FundedNext accounts of $50k or more, use FundedNext Official MCP in tab 2.", "คำเตือนสำคัญสำหรับ Live Bridge (.ex5): ใช้บนคอมพิวเตอร์ส่วนตัว หรือ Private Dedicated-IP VPS ที่มีใบเสร็จจดทะเบียนชื่อคุณเท่านั้น — พอร์ต FundedNext $50k+ ห้ามใช้ VPS ทุกกรณี ให้ใช้แท็บ 2 (FundedNext Official MCP) แทน")}
                    </div>

                    {/* Simple 3-Step Visual Guide */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      {/* Step 1 */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                          padding: '12px 14px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--bg-subtle)',
                          border: '1px solid var(--border-color)',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {t("Step 1 · Download the bridge to the MT5 folder", "ขั้นที่ 1 · ดาวน์โหลดไฟล์ Bridge ใส่โฟลเดอร์ MT5")}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {t("In MT5, select ", "เปิด MT5 กด ")}<span className="mono">File &rarr; Open Data Folder &rarr; MQL5 &rarr; Experts</span>{t(" and paste the file there.", " แล้ววางไฟล์ลงไป")}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn sm primary"
                          style={{ flexShrink: 0 }}
                          onClick={handleDownloadLiveBridgeEx5}
                        >
                          {t("Download TallyNX_Bridge_v4.ex5", "ดาวน์โหลด TallyNX_Bridge_v4.ex5")}
                        </button>
                      </div>

                      {/* Step 2 */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                          padding: '12px 14px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--bg-subtle)',
                          border: '1px solid var(--border-color)',
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {t("Step 2 · Enable WebRequest in MT5", "ขั้นที่ 2 · เปิดอนุญาต Allow WebRequest ใน MT5")}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {t("Go to ", "ไปที่ ")}<span className="mono">Tools &rarr; Options &rarr; Expert Advisors</span>{t(" Enable", " ติ๊กถูก")}{' '}
                            <strong>Allow WebRequest</strong>{t(" and paste this URL:", " แล้ววาง URL:")}{' '}
                            <span className="mono" style={{ color: 'var(--accent-ink)' }}>
                              {typeof window !== 'undefined' ? window.location.origin : 'https://desk.tallynx.com'}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn sm"
                          style={{ flexShrink: 0 }}
                          onClick={() =>
                            handleCopyText(
                              typeof window !== 'undefined'
                                ? window.location.origin
                                : 'https://desk.tallynx.com',
                              t("WebRequest URL", "URL สำหรับ WebRequest")
                            )
                          }
                        >
                          {t("Copy URL", "คัดลอก URL")}
                        </button>
                      </div>

                      {/* Step 3 */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                          padding: '12px 14px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--bg-subtle)',
                          border: '1px solid var(--border-color)',
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {t("Step 3 · Attach the EA to a chart and paste this API key", "ขั้นที่ 3 · ลาก EA ใส่กราฟ แล้ววางรหัส API Key นี้")}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>{t("Paste it into ", "วางในช่อง ")}<span className="mono">InpTredynApiKey</span>:</span>
                            <code
                              className="mono"
                              style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: 'var(--bg-surface-solid)',
                                border: '1px solid var(--border-color)',
                                color: 'var(--text-primary)',
                                fontSize: '11px',
                              }}
                            >
                              {syncTredynApiKey}
                            </code>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn sm"
                          style={{ flexShrink: 0 }}
                          onClick={() => handleCopyText(syncTredynApiKey, 'tredyn-api-key')}
                        >
                          {t("Copy API key", "คัดลอก API Key")}
                        </button>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '10px',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm)',
                        background:
                          syncFeedback?.ok ||
                          (targetSyncAccount?.syncProvider === 'LIVE_BRIDGE' &&
                            Boolean(targetSyncAccount?.lastMt5SyncAt))
                            ? 'var(--emerald-soft)'
                            : 'var(--amber-soft)',
                        border: `1px solid ${
                          syncFeedback?.ok ||
                          (targetSyncAccount?.syncProvider === 'LIVE_BRIDGE' &&
                            Boolean(targetSyncAccount?.lastMt5SyncAt))
                            ? 'var(--emerald-border)'
                            : 'var(--amber-border)'
                        }`,
                        fontSize: '12px',
                        fontWeight: 600,
                        color:
                          syncFeedback?.ok ||
                          (targetSyncAccount?.syncProvider === 'LIVE_BRIDGE' &&
                            Boolean(targetSyncAccount?.lastMt5SyncAt))
                            ? 'var(--emerald)'
                            : 'var(--amber)',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background:
                              syncFeedback?.ok ||
                              (targetSyncAccount?.syncProvider === 'LIVE_BRIDGE' &&
                                Boolean(targetSyncAccount?.lastMt5SyncAt))
                                ? 'var(--emerald)'
                                : 'var(--amber)',
                          }}
                        />
                        {syncFeedback?.ok
                          ? syncFeedbackText
                          : targetSyncAccount?.syncProvider === 'LIVE_BRIDGE' && targetSyncAccount.lastMt5SyncAt
                            ? t("MT5 Live Bridge sync recorded.", "มีประวัติซิงก์ผ่าน MT5 Live Bridge")
                            : t("Waiting for the first MT5 Bridge update. Attach the EA to the chart, then select Connect.", "รอข้อมูลครั้งแรกจาก MT5 ลาก EA ลงกราฟแล้วกดเชื่อมต่อ")}
                      </span>
                      {syncFeedback && !syncFeedback.ok && (
                        <span style={{ color: 'var(--rose)', fontWeight: 500 }}>{syncFeedbackText}</span>
                      )}
                    </div>

                    {/* Action Footer for Live Bridge */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '10px',
                        paddingTop: '4px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn sm primary"
                          disabled={syncBusy || !onSyncMt5ReadOnly || !targetSyncPortId}
                          onClick={() => {
                            setSyncAutoRealtime(true);
                            void handleRunReadOnlySync('LIVE_BRIDGE');
                          }}
                        >
                          {syncBusy ? t("Connecting…", "กำลังเชื่อมต่อ...") : t("Connect & pull from Live Bridge", "เชื่อมต่อ & ดึงข้อมูลจาก Live Bridge")}
                        </button>

                        <label className="gate-chk" style={{ fontSize: '12px', margin: 0 }}>
                          <input
                            type="checkbox"
                            checked={syncAutoRealtime}
                            onChange={(e) => setSyncAutoRealtime(e.target.checked)}
                          />
                          <span>{t("Real-time auto-sync", "ซิงก์อัตโนมัติ (Realtime)")}</span>
                        </label>
                      </div>

                      <button
                        type="button"
                        className="btn xs"
                        onClick={handleDownloadLiveBridgeEa}
                        title={t("Download the .mq5 source with the API key included", "ดาวน์โหลดซอร์ส .mq5 ที่ใส่ API Key ไว้แล้ว")}
                      >
                        {t("Download .mq5", "ดาวน์โหลดไฟล์ .mq5")}
                      </button>
                    </div>
                  </div>
                )}
                </div>
              </div>
          </DeskDialog>
        )}

      {!modalOnly && (
        <>
        {showTradeForm && (
          <DeskDialog
            label={editingTrade ? t("Edit trade", "แก้ไขรายการเทรด") : t("New trade", "บันทึกรายการเทรด")}
            onClose={() => onOpenTradeForm(false, null)}
          >
              <div className="full-edit-panel" style={{ border: 'none', padding: 0, background: 'transparent' }}>
                <div className="full-edit-header">
                  <div>
                    <div
                      style={{
                        fontSize: '15px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <span>
                        {editingTrade
                          ? t(`Edit trade (${editingTrade.id})`, `Full Edit แก้ไขรายการเทรด (${editingTrade.id})`)
                          : t("Add a trade", "เพิ่มรายการเทรด")}
                      </span>
                      {editingTrade ? (
                        <span className="pill accent">{t("Editing", "กำลังแก้ไข")}</span>
                      ) : (
                        <span className="pill emerald">{t("New trade", "สร้างรายการใหม่")}</span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {t("Edit all fields from your MT5 data, including entry, SL, TP1–3, points by leg, R:R and net P&L.", "ปรับแก้ได้ครบทุกฟิลด์ ทั้งราคา Entry/SL/TP1-3 แต้มรายไม้ ค่า R:R และกำไร/ขาดทุนสุทธิ ($) ตามจริงใน MT5")}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <label className="gate-chk" style={{ background: 'var(--bg-surface-solid)' }}>
                      <input
                        type="checkbox"
                        checked={state.autoSyncFormMetrics}
                        onChange={(e) => onToggleAutoSyncForm(e.target.checked)}
                      />
                      <span>{t("Recalculate points and P&L when status or risk changes", "คำนวณแต้มและกำไร ($) อัตโนมัติเมื่อเปลี่ยนสถานะ/Risk")}</span>
                    </label>
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => onOpenTradeForm(false, null)}
                    >
                      {t("Cancel", "ยกเลิก")}
                    </button>
                  </div>
                </div>

                <div className="full-edit-section">
                  <div className="full-edit-sec-title">
                    <span>{t("1. Trade details & risk", "1. ข้อมูลคำสั่งเทรดและพอร์ต (Trade Identity & Risk)")}</span>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          alignSelf: 'center',
                          marginRight: '4px',
                        }}
                      >
                        {t("Quick fill", "เติมค่าเร็ว")}
                      </span>
                      <button
                        type="button"
                        className="btn xs emerald"
                        onClick={() => applyOutcomePreset('FULL_SWEEP')}
                      >
                        {t("Full Sweep", "ชนะครบ 3 ไม้")}
                      </button>
                      <button
                        type="button"
                        className="btn xs"
                        onClick={() => applyOutcomePreset('TRAILING_LOCK')}
                      >
                        {t("Trailing Lock", "ล็อกกำไร")}
                      </button>
                      <button
                        type="button"
                        className="btn xs"
                        onClick={() => applyOutcomePreset('TP1_ONLY')}
                      >
                        {t("TP1 Only", "ถึง TP1 เท่านั้น")}
                      </button>
                      <button
                        type="button"
                        className="btn xs"
                        onClick={() => applyOutcomePreset('BREAK_EVEN')}
                      >
                        {t("Break Even", "เท่าทุน")}
                      </button>
                      <button
                        type="button"
                        className="btn xs rose"
                        onClick={() => applyOutcomePreset('FULL_SL')}
                      >
                        {t("Stop Loss", "ชน Stop Loss")}
                      </button>
                    </div>
                  </div>
                  <div className="input-row">
                    <div className="field">
                      <label htmlFor="m-id">{t("Trade ID", "รหัสไม้ (Trade ID)")}</label>
                      <input
                        type="text"
                        id="m-id"
                        value={fId}
                        onChange={(e) => setFId(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="m-date">{t("Date", "วันที่")}</label>
                      <input
                        type="date"
                        id="m-date"
                        value={fDate}
                        onChange={(e) => setFDate(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="m-time">{t("Time", "เวลา")}</label>
                      <input
                        type="time"
                        id="m-time"
                        value={fTime}
                        onChange={(e) => setFTime(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="m-port">{t("Account", "พอร์ต")}</label>
                      <select
                        id="m-port"
                        value={fPort}
                        onChange={(e) => setFPort(e.target.value)}
                      >
                        {portKeys.map((pid) => (
                          <option key={pid} value={pid}>
                            {formatAccountDisplayName(state.accounts[pid].name, lang)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="m-dir">{t("Direction", "ฝั่ง (Direction)")}</label>
                      <select
                        id="m-dir"
                        value={fDir}
                        onChange={(e) => {
                          const nextDir = e.target.value as TradeDirection;
                          setFDir(nextDir);
                          recalcPricesFromEntry(nextDir, fEntry);
                        }}
                      >
                        <option value="BUY">{t("BUY", "ซื้อ (BUY)")}</option>
                        <option value="SELL">{t("SELL", "ขาย (SELL)")}</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="m-risk">{t("Risk ($ / Idea)", "ความเสี่ยง ($ ต่อแผน)")}</label>
                      <input
                        type="number"
                        step={recordedLadder ? 'any' : '1'}
                        min={recordedLadder ? 0 : 1}
                        id="m-risk"
                        value={fRisk}
                        onChange={(e) => {
                          const rv = parseFloat(e.target.value) || 120;
                          setFRisk(rv);
                          if (!recordedLadder) setFLotLeg((rv / 3000).toFixed(2));
                          if (!recordedLadder && state.autoSyncFormMetrics && fOutcome !== 'CUSTOM') {
                            applyOutcomePreset(fOutcome, rv);
                          }
                        }}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="m-lotleg">{recordedLadder ? t('First leg lot', 'ล็อตไม้แรก') : t("Lots per leg (3 legs)", "Lot / ไม้ (×3 ไม้)")}</label>
                      <input
                        type="number"
                        step={recordedLadder ? 'any' : '0.01'}
                        min={recordedLadder ? 0 : 0.01}
                        id="m-lotleg"
                        value={fLotLeg}
                        onChange={(e) => setFLotLeg(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="full-edit-section">
                  <div className="full-edit-sec-title">
                    <span>{t("2. Entry, SL, TP1, TP2 & TP3", "2. ระดับราคา Entry / SL / TP1 / TP2 / TP3 (Price Levels)")}</span>
                    {!recordedLadder && <button
                      type="button"
                      className="btn xs"
                      onClick={() => recalcPricesFromEntry(fDir, fEntry)}
                    >
                      {t("Calculate SL and TP prices from entry", "คำนวณราคา SL/TP มาตรฐานจาก Entry")}
                    </button>}
                  </div>
                  <div className="input-row">
                    <div className="field">
                      <label htmlFor="m-entry">{t("Entry Price", "ราคาเข้า")}</label>
                      <input
                        type="number"
                        step={10 ** -priceDecimals}
                        id="m-entry"
                        value={fEntry}
                        onChange={(e) => {
                          setFEntry(e.target.value);
                          recalcPricesFromEntry(fDir, e.target.value);
                        }}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="m-sl-price" className="journal-level-label" data-level="SL">
                        {recordedLadder ? t('SL price', 'ราคา SL') : t("SL Price (-1,000p)", "ราคา SL (-1,000p)")}
                      </label>
                      <input
                        type="number"
                        step={10 ** -priceDecimals}
                        id="m-sl-price"
                        value={fSlPrice}
                        onChange={(e) => setFSlPrice(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="m-tp1-price" className="journal-level-label" data-level="TP1">
                        {recordedLadder ? t('TP1 price', 'ราคา TP1') : t("TP1 Price (+400p)", "ราคา TP1 (+400p)")}
                      </label>
                      <input
                        type="number"
                        step={10 ** -priceDecimals}
                        id="m-tp1-price"
                        value={fTp1Price}
                        onChange={(e) => setFTp1Price(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="m-tp2-price" className="journal-level-label" data-level="TP2">
                        {recordedLadder ? t('TP2 price', 'ราคา TP2') : t("TP2 Price (+800p)", "ราคา TP2 (+800p)")}
                      </label>
                      <input
                        type="number"
                        step={10 ** -priceDecimals}
                        id="m-tp2-price"
                        disabled={!!recordedLadder && recordedLadder.legLots.length < 2}
                        value={fTp2Price}
                        onChange={(e) => setFTp2Price(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="m-tp3-price" className="journal-level-label" data-level="TP3">
                        {recordedLadder ? t('TP3 price', 'ราคา TP3') : t("TP3 Price (+1,200p)", "ราคา TP3 (+1,200p)")}
                      </label>
                      <input
                        type="number"
                        step={10 ** -priceDecimals}
                        id="m-tp3-price"
                        disabled={!!recordedLadder && recordedLadder.legLots.length < 3}
                        value={fTp3Price}
                        onChange={(e) => setFTp3Price(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="full-edit-section">
                  <div className="full-edit-sec-title">
                    <span>{t("3. Leg results, total points & net P&L", "3. ผลลัพธ์รายไม้ แต้มสะสม และกำไรสุทธิจริงตาม MT5 (Execution & Net PnL)")}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {t("Adjust net P&L to include MT5 commission and swap.", "ปรับกำไร/ขาดทุนสุทธิให้รวมค่าคอมและ Swap จาก MT5")}
                    </span>
                  </div>
                  <div className="input-row">
                    <div className="field">
                      <label htmlFor="m-outcome">{t("Outcome", "สถานะผลลัพธ์ (Status)")}</label>
                      <select
                        id="m-outcome"
                        value={fOutcome}
                        onChange={(e) => applyOutcomePreset(e.target.value as TradeOutcomeStatus)}
                      >
                        <option value="FULL_SWEEP">{t("Full Sweep (+2,400p)", "ชนะครบ 3 ไม้ (+2,400p)")}</option>
                        <option value="TRAILING_LOCK">{t("Trailing Lock (+1,600p)", "ล็อกกำไร (+1,600p)")}</option>
                        <option value="TP1_ONLY">{t("TP1 Only (-1,600p)", "ถึง TP1 เท่านั้น (-1,600p)")}</option>
                        <option value="BREAK_EVEN">{t("Break Even (0p)", "เท่าทุน (0p)")}</option>
                        <option value="FULL_SL">{t("Stop Loss (-3,000p)", "ชน Stop Loss (-3,000p)")}</option>
                        <option value="CUSTOM">{t("Custom", "Custom (กำหนดเองอิสระ)")}</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="m-tp1-pts">{t("Leg 1 · TP1 (pts)", "ไม้ 1 · TP1 (Pts)")}</label>
                      <input
                        type="number"
                        step="10"
                        id="m-tp1-pts"
                        value={fTp1Pts}
                        onChange={(e) =>
                          handleLegPtsChange(
                            parseFloat(e.target.value) || 0,
                            fTp2Pts,
                            fTp3Pts,
                            fSlPts
                          )
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="m-tp2-pts">{t("Leg 2 · TP2 (pts)", "ไม้ 2 · TP2 (Pts)")}</label>
                      <input
                        type="number"
                        step="10"
                        id="m-tp2-pts"
                        disabled={!!recordedLadder && recordedLadder.legLots.length < 2}
                        value={fTp2Pts}
                        onChange={(e) =>
                          handleLegPtsChange(
                            fTp1Pts,
                            parseFloat(e.target.value) || 0,
                            fTp3Pts,
                            fSlPts
                          )
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="m-tp3-pts">{t("Leg 3 · TP3/TL (pts)", "ไม้ 3 · TP3/TL (Pts)")}</label>
                      <input
                        type="number"
                        step="10"
                        id="m-tp3-pts"
                        disabled={!!recordedLadder && recordedLadder.legLots.length < 3}
                        value={fTp3Pts}
                        onChange={(e) =>
                          handleLegPtsChange(
                            fTp1Pts,
                            fTp2Pts,
                            parseFloat(e.target.value) || 0,
                            fSlPts
                          )
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="m-sl-pts">{t("Stop-loss points", "แต้มฝั่งแพ้ SL (Pts)")}</label>
                      <input
                        type="number"
                        step="10"
                        id="m-sl-pts"
                        value={fSlPts}
                        onChange={(e) =>
                          handleLegPtsChange(
                            fTp1Pts,
                            fTp2Pts,
                            fTp3Pts,
                            parseFloat(e.target.value) || 0
                          )
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="m-total-pts">{t("Net points", "แต้มรวมสุทธิ (Total Pts)")}</label>
                      <input
                        type="number"
                        step="10"
                        id="m-total-pts"
                        value={fTotalPts}
                        onChange={(e) => {
                          const sumPts = parseFloat(e.target.value) || 0;
                          setFTotalPts(sumPts);
                          if (state.autoSyncFormMetrics && !recordedLadder) {
                            setFRr(+(sumPts / 3000).toFixed(3));
                            setFPnlUsd(((sumPts / 3000) * fRisk).toFixed(2));
                          }
                        }}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="m-rr">{t("R:R Multiple (R)", "อัตราผลตอบแทนต่อความเสี่ยง (R)")}</label>
                      <input
                        type="number"
                        step="0.01"
                        id="m-rr"
                        value={fRr}
                        onChange={(e) => setFRr(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="field">
                      <label
                        htmlFor="m-pnl-usd"
                        style={{ color: 'var(--emerald)', fontWeight: 600 }}
                      >
                        {t("Net P&L ($)", "กำไร/ขาดทุนสุทธิ ($)")}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        id="m-pnl-usd"
                        value={fPnlUsd}
                        onChange={(e) => setFPnlUsd(e.target.value)}
                        style={{ borderColor: 'var(--accent)', fontWeight: 600 }}
                      />
                    </div>
                  </div>

                  <div className="field" style={{ marginTop: '4px' }}>
                    <label htmlFor="m-note">
                      {t("Trade notes & review", "บันทึกช่วยจำ / เหตุผลการเข้าเทรด (Trade Note & Review)")}
                    </label>
                    <input
                      type="text"
                      id="m-note"
                      placeholder={t("e.g. Waited for an H1 close above HVN 4042.59, then entered on an M5 pullback", "เช่น รอ H1 ปิดยืนยันเหนือ HVN 4042.59 เข้าที่ M5 ย่อ")}
                      value={formatTradeNoteDisplay(fNote, lang)}
                      onChange={(e) => setFNote(e.target.value)}
                      style={{ fontFamily: 'var(--font-sans)' }}
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button type="button" className="btn emerald" onClick={handleSaveForm}>
                      {editingTrade
                        ? t("Save changes", "บันทึกการแก้ไขทั้งหมด (Save Full Edit)")
                        : t("Save new trade", "บันทึกรายการเทรดใหม่")}
                    </button>
                    {editingTrade && (
                      <>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => onDuplicateTrade(editingTrade.id)}
                        >
                          {t("Duplicate trade", "คัดลอกเป็นไม้อื่น (Duplicate)")}
                        </button>
                        <button
                          type="button"
                          className="btn rose"
                          onClick={() => onDeleteTrade(editingTrade.id)}
                        >
                          {t("Delete this trade", "ลบรายการนี้")}
                        </button>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => onOpenTradeForm(false, null)}
                  >
                    {t("Close editor", "ปิดหน้าต่างแก้ไข")}
                  </button>
                </div>
              </div>
          </DeskDialog>
        )}

        <div className="journal-tabs-bar">
          <div className="status-tabs" role="group" aria-label={t('Filter by outcome', 'กรองตามผลการเทรด')}>
            <button
              type="button"
              className={`status-tab ${state.journalStatusFilter === 'ALL' ? 'active' : ''}`}
              aria-pressed={state.journalStatusFilter === 'ALL'}
              onClick={() => onSetStatusFilter('ALL')}
            >
              {t("All ", "ทั้งหมด ")}<span className="tab-count">{countAll}</span>
            </button>
            <button
              type="button"
              className={`status-tab ${
                state.journalStatusFilter === 'FULL_SWEEP' ? 'active' : ''
              }`}
              aria-pressed={state.journalStatusFilter === 'FULL_SWEEP'}
              onClick={() => onSetStatusFilter('FULL_SWEEP')}
            >
              {t("Full sweep ", "ชนะครบ 3 ไม้ ")}<span className="tab-count">{countFull}</span>
            </button>
            <button
              type="button"
              className={`status-tab ${
                state.journalStatusFilter === 'TRAILING_LOCK' ? 'active' : ''
              }`}
              aria-pressed={state.journalStatusFilter === 'TRAILING_LOCK'}
              onClick={() => onSetStatusFilter('TRAILING_LOCK')}
            >
              {t("Trailing Lock ", "ล็อกกำไร ")}<span className="tab-count">{countTl}</span>
            </button>
            <button
              type="button"
              className={`status-tab ${state.journalStatusFilter === 'LOSS' ? 'active' : ''}`}
              aria-pressed={state.journalStatusFilter === 'LOSS'}
              onClick={() => onSetStatusFilter('LOSS')}
            >
              {t("Loss / SL ", "แพ้ / SL ")}<span className="tab-count">{countLoss}</span>
            </button>
          </div>

          <div className="journal-toolbar">
            <div className="search-box">
              <Search size={14} aria-hidden="true" />
              <input
                type="text"
                id="journal-search-inp"
                aria-label={t('Search journal', 'ค้นหาบันทึกการเทรด')}
                placeholder={t("Search by date, price or note", "ค้นหาวันที่, ราคา, โน้ต")}
                value={state.journalSearch || ''}
                onChange={(e) => onSetSearch(e.target.value)}
              />
            </div>

            <select
              id="journal-date-select"
              className="journal-port-select"
              aria-label={t("Filter by date", "กรองช่วงวันที่")}
              title={t("Filter by date range", "กรองช่วงเวลา")}
              value={state.journalDateFilter || 'ALL'}
              onChange={(e) =>
                onSetDateFilter(e.target.value as 'ALL' | 'TODAY' | '7D' | '30D')
              }
            >
              <option value="ALL">{t("All dates", "ทุกช่วงเวลา")}</option>
              <option value="TODAY">{t("Today", "วันนี้")}</option>
              <option value="7D">{t("Last 7 days", "7 วันล่าสุด")}</option>
              <option value="30D">{t("Last 30 days", "30 วันล่าสุด")}</option>
            </select>

            <select
              id="journal-session-select"
              className="journal-port-select"
              aria-label={t("Filter by trading session", "กรอง Session การเทรด")}
              title={t("Filter by market session", "กรองตลาด Session")}
              value={state.journalSessionFilter || 'ALL'}
              onChange={(e) =>
                onSetSessionFilter(e.target.value as 'ALL' | 'ASIA' | 'LONDON' | 'NY')
              }
            >
              <option value="ALL">{t("All sessions", "ทุก Session")}</option>
              <option value="ASIA">{t("Asia (06-14)", "เอเชีย (06–14)")}</option>
              <option value="LONDON">{t("London (14-20)", "ลอนดอน (14–20)")}</option>
              <option value="NY">{t("NY (20-06)", "นิวยอร์ก (20–06)")}</option>
            </select>

            <select
              id="journal-port-select"
              className="journal-port-select"
              aria-label={t('Filter by account', 'กรองตามพอร์ต')}
              title={t("Choose an account for the Trade Journal", "เลือกพอร์ตที่ต้องการดูใน Trade Journal")}
              value={state.journalFilter}
              onChange={(e) => onSetPortFilter(e.target.value)}
            >
              {portKeys.map((pid) => {
                const pCount = portTradeCounts.get(pid) ?? 0;
                return (
                  <option key={pid} value={pid}>
                    {formatAccountDisplayName(state.accounts[pid].name, lang)} ({pCount}{t(" trades)", " ไม้)")}
                  </option>
                );
              })}
              <option value="ALL">{t("All accounts (", "ดูรวมทุกพอร์ต (")}{state.journal.length}{t(" trades)", " ไม้)")}</option>
            </select>

          </div>
        </div>

        {displayRows.length === 0 ? (
          <div className="journal-empty">
            {state.journal.length ? <ListFilter size={24} aria-hidden="true" /> : <BookOpen size={24} aria-hidden="true" />}
            <strong>{state.journal.length ? t('No matching trades', 'ไม่พบรายการที่ตรงกับตัวกรอง') : t('No trades recorded yet', 'ยังไม่มีรายการบันทึกเทรด')}</strong>
            <p>{state.journal.length ? t('Change the filters to see other journal entries.', 'เปลี่ยนตัวกรองเพื่อดูรายการอื่นในสมุดเทรด') : t('Log a completed trade or import your MT5 history.', 'บันทึกการเทรดที่ปิดแล้ว หรือนำเข้าประวัติจาก MT5')}</p>
            <div>
              {state.journal.length ? (
                <button type="button" className="btn sm" onClick={resetViewFilters}>{t('Clear filters', 'ล้างตัวกรอง')}</button>
              ) : (
                <>
                  <button type="button" className="btn sm primary" onClick={() => onOpenTradeForm(true, null)}><FilePlus2 size={14} aria-hidden="true" />{t('Log trade', 'บันทึกการเทรด')}</button>
                  <button type="button" className="btn sm" onClick={onToggleMt5Importer}><FileInput size={14} aria-hidden="true" />{t('Import MT5 history', 'นำเข้าประวัติ MT5')}</button>
                </>
              )}
            </div>
          </div>
        ) : (
        <div className="table-container journal-table-scroll">
          <table className="journal-table" data-editing={!!state.inlineEditMode}>
            <thead>
              <tr>
                <th>#</th>
                <th title={t("All times are converted to ICT (Asia/Bangkok · GMT+7) before session calculation.", "เวลาทั้งหมดแสดงเป็นเวลาไทย (Asia/Bangkok · ICT GMT+7) ก่อนคำนวณ Session")}>
                  {t("Date · Time (ICT)", "วัน · เวลา (ICT)")}
                </th>
                <th>{t("Account", "พอร์ต")}</th>
                <th>{t("Side · Entry (SL)", "ฝั่ง · Entry (SL)")}</th>
                <th>{t("Leg results (TP1 / TP2 / TP3)", "ผลรายไม้ (TP1 / TP2 / TP3)")}</th>
                <th>{t("Status", "สถานะ")}</th>
                <th>{t("Points · R:R", "แต้ม · RR")}</th>
                <th style={{ textAlign: 'right' }}>{t("Net P&L (cumulative)", "กำไรสุทธิ (สะสม)")}</th>
                <th>{t("Notes", "โน้ต")}</th>
                <th className="journal-sticky-action" style={{ textAlign: 'right' }}>
                  {t("Actions", "จัดการ")}
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => {
                  const isBuy = r.dir === 'BUY';
                  const tradeSession = getTradeSession(r.time);
                  const e = Number(r.entry) || 4000;
                  const ladder = r.calculatorDetails;
                  const decimals = ladder?.contract.priceDecimals ?? 2;
                  const slP =
                    r.slPrice !== undefined
                      ? Number(r.slPrice).toFixed(decimals)
                      : (isBuy ? e - 10 : e + 10).toFixed(2);
                  const tp1P =
                    r.tp1Price !== undefined
                      ? Number(r.tp1Price).toFixed(decimals)
                      : (isBuy ? e + 4 : e - 4).toFixed(2);
                  const tp2P =
                    r.tp2Price !== undefined
                      ? Number(r.tp2Price).toFixed(decimals)
                      : (isBuy ? e + 8 : e - 8).toFixed(2);
                  const tp3P =
                    r.tp3Price !== undefined
                      ? Number(r.tp3Price).toFixed(decimals)
                      : (isBuy ? e + 12 : e - 12).toFixed(2);

                  const portObj = state.accounts[r.port];
                  const portLabel = portObj
                    ? portObj.login
                      ? `#${portObj.login}`
                      : formatAccountDisplayName(portObj.name, lang)
                    : r.port;
                  const isRowEditing = state.editingTradeId === r.id;

                  let statusText = t('Stop Loss', 'ชน Stop Loss');
                  let statusClass = 'rose';
                  if (r.status === 'FULL_SWEEP') {
                    statusText = t('Full Sweep', 'ถึงครบทุกเป้า');
                    statusClass = 'emerald';
                  } else if (r.status === 'TRAILING_LOCK') {
                    statusText = t('Trailing Lock', 'ล็อกกำไร');
                    statusClass = 'accent';
                  } else if (r.status === 'TP1_ONLY') {
                    statusText = t('TP1 Only', 'ถึง TP1 เท่านั้น');
                    statusClass = 'amber';
                  } else if (r.status === 'BREAK_EVEN') {
                    statusText = t('Break Even', 'เท่าทุน');
                    statusClass = '';
                  } else if (r.status === 'CUSTOM') {
                    statusText = t('Custom', 'กำหนดเอง');
                    statusClass = 'accent';
                  }

                  const m1Class = r.tp1Pts > 0 ? 'hit' : 'miss';
                  const m2Class = r.tp2Pts > 0 ? 'hit' : 'miss';
                  const lockedThird = r.tp3Pts > 0 && (ladder ? r.status === 'TRAILING_LOCK' : r.tp3Pts < 1000);
                  const m3Class = lockedThird ? 'tl' : r.tp3Pts > 0 ? 'hit' : 'miss';
                  const m3Label = lockedThird ? `TL ${tp1P}` : r.tp3Pts > 0 || ladder ? tp3P : `SL ${slP}`;

                  if (state.inlineEditMode) {
                    return (
                      <tr key={r.id} className={isRowEditing ? 'editing-active-row' : ''}>
                        <td className="mono" style={{ color: 'var(--text-muted)' }}>
                          #{r.seq}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                            <input
                              type="date"
                              className="inline-inp"
                              value={r.date}
                              onChange={(ev) =>
                                onInlineUpdateTrade(r.id, 'date', ev.target.value)
                              }
                              style={{ width: '105px' }}
                            />
                            <input
                              type="time"
                              className="inline-inp"
                              value={r.time}
                              onChange={(ev) =>
                                onInlineUpdateTrade(r.id, 'time', ev.target.value)
                              }
                              style={{ width: '68px' }}
                            />
                          </div>
                        </td>
                        <td>
                          <select
                            className="inline-inp"
                            value={r.port}
                            onChange={(ev) =>
                              onInlineUpdateTrade(r.id, 'port', ev.target.value)
                            }
                            style={{ width: '90px' }}
                          >
                            {portKeys.map((pid) => (
                              <option key={pid} value={pid}>
                                {formatAccountDisplayName(state.accounts[pid].name, lang)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                            <select
                              className="inline-inp"
                              value={r.dir}
                              onChange={(ev) =>
                                onInlineUpdateTrade(r.id, 'dir', ev.target.value)
                              }
                              style={{ width: '58px' }}
                            >
                              <option value="BUY">{t("BUY", "ซื้อ (BUY)")}</option>
                              <option value="SELL">{t("SELL", "ขาย (SELL)")}</option>
                            </select>
                            <input
                              type="number"
                              step={10 ** -decimals}
                              className="inline-inp"
                              value={e}
                              onChange={(ev) =>
                                onInlineUpdateTrade(
                                  r.id,
                                  'entry',
                                  parseFloat(ev.target.value) || 0
                                )
                              }
                              style={{ width: '74px' }}
                            />
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                            <input
                              type="number"
                              step="10"
                              className="inline-inp"
                              value={r.tp1Pts}
                              onChange={(ev) =>
                                onInlineUpdateTrade(
                                  r.id,
                                  'tp1Pts',
                                  parseFloat(ev.target.value) || 0
                                )
                              }
                              title={t("TP1 Pts", "แต้ม TP1")}
                              style={{ width: '50px' }}
                            />
                            <input
                              type="number"
                              step="10"
                              className="inline-inp"
                              value={r.tp2Pts}
                              onChange={(ev) =>
                                onInlineUpdateTrade(
                                  r.id,
                                  'tp2Pts',
                                  parseFloat(ev.target.value) || 0
                                )
                              }
                              title={t("TP2 Pts", "แต้ม TP2")}
                              style={{ width: '50px' }}
                            />
                            <input
                              type="number"
                              step="10"
                              className="inline-inp"
                              value={r.tp3Pts}
                              onChange={(ev) =>
                                onInlineUpdateTrade(
                                  r.id,
                                  'tp3Pts',
                                  parseFloat(ev.target.value) || 0
                                )
                              }
                              title={t("TP3 Pts", "แต้ม TP3")}
                              style={{ width: '50px' }}
                            />
                          </div>
                        </td>
                        <td>
                          <select
                            className="inline-inp"
                            value={r.status}
                            onChange={(ev) =>
                              onInlineUpdateTrade(r.id, 'status', ev.target.value)
                            }
                            style={{ width: '104px' }}
                          >
                            <option value="FULL_SWEEP">{t("Full Sweep", "ชนะครบ 3 ไม้")}</option>
                            <option value="TRAILING_LOCK">{t("Trailing Lock", "ล็อกกำไร")}</option>
                            <option value="TP1_ONLY">{t("TP1 Only", "ถึง TP1 เท่านั้น")}</option>
                            <option value="BREAK_EVEN">{t("Break Even", "เท่าทุน")}</option>
                            <option value="FULL_SL">{t("Stop Loss", "ชน Stop Loss")}</option>
                            <option value="CUSTOM">{t("Custom", "กำหนดเอง")}</option>
                          </select>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                            <input
                              type="number"
                              step="10"
                              className="inline-inp"
                              value={r.totalPts}
                              onChange={(ev) =>
                                onInlineUpdateTrade(
                                  r.id,
                                  'totalPts',
                                  parseFloat(ev.target.value) || 0
                                )
                              }
                              style={{ width: '60px' }}
                            />
                            <input
                              type="number"
                              step="0.01"
                              className="inline-inp"
                              value={r.rr}
                              onChange={(ev) =>
                                onInlineUpdateTrade(
                                  r.id,
                                  'rr',
                                  parseFloat(ev.target.value) || 0
                                )
                              }
                              style={{ width: '48px' }}
                            />
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <input
                            type="number"
                            step="0.01"
                            className="inline-inp"
                            value={r.pnlUsd}
                            onChange={(ev) =>
                              onInlineUpdateTrade(
                                r.id,
                                'pnlUsd',
                                parseFloat(ev.target.value) || 0
                              )
                            }
                            style={{
                              width: '74px',
                              textAlign: 'right',
                              fontWeight: 600,
                              color: r.pnlUsd >= 0 ? 'var(--emerald)' : 'var(--rose)',
                            }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className="inline-inp"
                            value={formatTradeNoteDisplay(r.note || '', lang)}
                            onChange={(ev) =>
                              onInlineUpdateTrade(r.id, 'note', ev.target.value)
                            }
                            style={{ width: '100px', fontFamily: 'var(--font-sans)' }}
                          />
                        </td>
                        <td className="journal-sticky-action" style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '3px' }}>
                            <button
                              type="button"
                              className="btn xs primary"
                              onClick={() => onOpenTradeForm(true, r.id)}
                              title={t(`Open full editor for ${r.id}`, `เปิด Full Edit ${r.id}`)}
                            >
                              {t("Full", "แก้ไข")}
                            </button>
                            <button
                              type="button"
                              className="btn xs"
                              onClick={() => onDuplicateTrade(r.id)}
                              title={t(`Duplicate trade ${r.id}`, `คัดลอกรายการ ${r.id}`)}
                            >
                              <Copy size={13} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="btn xs rose"
                              onClick={() => onDeleteTrade(r.id)}
                              title={t(`Delete trade ${r.id}`, `ลบรายการ ${r.id}`)}
                            >
                              <Trash2 size={13} aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr
                      key={r.id}
                      className={isRowEditing ? 'editing-active-row' : ''}
                      onDoubleClick={() => onOpenTradeForm(true, r.id)}
                      title={t("Double-click or select Edit to open the full editor.", "ดับเบิลคลิกหรือกดปุ่ม แก้ไข เพื่อเปิด Full Edit")}
                    >
                      <td data-label="#" className="mono" style={{ color: 'var(--text-muted)' }}>
                        #{r.seq}
                      </td>
                      <td className="mono" data-label={t('Date · ICT', 'วันที่ · ICT')}>
                        <strong>{r.date}</strong>
                        <div className="journal-time">{r.time} <span className="desk-tag mono" data-session={tradeSession}>{tradeSession}</span></div>
                      </td>
                      <td data-label={t("Account", "บัญชี")} className="mono" style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                        {portLabel}
                      </td>
                      <td data-label={t("Side · entry", "ฝั่ง · ราคาเข้า")} className="mono">
                        <span
                          style={{
                            marginRight: '6px',
                            fontWeight: 700,
                            fontSize: '11px',
                            color: isBuy ? 'var(--emerald)' : 'var(--rose)',
                          }}
                        >
                          {r.dir === 'BUY' ? t('Buy', 'ซื้อ') : t('Sell', 'ขาย')}
                        </span>
                        <strong style={{ fontWeight: 600 }}>{e.toFixed(decimals)}</strong>{' '}
                        <span style={{ color: 'var(--text-muted)', fontSize: '10.5px' }}>
                          ({slP})
                        </span>
                        {ladder && (
                          <div className="mono" style={{ color: 'var(--text-muted)', fontSize: '10.5px' }}>
                            {ladder.instrument === 'CUSTOM' ? t('Custom contract', 'สัญญากำหนดเอง') : ladder.instrument} · {formatCalculatorLot(ladder.totalLot)} L
                          </div>
                        )}
                      </td>
                      <td data-label={t('Targets', 'เป้าหมาย')}>
                        <div className="tp-Step-pills">
                          {[
                            { className: m1Class, label: tp1P, points: r.tp1Pts },
                            { className: m2Class, label: tp2P, points: r.tp2Pts },
                            { className: m3Class, label: m3Label, points: r.tp3Pts },
                          ].slice(0, ladder?.legLots.length ?? 3).map((leg, index) => {
                            const lot = ladder ? ` · ${formatCalculatorLot(ladder.legLots[index])} L` : '';
                            return (
                              <span key={index} className={`tp-mini ${leg.className}`}
                                title={t(`Leg ${index + 1} (${leg.points}p${lot})`, `ไม้ ${index + 1} (${leg.points}p${lot})`)}>
                                {leg.label}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td data-label={t('Outcome · gates', 'ผลลัพธ์ · ด่าน')}>
                        <span
                          style={{
                            fontSize: '11.5px',
                            fontWeight: 600,
                            color:
                              statusClass === 'emerald'
                                ? 'var(--emerald)'
                                : statusClass === 'accent'
                                ? 'var(--accent-ink)'
                                : statusClass === 'amber'
                                ? 'var(--amber)'
                                : statusClass === 'rose'
                                ? 'var(--rose)'
                                : 'var(--text-secondary)',
                          }}
                        >
                          {statusText}
                        </span>
                        <div>{r.gatesPassedAtLog == null ? (
                          <span className="desk-tag journal-gate-tag" title={t('This record has no saved 12-gate assessment.', 'รายการนี้ไม่มีผลการตรวจ 12 ด่านที่บันทึกไว้')}>
                            <ShieldQuestion size={12} aria-hidden="true" />{t('Gates unrecorded', 'ไม่มีผลตรวจด่าน')}
                          </span>
                        ) : (
                          <span className="desk-tag journal-gate-tag" data-tone={r.gatesPassedAtLog === 12 ? 'gain' : 'risk'}>
                            <CheckCheck size={12} aria-hidden="true" />{t('Gates at log', 'ด่านขณะบันทึก')} {r.gatesPassedAtLog}/12
                          </span>
                        )}</div>
                      </td>
                      <td
                        data-label={t('Points · R', 'จุด · R')}
                        className="mono"
                        style={{
                          fontWeight: 600,
                          color: r.totalPts >= 0 ? 'var(--emerald)' : 'var(--rose)',
                        }}
                      >
                        {r.totalPts >= 0 ? '+' : ''}
                        {Number(r.totalPts).toLocaleString()}p{' '}
                        <div><span className="desk-tag mono" data-tone={r.rr < 0 ? 'risk' : r.rr > 0 ? 'quant' : undefined}>
                          {r.rr > 0 ? '+' : ''}{Number(r.rr).toFixed(2)}R
                        </span></div>
                      </td>
                      <td data-label={t("Net P&L", "กำไรสุทธิ")} className="mono sensitive-val" style={{ textAlign: 'right' }}>
                        <strong
                          style={{
                            fontSize: '12.5px',
                            fontWeight: 600,
                            color: r.pnlUsd >= 0 ? 'var(--emerald)' : 'var(--rose)',
                          }}
                        >
                          {fmtUSD(r.pnlUsd, true)}
                        </strong><br />
                        <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                          ({fmtUSD(r.cumUsd, true)})
                        </span>
                      </td>
                      <td
                        data-label={t('Notes', 'บันทึก')}
                        style={{
                          maxWidth: '130px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          color: 'var(--text-secondary)',
                          fontSize: '11.5px',
                        }}
                        title={formatTradeNoteDisplay(r.note || '', lang)}
                      >
                        {formatTradeNoteDisplay(r.note || '', lang) || '-'}
                      </td>
                      <td className="journal-sticky-action" style={{ textAlign: 'right' }}>
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: '3px',
                          }}
                        >
                          <button
                            type="button"
                            className="btn xs blue"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setSnapshotModalTrade(r);
                            }}
                            title={t(`View chart snapshot for ${r.id} (cdn.tallynx.com)`, `ดู Chart Snapshot ${r.id} (cdn.tallynx.com)`)}
                            aria-label={t(`View chart snapshot for ${r.id}`, `ดู Chart Snapshot ${r.id}`)}
                          >
                            <Camera size={13} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className={`btn xs ${isRowEditing ? 'primary' : ''}`}
                            onClick={() => onOpenTradeForm(true, r.id)}
                            title={t(`Edit trade ${r.id}`, `แก้ไขรายการ ${r.id}`)}
                          >
                            <PencilLine size={13} aria-hidden="true" />{t('Edit', 'แก้ไข')}
                          </button>
                          <button
                            type="button"
                            className="btn xs"
                            onClick={() => onDuplicateTrade(r.id)}
                            title={t(`Duplicate trade ${r.id}`, `คัดลอกรายการ ${r.id}`)}
                            aria-label={t(`Duplicate trade ${r.id}`, `คัดลอกรายการ ${r.id}`)}
                          >
                            <Copy size={13} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="btn xs rose"
                            onClick={() => onDeleteTrade(r.id)}
                            title={t(`Delete trade ${r.id}`, `ลบรายการ ${r.id}`)}
                            aria-label={t(`Delete trade ${r.id}`, `ลบรายการ ${r.id}`)}
                          >
                            <Trash2 size={13} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span>
                      {t("Showing ", "แสดง ")}<strong>{visibleRows.length}</strong>{t(" of ", " จากทั้งหมด ")}<strong>{totalCount}</strong>{t(" trades (win rate ", " รายการ (Win rate ")}{winRate}%)
                    </span>
                    {totalPages > 1 && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <button
                          type="button"
                          className="btn xs"
                          disabled={safePageIndex === 0}
                          onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                        >
                          <ChevronLeft size={13} aria-hidden="true" />{t('Previous', 'ก่อนหน้า')}
                        </button>
                        <span className="mono" style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)', padding: '0 6px' }}>
                          {t("Page ", "หน้า ")}{safePageIndex + 1} / {totalPages}
                        </span>
                        <button
                          type="button"
                          className="btn xs primary"
                          disabled={!hasMoreRows}
                          onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))}
                        >
                          {t('Next 10 trades', 'ถัดไป 10 รายการ')}<ChevronRight size={13} aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>
                </td>
                <td
                  className="mono"
                  style={{ color: runPts >= 0 ? 'var(--emerald)' : 'var(--rose)' }}
                >
                  {runPts >= 0 ? '+' : ''}
                  {runPts.toLocaleString()}p ({runR >= 0 ? '+' : ''}
                  {runR.toFixed(2)}R)
                </td>
                <td
                  className="mono sensitive-val"
                  style={{
                    textAlign: 'right',
                    color: runUsd >= 0 ? 'var(--emerald)' : 'var(--rose)',
                  }}
                >
                  {fmtUSD(runUsd, true)}{' '}
                  <span style={{ color: 'var(--text-muted)', fontSize: '10.5px' }}>
                    ({formattedPnlThb})
                  </span>
                </td>
                <td />
                <td className="journal-sticky-action" />
              </tr>
            </tfoot>
          </table>
        </div>
        )}
          </>
        )}
      </CardWrap>

      {!modalOnly && snapshotModalTrade && (
        <DeskDialog
          label={t(`Chart snapshot for ${snapshotModalTrade.id}`, `ภาพกราฟของรายการ ${snapshotModalTrade.id}`)}
          onClose={() => setSnapshotModalTrade(null)}
          panelStyle={{ maxWidth: '690px' }}
        >
            <div className="card">
              <div className="card-header">
                <div>
                  <h3 className="card-title">
                    {t('Journal snapshot', 'ภาพจากบันทึกการเทรด')} · {snapshotModalTrade.id}
                  </h3>
                  <div className="fx-meta-inline mono">
                    {snapshotModalTrade.date} · {snapshotModalTrade.time} ICT
                  </div>
                </div>
                <button
                  type="button"
                  className="btn xs"
                  onClick={() => setSnapshotModalTrade(null)}
                >
                  <X size={13} aria-hidden="true" />{t('Close', 'ปิด')}
                </button>
              </div>
              <div style={{ padding: '12px' }}>
                <img
                  src={generateOrderSnapshotSvgDataUrl(snapshotModalTrade)}
                  alt={t(`Recorded levels for ${snapshotModalTrade.id}`, `ระดับราคาที่บันทึกไว้ของ ${snapshotModalTrade.id}`)}
                  style={{ width: '100%', height: 'auto', borderRadius: '8px', display: 'block' }}
                />
              </div>
            </div>
        </DeskDialog>
      )}
    </Wrapper>
  );
});

TradeJournalSection.displayName = 'TradeJournalSection';
