import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Paperclip, Zap } from 'lucide-react';
import {
  ChatMessage,
  ChatMessageAttachmentMeta,
  ChatMessageSource,
  ChatModelId,
  ChatSessionRecord,
  GhrWorkspaceState,
  LiveChartTelemetry,
} from '../types/ghr';
import {
  DESK_I18N,
  deskText,
  formatAccountDisplayName,
  formatDeskPromptDisplay,
  formatSessionTitleDisplay,
  getSlashCommandDescription,
  type DeskLanguage,
} from '../utils/deskI18n';
import { auth } from '../services/firebase';
import { AI_MODEL_CATALOG, asRecord, getActiveDeskAiStatus } from '../utils/aiProviderConfig';
import { CoachStreamError, readCoachReplyStream } from '../utils/coachReplyStream';
import { isEventStream } from '../utils/serverSentEvents';
import { canRequestDeskAi, getDeskAiRequestHeaders, selectDeskAiCredential, useByokCredentials } from '../utils/byokStorage';
import { AiAndDataKeysDialogButton } from './AiAndDataKeysCard';
import {
  buildTradingCoachContext,
  DEFAULT_STATE,
  DeskPageSnapshot,
  evaluateConsistencyRule,
  fmtUSD,
  generateLocalTacticalPlan,
  getAccountComputed,
  getBangkokTimeHHMM,
  getCalcMetrics,
  TWELVE_GATE_DEFINITIONS,
} from '../utils/ghrRules';
import {
  FREE_TIER_MODEL_CATALOG,
  GEMINI_38_LIVE,
  GEMINI_38_LIVE_THINKING,
  normalizeChatModelPreference,
} from '../utils/geminiOrchestrator';
import {
  createChatSession,
  deleteSessionById,
  deriveSessionTitle,
  filterSessions,
  getMostRecentOtherSession,
  migrateLegacyChatMessages,
  renameSession,
  sortSessionsByRecent,
  togglePinSession,
  upsertSession,
} from '../utils/coachSessions';
import {
  loadChatSessionsFromIndexedDB,
  loadChatSessionsSync,
  saveChatSessionsToIndexedDB,
} from '../utils/idbStorage';
import {
  extractDeskActionSuggestions,
  filterSlashCommands,
  parseSlashCommand,
  SLASH_COMMANDS,
} from '../utils/liveAudioUtils';
import {
  GeminiLiveDeskClient,
  LiveDeskConnectionState,
  SpeechPlaybackHandle,
  speakTextWithFallback,
  VoiceWavRecorder,
} from '../utils/liveAudioEngine';
import { buildLocalLiveChartAnalysis } from '../utils/marketplaceUtils';
import {
  formatDualLiveChartTelemetryForPrompt,
  LIVE_CHART_SYMBOLS,
  LIVE_CHART_TIMEFRAMES,
  useLiveChartFeed,
} from '../utils/useLiveChartFeed';

export interface QuickDeskAction {
  type: 'RISK' | 'PAGE' | 'MT5_SYNC';
  value: string | number;
}

interface QueuedAttachment {
  id: string;
  name: string;
  mimeType: string;
  base64: string;
  previewUrl?: string;
}

interface TradingCoachChatProps {
  lang?: DeskLanguage;
  state: GhrWorkspaceState;
  isOnline: boolean;
  currentUserUid?: string | null;
  onUpdateMessages: (messages: ChatMessage[]) => void;
  onUpdateModel: (model: ChatModelId) => void;
  onResetChat: () => void;
  initialChartSymbol?: string | null;
  onClearInitialChartSymbol?: () => void;
  pendingPrompt?: string | null;
  onClearPendingPrompt?: () => void;
  compactDock?: boolean;
  externalLiveTelemetry?: LiveChartTelemetry | null;
  externalStructureTelemetry?: LiveChartTelemetry | null;
  externalChartSymbol?: string;
  externalChartTimeframe?: string;
  externalChartLoading?: boolean;
  onExternalRefreshChart?: () => Promise<LiveChartTelemetry | null>;
  pageSnapshot?: DeskPageSnapshot;
  onQuickDeskAction?: (action: QuickDeskAction) => void;
}

const LIVE_CONNECTION_LABELS_TH: Record<LiveDeskConnectionState, string> = {
  IDLE: 'พร้อมเริ่ม',
  CONNECTING: 'กำลังเชื่อมต่อ',
  LISTENING: 'กำลังฟัง',
  THINKING: 'กำลังประมวลผล',
  SPEAKING: 'กำลังพูด',
  ERROR: 'เชื่อมต่อขัดข้อง',
};

const VOICE_OPTIONS = ['Aoede', 'Kore', 'Puck', 'Charon', 'Fenrir'] as const;

const CORE_PROMPTS = [
  {
    label: 'วางแผนผ่านเป้าพอร์ต',
    labelEn: "Plan for account target",
    promptEn: "Help me plan today’s trades to reach the account target. How many full sweeps or trailing locks would it take, and how can I manage risk?",
    prompt:
      'ช่วยวางแผนการเทรดวันนี้ให้ผ่านเป้าหมายของพอร์ตปัจจุบัน ต้องชนะ Full 3 ไม้ หรือ Trailing Lock กี่ครั้ง และคุมความเสี่ยงอย่างไร?',
  },
  {
    label: 'ตรวจโพย 3-TP',
    labelEn: "Review 3-TP plan",
    promptEn: "Review my current 3-TP plan: entry, SL, TP1–TP3, lot size and the trailing lock at TP2.",
    prompt:
      'ช่วยตรวจสอบโพย 3-TP ปัจจุบัน (Entry, SL, TP1, TP2, TP3 และขนาด Lot) พร้อมจุดทำ Trailing Lock ที่ TP2',
  },
  {
    label: 'วางแผนกฎ 40%',
    labelEn: "Plan for the 40% rule",
    promptEn: "Based on this three-day payout cycle, what daily profit should I aim for so the best day stays within the consistency cap?",
    prompt:
      'จากข้อมูลรอบถอน 3 วันตอนนี้ ควรวางแผนกำไรแต่ละวันเท่าไหร่เพื่อไม่ให้วันสูงสุดเกิน Consistency Cap?',
  },
  {
    label: 'ทบทวนวินัย GHR',
    labelEn: "Review GHR discipline",
    promptEn: "Review this account’s trade journal and identify performance leaks and habits to improve under GHR v3.2.",
    prompt:
      'ช่วยวิเคราะห์จุดรั่วไหลและสถิติจากสมุดบันทึกเทรด (Trade Journal) ของพอร์ตนี้เพื่อรักษาวินัยระบบ GHR v3.2',
  },
];

function getQuickPromptsForPage(pid?: string) {
  if (pid === 'sec-accounts') {
    return [
      {
        label: 'เทียบทุกพอร์ต กองทุน/ส่วนตัว',
        labelEn: "Compare all accounts",
        promptEn: "Compare all active prop firm and personal accounts. Which is closest to its target, which has the most risk, and which should I review first?",
        prompt:
          'ช่วยสรุปภาพรวมทุกพอร์ตที่มีอยู่ตอนนี้ (กองทุน vs ส่วนตัว) ว่าพอร์ตไหนใกล้เป้าหรือเสี่ยงสุด และควรเน้นพอร์ตไหนก่อน?',
      },
      {
        label: 'เช็กงบ DD & Sync',
        labelEn: "Check DD and sync",
        promptEn: "Check this account’s remaining drawdown buffer and MT5 sync against its prop firm rules.",
        prompt:
          'เทียบวงเงิน Drawdown ที่เหลือและช่องทางซิงก์ MT5 ของพอร์ตนี้กับกฎกองทุน',
      },
      ...CORE_PROMPTS,
    ];
  }
  if (pid === 'tv-chart-root') {
    return [
      {
        label: 'อ่านกราฟสดเทียบโพย',
        labelEn: "Compare chart and plan",
        promptEn: "Compare the live chart (EMA20/50, RSI, ATR, support and resistance) with the current 3-TP limit entry and stop-loss distance.",
        prompt:
          'ช่วยวิเคราะห์กราฟสดคู่ปัจจุบัน (EMA20/EMA50, RSI, ATR, S/R) เทียบกับจุดเข้า 3-TP Limit และระยะ SL บนหน้าจอตอนนี้',
      },
      {
        label: 'เช็ก SL $10 vs ATR',
        labelEn: "Check $10 SL vs. ATR",
        promptEn: "How does the standard 1,000-point ($10 on gold) stop-loss compare with the current ATR(14)? Would waiting for a pullback make sense?",
        prompt:
          'ระยะ Stop Loss มาตรฐาน -1,000 จุด ($10 บนทองคำ) เหมาะสมกับค่า ATR(14) ของกราฟสดตอนนี้หรือควรรอจังหวะย่อ?',
      },
      ...CORE_PROMPTS,
    ];
  }
  if (pid === 'calculator-root') {
    return [
      {
        label: 'ตรวจโพย & 5-State EV',
        labelEn: "Review plan and 5-state EV",
        promptEn: "Review the lot size, 3-TP distances and net expectancy E_net[R] shown in the calculator for this account.",
        prompt:
          'ช่วยประเมินขนาด Lot, ระยะ 3-TP และค่า Expectancy (E_net[R]) บนหน้าเครื่องคำนวณตอนนี้ว่าคุ้มเสี่ยงสำหรับพอร์ตนี้ไหม',
      },
      ...CORE_PROMPTS,
    ];
  }
  if (pid === 'desk-cards-root') {
    return [
      {
        label: 'ตรวจ 12-Gate ที่ขาด',
        labelEn: "Review pending gates",
        promptEn: "Which 12-Gate checks on this page are still pending, and what should I watch for before placing an order?",
        prompt:
          'ช่วยดูเช็กลิสต์ 12-Gate บนหน้าจอตอนนี้ว่ายังมีด่านไหนที่ยังไม่ผ่านและต้องระวังก่อนวางออเดอร์บ้าง?',
      },
      ...CORE_PROMPTS,
    ];
  }
  if (pid === 'journal-root') {
    return [
      {
        label: 'วิเคราะห์ชุดไม้ที่กรองอยู่',
        labelEn: "Analyze filtered trades",
        promptEn: "Analyze the currently filtered journal trades: win rate, net P/L, recurring behavior and areas to improve.",
        prompt:
          'ช่วยวิเคราะห์รายการเทรดชุดที่กำลังกรองแสดงบนหน้าสมุดเทรดตอนนี้ (Winrate, Net P/L, พฤติกรรมที่เกิดซ้ำ) และจุดที่ควรปรับ',
      },
      ...CORE_PROMPTS,
    ];
  }
  if (pid === 'sec-marketplace') {
    return [
      {
        label: 'เกณฑ์เลือก Setup ในตลาด',
        labelEn: "Review setup criteria",
        promptEn: "What should I check when choosing an MT5-verified marketplace setup for my account size and risk?",
        prompt:
          'ช่วยแนะนำเกณฑ์ตรวจสอบ Setup MT5 Verified ใน Marketplace ให้เข้ากับ Risk และขนาดพอร์ตปัจจุบันของฉัน',
      },
      ...CORE_PROMPTS,
    ];
  }
  if (pid === 'sec-proprules') {
    return [
      {
        label: 'ตรวจกฎ VPS & Sync พอร์ตนี้',
        labelEn: "Check VPS and sync rules",
        promptEn: "Check whether this account’s sync method and VPS/IP settings meet the relevant FTMO, FundedNext, The5ers, FundingPips or Topstep rules.",
        prompt:
          'ช่วยตรวจว่าพอร์ตปัจจุบันของฉันใช้ช่องทางซิงก์และเงื่อนไข VPS/IP ถูกต้องตามกฎกองทุน (FTMO, FundedNext, The5ers, FundingPips, Topstep) หรือยัง',
      },
      ...CORE_PROMPTS,
    ];
  }
  return CORE_PROMPTS;
}

const QUICK_PROMPT_DISPLAY = new Map(
  ['sec-accounts', 'tv-chart-root', 'calculator-root', 'desk-cards-root', 'journal-root', 'sec-marketplace', 'sec-proprules']
    .flatMap((pageId) => getQuickPromptsForPage(pageId).map((item) => [item.prompt, item.promptEn] as const)),
);

const COACH_ACTION_LABELS: Record<string, string> = {
  'เปิดหน้า 12-Gate': 'Open 12-Gate',
  'เปิดเครื่องคำนวณ 3-TP': 'Open 3-TP Calc',
  'เปิดกราฟสด Live Chart': 'Open Live Chart',
  'เปิดสมุดเทรด Journal': 'Open Journal',
  'เปิด MT5 Sync': 'Open MT5 Sync',
  'ดูตาราง PropRules': 'Open PropRules',
};

const MODEL_QUALIFIERS_TH = new Map([
  ['Frontier Free', 'รุ่นขั้นสูงฟรี'],
  ['Balanced', 'สมดุล'],
  ['Fast', 'ตอบเร็ว'],
  ['Open Dense', 'โมเดลเปิดแบบ Dense'],
  ['High RPD', 'โควตารายวันสูง'],
]);

function formatCoachPageTitle(title: string, lang: DeskLanguage): string {
  const source = DESK_I18N[lang === 'en' ? 'th' : 'en'].pageTitles;
  const page = (Object.keys(source) as Array<keyof typeof source>).find((key) => source[key] === title);
  return page ? DESK_I18N[lang].pageTitles[page] : title;
}

function formatCoachModelLabel(label: string, lang: DeskLanguage): string {
  const pageLabel = label.replace(/^Live Page \+ GHR \((.+)\)$/, (_, title) => 'Live Page + GHR (' + formatCoachPageTitle(title, lang) + ')');
  return lang === 'th'
    ? pageLabel.replace(/\(([^()]+)\)$/, (suffix, qualifier) => {
        const translated = MODEL_QUALIFIERS_TH.get(qualifier);
        return translated === undefined ? suffix : `(${translated})`;
      })
    : pageLabel;
}

