import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detectPropFirmForAccount,
  evaluatePortfolioAgainstPropFirm,
  PROP_FIRM_CATALOG,
} from './propFirmCatalog';

test('PROP_FIRM_CATALOG contains 10 verified CFD & Futures firms with valid HTTPS official URLs', () => {
  assert.equal(PROP_FIRM_CATALOG.length, 10);
  for (const firm of PROP_FIRM_CATALOG) {
    assert.match(firm.websiteUrl, /^https:\/\//);
    assert.match(firm.rulesUrl, /^https:\/\//);
    assert.ok(firm.redMustReadWarning.length > 20, `${firm.id} must have a critical red warning`);
    assert.ok(firm.safeSyncChannels.length >= 2, `${firm.id} must have safe sync options`);
  }
});

test('detectPropFirmForAccount matches Prop Firm from account or broker metadata', () => {
  assert.equal(detectPropFirmForAccount('FTMO 100K', 'FTMO', 'FTMO-Server2').id, 'ftmo');
  assert.equal(detectPropFirmForAccount('FundedNext Stellar', '', '').id, 'fundednext');
  assert.equal(detectPropFirmForAccount('Topstep Combine 50K', 'TopstepX', '').id, 'topstep');
});

test('evaluatePortfolioAgainstPropFirm flags FundedNext $50k+ VPS bridge & risky legacy channels', () => {
  const fundedNext = PROP_FIRM_CATALOG.find((f) => f.id === 'fundednext')!;
  const liveBridgeOn50k = evaluatePortfolioAgainstPropFirm({
    firm: fundedNext,
    accountInitialUsd: 50000,
    accountBalanceUsd: 51200,
    todayPnlUsd: 400,
    floatingPnlUsd: 0,
    bestDaySharePct: 33.3,
    syncProvider: 'LIVE_BRIDGE',
  });
  const syncCheck = liveBridgeOn50k.find((c) => c.id === 'sync-safety');
  assert.equal(syncCheck?.severity, 'WARN');

  const riskyLegacy = evaluatePortfolioAgainstPropFirm({
    firm: fundedNext,
    accountInitialUsd: 100000,
    accountBalanceUsd: 100000,
    todayPnlUsd: 0,
    floatingPnlUsd: 0,
    bestDaySharePct: 45,
    syncProvider: 'DIRECT_INVESTOR',
  });
  assert.equal(riskyLegacy.find((c) => c.id === 'sync-safety')?.severity, 'CRITICAL');
  assert.equal(riskyLegacy.find((c) => c.id === 'consistency')?.severity, 'CRITICAL');
});
