import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { ArrowRightLeft, Copy, RefreshCw } from 'lucide-react';
import { buildDatabentoRequestHeaders, isDatabentoConnected, type ProviderConnectionState } from '../utils/aiProviderConfig';
import { useByokCredentials } from '../utils/byokStorage';
import {
  COMEX_TIMEFRAMES,
  type ComexBridgeExports, type ComexBridgeSnapshot, type ComexTimeframe, type DatabentoStatus,
} from '../utils/comexBridgeEngine';
import { deskText, type DeskLanguage } from '../utils/deskI18n';
import { AiAndDataKeysDialogButton } from './AiAndDataKeysCard';

interface ComexBridgePanelProps {
  lang: DeskLanguage;
  uid: string | null;
  onCopyText: (text: string, label: string) => void;
}

const EXPORT_TABS: { key: keyof ComexBridgeExports; en: string; th: string }[] = [
  { key: 'mql5', en: 'MQL5 Indicator', th: 'อินดิเคเตอร์ MQL5' },
  { key: 'json', en: 'JSON', th: 'JSON' },
  { key: 'pineScript', en: 'PineScript v5', th: 'PineScript v5' },
  { key: 'python', en: 'Python Databento', th: 'Python Databento' },
];

const DATABENTO_TH: Record<DatabentoStatus, string> = {
  public: '',
  used: 'แท่ง GC มาจากข้อมูลย้อนหลังของ Databento ด้วยคีย์ของคุณ ส่วนราคาสปอตมาจากอีกแหล่งข้อมูล',
  'invalid-key': 'รูปแบบคีย์ Databento ไม่ถูกต้อง จึงใช้แท่ง GC=F จาก Yahoo Finance',
  'access-denied': 'Databento ปฏิเสธการเข้าถึงข้อมูลย้อนหลังของ GC จึงใช้แท่ง GC=F จาก Yahoo Finance',
  empty: 'Databento ไม่มีแท่ง GC ที่ใช้ได้ จึงใช้แท่ง GC=F จาก Yahoo Finance',
  timeout: 'Databento ตอบกลับไม่ทันเวลา จึงใช้แท่ง GC=F จาก Yahoo Finance',
  unavailable: 'Databento ไม่พร้อมใช้งาน จึงใช้แท่ง GC=F จาก Yahoo Finance',
};

type BridgeRequest = { timeframe: ComexTimeframe; headers: Record<string, string> };

export function ComexBridgePanel(props: ComexBridgePanelProps) {
  return <ScopedComexBridgePanel key={props.uid === null ? 'guest' : `user:${props.uid}`} {...props} />;
}