function formatCoachPrompt(prompt: string, lang: DeskLanguage): string {
  if (lang === 'th') return prompt;
  const quickPrompt = QUICK_PROMPT_DISPLAY.get(prompt);
  if (quickPrompt) return quickPrompt;
  for (const cmd of SLASH_COMMANDS) {
    if (!cmd.template) continue;
    const argumentMarker = `${cmd.template}\n\nรายละเอียดเพิ่มเติม: `;
    if (prompt === cmd.template) return getSlashCommandDescription(cmd.command, lang);
    if (prompt.startsWith(argumentMarker)) {
      return `${getSlashCommandDescription(cmd.command, lang)}\n\nDetails: ${prompt.slice(argumentMarker.length)}`;
    }
  }
  return formatDeskPromptDisplay(prompt, lang)
    .replace(/^อ่านบริบทหน้า "(.+)" และสรุปแผน GHR v3\.2 ปัจจุบัน$/, (_, title) => 'Read the "' + formatCoachPageTitle(title, lang) + '" page and summarize the current GHR v3.2 plan.')
    .replace(/^สรุปแผนปฏิบัติการเทรด GHR v3\.2 จากข้อมูลพอร์ตและโพย 3-TP ปัจจุบัน$/, 'Summarize the GHR v3.2 plan using the active account and 3-TP plan.')
    .replace(/^อ่านและวิเคราะห์หน้า "(.+)" ที่ฉันกำลังเปิดดูอยู่ตอนนี้ร่วมกับพอร์ต (.+?) และกราฟสด( \(.+\))? ช่วยสรุปจุดสำคัญ สิ่งที่ต้องระวัง และแผนปฏิบัติการขั้นต่อไป$/, (_, title, account, chart = '') => `Review "${formatCoachPageTitle(title, lang)}" with the ${formatAccountDisplayName(account, lang)} account and live chart${chart}. Summarize key points, risks and next steps.`)
    .replace(/^วิเคราะห์กราฟสด (\S+ \(\S+\)) ที่ราคา (\S+) พร้อมสรุปโครงสร้างแนวโน้ม EMA20\/EMA50, RSI\(14\), ATR\(14\), แนวรับ-แนวต้าน และแผน Position Sizing ตาม Risk (\$\S+) \(3-TP (BUY|SELL)\) ของพอร์ตปัจจุบัน( รวมถึงวิเคราะห์ภาพกราฟที่แนบมาด้วย)?$/, (_, symbol, price, risk, side, image) => `Analyze the ${symbol} live chart at ${price}. Review EMA20/50, RSI(14), ATR(14), support and resistance, and position sizing for a ${risk} risk 3-TP ${side} plan.${image ? ' Include the attached chart image.' : ''}`)
    .replace(/^วิเคราะห์ไฟล์\/ภาพกราฟ (\S+ \(\S+\)) ที่แนบมาและเชื่อมกับกรอบ Risk ของพอร์ตปัจจุบัน$/, 'Analyze the attached file or $1 chart image against the active account’s risk limits.')
    .replace(/^วิเคราะห์(?:กราฟสด|กราฟ) (.+) ร่วมกับสถิติพอร์ตล่าสุด \(Winrate ([\d.]+)%, PF ([\d.]+), จุดรั่วไหล: (.+)\) และตรวจสอบแผน 3-TP ปัจจุบัน$/, (_, chart, winRate, profitFactor, leak) => 'Analyze the ' + chart + ' chart alongside recent account statistics (win rate ' + winRate + '%, profit factor ' + profitFactor + ', performance leak: ' + formatLocalCoachReply(leak, lang) + ') and review the current 3-TP plan.');
}

function formatCoachSessionTitle(session: ChatSessionRecord, lang: DeskLanguage): string {
  const title = formatSessionTitleDisplay(session.title, lang);
  if (title !== session.title || lang === 'th' || title !== deriveSessionTitle(session.messages, '')) return title;
  const messages = session.messages.map((message) => message.role === 'user'
    ? { ...message, text: formatCoachPrompt(message.text, lang) }
    : message);
  return deriveSessionTitle(messages, title);
}

const LOCAL_COACH_PHRASES: ReadonlyArray<readonly [string, string]> = [
  ['ขณะนี้คุณอยู่ในโหมดออฟไลน์ จึงสรุปแผนปฏิบัติการจากข้อมูลในเครื่องให้ทันทีครับ:', 'Offline. Plan calculated from local workspace data:'],
  ['ออฟไลน์ ใช้ข้อมูลพอร์ตในเครื่องคำนวณแผน:', 'Offline. Plan calculated from local workspace data:'],
  ['Cloud AI (Multi-Model Free Tier + Voice + Live) ต้องเข้าสู่ระบบ Google + เปิด License (ปุ่ม "อ่านหน้านี้", "กราฟสด" และ "สรุปแผน GHR ทันที" คำนวณในเครื่องได้ฟรีไม่จำกัด)', 'Cloud AI requires Google sign-in and an active license. Read page, Live chart and the instant GHR plan work locally.'],
  ['บัญชีของคุณยังเป็น Free Plan · กรุณาเปิดใช้ License Key (PRO / TRIAL) เพื่อเชื่อม Google Gemini Cloud', 'Your account is on the Free plan. Activate a PRO or TRIAL license to use Gemini Cloud.'],
  ['ระหว่างนี้ นี่คือแผนปฏิบัติการจากข้อมูลพอร์ตและกราฟสดของคุณครับ:', 'Plan calculated from local workspace data:'],
  ['ระหว่างนี้ นี่คือแผนปฏิบัติการที่คำนวณจากพอร์ตและราคาตลาดสดโดยตรงครับ:', 'Plan calculated from local workspace data:'],
  ['คำนวณแผนจากข้อมูลพอร์ตในเครื่อง:', 'Plan calculated from local workspace data:'],
  ['แผนปฏิบัติการเทรด GHR v3.2 & Desk Cards', 'GHR v3.2 Trading Plan & Desk Cards'],
  ['สถานะพอร์ตและเป้าหมาย', 'Account status and target'],
  ['(พอร์ตส่วนตัว)**:', '(Personal Account)**:'],
  [' (กำไรสะสม ', ' (cumulative profit '],
  [' / เป้า ', ' / target '],
  [' · วันเทรด ', ' · trading days '],
  ['ถึงเป้าหมายสะสมแล้ว! สามารถถอนกำไรบางส่วนหรือปรับเป้าสะสมใหม่และคงวินัย 12-Gate ต่อเนื่อง', 'The target is reached. You can review a partial profit withdrawal or set a new target and continue using the 12-Gate checklist.'],
  ['ผ่านเป้าหมายกำไรแล้ว! หากวันเทรดยังไม่ครบ (', 'The profit target is reached. If the trading-day requirement is incomplete ('],
  [' วัน) ให้เปิดเพียง 0.01 Lot วันละ 1 ไม้เพื่อรักษาหน้าตัก', ' days), the plan calls for a single 0.01-lot trade per day to limit exposure.'],
  ['แผนเข้าออเดอร์ GHR v3.2', 'GHR v3.2 entry plan'],
  ['ขนาดสัญญา 3 ไม้ (1 Idea)', 'Three-leg position size (one idea)'],
  [' Lot × 3 ไม้', ' lots × 3 legs'],
  [' (รวม ', ' (total '],
  ['ย้าย SL ไม้ 3 ไป ', 'move the third leg’s SL to '],
  [' ล็อกกำไรสุทธิ ', ' to lock net profit of '],
  ['สมการค่าคาดหวัง 5 สถานะ', 'Five-state expectancy'],
  ['โอกาสล็อกกำไรสุทธิ (State 3+4)', 'Probability of locking net profit (states 3 and 4)'],
  ['ด่านตรวจ 12-Gate Fail-Closed Protocol', '12-Gate Fail-Closed Protocol'],
  ['**ผ่าน ', '**Passed '],
  [' ข้อ**', ' gates**'],
  ['เช็กลิสต์ 5 ประตู', '5-Gate checklist'],
  ['แผนคุมกฎ ', 'Plan for the '],
  ['ผ่านเกณฑ์ ', 'Passed the '],
  ['% เรียบร้อย (กำไรรวม ', '% rule (total profit '],
  [' · วันสูงสุด ', ' · best day '],
  ['ยอดถอนสุทธิ ', 'net payout '],
  ['วันสูงสุดคิดเป็น ', 'The best day accounts for '],
  ['% (เกิน ', '% (above '],
  ['%) แนะนำให้กระจายเก็บกำไรในวันถัดไปเพิ่มอีกอย่างน้อย ', '%). Spread profit across subsequent days by adding at least '],
  [' เพื่อให้ยอดรวมแตะ ', ' to reach a total of '],
  ['แนะนำคุมกำไรต่อวันให้อยู่ในกรอบ ', 'Keep daily profit in the range '],
  [' ต่อวัน (เช่น 1 Full + 1 TL) สม่ำเสมอ ', ' per day (e.g. one full sweep plus one trailing lock), consistently over '],
  [' วันทำการ เพื่อผ่านกฎ ', ' trading days to stay within the '],
  ['% แบบปลอดภัย', '% rule'],
  ['สรุปรอบกำไรพอร์ตส่วนตัว', 'Personal account profit cycle'],
  ['พอร์ตส่วนตัวไม่มีเพดาน % รายวัน — กำไรสะสมรอบนี้ ', 'This personal account has no daily percentage cap. Profit this cycle: '],
  [' คิดเป็นยอดรับสุทธิ ', '. Net payout: '],
  ['บริบทหน้าปัจจุบัน', 'Current page'],
  ['มีพอร์ตทั้งหมด ', 'Total accounts: '],
  [' บัญชี**', '**'],
  ['ผ่านครบ 12/12 ด่านเรียบร้อย พร้อมใช้งานภายใต้กรอบความเสี่ยง', 'All 12 gates passed. Stay within your risk limits.'],
  ['ด่านที่ยังรอเช็กก่อนเข้า', 'Gates to check before entry'],
  [' ข้อ):', ' pending):'],
  ['ตัวกรองบนหน้าจอ', 'Active filters'],
  ['): แสดง **', '): **'],
  [' ไม้**', ' trades**'],
  ['ตรวจสอบเกณฑ์ Marketplace: Setup ทุกชิ้นเทียบความเสี่ยงต่อไม้กับพอร์ต ', 'Marketplace checklist: Compare each setup’s per-trade risk with the '],
  [' และตรวจ Drawdown จริงก่อนนำไปใช้', ' account and check actual drawdown before using the setup'],
  ['หน้า PropRules Real-Time: ตรวจพอร์ต ', 'PropRules Live: Check the '],
  [' เทียบช่องทางซิงก์ ', ' account’s sync method '],
  [' และกฎ VPS/Consistency ของกองทุนก่อนกด Payout', ' and the firm’s VPS and consistency rules before requesting a payout'],
  ['วินัยปกติ (0 แจ้งเตือน)', 'No active discipline alerts'],
  ['ยังไม่พบจุดรั่วไหลชัดเจน — สถิติแต่ละ Session อยู่ในเกณฑ์สมดุล', 'No clear performance leak across sessions'],
  ['วิเคราะห์กราฟสด (', 'Live chart analysis ('],
  ['[แหล่งข้อมูล: ', '[Source: '],
  ['ราคาปัจจุบัน:', 'Current price:'],
  ['โครงสร้างแนวโน้ม:', 'Trend structure:'],
  ['ขาขึ้น (Price', 'Bullish (Price'],
  ['ขาลง (Price', 'Bearish (Price'],
  ['Sideway / Transition (รอการยืนยันทิศทาง)', 'Sideways or transitioning (awaiting confirmation)'],
  ['โมเมนตัม & ความผันผวน:', 'Momentum and volatility:'],
  ['ระวังแรงขายทำกำไร / รอย่อ', 'watch for profit-taking or wait for a pullback'],
  ['ระวังแรงดีดกลับ / รอแท่งยืนยัน', 'watch for a rebound or wait for a confirming close'],
  ['Balanced Momentum (โซนสมดุล)', 'Balanced momentum'],
  ['ATR(14) ปัจจุบัน = ', 'Current ATR(14) = '],
  [' เทียบกับระยะ SL มาตรฐาน GHR ', ' versus the standard GHR stop of '],
  ['แนวรับ / แนวต้าน (24 แท่งล่าสุด):', 'Support and resistance (last 24 bars):'],
  ['เทียบกับแผนโพย GHR v3.2 ปัจจุบัน:', 'Compared with the current GHR v3.2 plan:'],
  ['เทียบกับแผน GHR v3.2 ปัจจุบัน:', 'Compared with the current GHR v3.2 plan:'],
  ['แผนตั้ง ', 'Planned '],
  [' (ห่างจากราคาตลาด ', ' ('],
  [' ดอลลาร์ = ~', ' USD from market price, about '],
  [' จุด)', ' points)'],
  ['โหมดคำนวณโต๊ะปัจจุบัน:', 'Current calculator mode:'],
  [' · ความเสี่ยง ', ' · risk '],
  ['กฎ Safe Harbor & 12-Gate:', 'Safe Harbor & 12-Gate:'],
  ['โปรดตรวจสอบ Gate 1–2 (H1 ปิดยืนยันโครงสร้าง) และ Gate 3 (M5 ย่อตัวไม่ไล่ราคา) ก่อนวาง Limit (เครื่องมือวิเคราะห์เชิงโครงสร้างและความเสี่ยง ไม่ใช่สัญญาณซื้อขาย)', 'Review Gates 1–2 (confirm structure at the H1 close) and Gate 3 (M5 pullback) before placing a limit order. Analytical risk & statistics tool only — Not Financial Advice.'],
];

function formatLocalCoachReply(text: string, lang: DeskLanguage): string {
  // Local engines store generated text as Thai. Format it for display without rerunning the plan.
  const account = /^📌 \*\*แผนปฏิบัติการเทรด GHR v3\.2 & Desk Cards — (.+)\*\*$/m.exec(text)?.[1];
  const search = /ตัวกรองบนหน้าจอ \(.*?Search:"(.*?)"\): แสดง/m.exec(text)?.[1];
  const localized = LOCAL_COACH_PHRASES.reduce(
    (value, [source, target]) => value.replaceAll(source, target),
    text,
  ).replace(/฿(?=\d)/g, 'THB ');
  return localized
    .replace(/( · trading days \d+\/\d+) วัน/g, '$1 days')
    .replace(/ขาดกำไรอีก \*\*([^*]+)\*\* → ต้องการชนะ \*\*Full 3 ไม้ อีก (\d+) ครั้ง\*\* \(([^)]+)\/ครั้ง\) หรือ \*\*Trailing Lock อีก (\d+) ครั้ง\*\* \(([^)]+)\/ครั้ง\)/g, 'Profit remaining: **$1** → **$2 full sweeps** ($3 each) or **$4 trailing locks** ($5 each)')
    .replace(/(Current page \()(.+)(\)\*\*:)/g, (_, prefix, title, suffix) => prefix + formatCoachPageTitle(title, lang) + suffix)
    .replace(/ช่วง (ASIA|LONDON|NEW_YORK) Winrate (\S+)% \(สุทธิ (\S+) USD \/ เฉลี่ย (\S+)R\) เป็นจุดที่ลด Equity มากที่สุด/g, '$1 had the largest net loss ($2% win rate, net $3 USD, average $4R)')
    .replace(/G(\d+) \((.+?)\)(?=, G\d+|\*\*)/g, (gate, code, title) => {
      const definition = TWELVE_GATE_DEFINITIONS.find((item) => item.code === code && item.titleTh === title);
      return definition ? 'G' + code + ' (' + definition.titleEn + ')' : gate;
    })
    .replace(/(Trading Plan & Desk Cards — |the \*\*)([^*\n]+)(?=\*\*)/g, (_, prefix, account) => prefix + formatAccountDisplayName(account, lang))
    .split('\n')
    .map((line, index) => {
      const appText = [account, search].reduce<string>((value, userText) => userText ? value.replaceAll(userText, '') : value, line);
      if (!/\p{Script=Thai}/u.test(appText)) return line;
      return index === 0 && !/^[📌📊]/u.test(line)
        ? 'The remote service returned an error.'
        : 'This plan detail is available in Thai.';
    })
    .join('\n');
}

