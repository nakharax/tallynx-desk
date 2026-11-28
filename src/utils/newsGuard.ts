const MINUTE_MS = 60_000;
const BANGKOK_OFFSET_MS = 7 * 60 * MINUTE_MS;
const APPROACHING_MINUTES = 30;
const TWO_MINUTE_FIRMS = new Set(['ftmo', 'alphacapital']);

export type NewsBlackoutStatus = 'BLACKOUT' | 'APPROACHING' | 'CLEAR';

export interface MacroNewsEvent {
  name: string;
  nameTh?: string;
  timestampMs: number;
}

export interface NewsBlackoutReading {
  status: NewsBlackoutStatus;
  eventName: string | null;
  eventNameTh: string | null;
  eventAtMs: number | null;
  minutesUntil: number | null;
  windowMinutes: number;
  ruleSummaryEn: string;
  ruleSummaryTh: string;
}

const NON_FARM_PAYROLLS = { name: 'Non-Farm Payrolls (NFP)', nameTh: 'การจ้างงานนอกภาคเกษตรสหรัฐฯ (NFP)' };
const JOBLESS_CLAIMS = { name: 'US Jobless Claims', nameTh: 'ยอดขอรับสวัสดิการว่างงานของสหรัฐฯ' };
const CPI = { name: 'US CPI', nameTh: 'ดัชนีราคาผู้บริโภคสหรัฐฯ (CPI)' };
const FOMC = { name: 'FOMC Rate Decision', nameTh: 'ผลการประชุมอัตราดอกเบี้ยของเฟด (FOMC)' };

/** Returns true when a calendar date (year, 0-based month, day) falls in US Eastern Daylight Time (EDT, UTC-4). */
export function isUsEasternDstDate(year: number, monthIndex: number, day: number): boolean {
  if (monthIndex > 2 && monthIndex < 10) return true;
  if (monthIndex < 2 || monthIndex > 10) return false;
  if (monthIndex === 2) {
    // 2nd Sunday of March
    const firstWeekday = new Date(Date.UTC(year, 2, 1)).getUTCDay();
    const secondSunday = 1 + ((7 - firstWeekday) % 7) + 7;
    return day >= secondSunday;
  }
  // 1st Sunday of November
  const firstWeekday = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  const firstSunday = 1 + ((7 - firstWeekday) % 7);
  return day < firstSunday;
}

/** 08:30 AM US Eastern Time expressed in UTC hours (12 during EDT, 13 during EST). */
export function usEastern830UtcHour(year: number, monthIndex: number, day: number): 12 | 13 {
  return isUsEasternDstDate(year, monthIndex, day) ? 12 : 13;
}

/** Build dated releases from timestamps with an explicit UTC or Bangkok offset. */
export function buildUsMacroSchedule({ cpi = [], fomc = [] }: {
  cpi?: readonly string[];
  fomc?: readonly string[];
}): MacroNewsEvent[] {
  const events: MacroNewsEvent[] = [];
  for (const [release, dates] of [[CPI, cpi], [FOMC, fomc]] as const) {
    for (const date of dates) {
      if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(date)) continue;
      const timestampMs = Date.parse(date);
      if (Number.isFinite(timestampMs)) events.push({ ...release, timestampMs });
    }
  }
  return events.sort((a, b) => a.timestampMs - b.timestampMs);
}

/** Curated DST-aware 2026–2027 US CPI (08:30 ET) and FOMC Rate Decision (14:00 ET) release schedule. */
export const DEFAULT_US_MACRO_SCHEDULE: readonly MacroNewsEvent[] = Object.freeze(
  buildUsMacroSchedule({
    cpi: [
      '2026-01-13T13:30:00Z', '2026-02-11T13:30:00Z', '2026-03-11T12:30:00Z', '2026-04-10T12:30:00Z',
      '2026-05-12T12:30:00Z', '2026-06-10T12:30:00Z', '2026-07-14T12:30:00Z', '2026-08-12T12:30:00Z',
      '2026-09-11T12:30:00Z', '2026-10-14T12:30:00Z', '2026-11-10T13:30:00Z', '2026-12-10T13:30:00Z',
      '2027-01-13T13:30:00Z', '2027-02-10T13:30:00Z', '2027-03-10T13:30:00Z', '2027-04-14T12:30:00Z',
      '2027-05-12T12:30:00Z', '2027-06-10T12:30:00Z', '2027-07-14T12:30:00Z', '2027-08-11T12:30:00Z',
      '2027-09-15T12:30:00Z', '2027-10-13T12:30:00Z', '2027-11-10T13:30:00Z', '2027-12-10T13:30:00Z',
    ],
    fomc: [
      '2026-01-28T19:00:00Z', '2026-03-18T18:00:00Z', '2026-04-29T18:00:00Z', '2026-06-17T18:00:00Z',
      '2026-07-29T18:00:00Z', '2026-09-16T18:00:00Z', '2026-10-28T18:00:00Z', '2026-12-09T19:00:00Z',
      '2027-01-27T19:00:00Z', '2027-03-17T18:00:00Z', '2027-04-28T18:00:00Z', '2027-06-09T18:00:00Z',
      '2027-07-28T18:00:00Z', '2027-09-15T18:00:00Z', '2027-10-27T18:00:00Z', '2027-12-08T19:00:00Z',
    ],
  }),
);

