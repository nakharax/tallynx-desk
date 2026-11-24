export type PropFirmMarket = 'CFD' | 'FUTURES' | 'CFD_FUTURES';

export type SafeSyncChannelId =
  | 'FUNDEDNEXT_MCP'
  | 'MYFXBOOK_API'
  | 'PROJECTX_API'
  | 'LIVE_BRIDGE'
  | 'MANUAL_XLSX';

export interface PropFirmRuleEntry {
  id: string;
  name: string;
  shortName: string;
  market: PropFirmMarket;
  websiteUrl: string;
  rulesUrl: string;
  portalUrl?: string;
  portalLabel?: string;
  dailyLossLimitText: string;
  maxDrawdownText: string;
  consistencyRuleText: string;
  consistencyCapPct: number | null;
  newsTradingText: string;
  vpsPolicySummary: string;
  redMustReadWarning: string;
  vpsBannedOverUsd: number | null;
  safeSyncChannels: SafeSyncChannelId[];
  matchKeywords: string[];
}

export interface PropFirmLiveProbeResult {
  id: string;
  name: string;
  websiteUrl: string;
  rulesUrl: string;
  probeStatus: 'LIVE_OK' | 'CF_PROTECTED' | 'UNREACHABLE';
  httpStatus: number;
  latencyMs: number;
  finalUrl: string;
  pageTitle: string | null;
  lastModifiedHeader: string | null;
  checkedAtIso: string;
}

export interface PortfolioRuleCheckItem {
  id: string;
  severity: 'PASS' | 'WARN' | 'CRITICAL';
  label: string;
  detail: string;
}

export const SAFE_SYNC_CHANNEL_LABELS: Record<SafeSyncChannelId, string> = {
  FUNDEDNEXT_MCP: 'FundedNext Official MCP',
  MYFXBOOK_API: 'Myfxbook Cloud API',
  PROJECTX_API: 'ProjectX / TopstepX API',
  LIVE_BRIDGE: 'Live Bridge (.ex5) [PC / Private VPS]',
  MANUAL_XLSX: 'ไฟล์ MT5 (.xlsx)',
};

