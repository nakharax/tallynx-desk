import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Bot,
  Calculator,
  CandlestickChart,
  Command,
  Languages,
  Moon,
  RefreshCw,
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
import { deskText, formatAccountDisplayName, type DeskLanguage } from '../utils/deskI18n';
import { DeskDialog } from './DeskDialog';

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  lang: DeskLanguage;
  theme: 'dark' | 'light';
  activeNavSection: string;
  accounts: Record<string, AccountInfo>;
  activePort: string;
  onSwitchPage: (pageId: string) => void;
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
    const workspaces: PaletteItem[] = [
      {
        id: 'ws-mall',
        group: 'WORKSPACE',
        label: t('Community Mall', 'ห้องรวมเทรดเดอร์ (Mall)'),
        subtitle: t('Live trade ideas, blueprint zone feeds, ICT sessions', 'แผนเทรดจริง โซนคอมมูนิตี้ และเวลาตลาด ICT'),
        keywords: 'mall community lounge feed live room ideas',
        badge: activeNavSection === 'sec-mall' ? t('Active', 'ใช้งานอยู่') : undefined,
        icon: <Users size={15} />,
        run: () => {
          onSwitchPage('sec-mall');
          onClose();
        },
      },
      {
        id: 'ws-analysis',
        group: 'WORKSPACE',
        label: t('Portfolio Overview', 'ภาพรวมพอร์ต (Portfolio)'),
        subtitle: t('Equity growth curve, drawdown buffers, 7-day consistency', 'กราฟเติบโต วงเงินขาดทุน และกฎ 40% ย้อนหลัง 7 วัน'),
        keywords: 'portfolio overview analysis performance equity drawdown',
        badge: activeNavSection === 'sec-accounts' ? t('Active', 'ใช้งานอยู่') : undefined,
        icon: <BarChart3 size={15} />,
        run: () => {
          onSwitchPage('sec-accounts');
          onClose();
        },
      },
      {
        id: 'ws-journal',
        group: 'WORKSPACE',
        label: t('Trade Journal', 'สมุดบันทึกเทรด'),
        subtitle: t('Verified MT5 trade ledger, R-multiples, print PDF report', 'ประวัติเทรดจาก MT5 ค่า R และพิมพ์รายงาน PDF'),
        keywords: 'journal trades history log xlsx import pdf',
        badge: activeNavSection === 'journal-root' ? t('Active', 'ใช้งานอยู่') : undefined,
        icon: <BarChart3 size={15} />,
        run: () => {
          onSwitchPage('journal-root');
          onClose();
        },
      },
      {
        id: 'ws-calc',
        group: 'WORKSPACE',
        label: t('3-TP Risk Calculator', 'เครื่องคำนวณความเสี่ยง 3-TP'),
        subtitle: t('Strict dollar risk lot sizing, 3-TP splits, consistency check', 'คำนวณ Lot คุมความเสี่ยงเงินต้น แบ่ง 3-TP และกฎ 40%'),
        keywords: 'plan calculator risk lot size 3-tp xauusd ghr',
        badge: activeNavSection === 'calculator-root' ? t('Active', 'ใช้งานอยู่') : undefined,
        icon: <Calculator size={15} />,
        run: () => {
          onSwitchPage('calculator-root');
          onClose();
        },
      },
      {
        id: 'ws-12gate',
        group: 'WORKSPACE',
        label: t('12-Gate Protocol & Golden Rules', 'เช็กลิสต์ 12-Gate และกฎเหล็ก'),
        subtitle: t('Fail-closed pre-trade discipline gates and 5-state expectancy', 'ด่านตรวจวินัยก่อนเข้าเทรด 12 ข้อ และตารางสถิติ 5 สถานะ'),
        keywords: '12-gate checklist discipline golden rules expectancy plan',
        badge: activeNavSection === 'desk-cards-root' ? t('Active', 'ใช้งานอยู่') : undefined,
        icon: <ShieldCheck size={15} />,
        run: () => {
          onSwitchPage('desk-cards-root');
          onClose();
        },
      },
      {
        id: 'ws-chart',
        group: 'WORKSPACE',
        label: t('Live Chart XAU/USD', 'กราฟสด XAU/USD'),
        subtitle: t('Real-time TradingView stream, ATR & intraday trend', 'กราฟราคาทองคำสดพร้อมค่า ATR และแนวโน้มระหว่างวัน'),
        keywords: 'live chart xauusd gold tradingview atr ema',
        badge: activeNavSection === 'tv-chart-root' ? t('Active', 'ใช้งานอยู่') : undefined,
        icon: <CandlestickChart size={15} />,
        run: () => {
          onSwitchPage('tv-chart-root');
          onClose();
        },
      },
      {
        id: 'ws-rules',
        group: 'WORKSPACE',
        label: t('PropRules Live Monitor', 'ตรวจกฎกองทุน PropRules'),
        subtitle: t('Compare FTMO, FundedNext, The5ers, Topstep rules & risk guards', 'เทียบกฎกองทุนชั้นนำ และเฝ้าระวังวงเงินขาดทุนแบบเรียลไทม์'),
        keywords: 'prop rules ftmo fundednext the5ers drawdown compliance',
        badge: activeNavSection === 'sec-proprules' ? t('Active', 'ใช้งานอยู่') : undefined,
        icon: <Scale size={15} />,
        run: () => {
          onSwitchPage('sec-proprules');
          onClose();
        },
      },
      {
        id: 'ws-market',
        group: 'WORKSPACE',
        label: t('Strategy Market', 'ตลาดชุดตั้งค่าระบบเทรด'),
        subtitle: t('Browse verified playbook presets and load distances safely', 'เลือกชมแผนเทรดและชุดระยะความเสี่ยงมาตรฐาน'),
        keywords: 'marketplace strategies templates store presets',
        badge: activeNavSection === 'sec-marketplace' ? t('Active', 'ใช้งานอยู่') : undefined,
        icon: <Store size={15} />,
        run: () => {
          onSwitchPage('sec-marketplace');
          onClose();
        },
      },
      {
        id: 'ws-settings',
        group: 'WORKSPACE',
        label: t('Settings, Accounts & Sync', 'ตั้งค่า บัญชีพอร์ต และการซิงก์'),
        subtitle: t('Manage portfolios, backup workspace, theme, language & data reset', 'จัดการพอร์ต สำรองไฟล์ JSON ตั้งค่าธีม/ภาษา และจัดการข้อมูล'),
        keywords: 'settings backup sync restore json theme language ports accounts reset',
        badge: activeNavSection === 'sec-settings' ? t('Active', 'ใช้งานอยู่') : undefined,
        icon: <Settings size={15} />,
        run: () => {
          onSwitchPage('sec-settings');
          onClose();
        },
      },
    ];

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
  }, [accounts, activeNavSection, activePort, lang, onClose, onOpenMt5Sync, onSelectAccount, onSwitchPage, onToggleAiCoach, onToggleLanguage, onToggleTheme, theme]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.keywords.toLowerCase().includes(q)
    );
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
