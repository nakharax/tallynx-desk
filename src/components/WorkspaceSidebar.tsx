import React from 'react';
import { DESK_I18N, deskText, type DeskLanguage } from '../utils/deskI18n';
import { TallyNxLogo } from './TallyNxLogo';
import { primaryWorkspaceLinks, secondaryWorkspaceLinks, type WorkspacePillar } from './workspaceNavigation';

export type { WorkspacePillar } from './workspaceNavigation';

interface WorkspaceSidebarProps {
  lang: DeskLanguage;
  activePillar: WorkspacePillar;
  onGoHome?: () => void;
  onNavigate: (sectionId: string) => void;
}

export const WorkspaceSidebar = React.memo(function WorkspaceSidebar({
  lang,
  activePillar,
  onGoHome,
  onNavigate,
}: WorkspaceSidebarProps) {
  const { nav } = DESK_I18N[lang];
  const t = (en: string, th: string) => deskText(lang, en, th);
  const renderLink = ({ pillar, section, icon: Icon }: (typeof primaryWorkspaceLinks | typeof secondaryWorkspaceLinks)[number]) => (
    <button
      key={pillar}
      type="button"
      data-pillar={pillar}
      className={`fx-side-btn ${activePillar === pillar ? 'active' : ''}`}
      aria-current={activePillar === pillar ? 'page' : undefined}
      onClick={() => onNavigate(section)}
    >
      <Icon className="ico" aria-hidden="true" />
      <span className="fx-side-label">{nav[pillar]}</span>
    </button>
  );

  return (
    <aside className="fx-sidebar">
      <button
        type="button"
        className="fx-sidebar-logo"
        title={t('TallyNX Desk · Home', 'TallyNX Desk · หน้าแรก')}
        onClick={onGoHome ?? (() => onNavigate('sec-accounts'))}
      >
        <TallyNxLogo lang={lang} className="fx-logo-svg" />
      </button>
      <nav className="fx-sidebar-nav" aria-label={t('Main navigation', 'เมนูหลัก')}>
        <div className="fx-sidebar-group">{primaryWorkspaceLinks.map(renderLink)}</div>
        <div className="fx-sidebar-secondary">
          <div className="fx-sidebar-divider" aria-hidden="true" />
          <div className="fx-sidebar-group">{secondaryWorkspaceLinks.map(renderLink)}</div>
        </div>
      </nav>
      <div className="fx-sidebar-version mono">v5.0</div>
    </aside>
  );
});
