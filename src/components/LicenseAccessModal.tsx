import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { EntitlementRecord, LicenseRecord } from '../types/ghr';
import {
  adminCreateLicense,
  adminDeleteLicense,
  adminListLicenses,
  adminToggleLicenseStatus,
  isAdminUser,
  isProOrHigher,
  redeemLicenseKey,
} from '../services/firebase';
import {
  buildCustomerInviteUrl,
  getDefaultCustomerPortalOrigin,
} from '../utils/ghrRules';
import { deskText } from '../utils/deskI18n';
import type { DeskLanguage } from '../utils/deskI18n';

interface LicenseAccessModalProps {
  lang?: DeskLanguage;
  brandName: string;
  currentUser: User | null;
  entitlement: EntitlementRecord | null;
  inviteKey?: string;
  onClearInviteKey?: () => void;
  onClose: () => void;
  onGoogleLogin: () => Promise<void>;
  onGoogleLogout: () => Promise<void>;
  onEntitlementUpdated: (next: EntitlementRecord) => void;
  onNotify: (msg: string) => void;
}

const LICENSE_ERROR_LABELS = new Map([
  ['รูปแบบ License Key ไม่ถูกต้อง (ต้องมีความยาว 6–64 ตัวอักษร)', 'Enter a license key between 6 and 64 characters.'],
  ['ไม่พบ License Key นี้ในระบบ กรุณาตรวจสอบตัวอักษรอีกครั้ง', 'License key not found. Double-check the characters you entered.'],
  ['License Key นี้ถูกระงับการใช้งานแล้ว', 'This license key has been revoked.'],
  ['License Key นี้ถูกผูกใช้งานกับบัญชีอื่นแล้ว', 'This license key is linked to another account.'],
  ['รหัส License ต้องมี 6–64 ตัวอักษร (A-Z, 0-9, -, _)', 'Use 6–64 characters for the license key (A–Z, 0–9, hyphen, underscore).'],
]);

function formatLicenseError(error: unknown, lang: DeskLanguage, fallback: string): string {
  const message = error instanceof Error ? error.message : '';
  if (!message) return fallback;
  if (lang === 'th') return LICENSE_ERROR_LABELS.has(message) ? message : fallback;
  return LICENSE_ERROR_LABELS.get(message) ?? (/[\u0e00-\u0e7f]/.test(message) ? fallback : message);
}

function formatLicensePlan(plan: string, lang: DeskLanguage): string {
  if (lang === 'en') return plan;
  switch (plan) {
    case 'ADMIN': return 'ผู้ดูแลระบบ';
    case 'TRIAL': return 'ทดลองใช้';
    case 'PRO': return 'โปร';
    case 'LIFETIME': return 'ตลอดชีพ';
    case 'FREE': return 'ฟรี';
    case 'GUEST': return 'ผู้เยี่ยมชม';
    default: return plan;
  }
}

