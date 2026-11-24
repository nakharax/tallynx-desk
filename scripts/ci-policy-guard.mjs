#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

const SCAN_ROOTS = ['src', 'api', 'public', 'server.ts', 'server', 'worker', 'index.html'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.html', '.json', '.md']);

const FORBIDDEN_CLAIMS = [
  { name: 'guaranteed profit', re: /\bguaranteed?\s+profit\b/i },
  { name: 'guaranteed pass', re: /\bguaranteed?\s+pass\b/i },
  { name: 'risk-free', re: /\brisk[- ]free\b/i },
  { name: 'zero-risk', re: /\bzero[- ]risk\b/i },
  { name: 'no-loss', re: /\bno[- ]loss\b/i },
  { name: 'กำไรแน่นอน', re: /กำไรแน่นอน/i },
  { name: 'ผ่านแน่นอน', re: /ผ่านแน่นอน/i },
  { name: 'รับประกันกำไร', re: /รับประกันกำไร/i },
  { name: 'รับประกันผ่าน', re: /รับประกันผ่าน/i },
  { name: 'ไม่มีความเสี่ยง', re: /ไม่มีความเสี่ยง/i },
  { name: 'ไร้ความเสี่ยง', re: /ไร้ความเสี่ยง/i },
  { name: 'ไม่มีวันขาดทุน', re: /ไม่มีวันขาดทุน/i },
  { name: 'รวยแน่นอน', re: /รวยแน่นอน/i },
];

const LEGACY_BRAND_PATTERNS = [
  { name: 'legacy brand (xpfirm)', re: /\bxpfirm\b/i },
  { name: 'legacy brand (nakharax)', re: /\bnakharax\b/i },
];

function isAllowlisted(relPath, ruleName, lineText) {
  const norm = relPath.replace(/\\/g, '/');
  if (norm === 'src/utils/geminiOrchestrator.ts' || norm === 'api/server.bundle.js') {
    // The fallback intent detector matches this phrase to decline the request.
    if (ruleName === 'กำไรแน่นอน' && /^(?:const heuristicSignal = )?\/\([^/]+\)\/i\.test\($/.test(lineText.trim())) {
      return true;
    }
    return lineText.includes('asksForTradeSignal') || lineText.includes('guaranteed profit');
  }
  if (norm.endsWith('.test.ts') && lineText.includes('assert.')) {
    return true;
  }
  return false;
}

function collectFiles(entry) {
  const full = path.join(REPO_ROOT, entry);
  if (!fs.existsSync(full)) return [];
  const stat = fs.statSync(full);
  if (stat.isFile()) return [full];
  const out = [];
  for (const name of fs.readdirSync(full)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const childRel = path.join(entry, name);
    const childFull = path.join(REPO_ROOT, childRel);
    const cStat = fs.statSync(childFull);
    if (cStat.isDirectory()) {
      out.push(...collectFiles(childRel));
    } else if (EXTENSIONS.has(path.extname(name))) {
      out.push(childFull);
    }
  }
  return out;
}

function git(...args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function checkEaBinaryParity() {
  const binRel = 'scripts/TredynLiveBridge.ex5';
  const srcRel = 'scripts/TredynLiveBridge.mq5';
  const binPath = path.join(REPO_ROOT, binRel);
  const srcPath = path.join(REPO_ROOT, srcRel);

  if (!fs.existsSync(binPath)) return [`Missing shipped binary: ${binRel}`];
  if (!fs.existsSync(srcPath)) return [`Missing EA source: ${srcRel}`];

  const binBytes = fs.readFileSync(binPath);
  if (binBytes.length === 0) return [`Empty EA binary: ${binRel}`];
  for (const rel of [srcRel, binRel]) {
    const publicRel = `public/${rel}`;
    const publicPath = path.join(REPO_ROOT, publicRel);
    if (!fs.existsSync(publicPath)) return [`Missing public EA file: ${publicRel}`];
    if (!fs.readFileSync(publicPath).equals(fs.readFileSync(path.join(REPO_ROOT, rel)))) {
      return [`Public EA file differs from its canonical copy: ${publicRel}`];
    }
  }
  const sha = crypto.createHash('sha256').update(binBytes).digest('hex').slice(0, 16);

  const binCommit = git('log', '-1', '--format=%H', '--', binRel);
  const srcCommit = git('log', '-1', '--format=%H', '--', srcRel);
  if (!binCommit) return [`${binRel} is not tracked in git`];
  if (!srcCommit) return [`${srcRel} is not tracked in git`];

  const dirtyBin = Boolean(git('status', '--porcelain', '--', binRel));
  if (!dirtyBin && srcCommit !== binCommit) {
    let stale = false;
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', srcCommit, binCommit], {
        cwd: REPO_ROOT,
        stdio: 'ignore',
      });
    } catch {
      stale = true;
    }
    if (stale) {
      return [
        `Stale EA binary: ${srcRel} (${srcCommit.slice(0, 8)}) has newer commits than ${binRel} (${binCommit.slice(0, 8)})`,
      ];
    }
  }
  console.log(`[PASS] EA Binary Parity: ${binRel} (sha256:${sha}, commit:${binCommit.slice(0, 8)})`);
  return [];
}

function main() {
  const files = SCAN_ROOTS.flatMap(collectFiles);
  const violations = [];

  for (const file of files) {
    const rel = path.relative(REPO_ROOT, file);
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, idx) => {
      for (const rule of [...FORBIDDEN_CLAIMS, ...LEGACY_BRAND_PATTERNS]) {
        if (rule.re.test(line) && !isAllowlisted(rel, rule.name, line)) {
          violations.push(`${rel}:${idx + 1} [${rule.name}] -> ${line.trim()}`);
        }
      }
    });
  }

  console.log(`[INFO] Audited ${files.length} files for Legal Safe Harbor & Brand Hygiene`);
  const eaErrors = checkEaBinaryParity();
  const allErrors = [...violations, ...eaErrors];

  if (allErrors.length > 0) {
    console.error('[FAIL] Policy Guard detected violations:');
    allErrors.forEach((v) => console.error(`  - ${v}`));
    process.exit(1);
  }
  console.log('[PASS] All Tredyn Desk CI policy gates passed cleanly.');
}

main();
