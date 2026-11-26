export type DeskLanguage = 'en' | 'th';

export const DESK_LANG_STORAGE_KEY = 'TALLYNX_LANG';
export const LEGACY_WEB_LANG_STORAGE_KEY = 'tredyn_lang';

export function normalizeDeskLanguage(raw: unknown): DeskLanguage {
  const cleaned = String(raw || '').trim().toLowerCase();
  return cleaned === 'th' ? 'th' : 'en';
}

export function deskText(lang: DeskLanguage, english: string, thai: string): string {
  return lang === 'th' ? thai : english;
}

export function resolveInitialDeskLanguage(search: string = ''): DeskLanguage {
  try {
    if (search) {
      const params = new URLSearchParams(search);
      const urlLang = params.get('lang');
      if (urlLang === 'en' || urlLang === 'th') {
        return urlLang;
      }
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved =
        window.localStorage.getItem(DESK_LANG_STORAGE_KEY) ||
        window.localStorage.getItem(LEGACY_WEB_LANG_STORAGE_KEY);
      if (saved === 'en' || saved === 'th') {
        return saved;
      }
    }
  } catch {
    // ignore browser storage errors
  }
  return 'en';
}

const LEGACY_ACCOUNT_NAMES = new Map([
  ['พอร์ตหลัก · Prop $6K', 'Primary · Prop $6K'],
  ['พอร์ต 2 · Funded 90%', 'Port 2 · Funded 90%'],
  ['ยังไม่มีพอร์ต', 'No Account Yet'],
]);

