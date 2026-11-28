import React, { useEffect, useId, useMemo, useState } from 'react';
import { ArrowRight, Clock3, Radio, ShieldAlert, ShieldCheck } from 'lucide-react';
import { deskText, type DeskLanguage } from '../utils/deskI18n';
import { DEFAULT_US_MACRO_SCHEDULE, evaluateNewsBlackoutWindow } from '../utils/newsGuard';

interface NewsBlackoutRadarProps {
  lang: DeskLanguage;
  firmId?: string;
  firmName?: string;
  onOpenRules?: () => void;
}

const EVENT_TIME_FORMATTERS: Record<DeskLanguage, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }),
  th: new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }),
};

export const NewsBlackoutRadar: React.FC<NewsBlackoutRadarProps> = React.memo(
  function NewsBlackoutRadar({ lang, firmId, firmName, onOpenRules }: NewsBlackoutRadarProps) {
    const titleId = useId();
    const [now, setNow] = useState(Date.now);

    const reading = useMemo(
      () => evaluateNewsBlackoutWindow(now, firmId, DEFAULT_US_MACRO_SCHEDULE),
      [now, firmId],
    );
    const pollMs = reading.status === 'CLEAR' ? 30_000 : 10_000;

    useEffect(() => {
      const refresh = () => {
        if (document.visibilityState !== 'hidden') {
          setNow(Date.now());
        }
      };
      const timer = window.setInterval(refresh, pollMs);
      document.addEventListener('visibilitychange', refresh);
      return () => {
        window.clearInterval(timer);
        document.removeEventListener('visibilitychange', refresh);
      };
    }, [pollMs]);

    const t = (en: string, th: string) => deskText(lang, en, th);
    const statusLabel = {
      BLACKOUT: t('News blackout active', 'อยู่ในช่วงจำกัดจากข่าว'),
      APPROACHING: t('News release approaching', 'ใกล้เวลาประกาศข่าว'),
      CLEAR: t('News window clear', 'อยู่นอกช่วงจำกัดจากข่าว'),
    }[reading.status];
    const StatusIcon =
      reading.status === 'BLACKOUT'
        ? ShieldAlert
        : reading.status === 'APPROACHING'
          ? Clock3
          : ShieldCheck;
    const chip = (
      <>
        <StatusIcon size={13} aria-hidden="true" />
        <span>{statusLabel}</span>
      </>
    );

    if (onOpenRules) {
      return (
        <button
          className="news-status-chip"
          data-news-status={reading.status}
          type="button"
          onClick={onOpenRules}
          aria-label={t(`${statusLabel}. Open News Blackout Radar.`, `${statusLabel} เปิดเรดาร์ข่าวสำคัญ`)}
          title={t('Open News Blackout Radar', 'เปิดเรดาร์ข่าวสำคัญ')}
        >
          {chip}
          <ArrowRight size={12} aria-hidden="true" />
        </button>
      );
    }

    const eventName = lang === 'th' ? reading.eventNameTh : reading.eventName;
    const eventDate = reading.eventAtMs === null ? null : new Date(reading.eventAtMs);
    const eventTime = eventDate ? EVENT_TIME_FORMATTERS[lang].format(eventDate) : null;

    const minutesUntil = reading.minutesUntil ?? 0;
    const minutes = Math.ceil(Math.abs(minutesUntil));
    const countdown =
      minutesUntil === 0
        ? t('Release time', 'ถึงเวลาประกาศ')
        : minutesUntil < 0
          ? t(`Released ${minutes} min ago`, `ประกาศเมื่อ ${minutes} นาทีที่แล้ว`)
          : t(`In ${minutes} min`, `อีก ${minutes} นาที`);

    return (
      <section className="card news-radar" aria-labelledby={titleId}>
        <div className="news-radar-heading">
          <h2 className="card-title" id={titleId}>
            <Radio size={17} aria-hidden="true" />
            {t('News Blackout Radar', 'เรดาร์ช่วงจำกัดจากข่าวสำคัญ')}
          </h2>
          <span className="news-status-chip" data-news-status={reading.status} role="status">
            {chip}
          </span>
        </div>
        {eventName && eventDate && (
          <p className="news-radar-event">
            <strong>{eventName}</strong>
            <time className="mono" dateTime={eventDate.toISOString()}>
              {eventTime} {t('BKK', 'เวลาไทย')}
            </time>
            {reading.status !== 'CLEAR' && <span>{countdown}</span>}
          </p>
        )}
        <p>
          {firmName && `${firmName} · `}
          {t(reading.ruleSummaryEn, reading.ruleSummaryTh)}
        </p>
        <p className="news-radar-coverage">
          {t(
            'US Macro Calendar · DST-aware. Tracks NFP, US Jobless Claims, US CPI, and FOMC Rate Decisions (12:30/18:00 UTC in EDT · 13:30/19:00 UTC in EST). Verify one-off releases with your firm.',
            'ปฏิทินข่าวเศรษฐกิจสหรัฐฯ · ปรับเวลา DST อัตโนมัติ ติดตาม NFP, ยอดขอรับสวัสดิการว่างงาน, CPI และ FOMC (19:30/01:00 น. ช่วง EDT · 20:30/02:00 น. ช่วง EST) โปรดตรวจข่าวเฉพาะกิจกับกองทุนของคุณ'
          )}
        </p>
      </section>
    );
  }
);
