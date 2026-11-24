# TallyNX Desk & Mall — Open-Source Launch & Operations Checklist

> **Repository:** `nakharax/tallynx-desk`  
> **Baseline:** Clean single-commit public release (`v5.0.2`)  
> **Governance:** MIT License · Non-Custodial Pure SaaS · Fork-Safe Sentinel CI

---

## 1. Security & Hygiene Baseline (Verified)

- **Clean Public History:** Published from a verified single-commit baseline with zero internal infrastructure IPs, zero personal email addresses, and zero server secrets in git history or tracked files.
- **Env-Only Backend Configuration:** Optional external gateways (e.g., `FUNDEDNEXT_GATEWAY_URL`) fail closed (`503 GATEWAY_UNCONFIGURED`) when unset.
- **Claim-Based Admin Authorization:** Firestore rules enforce Firebase Auth custom claims (`request.auth.token.admin == true`) and `/admins/{uid}` documents, while client UI bootstrap overrides are configured exclusively via `VITE_BOOTSTRAP_ADMIN_EMAILS`.
- **Non-Custodial MT5 Bridge Parity:** `scripts/TredynLiveBridge.mq5` and `scripts/TredynLiveBridge.ex5` are verified for source-to-binary parity on every PR via `node scripts/ci-policy-guard.mjs`.
- **Fork-PR Secret Isolation:** External fork PRs run `secret-scan` (SHA-256 verified Gitleaks), `policy-audit`, `verify-and-build`, `responsive-smoke`, and `sentinel-ci` with strictly `contents: read` and zero secret access.

---

## 2. GitHub Repository Protection & Security Settings

### Enable Vulnerability Alerts & Automated Security Fixes
```bash
gh api --method PUT /repos/nakharax/tallynx-desk/vulnerability-alerts
gh api --method PUT /repos/nakharax/tallynx-desk/automated-security-fixes
```

### Enable Branch Protection on `master`
```bash
gh api --method PUT /repos/nakharax/tallynx-desk/branches/master/protection --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["sentinel-ci"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 1,
    "require_last_push_approval": false
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
EOF
```

---

## 3. Production Deployment Setup (Vercel + Firebase)

1. **GitHub Actions Secrets** (for `Deploy Master to Vercel Production` in `.github/workflows/deploy-vercel.yml`):
   ```bash
   gh secret set VERCEL_TOKEN --repo nakharax/tallynx-desk
   gh secret set VERCEL_TOKEN --env production --repo nakharax/tallynx-desk
   ```
   *(Create a Vercel Account Token at `https://vercel.com/account/tokens` scoped to the target team/account.)*
2. **Vercel Environment Variables:** Configure `GEMINI_API_KEY`, `VITE_BOOTSTRAP_ADMIN_EMAILS`, and optional gateway endpoints in Vercel Project Settings (never commit `.env.local`).
3. **Firebase Security Hardening:** Restrict the public web API key in Google Cloud Console by HTTP referrer (`https://desk.tallynx.com/*`) and enable Firebase App Check when scaling public traffic.
