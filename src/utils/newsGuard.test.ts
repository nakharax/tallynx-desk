import assert from 'node:assert/strict';
import test from 'node:test';
import { buildUsMacroSchedule, evaluateNewsBlackoutWindow } from './newsGuard.ts';

const NFP = Date.parse('2026-11-06T19:30:00+07:00');
const MINUTE = 60_000;

test('uses inclusive two-minute blackout boundaries for FTMO and Alpha Capital', () => {
  for (const firm of ['ftmo', 'alphacapital']) {
    const before = evaluateNewsBlackoutWindow(NFP - 2 * MINUTE, firm);
    assert.equal(before.status, 'BLACKOUT');
    assert.equal(before.windowMinutes, 2);
    assert.equal(before.eventName, 'Non-Farm Payrolls (NFP)');
    assert.equal(before.minutesUntil, 2);
    assert.equal(evaluateNewsBlackoutWindow(NFP + 2 * MINUTE, firm).status, 'BLACKOUT');
    assert.equal(evaluateNewsBlackoutWindow(NFP + 2 * MINUTE + 1, firm).status, 'CLEAR');
  }
});

test('identifies the wider FundedNext and FundingPips windows before and after release', () => {
  for (const firm of ['fundednext', 'fundingpips']) {
    assert.equal(evaluateNewsBlackoutWindow(NFP - 5 * MINUTE - 1, firm).status, 'APPROACHING');
    assert.equal(evaluateNewsBlackoutWindow(NFP - 5 * MINUTE, firm).status, 'BLACKOUT');
    const after = evaluateNewsBlackoutWindow(NFP + 5 * MINUTE, firm);
    assert.equal(after.status, 'BLACKOUT');
    assert.equal(after.windowMinutes, 5);
    assert.equal(after.minutesUntil, -5);
    assert.match(after.ruleSummaryEn, /5 min/);
    assert.match(after.ruleSummaryTh, /5 นาที/);
    assert.equal(evaluateNewsBlackoutWindow(NFP + 5 * MINUTE + 1, firm).status, 'CLEAR');
  }
});

test('starts APPROACHING at 30 minutes and returns the next event while CLEAR', () => {
  const outside = evaluateNewsBlackoutWindow(NFP - 30 * MINUTE - 1, 'ftmo');
  assert.equal(outside.status, 'CLEAR');
  assert.equal(outside.eventAtMs, NFP);
  assert.equal(outside.eventName, 'Non-Farm Payrolls (NFP)');
  const approaching = evaluateNewsBlackoutWindow(NFP - 30 * MINUTE, 'ftmo');
  assert.equal(approaching.status, 'APPROACHING');
  assert.equal(approaching.minutesUntil, 30);
  assert.equal(evaluateNewsBlackoutWindow(NFP - 2 * MINUTE - 1, 'ftmo').status, 'APPROACHING');
  assert.equal(evaluateNewsBlackoutWindow(NFP, 'ftmo').minutesUntil, 0);
});

test('places weekly Jobless Claims on Thursday at 19:30 Bangkok time', () => {
  const claims = Date.parse('2026-11-05T12:30:00Z');
  const reading = evaluateNewsBlackoutWindow(claims - 10 * MINUTE);
  assert.equal(reading.status, 'APPROACHING');
  assert.equal(reading.eventName, 'US Jobless Claims');
  assert.equal(reading.eventAtMs, Date.parse('2026-11-05T19:30:00+07:00'));
  assert.equal(reading.windowMinutes, 5);
  assert.equal(evaluateNewsBlackoutWindow(claims + 6 * MINUTE).eventAtMs, NFP);
});

test('supports explicit CPI, FOMC and EUR event dates across time zones', () => {
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

  const ecb = { name: 'ECB Rate Decision', nameTh: 'ผลประชุมอัตราดอกเบี้ยของ ECB', timestampMs: NFP - 3 * MINUTE };
  const overlap = evaluateNewsBlackoutWindow(ecb.timestampMs, 'ftmo', [...schedule, ecb]);
  assert.equal(overlap.status, 'BLACKOUT');
  assert.equal(overlap.eventName, ecb.name);
  assert.equal(overlap.eventNameTh, ecb.nameTh);
});
