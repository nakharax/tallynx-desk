import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountInfo, TradeRecord } from '../types/ghr';
import {
  formatPilotAmount,
  FundedNextPilotError,
  FUNDEDNEXT_PILOT_SOURCE,
  FUNDEDNEXT_POLL_MS,
  isPilotReconnect,
  isPilotReconnectStatus,
  listPilotAccounts,
  migratePilotJournal,
  readPilotAccount,
  requestFundedNext,
} from '../utils/fundedNextPilot';
import type { PilotAccountChoice, PilotExecutions, PilotPortChange, PilotReadState, PilotTokenGetter } from '../utils/fundedNextPilot';
import { deskText } from '../utils/deskI18n';
import type { DeskLanguage } from '../utils/deskI18n';

export interface FundedNextPilotActions {
  firebaseUid: string | null;
  onGetIdToken: PilotTokenGetter;
  pilotFeed: PilotReadState | null;
  pilotPolling: boolean;
  pilotOAuthPort: string | null;
  onConnectPilot: (portId: string, connectionId?: string) => Promise<{ connectionId: string; status: string } | undefined>;
  onCancelPilotOAuth: () => void;
  onUpdatePilotPorts: (uid: string, change: PilotPortChange) => Promise<void>;
}

interface Props extends FundedNextPilotActions {
  lang?: DeskLanguage;
  account: AccountInfo;
  portId: string;
  journal: TradeRecord[];
}

const showTime = (date: string, lang: DeskLanguage) =>
  new Date(date).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok' }) + ' ICT';

type PilotCopy = [english: string, thai: string];

const PILOT_STATUS_LABELS: Record<string, PilotCopy> = {
  CONNECTED: ['Connected', 'เชื่อมต่อแล้ว'],
  DISCONNECTED: ['Disconnected', 'ยกเลิกการเชื่อมต่อแล้ว'],
  RECONNECT_REQUIRED: ['Reconnect required', 'ต้องเชื่อมต่อใหม่'],
  DEGRADED: ['Limited service', 'บริการขัดข้องบางส่วน'],
  SYNCING: ['Syncing', 'กำลังซิงก์'],
  PARTIAL: ['Partial data', 'ข้อมูลบางส่วน'],
  COMPLETE: ['Complete', 'ซิงก์ครบแล้ว'],
  QUEUED: ['Queued', 'รอคิว'],
};

function formatPilotStatus(status: string, lang: DeskLanguage): string {
  const labels = PILOT_STATUS_LABELS[status];
  return labels ? deskText(lang, ...labels) : status;
}

function formatPilotMessage(message: string, lang: DeskLanguage): string {
  switch (message) {
    case 'Duplicate cursor detected':
      return deskText(lang, message, 'หยุดโหลดเพิ่มเพราะได้เคอร์เซอร์ซ้ำ');
    case 'Broker synchronization temporarily unavailable':
      return deskText(lang, message, 'ซิงก์ข้อมูลจากโบรกเกอร์ไม่ได้ชั่วคราว');
    case 'FundedNext Pilot request failed':
      return deskText(lang, message, 'ส่งคำขอไปยัง FundedNext Pilot ไม่สำเร็จ');
    case "Couldn't load FundedNext accounts":
      return deskText(lang, message, 'โหลดบัญชี FundedNext ไม่สำเร็จ');
    case "Couldn't load FundedNext data":
      return deskText(lang, message, 'โหลดข้อมูล FundedNext ไม่สำเร็จ');
    default:
      return lang === 'en' && /[\u0e00-\u0e7f]/.test(message) ? 'FundedNext Pilot request failed' : message;
  }
}

