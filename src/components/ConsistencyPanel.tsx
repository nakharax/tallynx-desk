import { Gauge, Wallet, X } from 'lucide-react';
import type { ConsistencyRule, GhrWorkspaceState } from '../types/ghr';
import { deskText, type DeskLanguage } from '../utils/deskI18n';
import {
  evaluateConsistencyRule, evaluateTwelveGates, fmtTHB, fmtUSD, formatCalculatorLot,
  getAccountComputed, getActiveCalculator, isPlaceholderDayNote,
} from '../utils/ghrRules';
import { DeskNumberInput } from './DeskNumberInput';

interface ConsistencyPanelProps {
  state: GhrWorkspaceState;
  rule: ConsistencyRule;
  evaluation: ReturnType<typeof evaluateConsistencyRule>;
  calc: ReturnType<typeof getActiveCalculator>;
  lang?: DeskLanguage;
  onUpdateRule: (patch: Partial<ConsistencyRule>) => void;
  onResetRule: () => void;
  onSyncFromJournal: () => void;
  onSetPreset: (preset: 'zero' | 'std3' | 'mix3') => void;
  onAddDay: () => void;
  onRemoveDay: () => void;
  onUpdateDayProfit: (idx: number, profit: number) => void;
  onUpdateDayNote: (idx: number, note: string) => void;
}

const CAP_PRESETS = [20, 30, 40, 50, 100];