export const PROP_FIRM_CATALOG: PropFirmRuleEntry[] = [
  {
    id: 'fundednext',
    name: 'FundedNext',
    shortName: 'FundedNext',
    market: 'CFD_FUTURES',
    websiteUrl: 'https://fundednext.com',
    rulesUrl: 'https://help.fundednext.com/en/',
    portalUrl: 'https://mcp.fundednext.com',
    portalLabel: 'FundedNext Official MCP',
    dailyLossLimitText: '5% (2-Step Stellar / Evaluation) · 3% (1-Step)',
    maxDrawdownText: '10% (2-Step) · 6% (1-Step) Balance-Based / Static',
    consistencyRuleText: '40% Best-Day Rule ในบางโมเดล (เช่น Express/Futures; เช็กตามรุ่นที่ถือ)',
    consistencyCapPct: 40,
    newsTradingText: 'อนุญาตใน Challenge; รุ่น Funded จำกัดช่วงข่าวสำคัญ ±5 นาทีตามโมเดล',
    vpsPolicySummary: 'ห้ามใช้ VPS ทุกกรณีสำหรับพอร์ตตั้งแต่ $50,000 ขึ้นไป · ต่ำกว่า $50k ต้องใช้ Private VPS + รัน EA จริงเท่านั้น',
    redMustReadWarning:
      'พอร์ตตั้งแต่ $50,000 ห้ามใช้ VPS ทุกกรณี ซิงก์ผ่าน FundedNext Official MCP หรือนำเข้า .xlsx เท่านั้น เพื่อเลี่ยงการผิดกฎ VPS และ Shared IP',
    vpsBannedOverUsd: 50000,
    safeSyncChannels: ['FUNDEDNEXT_MCP', 'MANUAL_XLSX', 'MYFXBOOK_API'],
    matchKeywords: ['fundednext', 'funded next', 'stellar', 'fn'],
  },
  {
    id: 'ftmo',
    name: 'FTMO',
    shortName: 'FTMO',
    market: 'CFD',
    websiteUrl: 'https://ftmo.com',
    rulesUrl: 'https://ftmo.com/en/forbidden-trading-practices/',
    portalUrl: 'https://trader.ftmo.com',
    portalLabel: 'FTMO Client Area',
    dailyLossLimitText: '5% (2-Step Standard) / 3% (1-Step) คำนวณ Equity ณ 00:00 CE(S)T',
    maxDrawdownText: '10% Static (2-Step) / EOD Trailing (1-Step)',
    consistencyRuleText: '1-Step มี Best-Day Rule · 2-Step ไม่มีเพดานตายตัวแต่ตรวจพฤติกรรม Gambling/All-in',
    consistencyCapPct: null,
    newsTradingText: 'Swing Account เทรดข่าวได้ · Standard Account ห้ามเปิด-ปิดใน ±2 นาทีรอบข่าวแดง',
    vpsPolicySummary: 'อนุญาตเฉพาะ Private VPS (Dedicated IP ที่มีใบเสร็จจดทะเบียนชื่อคุณ) ห้าม Shared IP หรือสลับ VPN ข้ามประเทศ',
    redMustReadWarning:
      'จำเป็นต้องอ่าน: หากใช้ VPS ต้องเก็บใบเสร็จเช่า VPS ที่ระบุชื่อคุณและ Dedicated IP ชัดเจน กรณี Manual Review ห้ามล็อกอินผ่าน Shared VPS / Public VPN เด็ดขาด',
    vpsBannedOverUsd: null,
    safeSyncChannels: ['MYFXBOOK_API', 'MANUAL_XLSX', 'LIVE_BRIDGE'],
    matchKeywords: ['ftmo'],
  },
  {
    id: 'the5ers',
    name: 'The5ers',
    shortName: 'The5ers',
    market: 'CFD',
    websiteUrl: 'https://the5ers.com',
    rulesUrl: 'https://the5ers.com/faqs/',
    dailyLossLimitText: '5% Daily Pause (High Stakes) · ปรับตามแผน Bootcamp / Hyper Growth',
    maxDrawdownText: '10% Static (High Stakes) · 4%-6% (Bootcamp/Hyper Growth)',
    consistencyRuleText: 'เข้มงวดเรื่อง Stop Loss ต่อออเดอร์และความสม่ำเสมอการวางความเสี่ยง',
    consistencyCapPct: null,
    newsTradingText: 'อนุญาตตามแผน แต่ห้าม Bracket Order / High-Frequency Arbitrage ช่วงข่าว',
    vpsPolicySummary: 'อนุญาต Private VPS (Dedicated IP) ยืดหยุ่นสำหรับการรัน EA/สคริปต์ส่วนตัวที่ไม่ Copy ข้ามเจ้าของ',
    redMustReadWarning:
      'จำเป็นต้องอ่าน: ห้ามใช้ Shared VPS ร่วมกับเทรดเดอร์รายอื่น แม้ใช้ Investor Password ก็ถูกบันทึก IP ระดับเซิร์ฟเวอร์และเสี่ยงข้อหา Copy Trading',
    vpsBannedOverUsd: null,
    safeSyncChannels: ['MYFXBOOK_API', 'MANUAL_XLSX', 'LIVE_BRIDGE'],
    matchKeywords: ['5ers', 'the5ers', 'fivepercent', 'five percent'],
  },
  {
    id: 'fundingpips',
    name: 'FundingPips',
    shortName: 'FundingPips',
    market: 'CFD',
    websiteUrl: 'https://fundingpips.com',
    rulesUrl: 'https://help.fundingpips.com/',
    dailyLossLimitText: '3% - 5% (ขึ้นกับโมเดล Zero / 1-Step / 2-Step)',
    maxDrawdownText: '5% - 10% (Balance-Based / Static ตามรุ่น)',
    consistencyRuleText: '45% Consistency Rule ในบางโมเดล (Zero / Pro) ตรวจซ้ำก่อนขอเบิกเงิน',
    consistencyCapPct: 45,
    newsTradingText: 'Evaluation อนุญาตปกติ · ขั้น Master/Funded เช็กข้อจำกัด ±5 นาทีรอบข่าวสำคัญ',
    vpsPolicySummary: 'ระบบตรวจจับ Shared IP / Group Trading เข้มงวดมาก อนุญาตเฉพาะ Private Dedicated IP VPS หรือ Home PC',
    redMustReadWarning:
      'จำเป็นต้องอ่าน: FundingPips ตรวจจับ IP ซ้ำข้ามบัญชีเข้มงวดที่สุดแห่งหนึ่ง แนะนำใช้ Myfxbook Cloud API หรือ .xlsx เป็นหลัก และห้ามเช่า Shared VPS เด็ดขาด',
    vpsBannedOverUsd: null,
    safeSyncChannels: ['MYFXBOOK_API', 'MANUAL_XLSX', 'LIVE_BRIDGE'],
    matchKeywords: ['fundingpips', 'funding pips', 'fp'],
  },
  {
    id: 'alphacapital',
    name: 'Alpha Capital Group',
    shortName: 'Alpha Capital',
    market: 'CFD',
    websiteUrl: 'https://alphacapitalgroup.uk',
    rulesUrl: 'https://help.alphacapitalgroup.uk/en/',
    dailyLossLimitText: '4% - 5% (ตามรุ่น Alpha Pro / Alpha Swing)',
    maxDrawdownText: '6% - 10%',
    consistencyRuleText: 'Best-Day / Consistency 40% - 50% ตามโมเดลที่เลือก (เช็กใน Client Dashboard)',
    consistencyCapPct: 40,
    newsTradingText: 'Alpha Pro จำกัด ±2 นาทีรอบข่าวสำคัญ · Alpha Swing เทรดข่าวและถือข้ามสัปดาห์ได้',
    vpsPolicySummary: 'อนุญาตเฉพาะ VPS ที่มี Dedicated IP กองทุนอาจขอใบเสร็จก่อนอนุมัติการจ่ายเงิน',
    redMustReadWarning:
      'จำเป็นต้องอ่าน: กองทุนอาจขอหลักฐาน Dedicated IP Invoice ที่มีชื่อตรงกับเจ้าของพอร์ตก่อนจ่ายเงิน ใช้ Myfxbook API หรือ PC ส่วนตัวปลอดภัยที่สุด',
    vpsBannedOverUsd: null,
    safeSyncChannels: ['MYFXBOOK_API', 'MANUAL_XLSX', 'LIVE_BRIDGE'],
    matchKeywords: ['alpha', 'acg', 'alpha capital'],
  },
  {
    id: 'e8markets',
    name: 'E8 Markets',
    shortName: 'E8 Markets',
    market: 'CFD_FUTURES',
    websiteUrl: 'https://e8markets.com',
    rulesUrl: 'https://help.e8markets.com/',
    dailyLossLimitText: '2.5% - 4% (ปรับ Preset ได้ในรุ่น E8 One / Signature / Classic)',
    maxDrawdownText: '4% - 10% (EOD Trailing หรือ Static ตาม Preset)',
    consistencyRuleText: '40% Best-Day Rule ในบางรุ่น (เช่น E8 One / Funded Stage)',
    consistencyCapPct: 40,
    newsTradingText: 'อนุญาตในกรอบปกติ ระวัง Slippage และตรวจเงื่อนไข Payout ประจำรุ่นบน E8X',
    vpsPolicySummary: 'ห้าม Shared VPS และตรวจจับการสลับประเทศ/IP ข้ามโซนเวลาระหว่างเทรดอย่างเข้มงวด',
    redMustReadWarning:
      'ห้ามสลับประเทศของ IP บ่อย ใช้ VPN สาธารณะ หรือสลับ Node การซิงก์ผ่าน Myfxbook API หรือ .xlsx ไม่สร้างบันทึก IP ใหม่บนพอร์ต',
    vpsBannedOverUsd: null,
    safeSyncChannels: ['MYFXBOOK_API', 'MANUAL_XLSX', 'LIVE_BRIDGE'],
    matchKeywords: ['e8', 'e8markets', 'e8 funding'],
  },
  {
    id: 'topstep',
    name: 'Topstep',
    shortName: 'Topstep',
    market: 'FUTURES',
    websiteUrl: 'https://www.topstep.com',
    rulesUrl: 'https://help.topstep.com/',
    portalUrl: 'https://app.topstepx.com',
    portalLabel: 'TopstepX Web / ProjectX',
    dailyLossLimitText: 'Optional DLL ใน Trading Combine (เช่น $1,000 บนพอร์ต $50K)',
    maxDrawdownText: 'End-of-Day (EOD) Trailing Maximum Loss Limit (ล็อกที่ทุนตั้งต้น)',
    consistencyRuleText: '55% Consistency Rule (Trading Combine) / เกณฑ์ Express Funded (XFA)',
    consistencyCapPct: 55,
    newsTradingText: 'อนุญาตบน Futures ภายใต้กฎ CME และการวาง Stop/Risk ที่เหมาะสม',
    vpsPolicySummary: 'TopstepX เป็น Web-based ไม่ต้องใช้ VPS · หากใช้ NinjaTrader/Rithmic ต้องเป็น Private Dedicated VPS เท่านั้น',
    redMustReadWarning:
      'TopstepX ใช้งานได้โดยไม่ต้องใช้ VPS ดึงสถิติเข้า TallyNX Desk ผ่าน ProjectX / TopstepX Cloud API',
    vpsBannedOverUsd: null,
    safeSyncChannels: ['PROJECTX_API', 'MANUAL_XLSX'],
    matchKeywords: ['topstep', 'topstepx', 'projectx'],
  },
  {
    id: 'apex',
    name: 'Apex Trader Funding',
    shortName: 'Apex',
    market: 'FUTURES',
    websiteUrl: 'https://apextraderfunding.com',
    rulesUrl: 'https://support.apextraderfunding.com/',
    dailyLossLimitText: 'EOD Evaluation มี Fixed DLL · Intraday Evaluation ไม่มี DLL',
    maxDrawdownText: 'Intraday Trailing หรือ EOD Trailing (PA หยุดตามที่ Balance + $100)',
    consistencyRuleText: '50% Windfall / Consistency Rule ใน PA ก่อนขอ Payout (30% ในแผนเก่าบางรุ่น)',
    consistencyCapPct: 50,
    newsTradingText: 'ห้าม One-sided Flipping / DCA ไร้จุดตัดช่วงข่าว ต้องเทรดแบบมีกรอบความเสี่ยงชัดเจน',
    vpsPolicySummary: 'อนุญาต Private VPS ใน Chicago เพื่อลดความหน่วง ห้ามแชร์ VPS หรือใช้ IP เดียวกันจัดการบัญชีของผู้อื่น',
    redMustReadWarning:
      'จำเป็นต้องอ่าน: ในขั้น PA มีกฎ 50% Consistency และกฎจำกัดการถือ Contract / DCA ช่วงข่าว หากใช้ VPS ต้องเป็นเครื่อง Private เฉพาะบัญชีของคุณเองเท่านั้น',
    vpsBannedOverUsd: null,
    safeSyncChannels: ['PROJECTX_API', 'MANUAL_XLSX'],
    matchKeywords: ['apex', 'apex trader'],
  },
  {
    id: 'tpt',
    name: 'Take Profit Trader',
    shortName: 'TPT',
    market: 'FUTURES',
    websiteUrl: 'https://takeprofittrader.com',
    rulesUrl: 'https://takeprofittraderhelp.zendesk.com/',
    dailyLossLimitText: 'ไม่มี Daily Loss Limit (คุมความเสี่ยงผ่าน Trailing Drawdown)',
    maxDrawdownText: 'EOD Trailing (Test & PRO+) · Intraday Trailing (PRO Sim-Funded)',
    consistencyRuleText: '50% Best-Day Rule ในขั้น Test (ขั้น PRO Funded ยกเลิก Consistency Cap)',
    consistencyCapPct: 50,
    newsTradingText: 'Test เทรดได้ปกติ · ขั้น PRO Live เช็กข้อจำกัด ±1 นาทีช่วงข่าว High-Impact',
    vpsPolicySummary: 'ต้องใช้ Private Dedicated VPS เท่านั้นสำหรับ Rithmic / NinjaTrader ห้าม Shared IP',
    redMustReadWarning:
      'จำเป็นต้องอ่าน: เมื่อขึ้นขั้น PRO (Sim-Funded) ระบบเปลี่ยนจาก EOD เป็น Intraday Trailing Drawdown (ไล่ตามกำไรที่ยังไม่ปิดทันที) ต้องคุม RR และปิดจบตามแผนอย่างเคร่งครัด',
    vpsBannedOverUsd: null,
    safeSyncChannels: ['PROJECTX_API', 'MANUAL_XLSX'],
    matchKeywords: ['take profit trader', 'tpt'],
  },
  {
    id: 'mffu',
    name: 'MyFundedFutures (MFFU)',
    shortName: 'MFFU',
    market: 'FUTURES',
    websiteUrl: 'https://myfundedfutures.com',
    rulesUrl: 'https://help.myfundedfutures.com/',
    dailyLossLimitText: 'ไม่มี (Rapid / Pro) · Soft DLL (Builder Plan)',
    maxDrawdownText: 'Intraday Trailing (Rapid/Pro) · EOD Trailing (Rapid EOD) · Static (Studio)',
    consistencyRuleText: '50% (Rapid/Pro) · 30% (Rapid EOD) · Builder ตรวจ Consistency ช่วงเบิกเงิน',
    consistencyCapPct: 50,
    newsTradingText: 'เช็กตามรุ่นบัญชี (บางรุ่นบน Sim-Funded จำกัดเทรดช่วงข่าวสำคัญ ±2 นาที)',
    vpsPolicySummary: 'ห้าม Shared VPS / Proxy หรือการใช้ IP เดียวกันควบคุมบัญชีหลายเจ้าของ (Account Management)',
    redMustReadWarning:
      'จำเป็นต้องอ่าน: ตรวจสอบประเภท Drawdown ของแผนที่ถือ (Intraday vs EOD vs Static) และกฎ Best-Day % ก่อนกดเบิกเงินใน Dashboard ของ MFFU ทุกครั้ง',
    vpsBannedOverUsd: null,
    safeSyncChannels: ['PROJECTX_API', 'MANUAL_XLSX'],
    matchKeywords: ['mffu', 'myfundedfutures', 'my funded futures'],
  },
];

