import React from 'react';
import { DESK_I18N, deskText, type DeskLanguage } from '../utils/deskI18n';
import {
  canFallbackToUsdWorkspace,
  formatPilotAmount,
  PilotTelemetryView,
} from '../utils/fundedNextPilot';
import {
  GuardrailAlert,
  RealtimeAnalyticsSummary,
  RealtimeTelemetrySnapshot,
} from '../utils/realtimeGuardrails';

interface RealtimeTopTelemetryBarProps {
  telemetry: RealtimeTelemetrySnapshot;
  analytics: RealtimeAnalyticsSummary;
  alerts: GuardrailAlert[];
  floatingPnlUsd: number;
  liveOpenTradesCount?: number;
  pilotTelemetry?: PilotTelemetryView | null;
  onChangeFloatingPnl: (deltaOrReset: number | 'RESET') => void;
  showRightDock: boolean;
  onToggleRightDock: () => void;
  lang?: DeskLanguage;
  statusOnly?: boolean;
}

export const RealtimeTopTelemetryBar: React.FC<RealtimeTopTelemetryBarProps> = ({
  telemetry,
  analytics,
  alerts,
  liveOpenTradesCount = 0,
  pilotTelemetry,
  showRightDock,
  onToggleRightDock,
  lang = 'en',
  statusOnly = false,
}) => {
  const text = (en: string, th: string) => deskText(lang, en, th);
  const t = DESK_I18N[lang].telemetry;
  const ddColor =
    telemetry.status === 'CRITICAL'
      ? 'var(--rose)'
      : telemetry.status === 'CAUTION'
        ? 'var(--amber)'
        : 'var(--emerald)';

  const isLiveStream =
    telemetry.streamMode === 'WS_LIVE' ||
    telemetry.streamMode === 'SSE_LIVE' ||
    telemetry.streamMode === 'CLOUD_API';

  const streamLabel =
    telemetry.streamMode === 'WS_LIVE'
      ? text('WS LIVE', 'สดผ่าน WS')
      : telemetry.streamMode === 'SSE_LIVE'
        ? t.sseLive
        : telemetry.streamMode === 'CLOUD_API'
          ? t.cloudApi
          : telemetry.streamMode === 'MANUAL_XLSX'
            ? t.manualXlsx
            : t.offlineIdb;

  const streamTooltip =
    telemetry.streamMode === 'OFFLINE_IDB'
      ? t.syncTooltipOffline
      : isLiveStream
        ? t.syncTooltipLive
        : t.syncTooltipManual;

  const criticalOrWarnCount = alerts.length;

  return (
    <div
      className="tallynx-telemetry-strip"
      role="region"
      aria-label={text('Account monitoring', 'ติดตามข้อมูลพอร์ต')}
    >
      <div className="telemetry-tape" role="group" aria-label={statusOnly ? text('Data source', 'แหล่งข้อมูล') : text('Account metrics', 'ตัวเลขสำคัญของพอร์ต')}>
        <div
          className="telemetry-source"
          data-live={isLiveStream}
          title={streamTooltip}
        >
          <span className="telemetry-source-dot" aria-hidden="true" />
          <span>{streamLabel}</span>
          {isLiveStream && <span className="telemetry-source-mode">{text('READ-ONLY', 'อ่านอย่างเดียว')}</span>}
        </div>

        {!statusOnly && <div className="telemetry-readings">
        {pilotTelemetry !== undefined ? (() => {
          const allowUsdFallback = canFallbackToUsdWorkspace(pilotTelemetry?.currency);
          const pilotBalanceText =
            pilotTelemetry?.balance != null
              ? formatPilotAmount(pilotTelemetry.balance, pilotTelemetry.currency)
              : allowUsdFallback
                ? `$${telemetry.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : '—';
          const pilotEquityText =
            pilotTelemetry?.equity != null
              ? formatPilotAmount(pilotTelemetry.equity, pilotTelemetry.currency)
              : pilotTelemetry?.balance != null
                ? formatPilotAmount(pilotTelemetry.balance, pilotTelemetry.currency)
                : allowUsdFallback
                  ? `$${telemetry.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : '—';
          return (
            <div className="telemetry-group telemetry-account-metrics sensitive-val">
              <div className="telemetry-item">
                <span>{text('Balance', 'ยอดคงเหลือ')}</span>
                <strong className="mono">{pilotBalanceText}</strong>
              </div>
              <div className="telemetry-item">
                <span>{t.equity}</span>
                <strong className="mono">{pilotEquityText}</strong>
              </div>
              <div className="telemetry-item">
                <span>{t.floating}</span>
                <strong
                  className="mono"
                  style={{
                    color:
                      pilotTelemetry?.floatingPnl != null && Number(pilotTelemetry.floatingPnl) > 0
                        ? 'var(--emerald)'
                        : pilotTelemetry?.floatingPnl != null && Number(pilotTelemetry.floatingPnl) < 0
                          ? 'var(--rose)'
                          : 'var(--text-primary)',
                  }}
                >
                  {formatPilotAmount(pilotTelemetry?.floatingPnl, pilotTelemetry?.currency)}
                </strong>
              </div>
              <div className="telemetry-item">
                <span>{lang === 'en' ? 'Open' : 'ถืออยู่'}</span>
                <strong className="mono">{pilotTelemetry?.openPositions ? pilotTelemetry.openPositions.length : '—'}</strong>
              </div>
            </div>
          );
        })() : (
          <div className="telemetry-group telemetry-account-metrics sensitive-val">
            <div className="telemetry-item">
              <span>{t.equity}</span>
              <strong className="mono">
                ${telemetry.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
            </div>
            <div className="telemetry-item">
              <span>{t.floating}</span>
              <strong
                className="mono"
                style={{
                  color:
                    telemetry.floatingPnlUsd > 0
                      ? 'var(--emerald)'
                      : telemetry.floatingPnlUsd < 0
                        ? 'var(--rose)'
                        : 'var(--text-primary)',
                }}
              >
                {telemetry.floatingPnlUsd >= 0 ? '+' : '-'}$
                {Math.abs(telemetry.floatingPnlUsd).toFixed(2)}
              </strong>
            </div>
            {liveOpenTradesCount > 0 && (
              <div className="telemetry-item mono">
                {lang === 'en' ? `${liveOpenTradesCount} open` : `ถือ ${liveOpenTradesCount} ไม้`}
              </div>
            )}
          </div>
        )}

        {/* Daily Drawdown 5% Progress Meter */}
        {pilotTelemetry === undefined && <div
          className="telemetry-item telemetry-drawdown"
          title={text(
            `Daily drawdown used: $${telemetry.dailyDrawdownUsedUsd} / $${telemetry.dailyDrawdownLimitUsd} (5% daily cap)`,
            `ขาดทุนรายวันที่ใช้ไป: $${telemetry.dailyDrawdownUsedUsd} / $${telemetry.dailyDrawdownLimitUsd} (เพดาน 5% ต่อวัน)`
          )}
        >
          <span>{t.ddGuard}</span>
          <div className="telemetry-dd-track" aria-hidden="true">
            <div style={{ width: `${telemetry.dailyDrawdownUsedPct}%`, background: ddColor }} />
          </div>
          <strong className="mono" style={{ color: ddColor }}>
            {telemetry.dailyDrawdownUsedPct}%
          </strong>
        </div>}

        <div className="telemetry-group telemetry-sessions" title={t.sessionTooltip}>
          <div className="telemetry-item" data-session="ASIA"><span>{text('ASIA', 'เอเชีย')}</span><strong className="mono">{analytics.sessions.ASIA.winRatePct}%</strong></div>
          <div className="telemetry-item" data-session="LONDON"><span>{text('LON', 'ลอนดอน')}</span><strong className="mono">{analytics.sessions.LONDON.winRatePct}%</strong></div>
          <div className="telemetry-item" data-session="NEW_YORK"><span>{text('NY', 'นิวยอร์ก')}</span><strong className="mono">{analytics.sessions.NEW_YORK.winRatePct}%</strong></div>
          <div className="telemetry-item">
            <span>{text('Avg', 'เฉลี่ย')}</span>
            <strong className="mono" style={{ color: analytics.avgRMultiple >= 0 ? 'var(--emerald)' : 'var(--rose)' }}>
              {analytics.avgRMultiple >= 0 ? '+' : ''}{analytics.avgRMultiple}R
            </strong>
          </div>
        </div>
        </div>}
      </div>

      <button
        type="button"
        id="btn-toggle-right-dock"
        className={`btn xs telemetry-dock-toggle ${showRightDock ? 'primary' : criticalOrWarnCount > 0 ? 'rose' : ''}`}
        aria-expanded={showRightDock}
        onClick={onToggleRightDock}
        title={t.aiLiveDesk}
      >
        <span>{t.aiLiveDesk}</span>
        {criticalOrWarnCount > 0 && <span className="mono telemetry-alert-count">{criticalOrWarnCount}</span>}
      </button>
    </div>
  );
};
