# Security Specification — TallyNX GHR v3.2 Commercial Desk

## 1. Data Invariants
1. **Identity Isolation (`/workspaces/{userId}`)**: Can ONLY be read, created, updated, or deleted by the authenticated user whose `request.auth.uid == userId` and `request.auth.token.email_verified == true`.
2. **Owner Field Integrity**: `incoming().ownerId` must strictly equal `request.auth.uid` and `userId`, and `ownerId` + `createdAt` remain immutable across all updates.
3. **Strict Key & Size Bounds**: Every document write across `/workspaces`, `/admins`, `/licenses`, and `/entitlements` enforces exact allowlisted keys (`hasAll` + `hasOnly`), string length bounds, and regex ID checks (`^[a-zA-Z0-9_\-]+$`).
4. **License Redemption Integrity (`/licenses/{licenseKey}` & `/entitlements/{userId}`)**:
   - Only verified Admins (Firebase Custom Claim `admin == true` or `/admins/{uid}`) may create, list, revoke, or delete `/licenses/{licenseKey}`.
   - Regular users may ONLY `get` an unclaimed (`redeemedByUid == ""`) or self-owned license key, and may ONLY claim an `ACTIVE` unclaimed key by setting `redeemedByUid = request.auth.uid` atomically with their `/entitlements/{userId}` update (`getAfter()` verification prevents self-assigned PRO/LIFETIME/ADMIN escalation).
5. **Temporal Integrity**: `createdAt` on create and `updatedAt` on create/update must strictly equal `request.time`.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Write**: `auth = null` attempting any read/write on `/workspaces`, `/licenses`, `/entitlements`.
2. **Unverified Email Spoof**: `auth = { uid: 'u1', token: { email: 'admin@example.com', email_verified: false } }` attempting admin operations.
3. **Cross-User Workspace Write**: `auth = { uid: 'attacker' }` writing `/workspaces/victim`.
4. **Self-Assigned PRO Escalation**: Regular user creating `/entitlements/u1` with `plan: 'PRO'` without atomically claiming a matching `ACTIVE` `/licenses/{key}`.
5. **Admin Spoof Escalation**: Regular user creating `/entitlements/u1` with `plan: 'ADMIN'` or creating `/admins/u1`.
6. **Shadow / Ghost Field Injection**: Adding unauthorized keys like `isVerified: true` to `/workspaces` or `/entitlements`.
7. **License Hijack (Double Claim)**: User B trying to update `/licenses/KEY1` after User A already claimed `redeemedByUid`.
8. **Revoked License Claim**: User attempting to claim a license whose `status == 'REVOKED'`.
9. **Oversized ID / Poisoning**: Path exceeding 128 characters or `payloadJson > 900000`.
10. **Immutable Field Mutation**: Mutating `createdAt`, `ownerId`, `licenseKey`, or `createdByUid` on update.
11. **Blanket Collection Enumeration**: Non-admin running `list` on `/workspaces`, `/licenses`, or `/entitlements`.
12. **Client-Forged Timestamps**: Passing custom past timestamps instead of `request.time`.
