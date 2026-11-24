import React, { useEffect, useState } from 'react';
import { deskText, formatAccountDisplayName, type DeskLanguage } from '../utils/deskI18n';
import { AccountInfo, AccountType, GhrWorkspaceState } from '../types/ghr';
import { canFallbackToUsdWorkspace, formatPilotAmount } from '../utils/fundedNextPilot';
import type { PilotPortStats } from '../utils/fundedNextPilot';
import {
  fmtUSD,
  getAccountComputed,
  PORTFOLIO_PRESETS,
  PropFirmPreset,
  resolveAccountType,
} from '../utils/ghrRules';
import {
  ALL_MT5_BROKERS,
  ALL_MT5_SERVERS,
  getServersForBroker,
  inferBrokerFromServer,
} from '../utils/mt5BrokerDirectory';

const PERSONAL_PRESET_LABELS_EN: Record<string, string> = {
  personal_micro: 'Personal $500 (Micro)',
  personal_1k: 'Personal $1K (Standard)',
  personal: 'Personal $3K (100%)',
  personal_10k: 'Personal $10K (100%)',
};

export function formatPortPresetLabel(preset: PropFirmPreset, lang: DeskLanguage): string {
  if (preset.accountType === 'PERSONAL') {
    return lang === 'th' ? preset.label : PERSONAL_PRESET_LABELS_EN[preset.id] ?? preset.name;
  }
  return lang === 'th' ? preset.label.replace('Prop ', 'กองทุน ') : preset.label;
}

const ACCOUNT_STATUS_EN: ReadonlyArray<readonly [string, string]> = [
  ['รอสร้างพอร์ต', 'Awaiting Port Setup'],
  ['ถึงเป้าสะสม', 'Profit Target Reached'],
  ['กำลังเติบโต', 'Growing'],
  ['พอร์ตส่วนตัว · พร้อมเทรด', 'Personal · Ready to Trade'],
  ['ผ่านเกณฑ์ครบ', 'All Requirements Met'],
  ['ผ่านกำไร · รอวัน', 'Profit Target Met · Trading Days Pending'],
  ['กำไร +', 'Profit +'],
  ['พร้อมเทรด', 'Ready to Trade'],
  ['ขาดอีก', 'Remaining'],
];

function formatAccountStatus(status: string, lang: DeskLanguage): string {
  if (lang === 'th') return status.replace(/^Drawdown /, 'ขาดทุนสะสม ');
  const match = ACCOUNT_STATUS_EN.find(([th]) => status.startsWith(th));
  return match ? match[1] + status.slice(match[0].length) : status;
}

interface AccountSwitcherProps {
  state: GhrWorkspaceState;
  lang?: DeskLanguage;
  activePilotBalance?: string;
  pilotBalancesByPort?: Record<string, string>;
  pilotStatsByPort?: Record<string, PilotPortStats>;
  onSelectPort: (pid: string) => void;
  onSavePort: (portData: Omit<AccountInfo, 'id'>, editingId: string | null) => void;
  onDeletePort: (pid: string) => void;
  onToggleAddForm: (show: boolean, editId?: string | null) => void;
  onCloseModal?: () => void;
}

