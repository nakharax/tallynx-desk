import React, { useEffect, useId, useRef, useState } from 'react';
import { Ellipsis } from 'lucide-react';
import { DESK_I18N, deskText, type DeskLanguage } from '../utils/deskI18n';
import { mobileMoreLinks, mobileWorkspaceLinks, type WorkspacePillar } from './workspaceNavigation';

interface MobileBottomNavProps {
  lang: DeskLanguage;
  activePillar: WorkspacePillar;
  onNavigate: (sectionId: string) => void;
}

export const MobileBottomNav = React.memo(function MobileBottomNav({
  lang,
  activePillar,
  onNavigate,
}: MobileBottomNavProps) {
  const { nav } = DESK_I18N[lang];
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const sheetId = useId();
  const moreActive = mobileMoreLinks.some(({ pillar }) => pillar === activePillar);

  useEffect(() => {
    if (!moreOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node
        && !sheetRef.current?.contains(event.target)
        && !moreRef.current?.contains(event.target)) {
        setMoreOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setMoreOpen(false);
      moreRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    const mobileViewport = window.matchMedia('(max-width: 768px)');
    const onViewportChange = () => {
      if (!mobileViewport.matches) setMoreOpen(false);
    };
    mobileViewport.addEventListener('change', onViewportChange);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      mobileViewport.removeEventListener('change', onViewportChange);
    };
  }, [moreOpen]);

  return (
    <nav
      className="fx-mobile-bottom-nav"
      aria-label={deskText(lang, 'Mobile navigation', 'เมนูมือถือ')}
    >
      {mobileWorkspaceLinks.map(({ pillar, section, icon: Icon }) => (
        <button
          key={pillar}
          type="button"
          data-pillar={pillar}
          className={`fx-mob-nav-btn ${activePillar === pillar ? 'active' : ''}`}
          aria-current={activePillar === pillar ? 'page' : undefined}
          onClick={() => {
            setMoreOpen(false);
            onNavigate(section);
          }}
        >
          <Icon className="fx-mob-ico" size={18} aria-hidden="true" />
          <span>{nav[pillar]}</span>
        </button>
      ))}
      <button
        ref={moreRef}
        type="button"
        data-pillar="more"
        className={`fx-mob-nav-btn ${moreActive || moreOpen ? 'active' : ''}`}
        aria-expanded={moreOpen}
        aria-controls={sheetId}
        onClick={() => setMoreOpen((open) => !open)}
      >
        <Ellipsis className="fx-mob-ico" size={18} aria-hidden="true" />
        <span>{nav.more}</span>
      </button>
      <div ref={sheetRef} id={sheetId} className="fx-mobile-more-sheet" hidden={!moreOpen}>
        {mobileMoreLinks.map(({ pillar, section, icon: Icon }) => (
          <button
            key={pillar}
            type="button"
            data-pillar={pillar}
            aria-current={activePillar === pillar ? 'page' : undefined}
            onClick={() => {
              setMoreOpen(false);
              moreRef.current?.focus();
              onNavigate(section);
            }}
          >
            <Icon size={17} aria-hidden="true" />
            <span>{nav[pillar]}</span>
          </button>
        ))}
      </div>
    </nav>
  );
});
