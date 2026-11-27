import React, { useEffect, useState } from 'react';
import { Eye, Globe } from 'lucide-react';
import { deskText, type DeskLanguage } from '../utils/deskI18n';
import {
  formatTrafficCount,
  getBangkokDayKey,
  getOrCreateTrafficSessionId,
  markSessionPageViewRecorded,
  parseSiteTrafficSnapshot,
  shouldRecordSessionPageView,
  type SiteTrafficSnapshot,
} from '../utils/siteTraffic';

interface SiteTrafficStripProps {
  lang: DeskLanguage;
}

const HEARTBEAT_MS = 90_000;

export const SiteTrafficStrip: React.FC<SiteTrafficStripProps> = React.memo(({ lang }) => {
  const [snapshot, setSnapshot] = useState<SiteTrafficSnapshot | null>(null);
  const [scope, setScope] = useState<'desk' | 'all'>('all');
  const t = (en: string, th: string) => deskText(lang, en, th);

  useEffect(() => {
    let cancelled = false;
    const sessionId = getOrCreateTrafficSessionId();

    const ping = async (isInitial: boolean) => {
      if (!isInitial && typeof document !== 'undefined' && document.hidden) return;
      const dayKey = getBangkokDayKey();
      const pageView = isInitial && shouldRecordSessionPageView('desk', dayKey);
      try {
        const res = await fetch('/api/telemetry/traffic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ site: 'desk', sessionId, pageView }),
        });
        if (!res.ok) return;
        const parsed = parseSiteTrafficSnapshot(await res.json());
        if (!parsed || cancelled) return;
        if (pageView) markSessionPageViewRecorded('desk', parsed.dayKey);
        setSnapshot(parsed);
      } catch {
        // Non-blocking telemetry — ignore transient offline failures.
      }
    };

    void ping(true);
    const timer = window.setInterval(() => {
      void ping(false);
    }, HEARTBEAT_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const online = snapshot
    ? scope === 'all'
      ? snapshot.ecosystemOnlineNow
      : snapshot.siteOnlineNow
    : null;
  const today = snapshot
    ? scope === 'all'
      ? snapshot.ecosystemTodayVisits
      : snapshot.siteTodayVisits
    : null;
  const total = snapshot
    ? scope === 'all'
      ? snapshot.ecosystemTotalVisits
      : snapshot.siteTotalVisits
    : null;

  return (
    <aside className="site-traffic-strip" aria-label={t('Website visitor statistics', 'สถิติการเข้าชมเว็บไซต์')}>
      <div className="site-traffic-heading">
        <Eye size={14} aria-hidden="true" />
        <span>{t('Traffic', 'สถิติเข้าชม')}</span>
        <div className="site-traffic-scope" role="group" aria-label={t('Traffic scope', 'ขอบเขตสถิติ')}>
          <button
            type="button"
            className={scope === 'all' ? 'is-active' : ''}
            aria-pressed={scope === 'all'}
            onClick={() => setScope('all')}
          >
            <Globe size={11} aria-hidden="true" />
            {t('All TallyNX', 'รวมทั้งหมด')}
          </button>
          <button
            type="button"
            className={scope === 'desk' ? 'is-active' : ''}
            aria-pressed={scope === 'desk'}
            onClick={() => setScope('desk')}
          >
            Desk
          </button>
        </div>
      </div>

      <dl className="site-traffic-metrics">
        <div>
          <dt>
            <span className="site-traffic-live-dot" aria-hidden="true" />
            {t('Online', 'ออนไลน์')}
          </dt>
          <dd className="mono">{online === null ? '—' : formatTrafficCount(online, lang)}</dd>
        </div>
        <div>
          <dt>{t('Today', 'วันนี้')}</dt>
          <dd className="mono">{today === null ? '—' : formatTrafficCount(today, lang)}</dd>
        </div>
        <div>
          <dt>{t('Total visits', 'เข้าชมทั้งหมด')}</dt>
          <dd className="mono">{total === null ? '—' : formatTrafficCount(total, lang)}</dd>
        </div>
      </dl>
    </aside>
  );
});

SiteTrafficStrip.displayName = 'SiteTrafficStrip';
