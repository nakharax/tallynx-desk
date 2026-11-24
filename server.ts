import 'dotenv/config';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GoogleGenAI, GenerateContentResponse, Modality } from '@google/genai';
import {
  normalizeBridgePositionsToMt5Records,
  normalizeMt5TimeOffsetSetting,
  reapplyMt5TimezoneToPositions,
} from './src/utils/ghrRules.js';
import { createRemoteVpsPilotServices } from './server/fundednext/vpsClient.js';
import { createFundedNextRouter } from './server/fundednext/router.js';
import { createMallRouter, type MallSnapshotSource } from './server/mall/mallRouter.js';
import {
  calibrateCandlesToLiveSpot,
  computeLiveChartTelemetryFromCandles,
  computeVerifiedSetupMetrics,
  maskMt5Login,
  validateVerifiedMt5Positions,
} from './src/utils/marketplaceUtils.js';
import { LiveChartResponseCache } from './src/utils/liveChartCache.js';
import { DeskSetupBlueprint, MarketCandle, MarketplaceDeskSetup, Mt5VerificationChannel } from './src/types/ghr.js';
import {
  PROP_FIRM_CATALOG,
  PropFirmLiveProbeResult,
  PropFirmRuleEntry,
} from './src/utils/propFirmCatalog.js';
import {
  GEMINI_35_TRANSCRIBE,
  GEMINI_38_FLASH_LITE_TTS,
  GEMINI_38_FLASH_TTS,
  GEMINI_38_LIVE,
  GEMINI_38_LIVE_THINKING,
  GEMINI_4_HYDROGEN,
  GEMINI_DECISION_MODEL,
  GEMINI_FLASH_LITE_31,
  GEMINI_FLASH_LITE_35,
  SAFE_HARBOR_REMINDER,
  createDecisionGenAIClient,
  executeWithModelFailover,
  isOpenWeightGemmaModel,
  isRetryableQuotaOrTransientError,
  modelSupportsGoogleSearch,
  modelSupportsPdf,
  planModelRoute,
} from './src/utils/geminiOrchestrator.js';
import { stripMarkdownForSpeech } from './src/utils/liveAudioUtils.js';

const PORT = Number(process.env.PORT) || 3000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX_REQUESTS = 25;

interface FirebaseClientConfig {
  apiKey?: string;
  projectId?: string;
  firestoreDatabaseId?: string;
}

function loadFirebaseClientConfig(): FirebaseClientConfig {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8');
    return JSON.parse(raw) as FirebaseClientConfig;
  } catch {
    return {};
  }
}

const FIREBASE_CFG = loadFirebaseClientConfig();
const rateBucket = new Map<string, number[]>();
const telemetryBus = new EventEmitter();
telemetryBus.setMaxListeners(100);

export function checkChatRateLimit(
  key: string,
  nowMs: number = Date.now(),
  maxRequests: number = RATE_MAX_REQUESTS
): { allowed: boolean; retryAfterSec: number } {
  const windowStart = nowMs - RATE_WINDOW_MS;
  const timestamps = (rateBucket.get(key) || []).filter((ts) => ts > windowStart);
  if (timestamps.length >= maxRequests) {
    const oldest = timestamps[0] || nowMs;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + RATE_WINDOW_MS - nowMs) / 1000));
    rateBucket.set(key, timestamps);
    return { allowed: false, retryAfterSec };
  }
  timestamps.push(nowMs);
  rateBucket.set(key, timestamps);
  return { allowed: true, retryAfterSec: 0 };
}

interface VerifiedCaller {
  uid: string;
  email: string;
}

async function verifyFirebaseBearerToken(authHeader: string | undefined, requireVerifiedEmail = true): Promise<VerifiedCaller | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken || idToken.length < 20) return null;

  const apiKey = FIREBASE_CFG.apiKey || process.env.FIREBASE_WEB_API_KEY;
  if (!apiKey) return null;

  try {
    const resp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      users?: Array<{ localId?: string; email?: string; emailVerified?: boolean; disabled?: boolean }>;
    };
    const user = data.users && data.users[0];
    if (!user || !user.localId || user.disabled || (requireVerifiedEmail && user.emailVerified !== true)) {
      return null;
    }
    return {
      uid: user.localId,
      email: user.email || '',
    };
  } catch {
    return null;
  }
}

interface LiveBridgeFeedEntry {
  syncedAt: string;
  reason: string;
  meta: {
    holderName: string;
    login: string;
    broker: string;
    server: string;
    currency: string;
    initialDeposit: number;
    summaryNetProfit: number | null;
  };
  positions: ReturnType<typeof normalizeBridgePositionsToMt5Records>['positions'];
  skippedCount: number;
}

const LIVE_BRIDGE_STORE_PATH = path.join(os.tmpdir(), 'tredyn_live_bridge_store_v32.json');
const liveBridgeMemoryStore = new Map<string, LiveBridgeFeedEntry>();

function hashTredynApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey.trim()).digest('hex');
}

function isValidTredynApiKey(rawKey: string): boolean {
  const cleaned = rawKey.trim();
  return cleaned.length >= 12 && cleaned.length <= 128 && /^[a-zA-Z0-9_\-]+$/.test(cleaned);
}

function readLiveBridgeStoreFromDisk(): Record<string, LiveBridgeFeedEntry> {
  try {
    if (!fs.existsSync(LIVE_BRIDGE_STORE_PATH)) return {};
    const raw = fs.readFileSync(LIVE_BRIDGE_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, LiveBridgeFeedEntry>) : {};
  } catch {
    return {};
  }
}

function saveLiveBridgeFeed(apiKey: string, entry: LiveBridgeFeedEntry): void {
  const keyHash = hashTredynApiKey(apiKey);
  liveBridgeMemoryStore.set(keyHash, entry);
  try {
    const disk = readLiveBridgeStoreFromDisk();
    disk[keyHash] = entry;
    fs.writeFileSync(LIVE_BRIDGE_STORE_PATH, JSON.stringify(disk), 'utf8');
  } catch {
    // ignore read-only fs errors
  }
}

function getLiveBridgeFeed(apiKey: string): LiveBridgeFeedEntry | null {
  const keyHash = hashTredynApiKey(apiKey);
  const mem = liveBridgeMemoryStore.get(keyHash);
  if (mem) return mem;
  const disk = readLiveBridgeStoreFromDisk();
  if (disk[keyHash]) {
    liveBridgeMemoryStore.set(keyHash, disk[keyHash]);
    return disk[keyHash];
  }
  return null;
}

function getGenAIClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getLiveTokenGenAIClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      apiVersion: 'v1alpha',
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const BASE_GHR_SYSTEM_INSTRUCTION = `คุณคือ "TallyNX AI Live Desk · GHR v3.2" โค้ชวางแผนการเทรดทองคำ (XAUUSD) และผู้เชี่ยวชาญระบบ Golden Horizon (GHR v3.2) ประจำโต๊ะเทรด
หน้าที่ของคุณคือช่วยผู้ใช้:
1. วางแผนการเทรดรายวันและรายสัปดาห์ตามกฎเหล็กของระบบ GHR v3.2:
   - แบ่งออเดอร์เป็น 3 ไม้ (3-Leg Split) ความเสี่ยงรวมต่อ 1 Idea (เช่น $120 = 0.04 Lot × 3 ไม้ หรือ $90 = 0.03 Lot × 3 ไม้)
   - ระยะ Stop Loss มาตรฐาน = -1,000 จุด (-10.00 ดอลลาร์ทองคำ)
   - TP1 = +400 จุด (+4.00 ดอลลาร์)
   - TP2 = +800 จุด (+8.00 ดอลลาร์) และเมื่อราคาชน TP2 ต้องเลื่อน SL ของไม้ที่ 3 ไปล็อกกำไรที่จุด TP1 (+400 จุด) ทันที (เรียกว่า Trailing Lock / TL)
   - TP3 = +1,200 จุด (+12.00 ดอลลาร์)
   - ผลลัพธ์ต่อ 1 Idea: ชนะครบ 3 ไม้ (Full Sweep) ได้ +0.80R (+2,400p), ติด Trailing Lock ได้ +0.53R (+1,600p), เก็บแค่ TP1 แล้วโดน SL 2 ไม้ที่เหลือ เสีย -0.53R (-1,600p), ชน SL ทั้ง 3 ไม้ เสีย -1.00R (-3,000p)
2. ตรวจสอบเช็กลิสต์ 5 ประตู (5 Quick Gates) และ 12-Gate Protocol ก่อนวาง Limit Order:
   - Gate 1: โซน H1 HVN (High Volume Node) ระยะ 100–200 จุด
   - Gate 2: แท่งเทียน H1 ปิดยืนยันโครงสร้างชัดเจน
   - Gate 3: ไทม์เฟรม M5 ย่อตัวและปิดแท่งยืนยัน
   - Gate 4: ตั้ง Pending Limit Order มีอายุไม่เกิน 30 นาที
   - Gate 5: ห้ามกดเข้าออเดอร์ด้วยมือ (Market Order) หรือแก้ SL ขยายความเสี่ยงเด็ดขาด
3. บริหารหน้าตัก โควต้าวันละไม่เกิน 3 ไม้ (3 Ideas/วัน) การพัก Cooldown 15 นาทีหลังชน SL และการวางแผนทำกำไรให้ผ่านกฎ Consistency Rule (ค่ามาตรฐาน 40% หรือตามที่ตั้งค่าในแต่ละพอร์ต)
4. พูดคุยให้คำปรึกษาเรื่องจิตวิทยาการเทรด วินัยการรักษาระบบ และการทบทวนสมุดบันทึกการเทรด (Trade Journal) ด้วยน้ำเสียงที่เป็นกันเอง กระชับ ชัดเจน เป็นระบบ จัดรูปแบบให้อ่านง่ายด้วย Markdown/ตารางเมื่อเหมาะ และอ้างอิงตัวเลขจริงจากพอร์ตของผู้ใช้เสมอ พร้อมย้ำว่าเป็นคำแนะนำเชิงระบบความเสี่ยง ไม่ใช่สัญญาณซื้อขาย`;

const propRulesProbeCache = new Map<
  string,
  { expiresAt: number; data: PropFirmLiveProbeResult }
>();

function extractHtmlTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]{1,160}?)<\/title>/i);
  if (!m) return null;
  const cleaned = m[1]
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? cleaned.slice(0, 110) : null;
}

