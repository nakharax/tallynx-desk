# Contributing to TallyNX Desk & Mall

Thank you for contributing to **TallyNX Desk & Mall**! We follow an industry-standard, deterministic open-source workflow designed for correctness, safety, and reproducibility.

> **สรุปขั้นตอนสำหรับนักพัฒนาไทย (Thai Quick Steps):**  
> 1) Fork & สร้าง Branch (`feat/*`, `fix/*`, `perf/*`, `docs/*`) → 2) เขียนโค้ดและรันคำสั่งตรวจ Local Gates ครบ 4 ตัว (`lint`, `test`, `ci-policy-guard.mjs`, `build`) → 3) Commit ตามมาตรฐาน Conventional Commits → 4) Push และเปิด Pull Request เพื่อรอ Owner Review & Merge → 5) ระบบ Auto CI, Release และ Production Update จะทำงานให้อัตโนมัติหลัง Merge เข้า `master`

---

## End-to-End Contributor Workflow

```text
create branch -> coding -> commit -> push -> PR (owner review & merge) -> Auto CI -> Release -> Production Update
```

### 1. Fork & Create a Branch

Always branch from the latest `master` using a descriptive prefix:

| Prefix | Use Case | Example |
| :--- | :--- | :--- |
| `feat/` | New user-facing feature or capability | `feat/news-blackout-filter` |
| `fix/` | Bug fix or behavioral regression fix | `fix/drawdown-decimal-rounding` |
| `perf/` | Performance or bundle-size optimization | `perf/autopsy-csv-streaming` |
| `docs/` | Documentation, governance, or guides | `docs/mt5-bridge-setup` |
| `refactor/` | Internal code restructuring without behavior change | `refactor/risk-engine-types` |
| `test/` | Adding or strengthening automated tests | `test/3tp-ladder-edge-cases` |
| `chore/` | Tooling, dependencies, or CI maintenance | `chore/bump-vite-config` |

```bash
git checkout master
git pull origin master
git checkout -b feat/your-feature-name
```

### 2. Code & Follow Engineering Standards

- **Correctness > Safety > Reproducibility > Performance > Speed**
- Use `decimal.js` for all monetary, lot-size, pip, and drawdown calculations—never rely on raw IEEE-754 floating-point math for financial risk figures.
- Maintain **strict Legal Safe Harbor compliance**: never introduce trade signals, buy/sell recommendations, or promises of trading outcomes.
- Maintain **non-custodial boundaries**: never add code that requests broker passwords, private keys, or automated order-execution hooks.
- Never commit secrets, `.env.local` files, or production credentials.

### 3. Run Mandatory Local Quality Gates

Every pull request must pass all four local checks before pushing:

```bash
# 1. TypeScript type-checking (zero errors)
npm run lint

# 2. Unit test suite
npx tsx --test src/utils/*.test.ts

# 3. Safe Harbor, Brand Hygiene & MT5 Bridge Binary Parity
node scripts/ci-policy-guard.mjs

# 4. Production build (Vite + API bundle)
npm run build
```

If your change affects responsive layout, theme contrast, or navigation, also run:

```bash
npm run test:responsive
```

### 4. Commit Using Conventional Commits

Both commit messages and Pull Request titles must follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/):

```text
<type>(<optional-scope>): <imperative lowercase summary>
```

Allowed types (enforced automatically by `.github/workflows/pr-hygiene.yml`):
- `feat:` — New feature (triggers a **minor** semantic version bump on release)
- `fix:` — Bug fix (triggers a **patch** semantic version bump on release)
- `perf:` — Performance improvement (triggers a **patch** bump)
- `refactor:` — Code refactor without behavior change
- `docs:` — Documentation only
- `test:` — Tests only
- `chore:` — Maintenance / dependencies
- `ci:` — CI/CD workflow changes
- `build:` — Build system changes
- `style:` — Formatting / whitespace only
- `revert:` — Reverts a previous commit

For breaking changes, append `!` after the type/scope (e.g., `feat(api)!: change telemetry payload schema`) and include a `BREAKING CHANGE:` footer.

**Examples:**
```bash
git commit -m "feat(ladder): add partial close fee adjustment to 3-TP calculator"
git commit -m "fix(autopsy): handle UTF-8 BOM in MT5 CSV exports"
git commit -m "docs(contributing): document local policy guard command"
```

### 5. Push & Open a Pull Request

```bash
git push -u origin feat/your-feature-name
```

Open a Pull Request targeting `master` and complete every section of `.github/PULL_REQUEST_TEMPLATE.md`:
- Clear summary & linked issue
- Type of change
- Local testing evidence
- Safe Harbor & Zero-Secrets verification
- Responsive / theme verification (if UI changed)

### 6. Automated CI, Owner Review & Merge

Once your PR is opened:
1. **PR Hygiene (`pr-hygiene.yml`)** validates your Conventional Commit PR title and flags oversized diffs or sensitive path modifications (`.github/`, `scripts/`, `server.ts`, `firestore.rules`, `src/services/`).
2. **Sentinel CI (`deploy-vercel.yml`)** runs fail-closed verification:
   - `secret-scan` (Gitleaks SHA-256 verified binary)
   - `policy-audit` (`scripts/ci-policy-guard.mjs`)
   - `verify-and-build` (`tsc --noEmit`, `tsx --test`, `npm run build`)
   - `responsive-smoke` (Playwright Chromium mobile & tablet check)
   - `sentinel-ci` (aggregates deterministic pass/fail receipt)
3. **Code Owner Review (`.github/CODEOWNERS`)**: `@nakharax` reviews and approves the PR.
4. **Merge**: Maintainers squash-merge or merge into `master` once all required checks are green.

> **Draft PRs:** Heavy CI jobs are deferred on draft PRs until marked ready for review (or labeled `ci:run` / `ci:full`), while secret scanning always runs immediately.

### 7. Automated Release & Production Update

After merge into `master`:
- **Vercel Production Deployment** runs automatically once `sentinel-ci` passes, followed by a live HTTP 200 verification against `/api/health`.
- **Automated GitHub Release (`release.yml`)** computes the next Semantic Version from Conventional Commits (or uses an explicit `v*.*.*` tag / manual dispatch), generates categorized release notes, and publishes build checksum metadata.

---

## Modifying the MT5 Bridge (`scripts/TredynLiveBridge.mq5`)

If you modify `scripts/TredynLiveBridge.mq5`, you must recompile `scripts/TredynLiveBridge.ex5` and sync both canonical copies under `public/scripts/` so `node scripts/ci-policy-guard.mjs` passes its SHA-256 binary parity check.

---

## Community & Conduct

All contributors are expected to abide by our [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). For security-sensitive issues, please follow [SECURITY.md](SECURITY.md) rather than opening a public issue or PR.