export const AccountSwitcher: React.FC<AccountSwitcherProps> = ({
  state,
  lang = 'en',
  activePilotBalance,
  pilotBalancesByPort,
  pilotStatsByPort,
  onSelectPort,
  onSavePort,
  onDeletePort,
  onToggleAddForm,
  onCloseModal,
}) => {
  const text = (en: string, th: string) => deskText(lang, en, th);
  const ports = Object.keys(state.accounts || {});
  const editingPort =
    state.editingPortId && state.accounts[state.editingPortId]
      ? state.accounts[state.editingPortId]
      : null;
  const showForm = state.showAddPortForm || !!editingPort;
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | AccountType>('ALL');

  const [accountType, setAccountType] = useState<AccountType>('PROP');
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [brokerName, setBrokerName] = useState('Prop Firm MT5');
  const [brokerServer, setBrokerServer] = useState('XAUUSD-Live');
  const [initial, setInitial] = useState<number>(6000);
  const [targetProfit, setTargetProfit] = useState<number>(480);
  const [minDays, setMinDays] = useState<number>(5);
  const [defaultRisk, setDefaultRisk] = useState<number>(120);
  const [consistencyCapPct, setConsistencyCapPct] = useState<number>(40);
  const [profitSplitPct, setProfitSplitPct] = useState<number>(90);
  const [feeRefundUsd, setFeeRefundUsd] = useState<number>(59);

  useEffect(() => {
    if (editingPort) {
      const resolvedType = resolveAccountType(editingPort);
      setAccountType(resolvedType);
      setName(editingPort.name);
      setLogin(editingPort.login);
      setBrokerName(
        editingPort.brokerName ||
          (resolvedType === 'PERSONAL' ? 'Personal Broker MT5' : 'Prop Firm MT5')
      );
      setBrokerServer(
        editingPort.brokerServer || (resolvedType === 'PERSONAL' ? 'Broker-MT5Real' : 'XAUUSD-Live')
      );
      setInitial(editingPort.initial);
      setTargetProfit(editingPort.targetProfit);
      setMinDays(editingPort.minDays);
      setDefaultRisk(editingPort.defaultRisk);
      setConsistencyCapPct(
        editingPort.consistencyCapPct ?? (resolvedType === 'PERSONAL' ? 100 : 40)
      );
      setProfitSplitPct(editingPort.profitSplitPct ?? (resolvedType === 'PERSONAL' ? 100 : 90));
      setFeeRefundUsd(editingPort.feeRefundUsd ?? (resolvedType === 'PERSONAL' ? 0 : 59));
    } else {
      setAccountType('PROP');
      setName('');
      setLogin('');
      setBrokerName('Prop Firm MT5');
      setBrokerServer('XAUUSD-Live');
      setInitial(6000);
      setTargetProfit(480);
      setMinDays(5);
      setDefaultRisk(120);
      setConsistencyCapPct(40);
      setProfitSplitPct(90);
      setFeeRefundUsd(59);
    }
  }, [editingPort?.id, state.showAddPortForm]);

  const handleSwitchMode = (nextType: AccountType) => {
    setAccountType(nextType);
    if (nextType === 'PERSONAL') {
      setConsistencyCapPct(100);
      setProfitSplitPct(100);
      setFeeRefundUsd(0);
      setMinDays(1);
      if (!brokerName.trim() || brokerName === 'Prop Firm MT5') {
        setBrokerName('Personal Broker MT5');
      }
      if (!brokerServer.trim() || brokerServer === 'XAUUSD-Live' || brokerServer === 'Prop-Eval-Server') {
        setBrokerServer('Broker-MT5Real');
      }
      if (!editingPort && (!name.trim() || name.startsWith('Prop '))) {
        setInitial(3000);
        setTargetProfit(600);
        setDefaultRisk(60);
      }
    } else {
      setConsistencyCapPct(40);
      setProfitSplitPct(90);
      setFeeRefundUsd(59);
      setMinDays(5);
      if (!brokerName.trim() || brokerName === 'Personal Broker MT5') {
        setBrokerName('Prop Firm MT5');
      }
      if (!brokerServer.trim() || brokerServer === 'Broker-MT5Real') {
        setBrokerServer('XAUUSD-Live');
      }
      if (!editingPort && (!name.trim() || name.startsWith('Personal '))) {
        setInitial(6000);
        setTargetProfit(480);
        setDefaultRisk(120);
      }
    }
  };

  const applyPreset = (preset: PropFirmPreset) => {
    setAccountType(preset.accountType);
    if (!editingPort && (!name.trim() || name.startsWith('Prop ') || name.startsWith('Personal '))) {
      setName(preset.name);
    }
    setBrokerName(preset.brokerName);
    setBrokerServer(preset.brokerServer);
    setInitial(preset.initial);
    setTargetProfit(preset.targetProfit);
    setMinDays(preset.minDays);
    setDefaultRisk(preset.defaultRisk);
    setConsistencyCapPct(preset.consistencyCapPct);
    setProfitSplitPct(preset.profitSplitPct);
    setFeeRefundUsd(preset.feeRefundUsd);
  };

  const handleSave = () => {
    onSavePort(
      {
        accountType,
        name: name.trim(),
        login: login.trim(),
        brokerName:
          brokerName.trim() ||
          (accountType === 'PERSONAL' ? 'Personal Broker MT5' : 'Prop Firm MT5'),
        brokerServer:
          brokerServer.trim() || (accountType === 'PERSONAL' ? 'Broker-MT5Real' : 'XAUUSD-Live'),
        initial: Math.max(50, Number(initial) || 1000),
        targetProfit: Math.max(10, Number(targetProfit) || 300),
        minDays: Math.max(1, Number(minDays) || (accountType === 'PERSONAL' ? 1 : 5)),
        defaultRisk: Math.max(5, Number(defaultRisk) || 30),
        consistencyCapPct:
          accountType === 'PERSONAL'
            ? Math.min(100, Math.max(10, Number(consistencyCapPct) || 100))
            : Math.min(100, Math.max(10, Number(consistencyCapPct) || 40)),
        profitSplitPct:
          accountType === 'PERSONAL'
            ? Math.min(100, Math.max(10, Number(profitSplitPct) || 100))
            : Math.min(100, Math.max(10, Number(profitSplitPct) || 90)),
        feeRefundUsd: accountType === 'PERSONAL' ? 0 : Math.max(0, Number(feeRefundUsd) || 0),
      },
      editingPort ? editingPort.id : null
    );
  };

  const visiblePresets = PORTFOLIO_PRESETS.filter((p) => p.accountType === accountType);
  const propPorts = ports.filter((pid) => resolveAccountType(state.accounts[pid]) === 'PROP');
  const personalPorts = ports.filter(
    (pid) => resolveAccountType(state.accounts[pid]) === 'PERSONAL'
  );

  const renderAccountCard = (pid: string) => {
    const acc = getAccountComputed(state.accounts, state.journal, pid);
    const displayName = formatAccountDisplayName(acc.name, lang);
    const isActive = state.activePort === pid;
    const isPilot = acc.syncProvider === 'FUNDEDNEXT_MCP';
    const liveStats = isPilot ? pilotStatsByPort?.[pid] : undefined;
    const liveCurrency = liveStats?.currency;
    const allowUsdFallback = !isPilot || canFallbackToUsdWorkspace(liveCurrency);
    const displayProfit = isPilot
      ? liveStats?.profit !== undefined
        ? liveStats.profit
        : allowUsdFallback
          ? acc.profit
          : undefined
      : acc.profit;
    const validActiveBalance =
      isActive && activePilotBalance && activePilotBalance !== '—' ? activePilotBalance : undefined;
    const displayBalanceLabel = isPilot
      ? pilotBalancesByPort?.[pid] ??
        validActiveBalance ??
        (liveStats?.balance != null
          ? formatPilotAmount(liveStats.balance, liveCurrency)
          : allowUsdFallback
            ? fmtUSD(acc.balance)
            : '—')
      : fmtUSD(acc.balance);
    const displayProfitLabel = isPilot
      ? liveStats?.profit !== undefined
        ? formatPilotAmount(liveStats.profit, liveCurrency, true)
        : allowUsdFallback
          ? fmtUSD(acc.profit, true)
          : '—'
      : fmtUSD(acc.profit, true);
    const targetProfitProgress = allowUsdFallback ? displayProfit : undefined;
    const remUsd = targetProfitProgress === undefined ? 0 : Math.max(0, +(acc.targetProfit - targetProfitProgress).toFixed(2));
    const statusText =
      acc.accountType === 'PERSONAL'
        ? formatAccountStatus(acc.badge, lang)
        : targetProfitProgress === undefined
          ? '—'
          : targetProfitProgress >= acc.targetProfit
          ? acc.currentDays >= acc.minDays
            ? text('All Requirements Met', 'ผ่านเกณฑ์ครบ')
            : text(`Target reached (${acc.currentDays}/${acc.minDays} days)`, `ถึงเป้า (${acc.currentDays}/${acc.minDays} วัน)`)
          : remUsd > 0
            ? text(`${fmtUSD(remUsd)} remaining`, `ขาดอีก ${fmtUSD(remUsd)}`)
            : formatAccountStatus(acc.badge, lang);
    const pct = Math.min(
      100,
      Math.max(0, acc.targetProfit > 0 ? ((targetProfitProgress ?? 0) / acc.targetProfit) * 100 : 0)
    );

    return (
      <div
        key={pid}
        className={`account-card ${isActive ? 'active' : ''}`}
        onClick={() => onSelectPort(pid)}
      >
        <div className="account-top">
          <div className="account-identity">
            <div className="account-name">{displayName}</div>
            <div className="account-meta">
              <span className="account-type" data-account-type={acc.accountType}>
                {acc.accountType === 'PERSONAL' ? text('Personal', 'ส่วนตัว') : text('Prop', 'กองทุน')}
              </span>
              <span className="mono">#{acc.login}{acc.brokerServer ? ` · ${acc.brokerServer}` : ''}</span>
            </div>
          </div>
          <div className="account-card-actions">
            <button
              type="button"
              className="port-edit-btn"
              onClick={(e) => {
                e.stopPropagation();
                onToggleAddForm(true, pid);
              }}
              title={text(`Edit ${displayName}`, `แก้ไข ${displayName}`)}
              aria-label={text(`Edit ${displayName}`, `แก้ไข ${displayName}`)}
            >
              ✎
            </button>
            <button
              type="button"
              className="port-del-btn"
              onClick={(e) => {
                e.stopPropagation();
                onDeletePort(pid);
              }}
              title={text(`Delete ${displayName}`, `ลบ ${displayName}`)}
              aria-label={text(`Delete ${displayName}`, `ลบ ${displayName}`)}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="account-readout">
          <span className="account-balance mono sensitive-val">
            {displayBalanceLabel}
          </span>
          <span
            className="account-profit mono sensitive-val"
            style={{
              color:
                (displayProfit ?? 0) > 0
                  ? 'var(--emerald)'
                  : (displayProfit ?? 0) < 0
                    ? 'var(--rose)'
                    : 'var(--text-secondary)',
            }}
          >
            {displayProfitLabel} / {fmtUSD(acc.targetProfit)}
          </span>
        </div>

        {targetProfitProgress !== undefined && (
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
        )}

        <div className="account-card-status">
          <span>
            {acc.currentDays}/{acc.minDays} {text('days', 'วัน')} · {acc.tradeCount} {text(acc.tradeCount === 1 ? 'trade' : 'trades', 'ไม้')}
          </span>
          <span
            className="account-status-text mono"
            style={{
              color:
                targetProfitProgress !== undefined && targetProfitProgress >= acc.targetProfit
                  ? 'var(--emerald)'
                  : (targetProfitProgress ?? 0) < 0
                    ? 'var(--rose)'
                    : 'var(--text-secondary)',
            }}
          >
            {statusText}
          </span>
        </div>
      </div>
    );
  };

  return (
    <section className="desk-account-switcher">
      <div className="sec-accounts-bar desk-modal-header">
        <h3>{text('Manage Accounts', 'จัดการพอร์ตบัญชี')} ({ports.length})</h3>
        <div className="account-switcher-actions">
          <div
            role="group"
            aria-label={text('Filter by account type', 'กรองประเภทพอร์ต')}
            className="account-filter-tabs"
          >
            <button
              type="button"
              aria-pressed={categoryFilter === 'ALL'}
              className={`btn xs ${categoryFilter === 'ALL' ? 'primary' : ''}`}
              onClick={() => setCategoryFilter('ALL')}
            >
              {text('All', 'ทั้งหมด')} ({ports.length})
            </button>
            <button
              type="button"
              aria-pressed={categoryFilter === 'PROP'}
              className={`btn xs ${categoryFilter === 'PROP' ? 'primary' : ''}`}
              onClick={() => setCategoryFilter('PROP')}
            >
              {text('Prop', 'กองทุน')} ({propPorts.length})
            </button>
            <button
              type="button"
              aria-pressed={categoryFilter === 'PERSONAL'}
              className={`btn xs ${categoryFilter === 'PERSONAL' ? 'primary' : ''}`}
              onClick={() => setCategoryFilter('PERSONAL')}
            >
              {text('Personal', 'ส่วนตัว')} ({personalPorts.length})
            </button>
          </div>
          {!showForm && (
            <button
              type="button"
              className="btn primary sm"
              onClick={() => onToggleAddForm(true, null)}
            >
              {text("+ Add Port", "+ เพิ่มพอร์ตใหม่")}
            </button>
          )}
          {onCloseModal && (
            <button
              type="button"
              className="topbar-icon-btn"
              onClick={onCloseModal}
              aria-label={text('Close port manager', 'ปิดหน้าต่างจัดการพอร์ต')}
              title={text('Close Port Manager', 'ปิดหน้าต่างจัดการพอร์ต')}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div
          className="card"
          style={{
            marginBottom: '14px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-subtle)',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {/* Form Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
              paddingBottom: '8px',
              borderBottom: '1px solid var(--border-color)',
            }}
          >
            <strong style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {editingPort ? <>{text('Edit Port', 'แก้ไขพอร์ต')} · {formatAccountDisplayName(editingPort.name, lang)}</> : text('Add Port', 'เพิ่มพอร์ตใหม่')}
            </strong>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  display: 'inline-flex',
                  gap: '2px',
                  background: 'var(--bg-surface-solid)',
                  padding: '2px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <button
                  type="button"
                  className={`btn xs ${accountType === 'PROP' ? 'primary' : ''}`}
                  onClick={() => handleSwitchMode('PROP')}
                >
                  {text('Prop Firm', 'กองทุน')}
                </button>
                <button
                  type="button"
                  className={`btn xs ${accountType === 'PERSONAL' ? 'primary' : ''}`}
                  onClick={() => handleSwitchMode('PERSONAL')}
                >
                  {text('Personal', 'ส่วนตัว')}
                </button>
              </div>

              <button
                type="button"
                className="topbar-icon-btn"
                onClick={() => onToggleAddForm(false, null)}
                aria-label={text('Close form', 'ปิดฟอร์ม')}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Quick Presets Strip */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flexWrap: 'wrap',
              fontSize: '11.5px',
            }}
          >
            <span style={{ fontWeight: 500, color: 'var(--text-muted)', marginRight: '2px' }}>
              {text("Presets", "พรีเซ็ต")}
            </span>
            {visiblePresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="btn xs"
                onClick={() => applyPreset(preset)}
              >
                {formatPortPresetLabel(preset, lang)}
              </button>
            ))}
          </div>

          {/* Section 1: ข้อมูลบัญชี (5 ช่องเรียงแถวเดียวพอดี) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {text("1. MT5 Account Details", "1. ข้อมูลบัญชี MT5")}
            </span>
            <div className="account-form-grid-5">
              <div className="field">
                <label htmlFor="new-port-name">{text("Port Name", "ชื่อพอร์ต")}</label>
                <input
                  type="text"
                  id="new-port-name"
                  placeholder={accountType === 'PERSONAL' ? text('Exness Personal $3K', 'พอร์ตส่วนตัว Exness $3K') : text('Prop Evaluation $25K', 'พอร์ตสอบกองทุน $25K')}
                  value={formatAccountDisplayName(name, lang)}
                  onChange={(e) => setName(e.target.value)}
                  style={{ fontFamily: 'var(--font-sans)' }}
                />
              </div>
              <div className="field">
                <label htmlFor="new-port-login">{text('MT5 Login', 'เลขบัญชี MT5')}</label>
                <input
                  type="text"
                  id="new-port-login"
                  placeholder="14389901"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="new-port-broker">{text("Broker", "โบรกเกอร์")}</label>
                <input
                  type="text"
                  id="new-port-broker"
                  list="account-switcher-brokers-list"
                  placeholder={accountType === 'PERSONAL' ? 'Exness / IC Markets' : 'FTMO / FundedNext'}
                  value={brokerName}
                  onChange={(e) => {
                    const nextBroker = e.target.value;
                    setBrokerName(nextBroker);
                    const matching = getServersForBroker(nextBroker);
                    if (
                      nextBroker.trim() &&
                      matching.length > 0 &&
                      matching.length < ALL_MT5_SERVERS.length &&
                      (!brokerServer.trim() ||
                        brokerServer === 'XAUUSD-Live' ||
                        brokerServer === 'Broker-MT5Real' ||
                        !matching.includes(brokerServer.trim()))
                    ) {
                      setBrokerServer(matching[0]);
                    }
                  }}
                  style={{ fontFamily: 'var(--font-sans)' }}
                />
                <datalist id="account-switcher-brokers-list">
                  {ALL_MT5_BROKERS.map((brk) => (
                    <option key={brk} value={brk} />
                  ))}
                </datalist>
              </div>
              <div className="field">
                <label htmlFor="new-port-server">{text('MT5 Server', 'เซิร์ฟเวอร์ MT5')}</label>
                <input
                  type="text"
                  id="new-port-server"
                  list="account-switcher-servers-list"
                  placeholder={accountType === 'PERSONAL' ? 'Exness-MT5Real12' : 'FTMO-Server2'}
                  value={brokerServer}
                  onChange={(e) => {
                    const nextSrv = e.target.value;
                    setBrokerServer(nextSrv);
                    const inferred = inferBrokerFromServer(nextSrv);
                    if (
                      inferred &&
                      (!brokerName.trim() ||
                        brokerName === 'Prop Firm MT5' ||
                        brokerName === 'Personal Broker MT5')
                    ) {
                      setBrokerName(inferred);
                    }
                  }}
                />
                <datalist id="account-switcher-servers-list">
                  {getServersForBroker(brokerName).map((srv) => (
                    <option key={srv} value={srv} />
                  ))}
                </datalist>
              </div>
              <div className="field">
                <label htmlFor="new-port-initial">{text("Starting Capital ($)", "ทุนตั้งต้น ($)")}</label>
                <input
                  type="number"
                  step="50"
                  min="50"
                  id="new-port-initial"
                  value={initial}
                  onChange={(e) => setInitial(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>

          {/* Section 2: เป้าหมาย & ความเสี่ยง */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {text("2. Targets and Risk", "2. เป้าหมายและความเสี่ยง")}
            </span>
            <div className="account-form-grid-3">
              <div className="field">
                <label htmlFor="new-port-target">
                  {accountType === 'PERSONAL' ? text('Profit Target ($)', 'เป้ากำไร ($)') : text('Evaluation Target ($)', 'เป้าสอบ ($)')}
                </label>
                <input
                  type="number"
                  step="10"
                  min="10"
                  id="new-port-target"
                  value={targetProfit}
                  onChange={(e) => setTargetProfit(parseFloat(e.target.value) || 0)}
                />
              </div>

              <div className="field">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', minHeight: '20px' }}>
                  <label htmlFor="new-port-risk" style={{ margin: 0, whiteSpace: 'nowrap' }}>{text('Risk ($/Idea)', 'ความเสี่ยง ($/ชุด)')}</label>
                  <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '3px' }}>
                    {(accountType === 'PERSONAL' ? [30, 60, 90, 150] : [60, 90, 120, 150]).map((rv) => (
                      <button
                        key={rv}
                        type="button"
                        className={`btn xs ${defaultRisk === rv ? 'primary' : ''}`}
                        style={{ padding: '1px 5px', fontSize: '10px', height: '18px' }}
                        onClick={() => setDefaultRisk(rv)}
                      >
                        ${rv}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="number"
                  step="5"
                  min="5"
                  id="new-port-risk"
                  value={defaultRisk}
                  onChange={(e) => setDefaultRisk(parseFloat(e.target.value) || 0)}
                  placeholder="120"
                />
              </div>

              {accountType === 'PROP' && (
                <>
                  <div className="field">
                    <label htmlFor="new-port-mindays">{text("Minimum Trading Days", "วันเทรดขั้นต่ำ")}</label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      id="new-port-mindays"
                      value={minDays}
                      onChange={(e) => setMinDays(parseInt(e.target.value, 10) || 1)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="new-port-cap">{text('Consistency Cap (%)', 'เพดานกำไรรายวัน (%)')}</label>
                    <input
                      type="number"
                      step="5"
                      min="10"
                      max="100"
                      id="new-port-cap"
                      value={consistencyCapPct}
                      onChange={(e) => setConsistencyCapPct(parseFloat(e.target.value) || 40)}
                      title={text('40% standard cap, 30% strict cap, 100% uncapped', '40% เพดานมาตรฐาน, 30% เพดานเข้มงวด, 100% ไม่จำกัด')}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="new-port-split">{text('Profit Split (%)', 'ส่วนแบ่งกำไร (%)')}</label>
                    <input
                      type="number"
                      step="5"
                      min="10"
                      max="100"
                      id="new-port-split"
                      value={profitSplitPct}
                      onChange={(e) => setProfitSplitPct(parseFloat(e.target.value) || 90)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="new-port-refund">{text('Fee Refund ($)', 'เงินคืนค่าสอบ ($)')}</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      id="new-port-refund"
                      value={feeRefundUsd}
                      onChange={(e) => setFeeRefundUsd(Math.max(0, parseFloat(e.target.value) || 0))}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Form Actions Footer */}
          <div className="desk-modal-footer">
            <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {accountType === 'PERSONAL'
                ? text('Personal · No daily profit cap', 'พอร์ตส่วนตัว · ไม่จำกัดสัดส่วนกำไรรายวัน')
                : text(`Prop Rules · Cap ${consistencyCapPct}% · Split ${profitSplitPct}%`, `กฎกองทุน · เพดาน ${consistencyCapPct}% · ส่วนแบ่ง ${profitSplitPct}%`)}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn sm"
                onClick={() => onToggleAddForm(false, null)}
              >
                {text("Cancel", "ยกเลิก")}
              </button>
              <button type="button" className="btn primary sm" onClick={handleSave}>
                {editingPort ? text('Save Changes', 'บันทึกการแก้ไข') : text('Save New Port', 'บันทึกพอร์ตใหม่')}
              </button>
            </div>
          </div>
        </div>
      )}

      {ports.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '36px 20px', alignItems: 'center' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{text("No accounts yet", "ยังไม่มีพอร์ต")}</div>
          <button type="button" className="btn primary sm" onClick={() => onToggleAddForm(true, null)}>
            {text("+ Add Port", "+ เพิ่มพอร์ตใหม่")}
          </button>
        </div>
      ) : (
        <div id="account-cards-root" className="account-groups">
          {(categoryFilter === 'PROP' || (categoryFilter === 'ALL' && propPorts.length > 0)) && (
            <div className="account-group">
              <div className="account-group-heading">
                <strong>
                  {text('Prop Firm Accounts', 'พอร์ตกองทุน')} ({propPorts.length})
                </strong>
                <span>
                  {text('Shared VPS and public VPNs are prohibited. FundedNext $50k+ accounts require official MCP or a local PC.', 'ห้ามใช้ VPS ร่วมและ VPN สาธารณะ บัญชี FundedNext $50k ขึ้นไปต้องใช้ MCP ทางการหรือเครื่องของตนเอง')}
                </span>
              </div>
              {propPorts.length === 0 ? (
                <div className="card" style={{ padding: '14px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  {text('No prop accounts yet. Select Add Port and choose Prop Firm.', 'ยังไม่มีพอร์ตกองทุน กดเพิ่มพอร์ตใหม่แล้วเลือกกองทุน')}
                </div>
              ) : (
                <div className="account-grid">{propPorts.map(renderAccountCard)}</div>
              )}
            </div>
          )}

          {(categoryFilter === 'PERSONAL' || (categoryFilter === 'ALL' && personalPorts.length > 0)) && (
            <div className="account-group">
              <div className="account-group-heading">
                <strong>
                  {text('Personal Accounts', 'พอร์ตส่วนตัว')} ({personalPorts.length})
                </strong>
                <span>
                  {text("Sync through Live Bridge (.ex5) or Cloud API, or import an .xlsx report.", "ซิงก์ผ่าน Live Bridge (.ex5) หรือ Cloud API หรือนำเข้ารายงาน .xlsx")}
                </span>
              </div>
              {personalPorts.length === 0 ? (
                <div className="card" style={{ padding: '14px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  {text('No personal accounts yet. Select Add Port and choose Personal.', 'ยังไม่มีพอร์ตส่วนตัว กดเพิ่มพอร์ตใหม่แล้วเลือกพอร์ตส่วนตัว')}
                </div>
              ) : (
                <div className="account-grid">{personalPorts.map(renderAccountCard)}</div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
