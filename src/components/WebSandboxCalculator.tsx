import { deskText, type DeskLanguage } from '../utils/deskI18n';
import { fmtUSD } from '../utils/ghrRules';
import {
  calculateWebSandboxRisk,
  WEB_SANDBOX_LIMITS,
  type WebSandboxPreset,
} from '../utils/webHandoff';

interface WebSandboxCalculatorProps {
  lang: DeskLanguage;
  preset: WebSandboxPreset;
  onChange: (preset: WebSandboxPreset) => void;
  onDismiss: () => void;
}

const NUMERIC_FIELDS = [
  { key: 'balance', en: 'Balance (USD)', th: 'ยอดคงเหลือ (USD)' },
  { key: 'riskPct', en: 'Risk (%)', th: 'ความเสี่ยง (%)' },
  { key: 'slPips', en: 'Stop distance (pips)', th: 'ระยะ Stop Loss (pip)' },
  { key: 'dailyDd', en: 'Daily loss limit (%)', th: 'วงเงินขาดทุนรายวัน (%)' },
] as const;

const SYMBOLS: WebSandboxPreset['symbol'][] = ['XAUUSD', 'EURUSD', 'NAS100'];
const CONNECTION_LABELS = { xlsx: 'XLSX', cloud: 'Cloud API', ex5: 'MT5 Live Bridge' };

export function WebSandboxCalculator({ lang, preset, onChange, onDismiss }: WebSandboxCalculatorProps) {
  const t = (en: string, th: string) => deskText(lang, en, th);
  const result = calculateWebSandboxRisk(preset);

  return (
    <section className="web-sandbox-calculator" aria-labelledby="web-sandbox-title">
      <header>
        <div>
          <h2 id="web-sandbox-title">{t('Web sandbox calculator', 'เครื่องคำนวณ Web Sandbox')}</h2>
          <p>{t('Session-only estimates use the Web sandbox’s pip values.', 'ตัวเลขประมาณการใช้มูลค่า pip จาก Web Sandbox สำหรับเซสชันนี้')}</p>
        </div>
        <button className="btn xs" type="button" onClick={onDismiss}>
          {t('Dismiss sandbox', 'ปิด Sandbox')}
        </button>
      </header>

      <div className="web-sandbox-fields">
        {NUMERIC_FIELDS.map(({ key, en, th }) => (
          <label key={key}>
            {t(en, th)}
            <input
              type="number"
              className="mono"
              {...WEB_SANDBOX_LIMITS[key]}
              value={Number.isNaN(preset[key]) ? '' : preset[key]}
              onChange={(event) => onChange({ ...preset, [key]: event.currentTarget.valueAsNumber })}
            />
          </label>
        ))}
        <label>
          {t('Symbol', 'สัญลักษณ์')}
          <select
            value={preset.symbol}
            onChange={(event) => onChange({ ...preset, symbol: event.currentTarget.value as WebSandboxPreset['symbol'] })}
          >
            {SYMBOLS.map((symbol) => <option key={symbol}>{symbol}</option>)}
          </select>
        </label>
        <label>
          {t('Account mode', 'โหมดบัญชี')}
          <select
            value={preset.mode}
            onChange={(event) => onChange({
              ...preset,
              mode: event.currentTarget.value === 'personal' ? 'personal' : 'prop',
            })}
          >
            <option value="prop">{t('Prop evaluation', 'สอบกองทุน Prop')}</option>
            <option value="personal">{t('Personal capital', 'พอร์ตส่วนตัว')}</option>
          </select>
        </label>
      </div>

      {result ? (
        <dl className="web-sandbox-results">
          <div><dt>{t('Risk amount', 'จำนวนเงินที่เสี่ยง')}</dt><dd>{fmtUSD(result.riskUsd)}</dd></div>
          <div><dt>{t('Daily loss budget', 'วงเงินขาดทุนรายวัน')}</dt><dd>{fmtUSD(result.dailyLossUsd)}</dd></div>
          <div>
            <dt>{t('Modeled lots', 'ล็อตตามแบบจำลอง')}</dt>
            <dd>{result.modeledLots.toLocaleString(lang, { maximumFractionDigits: 5 })}</dd>
          </div>
        </dl>
      ) : <p>{t('Enter a value within range for each numeric field.', 'กรอกตัวเลขแต่ละช่องให้อยู่ในช่วงที่กำหนด')}</p>}

      {preset.connectedVia && (
        <p>{t('Web onboarding method', 'วิธีที่เลือกใน Web Onboarding')} · {CONNECTION_LABELS[preset.connectedVia]}</p>
      )}
    </section>
  );
}