export function findMatchingPropFirm(
  accountName?: string,
  brokerName?: string,
  brokerServer?: string
): PropFirmRuleEntry | undefined {
  const haystack = `${accountName || ''} ${brokerName || ''} ${brokerServer || ''}`.toLowerCase();
  return PROP_FIRM_CATALOG.find(firm => firm.matchKeywords.some(keyword => haystack.includes(keyword)));
}

export function detectPropFirmForAccount(accountName?: string, brokerName?: string, brokerServer?: string): PropFirmRuleEntry {
  return findMatchingPropFirm(accountName, brokerName, brokerServer) ?? PROP_FIRM_CATALOG[0];
}

export function evaluatePortfolioAgainstPropFirm(params: {
  firm: PropFirmRuleEntry;
  accountInitialUsd: number;
  accountBalanceUsd: number;
  todayPnlUsd: number;
  floatingPnlUsd: number;
  bestDaySharePct: number;
  syncProvider?: string;
}): PortfolioRuleCheckItem[] {
  const {
    firm,
    accountInitialUsd,
    accountBalanceUsd,
    todayPnlUsd,
    floatingPnlUsd,
    bestDaySharePct,
    syncProvider,
  } = params;

  const checks: PortfolioRuleCheckItem[] = [];
  const baseCap = Math.max(1, accountInitialUsd);

  // 1. VPS / Sync Channel Compliance
  const activeSync = (syncProvider || 'MANUAL_XLSX') as SafeSyncChannelId | string;
  const isVpsBannedForSize =
    firm.vpsBannedOverUsd !== null && accountInitialUsd >= firm.vpsBannedOverUsd;

  if (
    activeSync === 'DIRECT_INVESTOR' ||
    activeSync === 'METAAPI_CLOUD' ||
    activeSync === 'BRIDGE_API'
  ) {
    checks.push({
      id: 'sync-safety',
      severity: 'CRITICAL',
      label: 'ช่องทางซิงก์พอร์ต (ถูกระงับเพื่อความปลอดภัย)',
      detail: `พอร์ตใช้ช่องทางเดิม (${activeSync}) เปลี่ยนเป็น ${firm.safeSyncChannels
        .map((c) => SAFE_SYNC_CHANNEL_LABELS[c])
        .join(' / ')}`,
    });
  } else if (isVpsBannedForSize && activeSync === 'LIVE_BRIDGE') {
    checks.push({
      id: 'sync-safety',
      severity: 'WARN',
      label: `กฎห้ามใช้ VPS สำหรับพอร์ต >= $${firm.vpsBannedOverUsd?.toLocaleString('en-US')}`,
      detail: `${firm.shortName} พอร์ตขนาด $${accountInitialUsd.toLocaleString('en-US')} ห้ามรัน MT5 บน VPS ใช้ Live Bridge บนคอมพิวเตอร์ส่วนตัว หรือซิงก์ผ่าน FundedNext Official MCP / .xlsx`,
    });
  } else if (firm.safeSyncChannels.includes(activeSync as SafeSyncChannelId)) {
    checks.push({
      id: 'sync-safety',
      severity: 'PASS',
      label: 'ช่องทางซิงก์อยู่ในรายการที่รองรับ',
      detail: `ใช้ช่องทาง ${
        SAFE_SYNC_CHANNEL_LABELS[activeSync as SafeSyncChannelId] || activeSync
      } ซึ่งสอดคล้องกับนโยบายของ ${firm.shortName}`,
    });
  } else {
    checks.push({
      id: 'sync-safety',
      severity: 'WARN',
      label: 'แนะนำเลือกช่องทางซิงก์ที่ตรงสายตลาด',
      detail: `${firm.shortName} (${firm.market}) แนะนำ ${firm.safeSyncChannels
        .map((c) => SAFE_SYNC_CHANNEL_LABELS[c])
        .join(' หรือ ')}`,
    });
  }

  // 2. Consistency / Best-Day Cap Check
  if (firm.consistencyCapPct !== null) {
    if (bestDaySharePct > firm.consistencyCapPct) {
      checks.push({
        id: 'consistency',
        severity: 'CRITICAL',
        label: `Best-Day Consistency (${bestDaySharePct.toFixed(1)}% / เพดาน ${firm.consistencyCapPct}%)`,
        detail: `สัดส่วนกำไรวันสูงสุดเกินเพดาน ${firm.consistencyCapPct}% ของ ${firm.shortName} เกณฑ์ก่อนขอจ่ายเงินคำนวณจากกำไรสะสม`,
      });
    } else if (bestDaySharePct >= firm.consistencyCapPct - 5) {
      checks.push({
        id: 'consistency',
        severity: 'WARN',
        label: `Best-Day Consistency ใกล้เพดาน (${bestDaySharePct.toFixed(1)}% / ${firm.consistencyCapPct}%)`,
        detail: `เหลืออีก ${(firm.consistencyCapPct - bestDaySharePct).toFixed(1)} จุดเปอร์เซ็นต์ก่อนถึงเพดาน Consistency`,
      });
    } else {
      checks.push({
        id: 'consistency',
        severity: 'PASS',
        label: `Best-Day Consistency ผ่าน (${bestDaySharePct.toFixed(1)}% / เพดาน ${firm.consistencyCapPct}%)`,
        detail: `สัดส่วนกำไรวันสูงสุดยังอยู่ใต้กรอบ ${firm.consistencyCapPct}% ของ ${firm.shortName}`,
      });
    }
  } else {
    checks.push({
      id: 'consistency',
      severity: 'PASS',
      label: 'เกณฑ์ Consistency ของกองทุน',
      detail: firm.consistencyRuleText,
    });
  }

  // 3. Intraday / Daily Loss Pressure Check (Conservative 3% soft benchmark)
  const netTodayUsd = todayPnlUsd + floatingPnlUsd;
  const dailyDrawdownPct = netTodayUsd < 0 ? Math.abs((netTodayUsd / baseCap) * 100) : 0;
  const netBufferUsd = accountBalanceUsd + floatingPnlUsd - accountInitialUsd * 0.9;

  if (dailyDrawdownPct >= 2.5) {
    checks.push({
      id: 'daily-dd',
      severity: 'CRITICAL',
      label: `แรงกดดัน Daily Drawdown วันนี้ (${dailyDrawdownPct.toFixed(2)}%)`,
      detail: `ขาดทุนสุทธิรวม Floating วันนี้อยู่ที่ -$${Math.abs(netTodayUsd).toFixed(2)} ควรหยุดพักตามกฎความปลอดภัยก่อนชนกรอบ ${firm.dailyLossLimitText}`,
    });
  } else {
    checks.push({
      id: 'daily-dd',
      severity: 'PASS',
      label: `Drawdown วันนี้ (${dailyDrawdownPct.toFixed(2)}%)`,
      detail: `Equity Buffer เทียบกรอบ 10%: +$${Math.max(0, netBufferUsd).toFixed(2)} · เกณฑ์กองทุน: ${firm.dailyLossLimitText}`,
    });
  }

  return checks;
}
