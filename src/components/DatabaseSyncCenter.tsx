import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { GhrWorkspaceState, Mt5TimeOffsetSetting, SnapshotItem, SyncLogEntry } from '../types/ghr';
import {
  getTradeSession,
  MT5_TIME_OFFSET_OPTIONS,
  normalizeMt5TimeOffsetSetting,
  parseMt5DateTimeToBangkok,
} from '../utils/ghrRules';
import { deskText, formatAccountDisplayName, formatMt5TimeOffsetLabel, formatTradeNoteDisplay } from '../utils/deskI18n';
import type { DeskLanguage } from '../utils/deskI18n';

interface DatabaseSyncCenterProps {
  lang?: DeskLanguage;
  state: GhrWorkspaceState;
  isOnline: boolean;
  idbReady: boolean;
  currentUser: User | null;
  cloudSyncing: boolean;
  pendingOfflineCount: number;
  snapshots: SnapshotItem[];
  syncLogs: SyncLogEntry[];
  onClose?: () => void;
  onGoogleLogin: () => void;
  onGoogleLogout: () => void;
  onCreateSnapshot: () => void;
  onRestoreSnapshot: (snapId: string) => void;
  onDeleteSnapshot: (snapId: string) => void;
  onCloudPushNow: () => void;
  onCloudPullNow: () => void;
  onExportFullJson: () => void;
  onExportDriveCsv?: () => void;
  onTriggerImportFile: () => void;
  onUpdateApiConfig: (url: string, key: string) => void;
  onApiPushNow: () => void;
  onApiPullNow: () => void;
  brandingContent?: React.ReactNode;
  onUpdateMt5TimeOffset?: (offset: Mt5TimeOffsetSetting) => void;
  onResetFactory: () => void;
}

const SNAPSHOT_REASON_LABELS = new Map([
  ['ผู้ใช้สร้างจุดเซฟมือ', 'Manual snapshot'],
  ['ก่อนรีเซ็ตข้อมูลทั้งหมด', 'Before resetting all data'],
  ['แก้ไขพอร์ต', 'Edited account'],
  ['เพิ่มพอร์ตใหม่', 'Added account'],
  ['ปรับตั้งค่า MT5 / Timezone', 'Updated MT5 / time zone settings'],
  ['ดึงข้อมูลจาก Cloud Firestore', 'Pulled data from Cloud Firestore'],
  ['ดึงข้อมูลจาก REST API', 'Pulled data from REST API'],
  ['ปรับชื่อแบรนด์ White-Label', 'Updated white-label branding'],
  ['Factory Reset พอร์ตเริ่มต้น', 'Restored default accounts'],
  ['ซิงก์กำไรรายวันจาก Journal', 'Synced daily profit from the journal'],
  ['ปรับตารางกฎ 40%', 'Updated the 40% rule table'],
  ['รีเซ็ตข้อมูลเริ่มต้น', 'Reset workspace data'],
]);

const SNAPSHOT_REASON_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ['นำเข้า MT5 #', 'Imported MT5 account #'],
  ['กู้คืนไฟล์ JSON (', 'Restored JSON file ('],
  ['กู้คืนจาก ', 'Restored from '],
  ['Full Edit ไม้ ', 'Edited trade '],
  ['เพิ่มไม้ ', 'Added trade '],
  ['คัดลอกไม้ ', 'Duplicated trade '],
  ['ลบไม้ ', 'Deleted trade '],
  ['โหลด Blueprint จาก Marketplace: ', 'Loaded marketplace blueprint: '],
];