export const LicenseAccessModal: React.FC<LicenseAccessModalProps> = ({
  lang = 'en',
  brandName,
  currentUser,
  entitlement,
  inviteKey = '',
  onClearInviteKey,
  onClose,
  onGoogleLogin,
  onGoogleLogout,
  onEntitlementUpdated,
  onNotify,
}) => {
  const t = (english: string, thai: string) => deskText(lang, english, thai);
  const isAdmin = isAdminUser(currentUser, entitlement);
  const hasPro = isProOrHigher(currentUser, entitlement);
  const [activeTab, setActiveTab] = useState<'LICENSE' | 'ADMIN'>('LICENSE');
  const [licenseInput, setLicenseInput] = useState(inviteKey);
  const [redeeming, setRedeeming] = useState(false);

  // Admin state
  const [licenses, setLicenses] = useState<LicenseRecord[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [newKeyInput, setNewKeyInput] = useState('');
  const [newPlan, setNewPlan] = useState<'TRIAL' | 'PRO' | 'LIFETIME'>('PRO');
  const [newNotes, setNewNotes] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);
  const [portalOrigin, setPortalOrigin] = useState(() =>
    getDefaultCustomerPortalOrigin(typeof window !== 'undefined' ? window.location.origin : '')
  );

  const loadLicenses = async () => {
    if (!isAdmin) return;
    setLoadingList(true);
    try {
      const list = await adminListLicenses();
      setLicenses(list);
    } catch (err) {
      onNotify(formatLicenseError(err, lang, t("Couldn't load licenses", "โหลดรายการสิทธิ์ใช้งานไม่ได้")));
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    if (isAdmin && activeTab === 'ADMIN') {
      loadLicenses();
    }
  }, [isAdmin, activeTab]);

  useEffect(() => {
    if (inviteKey) {
      setLicenseInput(inviteKey);
      setActiveTab('LICENSE');
    }
  }, [inviteKey]);

  const copyPortalText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onNotify(t(`Copied ${label}`, `คัดลอก${label}เรียบร้อยแล้ว`));
    } catch {
      onNotify(t(`Couldn't copy automatically: ${text}`, `ไม่สามารถคัดลอกอัตโนมัติได้: ${text}`));
    }
  };

  const generateRandomKey = (prefix: string) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let part1 = '';
    let part2 = '';
    for (let i = 0; i < 4; i++) {
      part1 += chars[Math.floor(Math.random() * chars.length)];
      part2 += chars[Math.floor(Math.random() * chars.length)];
    }
    setNewKeyInput(`${prefix}-${part1}-${part2}`);
  };

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      onNotify(t("Sign in with Google before activating a license key.", "กรุณาเข้าสู่ระบบด้วย Google ก่อนเปิดใช้งาน License Key"));
      return;
    }
    setRedeeming(true);
    try {
      const updated = await redeemLicenseKey(currentUser, licenseInput);
      onEntitlementUpdated(updated);
      setLicenseInput('');
      if (onClearInviteKey) onClearInviteKey();
      onNotify(t(`Activated the ${updated.plan} plan.`, `เปิดใช้งานแพ็กเกจ ${formatLicensePlan(updated.plan, lang)} แล้ว`));
    } catch (err) {
      onNotify(formatLicenseError(err, lang, t("Couldn't activate the license key", "เปิดใช้งานคีย์ไม่ได้")));
    } finally {
      setRedeeming(false);
    }
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !isAdmin) return;
    setCreatingKey(true);
    try {
      await adminCreateLicense(currentUser, {
        licenseKey: newKeyInput,
        plan: newPlan,
        notes: newNotes,
      });
      setNewKeyInput('');
      setNewNotes('');
      onNotify(t("New license key saved.", "สร้าง License Key ใหม่ลงฐานข้อมูลแล้ว"));
      await loadLicenses();
    } catch (err) {
      onNotify(formatLicenseError(err, lang, t("Couldn't create the license key", "สร้างคีย์สิทธิ์ใช้งานไม่ได้")));
    } finally {
      setCreatingKey(false);
    }
  };

  const planBadge = isAdmin
    ? 'ADMIN'
    : entitlement?.plan || (currentUser ? 'FREE' : 'GUEST');

  return (
    <div className="desk-modal-content">
      <div className="desk-modal-header">
        <div>
          <strong style={{ fontSize: '15px', color: 'var(--text-primary)' }}>
            {t("Licenses & access (", "สิทธิ์ใช้งาน (")}{brandName})
          </strong>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {t("Activate a license for AI risk analysis and cross-device sync.", "เปิดใช้งานคีย์สำหรับการวิเคราะห์ความเสี่ยงด้วย AI และการซิงก์ข้ามอุปกรณ์")}
          </div>
        </div>
        <button type="button" className="btn xs" onClick={onClose} autoFocus>
          {t("✕ Close", "✕ ปิดหน้าต่าง")}
        </button>
      </div>

      {isAdmin && (
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            className={`btn sm ${activeTab === 'LICENSE' ? 'primary' : ''}`}
            onClick={() => setActiveTab('LICENSE')}
          >
            {t("Account & license", "บัญชีและสิทธิ์ใช้งาน")}
          </button>
          <button
            type="button"
            className={`btn sm ${activeTab === 'ADMIN' ? 'primary' : ''}`}
            onClick={() => setActiveTab('ADMIN')}
          >
            {t("Admin · License keys", "ผู้ดูแลระบบ · คีย์สิทธิ์ใช้งาน")}
          </button>
        </div>
      )}

      {activeTab === 'LICENSE' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {inviteKey && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--accent-soft)',
                border: '1px solid var(--accent-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <strong style={{ fontSize: '12.5px', color: 'var(--accent-ink)' }}>
                {t("Invitation key (", "คีย์จากลิงก์เชิญ (")}{inviteKey})
              </strong>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {!currentUser
                  ? t("Select “Sign in with Google” below, then “Activate key” to link the license to your account.", "1. เข้าสู่ระบบด้วย Google 2. กด «เปิดใช้งานคีย์» เพื่อผูกสิทธิ์กับบัญชี")
                  : t("Select “Activate key” to link the license to your account.", "กด «เปิดใช้งานคีย์» เพื่อผูกสิทธิ์กับบัญชี")}
              </span>
            </div>
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
              padding: '12px 14px',
              background: 'var(--bg-subtle)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{t("Current account status", "สถานะบัญชีปัจจุบัน")}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <strong className="mono" style={{ fontSize: '13.5px', color: 'var(--text-primary)' }}>
                  {currentUser ? currentUser.email || currentUser.uid.slice(0, 12) : t("Guest (local mode)", "Guest (โหมดเครื่องส่วนตัว)")}
                </strong>
                <span className={`pill ${hasPro ? 'emerald' : 'accent'}`}>{formatLicensePlan(planBadge, lang)}</span>
              </div>
              {entitlement?.licenseKey && (
                <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {t("Key: ", "คีย์: ")}{entitlement.licenseKey}
                </span>
              )}
            </div>

            <div>
              {!currentUser ? (
                <button type="button" className="btn sm primary" onClick={onGoogleLogin}>
                  {t("Sign in with Google for cloud and license access", "เข้าสู่ระบบ Google เพื่อใช้งาน Cloud / License")}
                </button>
              ) : (
                <button type="button" className="btn xs rose" onClick={onGoogleLogout}>
                  {t("Sign out of Google", "ออกจากระบบ Google")}
                </button>
              )}
            </div>
          </div>

          <form
            onSubmit={handleRedeem}
            style={{
              padding: '14px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-surface-solid)',
              border: '1px solid var(--border-strong)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <strong style={{ fontSize: '12.5px', color: 'var(--text-primary)' }}>
              {t("Activate a license key (Trial, Pro or Lifetime)", "เปิดใช้งานคีย์ (Trial, Pro หรือ Lifetime)")}
            </strong>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="text"
                aria-label={t("Enter license key", "กรอก License Key")}
                placeholder={t("e.g. GHR-PRO-XXXX-XXXX", "เช่น GHR-PRO-XXXX-XXXX")}
                value={licenseInput}
                onChange={(e) => setLicenseInput(e.target.value)}
                disabled={redeeming}
                className="mono"
                style={{
                  flex: 1,
                  minWidth: '220px',
                  height: '34px',
                  padding: '0 10px',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '12.5px',
                  textTransform: 'uppercase',
                }}
              />
              <button
                type="submit"
                className="btn sm emerald"
                disabled={redeeming || !licenseInput.trim() || !currentUser}
              >
                {redeeming ? t("Verifying…", "กำลังตรวจสอบ...") : t("Activate key", "เปิดใช้งานคีย์")}
              </button>
            </div>
            {!currentUser && (
              <span style={{ fontSize: '11.5px', color: 'var(--amber)' }}>
                {t("Sign in with Google to link a key to your account.", "เข้าสู่ระบบด้วย Google เพื่อผูกคีย์กับบัญชี")}
              </span>
            )}
          </form>

          <section className="license-shield-comparison" aria-label={t('Compare Free and Active Shield', 'เปรียบเทียบแพ็กเกจฟรีกับ Active Shield')}>
            <p>{t('Weigh Active Shield against the cost of one paid challenge reset. Its tools help surface drawdown pressure and repeat risk patterns early.', 'ลองเทียบค่า Active Shield กับค่าธรรมเนียมรีเซ็ตการสอบหนึ่งครั้ง เครื่องมือช่วยให้เห็นว่าใกล้เพดานขาดทุนหรือเริ่มทำพฤติกรรมเสี่ยงซ้ำตั้งแต่เนิ่น ๆ')}</p>
            <div className="license-shield-tiers">
              <div>
                <h3>{t('Free / Guest', 'ฟรี / ผู้เยี่ยมชม')}</h3>
                <ul>
                  <li>{t('Unlimited 3-TP calculator and the 4-leg calculator', 'เครื่องคำนวณ 3-TP แบบไม่จำกัดและเครื่องคำนวณ 4 ไม้')}</li>
                  <li>{t('Local MT5 .xlsx Autopsy', 'วิเคราะห์รายงาน MT5 .xlsx ย้อนหลังบนเครื่อง')}</li>
                  <li>{t('12-Gate pre-trade checklist', 'เช็กลิสต์ 12-Gate ก่อนเทรด')}</li>
                </ul>
              </div>
              <div data-tier="pro">
                <h3>{t('Pro / Active Shield', 'Pro / Active Shield')}</h3>
                <ul>
                  <li>{t('Read-only auto-sync via Live MT5 Bridge or FundedNext MCP on eligible accounts', 'ซิงก์แบบอ่านอย่างเดียวอัตโนมัติผ่าน Live MT5 Bridge หรือ FundedNext MCP สำหรับบัญชีที่รองรับ')}</li>
                  <li>{t('Multi-account cloud sync across devices', 'ซิงก์หลายบัญชีผ่านคลาวด์ข้ามอุปกรณ์')}</li>
                  <li>{t('AI Behavioral Coach for reviewing journal patterns and risk', 'โค้ช AI ช่วยทบทวนพฤติกรรมและความเสี่ยงจากสมุดบันทึก')}</li>
                  <li>{t('Real-time drawdown and news alerts via Telegram and browser are planned', 'มีแผนเพิ่มการแจ้งเตือน Drawdown และข่าวสำคัญแบบเรียลไทม์ผ่าน Telegram และเบราว์เซอร์')}</li>
                </ul>
              </div>
            </div>
          </section>

          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {t('Non-custodial software for risk analysis, statistical modeling and trade journaling.', 'ซอฟต์แวร์วิเคราะห์ความเสี่ยง จำลองเชิงสถิติ และบันทึกผลเทรด โดยผู้ใช้เก็บรักษาเงินทุนด้วยตนเอง')}
          </div>
        </div>
      )}

      {activeTab === 'ADMIN' && isAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div
            style={{
              padding: '10px 12px',
              background: 'var(--accent-soft)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--accent-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '12px', color: 'var(--accent-ink)' }}>
                {t("Customer portal link", "ทางเข้าเว็บสำหรับส่งให้ลูกค้า (Customer Portal Link)")}
              </strong>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {t("Use your custom domain or the URL from AI Studio’s Share button.", "ใช้โดเมนของคุณหรือ URL จากปุ่ม Share ใน AI Studio")}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="url"
                aria-label={t("Customer portal URL", "URL เว็บทางเข้าสำหรับลูกค้า")}
                value={portalOrigin}
                onChange={(e) => setPortalOrigin(e.target.value)}
                className="mono"
                style={{
                  flex: 1,
                  minWidth: '240px',
                  height: '30px',
                  padding: '0 8px',
                  fontSize: '11.5px',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--border-strong)',
                  background: 'var(--bg-surface-solid)',
                }}
              />
              <button
                type="button"
                className="btn xs primary"
                onClick={() =>
                  copyPortalText(buildCustomerInviteUrl(portalOrigin), t("customer portal link", "ลิงก์ทางเข้าเว็บหลักลูกค้า"))
                }
              >
                {t("Copy customer portal link", "คัดลอกลิงก์เว็บลูกค้า")}
              </button>
            </div>
          </div>

          <form
            onSubmit={handleCreateKey}
            className="license-admin-form"
            style={{
              padding: '12px',
              background: 'var(--bg-subtle)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-strong)',
              gap: '8px',
              alignItems: 'center',
            }}
          >
            <input
              type="text"
              aria-label={t("New license key", "รหัส License Key ใหม่")}
              placeholder="GHR-PRO-XXXX-XXXX"
              value={newKeyInput}
              onChange={(e) => setNewKeyInput(e.target.value.toUpperCase())}
              className="mono"
              style={{ height: '32px', padding: '0 8px', fontSize: '12px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-strong)' }}
            />
            <select
              aria-label={t("Plan tier", "ระดับแพ็กเกจ")}
              value={newPlan}
              onChange={(e) => setNewPlan(e.target.value as 'TRIAL' | 'PRO' | 'LIFETIME')}
              style={{ height: '32px', padding: '0 6px', fontSize: '12px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-strong)', background: 'var(--bg-surface-solid)' }}
            >
              <option value="TRIAL">{t("TRIAL", "ทดลองใช้")}</option>
              <option value="PRO">{t("PRO", "โปร")}</option>
              <option value="LIFETIME">{t("LIFETIME", "ตลอดชีพ")}</option>
            </select>
            <input
              type="text"
              aria-label={t("Customer notes", "หมายเหตุลูกค้า")}
              placeholder={t("Customer name / notes", "ชื่อลูกค้า / หมายเหตุ")}
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              style={{ height: '32px', padding: '0 8px', fontSize: '12px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-strong)' }}
            />
            <button
              type="button"
              className="btn xs"
              onClick={() => generateRandomKey(`GHR-${newPlan === 'LIFETIME' ? 'LIFE' : newPlan}`)}
            >
              {t("Generate key", "สุ่ม Key")}
            </button>
            <button
              type="submit"
              className="btn xs emerald"
              disabled={creatingKey || !newKeyInput.trim()}
            >
              {creatingKey ? t("Creating…", "กำลังสร้าง...") : t("+ Issue key", "+ ออก Key")}
            </button>
          </form>

          <div
            style={{
              maxHeight: '260px',
              overflowY: 'auto',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <table className="journal-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>{t("License Key", "คีย์สิทธิ์ใช้งาน")}</th>
                  <th>{t("Plan", "แพ็กเกจ")}</th>
                  <th>{t("Status", "สถานะ")}</th>
                  <th>{t("User email", "ผู้ใช้งาน (Email)")}</th>
                  <th>{t("Notes", "หมายเหตุ")}</th>
                  <th style={{ textAlign: 'right' }}>{t("Actions", "จัดการ")}</th>
                </tr>
              </thead>
              <tbody>
                {loadingList ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)' }}>
                      {t("Loading licenses…", "กำลังโหลดรายการ License...")}
                    </td>
                  </tr>
                ) : licenses.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)' }}>
                      {t("No license keys yet. Generate a key and select “+ Issue key” to share it with a customer.", "ยังไม่มี License Key ในระบบ กดสุ่ม Key และ \"+ ออก Key\" เพื่อเริ่มแจกลูกค้า")}
                    </td>
                  </tr>
                ) : (
                  licenses.map((lic) => (
                    <tr key={lic.licenseKey}>
                      <td className="mono" style={{ fontWeight: 600 }}>{lic.licenseKey}</td>
                      <td><span className="pill accent">{formatLicensePlan(lic.plan, lang)}</span></td>
                      <td>
                        <span className={`pill ${lic.status === 'ACTIVE' ? 'emerald' : 'rose'}`}>
                          {lic.status === 'ACTIVE' ? t('Active', 'ใช้งานอยู่') : t('Revoked', 'ถูกระงับ')}
                        </span>
                      </td>
                      <td className="mono" style={{ fontSize: '11px' }}>
                        {lic.redeemedEmail || t("Unused", "ยังไม่ถูกใช้")}
                      </td>
                      <td style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                        {lic.notes || '—'}
                      </td>
                      <td style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '4px', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="btn xs primary"
                          onClick={() =>
                            copyPortalText(
                              buildCustomerInviteUrl(portalOrigin, lic.licenseKey),
                              t(`invitation link (${lic.licenseKey})`, `ลิงก์เชิญ (${lic.licenseKey})`)
                            )
                          }
                          title={t("Copy a link that opens the app with this key filled in", "คัดลอกลิงก์เปิดหน้าเว็บพร้อมกรอก Key นี้ให้อัตโนมัติ")}
                        >
                          {t("Copy customer link", "คัดลอกลิงก์ลูกค้า")}
                        </button>
                        <button
                          type="button"
                          className="btn xs"
                          onClick={() => copyPortalText(lic.licenseKey, t(`key ${lic.licenseKey}`, `รหัส ${lic.licenseKey}`))}
                        >
                          {t("Copy key", "คัดลอก Key")}
                        </button>
                        <button
                          type="button"
                          className="btn xs"
                          onClick={async () => {
                            const next = lic.status === 'ACTIVE' ? 'REVOKED' : 'ACTIVE';
                            await adminToggleLicenseStatus(lic.licenseKey, next);
                            onNotify(t(`Updated ${lic.licenseKey} to ${next}.`, `อัปเดตสถานะ ${lic.licenseKey} เป็น ${next}`));
                            await loadLicenses();
                          }}
                        >
                          {lic.status === 'ACTIVE' ? t("Revoke", "ระงับ") : t("Activate", "เปิดใช้")}
                        </button>
                        <button
                          type="button"
                          className="btn xs rose"
                          onClick={async () => {
                            await adminDeleteLicense(lic.licenseKey);
                            onNotify(t(`Deleted ${lic.licenseKey}.`, `ลบ ${lic.licenseKey} แล้ว`));
                            await loadLicenses();
                          }}
                        >
                          {t("Delete", "ลบ")}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
