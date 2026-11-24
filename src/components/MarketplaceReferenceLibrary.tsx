import { useEffect, useState } from 'react';
import { Calculator, ChevronDown, FileCheck2, Fingerprint, Layers3, Share2, ShieldCheck, X } from 'lucide-react';
import type { MallSetupBlueprint } from '../types/mallChat';
import { deskText, type DeskLanguage } from '../utils/deskI18n';
import { REFERENCE_WORKSHEETS, referenceProofPayload, type ReferenceWorksheet } from '../utils/referenceWorksheets';
import { BlueprintLadder } from './BlueprintLadder';
import { DeskDialog } from './DeskDialog';

interface Props {
  lang: DeskLanguage;
  hasListings: boolean;
  focusId?: string;
  onConsumeFocus: () => void;
  onShare: (item: { id: string; title: string; blueprint: MallSetupBlueprint }) => void;
  onLoad: (blueprint: MallSetupBlueprint) => void;
}

export function MarketplaceReferenceLibrary({ lang, hasListings, focusId, onConsumeFocus, onShare, onLoad }: Props) {
  const t = (en: string, th: string) => deskText(lang, en, th);
  const [inspected, setInspected] = useState<ReferenceWorksheet>();
  const [expanded, setExpanded] = useState<boolean>();
  const showCards = expanded ?? !hasListings;
  const [proofs, setProofs] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let active = true;
    void Promise.all(REFERENCE_WORKSHEETS.map(async item => {
      try {
        const bytes = new TextEncoder().encode(referenceProofPayload(item));
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        const hex = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
        return [item.id, hex === item.proofHash] as const;
      } catch { return [item.id, false] as const; }
    })).then(entries => { if (active) setProofs(Object.fromEntries(entries)); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const item = REFERENCE_WORKSHEETS.find(item => item.id === focusId);
    if (item) { setInspected(item); onConsumeFocus(); }
  }, [focusId, onConsumeFocus]);

  function actions(item: ReferenceWorksheet, inDialog = false) {
    return <div className="reference-actions">
      {!inDialog && <button type="button" className="btn sm" onClick={() => setInspected(item)}><Fingerprint size={14} />{t('Inspect', 'ตรวจหลักฐาน')}</button>}
      <button type="button" className="btn sm" disabled={!proofs[item.id]} onClick={() => onShare({ ...item, title: item.blueprint.title })}>
        <Share2 size={13} />{t('Share to Showroom', 'แชร์เข้าโชว์รูม')}</button>
      <button type="button" className="btn sm primary" disabled={!proofs[item.id]} onClick={() => onLoad(item.blueprint)}>
        <Calculator size={13} />{t('Load to Calculator', 'โหลดเข้าเครื่องคำนวณ')}</button>
    </div>;
  }
  function proofLabel(id: string) {
    if (proofs[id] === undefined) return t('Checking digest…', 'กำลังตรวจแฮช…');
    return proofs[id] ? t('SHA-256 match', 'แฮช SHA-256 ตรงกัน') : t('Couldn’t verify hash', 'ยืนยันแฮชไม่ได้');
  }
  return (
    <section className="mkt-reference-library" aria-labelledby="reference-library-title">
      <header className="reference-heading"><Layers3 size={21} />
        <div><h3 id="reference-library-title">{t('Reference worksheets', 'เวิร์กชีตอ้างอิง')}</h3>
          <p className="mkt-caption">{t('Each sample includes a SHA-256 hash of its distances, risk budget and checklist.', 'แฮช SHA-256 ของแต่ละตัวอย่างคำนวณจากระยะ SL/TP งบความเสี่ยง และเช็กลิสต์')}</p></div>
        <button type="button" className="btn sm reference-toggle" aria-label={t('Toggle reference worksheets', 'เปิดหรือย่อคลังอ้างอิง')} aria-controls="reference-worksheets" aria-expanded={showCards} onClick={() => setExpanded(!showCards)}><ChevronDown size={16} /></button>
      </header>
      <div className="reference-grid" id="reference-worksheets" hidden={!showCards}>{REFERENCE_WORKSHEETS.map(item => {
        const bp = item.blueprint;
        return <article className="reference-card" key={item.id}>
          <header className="reference-card-heading">
            <div className="reference-id mono"><span>{bp.primarySymbol} / {bp.timeframe}</span><b data-session={bp.sessionFocus}>{bp.sessionFocus}</b></div>
            <h4>{bp.title}</h4>
            <p className="mkt-caption">{t(...item.description)}</p>
          </header>
          <BlueprintLadder distances={bp} lang={lang} />
          <div className="reference-proof" data-valid={proofs[item.id]}><FileCheck2 size={14} />{proofLabel(item.id)}<code>{item.proofHash.slice(0, 8)}</code></div>
          {actions(item)}
        </article>;
      })}</div>
      {inspected && <DeskDialog label={t('Reference worksheet proof', 'หลักฐานเวิร์กชีตอ้างอิง')} onClose={() => setInspected(undefined)} panelClassName="mkt-proof-dialog">
        <header className="desk-modal-header"><div><h3>{inspected.blueprint.title}</h3>
          <p className="mkt-caption">{inspected.blueprint.primarySymbol} · {inspected.blueprint.timeframe} · {inspected.blueprint.sessionFocus}</p></div>
          <button className="btn sm" type="button" aria-label={t('Close', 'ปิด')} onClick={() => setInspected(undefined)}><X size={16} /></button>
        </header>
        <div className="mkt-proof-content">
          <BlueprintLadder distances={inspected.blueprint} lang={lang} />
          <dl className="mall-levels">{[
            [t('Risk $', 'เสี่ยง $'), inspected.blueprint.riskUsd], ['SL (pts)', inspected.blueprint.slPoints],
            ['TP1 (pts)', inspected.blueprint.tp1Points], ['TP2 (pts)', inspected.blueprint.tp2Points], ['TP3 (pts)', inspected.blueprint.tp3Points],
          ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="mono">{value}</dd></div>)}</dl>
          <ul className="mall-checklist">{inspected.blueprint.checklistNotes.map(note => <li key={note}>{note}</li>)}</ul>
          <div className="mkt-proof-block"><strong><ShieldCheck size={14} /> SHA-256 · {proofLabel(inspected.id)}</strong>
            <div className="mkt-proof-hash">{inspected.proofHash}</div>
            <details><summary>{t('Hashed worksheet (UTF-8)', 'เวิร์กชีตที่ใช้คำนวณแฮช (UTF-8)')}</summary><code>{referenceProofPayload(inspected)}</code></details>
          </div>
          {actions(inspected, true)}
        </div>
      </DeskDialog>}
    </section>
  );
}