export function formatAccountDisplayName(name: string, lang: DeskLanguage): string {
  if (lang === 'th') return name;
  return LEGACY_ACCOUNT_NAMES.get(name) ?? name.replace(/^พอร์ต (\d+ · #[\w.-]+)$/, 'Port $1');
}

export function formatLiveMonitorAccountLabel(accountName: string, accountLogin?: string): string {
  const cleanLogin = accountLogin?.trim().replace(/^#+\s*/, '') ?? '';
  if (!cleanLogin || accountName.toLowerCase().includes(cleanLogin.toLowerCase())) {
    return accountName;
  }
  return `${accountName} · #${cleanLogin}`;
}

const LEGACY_SESSION_TITLES = new Map([
  ['แชทวางแผนเทรดใหม่', 'New Trading Session'],
  ['AI Live Desk · Session หลัก', 'AI Live Desk · Primary Session'],
]);

export function formatSessionTitleDisplay(title: string, lang: DeskLanguage): string {
  return lang === 'th' ? title : LEGACY_SESSION_TITLES.get(title) ?? title;
}

const SLASH_COMMAND_DESCRIPTIONS = new Map<string, Record<DeskLanguage, string>>([
  ['/plan', {
    en: 'Build a GHR v3.2 trading plan from the active account and 3-TP ticket.',
    th: 'วางแผนเทรด GHR v3.2 จากพอร์ตและแผน 3-TP ปัจจุบัน',
  }],
  ['/chart', {
    en: 'Review the H1/M5 charts, EMA20/50, RSI and ATR against the 1,000-point stop.',
    th: 'อ่านกราฟ H1/M5 พร้อม EMA20/50, RSI และ ATR เทียบกับระยะตัดขาดทุน 1,000 จุด',
  }],
  ['/12gate', {
    en: 'Review the 12-Gate checklist for blockers before placing a trade.',
    th: 'ตรวจด่านที่ยังไม่ผ่านในเช็กลิสต์ 12-Gate ก่อนวางออเดอร์',
  }],
  ['/risk', {
    en: 'Check daily drawdown headroom, the 40% consistency rule and position size.',
    th: 'ตรวจวงเงินขาดทุนรายวันที่เหลือ กฎความสม่ำเสมอ 40% และขนาดสถานะ',
  }],
  ['/search', {
    en: 'Use Google Search to check market news and current prop firm rules.',
    th: 'ใช้ Google Search ค้นข่าวตลาดและกฎกองทุนล่าสุด',
  }],
  ['/journal', {
    en: 'Review journal performance, win rate and trade expectancy.',
    th: 'วิเคราะห์ผลการเทรด อัตราชนะ และค่าคาดหวังจากสมุดบันทึก',
  }],
  ['/voice', {
    en: 'Switch to Voice to dictate questions and hear replies.',
    th: 'สลับไปโหมดเสียงเพื่อพูดคำถามและฟังคำตอบ',
  }],
  ['/live', {
    en: 'Switch to Live for a two-way conversation with Gemini 3.8 Live.',
    th: 'สลับไปโหมด Live เพื่อสนทนาด้วยเสียงสองทางผ่าน Gemini 3.8 Live',
  }],
  ['/new', {
    en: 'Start a new chat and keep the current session in recent history.',
    th: 'เริ่มแชทใหม่และเก็บเซสชันปัจจุบันไว้ในประวัติ',
  }],
]);

export function getSlashCommandDescription(command: string, lang: DeskLanguage): string {
  return SLASH_COMMAND_DESCRIPTIONS.get(command.trim().toLowerCase())?.[lang] ?? '';
}

const LEGACY_TRADE_NOTES = new Map([
  ['ชนะครบ 3 ไม้ (Full Sweep)', 'All three targets hit (Full Sweep)'],
  ['แตะ TP2 ล็อกกำไร TL +400p', 'TP2 hit, trailing profit locked at +400p'],
  ['เก็บ TP1 แพ้ไม้ 2-3', 'TP1 hit, legs 2 and 3 stopped out'],
  ['ปิดเท่าทุน (Break Even)', 'Closed at breakeven'],
  ['ชน SL ครบ 3 ไม้', 'All three legs stopped out'],
  ['รายการคัดลอก', 'Copied trade'],
]);

export function formatTradeNoteDisplay(note: string, lang: DeskLanguage): string {
  if (lang === 'th') return note;
  const original = note.replace(/(?: \(Copy\))+$/, '');
  const generatedLabel = LEGACY_TRADE_NOTES.get(original);
  return generatedLabel === undefined
    ? note
      .replace(/^(MT5 #[^ ()]+ \([\d.]+L · )ปิด ([-\d.]+)(?= · |\)$)/, '$1Closed at $2')
      .replace(/^MT5 \((\d+) ไม้ · ([\d.]+L)\)/, 'MT5 ($1 legs · $2)')
      .replace(/^ทุนเริ่มต้น (?=\$)/, 'Initial balance ')
    : generatedLabel + note.slice(original.length);
}

export function formatDeskPromptDisplay(prompt: string, lang: DeskLanguage): string {
  if (lang === 'th') return prompt;
  return prompt
    .replace(/^วิเคราะห์กราฟสด (\S+) พร้อมสรุปโครงสร้าง EMA20\/EMA50, RSI\(14\), ATR\(14\), แนวรับ-แนวต้าน และแผนความเสี่ยง 3-TP ปัจจุบัน$/, 'Analyze the live $1 chart. Summarize EMA20/50, RSI(14), ATR(14), support and resistance, and the current 3-TP risk plan.')
    .replace(/^ช่วยวิเคราะห์ความเสี่ยงพอร์ตปัจจุบันเทียบกับกฎล่าสุดของ (.+) \(Daily DD, Max DD, Consistency Rule และนโยบาย VPS\/Sync\)$/, 'Assess the active account against the latest $1 rules for daily drawdown, maximum drawdown, consistency and VPS/sync.');
}

export function formatMt5SyncMessage(message: string, lang: DeskLanguage): string {
  if (lang === 'th') return message;
  if (message === 'ไม่พบพอร์ตเป้าหมายสำหรับซิงก์ MT5') return 'No target account found for MT5 sync.';
  const localized = message
    .replace(/^ไม่สามารถซิงก์ข้อมูลได้ \(HTTP (\d+)\)$/, 'MT5 sync failed (HTTP $1).')
    .replace(/^เชื่อมต่อ #(.+?) สำเร็จ \(ยังไม่พบออเดอร์ที่ปิดแล้วในช่วง (\d+) วัน\)$/, 'Connected to #$1. No closed trades in the last $2 days.')
    .replace(/^ซิงก์ #(.+?) สำเร็จ: ดึง (\d+) โพซิชั่น → รวมเป็น (\d+) รายการใน Journal$/, 'Synced #$1. Imported $2 positions into $3 journal entries.');
  return /\p{Script=Thai}/u.test(localized) ? 'MT5 Read-Only sync failed.' : localized;
}

const MT5_TIME_OFFSET_LABELS = new Map([
  ['AUTO_MT5', ['Automatic (MT5 server → ICT: +5h winter / +4h summer)', 'Auto (+4/+5h → ICT)']],
  ['5', ['+5h (MT5 winter, GMT+2 → GMT+7)', '+5h (GMT+2 → ICT)']],
  ['4', ['+4h (MT5 summer, GMT+3 → GMT+7)', '+4h (GMT+3 → ICT)']],
  ['7', ['+7h (UTC → GMT+7)', '+7h (UTC → ICT)']],
  ['0', ['0h (already in ICT)', '0h (no offset)']],
]);

export function formatMt5TimeOffsetLabel(
  option: { value: string; label: string; shortLabel: string },
  lang: DeskLanguage,
  short = false
): string {
  if (lang === 'th') return short ? option.shortLabel : option.label;
  const labels = MT5_TIME_OFFSET_LABELS.get(option.value);
  return labels?.[short ? 1 : 0] ?? option.value;
}

export function persistDeskLanguage(lang: DeskLanguage): void {
  try {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(DESK_LANG_STORAGE_KEY, lang);
      window.localStorage.setItem(LEGACY_WEB_LANG_STORAGE_KEY, lang);
    }
  } catch {
    // ignore storage quota errors
  }
}

export function maskWorkspaceEmail(rawEmail?: string | null): string {
  const email = String(rawEmail || '').trim();
  if (!email || !email.includes('@')) return 'Guest Workspace';
  const [local, domain] = email.split('@');
  if (!local || !domain) return 'Verified Workspace';
  const prefix = local.slice(0, Math.min(2, local.length));
  return `${prefix}***@${domain}`;
}

export const DESK_I18N: Record<
  DeskLanguage,
  {
    nav: {
      desk: string;
      plan: string;
      quant: string;
      review: string;
      rules: string;
      mall: string;
      more: string;
      aiRisk: string;
      comexBridge: string;
      autopsy: string;
      analysis: string;
      liveChart: string;
      calculator: string;
      twelveGate: string;
      journal: string;
      marketplace: string;
      community: string;
      propRules: string;
      settings: string;
    };
    settingsTabs: Record<'display' | 'keys' | 'accounts' | 'sync', string>;
    topbar: {
      accounts: string;
      addPort: string;
      propGroupLabel: string;
      personalGroupLabel: string;
      planTradeCta: string;
      planTradeTitle: string;
      importMt5Cta: string;
      importMt5Title: string;
      moreTools: string;
      thbRateLabel: string;
      themeToLight: string;
      themeToDark: string;
      privacyShow: string;
      privacyHide: string;
      printPdf: string;
      helpGuide: string;
      signIn: string;
      accountPlanTitle: string;
    };
    telemetry: {
      sseLive: string;
      cloudApi: string;
      manualXlsx: string;
      offlineIdb: string;
      syncTooltipLive: string;
      syncTooltipManual: string;
      syncTooltipOffline: string;
      equity: string;
      floating: string;
      ddGuard: string;
      sessionTooltip: string;
      aiLiveDesk: string;
    };
    analytics: {
      balance: string;
      equity: string;
      growth: string;
      profit: string;
      tabDetails: string;
      tabFinancials: string;
      tabPorts: string;
      account: string;
      broker: string;
      brokerServer: string;
      mt5Sync: string;
      client: string;
      type: string;
      currency: string;
      leverageLot: string;
      startedTrading: string;
      lastUpdated: string;
      initialDeposit: string;
      targetGoal: string;
      targetProfit: string;
      targetRemaining: string;
      dailyQuota: string;
      dailyStopGuard: string;
      dailyLossRem: string;
      drawdown10Guard: string;
      maxDdBuffer: string;
      riskPerIdea: string;
      tradingDays: string;
      tradesUnit: string;
      daysUnit: string;
      gatesUnit: string;
      passedRule: string;
      accumulating: string;
      noPctLimitPersonal: string;
      managePortsCount: string;
      closeForm: string;
      addPortBtn: string;
      propFirmMode: string;
      personalMode: string;
      growthOverTime: string;
      monthlyCalendar: string;
      viewGrowthChart: string;
      openMonthlyCal: string;
      dailyProfit: string;
      weeklyProfit: string;
      cumulativeProfit: string;
      winRatio: string;
      rrr: string;
      profitFactor: string;
      consistency7d: string;
      winDayLegend: string;
      lossLegend: string;
      noTradeLegend: string;
      dailyTab: string;
      hourlyTab: string;
      matrix3dTab: string;
      tradeStatsTitle: string;
      totalTrades: string;
      wonTrades: string;
      lostTrades: string;
      longs: string;
      shorts: string;
      winSuffix: string;
      avgWin: string;
      avgLoss: string;
      tradesLabel: string;
      wonLostLabel: string;
      pnlGrowthSummary: string;
    };
    pageTitles: {
      desk: string;
      aiRisk: string;
      comexBridge: string;
      autopsy: string;
      liveChart: string;
      calculator: string;
      twelveGate: string;
      journal: string;
      marketplace: string;
      community: string;
      propRules: string;
      analysis: string;
      settings: string;
    };
  }
> = {
  en: {
    nav: {
      desk: 'Desk',
      plan: 'Plan',
      quant: 'Quant',
      review: 'Review',
      rules: 'Rules',
      mall: 'Mall',
      more: 'More',
      aiRisk: 'AI Risk',
      comexBridge: 'COMEX Bridge',
      autopsy: 'Autopsy',
      analysis: 'Analysis',
      liveChart: 'Live Chart',
      calculator: '3-TP Calc',
      twelveGate: '12-Gate',
      journal: 'Journal',
      marketplace: 'Market',
      community: 'Community',
      propRules: 'PropRules',
      settings: 'Settings',
    },
    settingsTabs: { display: 'Display', keys: 'AI & Keys', accounts: 'Accounts', sync: 'Sync' },
    topbar: {
      accounts: 'Accounts',
      addPort: '+ Port',
      propGroupLabel: 'Prop Firm Accounts',
      personalGroupLabel: 'Personal Accounts',
      planTradeCta: '+ Plan / 12-Gate',
      planTradeTitle: 'Review 3-TP sizing and the 12-Gate checklist',
      importMt5Cta: 'Import MT5',
      importMt5Title: 'Import an MT5 .xlsx report or connect read-only sync (.ex5 / Cloud API)',
      moreTools: 'Tools',
      thbRateLabel: 'USD/THB Rate',
      themeToLight: 'Light Mode',
      themeToDark: 'Dark Mode',
      privacyShow: 'Show Balances',
      privacyHide: 'Mask Balances',
      printPdf: 'Export PDF Report',
      helpGuide: 'Setup Guide & Risks',
      signIn: 'Sign In',
      accountPlanTitle: 'Sign in and manage licenses',
    },
    telemetry: {
      sseLive: 'Desk stream',
      cloudApi: 'Cloud API',
      manualXlsx: 'Local workspace',
      offlineIdb: 'Offline',
      syncTooltipLive: 'Read-only connection',
      syncTooltipManual:
        'Data in this browser, including imported MT5 reports.',
      syncTooltipOffline: 'Using workspace data stored in this browser.',
      equity: 'Equity',
      floating: 'Floating',
      ddGuard: 'Daily loss used',
      sessionTooltip: 'Win rate breakdown by Asia / London / New York sessions',
      aiLiveDesk: 'AI Live Desk',
    },
    analytics: {
      balance: 'Balance',
      equity: 'Equity',
      growth: 'Growth',
      profit: 'Profit',
      tabDetails: 'Details',
      tabFinancials: 'Financials',
      tabPorts: 'Ports',
      account: 'Account',
      broker: 'Broker',
      brokerServer: 'Broker server',
      mt5Sync: 'MT5 Read-Only Sync',
      client: 'Client',
      type: 'Type',
      currency: 'Currency',
      leverageLot: 'Leverage / Lot',
      startedTrading: 'Started trading',
      lastUpdated: 'Last updated',
      initialDeposit: 'Initial Deposit',
      targetGoal: 'Profit Target',
      targetProfit: 'Target Profit',
      targetRemaining: 'Target Remaining',
      dailyQuota: 'Daily Quota',
      dailyStopGuard: 'Daily Stop Guard',
      dailyLossRem: 'Daily Loss Buffer',
      drawdown10Guard: '10% Drawdown Guard',
      maxDdBuffer: 'Max DD Buffer',
      riskPerIdea: 'Risk per Idea',
      tradingDays: 'Trading Days',
      tradesUnit: 'trades',
      daysUnit: 'days',
      gatesUnit: 'gates',
      passedRule: 'Passed',
      accumulating: 'In progress',
      noPctLimitPersonal: 'No cap (Personal)',
      managePortsCount: 'Switch or Manage Accounts',
      closeForm: 'Close',
      addPortBtn: '+ Add Port',
      propFirmMode: 'Prop Firm',
      personalMode: 'Personal',
      growthOverTime: 'Growth Over Time',
      monthlyCalendar: 'Monthly Calendar',
      viewGrowthChart: 'Growth Chart',
      openMonthlyCal: 'Monthly Calendar',
      dailyProfit: 'Daily profit',
      weeklyProfit: 'Weekly profit',
      cumulativeProfit: 'Cumulative P&L',
      winRatio: 'Win rate',
      rrr: 'RRR',
      profitFactor: 'Profit factor',
      consistency7d: 'Consistency Calendar (7D)',
      winDayLegend: 'Win Day',
      lossLegend: 'Loss',
      noTradeLegend: 'No Trade',
      dailyTab: 'Daily',
      hourlyTab: 'Hourly',
      matrix3dTab: '3D Matrix',
      tradeStatsTitle: 'Trade statistics',
      totalTrades: 'Total trades',
      wonTrades: 'Won trades',
      lostTrades: 'Lost trades',
      longs: 'Longs',
      shorts: 'Shorts',
      winSuffix: 'Win',
      avgWin: 'Average win',
      avgLoss: 'Average loss',
      tradesLabel: 'Trades',
      wonLostLabel: 'Won | Lost',
      pnlGrowthSummary: 'Growth and Trade Outcomes',
    },
    pageTitles: {
      desk: 'Desk',
      aiRisk: 'AI Risk',
      comexBridge: 'COMEX Bridge',
      autopsy: 'Challenge Autopsy',
      liveChart: 'Live Chart',
      calculator: '3-TP Calculator',
      twelveGate: '12-Gate Protocol',
      journal: 'Trade Journal',
      marketplace: 'Strategy Market',
      community: 'Mall Lounge',
      propRules: 'Prop Rules',
      analysis: 'Analysis',
      settings: 'Settings',
    },
  },
  th: {
    nav: {
      desk: 'หน้าหลัก',
      plan: 'วางแผน',
      quant: 'ควอนต์',
      review: 'รีวิว',
      rules: 'กฎกองทุน',
      mall: 'มอลล์',
      more: 'เพิ่มเติม',
      aiRisk: 'ความเสี่ยง AI',
      comexBridge: 'สะพานข้อมูล COMEX',
      autopsy: 'วิเคราะห์ย้อนหลัง',
      analysis: 'วิเคราะห์',
      liveChart: 'กราฟสด',
      calculator: 'คำนวณ 3-TP',
      twelveGate: '12-Gate',
      journal: 'สมุดเทรด',
      marketplace: 'มาร์เก็ต',
      community: 'คอมมูนิตี้',
      propRules: 'กฎกองทุน',
      settings: 'ตั้งค่า',
    },
    settingsTabs: { display: 'การแสดงผล', keys: 'AI และคีย์', accounts: 'บัญชี', sync: 'การซิงก์' },
    topbar: {
      accounts: 'พอร์ต',
      addPort: '+ พอร์ต',
      propGroupLabel: 'พอร์ตกองทุน (Prop Firm)',
      personalGroupLabel: 'พอร์ตส่วนตัว (Personal)',
      planTradeCta: '+ วางแผน / 12-Gate',
      planTradeTitle: 'เช็กขนาดล็อต 3-TP และเช็กลิสต์ 12-Gate',
      importMt5Cta: 'นำเข้า MT5',
      importMt5Title: 'นำเข้ารายงาน MT5 (.xlsx) หรือซิงก์แบบอ่านอย่างเดียว (.ex5 / Cloud API)',
      moreTools: 'เครื่องมือ',
      thbRateLabel: 'เรท USD/THB',
      themeToLight: 'โหมดสว่าง',
      themeToDark: 'โหมดมืด',
      privacyShow: 'แสดงยอดเงิน',
      privacyHide: 'ซ่อนยอดเงิน',
      printPdf: 'พิมพ์รายงาน PDF',
      helpGuide: 'คู่มือ & ความเสี่ยง',
      signIn: 'เข้าสู่ระบบ',
      accountPlanTitle: 'เข้าสู่ระบบและจัดการสิทธิ์ใช้งาน',
    },
    telemetry: {
      sseLive: 'สตรีมของ Desk',
      cloudApi: 'Cloud API',
      manualXlsx: 'ข้อมูลในเครื่อง',
      offlineIdb: 'ออฟไลน์',
      syncTooltipLive: 'เชื่อมต่อแบบอ่านอย่างเดียว',
      syncTooltipManual:
        'ข้อมูลในเบราว์เซอร์นี้ รวมรายงาน MT5 ที่นำเข้า',
      syncTooltipOffline: 'ใช้ข้อมูลในเบราว์เซอร์นี้',
      equity: 'มูลค่าพอร์ต',
      floating: 'กำไร/ขาดทุนลอยตัว',
      ddGuard: 'ขาดทุนวันนี้',
      sessionTooltip: 'อัตราชนะแยกตามช่วงเวลา Asia / London / New York',
      aiLiveDesk: 'AI Live Desk',
    },
    analytics: {
      balance: 'ยอดคงเหลือ',
      equity: 'มูลค่าพอร์ต',
      growth: 'การเติบโต',
      profit: 'กำไรสุทธิ',
      tabDetails: 'รายละเอียด',
      tabFinancials: 'การเงินและวงเงิน',
      tabPorts: 'พอร์ต',
      account: 'บัญชีพอร์ต',
      broker: 'โบรกเกอร์ / กองทุน',
      brokerServer: 'เซิร์ฟเวอร์ MT5',
      mt5Sync: 'การซิงก์ MT5 Read-Only',
      client: 'แพลตฟอร์ม',
      type: 'ประเภทพอร์ต',
      currency: 'สกุลเงิน',
      leverageLot: 'เลเวอเรจ / Lot',
      startedTrading: 'เริ่มเทรดเมื่อ',
      lastUpdated: 'อัปเดตล่าสุด',
      initialDeposit: 'เงินทุนตั้งต้น',
      targetGoal: 'เป้าหมายกำไร',
      targetProfit: 'เป้ากำไรกองทุน',
      targetRemaining: 'เหลืออีกถึงเป้า',
      dailyQuota: 'โควตาเทรดรายวัน',
      dailyStopGuard: 'เกณฑ์หยุดเทรดรายวัน',
      dailyLossRem: 'วงเงินขาดทุนวันนี้ที่เหลือ',
      drawdown10Guard: 'เกณฑ์ขาดทุนสะสม 10%',
      maxDdBuffer: 'วงเงินขาดทุนสะสมที่เหลือ',
      riskPerIdea: 'ความเสี่ยงต่อแผนเทรด',
      tradingDays: 'จำนวนวันเทรด',
      tradesUnit: 'ไม้',
      daysUnit: 'วัน',
      gatesUnit: 'ด่าน',
      passedRule: 'ผ่านเกณฑ์',
      accumulating: 'กำลังสะสม',
      noPctLimitPersonal: 'ไม่จำกัดเพดาน (พอร์ตส่วนตัว)',
      managePortsCount: 'สลับหรือจัดการพอร์ต',
      closeForm: 'ปิดฟอร์ม',
      addPortBtn: '+ เพิ่มพอร์ต',
      propFirmMode: 'พอร์ตกองทุน',
      personalMode: 'พอร์ตส่วนตัว',
      growthOverTime: 'กราฟการเติบโต',
      monthlyCalendar: 'ปฏิทินรายเดือน',
      viewGrowthChart: 'ดูกราฟการเติบโต',
      openMonthlyCal: 'ปฏิทินรายเดือน',
      dailyProfit: 'กำไรวันนี้',
      weeklyProfit: 'กำไรสัปดาห์นี้',
      cumulativeProfit: 'กำไร/ขาดทุนสะสม',
      winRatio: 'อัตราชนะ',
      rrr: 'RRR',
      profitFactor: 'อัตรากำไรต่อขาดทุน',
      consistency7d: 'ปฏิทินกฎ 40% (7 วันล่าสุด)',
      winDayLegend: 'วันกำไร',
      lossLegend: 'วันขาดทุน',
      noTradeLegend: 'ไม่ได้เทรด',
      dailyTab: 'รายวัน',
      hourlyTab: 'รายชั่วโมง',
      matrix3dTab: 'ผัง 3 มิติ',
      tradeStatsTitle: 'สถิติการเทรด',
      totalTrades: 'ออเดอร์ทั้งหมด',
      wonTrades: 'ออเดอร์ชนะ',
      lostTrades: 'ออเดอร์แพ้',
      longs: 'ฝั่ง Buy (Longs)',
      shorts: 'ฝั่ง Sell (Shorts)',
      winSuffix: 'ชนะ',
      avgWin: 'กำไรเฉลี่ยต่อไม้ชนะ',
      avgLoss: 'ขาดทุนเฉลี่ยต่อไม้แพ้',
      tradesLabel: 'จำนวนไม้',
      wonLostLabel: 'ชนะ | แพ้',
      pnlGrowthSummary: 'สัดส่วนชนะ-แพ้ และโครงสร้างผลลัพธ์',
    },
    pageTitles: {
      desk: 'หน้าหลัก',
      aiRisk: 'ประเมินความเสี่ยงด้วย AI',
      comexBridge: 'สะพานข้อมูล COMEX',
      autopsy: 'วิเคราะห์พอร์ตสอบย้อนหลัง',
      liveChart: 'กราฟสด',
      calculator: 'เครื่องคำนวณ 3-TP',
      twelveGate: 'เช็กลิสต์ 12-Gate',
      journal: 'สมุดบันทึกเทรด',
      marketplace: 'ตลาดชุดตั้งค่า',
      community: 'ห้องคอมมูนิตี้มอลล์',
      propRules: 'กฎกองทุน',
      analysis: 'วิเคราะห์พอร์ต',
      settings: 'ตั้งค่า',
    },
  },
};
