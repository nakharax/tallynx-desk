import React from 'react';
import { Compass, LayoutDashboard, Scale, Settings, Users } from 'lucide-react';
import { DESK_I18N, deskText, type DeskLanguage } from '../utils/deskI18n';
import type { WorkspacePillar } from './WorkspaceSidebar';

interface MobileBottomNavProps {
  lang: DeskLanguage;
  activePillar: WorkspacePillar;
  onOpenMall: () => void;
  onSwitchPage: (sectionId: string) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = React.memo(({
  lang,
  activePillar,
  onOpenMall,
  onSwitchPage,
}) => {
  const ui = DESK_I18N[lang];
  const t = (en: string, th: string) => deskText(lang, en, th);

  return (
    <nav className="fx-mobile-bottom-nav" aria-label={t('Mobile Navigation', 'เมนูมือถือ')}>
      <button
        type="button"
        className={`fx-mob-nav-btn ${activePillar === 'portfolio' ? 'active' : ''}`}
        aria-current={activePillar === 'portfolio' ? 'page' : undefined}
        onClick={() => onSwitchPage('sec-accounts')}
      >
        <LayoutDashboard className="fx-mob-ico" size={18} aria-hidden="true" />
        <span>{t('Portfolio', 'พอร์ต')}</span>
      </button>

      <button
        type="button"
        className={`fx-mob-nav-btn ${activePillar === 'plan' ? 'active' : ''}`}
        aria-current={activePillar === 'plan' ? 'page' : undefined}
        onClick={() => onSwitchPage('calculator-root')}
      >
        <Compass className="fx-mob-ico" size={18} aria-hidden="true" />
        <span>{t('Plan', 'วางแผน')}</span>
      </button>

      <button
        type="button"
        className={`fx-mob-nav-btn ${activePillar === 'rules' ? 'active' : ''}`}
        aria-current={activePillar === 'rules' ? 'page' : undefined}
        onClick={() => onSwitchPage('sec-proprules')}
      >
        <Scale className="fx-mob-ico" size={18} aria-hidden="true" />
        <span>{t('Rules', 'กฎ')}</span>
      </button>

      <button
        type="button"
        className={`fx-mob-nav-btn ${activePillar === 'mall' ? 'active' : ''}`}
        aria-current={activePillar === 'mall' ? 'page' : undefined}
        onClick={onOpenMall}
      >
        <Users className="fx-mob-ico" size={18} aria-hidden="true" />
        <span>{t('Mall', 'มอลล์')}</span>
      </button>

      <button
        type="button"
        className={`fx-mob-nav-btn ${activePillar === 'settings' ? 'active' : ''}`}
        aria-current={activePillar === 'settings' ? 'page' : undefined}
        onClick={() => onSwitchPage('sec-settings')}
      >
        <Settings className="fx-mob-ico" size={18} aria-hidden="true" />
        <span>{ui.nav.settings}</span>
      </button>
    </nav>
  );
});

MobileBottomNav.displayName = 'MobileBottomNav';
