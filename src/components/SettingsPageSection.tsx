import React from 'react';
import { RefreshCw } from 'lucide-react';
import { DESK_I18N, deskText, type DeskLanguage } from '../utils/deskI18n';
import { navigateDeskTabs } from '../utils/navigateDeskTabs';
import { AiAndDataKeysCard } from './AiAndDataKeysCard';

const SETTINGS_TABS = ['display', 'keys', 'accounts', 'sync'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

interface SettingsPageSectionProps {
  lang: DeskLanguage;
  activeTab: SettingsTab;
  onSelectTab: (tab: SettingsTab) => void;
  firebaseUid: string | null;
  deskTheme: 'obsidian' | 'alabaster';
  roomMode: 'clean' | 'night' | 'daylight';
  thbRate: number;
  privacyMasked: boolean;
  onChangeTheme: (theme: 'obsidian' | 'alabaster') => void;
  onChangeRoomMode: (mode: 'clean' | 'night' | 'daylight') => void;
  onChangeLang: (lang: DeskLanguage) => void;
  onChangeThbRate: (rate: number) => void;
  onTogglePrivacyMask: () => void;
  onOpenMt5Sync: () => void;
  mt5ConnectedCount?: number;
  mt5ConfiguredCount?: number;
  fundedNextConnectedCount?: number;
  fundedNextReconnectCount?: number;
  brandingContent: React.ReactNode;
  accountsContent: React.ReactNode;
  syncContent: React.ReactNode;
}

export const SettingsPageSection: React.FC<SettingsPageSectionProps> = ({
  lang,
  activeTab,
  onSelectTab,
  firebaseUid,
  deskTheme,
  roomMode,
  thbRate,
  privacyMasked,
  onChangeTheme,
  onChangeRoomMode,
  onChangeLang,
  onChangeThbRate,
  onTogglePrivacyMask,
  onOpenMt5Sync,
  mt5ConnectedCount = 0,
  mt5ConfiguredCount = 0,
  fundedNextConnectedCount = 0,
  fundedNextReconnectCount = 0,
  brandingContent,
  accountsContent,
  syncContent,
}) => {
  const ui = DESK_I18N[lang];
  const t = (en: string, th: string) => deskText(lang, en, th);

  const mt5PillState = mt5ConnectedCount > 0 ? 'connected' : mt5ConfiguredCount > 0 ? 'unavailable' : 'disconnected';
  const mt5PillLabel = mt5ConnectedCount > 0
    ? t(`MT5 live (${mt5ConnectedCount})`, `MT5 เชื่อมสด (${mt5ConnectedCount} พอร์ต)`)
    : mt5ConfiguredCount > 0
      ? t(`MT5 configured (${mt5ConfiguredCount}) · awaiting heartbeat`, `ตั้งค่า MT5 แล้ว (${mt5ConfiguredCount} พอร์ต) · รอสัญญาณ`)
      : t('MT5 not connected', 'MT5 ยังไม่เชื่อม');

  const fundedNextPillState = fundedNextConnectedCount > 0
    ? 'connected'
    : fundedNextReconnectCount > 0
      ? 'expired'
      : 'disconnected';
  const fundedNextPillLabel = fundedNextConnectedCount > 0
    ? t(`FundedNext MCP (${fundedNextConnectedCount})`, `FundedNext MCP เชื่อมต่อแล้ว (${fundedNextConnectedCount} พอร์ต)`)
    : fundedNextReconnectCount > 0
      ? t(`FundedNext reconnect required (${fundedNextReconnectCount})`, `FundedNext ต้องเชื่อมต่อใหม่ (${fundedNextReconnectCount} พอร์ต)`)
      : t('FundedNext MCP not connected', 'FundedNext MCP ยังไม่เชื่อม');

  const panels: Record<SettingsTab, React.ReactNode> = {
    display: <>
      <div className="card settings-prefs-card">
        <div className="card-header">
          <div style={{ minWidth: 0 }}>
            <h2 className="card-title">
              {t('Workspace display', 'การแสดงผลของ Desk')}
            </h2>
          </div>
        </div>
        <div className="settings-prefs-grid">
          <div className="settings-pref-tile">
            <span className="settings-pref-label">{t('Color Theme', 'ธีมสี')}</span>
            <div className="topbar-lang-switch" role="group" aria-label={t('Theme selection', 'เลือกธีมสี')}>
              <button
                type="button"
                aria-pressed={deskTheme === 'obsidian'}
                onClick={() => onChangeTheme('obsidian')}
              >
                {t('Obsidian Dark', 'ธีมมืด Obsidian')}
              </button>
              <button
                type="button"
                aria-pressed={deskTheme === 'alabaster'}
                onClick={() => onChangeTheme('alabaster')}
              >
                {t('Paper Light', 'ธีมสว่าง Paper')}
              </button>
            </div>
          </div>

          <div className="settings-pref-tile">
            <span className="settings-pref-label">{t('Interface Language', 'ภาษาหน้าจอ')}</span>
            <div className="topbar-lang-switch" role="group" aria-label={t('Switch Language', 'เปลี่ยนภาษา')}>
              <button type="button" aria-pressed={lang === 'en'} onClick={() => onChangeLang('en')}>
                English (EN)
              </button>
              <button type="button" aria-pressed={lang === 'th'} onClick={() => onChangeLang('th')}>
                ภาษาไทย (TH)
              </button>
            </div>
          </div>

          <div className="settings-pref-tile">
            <span className="settings-pref-label">{ui.topbar.thbRateLabel}</span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span className="mono">{t('THB', '฿')}</span>
              <input
                type="number"
                step="0.1"
                className="inp mono"
                style={{ width: '92px' }}
                aria-label={ui.topbar.thbRateLabel}
                value={thbRate}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 35.5;
                  onChangeThbRate(val);
                }}
              />
            </div>
          </div>

          <div className="settings-pref-tile settings-pref-backdrop">
            <span className="settings-pref-label">{t('Trading Room Backdrop', 'พื้นหลังห้องเทรด')}</span>
            <div className="topbar-lang-switch" role="group" aria-label={t('Trading room backdrop', 'เลือกพื้นหลังห้องเทรด')}>
              <button
                type="button"
                aria-pressed={roomMode === 'clean'}
                onClick={() => onChangeRoomMode('clean')}
              >
                {t('Clean', 'พื้นเรียบ')}
              </button>
              <button
                type="button"
                aria-pressed={roomMode === 'night'}
                onClick={() => onChangeRoomMode('night')}
              >
                {t('Night Room', 'ห้องเทรดกลางคืน')}
              </button>
              <button
                type="button"
                aria-pressed={roomMode === 'daylight'}
                onClick={() => onChangeRoomMode('daylight')}
              >
                {t('Daylight', 'ห้องสตูดิโอสว่าง')}
              </button>
            </div>
          </div>

          <div className="settings-pref-tile">
            <span className="settings-pref-label">{t('Balance Privacy Mask', 'ซ่อนตัวเลขยอดเงิน')}</span>
            <button
              type="button"
              className={`btn sm ${privacyMasked ? 'primary' : ''}`}
              onClick={onTogglePrivacyMask}
            >
              {privacyMasked ? ui.topbar.privacyShow : ui.topbar.privacyHide}
            </button>
          </div>
        </div>
      </div>
      <div className="card settings-branding-card">
        <h2 className="card-title">{t('Workspace branding', 'แบรนด์พื้นที่ทำงาน')}</h2>
        {brandingContent}
      </div>
    </>,
    keys: <AiAndDataKeysCard uid={firebaseUid} lang={lang} />,
    accounts: <div className="settings-ports-block">{accountsContent}</div>,
    sync: <>
      <div className="card settings-mt5-card">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <h2 className="card-title">{t('MT5 & Broker Bridge', 'การเชื่อมต่อ MT5 และโบรกเกอร์')}</h2>
            <span className="desk-conn-pill" data-state={mt5PillState}>
              <span className="desk-conn-dot" data-state={mt5PillState} aria-hidden="true" />
              {mt5PillLabel}
            </span>
            <span className="desk-conn-pill" data-state={fundedNextPillState}>
              <span className="desk-conn-dot" data-state={fundedNextPillState} aria-hidden="true" />
              {fundedNextPillLabel}
            </span>
          </div>
          <p>{t('Manage read-only connections or import an MT5 statement.', 'จัดการการเชื่อมต่อแบบอ่านอย่างเดียวหรือนำเข้ารายงาน MT5')}</p>
        </div>
        <button id="settings-mt5-bridge" type="button" className="btn sm" onClick={onOpenMt5Sync}>
          <RefreshCw size={15} aria-hidden="true" /> {t('Open MT5 Sync', 'เปิดการซิงก์ MT5')}
        </button>
      </div>
      <div className="settings-sync-block">{syncContent}</div>
    </>,
  };

  return (
    <section id="sec-settings" className="settings-page-root" aria-label={ui.pageTitles.settings}>
      <div className="settings-tabs" role="tablist" aria-label={ui.pageTitles.settings} onKeyDown={navigateDeskTabs}>
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab}
            id={`settings-${tab}-tab`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`settings-${tab}-panel`}
            tabIndex={activeTab === tab ? 0 : -1}
            onClick={() => onSelectTab(tab)}
          >
            {ui.settingsTabs[tab]}
          </button>
        ))}
      </div>
      {SETTINGS_TABS.map((tab) => (
        <div
          key={tab}
          id={`settings-${tab}-panel`}
          className="settings-panel"
          role="tabpanel"
          aria-labelledby={`settings-${tab}-tab`}
          tabIndex={0}
          hidden={activeTab !== tab}
        >
          {activeTab === tab && panels[tab]}
        </div>
      ))}
    </section>
  );
};