function ScopedComexBridgePanel({ lang, uid, onCopyText }: ComexBridgePanelProps) {
  const id = useId();
  const [timeframe, setTimeframe] = useState<ComexTimeframe>('15m');
  const [refresh, setRefresh] = useState(0);
  const [selectedTab, setSelectedTab] = useState(0);
  const byokCredentials = useByokCredentials(uid);
  const request = useMemo<BridgeRequest>(() => ({
    timeframe, headers: buildDatabentoRequestHeaders(byokCredentials.databentoKey),
  }), [timeframe, byokCredentials.databentoKey]);
  const [result, setResult] = useState<{
    request: BridgeRequest; refresh: number; snapshot: ComexBridgeSnapshot | null;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadBridge() {
      try {
        const response = await fetch(`/api/bridge/comex-gold?timeframe=${request.timeframe}&bins=24`, {
          headers: request.headers, cache: 'no-store', redirect: 'error', signal: controller.signal,
        });
        if (!response.ok) throw new Error('COMEX bridge unavailable');
        const snapshot = await response.json() as ComexBridgeSnapshot;
        if (!controller.signal.aborted) setResult({ request, refresh, snapshot });
      } catch {
        if (!controller.signal.aborted) setResult({ request, refresh, snapshot: null });
      }
    }
    void loadBridge();
    return () => controller.abort();
  }, [request, refresh]);

  const t = (en: string, th: string) => deskText(lang, en, th);
  const priceFormat = new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signedFormat = new Intl.NumberFormat(lang, { signDisplay: 'exceptZero', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const quantityFormat = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const shareFormat = new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 1 });
  const dateFormat = new Intl.DateTimeFormat(lang, { dateStyle: 'short', timeStyle: 'short' });
  const price = (value: number | null) => value === null ? '—' : priceFormat.format(value);
  const range = (low: number | null, high: number | null) => low === null || high === null ? '—' : `${price(low)} – ${price(high)}`;
  const current = result?.request === request ? result : null;
  const loading = current?.refresh !== refresh;
  const snapshot = current?.snapshot ?? null;
  const tab = EXPORT_TABS[selectedTab];
  const tabLabel = (item: typeof tab) => t(item.en, item.th);

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    switch (event.key) {
      case 'ArrowRight': next = (index + 1) % EXPORT_TABS.length; break;
      case 'ArrowLeft': next = (index + EXPORT_TABS.length - 1) % EXPORT_TABS.length; break;
      case 'Home': next = 0; break;
      case 'End': next = EXPORT_TABS.length - 1; break;
      default: return;
    }
    event.preventDefault();
    setSelectedTab(next);
    document.getElementById(`${id}-${EXPORT_TABS[next].key}`)?.focus();
  }

  const profile = snapshot?.profile;
  const maxVolume = profile?.bins.reduce((max, bin) => Math.max(max, bin.volume), 0) || 1;
  const databentoNote = snapshot && (lang === 'th' ? DATABENTO_TH[snapshot.databentoStatus] : snapshot.databentoNote);
  const hasDatabentoKey = isDatabentoConnected(byokCredentials.databentoKey);
  const databentoPillState: ProviderConnectionState = snapshot?.databentoUsed
    ? 'connected'
    : hasDatabentoKey
      ? (snapshot && snapshot.databentoStatus !== 'public' ? 'unavailable' : 'connected')
      : 'disconnected';
  const databentoPillLabel = databentoPillState === 'connected'
    ? t('Databento connected', 'Databento เชื่อมต่อแล้ว')
    : databentoPillState === 'unavailable'
      ? t('Databento fallback (public)', 'คีย์ Databento มีปัญหา · ใช้ข้อมูลสาธารณะ')
      : t('Databento not connected · Public feed', 'ยังไม่เชื่อม Databento · ใช้ข้อมูลสาธารณะ');

  return (
    <section className="card comex-bridge" aria-labelledby={`${id}-heading`}>
      <header className="comex-bridge-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <h2 id={`${id}-heading`} className="card-title desk-icon-title">
              <ArrowRightLeft size={17} aria-hidden="true" />
              {t('COMEX Gold ↔ XAU/USD', 'ทองคำ COMEX ↔ XAU/USD')}
            </h2>
            <span className="desk-conn-pill" data-state={databentoPillState}>
              <span className="desk-conn-dot" data-state={databentoPillState} aria-hidden="true" />
              {databentoPillLabel}
            </span>
          </div>
          {snapshot && <p className="comex-bridge-source">
            {snapshot.databentoUsed
              ? t(snapshot.dataSource, 'Databento GLBX.MDP3 (BYOK) + ราคาสปอต XAU')
              : t(snapshot.dataSource, 'Yahoo Finance GC=F + ราคาสปอต XAU')}
            {' · '}{t('Checked', 'ตรวจสอบเมื่อ')} <time dateTime={snapshot.fetchedAt}>{dateFormat.format(new Date(snapshot.fetchedAt))}</time>
          </p>}
        </div>
        <div className="comex-bridge-controls">
          <label className="comex-bridge-timeframe">
            {t('Timeframe', 'กรอบเวลา')}
            <select className="inp" value={timeframe} onChange={event => {
              const selected = COMEX_TIMEFRAMES.find(tf => tf === event.target.value);
              if (selected) setTimeframe(selected);
            }}>
              {COMEX_TIMEFRAMES.map(tf => <option key={tf} value={tf}>{tf}</option>)}
            </select>
          </label>
          <button type="button" className="btn xs" onClick={() => setRefresh(previous => previous + 1)} disabled={loading}>
            <RefreshCw size={13} aria-hidden="true" />{t('Refresh', 'รีเฟรช')}
          </button>
          <AiAndDataKeysDialogButton uid={uid} lang={lang} statusScope="databento" buttonLabel={t('Databento Key (BYOK)', 'คีย์ Databento (BYOK)')} />
        </div>
      </header>

      {loading && <p className="comex-bridge-status" role="status">{t('Loading market data…', 'กำลังโหลดข้อมูลตลาด…')}</p>}
      {!loading && !snapshot && <p className="comex-bridge-status" role="alert">
        {t('Market data is currently unavailable. Try refreshing.', 'ข้อมูลตลาดยังไม่พร้อมใช้งาน ลองรีเฟรชอีกครั้ง')}
      </p>}
      {snapshot && profile && <>
        {databentoNote && <p className="comex-bridge-status" role="status">{databentoNote}</p>}
        <dl className="comex-bridge-kpis">
          <div>
            <dt>{t('COMEX GC Futures', 'ฟิวเจอร์ส COMEX GC')}</dt>
            <dd className="mono">{price(snapshot.gcPrice)}</dd>
            {snapshot.gcCandleAt && <dd className="comex-bridge-kpi-note">
              {t('Bar start', 'เวลาเริ่มแท่ง')} <time dateTime={snapshot.gcCandleAt}>{dateFormat.format(new Date(snapshot.gcCandleAt))}</time>
            </dd>}
          </div>
          <div>
            <dt>{t('Spot XAU/USD', 'สปอต XAU/USD')}</dt>
            <dd className="mono">{price(snapshot.xauSpotPrice)}</dd>
          </div>
          <div>
            <dt>{t('Smoothed Basis (GC − XAU)', 'เบซิสปรับเรียบ (GC − XAU)')}</dt>
            <dd className="mono">{signedFormat.format(snapshot.smoothedBasis)}</dd>
            <dd className="comex-bridge-kpi-note">
              {snapshot.basisSampleCount > 1
                ? t(`EMA · ${snapshot.basisSampleCount} observations`, `EMA · ${snapshot.basisSampleCount} คู่ข้อมูล`)
                : t('Single observation', 'ข้อมูลหนึ่งคู่')}
              {' · '}{t('Raw', 'ค่าดิบ')} {signedFormat.format(snapshot.rawBasis)} ({signedFormat.format(snapshot.basisPct)}%)
            </dd>
          </div>
          <div>
            <dt>{t('Mapped POC (XAU)', 'POC ที่แปลงเป็น XAU')}</dt>
            <dd className="mono">{price(profile.pocXau)}</dd>
            <dd className="comex-bridge-kpi-note">GC {price(profile.pocGc)}</dd>
          </div>
          <div>
            <dt>{t('Value Area (VAL – VAH)', 'ช่วงมูลค่า (VAL – VAH)')}</dt>
            <dd className="mono">{range(profile.valXau, profile.vahXau)}</dd>
            <dd className="comex-bridge-kpi-note">GC {range(profile.valGc, profile.vahGc)}</dd>
          </div>
        </dl>

        <div className="comex-bridge-body">
          <section className="comex-bridge-profile" aria-labelledby={`${id}-profile`}>
            <div className="comex-bridge-subhead">
              <h3 id={`${id}-profile`}>{t('Volume Profile', 'โปรไฟล์ปริมาณซื้อขาย')}</h3>
              {profile.hasVolumeData && <small className="mono">
                {quantityFormat.format(profile.totalVolume)} {t('contracts', 'สัญญา')}
              </small>}
            </div>
            {profile.hasVolumeData ? <>
              <p className="comex-bridge-legend">
                <span data-level="poc">POC</span>
                <span data-level="area">{t('70% Value Area', 'ช่วงมูลค่า 70%')}</span>
                <span data-level="hvn">{t('HVN · Liquidity walls', 'HVN · โซนปริมาณสูง')}</span>
              </p>
              <div className="comex-bridge-ladder" tabIndex={0} role="region" aria-labelledby={`${id}-profile`}>
                <table className="mono">
                  <thead><tr>
                    <th scope="col">GC</th><th scope="col">XAU/USD</th>
                    <th scope="col">{t('Volume', 'ปริมาณ')}</th><th scope="col">%</th>
                  </tr></thead>
                  <tbody>
                    {profile.bins.slice().reverse().map(bin => {
                      const levels = [
                        bin.isPoc && 'POC',
                        bin.priceHigh === profile.vahGc && 'VAH',
                        bin.priceLow === profile.valGc && 'VAL',
                        bin.isHvn && 'HVN',
                      ].filter(Boolean).join(' · ');
                      return (
                        <tr key={bin.priceLow} data-poc={bin.isPoc} data-area={bin.isInValueArea} data-hvn={bin.isHvn}>
                          <td>{price(bin.midPrice)}</td>
                          <td>{price(bin.mappedXauPrice)}</td>
                          <td title={`${quantityFormat.format(bin.volume)} ${t('contracts', 'สัญญา')}`}>
                            <div className="comex-bridge-meter" aria-hidden="true">
                              <span style={{ inlineSize: `${bin.volume / maxVolume * 100}%` }} />
                            </div>
                            {levels && <span className="comex-bridge-level">{levels}</span>}
                          </td>
                          <td>{shareFormat.format(bin.volumePct / 100)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="comex-bridge-detail">
                {t('Bars show bin midpoints. Volume is estimated across each candle’s price range; VAL and VAH use bin edges.',
                  'แต่ละแถวแสดงราคากึ่งกลางช่วง ปริมาณเป็นค่าประมาณที่กระจายตามช่วงราคาของแท่ง ส่วน VAL และ VAH ใช้ขอบช่วงราคา')}
              </p>
            </> : <p className="comex-bridge-detail">{t('The selected bars contain no volume data.', 'แท่งในกรอบเวลานี้ไม่มีข้อมูลปริมาณซื้อขาย')}</p>}
          </section>

          <section className="comex-bridge-exports" aria-labelledby={`${id}-exports`}>
            <div className="comex-bridge-subhead">
              <h3 id={`${id}-exports`}>{t('Read-Only Exports', 'ส่งออกเพื่อการวิเคราะห์')}</h3>
              <button type="button" className="btn xs" onClick={() => onCopyText(snapshot.exports[tab.key], tabLabel(tab))}>
                <Copy size={13} aria-hidden="true" />{t('Copy', 'คัดลอก')}
              </button>
            </div>
            <div className="comex-bridge-tabs" role="tablist" aria-labelledby={`${id}-exports`}>
              {EXPORT_TABS.map((item, index) => <button key={item.key} type="button" role="tab"
                className="btn xs" id={`${id}-${item.key}`} aria-controls={`${id}-preview`}
                tabIndex={index === selectedTab ? 0 : -1} aria-selected={index === selectedTab}
                onClick={() => setSelectedTab(index)} onKeyDown={event => handleTabKey(event, index)}>
                {tabLabel(item)}
              </button>)}
            </div>
            <div id={`${id}-preview`} role="tabpanel" aria-labelledby={`${id}-${tab.key}`}>
              <pre className="mono" tabIndex={0}><code>{snapshot.exports[tab.key]}</code></pre>
            </div>
          </section>
        </div>
      </>}
      <footer className="comex-bridge-footer">
        {t('Read-only COMEX-to-Spot analytical levels · No trade signals or automated order execution',
          'ระดับราคา COMEX ที่แปลงเป็นสปอตเพื่อการวิเคราะห์เท่านั้น · ไม่มีสัญญาณซื้อขายหรือการส่งคำสั่งอัตโนมัติ')}
      </footer>
    </section>
  );
}