function formatSnapshotReason(reason: string | undefined, lang: DeskLanguage): string {
  if (!reason || reason === 'Auto Snapshot') return deskText(lang, 'Auto snapshot', 'จุดบันทึกอัตโนมัติ');
  if (lang === 'th') {
    return reason.replace(/^MT5 Read-Only Sync #/, 'ซิงก์ MT5 แบบอ่านอย่างเดียว #');
  }
  const knownLabel = SNAPSHOT_REASON_LABELS.get(reason);
  if (knownLabel) return knownLabel;
  const csvCount = /^นำเข้า CSV \((\d+) รายการ\)$/.exec(reason);
  if (csvCount) return `Imported CSV (${csvCount[1]} records)`;
  if (reason.startsWith('ลบพอร์ต ')) {
    return `Deleted account ${formatAccountDisplayName(reason.slice('ลบพอร์ต '.length), lang)}`;
  }
  if (reason.startsWith('บันทึก ')) {
    return `Recorded ${formatTradeNoteDisplay(reason.slice('บันทึก '.length), lang)}`;
  }
  const prefix = SNAPSHOT_REASON_PREFIXES.find(([thai]) => reason.startsWith(thai));
  return prefix ? prefix[1] + reason.slice(prefix[0].length) : reason;
}

export const DatabaseSyncCenter: React.FC<DatabaseSyncCenterProps> = ({
  lang = 'en',
  state,
  isOnline,
  idbReady,
  currentUser,
  cloudSyncing,
  pendingOfflineCount,
  snapshots,
  syncLogs,
  onClose,
  onGoogleLogin,
  onGoogleLogout,
  onCreateSnapshot,
  onRestoreSnapshot,
  onDeleteSnapshot,
  onCloudPushNow,
  onCloudPullNow,
  onExportFullJson,
  onExportDriveCsv,
  onTriggerImportFile,
  onUpdateApiConfig,
  onApiPushNow,
  onApiPullNow,
  brandingContent,
  onUpdateMt5TimeOffset,
  onResetFactory,
}) => {
  const t = (english: string, thai: string) => deskText(lang, english, thai);
  const locale = lang === 'th' ? 'th-TH' : 'en-GB';
  const [apiUrl, setApiUrl] = useState(state.apiEndpointUrl || '');
  const [apiKey, setApiKey] = useState(state.apiSecretKey || '');
  const [confirmFactoryReset, setConfirmFactoryReset] = useState(false);

  useEffect(() => {
    setApiUrl(state.apiEndpointUrl || '');
    setApiKey(state.apiSecretKey || '');
  }, [state.apiEndpointUrl, state.apiSecretKey]);

  const portCount = Object.keys(state.accounts || {}).length;
  const tradeCount = Array.isArray(state.journal) ? state.journal.length : 0;
  const jsonSizeKb = (new Blob([JSON.stringify(state)]).size / 1024).toFixed(1);
  const lastSavedFormatted = state.lastSavedAt
    ? new Date(state.lastSavedAt).toLocaleString(locale)
    : t("No sync history yet", "ยังไม่มีประวัติ");

  const [showApiSettings, setShowApiSettings] = useState(false);

  return (
    <section id="db-manager-root">
      <div className="db-manager-card">
        {/* Header */}
        <div className="desk-modal-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {t("Data & Backup", "ข้อมูลและไฟล์สำรอง")}
              </h3>
              <span
                style={{
                  fontSize: '11.5px',
                  fontWeight: 500,
                  color: isOnline ? 'var(--emerald)' : 'var(--amber)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <span
                  className="status-dot"
                  style={{ background: isOnline ? 'var(--emerald)' : 'var(--amber)' }}
                />
                {isOnline ? t("Online (ready to sync)", "ออนไลน์ (พร้อมซิงก์)") : t(`Offline · ${pendingOfflineCount} queued`, `ออฟไลน์ · คิวรอ ${pendingOfflineCount} รายการ`)}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {t("Changes are saved on this device. Sign in with Google to sync through Firebase.", "บันทึกการแก้ไขไว้ในเครื่อง เข้าสู่ระบบด้วย Google เพื่อซิงก์ผ่าน Firebase")}
            </div>
          </div>

          {onClose && (
            <button
              type="button"
              className="topbar-icon-btn"
              onClick={onClose}
              autoFocus
              aria-label={t("Close", "ปิดหน้าต่าง")}
            >
              ✕
            </button>
          )}
        </div>

        {/* Quick Summary & Backup Strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            padding: '12px 16px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border-color)',
            minWidth: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)', flexWrap: 'wrap', minWidth: 0 }}>
            <span>{t("Data size: ", "ขนาดข้อมูล: ")}<strong className="mono" style={{ color: 'var(--text-primary)' }}>{jsonSizeKb} KB</strong></span>
            <span aria-hidden="true" style={{ color: 'var(--border-strong)' }}>·</span>
            <span><strong className="mono" style={{ color: 'var(--text-primary)' }}>{portCount}</strong>{t(" accounts", " พอร์ต")}</span>
            <span aria-hidden="true" style={{ color: 'var(--border-strong)' }}>·</span>
            <span><strong className="mono" style={{ color: 'var(--text-primary)' }}>{tradeCount}</strong>{t(" trades", " ไม้")}</span>
            <span aria-hidden="true" style={{ color: 'var(--border-strong)' }}>·</span>
            <span style={{ color: 'var(--text-muted)' }}>{t("Last saved ", "บันทึกล่าสุด ")}{lastSavedFormatted}</span>
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', maxWidth: '100%' }}>
            <button type="button" className="btn sm emerald" onClick={onExportFullJson}>
              {t("⬇ Download backup (.json)", "⬇ ดาวน์โหลดไฟล์สำรอง (.json)")}
            </button>
            {onExportDriveCsv && (
              <button type="button" className="btn sm" onClick={onExportDriveCsv}>
                {t("⬇ Export archive (.csv · Google Drive / Sheets)", "⬇ ส่งออก Archive (.csv · Google Drive / Sheets)")}
              </button>
            )}
            <button type="button" className="btn sm" onClick={onTriggerImportFile}>
              {t("⬆ Restore from file (.json)", "⬆ กู้คืนจากไฟล์ (.json)")}
            </button>
            <button type="button" className="btn sm primary" onClick={onCreateSnapshot}>
              {t("+ Save snapshot now", "+ บันทึก Snapshot ตอนนี้")}
            </button>
          </div>
        </div>

        {/* Two-Column Structured Panels */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '16px', minWidth: 0 }}>
          {/* Left Panel: Cloud Sync */}
          <div
            style={{
              padding: '16px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-surface-solid)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              minWidth: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                {t("Cloud sync (Google Firestore)", "การซิงก์ Cloud (Google Firestore)")}
              </strong>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  color: currentUser ? 'var(--emerald)' : 'var(--text-muted)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span
                  className="status-dot"
                  style={{ background: currentUser ? 'var(--emerald)' : 'var(--text-muted)' }}
                />
                {cloudSyncing ? t("Syncing…", "กำลังซิงก์...") : currentUser ? 'Cloud Realtime' : 'Local Only'}
              </span>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {currentUser ? (
                <>
                  {t("Signed in: ", "เข้าสู่ระบบแล้ว: ")}<strong className="mono" style={{ color: 'var(--text-primary)' }}>{currentUser.email || currentUser.uid.slice(0, 14)}</strong>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {t("Accounts and trade history sync automatically. Workspace data is compressed for Firestore’s 900 KB limit.", "ซิงก์พอร์ตและประวัติเทรดอัตโนมัติ ระบบบีบอัดข้อมูลให้เหมาะกับเพดาน 900 KB ของ Firestore")}
                  </div>
                </>
              ) : (
                t("Sign in with Google to back up and sync your journal across devices.", "เข้าสู่ระบบด้วย Google เพื่อสำรองและซิงก์สมุดเทรดข้ามอุปกรณ์")
              )}
            </div>

            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: 'auto' }}>
              {!currentUser ? (
                <button type="button" className="btn sm primary" onClick={onGoogleLogin}>
                  {t("Sign in with Google", "เข้าสู่ระบบ Google Cloud")}
                </button>
              ) : (
                <>
                  <button type="button" className="btn xs primary" onClick={onCloudPushNow}>
                    {t("Sync to cloud now", "ซิงก์ขึ้น Cloud ตอนนี้")}
                  </button>
                  <button type="button" className="btn xs" onClick={onCloudPullNow}>
                    {t("Pull from cloud", "ดึงข้อมูลจาก Cloud")}
                  </button>
                  <button type="button" className="btn xs" onClick={onGoogleLogout}>
                    {t("Sign out", "ออกจากระบบ")}
                  </button>
                </>
              )}
            </div>

            {/* Optional REST API / Webhook Disclosure */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px', marginTop: '8px' }}>
              <button
                type="button"
                className="btn xs"
                style={{ background: 'transparent', border: 'none', padding: 0, color: 'var(--text-secondary)', cursor: 'pointer' }}
                onClick={() => setShowApiSettings((v) => !v)}
              >
                {showApiSettings ? t("▾ Hide REST API / webhook settings", "▾ ซ่อนการตั้งค่า REST API / Webhook") : t("▸ Configure optional REST API / webhook", "▸ ตั้งค่า REST API / Webhook เสริม")}
              </button>

              {showApiSettings && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                  <div className="input-row">
                    <div className="field">
                      <input
                        type="text"
                        placeholder="https://your-server.com/api/ghr-db"
                        value={apiUrl}
                        onChange={(e) => {
                          setApiUrl(e.target.value);
                          onUpdateApiConfig(e.target.value, apiKey);
                        }}
                        style={{ height: '30px', fontSize: '11.5px' }}
                      />
                    </div>
                    <div className="field">
                      <input
                        type="password"
                        placeholder={t('Bearer token', 'โทเคน Bearer')}
                        value={apiKey}
                        onChange={(e) => {
                          setApiKey(e.target.value);
                          onUpdateApiConfig(apiUrl, e.target.value);
                        }}
                        style={{ height: '30px', fontSize: '11.5px' }}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button type="button" className="btn xs primary" onClick={onApiPushNow}>
                      {t("Push (POST)", "ส่งข้อมูล (POST)")}
                    </button>
                    <button type="button" className="btn xs" onClick={onApiPullNow}>
                      {t("Pull (GET)", "ดึงข้อมูล (GET)")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Snapshots History */}
          <div
            style={{
              padding: '16px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-surface-solid)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                {t("Restore points (IndexedDB snapshots)", "จุดกู้คืนในเครื่อง (IndexedDB)")}
              </strong>
              <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {snapshots.length}{t(" snapshots", " รายการ")}
              </span>
            </div>

            {snapshots.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '24px 0', textAlign: 'center' }}>
                {t("No snapshots yet. Save one to create a restore point.", "ยังไม่มีจุดกู้คืน กดบันทึกสแนปช็อตเพื่อสร้างจุดแรก")}
              </div>
            ) : (
              <div
                className="snapshot-list"
                style={{
                  maxHeight: '220px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                {snapshots.map((s) => (
                  <div
                    key={s.snapId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-xs)',
                      background: 'var(--bg-subtle)',
                      border: '1px solid var(--border-color)',
                      fontSize: '12px',
                    }}
                  >
                    <div>
                      <strong style={{ color: 'var(--text-primary)' }}>{formatSnapshotReason(s.reason, lang)}</strong>
                      <div className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {new Date(s.createdAt).toLocaleString(locale)} · {s.portCount}{t(" accounts · ", " พอร์ต · ")}{s.tradeCount}{t(" trades", " ไม้")}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button type="button" className="btn xs emerald" onClick={() => onRestoreSnapshot(s.snapId)}>
                        {t("Restore", "กู้คืน")}
                      </button>
                      <button type="button" className="btn xs" onClick={() => onDeleteSnapshot(s.snapId)}>
                        {t("Delete", "ลบ")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* MT5 Server Timezone & Session Alignment */}
        {(() => {
          const activeOffset = normalizeMt5TimeOffsetSetting(state.mt5TimeOffset);
          const selectVal = activeOffset === 'AUTO_MT5' ? 'AUTO_MT5' : String(activeOffset);
          const preview = parseMt5DateTimeToBangkok('2026-11-17 04:59:22', '2026-11-17', activeOffset);
          const previewSess = getTradeSession(preview.time);
          return (
            <div
              style={{
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px 16px',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '240px', flex: '1 1 320px' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {t("Journal time zone (MT5 server time → ICT GMT+7)", "เขตเวลาในสมุดเทรด (เวลาเซิร์ฟเวอร์ MT5 → เวลาไทย ICT GMT+7)")}
                </span>
                <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                  {t("Example MT5 time ", "ตัวอย่างเวลา MT5 ")}<strong className="mono">04:59</strong>{t(" → shown in the journal as", " → แสดงในสมุดเทรด")}{' '}
                  <strong className="mono" style={{ color: 'var(--blue)' }}>{preview.time} ICT</strong> ·{' '}
                  <strong className="mono">{previewSess === 'LONDON' ? 'LON' : previewSess}</strong>{' '}
                  {t("(Session labels and win rates update immediately.)", "(เปลี่ยนแล้วระบบจัดช่วงเทรดและคำนวณอัตราชนะใหม่)")}
                </span>
              </div>

              {onUpdateMt5TimeOffset && (
                <select
                  aria-label={t("MT5 server time offset to ICT (GMT+7)", "MT5 Server Time Offset ไปยังเวลาไทย ICT")}
                  value={selectVal}
                  onChange={(e) => onUpdateMt5TimeOffset(normalizeMt5TimeOffsetSetting(e.target.value))}
                  style={{
                    height: '32px',
                    padding: '0 10px',
                    fontSize: '12px',
                    borderRadius: 'var(--radius-xs)',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-surface-solid)',
                    color: 'var(--text-primary)',
                    maxWidth: '100%',
                  }}
                >
                  {MT5_TIME_OFFSET_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {formatMt5TimeOffsetLabel(opt, lang)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        })()}

        <div
          style={{
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-sm)',
            padding: '14px 16px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
            gap: '16px',
            alignItems: 'center',
            minWidth: 0,
          }}
        >
          {brandingContent}

          {/* Factory Reset */}
          <div className="desk-modal-footer">
            <div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {t("Factory reset", "เริ่มต้นใช้งานใหม่ (Factory Reset)")}
              </span>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {t("Saves a snapshot before restoring the default accounts.", "บันทึกสแนปช็อตก่อนคืนค่าพอร์ตเริ่มต้น")}
              </div>
            </div>

            {!confirmFactoryReset ? (
              <button
                type="button"
                className="btn xs"
                style={{ color: 'var(--rose)' }}
                onClick={() => setConfirmFactoryReset(true)}
              >
                {t("Reset desk data", "ล้างข้อมูลเริ่มต้นใหม่")}
              </button>
            ) : (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  className="btn xs rose"
                  onClick={() => {
                    setConfirmFactoryReset(false);
                    onResetFactory();
                  }}
                >
                  {t("Confirm reset", "ยืนยัน Reset")}
                </button>
                <button
                  type="button"
                  className="btn xs"
                  onClick={() => setConfirmFactoryReset(false)}
                >
                  {t("Cancel", "ยกเลิก")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
