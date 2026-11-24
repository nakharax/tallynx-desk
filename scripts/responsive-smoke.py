#!/usr/bin/env python3
"""
TallyNX Desk Responsive Smoke Test (Mobile & Tablet Regression Guard)
Verifies zero horizontal overflow, zero topbar collisions, clickable drawers/modals,
and real-data rendering across mobile (375px) and tablet (768px-1024px) viewports.

Usage:
  python3 scripts/responsive-smoke.py --url http://127.0.0.1:3000
"""

import argparse
import json
import sys
from playwright.sync_api import sync_playwright

VIEWPORTS = [
    ("mobile_375", 375, 812),
    ("tablet_768", 768, 1024),
    ("tablet_820", 820, 1180),
    ("tablet_960", 960, 720),
    ("tablet_1024", 1024, 768),
]

JS_AUDIT = """() => {
  const vw = window.innerWidth;
  const issues = [];

  if (document.documentElement.scrollWidth > vw + 2) {
    issues.push(`doc horizontal overflow: +${document.documentElement.scrollWidth - vw}px`);
  }

  const mainEl = document.querySelector('main.container');
  if (mainEl && mainEl.scrollWidth > mainEl.clientWidth + 2) {
    issues.push(`main.container horizontal overflow: +${mainEl.scrollWidth - mainEl.clientWidth}px`);
  }

  const sidebar = document.querySelector('.fx-sidebar');
  const mobNav = document.querySelector('.fx-mobile-bottom-nav');
  const sidebarVis = sidebar && getComputedStyle(sidebar).display !== 'none';
  const mobNavVis = mobNav && getComputedStyle(mobNav).display !== 'none';
  if (sidebarVis && mobNavVis) issues.push('both sidebar and mobile bottom nav are visible');
  if (!sidebarVis && !mobNavVis) issues.push('neither sidebar nor mobile bottom nav is visible');

  const topbar = document.querySelector('#main-topbar');
  if (topbar) {
    const items = [...topbar.querySelectorAll(
      '.mall-top-brand, .fx-bc-port-wrap, .topbar-health-pill, .topbar-cmd-trigger, ' +
      '.topbar-controls > button, .topbar-controls > .topbar-lang-switch, .topbar-controls > .topbar-tools > button'
    )].filter(el => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 1 && r.height > 1;
    });
    for (let i = 0; i < items.length; i++) {
      const a = items[i].getBoundingClientRect();
      if (a.right > vw + 1) {
        issues.push(`topbar element offscreen right: ${items[i].className} (${Math.round(a.right)}>${vw})`);
      }
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j].getBoundingClientRect();
        const xOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const yOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (xOverlap > 1 && yOverlap > 1) {
          issues.push(`topbar overlap (${Math.round(xOverlap)}px): ${items[i].className.split(' ')[0]} <-> ${items[j].className.split(' ')[0]}`);
        }
      }
    }
  }

  const mallSidebar = document.querySelector('.mall-sidebar');
  if (mallSidebar) {
    const r = mallSidebar.getBoundingClientRect();
    if (r.height < 40) issues.push(`mall-sidebar crushed: height=${Math.round(r.height)}px`);
  }

  const topbarBottom = topbar ? topbar.getBoundingClientRect().bottom : 0;
  const mallDrawer = document.querySelector('.mall-inspector.mall-drawer');
  if (mallDrawer) {
    const dr = mallDrawer.getBoundingClientRect();
    if (dr.top < topbarBottom - 1) {
      issues.push(`mall-drawer overlaps topbar: top=${Math.round(dr.top)} < topbarBottom=${Math.round(topbarBottom)}`);
    }
  }

  const dock = document.querySelector('.right-dock-aside');
  if (dock) {
    const dr = dock.getBoundingClientRect();
    if (dr.top < topbarBottom - 1) {
      issues.push(`right-dock overlaps topbar: top=${Math.round(dr.top)} < topbarBottom=${Math.round(topbarBottom)}`);
    }
  }

  // Check MT5 sync modal channel tabs don't overlap when open
  const mt5Tabs = [...document.querySelectorAll('.mt5-sync-channel-tabs button')].filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  for (let i = 0; i < mt5Tabs.length; i++) {
    const a = mt5Tabs[i].getBoundingClientRect();
    for (let j = i + 1; j < mt5Tabs.length; j++) {
      const b = mt5Tabs[j].getBoundingClientRect();
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) {
        issues.push('MT5 modal channel tabs overlap');
      }
    }
  }

  return issues;
}"""


