#!/usr/bin/env python3
"""
TallyNX Desk Responsive Smoke Test (Mobile & Tablet Regression Guard)
Verifies workflow navigation, responsive layout, and clickable drawers/modals
with seeded trade records across mobile (375px) and tablet (768px-1024px).

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

  for (const cockpit of document.querySelectorAll('.live-cockpit')) {
    const { height } = cockpit.getBoundingClientRect();
    if (height < 60) issues.push(`live-cockpit crushed: height=${Math.round(height)}px`);
    if (cockpit.scrollHeight > cockpit.clientHeight + 2) {
      issues.push(`live-cockpit vertical clipping: scrollHeight=${cockpit.scrollHeight}px, clientHeight=${cockpit.clientHeight}px`);
    }
  }

  const trafficStrip = document.querySelector('.site-traffic-strip');
  if (trafficStrip) {
    const tr = trafficStrip.getBoundingClientRect();
    if (tr.width > 0 && tr.height > 0) {
      for (const sibling of document.querySelectorAll('.live-cockpit, .desk-kpi-band, .analysis-overview-grid, .analysis-week-strip')) {
        const sr = sibling.getBoundingClientRect();
        if (sr.width <= 0 || sr.height <= 0) continue;
        const xOverlap = Math.min(tr.right, sr.right) - Math.max(tr.left, sr.left);
        const yOverlap = Math.min(tr.bottom, sr.bottom) - Math.max(tr.top, sr.top);
        if (xOverlap > 1 && yOverlap > 1) {
          issues.push(`site-traffic-strip overlaps ${sibling.className.split(' ')[0]} (${Math.round(yOverlap)}px)`);
        }
      }
    }
  }

  const cardRadii = [];
  for (const card of document.querySelectorAll('.live-cockpit, .desk-kpi-band > .fx-stat-card, .analysis-overview-main, .risk-posture, .analysis-week-strip, .site-traffic-strip, .review-diagnostics, .prop-autopsy, .comex-bridge, .risk-supervision, .prop-dossier.card, .proprules-firms')) {
    const r = card.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const radius = parseFloat(getComputedStyle(card).borderTopLeftRadius);
    if (Number.isFinite(radius)) cardRadii.push([card.className.split(' ')[0], Math.round(radius)]);
  }
  if (cardRadii.length >= 2) {
    const expected = cardRadii[0][1];
    for (const [name, radius] of cardRadii.slice(1)) {
      if (Math.abs(radius - expected) > 1) {
        issues.push(`card border-radius mismatch: ${name}=${radius}px vs ${cardRadii[0][0]}=${expected}px`);
        break;
      }
    }
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

            nav = page.locator(".fx-mobile-bottom-nav")
            mobile = nav.is_visible()
            more = nav.locator('[data-pillar="more"]')
            more_sheet = nav.locator(".fx-mobile-more-sheet")

            def click_pillar(pillar, section):
                rail = nav if mobile else page.locator(".fx-sidebar-nav")
                if mobile and pillar in ("rules", "mall", "settings"):
                    more.click(timeout=5000)
                    more_sheet.wait_for(state="visible", timeout=5000)
                    check(f"more_open_{pillar}")
                rail.locator(f'[data-pillar="{pillar}"]').click(timeout=5000)
                page.locator(f"#{section}").wait_for(state="visible", timeout=10000)
                if mobile and pillar in ("rules", "mall", "settings"):
                    more_sheet.wait_for(state="hidden", timeout=5000)
                    assert "active" in more.get_attribute("class").split()

            def click_subtab(section, element_id=None):
                page.locator(f'.workspace-subtabs [data-section="{section}"]').click(timeout=5000)
                page.locator(f"#{element_id or section}").wait_for(state="visible", timeout=10000)

            click_pillar("desk", "sec-accounts")
            check("desk_overview")
            for view in ("performance", "calendar", "account"):
                page.locator(f"#analysis-view-{view}-tab").click(timeout=5000)
                check(f"desk_{view}")

            click_pillar("plan", "tv-chart-root")
            check("plan_chart")
            click_subtab("calculator-root")
            check("plan_calculator")
            click_subtab("desk-cards-root")
            check("plan_12_gate")
            for index, label in ((1, "gates_matrix"), (2, "gates_golden_rules")):
                page.locator("#desk-cards-root .fx-folder-tab").nth(index).click(timeout=5000)
                check(label)

            click_pillar("quant", "sec-quant-risk")
            page.locator("#sec-quant-risk .risk-sv-market select").last.select_option("1h")
            check("quant_ai_risk")
            click_subtab("sec-comex-bridge")
            check("quant_comex")

            click_pillar("review", "sec-review-autopsy")
            check("review_autopsy")
            click_subtab("journal-root")
            check("review_journal")

            if mobile:
                more.click(timeout=5000)
                page.keyboard.press("Escape")
                more_sheet.wait_for(state="hidden", timeout=5000)
                assert more.evaluate("(button) => button === document.activeElement")
                more.click(timeout=5000)
                page.locator("#main-topbar").click(position={"x": 3, "y": 3}, timeout=5000)
                more_sheet.wait_for(state="hidden", timeout=5000)

            click_pillar("rules", "sec-proprules")
            check("rules")
            click_pillar("mall", "sec-mall")
            check("mall_floor")
            page.locator(".mall-inspector-toggle").click(timeout=5000)
            page.wait_for_timeout(300)
            check("mall_drawer")
            page.locator(".mall-inspector header button").first.click(timeout=5000)
            page.wait_for_timeout(250)

            click_subtab("sec-marketplace", "sec-market")
            check("mall_market")

            click_pillar("settings", "sec-settings")
            for tab in ("display", "keys", "accounts", "sync"):
                page.locator(f"#settings-{tab}-tab").click(timeout=5000)
                page.locator(f"#settings-{tab}-panel").wait_for(state="visible", timeout=5000)
                check(f"settings_{tab}")
            page.evaluate("() => { const m = document.querySelector('main.container'); if (m) m.scrollTop = 420; }")
            check("settings_scrolled")

            # MT5 Modal from Settings Sync
            page.locator("#settings-mt5-bridge").click(timeout=5000)
            page.wait_for_timeout(300)
            check("mt5_modal")
            page.keyboard.press("Escape")
            page.wait_for_timeout(200)

            # Command Palette opens the requested Settings tab.
            page.keyboard.press("Control+k")
            palette = page.locator(".cmd-palette-input")
            palette.fill("AI & Keys", timeout=5000)
            palette.press("Enter")
            page.wait_for_selector(".cmd-palette-input", state="detached", timeout=5000)
            page.locator("#settings-keys-panel").wait_for(state="visible", timeout=5000)

            # 7. Right Dock (AI Coach) open + topbar toggle clickability + backdrop dismiss on tablet
            click_pillar("desk", "sec-accounts")
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