export function ConsistencyPanel({
  state, rule, evaluation, calc, lang = 'en',
  onUpdateRule, onResetRule, onSyncFromJournal, onSetPreset, onAddDay, onRemoveDay,
  onUpdateDayProfit, onUpdateDayNote,
}: ConsistencyPanelProps) {
  const text = (en: string, th: string) => deskText(lang, en, th);
  const {
    totalProfit, bestDay, bestDayPct, isPass, capPct, capPassed, hasConsistencyCap,
    minDays, tradingDaysCount, losingDaysCount, minTotalUsd, profitSplitPct, feeRefundUsd,
    minTotalNeeded, extraProfitNeeded, netPayoutUsd, netPayoutThb,
  } = evaluation;
  const hasOverride = Boolean(state.consistencyOverrides?.[state.activePort]);
  const hasPnl = bestDay > 0 || losingDaysCount > 0;
  const acc = getAccountComputed(state.accounts, state.journal, state.activePort);
  const twelveGates = evaluateTwelveGates(state.twelveGates);
  const full = calc.outcomes.FULL_SWEEP.pnlUsd;
  const lock = calc.outcomes.TRAILING_LOCK?.pnlUsd;
  const targetEstimates = calc.isValid && acc.rem > 0 && full > 0
    ? [
      text('≈ ' + Math.ceil(acc.rem / full) + ' full outcomes', '≈ ผลครบทุกเป้า ' + Math.ceil(acc.rem / full) + ' ครั้ง'),
      ...(lock && lock > 0 ? [text(Math.ceil(acc.rem / lock) + ' lock outcomes', 'ผลล็อกกำไร ' + Math.ceil(acc.rem / lock) + ' ครั้ง')] : []),
    ].join(' / ')
    : '';
  const status = isPass
    ? text('Payout Ready', 'ผ่านเกณฑ์รอบถอน')
    : !hasPnl && tradingDaysCount === 0
      ? text('Awaiting PnL', 'รอข้อมูลกำไรขาดทุน')
      : !capPassed
        ? text('Over ' + capPct + '% cap', 'เกินเพดาน ' + capPct + '%')
        : totalProfit < minTotalUsd
          ? text('Below profit minimum', 'กำไรต่ำกว่าเกณฑ์')
          : text('More days required', 'จำนวนวันยังไม่ครบ');
  const bestShare = bestDayPct.toFixed(1) + '%';
  const shareScale = Math.max(100, bestDayPct);
  const formula = hasConsistencyCap && bestDay > 0
    ? text(
      'Required net = max(' + fmtUSD(minTotalUsd) + ', ' + fmtUSD(bestDay) + ' ÷ ' + capPct + '%)',
      'กำไรสุทธิที่ต้องมี = ค่าสูงสุดระหว่าง ' + fmtUSD(minTotalUsd) + ' กับ ' + fmtUSD(bestDay) + ' ÷ ' + capPct + '%',
    )
    : text('Minimum net = ' + fmtUSD(minTotalUsd), 'กำไรสุทธิขั้นต่ำ = ' + fmtUSD(minTotalUsd));

  return (
    <section id="consistency-root">
      <div className="card">
        <div className="card-header calc-card-heading">
          <h2 className="card-title desk-icon-title"><Gauge size={16} aria-hidden="true" />
            {hasConsistencyCap
              ? text(capPct + '% Consistency · ' + minDays + ' Days', 'กฎความสม่ำเสมอ ' + capPct + '% · ' + minDays + ' วัน')
              : text('Consistency Cap Off · ' + minDays + ' Days', 'ปิดเพดานกำไรรายวัน · ' + minDays + ' วัน')}
          </h2>
          <span className="consistency-status" data-ready={isPass} data-over={!capPassed} role="status">{status}</span>
        </div>

        <div className="calc-config consistency-rule">
          <div className="calc-ladder-header">
            <div className="calc-mode-strip" role="group" aria-label={text('Consistency cap presets', 'เพดานสัดส่วนกำไรมาตรฐาน')}>
              {CAP_PRESETS.map((cap) => (
                <button type="button" key={cap} className={'btn xs' + (capPct === cap ? ' primary' : '')}
                  aria-pressed={capPct === cap} onClick={() => onUpdateRule({ consistencyCapPct: cap })}>
                  {cap === 100 ? text('Off', 'ปิด') : cap + '%'}
                </button>
              ))}
            </div>
            <div className="calc-heading-actions">
              <span className="calc-caption">{hasOverride ? text('Custom', 'กำหนดเอง') : text('Port', 'ตามพอร์ต')}</span>
              <button type="button" className="btn xs" disabled={!hasOverride} onClick={onResetRule}>
                {text('Reset', 'คืนค่า')}
              </button>
            </div>
          </div>
          <div className="calc-fields consistency-rule-fields" key={state.activePort}>
            <label className="calc-field">
              <span>{text('Cap %', 'เพดาน %')}</span>
              <DeskNumberInput value={rule.consistencyCapPct} min={5} max={100}
                onValue={(consistencyCapPct) => onUpdateRule({ consistencyCapPct })} />
            </label>
            <label className="calc-field">
              <span>{text('Min days', 'วันขั้นต่ำ')}</span>
              <DeskNumberInput value={rule.minDays} min={1} max={30} integer onValue={(minDays) => onUpdateRule({ minDays })} />
            </label>
            <label className="calc-field">
              <span>{text('Min $', 'ขั้นต่ำ $')}</span>
              <DeskNumberInput value={rule.minTotalUsd} onValue={(minTotalUsd) => onUpdateRule({ minTotalUsd })} />
            </label>
            <label className="calc-field">
              <span>{text('Split %', 'แบ่ง %')}</span>
              <DeskNumberInput value={rule.profitSplitPct} min={10} max={100} onValue={(profitSplitPct) => onUpdateRule({ profitSplitPct })} />
            </label>
            <label className="calc-field">
              <span className="calc-refund-head">
                <input type="checkbox" id="chk-fee-refund" checked={rule.includeFeeRefund}
                  onChange={(event) => onUpdateRule({ includeFeeRefund: event.target.checked })} />
                {text('Refund $', 'คืนค่า $')}
              </span>
              <DeskNumberInput value={rule.feeRefundUsd} onValue={(feeRefundUsd) => onUpdateRule({ feeRefundUsd })} />
            </label>
          </div>
        </div>

        <div className="consistency-tools">
          <button type="button" className="btn sm primary" onClick={onSyncFromJournal}>
            {text('Sync Port PnL', 'ดึงกำไรขาดทุนจากพอร์ต')}
          </button>
          <button type="button" className="btn sm" onClick={() => onSetPreset('zero')}>{text('Reset to $0', 'รีเซ็ตเป็น $0')}</button>
          <button type="button" className="btn sm" onClick={() => onSetPreset('std3')}>{text('$120 × 3 days', '$120 × 3 วัน')}</button>
          <button type="button" className="btn sm" onClick={() => onSetPreset('mix3')}>$144 / $120 / $120</button>
          <button type="button" className="btn sm" onClick={onAddDay}>{text('+ Add Day', '+ เพิ่มวัน')}</button>
          {state.cycleDays.length > 3 && (
            <button type="button" className="btn sm" onClick={onRemoveDay}>{text('− Remove Day', '− ลบวัน')}</button>
          )}
        </div>

        <div className="consistency-day-grid consistency-day-heading">
          <span>{text('Day · Share', 'วัน · สัดส่วน')}</span>
          <span>{text('Daily notes', 'บันทึกรายวัน')}</span>
          <span className="consistency-align-end">{text('Daily PnL ($)', 'กำไรขาดทุน ($)')}</span>
        </div>

        <div className="consistency-days" key={state.activePort}>
          {state.cycleDays.map((day, index) => {
            const pnl = Number(day.profit) || 0;
            const share = totalProfit > 0 ? (pnl / totalProfit) * 100 : 0;
            const over = hasConsistencyCap && pnl > 0 && totalProfit > 0 && share > capPct + 0.001;
            const note = isPlaceholderDayNote(day.note, day.day) ? '' : day.note;
            const shareLabel = pnl < 0 && totalProfit <= 0
              ? text('Loss', 'ขาดทุน')
              : totalProfit > 0 ? share.toFixed(1) + '%' : '—';
            return (
              <div key={day.date ?? day.day} className="consistency-day-grid consistency-day" data-over-cap={over}>
                <div className="consistency-day-label" title={day.date}>
                  <strong>{text('Day', 'วันที่')} {index + 1}</strong>
                  <small className={'mono ' + (pnl < 0 || over ? 'calc-loss' : pnl > 0 ? 'calc-gain' : '')}>{shareLabel}</small>
                </div>
                <div className="consistency-note">
                  <input type="text" aria-label={text('Notes for day ' + (index + 1), 'บันทึกวันที่ ' + (index + 1))}
                    placeholder={day.date || text('Add note', 'เพิ่มบันทึก')} value={note} onChange={(event) => onUpdateDayNote(index, event.target.value)} />
                  {note && <button type="button" aria-label={text('Clear notes for day ' + (index + 1), 'ล้างบันทึกวันที่ ' + (index + 1))}
                    onClick={() => onUpdateDayNote(index, '')}><X size={12} aria-hidden="true" /></button>}
                </div>
                <div className={'consistency-amount mono' + (pnl < 0 ? ' calc-loss' : pnl > 0 ? ' calc-gain' : '')}>
                  <DeskNumberInput value={pnl} min={-Infinity} decimals={2} emptyValue={0}
                    formattedValue={fmtUSD(pnl, true)}
                    aria-label={text('PnL for day ' + (index + 1) + ' (USD)', 'กำไรขาดทุนวันที่ ' + (index + 1) + ' (USD)')}
                    title={fmtUSD(pnl, true)} className="day-profit-inp mono"
                    onValue={(profit) => onUpdateDayProfit(index, profit)} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="consistency-threshold" data-over-cap={!capPassed}>
          <div className="consistency-threshold-head">
            <span>{text('Best day share', 'สัดส่วนวันกำไรสูงสุด')} <strong className="mono">{bestShare}</strong></span>
            <span>{hasConsistencyCap ? text('Cap ' + capPct + '%', 'เพดาน ' + capPct + '%') : text('Cap off', 'ปิดเพดาน')}</span>
          </div>
          {hasConsistencyCap && (
            <div className="consistency-track" role="meter" aria-label={text('Best day share', 'สัดส่วนวันกำไรสูงสุด')}
              aria-valuemin={0} aria-valuemax={shareScale} aria-valuenow={bestDayPct} aria-valuetext={bestShare + ' · ' + status}>
              <span className="consistency-fill" style={{ width: (bestDayPct / shareScale) * 100 + '%' }} />
              <span className="consistency-tick" style={{ left: (capPct / shareScale) * 100 + '%' }} />
            </div>
          )}
          <div className="consistency-threshold-head">
            <span>{text('Net PnL', 'กำไรขาดทุนสุทธิ')} <strong className={'mono' + (totalProfit < 0 ? ' calc-loss' : '')}>{fmtUSD(totalProfit)}</strong></span>
            <span>{text(tradingDaysCount + '/' + minDays + ' days · ' + losingDaysCount + ' losing', tradingDaysCount + '/' + minDays + ' วัน · ขาดทุน ' + losingDaysCount + ' วัน')}</span>
          </div>
          <div className="calc-caption">
            {formula}{hasConsistencyCap && bestDay > 0 && <> = <strong className="mono">{fmtUSD(minTotalNeeded)}</strong></>}
          </div>
          {extraProfitNeeded > 0 && (
            <div>{text('Additional net profit needed', 'กำไรสุทธิที่ต้องเพิ่ม')} <strong className="mono">{fmtUSD(extraProfitNeeded, true)}</strong></div>
          )}
        </div>

        <div className="fx-readiness-strip">
          <div className="fx-readiness-cell">
            <span className="calc-caption">{text('Calculator risk', 'ความเสี่ยงจากเครื่องคำนวณ')}</span>
            <strong className="mono">{calc.isValid ? fmtUSD(calc.risk) + ' · ' + formatCalculatorLot(calc.totalLot) + ' L' : '—'}</strong>
            <span className="calc-caption">{text('12-Gate', 'ด่านตรวจ')} · {twelveGates.passedCount}/12</span>
          </div>
          <div className="fx-readiness-cell consistency-align-end">
            <span className="calc-caption">
              {acc.rem > 0 ? text('Left to reach account target', 'ขาดอีกเท่าไรถึงเป้าพอร์ต') : text('Port target reached', 'ถึงเป้าพอร์ตแล้ว')}
            </span>
            <strong className="mono">{acc.rem > 0 ? fmtUSD(acc.rem) : tradingDaysCount + '/' + minDays}</strong>
            {targetEstimates && <span className="calc-caption">{targetEstimates}</span>}
          </div>
        </div>

        <section className="consistency-payout" data-ready={isPass} aria-labelledby="consistency-payout-title">
          <div>
            <h3 className="desk-icon-title" id="consistency-payout-title"><Wallet size={15} aria-hidden="true" />{text('Estimated Net Payout', 'ยอดถอนสุทธิโดยประมาณ')}</h3>
            <div className="calc-caption">
              {text(profitSplitPct + '% profit split', 'ส่วนแบ่งกำไร ' + profitSplitPct + '%')}
              {rule.includeFeeRefund && feeRefundUsd > 0 && text(' + ' + fmtUSD(feeRefundUsd) + ' refund', ' + เงินคืน ' + fmtUSD(feeRefundUsd))}
            </div>
          </div>
          <div className="consistency-align-end">
            <strong className="mono sensitive-val consistency-payout-value">
              {lang === 'th' ? fmtTHB(netPayoutThb) : 'THB ' + netPayoutThb.toLocaleString('en-GB')}
            </strong>
            <div className="mono sensitive-val calc-caption">{fmtUSD(netPayoutUsd)}</div>
          </div>
        </section>
      </div>
    </section>
  );
}