function formatCoachMessage(message: ChatMessage, lang: DeskLanguage): string {
  if (lang === 'th') return message.text;
  const { id, role, text, model, routedBy } = message;
  if (role === 'user') return routedBy === 'live' ? text : formatCoachPrompt(text, lang);
  const welcome = DEFAULT_STATE.chatMessages?.[0];
  if (
    id === welcome?.id ||
    id === 'welcome-ghr-v32' ||
    text.startsWith('สวัสดีครับ! ผมคือโค้ชวางแผนการเทรดประจำโต๊ะ GHR')
  ) {
    return 'Ask about 3-TP entries, the five-outcome risk model, the fail-closed 12-Gate checklist, or the consistency cap in GHR v3.2. Choose a prompt or type a question.';
  }
  if (model === 'AI Live Desk' && /^W-\d+$/.test(id)) {
    return text.replace(/^เปิด Session ใหม่พร้อมเชื่อมต่อพอร์ต \*\*(.+)\*\* · เลือกถามจุดเข้า 3-TP, เช็ก 12-Gate หรือพิมพ์ `\/` เพื่อดูคำสั่งด่วนครับ$/, (_, account) => `New chat connected to **${formatAccountDisplayName(account, lang)}**. Ask about 3-TP entries or the 12-Gate checklist, or type \`/\` for commands.`);
  }
  if (model === 'AI Live Desk' && /^RESET-\d+$/.test(id)) {
    return text.replace(/^รีเซ็ตข้อความใน Session "(.+)" เรียบร้อยแล้ว$/, (_, title) => title === 'ปัจจุบัน' ? 'Messages cleared in this chat.' : `Messages cleared in "${formatSessionTitleDisplay(title, lang)}".`);
  }
  if (routedBy === 'local') return formatLocalCoachReply(text, lang);
  return formatExternalCoachReply(text.replace(/\n\n\*\(หยุดการสร้างคำตอบโดยผู้ใช้\)\*$/, '\n\n*(Response stopped by the user.)*'), lang);
}

function formatCoachError(message: string | undefined, lang: DeskLanguage, fallback: string): string {
  return !message || (lang === 'en' && /\p{Script=Thai}/u.test(message)) ? fallback : message;
}

function formatExternalCoachReply(text: string, lang: DeskLanguage): string {
  return lang === 'en' && /\p{Script=Thai}/u.test(text)
    ? 'This reply contains Thai. Switch to TH to read it, or retry in English.'
    : text;
}

function renderInlineMarkdown(text: string): React.ReactNode {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g);
  return tokens.map((tok, idx) => {
    if (tok.startsWith('**') && tok.endsWith('**') && tok.length > 4) {
      return (
        <strong key={idx} style={{ fontWeight: 700, color: 'inherit' }}>
          {tok.slice(2, -2)}
        </strong>
      );
    }
    if (tok.startsWith('`') && tok.endsWith('`') && tok.length > 2) {
      return (
        <code key={idx} className="coach-inline-code">
          {tok.slice(1, -1)}
        </code>
      );
    }
    const linkMatch = tok.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="coach-md-link"
        >
          {linkMatch[1]}
        </a>
      );
    }
    return <React.Fragment key={idx}>{tok}</React.Fragment>;
  });
}

function isTableSeparatorLine(line: string): boolean {
  const clean = line.trim();
  return clean.includes('|') && /^\|?[\s:-]+(?:\|[\s:-]+)+\|?$/.test(clean);
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

const CodeBlockWithCopy: React.FC<{ language: string; code: string; lang: DeskLanguage }> = ({ language, code, lang }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="coach-code-block">
      <div className="coach-code-head">
        <span className="mono">{language || 'text'}</span>
        <button
          type="button"
          className="btn xs"
          onClick={() => {
            void navigator.clipboard?.writeText(code).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1400);
            });
          }}
        >
          {copied ? deskText(lang, 'Copied', 'คัดลอกแล้ว') : deskText(lang, 'Copy', 'คัดลอก')}
        </button>
      </div>
      <pre className="mono">{code}</pre>
    </div>
  );
};

const EMPTY_MESSAGES: ChatMessage[] = [];

