import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_US_MACRO_SCHEDULE,
  buildUsMacroSchedule,
  evaluateNewsBlackoutWindow,
  isUsEasternDstDate,
  usEastern830UtcHour,
} from './newsGuard.ts';

// Nov 6, 2026 is after US DST ends (Nov 1, 2026) -> EST: 08:30 ET = 13:30 UTC = 20:30+07:00
const NFP_EST = Date.parse('2026-11-06T20:30:00+07:00');
// Jul 3, 2026 is during US DST -> EDT: 08:30 ET = 12:30 UTC = 19:30+07:00
const NFP_EDT = Date.parse('2026-07-03T19:30:00+07:00');
const MINUTE = 60_000;

test('uses inclusive two-minute blackout boundaries for FTMO and Alpha Capital', () => {
  for (const firm of ['ftmo', 'alphacapital']) {
    const before = evaluateNewsBlackoutWindow(NFP_EST - 2 * MINUTE, firm);
    assert.equal(before.status, 'BLACKOUT');
    assert.equal(before.windowMinutes, 2);
    assert.equal(before.eventName, 'Non-Farm Payrolls (NFP)');
    assert.equal(before.minutesUntil, 2);
    assert.equal(evaluateNewsBlackoutWindow(NFP_EST + 2 * MINUTE, firm).status, 'BLACKOUT');
    assert.equal(evaluateNewsBlackoutWindow(NFP_EST + 2 * MINUTE + 1, firm).status, 'CLEAR');
  }
});

test('identifies the wider FundedNext and FundingPips windows before and after release', () => {
  for (const firm of ['fundednext', 'fundingpips']) {
    assert.equal(evaluateNewsBlackoutWindow(NFP_EST - 5 * MINUTE - 1, firm).status, 'APPROACHING');
    assert.equal(evaluateNewsBlackoutWindow(NFP_EST - 5 * MINUTE, firm).status, 'BLACKOUT');
    const after = evaluateNewsBlackoutWindow(NFP_EST + 5 * MINUTE, firm);
    assert.equal(after.status, 'BLACKOUT');
    assert.equal(after.windowMinutes, 5);
    assert.equal(after.minutesUntil, -5);
    assert.match(after.ruleSummaryEn, /5 min/);
    assert.match(after.ruleSummaryTh, /5 นาที/);
    assert.equal(evaluateNewsBlackoutWindow(NFP_EST + 5 * MINUTE + 1, firm).status, 'CLEAR');
  }
});

test('starts APPROACHING at 30 minutes and returns the next event while CLEAR', () => {
  const outside = evaluateNewsBlackoutWindow(NFP_EST - 30 * MINUTE - 1, 'ftmo');
  assert.equal(outside.status, 'CLEAR');
  assert.equal(outside.eventAtMs, NFP_EST);
  assert.equal(outside.eventName, 'Non-Farm Payrolls (NFP)');
  const approaching = evaluateNewsBlackoutWindow(NFP_EST - 30 * MINUTE, 'ftmo');
  assert.equal(approaching.status, 'APPROACHING');
  assert.equal(approaching.minutesUntil, 30);
  assert.equal(evaluateNewsBlackoutWindow(NFP_EST - 2 * MINUTE - 1, 'ftmo').status, 'APPROACHING');
  assert.equal(evaluateNewsBlackoutWindow(NFP_EST, 'ftmo').minutesUntil, 0);
});

