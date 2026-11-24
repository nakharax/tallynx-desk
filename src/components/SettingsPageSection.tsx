import React from 'react';
import { DESK_I18N, deskText, type DeskLanguage } from '../utils/deskI18n';

interface SettingsPageSectionProps {
  lang: DeskLanguage;
  deskTheme: 'obsidian' | 'alabaster';
  roomMode: 'clean' | 'night' | 'daylight';
  thbRate: number;
  privacyMasked: boolean;
  onChangeTheme: (theme: 'obsidian' | 'alabaster') => void;
  onChangeRoomMode: (mode: 'clean' | 'night' | 'daylight') => void;
  onChangeLang: (lang: DeskLanguage) => void;
  onChangeThbRate: (rate: number) => void;
  onTogglePrivacyMask: () => void;
  accountsContent: React.ReactNode;
  syncContent: React.ReactNode;
}

export const SettingsPageSection: React.FC<SettingsPageSectionProps> = ({
  lang,
  deskTheme,
  roomMode,
  thbRate,
  privacyMasked,
  onChangeTheme,
  onChangeRoomMode,
  onChangeLang,
  onChangeThbRate,
  onTogglePrivacyMask,
  accountsContent,
  syncContent,
}) => {
  const ui = DESK_I18N[lang];
  const t = (en: string, th: string) => deskText(lang, en, th);

  return (
    <section id="sec-settings" className="settings-page-root" aria-label={ui.pageTitles.settings}>
      <div className="card settings-prefs-card">
        <div className="card-header">
          <div style={{ minWidth: 0 }}>
            <h2 className="card-title">
              {t('Workspace display', 'การแสดงผลของ Desk')}
            </h2>
            <div className="settings-pref-subtitle">
              {t(
                'Choose a theme and language, set the USD/THB rate, or hide balances.',
                'เลือกธีมและภาษา ตั้งเรต USD/THB หรือซ่อนยอดเงิน'
              )}
            </div>
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

      <div className="settings-ports-block">{accountsContent}</div>

      <div className="settings-sync-block">{syncContent}</div>
    </section>
  );
};