function renderFormattedMessage(text: string, deskLang: DeskLanguage): React.ReactNode {
  const normalized = String(text || '').replace(/\r\n/g, '\n');
  const codeSegments = normalized.split(/(```[^\n]*\n[\s\S]*?```)/g);
  const output: React.ReactNode[] = [];

  codeSegments.forEach((segment, segIdx) => {
    if (!segment) return;
    if (segment.startsWith('```') && segment.endsWith('```')) {
      const firstNewline = segment.indexOf('\n');
      const lang = firstNewline > 3 ? segment.slice(3, firstNewline).trim() : 'text';
      const body = firstNewline >= 0 ? segment.slice(firstNewline + 1, -3).replace(/\n$/, '') : segment.slice(3, -3);
      output.push(<CodeBlockWithCopy key={`code-${segIdx}`} language={lang} code={body} lang={deskLang} />);
      return;
    }

    const lines = segment.split('\n');
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        i++;
        continue;
      }

      // Markdown table
      if (
        trimmed.includes('|') &&
        i + 1 < lines.length &&
        isTableSeparatorLine(lines[i + 1])
      ) {
        const headers = splitTableRow(trimmed);
        i += 2;
        const rows: string[][] = [];
        while (i < lines.length && lines[i].trim().includes('|') && lines[i].trim() !== '') {
          rows.push(splitTableRow(lines[i]));
          i++;
        }
        output.push(
          <div key={`tbl-${segIdx}-${i}`} className="coach-md-table-wrap">
            <table className="coach-md-table">
              <thead>
                <tr>
                  {headers.map((h, hIdx) => (
                    <th key={hIdx}>{renderInlineMarkdown(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, rIdx) => (
                  <tr key={rIdx}>
                    {headers.map((_, cIdx) => (
                      <td key={cIdx}>{renderInlineMarkdown(r[cIdx] ?? '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }

      // Headings
      const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (headingMatch) {
        output.push(
          <div key={`h-${segIdx}-${i}`} className="coach-md-heading">
            {renderInlineMarkdown(headingMatch[2])}
          </div>
        );
        i++;
        continue;
      }

      // Bullet list
      if (/^[-*•]\s+/.test(trimmed)) {
        const items: string[] = [];
        while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
          i++;
        }
        output.push(
          <ul key={`ul-${segIdx}-${i}`} className="coach-md-list">
            {items.map((item, idx) => (
              <li key={idx}>{renderInlineMarkdown(item)}</li>
            ))}
          </ul>
        );
        continue;
      }

      // Numbered list
      if (/^\d+[.)]\s+/.test(trimmed)) {
        const items: string[] = [];
        while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''));
          i++;
        }
        output.push(
          <ol key={`ol-${segIdx}-${i}`} className="coach-md-list ordered">
            {items.map((item, idx) => (
              <li key={idx}>{renderInlineMarkdown(item)}</li>
            ))}
          </ol>
        );
        continue;
      }

      // Blockquote
      if (trimmed.startsWith('>')) {
        const quotes: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith('>')) {
          quotes.push(lines[i].trim().replace(/^>\s?/, ''));
          i++;
        }
        output.push(
          <blockquote key={`bq-${segIdx}-${i}`} className="coach-md-quote">
            {renderInlineMarkdown(quotes.join(' '))}
          </blockquote>
        );
        continue;
      }

      // Paragraph line(s)
      const paraLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !/^(#{1,4}\s+|[-*•]\s+|\d+[.)]\s+|>\s?)/.test(lines[i].trim()) &&
        !(lines[i].trim().includes('|') && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1]))
      ) {
        paraLines.push(lines[i]);
        i++;
      }
      output.push(
        <p key={`p-${segIdx}-${i}`} className="coach-md-para">
          {renderInlineMarkdown(paraLines.join('\n'))}
        </p>
      );
    }
  });

  return output.length > 0 ? output : renderInlineMarkdown(text);
}

function getActiveSessionStorageKey(uid?: string | null): string {
  const clean = typeof uid === 'string' && uid.trim() ? uid.trim().replace(/[^a-zA-Z0-9_-]/g, '') : 'guest';
  return `TALLYNX_ACTIVE_CHAT_SESSION_${clean}`;
}

function formatShortTime(iso: string, lang: DeskLanguage): string {
  try {
    return new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', {
      timeZone: 'Asia/Bangkok',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

export const TradingCoachChat: React.FC<TradingCoachChatProps> = ({
  lang = 'en',
  state,
  isOnline,
  currentUserUid = null,
  onUpdateMessages,
  onUpdateModel,
  onResetChat,
  initialChartSymbol,
  onClearInitialChartSymbol,
  pendingPrompt,
  onClearPendingPrompt,
  compactDock = false,
  externalLiveTelemetry,
  externalStructureTelemetry,
  externalChartSymbol,
  externalChartTimeframe,
  externalChartLoading,
  onExternalRefreshChart,
  pageSnapshot,
  onQuickDeskAction,
}) => {
  const t = useCallback((en: string, th: string) => deskText(lang, en, th), [lang]);
  const byok = useByokCredentials(currentUserUid);
  const canCloudChat = isOnline && canRequestDeskAi(byok, currentUserUid);
  const textCredential = selectDeskAiCredential(byok);
  const personalTextModel = textCredential && textCredential.provider !== 'platform'
    ? textCredential.model ?? AI_MODEL_CATALOG[textCredential.provider][0] : undefined;
  const providerLabel = textCredential?.provider === 'google' ? 'Google Gemini'
    : textCredential?.provider === 'openrouter' ? 'OpenRouter'
      : textCredential?.provider === 'codex_oauth' ? (byok.openAiKey ? 'OpenAI API' : 'Codex OAuth') : undefined;
  const activeAiStatus = getActiveDeskAiStatus(byok, currentUserUid);
  const aiStatusCopy = activeAiStatus.state === 'connected'
    ? t('Connected', 'เชื่อมต่อแล้ว')
    : activeAiStatus.state === 'expired'
      ? t('Expired', 'หมดอายุ')
      : t('Not connected', 'ยังไม่เชื่อม');
  const canCloudVoice = isOnline && canRequestDeskAi(byok, currentUserUid, 'voice');
  const voiceCredential = selectDeskAiCredential(byok, 'voice');
  const voiceProvider = voiceCredential?.provider;
  const voiceKey = voiceCredential?.key;
  const byokRequiredCopy = t('Connect a valid provider key in API Keys / Codex OAuth.', 'เชื่อมต่อคีย์ที่ใช้งานได้ในคีย์ API / Codex OAuth');
  const getActiveAiHeaders = useCallback(async (capability: 'text' | 'voice') => {
    const currentUser = auth.currentUser;
    if ((currentUser?.uid ?? null) !== currentUserUid) return null;
    const headers = await getDeskAiRequestHeaders(currentUser, capability);
    return (auth.currentUser?.uid ?? null) === currentUserUid ? headers : null;
  }, [currentUserUid]);
  const activeQuickPrompts = useMemo(
    () => getQuickPromptsForPage(pageSnapshot?.activePageId),
    [pageSnapshot?.activePageId]
  );

  const {
    chartSymbol,
    setChartSymbol,
    chartTimeframe,
    setChartTimeframe,
    liveTelemetry,
    structureTelemetry,
    chartLoading,
    chartError,
    autoPoll,
    setAutoPoll,
    refreshTelemetry,
  } = useLiveChartFeed({
    enabled: !compactDock,
    initialSymbol: 'XAUUSD',
    initialTimeframe: '15m',
    pollIntervalMs: 30000,
  });

  const activeChartSymbol = compactDock ? externalChartSymbol || 'XAUUSD' : chartSymbol;
  const activeChartTimeframe = compactDock ? externalChartTimeframe || '15m' : chartTimeframe;
  const activeLiveTelemetry = compactDock ? (externalLiveTelemetry ?? null) : liveTelemetry;
  const activeStructureTelemetry = compactDock
    ? (externalStructureTelemetry ?? null)
    : structureTelemetry;
  const activeChartLoading = compactDock ? Boolean(externalChartLoading) : chartLoading;

  const triggerRefreshTelemetry = useCallback(async () => {
    if (compactDock) {
      if (onExternalRefreshChart) return onExternalRefreshChart();
      return externalLiveTelemetry ?? null;
    }
    return refreshTelemetry(chartSymbol, chartTimeframe);
  }, [
    compactDock,
    onExternalRefreshChart,
    externalLiveTelemetry,
    refreshTelemetry,
    chartSymbol,
    chartTimeframe,
  ]);

  // Multi-Session Management & Recent Chats
  const [sessions, setSessions] = useState<ChatSessionRecord[]>(() => {
    const sync = loadChatSessionsSync(currentUserUid);
    if (sync.length > 0) return sync;
    return migrateLegacyChatMessages(state.chatMessages, state.activePort);
  });
  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    try {
      const saved = window.localStorage.getItem(getActiveSessionStorageKey(currentUserUid));
      if (saved && sessions.some((s) => s.id === saved)) return saved;
    } catch {
      // ignore storage errors
    }
    return sessions[0]?.id || 'CS-PRIMARY';
  });
  const [showSessionsDrawer, setShowSessionsDrawer] = useState(false);
  const [sessionSearch, setSessionSearch] = useState('');
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  // Async load from IndexedDB on mount / user switch
  useEffect(() => {
    let cancelled = false;
    void loadChatSessionsFromIndexedDB(currentUserUid).then((loaded) => {
      if (cancelled) return;
      if (loaded.length > 0) {
        setSessions(loaded);
        try {
          const savedId = window.localStorage.getItem(getActiveSessionStorageKey(currentUserUid));
          if (savedId && loaded.some((s) => s.id === savedId)) {
            setActiveSessionId(savedId);
          } else {
            setActiveSessionId(loaded[0].id);
          }
        } catch {
          setActiveSessionId(loaded[0].id);
        }
      } else {
        const migrated = migrateLegacyChatMessages(state.chatMessages, state.activePort);
        setSessions(migrated);
        setActiveSessionId(migrated[0].id);
        void saveChatSessionsToIndexedDB(migrated, currentUserUid);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currentUserUid]);

  useEffect(() => {
    try {
      window.localStorage.setItem(getActiveSessionStorageKey(currentUserUid), activeSessionId);
    } catch {
      // ignore
    }
  }, [activeSessionId, currentUserUid]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || sessions[0],
    [sessions, activeSessionId]
  );
  const recentOtherSession = useMemo(
    () => (activeSession ? getMostRecentOtherSession(sessions, activeSession.id) : null),
    [sessions, activeSession]
  );
  const filteredSessions = useMemo(
    () => filterSessions(sessions, sessionSearch),
    [sessions, sessionSearch]
  );

  const messages = activeSession?.messages ?? state.chatMessages ?? EMPTY_MESSAGES;
  const transcript = useMemo(() => {
    let prevUserMsg: ChatMessage | undefined;
    return messages.map((msg) => {
      const isUser = msg.role === 'user';
      const displayText = formatCoachMessage(msg, lang);
      const entry = {
        msg,
        displayText,
        body: isUser ? null : renderFormattedMessage(displayText, lang),
        prevUserMsg: isUser ? undefined : prevUserMsg,
      };
      if (isUser) prevUserMsg = msg;
      return entry;
    });
  }, [messages, lang]);
  const selectedModel: ChatModelId = normalizeChatModelPreference(state.chatModel);

  const persistSessionUpdate = useCallback(
    (nextSessions: ChatSessionRecord[], targetActiveId?: string) => {
      const sorted = sortSessionsByRecent(nextSessions);
      setSessions(sorted);
      const nextActive = sorted.find((s) => s.id === (targetActiveId || activeSession?.id)) || sorted[0];
      if (nextActive) {
        if (targetActiveId || !sorted.some((s) => s.id === activeSessionId)) {
          setActiveSessionId(nextActive.id);
        }
        onUpdateMessages(nextActive.messages);
      }
      void saveChatSessionsToIndexedDB(sorted, currentUserUid);
    },
    [activeSession?.id, activeSessionId, currentUserUid, onUpdateMessages]
  );

  const commitActiveSessionMessages = useCallback(
    (nextMessages: ChatMessage[], meta?: { lastModel?: string; mode?: 'text' | 'voice' | 'live' }) => {
      if (!activeSession) {
        const created = createChatSession({ activePortId: state.activePort });
        created.messages = nextMessages;
        created.title = deriveSessionTitle(nextMessages, created.title);
        persistSessionUpdate([created], created.id);
        return;
      }
      const nextTitle =
        activeSession.title === 'แชทวางแผนเทรดใหม่' || activeSession.title === 'AI Live Desk · Session หลัก'
          ? deriveSessionTitle(nextMessages, activeSession.title)
          : activeSession.title;
      const updated: ChatSessionRecord = {
        ...activeSession,
        title: nextTitle,
        updatedAt: new Date().toISOString(),
        activePortId: state.activePort,
        lastModel: meta?.lastModel || nextMessages[nextMessages.length - 1]?.model || activeSession.lastModel,
        mode: meta?.mode || activeSession.mode,
        messages: nextMessages,
      };
      persistSessionUpdate(upsertSession(sessions, updated), updated.id);
    },
    [activeSession, persistSessionUpdate, sessions, state.activePort]
  );

  const abortControllerRef = useRef<AbortController | null>(null);
  const liveTokenRequestRef = useRef<AbortController | null>(null);
  const liveClientRef = useRef<GeminiLiveDeskClient | null>(null);

  const handleCreateNewSession = useCallback(
    (mode?: 'text' | 'voice' | 'live') => {
      if (abortControllerRef.current || liveTokenRequestRef.current || liveClientRef.current) return;
      const welcome: ChatMessage = {
        id: 'W-' + Date.now(),
        role: 'model',
        text: `เปิด Session ใหม่พร้อมเชื่อมต่อพอร์ต **${state.accounts?.[state.activePort]?.name || state.activePort}** · เลือกถามจุดเข้า 3-TP, เช็ก 12-Gate หรือพิมพ์ \`/\` เพื่อดูคำสั่งด่วนครับ`,
        timestamp: getBangkokTimeHHMM(),
        model: 'AI Live Desk',
      };
      const fresh = createChatSession({
        activePortId: state.activePort,
        welcomeMessage: welcome,
        mode: mode || 'text',
      });
      persistSessionUpdate(upsertSession(sessions, fresh), fresh.id);
      setShowSessionsDrawer(false);
    },
    [persistSessionUpdate, sessions, state.accounts, state.activePort]
  );

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      if (abortControllerRef.current || liveTokenRequestRef.current || liveClientRef.current) return;
      const found = sessions.find((s) => s.id === sessionId);
      if (!found) return;
      setActiveSessionId(found.id);
      onUpdateMessages(found.messages);
      setShowSessionsDrawer(false);
    },
    [onUpdateMessages, sessions]
  );

  // Interaction Modes: Chat | Voice | Live
  const [chatMode, setChatMode] = useState<'text' | 'voice' | 'live'>(() => {
    try {
      const saved = window.localStorage.getItem('TALLYNX_COACH_MODE');
      return saved === 'voice' || saved === 'live' ? saved : 'text';
    } catch {
      return 'text';
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem('TALLYNX_COACH_MODE', chatMode);
    } catch {
      // ignore
    }
  }, [chatMode]);

  // Composer, Streaming & Grounding State
  const [inputText, setInputText] = useState('');
  const [forceWebSearch, setForceWebSearch] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingModelLabel, setStreamingModelLabel] = useState('');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<QueuedAttachment[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [slashHighlightIdx, setSlashHighlightIdx] = useState(0);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  const threadContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Voice Mode State
  const [selectedVoice, setSelectedVoice] = useState<string>('Aoede');
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceAutoSend, setVoiceAutoSend] = useState(true);
  const [voiceAutoTts, setVoiceAutoTts] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [recordingSec, setRecordingSec] = useState(0);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const wavRecorderRef = useRef<VoiceWavRecorder | null>(null);
  const speechRecRef = useRef<{ stop: () => void; abort?: () => void } | null>(null);
  const ttsHandleRef = useRef<SpeechPlaybackHandle | null>(null);
  const ttsRequestRef = useRef<AbortController | null>(null);
  const transcribeRequestRef = useRef<AbortController | null>(null);

  // Live Mode State (Gemini 3.8 Live + Ephemeral Token WebSocket)
  const [liveModelTier, setLiveModelTier] = useState<'standard' | 'thinking'>('standard');
  const [liveConnState, setLiveConnState] = useState<LiveDeskConnectionState>('IDLE');
  const [liveMuted, setLiveMuted] = useState(false);
  const [liveLevel, setLiveLevel] = useState(0);
  const [liveDurationSec, setLiveDurationSec] = useState(0);
  const [liveInterimUser, setLiveInterimUser] = useState('');
  const [liveInterimModel, setLiveInterimModel] = useState('');
  const [liveTextInput, setLiveTextInput] = useState('');
  const [liveNotice, setLiveNotice] = useState<[string, string] | null>(null);

  const acc = useMemo(
    () => getAccountComputed(state.accounts, state.journal, state.activePort),
    [state.accounts, state.journal, state.activePort]
  );
  const calc = getCalcMetrics(state.calcDir, state.calcEntry, state.calcRisk);
  const cons = evaluateConsistencyRule(state.cycleDays, state.includeFeeRefund, state.thbRate, {
    consistencyCapPct: acc.consistencyCapPct,
    feeRefundUsd: acc.feeRefundUsd,
    profitSplitPct: acc.profitSplitPct,
  });
  const gatesChecked = Object.values(state.quickGates || {}).filter(Boolean).length;

  useEffect(() => {
    if (!compactDock && initialChartSymbol && initialChartSymbol.trim()) {
      setChartSymbol(initialChartSymbol.trim().toUpperCase());
      onClearInitialChartSymbol?.();
    }
  }, [compactDock, initialChartSymbol, setChartSymbol, onClearInitialChartSymbol]);

  useEffect(() => {
    if (pendingPrompt && pendingPrompt.trim()) {
      setInputText(pendingPrompt.trim());
      onClearPendingPrompt?.();
    }
  }, [pendingPrompt, onClearPendingPrompt]);

  useEffect(() => {
    if (threadContainerRef.current) {
      threadContainerRef.current.scrollTop = threadContainerRef.current.scrollHeight;
    }
  }, [messages.length, isSending, streamingText]);

  // Voice recording timer
  useEffect(() => {
    if (!isRecordingVoice) {
      setRecordingSec(0);
      return;
    }
    const timer = window.setInterval(() => setRecordingSec((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [isRecordingVoice]);

  // Live call duration timer
  useEffect(() => {
    if (liveConnState === 'IDLE' || liveConnState === 'ERROR') {
      setLiveDurationSec(0);
      return;
    }
    const timer = window.setInterval(() => setLiveDurationSec((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [liveConnState]);

  useEffect(() => {
    setIsSending(false);
    setStreamingText('');
    setStreamingModelLabel('');
    return () => {
      const request = abortControllerRef.current;
      abortControllerRef.current = null;
      request?.abort();
    };
  }, [currentUserUid]);

  useEffect(() => {
    setLiveConnState('IDLE');
    setLiveLevel(0);
    setLiveInterimUser('');
    setLiveInterimModel('');
    setIsRecordingVoice(false);
    setIsTranscribing(false);
    setVoiceLevel(0);
    setSpeakingMsgId(null);
    return () => {
      liveTokenRequestRef.current?.abort();
      liveTokenRequestRef.current = null;
      transcribeRequestRef.current?.abort();
      transcribeRequestRef.current = null;
      ttsRequestRef.current?.abort();
      ttsRequestRef.current = null;
      ttsHandleRef.current?.stop();
      ttsHandleRef.current = null;
      const recognition = speechRecRef.current;
      speechRecRef.current = null;
      recognition?.abort?.();
      const recorder = wavRecorderRef.current;
      wavRecorderRef.current = null;
      void recorder?.stop().catch(() => undefined);
      const liveClient = liveClientRef.current;
      liveClientRef.current = null;
      void liveClient?.disconnect();
    };
  }, [currentUserUid, voiceProvider, voiceKey, chatMode]);

  const slashSuggestions = useMemo(() => filterSlashCommands(inputText), [inputText]);

  const queueFiles = useCallback((files: FileList | File[] | null | undefined) => {
    if (!files) return;
    const arr = Array.from(files).slice(0, 3);
    for (const file of arr) {
      const mime = (file.type || '').toLowerCase() || (file.name.endsWith('.csv') ? 'text/csv' : file.name.endsWith('.md') ? 'text/markdown' : 'text/plain');
      const supported =
        /^image\/(png|jpeg|jpg|webp)$/.test(mime) ||
        mime === 'application/pdf' ||
        /^text\/(plain|csv|markdown|json)$/.test(mime) ||
        mime === 'application/json';
      if (!supported) {
        setErrorBanner(t(`Unsupported file: ${file.name}. Use PNG, JPG, WEBP, PDF, CSV, TXT, MD or JSON.`, `ไฟล์ ${file.name} ไม่รองรับ (รองรับ PNG/JPG/WEBP, PDF, CSV, TXT, MD, JSON)`));
        continue;
      }
      if (file.size > 2_500_000) {
        setErrorBanner(t(`${file.name} exceeds 2.5 MB. Reduce its size before attaching.`, `ไฟล์ ${file.name} ใหญ่เกิน 2.5 MB กรุณาย่อขนาดก่อนแนบ`));
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : '';
        const idx = dataUrl.indexOf(';base64,');
        if (idx < 0) return;
        const base64 = dataUrl.slice(idx + 8);
        setAttachments((prev) => {
          if (prev.length >= 3) return prev;
          return [
            ...prev,
            {
              id: 'ATT-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
              name: file.name || 'attachment',
              mimeType: mime,
              base64,
              previewUrl: mime.startsWith('image/') ? dataUrl : undefined,
            },
          ];
        });
      };
      reader.readAsDataURL(file);
    }
  }, [t]);

  const speakMessage = useCallback(
    async (msgId: string, text: string) => {
      ttsRequestRef.current?.abort();
      ttsRequestRef.current = null;
      ttsHandleRef.current?.stop();
      ttsHandleRef.current = null;
      if (speakingMsgId === msgId) {
        setSpeakingMsgId(null);
        return;
      }
      const controller = new AbortController();
      ttsRequestRef.current = controller;
      setSpeakingMsgId(msgId);
      function finished() {
        if (ttsRequestRef.current !== controller) return;
        ttsRequestRef.current = null;
        ttsHandleRef.current = null;
        setSpeakingMsgId(null);
      }
      try {
        const requestHeaders = canCloudVoice ? await getActiveAiHeaders('voice') : undefined;
        if (requestHeaders === null) return finished();
        controller.signal.throwIfAborted();
        const handle = await speakTextWithFallback({
          text, requestHeaders, signal: controller.signal, lang, voice: selectedVoice, onEnd: finished,
        });
        if (controller.signal.aborted) handle.stop();
        else if (ttsRequestRef.current === controller) ttsHandleRef.current = handle;
      } catch {
        finished();
      }
    },
    [canCloudVoice, getActiveAiHeaders, lang, selectedVoice, speakingMsgId]
  );

  const handleInstantLocalPlan = useCallback(() => {
    if (abortControllerRef.current || liveTokenRequestRef.current || liveClientRef.current) return;
    setErrorBanner(null);
    const nowTime = getBangkokTimeHHMM();
    const userMsg: ChatMessage = {
      id: 'U-' + Date.now(),
      role: 'user',
      text: pageSnapshot
        ? `อ่านบริบทหน้า "${pageSnapshot.activePageTitle}" และสรุปแผน GHR v3.2 ปัจจุบัน`
        : 'สรุปแผนปฏิบัติการเทรด GHR v3.2 จากข้อมูลพอร์ตและโพย 3-TP ปัจจุบัน',
      timestamp: nowTime,
      mode: chatMode,
    };
    const chartSupplement = activeLiveTelemetry
      ? `\n\n${buildLocalLiveChartAnalysis(activeLiveTelemetry, state)}`
      : '';
    const text = `${generateLocalTacticalPlan(state, pageSnapshot)}${chartSupplement}`;
    const planReply: ChatMessage = {
      id: 'M-' + (Date.now() + 1),
      role: 'model',
      text,
      timestamp: nowTime,
      model: pageSnapshot ? `Live Page + GHR (${pageSnapshot.activePageTitle})` : 'GHR Tactical Engine (Instant)',
      routedBy: 'local',
      suggestedActions: extractDeskActionSuggestions(text, pageSnapshot?.activePageId),
    };
    commitActiveSessionMessages([...messages, userMsg, planReply], { lastModel: planReply.model });
  }, [activeLiveTelemetry, chatMode, commitActiveSessionMessages, messages, pageSnapshot, state]);

  const handleSendMessage = useCallback(
    async (
      textToSend?: string,
      opts?: { forceWebSearch?: boolean; sourceMode?: 'text' | 'voice' | 'live' }
    ) => {
      const rawInput = (textToSend !== undefined ? textToSend : inputText).trim();
      const parsedSlash = parseSlashCommand(rawInput);

      if (parsedSlash) {
        if (parsedSlash.matched.action === 'new_session') {
          if (textToSend === undefined) setInputText('');
          handleCreateNewSession(chatMode);
          return;
        }
        if (parsedSlash.matched.action === 'mode' && parsedSlash.matched.mode) {
          if (textToSend === undefined) setInputText('');
          setChatMode(parsedSlash.matched.mode);
          return;
        }
      }

      const queuedSnap = [...attachments];
      if ((!rawInput && queuedSnap.length === 0) || isSending || abortControllerRef.current) return;

      const raw = parsedSlash
        ? parsedSlash.effectivePrompt
        : rawInput ||
          `วิเคราะห์ไฟล์/ภาพกราฟ ${activeChartSymbol} (${activeChartTimeframe}) ที่แนบมาและเชื่อมกับกรอบ Risk ของพอร์ตปัจจุบัน`;
      const effectiveSearch = Boolean(
        opts?.forceWebSearch || forceWebSearch || parsedSlash?.forceWebSearch
      );
      const msgMode = opts?.sourceMode || chatMode;

      setErrorBanner(null);
      if (textToSend === undefined) {
        setInputText('');
      }
      if (queuedSnap.length > 0) {
        setAttachments([]);
      }

      const nowTime = getBangkokTimeHHMM();
      const attachmentMeta: ChatMessageAttachmentMeta[] = queuedSnap.map((a) => ({
        name: a.name,
        mimeType: a.mimeType,
      }));
      const userMsg: ChatMessage = {
        id: 'U-' + Date.now(),
        role: 'user',
        text: raw,
        timestamp: nowTime,
        chartSummary: activeLiveTelemetry
          ? `${activeLiveTelemetry.symbol} ${activeLiveTelemetry.timeframe} @ ${activeLiveTelemetry.currentPrice}`
          : undefined,
        imageAttached: queuedSnap.some((a) => a.mimeType.startsWith('image/')),
        attachments: attachmentMeta.length > 0 ? attachmentMeta : undefined,
        mode: msgMode,
      };
      const nextHistory = [...messages, userMsg];
      commitActiveSessionMessages(nextHistory, { mode: msgMode });

      const buildChartSupplement = () =>
        activeLiveTelemetry ? `\n\n${buildLocalLiveChartAnalysis(activeLiveTelemetry, state)}` : '';

      if (!isOnline) {
        const offlineText = `ออฟไลน์ ใช้ข้อมูลพอร์ตในเครื่องคำนวณแผน:\n\n${generateLocalTacticalPlan(
          state,
          pageSnapshot
        )}${buildChartSupplement()}`;
        const offlineReply: ChatMessage = {
          id: 'M-' + (Date.now() + 1),
          role: 'model',
          text: offlineText,
          timestamp: nowTime,
          model: 'Offline Desk Engine',
          routedBy: 'local',
          suggestedActions: extractDeskActionSuggestions(offlineText, pageSnapshot?.activePageId),
        };
        commitActiveSessionMessages([...nextHistory, offlineReply], { lastModel: offlineReply.model });
        return;
      }

      if (!canCloudChat) {
        setErrorBanner(byokRequiredCopy);
        const localText = `${generateLocalTacticalPlan(
          state,
          pageSnapshot
        )}${buildChartSupplement()}`;
        const localReply: ChatMessage = {
          id: 'M-' + (Date.now() + 1),
          role: 'model',
          text: localText,
          timestamp: nowTime,
          model: 'Tactical + Telemetry Engine (Local)',
          routedBy: 'local',
          suggestedActions: extractDeskActionSuggestions(localText, pageSnapshot?.activePageId),
        };
        commitActiveSessionMessages([...nextHistory, localReply], { lastModel: localReply.model });
        return;
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsSending(true);
      setStreamingText('');
      setStreamingModelLabel('');

      let partialText = '';
      let finalModelLabel = personalTextModel ?? selectedModel;
      const stillCurrent = () => abortControllerRef.current === controller &&
        (auth.currentUser?.uid ?? null) === currentUserUid;
      try {
        const headers = await getActiveAiHeaders('text');
        if (!headers || !stillCurrent()) return;
        controller.signal.throwIfAborted();
        const deskContext = `${t('Reply in English.', 'ตอบเป็นภาษาไทย')}\n\n${buildTradingCoachContext(state, pageSnapshot)}`;

        const response = await fetch('/api/chat', {
          method: 'POST',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(70_000)]),
          headers,
          redirect: 'error',
          body: JSON.stringify({
            message: raw,
            history: messages.map((m) => ({ role: m.role, text: m.text })),
            model: selectedModel,
            deskContext,
            liveChartContext: activeLiveTelemetry
              ? formatDualLiveChartTelemetryForPrompt(activeLiveTelemetry, activeStructureTelemetry)
              : undefined,
            attachments: queuedSnap.map((a) => ({
              name: a.name,
              mimeType: a.mimeType,
              base64: a.base64,
            })),
            enableWebSearch: effectiveSearch,
            stream: true,
          }),
        });

        if (!stillCurrent()) return;
        controller.signal.throwIfAborted();
        if (response.ok && isEventStream(response)) {
          if (!response.body) throw new CoachStreamError('AI_STREAM_INCOMPLETE');
          let route: Record<string, unknown> | undefined;
          let finalSources: ChatMessageSource[] = [];
          const modelLabel = (payload: Record<string, unknown>) => {
            const router = asRecord(payload.router);
            const model = typeof payload.model === 'string' ? payload.model : personalTextModel ?? selectedModel;
            return `${router?.routedBy === 'decision-1' ? 'decision-1 → ' : ''}${model}${payload.failoverUsed ? ' (failover)' : ''}${payload.webSearchUsed ? ' · Web' : ''}`;
          };
          const done = await readCoachReplyStream(response.body, (name, payload) => {
            if (!stillCurrent() || controller.signal.aborted) return;
            if (name === 'route') {
              route = payload;
              finalModelLabel = modelLabel(payload);
              setStreamingModelLabel(finalModelLabel);
            } else if (name === 'delta' && typeof payload.text === 'string') {
              partialText += payload.text;
              setStreamingText(partialText);
            } else if (name === 'sources' && Array.isArray(payload.sources)) {
              finalSources = payload.sources as ChatMessageSource[];
            }
          });
          if (!stillCurrent()) return;
          controller.signal.throwIfAborted();

          finalModelLabel = modelLabel({ ...route, ...done });
          const router = asRecord(done.router ?? route?.router);
          const routedBy = router?.routedBy;
          const finalRoutedBy = routedBy === 'decision-1' || routedBy === 'heuristic' || routedBy === 'manual'
            ? routedBy : undefined;
          const finalTier = typeof router?.routeTier === 'string' ? router.routeTier : undefined;
          if (Array.isArray(done.sources)) finalSources = done.sources as ChatMessageSource[];
          const finalReplyText = done.reply.trim();
          const modelReply: ChatMessage = {
            id: 'M-' + (Date.now() + 1),
            role: 'model',
            text: finalReplyText,
            timestamp: getBangkokTimeHHMM(),
            model: finalModelLabel,
            routedBy: finalRoutedBy,
            routeTier: finalTier,
            sources: finalSources.length > 0 ? finalSources : undefined,
            suggestedActions: extractDeskActionSuggestions(finalReplyText, pageSnapshot?.activePageId),
            mode: msgMode,
            chartSummary: activeLiveTelemetry
              ? `${activeLiveTelemetry.symbol} ${activeLiveTelemetry.timeframe}`
              : undefined,
          };
          commitActiveSessionMessages([...nextHistory, modelReply], {
            lastModel: finalModelLabel,
            mode: msgMode,
          });
          if (msgMode === 'voice' && voiceAutoTts) {
            void speakMessage(modelReply.id, modelReply.text);
          }
          return;
        }

        const data = await response.json().catch(() => null);
        if (!stillCurrent()) return;
        controller.signal.throwIfAborted();
        if (!response.ok) {
          const errMsg = data?.code === 'BYOK_REQUIRED' ? byokRequiredCopy
            : data?.error || t("The chat server is currently unavailable.", 'ไม่สามารถติดต่อเซิร์ฟเวอร์แชทได้ในขณะนี้');
          setErrorBanner(formatCoachError(errMsg, lang, t('The chat server is currently unavailable.', 'ไม่สามารถติดต่อเซิร์ฟเวอร์แชทได้ในขณะนี้')));
          const fallbackText = `${errMsg}\n\nคำนวณแผนจากข้อมูลพอร์ตในเครื่อง:\n\n${generateLocalTacticalPlan(
            state,
            pageSnapshot
          )}${buildChartSupplement()}`;
          const fallbackReply: ChatMessage = {
            id: 'M-' + (Date.now() + 1),
            role: 'model',
            text: fallbackText,
            timestamp: getBangkokTimeHHMM(),
            model: 'TallyNX Tactical Fallback',
            routedBy: 'local',
            suggestedActions: extractDeskActionSuggestions(fallbackText, pageSnapshot?.activePageId),
          };
          commitActiveSessionMessages([...nextHistory, fallbackReply], { lastModel: fallbackReply.model });
        } else {
          if (typeof data?.reply !== 'string' || !data.reply.trim()) throw new CoachStreamError('AI_STREAM_INCOMPLETE');
          const routedModelLabel = data.model
            ? `${data.router?.routedBy === 'decision-1' ? 'decision-1 → ' : ''}${data.model}${
                data.failoverUsed ? ' (failover)' : ''
              }${data.router?.needsWebSearch ? ' · Web' : ''}`
            : selectedModel;
          const modelReply: ChatMessage = {
            id: 'M-' + (Date.now() + 1),
            role: 'model',
            text: data.reply,
            timestamp: getBangkokTimeHHMM(),
            model: routedModelLabel,
            sources: Array.isArray(data.sources) && data.sources.length > 0 ? data.sources : undefined,
            routedBy: data.router?.routedBy,
            routeTier: data.router?.routeTier,
            suggestedActions: extractDeskActionSuggestions(data.reply || '', pageSnapshot?.activePageId),
            mode: msgMode,
            chartSummary: activeLiveTelemetry
              ? `${activeLiveTelemetry.symbol} ${activeLiveTelemetry.timeframe}`
              : undefined,
          };
          commitActiveSessionMessages([...nextHistory, modelReply], {
            lastModel: routedModelLabel,
            mode: msgMode,
          });
          if (msgMode === 'voice' && voiceAutoTts) {
            void speakMessage(modelReply.id, modelReply.text);
          }
        }
      } catch (err) {
        if (!stillCurrent()) return;
        if (controller.signal.aborted) {
          if (partialText.trim()) {
            const partialReply: ChatMessage = {
              id: 'M-' + (Date.now() + 1),
              role: 'model',
              text: `${partialText.trim()}\n\n*${t('Stopped by you', 'หยุดการสร้างคำตอบโดยผู้ใช้')}*`,
              timestamp: getBangkokTimeHHMM(),
              model: finalModelLabel,
            };
            commitActiveSessionMessages([...nextHistory, partialReply]);
          }
        } else {
          const msg = err instanceof CoachStreamError && err.code === 'BYOK_REQUIRED' ? byokRequiredCopy
            : err instanceof CoachStreamError && err.code === 'AI_STREAM_INCOMPLETE' ? t('The response stream was interrupted.', 'การเชื่อมต่อคำตอบขัดข้อง')
              : formatCoachError(err instanceof Error ? err.message : undefined, lang, t('Connection interrupted.', 'การเชื่อมต่อขัดข้อง'));
          setErrorBanner(t(`${/\p{Script=Thai}/u.test(msg) ? 'Connection interrupted.' : msg} Using workspace data.`, `${msg} ใช้ข้อมูลพอร์ตในเครื่อง`));
          const fallbackText = `${generateLocalTacticalPlan(state, pageSnapshot)}${buildChartSupplement()}`;
          const fallbackReply: ChatMessage = {
            id: 'M-' + (Date.now() + 1),
            role: 'model',
            text: fallbackText,
            timestamp: getBangkokTimeHHMM(),
            model: 'Local Desk Engine',
            routedBy: 'local',
            suggestedActions: extractDeskActionSuggestions(fallbackText, pageSnapshot?.activePageId),
          };
          commitActiveSessionMessages([...nextHistory, fallbackReply], { lastModel: fallbackReply.model });
        }
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
          setIsSending(false);
          setStreamingText('');
          setStreamingModelLabel('');
        }
      }
    },
    [
      activeChartSymbol,
      activeChartTimeframe,
      activeLiveTelemetry,
      activeStructureTelemetry,
      attachments,
      byokRequiredCopy,
      canCloudChat,
      chatMode,
      commitActiveSessionMessages,
      forceWebSearch,
      getActiveAiHeaders,
      handleCreateNewSession,
      inputText,
      isOnline,
      isSending,
      lang,
      messages,
      pageSnapshot,
      selectedModel,
      speakMessage,
      state,
      currentUserUid,
      personalTextModel,
      t,
      voiceAutoTts,
    ]
  );

  const handleAnalyzeActivePage = async () => {
    if (abortControllerRef.current || liveTokenRequestRef.current || liveClientRef.current) return;
    if (isSending) return;
    if (!pageSnapshot) {
      handleInstantLocalPlan();
      return;
    }
    const promptText = `อ่านและวิเคราะห์หน้า "${pageSnapshot.activePageTitle}" ที่ฉันกำลังเปิดดูอยู่ตอนนี้ร่วมกับพอร์ต ${acc.name} และกราฟสด${
      activeLiveTelemetry ? ` (${activeLiveTelemetry.symbol} ${activeLiveTelemetry.timeframe})` : ''
    } ช่วยสรุปจุดสำคัญ สิ่งที่ต้องระวัง และแผนปฏิบัติการขั้นต่อไป`;
    if (canCloudChat) {
      await handleSendMessage(promptText);
      return;
    }
    handleInstantLocalPlan();
  };

  const handleInstantLiveChartAnalysis = async () => {
    if (isSending) return;
    setErrorBanner(null);
    const telemetry = (await triggerRefreshTelemetry()) || activeLiveTelemetry;
    if (!telemetry) {
      setErrorBanner(t("No live chart data. Refresh or attach a chart image.", 'ไม่มีข้อมูลกราฟสด รีเฟรชหรือแนบภาพกราฟ'));
      return;
    }

    const promptText = `วิเคราะห์กราฟสด ${telemetry.symbol} (${telemetry.timeframe}) ที่ราคา ${telemetry.currentPrice} พร้อมสรุปโครงสร้างแนวโน้ม EMA20/EMA50, RSI(14), ATR(14), แนวรับ-แนวต้าน และแผน Position Sizing ตาม Risk $${calc.risk} (3-TP ${state.calcDir}) ของพอร์ตปัจจุบัน${
      attachments.some((a) => a.mimeType.startsWith('image/')) ? ' รวมถึงวิเคราะห์ภาพกราฟที่แนบมาด้วย' : ''
    }`;

    if (canCloudChat) {
      await handleSendMessage(promptText);
      return;
    }

    const nowTime = getBangkokTimeHHMM();
    const userMsg: ChatMessage = {
      id: 'U-' + Date.now(),
      role: 'user',
      text: promptText,
      timestamp: nowTime,
      chartSummary: `${telemetry.symbol} ${telemetry.timeframe} @ ${telemetry.currentPrice}`,
      imageAttached: attachments.some((a) => a.mimeType.startsWith('image/')),
    };
    const localChartText = buildLocalLiveChartAnalysis(telemetry, state);
    const chartReply: ChatMessage = {
      id: 'M-' + (Date.now() + 1),
      role: 'model',
      text: localChartText,
      timestamp: nowTime,
      model: 'Live Telemetry Engine (Local)',
      routedBy: 'local',
      chartSummary: `${telemetry.symbol} ${telemetry.timeframe} · ${telemetry.trendBias}`,
      suggestedActions: extractDeskActionSuggestions(localChartText, pageSnapshot?.activePageId),
    };
    commitActiveSessionMessages([...messages, userMsg, chartReply], { lastModel: chartReply.model });
  };

  // Voice Mode: Mic Dictation (Cloud gemini-3.5-transcribe when PRO, Web Speech API fallback when Guest/Offline)
  const toggleVoiceRecording = async () => {
    if (transcribeRequestRef.current || ((wavRecorderRef.current || speechRecRef.current) && !isRecordingVoice)) return;
    setErrorBanner(null);
    if (isRecordingVoice) {
      setIsRecordingVoice(false);
      setVoiceLevel(0);
      if (speechRecRef.current) {
        speechRecRef.current.stop();
        return;
      }
      if (wavRecorderRef.current) {
        const recorder = wavRecorderRef.current;
        wavRecorderRef.current = null;
        const controller = new AbortController();
        transcribeRequestRef.current = controller;
        setIsTranscribing(true);
        try {
          const { wavBase64, mimeType, durationMs } = await recorder.stop();
          controller.signal.throwIfAborted();
          if (durationMs < 350) {
            setErrorBanner(t("Recording is too short. Record again.", 'เสียงที่บันทึกสั้นเกินไป ลองบันทึกใหม่'));
            return;
          }
          if (!canCloudVoice) {
            setErrorBanner(t('Connect a Google Gemini key for cloud transcription.', 'เชื่อมต่อคีย์ Google Gemini เพื่อถอดเสียงบนคลาวด์'));
            return;
          }
          const headers = await getActiveAiHeaders('voice');
          if (!headers) return;
          controller.signal.throwIfAborted();
          const resp = await fetch('/api/ai/transcribe', {
            method: 'POST',
            headers,
            redirect: 'error',
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(40_000)]),
            body: JSON.stringify({ audioBase64: wavBase64, mimeType }),
          });
          const data = asRecord(await resp.json().catch(() => null));
          controller.signal.throwIfAborted();
          if (!resp.ok || typeof data?.text !== 'string' || !data.text.trim()) {
            setErrorBanner(data?.code === 'BYOK_REQUIRED' ? byokRequiredCopy
              : formatCoachError(typeof data?.error === 'string' ? data.error : undefined, lang, t('Transcription failed. Please try speaking again.', 'ถอดความไม่สำเร็จ กรุณาลองพูดใหม่อีกครั้ง')));
            return;
          }
          const spokenText = data.text.trim();
          if (voiceAutoSend) {
            await handleSendMessage(spokenText, { sourceMode: 'voice' });
          } else {
            setInputText((prev) => (prev ? `${prev} ${spokenText}` : spokenText));
          }
        } catch (err) {
          if (!controller.signal.aborted) setErrorBanner(formatCoachError(err instanceof Error ? err.message : undefined, lang, t('Transcription is currently unavailable.', 'ไม่สามารถถอดเสียงได้ในขณะนี้')));
        } finally {
          if (transcribeRequestRef.current === controller) {
            transcribeRequestRef.current = null;
            setIsTranscribing(false);
          }
        }
      }
      return;
    }

    if (canCloudVoice) {
      const rec = new VoiceWavRecorder();
      wavRecorderRef.current = rec;
      try {
        await rec.start((lvl) => setVoiceLevel(lvl));
        if (wavRecorderRef.current === rec) setIsRecordingVoice(true);
        return;
      } catch (err) {
        await rec.stop().catch(() => undefined);
        if (wavRecorderRef.current !== rec) return;
        wavRecorderRef.current = null;
        setErrorBanner(formatCoachError(err instanceof Error ? err.message : undefined, lang, t('Unable to access the microphone.', 'ไม่สามารถเปิดไมโครโฟนได้')));
        return;
      }
    }

    // Guest / Offline fallback via browser SpeechRecognition API
    const SpeechRecCtor =
      (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;
    if (!SpeechRecCtor) {
      setErrorBanner(t("This browser does not support guest speech recognition. Sign in with PRO to use Gemini 3.5 Transcribe.", 'เบราว์เซอร์ไม่รองรับ Speech Recognition สำหรับ Guest (หรือเข้าสู่ระบบ PRO เพื่อใช้ Gemini 3.5 Transcribe)'));
      return;
    }
    const recognition = new SpeechRecCtor() as {
      lang: string;
      interimResults: boolean;
      maxAlternatives: number;
      onresult: (ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onerror: () => void;
      onend: () => void;
      start: () => void;
      stop: () => void;
      abort: () => void;
    };
    recognition.lang = lang === 'th' ? 'th-TH' : 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (ev) => {
      if (speechRecRef.current !== recognition) return;
      const text = ev.results?.[0]?.[0]?.transcript?.trim();
      if (text) {
        if (voiceAutoSend) {
          void handleSendMessage(text, { sourceMode: 'voice' });
        } else {
          setInputText((prev) => (prev ? `${prev} ${text}` : text));
        }
      }
    };
    function finishRecognition() {
      if (speechRecRef.current !== recognition) return;
      setIsRecordingVoice(false);
      speechRecRef.current = null;
    }
    recognition.onerror = finishRecognition;
    recognition.onend = finishRecognition;
    speechRecRef.current = recognition;
    try {
      recognition.start();
      setIsRecordingVoice(true);
    } catch {
      finishRecognition();
      setErrorBanner(t('Unable to access the microphone.', 'ไม่สามารถเปิดไมโครโฟนได้'));
    }
  };

  // Live Mode: Gemini 3.8 Live WebSocket Session via Ephemeral Token
  const liveTranscriptMessagesRef = useRef<ChatMessage[]>([]);
  const startLiveSession = async () => {
    if (liveTokenRequestRef.current || liveClientRef.current) return;
    setErrorBanner(null);
    setLiveNotice(null);
    if (!canCloudVoice) {
      setErrorBanner(t('Connect a Google Gemini key for Live voice.', 'เชื่อมต่อคีย์ Google Gemini เพื่อใช้เสียง Live'));
      return;
    }

    liveTranscriptMessagesRef.current = [...messages];
    setLiveInterimUser('');
    setLiveInterimModel('');
    setLiveMuted(false);
    setLiveConnState('CONNECTING');
    const controller = new AbortController();
    liveTokenRequestRef.current = controller;

    try {
      const headers = await getActiveAiHeaders('voice');
      if (!headers) {
        setLiveConnState('IDLE');
        return;
      }
      controller.signal.throwIfAborted();
      const deskContext = buildTradingCoachContext(state, pageSnapshot);
      const liveChartContext = activeLiveTelemetry
        ? formatDualLiveChartTelemetryForPrompt(activeLiveTelemetry, activeStructureTelemetry)
        : undefined;

      const resp = await fetch('/api/ai/live-token', {
        method: 'POST',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(35_000)]),
        headers,
        redirect: 'error',
        body: JSON.stringify({
          mode: liveModelTier,
          voice: selectedVoice,
          deskContext,
          liveChartContext,
        }),
      });
      const data = (await resp.json()) as {
        token?: string;
        model?: string;
        apiVersion?: 'v1alpha' | 'v1beta';
        error?: string;
        code?: string;
      };
      if (controller.signal.aborted || (auth.currentUser?.uid ?? null) !== currentUserUid) return;
      if (!resp.ok || !data.token || !data.model) {
        setLiveConnState('ERROR');
        setErrorBanner(data.code === 'BYOK_REQUIRED' ? byokRequiredCopy
          : formatCoachError(data.error, lang, t('Unable to create a temporary token for Live mode.', 'ไม่สามารถสร้างโทเค็นชั่วคราวสำหรับโหมด Live ได้')));
        return;
      }

      const client = new GeminiLiveDeskClient();
      liveClientRef.current = client;

      await client.connect({
        token: data.token,
        model: data.model,
        apiVersion: data.apiVersion === 'v1alpha' ? 'v1alpha' : 'v1beta',
        onStateChange: (nextState) => {
          if (liveClientRef.current !== client) return;
          setLiveConnState(nextState);
          if (nextState === 'IDLE' || nextState === 'ERROR') {
            liveClientRef.current = null;
            liveTokenRequestRef.current = null;
          }
        },
        onLevel: (lvl) => setLiveLevel(lvl),
        onGoAway: (timeLeft) => {
          setLiveNotice([
            `Live session expires ${timeLeft ? `in ${timeLeft}` : 'soon'}. Reconnect to continue.`,
            `เซสชัน Live ใกล้หมดอายุ${timeLeft ? ` (${timeLeft})` : ''} เชื่อมต่อใหม่เพื่อคุยต่อ`,
          ]);
        },
        onError: (msg) => {
          setErrorBanner('Live WebSocket: ' + formatCoachError(msg, lang, t('Connection interrupted.', 'การเชื่อมต่อขัดข้อง')));
        },
        onTranscript: (ev) => {
          if (!ev.isFinal) {
            if (ev.role === 'user') setLiveInterimUser(ev.text);
            else setLiveInterimModel(ev.text);
            return;
          }
          if (ev.role === 'user') setLiveInterimUser('');
          else setLiveInterimModel('');

          const clean = ev.text.trim();
          if (!clean) return;
          const entry: ChatMessage = {
            id: `${ev.role === 'user' ? 'LU' : 'LM'}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            role: ev.role,
            text: clean,
            timestamp: getBangkokTimeHHMM(),
            model: ev.role === 'model' ? data.model : undefined,
            routedBy: 'live',
            mode: 'live',
          };
          liveTranscriptMessagesRef.current = [...liveTranscriptMessagesRef.current, entry];
          commitActiveSessionMessages(liveTranscriptMessagesRef.current, {
            lastModel: data.model,
            mode: 'live',
          });
        },
      });
    } catch (err) {
      if (!controller.signal.aborted && (auth.currentUser?.uid ?? null) === currentUserUid) {
        setLiveConnState('ERROR');
        setErrorBanner(formatCoachError(err instanceof Error ? err.message : undefined, lang, t('Could not connect to Gemini Live.', 'เชื่อมต่อ Gemini Live ล้มเหลว')));
      }
    } finally {
      if (liveTokenRequestRef.current === controller) liveTokenRequestRef.current = null;
    }
  };

  const stopLiveSession = async () => {
    liveTokenRequestRef.current?.abort();
    liveTokenRequestRef.current = null;
    const client = liveClientRef.current;
    liveClientRef.current = null;
    void client?.disconnect();
    setLiveConnState('IDLE');
    setLiveMuted(false);
    setLiveLevel(0);
    setLiveInterimUser('');
    setLiveInterimModel('');
  };

  const sessionBusy = isSending || (liveConnState !== 'IDLE' && liveConnState !== 'ERROR');
  const renderSessionsDrawer = () =>
    showSessionsDrawer && (
      <div className="coach-sessions-drawer" role="dialog" aria-label={t("Recent chats", "ประวัติแชทล่าสุด")}>
        <div className="coach-sessions-head">
          <strong>{t("Recent chats", "แชทล่าสุด")} ({sessions.length})</strong>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              type="button"
              className="btn xs primary"
              disabled={sessionBusy}
              onClick={() => handleCreateNewSession(chatMode)}
            >
              {t("+ New Chat", "+ แชทใหม่")}
            </button>
            <button
              type="button"
              className="btn xs"
              onClick={() => setShowSessionsDrawer(false)}
              aria-label={t("Close recent chats", "ปิดรายการแชทล่าสุด")}
            >
              ✕
            </button>
          </div>
        </div>

        <input
          type="text"
          className="coach-session-search"
          placeholder={t("Search titles or messages…", "ค้นหาชื่อห้องหรือข้อความ…")}
          value={sessionSearch}
          onChange={(e) => setSessionSearch(e.target.value)}
        />

        <div className="coach-sessions-list">
          {filteredSessions.length === 0 ? (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '10px', textAlign: 'center' }}>
              {t("No chats match your search.", "ไม่พบแชทที่ตรงกับคำค้นหา")}
            </div>
          ) : (
            filteredSessions.map((sess) => {
              const isActive = sess.id === activeSession?.id;
              const isRenaming = renamingSessionId === sess.id;
              return (
                <div
                  key={sess.id}
                  className={`coach-session-item ${isActive ? 'is-active' : ''}`}
                >
                  {isRenaming ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (abortControllerRef.current || liveTokenRequestRef.current || liveClientRef.current) return;
                        persistSessionUpdate(renameSession(sessions, sess.id, renameDraft), activeSession?.id);
                        setRenamingSessionId(null);
                      }}
                      style={{ display: 'flex', gap: '4px', width: '100%' }}
                    >
                      <input
                        type="text"
                        value={renameDraft === sess.title ? formatCoachSessionTitle(sess, lang) : renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        style={{ flex: 1, fontSize: '11px', padding: '2px 6px' }}
                        autoFocus
                      />
                      <button type="submit" className="btn xs primary" disabled={sessionBusy}>
                        {t('Save', 'บันทึก')}
                      </button>
                    </form>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="coach-session-select"
                        disabled={sessionBusy}
                        onClick={() => handleSelectSession(sess.id)}
                      >
                        <div className="coach-session-title">
                          {sess.pinned ? '📌 ' : ''}
                          {formatCoachSessionTitle(sess, lang)}
                        </div>
                        <div className="coach-session-meta mono">
                          <span>{formatShortTime(sess.updatedAt, lang)}</span>
                          <span>· {sess.messages.length} {t(sess.messages.length === 1 ? 'message' : 'messages', 'ข้อความ')}</span>
                          {sess.lastModel ? ` · ${formatCoachModelLabel(sess.lastModel, lang).replace(/^decision-1 → /, '')}` : ''}
                        </div>
                      </button>
                      <div className="coach-session-actions">
                        <button
                          type="button"
                          className="btn xs"
                          disabled={sessionBusy}
                          title={sess.pinned ? t('Unpin chat', 'ถอนปักหมุด') : t('Pin chat', 'ปักหมุด')}
                          onClick={() =>
                            persistSessionUpdate(togglePinSession(sessions, sess.id), activeSession?.id)
                          }
                        >
                          {sess.pinned ? '★' : '☆'}
                        </button>
                        <button
                          type="button"
                          className="btn xs"
                          disabled={sessionBusy}
                          title={t("Rename chat", "เปลี่ยนชื่อ")}
                          onClick={() => {
                            setRenamingSessionId(sess.id);
                            setRenameDraft(sess.title);
                          }}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="btn xs rose"
                          disabled={sessionBusy}
                          title={t("Delete chat", "ลบแชท")}
                          onClick={() => {
                            const remaining = deleteSessionById(sessions, sess.id);
                            if (remaining.length === 0) {
                              const fresh = createChatSession({ activePortId: state.activePort });
                              persistSessionUpdate([fresh], fresh.id);
                            } else {
                              persistSessionUpdate(
                                remaining,
                                sess.id === activeSession?.id ? remaining[0].id : activeSession?.id
                              );
                            }
                          }}
                        >
                          🗑
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    );

  const renderLiveConsole = () => {
    const canCloudLive = canCloudVoice;
    const activeModelLabel =
      liveModelTier === 'thinking' ? GEMINI_38_LIVE_THINKING : GEMINI_38_LIVE;
    const isConnected = liveConnState !== 'IDLE' && liveConnState !== 'ERROR';

    return (
      <div className="coach-live-console" aria-label={t("Gemini 3.8 Live voice console", "แผงคุยเสียงสด Gemini 3.8")}>
        <div className="coach-live-console-head">
          <div>
            <div style={{ fontWeight: 700, fontSize: '12px' }}>{t("Gemini 3.8 Live · Voice & Screen", "Gemini 3.8 Live · เสียงและหน้าจอ")}</div>
            <div className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              {activeModelLabel} · {t('Ephemeral token (no key exposure)', 'โทเค็นชั่วคราว (ไม่เปิดเผยคีย์)')}
            </div>
          </div>
          <span
            className={`pill ${
              liveConnState === 'SPEAKING'
                ? 'emerald'
                : liveConnState === 'LISTENING' || liveConnState === 'THINKING'
                  ? 'blue'
                  : liveConnState === 'ERROR'
                    ? 'rose'
                    : ''
            }`}
            style={{ fontSize: '10px' }}
          >
            {t(liveConnState, LIVE_CONNECTION_LABELS_TH[liveConnState])} {isConnected ? `· ${Math.floor(liveDurationSec / 60)}:${String(liveDurationSec % 60).padStart(2, '0')}` : ''}
          </span>
        </div>

        {!canCloudLive ? (
          <div className="coach-live-gate-card">
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <strong>{t('Live Mode (two-way voice)', 'โหมดคุยเสียงสดสองทาง')}</strong>{' '}
              {t('uses an ephemeral token to connect over WebSocket to', 'ใช้โทเค็นชั่วคราวเพื่อเชื่อมต่อ WebSocket กับ')}{' '}
              <code>gemini-3.8-live</code>{' '}
              {t('Connect your Google Gemini key to use Live voice.', 'เชื่อมต่อคีย์ Google Gemini ของคุณเพื่อใช้เสียง Live')}
            </div>
            <AiAndDataKeysDialogButton uid={currentUserUid} lang={lang} />
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                aria-label={t("Choose live model", "เลือกรุ่นโมเดล Live")}
                className="coach-live-select"
                value={liveModelTier}
                disabled={isConnected}
                onChange={(e) => setLiveModelTier(e.target.value === 'thinking' ? 'thinking' : 'standard')}
              >
                <option value="standard">{t("3.8 Live (Ultra Low Latency)", "3.8 Live (ตอบสนองเร็วมาก)")}</option>
                <option value="thinking">{t("3.8 Live Thinking (Background Reasoning)", "3.8 Live Thinking (ประมวลผลเบื้องหลัง)")}</option>
              </select>
              <select
                aria-label={t("Choose assistant voice", "เลือกเสียงผู้ช่วย")}
                className="coach-live-select"
                value={selectedVoice}
                disabled={isConnected}
                onChange={(e) => setSelectedVoice(e.target.value)}
              >
                {VOICE_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {t('Voice:', 'เสียง:')} {v}
                  </option>
                ))}
              </select>
            </div>

            <div className="coach-live-meter" aria-hidden="true">
              <div
                className="coach-live-meter-fill"
                style={{ width: `${Math.round(liveLevel * 100)}%` }}
              />
            </div>

            {liveNotice && (
              <div style={{ fontSize: '10.5px', color: 'var(--amber)' }}>{t(...liveNotice)}</div>
            )}

            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {!isConnected ? (
                <button
                  type="button"
                  className="btn xs primary"
                  onClick={() => void startLiveSession()}
                >
                  {t("● Start Live", "● เริ่มคุยสด")}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className={`btn xs ${liveMuted ? 'amber' : 'emerald'}`}
                    onClick={() => {
                      const next = !liveMuted;
                      setLiveMuted(next);
                      liveClientRef.current?.setMuted(next);
                    }}
                  >
                    {liveMuted ? t('Unmute', 'เปิดไมค์') : t('Mute', 'ปิดไมค์')}
                  </button>
                  <button
                    type="button"
                    className="btn xs blue"
                    onClick={() => {
                      void liveClientRef.current?.captureAndSendScreenFrame().then((ok) => {
                        if (ok) setLiveNotice(['Screen image sent to Gemini Live.', 'ส่งภาพหน้าจอให้ Gemini Live แล้ว']);
                      });
                    }}
                    title={t("Share one chart or screen frame with the live session", "แชร์ภาพกราฟหรือหน้าจอ 1 ภาพเข้าการคุยสด")}
                  >
                    {t("Share Screen", "ส่งภาพหน้าจอ")}
                  </button>
                  <button
                    type="button"
                    className="btn xs"
                    onClick={() => {
                      const summary = buildTradingCoachContext(state, pageSnapshot);
                      liveClientRef.current?.sendText(`อัปเดตบริบทพอร์ตล่าสุด:\n${summary.slice(0, 1200)}`);
                    }}
                  >
                    {t("Send Desk Context", "ส่งบริบทโต๊ะเทรด")}
                  </button>
                  <button
                    type="button"
                    className="btn xs rose"
                    onClick={() => void stopLiveSession()}
                  >
                    {t("End Live", "จบการคุยสด")}
                  </button>
                </>
              )}
            </div>

            {(liveInterimUser || liveInterimModel) && (
              <div className="coach-live-interim">
                {liveInterimUser && (
                  <div>
                    <strong>{t('You:', 'คุณ:')}</strong> {liveInterimUser}
                  </div>
                )}
                {liveInterimModel && (
                  <div>
                    <strong>Gemini Live:</strong> {formatExternalCoachReply(liveInterimModel, lang)}
                  </div>
                )}
              </div>
            )}

            {isConnected && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!liveTextInput.trim()) return;
                  liveClientRef.current?.sendText(liveTextInput);
                  setLiveTextInput('');
                }}
                style={{ display: 'flex', gap: '6px' }}
              >
                <input
                  type="text"
                  className="inp"
                  placeholder={t("Type a message during the live session…", "พิมพ์ข้อความระหว่างคุยสด…")}
                  value={liveTextInput}
                  onChange={(e) => setLiveTextInput(e.target.value)}
                  style={{ flex: 1, fontSize: '11.5px', height: '30px' }}
                />
                <button type="submit" className="btn xs primary">
                  {t('Send', 'ส่ง')}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    );
  };

  const renderVoiceStrip = () =>
    chatMode === 'voice' && (
      <div className="coach-voice-strip" aria-label={t("Voice mode controls", "ตัวควบคุมโหมดเสียง")}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn xs ${isRecordingVoice ? 'rose' : 'primary'}`}
            disabled={isTranscribing || isSending}
            onClick={() => void toggleVoiceRecording()}
          >
            {isRecordingVoice
              ? t(`■ Stop recording (${recordingSec}s)`, `■ หยุดบันทึกเสียง (${recordingSec} วิ)`)
              : isTranscribing
                ? t('Transcribing with 3.5 Transcribe…', 'กำลังถอดเสียงด้วย 3.5 Transcribe…')
                : t('🎙 Press to Speak', '🎙 กดเพื่อพูด')}
          </button>

          <select
            aria-label={t("Choose text-to-speech voice", "เลือกเสียงอ่าน")}
            className="coach-live-select"
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
          >
            {VOICE_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <div className="coach-live-meter" aria-hidden="true">
          <div
            className="coach-live-meter-fill"
            style={{ width: `${Math.round(voiceLevel * 100)}%` }}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '10.5px', color: 'var(--text-secondary)' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={voiceAutoSend}
              onChange={(e) => setVoiceAutoSend(e.target.checked)}
            />
            {t("Auto-send after speaking", "ส่งคำถามอัตโนมัติหลังพูดจบ")}
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={voiceAutoTts}
              onChange={(e) => setVoiceAutoTts(e.target.checked)}
            />
            {t("Auto-read replies (TTS)", "อ่านคำตอบออกเสียงอัตโนมัติ")}
          </label>
        </div>
      </div>
    );

  const renderChatThreadArea = () => (
    <div
      className={`coach-dropzone ${isDraggingOver ? 'is-dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingOver(false);
        queueFiles(e.dataTransfer?.files);
      }}
    >
      {errorBanner && (
        <div
          className="coach-error-banner"
          style={{
            padding: '7px 10px',
            borderRadius: 'var(--radius-xs)',
            background: 'var(--amber-soft)',
            border: '1px solid var(--amber-border)',
            color: 'var(--amber)',
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <span>{formatCoachError(errorBanner, lang, 'The Coach could not complete the last request.')}</span>
          <AiAndDataKeysDialogButton uid={currentUserUid} lang={lang} />
        </div>
      )}

      {chatMode === 'live' && renderLiveConsole()}
      {renderVoiceStrip()}

      <div
        ref={threadContainerRef}
        className="coach-thread"
        role="log"
        aria-label={t("Trading Coach conversation history", "ประวัติการสนทนากับโค้ชเทรด")}
      >
        {transcript.map(({ msg, displayText, body, prevUserMsg }) => {
          const isUser = msg.role === 'user';
          return (
            <div key={msg.id} className={`coach-msg-row ${isUser ? 'user' : 'model'}`}>
              <div className={`coach-bubble ${isUser ? 'user' : 'model'}`}>
                <div className="coach-bubble-meta">
                  <span className="coach-bubble-author">{isUser ? t('You', 'คุณ') : 'AI Live Desk'}</span>
                  <span>{' · '}{msg.timestamp}{msg.model && msg.model !== 'AI Live Desk' ? ` · ${formatCoachModelLabel(msg.model, lang)}` : ''}</span>
                </div>
                {((msg.mode && msg.mode !== 'text') || msg.chartSummary || Boolean(msg.attachments?.length) || msg.imageAttached) && (
                  <div className="coach-bubble-details">
                    {msg.mode && msg.mode !== 'text' && (
                      <span className="coach-msg-badge">
                        {msg.mode === 'voice' ? t('VOICE', 'เสียง') : t('LIVE', 'สด')}
                      </span>
                    )}
                    {msg.chartSummary && (
                      <span className="mono coach-msg-badge">{msg.chartSummary}</span>
                    )}
                    {msg.attachments && msg.attachments.length > 0 ? (
                      <span className="coach-msg-badge">+ {msg.attachments.map((a) => a.name).join(', ')}</span>
                    ) : (
                      msg.imageAttached && <span className="coach-msg-badge">{t("+ Chart image", "+ ภาพกราฟ")}</span>
                    )}
                  </div>
                )}

                <div
                  className="coach-md-body"
                  style={{ fontSize: compactDock ? '12px' : '13px', lineHeight: 1.5 }}
                >
                  {isUser ? (
                    <div style={{ whiteSpace: 'pre-wrap' }}>{displayText}</div>
                  ) : (
                    body
                  )}
                </div>

                {!isUser && msg.sources && msg.sources.length > 0 && (
                  <div className="coach-source-pills">
                    {msg.sources.map((src, sIdx) => (
                      <a
                        key={sIdx}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="coach-source-pill"
                      >
                        ↗ {lang === 'en' && /\p{Script=Thai}/u.test(src.title) ? `Source ${sIdx + 1}` : src.title}
                      </a>
                    ))}
                  </div>
                )}

                {!isUser && msg.suggestedActions && msg.suggestedActions.length > 0 && onQuickDeskAction && (
                  <div className="coach-msg-desk-actions">
                    {msg.suggestedActions.map((act, aIdx) => (
                      <button
                        key={aIdx}
                        type="button"
                        className="btn xs blue"
                        style={{ fontSize: '10px', padding: '1px 7px' }}
                        onClick={() => onQuickDeskAction({ type: act.type, value: act.value })}
                      >
                        {lang === 'en' ? COACH_ACTION_LABELS[act.label] ?? act.label : act.label} →
                      </button>
                    ))}
                  </div>
                )}

                {!isUser && (
                  <div className="coach-msg-actions">
                    <button
                      type="button"
                      className="coach-text-action"
                      onClick={() => {
                        void navigator.clipboard?.writeText(displayText).then(() => {
                          setCopiedMsgId(msg.id);
                          window.setTimeout(() => setCopiedMsgId(null), 1300);
                        });
                      }}
                    >
                      {copiedMsgId === msg.id ? t('✓ Copied', '✓ คัดลอกแล้ว') : t('Copy', 'คัดลอก')}
                    </button>
                    <button
                      type="button"
                      className="coach-text-action"
                      onClick={() => void speakMessage(msg.id, displayText)}
                    >
                      {speakingMsgId === msg.id ? t('■ Stop playback', '■ หยุดอ่าน') : t('Listen', 'ฟังเสียง')}
                    </button>
                    {prevUserMsg && (
                      <button
                        type="button"
                        className="coach-text-action"
                        disabled={isSending}
                        onClick={() => void handleSendMessage(prevUserMsg.text)}
                      >
                        {t("Retry", "ถามใหม่")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {compactDock && messages.length <= 1 && !messages.some((msg) => msg.role === 'user') && !isSending && (
          <div className="coach-starter-prompts" role="group" aria-label={t('Starter prompts', 'คำถามเริ่มต้น')}>
            {activeQuickPrompts.map((item, idx) => (
              <button
                key={idx}
                type="button"
                className="coach-prompt-chip"
                onClick={() => void handleSendMessage(item.prompt)}
              >
                {t(item.labelEn, item.label)}
              </button>
            ))}
          </div>
        )}

        {isSending && (
          <div className="coach-msg-row model">
            <div className="coach-bubble model">
              <div className="coach-bubble-meta">
                <span className="coach-bubble-author">AI Live Desk</span>
                <span>
                  {' · '}{streamingModelLabel || personalTextModel || t('Decision-1 is choosing a model…', 'Decision-1 กำลังเลือกโมเดล…')}
                </span>
              </div>
              <div className="coach-md-body" style={{ fontSize: compactDock ? '12px' : '13px', lineHeight: 1.5 }}>
                {streamingText ? (
                  renderFormattedMessage(formatExternalCoachReply(streamingText, lang), lang)
                ) : (
                  <div style={{ color: 'var(--text-secondary)' }}>
                    {t("Waiting for a response…", "กำลังรอคำตอบ…")}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="coach-composer">
        {chatMode !== 'live' && slashSuggestions.length > 0 && (
          <div className="coach-slash-menu" role="listbox" aria-label={t("Slash commands", "คำสั่ง /")}>
            {slashSuggestions.map((cmd, idx) => (
              <button
                key={cmd.command}
                type="button"
                className={`coach-slash-item ${idx === slashHighlightIdx ? 'is-highlighted' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (cmd.command === '/search') {
                    setInputText('/search ');
                    setForceWebSearch(true);
                    textareaRef.current?.focus();
                  } else {
                    void handleSendMessage(cmd.command);
                  }
                }}
              >
                <strong className="mono">{cmd.command}</strong>
                <span>{getSlashCommandDescription(cmd.command, lang) || cmd.description}</span>
              </button>
            ))}
          </div>
        )}

        <form
          className="coach-input-bar"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSendMessage();
          }}
        >
          {renderComposerContext()}

          {attachments.length > 0 && (
            <div className="coach-attach-list">
              {attachments.map((att) => (
                <div key={att.id} className="coach-image-attach-pill">
                  {att.previewUrl && (
                    <img
                      src={att.previewUrl}
                      alt={att.name}
                      className="coach-image-attach-thumb"
                    />
                  )}
                  <span>{att.name}</span>
                  <button
                    type="button"
                    className="btn xs"
                    onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== att.id))}
                    aria-label={t(`Remove ${att.name}`, `ลบไฟล์ ${att.name}`)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {chatMode !== 'live' && (
            <textarea
              ref={textareaRef}
              rows={2}
              aria-label={t("Message AI Live Desk", "พิมพ์ข้อความถาม AI Live Desk")}
              placeholder={t("Ask about risk or journal data. Type / for commands.", "ถามเรื่องความเสี่ยงหรือสมุดเทรด พิมพ์ / เพื่อดูคำสั่ง")}
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                setSlashHighlightIdx(0);
              }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (slashSuggestions.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSlashHighlightIdx((i) => (i + 1) % slashSuggestions.length);
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSlashHighlightIdx((i) => (i - 1 + slashSuggestions.length) % slashSuggestions.length);
                    return;
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const picked = slashSuggestions[slashHighlightIdx];
                    if (picked) {
                      setInputText(picked.command + ' ');
                    }
                    return;
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setInputText('');
                    return;
                  }
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSendMessage();
                }
              }}
              onPaste={(e) => {
                const items = e.clipboardData?.items;
                if (!items) return;
                const pastedFiles: File[] = [];
                for (let i = 0; i < items.length; i++) {
                  if (items[i].kind === 'file') {
                    const f = items[i].getAsFile();
                    if (f) pastedFiles.push(f);
                  }
                }
                if (pastedFiles.length > 0) {
                  e.preventDefault();
                  queueFiles(pastedFiles);
                }
              }}
              disabled={isSending}
            />
          )}

          <div className="coach-input-actions">
            {byok.provider ? (
              <span
                className="coach-provider-label mono"
                data-state={activeAiStatus.state}
                title={`${providerLabel ?? 'Platform Gemini'} · ${aiStatusCopy}`}
              >
                <span className="desk-conn-dot" data-state={activeAiStatus.state} aria-hidden="true" />
                <span>
                  {providerLabel ?? 'Platform Gemini'} · {byok.models[byok.provider] ?? personalTextModel ?? selectedModel} · {aiStatusCopy}
                </span>
              </span>
            ) : <select
              aria-label={t("Choose a free-tier Google API model", "เลือกโมเดล Google API Free Tier")}
              className="coach-model-select"
              value={selectedModel}
              onChange={(e) => onUpdateModel(normalizeChatModelPreference(e.target.value))}
              title={t("Choose a free-tier model or let Decision-1 choose automatically", "เลือกโมเดล Free Tier หรือให้ Decision-1 เลือกให้อัตโนมัติ")}
            >
              <option value="auto">{t("Auto · Decision-1", "อัตโนมัติ · Decision-1")}</option>
              {FREE_TIER_MODEL_CATALOG.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>}
            <AiAndDataKeysDialogButton uid={currentUserUid} lang={lang} />

            {chatMode !== 'live' && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,application/pdf,.csv,.txt,.md,.json"
                  hidden
                  onChange={(e) => {
                    queueFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="coach-ghost-button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSending}
                  title={t("Attach a chart image, PDF, CSV or trade history report (up to 3 files)", "แนบภาพกราฟ PDF, CSV หรือรายงานประวัติการเทรด (สูงสุด 3 ไฟล์)")}
                >
                  <Paperclip size={13} aria-hidden="true" />
                  {t("Attach", "แนบไฟล์")}
                </button>
                <button
                  type="button"
                  className="coach-ghost-button"
                  aria-label={isRecordingVoice ? t('Stop recording', 'หยุดบันทึกเสียง') : t('Dictate with Gemini 3.5 Transcribe', 'พูดเพื่อพิมพ์ด้วย Gemini 3.5 Transcribe')}
                  aria-pressed={isRecordingVoice}
                  onClick={() => void toggleVoiceRecording()}
                  disabled={isSending || isTranscribing}
                  title={t("Dictate with Gemini 3.5 Transcribe", "พูดเพื่อพิมพ์ด้วย Gemini 3.5 Transcribe")}
                >
                  {isRecordingVoice ? `■ ${recordingSec}s` : <Mic size={14} aria-hidden="true" />}
                </button>
                {isSending ? (
                  <button
                    type="button"
                    className="btn xs primary coach-send"
                    onClick={() => abortControllerRef.current?.abort()}
                  >
                    {t('■ Stop', '■ หยุด')}
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="btn xs primary coach-send"
                    disabled={!inputText.trim() && attachments.length === 0}
                  >
                    {t('Send', 'ส่งข้อความ')}
                  </button>
                )}
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );

  const renderExtensionControlBar = () => (
    <div className="coach-session-bar">
      <div className="coach-session-controls">
        <button
          type="button"
          className="btn xs coach-new-chat"
          onClick={() => handleCreateNewSession(chatMode)}
          title={t("Start a new chat and keep the previous conversation", "เริ่มแชทใหม่และเก็บประวัติเดิม")}
        >
          {t("+ New Chat", "+ แชทใหม่")}
        </button>
        <button
          type="button"
          className="btn xs coach-recent-button"
          aria-expanded={showSessionsDrawer}
          onClick={() => setShowSessionsDrawer((v) => !v)}
          title={t("Open, search or pin recent chats", "เปิด ค้นหา หรือปักหมุดแชทล่าสุด")}
        >
          {t('Recent', 'แชทล่าสุด')} ({sessions.length})
        </button>
        {recentOtherSession && (
          <button
            type="button"
            className="coach-ghost-button"
            onClick={() => handleSelectSession(recentOtherSession.id)}
            title={t('Switch back to:', 'สลับกลับไปที่:') + ' ' + formatCoachSessionTitle(recentOtherSession, lang)}
          >
            <span aria-hidden="true">↩</span> {t('Last', 'ล่าสุด')}
          </button>
        )}
      </div>

      <div className="coach-mode-tabs" role="group" aria-label={t("Choose AI Live Desk interaction mode", "เลือกโหมดคุยกับ AI Live Desk")}>
        {(
          [
            { id: 'text', label: t("Chat", "แชท") },
            { id: 'voice', label: t("Voice", "เสียง") },
            { id: 'live', label: t("Live", "สด") },
          ] as const
        ).map((m) => (
          <button
            key={m.id}
            type="button"
            className="coach-ghost-button"
            aria-pressed={chatMode === m.id}
            onClick={() => setChatMode(m.id)}
          >
            {formatCoachModelLabel(m.label, lang)}
          </button>
        ))}
      </div>
    </div>
  );

  const renderComposerContext = () => (
    <div className="coach-context-strip">
      <button
        type="button"
        className="coach-ghost-button"
        onClick={() => void handleAnalyzeActivePage()}
        disabled={isSending}
        title={pageSnapshot ? t(`Read and analyze ${pageSnapshot.activePageTitle}`, `อ่านและวิเคราะห์หน้า ${pageSnapshot.activePageTitle}`) : t('Summarize the GHR plan', 'สรุปแผน GHR ทันที')}
      >
        {t("Read Page", "อ่านหน้านี้")}
      </button>
      <button
        type="button"
        className="coach-ghost-button"
        onClick={() => void handleInstantLiveChartAnalysis()}
        disabled={isSending || activeChartLoading}
      >
        {t("Live Chart", "กราฟสด")}
      </button>
      <details
        className="coach-tools"
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.open = false;
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && e.currentTarget.open) {
            e.preventDefault();
            e.currentTarget.querySelector('summary')?.focus();
            e.currentTarget.open = false;
          }
        }}
      >
        <summary className="coach-ghost-button">
          <Zap size={12} aria-hidden="true" />
          {t('Tools', 'เครื่องมือ')}
        </summary>
        <div className="coach-tools-popover">
          <strong>{t('Desk Tools', 'เครื่องมือโต๊ะเทรด')}</strong>
          <div className="coach-tools-actions">
            {onQuickDeskAction && compactDock && (
              <>
                {[60, 90, 120].map((rv) => (
                  <button
                    key={rv}
                    type="button"
                    className="coach-ghost-button"
                    aria-pressed={state.calcRisk === rv}
                    onClick={() => onQuickDeskAction({ type: 'RISK', value: rv })}
                  >
                    {t('Risk', 'เสี่ยง')} ${rv}
                  </button>
                ))}
                <button
                  type="button"
                  className="coach-ghost-button"
                  onClick={() => onQuickDeskAction({ type: 'PAGE', value: 'desk-cards-root' })}
                >
                  12-Gate
                </button>
                <button
                  type="button"
                  className="coach-ghost-button"
                  onClick={() => onQuickDeskAction({ type: 'MT5_SYNC', value: 'open' })}
                >
                  {t('MT5 Sync', 'ซิงก์ MT5')}
                </button>
              </>
            )}
            <button
              type="button"
              className="coach-ghost-button"
              disabled={sessionBusy}
              onClick={() => {
                onResetChat();
                commitActiveSessionMessages([
                  {
                    id: 'RESET-' + Date.now(),
                    role: 'model',
                    text: 'รีเซ็ตข้อความใน Session "' + (activeSession?.title ?? 'ปัจจุบัน') + '" เรียบร้อยแล้ว',
                    timestamp: getBangkokTimeHHMM(),
                    model: 'AI Live Desk',
                  },
                ]);
              }}
              title={t("Clear messages in this chat", "ล้างข้อความในแชทนี้")}
            >
              {t("Clear", "ล้าง")}
            </button>
          </div>
        </div>
      </details>
      <button
        type="button"
        className="coach-ghost-button coach-web-toggle"
        aria-pressed={forceWebSearch}
        onClick={() => setForceWebSearch((v) => !v)}
        title={t("Use Google Search for every question", "ค้นด้วย Google Search ทุกคำถาม")}
      >
        {forceWebSearch ? t('Web: ON', 'เว็บ: เปิด') : t('Web: Auto', 'เว็บ: อัตโนมัติ')}
      </button>
    </div>
  );

  if (compactDock) {
    const safeHarbor = t("Important: Risk & statistics analytics tool only — Not Financial Advice", "Safe Harbor · ใช้คำนวณความเสี่ยงและดูสถิติเท่านั้น ไม่ใช่คำแนะนำการลงทุน");
    return (
      <div className="coach-dock-wrap">
        {renderExtensionControlBar()}
        {renderSessionsDrawer()}

        {renderChatThreadArea()}

        <div className="coach-dock-disclosure" title={safeHarbor}>{safeHarbor}</div>
      </div>
    );
  }

  return (
    <section id="coach-root">
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
            <h2 className="card-title">{t("TallyNX AI Live Desk · Extension Studio", "TallyNX AI Live Desk · สตูดิโอ")}</h2>
            <span className="fx-meta-inline">
              {formatAccountDisplayName(acc.name, lang)} · {isOnline ? t('Free Tier models + live voice', 'โมเดล Free Tier และคุยเสียงสด') : t('Offline planning', 'วางแผนออฟไลน์')}
            </span>
          </div>
        </div>

        {renderExtensionControlBar()}
        {renderSessionsDrawer()}

        <div className="coach-studio-grid">
          <div className="coach-sidebar">
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                paddingBottom: '10px',
                borderBottom: '1px solid var(--border-color)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                <span>{t("Account connected to Coach", "ข้อมูลพอร์ตที่เชื่อมกับโค้ช")}</span>
                <span className="mono" style={{ color: 'var(--accent-ink)', fontSize: '10.5px' }}>
                  {t("LIVE SYNC", "ซิงก์สด")}
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '1px',
                  background: 'var(--border-color)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-xs)',
                  overflow: 'hidden',
                  fontSize: '11.5px',
                }}
              >
                <div style={{ background: 'var(--bg-surface-solid)', padding: '7px 8px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '10.5px' }}>{t("Balance / target", "ยอดคงเหลือ / เป้า")}</div>
                  <strong className="mono sensitive-val">{fmtUSD(acc.balance)}</strong>
                  <div className="mono" style={{ fontSize: '10.5px', color: 'var(--text-secondary)' }}>
                    {t('Remaining', 'ขาดอีก')} {fmtUSD(acc.rem)}
                  </div>
                </div>

                <div style={{ background: 'var(--bg-surface-solid)', padding: '7px 8px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '10.5px' }}>
                    {t('3-TP plan', 'แผน 3-TP')} ({state.calcDir})
                  </div>
                  <strong className="mono">{calc.validEntry.toFixed(2)}</strong>
                  <div className="mono" style={{ fontSize: '10.5px', color: 'var(--emerald)' }}>
                    Full +{fmtUSD(calc.fullSweepUsd)} / TL +{fmtUSD(calc.tlHitUsd)}
                  </div>
                </div>

                <div style={{ background: 'var(--bg-surface-solid)', padding: '7px 8px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '10.5px' }}>{t("5-Gate checklist", "เช็กลิสต์ 5 ด่าน")}</div>
                  <strong
                    className="mono"
                    style={{ color: gatesChecked === 5 ? 'var(--emerald)' : 'var(--amber)' }}
                  >
                    {t(`${gatesChecked}/5 passed`, `ผ่าน ${gatesChecked}/5 ข้อ`)}
                  </strong>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)' }}>
                    Risk ${calc.risk} ({calc.lotLeg}L×3)
                  </div>
                </div>

                <div style={{ background: 'var(--bg-surface-solid)', padding: '7px 8px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '10.5px' }}>{t("40% rule (3 days)", "กฎ 40% (3 วัน)")}</div>
                  <strong
                    className="mono"
                    style={{ color: cons.isPass ? 'var(--emerald)' : 'var(--accent-ink)' }}
                  >
                    {t('Best day', 'วันกำไรสูงสุด')} {cons.bestDayPct.toFixed(1)}%
                  </strong>
                  <div className="mono" style={{ fontSize: '10.5px', color: 'var(--text-secondary)' }}>
                    {t('Total', 'รวม')} {fmtUSD(cons.totalProfit)}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                {t("Trade planning prompts", "หัวข้อวางแผนเทรดด่วน")}
              </span>
              {activeQuickPrompts.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="coach-prompt-btn"
                  disabled={isSending}
                  onClick={() => void handleSendMessage(item.prompt)}
                >
                  <span>{t(item.labelEn, item.label)}</span>
                  <span style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>→</span>
                </button>
              ))}
            </div>

            <div
              style={{
                marginTop: 'auto',
                fontSize: '10.5px',
                lineHeight: 1.45,
                color: 'var(--rose)',
                fontWeight: 600,
                borderTop: '1px solid var(--border-color)',
                paddingTop: '8px',
              }}
            >
              {t("Important: Risk & statistics analytics tool only — Not Financial Advice", "Safe Harbor · ใช้คำนวณความเสี่ยงและดูสถิติเท่านั้น ไม่ใช่คำแนะนำการลงทุน")}
            </div>
          </div>

          <div className="coach-chat-main">
            <div className="coach-live-chart-panel" aria-label={t("AI Coach live market chart", "กราฟตลาดสดสำหรับโค้ช AI")}>
              <div className="coach-live-chart-controls">
                <div className="coach-live-chart-selects">
                  <span className="pill blue" style={{ fontSize: '11px' }}>
                    {t("LIVE CHART FEED", "ข้อมูลกราฟสด")}
                  </span>
                  <select
                    aria-label={t("Choose a symbol for live chart analysis", "เลือกสัญลักษณ์เพื่อวิเคราะห์กราฟสด")}
                    className="coach-live-select"
                    value={chartSymbol}
                    onChange={(e) => setChartSymbol(e.target.value)}
                  >
                    {LIVE_CHART_SYMBOLS.map((sym) => (
                      <option key={sym} value={sym}>
                        {sym}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={t("Choose a timeframe for live chart analysis", "เลือกกรอบเวลาเพื่อวิเคราะห์กราฟสด")}
                    className="coach-live-select"
                    value={chartTimeframe}
                    onChange={(e) => setChartTimeframe(e.target.value)}
                  >
                    {LIVE_CHART_TIMEFRAMES.map((tf) => (
                      <option key={tf} value={tf}>
                        {tf.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    className={`btn xs ${autoPoll ? 'emerald' : ''}`}
                    onClick={() => setAutoPoll((v) => !v)}
                  >
                    {autoPoll ? t('● Auto 30s', '● อัตโนมัติ 30 วิ') : t('Auto off', 'ปิดอัตโนมัติ')}
                  </button>
                  <button
                    type="button"
                    className="btn xs"
                    onClick={() => void refreshTelemetry(chartSymbol, chartTimeframe)}
                    disabled={chartLoading}
                  >
                    {chartLoading ? t('Loading…', 'กำลังโหลด…') : t('Refresh price', 'รีเฟรชราคา')}
                  </button>
                </div>
              </div>
              {chartError ? (
                <div style={{ fontSize: '11.5px', color: 'var(--rose)' }}>{t('Unable to refresh live chart data.', 'อัปเดตข้อมูลกราฟสดไม่สำเร็จ')}</div>
              ) : liveTelemetry ? (
                <div className="coach-live-metrics-grid">
                  <span>{t('Spot:', 'ราคาตลาด:')} <strong>{liveTelemetry.currentPrice}</strong></span>
                  <span>EMA20/50: <strong>{liveTelemetry.ema20.toFixed(2)}/{liveTelemetry.ema50.toFixed(2)}</strong></span>
                  <span>RSI(14): <strong>{liveTelemetry.rsi14.toFixed(1)}</strong></span>
                  <span>ATR(14): <strong>{liveTelemetry.atr14.toFixed(2)}</strong></span>
                </div>
              ) : null}
            </div>

            {renderChatThreadArea()}
          </div>
        </div>
      </div>
    </section>
  );
};
