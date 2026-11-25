import React from 'react';
import { Compass, LayoutDashboard, Scale, Settings, Users } from 'lucide-react';
import { DESK_I18N, deskText, type DeskLanguage } from '../utils/deskI18n';
import { TallyNxLogo } from './TallyNxLogo';

export type WorkspacePillar = 'mall' | 'portfolio' | 'plan' | 'rules' | 'settings';

interface WorkspaceSidebarProps {
  lang: DeskLanguage;
  activePillar: WorkspacePillar;
  onGoHome?: () => void;
  onOpenMall: () => void;
  onSwitchPage: (sectionId: string) => void;
  onOpenSettings: () => void;
}

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = React.memo(({
  lang,
  activePillar,
  onGoHome,
  onOpenMall,
  onSwitchPage,
  onOpenSettings,
}) => {
  const ui = DESK_I18N[lang];
  const t = (en: string, th: string) => deskText(lang, en, th);

  return (
    <aside className="fx-sidebar" aria-label={t('Main Navigation', 'เมนูหลัก')}>
      <button
        type="button"
        className="fx-sidebar-logo"
        title={t('TallyNX Desk · Home', 'TallyNX Desk · หน้าแรก')}
        onClick={onGoHome ?? (() => onSwitchPage('sec-accounts'))}
        style={{ color: 'var(--text-primary)' }}
      >
        <TallyNxLogo lang={lang} className="fx-logo-svg" />
      </button>

      <nav className="fx-sidebar-nav">
        <button
          type="button"
          className={`fx-side-btn ${activePillar === 'portfolio' ? 'active' : ''}`}
          aria-current={activePillar === 'portfolio' ? 'page' : undefined}
          title={t('Portfolio & Journal', 'พอร์ตและสมุดเทรด')}
          onClick={() => onSwitchPage('sec-accounts')}
        >
          <LayoutDashboard className="ico" aria-hidden="true" />
          <span className="fx-side-label">{t('Portfolio', 'พอร์ต')}</span>
        </button>

        <button
          type="button"
          className={`fx-side-btn ${activePillar === 'plan' ? 'active' : ''}`}
          aria-current={activePillar === 'plan' ? 'page' : undefined}
          title={t('Plan: Calculator, 12-Gate & Live Chart', 'วางแผน: คำนวณ, 12-Gate และกราฟ')}
          onClick={() => onSwitchPage('calculator-root')}
        >
          <Compass className="ico" aria-hidden="true" />
          <span className="fx-side-label">{t('Plan', 'วางแผน')}</span>
        </button>

        <button
          type="button"
          className={`fx-side-btn ${activePillar === 'rules' ? 'active' : ''}`}
          aria-current={activePillar === 'rules' ? 'page' : undefined}
          title={ui.nav.propRules}
          onClick={() => onSwitchPage('sec-proprules')}
        >
          <Scale className="ico" aria-hidden="true" />
          <span className="fx-side-label">{t('Rules', 'กฎกองทุน')}</span>
        </button>

        <button
          type="button"
          className={`fx-side-btn ${activePillar === 'mall' ? 'active' : ''}`}
          aria-current={activePillar === 'mall' ? 'page' : undefined}
          title={ui.nav.community}
          onClick={onOpenMall}
        >
          <Users className="ico" aria-hidden="true" />
          <span className="fx-side-label">{t('Mall', 'มอลล์')}</span>
        </button>

        <button
          type="button"
          className={`fx-side-btn ${activePillar === 'settings' ? 'active' : ''}`}
          aria-current={activePillar === 'settings' ? 'page' : undefined}
          title={ui.nav.settings}
          onClick={onOpenSettings}
        >
          <Settings className="ico" aria-hidden="true" />
          <span className="fx-side-label">{ui.nav.settings}</span>
        </button>
      </nav>

      <div
        className="fx-sidebar-version mono"
        style={{
          marginTop: 'auto',
          padding: '10px 4px',
          fontSize: '10px',
          color: 'var(--text-muted)',
          opacity: 0.72,
          textAlign: 'center',
          letterSpacing: '0.04em',
        }}
        title={t('TallyNX Desk · Release v5.0', 'TallyNX Desk · รุ่น v5.0')}
      >
        v5.0
      </div>
    </aside>
  );
});

WorkspaceSidebar.displayName = 'WorkspaceSidebar';
