import React, { useMemo, useState } from 'react';
import { Calculator, Copy } from 'lucide-react';
import { BlueprintLadder } from './BlueprintLadder';
import type {
  CalculatorContract, CalculatorInstrument, CalculatorLevelInput, CalculatorMode,
  GhrWorkspaceState, ManualCalculatorConfig, QuickGates, TradeDirection, TradeOutcomeStatus,
} from '../types/ghr';
import { deskText, formatAccountDisplayName, type DeskLanguage } from '../utils/deskI18n';
import {
  CALCULATOR_CONTRACTS, DEFAULT_MANUAL_CALCULATOR, GHR_PRESET_CALCULATOR,
  evaluateTradeGuardrails, fmtUSD, formatCalculatorLot, getActiveCalculator, getBangkokIsoDate,
} from '../utils/ghrRules';
import { DeskNumberInput } from './DeskNumberInput';

interface CalculatorPanelProps {
  state: GhrWorkspaceState;
  calc: ReturnType<typeof getActiveCalculator>;
  lang?: DeskLanguage;
  onUpdateMode: (mode: CalculatorMode) => void;
  onUpdateConfig: (config: ManualCalculatorConfig) => void;
  onUpdateDir: (dir: TradeDirection) => void;
  onUpdateEntry: (raw: string, num: number) => void;
  onUpdateRisk: (risk: number, unlock?: boolean) => void;
  onUpdateNote: (note: string) => void;
  onToggleGate: (gateKey: keyof QuickGates, checked: boolean) => void;
  onCopyText: (text: string, label: string) => void;
  onRecordTrade: (outcome: TradeOutcomeStatus) => void;
}

const PRESET_RISKS = [30, 60, 90, 120, 150];
const INSTRUMENTS = Object.keys(CALCULATOR_CONTRACTS) as Exclude<CalculatorInstrument, 'CUSTOM'>[];
const QUICK_GATES: [keyof QuickGates, string, string][] = [
  ['g1', 'H1 HVN 100–200p', 'โซน H1 HVN 100–200 จุด'],
  ['g2', 'H1 Close Confirmed', 'H1 ปิดยืนยัน'],
  ['g3', 'M5 Pullback Confirmed', 'M5 ย่อและยืนยัน'],
  ['g4', '30-Minute Limit', 'Limit 30 นาที'],
  ['g5', 'No Manual Entry', 'ไม่ส่งคำสั่งด้วยมือ'],
];

