import React, { useState } from 'react';
import { navigateDeskTabs } from '../utils/navigateDeskTabs';
import { deskText } from '../utils/deskI18n';
import type { DeskLanguage } from '../utils/deskI18n';

interface HelpGuideModalProps {
  lang?: DeskLanguage;
  brandName: string;
  onClose: () => void;
  onOpenImportFile: () => void;
}

export const HelpGuideModal: React.FC<HelpGuideModalProps> = ({
  lang = 'en',
  brandName,
  onClose,
  onOpenImportFile,
}) => {
  const t = (english: string, thai: string) => deskText(lang, english, thai);
  const [tab, setTab] = useState<'MT5' | 'SYSTEM' | 'LEGAL'>('MT5');

  return (
    <div className="desk-modal-content">
      <div className="desk-modal-header">
        <div>
          <strong style={{ fontSize: '15px', color: 'var(--text-primary)' }}>
            {t("Setup guide (", "คู่มือเริ่มใช้งาน (")}{brandName})
          </strong>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {t("Import an MT5 report in 3 steps. Review 3-TP, 12-Gate and the risk disclosure.", "นำเข้ารายงาน MT5 ใน 3 ขั้นตอน ดูวิธีใช้ 3-TP กับ 12-Gate และอ่านคำเตือนความเสี่ยง")}
          </div>
        </div>
        <button type="button" className="btn xs" onClick={onClose} autoFocus>
          {t("✕ Close guide", "✕ ปิดคู่มือ")}
        </button>
      </div>

      <div className="desk-modal-tabs" role="tablist" onKeyDown={navigateDeskTabs} aria-label={t("Guide sections", "หัวข้อคู่มือ")}>
        <button
          type="button"
          role="tab"
          id="guide-MT5-tab"
          aria-controls="guide-panel"
          aria-selected={tab === 'MT5'}
          tabIndex={tab === 'MT5' ? 0 : -1}
          className={`btn sm ${tab === 'MT5' ? 'primary' : ''}`}
          onClick={() => setTab('MT5')}
        >
          {t("1. Import from MT5 (3 steps)", "1. นำเข้า MT5 (3 ขั้นตอน)")}
        </button>
        <button
          type="button"
          role="tab"
          id="guide-SYSTEM-tab"
          aria-controls="guide-panel"
          aria-selected={tab === 'SYSTEM'}
          tabIndex={tab === 'SYSTEM' ? 0 : -1}
          className={`btn sm ${tab === 'SYSTEM' ? 'primary' : ''}`}
          onClick={() => setTab('SYSTEM')}
        >
          {t("2. 3-TP & 12-Gate", "2. ระบบ 3-TP & 12-Gate")}
        </button>
        <button
          type="button"
          role="tab"
          id="guide-LEGAL-tab"
          aria-controls="guide-panel"
          aria-selected={tab === 'LEGAL'}
          tabIndex={tab === 'LEGAL' ? 0 : -1}
          className={`btn sm ${tab === 'LEGAL' ? 'primary' : ''}`}
          onClick={() => setTab('LEGAL')}
        >
          {t("3. Risk disclaimer", "3. คำเตือนความเสี่ยง (Disclaimer)")}
        </button>
      </div>

      <div id="guide-panel" role="tabpanel" aria-labelledby={`guide-${tab}-tab`} tabIndex={0}>
      {tab === 'MT5' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
              gap: '10px',
            }}
          >
            <div
              style={{
                padding: '12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-color)',
              }}
            >
              <strong style={{ fontSize: '12.5px', color: 'var(--accent-ink)' }}>
                {t("Step 1 · Open trade history in MT5", "ขั้นที่ 1 · เปิดประวัติเทรดใน MT5")}
              </strong>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.5 }}>
                {t("Open MetaTrader 5 on your PC and go to the ", "เปิดโปรแกรม MetaTrader 5 บนคอมพิวเตอร์ แล้วไปที่แท็บ ")}<strong>{t("History tab", "History (ประวัติ)")}</strong>{t(". Right-click and choose", " คลิกขวาเลือก")}{' '}
                <strong>All History</strong>{t(" or the date range you need.", " หรือช่วงวันที่ต้องการ")}
              </p>
            </div>

            <div
              style={{
                padding: '12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-color)',
              }}
            >
              <strong style={{ fontSize: '12.5px', color: 'var(--accent-ink)' }}>
                {t("Step 2 · Save the report (.xlsx)", "ขั้นที่ 2 · บันทึกรายงาน (.xlsx)")}
              </strong>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.5 }}>
                {t("Right-click the History table and select ", "คลิกขวาในตาราง History → เลือก ")}<strong>Report → Open XML (MS Office Excel)</strong>{t(" to create the file", " เพื่อสร้างไฟล์")}{' '}
                <span className="mono">ReportHistory-*.xlsx</span>
              </p>
            </div>

            <div
              style={{
                padding: '12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-color)',
              }}
            >
              <strong style={{ fontSize: '12.5px', color: 'var(--accent-ink)' }}>
                {t("Step 3 · Import the report", "ขั้นที่ 3 · นำเข้ารายงาน")}
              </strong>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.5 }}>
                {t("Select ", "กดปุ่ม ")}<strong>Import MT5</strong>{t(" above. Desk reads the account number and initial deposit and groups the 3-TP legs.", " ด้านบน Desk จะอ่านเลขบัญชีและเงินฝากตั้งต้น แล้วจัดกลุ่มไม้ 3-TP")}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
              {t("Supported files: ", "รองรับไฟล์ ")}<span className="mono">.xlsx / .xls / .csv / .json</span>{t(" (you can select several files at once).", " (เลือกหลายไฟล์พร้อมกันได้)")}
            </span>
            <button
              type="button"
              className="btn sm primary"
              onClick={() => {
                onClose();
                onOpenImportFile();
              }}
            >
              {t("Choose MT5 files", "เลือกไฟล์ MT5")}
            </button>
          </div>
        </div>
      )}

      {tab === 'SYSTEM' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-subtle)', border: '1px solid var(--border-color)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{t("1. 12-Gate fail-closed protocol", "1. ระบบ 12-Gate Fail-Closed Protocol")}</strong>
            <p style={{ marginTop: '4px', lineHeight: 1.5 }}>
              {t("The session checklist starts at ", "เช็กลิสต์เริ่มที่ ")}<strong>0/12</strong>{t(". An MT5 order plan requires all 12 checks. A full stop-out triggers a ", " ต้องผ่านครบ 12 ข้อก่อนวางแผนส่งคำสั่งใน MT5 เมื่อชน SL ครบทุกไม้ ระบบจะเริ่ม ")}<strong>{t("15-minute cooldown", "พัก 15 นาที")}</strong>{t(".", " โดยอัตโนมัติ")}
            </p>
          </div>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-subtle)', border: '1px solid var(--border-color)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{t("2. 3-TP & Trailing Lock (-1.00R to +0.80R)", "2. โครงสร้าง 3-TP & Trailing Lock (-1.00R to +0.80R)")}</strong>
            <p style={{ marginTop: '4px', lineHeight: 1.5 }}>
              {t("The model uses three equal legs (", "แบบจำลองใช้ 3 ไม้เท่ากัน (")}<span className="mono">SL -1,000p</span>{t("). Leg 1 closes at ", ") ไม้ 1 ปิดที่ ")}<span className="mono">+400p</span>{t(" and leg 2 at ", " และปิดไม้ 2 ที่ ")}<span className="mono">+800p</span>{t(". The Trailing Lock scenario moves leg 3’s stop to TP1 (", " ในกรณี Trailing Lock จุด SL ของไม้ 3 จะเลื่อนไปที่ TP1 (")}<span className="mono">+400p</span>{t("). The final target for leg 3 is ", ") เป้าสุดท้ายของไม้ 3 คือ ")}<span className="mono">+1,200p</span>{t(" (up to +2,400p or +0.80R in total).", " (รวมสูงสุด +2,400p หรือ +0.80R)")}
            </p>
          </div>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-subtle)', border: '1px solid var(--border-color)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{t("3. Consistency rules & account presets", "3. การปรับกฎ Consistency & พรีเซ็ตพอร์ต")}</strong>
            <p style={{ marginTop: '4px', lineHeight: 1.5 }}>
              {t("Select ", "กด ")}<strong>{t("Accounts → + Add account", "Accounts → + เพิ่มพอร์ตใหม่")}</strong>{t(" to choose a prop firm preset ($5K–$50K, 40% or 30% consistency cap) or a personal account (100%, with no daily cap).", " เพื่อเลือกพรีเซ็ตกองทุน ($5K–$50K, กฎ 40%/30%) หรือพอร์ตส่วนตัว (100% ไม่จำกัดเพดานรายวัน)")}
            </p>
          </div>
        </div>
      )}

      {tab === 'LEGAL' && (
        <div
          style={{
            padding: '14px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--amber-soft)',
            border: '1px solid var(--amber-border)',
            color: 'var(--amber)',
            fontSize: '12.5px',
            lineHeight: 1.6,
          }}
        >
          <strong>{t("Financial risk disclaimer", "คำเตือนความเสี่ยงทางการเงิน (Financial Risk Disclaimer)")}</strong>
          <ul style={{ paddingLeft: '18px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <li>
              {t("The ", "โปรแกรม ")}<strong>{brandName}</strong>{t(" desk helps assess risk, record trades, and practice following trading rules.", " เป็นเครื่องมือช่วยคำนวณความเสี่ยง บันทึกผลการเทรด (Trade Journal) และฝึกวินัยตามกฎเท่านั้น")}
            </li>
            <li>
              {t("Content and analysis from the ", "ข้อมูลและการวิเคราะห์จากหน้า ")}<strong>{t("AI Coach", "โค้ชเทรด (AI Coach)")}</strong>{t(" are for education and structured planning only.", " มีวัตถุประสงค์เพื่อการศึกษาและการวางแผนเชิงโครงสร้าง")}
              <strong>{t(" They are not financial advice", " ไม่ถือเป็นการให้คำแนะนำการลงทุน (Not Financial Advice)")}</strong>{t(" or an offer to trade securities or gold.", " หรือการชักชวนซื้อขายหลักทรัพย์/ทองคำ")}
            </li>
            <li>
              {t("XAU/USD, foreign exchange, and prop firm trading involve high risk. Assess how much risk you can accept before placing any live order in MT5.", "การซื้อขาย XAU/USD, Forex และบัญชี Prop Firm มีความเสี่ยงสูง ผู้เทรดควรพิจารณาขนาดความเสี่ยงที่ยอมรับได้ด้วยตนเองก่อนส่งคำสั่งจริงใน MT5 ทุกครั้ง")}
            </li>
          </ul>
        </div>
      )}
      </div>
    </div>
  );
};