function utcTimestampAtUsEastern830(year: number, monthIndex: number, day: number): number {
  const normalized = new Date(Date.UTC(year, monthIndex, day));
  const y = normalized.getUTCFullYear();
  const m = normalized.getUTCMonth();
  const d = normalized.getUTCDate();
  return Date.UTC(y, m, d, usEastern830UtcHour(y, m, d), 30);
}

function recurringEvents(nowMs: number): MacroNewsEvent[] {
  const bangkok = new Date(nowMs + BANGKOK_OFFSET_MS);
  const year = bangkok.getUTCFullYear();
  const month = bangkok.getUTCMonth();
  const day = bangkok.getUTCDate();
  const latestThursday = day - ((bangkok.getUTCDay() + 7 - 4) % 7);
  // Recurring US 08:30 ET releases shift automatically between 12:30 UTC (EDT) and 13:30 UTC (EST).
  const events = [latestThursday, latestThursday + 7].map((dayOfMonth) => ({
    ...JOBLESS_CLAIMS,
    timestampMs: utcTimestampAtUsEastern830(year, month, dayOfMonth),
  }));

  for (const releaseMonth of [month - 1, month, month + 1]) {
    const firstOfMonth = new Date(Date.UTC(year, releaseMonth, 1));
    const firstWeekday = firstOfMonth.getUTCDay();
    const firstFriday = 1 + ((5 + 7 - firstWeekday) % 7);
    events.push({
      ...NON_FARM_PAYROLLS,
      timestampMs: utcTimestampAtUsEastern830(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth(), firstFriday),
    });
  }
  return events;
}

export function evaluateNewsBlackoutWindow(
  nowMs: number,
  firmId?: string,
  upcomingEvents: readonly MacroNewsEvent[] = [],
): NewsBlackoutReading {
  const windowMinutes = TWO_MINUTE_FIRMS.has(firmId?.trim().toLowerCase() ?? '') ? 2 : 5;
  const windowMs = windowMinutes * MINUTE_MS;
  let activeEvent: MacroNewsEvent | undefined;
  let nextEvent: MacroNewsEvent | undefined;

  for (const event of [...upcomingEvents, ...recurringEvents(nowMs)]) {
    const offsetMs = event.timestampMs - nowMs;
    if (!Number.isFinite(offsetMs)) continue;
    if (Math.abs(offsetMs) <= windowMs && (!activeEvent || Math.abs(offsetMs) < Math.abs(activeEvent.timestampMs - nowMs))) {
      activeEvent = event;
    }
    if (offsetMs >= 0 && (!nextEvent || event.timestampMs < nextEvent.timestampMs)) nextEvent = event;
  }

  const event = activeEvent ?? nextEvent;
  const minutesUntil = event ? (event.timestampMs - nowMs) / MINUTE_MS : null;
  return {
    status: activeEvent ? 'BLACKOUT' : minutesUntil !== null && minutesUntil <= APPROACHING_MINUTES ? 'APPROACHING' : 'CLEAR',
    eventName: event?.name ?? null,
    eventNameTh: event?.nameTh ?? event?.name ?? null,
    eventAtMs: event?.timestampMs ?? null,
    minutesUntil,
    windowMinutes,
    ruleSummaryEn: `Modeled window of ${windowMinutes} min before and after release. Check your firm's program terms.`,
    ruleSummaryTh: `ช่วงเฝ้าระวังจำลอง ${windowMinutes} นาทีก่อนและหลังประกาศ โปรดตรวจเงื่อนไขของโปรแกรมที่ใช้อยู่`,
  };
}
