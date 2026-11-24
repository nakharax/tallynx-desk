# Changelog

All notable changes to **TallyNX Desk & Mall** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Industry-standard Open-Source Governance suite (`LICENSE`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`).
- GitHub automation and contribution templates: `CODEOWNERS`, `PULL_REQUEST_TEMPLATE.md`, structured YAML Issue Forms, and grouped `dependabot.yml`.
- Conventional Commit PR title validation and sensitive-path / diff-size guardrails (`.github/workflows/pr-hygiene.yml`).
- Automated Semantic Release workflow (`.github/workflows/release.yml`) with categorized release notes and build checksum metadata.

### Security
- Scoped Vercel deployment secrets strictly to trusted `deploy-preview` and `deploy-production` jobs in `.github/workflows/deploy-vercel.yml`, keeping all external fork PR CI gates strictly read-only with zero secret exposure.

---

## [5.0.0] - 2026-11-24

### Added
- **TallyNX Desk & Mall Open-Source Baseline:** Institutional prop-firm risk management terminal and community marketplace.
- **3-TP Ladder & Risk Engine:** Decimal-precision (`decimal.js`) position sizing, multi-target scaling, and drawdown guardrails.
- **30-Second Statement Autopsy:** Rapid forensic ingestion for MT4/MT5 statements, CSV, and XLSX exports with behavioral pattern detection.
- **News Blackout Radar:** High-impact macro event tracking for prop-firm news-window awareness.
- **Non-Custodial MT5 Live Bridge:** Read-only local telemetry exporter (`scripts/TredynLiveBridge.mq5` / `.ex5`) with CI binary parity verification.
- **Fail-Closed Sentinel CI:** Deterministic 6-gate release pipeline covering Gitleaks secret scanning, Safe Harbor & brand policy auditing, TypeScript type-checking, unit tests, Playwright mobile/tablet responsive smoke tests, and Vercel production health verification.

[Unreleased]: https://github.com/nakharax/tallynx-desk/compare/v5.0.0...HEAD
[5.0.0]: https://github.com/nakharax/tallynx-desk/releases/tag/v5.0.0
