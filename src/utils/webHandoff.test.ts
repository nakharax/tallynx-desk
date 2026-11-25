import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWebPortalUrl,
  calculateWebSandboxRisk,
  parseWebHandoff,
  resolveBrandHomeSection,
  resolveDeskSection,
  resolveDeskTheme,
  stripWebHandoffParams,
  updateDeskPageUrl,
} from './webHandoff.ts';

test('uses Desk Home by default and Mall Home on the Mall hostname', () => {
  assert.equal(resolveBrandHomeSection('desk.tallynx.com'), 'sec-accounts');
  assert.equal(resolveBrandHomeSection('localhost'), 'sec-accounts');
  assert.equal(resolveBrandHomeSection(new URL('https://tallynx-desk-git-preview.vercel.app/').hostname), 'sec-accounts');
  assert.equal(resolveBrandHomeSection('mall.tallynx.com'), 'sec-mall');
});

test('resolves each Desk page from its clean path, query alias, hash alias or section ID', () => {
  const pages = {
    analysis: 'sec-accounts',
    chart: 'tv-chart-root',
    calc: 'sec-calc',
    gate: 'desk-cards-root',
    journal: 'journal-root',
    market: 'sec-market',
    proprules: 'sec-proprules',
    mall: 'sec-mall',
    settings: 'sec-settings',
  };

  for (const [page, id] of Object.entries(pages)) {
    assert.equal(resolveDeskSection('', '', `/${page}`), id);
    assert.equal(resolveDeskSection('', '', `/${page}/`), id);
    assert.equal(resolveDeskSection(`?page=${page}`), id);
    assert.equal(resolveDeskSection('', `#/${page}`), id);
    assert.equal(resolveDeskSection('', `#${id}`), id);
  }
  assert.equal(resolveDeskSection('', '', '/portfolio'), 'sec-accounts');
  assert.equal(resolveDeskSection('', '', '/plan'), 'sec-calc');
  assert.equal(resolveDeskSection('', '', '/rules'), 'sec-proprules');
  assert.equal(resolveDeskSection('', '', '/community'), 'sec-mall');
  assert.equal(resolveDeskSection('', '', '/marketplace'), 'sec-market');
  assert.equal(resolveDeskSection('', '#calculator-root'), 'sec-calc');
  assert.equal(resolveDeskSection('', '#sec-marketplace'), 'sec-market');
  assert.equal(resolveDeskSection('?page=community'), 'sec-mall');
  assert.equal(resolveDeskSection('?page=sec-mall'), 'sec-mall');
  assert.equal(resolveDeskSection('', '', '/'), undefined);
  assert.equal(resolveDeskSection('', '', '/unknown'), undefined);
  assert.equal(resolveDeskSection('', '', '/api/health'), undefined);
  assert.equal(updateDeskPageUrl('/?lang=th', 'sec-mall'), '/mall?lang=th');
});

test('applies hash -> query -> pathname precedence and ignores unknown routes', () => {
  assert.equal(resolveDeskSection('?page=chart', '#JOURNAL', '/proprules'), 'journal-root');
  assert.equal(resolveDeskSection('?page=chart', '#other-anchor', '/proprules'), 'tv-chart-root');
  assert.equal(resolveDeskSection('?lang=th', '#other-anchor', '/proprules'), 'sec-proprules');
  assert.equal(resolveDeskSection('?page=constructor', '#toString', '/__proto__'), undefined);
  assert.equal(resolveDeskSection('?page=broken', '#%E0%A4', '/missing'), undefined);
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
  assert.equal(
    stripWebHandoffParams('/calc?lang=th&theme=dark&balance=50000&risk_pct=1'),
    '/calc?lang=th&theme=dark',
  );
  assert.equal(stripWebHandoffParams('/preview?balance=invalid#chart'), '/preview#chart');
  assert.equal(stripWebHandoffParams('/?lang=th&q=a%20b#proprules'), '/?lang=th&q=a%20b#proprules');
});

test('serializes clean paths while stripping legacy page params and navigation hashes', () => {
  assert.equal(
    updateDeskPageUrl('/?lang=th&theme=dark&page=proprules#proprules', 'calculator-root'),
    '/calc?lang=th&theme=dark',
  );
  assert.equal(updateDeskPageUrl('/?lang=en#chart', 'sec-proprules'), '/proprules?lang=en');
  assert.equal(updateDeskPageUrl('/?lang=en#chart', 'journal-root'), '/journal?lang=en');
  assert.equal(updateDeskPageUrl('/?lang=en#unrelated', 'sec-marketplace'), '/market?lang=en#unrelated');
  assert.equal(updateDeskPageUrl('/calc?lang=th', 'sec-accounts'), '/analysis?lang=th');
  assert.equal(updateDeskPageUrl('/portfolio', 'sec-settings'), '/settings');
  assert.equal(updateDeskPageUrl('/rules', 'desk-cards-root'), '/gate');
  assert.equal(updateDeskPageUrl('/mall', 'tv-chart-root'), '/chart');
  assert.equal(updateDeskPageUrl('/?lang=en', 'unknown-page'), '/?lang=en');
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
