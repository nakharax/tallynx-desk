# Security Policy

TallyNX Desk & Mall is engineered around a **strictly non-custodial, least-privilege security model**. We appreciate the security community's help in keeping our users and contributors safe.

---

## Supported Versions

| Version | Supported |
| :--- | :---: |
| `5.x` (current `master`) | Yes |
| `< 5.0` | No |

---

## Non-Custodial Threat Model

TallyNX Desk & Mall is a Pure SaaS analytical and behavioral risk management platform:

1. **Zero Custody & Zero Order Execution**
   - TallyNX never holds user funds, never requests broker passwords, and never executes live trades.
   - The optional MT5 bridge (`scripts/TredynLiveBridge.mq5` / `.ex5`) operates strictly as a **read-only local telemetry exporter** verified in CI for source-to-binary parity.
2. **Data Isolation & Access Controls**
   - Cloud workspaces (`/workspaces/{userId}`) enforce strict Firebase Auth UID ownership and verified email checks (`request.auth.uid == userId && request.auth.token.email_verified == true`).
   - License redemption (`/licenses/{licenseKey}` and `/entitlements/{userId}`) enforces atomic single-claim transitions and strict field allowlists to prevent privilege escalation or document poisoning.
3. **CI/CD & Supply-Chain Hardening**
   - Every commit and PR is scanned with a SHA-256 checksum-verified Gitleaks binary (`secret-scan`).
   - External fork Pull Requests run CI strictly with `contents: read` and **zero access to deployment secrets**.
   - Production deployments are gated behind a fail-closed `sentinel-ci` receipt and `CODEOWNERS` review.

---

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

Instead, please report them privately using one of the following channels:

1. **GitHub Private Vulnerability Reporting (Preferred):**  
   Navigate to the repository's **Security → Advisories → Report a vulnerability** page at:  
   `https://github.com/nakharax/tallynx-desk/security/advisories/new`
2. **Direct Maintainer Contact:**  
   If you cannot use GitHub Security Advisories, contact the repository maintainers via the contact channel listed on the organization profile (`@nakharax`).

### What to Include
- Affected file(s), endpoint(s), or Firestore rule(s)
- Clear step-by-step reproduction instructions or proof-of-concept payload
- Estimated security impact (e.g., cross-tenant data access, privilege escalation, secret exposure, XSS/CSRF)
- Suggested remediation (optional)

### Response Timeline
- **Acknowledgement:** Within **48 hours**
- **Initial Triage & Severity Assessment:** Within **7 calendar days**
- **Remediation & Coordinated Disclosure:** We will work with you on a fix timeline and credit you in the release notes (unless you prefer to remain anonymous).

---

## Strictly Out-of-Scope Claims

The following categories are **out of scope** for security vulnerability reports:

- Trading losses, prop-firm evaluation failures, or user risk-sizing decisions
- Third-party broker, MT5 terminal, or prop-firm platform outages and latency
- Findings requiring physical access to an unlocked user device or compromised local OS
- Self-XSS or social engineering / phishing attacks targeting users or maintainers
- Volumetric denial-of-service (DDoS) or brute-force attempts against third-party managed infrastructure (Vercel, Firebase, GitHub) without a concrete application-level bypass
- Reports generated purely by automated scanners without verified exploitability or impact
- Public client-side Firebase configuration identifiers (such as `firebase-applet-config.json`), which are intentionally public and protected by Firestore Security Rules