export function FundedNextPilotPanel({
  lang = 'en',
  account, portId, journal, firebaseUid, onGetIdToken, pilotFeed, pilotPolling, pilotOAuthPort,
  onConnectPilot, onCancelPilotOAuth, onUpdatePilotPorts,
}: Props) {
  const t = (english: string, thai: string) => deskText(lang, english, thai);
  const tokenRef = useRef(onGetIdToken);
  tokenRef.current = onGetIdToken;
  const getToken = useCallback(() => tokenRef.current(), []);
  const connectionId = account.fundedNextConnectionId;
  const accountId = account.fundedNextAccountId;
  const [directory, setDirectory] = useState<Awaited<ReturnType<typeof listPilotAccounts>> | null>(null);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [missingConnectionId, setMissingConnectionId] = useState<string | null>(null);
  const [localRead, setLocalRead] = useState<(PilotReadState & { accountId: string }) | null>(null);
  const [extraExecutions, setExtraExecutions] = useState<(PilotExecutions & { accountId: string }) | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string | PilotCopy; ok: boolean } | null>(null);
  const [reconnectId, setReconnectId] = useState<string | null>(null);
  const pendingAction = useRef<AbortController | null>(null);
  const lastDiscoveredSig = useRef<string>('');
  useEffect(() => () => pendingAction.current?.abort(), []);

  useEffect(() => {
    if (!firebaseUid) {
      lastDiscoveredSig.current = '';
      return;
    }
    const controller = new AbortController();
    let loading = false;
    const refresh = async () => {
      if (loading || document.visibilityState !== 'visible') return;
      loading = true;
      try {
        const result = await listPilotAccounts(getToken, connectionId, controller.signal).catch(async error => {
          if (!connectionId || !(error instanceof FundedNextPilotError) || error.httpStatus !== 404) throw error;
          if (!controller.signal.aborted) setMissingConnectionId(connectionId);
          return listPilotAccounts(getToken, undefined, controller.signal);
        });
        if (!controller.signal.aborted) {
          setDirectory(result);
          setDirectoryError(null);
          if (result.connectionStatus) setMissingConnectionId(null);
          const trackedSig = result.accounts
            .filter(item => item.tracked)
            .map(item => `${item.id}:${item.connectionId}:${item.login ?? ''}`)
            .sort()
            .join('|');
          if (trackedSig && trackedSig !== lastDiscoveredSig.current) {
            lastDiscoveredSig.current = trackedSig;
            void onUpdatePilotPorts(firebaseUid, { type: 'discover', accounts: result.accounts });
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setDirectoryError(error instanceof Error ? error.message : "Couldn't load FundedNext accounts");
          if (isPilotReconnect(error)) setReconnectId(connectionId || '');
        }
      } finally {
        loading = false;
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, FUNDEDNEXT_POLL_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [firebaseUid, getToken, connectionId, refreshKey, pilotOAuthPort, onUpdatePilotPorts]);

  useEffect(() => {
    if (!firebaseUid || !accountId || pilotPolling) return;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const data = await readPilotAccount(getToken, accountId, controller.signal);
        if (!controller.signal.aborted) setLocalRead({ accountId, data, error: null, reconnect: false });
      } catch (error) {
        if (!controller.signal.aborted) setLocalRead({
          accountId, data: null, reconnect: isPilotReconnect(error),
          error: error instanceof Error ? error.message : "Couldn't load FundedNext data",
        });
      }
    };
    void refresh();
    return () => controller.abort();
  }, [firebaseUid, accountId, getToken, pilotPolling, refreshKey, pilotOAuthPort]);

  const isPilotPort = account.syncProvider === 'FUNDEDNEXT_MCP';
  const selected = isPilotPort ? directory?.accounts.find(item => item.id === accountId) : undefined;
  const trackedCount = directory?.accounts.filter(item => item.tracked).length ?? 0;
  const read = pilotPolling ? pilotFeed : localRead?.accountId === accountId ? localRead : null;
  const snapshot = read?.data?.snapshot;
  const connectionStatus = directory?.connectionStatus;
  const connectionMissing = Boolean(connectionId && missingConnectionId === connectionId);
  const reconnect = reconnectId !== null || connectionMissing || read?.reconnect || isPilotReconnectStatus(connectionStatus) || connectionStatus === 'DISCONNECTED' ||
    (isPilotPort && !connectionId);
  const extra = extraExecutions?.accountId === accountId ? extraExecutions : null;
  const nextCursor = extra ? extra.nextCursor : read?.data?.nextCursor;
  const executions = [...new Map([...(extra?.executions ?? []), ...(read?.data?.executions ?? [])].map(row => [row.id, row])).values()];
  const evidence = [snapshot, ...(snapshot?.openPositions ?? []), ...executions];
  const missing = [...new Set(evidence.flatMap(item => item?.missingFields ?? []))];
  const unverified = [...new Set(evidence.flatMap(item => item?.unverifiedFields ?? []))];
  const syncStatus = reconnect ? 'RECONNECT_REQUIRED'
    : read?.error || directoryError || connectionStatus === 'DEGRADED' ? 'DEGRADED'
    : read?.data?.syncStatus === 'COMPLETE' && (missing.length || unverified.length) ? 'PARTIAL'
    : read?.data?.syncStatus ?? (connectionId || pilotOAuthPort === portId ? 'SYNCING' : 'PARTIAL');
  const actionDisabled = busy || Boolean(pilotOAuthPort) || !firebaseUid;

  async function run(action: (signal: AbortSignal) => Promise<PilotCopy | ''>, failedConnection?: string) {
    if (!firebaseUid || pendingAction.current) return;
    const controller = new AbortController();
    pendingAction.current = controller;
    setBusy(true);
    setFeedback(null);
    try {
      const text = await action(controller.signal);
      if (!controller.signal.aborted) {
        if (text) setFeedback({ ok: true, text });
        setRefreshKey(key => key + 1);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        if (isPilotReconnect(error)) setReconnectId(failedConnection ?? connectionId ?? '');
        setFeedback({ ok: false, text: error instanceof Error ? error.message : 'FundedNext Pilot request failed' });
      }
    } finally {
      pendingAction.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  function setTracking(item: PilotAccountChoice, tracked: boolean) {
    if (!firebaseUid) return;
    void run(async signal => {
      const { account: changed } = await requestFundedNext<{ account: PilotAccountChoice }>(getToken, `/accounts/${encodeURIComponent(item.id)}/tracking`, {
        method: 'PATCH', body: JSON.stringify({ tracked }), signal,
      });
      signal.throwIfAborted();
      const bindNewPort = Boolean(
        tracked &&
        accountId &&
        accountId !== changed.id &&
        account.login &&
        changed.login &&
        account.login.trim() !== changed.login.trim()
      );
      await onUpdatePilotPorts(
        firebaseUid,
        tracked
          ? { type: 'select', portId, account: changed, createNewPort: bindNewPort }
          : { type: 'stop', accountId: changed.id }
      );
      setDirectory(previous => previous && ({ ...previous, accounts: previous.accounts.map(row => row.id === changed.id ? changed : row) }));
      setReconnectId(null);
      return tracked
        ? bindNewPort
          ? [`Added and connected account #${changed.login || changed.accountId}`, `เพิ่มและเชื่อมต่อพอร์ต #${changed.login || changed.accountId} แล้ว`]
          : [`Selected account #${changed.login || changed.accountId}`, `เลือกบัญชี #${changed.login || changed.accountId} สำหรับพอร์ตนี้แล้ว`]
        : ['Account tracking stopped', 'หยุดติดตามบัญชีแล้ว'];
    }, item.connectionId);
  }

  return (
    <section aria-label={t(FUNDEDNEXT_PILOT_SOURCE, 'FundedNext Official MCP (โครงการนำร่องผ่านเซิร์ฟเวอร์)')} className="fundednext-card">
      <div className="fundednext-heading">
        <h3>{t(FUNDEDNEXT_PILOT_SOURCE, 'FundedNext Official MCP (โครงการนำร่องผ่านเซิร์ฟเวอร์)')}</h3>
        <div className="fundednext-badges">
          <strong className="fundednext-badge mono" data-tone={reconnect ? 'error' : syncStatus === 'COMPLETE' ? 'complete' : 'pending'}>
            <span className="fundednext-status-dot" aria-hidden="true" />
            {formatPilotStatus(syncStatus, lang)}
          </strong>
          {connectionStatus && connectionStatus !== syncStatus && (
            <span className="fundednext-badge mono">{formatPilotStatus(connectionStatus, lang)}</span>
          )}
          {firebaseUid && <span className="fundednext-badge">{t("Track ", "ติดตาม ")}<strong className="mono">{trackedCount}/3</strong></span>}
        </div>
      </div>
      {!firebaseUid && <div role="status">{t("Sign in to connect FundedNext Pilot.", "เข้าสู่ระบบเพื่อเชื่อมต่อ FundedNext Pilot")}</div>}
      {reconnect && <div role="status" style={{ color: 'var(--rose)' }}>{t("Reconnect FundedNext to resume syncing.", "เชื่อมต่อ FundedNext ใหม่เพื่อซิงก์ข้อมูลต่อ")}</div>}
      <div className="fundednext-actions">
        <button type="button" className="btn sm primary" disabled={actionDisabled} onClick={() => void run(async () => {
          const result = await onConnectPilot(portId, connectionMissing ? undefined : (reconnectId || connectionId));
          if (!result) return '';
          setReconnectId(null);
          setDirectory(null);
          setLocalRead(null);
          return ['Connected · Discovering FundedNext accounts', 'เชื่อมต่อแล้ว · กำลังค้นหาบัญชี FundedNext'];
        })}>{pilotOAuthPort === portId ? t("Waiting for FundedNext…", "กำลังรอ FundedNext…") : connectionId || reconnect ? t("Reconnect FundedNext", "เชื่อมต่อ FundedNext ใหม่") : t("Connect FundedNext", "เชื่อมต่อ FundedNext")}</button>
        {pilotOAuthPort === portId && (
          <button type="button" className="btn xs" onClick={onCancelPilotOAuth}>{t("Disconnect", "ยกเลิกการเชื่อมต่อ")}</button>
        )}
        {connectionId && firebaseUid && !connectionMissing && connectionStatus !== 'DISCONNECTED' && (
          <button type="button" className="btn xs" disabled={actionDisabled} onClick={() => void run(async signal => {
            await requestFundedNext(getToken, `/connections/${encodeURIComponent(connectionId)}`, { method: 'DELETE', signal });
            signal.throwIfAborted();
            await onUpdatePilotPorts(firebaseUid, { type: 'stop', connectionId });
            setReconnectId(connectionId);
            setLocalRead(null);
            setExtraExecutions(null);
            return ['Disconnected · Your journal history and notes are still available.', 'ยกเลิกการเชื่อมต่อแล้ว · ประวัติและโน้ตในสมุดเทรดยังอยู่'];
          })}>{t("Disconnect", "ยกเลิกการเชื่อมต่อ")}</button>
        )}
      </div>

      {firebaseUid && <div className="fundednext-directory">
        <strong>{t("FundedNext accounts", "บัญชี FundedNext")}</strong>
        {!directory?.accounts.length && !directoryError && <div style={{ color: 'var(--text-muted)' }}>
          {connectionId ? t("Looking for FundedNext accounts…", "กำลังค้นหาบัญชี FundedNext…") : t("No FundedNext accounts found", "ยังไม่พบบัญชี FundedNext")}
        </div>}
        {directory?.accounts.map(item => (
          <div key={item.id} className="fundednext-port" data-active={item.id === accountId}>
            <span className="mono">#{item.login || item.accountId}{item.id === accountId ? t(" · This account", " · พอร์ตนี้") : ''}</span>
            <div className="fundednext-actions">
              <button type="button" className={`btn xs ${item.id === accountId ? 'primary' : ''}`}
                disabled={actionDisabled || (item.tracked && item.id === selected?.id) || (!item.tracked && trackedCount >= 3)}
                onClick={() => setTracking(item, true)}>{item.tracked ? t("Select account", "เลือกบัญชี") : t("Track and select", "ติดตามและเลือก")}</button>
              {item.tracked && <button type="button" className="btn xs" disabled={actionDisabled}
                onClick={() => setTracking(item, false)}>{t("Stop tracking", "หยุดติดตาม")}</button>}
            </div>
          </div>
        ))}
      </div>}

      {accountId && firebaseUid && <>
        <div className="fundednext-actions">
          <label className="fundednext-autosync"><input type="checkbox" checked={isPilotPort && account.autoSyncRealtime === true}
            disabled={actionDisabled || reconnect || !selected?.tracked}
            onChange={event => {
              const enabled = event.target.checked;
              void run(async () => {
                await onUpdatePilotPorts(firebaseUid, { type: 'autoSync', portId, enabled });
                return '';
              });
            }} />{t(" Sync account snapshots and trade fills automatically", " ซิงก์ภาพรวมพอร์ตและรายการจับคู่อัตโนมัติ")}</label>
          <button type="button" className="btn xs" disabled={actionDisabled || reconnect || !selected?.tracked}
            onClick={() => void run(async signal => {
              const job = await requestFundedNext<{ status: 'QUEUED' }>(getToken, `/accounts/${encodeURIComponent(accountId)}/sync`, { method: 'POST', signal });
              return [`Sync job · ${formatPilotStatus(job.status, 'en')}`, `งานซิงก์ · ${formatPilotStatus(job.status, 'th')}`];
            })}>{t("Sync account", "ซิงก์บัญชี")}</button>
          {!pilotPolling && <button type="button" className="btn xs" disabled={actionDisabled}
            onClick={() => setRefreshKey(key => key + 1)}>{t("Refresh synced data", "อัปเดตข้อมูลที่ซิงก์แล้ว")}</button>}
        </div>
        <div className="fundednext-snapshot">
          <dl className="fundednext-readout">
            <div><dt>{t("Balance", "ยอดคงเหลือ")}</dt><dd className="mono">{formatPilotAmount(snapshot?.balance, snapshot?.currency)}</dd></div>
            <div><dt>{t("Floating PnL", "กำไร/ขาดทุนลอยตัว")}</dt><dd className="mono">{formatPilotAmount(snapshot?.floatingPnl, snapshot?.currency)}</dd></div>
            <div><dt>{t("Open positions", "สถานะที่เปิดอยู่")}</dt><dd className="mono">{snapshot?.openPositions.length ?? '—'}</dd></div>
          </dl>
          <div>{t("Source Time ", "เวลาต้นทาง ")}<span className="mono">{snapshot?.sourceTimestampRaw ?? '—'}</span>{snapshot?.sourceTimestampRaw && ` · ${snapshot.sourceTimezone ?? t('Timezone unverified', 'ยังไม่ยืนยันเขตเวลา')}`}</div>
          <div>{t("Last Checked ", "ตรวจล่าสุด ")}<span className="mono">{snapshot?.fetchedAt ? showTime(snapshot.fetchedAt, lang) : '—'}</span></div>
          {snapshot?.lastCheckedAt && <div>{t("Last worker check-in ", "ระบบรายงานสถานะล่าสุด ")}<span className="mono">{showTime(snapshot.lastCheckedAt, lang)}</span></div>}
          {snapshot?.blockedReason && <div style={{ color: 'var(--amber)' }}>{formatPilotMessage(snapshot.blockedReason, lang)}</div>}
          {missing.length > 0 && <div style={{ color: 'var(--amber)' }}>{t("Missing fields · ", "ข้อมูลที่ขาด · ")}{missing.join(', ')}</div>}
          {unverified.length > 0 && <div style={{ color: 'var(--amber)' }}>{t("Unverified fields · ", "ข้อมูลที่ยังไม่ยืนยัน · ")}{unverified.join(', ')}</div>}
        </div>
        {!reconnect && <details className="fundednext-executions">
          <summary>{t("FundedNext Executions (", "รายการคำสั่ง FundedNext (")}{executions.length})</summary>
          {executions.length > 0 && <div className="fundednext-table-scroll" role="group" aria-label={t("FundedNext executions", "รายการคำสั่ง FundedNext")} tabIndex={0}>
            <table className="mono">
              <thead><tr><th scope="col">{t("Deal", "เลขดีล")}</th><th scope="col">{t("Symbol", "สินทรัพย์")}</th><th scope="col">{t("Side", "ฝั่ง")}</th><th scope="col">{t("Lots", "ล็อต")}</th><th scope="col">{t("Net PnL", "กำไร/ขาดทุนสุทธิ")}</th><th scope="col">{t("Source Time", "เวลาต้นทาง")}</th></tr></thead>
              <tbody>{executions.map(row => <tr key={row.id}>
                <td>{row.dealId}</td><td>{row.symbol ?? row.kind}</td><td>{row.side ?? '—'}</td>
                <td>{row.volume ?? '—'}</td><td>{row.netPnl ?? '—'}</td>
                <td>{row.sourceTimestampRaw ?? '—'}{row.sourceTimestampRaw && ` · ${row.sourceTimezone ?? t('Timezone unverified', 'ยังไม่ยืนยันเขตเวลา')}`}</td>
              </tr>)}</tbody>
            </table>
          </div>}
          {nextCursor && <button type="button" className="btn xs" disabled={actionDisabled} onClick={() => void run(async signal => {
            const page = await requestFundedNext<PilotExecutions>(getToken, `/accounts/${encodeURIComponent(accountId)}/executions?cursor=${encodeURIComponent(nextCursor)}`, { signal });
            signal.throwIfAborted();
            setExtraExecutions({ accountId, executions: [...(extra?.executions ?? []), ...page.executions], nextCursor: page.nextCursor });
            return '';
          })}>{t("Load more trade fills", "โหลดรายการจับคู่เพิ่ม")}</button>}
        </details>}
      </>}

      <div className="fundednext-actions">
        <button type="button" className="btn xs" disabled={actionDisabled || !journal.some(row => row.port === portId)}
          onClick={() => void run(async signal => {
            const result = await migratePilotJournal(getToken, portId, journal, signal);
            return [`Imported ${result.imported} journal entries · ${result.unlinked} could not be matched confidently`, `ย้ายรายการจากสมุดเทรดแล้ว ${result.imported} รายการ · จับคู่ไม่ได้ ${result.unlinked} รายการ`];
          })}>{t("Legacy Batch Journal Migration", "ย้ายรายการจากสมุดเทรดเดิม")}</button>
      </div>
      {(directoryError || read?.error || feedback) && <div role="status" style={{ color: directoryError || read?.error || !feedback?.ok ? 'var(--rose)' : 'var(--emerald)' }}>
        {[directoryError, read?.error, feedback?.text].flatMap((message) =>
          typeof message === 'string' ? [formatPilotMessage(message, lang)] : message ? [t(...message)] : []
        ).join(' · ')}
      </div>}
    </section>
  );
}
