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

function recurringEvents(nowMs: number): MacroNewsEvent[] {
  const bangkok = new Date(nowMs + BANGKOK_OFFSET_MS);
  const year = bangkok.getUTCFullYear();
  const month = bangkok.getUTCMonth();
  const day = bangkok.getUTCDate();
  const latestThursday = day - ((bangkok.getUTCDay() + 7 - 4) % 7);
  // The modeled recurring calendar uses 19:30 Bangkok time, or 12:30 UTC.
  const events = [latestThursday, latestThursday + 7].map((dayOfMonth) => ({
    ...JOBLESS_CLAIMS,
    timestampMs: Date.UTC(year, month, dayOfMonth, 12, 30),
  }));

  for (const releaseMonth of [month - 1, month, month + 1]) {
    const firstWeekday = new Date(Date.UTC(year, releaseMonth, 1)).getUTCDay();
    const firstFriday = 1 + ((5 + 7 - firstWeekday) % 7);
    events.push({ ...NON_FARM_PAYROLLS, timestampMs: Date.UTC(year, releaseMonth, firstFriday, 12, 30) });
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