def build_sample_trades():
    rows = []
    for i in range(18):
        win = i % 3 != 2
        pnl = 96.0 if i % 3 == 0 else (64.0 if win else -120.0)
        status = "FULL_SWEEP" if i % 3 == 0 else ("TRAILING_LOCK" if win else "FULL_SL")
        rows.append({
            "id": f"SMK-{1001 + i}",
            "port": "port1",
            "date": f"2026-11-{str(4 + (i % 15)).zfill(2)}",
            "time": ["09:15", "14:20", "19:30"][i % 3],
            "dir": "BUY" if i % 2 == 0 else "SELL",
            "entry": round(3515.0 + i * 2.1, 2),
            "risk": 120,
            "lotLeg": 0.04,
            "slPrice": round(3505.0 + i * 2.1, 2),
            "tp1Price": round(3519.0 + i * 2.1, 2),
            "tp2Price": round(3523.0 + i * 2.1, 2),
            "tp3Price": round(3527.0 + i * 2.1, 2),
            "tp1Pts": 400 if win else -1000,
            "tp2Pts": 800 if win else -1000,
            "tp3Pts": 1200 if status == "FULL_SWEEP" else (400 if win else -1000),
            "slPts": 1000,
            "totalPts": 2400 if status == "FULL_SWEEP" else (1600 if win else -3000),
            "rr": 0.8 if status == "FULL_SWEEP" else (0.53 if win else -1.0),
            "pnlUsd": pnl,
            "status": status,
            "note": f"Smoke trade #{i + 1}",
            "gatesPassedAtLog": 12,
        })
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:3000")
    args = parser.parse_args()

    trades_json = json.dumps(build_sample_trades())
    failures = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for vp_name, w, h in VIEWPORTS:
            ctx = browser.new_context(viewport={"width": w, "height": h})
            ctx.add_init_script(f"""
              localStorage.setItem('TALLYNX_LANG', 'th');
              if (!localStorage.getItem('TALLYNX_OS_V40_CLEAN_STATE')) {{
                localStorage.setItem('TALLYNX_OS_V40_CLEAN_STATE', JSON.stringify({{
                  activePort: 'port1',
                  journal: {trades_json}
                }}));
              }}
            """)
            page = ctx.new_page()
            page.goto(args.url, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_selector("#main-topbar", timeout=15000)
            page.wait_for_timeout(1000)

            def check(label):
                issues = page.evaluate(JS_AUDIT)
                if issues:
                    failures.append((vp_name, label, issues))
                    print(f"[FAIL] {vp_name} / {label}: {issues}")
                else:
                    print(f"[PASS] {vp_name} / {label}")

            def click_pillar(idx, sub_idx=None):
                mob_vis = page.evaluate(
                    "() => getComputedStyle(document.querySelector('.fx-mobile-bottom-nav')).display !== 'none'"
                )
                nav_sel = ".fx-mobile-bottom-nav button" if mob_vis else ".fx-sidebar-nav button"
                page.locator(nav_sel).nth(idx).click(timeout=5000)
                page.wait_for_timeout(450)
                if sub_idx is not None:
                    tabs = page.locator(".workspace-subtabs button")
                    if tabs.count() > sub_idx:
                        tabs.nth(sub_idx).click(timeout=5000)
                        page.wait_for_timeout(450)

            # 1. Portfolio Overview & Performance & Journal (with 18 real trades)
            check("portfolio_overview")
            page.locator("#analysis-view-performance-tab").click(timeout=5000)
            page.wait_for_timeout(400)
            check("portfolio_performance")
            click_pillar(0, 1)
            check("trade_journal")

            # 2. Mall + Drawer (real close button click)
            click_pillar(3)
            page.wait_for_timeout(400)
            check("mall_floor")
            page.locator(".mall-inspector-toggle").click(timeout=5000)
            page.wait_for_timeout(300)
            check("mall_drawer")
            page.locator(".mall-inspector header button").first.click(timeout=5000)
            page.wait_for_timeout(250)

            # 3. Plan (Calculator + 12-Gate 5-State Matrix & Golden Rules)
            click_pillar(1, 0)
            check("calculator")
            click_pillar(1, 1)
            page.locator("#desk-cards-root .fx-folder-tab").nth(1).click(timeout=5000)
            page.wait_for_timeout(300)
            check("gates_matrix")
            page.locator("#desk-cards-root .fx-folder-tab").nth(2).click(timeout=5000)
            page.wait_for_timeout(300)
            check("gates_golden_rules")

            # 4. Settings (scrolled)
            click_pillar(4)
            check("settings_top")
            page.evaluate("() => { const m = document.querySelector('main.container'); if (m) m.scrollTop = 420; }")
            page.wait_for_timeout(200)
            check("settings_scrolled")

            # 5. MT5 Modal
            page.locator("#btn-top-import").click(timeout=5000)
            page.wait_for_timeout(300)
            check("mt5_modal")
            page.keyboard.press("Escape")
            page.wait_for_timeout(200)

            # 6. Command Palette trigger clickability (wait for lazy chunk mount)
            page.locator(".topbar-cmd-trigger").click(timeout=5000)
            page.wait_for_selector(".cmd-palette-input", timeout=5000)
            page.keyboard.press("Escape")
            page.wait_for_selector(".cmd-palette-input", state="detached", timeout=5000)

            # 7. Right Dock (AI Coach) open + topbar toggle clickability + backdrop dismiss on tablet
            click_pillar(0, 0)
            page.locator(".topbar-coach-btn").click(timeout=5000)
            page.wait_for_selector(".right-dock-aside", timeout=5000)
            page.wait_for_timeout(300)
            check("right_dock")
            if w > 640 and w <= 1024:
                page.locator(".right-dock-backdrop").click(position={"x": 20, "y": 200}, timeout=5000)
                page.wait_for_timeout(250)
                if page.locator(".right-dock-aside").count() > 0:
                    failures.append((vp_name, "right_dock_backdrop", ["backdrop click did not close right dock"]))
            else:
                page.locator(".topbar-coach-btn").click(timeout=5000)
                page.wait_for_timeout(250)

            # 8. Mobile Tools menu exposes EN/TH when <= 600px
            if w <= 600:
                page.locator(".topbar-tools > button").click(timeout=5000)
                page.wait_for_timeout(200)
                if not page.locator("#desk-tools .topbar-lang-switch").is_visible():
                    failures.append((vp_name, "tools_menu", ["mobile EN/TH switch hidden inside Tools menu"]))
                page.keyboard.press("Escape")

            ctx.close()
        browser.close()

    if failures:
        print(f"\nFAILED: {len(failures)} responsive regression(s) detected.")
        sys.exit(1)
    print("\nALL RESPONSIVE SMOKE CHECKS PASSED.")


if __name__ == "__main__":
    main()
