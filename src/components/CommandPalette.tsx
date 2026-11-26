import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Bot,
  Calculator,
  CandlestickChart,
  Command,
  FlaskConical,
  Languages,
  Moon,
  RefreshCw,
  ScanLine,
  Scale,
  Search,
  Settings,
  ShieldCheck,
  Store,
  Sun,
  Users,
  Wallet,
} from 'lucide-react';
import type { AccountInfo } from '../types/ghr';
import { DESK_I18N, deskText, formatAccountDisplayName, type DeskLanguage } from '../utils/deskI18n';
import { DeskDialog } from './DeskDialog';
import type { SettingsTab } from './SettingsPageSection';

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  lang: DeskLanguage;
  theme: 'dark' | 'light';
  activeNavSection: string;
  accounts: Record<string, AccountInfo>;
  activePort: string;
  onSwitchPage: (pageId: string) => void;
  activeSettingsTab: SettingsTab;
  onOpenSettingsTab: (tab: SettingsTab) => void;
  onSelectAccount: (portId: string) => void;
  onOpenMt5Sync: () => void;
  onToggleTheme: () => void;
  onToggleLanguage: () => void;
  onToggleAiCoach: () => void;
}

interface PaletteItem {
  id: string;
  group: 'WORKSPACE' | 'ACTION' | 'ACCOUNT';
  label: string;
  subtitle: string;
  keywords: string;
  badge?: string;
  icon: React.ReactNode;
  run: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  lang,
  theme,
  activeNavSection,
  accounts,
  activePort,
  onSwitchPage,
  activeSettingsTab,
  onOpenSettingsTab,
  onSelectAccount,
  onOpenMt5Sync,
  onToggleTheme,
  onToggleLanguage,
  onToggleAiCoach,
}) => {
  const t = (en: string, th: string) => deskText(lang, en, th);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    const { nav, pageTitles, settingsTabs } = DESK_I18N[lang];
    const links = [
      { section: 'sec-accounts', label: nav.desk, icon: BarChart3,
        subtitle: t('Live positions, portfolio overview and daily risk', 'สถานะสด ภาพรวมพอร์ตและความเสี่ยงรายวัน'),
        keywords: 'desk portfolio overview analysis performance calendar equity drawdown' },
      { section: 'tv-chart-root', label: `${nav.plan} · ${nav.liveChart}`, icon: CandlestickChart,
        subtitle: t('TradingView and live market telemetry', 'TradingView และตัวชี้วัดตลาดสด'),
        keywords: 'plan live chart xauusd gold tradingview atr ema' },
      { section: 'calculator-root', label: `${nav.plan} · ${nav.calculator}`, icon: Calculator,
        subtitle: t('Position sizing and consistency checks', 'คำนวณขนาดสถานะและตรวจความสม่ำเสมอ'),
        keywords: 'plan calc calculator 3-tp risk lot size consistency' },
      { section: 'desk-cards-root', label: `${nav.plan} · ${nav.twelveGate}`, icon: ShieldCheck,
        subtitle: t('Checklist, 5-state matrix and golden rules', 'เช็กลิสต์ ตาราง 5 สถานะ และกฎเหล็ก'),
        keywords: 'plan 12-gate checklist discipline golden rules expectancy' },
      { section: 'sec-quant-risk', label: `${nav.quant} · ${nav.aiRisk}`, icon: FlaskConical,
        subtitle: t('Market structure and risk supervision', 'โครงสร้างตลาดและการกำกับความเสี่ยง'),
        keywords: 'quant ai risk supervision market candles volatility' },
      { section: 'sec-comex-bridge', label: `${nav.quant} · ${nav.comexBridge}`, icon: FlaskConical,
        subtitle: t('Futures-to-spot basis and volume profile', 'ส่วนต่างฟิวเจอร์สกับสปอตและโปรไฟล์ปริมาณซื้อขาย'),
        keywords: 'quant comex bridge databento futures spot basis volume' },
      { section: 'sec-review-autopsy', label: `${nav.review} · ${nav.autopsy}`, icon: ScanLine,
        subtitle: t('Account diagnostics and statement review', 'ตรวจสอบบัญชีและวิเคราะห์รายงานย้อนหลัง'),
        keywords: 'review autopsy challenge drawdown diagnostics statement' },
      { section: 'journal-root', label: `${nav.review} · ${pageTitles.journal}`, icon: BarChart3,
        subtitle: t('Trade history and PDF reports', 'ประวัติการเทรดและรายงาน PDF'),
        keywords: 'review journal trades history ledger xlsx pdf' },
      { section: 'sec-proprules', label: nav.rules, icon: Scale,
        subtitle: t('Prop firm rule checks and news blackout radar', 'ตรวจสอบกฎกองทุนและช่วงจำกัดจากข่าวสำคัญ'),
        keywords: 'prop rules ftmo fundednext the5ers drawdown compliance news' },
      { section: 'sec-mall', label: `${nav.mall} · ${pageTitles.community}`, icon: Users,
        subtitle: t('Community lounge and workspace discussions', 'ห้องคอมมูนิตี้และการสนทนาเกี่ยวกับพื้นที่ทำงาน'),
        keywords: 'mall community lounge feed room' },
      { section: 'sec-marketplace', label: `${nav.mall} · ${pageTitles.marketplace}`, icon: Store,
        subtitle: t('Browse playbook presets and templates', 'เลือกชมเพลย์บุ๊กและเทมเพลต'),
        keywords: 'mall market marketplace strategies templates store presets' },
    ];
    const activeBadge = t('Active', 'ใช้งานอยู่');
    const workspaces: PaletteItem[] = links.map(({ section, label, icon: Icon, subtitle, keywords }) => ({
      id: section,
      group: 'WORKSPACE',
      label,
      subtitle,
      keywords,
      badge: activeNavSection === section ? activeBadge : undefined,
      icon: <Icon size={15} />,
      run: () => {
        onSwitchPage(section);
        onClose();
      },
    }));

    const settingsLinks: { tab: SettingsTab; subtitle: string; keywords: string }[] = [
      { tab: 'display', subtitle: t('Theme, language, branding and currency', 'ธีม ภาษา แบรนด์ และสกุลเงิน'),
        keywords: 'display appearance theme language branding privacy currency' },
      { tab: 'keys', subtitle: t('Gemini, Codex, OpenRouter and Databento credentials', 'คีย์และการเชื่อมต่อ Gemini, Codex, OpenRouter และ Databento'),
        keywords: 'ai & keys api keys byok gemini codex oauth openrouter databento' },
      { tab: 'accounts', subtitle: t('Switch or manage workspace accounts', 'สลับหรือจัดการบัญชีในพื้นที่ทำงาน'),
        keywords: 'accounts portfolio ports manage' },
      { tab: 'sync', subtitle: t('Cloud backups and the MT5 Bridge', 'สำรองข้อมูลบนคลาวด์และเชื่อมต่อ MT5'),
        keywords: 'sync database backup restore cloud mt5 bridge' },
    ];
    workspaces.push(...settingsLinks.map(({ tab, subtitle, keywords }): PaletteItem => ({
      id: `settings-${tab}`,
      group: 'WORKSPACE',
      label: `${nav.settings} · ${settingsTabs[tab]}`,
      subtitle,
      keywords: `settings ${keywords}`,
      badge: activeNavSection === 'sec-settings' && activeSettingsTab === tab ? activeBadge : undefined,
      icon: <Settings size={15} />,
      run: () => {
        onOpenSettingsTab(tab);
        onClose();
      },
    })));

    const actions: PaletteItem[] = [
      {
        id: 'act-sync',
        group: 'ACTION',
        label: t('Connect or Import MT5 Account', 'เชื่อมต่อ / นำเข้าบัญชี MT5'),
        subtitle: t('Open MT5 .xlsx, Cloud API, or FundedNext MCP sync modal', 'เปิดหน้าต่างนำเข้า .xlsx หรือเชื่อมต่อบัญชีอ่านอย่างเดียวทันที'),
        keywords: 'import mt5 sync xlsx fundednext myfxbook cloud connect',
        icon: <RefreshCw size={15} />,
        run: () => {
          onClose();
          onOpenMt5Sync();
        },
      },
      {
        id: 'act-theme',
        group: 'ACTION',
        label: theme === 'dark' ? t('Switch to Light Paper Theme', 'สลับเป็นโหมดสว่าง (Paper)') : t('Switch to Obsidian Dark Theme', 'สลับเป็นโหมดมืด (Obsidian)'),
        subtitle: t('Instant workspace theme polarity switch', 'เปลี่ยนสีธีมทันทีโดยไม่เสียหน้าทำงานเดิม'),
        keywords: 'theme dark light paper obsidian appearance mode',
        icon: theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />,
        run: () => {
          onToggleTheme();
          onClose();
        },
      },
      {
        id: 'act-lang',
        group: 'ACTION',
        label: lang === 'en' ? t('Switch Language to Thai (TH)', 'เปลี่ยนภาษาเป็นภาษาไทย (TH)') : t('Switch Language to English (EN)', 'เปลี่ยนภาษาเป็นอังกฤษ (EN)'),
        subtitle: t('Toggle full workspace localization', 'สลับภาษาไทย/อังกฤษทั้งระบบ'),
        keywords: 'language english thai translate th en i18n',
        icon: <Languages size={15} />,
        run: () => {
          onToggleLanguage();
          onClose();
        },
      },
      {
        id: 'act-coach',
        group: 'ACTION',
        label: t('Toggle AI Risk Coach', 'เปิด/ปิดผู้ช่วย AI Risk Coach'),
        subtitle: t('Open right-side AI risk coach and guardrail monitor', 'เปิดแถบผู้ช่วยประเมินความเสี่ยงและตัวเตือนวินัยด้านขวา'),
        keywords: 'ai coach assistant dock guardrails',
        icon: <Bot size={15} />,
        run: () => {
          onToggleAiCoach();
          onClose();
        },
      },
    ];

    const accountItems: PaletteItem[] = Object.values(accounts).map((acc) => ({
      id: `acc-${acc.id}`,
      group: 'ACCOUNT',
      label: formatAccountDisplayName(acc.name, lang),
      subtitle: `${acc.accountType === 'PERSONAL' ? 'Personal' : 'Prop'} · ${acc.login || acc.id} · $${acc.initial.toLocaleString('en-US')}`,
      keywords: `account port switch ${acc.name} ${acc.login} ${acc.brokerName || ''}`,
      badge: acc.id === activePort ? t('Selected', 'พอร์ตปัจจุบัน') : undefined,
      icon: <Wallet size={15} />,
      run: () => {
        onSelectAccount(acc.id);
        onClose();
      },
    }));

    return [...actions, ...workspaces, ...accountItems];
  }, [accounts, activeNavSection, activePort, activeSettingsTab, lang, onClose, onOpenMt5Sync, onOpenSettingsTab, onSelectAccount, onSwitchPage, onToggleAiCoach, onToggleLanguage, onToggleTheme, theme]);

  const filtered = useMemo(() => {
    const terms = query.toLowerCase().split(/[\s·&]+/).filter(Boolean);
    return items.filter(({ label, subtitle, keywords }) => {
      const searchable = `${label} ${subtitle} ${keywords}`.toLowerCase();
      return terms.every((term) => searchable.includes(term));
    });
  }, [items, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  const groupLabel = (group: PaletteItem['group']) => {
    if (group === 'ACTION') return t('Quick Actions', 'คำสั่งด่วน');
    if (group === 'WORKSPACE') return t('Workspaces', 'หน้าทำงานทั้งหมด');
    return t('Switch Portfolio', 'สลับบัญชีพอร์ต');
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (filtered.length > 0) setActiveIndex((prev) => (prev + 1) % filtered.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (filtered.length > 0) setActiveIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const target = filtered[activeIndex];
      if (target) target.run();
    }
  };

  return (
    <DeskDialog
      label={t('Command Palette', 'แถบคำสั่งด่วน TallyNX')}
      onClose={onClose}
      panelClassName="command-palette-dialog"
      panelStyle={{ width: 'min(620px, 94vw)', padding: 0 }}
    >
      <div className="cmd-palette-shell">
        <div className="cmd-palette-search-row">
          <Search size={16} className="cmd-palette-search-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            className="cmd-palette-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t(
              'Jump to workspace, sync MT5, toggle theme, or switch portfolio...',
              'พิมพ์ค้นหาหน้าทำงาน นำเข้า MT5 สลับธีม หรือสลับพอร์ต...'
            )}
            aria-label={t('Search commands', 'ค้นหาคำสั่ง')}
          />
          <kbd className="cmd-palette-kbd">ESC</kbd>
        </div>

        <div className="cmd-palette-list" role="listbox" aria-label={t('Command results', 'ผลลัพธ์คำสั่ง')}>
          {filtered.length === 0 ? (
            <div className="cmd-palette-empty">
              {t('No matching workspace, action, or account.', 'ไม่พบคำสั่งหรือหน้าที่ตรงกับคำค้น')}
            </div>
          ) : (
            filtered.map((item, idx) => {
              const prevGroup = idx > 0 ? filtered[idx - 1].group : null;
              const isSelected = idx === activeIndex;
              return (
                <React.Fragment key={item.id}>
                  {item.group !== prevGroup && (
                    <div className="cmd-palette-group">{groupLabel(item.group)}</div>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`cmd-palette-item ${isSelected ? 'is-active' : ''}`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={item.run}
                  >
                    <span className="cmd-palette-item-icon" aria-hidden="true">{item.icon}</span>
                    <span className="cmd-palette-item-copy">
                      <span className="cmd-palette-item-title">{item.label}</span>
                      <span className="cmd-palette-item-sub">{item.subtitle}</span>
                    </span>
                    {item.badge ? (
                      <span className="cmd-palette-badge">{item.badge}</span>
                    ) : (
                      <ArrowRight size={14} className="cmd-palette-arrow" aria-hidden="true" />
                    )}
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>

        <div className="cmd-palette-footer">
          <span className="cmd-palette-hint">
            <Command size={12} aria-hidden="true" />
            <span>{t('↑↓ Navigate · ↵ Run · Ctrl/⌘K Toggle', '↑↓ เลือก · ↵ เปิด · Ctrl/⌘K เปิดปิด')}</span>
          </span>
        </div>
      </div>
    </DeskDialog>
  );
};
