import { useEffect, useState } from 'react';
import { deskText, type DeskLanguage } from '../utils/deskI18n';
import { DEFAULT_WORKSPACE_BRAND, workspaceBrandDisplayName } from '../utils/ghrRules';

interface WorkspaceBrandingFormProps {
  lang: DeskLanguage;
  name?: string;
  subtitle?: string;
  onSave: (name: string, subtitle: string) => void;
}

const DEFAULT_SUBTITLE = 'desk.tallynx.com · Risk Analytics & Trade Journal';

export function WorkspaceBrandingForm({ lang, name, subtitle, onSave }: WorkspaceBrandingFormProps) {
  const t = (en: string, th: string) => deskText(lang, en, th);
  const [draftName, setDraftName] = useState(() => workspaceBrandDisplayName(name));
  const [draftSubtitle, setDraftSubtitle] = useState(subtitle || DEFAULT_SUBTITLE);

  useEffect(() => {
    setDraftName(workspaceBrandDisplayName(name));
    setDraftSubtitle(subtitle || DEFAULT_SUBTITLE);
  }, [name, subtitle]);

  return (
    <form
      className="workspace-branding-form"
      onSubmit={(event) => {
        event.preventDefault();
        const nextName = draftName.trim() || DEFAULT_WORKSPACE_BRAND;
        const nextSubtitle = draftSubtitle.trim() || DEFAULT_SUBTITLE;
        setDraftName(nextName);
        setDraftSubtitle(nextSubtitle);
        onSave(nextName, nextSubtitle);
      }}
    >
      <label>
        <span>{t('Brand name', 'ชื่อแบรนด์')}</span>
        <input className="inp" type="text" value={draftName} onChange={(event) => setDraftName(event.target.value)} />
      </label>
      <label>
        <span>{t('Brand subtitle', 'คำอธิบายใต้ชื่อแบรนด์')}</span>
        <input className="inp" type="text" value={draftSubtitle} onChange={(event) => setDraftSubtitle(event.target.value)} />
      </label>
      <button type="submit" className="btn sm primary">{t('Save branding', 'บันทึกแบรนด์')}</button>
    </form>
  );
}
