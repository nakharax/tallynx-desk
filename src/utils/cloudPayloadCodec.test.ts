import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTradesArchiveCsv,
  CLOUD_GZIP_PREFIX,
  compressWorkspaceJsonForCloud,
  decodeCloudWorkspacePayload,
} from './cloudPayloadCodec';

test('compressWorkspaceJsonForCloud shrinks repetitive trade JSON >5x and round-trips cleanly', async () => {
  const trades = Array.from({ length: 1200 }, (_, i) => ({
    id: `T-${10000 + i}`,
    port: 'port1',
    date: '2026-11-16',
    time: '15:00',
    dir: i % 2 === 0 ? 'BUY' : 'SELL',
    entry: 3865.5,
    slPrice: 3855.5,
    tp1Price: 3869.5,
    tp2Price: 3873.5,
    tp3Price: 3877.5,
    lotLeg: 0.04,
    risk: 120,
    rr: 0.8,
    pnlUsd: 96,
    status: 'FULL_SWEEP',
    note: 'H1 HVN demand bounce validated across 12-Gate protocol',
  }));
  const rawJson = JSON.stringify({ accounts: { port1: { name: 'Main' } }, journal: trades });

  const encoded = await compressWorkspaceJsonForCloud(rawJson);
  assert.ok(encoded.startsWith(CLOUD_GZIP_PREFIX), 'Expected compressed payload prefix');
  assert.ok(
    encoded.length < rawJson.length / 4,
    `Expected >4x compression (raw=${rawJson.length}, encoded=${encoded.length})`
  );

  const decoded = await decodeCloudWorkspacePayload<{ journal: Array<{ id: string }> }>(encoded);
  assert.equal(decoded.journal.length, 1200);
  assert.equal(decoded.journal[0].id, 'T-10000');
  assert.equal(decoded.journal[1199].id, 'T-11199');
});

test('decodeCloudWorkspacePayload stays backward compatible with legacy plain JSON', async () => {
  const legacy = JSON.stringify({ accounts: { p1: { name: 'Legacy' } }, journal: [{ id: 'OLD-1' }] });
  const encodedSmall = await compressWorkspaceJsonForCloud(legacy);
  assert.equal(encodedSmall, legacy);

  const decoded = await decodeCloudWorkspacePayload<{ journal: Array<{ id: string }> }>(legacy);
  assert.equal(decoded.journal[0].id, 'OLD-1');
});

test('buildTradesArchiveCsv includes UTF-8 BOM, headers, and neutralizes CSV formula injection', () => {
  const csv = buildTradesArchiveCsv(
    { port1: { name: 'FundedNext 100k', firm: 'FundedNext' } },
    [
      {
        id: 'T-1',
        port: 'port1',
        date: '2026-11-16',
        time: '14:30',
        dir: 'BUY',
        entry: 3865,
        pnlUsd: 96,
        status: 'FULL_SWEEP',
        note: '=CMD() attempt',
      },
    ]
  );
  assert.ok(csv.startsWith('\uFEFF"Trade ID","Port ID",'));
  assert.ok(csv.includes('"FundedNext 100k"'));
  assert.ok(csv.includes('"\'=CMD() attempt"'));
});
