import React, { useId, useMemo, useRef, useState } from 'react';
import { ArrowRight, FileUp, FlaskConical, ScanLine } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AccountInfo, Mt5PositionRecord, Mt5RawReport, Mt5TimeOffsetSetting, TradeRecord } from '../types/ghr';
import { deskText, type DeskLanguage } from '../utils/deskI18n';
import { formatPilotAmount } from '../utils/fundedNextPilot';
import { fmtUSD } from '../utils/ghrRules';
import { findMatchingPropFirm, PROP_FIRM_CATALOG } from '../utils/propFirmCatalog';
import {
  analyzeStatementAutopsy,
  analyzeTradeRecordsAutopsy,
  AUTOPSY_CHALLENGE_MODEL,
  buildSampleBrokenChallengePositions,
  type AutopsySession,
} from '../utils/statementAutopsy';

interface PropAutopsyCardProps {
  lang: DeskLanguage;
  account?: AccountInfo;
  report?: Mt5RawReport;
  journal: readonly TradeRecord[];
  mt5TimeOffset?: Mt5TimeOffsetSetting;
  privacyMasked?: boolean;
  onApplyGuardrailsToPlan?: () => void;
}

interface LocalStatement {
  kind: 'sample' | 'file';
  initialBalance: number;
  firmId?: string;
  currency: string;
  positions: Mt5PositionRecord[];
}

const SESSION_NAMES: Record<AutopsySession, [string, string]> = {
  ASIA: ['Asia', 'เอเชีย'],
  LONDON: ['London', 'ลอนดอน'],
  NEW_YORK: ['New York', 'นิวยอร์ก'],
};

const COMPACT_NUMBER_FORMATTERS: Record<DeskLanguage, Intl.NumberFormat> = {
  en: new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }),
  th: new Intl.NumberFormat('th-TH', { notation: 'compact', maximumFractionDigits: 2 }),
};