export const CalculatorPanel = React.memo(function CalculatorPanel({
  state, calc, lang = 'en', onUpdateMode, onUpdateConfig, onUpdateDir, onUpdateEntry, onUpdateRisk,
  onUpdateNote, onToggleGate, onCopyText, onRecordTrade,
}: CalculatorPanelProps) {
  const text = (en: string, th: string) => deskText(lang, en, th);
  const [pendingOutcome, setPendingOutcome] = useState<TradeOutcomeStatus | null>(null);
  const manual = state.calcMode === 'MANUAL';
  const config = manual ? state.manualCalculator ?? DEFAULT_MANUAL_CALCULATOR : GHR_PRESET_CALCULATOR;
  const { contract, legs, outcomes } = calc;
  const byLot = config.sizing === 'BY_LOT';
  const equalLots = byLot && config.lotBasis === 'PER_LEG';
  const price = (value: number) => value > 0 && Number.isFinite(value) ? value.toFixed(contract.priceDecimals) : '—';
  const rr = (value: number) => (value > 0 ? '+' : '') + value.toFixed(2) + 'R';
  const points = (value: number) => (value > 0 ? '+' : '') + value.toLocaleString('en-US', { maximumFractionDigits: 6 }) + 'p';
  const patchConfig = (patch: Partial<ManualCalculatorConfig>) => onUpdateConfig({ ...config, ...patch });
  const patchContract = (patch: Partial<CalculatorContract>) => patchConfig({ customContract: { ...config.customContract, ...patch } });
  const patchLevel = (index: number, input: CalculatorLevelInput) => {
    if (index === -1) {
      patchConfig({ sl: input });
      return;
    }
    const targets = [...config.targets] as ManualCalculatorConfig['targets'];
    targets[index] = input;
    patchConfig({ targets });
  };

  const today = getBangkokIsoDate();
  const todayCount = useMemo(() => {
    let count = 0;
    for (const trade of state.journal) {
      if (trade.port === state.activePort && trade.date === today) count++;
    }
    return count;
  }, [state.journal, state.activePort, today]);
  const guardrails = useMemo(
    () =>
      evaluateTradeGuardrails({
        cooldownUntil: state.cooldownUntil,
        todayTradesCount: todayCount,
        twelveGates: state.twelveGates,
      }),
    [state.cooldownUntil, todayCount, state.twelveGates]
  );
  const warnings = [
    guardrails.isCooldownActive && text(
      'Post-stop-loss cooldown (' + guardrails.cooldownRemainingMin + ' min remaining)',
      'ช่วงพักหลังขาดทุน (เหลือ ' + guardrails.cooldownRemainingMin + ' นาที)',
    ),
    guardrails.isDailyCapReached && text('Daily quota reached (' + todayCount + '/3)', 'ครบโควตารายวัน (' + todayCount + '/3)'),
    !guardrails.allGatesPassed && text('12-Gate: ' + guardrails.gatesPassed + '/12 passed', 'ผ่าน ' + guardrails.gatesPassed + '/12 ด่าน'),
  ].filter(Boolean).join(' · ');
  const activePortName = formatAccountDisplayName(state.accounts[state.activePort]?.name || '', lang)
    || text('No port selected', 'ยังไม่ได้เลือกพอร์ต');

  const handleCopyTicket = () => {
    if (!calc.isValid) return;
    const side = state.calcDir + ' LIMIT';
    const head = calc.instrument + ' ' + side + ' @ ' + price(calc.entry);
    const size = text('Total lots', 'ล็อตรวม') + ' ' + formatCalculatorLot(calc.totalLot);
    const targets = legs.map((leg, index) => 'TP' + (index + 1) + ' ' + price(leg.price) + ' (' + formatCalculatorLot(leg.lot) + ' L)');
    const lock = outcomes.TRAILING_LOCK ? [text('TP2 lock for leg 3 at', 'ล็อกไม้ 3 หลังถึง TP2 ที่') + ' ' + price(legs[0].price)] : [];
    onCopyText([head, size, 'SL ' + price(calc.sl.price), ...targets, ...lock].join(' | '), text('MT5 ticket', 'โพย MT5'));
  };

  const outcomeButtons = [
    { key: 'FULL_SWEEP', tone: 'full', label: text('Full', 'ครบทุกเป้า'), result: outcomes.FULL_SWEEP },
    { key: 'TRAILING_LOCK', tone: 'tl', label: text('Trailing Lock', 'ล็อกกำไร'), result: outcomes.TRAILING_LOCK },
    { key: 'TP1_ONLY', tone: '', label: text('TP1 Only', 'ถึง TP1 เท่านั้น'), result: legs.length > 1 ? outcomes.TP1_ONLY : null },
    { key: 'FULL_SL', tone: 'sl', label: text('Stop Loss', 'ถึงจุดตัดขาดทุน'), result: outcomes.FULL_SL },
  ] as const;

  const ladder = [
    { label: 'SL', index: -1, ...calc.sl, pnlUsd: outcomes.FULL_SL.pnlUsd, rr: outcomes.FULL_SL.rr },
    ...legs.map((leg, index) => ({ label: 'TP' + (index + 1), index, ...leg })),
  ];
  const distanceLabel = config.distanceUnit === 'POINTS' ? text('Points', 'ระยะ (จุด)') : text('Price distance', 'ระยะราคา');
  const exactPriceLabel = text('Exact price', 'ราคาที่ระบุ');

  return (
    <section id="calculator-root">
      <div className="card">
        <div className="card-header calc-card-heading">
          <h2 className="card-title desk-icon-title"><Calculator size={16} aria-hidden="true" />{text('Trade Calculator', 'เครื่องคำนวณแผนเทรด')}</h2>
          <div className="calc-heading-actions">
            <div className="calc-mode-pills" role="group" aria-label={text('Calculation mode', 'โหมดคำนวณ')}>
              <button type="button" className={'btn xs' + (!manual ? ' primary' : '')} aria-pressed={!manual} onClick={() => onUpdateMode('GHR_PRESET')}>
                {text('GHR v3.2', 'GHR v3.2')}
              </button>
              <button type="button" className={'btn xs' + (manual ? ' primary' : '')} aria-pressed={manual} onClick={() => onUpdateMode('MANUAL')}>
                {text('Custom / Manual', 'คำนวณแบบมือ')}
              </button>
            </div>
            <button type="button" className="btn xs calc-copy-btn" disabled={!calc.isValid} onClick={handleCopyTicket}>
              <Copy size={12} aria-hidden="true" />
              <span>{text('Copy MT5', 'คัดลอก MT5')}</span>
            </button>
          </div>
        </div>

        {manual && (
          <div className="calc-config">
            <div className={'calc-fields calc-manual-controls' + (byLot ? ' has-lot-basis' : '')}>
              <label className="calc-field">
                <span>{text('Instrument', 'สินทรัพย์')}</span>
                <select value={config.instrument} onChange={(event) => patchConfig({ instrument: event.target.value as CalculatorInstrument })}>
                  {INSTRUMENTS.map((instrument) => <option key={instrument}>{instrument}</option>)}
                  <option value="CUSTOM">{text('Custom contract', 'กำหนดเอง')}</option>
                </select>
              </label>
              <label className="calc-field">
                <span>{text('Sizing', 'กำหนดขนาด')}</span>
                <select value={config.sizing} onChange={(event) => patchConfig({ sizing: event.target.value as ManualCalculatorConfig['sizing'] })}>
                  <option value="BY_RISK">{text('By Risk ($)', 'ตามความเสี่ยง ($)')}</option>
                  <option value="BY_LOT">{text('By Manual Lot', 'กำหนดล็อตเอง')}</option>
                </select>
              </label>
              {byLot && (
                <label className="calc-field">
                  <span>{text('Lot basis', 'ขนาดล็อต')}</span>
                  <select value={config.lotBasis} onChange={(event) => patchConfig({ lotBasis: event.target.value as ManualCalculatorConfig['lotBasis'] })}>
                    <option value="TOTAL">{text('Total', 'ขนาดรวม')}</option>
                    <option value="PER_LEG">{text('Per leg', 'ต่อไม้')}</option>
                  </select>
                </label>
              )}
              <label className="calc-field">
                <span>{text('TP legs', 'ไม้ TP')}</span>
                <select value={config.legCount} onChange={(event) => patchConfig({ legCount: Number(event.target.value) as ManualCalculatorConfig['legCount'] })}>
                  {[1, 2, 3].map((n) => <option value={n} key={n}>{text(n + ' TP', n + ' เป้า')}</option>)}
                </select>
              </label>
            </div>

            {config.instrument === 'CUSTOM' ? (
              <div className="calc-fields calc-contract-fields">
                <label className="calc-field">
                  <span>{text('USD / 1.00 / lot', 'USD / 1.00 / ล็อต')}</span>
                  <DeskNumberInput value={contract.usdPerPriceMove} onValue={(usdPerPriceMove) => patchContract({ usdPerPriceMove })} />
                </label>
                <label className="calc-field">
                  <span>{text('Pts / 1.00', 'จุด / 1.00')}</span>
                  <DeskNumberInput value={contract.pointsPerPrice} onValue={(pointsPerPrice) => patchContract({ pointsPerPrice })} />
                </label>
                <label className="calc-field">
                  <span>{text('Decimals', 'ทศนิยม')}</span>
                  <select value={contract.priceDecimals} onChange={(event) => patchContract({ priceDecimals: Number(event.target.value) as CalculatorContract['priceDecimals'] })}>
                    {[2, 3, 4, 5].map((digits) => <option key={digits}>{digits}</option>)}
                  </select>
                </label>
              </div>
            ) : (
              <div className="calc-ladder-header">
                <span className="calc-caption mono" title={text('Modeled contract values. Broker contract specifications can differ.', 'ค่าตามแบบจำลอง สเปกสัญญาของแต่ละโบรกเกอร์อาจต่างกัน')}>
                  {fmtUSD(contract.usdPerPriceMove)}/1.00/L · {contract.pointsPerPrice.toLocaleString('en-US')} pts
                  {config.instrument === 'USDJPY' && ' · USD@entry'}
                </span>
                <button type="button" className="btn xs" onClick={() => patchConfig({ instrument: 'CUSTOM', customContract: contract })}>
                  {text('Edit contract', 'ปรับค่าสัญญา')}
                </button>
              </div>
            )}
          </div>
        )}

        {!manual && (
          <div className="quick-gates">
            {QUICK_GATES.map(([key, en, th], index) => (
              <label className="gate-chk" key={key}>
                <input type="checkbox" checked={state.quickGates[key]} onChange={(event) => onToggleGate(key, event.target.checked)} />
                {index + 1}. {text(en, th)}
              </label>
            ))}
          </div>
        )}

        <div className="dir-grid" role="group" aria-label={text('Trade direction', 'ทิศทางของสถานะ')}>
          <button type="button" className={'dir-btn' + (state.calcDir === 'BUY' ? ' buy-active' : '')} aria-pressed={state.calcDir === 'BUY'} onClick={() => onUpdateDir('BUY')}>
            {text('Buy Limit', 'ซื้อแบบ Limit')}
          </button>
          <button type="button" className={'dir-btn' + (state.calcDir === 'SELL' ? ' sell-active' : '')} aria-pressed={state.calcDir === 'SELL'} onClick={() => onUpdateDir('SELL')}>
            {text('Sell Limit', 'ขายแบบ Limit')}
          </button>
        </div>

        <div className="calc-fields">
          <label className="calc-field">
            <span>{text('Entry price', 'ราคาเข้า')} ({calc.instrument === 'CUSTOM' ? text('Custom', 'กำหนดเอง') : calc.instrument})</span>
            <DeskNumberInput id="calc-entry-input" value={state.calcEntry > 0 ? state.calcEntry : null} decimals={contract.priceDecimals} emptyValue={0}
              onValue={(value) => onUpdateEntry(value > 0 ? String(value) : '', value)} />
          </label>
          <label className="calc-field">
            <span>{byLot ? (equalLots ? text('Lot per leg', 'ล็อตต่อไม้') : text('Total lot', 'ล็อตรวม')) : text('Risk per idea ($)', 'ความเสี่ยงต่อแผน ($)')}</span>
            <DeskNumberInput id="calc-risk-custom-inp" value={byLot ? config.manualLot : state.calcRisk}
              onValue={(value) => {
                if (byLot) patchConfig({ manualLot: value });
                else onUpdateRisk(value, !manual);
              }} />
          </label>
        </div>

        {!manual && (
          <div className="calc-mode-strip" role="group" aria-label={text('GHR risk presets', 'ค่าความเสี่ยงมาตรฐาน GHR')}>
            {PRESET_RISKS.map((risk) => (
              <button key={risk} type="button" className={'btn xs' + (risk === calc.risk ? ' primary' : '')}
                aria-pressed={risk === calc.risk} onClick={() => onUpdateRisk(risk)}>
                {'$' + risk}
              </button>
            ))}
          </div>
        )}

        <section className="calc-ladder price-ladder" aria-labelledby="calc-ladder-title">
          <div className="calc-ladder-header">
            <h3 id="calc-ladder-title">{text('Levels and results', 'ระดับราคาและผลคำนวณ')}</h3>
            <label>
              <span className="calc-caption">{text('Distance unit', 'หน่วยระยะ')}</span>
              <select aria-label={text('Distance unit', 'หน่วยระยะ')} value={config.distanceUnit}
                onChange={(event) => patchConfig({ distanceUnit: event.target.value as ManualCalculatorConfig['distanceUnit'] })}>
                <option value="POINTS">{text('Points', 'จุด')}</option>
                <option value="PRICE_DISTANCE">{text('Price', 'ราคา')}</option>
              </select>
            </label>
          </div>
          <div className="calc-ladder-row calc-ladder-columns" aria-hidden="true">
            <span>{text('Level', 'ระดับราคา')}</span>
            <span>{distanceLabel}</span>
            <span>{exactPriceLabel}</span>
            <span>{text('PnL / R', 'กำไรขาดทุน / R')}</span>
          </div>
          {ladder.map((level) => {
            const stop = level.index === -1;
            const leg = stop ? null : legs[level.index];
            const distance = config.distanceUnit === 'POINTS' ? level.points : level.priceDistance;
            return (
              <div className="calc-ladder-row" key={level.label} data-level={level.label}>
                <div className="calc-ladder-name">
                  <strong>{level.label}</strong>
                  {leg && <small className="mono">{formatCalculatorLot(leg.lot)} L</small>}
                </div>
                <DeskNumberInput value={Number.isFinite(distance) ? distance : null}
                  aria-label={level.label + ' · ' + distanceLabel}
                  onValue={(value) => patchLevel(level.index, { unit: config.distanceUnit, value })} />
                <div className="calc-exact-field">
                  <DeskNumberInput value={level.price > 0 && Number.isFinite(level.price) ? level.price : null} decimals={contract.priceDecimals}
                    aria-label={level.label + ' · ' + exactPriceLabel}
                    onValue={(value) => patchLevel(level.index, { unit: 'EXACT_PRICE', value })} />
                  <button type="button" className="btn xs calc-copy-level"
                    aria-label={text('Copy ' + level.label, 'คัดลอก ' + level.label)}
                    title={text('Copy ' + level.label, 'คัดลอก ' + level.label)}
                    disabled={!calc.isValid}
                    onClick={() => onCopyText(price(level.price), level.label)}>
                    <Copy size={12} aria-hidden="true" />
                  </button>
                </div>
                <div className={'mono calc-ladder-pnl ' + (stop ? 'calc-loss' : 'calc-gain')}>
                  <strong>{calc.isValid ? fmtUSD(level.pnlUsd, true) : '—'}</strong>
                  <small>{calc.isValid ? rr(level.rr) : '—'}</small>
                </div>
              </div>
            );
          })}
        </section>

        {manual && (
          <div className="calc-weights-inline" aria-label={text('Leg weights', 'น้ำหนักการแบ่งไม้')} role="group">
            <span
              className="calc-weights-label"
              title={text('Set each leg’s share or choose Equal Split above.', 'ปรับสัดส่วนแต่ละไม้ หรือเลือก Equal Split ด้านบน')}
            >
              {text('Leg weights:', 'สัดส่วนไม้:')}
            </span>
            {legs.map((leg, index) => (
              <label className="calc-weight-chip" key={index}>
                <span className="mono">{'TP' + (index + 1)} {leg.sharePct.toFixed(0)}%</span>
                <DeskNumberInput
                  value={equalLots || legs.length === 1 ? leg.sharePct : config.weights[index]}
                  decimals={equalLots ? 1 : undefined}
                  disabled={equalLots || legs.length === 1}
                  onValue={(value) => {
                    const weights = [...config.weights] as ManualCalculatorConfig['weights'];
                    weights[index] = value;
                    patchConfig({ weights });
                  }} />
              </label>
            ))}
            <label className="calc-check" title={text('After TP2, the remaining leg closes at TP1 in the lock scenario.', 'หลังถึง TP2 ไม้ที่เหลือจะปิดที่ราคา TP1 ในกรณีล็อกกำไร')}>
              <input type="checkbox" checked={config.trailingLock && legs.length === 3} disabled={legs.length !== 3}
                onChange={(event) => patchConfig({ trailingLock: event.target.checked })} />
              {text('TP2 Lock', 'ล็อก TP2')}
            </label>
          </div>
        )}

        {calc.isValid && calc.legs.length >= 3 && (
          <BlueprintLadder lang={lang} distances={{
            slPoints: calc.sl.points,
            tp1Points: legs[0].points,
            tp2Points: legs[1].points,
            tp3Points: legs[2].points,
          }} />
        )}

        <div className="fx-calc-summary-strip mono">
          <span>{text('Total lot', 'ล็อตรวม')} <strong>{calc.isValid ? formatCalculatorLot(calc.totalLot) : '—'}</strong></span>
          <span>{text('Blended R:R', 'R:R รวม')} <strong>{calc.isValid ? '1 : ' + outcomes.FULL_SWEEP.rr.toFixed(2) : '—'}</strong></span>
          <span>{text('Full Sweep', 'ครบทุกเป้า')} <strong>{calc.isValid ? fmtUSD(outcomes.FULL_SWEEP.pnlUsd, true) : '—'}</strong></span>
          {outcomes.TRAILING_LOCK && calc.isValid && (
            <span>{text('TP2 lock price', 'ราคาล็อกหลังถึง TP2')} <strong>{price(legs[0].price)}</strong></span>
          )}
        </div>
        {calc.validation && (
          <div className="calc-caption" role="status">
            {calc.validation === 'ENTRY'
              ? text('Enter a positive entry price.', 'กรอกราคาเข้าที่มากกว่าศูนย์')
              : calc.validation === 'LEVELS'
                ? text('SL must be on the loss side of entry. Each TP must be farther from entry than the last.', 'SL ต้องอยู่ด้านขาดทุน และราคา TP ต้องห่างจากราคาเข้ามากขึ้นตามลำดับ')
                : text('Use positive sizing, contract values and weights for every active leg.', 'ขนาดสถานะ ค่าสัญญา และน้ำหนักของทุกไม้ที่ใช้ต้องมากกว่าศูนย์')}
          </div>
        )}

        <div className="calc-journal-footer">
          <div className="calc-journal-head">
            <strong id="calc-outcomes-title">{text('Record outcome in Trade Journal', 'บันทึกผลลงสมุดเทรด')} · {activePortName}</strong>
            <input id="calc-note-input" type="text" aria-label={text('Trade note', 'บันทึกการเทรด')}
              placeholder={text('Short note', 'บันทึกสั้น ๆ')} value={state.calcNote} onChange={(event) => onUpdateNote(event.target.value)} />
          </div>

          {pendingOutcome ? (
            <div className="fx-guardrail-bar" role="alert">
              <div>{warnings} · {text('Record this outcome anyway?', 'ต้องการบันทึกผลนี้หรือไม่?')}</div>
              <div className="calc-mode-strip">
                <button type="button" className="btn xs rose" disabled={!calc.isValid}
                  onClick={() => { onRecordTrade(pendingOutcome); setPendingOutcome(null); }}>
                  {text('Confirm recording', 'ยืนยันบันทึก')}
                </button>
                <button type="button" className="btn xs" onClick={() => setPendingOutcome(null)}>{text('Cancel', 'ยกเลิก')}</button>
              </div>
            </div>
          ) : warnings && <div className="calc-caption">{warnings}</div>}

          <div className="save-grid" role="group" aria-labelledby="calc-outcomes-title">
            {outcomeButtons.map(({ key, tone, label, result }) => (
              <button key={key} type="button" className={'save-btn ' + tone} disabled={!calc.isValid || !result}
                title={result
                  ? text('Points are the sum of signed leg distances.', 'จำนวนจุดคือผลรวมระยะของแต่ละไม้ตามเครื่องหมายกำไรหรือขาดทุน')
                  : key === 'TRAILING_LOCK'
                    ? text('Requires three legs and an enabled TP2 lock.', 'ต้องใช้สามไม้และเปิดล็อกกำไรที่ TP2')
                    : text('For one leg, TP1 is the full outcome.', 'เมื่อมีไม้เดียว การถึง TP1 เท่ากับครบทุกเป้า')}
                onClick={() => {
                  if (guardrails.isCooldownActive || guardrails.isDailyCapReached) setPendingOutcome(key);
                  else onRecordTrade(key);
                }}>
                <strong>{label}</strong>
                <span className={'mono sensitive-val ' + (result && result.pnlUsd < 0 ? 'calc-loss' : 'calc-gain')}>
                  {result && calc.isValid ? fmtUSD(result.pnlUsd, true) : '—'}
                </span>
                <small className="mono">{result && calc.isValid ? points(result.totalPts) + ' · ' + rr(result.rr) : '—'}</small>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
});