async function probeSinglePropFirm(
  firm: PropFirmRuleEntry,
  forceRefresh = false
): Promise<PropFirmLiveProbeResult> {
  const now = Date.now();
  const cached = propRulesProbeCache.get(firm.id);
  if (!forceRefresh && cached && cached.expiresAt > now) {
    return cached.data;
  }

  const started = Date.now();
  let httpStatus = 0;
  let finalUrl = firm.rulesUrl;
  let pageTitle: string | null = null;
  let lastModifiedHeader: string | null = null;
  let probeStatus: PropFirmLiveProbeResult['probeStatus'] = 'UNREACHABLE';

  const probeTarget = async (url: string) => {
    const resp = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(4500),
      headers: {
        'User-Agent': 'TallyNX-Desk-PropRules-Monitor/1.0 (+https://desk.tallynx.com)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    httpStatus = resp.status;
    finalUrl = resp.url || url;
    lastModifiedHeader = resp.headers.get('last-modified');

    if (resp.status >= 200 && resp.status < 400) {
      probeStatus = 'LIVE_OK';
      const contentType = resp.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        const chunk = (await resp.text()).slice(0, 12000);
        pageTitle = extractHtmlTitle(chunk);
      }
    } else if (resp.status === 403 || resp.status === 429 || resp.status === 503) {
      probeStatus = 'CF_PROTECTED';
    }
  };

  try {
    await probeTarget(firm.rulesUrl);
  } catch {
    try {
      await probeTarget(firm.websiteUrl);
    } catch {
      probeStatus = 'UNREACHABLE';
    }
  }

  const result: PropFirmLiveProbeResult = {
    id: firm.id,
    name: firm.name,
    websiteUrl: firm.websiteUrl,
    rulesUrl: firm.rulesUrl,
    probeStatus,
    httpStatus,
    latencyMs: Math.max(1, Date.now() - started),
    finalUrl,
    pageTitle,
    lastModifiedHeader,
    checkedAtIso: new Date().toISOString(),
  };

  propRulesProbeCache.set(firm.id, {
    expiresAt: Date.now() + 60 * 1000,
    data: result,
  });

  return result;
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '8mb' }));
  const sovereignMt5BaseUrl = (
    process.env.MT5_SOVEREIGN_BASE_URL || ''
  ).trim().replace(/\/+$/, '');
  const fundedNextVpsBaseUrl = (
    process.env.FUNDEDNEXT_VPS_BASE_URL ||
    process.env.FUNDEDNEXT_GATEWAY_URL ||
    sovereignMt5BaseUrl
  ).trim().replace(/\/+$/, '');
  let fundedNext: ReturnType<typeof createRemoteVpsPilotServices> | undefined;
  const connectedMallSnapshots = new Map<string, MallSnapshotSource>();
  function mallSourceKey(uid: string, channel: string, accountId: string) {
    return JSON.stringify([uid, channel, accountId]);
  }
  function rememberMallSource(uid: string, accountId: string, source: MallSnapshotSource) {
    const key = mallSourceKey(uid, source.verifiedBadge.channel, accountId);
    const current = connectedMallSnapshots.get(key);
    if (current && Date.parse(current.capturedAt) > Date.parse(source.capturedAt)) return;
    connectedMallSnapshots.delete(key);
    connectedMallSnapshots.set(key, source);
    if (connectedMallSnapshots.size > 512) connectedMallSnapshots.delete(connectedMallSnapshots.keys().next().value!);
  }
  app.use('/api/fundednext', (req, res, next) => {
    if (!fundedNextVpsBaseUrl) {
      res.status(503).json({
        ok: false,
        code: 'GATEWAY_UNCONFIGURED',
        error: 'FundedNext gateway URL is not configured on this server.',
      });
      return;
    }
    next();
  });
  app.use('/api/fundednext', createFundedNextRouter({
    verifyIdToken: token => verifyFirebaseBearerToken('Bearer ' + token, false),
    onExecutionsRead: (uid, accountId, executions) => {
      const latest = executions.filter((trade) => trade.kind === 'TRADE' && trade.symbol && trade.closedAt && trade.netPnl !== null
        && Number.isFinite(Number(trade.netPnl)) && Number.isFinite(Date.parse(trade.closedAt))
        && Date.parse(trade.closedAt) <= Date.now()
        && !trade.unverifiedFields?.some((field) => field === 'closedAt' || field === 'netPnl'))
        .sort((a, b) => Date.parse(b.closedAt!) - Date.parse(a.closedAt!))[0];
      if (latest) rememberMallSource(uid, accountId, {
        reference: accountId + ':' + latest.id, symbol: latest.symbol!, capturedAt: latest.closedAt!, pnl: Number(latest.netPnl),
        movement: { open: Number(latest.openPrice), close: Number(latest.closePrice) },
        verifiedBadge: { channel: 'FUNDEDNEXT_MCP', brokerName: 'FundedNext', verifiedAt: latest.fetchedAt },
      });
    },
    services: () =>
      (fundedNext ??= createRemoteVpsPilotServices({
        baseUrl: fundedNextVpsBaseUrl,
        secret: process.env.FUNDEDNEXT_VPS_RPC_SECRET,
      })),
    secureCookies: process.env.NODE_ENV !== 'development',
  }));

  const MARKETPLACE_STORE_PATH = path.join(os.tmpdir(), 'tredyn_marketplace_store_v1.json');
  const marketplaceMemoryStore = new Map<string, MarketplaceDeskSetup>();

  function loadMarketplaceStore(): MarketplaceDeskSetup[] {
    try {
      if (fs.existsSync(MARKETPLACE_STORE_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(MARKETPLACE_STORE_PATH, 'utf8'));
        if (Array.isArray(parsed)) {
          parsed.forEach((item: MarketplaceDeskSetup) => {
            if (item && item.id) marketplaceMemoryStore.set(item.id, item);
          });
        }
      }
    } catch {
      // ignore disk read errors
    }
    return Array.from(marketplaceMemoryStore.values()).sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt))
    );
  }

  function saveMarketplaceSetup(setup: MarketplaceDeskSetup): void {
    marketplaceMemoryStore.set(setup.id, setup);
    try {
      const all = Array.from(marketplaceMemoryStore.values());
      fs.writeFileSync(MARKETPLACE_STORE_PATH, JSON.stringify(all), 'utf8');
    } catch {
      // ignore read-only fs errors
    }
  }

  function removeMarketplaceSetup(id: string): void {
    marketplaceMemoryStore.delete(id);
    try {
      const all = Array.from(marketplaceMemoryStore.values());
      fs.writeFileSync(MARKETPLACE_STORE_PATH, JSON.stringify(all), 'utf8');
    } catch {
      // ignore read-only fs errors
    }
  }

  const SYMBOL_TO_YAHOO: Record<string, string[]> = {
    XAUUSD: ['GC=F', 'XAUUSD=X'],
    EURUSD: ['EURUSD=X'],
    GBPUSD: ['GBPUSD=X'],
    USDJPY: ['USDJPY=X'],
    NAS100: ['NQ=F', '^NDX'],
    US30: ['YM=F', '^DJI'],
    BTCUSD: ['BTC-USD'],
  };

  interface LiveSpotQuoteResult {
    price: number;
    label: string;
  }

  async function fetchTradingViewScanQuote(
    marketPath: 'cfd' | 'forex' | 'crypto',
    tickers: string[]
  ): Promise<LiveSpotQuoteResult | null> {
    try {
      const resp = await fetch(`https://scanner.tradingview.com/${marketPath}/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (TallyNXDesk/3.2)',
        },
        body: JSON.stringify({
          symbols: { tickers },
          columns: ['close'],
        }),
        signal: AbortSignal.timeout(4000),
      });
      if (!resp.ok) return null;
      const json = (await resp.json()) as {
        data?: Array<{ s?: string; d?: Array<number | null> }>;
      };
      const rows = json.data || [];
      for (const t of tickers) {
        const match = rows.find((r) => r.s === t);
        const px = match?.d?.[0];
        if (typeof px === 'number' && Number.isFinite(px) && px > 0) {
          return { price: px, label: `${t} Live` };
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  async function fetchSwissquoteSpotQuote(
    base: string,
    quote: string
  ): Promise<LiveSpotQuoteResult | null> {
    try {
      const resp = await fetch(
        `https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/${encodeURIComponent(
          base
        )}/${encodeURIComponent(quote)}`,
        {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(4000),
        }
      );
      if (!resp.ok) return null;
      const json = (await resp.json()) as Array<{
        spreadProfilePrices?: Array<{ bid?: number; ask?: number }>;
      }>;
      const prof = json?.[0]?.spreadProfilePrices?.[0];
      if (
        prof &&
        typeof prof.bid === 'number' &&
        typeof prof.ask === 'number' &&
        prof.bid > 0 &&
        prof.ask > 0
      ) {
        return {
          price: (prof.bid + prof.ask) / 2,
          label: `Swissquote ${base}/${quote} Spot`,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  async function fetchLiveSpotQuote(rawSym: string): Promise<LiveSpotQuoteResult | null> {
    if (rawSym === 'XAUUSD') {
      const tv = await fetchTradingViewScanQuote('cfd', [
        'OANDA:XAUUSD',
        'FX:XAUUSD',
        'TVC:GOLD',
      ]);
      if (tv) return tv;
      return fetchSwissquoteSpotQuote('XAU', 'USD');
    }
    if (rawSym === 'US30') {
      return fetchTradingViewScanQuote('cfd', ['OANDA:US30USD']);
    }
    if (rawSym === 'EURUSD') {
      return (
        (await fetchTradingViewScanQuote('forex', ['OANDA:EURUSD'])) ||
        (await fetchSwissquoteSpotQuote('EUR', 'USD'))
      );
    }
    if (rawSym === 'GBPUSD') {
      return (
        (await fetchTradingViewScanQuote('forex', ['OANDA:GBPUSD'])) ||
        (await fetchSwissquoteSpotQuote('GBP', 'USD'))
      );
    }
    if (rawSym === 'USDJPY') {
      return (
        (await fetchTradingViewScanQuote('forex', ['OANDA:USDJPY'])) ||
        (await fetchSwissquoteSpotQuote('USD', 'JPY'))
      );
    }
    if (rawSym === 'BTCUSD') {
      try {
        const br = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', {
          signal: AbortSignal.timeout(3500),
        });
        if (br.ok) {
          const j = (await br.json()) as { price?: string };
          const px = Number(j.price);
          if (Number.isFinite(px) && px > 0) {
            return { price: px, label: 'Binance BTCUSDT Spot' };
          }
        }
      } catch {
        // fallback to TradingView crypto scan
      }
      return fetchTradingViewScanQuote('crypto', ['BINANCE:BTCUSDT']);
    }
    return null;
  }

  const TIMEFRAME_TO_YAHOO: Record<string, { interval: string; range: string }> = {
    '5m': { interval: '5m', range: '2d' },
    '15m': { interval: '15m', range: '5d' },
    '1h': { interval: '60m', range: '1mo' },
    '4h': { interval: '60m', range: '3mo' },
    '1d': { interval: '1d', range: '6mo' },
  };

  function aggregateCandles4H(hourly: MarketCandle[]): MarketCandle[] {
    const out: MarketCandle[] = [];
    for (let i = 0; i < hourly.length; i += 4) {
      const chunk = hourly.slice(i, i + 4);
      if (chunk.length === 0) continue;
      out.push({
        ts: chunk[0].ts,
        timeLabel: chunk[chunk.length - 1].timeLabel,
        open: chunk[0].open,
        high: Math.max(...chunk.map((c) => c.high)),
        low: Math.min(...chunk.map((c) => c.low)),
        close: chunk[chunk.length - 1].close,
        volume: chunk.reduce((acc, c) => acc + (c.volume || 0), 0),
      });
    }
    return out;
  }

  const liveChartCache = new LiveChartResponseCache();

  app.get('/api/market/live-chart', async (req, res) => {
    try {
      const rawSym = String(req.query.symbol || 'XAUUSD').trim().toUpperCase();
      const rawTf = String(req.query.timeframe || '15m').trim().toLowerCase();
      const forceRefresh = req.query.refresh === '1' || req.query.nocache === '1';
      const tf = TIMEFRAME_TO_YAHOO[rawTf] ? rawTf : '15m';
      const tickers = SYMBOL_TO_YAHOO[rawSym] || [rawSym];
      const yCfg = TIMEFRAME_TO_YAHOO[tf];
      const cacheKey = `${rawSym}:${tf}`;

      const lookup = await liveChartCache.getOrFetch(
        cacheKey,
        async () => {
          const spotPromise = fetchLiveSpotQuote(rawSym);

          let fetchedCandles: MarketCandle[] = [];
          let usedSource = '';
          let usedFuturesProxy = false;

          // For BTCUSD, try real-time Binance Spot klines first (zero delay vs Yahoo)
          if (rawSym === 'BTCUSD') {
            try {
              const bInterval =
                tf === '1d' ? '1d' : tf === '4h' ? '4h' : tf === '1h' ? '1h' : tf === '5m' ? '5m' : '15m';
              const br = await fetch(
                `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${bInterval}&limit=80`,
                { signal: AbortSignal.timeout(7000) }
              );
              if (br.ok) {
                const klines = (await br.json()) as Array<Array<string | number>>;
                fetchedCandles = klines.map((k) => {
                  const dt = new Date(Number(k[0]));
                  return {
                    ts: Number(k[0]),
                    timeLabel: `${dt.toISOString().slice(5, 10)} ${dt.toISOString().slice(11, 16)}`,
                    open: Number(k[1]),
                    high: Number(k[2]),
                    low: Number(k[3]),
                    close: Number(k[4]),
                    volume: Number(k[5]),
                  };
                });
                usedSource = 'Binance Spot (BTCUSDT)';
              }
            } catch {
              // fallback to Yahoo below
            }
          }

          if (fetchedCandles.length < 10) {
            for (const ticker of tickers) {
              try {
                const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
                  ticker
                )}?interval=${encodeURIComponent(yCfg.interval)}&range=${encodeURIComponent(yCfg.range)}`;
                const r = await fetch(url, {
                  headers: {
                    Accept: 'application/json',
                    'User-Agent': 'Mozilla/5.0 (TallyNXDesk/3.2)',
                  },
                  signal: AbortSignal.timeout(8000),
                });
                if (!r.ok) continue;
                const json = (await r.json()) as {
                  chart?: {
                    result?: Array<{
                      timestamp?: number[];
                      indicators?: {
                        quote?: Array<{
                          open?: Array<number | null>;
                          high?: Array<number | null>;
                          low?: Array<number | null>;
                          close?: Array<number | null>;
                          volume?: Array<number | null>;
                        }>;
                      };
                    }>;
                  };
                };
                const result = json.chart?.result?.[0];
                const timestamps = result?.timestamp || [];
                const q = result?.indicators?.quote?.[0];
                if (!q || timestamps.length === 0) continue;

                const parsed: MarketCandle[] = [];
                for (let i = 0; i < timestamps.length; i++) {
                  const o = q.open?.[i];
                  const h = q.high?.[i];
                  const l = q.low?.[i];
                  const c = q.close?.[i];
                  if (
                    typeof o === 'number' &&
                    typeof h === 'number' &&
                    typeof l === 'number' &&
                    typeof c === 'number' &&
                    Number.isFinite(c) &&
                    c > 0
                  ) {
                    const dt = new Date(timestamps[i] * 1000);
                    const label =
                      tf === '1d'
                        ? dt.toISOString().slice(5, 10)
                        : `${dt.toISOString().slice(5, 10)} ${dt.toISOString().slice(11, 16)}`;
                    parsed.push({
                      ts: timestamps[i] * 1000,
                      timeLabel: label,
                      open: o,
                      high: h,
                      low: l,
                      close: c,
                      volume: Number(q.volume?.[i] || 0),
                    });
                  }
                }
                if (parsed.length >= 10) {
                  fetchedCandles = tf === '4h' ? aggregateCandles4H(parsed) : parsed;
                  usedFuturesProxy = ticker === 'GC=F' || ticker === 'YM=F' || ticker === 'NQ=F';
                  usedSource = `Yahoo Finance (${ticker})`;
                  break;
                }
              } catch {
                // try next ticker fallback
              }
            }
          }

          const liveSpotQuote = await spotPromise;

          if (fetchedCandles.length < 5) {
            throw Object.assign(new Error(`ไม่สามารถดึงข้อมูลกราฟสดของ ${rawSym} (${tf}) ได้ในขณะนี้`), {
              httpStatus: 502,
            });
          }

          const calibratedCandles = liveSpotQuote
            ? calibrateCandlesToLiveSpot(fetchedCandles, liveSpotQuote.price, tf, usedFuturesProxy)
            : fetchedCandles;

          const finalSource = liveSpotQuote
            ? `${liveSpotQuote.label}${usedFuturesProxy ? ' (Spot-Calibrated)' : ''}`
            : usedSource;

          return computeLiveChartTelemetryFromCandles(rawSym, tf, calibratedCandles, finalSource);
        },
        { forceRefresh }
      );

      res.setHeader(
        'Cache-Control',
        forceRefresh ? 'no-store, max-age=0' : 'public, max-age=2, s-maxage=3, stale-while-revalidate=5'
      );
      res.setHeader('X-Tredyn-Chart-Cache', lookup.cacheStatus);
      res.json({ ok: true, telemetry: lookup.telemetry, cacheStatus: lookup.cacheStatus });
    } catch (err: unknown) {
      const status =
        typeof err === 'object' && err !== null && 'httpStatus' in err
          ? Number((err as { httpStatus?: unknown }).httpStatus) || 500
          : 500;
      res.status(status).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Live chart fetch failed',
      });
    }
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      models: {
        router: GEMINI_DECISION_MODEL,
        primaryDeep: GEMINI_FLASH_LITE_35,
        primaryFast: GEMINI_FLASH_LITE_31,
      },
      timestamp: new Date().toISOString(),
    });
  });

  const DEFAULT_SOVEREIGN_MT5_BASE_URL = sovereignMt5BaseUrl;

  async function checkDistributedRateLimit(
    key: string,
    maxRequests: number = RATE_MAX_REQUESTS
  ): Promise<{ allowed: boolean; retryAfterSec: number }> {
    const localRate = checkChatRateLimit(key, Date.now(), maxRequests);
    if (!localRate.allowed || !DEFAULT_SOVEREIGN_MT5_BASE_URL) return localRate;
    try {
      const resp = await fetch(`${DEFAULT_SOVEREIGN_MT5_BASE_URL}/ratelimit/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          windowSec: Math.round(RATE_WINDOW_MS / 1000),
          maxRequests,
        }),
        signal: AbortSignal.timeout(700),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { allowed?: boolean; retryAfterSec?: number };
        if (data.allowed === false) {
          return {
            allowed: false,
            retryAfterSec: Math.max(1, Number(data.retryAfterSec) || 60),
          };
        }
      }
    } catch {
      // fail-open to local instance rate-limiter if VPS01 hub is temporarily unreachable
    }
    return localRate;
  }

  app.get('/api/mt5/engine-status', (_req, res) => {
    res.json({
      ok: true,
      liveBridgeReady: true,
      cloudConnectorsReady: true,
      sharedVpsDisabled: true,
      engineReady: true,
    });
  });

  app.post('/api/mt5/live-bridge/push', async (req, res) => {
    try {
      const body = req.body || {};
      const headerKey =
        typeof req.headers['x-tallynx-api-key'] === 'string'
          ? req.headers['x-tallynx-api-key'].trim()
          : typeof req.headers['x-tredyn-api-key'] === 'string'
          ? req.headers['x-tredyn-api-key'].trim()
          : typeof body.tallynxApiKey === 'string'
          ? body.tallynxApiKey.trim()
          : typeof body.tredynApiKey === 'string'
          ? body.tredynApiKey.trim()
          : '';

      if (!isValidTredynApiKey(headerKey)) {
        res.status(401).json({
          ok: false,
          error: 'Invalid or missing X-TallyNX-Api-Key (or X-Tredyn-Api-Key) header',
        });
        return;
      }

      const rawMeta = (body.meta && typeof body.meta === 'object' ? body.meta : {}) as Record<
        string,
        unknown
      >;
      const rawPositions = Array.isArray(body.positions)
        ? body.positions
        : Array.isArray(body.deals)
        ? body.deals
        : [];

      const pushOffset = normalizeMt5TimeOffsetSetting(body.mt5TimeOffset);
      const { positions, skippedCount } = normalizeBridgePositionsToMt5Records(rawPositions, undefined, pushOffset);
      const syncedAt = new Date().toISOString();
      const entry: LiveBridgeFeedEntry = {
        syncedAt,
        reason: typeof body.reason === 'string' ? body.reason : 'MT5_EA_PUSH',
        meta: {
          holderName: String(rawMeta.holderName || rawMeta.name || 'Tredyn MT5 Trader'),
          login: String(rawMeta.login || rawMeta.accountLogin || ''),
          broker: String(rawMeta.broker || rawMeta.company || 'MT5 Live Bridge'),
          server: String(rawMeta.server || ''),
          currency: String(rawMeta.currency || 'USD'),
          initialDeposit: Number(rawMeta.initialDeposit ?? rawMeta.balance ?? 0) || 0,
          summaryNetProfit:
            rawMeta.summaryNetProfit !== undefined && rawMeta.summaryNetProfit !== null
              ? Number(rawMeta.summaryNetProfit)
              : null,
        },
        positions,
        skippedCount,
      };

      saveLiveBridgeFeed(headerKey, entry);
      telemetryBus.emit('bridge_push', {
        login: entry.meta.login,
        broker: entry.meta.broker,
        initialDeposit: entry.meta.initialDeposit,
        summaryNetProfit: entry.meta.summaryNetProfit,
        receivedPositions: positions.length,
        syncedAt,
      });

      // Persist to remote bridge store when configured so serverless cold starts preserve Live Bridge state
      if (DEFAULT_SOVEREIGN_MT5_BASE_URL) {
        await fetch(`${DEFAULT_SOVEREIGN_MT5_BASE_URL}/live-bridge/push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Tredyn-Api-Key': headerKey,
          },
          body: JSON.stringify({
            tredynApiKey: headerKey,
            meta: entry.meta,
            positions: entry.positions,
          }),
          signal: AbortSignal.timeout(4000),
        }).catch(() => null);
      }

      res.json({
        ok: true,
        syncedAt,
        receivedPositions: positions.length,
        skippedCount,
      });
    } catch (err: unknown) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Live Bridge push error',
      });
    }
  });

  app.get('/api/mt5/scripts/:filename', (req, res) => {
    const allowed = ['TredynLiveBridge.mq5', 'TredynLiveBridge.ex5'];
    const filename = req.params.filename;
    if (!allowed.includes(filename)) {
      res.status(410).send('Only safe outbound TredynLiveBridge (.mq5/.ex5) scripts are distributed.');
      return;
    }
    const filePath = path.join(process.cwd(), 'scripts', filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).send('Script file missing');
      return;
    }
    if (filename.endsWith('.ex5')) {
      const bin = fs.readFileSync(filePath);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', String(bin.length));
      res.send(bin);
      return;
    }
    let content = fs.readFileSync(filePath, 'utf8');
    if (filename === 'TredynLiveBridge.mq5') {
      const apiKeyParam = typeof req.query.apiKey === 'string' ? req.query.apiKey.trim() : '';
      const baseUrlParam = typeof req.query.baseUrl === 'string' ? req.query.baseUrl.trim() : '';
      if (isValidTredynApiKey(apiKeyParam)) {
        content = content
          .replace('trd_live_replace_with_your_key', apiKeyParam)
          .replace('YOUR_TREDYN_API_KEY', apiKeyParam);
      }
      if (baseUrlParam && /^https?:\/\/[^\s"']+$/i.test(baseUrlParam)) {
        content = content.replace(/https:\/\/(?:(?:desk|mall)\.tallynx\.com|tredyn-desk\.vercel\.app)(?![\w.:-])/g, () => baseUrlParam.replace(/\/+$/, ''));
      }
    }
    const isPython = filename.endsWith('.py');
    const isMql5 = filename.endsWith('.mq5');
    res.setHeader(
      'Content-Type',
      isPython
        ? 'text/x-python; charset=utf-8'
        : isMql5
        ? 'text/plain; charset=utf-8'
        : 'text/x-shellscript; charset=utf-8'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  });

  app.post('/api/mt5/test-gateway', (_req, res) => {
    res.status(410).json({
      ok: false,
      error:
        'ปิดช่องทาง Shared VPS Gateway แล้วเพื่อความปลอดภัยตามกฎ Prop Firm (Shared IP) กรุณาใช้ Live Bridge (.ex5), Myfxbook API, FundedNext MCP, ProjectX API หรือไฟล์ .xlsx',
    });
  });

  const fundedNextReconnect = {
    ok: false,
    code: 'reconnect_required',
    status: 'reconnect_required',
    error: 'Reconnect FundedNext through the pilot connection flow.',
  } as const;
  const requireFundedNextReconnect: express.RequestHandler = (_req, res) => {
    res.status(409).json(fundedNextReconnect);
  };
  app.post('/api/mt5/fundednext-oauth/start', requireFundedNextReconnect);
  app.get('/api/mt5/fundednext-oauth/callback', requireFundedNextReconnect);
  app.post('/api/mt5/fundednext-oauth/refresh', requireFundedNextReconnect);
  app.post('/api/mt5/fundednext-live', requireFundedNextReconnect);

  app.post('/api/mt5/sync-readonly', async (req, res) => {
    if (req.body?.provider === 'FUNDEDNEXT_MCP') {
      res.status(409).json(fundedNextReconnect);
      return;
    }
    try {
      const caller = await verifyFirebaseBearerToken(req.headers.authorization);
      const rateKey = `mt5:${caller?.uid || req.ip || 'anon'}`;
      const rate = await checkDistributedRateLimit(rateKey);
      if (!rate.allowed) {
        res.status(429).json({
          error: `ซิงก์ข้อมูล MT5 บ่อยเกินกำหนดชั่วคราว กรุณารอ ${rate.retryAfterSec} วินาที`,
          code: 'RATE_LIMITED',
        });
        return;
      }

      const body = req.body || {};
      const provider =
        body.provider === 'LIVE_BRIDGE'
          ? 'LIVE_BRIDGE'
          : body.provider === 'MYFXBOOK_API'
          ? 'MYFXBOOK_API'
          : body.provider === 'PROJECTX_API'
          ? 'PROJECTX_API'
          : null;
      if (!provider) {
        const isDeprecatedRisky =
          body.provider === 'DIRECT_INVESTOR' ||
          body.provider === 'METAAPI_CLOUD' ||
          body.provider === 'BRIDGE_API';
        res.status(isDeprecatedRisky ? 410 : 400).json({
          error: isDeprecatedRisky
            ? 'ช่องทางล็อกอิน Investor Password / Shared VPS ถูกถอดออกถาวรเพื่อป้องกันความเสี่ยงผิดกฎ Shared IP ของกองทุน กรุณาใช้ Live Bridge (.ex5), Myfxbook API, FundedNext MCP, ProjectX API หรือไฟล์ .xlsx'
            : 'กรุณาเลือกช่องทางซิงก์ที่ปลอดภัย (LIVE_BRIDGE, MYFXBOOK_API, FUNDEDNEXT_MCP หรือ PROJECTX_API)',
        });
        return;
      }

      const lookbackDays = Math.min(365, Math.max(1, Number(body.lookbackDays) || 30));
      const userToken = typeof body.token === 'string' ? body.token.trim() : '';
      const mt5TimeOffset = normalizeMt5TimeOffsetSetting(body.mt5TimeOffset);

      if (provider === 'LIVE_BRIDGE') {
        const tredynApiKey =
          typeof body.tredynApiKey === 'string' && body.tredynApiKey.trim()
            ? body.tredynApiKey.trim()
            : userToken;

        if (!isValidTredynApiKey(tredynApiKey)) {
          res.status(400).json({
            error: 'กรุณาระบุ tredyn-api-key ที่ถูกต้อง (เช่น trd_live_...)',
            code: 'INVALID_TREDYN_API_KEY',
          });
          return;
        }

        let feed = getLiveBridgeFeed(tredynApiKey);
        if (!feed && DEFAULT_SOVEREIGN_MT5_BASE_URL) {
          try {
            const pullResp = await fetch(
              `${DEFAULT_SOVEREIGN_MT5_BASE_URL}/live-bridge/pull?apiKey=${encodeURIComponent(tredynApiKey)}`,
              {
                method: 'GET',
                headers: {
                  Accept: 'application/json',
                  'X-Tredyn-Api-Key': tredynApiKey,
                },
                signal: AbortSignal.timeout(6000),
              }
            );
            if (pullResp.ok) {
              const pullData = (await pullResp.json()) as {
                ok?: boolean;
                entry?: {
                  syncedAt?: string;
                  meta?: Record<string, unknown>;
                  positions?: unknown[];
                };
              };
              if (pullData?.ok && pullData.entry) {
                const rawMeta = pullData.entry.meta || {};
                const rawPositions = Array.isArray(pullData.entry.positions)
                  ? pullData.entry.positions
                  : [];
                const { positions, skippedCount } = normalizeBridgePositionsToMt5Records(
                  rawPositions,
                  undefined,
                  mt5TimeOffset
                );
                feed = {
                  syncedAt: String(pullData.entry.syncedAt || new Date().toISOString()),
                  reason: 'VPS01_PERSISTENT_STORE',
                  meta: {
                    holderName: String(rawMeta.holderName || rawMeta.name || 'Tredyn MT5 Trader'),
                    login: String(rawMeta.login || ''),
                    broker: String(rawMeta.broker || 'MT5 Live Bridge'),
                    server: String(rawMeta.server || ''),
                    currency: String(rawMeta.currency || 'USD'),
                    initialDeposit: Number(rawMeta.initialDeposit ?? 0) || 0,
                    summaryNetProfit:
                      rawMeta.summaryNetProfit !== undefined && rawMeta.summaryNetProfit !== null
                        ? Number(rawMeta.summaryNetProfit)
                        : null,
                  },
                  positions,
                  skippedCount,
                };
                saveLiveBridgeFeed(tredynApiKey, feed);
              }
            }
          } catch {
            // Ignore pull error and fall through
          }
        }

        if (!feed) {
          res.status(404).json({
            error:
              'ยังไม่ได้รับสัญญาณข้อมูลจาก MT5 Live Bridge สำหรับ tredyn-api-key นี้ — กรุณาติดตั้ง TredynLiveBridge.ex5 ลงบนกราฟใน MT5 และเปิด Allow WebRequest',
            code: 'LIVE_BRIDGE_WAITING',
          });
          return;
        }

        res.json({
          ok: true,
          provider: 'LIVE_BRIDGE',
          syncedAt: feed.syncedAt,
          meta: feed.meta,
          positions: reapplyMt5TimezoneToPositions(feed.positions, mt5TimeOffset),
          skippedCount: feed.skippedCount,
        });
        return;
      }

      // =========================================================================
      // MODE: MYFXBOOK_API (Whitelisted CFD Prop Firm Cloud Sync)
      // =========================================================================
      if (provider === 'MYFXBOOK_API') {
        const email = typeof body.email === 'string' ? body.email.trim() : '';
        const password = typeof body.password === 'string' ? body.password.trim() : '';
        const targetAccId = typeof body.externalAccountRef === 'string' ? body.externalAccountRef.trim() : '';
        if (!email || !password) {
          res.status(400).json({ error: 'กรุณาระบุ Email และ Password ของบัญชี Myfxbook เพื่อซิงก์แบบ Whitelisted API' });
          return;
        }
        const loginUrl = `https://www.myfxbook.com/api/login.json?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;
        const loginResp = await fetch(loginUrl, { signal: AbortSignal.timeout(12000) });
        const loginJson = (await loginResp.json().catch(() => ({}))) as { error?: boolean; message?: string; session?: string };
        if (!loginResp.ok || loginJson.error || !loginJson.session) {
          res.status(401).json({
            error: `Myfxbook Login ไม่สำเร็จ: ${loginJson.message || `HTTP ${loginResp.status}`}`,
          });
          return;
        }
        const session = loginJson.session;
        try {
          const accResp = await fetch(
            `https://www.myfxbook.com/api/get-my-accounts.json?session=${encodeURIComponent(session)}`,
            { signal: AbortSignal.timeout(12000) }
          );
          const accJson = (await accResp.json().catch(() => ({}))) as {
            error?: boolean;
            message?: string;
            accounts?: Array<{ id?: number; name?: string; accountId?: number; balance?: number; profit?: number; server?: { name?: string }; currency?: string; deposits?: number }>;
          };
          const accountsList = Array.isArray(accJson.accounts) ? accJson.accounts : [];
          if (accJson.error || accountsList.length === 0) {
            res.status(404).json({
              error: accJson.message || 'ไม่พบพอร์ตในบัญชี Myfxbook นี้ (ตรวจสอบว่าผูก Investor Password บน Myfxbook แล้ว)',
            });
            return;
          }
          const matchedAcc =
            accountsList.find(
              (a) =>
                targetAccId &&
                (String(a.id) === targetAccId || String(a.accountId) === targetAccId)
            ) || accountsList[0];

          const histResp = await fetch(
            `https://www.myfxbook.com/api/get-history.json?session=${encodeURIComponent(session)}&id=${encodeURIComponent(String(matchedAcc.id))}`,
            { signal: AbortSignal.timeout(12000) }
          );
          const histJson = (await histResp.json().catch(() => ({}))) as {
            error?: boolean;
            history?: Array<Record<string, unknown>>;
          };
          const rawHistory = Array.isArray(histJson.history) ? histJson.history : [];
          const normalizedInput = rawHistory.map((h, idx) => {
            const sizing = h.sizing as { value?: unknown } | undefined;
            return {
              ticket: String(h.id || h.ticket || `myfx_${idx}`),
              symbol: String(h.symbol || 'XAUUSD'),
              dir: String(h.action || '').toUpperCase().includes('SELL') ? 'SELL' : 'BUY',
              openTime: String(h.openTime || ''),
              closeTime: String(h.closeTime || h.openTime || ''),
              volume: Number(sizing?.value ?? h.lots ?? 0) || 0,
              openPrice: Number(h.openPrice || 0),
              closePrice: Number(h.closePrice || 0),
              slPrice: Number(h.sl || 0),
              tpPrice: Number(h.tp || 0),
              commission: Number(h.commission || 0),
              swap: Number(h.interest || 0),
              rawProfit: Number(h.profit || 0),
              comment: 'Myfxbook Read-Only API',
            };
          });
          const { positions, skippedCount } = normalizeBridgePositionsToMt5Records(
            normalizedInput,
            undefined,
            mt5TimeOffset
          );
          const syncedAt = new Date().toISOString();
          const latest = positions.filter((trade) => Number.isFinite(trade.closeTs) && trade.closeTs > 0 && trade.closeTs <= Date.now())
            .sort((a, b) => b.closeTs - a.closeTs)[0];
          const login = String(matchedAcc.accountId || matchedAcc.id || '');
          if (caller && login && latest && histResp.ok && !histJson.error) rememberMallSource(caller.uid, login, {
            reference: login + ':' + latest.ticket, symbol: latest.symbol, capturedAt: new Date(latest.closeTs).toISOString(),
            pnl: latest.netProfit, movement: { open: latest.openPrice, close: latest.closePrice },
            verifiedBadge: { channel: 'MYFXBOOK_API', brokerName: String(matchedAcc.server?.name || 'Myfxbook').slice(0, 80), verifiedAt: syncedAt },
          });
          res.json({
            ok: true,
            provider: 'MYFXBOOK_API',
            syncedAt,
            meta: {
              holderName: matchedAcc.name || 'Myfxbook Trader',
              login,
              broker: matchedAcc.server?.name || 'Myfxbook Verified Feed',
              server: matchedAcc.server?.name || '',
              currency: matchedAcc.currency || 'USD',
              initialDeposit: Number(matchedAcc.deposits || matchedAcc.balance || 0),
              summaryNetProfit: typeof matchedAcc.profit === 'number' ? matchedAcc.profit : null,
            },
            positions,
            skippedCount,
          });
          return;
        } finally {
          await fetch(
            `https://www.myfxbook.com/api/logout.json?session=${encodeURIComponent(session)}`,
            { signal: AbortSignal.timeout(4000) }
          ).catch(() => null);
        }
      }

      // =========================================================================
      // MODE: PROJECTX_API (TopstepX / ProjectX Futures Cloud Sync)
      // =========================================================================
      if (provider === 'PROJECTX_API') {
        const userName = typeof body.email === 'string' ? body.email.trim() : '';
        const apiKey = userToken;
        if (!userName || !apiKey) {
          res.status(400).json({ error: 'กรุณาระบุ Username และ API Key ของ ProjectX / TopstepX' });
          return;
        }
        const pxBase = 'https://api.topstepx.com/api';
        const authResp = await fetch(`${pxBase}/Auth/loginKey`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ userName, apiKey }),
          signal: AbortSignal.timeout(12000),
        });
        const authJson = (await authResp.json().catch(() => ({}))) as { success?: boolean; token?: string; errorMessage?: string };
        if (!authResp.ok || !authJson.token) {
          res.status(401).json({
            error: `ProjectX Auth ไม่สำเร็จ: ${authJson.errorMessage || `HTTP ${authResp.status}`}`,
          });
          return;
        }
        const pxToken = authJson.token;
        const accResp = await fetch(`${pxBase}/Account/search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${pxToken}`,
          },
          body: JSON.stringify({ onlyActiveAccounts: false }),
          signal: AbortSignal.timeout(12000),
        });
        const accJson = (await accResp.json().catch(() => ({}))) as {
          accounts?: Array<{ id?: number; name?: string; balance?: number }>;
        };
        const accountsList = Array.isArray(accJson.accounts) ? accJson.accounts : [];
        const targetAcc =
          accountsList.find(
            (a) =>
              typeof body.externalAccountRef === 'string' &&
              body.externalAccountRef.trim() &&
              String(a.id) === body.externalAccountRef.trim()
          ) || accountsList[0];

        if (!targetAcc?.id) {
          res.status(404).json({ error: 'ไม่พบพอร์ต Futures ในบัญชี ProjectX / TopstepX นี้' });
          return;
        }
        const endTs = new Date().toISOString();
        const startTs = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
        const tradeResp = await fetch(`${pxBase}/Trade/search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${pxToken}`,
          },
          body: JSON.stringify({ accountId: targetAcc.id, startTimestamp: startTs, endTimestamp: endTs }),
          signal: AbortSignal.timeout(12000),
        });
        const tradeJson = (await tradeResp.json().catch(() => ({}))) as { trades?: Array<Record<string, unknown>> };
        const pxTrades = (Array.isArray(tradeJson.trades) ? tradeJson.trades : []).map((t, i) => ({
          ticket: String(t.id || t.orderId || `px_${i}`),
          symbol: String(t.contractId || t.symbol || 'MGC'),
          dir: Number(t.side) === 1 ? 'SELL' : 'BUY',
          openTime: String(t.creationTimestamp || ''),
          closeTime: String(t.creationTimestamp || ''),
          volume: Number(t.size || 1),
          openPrice: Number(t.price || 0),
          closePrice: Number(t.price || 0),
          commission: -Math.abs(Number(t.fees || 0)),
          swap: 0,
          rawProfit: Number(t.profitAndLoss || 0),
          comment: 'ProjectX / TopstepX Cloud API',
        }));
        const { positions, skippedCount } = normalizeBridgePositionsToMt5Records(
          pxTrades,
          undefined,
          mt5TimeOffset
        );
        res.json({
          ok: true,
          provider: 'PROJECTX_API',
          syncedAt: new Date().toISOString(),
          meta: {
            holderName: targetAcc.name || 'ProjectX Futures Trader',
            login: String(targetAcc.id),
            broker: 'ProjectX / TopstepX',
            server: 'TopstepX-Cloud',
            currency: 'USD',
            initialDeposit: Number(targetAcc.balance || 0),
            summaryNetProfit: null,
          },
          positions,
          skippedCount,
        });
        return;
      }

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({
        error: `ไม่สามารถซิงก์ข้อมูลจากช่องทางปลอดภัยได้: ${msg}`,
      });
    }
  });

  // =========================================================================
  // DESK-IDEA MARKETPLACE APIs (Strictly Backed by Verified Real MT5 Data)
  // =========================================================================
  async function getMarketplaceListings(): Promise<MarketplaceDeskSetup[]> {
    const localListings = loadMarketplaceStore();
    const vpsListings = DEFAULT_SOVEREIGN_MT5_BASE_URL
      ? await fetch(`${DEFAULT_SOVEREIGN_MT5_BASE_URL}/marketplace/listings`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(4000),
        })
          .then(async (r) => (r.ok ? ((await r.json()) as { listings?: MarketplaceDeskSetup[] }) : null))
          .catch(() => null)
      : null;

    const merged = new Map<string, MarketplaceDeskSetup>();
    localListings.forEach((s) => merged.set(s.id, s));
    if (vpsListings && Array.isArray(vpsListings.listings)) {
      vpsListings.listings.forEach((s) => {
        if (s && s.id && s.proofHash && s.metrics?.tradeCount > 0) {
          merged.set(s.id, s);
        }
      });
    }

    return Array.from(merged.values()).sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt))
    );
  }

  app.get('/api/marketplace/listings', async (_req, res) => {
    try {
      res.json({ ok: true, listings: await getMarketplaceListings() });
    } catch (err: unknown) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to load marketplace listings',
      });
    }
  });

  app.post('/api/marketplace/publish', async (req, res) => {
    try {
      const caller = await verifyFirebaseBearerToken(req.headers.authorization);
      if (!caller) {
        res.status(401).json({
          ok: false,
          error: 'กรุณาเข้าสู่ระบบบัญชี Google ก่อนลงขาย/เผยแพร่ Setup ใน Marketplace',
        });
        return;
      }

      const body = (req.body || {}) as {
        title?: unknown;
        summary?: unknown;
        priceUsd?: unknown;
        sellerName?: unknown;
        verificationChannel?: unknown;
        brokerName?: unknown;
        brokerServer?: unknown;
        login?: unknown;
        initialDeposit?: unknown;
        mt5Positions?: unknown[];
        blueprint?: Partial<DeskSetupBlueprint>;
      };

      const title = String(body.title || '').trim().slice(0, 90);
      const summary = String(body.summary || '').trim().slice(0, 600);
      if (title.length < 4) {
        res.status(400).json({ ok: false, error: 'กรุณาตั้งชื่อ Setup อย่างน้อย 4 ตัวอักษร' });
        return;
      }

      const allowedChannels: Mt5VerificationChannel[] = [
        'LIVE_BRIDGE',
        'DIRECT_INVESTOR',
        'METAAPI_CLOUD',
        'MANUAL_XLSX',
      ];
      const verificationChannel: Mt5VerificationChannel = allowedChannels.includes(
        body.verificationChannel as Mt5VerificationChannel
      )
        ? (body.verificationChannel as Mt5VerificationChannel)
        : 'MANUAL_XLSX';

      const brokerServer = String(body.brokerServer || '').trim();
      const brokerName = String(body.brokerName || '').trim() || 'MT5 Verified Broker';
      const rawLogin = String(body.login || '').trim();
      if (!rawLogin || rawLogin.length < 3) {
        res.status(400).json({
          ok: false,
          error: 'ไม่พบเลขพอร์ต MT5 (Account Login) — ระบบอนุญาตเฉพาะพอร์ตที่ซิงก์ MT5 จริงเท่านั้น',
        });
        return;
      }

      const { valid: verifiedPositions } = validateVerifiedMt5Positions(body.mt5Positions || []);
      if (verifiedPositions.length === 0) {
        res.status(400).json({
          ok: false,
          error:
            'ไม่พบประวัติออเดอร์ MT5 จริงที่ผ่านการตรวจสอบ (ต้องซิงก์ผ่าน Investor Password, Live Bridge .ex5 หรือ Report .xlsx ก่อนลงขาย)',
        });
        return;
      }

      const initialDeposit = Math.max(100, Number(body.initialDeposit) || 10000);
      const metrics = computeVerifiedSetupMetrics(verifiedPositions, initialDeposit);

      const verifiedAt = new Date().toISOString();
      const proofPayload = JSON.stringify({
        sellerUid: caller.uid,
        login: rawLogin,
        brokerServer: brokerServer || brokerName,
        verificationChannel,
        tradeCount: metrics.tradeCount,
        netProfitUsd: metrics.netProfitUsd,
        firstTicket: verifiedPositions[0].ticket,
        lastTicket: verifiedPositions[verifiedPositions.length - 1].ticket,
      });
      const proofHash = crypto.createHash('sha256').update(proofPayload).digest('hex');

      const rawBp = body.blueprint || {};
      const blueprint: DeskSetupBlueprint = {
        directionMode:
          rawBp.directionMode === 'BUY' || rawBp.directionMode === 'SELL' ? rawBp.directionMode : 'BOTH',
        primarySymbol: String(rawBp.primarySymbol || metrics.symbols[0] || 'XAUUSD').toUpperCase(),
        timeframe: String(rawBp.timeframe || 'H1 / M5').slice(0, 24),
        sessionFocus:
          rawBp.sessionFocus === 'ASIA' ||
          rawBp.sessionFocus === 'LONDON' ||
          rawBp.sessionFocus === 'NY'
            ? rawBp.sessionFocus
            : 'ALL',
        riskUsd: Math.max(5, Math.min(5000, Number(rawBp.riskUsd) || 120)),
        slPoints: Math.max(50, Math.min(20000, Number(rawBp.slPoints) || 1000)),
        tp1Points: Math.max(50, Math.min(20000, Number(rawBp.tp1Points) || 400)),
        tp2Points: Math.max(50, Math.min(40000, Number(rawBp.tp2Points) || 800)),
        tp3Points: Math.max(50, Math.min(60000, Number(rawBp.tp3Points) || 1200)),
        checklistNotes: Array.isArray(rawBp.checklistNotes)
          ? rawBp.checklistNotes.map((s) => String(s).trim()).filter(Boolean).slice(0, 12)
          : ['H1 Structure Confirmed', 'M5 Pullback Confirmation', '12-Gate Fail-Closed'],
        executionPlaybook: String(rawBp.executionPlaybook || summary || '').slice(0, 1200),
      };

      const priceUsd = Math.max(0, Math.min(999, +(Number(body.priceUsd) || 0).toFixed(2)));
      const id = `MKT-${Date.now().toString(36).toUpperCase()}-${proofHash.slice(0, 6).toUpperCase()}`;

      const listing: MarketplaceDeskSetup = {
        id,
        title,
        summary: summary || blueprint.executionPlaybook || `${blueprint.primarySymbol} MT5 Verified Setup`,
        priceUsd,
        sellerUid: caller.uid,
        sellerName: String(body.sellerName || caller.email.split('@')[0] || 'Verified Trader').slice(0, 48),
        verificationChannel,
        brokerName,
        brokerServer: brokerServer || brokerName,
        maskedLogin: maskMt5Login(rawLogin),
        proofHash,
        verifiedAt,
        createdAt: verifiedAt,
        buyerCount: 0,
        metrics,
        blueprint,
      };

      saveMarketplaceSetup(listing);

      if (DEFAULT_SOVEREIGN_MT5_BASE_URL) {
        await fetch(`${DEFAULT_SOVEREIGN_MT5_BASE_URL}/marketplace/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listing }),
          signal: AbortSignal.timeout(4000),
        }).catch(() => null);
      }

      res.json({ ok: true, listing });
    } catch (err: unknown) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to publish setup',
      });
    }
  });

  app.post('/api/marketplace/purchase', async (req, res) => {
    try {
      const caller = await verifyFirebaseBearerToken(req.headers.authorization);
      if (!caller) {
        res.status(401).json({
          ok: false,
          error: 'กรุณาเข้าสู่ระบบบัญชี Google ก่อนปลดล็อก/ซื้อ Setup',
        });
        return;
      }
      const setupId = String(req.body?.setupId || '').trim();
      if (!setupId) {
        res.status(400).json({ ok: false, error: 'Missing setupId' });
        return;
      }

      loadMarketplaceStore();
      const target = marketplaceMemoryStore.get(setupId);
      if (target) {
        target.buyerCount = (target.buyerCount || 0) + 1;
        saveMarketplaceSetup(target);
      }

      if (DEFAULT_SOVEREIGN_MT5_BASE_URL) {
        await fetch(`${DEFAULT_SOVEREIGN_MT5_BASE_URL}/marketplace/purchase`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ setupId, buyerUid: caller.uid }),
          signal: AbortSignal.timeout(3500),
        }).catch(() => null);
      }

      res.json({
        ok: true,
        setupId,
        purchasedAt: new Date().toISOString(),
        buyerCount: target?.buyerCount ?? 1,
      });
    } catch (err: unknown) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Purchase failed',
      });
    }
  });

  app.delete('/api/marketplace/listings/:id', async (req, res) => {
    try {
      const caller = await verifyFirebaseBearerToken(req.headers.authorization);
      if (!caller) {
        res.status(401).json({ ok: false, error: 'Authentication required' });
        return;
      }
      const id = String(req.params.id || '').trim();
      loadMarketplaceStore();
      const target = marketplaceMemoryStore.get(id);
      if (target && target.sellerUid !== caller.uid) {
        res.status(403).json({ ok: false, error: 'คุณไม่มีสิทธิ์ลบ Setup ของผู้ขายรายอื่น' });
        return;
      }
      removeMarketplaceSetup(id);
      if (DEFAULT_SOVEREIGN_MT5_BASE_URL) {
        await fetch(`${DEFAULT_SOVEREIGN_MT5_BASE_URL}/marketplace/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
          signal: AbortSignal.timeout(3000),
        }).catch(() => null);
      }
      res.json({ ok: true, id });
    } catch (err: unknown) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Delete failed',
      });
    }
  });

  type OutgoingPart =
    | { text: string }
    | { inlineData: { mimeType: string; data: string } };

  const ALLOWED_VOICE_NAMES = new Set([
    'Aoede',
    'Kore',
    'Puck',
    'Charon',
    'Fenrir',
    'Leda',
    'Orus',
    'Zephyr',
  ]);

  function sanitizeVoiceName(raw: unknown): string {
    const clean = typeof raw === 'string' ? raw.trim() : '';
    return ALLOWED_VOICE_NAMES.has(clean) ? clean : 'Aoede';
  }

  function extractGroundingSources(response: GenerateContentResponse | undefined): Array<{ title: string; uri: string }> {
    const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (!Array.isArray(chunks)) return [];
    const seen = new Set<string>();
    const out: Array<{ title: string; uri: string }> = [];
    for (const chunk of chunks) {
      const web = chunk?.web;
      const uri = typeof web?.uri === 'string' ? web.uri.trim() : '';
      if (!/^https?:\/\//i.test(uri) || seen.has(uri)) continue;
      seen.add(uri);
      out.push({
        title: (typeof web?.title === 'string' && web.title.trim()) ? web.title.trim().slice(0, 120) : uri,
        uri,
      });
      if (out.length >= 6) break;
    }
    return out;
  }

  app.post('/api/chat', async (req, res) => {
    let isSseStarted = false;
    try {
      const caller = await verifyFirebaseBearerToken(req.headers.authorization);
      if (!caller) {
        res.status(401).json({
          error:
            'กรุณาเข้าสู่ระบบบัญชี Google เพื่อใช้งาน Cloud AI Coach (หรือกดปุ่ม "สรุปแผน GHR ทันที" เพื่อวิเคราะห์จากข้อมูลในเครื่องฟรี)',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      const rate = await checkDistributedRateLimit(`chat:${caller.uid}`, 35);
      if (!rate.allowed) {
        res.status(429).json({
          error: `ใช้งาน AI โค้ชครบโควตาชั่วคราว (35 ครั้ง / 15 นาที) กรุณารอ ${rate.retryAfterSec} วินาที หรือใช้ปุ่มสรุปแผนจากเครื่อง`,
          code: 'RATE_LIMITED',
        });
        return;
      }

      const {
        message,
        history,
        model,
        deskContext,
        liveChartContext,
        chartImageBase64,
        chartImageMimeType,
        attachments,
        enableWebSearch,
        stream,
      } = req.body || {};

      if (!message || typeof message !== 'string' || !message.trim()) {
        res.status(400).json({ error: 'กรุณาพิมพ์ข้อความที่ต้องการถามโค้ชเทรด' });
        return;
      }
      if (message.length > 4000) {
        res.status(400).json({ error: 'ข้อความยาวเกิน 4,000 ตัวอักษร กรุณาย่อคำถามให้กระชับขึ้น' });
        return;
      }

      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({
          error:
            'ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์ กรุณาตรวจสอบในแผง Settings > Secrets หรือใช้ปุ่มวิเคราะห์แผนจากข้อมูลในเครื่อง',
          code: 'MISSING_API_KEY',
        });
        return;
      }

      const safeContext = typeof deskContext === 'string' ? deskContext.slice(0, 6000) : '';
      const safeChartContext = typeof liveChartContext === 'string' ? liveChartContext.slice(0, 4000) : '';

      const binaryParts: Array<{ mimeType: string; data: string }> = [];
      const decodedTextSnippets: string[] = [];
      let hasPdfAttachment = false;
      let hasVisualAttachment = false;

      if (Array.isArray(attachments)) {
        for (const item of attachments.slice(0, 3)) {
          if (!item || typeof item !== 'object') continue;
          const mime = String((item as Record<string, unknown>).mimeType || '').toLowerCase().trim();
          const name = String((item as Record<string, unknown>).name || 'attachment').slice(0, 80);
          const rawB64 = String((item as Record<string, unknown>).base64 || '');
          const cleanB64 = rawB64.replace(/^data:[^;]+;base64,/, '');
          if (!cleanB64 || cleanB64.length > 3_500_000) continue;

          if (/^image\/(png|jpeg|jpg|webp)$/.test(mime)) {
            hasVisualAttachment = true;
            binaryParts.push({ mimeType: mime === 'image/jpg' ? 'image/jpeg' : mime, data: cleanB64 });
          } else if (mime === 'application/pdf') {
            hasPdfAttachment = true;
            binaryParts.push({ mimeType: 'application/pdf', data: cleanB64 });
          } else if (/^text\/(plain|csv|markdown|json)$|^application\/json$/.test(mime)) {
            const decoded = Buffer.from(cleanB64, 'base64').toString('utf8').slice(0, 6000);
            if (decoded.trim()) {
              decodedTextSnippets.push(`=== ไฟล์แนบ: ${name} (${mime}) ===\n${decoded}`);
            }
          }
        }
      }

      const hasValidChartImage =
        typeof chartImageBase64 === 'string' &&
        chartImageBase64.length > 50 &&
        chartImageBase64.length <= 3_500_000 &&
        /^image\/(png|jpeg|jpg|webp)$/i.test(String(chartImageMimeType || ''));
      if (hasValidChartImage && binaryParts.length < 3) {
        hasVisualAttachment = true;
        const cleanBase64 = String(chartImageBase64).replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
        const normalizedMime = String(chartImageMimeType).toLowerCase() === 'image/jpg' ? 'image/jpeg' : String(chartImageMimeType).toLowerCase();
        binaryParts.push({ mimeType: normalizedMime, data: cleanBase64 });
      }

      const attachedDocsText = decodedTextSnippets.join('\n\n').slice(0, 16000);

      let baseSystemInstruction = safeContext
        ? `${BASE_GHR_SYSTEM_INSTRUCTION}\n\n=== ข้อมูลพอร์ตและโต๊ะเทรดปัจจุบันของผู้ใช้ (Real-Time Desk Context) ===\n${safeContext}`
        : BASE_GHR_SYSTEM_INSTRUCTION;

      if (safeChartContext || hasVisualAttachment || hasPdfAttachment) {
        baseSystemInstruction += `\n\n=== โหมดวิเคราะห์กราฟสดและเอกสารแนบ (Live Market Chart & Document Analysis) ===\nวิเคราะห์โครงสร้างราคา (Market Structure, Trend vs EMA20/50, Momentum RSI, ความผันผวน ATR เทียบกับ SL -1,000 จุดของ GHR, แนวรับ/แนวต้านหลัก และเกณฑ์เช็กลิสต์ 12-Gate) หรือสรุปข้อมูลจากภาพ/PDF/ไฟล์แนบอย่างเป็นกลาง ห้ามฟันธงให้เข้าซื้อ/ขายหรือการันตีกำไร${
          safeChartContext ? `\n\n${safeChartContext}` : ''
        }`;
      }

      const routePlan = await planModelRoute({
        prompt: message.trim(),
        hasRichContext: Boolean(safeContext || safeChartContext || attachedDocsText),
        hasVisualOrPdf: hasVisualAttachment || hasPdfAttachment,
        hasPdfAttachment,
        forceWebSearch: Boolean(enableWebSearch),
        preference: model,
        decisionClient: createDecisionGenAIClient(),
      });

      const formattedHistory = Array.isArray(history)
        ? history
            .filter(
              (item) =>
                item &&
                (item.role === 'user' || item.role === 'model') &&
                typeof item.text === 'string' &&
                item.text.trim() !== ''
            )
            .slice(-20)
            .map((item) => ({
              role: item.role as 'user' | 'model',
              parts: [{ text: item.text.slice(0, 4000) }],
            }))
        : [];

      const userPromptText = attachedDocsText
        ? `${attachedDocsText}\n\nคำถามของผู้ใช้:\n${message.trim()}`
        : message.trim();

      const buildContentsForModel = (candidateModel: (typeof routePlan.candidateModels)[number], suffix: string) => {
        const allowPdf = modelSupportsPdf(candidateModel);
        const filteredBinary = binaryParts.filter((b) => allowPdf || b.mimeType !== 'application/pdf');
        const userParts: OutgoingPart[] = [{ text: userPromptText }];
        for (const bin of filteredBinary) {
          userParts.push({ inlineData: { mimeType: bin.mimeType, data: bin.data } });
        }

        const fullSys = `${baseSystemInstruction}${suffix}`;
        if (isOpenWeightGemmaModel(candidateModel)) {
          return {
            systemInstruction: undefined as string | undefined,
            contents: [
              {
                role: 'user' as const,
                parts: [{ text: `[System Directives — Strictly Follow]\n${fullSys}` }],
              },
              {
                role: 'model' as const,
                parts: [{ text: 'รับทราบกฎระบบ GHR v3.2 และ Safe Harbor เรียบร้อย พร้อมช่วยวิเคราะห์ข้อมูลพอร์ตครับ' }],
              },
              ...formattedHistory,
              { role: 'user' as const, parts: userParts },
            ],
          };
        }
        return {
          systemInstruction: fullSys,
          contents: [
            ...formattedHistory,
            { role: 'user' as const, parts: userParts },
          ],
        };
      };

      const ai = getGenAIClient();
      const useWebSearch = Boolean(enableWebSearch || routePlan.needsWebSearch);

      if (stream === true) {
        isSseStarted = true;
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();

        const emitSse = (event: string, data: unknown) => {
          if (res.writableEnded) return;
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };

        const suffix = routePlan.asksForTradeSignal ? SAFE_HARBOR_REMINDER : '';
        let completed = false;
        let lastErr: unknown;

        for (let i = 0; i < routePlan.candidateModels.length; i++) {
          const candidateModel = routePlan.candidateModels[i];
          const shouldSearch = useWebSearch && modelSupportsGoogleSearch(candidateModel);
          const { systemInstruction, contents } = buildContentsForModel(candidateModel, suffix);
          let accumulated = '';
          const collectedSources: Array<{ title: string; uri: string }> = [];
          const seenUris = new Set<string>();
          let routeEmitted = false;

          try {
            const responseStream = await ai.models.generateContentStream({
              model: candidateModel,
              contents,
              config: {
                ...(systemInstruction ? { systemInstruction } : {}),
                ...(shouldSearch ? { tools: [{ googleSearch: {} }] } : {}),
              },
            });

            for await (const chunk of responseStream) {
              const deltaText = chunk.text || '';
              if (deltaText && !routeEmitted) {
                routeEmitted = true;
                emitSse('route', {
                  model: candidateModel,
                  failoverUsed: i > 0,
                  webSearchUsed: shouldSearch,
                  router: {
                    decisionModel: routePlan.decisionModel,
                    routedBy: routePlan.routedBy,
                    routeTier: routePlan.routeTier,
                    confidence: routePlan.decisionConfidence,
                    safeHarborTriggered: routePlan.asksForTradeSignal,
                    needsWebSearch: useWebSearch,
                  },
                });
              }
              if (deltaText) {
                accumulated += deltaText;
                emitSse('delta', { text: deltaText });
              }
              for (const src of extractGroundingSources(chunk)) {
                if (!seenUris.has(src.uri)) {
                  seenUris.add(src.uri);
                  collectedSources.push(src);
                }
              }
            }

            if (!routeEmitted) {
              emitSse('route', {
                model: candidateModel,
                failoverUsed: i > 0,
                webSearchUsed: shouldSearch,
                router: {
                  decisionModel: routePlan.decisionModel,
                  routedBy: routePlan.routedBy,
                  routeTier: routePlan.routeTier,
                  confidence: routePlan.decisionConfidence,
                  safeHarborTriggered: routePlan.asksForTradeSignal,
                  needsWebSearch: useWebSearch,
                },
              });
            }

            const finalReply =
              accumulated.trim().length > 0
                ? accumulated
                : 'ไม่สามารถสร้างคำตอบได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง';
            if (collectedSources.length > 0) {
              emitSse('sources', { sources: collectedSources });
            }
            emitSse('done', {
              reply: finalReply,
              model: candidateModel,
              failoverUsed: i > 0,
              sources: collectedSources,
              router: {
                decisionModel: routePlan.decisionModel,
                routedBy: routePlan.routedBy,
                routeTier: routePlan.routeTier,
                confidence: routePlan.decisionConfidence,
                safeHarborTriggered: routePlan.asksForTradeSignal,
                needsWebSearch: useWebSearch,
              },
              timestamp: new Date().toISOString(),
            });
            completed = true;
            break;
          } catch (err) {
            lastErr = err;
            const canRetry =
              accumulated.length === 0 &&
              i < routePlan.candidateModels.length - 1 &&
              isRetryableQuotaOrTransientError(err);
            if (!canRetry) {
              throw err;
            }
          }
        }

        if (!completed && lastErr) {
          throw lastErr;
        }
        res.end();
        return;
      }

      let finalSources: Array<{ title: string; uri: string }> = [];
      const orchestrated = await executeWithModelFailover(routePlan, async (candidateModel, suffix) => {
        const shouldSearch = useWebSearch && modelSupportsGoogleSearch(candidateModel);
        const { systemInstruction, contents } = buildContentsForModel(candidateModel, suffix);
        const response: GenerateContentResponse = await ai.models.generateContent({
          model: candidateModel,
          contents,
          config: {
            ...(systemInstruction ? { systemInstruction } : {}),
            ...(shouldSearch ? { tools: [{ googleSearch: {} }] } : {}),
          },
        });
        finalSources = extractGroundingSources(response);
        return response.text ?? 'ไม่สามารถสร้างคำตอบได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง';
      });

      res.json({
        reply: orchestrated.reply,
        model: orchestrated.model,
        failoverUsed: orchestrated.failoverUsed,
        sources: finalSources,
        router: {
          decisionModel: orchestrated.route.decisionModel,
          routedBy: orchestrated.route.routedBy,
          routeTier: orchestrated.route.routeTier,
          confidence: orchestrated.route.decisionConfidence,
          safeHarborTriggered: orchestrated.route.asksForTradeSignal,
          needsWebSearch: useWebSearch,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const rawMessage = err instanceof Error ? err.message : String(err);
      let code = 'gemini_request_failed';
      let errorMsg = 'เกิดข้อผิดพลาดในการเชื่อมต่อ Gemini API กรุณาลองใหม่อีกครั้ง';
      if (/PERMISSION_DENIED|API_KEY_INVALID|\b(?:403|401)\b/i.test(rawMessage)) {
        code = 'gemini_permission_denied';
        errorMsg = 'ไม่สามารถยืนยันสิทธิ์ API Key ได้ กรุณาตรวจสอบการตั้งค่าคีย์ในแผง Settings > Secrets';
      } else if (/RESOURCE_EXHAUSTED|\b429\b/i.test(rawMessage)) {
        code = 'gemini_quota_exhausted';
        errorMsg = 'โควต้าการใช้งาน Gemini API เต็มชั่วคราว (429) กรุณารอสักครู่หรือตรวจสอบคีย์ใน Settings > Secrets';
      }
      if (isSseStarted && res.headersSent) {
        if (!res.writableEnded) {
          res.write(`event: error\ndata: ${JSON.stringify({ code, error: errorMsg })}\n\n`);
          res.end();
        }
        return;
      }
      res.status(500).json({ code, error: errorMsg });
    }
  });

  app.post('/api/ai/transcribe', async (req, res) => {
    try {
      const caller = await verifyFirebaseBearerToken(req.headers.authorization);
      if (!caller) {
        res.status(401).json({ error: 'กรุณาเข้าสู่ระบบบัญชี Google เพื่อใช้โหมดถอดเสียง Cloud AI', code: 'AUTH_REQUIRED' });
        return;
      }
      const rate = await checkDistributedRateLimit(`voice:${caller.uid}`, 50);
      if (!rate.allowed) {
        res.status(429).json({
          error: `ใช้โหมดเสียงเกินโควต้าชั่วคราว กรุณารอ ${rate.retryAfterSec} วินาที`,
          code: 'RATE_LIMITED',
        });
        return;
      }
      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({ error: 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์', code: 'MISSING_API_KEY' });
        return;
      }

      const { audioBase64, mimeType } = req.body || {};
      const cleanBase64 = typeof audioBase64 === 'string'
        ? audioBase64.replace(/^data:[^;]+;base64,/, '').trim()
        : '';
      if (!cleanBase64 || cleanBase64.length > 4_500_000) {
        res.status(400).json({ error: 'ไฟล์เสียงไม่ถูกต้องหรือมีขนาดใหญ่เกินกำหนด' });
        return;
      }
      const normalizedMime = String(mimeType || 'audio/wav').toLowerCase().split(';')[0].trim();
      const interactionMimeMap: Record<string, 'audio/wav' | 'audio/mp3' | 'audio/aiff' | 'audio/aac' | 'audio/ogg' | 'audio/flac'> = {
        'audio/wav': 'audio/wav',
        'audio/x-wav': 'audio/wav',
        'audio/mp3': 'audio/mp3',
        'audio/mpeg': 'audio/mp3',
        'audio/aiff': 'audio/aiff',
        'audio/aac': 'audio/aac',
        'audio/ogg': 'audio/ogg',
        'audio/flac': 'audio/flac',
      };
      const interactionMime = interactionMimeMap[normalizedMime];
      const ai = getGenAIClient();

      if (interactionMime) {
        try {
          const interaction = await ai.interactions.create({
            model: GEMINI_35_TRANSCRIBE,
            store: false,
            input: [
              {
                type: 'audio',
                data: cleanBase64,
                mime_type: interactionMime,
              },
            ],
            generation_config: {
              transcription_config: {
                language_codes: ['th-TH', 'en-US'],
                custom_vocabulary: [
                  'TallyNX',
                  'XAUUSD',
                  'GHR',
                  'Trailing Lock',
                  'Consistency',
                  'Drawdown',
                  'MT5',
                  '12-Gate',
                  'FundedNext',
                  'FTMO',
                  'The5ers',
                ],
              },
            },
          });
          const transcript = (interaction.output_text || '').trim();
          if (transcript) {
            res.json({ text: transcript, model: GEMINI_35_TRANSCRIBE, failoverUsed: false });
            return;
          }
        } catch (err) {
          if (!isRetryableQuotaOrTransientError(err)) {
            throw err;
          }
        }
      }

      const fallbackCandidates = [GEMINI_FLASH_LITE_35, GEMINI_4_HYDROGEN, GEMINI_FLASH_LITE_31];
      let lastErr: unknown;
      for (const fallbackModel of fallbackCandidates) {
        try {
          const resp = await ai.models.generateContent({
            model: fallbackModel,
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: 'ถอดเสียงพูดภาษาไทย/อังกฤษจากไฟล์เสียงนี้เป็นข้อความที่ถูกต้อง กระชับ โดยส่งกลับเฉพาะข้อความที่ผู้พูดพูดเท่านั้น ห้ามแต่งเติม:',
                  },
                  {
                    inlineData: {
                      mimeType: normalizedMime || 'audio/wav',
                      data: cleanBase64,
                    },
                  },
                ],
              },
            ],
          });
          const text = (resp.text || '').trim();
          res.json({ text, model: fallbackModel, failoverUsed: true });
          return;
        } catch (err) {
          lastErr = err;
          if (!isRetryableQuotaOrTransientError(err)) throw err;
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error('Transcription failed');
    } catch (err: unknown) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'ไม่สามารถถอดเสียงได้ในขณะนี้',
        code: 'TRANSCRIBE_FAILED',
      });
    }
  });

  app.post('/api/ai/tts', async (req, res) => {
    try {
      const caller = await verifyFirebaseBearerToken(req.headers.authorization);
      if (!caller) {
        res.status(401).json({ error: 'กรุณาเข้าสู่ระบบบัญชี Google', code: 'AUTH_REQUIRED' });
        return;
      }
      const rate = await checkDistributedRateLimit(`voice:${caller.uid}`, 50);
      if (!rate.allowed) {
        res.json({ ok: true, fallbackClientTts: true, reason: 'rate_limited' });
        return;
      }
      if (!process.env.GEMINI_API_KEY) {
        res.json({ ok: true, fallbackClientTts: true, reason: 'missing_key' });
        return;
      }

      const { text, voice } = req.body || {};
      const cleanText = stripMarkdownForSpeech(typeof text === 'string' ? text : '').slice(0, 1800);
      if (!cleanText) {
        res.status(400).json({ error: 'ไม่มีข้อความสำหรับสังเคราะห์เสียง' });
        return;
      }

      const safeVoice = sanitizeVoiceName(voice);
      const ai = getGenAIClient();
      const ttsModels = [GEMINI_38_FLASH_LITE_TTS, GEMINI_38_FLASH_TTS];

      for (let i = 0; i < ttsModels.length; i++) {
        const ttsModel = ttsModels[i];
        try {
          const interaction = await ai.interactions.create({
            model: ttsModel,
            store: false,
            input: cleanText,
            response_modalities: ['audio'],
            generation_config: {
              speech_config: [{ voice: safeVoice, language: 'th' }],
            },
          });
          const audioData = interaction.output_audio?.data;
          const audioMime = interaction.output_audio?.mime_type || 'audio/wav';
          if (audioData) {
            res.json({
              ok: true,
              audioBase64: audioData,
              mimeType: audioMime,
              model: ttsModel,
              failoverUsed: i > 0,
            });
            return;
          }
        } catch (err) {
          if (!isRetryableQuotaOrTransientError(err)) {
            res.json({ ok: true, fallbackClientTts: true });
            return;
          }
        }
      }

      res.json({ ok: true, fallbackClientTts: true });
    } catch {
      res.json({ ok: true, fallbackClientTts: true });
    }
  });

  app.post('/api/ai/live-token', async (req, res) => {
    try {
      const caller = await verifyFirebaseBearerToken(req.headers.authorization);
      if (!caller) {
        res.status(401).json({
          error: 'กรุณาเข้าสู่ระบบบัญชี Google และเปิดสิทธิ์ PRO เพื่อใช้งาน Live Voice Mode',
          code: 'AUTH_REQUIRED',
        });
        return;
      }
      const rate = await checkDistributedRateLimit(`live:${caller.uid}`, 15);
      if (!rate.allowed) {
        res.status(429).json({
          error: `สร้างเซสชัน Live เกินโควต้าชั่วคราว กรุณารอ ${rate.retryAfterSec} วินาที`,
          code: 'RATE_LIMITED',
        });
        return;
      }
      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({ error: 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์', code: 'MISSING_API_KEY' });
        return;
      }

      const { mode, voice, deskContext, liveChartContext } = req.body || {};
      const liveMode = mode === 'thinking' ? 'thinking' : 'standard';
      const targetModel = liveMode === 'thinking' ? GEMINI_38_LIVE_THINKING : GEMINI_38_LIVE;
      const safeVoice = sanitizeVoiceName(voice);

      const safeDesk = typeof deskContext === 'string' ? deskContext.slice(0, 3500) : '';
      const safeChart = typeof liveChartContext === 'string' ? liveChartContext.slice(0, 2000) : '';
      const liveInstruction = `${BASE_GHR_SYSTEM_INSTRUCTION}

=== Live Voice Desk Protocol ===
- ตอบกลับเป็นคำพูดที่กระชับ เป็นธรรมชาติ อ่าน/ฟังเข้าใจง่าย ไม่ต้องอ่านเครื่องหมาย Markdown
- ใช้ตัวเลขจากพอร์ตและกราฟสดล่าสุดเสมอ พร้อมย้ำ Safe Harbor (ไม่ให้สัญญาณซื้อขาย)
${safeDesk ? `\n=== Real-Time Desk Context ===\n${safeDesk}` : ''}
${safeChart ? `\n=== Live Chart Context ===\n${safeChart}` : ''}`;

      const now = Date.now();
      const expireTime = new Date(now + 30 * 60 * 1000).toISOString();
      const newSessionExpireTime = new Date(now + 90 * 1000).toISOString();
      const tokenClient = getLiveTokenGenAIClient();

      const candidateLiveModels =
        liveMode === 'thinking' ? [GEMINI_38_LIVE_THINKING, GEMINI_38_LIVE] : [GEMINI_38_LIVE];

      let lastErr: unknown;
      for (const candidateModel of candidateLiveModels) {
        try {
          const authToken = await tokenClient.authTokens.create({
            config: {
              uses: 1,
              expireTime,
              newSessionExpireTime,
              liveConnectConstraints: {
                model: candidateModel,
                config: {
                  responseModalities: [Modality.AUDIO],
                  systemInstruction: { parts: [{ text: liveInstruction }] },
                  speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: safeVoice } },
                  },
                  inputAudioTranscription: {},
                  outputAudioTranscription: {},
                  contextWindowCompression: { slidingWindow: {} },
                  sessionResumption: {},
                  ...(candidateModel === GEMINI_38_LIVE_THINKING
                    ? { thinkingConfig: { thinkingLevel: 'low' as unknown as never } }
                    : {}),
                },
              },
            },
          });
          if (authToken?.name) {
            res.json({
              ok: true,
              token: authToken.name,
              model: candidateModel,
              requestedModel: targetModel,
              apiVersion: 'v1alpha',
              expiresAt: expireTime,
              newSessionExpiresAt: newSessionExpireTime,
              voice: safeVoice,
              lockedConstraints: true,
            });
            return;
          }
        } catch (err) {
          lastErr = err;
          // Retry with minimal locked constraints if optional live constraint fails validation
          try {
            const minimalToken = await tokenClient.authTokens.create({
              config: {
                uses: 1,
                expireTime,
                newSessionExpireTime,
                liveConnectConstraints: {
                  model: candidateModel,
                  config: {
                    responseModalities: [Modality.AUDIO],
                    systemInstruction: { parts: [{ text: liveInstruction }] },
                  },
                },
              },
            });
            if (minimalToken?.name) {
              res.json({
                ok: true,
                token: minimalToken.name,
                model: candidateModel,
                requestedModel: targetModel,
                apiVersion: 'v1alpha',
                expiresAt: expireTime,
                newSessionExpiresAt: newSessionExpireTime,
                voice: safeVoice,
                lockedConstraints: true,
              });
              return;
            }
          } catch (innerErr) {
            lastErr = innerErr;
          }
        }
      }

      throw lastErr instanceof Error ? lastErr : new Error('Failed to mint ephemeral Live token');
    } catch (err: unknown) {
      res.status(500).json({
        error:
          err instanceof Error
            ? `ไม่สามารถสร้าง Ephemeral Token สำหรับ Live Mode: ${err.message}`
            : 'ไม่สามารถเชื่อมต่อ Live Mode ได้ในขณะนี้',
        code: 'LIVE_TOKEN_FAILED',
      });
    }
  });

  // Cross-Subdomain SSO Handoff & Exchange
  const configuredSsoSecret = process.env.TALLYNX_SSO_SECRET || process.env.SSO_SHARED_SECRET;
  const ssoHmacKey =
    configuredSsoSecret && configuredSsoSecret.trim().length >= 16
      ? configuredSsoSecret.trim()
      : crypto
          .createHash('sha256')
          .update('tallynx-cross-subdomain-sso-v4-shared-hmac')
          .digest('hex');

  const signSsoPayload = (payload: { handle: string; sub: string; exp: number; nonce: string }) => {
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = crypto.createHmac('sha256', ssoHmacKey).update(encoded).digest('base64url');
    return `${encoded}.${sig}`;
  };

  const verifySsoToken = (
    token: string
  ): { handle: string; exp: number; claims: Record<string, unknown> } | null => {
    const parts = String(token || '').trim().split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', ssoHmacKey).update(encoded).digest('base64url');
    const sigBuf = Buffer.from(sig, 'utf8');
    const expBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    try {
      const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<
        string,
        unknown
      >;
      const rawExp = Number(parsed.exp);
      if (!Number.isFinite(rawExp)) return null;
      if ('aud' in parsed && parsed.aud !== 'mall.tallynx.com' && parsed.aud !== 'desk.tallynx.com') return null;
      const expMs = rawExp < 1e11 ? rawExp * 1000 : rawExp;
      if (Date.now() > expMs) return null;
      const rawHandle = String(parsed.handle || parsed.sub || '@trader_you').trim();
      return {
        handle: rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`,
        exp: expMs,
        claims: parsed,
      };
    } catch {
      return null;
    }
  };

  app.post('/api/auth/sso-handoff', (req, res) => {
    const rawHandle = typeof req.body?.handle === 'string' ? req.body.handle.trim() : '@alex_quant';
    const handle = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`;
    const expSec = Math.floor(Date.now() / 1000) + 300;
    const ssoToken = signSsoPayload({
      handle,
      sub: handle.replace(/^@/, ''),
      exp: expSec,
      nonce: crypto.randomUUID(),
    });
    res.json({ ok: true, token: ssoToken, ssoToken, handle, expiresInSec: 300 });
  });

  const handleDeskSsoExchange = (req: express.Request, res: express.Response) => {
    const token =
      (typeof req.query.token === 'string' && req.query.token.trim()) ||
      (typeof req.query.ssoToken === 'string' && req.query.ssoToken.trim()) ||
      (typeof req.body?.ssoToken === 'string' && req.body.ssoToken.trim()) ||
      (typeof req.body?.token === 'string' && req.body.token.trim()) ||
      '';
    const verified = verifySsoToken(token);
    if (!verified) {
      res.status(401).json({ ok: false, valid: false, error: 'Invalid or expired TallyNX SSO token' });
      return;
    }
    res.json({
      ok: true,
      valid: true,
      handle: verified.handle,
      expiresAt: verified.exp,
      claims: verified.claims,
    });
  };

  app.get('/api/auth/sso-exchange', handleDeskSsoExchange);
  app.post('/api/auth/sso-exchange', handleDeskSsoExchange);

  app.use('/api', createMallRouter({
    telemetryBus,
    legacyBaseUrl: DEFAULT_SOVEREIGN_MT5_BASE_URL,
    listings: getMarketplaceListings,
    localListings: loadMarketplaceStore,
    verifyUser: verifyFirebaseBearerToken,
    connectedSnapshot: async (uid, channel, accountId) => connectedMallSnapshots.get(mallSourceKey(uid, channel, accountId)),
    bridgeSnapshot: (bridgeKey) => {
      if (!bridgeKey || !isValidTredynApiKey(bridgeKey)) return undefined;
      const feed = getLiveBridgeFeed(bridgeKey);
      const trade = feed?.positions.reduce<(typeof feed.positions)[number] | undefined>((latest, position) =>
        position.closeTs > 0 && (!latest || position.closeTs > latest.closeTs) ? position : latest, undefined);
      if (!feed || !trade || !Number.isFinite(trade.closeTs) || trade.closeTs > Date.now()) return undefined;
      return {
        reference: hashTredynApiKey(bridgeKey) + ':' + trade.ticket,
        symbol: trade.symbol,
        capturedAt: new Date(trade.closeTs).toISOString(),
        pnl: trade.netProfit,
        movement: { open: trade.openPrice, close: trade.closePrice },
        verifiedBadge: { channel: 'LIVE_BRIDGE', brokerName: feed.meta.broker.slice(0, 80), verifiedAt: feed.syncedAt },
      };
    },
  }));

  // Live Telemetry SSE stream (Real-Time Bridge Push + Room Updates + Heartbeat)
  app.get('/api/telemetry/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const sendEvent = (eventName: string, data: unknown) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ event: eventName, payload: data, ts: new Date().toISOString() })}\n\n`);
      }
    };
    sendEvent('account.heartbeat', { stream: 'SSE_LIVE', readOnlyVerified: true });

    const onBridgePush = (data: unknown) => sendEvent('bridge.push', data);
    const onDeskUpdate = (data: unknown) => sendEvent('desk.room', data);
    const onMallChat = (data: unknown) => sendEvent('mall.chat', data);
    const onMallPresence = (data: unknown) => sendEvent('mall.presence', data);
    telemetryBus.on('bridge_push', onBridgePush);
    telemetryBus.on('desk_room_update', onDeskUpdate);
    telemetryBus.on('mall.chat', onMallChat);
    telemetryBus.on('mall.presence', onMallPresence);

    const timer = setInterval(() => {
      sendEvent('account.heartbeat', { stream: 'SSE_LIVE' });
    }, 15000);
    res.on('close', () => {
      clearInterval(timer);
      telemetryBus.off('bridge_push', onBridgePush);
      telemetryBus.off('desk_room_update', onDeskUpdate);
      telemetryBus.off('mall.chat', onMallChat);
      telemetryBus.off('mall.presence', onMallPresence);
    });
  });

  // Real-time Official Prop Firm Rules Probe (Strict Allowlist Only)
  app.get('/api/proprules/live', async (req, res) => {
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const firmId = typeof req.query.firmId === 'string' ? req.query.firmId.trim().toLowerCase() : '';

    const targets = firmId
      ? PROP_FIRM_CATALOG.filter((f) => f.id === firmId)
      : PROP_FIRM_CATALOG;

    if (firmId && targets.length === 0) {
      res.status(404).json({ ok: false, error: 'Unknown prop firm identifier' });
      return;
    }

    const settled = await Promise.allSettled(
      targets.map((firm) => probeSinglePropFirm(firm, forceRefresh))
    );
    const probes: PropFirmLiveProbeResult[] = settled.map((entry, idx) => {
      if (entry.status === 'fulfilled') return entry.value;
      const fallback = targets[idx];
      return {
        id: fallback.id,
        name: fallback.name,
        websiteUrl: fallback.websiteUrl,
        rulesUrl: fallback.rulesUrl,
        probeStatus: 'UNREACHABLE',
        httpStatus: 0,
        latencyMs: 0,
        finalUrl: fallback.rulesUrl,
        pageTitle: null,
        lastModifiedHeader: null,
        checkedAtIso: new Date().toISOString(),
      };
    });

    res.setHeader(
      'Cache-Control',
      forceRefresh ? 'no-store' : 'public, max-age=15, s-maxage=45, stale-while-revalidate=60'
    );
    res.json({
      ok: true,
      checkedAtIso: new Date().toISOString(),
      totalFirms: probes.length,
      probes,
    });
  });

  return app;
}

const app = createApp();
export default app;

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(
      express.static(distPath, {
        etag: true,
        lastModified: true,
        setHeaders(res, filePath) {
          res.setHeader('X-Content-Type-Options', 'nosniff');
          const rel = path.relative(distPath, filePath).replace(/\\/g, '/');
          if (/^assets\/[^/]+\.(?:js|css)$/i.test(rel)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else if (/^assets\/(?:desk|aistudio)\//i.test(rel)) {
            res.setHeader('Cache-Control', 'public, max-age=2592000');
          } else if (/^(?:index\.html|sw\.js|registerSW\.js|manifest\.webmanifest)$/i.test(rel)) {
            res.setHeader('Cache-Control', 'no-cache');
          } else {
            res.setHeader('Cache-Control', 'public, max-age=86400');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TallyNX Mall Server running on http://localhost:${PORT}`);
  });
}

const isDirectServerRun =
  Boolean(process.argv[1]) &&
  /(^|[\\/])server\.(ts|js|mjs|cjs)$/i.test(process.argv[1]);

if (isDirectServerRun && !process.env.VERCEL && !process.env.VERCEL_ENV) {
  startServer();
}