test('shifts recurring NFP and Jobless Claims between 12:30 UTC (EDT) and 13:30 UTC (EST)', () => {
  assert.equal(isUsEasternDstDate(2026, 2, 7), false); // Mar 7, 2026 (day before 2nd Sunday)
  assert.equal(isUsEasternDstDate(2026, 2, 8), true);  // Mar 8, 2026 (2nd Sunday -> EDT starts)
  assert.equal(isUsEasternDstDate(2026, 10, 1), false); // Nov 1, 2026 (1st Sunday -> EST resumes)
  assert.equal(usEastern830UtcHour(2026, 6, 3), 12);
  assert.equal(usEastern830UtcHour(2026, 10, 6), 13);

  // Summer EDT (July 2026): Thursday Jobless Claims at 12:30 UTC (19:30 BKK), Friday NFP at 12:30 UTC (19:30 BKK)
  const claimsEdt = Date.parse('2026-07-02T12:30:00Z');
  const edtReading = evaluateNewsBlackoutWindow(claimsEdt - 10 * MINUTE);
  assert.equal(edtReading.status, 'APPROACHING');
  assert.equal(edtReading.eventName, 'US Jobless Claims');
  assert.equal(edtReading.eventAtMs, Date.parse('2026-07-02T19:30:00+07:00'));
  assert.equal(evaluateNewsBlackoutWindow(claimsEdt + 6 * MINUTE).eventAtMs, NFP_EDT);

  // Winter EST (November 2026): Thursday Jobless Claims at 13:30 UTC (20:30 BKK), Friday NFP at 13:30 UTC (20:30 BKK)
  const claimsEst = Date.parse('2026-11-05T13:30:00Z');
  const estReading = evaluateNewsBlackoutWindow(claimsEst - 10 * MINUTE);
  assert.equal(estReading.status, 'APPROACHING');
  assert.equal(estReading.eventName, 'US Jobless Claims');
  assert.equal(estReading.eventAtMs, Date.parse('2026-11-05T20:30:00+07:00'));
  assert.equal(estReading.windowMinutes, 5);
  assert.equal(evaluateNewsBlackoutWindow(claimsEst + 6 * MINUTE).eventAtMs, NFP_EST);
});

test('supports explicit CPI, FOMC and default macro schedule dates across time zones', () => {
  const cpi = '2026-11-10T20:30:00+07:00';
  const fomc = '2026-11-18T19:00:00Z';
  const schedule = buildUsMacroSchedule({ cpi: [cpi, '2026-11-10T12:30:00'], fomc: [fomc] });
  assert.equal(schedule.length, 2);
  assert.equal(schedule[0].timestampMs, Date.parse('2026-11-10T13:30:00Z'));
  assert.equal(evaluateNewsBlackoutWindow(Date.parse(cpi), 'ftmo', schedule).eventName, 'US CPI');
  const rateDecision = evaluateNewsBlackoutWindow(Date.parse(fomc) + MINUTE, 'ftmo', schedule);
  assert.equal(rateDecision.status, 'BLACKOUT');
  assert.equal(rateDecision.eventName, 'FOMC Rate Decision');
  assert.equal(rateDecision.eventAtMs, Date.parse('2026-11-19T02:00:00+07:00'));

  // Built-in DEFAULT_US_MACRO_SCHEDULE covers both CPI and FOMC releases
  assert.ok(DEFAULT_US_MACRO_SCHEDULE.some((e) => e.name === 'US CPI'));
  assert.ok(DEFAULT_US_MACRO_SCHEDULE.some((e) => e.name === 'FOMC Rate Decision'));
  const builtinCpi = evaluateNewsBlackoutWindow(Date.parse('2026-11-10T13:30:00Z'), 'ftmo', DEFAULT_US_MACRO_SCHEDULE);
  assert.equal(builtinCpi.status, 'BLACKOUT');
  assert.equal(builtinCpi.eventName, 'US CPI');

  const ecb = { name: 'ECB Rate Decision', nameTh: 'ผลประชุมอัตราดอกเบี้ยของ ECB', timestampMs: NFP_EST - 3 * MINUTE };
  const overlap = evaluateNewsBlackoutWindow(ecb.timestampMs, 'ftmo', [...schedule, ecb]);
  assert.equal(overlap.status, 'BLACKOUT');
  assert.equal(overlap.eventName, ecb.name);
  assert.equal(overlap.eventNameTh, ecb.nameTh);
});
