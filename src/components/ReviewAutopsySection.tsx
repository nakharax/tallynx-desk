import React, { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import type { GhrWorkspaceState } from '../types/ghr';
import { deskText, formatAccountDisplayName, type DeskLanguage } from '../utils/deskI18n';
import { PropAutopsyCard } from './PropAutopsyCard';

interface ReviewAutopsySectionProps {
  lang: DeskLanguage;
  state: GhrWorkspaceState;
  balance: string;
  dailyDrawdownHeadroom: string;
  onOpenJournal: () => void;
  onOpenCalculator: () => void;
}

export function ReviewAutopsySection({
  lang, state, balance, dailyDrawdownHeadroom, onOpenJournal, onOpenCalculator,
}: ReviewAutopsySectionProps) {
  const t = (en: string, th: string) => deskText(lang, en, th);
  const { activePort, journal, privacyMasked } = state;
  const account = state.accounts[activePort];
  const accountTrades = useMemo(
    () => account ? journal.filter((trade) => trade.port === activePort) : [],
    [account, activePort, journal],
  );
  const tradeCount = accountTrades.length;
  const wins = accountTrades.filter((trade) => Number(trade.pnlUsd) > 0).length;
  const winRate = tradeCount ? `${(100 * wins / tradeCount).toFixed(1)}%` : '—';
  const metrics = [
    { label: t('Balance', 'ยอดคงเหลือ'), value: account ? balance : '—' },
    { label: t('Trades', 'จำนวนรายการ'), value: account ? tradeCount.toLocaleString(lang) : '—' },
    { label: t('Win rate', 'อัตราชนะ'), value: winRate },
    { label: t('Daily drawdown headroom', 'วงเงินขาดทุนรายวันที่เหลือ'), value: dailyDrawdownHeadroom },
  ];

  return (
    <section id="sec-review-autopsy" className="review-workspace" aria-labelledby="review-diagnostics-title">
      <header className="card review-diagnostics">
        <div className="review-diagnostics-heading">
          <div>
            <h2 className="card-title" id="review-diagnostics-title">{t('Account diagnostics', 'ภาพรวมการตรวจสอบบัญชี')}</h2>
            <p>{account ? formatAccountDisplayName(account.name, lang) : t('No account selected', 'ยังไม่ได้เลือกบัญชี')}</p>
          </div>
          <button type="button" className="btn sm" onClick={onOpenJournal}>
            {t('Trade Journal', 'สมุดบันทึกเทรด')} <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
        <dl className="review-diagnostics-metrics">
          {metrics.map(({ label, value }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd className="mono">{privacyMasked && value !== '—' ? '••••' : value}</dd>
            </div>
          ))}
        </dl>
      </header>
      <PropAutopsyCard
        key={activePort}
        lang={lang}
        account={account}
        report={account ? state.mt5RawReports?.[activePort] : undefined}
        journal={accountTrades}
        mt5TimeOffset={state.mt5TimeOffset}
        privacyMasked={privacyMasked}
        onApplyGuardrailsToPlan={onOpenCalculator}
      />
    </section>
  );
}
