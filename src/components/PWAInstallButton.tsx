import React, { useState } from 'react';
import { DeskDialog } from './DeskDialog';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { deskText } from '../utils/deskI18n';
import type { DeskLanguage } from '../utils/deskI18n';

interface PWAInstallButtonProps {
  lang?: DeskLanguage;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ lang = 'en' }) => {
  const t = (english: string, thai: string) => deskText(lang, english, thai);
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowModal(true);
    }
  };

  const copyAppUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className="topbar-icon-btn"
        title={t("Install TallyNX Desk on this device", "ติดตั้งแอป TallyNX Desk ลงเครื่อง")}
        aria-label={t("Install TallyNX Desk", "ติดตั้งแอป TallyNX Desk")}
      >
        <svg className="ico" viewBox="0 0 24 24" style={{ width: 15, height: 15 }}>
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      </button>

      {showModal && (
        <DeskDialog
          label={t("Install TallyNX Desk", "ติดตั้ง TallyNX Desk")}
          onClose={() => setShowModal(false)}
          panelStyle={{ maxWidth: '440px', padding: 0 }}
        >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                borderBottom: '1px solid var(--border-color)',
                background: 'var(--bg-subtle)',
              }}
            >
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  {t("Install TallyNX Desk", "ติดตั้ง TallyNX Desk บนคอมพิวเตอร์")}
                </h3>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {t("Open Desk in a separate window without the browser address bar. Available offline.", "เปิด Desk ในหน้าต่างแยกโดยไม่มีแถบที่อยู่ ใช้งานออฟไลน์ได้")}
                </div>
              </div>
              <button
                type="button"
                className="topbar-icon-btn"
                onClick={() => setShowModal(false)}
                aria-label={t("Close", "ปิดหน้าต่าง")}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div
              style={{
                padding: '18px',
                fontSize: '12.5px',
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              {isIOS ? (
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                    {t("Installing on iPhone or iPad (Safari)", "วิธีติดตั้งบน iPhone / iPad (Safari):")}
                  </div>
                  <ol style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <li>{t("Tap ", "แตะปุ่ม ")}<strong>{t("Share", "แชร์ (Share)")}</strong>{t(" in the Safari toolbar.", " ที่แถบเมนูด้านล่าง Safari")}</li>
                    <li>{t("Scroll down and select ", "เลื่อนลงแล้วเลือก ")}<strong>{t("Add to Home Screen", "เพิ่มไปยังหน้าจอโฮม (Add to Home Screen)")}</strong></li>
                  </ol>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <span
                      className="mono"
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '4px',
                        background: 'var(--accent-soft)',
                        color: 'var(--accent-ink)',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: '11px',
                        fontWeight: 700,
                        flexShrink: 0,
                        marginTop: '1px',
                      }}
                    >
                      1
                    </span>
                    <div>
                      {t("Look for the ", "สังเกต ")}<strong>{t("install app icon ⊕", "ไอคอนคอมพิวเตอร์พร้อมลูกศร ⊕")}</strong>{t(" or the ", " หรือ ")}<strong>{t("three-dot menu (⋮)", "จุด 3 จุด (⋮)")}</strong>{t(" at the top right of Chrome or Edge.", " ที่แถบขวาบนของเบราว์เซอร์ Chrome / Edge")}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <span
                      className="mono"
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '4px',
                        background: 'var(--accent-soft)',
                        color: 'var(--accent-ink)',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: '11px',
                        fontWeight: 700,
                        flexShrink: 0,
                        marginTop: '1px',
                      }}
                    >
                      2
                    </span>
                    <div>
                      {t("Select ", "คลิก ")}<strong>{t("“Install TallyNX Desk…”", "\"ติดตั้ง TallyNX Desk...\" (Install)")}</strong>{t(" to create a desktop shortcut.", " เพื่อสร้างทางลัดบนเดสก์ท็อป")}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <span
                      className="mono"
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '4px',
                        background: 'var(--accent-soft)',
                        color: 'var(--accent-ink)',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: '11px',
                        fontWeight: 700,
                        flexShrink: 0,
                        marginTop: '1px',
                      }}
                    >
                      3
                    </span>
                    <div>
                      {t("The app runs in its own window, saves data automatically, and works offline.", "เข้าใช้งานเป็นโปรแกรมเดี่ยว รวดเร็ว บันทึกข้อมูลอัตโนมัติ และทำงานออฟไลน์ได้ 100%")}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 18px',
                background: 'var(--bg-subtle)',
                borderTop: '1px solid var(--border-color)',
                gap: '8px',
              }}
            >
              <button
                type="button"
                className="btn xs"
                onClick={copyAppUrl}
              >
                {copied ? t("✓ Copied", "✓ คัดลอกแล้ว") : t("Copy app URL", "คัดลอก URL หน้าเว็บ")}
              </button>

              <button
                type="button"
                className="btn primary sm"
                onClick={() => setShowModal(false)}
              >
                {t("Got it", "เข้าใจแล้ว")}
              </button>
            </div>
        </DeskDialog>
      )}
    </>
  );
};
