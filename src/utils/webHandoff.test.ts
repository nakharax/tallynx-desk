import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWebPortalUrl,
  calculateWebSandboxRisk,
  parseWebHandoff,
  resolveDeskSection,
  resolveDeskTheme,
  stripWebHandoffParams,
  updateDeskPageUrl,
} from './webHandoff.ts';

test('resolves each Desk page from its query alias, hash alias or section ID', () => {
  const pages = {
    analysis: 'sec-accounts',
    chart: 'tv-chart-root',
    calc: 'sec-calc',
    gate: 'desk-cards-root',
    journal: 'journal-root',
    market: 'sec-market',
    proprules: 'sec-proprules',
    mall: 'sec-mall',
  };

  for (const [page, id] of Object.entries(pages)) {
    assert.equal(resolveDeskSection(`?page=${page}`), id);
    assert.equal(resolveDeskSection('', `#/${page}`), id);
    assert.equal(resolveDeskSection('', `#${id}`), id);
  }
  assert.equal(resolveDeskSection('', '#calculator-root'), 'sec-calc');
  assert.equal(resolveDeskSection('', '#sec-marketplace'), 'sec-market');
  assert.equal(resolveDeskSection('?page=community'), 'sec-mall');
  assert.equal(resolveDeskSection('?page=sec-mall'), 'sec-mall');
  assert.equal(updateDeskPageUrl('/?lang=th', 'sec-mall'), '/?lang=th&page=mall');
});

test('uses a recognized hash before the query and ignores unknown routes', () => {
  assert.equal(resolveDeskSection('?page=chart', '#JOURNAL'), 'journal-root');
  assert.equal(resolveDeskSection('?page=chart', '#other-anchor'), 'tv-chart-root');
  assert.equal(resolveDeskSection('?page=constructor', '#toString'), undefined);
  assert.equal(resolveDeskSection('?page=broken', '#%E0%A4'), undefined);
});

test('maps common and Desk-specific theme names to Desk preferences', () => {
  for (const theme of ['light', 'alabaster', 'LIGHT']) {
    assert.equal(resolveDeskTheme(`?theme=${theme}`), 'alabaster');
  }
  for (const theme of ['dark', 'obsidian']) {
    assert.equal(resolveDeskTheme(`?theme=${theme}`), 'obsidian');
  }
  assert.equal(resolveDeskTheme('?theme=sepia'), undefined);
  assert.equal(resolveDeskTheme(''), undefined);
});

test('imports calculator fields and validated provenance without interpreting a connection', () => {
  assert.deepEqual(parseWebHandoff('?balance=25000&risk_pct=1.5&sl_pips=35&symbol=EURUSD&mode=personal&daily_dd=5.5&source=onboarding_funnel_5step&connected_via=cloud'), {
    balance: 25000,
    riskPct: 1.5,
    slPips: 35,
    symbol: 'EURUSD',
    mode: 'personal',
    dailyDd: 5.5,
    source: 'onboarding_funnel_5step',
    connectedVia: 'cloud',
  });
});

test('rejects invalid inputs and uses Web defaults for missing or invalid fields in a partial import', () => {
  assert.deepEqual(parseWebHandoff('?balance=500&risk_pct=0.25&sl_pips=500&daily_dd=12&symbol=NAS100'), {
    balance: 500, riskPct: 0.25, slPips: 500, dailyDd: 12, symbol: 'NAS100', mode: 'prop',
  });
  assert.deepEqual(parseWebHandoff('?mode=personal&balance=Infinity&risk_pct=0&sl_pips=-5&daily_dd=99&symbol=INVALID&connected_via=unknown&source=%3Cscript%3E'), {
    balance: 10000, riskPct: 1, slPips: 25, dailyDd: 5, symbol: 'XAUUSD', mode: 'personal',
  });
  assert.equal(parseWebHandoff('?balance=&risk_pct=0x1&sl_pips=1e2&daily_dd=0&mode=bad&symbol=bad'), undefined);
  assert.equal(parseWebHandoff('?lang=th&theme=dark&page=gate'), undefined);
  assert.equal(parseWebHandoff('?source=sandbox_page&connected_via=ex5'), undefined);
});

test('removes all transient fields while preserving navigation, language, theme and unrelated values', () => {
  assert.equal(
    stripWebHandoffParams('/?lang=th&page=gate&theme=dark&balance=50000&balance=70000&risk_pct=1&sl_pips=25&symbol=XAUUSD&mode=prop&daily_dd=4&source=sandbox_page&connected_via=xlsx&consistency_cap=40&day_share=28&step=3&utm_medium=web#gate'),
    '/?lang=th&page=gate&theme=dark&utm_medium=web#gate',
  );
  assert.equal(stripWebHandoffParams('/preview?balance=invalid#chart'), '/preview#chart');
  assert.equal(stripWebHandoffParams('/?lang=th&q=a%20b#proprules'), '/?lang=th&q=a%20b#proprules');
});

test('keeps navigation in sync after leaving a linked page', () => {
  assert.equal(
    updateDeskPageUrl('/?lang=th&theme=dark&page=proprules#proprules', 'calculator-root'),
    '/?lang=th&theme=dark&page=calc',
  );
  assert.equal(updateDeskPageUrl('/?lang=en#chart', 'sec-proprules'), '/?lang=en#proprules');
  assert.equal(updateDeskPageUrl('/?lang=en#chart', 'journal-root'), '/?lang=en&page=journal');
  assert.equal(updateDeskPageUrl('/?lang=en#unrelated', 'sec-marketplace'), '/?lang=en#unrelated');
});

test('serializes active language and theme onto the configured Web portal URL', () => {
  assert.equal(
    buildWebPortalUrl('https://example.test/welcome?lang=en&campaign=desk#home', 'th', 'obsidian'),
    'https://example.test/welcome?lang=th&campaign=desk&theme=dark#home',
  );
  assert.equal(
    buildWebPortalUrl('https://example.test', 'en', 'alabaster'),
    'https://example.test/?lang=en&theme=light',
  );
});

test('calculates risk and daily loss amounts with the imported symbol and stop distance', () => {
  const sandbox = parseWebHandoff('?balance=10000&risk_pct=1&sl_pips=25&symbol=NAS100&daily_dd=4')!;
  assert.deepEqual(calculateWebSandboxRisk(sandbox), { riskUsd: 100, dailyLossUsd: 400, modeledLots: 4 });
  assert.equal(calculateWebSandboxRisk({ ...sandbox, symbol: 'EURUSD' })?.modeledLots, 0.4);
  assert.equal(calculateWebSandboxRisk({ ...sandbox, slPips: 50 })?.modeledLots, 2);
  assert.equal(calculateWebSandboxRisk({ ...sandbox, riskPct: NaN }), undefined);
});
