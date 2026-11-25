import test from 'node:test';
import assert from 'node:assert/strict';
import { createCleanWorkspaceState } from './ghrRules';
import { compressWorkspaceJsonForCloud } from './cloudPayloadCodec';
import {
  assertRedemptionAllowed,
  buildBoundedWorkspacePayload,
  hasAdminAccess,
  hasProOrHigherAccess,
  MAX_FIRESTORE_WORKSPACE_PAYLOAD_BYTES,
  measureUtf8ByteLength,
} from './firebaseHelpers';

test('hasAdminAccess requires verified claim/doc admin or active ADMIN entitlement', () => {
  const verifiedUser = { uid: 'u1', email: 'ops@example.com', emailVerified: true };
  const unverifiedUser = { uid: 'u2', email: 'ops@example.com', emailVerified: false };

  assert.equal(hasAdminAccess(null, null, true), false);
  assert.equal(hasAdminAccess(unverifiedUser, null, true), false);
  assert.equal(hasAdminAccess(verifiedUser, null, false), false);
  assert.equal(
    hasAdminAccess(verifiedUser, {
      ownerId: 'u1',
      email: 'ops@example.com',
      plan: 'FREE',
      licenseKey: '',
      status: 'ACTIVE',
    }, true),
    true
  );
  assert.equal(
    hasAdminAccess(verifiedUser, {
      ownerId: 'u1',
      email: 'ops@example.com',
      plan: 'ADMIN',
      licenseKey: '',
      status: 'ACTIVE',
    }, false),
    true
  );
  assert.equal(
    hasAdminAccess(verifiedUser, {
      ownerId: 'u1',
      email: 'ops@example.com',
      plan: 'ADMIN',
      licenseKey: '',
      status: 'SUSPENDED',
    }, false),
    false
  );
});

test('hasProOrHigherAccess respects claim admin and rejects suspended entitlements', () => {
  const user = { uid: 'u1', email: 'trader@example.com', emailVerified: true };

  assert.equal(
    hasProOrHigherAccess(user, {
      ownerId: 'u1',
      email: 'trader@example.com',
      plan: 'FREE',
      licenseKey: '',
      status: 'ACTIVE',
    }, true),
    true
  );

  assert.equal(
    hasProOrHigherAccess(user, {
      ownerId: 'u1',
      email: 'trader@example.com',
      plan: 'PRO',
      licenseKey: 'GHR-PRO-1234',
      status: 'SUSPENDED',
    }, false),
    false
  );
});

test('assertRedemptionAllowed blocks SUSPENDED entitlements from pretending ACTIVE', () => {
  assert.doesNotThrow(() => assertRedemptionAllowed(null));
  assert.doesNotThrow(() => assertRedemptionAllowed({ status: 'ACTIVE' }));
  assert.throws(
    () => assertRedemptionAllowed({ status: 'SUSPENDED' }),
    /SUSPENDED/
  );
});

test('buildBoundedWorkspacePayload enforces UTF-8 byte ceiling and aborts if still oversized', async () => {
  const state = createCleanWorkspaceState();
  const payload = await buildBoundedWorkspacePayload(state, compressWorkspaceJsonForCloud);
  assert.ok(measureUtf8ByteLength(payload) <= MAX_FIRESTORE_WORKSPACE_PAYLOAD_BYTES);

  // Simulate incompressible oversized accounts payload (> 900,000 bytes even after stripping journal)
  const hugeState = createCleanWorkspaceState();
  hugeState.accounts.port1.investorLabel = 'ก'.repeat(350_000); // 1,050,000 UTF-8 bytes
  await assert.rejects(
    () => buildBoundedWorkspacePayload(hugeState, async (raw) => raw),
    /900,000/
  );
});