export const PropAutopsyCard = React.memo(function PropAutopsyCard({ lang, account, report, journal, mt5TimeOffset, privacyMasked, onApplyGuardrailsToPlan }: PropAutopsyCardProps) {
  const titleId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const importRequest = useRef(0);
  const [localStatement, setLocalStatement] = useState<LocalStatement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [importStatus, setImportStatus] = useState<'READING' | 'TYPE' | 'EMPTY' | 'FAILED' | null>(null);
  const t = (en: string, th: string) => deskText(lang, en, th);
  const accountFirmId = useMemo(
    () =>
      account?.syncProvider === 'FUNDEDNEXT_MCP'
        ? 'fundednext'
        : findMatchingPropFirm(account?.name, account?.brokerName, account?.brokerServer)?.id,
    [account?.syncProvider, account?.name, account?.brokerName, account?.brokerServer]
  );
  const firmId = localStatement ? localStatement.firmId : accountFirmId;
  const firmName = useMemo(() => PROP_FIRM_CATALOG.find((firm) => firm.id === firmId)?.shortName, [firmId]);
  const initialBalance = localStatement?.initialBalance ?? account?.initial ?? 0;
  const positions = localStatement?.positions ?? report?.positions;
  const currency = (localStatement?.currency ?? report?.meta.currency) || 'USD';
  const result = useMemo(() => positions?.length
    ? analyzeStatementAutopsy(positions, initialBalance, firmId)
    : analyzeTradeRecordsAutopsy(journal, initialBalance, firmId), [positions, journal, initialBalance, firmId]);
  const count = result.equityCurve.length - 1;
  const masked = privacyMasked && localStatement?.kind !== 'sample';
  const money = (value: number, signed = false) => currency === 'USD' ? fmtUSD(value, signed) : formatPilotAmount(value, currency, signed);
  const pct = (value: number) => `${value.toFixed(1)}%`;
  const sessionName = (session: AutopsySession) => t(...SESSION_NAMES[session]);
  const worstSession = result.worstSession ? result.sessions[result.worstSession] : null;
  const source = localStatement?.kind === 'sample'
    ? t('Sample challenge', 'พอร์ตสอบตัวอย่าง')
    : localStatement?.kind === 'file'
      ? t('Uploaded statement', 'รายงานที่อัปโหลด')
      : positions?.length ? t('Active account positions', 'รายการเทรดของพอร์ตที่เลือก') : t('Active account journal', 'สมุดบันทึกของพอร์ตที่เลือก');
  const actualCurve = t('Actual Curve', 'เส้นพอร์ตจริง');
  const disciplinedCurve = t('15-Min Cooldown & DD Guard', 'พัก 15 นาทีและคุม Drawdown');
  const { runs, targetPct, dailyLossLimitPct, overallLossLimitPct, closeCallThresholdPct } = AUTOPSY_CHALLENGE_MODEL;
  const compactNumber = COMPACT_NUMBER_FORMATTERS[lang];

  async function loadFile(file: File) {
    const request = ++importRequest.current;
    if (!/\.xlsx$/i.test(file.name)) {
      setImportStatus('TYPE');
      return;
    }
    setImportStatus('READING');
    try {
      const [{ parseMt5SpreadsheetBuffer }, buffer] = await Promise.all([import('../utils/mt5Parser'), file.arrayBuffer()]);
      if (importRequest.current !== request) return;
      const { meta, positions: uploaded } = parseMt5SpreadsheetBuffer(buffer, file.name, mt5TimeOffset);
      if (!uploaded.length) {
        setImportStatus('EMPTY');
        return;
      }
      setLocalStatement({
        kind: 'file',
        positions: uploaded,
        initialBalance: meta.initialDeposit,
        currency: meta.currency,
        firmId: findMatchingPropFirm(undefined, meta.broker)?.id ?? (meta.login && meta.login === account?.login ? accountFirmId : undefined),
      });
      setImportStatus(null);
    } catch {
      if (importRequest.current === request) setImportStatus('FAILED');
    }
  }

  function chooseStatement(statement: LocalStatement | null) {
    importRequest.current++;
    setImportStatus(null);
    setLocalStatement(statement);
  }

  const importMessages = {
    READING: t('Reading statement…', 'กำลังอ่านรายงาน…'),
    TYPE: t('Choose an MT5 .xlsx statement.', 'โปรดเลือกไฟล์รายงาน MT5 นามสกุล .xlsx'),
    EMPTY: t('No positions were found in this statement.', 'ไม่พบรายการเทรดในรายงานนี้'),
    FAILED: t('Could not read the statement. Export a new .xlsx from MT5 and try again.', 'อ่านรายงานไม่ได้ โปรดส่งออกไฟล์ .xlsx จาก MT5 แล้วลองอีกครั้ง'),
  };

  return (
    <section className="card prop-autopsy" aria-labelledby={titleId}>
      <header className="autopsy-header">
        <div>
          <h2 className="card-title" id={titleId}><ScanLine size={18} aria-hidden="true" />{t('Challenge Autopsy', 'วิเคราะห์พอร์ตสอบย้อนหลัง')}</h2>
          {count > 0 && <p className="autopsy-meta">
            {source}{masked ? '' : t(` · ${count} closed trades`, ` · ปิดแล้ว ${count} รายการ`)}{firmName && ` · ${firmName}`}
          </p>}
        </div>
        <div className="autopsy-actions">
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void loadFile(file);
            }}
          />
          <button
            className="btn sm autopsy-drop"
            type="button"
            data-dragging={dragging}
            onClick={() => fileInput.current?.click()}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes('Files')) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files[0];
              if (file) void loadFile(file);
            }}
          >
            <FileUp size={14} aria-hidden="true" />{t('Drop or choose MT5 .xlsx', 'ลากหรือเลือกไฟล์ MT5 .xlsx')}
          </button>
          <button className="btn sm" type="button" onClick={() => chooseStatement({ kind: 'sample', currency: 'USD', ...buildSampleBrokenChallengePositions() })}>
            <FlaskConical size={14} aria-hidden="true" />{t('Load Sample Challenge', 'ดูตัวอย่างพอร์ตที่มีอาการ Tilt')}
          </button>
          {localStatement && <button className="btn sm" type="button" onClick={() => chooseStatement(null)}>{t('Use active account', 'กลับไปใช้พอร์ตที่เลือก')}</button>}
        </div>
      </header>

      {importStatus && <p className="autopsy-import-status" role={importStatus === 'READING' ? 'status' : 'alert'}>{importMessages[importStatus]}</p>}
      {count === 0 ? (
        <p className="autopsy-empty">{t('Load an MT5 statement or the sample to see how entries after losses changed the equity curve.', 'โหลดรายงาน MT5 หรือพอร์ตตัวอย่างเพื่อดูว่าการเข้าเทรดหลังขาดทุนส่งผลต่อมูลค่าพอร์ตอย่างไร')}</p>
      ) : masked ? (
        <p className="autopsy-empty">{t('Account figures are hidden in Privacy Mode.', 'ข้อมูลตัวเลขของพอร์ตถูกซ่อนในโหมดความเป็นส่วนตัว')}</p>
      ) : (
        <>
          <dl className="autopsy-kpis">
            <div>
              <dt>{t('Actual PnL', 'กำไร/ขาดทุนจริง')}</dt>
              <dd className="autopsy-value mono">{money(result.actualNetPnlUsd, true)}</dd>
            </div>
            <div data-emphasis="true">
              <dt>{t('Disciplined Counterfactual PnL', 'กำไร/ขาดทุนจำลองเมื่อคุมวินัย')}</dt>
              <dd className="autopsy-value mono">{money(result.counterfactualNetPnlUsd, true)}</dd>
            </div>
            <div>
              <dt>{t('Preventable Tilt Leak', 'ยอดขาดทุนจาก Tilt ที่เลี่ยงได้')}</dt>
              <dd className="autopsy-value mono">{money(result.preventableTiltLossUsd)}</dd>
              <dd>{t(`${result.tiltTradeCount} entries flagged`, `พบ ${result.tiltTradeCount} รายการเข้าเกณฑ์ Tilt`)}</dd>
            </div>
            <div>
              <dt>{t('Best-Day Consistency', 'สัดส่วนกำไรวันสูงสุด')}</dt>
              <dd className="autopsy-value mono">{result.bestDaySharePct === null ? '—' : pct(result.bestDaySharePct)}</dd>
              <dd>{result.consistencyCapPct === null ? t('No modeled cap', 'ไม่ได้กำหนดเพดานในแบบจำลอง') : result.consistencyBreached
                ? t(`Above the ${result.consistencyCapPct}% cap`, `เกินเพดาน ${result.consistencyCapPct}%`)
                : t(`${result.consistencyCapPct}% modeled cap`, `เพดานจำลอง ${result.consistencyCapPct}%`)}</dd>
            </div>
            <div>
              <dt>{t('Worst Session', 'ช่วงตลาดที่ผลแย่ที่สุด')}</dt>
              <dd className="autopsy-value">{result.worstSession ? sessionName(result.worstSession) : '—'}</dd>
              {worstSession && <dd className="mono">{money(worstSession.netPnlUsd, true)}</dd>}
            </div>
            <div>
              <dt>{t('Monte Carlo Ruin Risk · 1× / 0.5×', 'โอกาสชนเพดานขาดทุนจาก Monte Carlo · 1× / 0.5×')}</dt>
              <dd className="autopsy-value mono">{initialBalance > 0 ? `${pct(result.monteCarlo.currentRuinPct)} / ${pct(result.monteCarlo.reducedRiskRuinPct)}` : '—'}</dd>
              {initialBalance > 0 && <dd>{t('Target reached', 'ถึงเป้าในแบบจำลอง')} <span className="mono">{pct(result.monteCarlo.currentPassRatePct)} / {pct(result.monteCarlo.reducedRiskPassRatePct)}</span></dd>}
            </div>
          </dl>

          <div className="autopsy-detail">
            <figure className="autopsy-equity">
              <figcaption>
                <strong>{t(`Equity after each close (${currency})`, `มูลค่าพอร์ตหลังปิดแต่ละรายการ (${currency})`)}</strong>
                <span className="autopsy-legend">
                  <span data-series="actual">{actualCurve}</span>
                  <span>{disciplinedCurve}</span>
                </span>
              </figcaption>
              <div className="autopsy-chart">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <LineChart data={result.equityCurve} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--border-color)" />
                    <XAxis dataKey="step" minTickGap={20} tickLine={false} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                    <YAxis domain={['auto', 'auto']} width={50} axisLine={false} tickLine={false} tickFormatter={(value: number) => compactNumber.format(value)} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                    <Tooltip
                      contentStyle={{ background: 'var(--bg-surface-solid)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 12, color: 'var(--text-primary)' }}
                      labelFormatter={(step) => {
                        const point = result.equityCurve[Number(step)];
                        if (!point || point.step === 0) return t('Starting balance', 'ทุนเริ่มต้น');
                        return `${point.label} ${t('BKK', 'เวลาไทย')}${point.isTilt ? t(' · Tilt flagged', ' · เข้าเกณฑ์ Tilt') : ''}`;
                      }}
                      formatter={(value, name) => [money(Number(value)), name]}
                    />
                    <Line type="linear" dataKey="actualEquity" name={actualCurve} stroke="var(--text-primary)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                    <Line type="linear" dataKey="disciplinedEquity" name={disciplinedCurve} stroke="var(--accent-ink)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </figure>

            <div className="autopsy-sessions">
              <table className="autopsy-session-table">
                <caption>{t('Session breakdown · Bangkok close time', 'ผลแยกตามช่วงตลาด · อิงเวลาปิดในไทย')}</caption>
                <thead>
                  <tr><th scope="col">{t('Session', 'ช่วงตลาด')}</th><th scope="col">{t('Trades', 'จำนวน')}</th><th scope="col">{t('Win %', 'ชนะ %')}</th><th scope="col">{t('Net PnL', 'ผลสุทธิ')}</th><th scope="col">{t('Avg PnL', 'ผลเฉลี่ย')}</th></tr>
                </thead>
                <tbody>
                  {(Object.keys(SESSION_NAMES) as AutopsySession[]).map((session) => {
                    const { count, winRatePct, netPnlUsd, expectancyUsd } = result.sessions[session];
                    return (
                      <tr key={session} data-worst={session === result.worstSession}>
                        <th scope="row">{sessionName(session)}</th>
                        <td className="mono">{count}</td>
                        <td className="mono">{count ? pct(winRatePct) : '—'}</td>
                        <td className="mono">{count ? money(netPnlUsd, true) : '—'}</td>
                        <td className="mono">{count ? money(expectancyUsd, true) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <dl className="autopsy-dd">
                <div>
                  <dt>{t('Worst realized daily drawdown', 'ขาดทุนระหว่างวันสูงสุดจากรายการที่ปิดแล้ว')}</dt>
                  <dd className="mono">{money(result.worstDailyLossUsd)}{initialBalance > 0 && ` · ${pct(result.worstDailyLossPct)}`}</dd>
                </div>
                <div>
                  <dt>{t('Days near the loss limit', 'จำนวนวันที่เข้าใกล้เพดานขาดทุน')}</dt>
                  <dd className="mono">{initialBalance > 0 ? result.closeCallWarningCount : '—'}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="autopsy-footer">
            <details className="autopsy-method">
              <summary>{t('How the replay and simulation work', 'วิธีคำนวณผลย้อนหลังและแบบจำลอง')}</summary>
              <p>{t('The replay removes every flagged entry. Tilt leak totals the gross losses on those entries. A flag marks an entry within 15 minutes of a losing close or a first entry after a loss at 1.5× median lots or more.', 'เส้นจำลองตัดรายการที่เข้าเกณฑ์ Tilt ทั้งหมด ยอดขาดทุนจาก Tilt รวมเฉพาะรายการที่ขาดทุน ระบบจับรายการที่เปิดภายใน 15 นาทีหลังปิดขาดทุน หรือรายการแรกหลังขาดทุนที่ใช้ล็อตอย่างน้อย 1.5 เท่าของค่ามัธยฐาน')}</p>
              {!positions?.length && <p>{t('Journal replay uses the recorded time for both the open and close.', 'การจำลองจากสมุดบันทึกใช้เวลาที่บันทึกไว้แทนทั้งเวลาเปิดและเวลาปิด')}</p>}
              <p>{t(`Daily drawdown uses realized PnL since Bangkok midnight. A close call uses at least ${closeCallThresholdPct}% of the modeled ${dailyLossLimitPct}% daily limit without reaching it.`, `Drawdown รายวันคิดจากกำไร/ขาดทุนที่ปิดแล้วนับจากเที่ยงคืนเวลาไทย ระบบนับวันที่ใช้วงเงินขาดทุนอย่างน้อย ${closeCallThresholdPct}% แต่ยังไม่ชนเพดานจำลองรายวันที่ ${dailyLossLimitPct}%`)}</p>
            </details>
            <p>{t(`${runs.toLocaleString('en-US')}-run statistical bootstrap resamples trade PnL over the observed day lengths. Model limits are +${targetPct}% target, −${dailyLossLimitPct}% daily and −${overallLossLimitPct}% overall from a starting balance of ${money(initialBalance)}.`, `แบบจำลองทางสถิติ Bootstrap ${runs.toLocaleString('th-TH')} รอบ สุ่มจากกำไร/ขาดทุนจริงตามจำนวนรายการต่อวันที่พบ ตั้งเป้า +${targetPct}% และเพดานขาดทุนรายวัน −${dailyLossLimitPct}% กับขาดทุนรวม −${overallLossLimitPct}% จากทุนเริ่มต้น ${money(initialBalance)}`)}</p>
            {onApplyGuardrailsToPlan && <button className="btn sm primary" type="button" onClick={() => onApplyGuardrailsToPlan?.()}>{t('Apply guardrails to Plan', 'เปิดแผนพร้อมเกณฑ์คุมความเสี่ยง')} <ArrowRight size={14} aria-hidden="true" /></button>}
          </div>
        </>
      )}
    </section>
  );
});
