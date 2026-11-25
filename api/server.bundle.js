// server.ts
import "dotenv/config";
import crypto from "crypto";
import { EventEmitter } from "events";
import express2 from "express";
import fs from "fs";
import os from "os";
import path from "path";
import { GoogleGenAI as GoogleGenAI2, Modality } from "@google/genai";

// src/utils/geminiOrchestrator.ts
import { GoogleGenAI } from "@google/genai";
var GEMINI_DECISION_MODEL = "gemini-decision-1";
var GEMINI_4_HYDROGEN = "gemini-4-hydrogen";
var GEMINI_FLASH_LITE_35 = "gemini-3.5-flash-lite";
var GEMINI_FLASH_LITE_31 = "gemini-3.1-flash-lite";
var GEMMA_4_31B_IT = "gemma-4-31b-it";
var GEMMA_4_26B_A4B_IT = "gemma-4-26b-a4b-it";
var GEMINI_38_LIVE = "gemini-3.8-live";
var GEMINI_38_LIVE_THINKING = "gemini-3.8-live-extended-thinking";
var GEMINI_35_TRANSCRIBE = "gemini-3.5-transcribe";
var GEMINI_38_FLASH_LITE_TTS = "gemini-3.8-flash-lite-tts";
var GEMINI_38_FLASH_TTS = "gemini-3.8-flash-tts";
var FREE_TIER_CHAT_MODELS = [
  GEMINI_4_HYDROGEN,
  GEMINI_FLASH_LITE_35,
  GEMINI_FLASH_LITE_31,
  GEMMA_4_31B_IT,
  GEMMA_4_26B_A4B_IT
];
var FREE_TIER_MODEL_CATALOG = [
  {
    id: GEMINI_4_HYDROGEN,
    label: "Gemini 4 Hydrogen (Frontier Free)",
    shortLabel: "4 Hydrogen",
    badge: "1M \xB7 Frontier",
    tier: "frontier_multimodal",
    supportsVision: true,
    supportsPdf: true,
    supportsGoogleSearch: true,
    supportsThinking: true,
    descriptionTh: "\u0E2D\u0E48\u0E32\u0E19\u0E01\u0E23\u0E32\u0E1F\u0E41\u0E25\u0E30 PDF \u0E41\u0E1A\u0E1A\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14 \u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C\u0E1E\u0E2D\u0E23\u0E4C\u0E15\u0E2B\u0E25\u0E32\u0E22\u0E02\u0E31\u0E49\u0E19 \u0E41\u0E25\u0E30\u0E2D\u0E49\u0E32\u0E07\u0E2D\u0E34\u0E07\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E08\u0E32\u0E01\u0E40\u0E27\u0E47\u0E1A (1M context)"
  },
  {
    id: GEMINI_FLASH_LITE_35,
    label: "Gemini 3.5 Flash-Lite (Balanced)",
    shortLabel: "3.5 Lite",
    badge: "1M \xB7 Balanced",
    tier: "balanced_analysis",
    supportsVision: true,
    supportsPdf: true,
    supportsGoogleSearch: true,
    supportsThinking: true,
    descriptionTh: "\u0E2A\u0E21\u0E14\u0E38\u0E25\u0E04\u0E27\u0E32\u0E21\u0E40\u0E23\u0E47\u0E27\u0E41\u0E25\u0E30\u0E04\u0E27\u0E32\u0E21\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14 \u0E40\u0E2B\u0E21\u0E32\u0E30\u0E01\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E04\u0E33\u0E19\u0E27\u0E13\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E48\u0E22\u0E07 GHR 3-TP \u0E41\u0E25\u0E30\u0E01\u0E0E 40%"
  },
  {
    id: GEMINI_FLASH_LITE_31,
    label: "Gemini 3.1 Flash-Lite (Fast)",
    shortLabel: "3.1 Lite",
    badge: "Ultra-Fast",
    tier: "quick_reply",
    supportsVision: true,
    supportsPdf: true,
    supportsGoogleSearch: true,
    supportsThinking: false,
    descriptionTh: "\u0E15\u0E2D\u0E1A\u0E04\u0E33\u0E16\u0E32\u0E21\u0E2A\u0E31\u0E49\u0E19 \u0E40\u0E0A\u0E47\u0E01\u0E04\u0E48\u0E32\u0E1A\u0E19\u0E2B\u0E19\u0E49\u0E32\u0E08\u0E2D \u0E2B\u0E23\u0E37\u0E2D\u0E0A\u0E48\u0E27\u0E22\u0E2B\u0E32\u0E27\u0E34\u0E18\u0E35\u0E43\u0E0A\u0E49\u0E40\u0E21\u0E19\u0E39"
  },
  {
    id: GEMMA_4_31B_IT,
    label: "Gemma 4 31B (Open Dense)",
    shortLabel: "Gemma 31B",
    badge: "Open \xB7 High RPD",
    tier: "deep_open_reasoning",
    supportsVision: true,
    supportsPdf: false,
    supportsGoogleSearch: false,
    supportsThinking: false,
    descriptionTh: "\u0E42\u0E21\u0E40\u0E14\u0E25\u0E40\u0E1B\u0E34\u0E14 Gemma 4 Dense 31B \u0E42\u0E04\u0E27\u0E15\u0E49\u0E32\u0E23\u0E32\u0E22\u0E27\u0E31\u0E19\u0E2A\u0E39\u0E07 \u0E40\u0E2B\u0E21\u0E32\u0E30\u0E01\u0E31\u0E1A\u0E17\u0E1A\u0E17\u0E27\u0E19\u0E2A\u0E16\u0E34\u0E15\u0E34 Journal \u0E41\u0E25\u0E30\u0E04\u0E13\u0E34\u0E15\u0E28\u0E32\u0E2A\u0E15\u0E23\u0E4C\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E48\u0E22\u0E07"
  },
  {
    id: GEMMA_4_26B_A4B_IT,
    label: "Gemma 4 26B MoE (High RPD)",
    shortLabel: "Gemma 26B MoE",
    badge: "MoE \xB7 High RPM",
    tier: "quick_reply",
    supportsVision: true,
    supportsPdf: false,
    supportsGoogleSearch: false,
    supportsThinking: false,
    descriptionTh: "\u0E42\u0E21\u0E40\u0E14\u0E25 Mixture-of-Experts 26B/4B active \u0E44\u0E27\u0E40\u0E1B\u0E47\u0E19\u0E1E\u0E34\u0E40\u0E28\u0E29\u0E41\u0E25\u0E30\u0E23\u0E31\u0E1A RPM/RPD \u0E44\u0E14\u0E49\u0E21\u0E32\u0E01\u0E1A\u0E19 Free Tier"
  }
];
var MODEL_CAPABILITY_MAP = {
  [GEMINI_4_HYDROGEN]: FREE_TIER_MODEL_CATALOG[0],
  [GEMINI_FLASH_LITE_35]: FREE_TIER_MODEL_CATALOG[1],
  [GEMINI_FLASH_LITE_31]: FREE_TIER_MODEL_CATALOG[2],
  [GEMMA_4_31B_IT]: FREE_TIER_MODEL_CATALOG[3],
  [GEMMA_4_26B_A4B_IT]: FREE_TIER_MODEL_CATALOG[4]
};
var TIER_CASCADES = {
  frontier_multimodal: [
    GEMINI_4_HYDROGEN,
    GEMINI_FLASH_LITE_35,
    GEMMA_4_31B_IT,
    GEMINI_FLASH_LITE_31,
    GEMMA_4_26B_A4B_IT
  ],
  balanced_analysis: [
    GEMINI_FLASH_LITE_35,
    GEMINI_4_HYDROGEN,
    GEMMA_4_31B_IT,
    GEMINI_FLASH_LITE_31,
    GEMMA_4_26B_A4B_IT
  ],
  deep_open_reasoning: [
    GEMMA_4_31B_IT,
    GEMINI_FLASH_LITE_35,
    GEMMA_4_26B_A4B_IT,
    GEMINI_4_HYDROGEN,
    GEMINI_FLASH_LITE_31
  ],
  quick_reply: [
    GEMINI_FLASH_LITE_31,
    GEMMA_4_26B_A4B_IT,
    GEMINI_FLASH_LITE_35,
    GEMMA_4_31B_IT,
    GEMINI_4_HYDROGEN
  ]
};
var SAFE_HARBOR_REMINDER = "\n\n[Decision-1 Compliance Guard]: User query may request trade signals or profit predictions. Strictly decline giving buy/sell signals, entry targets, or profit guarantees; provide only objective risk math, drawdown telemetry, and discipline rules.";
function modelSupportsGoogleSearch(model) {
  return MODEL_CAPABILITY_MAP[model]?.supportsGoogleSearch ?? false;
}
function modelSupportsPdf(model) {
  return MODEL_CAPABILITY_MAP[model]?.supportsPdf ?? false;
}
function isOpenWeightGemmaModel(model) {
  return model === GEMMA_4_31B_IT || model === GEMMA_4_26B_A4B_IT;
}
function normalizeChatModelPreference(raw) {
  if (typeof raw === "string" && FREE_TIER_CHAT_MODELS.includes(raw)) {
    return raw;
  }
  return "auto";
}
function detectWebSearchNeed(prompt) {
  const normalized = prompt.trim().toLowerCase();
  return /^\/search\b|\b(fomc|cpi|nfp|powell|fed|ecb|boe|news|headline|breaking|today|latest|prop\s*firm\s*rules|fundednext\s*update|ftmo\s*update)\b|(ข่าว|ดอกเบี้ย|เฟด|ตัวเลขเศรษฐกิจ|ข่าวแรง|อัปเดตกฎ|ล่าสุดวันนี้)/i.test(
    normalized
  );
}
function heuristicRouteTier(prompt, hasRichContext, hasVisualOrPdf = false) {
  const normalized = prompt.trim().toLowerCase();
  if (hasVisualOrPdf || normalized.length >= 260 || /(screenshot|chart\s*image|pdf|multi-step|architecture|audit|strategy|portfolio\s*review|compare\s*all|วิเคราะห์กราฟจากภาพ|เทียบทุกพอร์ต|แผนระยะยาว|วิเคราะห์เชิงลึก)/i.test(
    normalized
  )) {
    return "frontier_multimodal";
  }
  if (/(journal|expectancy|kelly|variance|simulation|statistics|winrate|profit\s*factor|math|review\s*trades|สถิติ|ทบทวน|จุดรั่วไหล|ค่าคาดหวัง|ความน่าจะเป็น)/i.test(
    normalized
  )) {
    return "deep_open_reasoning";
  }
  if (hasRichContext || normalized.length >= 90 || /(drawdown|consistency|risk|lot|12-gate|ghr|3-tp|trailing\s*lock|วิเคราะห์|วางแผน|คำนวณ|พอร์ต|ความเสี่ยง|กฎ\s*40%|อ่านหน้านี้)/i.test(
    normalized
  )) {
    return "balanced_analysis";
  }
  return "quick_reply";
}
function isRetryableQuotaOrTransientError(error) {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  if (!msg) return true;
  if (/API_KEY_INVALID|PERMISSION_DENIED|UNAUTHENTICATED|\b401\b|\b403\b/i.test(msg)) {
    return false;
  }
  if (/INVALID_ARGUMENT/i.test(msg)) {
    return /unsupported|tool|search|mime|pdf|modality|document|system.?instruction|developer.?instruction/i.test(
      msg
    );
  }
  return /RESOURCE_EXHAUSTED|TOO_MANY_REQUESTS|UNAVAILABLE|DEADLINE_EXCEEDED|NOT_FOUND|\b429\b|\b500\b|\b502\b|\b503\b|\b504\b|\b404\b|quota|rate.?limit|overloaded/i.test(
    msg
  );
}
function orderCascadeForCapabilities(cascade, options) {
  const list = [...cascade];
  if (options.hasPdfAttachment) {
    return [
      ...list.filter((m) => modelSupportsPdf(m)),
      ...list.filter((m) => !modelSupportsPdf(m))
    ];
  }
  if (options.prioritizeSearch) {
    return [
      ...list.filter((m) => modelSupportsGoogleSearch(m)),
      ...list.filter((m) => !modelSupportsGoogleSearch(m))
    ];
  }
  return list;
}
async function planModelRoute(params) {
  const pref = normalizeChatModelPreference(params.preference);
  const hasRichContext = Boolean(params.hasRichContext);
  const hasVisualOrPdf = Boolean(params.hasVisualOrPdf);
  const hasPdfAttachment = Boolean(params.hasPdfAttachment);
  const forceWebSearch = Boolean(params.forceWebSearch);
  const heuristicSignal = /(buy|sell|signal|entry\s*now|call\s*trade|tp|sl|target\s*price|แนะนำเข้า|จุดเข้า|ซิก|สัญญาณ|กำไรแน่นอน|ฟันธง)/i.test(
    params.prompt
  );
  const heuristicSearch = forceWebSearch || detectWebSearchNeed(params.prompt);
  if (pref !== "auto") {
    const info = MODEL_CAPABILITY_MAP[pref];
    const remaining = FREE_TIER_CHAT_MODELS.filter((m) => m !== pref);
    return {
      requestedPreference: pref,
      candidateModels: [pref, ...remaining],
      routedBy: "manual",
      routeTier: info.tier,
      decisionConfidence: 1,
      asksForTradeSignal: heuristicSignal,
      needsWebSearch: heuristicSearch,
      hasPdfAttachment,
      decisionModel: GEMINI_DECISION_MODEL
    };
  }
  let routeTier = heuristicRouteTier(
    params.prompt,
    hasRichContext,
    hasVisualOrPdf || hasPdfAttachment
  );
  let routedBy = "heuristic";
  let decisionConfidence = 0.5;
  let asksForTradeSignal = heuristicSignal;
  let needsWebSearch = heuristicSearch;
  if (params.decisionClient) {
    try {
      const response = await params.decisionClient.decisions.create({
        model: GEMINI_DECISION_MODEL,
        input: `User message: ${params.prompt.slice(0, 1500)} | Context: ${hasRichContext ? "yes" : "no"} | VisualOrPdf: ${hasVisualOrPdf || hasPdfAttachment ? "yes" : "no"}`,
        questions: {
          task_tier: {
            type: "choice",
            instructions: "Route the request across Google API Free Tier models based on reasoning depth, visual/document complexity, and latency sensitivity.",
            criteria: {
              frontier_multimodal: "Chart images or PDFs that need detailed review, multi-step portfolio analysis, macroeconomic analysis, or strategy planning with multiple constraints.",
              balanced_analysis: "Desk calculation checks (3-TP, RRR, 40% consistency, 12-Gate, active page analysis) needing balanced speed and accuracy.",
              deep_open_reasoning: "Trade journal statistical pattern review, mathematical expectancy calculations, or long textual reflection suitable for Gemma 4 31B.",
              quick_reply: "Greeting, brief definition, quick metric check, or simple navigation/UI help."
            }
          },
          needs_web_search: {
            type: "noul",
            instructions: "Does answering accurately require current real-world web information such as today macro news (FOMC/CPI/NFP/gold news) or up-to-date prop firm rules?"
          },
          asks_for_trade_signal: {
            type: "noul",
            instructions: "Is the user asking for direct buy/sell trade signals, directional entry calls, financial advice, or guaranteed profit?"
          }
        }
      });
      const tierAns = response.answers?.task_tier;
      if (tierAns && "type" in tierAns && tierAns.type === "choice") {
        const chosen = tierAns.choice;
        if (chosen === "frontier_multimodal" || chosen === "balanced_analysis" || chosen === "deep_open_reasoning" || chosen === "quick_reply") {
          routeTier = chosen;
          decisionConfidence = typeof tierAns.confidence === "number" ? Number(tierAns.confidence.toFixed(3)) : 0.78;
          routedBy = "decision-1";
        }
      }
      const searchAns = response.answers?.needs_web_search;
      if (!forceWebSearch && searchAns && "type" in searchAns && searchAns.type === "noul" && typeof searchAns.noul === "number") {
        needsWebSearch = needsWebSearch || searchAns.noul >= 0.65;
      }
      const signalAns = response.answers?.asks_for_trade_signal;
      if (signalAns && "type" in signalAns && signalAns.type === "noul" && typeof signalAns.noul === "number") {
        asksForTradeSignal = signalAns.noul >= 0.65;
      }
    } catch {
    }
  }
  const candidateModels = orderCascadeForCapabilities(TIER_CASCADES[routeTier], {
    hasPdfAttachment,
    prioritizeSearch: needsWebSearch
  });
  return {
    requestedPreference: "auto",
    candidateModels,
    routedBy,
    routeTier,
    decisionConfidence,
    asksForTradeSignal,
    needsWebSearch,
    hasPdfAttachment,
    decisionModel: GEMINI_DECISION_MODEL
  };
}
async function executeWithModelFailover(route, runModel) {
  const suffix = route.asksForTradeSignal ? SAFE_HARBOR_REMINDER : "";
  const attemptedModels = [];
  let lastError;
  for (let i = 0; i < route.candidateModels.length; i++) {
    const candidate = route.candidateModels[i];
    attemptedModels.push(candidate);
    try {
      const reply = await runModel(candidate, suffix);
      return {
        reply,
        model: candidate,
        failoverUsed: i > 0,
        attemptedModels,
        route
      };
    } catch (err) {
      lastError = err;
      const canRetryNext = i < route.candidateModels.length - 1 && isRetryableQuotaOrTransientError(err);
      if (!canRetryNext) {
        throw err;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("All Free Tier Gemini/Gemma candidates failed");
}
function createDecisionGenAIClient(apiKey) {
  return new GoogleGenAI({
    apiKey: apiKey ?? process.env.GEMINI_API_KEY,
    httpOptions: {
      apiVersion: "v1beta",
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}

// src/utils/ghrRules.ts
var DEFAULT_TWELVE_GATES = {
  g01: false,
  g02: false,
  g03: false,
  g04: false,
  g05: false,
  g06: false,
  g07: false,
  g08: false,
  g09: false,
  g10: false,
  g11: false,
  g12: false
};
var DEFAULT_FIVE_STATE_PROBS = {
  p0: 15,
  p1: 8,
  p2: 7,
  p3: 30,
  p4: 40,
  spreadCostR: 0.02
};
var DEFAULT_ACCOUNTS = {
  port1: {
    id: "port1",
    login: "DEMO-6K",
    name: "\u0E1E\u0E2D\u0E23\u0E4C\u0E15\u0E2B\u0E25\u0E31\u0E01 \xB7 Prop $6K",
    accountType: "PROP",
    brokerName: "Prop Firm \xB7 GHR v3.2",
    brokerServer: "XAUUSD-Live",
    syncProvider: "MANUAL_XLSX",
    initial: 6e3,
    targetProfit: 480,
    minDays: 5,
    defaultRisk: 120,
    consistencyCapPct: 40,
    feeRefundUsd: 59,
    profitSplitPct: 90
  },
  funded: {
    id: "funded",
    login: "FUNDED-90",
    name: "\u0E1E\u0E2D\u0E23\u0E4C\u0E15 2 \xB7 Funded 90%",
    accountType: "PROP",
    brokerName: "Prop Firm \xB7 GHR v3.2",
    brokerServer: "XAUUSD-Live",
    syncProvider: "MANUAL_XLSX",
    initial: 6e3,
    targetProfit: 360,
    minDays: 3,
    defaultRisk: 90,
    consistencyCapPct: 40,
    feeRefundUsd: 0,
    profitSplitPct: 90
  }
};
var CALCULATOR_CONTRACTS = {
  XAUUSD: { usdPerPriceMove: 100, priceDecimals: 2, pointsPerPrice: 100 },
  EURUSD: { usdPerPriceMove: 1e5, priceDecimals: 5, pointsPerPrice: 1e5 },
  GBPUSD: { usdPerPriceMove: 1e5, priceDecimals: 5, pointsPerPrice: 1e5 },
  USDJPY: { usdPerPriceMove: 1e5, priceDecimals: 3, pointsPerPrice: 1e3 },
  NAS100: { usdPerPriceMove: 1, priceDecimals: 2, pointsPerPrice: 100 },
  BTCUSD: { usdPerPriceMove: 1, priceDecimals: 2, pointsPerPrice: 100 }
};
var DEFAULT_MANUAL_CALCULATOR = {
  instrument: "XAUUSD",
  customContract: CALCULATOR_CONTRACTS.XAUUSD,
  sizing: "BY_RISK",
  lotBasis: "TOTAL",
  manualLot: 0.12,
  legCount: 3,
  distanceUnit: "POINTS",
  sl: { unit: "POINTS", value: 1e3 },
  targets: [
    { unit: "POINTS", value: 400 },
    { unit: "POINTS", value: 800 },
    { unit: "POINTS", value: 1200 }
  ],
  weights: [33.3, 33.3, 33.4],
  trailingLock: true
};
var GHR_PRESET_CALCULATOR = {
  ...DEFAULT_MANUAL_CALCULATOR,
  weights: [1, 1, 1]
};
var DEFAULT_WORKSPACE_BRAND = "TallyNX OS v5.0";
var DEFAULT_STATE = {
  theme: "aurora",
  privacyMasked: false,
  thbRate: 35.5,
  activePort: "port1",
  calcDir: "BUY",
  calcEntry: 4042.59,
  calcEntryRaw: "4042.59",
  calcRisk: 120,
  calcNote: "",
  calcMode: "GHR_PRESET",
  manualCalculator: DEFAULT_MANUAL_CALCULATOR,
  quickGates: { g1: false, g2: false, g3: false, g4: false, g5: false },
  twelveGates: { ...DEFAULT_TWELVE_GATES },
  fiveStateProbs: { ...DEFAULT_FIVE_STATE_PROBS },
  goldenRulesAck: {
    r01: false,
    r02: false,
    r03: false,
    r04: false,
    r05: false,
    r06: false,
    r07: false,
    r08: false,
    r09: false,
    r10: false
  },
  cooldownUntil: null,
  accounts: DEFAULT_ACCOUNTS,
  cycleDays: [
    { day: 1, note: "\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48 1", profit: 0 },
    { day: 2, note: "\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48 2", profit: 0 },
    { day: 3, note: "\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48 3", profit: 0 }
  ],
  cycleDaysByPort: {},
  includeFeeRefund: false,
  consistencyOverrides: {},
  journalFilter: "port1",
  journalStatusFilter: "ALL",
  journalDateFilter: "ALL",
  journalSessionFilter: "ALL",
  journalSearch: "",
  showManualAddForm: false,
  showAddPortForm: false,
  showDbManager: false,
  showMt5Importer: false,
  mt5GroupMode: "IDEA",
  mt5IncludeFees: true,
  mt5TimeOffset: "AUTO_MT5",
  mt5RawReports: {},
  editingPortId: null,
  editingTradeId: null,
  inlineEditMode: false,
  autoSyncFormMetrics: true,
  autoCloudSync: true,
  apiEndpointUrl: "",
  apiSecretKey: "",
  lastSavedAt: null,
  journal: [],
  chatMessages: [
    {
      id: "WELCOME-1",
      role: "model",
      text: "\u0E16\u0E32\u0E21\u0E40\u0E23\u0E37\u0E48\u0E2D\u0E07\u0E08\u0E38\u0E14\u0E40\u0E02\u0E49\u0E32 3-TP \u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E48\u0E22\u0E07 5 \u0E2A\u0E16\u0E32\u0E19\u0E30 \u0E40\u0E0A\u0E47\u0E01\u0E25\u0E34\u0E2A\u0E15\u0E4C 12-Gate \u0E41\u0E1A\u0E1A Fail-Closed \u0E2B\u0E23\u0E37\u0E2D\u0E40\u0E1E\u0E14\u0E32\u0E19 Consistency \u0E43\u0E19 GHR v3.2 \u0E40\u0E25\u0E37\u0E2D\u0E01\u0E2B\u0E31\u0E27\u0E02\u0E49\u0E2D\u0E14\u0E49\u0E32\u0E19\u0E25\u0E48\u0E32\u0E07\u0E2B\u0E23\u0E37\u0E2D\u0E1E\u0E34\u0E21\u0E1E\u0E4C\u0E04\u0E33\u0E16\u0E32\u0E21\u0E44\u0E14\u0E49\u0E40\u0E25\u0E22",
      timestamp: "09:00",
      model: "decision-1 \u2192 3.5/3.1-flash-lite"
    }
  ],
  chatModel: "auto",
  deskBrandName: DEFAULT_WORKSPACE_BRAND,
  deskBrandSubtitle: "desk.tallynx.com \xB7 Real-Time Trading OS & Trade Journal",
  onboardingCompleted: false,
  showHelpGuide: false,
  showLicenseModal: false
};
function getBangkokIsoDate(date = /* @__PURE__ */ new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(date);
  } catch {
    const bangkokMs = date.getTime() + 7 * 60 * 60 * 1e3;
    return new Date(bangkokMs).toISOString().slice(0, 10);
  }
}
function getBangkokTimeHHMM(date = /* @__PURE__ */ new Date()) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(date);
  } catch {
    const bangkokMs = date.getTime() + 7 * 60 * 60 * 1e3;
    return new Date(bangkokMs).toISOString().slice(11, 16);
  }
}
var LEGACY_BRAND_PATTERNS = [
  ["xp", "firm"].join(""),
  ["nakhara", "x"].join(""),
  "nakhara",
  "tredyn",
  "ghr v3.2",
  "engine)"
];
function normalizeMt5TimeOffsetSetting(raw) {
  if (raw === "AUTO_MT5" || raw === "" || raw === null || raw === void 0) {
    return "AUTO_MT5";
  }
  const n = Number(raw);
  if (Number.isFinite(n)) {
    return Math.max(-12, Math.min(14, Math.round(n)));
  }
  return "AUTO_MT5";
}
function resolveMt5AutoOffsetToBangkokHours(year, month, day, hour = 12, minute = 0) {
  try {
    const probeMs = Date.UTC(year, month - 1, day, Math.max(0, Math.min(23, hour)), minute, 0) - 2 * 36e5;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      timeZoneName: "shortOffset"
    }).formatToParts(new Date(probeMs));
    const tzName = parts.find((p) => p.type === "timeZoneName")?.value || "";
    const m = /GMT([+-]\d{1,2})(?::(\d{2}))?/.exec(tzName);
    if (m) {
      const nyUtcOffset = parseInt(m[1], 10);
      const mt5UtcOffset = nyUtcOffset + 7;
      return 7 - mt5UtcOffset;
    }
  } catch {
  }
  if (month > 3 && month < 11) return 4;
  if (month < 3 || month > 11) return 5;
  if (month === 3) {
    const firstSun = 1 + (7 - new Date(Date.UTC(year, 2, 1)).getUTCDay()) % 7;
    const secondSun = firstSun + 7;
    return day >= secondSun ? 4 : 5;
  }
  const firstNovSun = 1 + (7 - new Date(Date.UTC(year, 10, 1)).getUTCDay()) % 7;
  return day < firstNovSun ? 4 : 5;
}
function resolveMt5TimeOffsetHours(mt5TimeOffset, year, month, day, hour = 12, minute = 0) {
  const normalized = normalizeMt5TimeOffsetSetting(mt5TimeOffset);
  if (typeof normalized === "number") {
    return normalized;
  }
  return resolveMt5AutoOffsetToBangkokHours(year, month, day, hour, minute);
}
function serializeRawTimestampCandidate(raw) {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    const ms = raw > 1e12 ? raw : raw * 1e3;
    return new Date(ms).toISOString();
  }
  const s = String(raw ?? "").trim();
  return s || void 0;
}
function parseFlexibleDateTime(raw, fallbackIsoDate, mt5TimeOffset = "AUTO_MT5") {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    const ms = raw > 1e12 ? raw : raw * 1e3;
    const dt = new Date(ms);
    return {
      date: getBangkokIsoDate(dt),
      time: getBangkokTimeHHMM(dt),
      ts: ms
    };
  }
  const str2 = String(raw || "").trim();
  if (!str2) {
    return { date: fallbackIsoDate, time: "12:00", ts: Date.parse(`${fallbackIsoDate}T12:00:00+07:00`) || 0 };
  }
  if (/(?:Z|GMT|[+-]\d{2}:?\d{2})$/i.test(str2)) {
    const dotToDash = str2.replace(/^(\d{4})\.(\d{2})\.(\d{2})/, "$1-$2-$3");
    const parsedMs2 = Date.parse(dotToDash.includes("T") ? dotToDash : dotToDash.replace(" ", "T"));
    if (Number.isFinite(parsedMs2)) {
      const dt = new Date(parsedMs2);
      return {
        date: getBangkokIsoDate(dt),
        time: getBangkokTimeHHMM(dt),
        ts: parsedMs2
      };
    }
  }
  const ymdMatch = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/.exec(
    str2
  );
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10);
    const day = parseInt(ymdMatch[3], 10);
    const hour = ymdMatch[4] !== void 0 ? parseInt(ymdMatch[4], 10) : 12;
    const minute = ymdMatch[5] !== void 0 ? parseInt(ymdMatch[5], 10) : 0;
    const second = ymdMatch[6] !== void 0 ? parseInt(ymdMatch[6], 10) : 0;
    const shiftHours = resolveMt5TimeOffsetHours(mt5TimeOffset, year, month, day, hour, minute);
    const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
    const instantMs = naiveUtcMs + (shiftHours - 7) * 36e5;
    const dt = new Date(instantMs);
    return {
      date: getBangkokIsoDate(dt),
      time: getBangkokTimeHHMM(dt),
      ts: instantMs
    };
  }
  const mdyMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(str2);
  if (mdyMatch) {
    const month = parseInt(mdyMatch[1], 10);
    const day = parseInt(mdyMatch[2], 10);
    const year = parseInt(mdyMatch[3], 10);
    const hour = mdyMatch[4] !== void 0 ? parseInt(mdyMatch[4], 10) : 12;
    const minute = mdyMatch[5] !== void 0 ? parseInt(mdyMatch[5], 10) : 0;
    const second = mdyMatch[6] !== void 0 ? parseInt(mdyMatch[6], 10) : 0;
    const shiftHours = resolveMt5TimeOffsetHours(mt5TimeOffset, year, month, day, hour, minute);
    const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
    const instantMs = naiveUtcMs + (shiftHours - 7) * 36e5;
    const dt = new Date(instantMs);
    return {
      date: getBangkokIsoDate(dt),
      time: getBangkokTimeHHMM(dt),
      ts: instantMs
    };
  }
  const normalized = str2.replace(/^(\d{4})\.(\d{2})\.(\d{2})/, "$1-$2-$3");
  const parsedMs = Date.parse(normalized);
  if (Number.isFinite(parsedMs)) {
    const dt = new Date(parsedMs);
    return {
      date: getBangkokIsoDate(dt),
      time: getBangkokTimeHHMM(dt),
      ts: parsedMs
    };
  }
  const isoMatch = /(\d{4}-\d{2}-\d{2})/.exec(normalized);
  const timeMatch = /(\d{2}:\d{2})/.exec(normalized);
  const datePart = isoMatch ? isoMatch[1] : fallbackIsoDate;
  const timePart = timeMatch ? timeMatch[1] : "12:00";
  return {
    date: datePart,
    time: timePart,
    ts: Date.parse(`${datePart}T${timePart}:00+07:00`) || 0
  };
}
function reapplyMt5TimezoneToPositions(positions, mt5TimeOffset = "AUTO_MT5") {
  if (!Array.isArray(positions)) return [];
  return positions.map((pos) => {
    const fallbackOpen = pos.openDate && /^\d{4}-\d{2}-\d{2}$/.test(pos.openDate) ? pos.openDate : getBangkokIsoDate();
    const rawOpen = pos.rawOpenTime || `${pos.openDate} ${pos.openTime || "12:00"}:00`;
    const rawClose = pos.rawCloseTime || (pos.closeDate && pos.closeTime ? `${pos.closeDate} ${pos.closeTime}:00` : rawOpen);
    const openParsed = parseFlexibleDateTime(rawOpen, fallbackOpen, mt5TimeOffset);
    const closeParsed = parseFlexibleDateTime(rawClose, openParsed.date, mt5TimeOffset);
    return {
      ...pos,
      openDate: openParsed.date,
      openTime: openParsed.time,
      openTs: openParsed.ts,
      closeDate: closeParsed.date,
      closeTime: closeParsed.time,
      closeTs: closeParsed.ts,
      rawOpenTime: rawOpen,
      rawCloseTime: rawClose
    };
  });
}
function normalizeBridgePositionsToMt5Records(rawItems, referenceDateStr, mt5TimeOffset = "AUTO_MT5") {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { positions: [], skippedCount: 0 };
  }
  const fallbackDate = referenceDateStr && /^\d{4}-\d{2}-\d{2}$/.test(referenceDateStr) ? referenceDateStr : getBangkokIsoDate();
  const dedupeMap = /* @__PURE__ */ new Map();
  let skippedCount = 0;
  rawItems.forEach((raw, idx) => {
    if (!raw || typeof raw !== "object") {
      skippedCount += 1;
      return;
    }
    const row = raw;
    const rawType = String(row.dir || row.type || row.side || row.action || "").toUpperCase();
    if (rawType.includes("BALANCE") || rawType.includes("CREDIT") || rawType.includes("BONUS") || rawType.includes("DEPOSIT") || rawType.includes("WITHDRAW")) {
      skippedCount += 1;
      return;
    }
    let dir = null;
    if (rawType.includes("SELL") || rawType === "1") dir = "SELL";
    else if (rawType.includes("BUY") || rawType === "0") dir = "BUY";
    if (!dir) {
      skippedCount += 1;
      return;
    }
    const openPrice = Number(row.openPrice ?? row.priceOpen ?? row.entryPrice ?? row.price ?? 0);
    const closePrice = Number(row.closePrice ?? row.priceClose ?? row.exitPrice ?? openPrice);
    const volume = Number(row.volume ?? row.lots ?? row.lot ?? 0);
    const rawProfit = Number(row.rawProfit ?? row.profit ?? 0);
    const commission = Number(row.commission ?? 0);
    const swap = Number(row.swap ?? 0);
    const netProfit = row.netProfit !== void 0 && Number.isFinite(Number(row.netProfit)) ? +Number(row.netProfit).toFixed(2) : +(rawProfit + commission + swap).toFixed(2);
    if (!Number.isFinite(openPrice) || openPrice <= 0 || !Number.isFinite(volume) || volume <= 0) {
      skippedCount += 1;
      return;
    }
    const ticket = String(row.ticket ?? row.positionId ?? row.dealId ?? row.id ?? `B-${idx + 1}`).trim();
    const symbol = String(row.symbol || "XAUUSD").trim() || "XAUUSD";
    const openRawCandidate = row.openDate && /^\d{4}[.\-/]\d{2}[.\-/]\d{2}$/.test(String(row.openDate).trim()) && row.openTime && /^\d{1,2}:\d{2}(?::\d{2})?$/.test(String(row.openTime).trim()) ? `${String(row.openDate).trim()} ${String(row.openTime).trim()}` : row.openTime ?? row.time ?? row.openDate;
    const closeRawCandidate = row.closeDate && /^\d{4}[.\-/]\d{2}[.\-/]\d{2}$/.test(String(row.closeDate).trim()) && row.closeTime && /^\d{1,2}:\d{2}(?::\d{2})?$/.test(String(row.closeTime).trim()) ? `${String(row.closeDate).trim()} ${String(row.closeTime).trim()}` : row.closeTime ?? row.closeDate ?? openRawCandidate;
    const rawOpenTimeStr = typeof row.rawOpenTime === "string" && row.rawOpenTime.trim() ? row.rawOpenTime.trim() : serializeRawTimestampCandidate(openRawCandidate);
    const rawCloseTimeStr = typeof row.rawCloseTime === "string" && row.rawCloseTime.trim() ? row.rawCloseTime.trim() : serializeRawTimestampCandidate(closeRawCandidate);
    const openParsed = parseFlexibleDateTime(rawOpenTimeStr ?? openRawCandidate, fallbackDate, mt5TimeOffset);
    const closeParsed = parseFlexibleDateTime(rawCloseTimeStr ?? closeRawCandidate, openParsed.date, mt5TimeOffset);
    dedupeMap.set(ticket, {
      ticket,
      symbol,
      dir,
      openDate: openParsed.date,
      openTime: openParsed.time,
      openTs: openParsed.ts,
      closeDate: closeParsed.date,
      closeTime: closeParsed.time,
      closeTs: closeParsed.ts,
      rawOpenTime: rawOpenTimeStr,
      rawCloseTime: rawCloseTimeStr,
      volume: +volume.toFixed(2),
      openPrice: +openPrice.toFixed(2),
      slPrice: Number(row.slPrice ?? row.stopLoss ?? row.sl ?? 0) || 0,
      tpPrice: Number(row.tpPrice ?? row.takeProfit ?? row.tp ?? 0) || 0,
      closePrice: +(Number.isFinite(closePrice) && closePrice > 0 ? closePrice : openPrice).toFixed(2),
      commission: +commission.toFixed(2),
      swap: +swap.toFixed(2),
      rawProfit: +rawProfit.toFixed(2),
      netProfit,
      comment: String(row.comment || "").trim()
    });
  });
  const positions = Array.from(dedupeMap.values()).sort((a, b) => (a.openTs || 0) - (b.openTs || 0));
  return { positions, skippedCount };
}

// server/fundednext/mcpConnector.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// server/fundednext/decimalMath.ts
import { Decimal } from "decimal.js";
var Money = Decimal.clone({ precision: 1024 });

// server/fundednext/mcpConnector.ts
var VERIFIED_READ_TOOLS = Object.freeze([
  "get_accounts",
  "get_accounts_v2",
  "get_account_overview",
  "get_account_cycles",
  "get_cycle_trading_history",
  "get_trading_history",
  "get_running_trades"
]);

// server/fundednext/store.ts
var FUNDEDNEXT_LIVE_SYNC_FLOOR_MS = 3e3;
var PilotStoreError = class extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
};
var MAX_JOURNAL_ROWS = 200;

// server/fundednext/vpsRpc.ts
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
var VPS_RPC_HEADER_TS = "x-tredyn-ts";
var VPS_RPC_HEADER_NONCE = "x-tredyn-nonce";
var VPS_RPC_HEADER_UID = "x-tredyn-uid";
var VPS_RPC_HEADER_SIG = "x-tredyn-sig";
function assertValidRpcSecret(secret) {
  const trimmed = String(secret ?? "").trim();
  if (trimmed.length < 32) {
    throw new Error("FUNDEDNEXT_VPS_RPC_SECRET must be at least 32 characters");
  }
  return trimmed;
}
function sha256Hex(input) {
  return createHash("sha256").update(input).digest("hex");
}
function buildRpcSigningInput(input) {
  return [
    input.method.toUpperCase(),
    input.path,
    input.ts,
    input.nonce,
    input.uid,
    sha256Hex(input.body)
  ].join("\n");
}
function signVpsRpcRequest(input) {
  const secret = assertValidRpcSecret(input.secret);
  const uid = input.uid.trim();
  if (!uid || uid.length > 256 || /[\r\n]/.test(uid)) {
    throw new Error("Invalid RPC caller UID");
  }
  const ts = String(input.now ?? Date.now());
  const nonce = input.nonce ?? randomBytes(16).toString("hex");
  const payload = buildRpcSigningInput({
    method: input.method,
    path: input.path,
    ts,
    nonce,
    uid,
    body: input.body
  });
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return {
    [VPS_RPC_HEADER_TS]: ts,
    [VPS_RPC_HEADER_NONCE]: nonce,
    [VPS_RPC_HEADER_UID]: uid,
    [VPS_RPC_HEADER_SIG]: sig
  };
}

// server/fundednext/vpsClient.ts
function normalizeBaseUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)) || url.username || url.password || url.search || url.hash) {
    throw new Error("Invalid FundedNext VPS RPC base URL");
  }
  return url.toString().replace(/\/+$/, "");
}
function createRemoteVpsPilotServices(options) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const requestFetch = options.fetch ?? fetch;
  async function callRpc(path2, uid, payload) {
    const secret = assertValidRpcSecret(options.secret);
    const body = JSON.stringify(payload);
    const headers = signVpsRpcRequest({
      secret,
      method: "POST",
      path: path2,
      uid,
      body
    });
    const response = await requestFetch(`${baseUrl}${path2}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...headers
      },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(12e3)
    });
    const parsed = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 400 || response.status === 403 || response.status === 404 || response.status === 409 || response.status === 502) {
        throw new PilotStoreError(
          response.status,
          typeof parsed?.error === "string" ? parsed.error : "FundedNext request rejected",
          parsed?.code === "reconnect_required" ? "reconnect_required" : void 0
        );
      }
      throw new Error(typeof parsed?.error === "string" ? parsed.error : `FundedNext VPS RPC HTTP ${response.status}`);
    }
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Invalid FundedNext VPS RPC response");
    }
    return parsed;
  }
  return {
    remoteRpc: true,
    oauth: {
      start: (uid, opts) => callRpc("/fundednext-rpc/connections/start", uid, {
        ...opts?.connectionId ? { connectionId: opts.connectionId } : {},
        ...opts?.redirectUri ? { redirectUri: opts.redirectUri } : {}
      }),
      callback: ({ state, code, browserSession: browserSession2, uid }) => callRpc("/fundednext-rpc/oauth/callback", uid, { state, code, browserSession: browserSession2 })
    },
    listDirectory: (uid, connectionId) => callRpc("/fundednext-rpc/accounts/list", uid, { ...connectionId ? { connectionId } : {} }),
    setAccountTracked: async (uid, accountId, tracked) => (await callRpc("/fundednext-rpc/accounts/tracking", uid, { accountId, tracked })).account,
    enqueueSync: (uid, accountId) => callRpc("/fundednext-rpc/accounts/sync", uid, { accountId }),
    getSnapshotState: (uid, accountId, opts) => callRpc("/fundednext-rpc/accounts/snapshot", uid, { accountId, ...opts?.live ? { live: true } : {} }),
    listExecutions: (uid, accountId, cursor, limit) => callRpc("/fundednext-rpc/accounts/executions", uid, {
      accountId,
      ...cursor !== void 0 ? { cursor } : {},
      ...limit !== void 0 ? { limit } : {}
    }),
    disconnect: (uid, connectionId) => callRpc("/fundednext-rpc/connections/disconnect", uid, { connectionId }),
    importJournalBatch: (uid, importId, rows) => callRpc("/fundednext-rpc/journal-imports", uid, { importId, rows })
  };
}

// server/fundednext/router.ts
import { randomBytes as randomBytes2 } from "node:crypto";
import { Router } from "express";

// server/fundednext/oauthPkce.ts
var PKCE_TTL_MS = 10 * 60 * 1e3;
var OAUTH_CALLBACK_PATH = "/api/fundednext/oauth/callback";
var DEFAULT_OAUTH_REDIRECT_URI = `https://desk.tallynx.com${OAUTH_CALLBACK_PATH}`;
var DEFAULT_TRUSTED_DESK_ORIGINS = Object.freeze([
  "https://desk.tallynx.com",
  "https://mall.tallynx.com",
  "https://tallynx-desk.vercel.app",
  "https://tredyn-desk.vercel.app"
]);
function isLocalhostOrigin(url) {
  return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
}
function parseTrustedOrigin(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && !isLocalhostOrigin(url) || url.username || url.password || url.hash) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}
function collectTrustedOrigins(extraOrigins = []) {
  const trusted = new Set(DEFAULT_TRUSTED_DESK_ORIGINS);
  const envRedirectOrigin = parseTrustedOrigin(process.env.FUNDEDNEXT_OAUTH_REDIRECT_URI);
  if (envRedirectOrigin) trusted.add(envRedirectOrigin);
  for (const part of String(process.env.FUNDEDNEXT_ALLOWED_ORIGINS ?? "").split(",")) {
    const origin = parseTrustedOrigin(part);
    if (origin) trusted.add(origin);
  }
  for (const extra of extraOrigins) {
    const origin = parseTrustedOrigin(extra);
    if (origin) trusted.add(origin);
  }
  return trusted;
}
function isTrustedDeskRedirectUri(rawUri, options = {}) {
  try {
    const url = new URL(rawUri);
    if (url.pathname !== OAUTH_CALLBACK_PATH || url.search || url.hash || url.username || url.password) {
      return null;
    }
    const trusted = collectTrustedOrigins(options.extraOrigins);
    const allowLocalhost = options.allowLocalhost ?? process.env.NODE_ENV !== "production";
    if (url.protocol === "https:" && trusted.has(url.origin)) {
      return `${url.origin}${OAUTH_CALLBACK_PATH}`;
    }
    if (isLocalhostOrigin(url) && (allowLocalhost || trusted.has(url.origin))) {
      return `${url.origin}${OAUTH_CALLBACK_PATH}`;
    }
    return null;
  } catch {
    return null;
  }
}
function resolveTrustedDeskRedirectUri(headers, options = {}) {
  const rawProto = Array.isArray(headers["x-forwarded-proto"]) ? headers["x-forwarded-proto"][0] : headers["x-forwarded-proto"];
  const protoCandidate = String(rawProto ?? "").split(",")[0].trim().toLowerCase();
  const proto = protoCandidate === "http" || protoCandidate === "https" ? protoCandidate : options.protocol === "http" || options.protocol === "https" ? options.protocol : "https";
  const rawHost = Array.isArray(headers["x-forwarded-host"]) ? headers["x-forwarded-host"][0] : headers["x-forwarded-host"] ?? (Array.isArray(headers.host) ? headers.host[0] : headers.host);
  const host = String(rawHost ?? "").split(",")[0].trim();
  if (!host || /[^a-zA-Z0-9.:-]/.test(host)) {
    return void 0;
  }
  return isTrustedDeskRedirectUri(`${proto}://${host}${OAUTH_CALLBACK_PATH}`, {
    allowLocalhost: options.allowLocalhost
  }) ?? void 0;
}

// server/fundednext/router.ts
function toFinite(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.trim().replace(/[$,\s]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function pickRawNumber(sources, keys) {
  for (const src of sources) {
    if (!src) continue;
    for (const key of keys) {
      if (key in src) {
        const val = toFinite(src[key]);
        if (val !== null) return val;
      }
    }
  }
  return null;
}
function asObj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function extractFundedNextLiveTelemetry(snapshot, meta) {
  const rateFloorMs = meta?.rateFloorMs ?? FUNDEDNEXT_LIVE_SYNC_FLOOR_MS;
  const nextSafeSyncAt = meta?.nextSafeSyncAt ?? null;
  const syncTriggered = Boolean(meta?.syncTriggered);
  if (!snapshot) {
    return {
      balance: null,
      equity: null,
      floatingPnl: null,
      margin: null,
      freeMargin: null,
      marginLevelPct: null,
      dailyLossUsedUsd: null,
      dailyLossLimitUsd: null,
      consistencyLiveImpactPct: null,
      openPositionsCount: 0,
      openPositions: [],
      rateFloorMs,
      nextSafeSyncAt,
      syncTriggered
    };
  }
  const raw = asObj(snapshot.rawPayload);
  const sources = [raw, asObj(raw?.stats), asObj(raw?.account_details), asObj(raw?.account), asObj(raw?.overview)];
  const balance = toFinite(snapshot.balance);
  const equity = toFinite(snapshot.equity);
  const floatingPnl = toFinite(snapshot.floatingPnl) ?? (balance !== null && equity !== null ? +(equity - balance).toFixed(2) : null);
  const initialBalance = toFinite(snapshot.initialBalance);
  const netProfit = toFinite(snapshot.netProfit);
  const margin = pickRawNumber(sources, ["margin", "used_margin", "usedMargin", "margin_used", "marginUsed"]);
  const rawFreeMargin = pickRawNumber(sources, [
    "free_margin",
    "freeMargin",
    "margin_free",
    "marginFree",
    "available_margin",
    "availableMargin"
  ]);
  const freeMargin = rawFreeMargin !== null ? +rawFreeMargin.toFixed(2) : margin !== null && equity !== null ? +(equity - margin).toFixed(2) : null;
  const rawMarginLevel = pickRawNumber(sources, ["margin_level", "marginLevel", "margin_level_pct", "marginLevelPct"]);
  const marginLevelPct = rawMarginLevel !== null ? +rawMarginLevel.toFixed(1) : margin !== null && margin > 0 && equity !== null && equity > 0 ? +(equity / margin * 100).toFixed(1) : null;
  const dailyLossUsedUsd = pickRawNumber(sources, [
    "daily_dd_used",
    "dailyDdUsed",
    "daily_loss_used",
    "dailyLossUsed",
    "daily_drawdown_used",
    "dailyDrawdownUsed"
  ]);
  const rawDailyLimit = pickRawNumber(sources, [
    "daily_loss_limit",
    "dailyLossLimit",
    "max_daily_loss",
    "maxDailyLoss",
    "daily_drawdown_limit",
    "dailyDrawdownLimit"
  ]);
  const dailyLossLimitUsd = rawDailyLimit !== null ? +Math.abs(rawDailyLimit).toFixed(2) : initialBalance !== null && initialBalance > 0 ? +(initialBalance * 0.05).toFixed(2) : null;
  const todayProfit = pickRawNumber(sources, ["today_profit", "todayProfit", "daily_profit", "dailyProfit"]);
  const bestDayProfit = pickRawNumber(sources, ["best_day_profit", "bestDayProfit"]);
  let consistencyLiveImpactPct = null;
  if (netProfit !== null && floatingPnl !== null && (todayProfit !== null || bestDayProfit !== null)) {
    const projectedTotal = netProfit + floatingPnl;
    const projectedBest = Math.max(bestDayProfit ?? 0, (todayProfit ?? 0) + floatingPnl);
    if (projectedBest > 0) {
      consistencyLiveImpactPct = projectedTotal > 0 ? +Math.min(100, projectedBest / projectedTotal * 100).toFixed(1) : 100;
    } else {
      consistencyLiveImpactPct = 0;
    }
  }
  return {
    balance,
    equity,
    floatingPnl,
    margin: margin !== null ? +margin.toFixed(2) : null,
    freeMargin,
    marginLevelPct,
    dailyLossUsedUsd: dailyLossUsedUsd !== null ? +Math.abs(dailyLossUsedUsd).toFixed(2) : null,
    dailyLossLimitUsd,
    consistencyLiveImpactPct,
    openPositionsCount: snapshot.openPositions.length,
    openPositions: snapshot.openPositions,
    rateFloorMs,
    nextSafeSyncAt,
    syncTriggered
  };
}
var cookieName = "fundednext_pkce";
var callbackPath = "/api/fundednext/oauth/callback";
var popupResultType = "TALLYNX_FN_PILOT_OAUTH_RESULT";
function sendPopup(res, result) {
  const nonce = randomBytes2(18).toString("base64");
  const message = JSON.stringify({ type: popupResultType, ...result }).replace(/</g, "\\u003c");
  const heading = result.ok ? "FundedNext connected" : "FundedNext connection failed";
  const detail = result.ok ? "Return to Desk to select an account." : result.error;
  res.set("Content-Security-Policy", `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`);
  res.type("html").send(`<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${heading}</title>
<style nonce="${nonce}">html{color-scheme:dark}body{display:grid;min-height:100vh;place-items:center;margin:0;background:#0f172a;color:#e2e8f0;font:15px system-ui}main{box-sizing:border-box;width:min(24rem,92vw);border:1px solid #334155;border-radius:12px;padding:1.5rem;background:#1e293b}h1{font-size:1.2rem;margin:0 0 .5rem}p{color:#cbd5e1;margin:0}</style>
<main><h1>${heading}</h1><p>${detail}</p></main>
<script nonce="${nonce}">
const result = ${message};
try { window.opener?.postMessage(result, window.location.origin); } catch {}
try {
  const channel = new BroadcastChannel('tallynx_fn_pilot_oauth');
  channel.postMessage(result);
  channel.close();
} catch {}
setTimeout(() => window.close(), result.ok ? 400 : 3000);
</script></html>`);
}
function popupError(status) {
  if (status === 400 || status === 401) return "Invalid or expired OAuth session";
  if (status === 403) return "FundedNext pilot access required";
  return "Could not connect FundedNext. Return to Desk and try again.";
}
function browserSession(header) {
  const cookie = header?.split(";").map((part) => part.trim()).find((part) => part.startsWith(cookieName + "="));
  const parts = cookie?.slice(cookieName.length + 1).split(".");
  if (!parts || parts.length !== 2) return null;
  const [encodedUid, proof] = parts;
  if (!/^[\w-]{1,684}$/.test(encodedUid) || !/^[\w-]{43}$/.test(proof)) return null;
  return { uid: Buffer.from(encodedUid, "base64url").toString("utf8"), proof };
}
var badRequest = (message) => new PilotStoreError(400, message);
function createFundedNextRouter(options) {
  const router = Router();
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: options.secureCookies ?? true,
    path: callbackPath
  };
  function resolveHandlers(raw) {
    if (raw.remoteRpc) {
      return {
        skipPreflightAllowlist: true,
        isAllowlisted: async () => true,
        oauth: raw.oauth,
        listDirectory: raw.listDirectory,
        setAccountTracked: raw.setAccountTracked,
        enqueueSync: raw.enqueueSync,
        getSnapshotState: raw.getSnapshotState,
        listExecutions: raw.listExecutions,
        disconnect: raw.disconnect,
        importJournalBatch: raw.importJournalBatch
      };
    }
    const { store, oauth } = raw;
    return {
      skipPreflightAllowlist: false,
      isAllowlisted: (uid) => store.isAllowlisted(uid),
      oauth,
      listDirectory: async (uid, connectionId) => {
        const connection = connectionId ? await store.getConnection(uid, connectionId) : null;
        return { accounts: await store.listAccounts(uid), ...connection && { connectionStatus: connection.status } };
      },
      setAccountTracked: async (uid, id, tracked) => {
        const account = await store.getAccount(uid, id);
        return store.setTracked(uid, account.connectionId, account.id, tracked);
      },
      enqueueSync: (uid, id) => store.enqueueSync(uid, id),
      getSnapshotState: (uid, id, opts) => opts?.live ? store.requestLiveSnapshot(uid, id) : store.getAccountSnapshotState(uid, id),
      listExecutions: (uid, id, cursor, limit) => store.listExecutions(uid, id, cursor, limit),
      disconnect: (uid, id) => store.disconnect(uid, id),
      importJournalBatch: (uid, importId, rows) => store.importJournalBatch(uid, importId, rows)
    };
  }
  function route(handler, isCallback = false) {
    return async (req, res) => {
      res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
      const session = isCallback ? browserSession(req.headers.cookie) : null;
      const wantsPopup = isCallback && String(req.headers.accept || "").includes("text/html");
      function fail(status, error, code) {
        res.status(status);
        if (wantsPopup) sendPopup(res, { ok: false, error: popupError(status) });
        else res.json(code ? { error, code, status: code } : { error });
      }
      try {
        let uid;
        if (req.headers.authorization !== void 0) {
          const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization);
          const identity = match ? await options.verifyIdToken(match[1]).catch(() => null) : null;
          uid = identity?.uid;
        } else if (session) {
          uid = session.uid;
        }
        if (!uid) {
          fail(401, "Authentication required");
          return;
        }
        if (session && session.uid !== uid) {
          fail(403, "OAuth session belongs to another caller");
          return;
        }
        const services = resolveHandlers(options.services());
        if (!services.skipPreflightAllowlist && !await services.isAllowlisted(uid)) {
          fail(403, "FundedNext pilot access required");
          return;
        }
        await handler(req, res, uid, services);
      } catch (error) {
        if (error instanceof PilotStoreError) fail(error.status, error.message, error.code);
        else fail(503, "FundedNext pilot service is temporarily unavailable");
      }
    };
  }
  router.post("/connections", route(async (req, res, uid, { oauth }) => {
    const connectionId = req.body?.connectionId;
    if (connectionId !== void 0 && (typeof connectionId !== "string" || !connectionId || connectionId.length > 128)) {
      throw badRequest("Invalid connection identifier");
    }
    const redirectUri = resolveTrustedDeskRedirectUri(req.headers, {
      protocol: req.protocol,
      allowLocalhost: options.secureCookies === false
    });
    const { authorizeUrl, browserSession: proof } = await oauth.start(uid, {
      ...connectionId ? { connectionId } : {},
      ...redirectUri ? { redirectUri } : {}
    });
    res.cookie(cookieName, Buffer.from(uid).toString("base64url") + "." + proof, { ...cookieOptions, maxAge: PKCE_TTL_MS });
    res.status(201).json({ authorizeUrl });
  }));
  router.get("/oauth/callback", route(async (req, res, uid, { oauth }) => {
    const session = browserSession(req.headers.cookie);
    const { state, code } = req.query;
    if (!session || typeof state !== "string" || typeof code !== "string") throw badRequest("Invalid or expired OAuth session");
    const { connectionId, status } = await oauth.callback({ state, code, browserSession: session.proof, uid });
    res.clearCookie(cookieName, cookieOptions);
    if (String(req.headers.accept || "").includes("text/html")) sendPopup(res, { ok: true, connectionId, status });
    else res.json({ connectionId, status });
  }, true));
  router.get("/accounts", route(async (req, res, uid, services) => {
    const { connectionId } = req.query;
    if (connectionId !== void 0 && typeof connectionId !== "string") throw badRequest("Invalid connection identifier");
    res.json(await services.listDirectory(uid, connectionId));
  }));
  router.patch("/accounts/:id/tracking", route(async (req, res, uid, services) => {
    const tracked = req.body?.tracked;
    if (typeof tracked !== "boolean") throw badRequest("Tracked must be a boolean");
    res.json({ account: await services.setAccountTracked(uid, req.params.id, tracked) });
  }));
  router.post("/accounts/:id/sync", route(async (req, res, uid, services) => {
    res.status(202).json(await services.enqueueSync(uid, req.params.id));
  }));
  const isLiveQuery = (req) => req.query.live === "1" || req.query.live === "true";
  router.get("/accounts/:id", route(async (req, res, uid, services) => {
    const live = isLiveQuery(req);
    const state = await services.getSnapshotState(uid, req.params.id, { live });
    if (state.syncStatus === "RECONNECT_REQUIRED") {
      throw new PilotStoreError(409, "Reconnect this FundedNext connection", "reconnect_required");
    }
    res.json({
      accountId: req.params.id,
      snapshot: state.snapshot,
      syncStatus: state.syncStatus,
      liveTelemetry: extractFundedNextLiveTelemetry(state.snapshot, state)
    });
  }));
  router.get("/accounts/:id/snapshot", route(async (req, res, uid, services) => {
    const live = isLiveQuery(req);
    const state = await services.getSnapshotState(uid, req.params.id, { live });
    if (state.syncStatus === "RECONNECT_REQUIRED") {
      throw new PilotStoreError(409, "Reconnect this FundedNext connection", "reconnect_required");
    }
    if (!state.snapshot) {
      res.status(404).json({
        error: "FundedNext snapshot not found",
        syncStatus: state.syncStatus,
        ...live ? { liveTelemetry: extractFundedNextLiveTelemetry(null, state) } : {}
      });
      return;
    }
    if (live) {
      res.json({
        snapshot: state.snapshot,
        syncStatus: state.syncStatus,
        liveTelemetry: extractFundedNextLiveTelemetry(state.snapshot, state)
      });
      return;
    }
    res.json({ snapshot: state.snapshot, syncStatus: state.syncStatus });
  }));
  router.get("/accounts/:id/executions", route(async (req, res, uid, services) => {
    const { cursor, limit } = req.query;
    if (cursor !== void 0 && typeof cursor !== "string" || limit !== void 0 && (typeof limit !== "string" || !/^[1-9]\d{0,2}$/.test(limit))) {
      throw badRequest("Invalid execution pagination");
    }
    const result = await services.listExecutions(uid, req.params.id, cursor, limit === void 0 ? void 0 : Number(limit));
    options.onExecutionsRead?.(uid, req.params.id, result.executions);
    res.json(result);
  }));
  router.delete("/connections/:id", route(async (req, res, uid, services) => {
    res.json(await services.disconnect(uid, req.params.id));
  }));
  router.post("/journal-imports", route(async (req, res, uid, services) => {
    const { importId, rows } = req.body ?? {};
    if (typeof importId !== "string" || !importId.trim() || !Array.isArray(rows) || rows.length > MAX_JOURNAL_ROWS || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
      throw badRequest("Invalid journal import");
    }
    res.json(await services.importJournalBatch(uid, importId.trim(), rows));
  }));
  return router;
}

// server/mall/mallRouter.ts
import { createHash as createHash2, createHmac as createHmac2, randomBytes as randomBytes3, randomUUID as randomUUID2, timingSafeEqual as timingSafeEqual2 } from "node:crypto";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";

// src/utils/referenceWorksheets.ts
function referenceProofPayload({ id, blueprint }) {
  return JSON.stringify({ id, blueprint });
}
var REFERENCE_WORKSHEETS = [
  {
    id: "ref-xau-london",
    blueprint: {
      title: "London gold worksheet",
      primarySymbol: "XAUUSD",
      timeframe: "M15",
      sessionFocus: "LONDON",
      riskUsd: 60,
      slPoints: 1e3,
      tp1Points: 500,
      tp2Points: 1e3,
      tp3Points: 1800,
      checklistNotes: ["Confirm the gold contract point size.", "Record the planned risk before reviewing closed deals."]
    },
    description: ["Compare three gold distances against one fixed loss budget.", "\u0E40\u0E17\u0E35\u0E22\u0E1A\u0E23\u0E30\u0E22\u0E30\u0E17\u0E2D\u0E07\u0E04\u0E33\u0E2A\u0E32\u0E21\u0E23\u0E30\u0E14\u0E31\u0E1A\u0E01\u0E31\u0E1A\u0E07\u0E1A\u0E02\u0E32\u0E14\u0E17\u0E38\u0E19\u0E15\u0E48\u0E2D\u0E41\u0E1C\u0E19"],
    proofHash: "07bddca1a2b423510cd4d5f653069e9ef1229b6c8ba92c793686f5f38b55aa08"
  },
  {
    id: "ref-eur-asia",
    blueprint: {
      title: "Asia FX worksheet",
      primarySymbol: "EURUSD",
      timeframe: "M30",
      sessionFocus: "ASIA",
      riskUsd: 45,
      slPoints: 180,
      tp1Points: 120,
      tp2Points: 270,
      tp3Points: 450,
      checklistNotes: ["Record the broker point convention.", "Reconcile closed-session costs before comparing realized R."]
    },
    description: ["Review how spread and fees change the realized R of a closed FX session.", "\u0E17\u0E1A\u0E17\u0E27\u0E19\u0E1C\u0E25\u0E02\u0E2D\u0E07\u0E2A\u0E40\u0E1B\u0E23\u0E14\u0E41\u0E25\u0E30\u0E04\u0E48\u0E32\u0E18\u0E23\u0E23\u0E21\u0E40\u0E19\u0E35\u0E22\u0E21\u0E15\u0E48\u0E2D\u0E04\u0E48\u0E32 R \u0E2B\u0E25\u0E31\u0E07\u0E1B\u0E34\u0E14\u0E23\u0E2D\u0E1A\u0E1F\u0E2D\u0E40\u0E23\u0E47\u0E01\u0E0B\u0E4C"],
    proofHash: "706539252121ff6e45f763aeaa61297c0ce2327ad558e2510728c2241de6eed3"
  },
  {
    id: "ref-nas-ny",
    blueprint: {
      title: "New York index worksheet",
      primarySymbol: "NAS100",
      timeframe: "H1",
      sessionFocus: "NY",
      riskUsd: 80,
      slPoints: 2400,
      tp1Points: 1800,
      tp2Points: 3600,
      tp3Points: 6e3,
      checklistNotes: ["Check index contract specifications.", "Compare the modeled loss with remaining daily headroom."]
    },
    description: ["Measure index distances against the daily drawdown buffer.", "\u0E40\u0E17\u0E35\u0E22\u0E1A\u0E23\u0E30\u0E22\u0E30\u0E14\u0E31\u0E0A\u0E19\u0E35\u0E01\u0E31\u0E1A\u0E27\u0E07\u0E40\u0E07\u0E34\u0E19\u0E02\u0E32\u0E14\u0E17\u0E38\u0E19\u0E23\u0E32\u0E22\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E40\u0E2B\u0E25\u0E37\u0E2D"],
    proofHash: "813d1a9f4f21d82bdf5940a7134d085b5ce391765d2458bc5b2efed9dd203138"
  }
];

// server/mall/mallChatEngine.ts
import { randomUUID } from "node:crypto";

// src/types/mallChat.ts
var MALL_ZONES = [
  { id: "lounge-general", titleEn: "Trader Lounge", titleTh: "\u0E25\u0E32\u0E19\u0E2A\u0E19\u0E17\u0E19\u0E32\u0E27\u0E34\u0E19\u0E31\u0E22\u0E40\u0E17\u0E23\u0E14", descriptionEn: "Daily routines, risk discipline, and journal reflections.", descriptionTh: "\u0E01\u0E34\u0E08\u0E27\u0E31\u0E15\u0E23 \u0E27\u0E34\u0E19\u0E31\u0E22\u0E01\u0E32\u0E23\u0E1A\u0E23\u0E34\u0E2B\u0E32\u0E23\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E48\u0E22\u0E07 \u0E41\u0E25\u0E30\u0E1A\u0E17\u0E40\u0E23\u0E35\u0E22\u0E19\u0E08\u0E32\u0E01\u0E2A\u0E21\u0E38\u0E14\u0E40\u0E17\u0E23\u0E14" },
  { id: "xauusd-session", titleEn: "XAUUSD & Session Review", titleTh: "\u0E17\u0E1A\u0E17\u0E27\u0E19\u0E23\u0E2D\u0E1A\u0E40\u0E17\u0E23\u0E14 XAUUSD", descriptionEn: "Review completed sessions, drawdown, and realized R.", descriptionTh: "\u0E17\u0E1A\u0E17\u0E27\u0E19\u0E23\u0E2D\u0E1A\u0E40\u0E17\u0E23\u0E14\u0E17\u0E35\u0E48\u0E08\u0E1A\u0E41\u0E25\u0E49\u0E27 \u0E01\u0E32\u0E23\u0E25\u0E14\u0E25\u0E07\u0E02\u0E2D\u0E07\u0E1E\u0E2D\u0E23\u0E4C\u0E15 \u0E41\u0E25\u0E30\u0E04\u0E48\u0E32 R \u0E17\u0E35\u0E48\u0E40\u0E01\u0E34\u0E14\u0E02\u0E36\u0E49\u0E19\u0E08\u0E23\u0E34\u0E07" },
  { id: "prop-rules-qa", titleEn: "Prop Rules Q&A", titleTh: "\u0E16\u0E32\u0E21-\u0E15\u0E2D\u0E1A\u0E01\u0E15\u0E34\u0E01\u0E32\u0E01\u0E2D\u0E07\u0E17\u0E38\u0E19", descriptionEn: "Compare risk limits, drawdown rules, and consistency calculations.", descriptionTh: "\u0E40\u0E1B\u0E23\u0E35\u0E22\u0E1A\u0E40\u0E17\u0E35\u0E22\u0E1A\u0E27\u0E07\u0E40\u0E07\u0E34\u0E19\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E48\u0E22\u0E07 \u0E01\u0E0E Drawdown \u0E41\u0E25\u0E30\u0E01\u0E32\u0E23\u0E04\u0E33\u0E19\u0E27\u0E13\u0E04\u0E27\u0E32\u0E21\u0E2A\u0E21\u0E48\u0E33\u0E40\u0E2A\u0E21\u0E2D" },
  { id: "setup-showroom", titleEn: "Verified Setup Showroom", titleTh: "\u0E42\u0E0A\u0E27\u0E4C\u0E23\u0E39\u0E21\u0E0A\u0E38\u0E14\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32 MT5", descriptionEn: "Inspect 3-TP risk blueprints and historical MT5 evidence.", descriptionTh: "\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E1A\u0E25\u0E39\u0E1E\u0E23\u0E34\u0E19\u0E15\u0E4C\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E48\u0E22\u0E07 3-TP \u0E41\u0E25\u0E30\u0E2B\u0E25\u0E31\u0E01\u0E10\u0E32\u0E19\u0E22\u0E49\u0E2D\u0E19\u0E2B\u0E25\u0E31\u0E07\u0E08\u0E32\u0E01 MT5" }
];
var MALL_REACTIONS = ["\u{1F525}", "\u{1F6E1}\uFE0F", "\u{1F4CA}", "\u2705"];
var MALL_STATUSES = ["WAITING_SETUP", "HOLDING_ORDER", "CLOSED_FOR_DAY"];
function isMt5VerifiedMallPost(message) {
  return message.authorRole !== "example" && Boolean(message.verifiedBadge || message.snapshotAttachment?.snapshotUrl.startsWith("data:image/svg+xml;utf8,") || message.setupBlueprint?.proofHash && message.setupBlueprint.proofKind !== "reference");
}

// server/mall/mallChatEngine.ts
var DESK_ROOM_ZONE_ID = "xauusd-session";
var PRESENCE_TTL = 10 * 6e4;
var MESSAGE_LIMIT = 1e3;
var PAGE_SIZE = 40;
var RATE_WINDOW = 6e4;
var RATE_LIMIT = 10;
var RECEIPT_LIMIT = 5e3;
var absolutePrices = /\b(?:entry(?:\s+price)?|limit\s+price|stop\s+price|take\s+profit\s+price|(?:sl|tp[123]?)\s*price)\s*(?:[:=@]\s*)?\$?\d|(?:ราคาเข้า|จุดเข้า)\s*[:=@]?\s*\d/iu;
var signalPatterns = [
  absolutePrices,
  /\b(?:buy|sell|long|short)\s+(?:now\b|(?:limit|stop)\s+(?:[a-z][a-z0-9._-]+\s*)?[@:=]?\s*\d)/iu,
  /\b(?:buy|sell|long|short)\s+(?:[A-Z][A-Z0-9._-]+\s*)?(?:@|at\s+|:\s*)\s*\d/iu,
  /\[\s*trade setup\s*\]\s*(?:buy|sell|long|short)\b|\b(?:XAUUSD|EURUSD|NAS100)\s+(?:buy|sell|long|short)\s+(?:market\b|\d)/iu,
  /^\s*(?:(?:buy|sell|long|short)\s+(?:XAUUSD|EURUSD|NAS100)|(?:XAUUSD|EURUSD|NAS100)\s+(?:buy|sell|long|short))\s*[.!]?\s*$/imu,
  /\b(?:any|send|share|drop|give(?:\s+me)?|looking\s+for|need|want|get|join)\s+(?:(?:live|free|paid|vip|buy|sell|trade|trading|forex|xauusd)\s+){0,4}signals?\b/iu,
  /\b(?:live|vip|paid|premium|free)\s+(?:(?:trade|trading|forex)\s+)?signals?\b|\btrading\s+signal\s*:/iu,
  /\b(?:auto(?:mated)?[\s-]+copy[\s-]*(?:trade|trading)|copy[\s-]*(?:trade|trading)\s*(?:อัตโนมัติ|automatically|service|subscription)|(?:join|subscribe|enable|start|try|follow)\s+(?:(?:our|my|auto)\s+)?copy[\s-]*(?:trade|trading))|\bguaranteed\s+(?:profits?|returns?)\b/iu,
  /ซิก(?:แนน|แนล)\s*(?:แม่น|ฟรี|vip)|การันตี\s*(?:กำไร|ผลตอบแทน)|รับประกัน\s*กำไร|ฝาก\s*เทรด|(?:ขอ|แจก|ส่ง|ขาย|รับ)\s*(?:ซิก(?:แนน|แนล)|สัญญาณ(?:ซื้อขาย|เทรด))|(?:ซื้อ|ขาย|เข้า)\s*(?:[a-z][a-z0-9._-]+\s*)?(?:ตอนนี้|เดี๋ยวนี้|@\s*\d)/iu
];
function evaluateMallMessageSafeHarbor(text) {
  const normalized = text.normalize("NFKC").replace(/\u0E4D\u0E32/g, "\u0E33").replace(/[\u200B-\u200D\uFEFF]/g, "");
  if (!signalPatterns.some((pattern) => pattern.test(normalized))) return { allowed: true };
  return {
    allowed: false,
    code: "SIGNAL_LANGUAGE",
    reasonEn: "Share risk rules or completed-session statistics. Live calls, signal requests, and copy-trade promotions are restricted.",
    reasonTh: "\u0E41\u0E0A\u0E23\u0E4C\u0E01\u0E0E\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E48\u0E22\u0E07\u0E2B\u0E23\u0E37\u0E2D\u0E2A\u0E16\u0E34\u0E15\u0E34\u0E02\u0E2D\u0E07\u0E23\u0E2D\u0E1A\u0E17\u0E35\u0E48\u0E08\u0E1A\u0E41\u0E25\u0E49\u0E27 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E07\u0E14\u0E2A\u0E48\u0E07\u0E2B\u0E23\u0E37\u0E2D\u0E02\u0E2D\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E13\u0E2A\u0E14\u0E41\u0E25\u0E30\u0E42\u0E1B\u0E23\u0E42\u0E21\u0E15\u0E01\u0E32\u0E23\u0E04\u0E31\u0E14\u0E25\u0E2D\u0E01\u0E40\u0E17\u0E23\u0E14"
  };
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function str(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function boundedNumber(value, min, max) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : void 0;
}
function identifier(value) {
  return typeof value === "string" && /^[a-z0-9._:-]{1,120}$/i.test(value) ? value : void 0;
}
function mallSymbol(value) {
  const symbol = str(value, 24).toUpperCase();
  return /^[A-Z0-9][A-Z0-9._-]{0,19}$/.test(symbol) ? symbol : void 0;
}
function mallHandle(value) {
  const handle = str(value, 40).normalize("NFKC").replace(/^@+|[\p{Cc}\p{Cf}]/gu, "").trim().slice(0, 39);
  return handle ? "@" + handle.toLowerCase() : "@trader_you";
}
function isMallZoneId(value) {
  return MALL_ZONES.some((zone) => zone.id === value);
}
function safeBlueprintText(value, max) {
  const text = str(value, max);
  const normalized = text.normalize("NFKC").replace(/\u0E4D\u0E32/g, "\u0E33").replace(/[\u200B-\u200D\uFEFF]/g, "");
  if (!evaluateMallMessageSafeHarbor(text).allowed || /\b(?:sl|tp[123]?)\s*[:=@]\s*\$?\d/iu.test(normalized)) return "";
  return text;
}
function sanitizeMallSetupBlueprint(value) {
  const input = object(value);
  const title = safeBlueprintText(input.title, 90);
  const primarySymbol = mallSymbol(input.primarySymbol);
  const timeframe = safeBlueprintText(input.timeframe, 24);
  const sessionFocus = safeBlueprintText(input.sessionFocus, 24);
  const riskUsd = boundedNumber(input.riskUsd, 0.01, 1e6);
  const slPoints = boundedNumber(input.slPoints, 0.01, 1e7);
  const tp1Points = boundedNumber(input.tp1Points, 0.01, 1e7);
  const tp2Points = boundedNumber(input.tp2Points, 0.01, 1e7);
  const tp3Points = boundedNumber(input.tp3Points, 0.01, 1e7);
  if (!title || !primarySymbol || !timeframe || !sessionFocus || !riskUsd || !slPoints || !tp1Points || !tp2Points || !tp3Points) return void 0;
  const checklistNotes = Array.isArray(input.checklistNotes) ? input.checklistNotes.slice(0, 12).map((note) => safeBlueprintText(note, 150)).filter(Boolean) : [];
  const listingId = identifier(input.listingId);
  const proofHash = typeof input.proofHash === "string" && /^[a-f0-9]{64}$/i.test(input.proofHash) ? input.proofHash : void 0;
  const winRatePct = boundedNumber(input.winRatePct, 0, 100);
  const profitFactor = boundedNumber(input.profitFactor, 0, 1e4);
  return {
    title,
    primarySymbol,
    timeframe,
    sessionFocus,
    riskUsd,
    slPoints,
    tp1Points,
    tp2Points,
    tp3Points,
    checklistNotes,
    ...listingId && { listingId },
    ...proofHash && { proofHash },
    ...winRatePct !== void 0 && { winRatePct },
    ...profitFactor !== void 0 && { profitFactor }
  };
}
function sanitizeMallSnapshot(value, verifyInternal) {
  const raw = object(value);
  const snapshotId = identifier(raw.snapshotId);
  const symbol = mallSymbol(raw.symbol);
  const capturedAtMs = typeof raw.capturedAt === "string" ? Date.parse(raw.capturedAt) : NaN;
  if (!snapshotId || !symbol || !Number.isFinite(capturedAtMs) || typeof raw.snapshotUrl !== "string") return void 0;
  const snapshotUrl = raw.snapshotUrl;
  const rMultiple = boundedNumber(raw.rMultiple, -1e3, 1e3);
  const session = safeBlueprintText(raw.session, 40);
  const snapshot = {
    snapshotId,
    snapshotUrl,
    symbol,
    capturedAt: new Date(capturedAtMs).toISOString(),
    ...rMultiple !== void 0 && { rMultiple },
    ...session && { session }
  };
  const isCdn = /^https:\/\/cdn\.tallynx\.com\/snapshots\/(?:[\w-]+\/)*[\w.-]+\.(?:svg|png|webp|jpe?g)$/i.test(snapshotUrl);
  const isInternal = snapshotUrl.length <= 24e3 && snapshotUrl.startsWith("data:image/svg+xml;utf8,") && verifyInternal?.(snapshot, raw.proof);
  return isCdn || isInternal ? snapshot : void 0;
}
function sessionPill(value) {
  const input = object(value);
  const status = MALL_STATUSES.find((item) => item === input.status);
  if (!status) return void 0;
  return {
    status,
    rMultipleToday: boundedNumber(input.rMultipleToday, -1e3, 1e3) ?? 0,
    sessionLabel: safeBlueprintText(input.sessionLabel, 40) || "Today"
  };
}
var MallChatError = class extends Error {
  constructor(status, code, reasonEn, reasonTh = reasonEn, retryAfterSec) {
    super(reasonEn);
    this.status = status;
    this.code = code;
    this.reasonEn = reasonEn;
    this.reasonTh = reasonTh;
    this.retryAfterSec = retryAfterSec;
  }
};
var STARTER_BASE_EPOCH_MS = Date.parse("2026-11-20T04:00:00.000Z");
var STARTER_VERSION = 2;
var sampleAudit = {
  channel: "MANUAL_XLSX",
  brokerName: "Editorial sample",
  verifiedAt: "2026-11-19T16:00:00.000Z"
};
var [goldSheet, fxSheet, indexSheet] = REFERENCE_WORKSHEETS;
var starterPosts = {
  "lounge-general": [
    { handle: "@mall_editorial", text: "Flat-day journal review. We record the opening risk budget, the last drawdown check and the time the desk signed off. A zero-P&L session can still have a complete audit trail." },
    { handle: "@siam_prop_risk", text: "\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E44\u0E21\u0E48\u0E21\u0E35\u0E14\u0E35\u0E25 \u0E1C\u0E21\u0E40\u0E01\u0E47\u0E1A\u0E40\u0E27\u0E25\u0E32\u0E23\u0E35\u0E40\u0E0B\u0E47\u0E15\u0E23\u0E2D\u0E1A\u0E41\u0E25\u0E30\u0E27\u0E07\u0E40\u0E07\u0E34\u0E19\u0E02\u0E32\u0E14\u0E17\u0E38\u0E19\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D\u0E44\u0E27\u0E49\u0E43\u0E19\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01 \u0E16\u0E49\u0E32\u0E21\u0E35\u0E04\u0E48\u0E32\u0E18\u0E23\u0E23\u0E21\u0E40\u0E19\u0E35\u0E22\u0E21\u0E02\u0E49\u0E32\u0E21\u0E27\u0E31\u0E19 \u0E04\u0E38\u0E13\u0E25\u0E07\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E44\u0E27\u0E49\u0E17\u0E35\u0E48\u0E23\u0E2D\u0E1A\u0E44\u0E2B\u0E19?" },
    { handle: "@asia_review", symbol: "EURUSD", setupBlueprint: fxSheet.blueprint, text: "This EURUSD worksheet uses a fixed cash budget. Compare all three distances in broker points before discussing how the same budget behaves across sessions." },
    { handle: "@journal_desk", text: "\u0E1C\u0E21\u0E40\u0E01\u0E47\u0E1A\u0E17\u0E31\u0E49\u0E07\u0E40\u0E27\u0E25\u0E32\u0E08\u0E32\u0E01 statement \u0E41\u0E25\u0E30\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E15\u0E32\u0E21\u0E01\u0E0E\u0E1E\u0E2D\u0E23\u0E4C\u0E15 \u0E08\u0E36\u0E07\u0E22\u0E49\u0E2D\u0E19\u0E14\u0E39\u0E44\u0E14\u0E49\u0E27\u0E48\u0E32\u0E04\u0E48\u0E32\u0E18\u0E23\u0E23\u0E21\u0E40\u0E19\u0E35\u0E22\u0E21\u0E19\u0E31\u0E49\u0E19\u0E2D\u0E22\u0E39\u0E48\u0E43\u0E19\u0E23\u0E2D\u0E1A\u0E44\u0E2B\u0E19\u0E42\u0E14\u0E22\u0E44\u0E21\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E41\u0E01\u0E49\u0E22\u0E2D\u0E14\u0E40\u0E14\u0E34\u0E21" }
  ],
  "xauusd-session": [
    { handle: "@xau_london_desk", symbol: "XAUUSD", text: "London close review. In this sample the gross result was +0.72R and costs were 0.12R. The journal therefore closes at +0.60R.", sessionStatusPill: { status: "CLOSED_FOR_DAY", rMultipleToday: 0.6, sessionLabel: "London" } },
    { handle: "@mt5_reconcile", symbol: "XAUUSD", verifiedBadge: sampleAudit, text: "In a statement audit, how do you treat partial closes? Counting each fill as a separate risk decision changes the denominator of the win rate." },
    { handle: "@london_3tp_audit", symbol: "XAUUSD", setupBlueprint: goldSheet.blueprint, text: "\u0E40\u0E17\u0E35\u0E22\u0E1A\u0E23\u0E30\u0E22\u0E30\u0E17\u0E31\u0E49\u0E07\u0E2A\u0E32\u0E21\u0E23\u0E30\u0E14\u0E31\u0E1A\u0E40\u0E1B\u0E47\u0E19 R \u0E02\u0E2D\u0E07\u0E07\u0E1A\u0E40\u0E14\u0E35\u0E22\u0E27\u0E01\u0E31\u0E19\u0E01\u0E48\u0E2D\u0E19 \u0E41\u0E25\u0E49\u0E27\u0E08\u0E36\u0E07\u0E40\u0E17\u0E35\u0E22\u0E1A\u0E01\u0E31\u0E1A R \u0E17\u0E35\u0E48\u0E40\u0E01\u0E34\u0E14\u0E02\u0E36\u0E49\u0E19\u0E08\u0E23\u0E34\u0E07\u0E2B\u0E25\u0E31\u0E07\u0E2B\u0E31\u0E01\u0E04\u0E48\u0E32\u0E43\u0E0A\u0E49\u0E08\u0E48\u0E32\u0E22\u0E43\u0E19\u0E23\u0E2D\u0E1A\u0E25\u0E2D\u0E19\u0E14\u0E2D\u0E19\u0E17\u0E35\u0E48\u0E1B\u0E34\u0E14\u0E41\u0E25\u0E49\u0E27" },
    { handle: "@xau_london_desk", text: "Group the fills by position identifier and keep the original tickets in the review. This preserves the costs while counting each completed position once." }
  ],
  "prop-rules-qa": [
    { handle: "@prop_rule_auditor", text: "Consistency worksheet. For a rule defined as best day divided by net cycle profit, a $240 best day over a $600 cycle is 40%. Record the rule version beside the denominator." },
    { handle: "@siam_prop_risk", text: "\u0E40\u0E27\u0E25\u0E32\u0E17\u0E35\u0E48\u0E01\u0E2D\u0E07\u0E17\u0E38\u0E19\u0E23\u0E35\u0E40\u0E0B\u0E47\u0E15\u0E27\u0E31\u0E19\u0E15\u0E48\u0E32\u0E07\u0E08\u0E32\u0E01\u0E40\u0E27\u0E25\u0E32\u0E44\u0E17\u0E22 \u0E16\u0E49\u0E32\u0E14\u0E35\u0E25\u0E1B\u0E34\u0E14\u0E04\u0E23\u0E48\u0E2D\u0E21\u0E23\u0E2D\u0E1A \u0E04\u0E38\u0E13\u0E40\u0E01\u0E47\u0E1A\u0E2B\u0E25\u0E31\u0E01\u0E10\u0E32\u0E19\u0E40\u0E27\u0E25\u0E32\u0E2D\u0E30\u0E44\u0E23\u0E44\u0E27\u0E49\u0E43\u0E2B\u0E49\u0E15\u0E23\u0E27\u0E08\u0E22\u0E2D\u0E14\u0E02\u0E32\u0E14\u0E17\u0E38\u0E19\u0E23\u0E32\u0E22\u0E27\u0E31\u0E19\u0E0B\u0E49\u0E33\u0E44\u0E14\u0E49?" },
    { handle: "@risk_control", symbol: "NAS100", setupBlueprint: indexSheet.blueprint, text: "Use the index worksheet to compare one modeled loss with remaining daily headroom. Log any commissions separately so the distance budget and historical costs stay traceable." },
    { handle: "@prop_rule_auditor", text: "\u0E1C\u0E21\u0E40\u0E01\u0E47\u0E1A\u0E40\u0E27\u0E25\u0E32\u0E40\u0E0B\u0E34\u0E23\u0E4C\u0E1F\u0E40\u0E27\u0E2D\u0E23\u0E4C \u0E40\u0E27\u0E25\u0E32\u0E44\u0E17\u0E22 \u0E41\u0E25\u0E30\u0E40\u0E02\u0E15\u0E40\u0E27\u0E25\u0E32\u0E17\u0E35\u0E48\u0E23\u0E30\u0E1A\u0E38\u0E43\u0E19\u0E01\u0E0E\u0E02\u0E2D\u0E07\u0E1E\u0E2D\u0E23\u0E4C\u0E15\u0E44\u0E27\u0E49\u0E14\u0E49\u0E27\u0E22\u0E01\u0E31\u0E19 \u0E08\u0E32\u0E01\u0E19\u0E31\u0E49\u0E19\u0E23\u0E27\u0E21\u0E22\u0E2D\u0E14\u0E15\u0E32\u0E21\u0E27\u0E31\u0E19\u0E02\u0E2D\u0E07\u0E01\u0E2D\u0E07\u0E17\u0E38\u0E19" }
  ],
  "setup-showroom": [
    { handle: "@showroom_curator", symbol: "XAUUSD", setupBlueprint: goldSheet.blueprint, text: "Gold worksheet for a fixed $60 risk budget. Inspect the stop and all three target distances, then check the point convention against the historical report." },
    { handle: "@asia_review", symbol: "EURUSD", setupBlueprint: fxSheet.blueprint, text: "\u0E40\u0E27\u0E34\u0E23\u0E4C\u0E01\u0E0A\u0E35\u0E15 EURUSD \u0E19\u0E35\u0E49\u0E43\u0E0A\u0E49 point \u0E15\u0E32\u0E21\u0E2A\u0E40\u0E1B\u0E01\u0E2B\u0E49\u0E32\u0E15\u0E33\u0E41\u0E2B\u0E19\u0E48\u0E07 \u0E40\u0E27\u0E25\u0E32\u0E40\u0E17\u0E35\u0E22\u0E1A\u0E1C\u0E25\u0E22\u0E49\u0E2D\u0E19\u0E2B\u0E25\u0E31\u0E07 \u0E04\u0E38\u0E13\u0E15\u0E23\u0E27\u0E08\u0E01\u0E32\u0E23\u0E41\u0E1B\u0E25\u0E07 pip \u0E40\u0E1B\u0E47\u0E19 point \u0E2D\u0E22\u0E48\u0E32\u0E07\u0E44\u0E23?" },
    { handle: "@quant_guard_ny", symbol: "NAS100", setupBlueprint: indexSheet.blueprint, text: "Index worksheet. Compare the distance ladder with the available loss buffer, then document whether the closed-session sample used the same contract size." },
    { handle: "@showroom_curator", text: "\u0E1C\u0E21\u0E08\u0E14\u0E08\u0E33\u0E19\u0E27\u0E19\u0E2B\u0E25\u0E31\u0E01\u0E17\u0E28\u0E19\u0E34\u0E22\u0E21\u0E41\u0E25\u0E30\u0E08\u0E33\u0E19\u0E27\u0E19 point \u0E15\u0E48\u0E2D pip \u0E08\u0E32\u0E01\u0E2A\u0E40\u0E1B\u0E01\u0E2A\u0E31\u0E0D\u0E0D\u0E32 \u0E41\u0E25\u0E49\u0E27\u0E25\u0E2D\u0E07\u0E41\u0E1B\u0E25\u0E07\u0E23\u0E30\u0E22\u0E30\u0E2B\u0E19\u0E36\u0E48\u0E07\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E01\u0E25\u0E31\u0E1A\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E15\u0E23\u0E27\u0E08\u0E17\u0E32\u0E19" }
  ]
};
function starterMessages(zoneId) {
  return starterPosts[zoneId].map((post, index) => ({
    ...post,
    id: "example-" + zoneId + "-" + (index + 1),
    clientMessageId: "example-" + (index + 1),
    zoneId,
    authorRole: "example",
    createdAt: new Date(STARTER_BASE_EPOCH_MS - (4 - index) * 6e4).toISOString(),
    replyCount: 0,
    reactions: {},
    ...index === 3 && { threadRootId: "example-" + zoneId + "-2" }
  }));
}
function toDeskRoomMessage(message) {
  return {
    id: message.id,
    handle: message.handle,
    text: message.text,
    symbol: message.symbol || "XAUUSD",
    createdAt: message.createdAt.slice(11, 16),
    isTradeIdea: false
  };
}
var statusTh = {
  WAITING_SETUP: "\u0E23\u0E2D\u0E41\u0E1C\u0E19\u0E17\u0E35\u0E48\u0E1C\u0E48\u0E32\u0E19\u0E40\u0E01\u0E13\u0E11\u0E4C",
  HOLDING_ORDER: "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E16\u0E37\u0E2D\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C",
  CLOSED_FOR_DAY: "\u0E1B\u0E34\u0E14\u0E08\u0E1A\u0E27\u0E31\u0E19\u0E41\u0E25\u0E49\u0E27"
};
function toDeskRoomPresence(item) {
  return {
    ...item,
    role: item.verifiedChannel ? "Verified Trader" : "Trader",
    statusLabelTh: statusTh[item.status],
    updatedAt: item.updatedAt.slice(11, 16)
  };
}
function createMallChatEngine(options = {}) {
  const now = options.now ?? Date.now;
  const newId = options.newId ?? randomUUID;
  const rooms = new Map(MALL_ZONES.map(({ id }) => [id, []]));
  for (const message of options.stored?.messages ?? []) {
    if (message && isMallZoneId(message.zoneId)) rooms.get(message.zoneId).push(message);
  }
  const reactionReceipts = new Set(options.stored?.reactionReceipts ?? []);
  const presence = new Map(MALL_ZONES.map(({ id }) => [id, /* @__PURE__ */ new Map()]));
  const legacyPresence = /* @__PURE__ */ new Map();
  const rates = /* @__PURE__ */ new Map();
  let nextRateSweep = 0;
  const save = () => options.persist?.({ starterVersion: STARTER_VERSION, messages: [...rooms.values()].flat(), reactionReceipts: [...reactionReceipts] });
  const room = (zoneId) => rooms.get(zoneId);
  function trimRoom(zoneId) {
    const messages = room(zoneId);
    if (messages.length <= MESSAGE_LIMIT) return;
    const roots = new Set(messages.filter((message) => !message.threadRootId).map((message) => message.id));
    const retained = /* @__PURE__ */ new Set();
    for (let index = messages.length - 1; index >= 0 && retained.size < MESSAGE_LIMIT; index -= 1) {
      const { id, threadRootId } = messages[index];
      if (threadRootId && !retained.has(threadRootId)) {
        if (retained.size === MESSAGE_LIMIT - 1 || !roots.has(threadRootId)) continue;
        retained.add(threadRootId);
      }
      retained.add(id);
    }
    const counts = /* @__PURE__ */ new Map();
    const connected = messages.filter(({ id, threadRootId }) => {
      if (!retained.has(id)) return false;
      if (threadRootId) counts.set(threadRootId, (counts.get(threadRootId) ?? 0) + 1);
      return true;
    });
    rooms.set(zoneId, connected.map((message) => {
      const replyCount = counts.get(message.id) ?? 0;
      return replyCount === message.replyCount ? message : { ...message, replyCount };
    }));
  }
  function importLegacyMessages(entries) {
    const messages = room(DESK_ROOM_ZONE_ID);
    const existingIds = new Set(messages.map((message) => message.id));
    let changed = false;
    for (const entry of entries.slice(-60)) {
      const input = object(entry);
      const id = identifier(input.id);
      const text = str(input.text, 500);
      if (!id || existingIds.has(id) || !text || input.isTradeIdea === true || !evaluateMallMessageSafeHarbor(text).allowed) continue;
      const rawDate = str(input.createdAt, 40);
      const assumedDate = new Date(now()).toISOString().slice(0, 10);
      const stamp = Date.parse(/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(rawDate) ? assumedDate + "T" + rawDate + ":00Z" : rawDate);
      messages.push({
        id,
        text,
        clientMessageId: id,
        zoneId: DESK_ROOM_ZONE_ID,
        handle: mallHandle(input.handle),
        authorRole: "trader",
        symbol: mallSymbol(input.symbol) || "XAUUSD",
        createdAt: new Date(Number.isFinite(stamp) ? stamp : now()).toISOString(),
        replyCount: 0,
        reactions: {}
      });
      existingIds.add(id);
      changed = true;
    }
    if (changed) {
      messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      trimRoom(DESK_ROOM_ZONE_ID);
    }
    return changed;
  }
  if (!options.stored) importLegacyMessages(options.legacyMessages ?? []);
  if (options.stored?.starterVersion !== STARTER_VERSION) {
    for (const { id } of MALL_ZONES) {
      const existing = room(id);
      if (existing.length >= MESSAGE_LIMIT) continue;
      const byId = new Map(existing.map((item) => [item.id, item]));
      for (const post2 of starterMessages(id)) {
        const previous = byId.get(post2.id);
        if (previous && (previous.authorRole !== "example" || previous.replyCount || Object.keys(previous.reactions).length)) continue;
        byId.set(post2.id, post2);
      }
      const merged = [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const replyCounts = /* @__PURE__ */ new Map();
      for (const item of merged) {
        if (item.threadRootId) replyCounts.set(item.threadRootId, (replyCounts.get(item.threadRootId) ?? 0) + 1);
      }
      rooms.set(id, merged.map((item) => ({ ...item, replyCount: replyCounts.get(item.id) ?? 0 })));
      trimRoom(id);
    }
    save();
  }
  function activePresence(zoneId) {
    const traders = presence.get(zoneId);
    const cutoff = now() - PRESENCE_TTL;
    for (const [id, trader] of traders) {
      if (Date.parse(trader.updatedAt) <= cutoff) traders.delete(id);
    }
    const active = new Map(traders);
    if (zoneId === DESK_ROOM_ZONE_ID) {
      for (const [id, trader] of legacyPresence) {
        if (Date.parse(trader.updatedAt) <= cutoff) legacyPresence.delete(id);
        else if (!active.has(id)) active.set(id, trader);
      }
    }
    return [...active.values()].sort((a, b) => Number(Boolean(b.verifiedChannel)) - Number(Boolean(a.verifiedChannel)) || b.updatedAt.localeCompare(a.updatedAt));
  }
  function list(zoneId, cursor, threadRootId) {
    const all = room(zoneId);
    const messages = threadRootId ? all.filter((item) => item.id === threadRootId || item.threadRootId === threadRootId) : all.filter((item) => !item.threadRootId);
    const cursorIndex = cursor ? messages.findIndex((message) => message.id === cursor) : -1;
    if (cursor && cursorIndex < 0) return { messages: [], presence: activePresence(zoneId), cursor: null };
    const end = cursorIndex >= 0 ? cursorIndex : messages.length;
    const start = Math.max(0, end - PAGE_SIZE);
    return { messages: messages.slice(start, end), presence: activePresence(zoneId), cursor: start > 0 ? messages[start].id : null };
  }
  function zones() {
    return MALL_ZONES.map((zone) => {
      const recent = room(zone.id).at(-1);
      const online = activePresence(zone.id);
      return {
        ...zone,
        presence: online,
        activeCount: online.length,
        messageCount: room(zone.id).length,
        blueprintCount: room(zone.id).filter((item) => !item.threadRootId && item.setupBlueprint).length,
        verifiedPostCount: room(zone.id).filter((item) => !item.threadRootId && isMt5VerifiedMallPost(item)).length,
        latestMessagePreview: recent ? { id: recent.id, handle: recent.handle, text: recent.text, createdAt: recent.createdAt } : null
      };
    });
  }
  function useRate(handle, ip, ts) {
    if (ts >= nextRateSweep) {
      for (const [key, timestamps] of rates) {
        if (timestamps.at(-1) <= ts - RATE_WINDOW) rates.delete(key);
      }
      nextRateSweep = ts + RATE_WINDOW;
    }
    const buckets = ["handle:" + handle, "ip:" + ip].map((key) => [key, (rates.get(key) ?? []).filter((time) => time > ts - RATE_WINDOW)]);
    const delay = Math.max(...buckets.map(([, timestamps]) => timestamps.length >= RATE_LIMIT ? Math.ceil((timestamps[0] + RATE_WINDOW - ts) / 1e3) : 0));
    if (delay > 0) throw new MallChatError(429, "RATE_LIMITED", "Message limit reached. Try again shortly.", "\u0E2A\u0E48\u0E07\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E16\u0E36\u0E07\u0E02\u0E35\u0E14\u0E08\u0E33\u0E01\u0E31\u0E14\u0E41\u0E25\u0E49\u0E27 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E2D\u0E2A\u0E31\u0E01\u0E04\u0E23\u0E39\u0E48", delay);
    for (const [key, timestamps] of buckets) rates.set(key, [...timestamps, ts]);
  }
  function post(zoneId, input, ip, trusted = {}) {
    const handle = mallHandle(input.handle);
    const clientMessageId = identifier(input.clientMessageId);
    if (!clientMessageId) throw new MallChatError(400, "INVALID_MESSAGE_ID", "A valid client message ID is required.");
    const messages = room(zoneId);
    const existing = messages.find((item) => item.handle === handle && item.clientMessageId === clientMessageId);
    if (existing) return { message: existing, created: false };
    const text = str(input.text, 2e3);
    const verdict = evaluateMallMessageSafeHarbor(text);
    if ("code" in verdict) throw new MallChatError(422, verdict.code, verdict.reasonEn, verdict.reasonTh);
    if (input.isTradeIdea === true) {
      throw new MallChatError(422, "SIGNAL_LANGUAGE", "Share a risk or completed-session review.", "\u0E41\u0E0A\u0E23\u0E4C\u0E01\u0E32\u0E23\u0E17\u0E1A\u0E17\u0E27\u0E19\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E48\u0E22\u0E07\u0E2B\u0E23\u0E37\u0E2D\u0E23\u0E2D\u0E1A\u0E17\u0E35\u0E48\u0E08\u0E1A\u0E41\u0E25\u0E49\u0E27");
    }
    const rawBlueprint = object(input.setupBlueprint);
    if (rawBlueprint.listingId && !trusted.setupBlueprint) {
      throw new MallChatError(400, "INVALID_LISTING", "This verified Marketplace listing is unavailable.", "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23 Marketplace \u0E17\u0E35\u0E48\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19");
    }
    const setupBlueprint = trusted.setupBlueprint || sanitizeMallSetupBlueprint({
      ...rawBlueprint,
      proofHash: void 0,
      winRatePct: void 0,
      profitFactor: void 0
    });
    const snapshotAttachment = sanitizeMallSnapshot(input.snapshotAttachment, trusted.verifyInternalSnapshot);
    const sessionStatusPill = sessionPill(input.sessionStatusPill);
    if (input.setupBlueprint != null && !setupBlueprint || input.snapshotAttachment != null && !snapshotAttachment || input.sessionStatusPill != null && !sessionStatusPill) {
      throw new MallChatError(400, "INVALID_ATTACHMENT", "One of the attachments is invalid or unavailable.", "\u0E44\u0E1F\u0E25\u0E4C\u0E41\u0E19\u0E1A\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07\u0E2B\u0E23\u0E37\u0E2D\u0E44\u0E21\u0E48\u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19");
    }
    if (!(text || setupBlueprint || snapshotAttachment || sessionStatusPill)) {
      throw new MallChatError(400, "EMPTY_MESSAGE", "Enter a message or add an attachment.", "\u0E1E\u0E34\u0E21\u0E1E\u0E4C\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E2B\u0E23\u0E37\u0E2D\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E44\u0E1F\u0E25\u0E4C\u0E41\u0E19\u0E1A");
    }
    const threadRootId = identifier(input.threadRootId);
    const rootIndex = threadRootId ? messages.findIndex((item) => item.id === threadRootId && !item.threadRootId) : -1;
    if (input.threadRootId != null && rootIndex < 0) throw new MallChatError(404, "THREAD_NOT_FOUND", "This thread is no longer available.", "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E40\u0E18\u0E23\u0E14\u0E19\u0E35\u0E49");
    const ts = now();
    useRate(handle, ip, ts);
    const symbol = mallSymbol(input.symbol) || setupBlueprint?.primarySymbol || snapshotAttachment?.symbol || (zoneId === DESK_ROOM_ZONE_ID ? "XAUUSD" : void 0);
    const message = {
      id: newId(),
      clientMessageId,
      zoneId,
      handle,
      text,
      authorRole: "trader",
      createdAt: new Date(ts).toISOString(),
      replyCount: 0,
      reactions: {},
      ...symbol && { symbol },
      ...threadRootId && { threadRootId },
      ...trusted.verifiedBadge && { verifiedBadge: trusted.verifiedBadge },
      ...setupBlueprint && { setupBlueprint },
      ...snapshotAttachment && { snapshotAttachment },
      ...sessionStatusPill && { sessionStatusPill }
    };
    messages.push(message);
    if (rootIndex >= 0) messages[rootIndex] = { ...messages[rootIndex], replyCount: messages[rootIndex].replyCount + 1 };
    trimRoom(zoneId);
    save();
    return { message, created: true, threadRoot: threadRootId ? room(zoneId).find((item) => item.id === threadRootId) : void 0 };
  }
  function react(zoneId, messageId, input) {
    const emoji = MALL_REACTIONS.find((allowed) => allowed === input.emoji);
    const clientReactionId = identifier(input.clientReactionId);
    const active = typeof input.active === "boolean" ? input.active : void 0;
    if (!emoji || !clientReactionId && active === void 0) {
      throw new MallChatError(400, "INVALID_REACTION", "Choose a supported reaction and provide a reaction ID or desired state.", "\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E2D\u0E35\u0E42\u0E21\u0E08\u0E34\u0E17\u0E35\u0E48\u0E23\u0E2D\u0E07\u0E23\u0E31\u0E1A\u0E41\u0E25\u0E30\u0E23\u0E30\u0E1A\u0E38\u0E23\u0E2B\u0E31\u0E2A\u0E2B\u0E23\u0E37\u0E2D\u0E2A\u0E16\u0E32\u0E19\u0E30\u0E02\u0E2D\u0E07\u0E23\u0E35\u0E41\u0E2D\u0E47\u0E01\u0E0A\u0E31\u0E19");
    }
    const messages = room(zoneId);
    const index = messages.findIndex((message2) => message2.id === messageId);
    if (index < 0) throw new MallChatError(404, "MESSAGE_NOT_FOUND", "This message is no longer available.", "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E19\u0E35\u0E49");
    const message = messages[index];
    const handle = mallHandle(input.handle);
    const receipt = clientReactionId && JSON.stringify([zoneId, messageId, emoji, handle, clientReactionId]);
    if (receipt && reactionReceipts.has(receipt)) return { message, changed: false };
    const reactors = new Set(message.reactions[emoji] ?? []);
    const hadReaction = reactors.has(handle);
    const shouldReact = active ?? !hadReaction;
    if (shouldReact && reactors.size >= 500 && !hadReaction) {
      throw new MallChatError(429, "REACTION_LIMIT", "This reaction has reached its capacity.", "\u0E23\u0E35\u0E41\u0E2D\u0E47\u0E01\u0E0A\u0E31\u0E19\u0E19\u0E35\u0E49\u0E40\u0E15\u0E47\u0E21\u0E41\u0E25\u0E49\u0E27");
    }
    if (receipt) {
      reactionReceipts.add(receipt);
      if (reactionReceipts.size > RECEIPT_LIMIT) reactionReceipts.delete(reactionReceipts.values().next().value);
    }
    const reactions = { ...message.reactions };
    if (shouldReact) reactors.add(handle);
    else reactors.delete(handle);
    if (reactors.size > 0) reactions[emoji] = [...reactors];
    else delete reactions[emoji];
    const updated = { ...message, reactions };
    messages[index] = updated;
    save();
    return { message: updated, changed: shouldReact !== hadReaction };
  }
  function updatePresence(zoneId, input, verifiedChannel) {
    const handle = mallHandle(input.handle);
    const pill = sessionPill(input) ?? { status: "WAITING_SETUP", rMultipleToday: 0, sessionLabel: "Today" };
    activePresence(zoneId);
    presence.get(zoneId).set(handle, {
      id: handle,
      handle,
      ...pill,
      symbol: mallSymbol(input.symbol) || "XAUUSD",
      updatedAt: new Date(now()).toISOString(),
      ...verifiedChannel && { verifiedChannel }
    });
    return activePresence(zoneId);
  }
  function replaceLegacyPresence(entries) {
    legacyPresence.clear();
    const updatedAt = new Date(now()).toISOString();
    for (const entry of entries) {
      const input = object(entry);
      if (!str(input.handle, 40)) continue;
      const handle = mallHandle(input.handle);
      const pill = sessionPill(input);
      if (pill) legacyPresence.set(handle, { id: handle, handle, ...pill, symbol: mallSymbol(input.symbol) || "XAUUSD", updatedAt });
    }
  }
  return {
    zones,
    list,
    post,
    react,
    updatePresence,
    activePresence,
    replaceLegacyPresence,
    deskMessages: () => room(DESK_ROOM_ZONE_ID).filter((message) => !message.threadRootId && message.authorRole !== "example").slice(-30).map(toDeskRoomMessage),
    mergeDeskMessages: (entries) => {
      if (importLegacyMessages(entries)) save();
    }
  };
}

// server/mall/mallRouter.ts
var processSnapshotSecret = randomBytes3(32);
function loadJson(filename) {
  try {
    return JSON.parse(readFileSync(filename, "utf8"));
  } catch {
    return void 0;
  }
}
function respondError(res, error) {
  if (error instanceof MallChatError) {
    if (error.retryAfterSec) res.setHeader("Retry-After", error.retryAfterSec);
    res.status(error.status).json({
      ok: false,
      code: error.code,
      error: error.reasonEn,
      reasonEn: error.reasonEn,
      reasonTh: error.reasonTh,
      retryAfterSec: error.retryAfterSec
    });
    return;
  }
  throw error;
}
function hasListingProof(listing) {
  return /^[a-f0-9]{64}$/i.test(listing.proofHash) && listing.metrics?.tradeCount > 0 && Number.isFinite(Date.parse(listing.verifiedAt));
}
function createVerifiedSnapshot(source) {
  const symbol = mallSymbol(source.symbol);
  const timestamp = Date.parse(source.capturedAt);
  if (!symbol || !Number.isFinite(timestamp) || !Number.isFinite(source.pnl)) return void 0;
  const snapshotId = "closed-" + createHash2("sha256").update(source.reference + ":" + timestamp).digest("hex").slice(0, 20);
  const move = source.movement;
  const hasHistoricalPrices = move && move.open > 0 && move.close > 0;
  const closedUp = hasHistoricalPrices ? move.close >= move.open : source.pnl >= 0;
  const color = source.pnl >= 0 ? "#62d5b1" : "#f49d9d";
  const sign = source.pnl > 0 ? "+" : "";
  const closeY = closedUp ? 68 : 154;
  const graphic = hasHistoricalPrices ? '<path d="M32 110H190L430 ' + closeY + 'H608" fill="none" stroke="' + color + '" stroke-width="3"/><circle cx="190" cy="110" r="5" fill="' + color + '"/><circle cx="430" cy="' + closeY + '" r="5" fill="' + color + '"/><text x="32" y="176">OPEN</text><text x="550" y="176">CLOSE</text>' : '<rect x="32" y="109" width="576" height="1" fill="#39464d"/><circle cx="320" cy="110" r="8" fill="' + color + '"/><text x="32" y="176">CLOSED DEAL RECORD</text>';
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 200"><rect width="640" height="200" fill="#132128"/><path d="M32 64H608M32 110H608M32 156H608" stroke="#2a3b43"/><g fill="#c2d2d7" font-family="monospace" font-size="14"><text x="32" y="35">' + symbol + ' \xB7 CLOSED MT5 DEAL</text><text x="608" y="35" text-anchor="end" fill="' + color + '">' + sign + source.pnl.toFixed(2) + "</text>" + graphic + "</g></svg>";
  return {
    snapshotId,
    snapshotUrl: "data:image/svg+xml;utf8," + encodeURIComponent(svg),
    symbol,
    capturedAt: new Date(timestamp).toISOString()
  };
}
function createMallRouter(options) {
  const router = express.Router();
  const storePath = join(tmpdir(), "tallynx_mall_chat_v1.json");
  const legacy = loadJson(join(tmpdir(), "tallynx_desk_room_v1.json"));
  const loaded = loadJson(storePath);
  const engine = createMallChatEngine({
    stored: Array.isArray(loaded?.messages) ? { starterVersion: loaded.starterVersion, messages: loaded.messages, reactionReceipts: Array.isArray(loaded.reactionReceipts) ? loaded.reactionReceipts : [] } : void 0,
    legacyMessages: Array.isArray(legacy) ? legacy : [],
    persist: (store) => {
      const temporary = storePath + "." + randomUUID2() + ".tmp";
      try {
        writeFileSync(temporary, JSON.stringify(store), { encoding: "utf8", mode: 384 });
        renameSync(temporary, storePath);
      } catch {
        try {
          rmSync(temporary, { force: true });
        } catch {
        }
      }
    }
  });
  const { telemetryBus: telemetryBus2 } = options;
  const legacyBaseUrl = options.legacyBaseUrl.trim().replace(/\/+$/, "");
  const configuredSecret = (process.env.TALLYNX_MALL_SNAPSHOT_SECRET || process.env.TALLYNX_SSO_SECRET || process.env.SSO_SHARED_SECRET)?.trim();
  const snapshotSecret = configuredSecret && configuredSecret.length >= 16 ? configuredSecret : processSnapshotSecret;
  const snapshotSignature = (snapshot) => createHmac2("sha256", snapshotSecret).update("mall:snapshot:v1:" + JSON.stringify(snapshot)).digest("hex");
  function verifyInternalSnapshot(snapshot, proof) {
    return typeof proof === "string" && /^[a-f0-9]{64}$/.test(proof) && timingSafeEqual2(Buffer.from(proof, "hex"), Buffer.from(snapshotSignature(snapshot), "hex"));
  }
  async function resolveSource(req, channel) {
    if (channel === "LIVE_BRIDGE") {
      return options.bridgeSnapshot(req.get("X-Tredyn-Api-Key"));
    }
    if (channel !== "FUNDEDNEXT_MCP" && channel !== "MYFXBOOK_API") return void 0;
    const accountId = req.get("X-TallyNX-Mall-Account");
    if (!accountId || !/^[a-z0-9._:-]{1,120}$/i.test(accountId)) return void 0;
    const caller = await options.verifyUser(req.headers.authorization);
    if (!caller) return void 0;
    return options.connectedSnapshot(caller.uid, channel, accountId).catch(() => void 0);
  }
  let legacyRead;
  let nextLegacyRead = 0;
  let legacyAvailable = false;
  function readLegacyHistory() {
    if (!legacyBaseUrl) return Promise.resolve();
    if (legacyRead) return legacyRead;
    if (Date.now() < nextLegacyRead) return Promise.resolve();
    legacyAvailable = false;
    legacyRead = fetch(legacyBaseUrl + "/desk-room", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(2500)
    }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json();
      if (!data?.ok) return;
      legacyAvailable = true;
      if (Array.isArray(data.messages)) engine.mergeDeskMessages(data.messages);
      if (Array.isArray(data.participants)) engine.replaceLegacyPresence(data.participants);
    }).catch(() => {
    }).finally(() => {
      nextLegacyRead = Date.now() + 6e4;
      legacyRead = void 0;
    });
    return legacyRead;
  }
  function emit(event) {
    telemetryBus2.emit(event.type === "presence" ? "mall.presence" : "mall.chat", event);
    if (event.zoneId !== DESK_ROOM_ZONE_ID) return;
    if (event.type === "presence") {
      telemetryBus2.emit("desk_room_update", { type: "presence", participants: event.presence.map(toDeskRoomPresence) });
    } else if (event.type === "message" && !event.message.threadRootId) {
      const item = toDeskRoomMessage(event.message);
      telemetryBus2.emit("desk_room_update", { type: "message", item });
      if (legacyBaseUrl && item.text) {
        void fetch(legacyBaseUrl + "/desk-room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item }),
          signal: AbortSignal.timeout(2500)
        }).catch(() => {
        });
      }
    }
  }
  router.use(["/mall", "/desk-room"], (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  router.get("/mall/zones", (_req, res) => res.json({ ok: true, zones: engine.zones() }));
  router.get("/mall/zones/:zoneId/messages", async (req, res) => {
    const { zoneId } = req.params;
    if (!isMallZoneId(zoneId)) return res.status(404).json({ ok: false, code: "ZONE_NOT_FOUND" });
    if (zoneId === DESK_ROOM_ZONE_ID) await readLegacyHistory();
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : void 0;
    const thread = typeof req.query.threadRootId === "string" ? req.query.threadRootId : void 0;
    res.json({ ok: true, ...engine.list(zoneId, cursor, thread) });
  });
  async function postMessage(req, res, zoneId, legacyRequest = false) {
    try {
      const body = legacyRequest ? {
        handle: req.body?.handle,
        symbol: req.body?.symbol,
        text: String(req.body?.text || "").slice(0, 500),
        clientMessageId: req.body?.clientMessageId || req.body?.id || randomUUID2(),
        isTradeIdea: req.body?.isTradeIdea === true
      } : req.body || {};
      const rawListingId = body.setupBlueprint?.listingId;
      let setupBlueprint;
      const reference = REFERENCE_WORKSHEETS.find((item) => item.id === rawListingId);
      if (reference) {
        if (createHash2("sha256").update(referenceProofPayload(reference)).digest("hex") !== reference.proofHash) {
          throw new MallChatError(409, "REFERENCE_PROOF", "Worksheet proof mismatch.", "\u0E41\u0E2E\u0E0A\u0E02\u0E2D\u0E07\u0E40\u0E27\u0E34\u0E23\u0E4C\u0E01\u0E0A\u0E35\u0E15\u0E44\u0E21\u0E48\u0E15\u0E23\u0E07\u0E01\u0E31\u0E19");
        }
        setupBlueprint = { ...reference.blueprint, listingId: reference.id, proofHash: reference.proofHash, proofKind: "reference" };
      } else if (typeof rawListingId === "string" && /^[a-z0-9._:-]{1,120}$/i.test(rawListingId)) {
        const listing = options.localListings().find((entry) => entry.id === rawListingId) ?? (await options.listings()).find((entry) => entry.id === rawListingId);
        if (listing && hasListingProof(listing)) {
          setupBlueprint = sanitizeMallSetupBlueprint({
            ...listing.blueprint,
            title: listing.title,
            listingId: listing.id,
            proofHash: listing.proofHash,
            winRatePct: listing.metrics.winRatePct,
            profitFactor: listing.metrics.profitFactor,
            checklistNotes: listing.priceUsd > 0 ? [] : listing.blueprint.checklistNotes
          });
          if (!setupBlueprint) throw new MallChatError(
            422,
            "SIGNAL_LANGUAGE",
            "The listing title or setup labels need risk-only wording before they can be shared.",
            "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E1B\u0E23\u0E31\u0E1A\u0E0A\u0E37\u0E48\u0E2D\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E2B\u0E23\u0E37\u0E2D\u0E1B\u0E49\u0E32\u0E22\u0E01\u0E33\u0E01\u0E31\u0E1A\u0E0A\u0E38\u0E14\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32\u0E43\u0E2B\u0E49\u0E40\u0E1B\u0E47\u0E19\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E01\u0E35\u0E48\u0E22\u0E27\u0E01\u0E31\u0E1A\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E48\u0E22\u0E07\u0E01\u0E48\u0E2D\u0E19\u0E41\u0E0A\u0E23\u0E4C"
          );
        }
      }
      const source = await resolveSource(req, "verifiedChannel" in body ? body.verifiedChannel : void 0);
      const output = engine.post(zoneId, body, req.ip || req.socket.remoteAddress || "unknown", {
        setupBlueprint,
        verifiedBadge: source?.verifiedBadge,
        verifyInternalSnapshot
      });
      if (output.created) emit({ type: "message", zoneId, message: output.message, threadRoot: output.threadRoot });
      res.status(output.created && !legacyRequest ? 201 : 200).json(legacyRequest ? { ok: true, item: toDeskRoomMessage(output.message) } : { ok: true, message: output.message, threadRoot: output.threadRoot });
    } catch (error) {
      respondError(res, error);
    }
  }
  router.post("/mall/zones/:zoneId/messages", (req, res, next) => {
    const { zoneId } = req.params;
    if (!isMallZoneId(zoneId)) return res.status(404).json({ ok: false, code: "ZONE_NOT_FOUND" });
    void postMessage(req, res, zoneId).catch(next);
  });
  router.post("/mall/zones/:zoneId/messages/:messageId/reactions", (req, res) => {
    const { zoneId, messageId } = req.params;
    if (!isMallZoneId(zoneId)) return res.status(404).json({ ok: false, code: "ZONE_NOT_FOUND" });
    try {
      const { message, changed } = engine.react(zoneId, messageId, req.body || {});
      if (changed) emit({ type: "reaction", zoneId, message });
      res.json({ ok: true, message });
    } catch (error) {
      respondError(res, error);
    }
  });
  async function updatePresence(req, res, zoneId, legacyRequest = false) {
    const body = req.body || {};
    const source = await resolveSource(req, body.verifiedChannel);
    const local = engine.updatePresence(zoneId, body, source?.verifiedBadge.channel);
    if (zoneId === DESK_ROOM_ZONE_ID && legacyBaseUrl) {
      const current = local.find((item) => item.handle === mallHandle(body.handle));
      try {
        const response = await fetch(legacyBaseUrl + "/desk-room/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(2500),
          body: JSON.stringify(toDeskRoomPresence(current))
        });
        const data = response.ok ? await response.json() : null;
        if (data?.ok && Array.isArray(data.participants)) engine.replaceLegacyPresence(data.participants);
      } catch {
      }
    }
    const presence = engine.activePresence(zoneId);
    emit({ type: "presence", zoneId, presence });
    res.json(legacyRequest ? { ok: true, participants: presence.map(toDeskRoomPresence) } : { ok: true, presence });
  }
  router.post("/mall/zones/:zoneId/presence", (req, res, next) => {
    const { zoneId } = req.params;
    if (!isMallZoneId(zoneId)) return res.status(404).json({ ok: false, code: "ZONE_NOT_FOUND" });
    void updatePresence(req, res, zoneId).catch(next);
  });
  router.get("/mall/snapshots/latest", (req, res, next) => {
    void (async () => {
      const source = await resolveSource(req, req.get("X-TallyNX-Mall-Channel"));
      const snapshot = source && createVerifiedSnapshot(source);
      if (!snapshot) return res.status(404).json({ ok: false, code: "SNAPSHOT_UNAVAILABLE" });
      res.json({ ok: true, snapshot: { ...snapshot, proof: snapshotSignature(snapshot) } });
    })().catch(next);
  });
  router.get("/mall/stream", (_req, res) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    res.flushHeaders();
    const send = (event, payload) => {
      if (!res.writableEnded) res.write("data: " + JSON.stringify({ event, payload, ts: (/* @__PURE__ */ new Date()).toISOString() }) + "\n\n");
    };
    const heartbeat = () => send("mall.heartbeat", {});
    const chat = (event) => send("mall.chat", event);
    const presence = (event) => send("mall.presence", event);
    telemetryBus2.on("mall.chat", chat);
    telemetryBus2.on("mall.presence", presence);
    heartbeat();
    const timer = setInterval(heartbeat, 15e3);
    res.on("close", () => {
      clearInterval(timer);
      telemetryBus2.off("mall.chat", chat);
      telemetryBus2.off("mall.presence", presence);
    });
  });
  router.get("/desk-room", (_req, res, next) => {
    void readLegacyHistory().then(() => res.json({
      ok: true,
      room: "global-xauusd",
      messages: engine.deskMessages(),
      participants: engine.activePresence(DESK_ROOM_ZONE_ID).map(toDeskRoomPresence),
      persistentStore: legacyAvailable ? "VPS01" : "LOCAL_FALLBACK"
    })).catch(next);
  });
  router.post("/desk-room", (req, res, next) => void postMessage(req, res, DESK_ROOM_ZONE_ID, true).catch(next));
  router.post("/desk-room/presence", (req, res, next) => void updatePresence(req, res, DESK_ROOM_ZONE_ID, true).catch(next));
  return router;
}

// src/utils/marketplaceUtils.ts
function computeEmaSeries(closes, period) {
  if (closes.length === 0) return [];
  const k = 2 / (period + 1);
  const out = [closes[0]];
  for (let i = 1; i < closes.length; i++) {
    out.push(closes[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}
function computeRsi14(closes, period = 14) {
  if (closes.length <= period) return 50;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum += Math.abs(diff);
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return +(100 - 100 / (1 + rs)).toFixed(2);
}
function computeAtr14(candles, period = 14) {
  if (candles.length < 2) return 0;
  const startIdx = Math.max(1, candles.length - period);
  let sum = 0;
  let count = 0;
  for (let i = startIdx; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prevClose),
      Math.abs(c.low - prevClose)
    );
    sum += tr;
    count++;
  }
  return count > 0 ? +(sum / count).toFixed(4) : 0;
}
var TIMEFRAME_MS_MAP = {
  "5m": 5 * 60 * 1e3,
  "15m": 15 * 60 * 1e3,
  "1h": 60 * 60 * 1e3,
  "4h": 4 * 60 * 60 * 1e3,
  "1d": 24 * 60 * 60 * 1e3
};
function calibrateCandlesToLiveSpot(candles, liveSpotPrice, timeframe, shiftWholeSeries) {
  if (!Number.isFinite(liveSpotPrice) || liveSpotPrice <= 0 || candles.length === 0) {
    return candles;
  }
  const last = candles[candles.length - 1];
  const rawDelta = liveSpotPrice - last.close;
  if (Math.abs(rawDelta) / liveSpotPrice > 0.05) {
    return candles;
  }
  let series = candles.map((c) => ({ ...c }));
  if (shiftWholeSeries && Math.abs(rawDelta) > 1e-8) {
    series = series.map((c) => ({
      ...c,
      open: +(c.open + rawDelta).toFixed(4),
      high: +(c.high + rawDelta).toFixed(4),
      low: +(c.low + rawDelta).toFixed(4),
      close: +(c.close + rawDelta).toFixed(4)
    }));
  }
  const latest = series[series.length - 1];
  const tfMs = TIMEFRAME_MS_MAP[timeframe] || 15 * 60 * 1e3;
  const nowMs = Date.now();
  const isStaleBar = nowMs - latest.ts > tfMs * 1.5;
  if (isStaleBar) {
    const dt = new Date(nowMs);
    const label = timeframe === "1d" ? dt.toISOString().slice(5, 10) : `${dt.toISOString().slice(5, 10)} ${dt.toISOString().slice(11, 16)}`;
    const prevClose = latest.close;
    series.push({
      ts: nowMs,
      timeLabel: label,
      open: prevClose,
      high: Math.max(prevClose, liveSpotPrice),
      low: Math.min(prevClose, liveSpotPrice),
      close: +liveSpotPrice.toFixed(4),
      volume: 0
    });
  } else {
    latest.close = +liveSpotPrice.toFixed(4);
    latest.high = +Math.max(latest.high, liveSpotPrice).toFixed(4);
    latest.low = +Math.min(latest.low, liveSpotPrice).toFixed(4);
  }
  return series;
}
function computeLiveChartTelemetryFromCandles(symbol, timeframe, candles, source) {
  const valid = candles.filter(
    (c) => Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close) && c.close > 0
  );
  if (valid.length === 0) {
    throw new Error(`No valid OHLC candles available for ${symbol}`);
  }
  const closes = valid.map((c) => c.close);
  const latest = valid[valid.length - 1];
  const prev = valid.length >= 2 ? valid[valid.length - 2] : latest;
  const ema20Arr = computeEmaSeries(closes, 20);
  const ema50Arr = computeEmaSeries(closes, 50);
  const ema20 = +(ema20Arr[ema20Arr.length - 1] ?? latest.close).toFixed(4);
  const ema50 = +(ema50Arr[ema50Arr.length - 1] ?? latest.close).toFixed(4);
  const rsi14 = computeRsi14(closes, 14);
  const atr14 = computeAtr14(valid, 14);
  const recentStart = Math.max(0, valid.length - 24);
  let highMax = -Infinity;
  let lowMin = Infinity;
  for (let i = recentStart; i < valid.length; i++) {
    const c = valid[i];
    if (c.high > highMax) highMax = c.high;
    if (c.low < lowMin) lowMin = c.low;
  }
  const intradayHigh = +highMax.toFixed(4);
  const intradayLow = +lowMin.toFixed(4);
  let trendBias = "NEUTRAL";
  if (latest.close > ema20 && ema20 > ema50) {
    trendBias = "BULLISH";
  } else if (latest.close < ema20 && ema20 < ema50) {
    trendBias = "BEARISH";
  }
  const changeAbs = +(latest.close - prev.close).toFixed(4);
  const changePct = prev.close > 0 ? +(changeAbs / prev.close * 100).toFixed(3) : 0;
  return {
    symbol: symbol.toUpperCase(),
    timeframe,
    source,
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    currentPrice: +latest.close.toFixed(4),
    prevClose: +prev.close.toFixed(4),
    changeAbs,
    changePct,
    intradayHigh,
    intradayLow,
    ema20,
    ema50,
    rsi14,
    atr14,
    trendBias,
    supportLevel: intradayLow,
    resistanceLevel: intradayHigh,
    candles: valid.slice(-60)
  };
}
function maskMt5Login(login) {
  const clean = String(login || "").trim().replace(/^#/, "");
  if (!clean) return "****";
  if (clean.length <= 4) return clean[0] + "***";
  return `${clean.slice(0, 3)}***${clean.slice(-2)}`;
}
function validateVerifiedMt5Positions(positions) {
  if (!Array.isArray(positions)) {
    return { valid: [], rejectedCount: 0 };
  }
  const valid = [];
  let rejectedCount = 0;
  for (const raw of positions) {
    if (!raw || typeof raw !== "object") {
      rejectedCount++;
      continue;
    }
    const r = raw;
    const ticket = String(r.ticket || "").trim();
    const symbol = String(r.symbol || "").trim().toUpperCase();
    const dir = r.dir === "SELL" ? "SELL" : r.dir === "BUY" ? "BUY" : null;
    const openPrice = Number(r.openPrice);
    const closePrice = Number(r.closePrice);
    const volume = Number(r.volume);
    const netProfit = Number(r.netProfit);
    const closeDate = String(r.closeDate || "").trim();
    if (!ticket || !symbol || !dir || !Number.isFinite(openPrice) || openPrice <= 0 || !Number.isFinite(closePrice) || closePrice <= 0 || !Number.isFinite(volume) || volume <= 0 || !Number.isFinite(netProfit) || !/^\d{4}-\d{2}-\d{2}$/.test(closeDate)) {
      rejectedCount++;
      continue;
    }
    valid.push({
      ticket,
      symbol,
      dir,
      openDate: String(r.openDate || closeDate),
      openTime: String(r.openTime || "00:00"),
      openTs: Number(r.openTs) || Number(r.closeTs) || Date.now(),
      closeDate,
      closeTime: String(r.closeTime || "00:00"),
      closeTs: Number(r.closeTs) || Date.now(),
      volume: +volume.toFixed(2),
      openPrice,
      slPrice: Number(r.slPrice) || 0,
      tpPrice: Number(r.tpPrice) || 0,
      closePrice,
      commission: Number(r.commission) || 0,
      swap: Number(r.swap) || 0,
      rawProfit: Number(r.rawProfit ?? netProfit),
      netProfit: +netProfit.toFixed(2),
      comment: String(r.comment || "")
    });
  }
  return { valid, rejectedCount };
}
function computeVerifiedSetupMetrics(positions, initialDeposit = 1e4, alreadyValidated = false) {
  const valid = alreadyValidated ? positions : validateVerifiedMt5Positions(positions).valid;
  if (valid.length === 0) {
    throw new Error("Cannot build verified setup metrics: 0 valid MT5 positions provided.");
  }
  const sorted = [...valid].sort((a, b) => a.closeTs - b.closeTs);
  const startCap = initialDeposit > 0 ? initialDeposit : 1e4;
  let winCount = 0;
  let lossCount = 0;
  let grossProfitUsd = 0;
  let grossLossUsd = 0;
  let runningPnl = 0;
  let peakEquity = startCap;
  let maxDrawdownUsd = 0;
  let maxDrawdownPct = 0;
  const symbolSet = /* @__PURE__ */ new Set();
  const dayProfitMap = /* @__PURE__ */ new Map();
  const fullCurve = [];
  for (const pos of sorted) {
    symbolSet.add(pos.symbol);
    dayProfitMap.set(
      pos.closeDate,
      +((dayProfitMap.get(pos.closeDate) || 0) + pos.netProfit).toFixed(2)
    );
    if (pos.netProfit >= 0) {
      winCount++;
      grossProfitUsd += pos.netProfit;
    } else {
      lossCount++;
      grossLossUsd += Math.abs(pos.netProfit);
    }
    runningPnl = +(runningPnl + pos.netProfit).toFixed(2);
    const equityNow = +(startCap + runningPnl).toFixed(2);
    if (equityNow > peakEquity) {
      peakEquity = equityNow;
    }
    const ddUsd = +(peakEquity - equityNow).toFixed(2);
    const ddPct = peakEquity > 0 ? +(ddUsd / peakEquity * 100).toFixed(2) : 0;
    if (ddUsd > maxDrawdownUsd) maxDrawdownUsd = ddUsd;
    if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;
    fullCurve.push({
      label: pos.closeDate,
      equityUsd: equityNow,
      pnlUsd: runningPnl
    });
  }
  const tradeCount = sorted.length;
  const winRatePct = +(winCount / tradeCount * 100).toFixed(1);
  const profitFactor = grossLossUsd > 0 ? +(grossProfitUsd / grossLossUsd).toFixed(2) : grossProfitUsd > 0 ? 9.99 : 0;
  const avgLoss = lossCount > 0 ? grossLossUsd / lossCount : 0;
  const avgWin = winCount > 0 ? grossProfitUsd / winCount : 0;
  const avgR = avgLoss > 0 ? +((winCount * avgWin - lossCount * avgLoss) / (tradeCount * avgLoss)).toFixed(2) : runningPnl > 0 ? 1 : 0;
  let bestPositiveDay = 0;
  dayProfitMap.forEach((p) => {
    if (p > bestPositiveDay) bestPositiveDay = p;
  });
  const consistencyBestDayPct = runningPnl > 0 ? +(bestPositiveDay / runningPnl * 100).toFixed(1) : 0;
  const step = Math.max(1, Math.floor(fullCurve.length / 40));
  const equityCurve = fullCurve.filter(
    (_pt, idx) => idx === 0 || idx === fullCurve.length - 1 || idx % step === 0
  );
  const sampleDeals = sorted.slice(-8).reverse().map((p) => ({
    ticket: `#${p.ticket.slice(0, 4)}***${p.ticket.slice(-2)}`,
    symbol: p.symbol,
    dir: p.dir,
    closeDate: p.closeDate,
    netProfit: p.netProfit,
    volume: p.volume
  }));
  return {
    tradeCount,
    winCount,
    lossCount,
    winRatePct,
    profitFactor,
    netProfitUsd: +runningPnl.toFixed(2),
    grossProfitUsd: +grossProfitUsd.toFixed(2),
    grossLossUsd: +grossLossUsd.toFixed(2),
    maxDrawdownUsd: +maxDrawdownUsd.toFixed(2),
    maxDrawdownPct: +maxDrawdownPct.toFixed(2),
    avgR,
    consistencyBestDayPct,
    symbols: Array.from(symbolSet),
    firstTradeDate: sorted[0].closeDate,
    lastTradeDate: sorted[sorted.length - 1].closeDate,
    equityCurve,
    sampleDeals
  };
}

// src/utils/liveChartCache.ts
var LIVE_CHART_CACHE_TTL_MS = 3e3;
var LIVE_CHART_STALE_FALLBACK_MS = 3e4;
var LiveChartResponseCache = class {
  constructor(ttlMs = LIVE_CHART_CACHE_TTL_MS, staleFallbackMs = LIVE_CHART_STALE_FALLBACK_MS, maxEntries = 120) {
    this.ttlMs = ttlMs;
    this.staleFallbackMs = staleFallbackMs;
    this.maxEntries = maxEntries;
    this.store = /* @__PURE__ */ new Map();
    this.inFlight = /* @__PURE__ */ new Map();
  }
  async getOrFetch(cacheKey, fetcher, options = {}) {
    const getNow = options.nowMs ?? Date.now;
    const now = getNow();
    const cached = this.store.get(cacheKey);
    if (!options.forceRefresh && cached && now - cached.cachedAtMs < this.ttlMs) {
      return {
        telemetry: cached.telemetry,
        cacheStatus: "HIT",
        ageMs: Math.max(0, now - cached.cachedAtMs)
      };
    }
    const existingFlight = !options.forceRefresh ? this.inFlight.get(cacheKey) : void 0;
    if (existingFlight) {
      try {
        const telemetry = await existingFlight;
        return {
          telemetry,
          cacheStatus: "COALESCED",
          ageMs: 0
        };
      } catch (err) {
        if (cached && getNow() - cached.cachedAtMs <= this.staleFallbackMs) {
          return {
            telemetry: cached.telemetry,
            cacheStatus: "STALE_FALLBACK",
            ageMs: Math.max(0, getNow() - cached.cachedAtMs)
          };
        }
        throw err;
      }
    }
    const flightPromise = fetcher().then((telemetry) => {
      if (this.store.size >= this.maxEntries && !this.store.has(cacheKey)) {
        const oldestKey = this.store.keys().next().value;
        if (oldestKey) this.store.delete(oldestKey);
      }
      this.store.set(cacheKey, {
        telemetry,
        cachedAtMs: getNow()
      });
      return telemetry;
    }).finally(() => {
      if (this.inFlight.get(cacheKey) === flightPromise) {
        this.inFlight.delete(cacheKey);
      }
    });
    this.inFlight.set(cacheKey, flightPromise);
    try {
      const telemetry = await flightPromise;
      return {
        telemetry,
        cacheStatus: "MISS",
        ageMs: 0
      };
    } catch (err) {
      if (cached && getNow() - cached.cachedAtMs <= this.staleFallbackMs) {
        return {
          telemetry: cached.telemetry,
          cacheStatus: "STALE_FALLBACK",
          ageMs: Math.max(0, getNow() - cached.cachedAtMs)
        };
      }
      throw err;
    }
  }
  size() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
    this.inFlight.clear();
  }
};

// src/utils/propFirmCatalog.ts
var PROP_FIRM_CATALOG = [
  {
    id: "fundednext",
    name: "FundedNext",
    shortName: "FundedNext",
    market: "CFD_FUTURES",
    websiteUrl: "https://fundednext.com",
    rulesUrl: "https://help.fundednext.com/en/",
    portalUrl: "https://mcp.fundednext.com",
    portalLabel: "FundedNext Official MCP",
    dailyLossLimitText: "5% (2-Step Stellar / Evaluation) \xB7 3% (1-Step)",
    maxDrawdownText: "10% (2-Step) \xB7 6% (1-Step) Balance-Based / Static",
    consistencyRuleText: "40% Best-Day Rule \u0E43\u0E19\u0E1A\u0E32\u0E07\u0E42\u0E21\u0E40\u0E14\u0E25 (\u0E40\u0E0A\u0E48\u0E19 Express/Futures; \u0E40\u0E0A\u0E47\u0E01\u0E15\u0E32\u0E21\u0E23\u0E38\u0E48\u0E19\u0E17\u0E35\u0E48\u0E16\u0E37\u0E2D)",
    consistencyCapPct: 40,
    newsTradingText: "\u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15\u0E43\u0E19 Challenge; \u0E23\u0E38\u0E48\u0E19 Funded \u0E08\u0E33\u0E01\u0E31\u0E14\u0E0A\u0E48\u0E27\u0E07\u0E02\u0E48\u0E32\u0E27\u0E2A\u0E33\u0E04\u0E31\u0E0D \xB15 \u0E19\u0E32\u0E17\u0E35\u0E15\u0E32\u0E21\u0E42\u0E21\u0E40\u0E14\u0E25",
    vpsPolicySummary: "\u0E2B\u0E49\u0E32\u0E21\u0E43\u0E0A\u0E49 VPS \u0E17\u0E38\u0E01\u0E01\u0E23\u0E13\u0E35\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E1E\u0E2D\u0E23\u0E4C\u0E15\u0E15\u0E31\u0E49\u0E07\u0E41\u0E15\u0E48 $50,000 \u0E02\u0E36\u0E49\u0E19\u0E44\u0E1B \xB7 \u0E15\u0E48\u0E33\u0E01\u0E27\u0E48\u0E32 $50k \u0E15\u0E49\u0E2D\u0E07\u0E43\u0E0A\u0E49 Private VPS + \u0E23\u0E31\u0E19 EA \u0E08\u0E23\u0E34\u0E07\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19",
    redMustReadWarning: "\u0E1E\u0E2D\u0E23\u0E4C\u0E15\u0E15\u0E31\u0E49\u0E07\u0E41\u0E15\u0E48 $50,000 \u0E2B\u0E49\u0E32\u0E21\u0E43\u0E0A\u0E49 VPS \u0E17\u0E38\u0E01\u0E01\u0E23\u0E13\u0E35 \u0E0B\u0E34\u0E07\u0E01\u0E4C\u0E1C\u0E48\u0E32\u0E19 FundedNext Official MCP \u0E2B\u0E23\u0E37\u0E2D\u0E19\u0E33\u0E40\u0E02\u0E49\u0E32 .xlsx \u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19 \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E40\u0E25\u0E35\u0E48\u0E22\u0E07\u0E01\u0E32\u0E23\u0E1C\u0E34\u0E14\u0E01\u0E0E VPS \u0E41\u0E25\u0E30 Shared IP",
    vpsBannedOverUsd: 5e4,
    safeSyncChannels: ["FUNDEDNEXT_MCP", "MANUAL_XLSX", "MYFXBOOK_API"],
    matchKeywords: ["fundednext", "funded next", "stellar", "fn"]
  },
  {
    id: "ftmo",
    name: "FTMO",
    shortName: "FTMO",
    market: "CFD",
    websiteUrl: "https://ftmo.com",
    rulesUrl: "https://ftmo.com/en/forbidden-trading-practices/",
    portalUrl: "https://trader.ftmo.com",
    portalLabel: "FTMO Client Area",
    dailyLossLimitText: "5% (2-Step Standard) / 3% (1-Step) \u0E04\u0E33\u0E19\u0E27\u0E13 Equity \u0E13 00:00 CE(S)T",
    maxDrawdownText: "10% Static (2-Step) / EOD Trailing (1-Step)",
    consistencyRuleText: "1-Step \u0E21\u0E35 Best-Day Rule \xB7 2-Step \u0E44\u0E21\u0E48\u0E21\u0E35\u0E40\u0E1E\u0E14\u0E32\u0E19\u0E15\u0E32\u0E22\u0E15\u0E31\u0E27\u0E41\u0E15\u0E48\u0E15\u0E23\u0E27\u0E08\u0E1E\u0E24\u0E15\u0E34\u0E01\u0E23\u0E23\u0E21 Gambling/All-in",
    consistencyCapPct: null,
    newsTradingText: "Swing Account \u0E40\u0E17\u0E23\u0E14\u0E02\u0E48\u0E32\u0E27\u0E44\u0E14\u0E49 \xB7 Standard Account \u0E2B\u0E49\u0E32\u0E21\u0E40\u0E1B\u0E34\u0E14-\u0E1B\u0E34\u0E14\u0E43\u0E19 \xB12 \u0E19\u0E32\u0E17\u0E35\u0E23\u0E2D\u0E1A\u0E02\u0E48\u0E32\u0E27\u0E41\u0E14\u0E07",
    vpsPolicySummary: "\u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15\u0E40\u0E09\u0E1E\u0E32\u0E30 Private VPS (Dedicated IP \u0E17\u0E35\u0E48\u0E21\u0E35\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E08\u0E14\u0E17\u0E30\u0E40\u0E1A\u0E35\u0E22\u0E19\u0E0A\u0E37\u0E48\u0E2D\u0E04\u0E38\u0E13) \u0E2B\u0E49\u0E32\u0E21 Shared IP \u0E2B\u0E23\u0E37\u0E2D\u0E2A\u0E25\u0E31\u0E1A VPN \u0E02\u0E49\u0E32\u0E21\u0E1B\u0E23\u0E30\u0E40\u0E17\u0E28",
    redMustReadWarning: "\u0E08\u0E33\u0E40\u0E1B\u0E47\u0E19\u0E15\u0E49\u0E2D\u0E07\u0E2D\u0E48\u0E32\u0E19: \u0E2B\u0E32\u0E01\u0E43\u0E0A\u0E49 VPS \u0E15\u0E49\u0E2D\u0E07\u0E40\u0E01\u0E47\u0E1A\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E40\u0E0A\u0E48\u0E32 VPS \u0E17\u0E35\u0E48\u0E23\u0E30\u0E1A\u0E38\u0E0A\u0E37\u0E48\u0E2D\u0E04\u0E38\u0E13\u0E41\u0E25\u0E30 Dedicated IP \u0E0A\u0E31\u0E14\u0E40\u0E08\u0E19 \u0E01\u0E23\u0E13\u0E35 Manual Review \u0E2B\u0E49\u0E32\u0E21\u0E25\u0E47\u0E2D\u0E01\u0E2D\u0E34\u0E19\u0E1C\u0E48\u0E32\u0E19 Shared VPS / Public VPN \u0E40\u0E14\u0E47\u0E14\u0E02\u0E32\u0E14",
    vpsBannedOverUsd: null,
    safeSyncChannels: ["MYFXBOOK_API", "MANUAL_XLSX", "LIVE_BRIDGE"],
    matchKeywords: ["ftmo"]
  },
  {
    id: "the5ers",
    name: "The5ers",
    shortName: "The5ers",
    market: "CFD",
    websiteUrl: "https://the5ers.com",
    rulesUrl: "https://the5ers.com/faqs/",
    dailyLossLimitText: "5% Daily Pause (High Stakes) \xB7 \u0E1B\u0E23\u0E31\u0E1A\u0E15\u0E32\u0E21\u0E41\u0E1C\u0E19 Bootcamp / Hyper Growth",
    maxDrawdownText: "10% Static (High Stakes) \xB7 4%-6% (Bootcamp/Hyper Growth)",
    consistencyRuleText: "\u0E40\u0E02\u0E49\u0E21\u0E07\u0E27\u0E14\u0E40\u0E23\u0E37\u0E48\u0E2D\u0E07 Stop Loss \u0E15\u0E48\u0E2D\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C\u0E41\u0E25\u0E30\u0E04\u0E27\u0E32\u0E21\u0E2A\u0E21\u0E48\u0E33\u0E40\u0E2A\u0E21\u0E2D\u0E01\u0E32\u0E23\u0E27\u0E32\u0E07\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E48\u0E22\u0E07",
    consistencyCapPct: null,
    newsTradingText: "\u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15\u0E15\u0E32\u0E21\u0E41\u0E1C\u0E19 \u0E41\u0E15\u0E48\u0E2B\u0E49\u0E32\u0E21 Bracket Order / High-Frequency Arbitrage \u0E0A\u0E48\u0E27\u0E07\u0E02\u0E48\u0E32\u0E27",
    vpsPolicySummary: "\u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15 Private VPS (Dedicated IP) \u0E22\u0E37\u0E14\u0E2B\u0E22\u0E38\u0E48\u0E19\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E23\u0E31\u0E19 EA/\u0E2A\u0E04\u0E23\u0E34\u0E1B\u0E15\u0E4C\u0E2A\u0E48\u0E27\u0E19\u0E15\u0E31\u0E27\u0E17\u0E35\u0E48\u0E44\u0E21\u0E48 Copy \u0E02\u0E49\u0E32\u0E21\u0E40\u0E08\u0E49\u0E32\u0E02\u0E2D\u0E07",
    redMustReadWarning: "\u0E08\u0E33\u0E40\u0E1B\u0E47\u0E19\u0E15\u0E49\u0E2D\u0E07\u0E2D\u0E48\u0E32\u0E19: \u0E2B\u0E49\u0E32\u0E21\u0E43\u0E0A\u0E49 Shared VPS \u0E23\u0E48\u0E27\u0E21\u0E01\u0E31\u0E1A\u0E40\u0E17\u0E23\u0E14\u0E40\u0E14\u0E2D\u0E23\u0E4C\u0E23\u0E32\u0E22\u0E2D\u0E37\u0E48\u0E19 \u0E41\u0E21\u0E49\u0E43\u0E0A\u0E49 Investor Password \u0E01\u0E47\u0E16\u0E39\u0E01\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01 IP \u0E23\u0E30\u0E14\u0E31\u0E1A\u0E40\u0E0B\u0E34\u0E23\u0E4C\u0E1F\u0E40\u0E27\u0E2D\u0E23\u0E4C\u0E41\u0E25\u0E30\u0E40\u0E2A\u0E35\u0E48\u0E22\u0E07\u0E02\u0E49\u0E2D\u0E2B\u0E32 Copy Trading",
    vpsBannedOverUsd: null,
    safeSyncChannels: ["MYFXBOOK_API", "MANUAL_XLSX", "LIVE_BRIDGE"],
    matchKeywords: ["5ers", "the5ers", "fivepercent", "five percent"]
  },
  {
    id: "fundingpips",
    name: "FundingPips",
    shortName: "FundingPips",
    market: "CFD",
    websiteUrl: "https://fundingpips.com",
    rulesUrl: "https://help.fundingpips.com/",
    dailyLossLimitText: "3% - 5% (\u0E02\u0E36\u0E49\u0E19\u0E01\u0E31\u0E1A\u0E42\u0E21\u0E40\u0E14\u0E25 Zero / 1-Step / 2-Step)",
    maxDrawdownText: "5% - 10% (Balance-Based / Static \u0E15\u0E32\u0E21\u0E23\u0E38\u0E48\u0E19)",
    consistencyRuleText: "45% Consistency Rule \u0E43\u0E19\u0E1A\u0E32\u0E07\u0E42\u0E21\u0E40\u0E14\u0E25 (Zero / Pro) \u0E15\u0E23\u0E27\u0E08\u0E0B\u0E49\u0E33\u0E01\u0E48\u0E2D\u0E19\u0E02\u0E2D\u0E40\u0E1A\u0E34\u0E01\u0E40\u0E07\u0E34\u0E19",
    consistencyCapPct: 45,
    newsTradingText: "Evaluation \u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15\u0E1B\u0E01\u0E15\u0E34 \xB7 \u0E02\u0E31\u0E49\u0E19 Master/Funded \u0E40\u0E0A\u0E47\u0E01\u0E02\u0E49\u0E2D\u0E08\u0E33\u0E01\u0E31\u0E14 \xB15 \u0E19\u0E32\u0E17\u0E35\u0E23\u0E2D\u0E1A\u0E02\u0E48\u0E32\u0E27\u0E2A\u0E33\u0E04\u0E31\u0E0D",
    vpsPolicySummary: "\u0E23\u0E30\u0E1A\u0E1A\u0E15\u0E23\u0E27\u0E08\u0E08\u0E31\u0E1A Shared IP / Group Trading \u0E40\u0E02\u0E49\u0E21\u0E07\u0E27\u0E14\u0E21\u0E32\u0E01 \u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15\u0E40\u0E09\u0E1E\u0E32\u0E30 Private Dedicated IP VPS \u0E2B\u0E23\u0E37\u0E2D Home PC",
    redMustReadWarning: "\u0E08\u0E33\u0E40\u0E1B\u0E47\u0E19\u0E15\u0E49\u0E2D\u0E07\u0E2D\u0E48\u0E32\u0E19: FundingPips \u0E15\u0E23\u0E27\u0E08\u0E08\u0E31\u0E1A IP \u0E0B\u0E49\u0E33\u0E02\u0E49\u0E32\u0E21\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E40\u0E02\u0E49\u0E21\u0E07\u0E27\u0E14\u0E17\u0E35\u0E48\u0E2A\u0E38\u0E14\u0E41\u0E2B\u0E48\u0E07\u0E2B\u0E19\u0E36\u0E48\u0E07 \u0E41\u0E19\u0E30\u0E19\u0E33\u0E43\u0E0A\u0E49 Myfxbook Cloud API \u0E2B\u0E23\u0E37\u0E2D .xlsx \u0E40\u0E1B\u0E47\u0E19\u0E2B\u0E25\u0E31\u0E01 \u0E41\u0E25\u0E30\u0E2B\u0E49\u0E32\u0E21\u0E40\u0E0A\u0E48\u0E32 Shared VPS \u0E40\u0E14\u0E47\u0E14\u0E02\u0E32\u0E14",
    vpsBannedOverUsd: null,
    safeSyncChannels: ["MYFXBOOK_API", "MANUAL_XLSX", "LIVE_BRIDGE"],
    matchKeywords: ["fundingpips", "funding pips", "fp"]
  },
  {
    id: "alphacapital",
    name: "Alpha Capital Group",
    shortName: "Alpha Capital",
    market: "CFD",
    websiteUrl: "https://alphacapitalgroup.uk",
    rulesUrl: "https://help.alphacapitalgroup.uk/en/",
    dailyLossLimitText: "4% - 5% (\u0E15\u0E32\u0E21\u0E23\u0E38\u0E48\u0E19 Alpha Pro / Alpha Swing)",
    maxDrawdownText: "6% - 10%",
    consistencyRuleText: "Best-Day / Consistency 40% - 50% \u0E15\u0E32\u0E21\u0E42\u0E21\u0E40\u0E14\u0E25\u0E17\u0E35\u0E48\u0E40\u0E25\u0E37\u0E2D\u0E01 (\u0E40\u0E0A\u0E47\u0E01\u0E43\u0E19 Client Dashboard)",
    consistencyCapPct: 40,
    newsTradingText: "Alpha Pro \u0E08\u0E33\u0E01\u0E31\u0E14 \xB12 \u0E19\u0E32\u0E17\u0E35\u0E23\u0E2D\u0E1A\u0E02\u0E48\u0E32\u0E27\u0E2A\u0E33\u0E04\u0E31\u0E0D \xB7 Alpha Swing \u0E40\u0E17\u0E23\u0E14\u0E02\u0E48\u0E32\u0E27\u0E41\u0E25\u0E30\u0E16\u0E37\u0E2D\u0E02\u0E49\u0E32\u0E21\u0E2A\u0E31\u0E1B\u0E14\u0E32\u0E2B\u0E4C\u0E44\u0E14\u0E49",
    vpsPolicySummary: "\u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15\u0E40\u0E09\u0E1E\u0E32\u0E30 VPS \u0E17\u0E35\u0E48\u0E21\u0E35 Dedicated IP \u0E01\u0E2D\u0E07\u0E17\u0E38\u0E19\u0E2D\u0E32\u0E08\u0E02\u0E2D\u0E43\u0E1A\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E01\u0E48\u0E2D\u0E19\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34\u0E01\u0E32\u0E23\u0E08\u0E48\u0E32\u0E22\u0E40\u0E07\u0E34\u0E19",
    redMustReadWarning: "\u0E08\u0E33\u0E40\u0E1B\u0E47\u0E19\u0E15\u0E49\u0E2D\u0E07\u0E2D\u0E48\u0E32\u0E19: \u0E01\u0E2D\u0E07\u0E17\u0E38\u0E19\u0E2D\u0E32\u0E08\u0E02\u0E2D\u0E2B\u0E25\u0E31\u0E01\u0E10\u0E32\u0E19 Dedicated IP Invoice \u0E17\u0E35\u0E48\u0E21\u0E35\u0E0A\u0E37\u0E48\u0E2D\u0E15\u0E23\u0E07\u0E01\u0E31\u0E1A\u0E40\u0E08\u0E49\u0E32\u0E02\u0E2D\u0E07\u0E1E\u0E2D\u0E23\u0E4C\u0E15\u0E01\u0E48\u0E2D\u0E19\u0E08\u0E48\u0E32\u0E22\u0E40\u0E07\u0E34\u0E19 \u0E43\u0E0A\u0E49 Myfxbook API \u0E2B\u0E23\u0E37\u0E2D PC \u0E2A\u0E48\u0E27\u0E19\u0E15\u0E31\u0E27\u0E1B\u0E25\u0E2D\u0E14\u0E20\u0E31\u0E22\u0E17\u0E35\u0E48\u0E2A\u0E38\u0E14",
    vpsBannedOverUsd: null,
    safeSyncChannels: ["MYFXBOOK_API", "MANUAL_XLSX", "LIVE_BRIDGE"],
    matchKeywords: ["alpha", "acg", "alpha capital"]
  },
  {
    id: "e8markets",
    name: "E8 Markets",
    shortName: "E8 Markets",
    market: "CFD_FUTURES",
    websiteUrl: "https://e8markets.com",
    rulesUrl: "https://help.e8markets.com/",
    dailyLossLimitText: "2.5% - 4% (\u0E1B\u0E23\u0E31\u0E1A Preset \u0E44\u0E14\u0E49\u0E43\u0E19\u0E23\u0E38\u0E48\u0E19 E8 One / Signature / Classic)",
    maxDrawdownText: "4% - 10% (EOD Trailing \u0E2B\u0E23\u0E37\u0E2D Static \u0E15\u0E32\u0E21 Preset)",
    consistencyRuleText: "40% Best-Day Rule \u0E43\u0E19\u0E1A\u0E32\u0E07\u0E23\u0E38\u0E48\u0E19 (\u0E40\u0E0A\u0E48\u0E19 E8 One / Funded Stage)",
    consistencyCapPct: 40,
    newsTradingText: "\u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15\u0E43\u0E19\u0E01\u0E23\u0E2D\u0E1A\u0E1B\u0E01\u0E15\u0E34 \u0E23\u0E30\u0E27\u0E31\u0E07 Slippage \u0E41\u0E25\u0E30\u0E15\u0E23\u0E27\u0E08\u0E40\u0E07\u0E37\u0E48\u0E2D\u0E19\u0E44\u0E02 Payout \u0E1B\u0E23\u0E30\u0E08\u0E33\u0E23\u0E38\u0E48\u0E19\u0E1A\u0E19 E8X",
    vpsPolicySummary: "\u0E2B\u0E49\u0E32\u0E21 Shared VPS \u0E41\u0E25\u0E30\u0E15\u0E23\u0E27\u0E08\u0E08\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E2A\u0E25\u0E31\u0E1A\u0E1B\u0E23\u0E30\u0E40\u0E17\u0E28/IP \u0E02\u0E49\u0E32\u0E21\u0E42\u0E0B\u0E19\u0E40\u0E27\u0E25\u0E32\u0E23\u0E30\u0E2B\u0E27\u0E48\u0E32\u0E07\u0E40\u0E17\u0E23\u0E14\u0E2D\u0E22\u0E48\u0E32\u0E07\u0E40\u0E02\u0E49\u0E21\u0E07\u0E27\u0E14",
    redMustReadWarning: "\u0E2B\u0E49\u0E32\u0E21\u0E2A\u0E25\u0E31\u0E1A\u0E1B\u0E23\u0E30\u0E40\u0E17\u0E28\u0E02\u0E2D\u0E07 IP \u0E1A\u0E48\u0E2D\u0E22 \u0E43\u0E0A\u0E49 VPN \u0E2A\u0E32\u0E18\u0E32\u0E23\u0E13\u0E30 \u0E2B\u0E23\u0E37\u0E2D\u0E2A\u0E25\u0E31\u0E1A Node \u0E01\u0E32\u0E23\u0E0B\u0E34\u0E07\u0E01\u0E4C\u0E1C\u0E48\u0E32\u0E19 Myfxbook API \u0E2B\u0E23\u0E37\u0E2D .xlsx \u0E44\u0E21\u0E48\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01 IP \u0E43\u0E2B\u0E21\u0E48\u0E1A\u0E19\u0E1E\u0E2D\u0E23\u0E4C\u0E15",
    vpsBannedOverUsd: null,
    safeSyncChannels: ["MYFXBOOK_API", "MANUAL_XLSX", "LIVE_BRIDGE"],
    matchKeywords: ["e8", "e8markets", "e8 funding"]
  },
  {
    id: "topstep",
    name: "Topstep",
    shortName: "Topstep",
    market: "FUTURES",
    websiteUrl: "https://www.topstep.com",
    rulesUrl: "https://help.topstep.com/",
    portalUrl: "https://app.topstepx.com",
    portalLabel: "TopstepX Web / ProjectX",
    dailyLossLimitText: "Optional DLL \u0E43\u0E19 Trading Combine (\u0E40\u0E0A\u0E48\u0E19 $1,000 \u0E1A\u0E19\u0E1E\u0E2D\u0E23\u0E4C\u0E15 $50K)",
    maxDrawdownText: "End-of-Day (EOD) Trailing Maximum Loss Limit (\u0E25\u0E47\u0E2D\u0E01\u0E17\u0E35\u0E48\u0E17\u0E38\u0E19\u0E15\u0E31\u0E49\u0E07\u0E15\u0E49\u0E19)",
    consistencyRuleText: "55% Consistency Rule (Trading Combine) / \u0E40\u0E01\u0E13\u0E11\u0E4C Express Funded (XFA)",
    consistencyCapPct: 55,
    newsTradingText: "\u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15\u0E1A\u0E19 Futures \u0E20\u0E32\u0E22\u0E43\u0E15\u0E49\u0E01\u0E0E CME \u0E41\u0E25\u0E30\u0E01\u0E32\u0E23\u0E27\u0E32\u0E07 Stop/Risk \u0E17\u0E35\u0E48\u0E40\u0E2B\u0E21\u0E32\u0E30\u0E2A\u0E21",
    vpsPolicySummary: "TopstepX \u0E40\u0E1B\u0E47\u0E19 Web-based \u0E44\u0E21\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E43\u0E0A\u0E49 VPS \xB7 \u0E2B\u0E32\u0E01\u0E43\u0E0A\u0E49 NinjaTrader/Rithmic \u0E15\u0E49\u0E2D\u0E07\u0E40\u0E1B\u0E47\u0E19 Private Dedicated VPS \u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19",
    redMustReadWarning: "TopstepX \u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E44\u0E14\u0E49\u0E42\u0E14\u0E22\u0E44\u0E21\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E43\u0E0A\u0E49 VPS \u0E14\u0E36\u0E07\u0E2A\u0E16\u0E34\u0E15\u0E34\u0E40\u0E02\u0E49\u0E32 TallyNX Desk \u0E1C\u0E48\u0E32\u0E19 ProjectX / TopstepX Cloud API",
    vpsBannedOverUsd: null,
    safeSyncChannels: ["PROJECTX_API", "MANUAL_XLSX"],
    matchKeywords: ["topstep", "topstepx", "projectx"]
  },
  {
    id: "apex",
    name: "Apex Trader Funding",
    shortName: "Apex",
    market: "FUTURES",
    websiteUrl: "https://apextraderfunding.com",
    rulesUrl: "https://support.apextraderfunding.com/",
    dailyLossLimitText: "EOD Evaluation \u0E21\u0E35 Fixed DLL \xB7 Intraday Evaluation \u0E44\u0E21\u0E48\u0E21\u0E35 DLL",
    maxDrawdownText: "Intraday Trailing \u0E2B\u0E23\u0E37\u0E2D EOD Trailing (PA \u0E2B\u0E22\u0E38\u0E14\u0E15\u0E32\u0E21\u0E17\u0E35\u0E48 Balance + $100)",
    consistencyRuleText: "50% Windfall / Consistency Rule \u0E43\u0E19 PA \u0E01\u0E48\u0E2D\u0E19\u0E02\u0E2D Payout (30% \u0E43\u0E19\u0E41\u0E1C\u0E19\u0E40\u0E01\u0E48\u0E32\u0E1A\u0E32\u0E07\u0E23\u0E38\u0E48\u0E19)",
    consistencyCapPct: 50,
    newsTradingText: "\u0E2B\u0E49\u0E32\u0E21 One-sided Flipping / DCA \u0E44\u0E23\u0E49\u0E08\u0E38\u0E14\u0E15\u0E31\u0E14\u0E0A\u0E48\u0E27\u0E07\u0E02\u0E48\u0E32\u0E27 \u0E15\u0E49\u0E2D\u0E07\u0E40\u0E17\u0E23\u0E14\u0E41\u0E1A\u0E1A\u0E21\u0E35\u0E01\u0E23\u0E2D\u0E1A\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E48\u0E22\u0E07\u0E0A\u0E31\u0E14\u0E40\u0E08\u0E19",
    vpsPolicySummary: "\u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15 Private VPS \u0E43\u0E19 Chicago \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E25\u0E14\u0E04\u0E27\u0E32\u0E21\u0E2B\u0E19\u0E48\u0E27\u0E07 \u0E2B\u0E49\u0E32\u0E21\u0E41\u0E0A\u0E23\u0E4C VPS \u0E2B\u0E23\u0E37\u0E2D\u0E43\u0E0A\u0E49 IP \u0E40\u0E14\u0E35\u0E22\u0E27\u0E01\u0E31\u0E19\u0E08\u0E31\u0E14\u0E01\u0E32\u0E23\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E02\u0E2D\u0E07\u0E1C\u0E39\u0E49\u0E2D\u0E37\u0E48\u0E19",
    redMustReadWarning: "\u0E08\u0E33\u0E40\u0E1B\u0E47\u0E19\u0E15\u0E49\u0E2D\u0E07\u0E2D\u0E48\u0E32\u0E19: \u0E43\u0E19\u0E02\u0E31\u0E49\u0E19 PA \u0E21\u0E35\u0E01\u0E0E 50% Consistency \u0E41\u0E25\u0E30\u0E01\u0E0E\u0E08\u0E33\u0E01\u0E31\u0E14\u0E01\u0E32\u0E23\u0E16\u0E37\u0E2D Contract / DCA \u0E0A\u0E48\u0E27\u0E07\u0E02\u0E48\u0E32\u0E27 \u0E2B\u0E32\u0E01\u0E43\u0E0A\u0E49 VPS \u0E15\u0E49\u0E2D\u0E07\u0E40\u0E1B\u0E47\u0E19\u0E40\u0E04\u0E23\u0E37\u0E48\u0E2D\u0E07 Private \u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E40\u0E2D\u0E07\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19",
    vpsBannedOverUsd: null,
    safeSyncChannels: ["PROJECTX_API", "MANUAL_XLSX"],
    matchKeywords: ["apex", "apex trader"]
  },
  {
    id: "tpt",
    name: "Take Profit Trader",
    shortName: "TPT",
    market: "FUTURES",
    websiteUrl: "https://takeprofittrader.com",
    rulesUrl: "https://takeprofittraderhelp.zendesk.com/",
    dailyLossLimitText: "\u0E44\u0E21\u0E48\u0E21\u0E35 Daily Loss Limit (\u0E04\u0E38\u0E21\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E48\u0E22\u0E07\u0E1C\u0E48\u0E32\u0E19 Trailing Drawdown)",
    maxDrawdownText: "EOD Trailing (Test & PRO+) \xB7 Intraday Trailing (PRO Sim-Funded)",
    consistencyRuleText: "50% Best-Day Rule \u0E43\u0E19\u0E02\u0E31\u0E49\u0E19 Test (\u0E02\u0E31\u0E49\u0E19 PRO Funded \u0E22\u0E01\u0E40\u0E25\u0E34\u0E01 Consistency Cap)",
    consistencyCapPct: 50,
    newsTradingText: "Test \u0E40\u0E17\u0E23\u0E14\u0E44\u0E14\u0E49\u0E1B\u0E01\u0E15\u0E34 \xB7 \u0E02\u0E31\u0E49\u0E19 PRO Live \u0E40\u0E0A\u0E47\u0E01\u0E02\u0E49\u0E2D\u0E08\u0E33\u0E01\u0E31\u0E14 \xB11 \u0E19\u0E32\u0E17\u0E35\u0E0A\u0E48\u0E27\u0E07\u0E02\u0E48\u0E32\u0E27 High-Impact",
    vpsPolicySummary: "\u0E15\u0E49\u0E2D\u0E07\u0E43\u0E0A\u0E49 Private Dedicated VPS \u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A Rithmic / NinjaTrader \u0E2B\u0E49\u0E32\u0E21 Shared IP",
    redMustReadWarning: "\u0E08\u0E33\u0E40\u0E1B\u0E47\u0E19\u0E15\u0E49\u0E2D\u0E07\u0E2D\u0E48\u0E32\u0E19: \u0E40\u0E21\u0E37\u0E48\u0E2D\u0E02\u0E36\u0E49\u0E19\u0E02\u0E31\u0E49\u0E19 PRO (Sim-Funded) \u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E1B\u0E25\u0E35\u0E48\u0E22\u0E19\u0E08\u0E32\u0E01 EOD \u0E40\u0E1B\u0E47\u0E19 Intraday Trailing Drawdown (\u0E44\u0E25\u0E48\u0E15\u0E32\u0E21\u0E01\u0E33\u0E44\u0E23\u0E17\u0E35\u0E48\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E1B\u0E34\u0E14\u0E17\u0E31\u0E19\u0E17\u0E35) \u0E15\u0E49\u0E2D\u0E07\u0E04\u0E38\u0E21 RR \u0E41\u0E25\u0E30\u0E1B\u0E34\u0E14\u0E08\u0E1A\u0E15\u0E32\u0E21\u0E41\u0E1C\u0E19\u0E2D\u0E22\u0E48\u0E32\u0E07\u0E40\u0E04\u0E23\u0E48\u0E07\u0E04\u0E23\u0E31\u0E14",
    vpsBannedOverUsd: null,
    safeSyncChannels: ["PROJECTX_API", "MANUAL_XLSX"],
    matchKeywords: ["take profit trader", "tpt"]
  },
  {
    id: "mffu",
    name: "MyFundedFutures (MFFU)",
    shortName: "MFFU",
    market: "FUTURES",
    websiteUrl: "https://myfundedfutures.com",
    rulesUrl: "https://help.myfundedfutures.com/",
    dailyLossLimitText: "\u0E44\u0E21\u0E48\u0E21\u0E35 (Rapid / Pro) \xB7 Soft DLL (Builder Plan)",
    maxDrawdownText: "Intraday Trailing (Rapid/Pro) \xB7 EOD Trailing (Rapid EOD) \xB7 Static (Studio)",
    consistencyRuleText: "50% (Rapid/Pro) \xB7 30% (Rapid EOD) \xB7 Builder \u0E15\u0E23\u0E27\u0E08 Consistency \u0E0A\u0E48\u0E27\u0E07\u0E40\u0E1A\u0E34\u0E01\u0E40\u0E07\u0E34\u0E19",
    consistencyCapPct: 50,
    newsTradingText: "\u0E40\u0E0A\u0E47\u0E01\u0E15\u0E32\u0E21\u0E23\u0E38\u0E48\u0E19\u0E1A\u0E31\u0E0D\u0E0A\u0E35 (\u0E1A\u0E32\u0E07\u0E23\u0E38\u0E48\u0E19\u0E1A\u0E19 Sim-Funded \u0E08\u0E33\u0E01\u0E31\u0E14\u0E40\u0E17\u0E23\u0E14\u0E0A\u0E48\u0E27\u0E07\u0E02\u0E48\u0E32\u0E27\u0E2A\u0E33\u0E04\u0E31\u0E0D \xB12 \u0E19\u0E32\u0E17\u0E35)",
    vpsPolicySummary: "\u0E2B\u0E49\u0E32\u0E21 Shared VPS / Proxy \u0E2B\u0E23\u0E37\u0E2D\u0E01\u0E32\u0E23\u0E43\u0E0A\u0E49 IP \u0E40\u0E14\u0E35\u0E22\u0E27\u0E01\u0E31\u0E19\u0E04\u0E27\u0E1A\u0E04\u0E38\u0E21\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E2B\u0E25\u0E32\u0E22\u0E40\u0E08\u0E49\u0E32\u0E02\u0E2D\u0E07 (Account Management)",
    redMustReadWarning: "\u0E08\u0E33\u0E40\u0E1B\u0E47\u0E19\u0E15\u0E49\u0E2D\u0E07\u0E2D\u0E48\u0E32\u0E19: \u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E1B\u0E23\u0E30\u0E40\u0E20\u0E17 Drawdown \u0E02\u0E2D\u0E07\u0E41\u0E1C\u0E19\u0E17\u0E35\u0E48\u0E16\u0E37\u0E2D (Intraday vs EOD vs Static) \u0E41\u0E25\u0E30\u0E01\u0E0E Best-Day % \u0E01\u0E48\u0E2D\u0E19\u0E01\u0E14\u0E40\u0E1A\u0E34\u0E01\u0E40\u0E07\u0E34\u0E19\u0E43\u0E19 Dashboard \u0E02\u0E2D\u0E07 MFFU \u0E17\u0E38\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07",
    vpsBannedOverUsd: null,
    safeSyncChannels: ["PROJECTX_API", "MANUAL_XLSX"],
    matchKeywords: ["mffu", "myfundedfutures", "my funded futures"]
  }
];

// src/utils/liveAudioUtils.ts
function stripMarkdownForSpeech(text) {
  return String(text || "").replace(/```[\s\S]*?```/g, " (\u0E14\u0E39\u0E42\u0E04\u0E49\u0E14\u0E2B\u0E23\u0E37\u0E2D\u0E15\u0E32\u0E23\u0E32\u0E07\u0E43\u0E19\u0E2B\u0E19\u0E49\u0E32\u0E08\u0E2D) ").replace(/\|[^\n]+\|/g, " ").replace(/[#>*_`~]+/g, " ").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1").replace(/\s+/g, " ").trim();
}

// server.ts
var PORT = Number(process.env.PORT) || 3e3;
var RATE_WINDOW_MS = 15 * 60 * 1e3;
var RATE_MAX_REQUESTS = 25;
function loadFirebaseClientConfig() {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "firebase-applet-config.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
var FIREBASE_CFG = loadFirebaseClientConfig();
var rateBucket = /* @__PURE__ */ new Map();
var telemetryBus = new EventEmitter();
telemetryBus.setMaxListeners(100);
function checkChatRateLimit(key, nowMs = Date.now(), maxRequests = RATE_MAX_REQUESTS) {
  const windowStart = nowMs - RATE_WINDOW_MS;
  const timestamps = (rateBucket.get(key) || []).filter((ts) => ts > windowStart);
  if (timestamps.length >= maxRequests) {
    const oldest = timestamps[0] || nowMs;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + RATE_WINDOW_MS - nowMs) / 1e3));
    rateBucket.set(key, timestamps);
    return { allowed: false, retryAfterSec };
  }
  timestamps.push(nowMs);
  rateBucket.set(key, timestamps);
  return { allowed: true, retryAfterSec: 0 };
}
async function verifyFirebaseBearerToken(authHeader, requireVerifiedEmail = true) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const idToken = authHeader.slice("Bearer ".length).trim();
  if (!idToken || idToken.length < 20) return null;
  const apiKey = FIREBASE_CFG.apiKey || process.env.FIREBASE_WEB_API_KEY;
  if (!apiKey) return null;
  try {
    const resp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken })
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const user = data.users && data.users[0];
    if (!user || !user.localId || user.disabled || requireVerifiedEmail && user.emailVerified !== true) {
      return null;
    }
    return {
      uid: user.localId,
      email: user.email || ""
    };
  } catch {
    return null;
  }
}
function toFiniteBridgeNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function normalizeLiveBridgeOpenPositions(rawList) {
  if (!Array.isArray(rawList)) return [];
  const out = [];
  for (let i = 0; i < rawList.length; i++) {
    const raw = rawList[i];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw;
    const rawSide = String(row.side ?? row.dir ?? row.type_str ?? row.type ?? "").trim().toUpperCase();
    const side = rawSide.includes("SELL") || rawSide.includes("SHORT") || rawSide === "1" || rawSide === "OP_SELL" ? "SELL" : "BUY";
    const openPrice = toFiniteBridgeNumber(row.openPrice ?? row.open_price ?? row.priceOpen) ?? 0;
    const lots = toFiniteBridgeNumber(row.lots ?? row.volume) ?? 0;
    if (openPrice <= 0 || lots <= 0) continue;
    const slRaw = toFiniteBridgeNumber(row.slPrice ?? row.sl ?? row.stopLoss ?? row.stop_loss);
    const tpRaw = toFiniteBridgeNumber(row.tpPrice ?? row.tp ?? row.takeProfit ?? row.take_profit);
    const curRaw = toFiniteBridgeNumber(row.currentPrice ?? row.current_price ?? row.price ?? row.mark_price);
    out.push({
      ticket: String(row.ticket ?? row.positionId ?? row.id ?? `LIVE-${i + 1}`).trim(),
      symbol: String(row.symbol || "XAUUSD").trim().toUpperCase() || "XAUUSD",
      side,
      lots: +lots.toFixed(2),
      openPrice,
      currentPrice: curRaw !== null && curRaw > 0 ? curRaw : null,
      slPrice: slRaw !== null && slRaw > 0 ? slRaw : null,
      tpPrice: tpRaw !== null && tpRaw > 0 ? tpRaw : null,
      floatingPnl: +(toFiniteBridgeNumber(row.floatingPnl ?? row.floating_pnl ?? row.profit) ?? 0).toFixed(2),
      swap: +(toFiniteBridgeNumber(row.swap) ?? 0).toFixed(2),
      commission: +(toFiniteBridgeNumber(row.commission) ?? 0).toFixed(2),
      openTime: typeof row.openTime === "string" || typeof row.openTime === "number" ? row.openTime : typeof row.openedAt === "string" ? row.openedAt : null,
      ...typeof row.comment === "string" && row.comment.trim() ? { comment: row.comment.trim().slice(0, 120) } : {}
    });
  }
  return out;
}
function normalizeLiveBridgeState(body, rawMeta) {
  const rawLive = body.live && typeof body.live === "object" && !Array.isArray(body.live) ? body.live : {};
  const openPositions = normalizeLiveBridgeOpenPositions(
    body.openPositions ?? rawLive.openPositions ?? rawMeta.openPositions
  );
  const balance = toFiniteBridgeNumber(rawLive.balance ?? body.balance ?? rawMeta.balance);
  const equity = toFiniteBridgeNumber(rawLive.equity ?? body.equity ?? rawMeta.equity);
  const explicitFloat = toFiniteBridgeNumber(
    rawLive.floatingPnl ?? body.floatingPnl ?? rawMeta.floatingPnl ?? rawMeta.floatingProfit
  );
  const floatingPnl = explicitFloat !== null ? +explicitFloat.toFixed(2) : balance !== null && equity !== null ? +(equity - balance).toFixed(2) : openPositions.length > 0 ? +openPositions.reduce((sum, p) => sum + p.floatingPnl, 0).toFixed(2) : null;
  const margin = toFiniteBridgeNumber(rawLive.margin ?? body.margin ?? rawMeta.margin);
  const rawFreeMargin = toFiniteBridgeNumber(rawLive.freeMargin ?? body.freeMargin ?? rawMeta.freeMargin);
  const freeMargin = rawFreeMargin !== null ? +rawFreeMargin.toFixed(2) : margin !== null && equity !== null ? +(equity - margin).toFixed(2) : null;
  const rawMarginLevel = toFiniteBridgeNumber(
    rawLive.marginLevelPct ?? rawLive.marginLevel ?? body.marginLevelPct ?? rawMeta.marginLevelPct ?? rawMeta.marginLevel
  );
  const marginLevelPct = rawMarginLevel !== null ? +rawMarginLevel.toFixed(1) : margin !== null && margin > 0 && equity !== null && equity > 0 ? +(equity / margin * 100).toFixed(1) : null;
  const dailyLossUsedUsd = toFiniteBridgeNumber(
    rawLive.dailyLossUsedUsd ?? body.dailyLossUsedUsd ?? rawMeta.dailyLossUsedUsd
  );
  const dailyLossLimitUsd = toFiniteBridgeNumber(
    rawLive.dailyLossLimitUsd ?? body.dailyLossLimitUsd ?? rawMeta.dailyLossLimitUsd
  );
  return {
    balance: balance !== null ? +balance.toFixed(2) : null,
    equity: equity !== null ? +equity.toFixed(2) : null,
    floatingPnl,
    margin: margin !== null ? +margin.toFixed(2) : null,
    freeMargin,
    marginLevelPct,
    dailyLossUsedUsd: dailyLossUsedUsd !== null ? +Math.abs(dailyLossUsedUsd).toFixed(2) : null,
    dailyLossLimitUsd: dailyLossLimitUsd !== null ? +Math.abs(dailyLossLimitUsd).toFixed(2) : null,
    openPositions
  };
}
var LIVE_BRIDGE_STORE_PATH = path.join(os.tmpdir(), "tredyn_live_bridge_store_v32.json");
var liveBridgeMemoryStore = /* @__PURE__ */ new Map();
function hashTredynApiKey(rawKey) {
  return crypto.createHash("sha256").update(rawKey.trim()).digest("hex");
}
function isValidTredynApiKey(rawKey) {
  const cleaned = rawKey.trim();
  return cleaned.length >= 12 && cleaned.length <= 128 && /^[a-zA-Z0-9_\-]+$/.test(cleaned);
}
function readLiveBridgeStoreFromDisk() {
  try {
    if (!fs.existsSync(LIVE_BRIDGE_STORE_PATH)) return {};
    const raw = fs.readFileSync(LIVE_BRIDGE_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function saveLiveBridgeFeed(apiKey, entry) {
  const keyHash = hashTredynApiKey(apiKey);
  liveBridgeMemoryStore.set(keyHash, entry);
  try {
    const disk = readLiveBridgeStoreFromDisk();
    disk[keyHash] = entry;
    fs.writeFileSync(LIVE_BRIDGE_STORE_PATH, JSON.stringify(disk), "utf8");
  } catch {
  }
}
function getLiveBridgeFeed(apiKey) {
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
function getGenAIClient() {
  return new GoogleGenAI2({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
function getLiveTokenGenAIClient() {
  return new GoogleGenAI2({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      apiVersion: "v1alpha",
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
var BASE_GHR_SYSTEM_INSTRUCTION = `\u0E04\u0E38\u0E13\u0E04\u0E37\u0E2D "TallyNX AI Live Desk \xB7 GHR v3.2" \u0E42\u0E04\u0E49\u0E0A\u0E27\u0E32\u0E07\u0E41\u0E1C\u0E19\u0E01\u0E32\u0E23\u0E40\u0E17\u0E23\u0E14\u0E17\u0E2D\u0E07\u0E04\u0E33 (XAUUSD) \u0E41\u0E25\u0E30\u0E1C\u0E39\u0E49\u0E40\u0E0A\u0E35\u0E48\u0E22\u0E27\u0E0A\u0E32\u0E0D\u0E23\u0E30\u0E1A\u0E1A Golden Horizon (GHR v3.2) \u0E1B\u0E23\u0E30\u0E08\u0E33\u0E42\u0E15\u0E4A\u0E30\u0E40\u0E17\u0E23\u0E14
\u0E2B\u0E19\u0E49\u0E32\u0E17\u0E35\u0E48\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E04\u0E37\u0E2D\u0E0A\u0E48\u0E27\u0E22\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49:
1. \u0E27\u0E32\u0E07\u0E41\u0E1C\u0E19\u0E01\u0E32\u0E23\u0E40\u0E17\u0E23\u0E14\u0E23\u0E32\u0E22\u0E27\u0E31\u0E19\u0E41\u0E25\u0E30\u0E23\u0E32\u0E22\u0E2A\u0E31\u0E1B\u0E14\u0E32\u0E2B\u0E4C\u0E15\u0E32\u0E21\u0E01\u0E0E\u0E40\u0E2B\u0E25\u0E47\u0E01\u0E02\u0E2D\u0E07\u0E23\u0E30\u0E1A\u0E1A GHR v3.2:
   - \u0E41\u0E1A\u0E48\u0E07\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C\u0E40\u0E1B\u0E47\u0E19 3 \u0E44\u0E21\u0E49 (3-Leg Split) \u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E48\u0E22\u0E07\u0E23\u0E27\u0E21\u0E15\u0E48\u0E2D 1 Idea (\u0E40\u0E0A\u0E48\u0E19 $120 = 0.04 Lot \xD7 3 \u0E44\u0E21\u0E49 \u0E2B\u0E23\u0E37\u0E2D $90 = 0.03 Lot \xD7 3 \u0E44\u0E21\u0E49)
   - \u0E23\u0E30\u0E22\u0E30 Stop Loss \u0E21\u0E32\u0E15\u0E23\u0E10\u0E32\u0E19 = -1,000 \u0E08\u0E38\u0E14 (-10.00 \u0E14\u0E2D\u0E25\u0E25\u0E32\u0E23\u0E4C\u0E17\u0E2D\u0E07\u0E04\u0E33)
   - TP1 = +400 \u0E08\u0E38\u0E14 (+4.00 \u0E14\u0E2D\u0E25\u0E25\u0E32\u0E23\u0E4C)
   - TP2 = +800 \u0E08\u0E38\u0E14 (+8.00 \u0E14\u0E2D\u0E25\u0E25\u0E32\u0E23\u0E4C) \u0E41\u0E25\u0E30\u0E40\u0E21\u0E37\u0E48\u0E2D\u0E23\u0E32\u0E04\u0E32\u0E0A\u0E19 TP2 \u0E15\u0E49\u0E2D\u0E07\u0E40\u0E25\u0E37\u0E48\u0E2D\u0E19 SL \u0E02\u0E2D\u0E07\u0E44\u0E21\u0E49\u0E17\u0E35\u0E48 3 \u0E44\u0E1B\u0E25\u0E47\u0E2D\u0E01\u0E01\u0E33\u0E44\u0E23\u0E17\u0E35\u0E48\u0E08\u0E38\u0E14 TP1 (+400 \u0E08\u0E38\u0E14) \u0E17\u0E31\u0E19\u0E17\u0E35 (\u0E40\u0E23\u0E35\u0E22\u0E01\u0E27\u0E48\u0E32 Trailing Lock / TL)
   - TP3 = +1,200 \u0E08\u0E38\u0E14 (+12.00 \u0E14\u0E2D\u0E25\u0E25\u0E32\u0E23\u0E4C)
   - \u0E1C\u0E25\u0E25\u0E31\u0E1E\u0E18\u0E4C\u0E15\u0E48\u0E2D 1 Idea: \u0E0A\u0E19\u0E30\u0E04\u0E23\u0E1A 3 \u0E44\u0E21\u0E49 (Full Sweep) \u0E44\u0E14\u0E49 +0.80R (+2,400p), \u0E15\u0E34\u0E14 Trailing Lock \u0E44\u0E14\u0E49 +0.53R (+1,600p), \u0E40\u0E01\u0E47\u0E1A\u0E41\u0E04\u0E48 TP1 \u0E41\u0E25\u0E49\u0E27\u0E42\u0E14\u0E19 SL 2 \u0E44\u0E21\u0E49\u0E17\u0E35\u0E48\u0E40\u0E2B\u0E25\u0E37\u0E2D \u0E40\u0E2A\u0E35\u0E22 -0.53R (-1,600p), \u0E0A\u0E19 SL \u0E17\u0E31\u0E49\u0E07 3 \u0E44\u0E21\u0E49 \u0E40\u0E2A\u0E35\u0E22 -1.00R (-3,000p)
2. \u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E40\u0E0A\u0E47\u0E01\u0E25\u0E34\u0E2A\u0E15\u0E4C 5 \u0E1B\u0E23\u0E30\u0E15\u0E39 (5 Quick Gates) \u0E41\u0E25\u0E30 12-Gate Protocol \u0E01\u0E48\u0E2D\u0E19\u0E27\u0E32\u0E07 Limit Order:
   - Gate 1: \u0E42\u0E0B\u0E19 H1 HVN (High Volume Node) \u0E23\u0E30\u0E22\u0E30 100\u2013200 \u0E08\u0E38\u0E14
   - Gate 2: \u0E41\u0E17\u0E48\u0E07\u0E40\u0E17\u0E35\u0E22\u0E19 H1 \u0E1B\u0E34\u0E14\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E42\u0E04\u0E23\u0E07\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E0A\u0E31\u0E14\u0E40\u0E08\u0E19
   - Gate 3: \u0E44\u0E17\u0E21\u0E4C\u0E40\u0E1F\u0E23\u0E21 M5 \u0E22\u0E48\u0E2D\u0E15\u0E31\u0E27\u0E41\u0E25\u0E30\u0E1B\u0E34\u0E14\u0E41\u0E17\u0E48\u0E07\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19
   - Gate 4: \u0E15\u0E31\u0E49\u0E07 Pending Limit Order \u0E21\u0E35\u0E2D\u0E32\u0E22\u0E38\u0E44\u0E21\u0E48\u0E40\u0E01\u0E34\u0E19 30 \u0E19\u0E32\u0E17\u0E35
   - Gate 5: \u0E2B\u0E49\u0E32\u0E21\u0E01\u0E14\u0E40\u0E02\u0E49\u0E32\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C\u0E14\u0E49\u0E27\u0E22\u0E21\u0E37\u0E2D (Market Order) \u0E2B\u0E23\u0E37\u0E2D\u0E41\u0E01\u0E49 SL \u0E02\u0E22\u0E32\u0E22\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E48\u0E22\u0E07\u0E40\u0E14\u0E47\u0E14\u0E02\u0E32\u0E14
3. \u0E1A\u0E23\u0E34\u0E2B\u0E32\u0E23\u0E2B\u0E19\u0E49\u0E32\u0E15\u0E31\u0E01 \u0E42\u0E04\u0E27\u0E15\u0E49\u0E32\u0E27\u0E31\u0E19\u0E25\u0E30\u0E44\u0E21\u0E48\u0E40\u0E01\u0E34\u0E19 3 \u0E44\u0E21\u0E49 (3 Ideas/\u0E27\u0E31\u0E19) \u0E01\u0E32\u0E23\u0E1E\u0E31\u0E01 Cooldown 15 \u0E19\u0E32\u0E17\u0E35\u0E2B\u0E25\u0E31\u0E07\u0E0A\u0E19 SL \u0E41\u0E25\u0E30\u0E01\u0E32\u0E23\u0E27\u0E32\u0E07\u0E41\u0E1C\u0E19\u0E17\u0E33\u0E01\u0E33\u0E44\u0E23\u0E43\u0E2B\u0E49\u0E1C\u0E48\u0E32\u0E19\u0E01\u0E0E Consistency Rule (\u0E04\u0E48\u0E32\u0E21\u0E32\u0E15\u0E23\u0E10\u0E32\u0E19 40% \u0E2B\u0E23\u0E37\u0E2D\u0E15\u0E32\u0E21\u0E17\u0E35\u0E48\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32\u0E43\u0E19\u0E41\u0E15\u0E48\u0E25\u0E30\u0E1E\u0E2D\u0E23\u0E4C\u0E15)
4. \u0E1E\u0E39\u0E14\u0E04\u0E38\u0E22\u0E43\u0E2B\u0E49\u0E04\u0E33\u0E1B\u0E23\u0E36\u0E01\u0E29\u0E32\u0E40\u0E23\u0E37\u0E48\u0E2D\u0E07\u0E08\u0E34\u0E15\u0E27\u0E34\u0E17\u0E22\u0E32\u0E01\u0E32\u0E23\u0E40\u0E17\u0E23\u0E14 \u0E27\u0E34\u0E19\u0E31\u0E22\u0E01\u0E32\u0E23\u0E23\u0E31\u0E01\u0E29\u0E32\u0E23\u0E30\u0E1A\u0E1A \u0E41\u0E25\u0E30\u0E01\u0E32\u0E23\u0E17\u0E1A\u0E17\u0E27\u0E19\u0E2A\u0E21\u0E38\u0E14\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E01\u0E32\u0E23\u0E40\u0E17\u0E23\u0E14 (Trade Journal) \u0E14\u0E49\u0E27\u0E22\u0E19\u0E49\u0E33\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E17\u0E35\u0E48\u0E40\u0E1B\u0E47\u0E19\u0E01\u0E31\u0E19\u0E40\u0E2D\u0E07 \u0E01\u0E23\u0E30\u0E0A\u0E31\u0E1A \u0E0A\u0E31\u0E14\u0E40\u0E08\u0E19 \u0E40\u0E1B\u0E47\u0E19\u0E23\u0E30\u0E1A\u0E1A \u0E08\u0E31\u0E14\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E43\u0E2B\u0E49\u0E2D\u0E48\u0E32\u0E19\u0E07\u0E48\u0E32\u0E22\u0E14\u0E49\u0E27\u0E22 Markdown/\u0E15\u0E32\u0E23\u0E32\u0E07\u0E40\u0E21\u0E37\u0E48\u0E2D\u0E40\u0E2B\u0E21\u0E32\u0E30 \u0E41\u0E25\u0E30\u0E2D\u0E49\u0E32\u0E07\u0E2D\u0E34\u0E07\u0E15\u0E31\u0E27\u0E40\u0E25\u0E02\u0E08\u0E23\u0E34\u0E07\u0E08\u0E32\u0E01\u0E1E\u0E2D\u0E23\u0E4C\u0E15\u0E02\u0E2D\u0E07\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49\u0E40\u0E2A\u0E21\u0E2D \u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E22\u0E49\u0E33\u0E27\u0E48\u0E32\u0E40\u0E1B\u0E47\u0E19\u0E04\u0E33\u0E41\u0E19\u0E30\u0E19\u0E33\u0E40\u0E0A\u0E34\u0E07\u0E23\u0E30\u0E1A\u0E1A\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E48\u0E22\u0E07 \u0E44\u0E21\u0E48\u0E43\u0E0A\u0E48\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E13\u0E0B\u0E37\u0E49\u0E2D\u0E02\u0E32\u0E22`;
var propRulesProbeCache = /* @__PURE__ */ new Map();
function extractHtmlTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]{1,160}?)<\/title>/i);
  if (!m) return null;
  const cleaned = m[1].replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, 110) : null;
}
async function probeSinglePropFirm(firm, forceRefresh = false) {
  const now = Date.now();
  const cached = propRulesProbeCache.get(firm.id);
  if (!forceRefresh && cached && cached.expiresAt > now) {
    return cached.data;
  }
  const started = Date.now();
  let httpStatus = 0;
  let finalUrl = firm.rulesUrl;
  let pageTitle = null;
  let lastModifiedHeader = null;
  let probeStatus = "UNREACHABLE";
  const probeTarget = async (url) => {
    const resp = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(4500),
      headers: {
        "User-Agent": "TallyNX-Desk-PropRules-Monitor/1.0 (+https://desk.tallynx.com)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    httpStatus = resp.status;
    finalUrl = resp.url || url;
    lastModifiedHeader = resp.headers.get("last-modified");
    if (resp.status >= 200 && resp.status < 400) {
      probeStatus = "LIVE_OK";
      const contentType = resp.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        const chunk = (await resp.text()).slice(0, 12e3);
        pageTitle = extractHtmlTitle(chunk);
      }
    } else if (resp.status === 403 || resp.status === 429 || resp.status === 503) {
      probeStatus = "CF_PROTECTED";
    }
  };
  try {
    await probeTarget(firm.rulesUrl);
  } catch {
    try {
      await probeTarget(firm.websiteUrl);
    } catch {
      probeStatus = "UNREACHABLE";
    }
  }
  const result = {
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
    checkedAtIso: (/* @__PURE__ */ new Date()).toISOString()
  };
  propRulesProbeCache.set(firm.id, {
    expiresAt: Date.now() + 60 * 1e3,
    data: result
  });
  return result;
}
function createApp() {
  const app2 = express2();
  app2.use(express2.json({ limit: "8mb" }));
  const sovereignMt5BaseUrl = (process.env.MT5_SOVEREIGN_BASE_URL || process.env.FUNDEDNEXT_VPS_BASE_URL || process.env.FUNDEDNEXT_GATEWAY_URL || "").trim().replace(/\/+$/, "");
  const fundedNextVpsBaseUrl = (process.env.FUNDEDNEXT_VPS_BASE_URL || process.env.FUNDEDNEXT_GATEWAY_URL || sovereignMt5BaseUrl).trim().replace(/\/+$/, "");
  let fundedNext;
  const connectedMallSnapshots = /* @__PURE__ */ new Map();
  function mallSourceKey(uid, channel, accountId) {
    return JSON.stringify([uid, channel, accountId]);
  }
  function rememberMallSource(uid, accountId, source) {
    const key = mallSourceKey(uid, source.verifiedBadge.channel, accountId);
    const current = connectedMallSnapshots.get(key);
    if (current && Date.parse(current.capturedAt) > Date.parse(source.capturedAt)) return;
    connectedMallSnapshots.delete(key);
    connectedMallSnapshots.set(key, source);
    if (connectedMallSnapshots.size > 512) connectedMallSnapshots.delete(connectedMallSnapshots.keys().next().value);
  }
  app2.use("/api/fundednext", (req, res, next) => {
    if (!fundedNextVpsBaseUrl) {
      res.status(503).json({
        ok: false,
        code: "GATEWAY_UNCONFIGURED",
        error: "FundedNext gateway URL is not configured on this server."
      });
      return;
    }
    next();
  });
  app2.use("/api/fundednext", createFundedNextRouter({
    verifyIdToken: (token) => verifyFirebaseBearerToken("Bearer " + token, false),
    onExecutionsRead: (uid, accountId, executions) => {
      const latest = executions.filter((trade) => trade.kind === "TRADE" && trade.symbol && trade.closedAt && trade.netPnl !== null && Number.isFinite(Number(trade.netPnl)) && Number.isFinite(Date.parse(trade.closedAt)) && Date.parse(trade.closedAt) <= Date.now() && !trade.unverifiedFields?.some((field) => field === "closedAt" || field === "netPnl")).sort((a, b) => Date.parse(b.closedAt) - Date.parse(a.closedAt))[0];
      if (latest) rememberMallSource(uid, accountId, {
        reference: accountId + ":" + latest.id,
        symbol: latest.symbol,
        capturedAt: latest.closedAt,
        pnl: Number(latest.netPnl),
        movement: { open: Number(latest.openPrice), close: Number(latest.closePrice) },
        verifiedBadge: { channel: "FUNDEDNEXT_MCP", brokerName: "FundedNext", verifiedAt: latest.fetchedAt }
      });
    },
    services: () => fundedNext ??= createRemoteVpsPilotServices({
      baseUrl: fundedNextVpsBaseUrl,
      secret: process.env.FUNDEDNEXT_VPS_RPC_SECRET
    }),
    secureCookies: process.env.NODE_ENV !== "development"
  }));
  const MARKETPLACE_STORE_PATH = path.join(os.tmpdir(), "tredyn_marketplace_store_v1.json");
  const marketplaceMemoryStore = /* @__PURE__ */ new Map();
  function loadMarketplaceStore() {
    try {
      if (fs.existsSync(MARKETPLACE_STORE_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(MARKETPLACE_STORE_PATH, "utf8"));
        if (Array.isArray(parsed)) {
          parsed.forEach((item) => {
            if (item && item.id) marketplaceMemoryStore.set(item.id, item);
          });
        }
      }
    } catch {
    }
    return Array.from(marketplaceMemoryStore.values()).sort(
      (a, b) => String(b.createdAt).localeCompare(String(a.createdAt))
    );
  }
  function saveMarketplaceSetup(setup) {
    marketplaceMemoryStore.set(setup.id, setup);
    try {
      const all = Array.from(marketplaceMemoryStore.values());
      fs.writeFileSync(MARKETPLACE_STORE_PATH, JSON.stringify(all), "utf8");
    } catch {
    }
  }
  function removeMarketplaceSetup(id) {
    marketplaceMemoryStore.delete(id);
    try {
      const all = Array.from(marketplaceMemoryStore.values());
      fs.writeFileSync(MARKETPLACE_STORE_PATH, JSON.stringify(all), "utf8");
    } catch {
    }
  }
  const SYMBOL_TO_YAHOO = {
    XAUUSD: ["GC=F", "XAUUSD=X"],
    EURUSD: ["EURUSD=X"],
    GBPUSD: ["GBPUSD=X"],
    USDJPY: ["USDJPY=X"],
    NAS100: ["NQ=F", "^NDX"],
    US30: ["YM=F", "^DJI"],
    BTCUSD: ["BTC-USD"]
  };
  async function fetchTradingViewScanQuote(marketPath, tickers) {
    try {
      const resp = await fetch(`https://scanner.tradingview.com/${marketPath}/scan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (TallyNXDesk/3.2)"
        },
        body: JSON.stringify({
          symbols: { tickers },
          columns: ["close"]
        }),
        signal: AbortSignal.timeout(4e3)
      });
      if (!resp.ok) return null;
      const json = await resp.json();
      const rows = json.data || [];
      for (const t of tickers) {
        const match = rows.find((r) => r.s === t);
        const px = match?.d?.[0];
        if (typeof px === "number" && Number.isFinite(px) && px > 0) {
          return { price: px, label: `${t} Live` };
        }
      }
      return null;
    } catch {
      return null;
    }
  }
  async function fetchSwissquoteSpotQuote(base, quote) {
    try {
      const resp = await fetch(
        `https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/${encodeURIComponent(
          base
        )}/${encodeURIComponent(quote)}`,
        {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(4e3)
        }
      );
      if (!resp.ok) return null;
      const json = await resp.json();
      const prof = json?.[0]?.spreadProfilePrices?.[0];
      if (prof && typeof prof.bid === "number" && typeof prof.ask === "number" && prof.bid > 0 && prof.ask > 0) {
        return {
          price: (prof.bid + prof.ask) / 2,
          label: `Swissquote ${base}/${quote} Spot`
        };
      }
      return null;
    } catch {
      return null;
    }
  }
  async function fetchLiveSpotQuote(rawSym) {
    if (rawSym === "XAUUSD") {
      const tv = await fetchTradingViewScanQuote("cfd", [
        "OANDA:XAUUSD",
        "FX:XAUUSD",
        "TVC:GOLD"
      ]);
      if (tv) return tv;
      return fetchSwissquoteSpotQuote("XAU", "USD");
    }
    if (rawSym === "US30") {
      return fetchTradingViewScanQuote("cfd", ["OANDA:US30USD"]);
    }
    if (rawSym === "EURUSD") {
      return await fetchTradingViewScanQuote("forex", ["OANDA:EURUSD"]) || await fetchSwissquoteSpotQuote("EUR", "USD");
    }
    if (rawSym === "GBPUSD") {
      return await fetchTradingViewScanQuote("forex", ["OANDA:GBPUSD"]) || await fetchSwissquoteSpotQuote("GBP", "USD");
    }
    if (rawSym === "USDJPY") {
      return await fetchTradingViewScanQuote("forex", ["OANDA:USDJPY"]) || await fetchSwissquoteSpotQuote("USD", "JPY");
    }
    if (rawSym === "BTCUSD") {
      try {
        const br = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT", {
          signal: AbortSignal.timeout(3500)
        });
        if (br.ok) {
          const j = await br.json();
          const px = Number(j.price);
          if (Number.isFinite(px) && px > 0) {
            return { price: px, label: "Binance BTCUSDT Spot" };
          }
        }
      } catch {
      }
      return fetchTradingViewScanQuote("crypto", ["BINANCE:BTCUSDT"]);
    }
    return null;
  }
  const TIMEFRAME_TO_YAHOO = {
    "5m": { interval: "5m", range: "2d" },
    "15m": { interval: "15m", range: "5d" },
    "1h": { interval: "60m", range: "1mo" },
    "4h": { interval: "60m", range: "3mo" },
    "1d": { interval: "1d", range: "6mo" }
  };
  function aggregateCandles4H(hourly) {
    const out = [];
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
        volume: chunk.reduce((acc, c) => acc + (c.volume || 0), 0)
      });
    }
    return out;
  }
  const liveChartCache = new LiveChartResponseCache();
  app2.get("/api/market/live-chart", async (req, res) => {
    try {
      const rawSym = String(req.query.symbol || "XAUUSD").trim().toUpperCase();
      const rawTf = String(req.query.timeframe || "15m").trim().toLowerCase();
      const forceRefresh = req.query.refresh === "1" || req.query.nocache === "1";
      const tf = TIMEFRAME_TO_YAHOO[rawTf] ? rawTf : "15m";
      const tickers = SYMBOL_TO_YAHOO[rawSym] || [rawSym];
      const yCfg = TIMEFRAME_TO_YAHOO[tf];
      const cacheKey = `${rawSym}:${tf}`;
      const lookup = await liveChartCache.getOrFetch(
        cacheKey,
        async () => {
          const spotPromise = fetchLiveSpotQuote(rawSym);
          let fetchedCandles = [];
          let usedSource = "";
          let usedFuturesProxy = false;
          if (rawSym === "BTCUSD") {
            try {
              const bInterval = tf === "1d" ? "1d" : tf === "4h" ? "4h" : tf === "1h" ? "1h" : tf === "5m" ? "5m" : "15m";
              const br = await fetch(
                `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${bInterval}&limit=80`,
                { signal: AbortSignal.timeout(7e3) }
              );
              if (br.ok) {
                const klines = await br.json();
                fetchedCandles = klines.map((k) => {
                  const dt = new Date(Number(k[0]));
                  return {
                    ts: Number(k[0]),
                    timeLabel: `${dt.toISOString().slice(5, 10)} ${dt.toISOString().slice(11, 16)}`,
                    open: Number(k[1]),
                    high: Number(k[2]),
                    low: Number(k[3]),
                    close: Number(k[4]),
                    volume: Number(k[5])
                  };
                });
                usedSource = "Binance Spot (BTCUSDT)";
              }
            } catch {
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
                    Accept: "application/json",
                    "User-Agent": "Mozilla/5.0 (TallyNXDesk/3.2)"
                  },
                  signal: AbortSignal.timeout(8e3)
                });
                if (!r.ok) continue;
                const json = await r.json();
                const result = json.chart?.result?.[0];
                const timestamps = result?.timestamp || [];
                const q = result?.indicators?.quote?.[0];
                if (!q || timestamps.length === 0) continue;
                const parsed = [];
                for (let i = 0; i < timestamps.length; i++) {
                  const o = q.open?.[i];
                  const h = q.high?.[i];
                  const l = q.low?.[i];
                  const c = q.close?.[i];
                  if (typeof o === "number" && typeof h === "number" && typeof l === "number" && typeof c === "number" && Number.isFinite(c) && c > 0) {
                    const dt = new Date(timestamps[i] * 1e3);
                    const label = tf === "1d" ? dt.toISOString().slice(5, 10) : `${dt.toISOString().slice(5, 10)} ${dt.toISOString().slice(11, 16)}`;
                    parsed.push({
                      ts: timestamps[i] * 1e3,
                      timeLabel: label,
                      open: o,
                      high: h,
                      low: l,
                      close: c,
                      volume: Number(q.volume?.[i] || 0)
                    });
                  }
                }
                if (parsed.length >= 10) {
                  fetchedCandles = tf === "4h" ? aggregateCandles4H(parsed) : parsed;
                  usedFuturesProxy = ticker === "GC=F" || ticker === "YM=F" || ticker === "NQ=F";
                  usedSource = `Yahoo Finance (${ticker})`;
                  break;
                }
              } catch {
              }
            }
          }
          const liveSpotQuote = await spotPromise;
          if (fetchedCandles.length < 5) {
            throw Object.assign(new Error(`\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E14\u0E36\u0E07\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E01\u0E23\u0E32\u0E1F\u0E2A\u0E14\u0E02\u0E2D\u0E07 ${rawSym} (${tf}) \u0E44\u0E14\u0E49\u0E43\u0E19\u0E02\u0E13\u0E30\u0E19\u0E35\u0E49`), {
              httpStatus: 502
            });
          }
          const calibratedCandles = liveSpotQuote ? calibrateCandlesToLiveSpot(fetchedCandles, liveSpotQuote.price, tf, usedFuturesProxy) : fetchedCandles;
          const finalSource = liveSpotQuote ? `${liveSpotQuote.label}${usedFuturesProxy ? " (Spot-Calibrated)" : ""}` : usedSource;
          return computeLiveChartTelemetryFromCandles(rawSym, tf, calibratedCandles, finalSource);
        },
        { forceRefresh }
      );
      res.setHeader(
        "Cache-Control",
        forceRefresh ? "no-store, max-age=0" : "public, max-age=2, s-maxage=3, stale-while-revalidate=5"
      );
      res.setHeader("X-Tredyn-Chart-Cache", lookup.cacheStatus);
      res.json({ ok: true, telemetry: lookup.telemetry, cacheStatus: lookup.cacheStatus });
    } catch (err) {
      const status = typeof err === "object" && err !== null && "httpStatus" in err ? Number(err.httpStatus) || 500 : 500;
      res.status(status).json({
        ok: false,
        error: err instanceof Error ? err.message : "Live chart fetch failed"
      });
    }
  });
  app2.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      models: {
        router: GEMINI_DECISION_MODEL,
        primaryDeep: GEMINI_FLASH_LITE_35,
        primaryFast: GEMINI_FLASH_LITE_31
      },
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  const DEFAULT_SOVEREIGN_MT5_BASE_URL = sovereignMt5BaseUrl;
  async function checkDistributedRateLimit(key, maxRequests = RATE_MAX_REQUESTS) {
    const localRate = checkChatRateLimit(key, Date.now(), maxRequests);
    if (!localRate.allowed || !DEFAULT_SOVEREIGN_MT5_BASE_URL) return localRate;
    try {
      const resp = await fetch(`${DEFAULT_SOVEREIGN_MT5_BASE_URL}/ratelimit/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          windowSec: Math.round(RATE_WINDOW_MS / 1e3),
          maxRequests
        }),
        signal: AbortSignal.timeout(700)
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.allowed === false) {
          return {
            allowed: false,
            retryAfterSec: Math.max(1, Number(data.retryAfterSec) || 60)
          };
        }
      }
    } catch {
    }
    return localRate;
  }
  app2.get("/api/mt5/engine-status", (_req, res) => {
    res.json({
      ok: true,
      liveBridgeReady: true,
      cloudConnectorsReady: true,
      sharedVpsDisabled: true,
      engineReady: true
    });
  });
  app2.post("/api/mt5/live-bridge/push", async (req, res) => {
    try {
      const body = req.body || {};
      const headerKey = typeof req.headers["x-tallynx-api-key"] === "string" ? req.headers["x-tallynx-api-key"].trim() : typeof req.headers["x-tredyn-api-key"] === "string" ? req.headers["x-tredyn-api-key"].trim() : typeof body.tallynxApiKey === "string" ? body.tallynxApiKey.trim() : typeof body.tredynApiKey === "string" ? body.tredynApiKey.trim() : "";
      if (!isValidTredynApiKey(headerKey)) {
        res.status(401).json({
          ok: false,
          error: "Invalid or missing X-TallyNX-Api-Key (or X-Tredyn-Api-Key) header"
        });
        return;
      }
      const rawMeta = body.meta && typeof body.meta === "object" ? body.meta : {};
      const rawPositions = Array.isArray(body.positions) ? body.positions : Array.isArray(body.deals) ? body.deals : [];
      const pushOffset = normalizeMt5TimeOffsetSetting(body.mt5TimeOffset);
      const { positions, skippedCount } = normalizeBridgePositionsToMt5Records(rawPositions, void 0, pushOffset);
      const liveState = normalizeLiveBridgeState(body, rawMeta);
      const syncedAt = (/* @__PURE__ */ new Date()).toISOString();
      const entry = {
        syncedAt,
        reason: typeof body.reason === "string" ? body.reason : "MT5_EA_PUSH",
        meta: {
          holderName: String(rawMeta.holderName || rawMeta.name || "Tredyn MT5 Trader"),
          login: String(rawMeta.login || rawMeta.accountLogin || ""),
          broker: String(rawMeta.broker || rawMeta.company || "MT5 Live Bridge"),
          server: String(rawMeta.server || ""),
          currency: String(rawMeta.currency || "USD"),
          initialDeposit: Number(rawMeta.initialDeposit ?? rawMeta.balance ?? 0) || 0,
          summaryNetProfit: rawMeta.summaryNetProfit !== void 0 && rawMeta.summaryNetProfit !== null ? Number(rawMeta.summaryNetProfit) : null
        },
        live: liveState,
        positions,
        skippedCount
      };
      saveLiveBridgeFeed(headerKey, entry);
      telemetryBus.emit("bridge_push", {
        login: entry.meta.login,
        broker: entry.meta.broker,
        initialDeposit: entry.meta.initialDeposit,
        summaryNetProfit: entry.meta.summaryNetProfit,
        receivedPositions: positions.length,
        openPositionsCount: liveState.openPositions.length,
        balance: liveState.balance,
        equity: liveState.equity,
        floatingPnl: liveState.floatingPnl,
        syncedAt
      });
      if (DEFAULT_SOVEREIGN_MT5_BASE_URL) {
        await fetch(`${DEFAULT_SOVEREIGN_MT5_BASE_URL}/live-bridge/push`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Tredyn-Api-Key": headerKey
          },
          body: JSON.stringify({
            tredynApiKey: headerKey,
            meta: entry.meta,
            live: entry.live,
            openPositions: entry.live?.openPositions ?? [],
            positions: entry.positions
          }),
          signal: AbortSignal.timeout(4e3)
        }).catch(() => null);
      }
      res.json({
        ok: true,
        syncedAt,
        receivedPositions: positions.length,
        openPositionsCount: liveState.openPositions.length,
        skippedCount
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "Live Bridge push error"
      });
    }
  });
  app2.get("/api/mt5/live-bridge/live", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const headerKey = typeof req.headers["x-tallynx-api-key"] === "string" ? req.headers["x-tallynx-api-key"].trim() : typeof req.headers["x-tredyn-api-key"] === "string" ? req.headers["x-tredyn-api-key"].trim() : "";
    if (!isValidTredynApiKey(headerKey)) {
      res.status(401).json({
        ok: false,
        error: "Invalid or missing X-TallyNX-Api-Key (or X-Tredyn-Api-Key) header",
        code: "INVALID_TREDYN_API_KEY"
      });
      return;
    }
    const rate = checkChatRateLimit(`live_bridge:${hashTredynApiKey(headerKey)}`, Date.now(), 450);
    if (!rate.allowed) {
      res.status(429).json({
        ok: false,
        error: `Live telemetry rate limit exceeded; retry in ${rate.retryAfterSec}s`,
        code: "RATE_LIMITED"
      });
      return;
    }
    let feed = getLiveBridgeFeed(headerKey);
    const ageMs = feed ? Date.now() - Date.parse(feed.syncedAt) : Infinity;
    if ((!feed || !Number.isFinite(ageMs) || ageMs >= 2500) && DEFAULT_SOVEREIGN_MT5_BASE_URL) {
      try {
        const pullResp = await fetch(
          `${DEFAULT_SOVEREIGN_MT5_BASE_URL}/live-bridge/pull?apiKey=${encodeURIComponent(headerKey)}`,
          {
            method: "GET",
            headers: {
              Accept: "application/json",
              "X-Tredyn-Api-Key": headerKey
            },
            signal: AbortSignal.timeout(4e3)
          }
        );
        if (pullResp.ok) {
          const pullData = await pullResp.json();
          if (pullData?.ok && pullData.entry) {
            const rawMeta = pullData.entry.meta || {};
            const rawPositions = Array.isArray(pullData.entry.positions) ? pullData.entry.positions : [];
            const { positions, skippedCount } = normalizeBridgePositionsToMt5Records(rawPositions);
            const pulledFeed = {
              syncedAt: String(pullData.entry.syncedAt || (/* @__PURE__ */ new Date()).toISOString()),
              reason: "VPS01_PERSISTENT_STORE",
              meta: {
                holderName: String(rawMeta.holderName || rawMeta.name || "Tredyn MT5 Trader"),
                login: String(rawMeta.login || ""),
                broker: String(rawMeta.broker || "MT5 Live Bridge"),
                server: String(rawMeta.server || ""),
                currency: String(rawMeta.currency || "USD"),
                initialDeposit: Number(rawMeta.initialDeposit ?? 0) || 0,
                summaryNetProfit: rawMeta.summaryNetProfit !== void 0 && rawMeta.summaryNetProfit !== null ? Number(rawMeta.summaryNetProfit) : null
              },
              live: normalizeLiveBridgeState(pullData.entry, rawMeta),
              positions,
              skippedCount
            };
            saveLiveBridgeFeed(headerKey, pulledFeed);
            feed = pulledFeed;
          }
        }
      } catch {
      }
    }
    if (!feed) {
      res.status(404).json({
        ok: false,
        error: "Waiting for MT5 Live Bridge heartbeat for this tredyn-api-key",
        code: "LIVE_BRIDGE_WAITING"
      });
      return;
    }
    const live = feed.live ?? {
      balance: feed.meta.initialDeposit > 0 ? feed.meta.initialDeposit : null,
      equity: feed.meta.initialDeposit > 0 ? feed.meta.initialDeposit : null,
      floatingPnl: 0,
      margin: null,
      freeMargin: null,
      marginLevelPct: null,
      dailyLossUsedUsd: null,
      dailyLossLimitUsd: null,
      openPositions: []
    };
    res.json({
      ok: true,
      provider: "LIVE_BRIDGE",
      syncedAt: feed.syncedAt,
      meta: feed.meta,
      live,
      openPositions: live.openPositions,
      positionsCount: feed.positions.length
    });
  });
  app2.get("/api/mt5/scripts/:filename", (req, res) => {
    const allowed = ["TredynLiveBridge.mq5", "TredynLiveBridge.ex5"];
    const filename = req.params.filename;
    if (!allowed.includes(filename)) {
      res.status(410).send("Only safe outbound TredynLiveBridge (.mq5/.ex5) scripts are distributed.");
      return;
    }
    const filePath = path.join(process.cwd(), "scripts", filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).send("Script file missing");
      return;
    }
    if (filename.endsWith(".ex5")) {
      const bin = fs.readFileSync(filePath);
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", String(bin.length));
      res.send(bin);
      return;
    }
    let content = fs.readFileSync(filePath, "utf8");
    if (filename === "TredynLiveBridge.mq5") {
      const apiKeyParam = typeof req.query.apiKey === "string" ? req.query.apiKey.trim() : "";
      const baseUrlParam = typeof req.query.baseUrl === "string" ? req.query.baseUrl.trim() : "";
      if (isValidTredynApiKey(apiKeyParam)) {
        content = content.replace("trd_live_replace_with_your_key", apiKeyParam).replace("YOUR_TREDYN_API_KEY", apiKeyParam);
      }
      if (baseUrlParam && /^https?:\/\/[^\s"']+$/i.test(baseUrlParam)) {
        content = content.replace(/https:\/\/(?:(?:desk|mall)\.tallynx\.com|tredyn-desk\.vercel\.app)(?![\w.:-])/g, () => baseUrlParam.replace(/\/+$/, ""));
      }
    }
    const isPython = filename.endsWith(".py");
    const isMql5 = filename.endsWith(".mq5");
    res.setHeader(
      "Content-Type",
      isPython ? "text/x-python; charset=utf-8" : isMql5 ? "text/plain; charset=utf-8" : "text/x-shellscript; charset=utf-8"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(content);
  });
  app2.post("/api/mt5/test-gateway", (_req, res) => {
    res.status(410).json({
      ok: false,
      error: "\u0E1B\u0E34\u0E14\u0E0A\u0E48\u0E2D\u0E07\u0E17\u0E32\u0E07 Shared VPS Gateway \u0E41\u0E25\u0E49\u0E27\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E1B\u0E25\u0E2D\u0E14\u0E20\u0E31\u0E22\u0E15\u0E32\u0E21\u0E01\u0E0E Prop Firm (Shared IP) \u0E01\u0E23\u0E38\u0E13\u0E32\u0E43\u0E0A\u0E49 Live Bridge (.ex5), Myfxbook API, FundedNext MCP, ProjectX API \u0E2B\u0E23\u0E37\u0E2D\u0E44\u0E1F\u0E25\u0E4C .xlsx"
    });
  });
  const fundedNextReconnect = {
    ok: false,
    code: "reconnect_required",
    status: "reconnect_required",
    error: "Reconnect FundedNext through the pilot connection flow."
  };
  const requireFundedNextReconnect = (_req, res) => {
    res.status(409).json(fundedNextReconnect);
  };
  app2.post("/api/mt5/fundednext-oauth/start", requireFundedNextReconnect);
  app2.get("/api/mt5/fundednext-oauth/callback", requireFundedNextReconnect);
  app2.post("/api/mt5/fundednext-oauth/refresh", requireFundedNextReconnect);
  app2.post("/api/mt5/fundednext-live", requireFundedNextReconnect);
  app2.post("/api/mt5/sync-readonly", async (req, res) => {
    if (req.body?.provider === "FUNDEDNEXT_MCP") {
      res.status(409).json(fundedNextReconnect);
      return;
    }
    try {
      const caller = await verifyFirebaseBearerToken(req.headers.authorization);
      const rateKey = `mt5:${caller?.uid || req.ip || "anon"}`;
      const rate = await checkDistributedRateLimit(rateKey);
      if (!rate.allowed) {
        res.status(429).json({
          error: `\u0E0B\u0E34\u0E07\u0E01\u0E4C\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25 MT5 \u0E1A\u0E48\u0E2D\u0E22\u0E40\u0E01\u0E34\u0E19\u0E01\u0E33\u0E2B\u0E19\u0E14\u0E0A\u0E31\u0E48\u0E27\u0E04\u0E23\u0E32\u0E27 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E2D ${rate.retryAfterSec} \u0E27\u0E34\u0E19\u0E32\u0E17\u0E35`,
          code: "RATE_LIMITED"
        });
        return;
      }
      const body = req.body || {};
      const provider = body.provider === "LIVE_BRIDGE" ? "LIVE_BRIDGE" : body.provider === "MYFXBOOK_API" ? "MYFXBOOK_API" : body.provider === "PROJECTX_API" ? "PROJECTX_API" : null;
      if (!provider) {
        const isDeprecatedRisky = body.provider === "DIRECT_INVESTOR" || body.provider === "METAAPI_CLOUD" || body.provider === "BRIDGE_API";
        res.status(isDeprecatedRisky ? 410 : 400).json({
          error: isDeprecatedRisky ? "\u0E0A\u0E48\u0E2D\u0E07\u0E17\u0E32\u0E07\u0E25\u0E47\u0E2D\u0E01\u0E2D\u0E34\u0E19 Investor Password / Shared VPS \u0E16\u0E39\u0E01\u0E16\u0E2D\u0E14\u0E2D\u0E2D\u0E01\u0E16\u0E32\u0E27\u0E23\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E1B\u0E49\u0E2D\u0E07\u0E01\u0E31\u0E19\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E48\u0E22\u0E07\u0E1C\u0E34\u0E14\u0E01\u0E0E Shared IP \u0E02\u0E2D\u0E07\u0E01\u0E2D\u0E07\u0E17\u0E38\u0E19 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E43\u0E0A\u0E49 Live Bridge (.ex5), Myfxbook API, FundedNext MCP, ProjectX API \u0E2B\u0E23\u0E37\u0E2D\u0E44\u0E1F\u0E25\u0E4C .xlsx" : "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E0A\u0E48\u0E2D\u0E07\u0E17\u0E32\u0E07\u0E0B\u0E34\u0E07\u0E01\u0E4C\u0E17\u0E35\u0E48\u0E1B\u0E25\u0E2D\u0E14\u0E20\u0E31\u0E22 (LIVE_BRIDGE, MYFXBOOK_API, FUNDEDNEXT_MCP \u0E2B\u0E23\u0E37\u0E2D PROJECTX_API)"
        });
        return;
      }
      const lookbackDays = Math.min(365, Math.max(1, Number(body.lookbackDays) || 30));
      const userToken = typeof body.token === "string" ? body.token.trim() : "";
      const mt5TimeOffset = normalizeMt5TimeOffsetSetting(body.mt5TimeOffset);
      if (provider === "LIVE_BRIDGE") {
        const tredynApiKey = typeof body.tredynApiKey === "string" && body.tredynApiKey.trim() ? body.tredynApiKey.trim() : userToken;
        if (!isValidTredynApiKey(tredynApiKey)) {
          res.status(400).json({
            error: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E30\u0E1A\u0E38 tredyn-api-key \u0E17\u0E35\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07 (\u0E40\u0E0A\u0E48\u0E19 trd_live_...)",
            code: "INVALID_TREDYN_API_KEY"
          });
          return;
        }
        let feed = getLiveBridgeFeed(tredynApiKey);
        if (!feed && DEFAULT_SOVEREIGN_MT5_BASE_URL) {
          try {
            const pullResp = await fetch(
              `${DEFAULT_SOVEREIGN_MT5_BASE_URL}/live-bridge/pull?apiKey=${encodeURIComponent(tredynApiKey)}`,
              {
                method: "GET",
                headers: {
                  Accept: "application/json",
                  "X-Tredyn-Api-Key": tredynApiKey
                },
                signal: AbortSignal.timeout(6e3)
              }
            );
            if (pullResp.ok) {
              const pullData = await pullResp.json();
              if (pullData?.ok && pullData.entry) {
                const rawMeta = pullData.entry.meta || {};
                const rawPositions = Array.isArray(pullData.entry.positions) ? pullData.entry.positions : [];
                const { positions, skippedCount } = normalizeBridgePositionsToMt5Records(
                  rawPositions,
                  void 0,
                  mt5TimeOffset
                );
                feed = {
                  syncedAt: String(pullData.entry.syncedAt || (/* @__PURE__ */ new Date()).toISOString()),
                  reason: "VPS01_PERSISTENT_STORE",
                  meta: {
                    holderName: String(rawMeta.holderName || rawMeta.name || "Tredyn MT5 Trader"),
                    login: String(rawMeta.login || ""),
                    broker: String(rawMeta.broker || "MT5 Live Bridge"),
                    server: String(rawMeta.server || ""),
                    currency: String(rawMeta.currency || "USD"),
                    initialDeposit: Number(rawMeta.initialDeposit ?? 0) || 0,
                    summaryNetProfit: rawMeta.summaryNetProfit !== void 0 && rawMeta.summaryNetProfit !== null ? Number(rawMeta.summaryNetProfit) : null
                  },
                  live: normalizeLiveBridgeState(pullData.entry, rawMeta),
                  positions,
                  skippedCount
                };
                saveLiveBridgeFeed(tredynApiKey, feed);
              }
            }
          } catch {
          }
        }
        if (!feed) {
          res.status(404).json({
            error: "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E13\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E08\u0E32\u0E01 MT5 Live Bridge \u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A tredyn-api-key \u0E19\u0E35\u0E49 \u2014 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E15\u0E34\u0E14\u0E15\u0E31\u0E49\u0E07 TredynLiveBridge.ex5 \u0E25\u0E07\u0E1A\u0E19\u0E01\u0E23\u0E32\u0E1F\u0E43\u0E19 MT5 \u0E41\u0E25\u0E30\u0E40\u0E1B\u0E34\u0E14 Allow WebRequest",
            code: "LIVE_BRIDGE_WAITING"
          });
          return;
        }
        res.json({
          ok: true,
          provider: "LIVE_BRIDGE",
          syncedAt: feed.syncedAt,
          meta: feed.meta,
          live: feed.live ?? null,
          positions: reapplyMt5TimezoneToPositions(feed.positions, mt5TimeOffset),
          skippedCount: feed.skippedCount
        });
        return;
      }
      if (provider === "MYFXBOOK_API") {
        const email = typeof body.email === "string" ? body.email.trim() : "";
        const password = typeof body.password === "string" ? body.password.trim() : "";
        const targetAccId = typeof body.externalAccountRef === "string" ? body.externalAccountRef.trim() : "";
        if (!email || !password) {
          res.status(400).json({ error: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E30\u0E1A\u0E38 Email \u0E41\u0E25\u0E30 Password \u0E02\u0E2D\u0E07\u0E1A\u0E31\u0E0D\u0E0A\u0E35 Myfxbook \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E0B\u0E34\u0E07\u0E01\u0E4C\u0E41\u0E1A\u0E1A Whitelisted API" });
          return;
        }
        const loginUrl = `https://www.myfxbook.com/api/login.json?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;
        const loginResp = await fetch(loginUrl, { signal: AbortSignal.timeout(12e3) });
        const loginJson = await loginResp.json().catch(() => ({}));
        if (!loginResp.ok || loginJson.error || !loginJson.session) {
          res.status(401).json({
            error: `Myfxbook Login \u0E44\u0E21\u0E48\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08: ${loginJson.message || `HTTP ${loginResp.status}`}`
          });
          return;
        }
        const session = loginJson.session;
        try {
          const accResp = await fetch(
            `https://www.myfxbook.com/api/get-my-accounts.json?session=${encodeURIComponent(session)}`,
            { signal: AbortSignal.timeout(12e3) }
          );
          const accJson = await accResp.json().catch(() => ({}));
          const accountsList = Array.isArray(accJson.accounts) ? accJson.accounts : [];
          if (accJson.error || accountsList.length === 0) {
            res.status(404).json({
              error: accJson.message || "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E1E\u0E2D\u0E23\u0E4C\u0E15\u0E43\u0E19\u0E1A\u0E31\u0E0D\u0E0A\u0E35 Myfxbook \u0E19\u0E35\u0E49 (\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E27\u0E48\u0E32\u0E1C\u0E39\u0E01 Investor Password \u0E1A\u0E19 Myfxbook \u0E41\u0E25\u0E49\u0E27)"
            });
            return;
          }
          const matchedAcc = accountsList.find(
            (a) => targetAccId && (String(a.id) === targetAccId || String(a.accountId) === targetAccId)
          ) || accountsList[0];
          const histResp = await fetch(
            `https://www.myfxbook.com/api/get-history.json?session=${encodeURIComponent(session)}&id=${encodeURIComponent(String(matchedAcc.id))}`,
            { signal: AbortSignal.timeout(12e3) }
          );
          const histJson = await histResp.json().catch(() => ({}));
          const rawHistory = Array.isArray(histJson.history) ? histJson.history : [];
          const normalizedInput = rawHistory.map((h, idx) => {
            const sizing = h.sizing;
            return {
              ticket: String(h.id || h.ticket || `myfx_${idx}`),
              symbol: String(h.symbol || "XAUUSD"),
              dir: String(h.action || "").toUpperCase().includes("SELL") ? "SELL" : "BUY",
              openTime: String(h.openTime || ""),
              closeTime: String(h.closeTime || h.openTime || ""),
              volume: Number(sizing?.value ?? h.lots ?? 0) || 0,
              openPrice: Number(h.openPrice || 0),
              closePrice: Number(h.closePrice || 0),
              slPrice: Number(h.sl || 0),
              tpPrice: Number(h.tp || 0),
              commission: Number(h.commission || 0),
              swap: Number(h.interest || 0),
              rawProfit: Number(h.profit || 0),
              comment: "Myfxbook Read-Only API"
            };
          });
          const { positions, skippedCount } = normalizeBridgePositionsToMt5Records(
            normalizedInput,
            void 0,
            mt5TimeOffset
          );
          const syncedAt = (/* @__PURE__ */ new Date()).toISOString();
          const latest = positions.filter((trade) => Number.isFinite(trade.closeTs) && trade.closeTs > 0 && trade.closeTs <= Date.now()).sort((a, b) => b.closeTs - a.closeTs)[0];
          const login = String(matchedAcc.accountId || matchedAcc.id || "");
          if (caller && login && latest && histResp.ok && !histJson.error) rememberMallSource(caller.uid, login, {
            reference: login + ":" + latest.ticket,
            symbol: latest.symbol,
            capturedAt: new Date(latest.closeTs).toISOString(),
            pnl: latest.netProfit,
            movement: { open: latest.openPrice, close: latest.closePrice },
            verifiedBadge: { channel: "MYFXBOOK_API", brokerName: String(matchedAcc.server?.name || "Myfxbook").slice(0, 80), verifiedAt: syncedAt }
          });
          res.json({
            ok: true,
            provider: "MYFXBOOK_API",
            syncedAt,
            meta: {
              holderName: matchedAcc.name || "Myfxbook Trader",
              login,
              broker: matchedAcc.server?.name || "Myfxbook Verified Feed",
              server: matchedAcc.server?.name || "",
              currency: matchedAcc.currency || "USD",
              initialDeposit: Number(matchedAcc.deposits || matchedAcc.balance || 0),
              summaryNetProfit: typeof matchedAcc.profit === "number" ? matchedAcc.profit : null
            },
            positions,
            skippedCount
          });
          return;
        } finally {
          await fetch(
            `https://www.myfxbook.com/api/logout.json?session=${encodeURIComponent(session)}`,
            { signal: AbortSignal.timeout(4e3) }
          ).catch(() => null);
        }
      }
      if (provider === "PROJECTX_API") {
        const userName = typeof body.email === "string" ? body.email.trim() : "";
        const apiKey = userToken;
        if (!userName || !apiKey) {
          res.status(400).json({ error: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E30\u0E1A\u0E38 Username \u0E41\u0E25\u0E30 API Key \u0E02\u0E2D\u0E07 ProjectX / TopstepX" });
          return;
        }
        const pxBase = "https://api.topstepx.com/api";
        const authResp = await fetch(`${pxBase}/Auth/loginKey`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ userName, apiKey }),
          signal: AbortSignal.timeout(12e3)
        });
        const authJson = await authResp.json().catch(() => ({}));
        if (!authResp.ok || !authJson.token) {
          res.status(401).json({
            error: `ProjectX Auth \u0E44\u0E21\u0E48\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08: ${authJson.errorMessage || `HTTP ${authResp.status}`}`
          });
          return;
        }
        const pxToken = authJson.token;
        const accResp = await fetch(`${pxBase}/Account/search`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${pxToken}`
          },
          body: JSON.stringify({ onlyActiveAccounts: false }),
          signal: AbortSignal.timeout(12e3)
        });
        const accJson = await accResp.json().catch(() => ({}));
        const accountsList = Array.isArray(accJson.accounts) ? accJson.accounts : [];
        const targetAcc = accountsList.find(
          (a) => typeof body.externalAccountRef === "string" && body.externalAccountRef.trim() && String(a.id) === body.externalAccountRef.trim()
        ) || accountsList[0];
        if (!targetAcc?.id) {
          res.status(404).json({ error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E1E\u0E2D\u0E23\u0E4C\u0E15 Futures \u0E43\u0E19\u0E1A\u0E31\u0E0D\u0E0A\u0E35 ProjectX / TopstepX \u0E19\u0E35\u0E49" });
          return;
        }
        const endTs = (/* @__PURE__ */ new Date()).toISOString();
        const startTs = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1e3).toISOString();
        const tradeResp = await fetch(`${pxBase}/Trade/search`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${pxToken}`
          },
          body: JSON.stringify({ accountId: targetAcc.id, startTimestamp: startTs, endTimestamp: endTs }),
          signal: AbortSignal.timeout(12e3)
        });
        const tradeJson = await tradeResp.json().catch(() => ({}));
        const pxTrades = (Array.isArray(tradeJson.trades) ? tradeJson.trades : []).map((t, i) => ({
          ticket: String(t.id || t.orderId || `px_${i}`),
          symbol: String(t.contractId || t.symbol || "MGC"),
          dir: Number(t.side) === 1 ? "SELL" : "BUY",
          openTime: String(t.creationTimestamp || ""),
          closeTime: String(t.creationTimestamp || ""),
          volume: Number(t.size || 1),
          openPrice: Number(t.price || 0),
          closePrice: Number(t.price || 0),
          commission: -Math.abs(Number(t.fees || 0)),
          swap: 0,
          rawProfit: Number(t.profitAndLoss || 0),
          comment: "ProjectX / TopstepX Cloud API"
        }));
        const { positions, skippedCount } = normalizeBridgePositionsToMt5Records(
          pxTrades,
          void 0,
          mt5TimeOffset
        );
        res.json({
          ok: true,
          provider: "PROJECTX_API",
          syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
          meta: {
            holderName: targetAcc.name || "ProjectX Futures Trader",
            login: String(targetAcc.id),
            broker: "ProjectX / TopstepX",
            server: "TopstepX-Cloud",
            currency: "USD",
            initialDeposit: Number(targetAcc.balance || 0),
            summaryNetProfit: null
          },
          positions,
          skippedCount
        });
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({
        error: `\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E0B\u0E34\u0E07\u0E01\u0E4C\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E08\u0E32\u0E01\u0E0A\u0E48\u0E2D\u0E07\u0E17\u0E32\u0E07\u0E1B\u0E25\u0E2D\u0E14\u0E20\u0E31\u0E22\u0E44\u0E14\u0E49: ${msg}`
      });
    }
  });
  async function getMarketplaceListings() {
    const localListings = loadMarketplaceStore();
    const vpsListings = DEFAULT_SOVEREIGN_MT5_BASE_URL ? await fetch(`${DEFAULT_SOVEREIGN_MT5_BASE_URL}/marketplace/listings`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4e3)
    }).then(async (r) => r.ok ? await r.json() : null).catch(() => null) : null;
    const merged = /* @__PURE__ */ new Map();
    localListings.forEach((s) => merged.set(s.id, s));
    if (vpsListings && Array.isArray(vpsListings.listings)) {
      vpsListings.listings.forEach((s) => {
        if (s && s.id && s.proofHash && s.metrics?.tradeCount > 0) {
          merged.set(s.id, s);
        }
      });
    }
    return Array.from(merged.values()).sort(
      (a, b) => String(b.createdAt).localeCompare(String(a.createdAt))
    );
  }
  app2.get("/api/marketplace/listings", async (_req, res) => {
    try {
      res.json({ ok: true, listings: await getMarketplaceListings() });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to load marketplace listings"
      });
    }
  });
  app2.post("/api/marketplace/publish", async (req, res) => {
    try {
      const caller = await verifyFirebaseBearerToken(req.headers.authorization);
      if (!caller) {
        res.status(401).json({
          ok: false,
          error: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A\u0E1A\u0E31\u0E0D\u0E0A\u0E35 Google \u0E01\u0E48\u0E2D\u0E19\u0E25\u0E07\u0E02\u0E32\u0E22/\u0E40\u0E1C\u0E22\u0E41\u0E1E\u0E23\u0E48 Setup \u0E43\u0E19 Marketplace"
        });
        return;
      }
      const body = req.body || {};
      const title = String(body.title || "").trim().slice(0, 90);
      const summary = String(body.summary || "").trim().slice(0, 600);
      if (title.length < 4) {
        res.status(400).json({ ok: false, error: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E15\u0E31\u0E49\u0E07\u0E0A\u0E37\u0E48\u0E2D Setup \u0E2D\u0E22\u0E48\u0E32\u0E07\u0E19\u0E49\u0E2D\u0E22 4 \u0E15\u0E31\u0E27\u0E2D\u0E31\u0E01\u0E29\u0E23" });
        return;
      }
      const allowedChannels = [
        "LIVE_BRIDGE",
        "DIRECT_INVESTOR",
        "METAAPI_CLOUD",
        "MANUAL_XLSX",
        "FUNDEDNEXT_MCP",
        "MYFXBOOK_API",
        "PROJECTX_API"
      ];
      const verificationChannel = allowedChannels.includes(
        body.verificationChannel
      ) ? body.verificationChannel : "MANUAL_XLSX";
      const brokerServer = String(body.brokerServer || "").trim();
      const brokerName = String(body.brokerName || "").trim() || "MT5 Verified Broker";
      const rawLogin = String(body.login || "").trim();
      if (!rawLogin || rawLogin.length < 3) {
        res.status(400).json({
          ok: false,
          error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E40\u0E25\u0E02\u0E1E\u0E2D\u0E23\u0E4C\u0E15 MT5 (Account Login) \u2014 \u0E23\u0E30\u0E1A\u0E1A\u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1E\u0E2D\u0E23\u0E4C\u0E15\u0E17\u0E35\u0E48\u0E0B\u0E34\u0E07\u0E01\u0E4C MT5 \u0E08\u0E23\u0E34\u0E07\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19"
        });
        return;
      }
      const { valid: verifiedPositions } = validateVerifiedMt5Positions(body.mt5Positions || []);
      if (verifiedPositions.length === 0) {
        res.status(400).json({
          ok: false,
          error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E1B\u0E23\u0E30\u0E27\u0E31\u0E15\u0E34\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C MT5 \u0E08\u0E23\u0E34\u0E07\u0E17\u0E35\u0E48\u0E1C\u0E48\u0E32\u0E19\u0E01\u0E32\u0E23\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A (\u0E15\u0E49\u0E2D\u0E07\u0E0B\u0E34\u0E07\u0E01\u0E4C\u0E1C\u0E48\u0E32\u0E19 Investor Password, Live Bridge .ex5 \u0E2B\u0E23\u0E37\u0E2D Report .xlsx \u0E01\u0E48\u0E2D\u0E19\u0E25\u0E07\u0E02\u0E32\u0E22)"
        });
        return;
      }
      const initialDeposit = Math.max(100, Number(body.initialDeposit) || 1e4);
      const metrics = computeVerifiedSetupMetrics(verifiedPositions, initialDeposit);
      const verifiedAt = (/* @__PURE__ */ new Date()).toISOString();
      const proofPayload = JSON.stringify({
        sellerUid: caller.uid,
        login: rawLogin,
        brokerServer: brokerServer || brokerName,
        verificationChannel,
        tradeCount: metrics.tradeCount,
        netProfitUsd: metrics.netProfitUsd,
        firstTicket: verifiedPositions[0].ticket,
        lastTicket: verifiedPositions[verifiedPositions.length - 1].ticket
      });
      const proofHash = crypto.createHash("sha256").update(proofPayload).digest("hex");
      const rawBp = body.blueprint || {};
      const blueprint = {
        directionMode: rawBp.directionMode === "BUY" || rawBp.directionMode === "SELL" ? rawBp.directionMode : "BOTH",
        primarySymbol: String(rawBp.primarySymbol || metrics.symbols[0] || "XAUUSD").toUpperCase(),
        timeframe: String(rawBp.timeframe || "H1 / M5").slice(0, 24),
        sessionFocus: rawBp.sessionFocus === "ASIA" || rawBp.sessionFocus === "LONDON" || rawBp.sessionFocus === "NY" ? rawBp.sessionFocus : "ALL",
        riskUsd: Math.max(5, Math.min(5e3, Number(rawBp.riskUsd) || 120)),
        slPoints: Math.max(50, Math.min(2e4, Number(rawBp.slPoints) || 1e3)),
        tp1Points: Math.max(50, Math.min(2e4, Number(rawBp.tp1Points) || 400)),
        tp2Points: Math.max(50, Math.min(4e4, Number(rawBp.tp2Points) || 800)),
        tp3Points: Math.max(50, Math.min(6e4, Number(rawBp.tp3Points) || 1200)),
        checklistNotes: Array.isArray(rawBp.checklistNotes) ? rawBp.checklistNotes.map((s) => String(s).trim()).filter(Boolean).slice(0, 12) : ["H1 Structure Confirmed", "M5 Pullback Confirmation", "12-Gate Fail-Closed"],
        executionPlaybook: String(rawBp.executionPlaybook || summary || "").slice(0, 1200)
      };
      const priceUsd = Math.max(0, Math.min(999, +(Number(body.priceUsd) || 0).toFixed(2)));
      const id = `MKT-${Date.now().toString(36).toUpperCase()}-${proofHash.slice(0, 6).toUpperCase()}`;
      const listing = {
        id,
        title,
        summary: summary || blueprint.executionPlaybook || `${blueprint.primarySymbol} MT5 Verified Setup`,
        priceUsd,
        sellerUid: caller.uid,
        sellerName: String(body.sellerName || caller.email.split("@")[0] || "Verified Trader").slice(0, 48),
        verificationChannel,
        brokerName,
        brokerServer: brokerServer || brokerName,
        maskedLogin: maskMt5Login(rawLogin),
        proofHash,
        verifiedAt,
        createdAt: verifiedAt,
        buyerCount: 0,
        metrics,
        blueprint
      };
      saveMarketplaceSetup(listing);
      if (DEFAULT_SOVEREIGN_MT5_BASE_URL) {
        await fetch(`${DEFAULT_SOVEREIGN_MT5_BASE_URL}/marketplace/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listing }),
          signal: AbortSignal.timeout(4e3)
        }).catch(() => null);
      }
      res.json({ ok: true, listing });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to publish setup"
      });
    }
  });
  app2.post("/api/marketplace/purchase", async (req, res) => {
    try {
      const caller = await verifyFirebaseBearerToken(req.headers.authorization);
      if (!caller) {
        res.status(401).json({
          ok: false,
          error: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A\u0E1A\u0E31\u0E0D\u0E0A\u0E35 Google \u0E01\u0E48\u0E2D\u0E19\u0E1B\u0E25\u0E14\u0E25\u0E47\u0E2D\u0E01/\u0E0B\u0E37\u0E49\u0E2D Setup"
        });
        return;
      }
      const setupId = String(req.body?.setupId || "").trim();
      if (!setupId) {
        res.status(400).json({ ok: false, error: "Missing setupId" });
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
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ setupId, buyerUid: caller.uid }),
          signal: AbortSignal.timeout(3500)
        }).catch(() => null);
      }
      res.json({
        ok: true,
        setupId,
        purchasedAt: (/* @__PURE__ */ new Date()).toISOString(),
        buyerCount: target?.buyerCount ?? 1
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "Purchase failed"
      });
    }
  });
  app2.delete("/api/marketplace/listings/:id", async (req, res) => {
    try {
      const caller = await verifyFirebaseBearerToken(req.headers.authorization);
      if (!caller) {
        res.status(401).json({ ok: false, error: "Authentication required" });
        return;
      }
      const id = String(req.params.id || "").trim();
      loadMarketplaceStore();
      const target = marketplaceMemoryStore.get(id);
      if (target && target.sellerUid !== caller.uid) {
        res.status(403).json({ ok: false, error: "\u0E04\u0E38\u0E13\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E25\u0E1A Setup \u0E02\u0E2D\u0E07\u0E1C\u0E39\u0E49\u0E02\u0E32\u0E22\u0E23\u0E32\u0E22\u0E2D\u0E37\u0E48\u0E19" });
        return;
      }
      removeMarketplaceSetup(id);
      if (DEFAULT_SOVEREIGN_MT5_BASE_URL) {
        await fetch(`${DEFAULT_SOVEREIGN_MT5_BASE_URL}/marketplace/delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
          signal: AbortSignal.timeout(3e3)
        }).catch(() => null);
      }
      res.json({ ok: true, id });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "Delete failed"
      });
    }
  });
  const ALLOWED_VOICE_NAMES = /* @__PURE__ */ new Set([
    "Aoede",
    "Kore",
    "Puck",
    "Charon",
    "Fenrir",
    "Leda",
    "Orus",
    "Zephyr"
  ]);
  function sanitizeVoiceName(raw) {
    const clean = typeof raw === "string" ? raw.trim() : "";
    return ALLOWED_VOICE_NAMES.has(clean) ? clean : "Aoede";
  }
  function extractGroundingSources(response) {
    const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (!Array.isArray(chunks)) return [];
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const chunk of chunks) {
      const web = chunk?.web;
      const uri = typeof web?.uri === "string" ? web.uri.trim() : "";
      if (!/^https?:\/\//i.test(uri) || seen.has(uri)) continue;
      seen.add(uri);
      out.push({
        title: typeof web?.title === "string" && web.title.trim() ? web.title.trim().slice(0, 120) : uri,
        uri
      });
      if (out.length >= 6) break;
    }
    return out;
  }
  app2.post("/api/chat", async (req, res) => {
    let isSseStarted = false;
    try {
      const caller = await verifyFirebaseBearerToken(req.headers.authorization);
      if (!caller) {
        res.status(401).json({
          error: '\u0E01\u0E23\u0E38\u0E13\u0E32\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A\u0E1A\u0E31\u0E0D\u0E0A\u0E35 Google \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19 Cloud AI Coach (\u0E2B\u0E23\u0E37\u0E2D\u0E01\u0E14\u0E1B\u0E38\u0E48\u0E21 "\u0E2A\u0E23\u0E38\u0E1B\u0E41\u0E1C\u0E19 GHR \u0E17\u0E31\u0E19\u0E17\u0E35" \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C\u0E08\u0E32\u0E01\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E43\u0E19\u0E40\u0E04\u0E23\u0E37\u0E48\u0E2D\u0E07\u0E1F\u0E23\u0E35)',
          code: "AUTH_REQUIRED"
        });
        return;
      }
      const rate = await checkDistributedRateLimit(`chat:${caller.uid}`, 35);
      if (!rate.allowed) {
        res.status(429).json({
          error: `\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19 AI \u0E42\u0E04\u0E49\u0E0A\u0E04\u0E23\u0E1A\u0E42\u0E04\u0E27\u0E15\u0E32\u0E0A\u0E31\u0E48\u0E27\u0E04\u0E23\u0E32\u0E27 (35 \u0E04\u0E23\u0E31\u0E49\u0E07 / 15 \u0E19\u0E32\u0E17\u0E35) \u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E2D ${rate.retryAfterSec} \u0E27\u0E34\u0E19\u0E32\u0E17\u0E35 \u0E2B\u0E23\u0E37\u0E2D\u0E43\u0E0A\u0E49\u0E1B\u0E38\u0E48\u0E21\u0E2A\u0E23\u0E38\u0E1B\u0E41\u0E1C\u0E19\u0E08\u0E32\u0E01\u0E40\u0E04\u0E23\u0E37\u0E48\u0E2D\u0E07`,
          code: "RATE_LIMITED"
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
        stream
      } = req.body || {};
      if (!message || typeof message !== "string" || !message.trim()) {
        res.status(400).json({ error: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E1E\u0E34\u0E21\u0E1E\u0E4C\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E17\u0E35\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E16\u0E32\u0E21\u0E42\u0E04\u0E49\u0E0A\u0E40\u0E17\u0E23\u0E14" });
        return;
      }
      if (message.length > 4e3) {
        res.status(400).json({ error: "\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E22\u0E32\u0E27\u0E40\u0E01\u0E34\u0E19 4,000 \u0E15\u0E31\u0E27\u0E2D\u0E31\u0E01\u0E29\u0E23 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E22\u0E48\u0E2D\u0E04\u0E33\u0E16\u0E32\u0E21\u0E43\u0E2B\u0E49\u0E01\u0E23\u0E30\u0E0A\u0E31\u0E1A\u0E02\u0E36\u0E49\u0E19" });
        return;
      }
      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({
          error: "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32 GEMINI_API_KEY \u0E1A\u0E19\u0E40\u0E0B\u0E34\u0E23\u0E4C\u0E1F\u0E40\u0E27\u0E2D\u0E23\u0E4C \u0E01\u0E23\u0E38\u0E13\u0E32\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E43\u0E19\u0E41\u0E1C\u0E07 Settings > Secrets \u0E2B\u0E23\u0E37\u0E2D\u0E43\u0E0A\u0E49\u0E1B\u0E38\u0E48\u0E21\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C\u0E41\u0E1C\u0E19\u0E08\u0E32\u0E01\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E43\u0E19\u0E40\u0E04\u0E23\u0E37\u0E48\u0E2D\u0E07",
          code: "MISSING_API_KEY"
        });
        return;
      }
      const safeContext = typeof deskContext === "string" ? deskContext.slice(0, 6e3) : "";
      const safeChartContext = typeof liveChartContext === "string" ? liveChartContext.slice(0, 4e3) : "";
      const binaryParts = [];
      const decodedTextSnippets = [];
      let hasPdfAttachment = false;
      let hasVisualAttachment = false;
      if (Array.isArray(attachments)) {
        for (const item of attachments.slice(0, 3)) {
          if (!item || typeof item !== "object") continue;
          const mime = String(item.mimeType || "").toLowerCase().trim();
          const name = String(item.name || "attachment").slice(0, 80);
          const rawB64 = String(item.base64 || "");
          const cleanB64 = rawB64.replace(/^data:[^;]+;base64,/, "");
          if (!cleanB64 || cleanB64.length > 35e5) continue;
          if (/^image\/(png|jpeg|jpg|webp)$/.test(mime)) {
            hasVisualAttachment = true;
            binaryParts.push({ mimeType: mime === "image/jpg" ? "image/jpeg" : mime, data: cleanB64 });
          } else if (mime === "application/pdf") {
            hasPdfAttachment = true;
            binaryParts.push({ mimeType: "application/pdf", data: cleanB64 });
          } else if (/^text\/(plain|csv|markdown|json)$|^application\/json$/.test(mime)) {
            const decoded = Buffer.from(cleanB64, "base64").toString("utf8").slice(0, 6e3);
            if (decoded.trim()) {
              decodedTextSnippets.push(`=== \u0E44\u0E1F\u0E25\u0E4C\u0E41\u0E19\u0E1A: ${name} (${mime}) ===
${decoded}`);
            }
          }
        }
      }
      const hasValidChartImage = typeof chartImageBase64 === "string" && chartImageBase64.length > 50 && chartImageBase64.length <= 35e5 && /^image\/(png|jpeg|jpg|webp)$/i.test(String(chartImageMimeType || ""));
      if (hasValidChartImage && binaryParts.length < 3) {
        hasVisualAttachment = true;
        const cleanBase64 = String(chartImageBase64).replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
        const normalizedMime = String(chartImageMimeType).toLowerCase() === "image/jpg" ? "image/jpeg" : String(chartImageMimeType).toLowerCase();
        binaryParts.push({ mimeType: normalizedMime, data: cleanBase64 });
      }
      const attachedDocsText = decodedTextSnippets.join("\n\n").slice(0, 16e3);
      let baseSystemInstruction = safeContext ? `${BASE_GHR_SYSTEM_INSTRUCTION}

=== \u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E1E\u0E2D\u0E23\u0E4C\u0E15\u0E41\u0E25\u0E30\u0E42\u0E15\u0E4A\u0E30\u0E40\u0E17\u0E23\u0E14\u0E1B\u0E31\u0E08\u0E08\u0E38\u0E1A\u0E31\u0E19\u0E02\u0E2D\u0E07\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49 (Real-Time Desk Context) ===
${safeContext}` : BASE_GHR_SYSTEM_INSTRUCTION;
      if (safeChartContext || hasVisualAttachment || hasPdfAttachment) {
        baseSystemInstruction += `

=== \u0E42\u0E2B\u0E21\u0E14\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C\u0E01\u0E23\u0E32\u0E1F\u0E2A\u0E14\u0E41\u0E25\u0E30\u0E40\u0E2D\u0E01\u0E2A\u0E32\u0E23\u0E41\u0E19\u0E1A (Live Market Chart & Document Analysis) ===
\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C\u0E42\u0E04\u0E23\u0E07\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E23\u0E32\u0E04\u0E32 (Market Structure, Trend vs EMA20/50, Momentum RSI, \u0E04\u0E27\u0E32\u0E21\u0E1C\u0E31\u0E19\u0E1C\u0E27\u0E19 ATR \u0E40\u0E17\u0E35\u0E22\u0E1A\u0E01\u0E31\u0E1A SL -1,000 \u0E08\u0E38\u0E14\u0E02\u0E2D\u0E07 GHR, \u0E41\u0E19\u0E27\u0E23\u0E31\u0E1A/\u0E41\u0E19\u0E27\u0E15\u0E49\u0E32\u0E19\u0E2B\u0E25\u0E31\u0E01 \u0E41\u0E25\u0E30\u0E40\u0E01\u0E13\u0E11\u0E4C\u0E40\u0E0A\u0E47\u0E01\u0E25\u0E34\u0E2A\u0E15\u0E4C 12-Gate) \u0E2B\u0E23\u0E37\u0E2D\u0E2A\u0E23\u0E38\u0E1B\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E08\u0E32\u0E01\u0E20\u0E32\u0E1E/PDF/\u0E44\u0E1F\u0E25\u0E4C\u0E41\u0E19\u0E1A\u0E2D\u0E22\u0E48\u0E32\u0E07\u0E40\u0E1B\u0E47\u0E19\u0E01\u0E25\u0E32\u0E07 \u0E2B\u0E49\u0E32\u0E21\u0E1F\u0E31\u0E19\u0E18\u0E07\u0E43\u0E2B\u0E49\u0E40\u0E02\u0E49\u0E32\u0E0B\u0E37\u0E49\u0E2D/\u0E02\u0E32\u0E22\u0E2B\u0E23\u0E37\u0E2D\u0E01\u0E32\u0E23\u0E31\u0E19\u0E15\u0E35\u0E01\u0E33\u0E44\u0E23${safeChartContext ? `

${safeChartContext}` : ""}`;
      }
      const routePlan = await planModelRoute({
        prompt: message.trim(),
        hasRichContext: Boolean(safeContext || safeChartContext || attachedDocsText),
        hasVisualOrPdf: hasVisualAttachment || hasPdfAttachment,
        hasPdfAttachment,
        forceWebSearch: Boolean(enableWebSearch),
        preference: model,
        decisionClient: createDecisionGenAIClient()
      });
      const formattedHistory = Array.isArray(history) ? history.filter(
        (item) => item && (item.role === "user" || item.role === "model") && typeof item.text === "string" && item.text.trim() !== ""
      ).slice(-20).map((item) => ({
        role: item.role,
        parts: [{ text: item.text.slice(0, 4e3) }]
      })) : [];
      const userPromptText = attachedDocsText ? `${attachedDocsText}

\u0E04\u0E33\u0E16\u0E32\u0E21\u0E02\u0E2D\u0E07\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49:
${message.trim()}` : message.trim();
      const buildContentsForModel = (candidateModel, suffix) => {
        const allowPdf = modelSupportsPdf(candidateModel);
        const filteredBinary = binaryParts.filter((b) => allowPdf || b.mimeType !== "application/pdf");
        const userParts = [{ text: userPromptText }];
        for (const bin of filteredBinary) {
          userParts.push({ inlineData: { mimeType: bin.mimeType, data: bin.data } });
        }
        const fullSys = `${baseSystemInstruction}${suffix}`;
        if (isOpenWeightGemmaModel(candidateModel)) {
          return {
            systemInstruction: void 0,
            contents: [
              {
                role: "user",
                parts: [{ text: `[System Directives \u2014 Strictly Follow]
${fullSys}` }]
              },
              {
                role: "model",
                parts: [{ text: "\u0E23\u0E31\u0E1A\u0E17\u0E23\u0E32\u0E1A\u0E01\u0E0E\u0E23\u0E30\u0E1A\u0E1A GHR v3.2 \u0E41\u0E25\u0E30 Safe Harbor \u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22 \u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E0A\u0E48\u0E27\u0E22\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E1E\u0E2D\u0E23\u0E4C\u0E15\u0E04\u0E23\u0E31\u0E1A" }]
              },
              ...formattedHistory,
              { role: "user", parts: userParts }
            ]
          };
        }
        return {
          systemInstruction: fullSys,
          contents: [
            ...formattedHistory,
            { role: "user", parts: userParts }
          ]
        };
      };
      const ai = getGenAIClient();
      const useWebSearch = Boolean(enableWebSearch || routePlan.needsWebSearch);
      if (stream === true) {
        isSseStarted = true;
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders?.();
        const emitSse = (event, data) => {
          if (res.writableEnded) return;
          res.write(`event: ${event}
data: ${JSON.stringify(data)}

`);
        };
        const suffix = routePlan.asksForTradeSignal ? SAFE_HARBOR_REMINDER : "";
        let completed = false;
        let lastErr;
        for (let i = 0; i < routePlan.candidateModels.length; i++) {
          const candidateModel = routePlan.candidateModels[i];
          const shouldSearch = useWebSearch && modelSupportsGoogleSearch(candidateModel);
          const { systemInstruction, contents } = buildContentsForModel(candidateModel, suffix);
          let accumulated = "";
          const collectedSources = [];
          const seenUris = /* @__PURE__ */ new Set();
          let routeEmitted = false;
          try {
            const responseStream = await ai.models.generateContentStream({
              model: candidateModel,
              contents,
              config: {
                ...systemInstruction ? { systemInstruction } : {},
                ...shouldSearch ? { tools: [{ googleSearch: {} }] } : {}
              }
            });
            for await (const chunk of responseStream) {
              const deltaText = chunk.text || "";
              if (deltaText && !routeEmitted) {
                routeEmitted = true;
                emitSse("route", {
                  model: candidateModel,
                  failoverUsed: i > 0,
                  webSearchUsed: shouldSearch,
                  router: {
                    decisionModel: routePlan.decisionModel,
                    routedBy: routePlan.routedBy,
                    routeTier: routePlan.routeTier,
                    confidence: routePlan.decisionConfidence,
                    safeHarborTriggered: routePlan.asksForTradeSignal,
                    needsWebSearch: useWebSearch
                  }
                });
              }
              if (deltaText) {
                accumulated += deltaText;
                emitSse("delta", { text: deltaText });
              }
              for (const src of extractGroundingSources(chunk)) {
                if (!seenUris.has(src.uri)) {
                  seenUris.add(src.uri);
                  collectedSources.push(src);
                }
              }
            }
            if (!routeEmitted) {
              emitSse("route", {
                model: candidateModel,
                failoverUsed: i > 0,
                webSearchUsed: shouldSearch,
                router: {
                  decisionModel: routePlan.decisionModel,
                  routedBy: routePlan.routedBy,
                  routeTier: routePlan.routeTier,
                  confidence: routePlan.decisionConfidence,
                  safeHarborTriggered: routePlan.asksForTradeSignal,
                  needsWebSearch: useWebSearch
                }
              });
            }
            const finalReply = accumulated.trim().length > 0 ? accumulated : "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E04\u0E33\u0E15\u0E2D\u0E1A\u0E44\u0E14\u0E49\u0E43\u0E19\u0E02\u0E13\u0E30\u0E19\u0E35\u0E49 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07";
            if (collectedSources.length > 0) {
              emitSse("sources", { sources: collectedSources });
            }
            emitSse("done", {
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
                needsWebSearch: useWebSearch
              },
              timestamp: (/* @__PURE__ */ new Date()).toISOString()
            });
            completed = true;
            break;
          } catch (err) {
            lastErr = err;
            const canRetry = accumulated.length === 0 && i < routePlan.candidateModels.length - 1 && isRetryableQuotaOrTransientError(err);
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
      let finalSources = [];
      const orchestrated = await executeWithModelFailover(routePlan, async (candidateModel, suffix) => {
        const shouldSearch = useWebSearch && modelSupportsGoogleSearch(candidateModel);
        const { systemInstruction, contents } = buildContentsForModel(candidateModel, suffix);
        const response = await ai.models.generateContent({
          model: candidateModel,
          contents,
          config: {
            ...systemInstruction ? { systemInstruction } : {},
            ...shouldSearch ? { tools: [{ googleSearch: {} }] } : {}
          }
        });
        finalSources = extractGroundingSources(response);
        return response.text ?? "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E04\u0E33\u0E15\u0E2D\u0E1A\u0E44\u0E14\u0E49\u0E43\u0E19\u0E02\u0E13\u0E30\u0E19\u0E35\u0E49 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07";
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
          needsWebSearch: useWebSearch
        },
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : String(err);
      let code = "gemini_request_failed";
      let errorMsg = "\u0E40\u0E01\u0E34\u0E14\u0E02\u0E49\u0E2D\u0E1C\u0E34\u0E14\u0E1E\u0E25\u0E32\u0E14\u0E43\u0E19\u0E01\u0E32\u0E23\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D Gemini API \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07";
      if (/PERMISSION_DENIED|API_KEY_INVALID|\b(?:403|401)\b/i.test(rawMessage)) {
        code = "gemini_permission_denied";
        errorMsg = "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C API Key \u0E44\u0E14\u0E49 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E01\u0E32\u0E23\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32\u0E04\u0E35\u0E22\u0E4C\u0E43\u0E19\u0E41\u0E1C\u0E07 Settings > Secrets";
      } else if (/RESOURCE_EXHAUSTED|\b429\b/i.test(rawMessage)) {
        code = "gemini_quota_exhausted";
        errorMsg = "\u0E42\u0E04\u0E27\u0E15\u0E49\u0E32\u0E01\u0E32\u0E23\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19 Gemini API \u0E40\u0E15\u0E47\u0E21\u0E0A\u0E31\u0E48\u0E27\u0E04\u0E23\u0E32\u0E27 (429) \u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E2D\u0E2A\u0E31\u0E01\u0E04\u0E23\u0E39\u0E48\u0E2B\u0E23\u0E37\u0E2D\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E04\u0E35\u0E22\u0E4C\u0E43\u0E19 Settings > Secrets";
      }
      if (isSseStarted && res.headersSent) {
        if (!res.writableEnded) {
          res.write(`event: error
data: ${JSON.stringify({ code, error: errorMsg })}

`);
          res.end();
        }
        return;
      }
      res.status(500).json({ code, error: errorMsg });
    }
  });
  app2.post("/api/ai/transcribe", async (req, res) => {
    try {
      const caller = await verifyFirebaseBearerToken(req.headers.authorization);
      if (!caller) {
        res.status(401).json({ error: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A\u0E1A\u0E31\u0E0D\u0E0A\u0E35 Google \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E43\u0E0A\u0E49\u0E42\u0E2B\u0E21\u0E14\u0E16\u0E2D\u0E14\u0E40\u0E2A\u0E35\u0E22\u0E07 Cloud AI", code: "AUTH_REQUIRED" });
        return;
      }
      const rate = await checkDistributedRateLimit(`voice:${caller.uid}`, 50);
      if (!rate.allowed) {
        res.status(429).json({
          error: `\u0E43\u0E0A\u0E49\u0E42\u0E2B\u0E21\u0E14\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E40\u0E01\u0E34\u0E19\u0E42\u0E04\u0E27\u0E15\u0E49\u0E32\u0E0A\u0E31\u0E48\u0E27\u0E04\u0E23\u0E32\u0E27 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E2D ${rate.retryAfterSec} \u0E27\u0E34\u0E19\u0E32\u0E17\u0E35`,
          code: "RATE_LIMITED"
        });
        return;
      }
      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({ error: "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32 GEMINI_API_KEY \u0E1A\u0E19\u0E40\u0E0B\u0E34\u0E23\u0E4C\u0E1F\u0E40\u0E27\u0E2D\u0E23\u0E4C", code: "MISSING_API_KEY" });
        return;
      }
      const { audioBase64, mimeType } = req.body || {};
      const cleanBase64 = typeof audioBase64 === "string" ? audioBase64.replace(/^data:[^;]+;base64,/, "").trim() : "";
      if (!cleanBase64 || cleanBase64.length > 45e5) {
        res.status(400).json({ error: "\u0E44\u0E1F\u0E25\u0E4C\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07\u0E2B\u0E23\u0E37\u0E2D\u0E21\u0E35\u0E02\u0E19\u0E32\u0E14\u0E43\u0E2B\u0E0D\u0E48\u0E40\u0E01\u0E34\u0E19\u0E01\u0E33\u0E2B\u0E19\u0E14" });
        return;
      }
      const normalizedMime = String(mimeType || "audio/wav").toLowerCase().split(";")[0].trim();
      const interactionMimeMap = {
        "audio/wav": "audio/wav",
        "audio/x-wav": "audio/wav",
        "audio/mp3": "audio/mp3",
        "audio/mpeg": "audio/mp3",
        "audio/aiff": "audio/aiff",
        "audio/aac": "audio/aac",
        "audio/ogg": "audio/ogg",
        "audio/flac": "audio/flac"
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
                type: "audio",
                data: cleanBase64,
                mime_type: interactionMime
              }
            ],
            generation_config: {
              transcription_config: {
                language_codes: ["th-TH", "en-US"],
                custom_vocabulary: [
                  "TallyNX",
                  "XAUUSD",
                  "GHR",
                  "Trailing Lock",
                  "Consistency",
                  "Drawdown",
                  "MT5",
                  "12-Gate",
                  "FundedNext",
                  "FTMO",
                  "The5ers"
                ]
              }
            }
          });
          const transcript = (interaction.output_text || "").trim();
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
      let lastErr;
      for (const fallbackModel of fallbackCandidates) {
        try {
          const resp = await ai.models.generateContent({
            model: fallbackModel,
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: "\u0E16\u0E2D\u0E14\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E1E\u0E39\u0E14\u0E20\u0E32\u0E29\u0E32\u0E44\u0E17\u0E22/\u0E2D\u0E31\u0E07\u0E01\u0E24\u0E29\u0E08\u0E32\u0E01\u0E44\u0E1F\u0E25\u0E4C\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E19\u0E35\u0E49\u0E40\u0E1B\u0E47\u0E19\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E17\u0E35\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07 \u0E01\u0E23\u0E30\u0E0A\u0E31\u0E1A \u0E42\u0E14\u0E22\u0E2A\u0E48\u0E07\u0E01\u0E25\u0E31\u0E1A\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E17\u0E35\u0E48\u0E1C\u0E39\u0E49\u0E1E\u0E39\u0E14\u0E1E\u0E39\u0E14\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19 \u0E2B\u0E49\u0E32\u0E21\u0E41\u0E15\u0E48\u0E07\u0E40\u0E15\u0E34\u0E21:"
                  },
                  {
                    inlineData: {
                      mimeType: normalizedMime || "audio/wav",
                      data: cleanBase64
                    }
                  }
                ]
              }
            ]
          });
          const text = (resp.text || "").trim();
          res.json({ text, model: fallbackModel, failoverUsed: true });
          return;
        } catch (err) {
          lastErr = err;
          if (!isRetryableQuotaOrTransientError(err)) throw err;
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error("Transcription failed");
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E16\u0E2D\u0E14\u0E40\u0E2A\u0E35\u0E22\u0E07\u0E44\u0E14\u0E49\u0E43\u0E19\u0E02\u0E13\u0E30\u0E19\u0E35\u0E49",
        code: "TRANSCRIBE_FAILED"
      });
    }
  });
  app2.post("/api/ai/tts", async (req, res) => {
    try {
      const caller = await verifyFirebaseBearerToken(req.headers.authorization);
      if (!caller) {
        res.status(401).json({ error: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A\u0E1A\u0E31\u0E0D\u0E0A\u0E35 Google", code: "AUTH_REQUIRED" });
        return;
      }
      const rate = await checkDistributedRateLimit(`voice:${caller.uid}`, 50);
      if (!rate.allowed) {
        res.json({ ok: true, fallbackClientTts: true, reason: "rate_limited" });
        return;
      }
      if (!process.env.GEMINI_API_KEY) {
        res.json({ ok: true, fallbackClientTts: true, reason: "missing_key" });
        return;
      }
      const { text, voice } = req.body || {};
      const cleanText = stripMarkdownForSpeech(typeof text === "string" ? text : "").slice(0, 1800);
      if (!cleanText) {
        res.status(400).json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E2A\u0E31\u0E07\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C\u0E40\u0E2A\u0E35\u0E22\u0E07" });
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
            response_modalities: ["audio"],
            generation_config: {
              speech_config: [{ voice: safeVoice, language: "th" }]
            }
          });
          const audioData = interaction.output_audio?.data;
          const audioMime = interaction.output_audio?.mime_type || "audio/wav";
          if (audioData) {
            res.json({
              ok: true,
              audioBase64: audioData,
              mimeType: audioMime,
              model: ttsModel,
              failoverUsed: i > 0
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
  app2.post("/api/ai/live-token", async (req, res) => {
    try {
      const caller = await verifyFirebaseBearerToken(req.headers.authorization);
      if (!caller) {
        res.status(401).json({
          error: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A\u0E1A\u0E31\u0E0D\u0E0A\u0E35 Google \u0E41\u0E25\u0E30\u0E40\u0E1B\u0E34\u0E14\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C PRO \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19 Live Voice Mode",
          code: "AUTH_REQUIRED"
        });
        return;
      }
      const rate = await checkDistributedRateLimit(`live:${caller.uid}`, 15);
      if (!rate.allowed) {
        res.status(429).json({
          error: `\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E40\u0E0B\u0E2A\u0E0A\u0E31\u0E19 Live \u0E40\u0E01\u0E34\u0E19\u0E42\u0E04\u0E27\u0E15\u0E49\u0E32\u0E0A\u0E31\u0E48\u0E27\u0E04\u0E23\u0E32\u0E27 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E2D ${rate.retryAfterSec} \u0E27\u0E34\u0E19\u0E32\u0E17\u0E35`,
          code: "RATE_LIMITED"
        });
        return;
      }
      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({ error: "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32 GEMINI_API_KEY \u0E1A\u0E19\u0E40\u0E0B\u0E34\u0E23\u0E4C\u0E1F\u0E40\u0E27\u0E2D\u0E23\u0E4C", code: "MISSING_API_KEY" });
        return;
      }
      const { mode, voice, deskContext, liveChartContext } = req.body || {};
      const liveMode = mode === "thinking" ? "thinking" : "standard";
      const targetModel = liveMode === "thinking" ? GEMINI_38_LIVE_THINKING : GEMINI_38_LIVE;
      const safeVoice = sanitizeVoiceName(voice);
      const safeDesk = typeof deskContext === "string" ? deskContext.slice(0, 3500) : "";
      const safeChart = typeof liveChartContext === "string" ? liveChartContext.slice(0, 2e3) : "";
      const liveInstruction = `${BASE_GHR_SYSTEM_INSTRUCTION}

=== Live Voice Desk Protocol ===
- \u0E15\u0E2D\u0E1A\u0E01\u0E25\u0E31\u0E1A\u0E40\u0E1B\u0E47\u0E19\u0E04\u0E33\u0E1E\u0E39\u0E14\u0E17\u0E35\u0E48\u0E01\u0E23\u0E30\u0E0A\u0E31\u0E1A \u0E40\u0E1B\u0E47\u0E19\u0E18\u0E23\u0E23\u0E21\u0E0A\u0E32\u0E15\u0E34 \u0E2D\u0E48\u0E32\u0E19/\u0E1F\u0E31\u0E07\u0E40\u0E02\u0E49\u0E32\u0E43\u0E08\u0E07\u0E48\u0E32\u0E22 \u0E44\u0E21\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E2D\u0E48\u0E32\u0E19\u0E40\u0E04\u0E23\u0E37\u0E48\u0E2D\u0E07\u0E2B\u0E21\u0E32\u0E22 Markdown
- \u0E43\u0E0A\u0E49\u0E15\u0E31\u0E27\u0E40\u0E25\u0E02\u0E08\u0E32\u0E01\u0E1E\u0E2D\u0E23\u0E4C\u0E15\u0E41\u0E25\u0E30\u0E01\u0E23\u0E32\u0E1F\u0E2A\u0E14\u0E25\u0E48\u0E32\u0E2A\u0E38\u0E14\u0E40\u0E2A\u0E21\u0E2D \u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E22\u0E49\u0E33 Safe Harbor (\u0E44\u0E21\u0E48\u0E43\u0E2B\u0E49\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E13\u0E0B\u0E37\u0E49\u0E2D\u0E02\u0E32\u0E22)
${safeDesk ? `
=== Real-Time Desk Context ===
${safeDesk}` : ""}
${safeChart ? `
=== Live Chart Context ===
${safeChart}` : ""}`;
      const now = Date.now();
      const expireTime = new Date(now + 30 * 60 * 1e3).toISOString();
      const newSessionExpireTime = new Date(now + 90 * 1e3).toISOString();
      const tokenClient = getLiveTokenGenAIClient();
      const candidateLiveModels = liveMode === "thinking" ? [GEMINI_38_LIVE_THINKING, GEMINI_38_LIVE] : [GEMINI_38_LIVE];
      let lastErr;
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
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: safeVoice } }
                  },
                  inputAudioTranscription: {},
                  outputAudioTranscription: {},
                  contextWindowCompression: { slidingWindow: {} },
                  sessionResumption: {},
                  ...candidateModel === GEMINI_38_LIVE_THINKING ? { thinkingConfig: { thinkingLevel: "low" } } : {}
                }
              }
            }
          });
          if (authToken?.name) {
            res.json({
              ok: true,
              token: authToken.name,
              model: candidateModel,
              requestedModel: targetModel,
              apiVersion: "v1alpha",
              expiresAt: expireTime,
              newSessionExpiresAt: newSessionExpireTime,
              voice: safeVoice,
              lockedConstraints: true
            });
            return;
          }
        } catch (err) {
          lastErr = err;
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
                    systemInstruction: { parts: [{ text: liveInstruction }] }
                  }
                }
              }
            });
            if (minimalToken?.name) {
              res.json({
                ok: true,
                token: minimalToken.name,
                model: candidateModel,
                requestedModel: targetModel,
                apiVersion: "v1alpha",
                expiresAt: expireTime,
                newSessionExpiresAt: newSessionExpireTime,
                voice: safeVoice,
                lockedConstraints: true
              });
              return;
            }
          } catch (innerErr) {
            lastErr = innerErr;
          }
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error("Failed to mint ephemeral Live token");
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? `\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E2A\u0E23\u0E49\u0E32\u0E07 Ephemeral Token \u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A Live Mode: ${err.message}` : "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D Live Mode \u0E44\u0E14\u0E49\u0E43\u0E19\u0E02\u0E13\u0E30\u0E19\u0E35\u0E49",
        code: "LIVE_TOKEN_FAILED"
      });
    }
  });
  let devEphemeralSsoSecret = null;
  function getSsoSigningKey() {
    const configuredSsoSecret = (process.env.TALLYNX_SSO_SECRET || process.env.SSO_SHARED_SECRET || "").trim();
    if (configuredSsoSecret.length >= 16) {
      return configuredSsoSecret;
    }
    const isProdRuntime = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
    if (isProdRuntime) {
      return null;
    }
    if (!devEphemeralSsoSecret) {
      devEphemeralSsoSecret = crypto.randomBytes(32).toString("hex");
    }
    return devEphemeralSsoSecret;
  }
  const signSsoPayload = (payload, key) => {
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const sig = crypto.createHmac("sha256", key).update(encoded).digest("base64url");
    return `${encoded}.${sig}`;
  };
  const verifySsoToken = (token, key) => {
    const parts = String(token || "").trim().split(".");
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expectedSig = crypto.createHmac("sha256", key).update(encoded).digest("base64url");
    const sigBuf = Buffer.from(sig, "utf8");
    const expBuf = Buffer.from(expectedSig, "utf8");
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    try {
      const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
      const rawExp = Number(parsed.exp);
      if (!Number.isFinite(rawExp)) return null;
      if ("aud" in parsed && parsed.aud !== "mall.tallynx.com" && parsed.aud !== "desk.tallynx.com") return null;
      const expMs = rawExp < 1e11 ? rawExp * 1e3 : rawExp;
      if (Date.now() > expMs) return null;
      const rawHandle = String(parsed.handle || parsed.sub || "@trader_you").trim();
      return {
        handle: rawHandle.startsWith("@") ? rawHandle : `@${rawHandle}`,
        exp: expMs,
        claims: parsed
      };
    } catch {
      return null;
    }
  };
  app2.post("/api/auth/sso-handoff", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const ssoHmacKey = getSsoSigningKey();
    if (!ssoHmacKey) {
      res.status(503).json({ ok: false, error: "TALLYNX_SSO_SECRET is not configured on the server." });
      return;
    }
    const rawHandle = typeof req.body?.handle === "string" ? req.body.handle.trim() : "@alex_quant";
    const handle = rawHandle.startsWith("@") ? rawHandle : `@${rawHandle}`;
    const expSec = Math.floor(Date.now() / 1e3) + 300;
    const ssoToken = signSsoPayload({
      handle,
      sub: handle.replace(/^@/, ""),
      exp: expSec,
      nonce: crypto.randomUUID()
    }, ssoHmacKey);
    res.json({ ok: true, token: ssoToken, ssoToken, handle, expiresInSec: 300 });
  });
  const handleDeskSsoExchange = (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const ssoHmacKey = getSsoSigningKey();
    if (!ssoHmacKey) {
      res.status(503).json({ ok: false, valid: false, error: "TALLYNX_SSO_SECRET is not configured on the server." });
      return;
    }
    const token = typeof req.query.token === "string" && req.query.token.trim() || typeof req.query.ssoToken === "string" && req.query.ssoToken.trim() || typeof req.body?.ssoToken === "string" && req.body.ssoToken.trim() || typeof req.body?.token === "string" && req.body.token.trim() || "";
    const verified = verifySsoToken(token, ssoHmacKey);
    if (!verified) {
      res.status(401).json({ ok: false, valid: false, error: "Invalid or expired TallyNX SSO token" });
      return;
    }
    res.json({
      ok: true,
      valid: true,
      handle: verified.handle,
      expiresAt: verified.exp,
      claims: verified.claims
    });
  };
  app2.get("/api/auth/sso-exchange", handleDeskSsoExchange);
  app2.post("/api/auth/sso-exchange", handleDeskSsoExchange);
  app2.use("/api", createMallRouter({
    telemetryBus,
    legacyBaseUrl: DEFAULT_SOVEREIGN_MT5_BASE_URL,
    listings: getMarketplaceListings,
    localListings: loadMarketplaceStore,
    verifyUser: verifyFirebaseBearerToken,
    connectedSnapshot: async (uid, channel, accountId) => connectedMallSnapshots.get(mallSourceKey(uid, channel, accountId)),
    bridgeSnapshot: (bridgeKey) => {
      if (!bridgeKey || !isValidTredynApiKey(bridgeKey)) return void 0;
      const feed = getLiveBridgeFeed(bridgeKey);
      const trade = feed?.positions.reduce((latest, position) => position.closeTs > 0 && (!latest || position.closeTs > latest.closeTs) ? position : latest, void 0);
      if (!feed || !trade || !Number.isFinite(trade.closeTs) || trade.closeTs > Date.now()) return void 0;
      return {
        reference: hashTredynApiKey(bridgeKey) + ":" + trade.ticket,
        symbol: trade.symbol,
        capturedAt: new Date(trade.closeTs).toISOString(),
        pnl: trade.netProfit,
        movement: { open: trade.openPrice, close: trade.closePrice },
        verifiedBadge: { channel: "LIVE_BRIDGE", brokerName: feed.meta.broker.slice(0, 80), verifiedAt: feed.syncedAt }
      };
    }
  }));
  app2.get("/api/telemetry/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    const sendEvent = (eventName, data) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ event: eventName, payload: data, ts: (/* @__PURE__ */ new Date()).toISOString() })}

`);
      }
    };
    sendEvent("account.heartbeat", { stream: "SSE_LIVE", readOnlyVerified: true });
    const onBridgePush = (data) => sendEvent("bridge.push", data);
    const onDeskUpdate = (data) => sendEvent("desk.room", data);
    const onMallChat = (data) => sendEvent("mall.chat", data);
    const onMallPresence = (data) => sendEvent("mall.presence", data);
    telemetryBus.on("bridge_push", onBridgePush);
    telemetryBus.on("desk_room_update", onDeskUpdate);
    telemetryBus.on("mall.chat", onMallChat);
    telemetryBus.on("mall.presence", onMallPresence);
    const timer = setInterval(() => {
      sendEvent("account.heartbeat", { stream: "SSE_LIVE" });
    }, 15e3);
    res.on("close", () => {
      clearInterval(timer);
      telemetryBus.off("bridge_push", onBridgePush);
      telemetryBus.off("desk_room_update", onDeskUpdate);
      telemetryBus.off("mall.chat", onMallChat);
      telemetryBus.off("mall.presence", onMallPresence);
    });
  });
  app2.get("/api/proprules/live", async (req, res) => {
    const forceRefresh = req.query.refresh === "1" || req.query.refresh === "true";
    const firmId = typeof req.query.firmId === "string" ? req.query.firmId.trim().toLowerCase() : "";
    const targets = firmId ? PROP_FIRM_CATALOG.filter((f) => f.id === firmId) : PROP_FIRM_CATALOG;
    if (firmId && targets.length === 0) {
      res.status(404).json({ ok: false, error: "Unknown prop firm identifier" });
      return;
    }
    const settled = await Promise.allSettled(
      targets.map((firm) => probeSinglePropFirm(firm, forceRefresh))
    );
    const probes = settled.map((entry, idx) => {
      if (entry.status === "fulfilled") return entry.value;
      const fallback = targets[idx];
      return {
        id: fallback.id,
        name: fallback.name,
        websiteUrl: fallback.websiteUrl,
        rulesUrl: fallback.rulesUrl,
        probeStatus: "UNREACHABLE",
        httpStatus: 0,
        latencyMs: 0,
        finalUrl: fallback.rulesUrl,
        pageTitle: null,
        lastModifiedHeader: null,
        checkedAtIso: (/* @__PURE__ */ new Date()).toISOString()
      };
    });
    res.setHeader(
      "Cache-Control",
      forceRefresh ? "no-store" : "public, max-age=15, s-maxage=45, stale-while-revalidate=60"
    );
    res.json({
      ok: true,
      checkedAtIso: (/* @__PURE__ */ new Date()).toISOString(),
      totalFirms: probes.length,
      probes
    });
  });
  app2.all("/api/*", (_req, res) => {
    res.status(404).json({ ok: false, error: "API route not found" });
  });
  return app2;
}
var app = createApp();
var server_default = app;
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(
      express2.static(distPath, {
        etag: true,
        lastModified: true,
        setHeaders(res, filePath) {
          res.setHeader("X-Content-Type-Options", "nosniff");
          const rel = path.relative(distPath, filePath).replace(/\\/g, "/");
          if (/^assets\/[^/]+\.(?:js|css)$/i.test(rel)) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          } else if (/^assets\/(?:desk|aistudio)\//i.test(rel)) {
            res.setHeader("Cache-Control", "public, max-age=2592000");
          } else if (/^(?:index\.html|sw\.js|registerSW\.js|manifest\.webmanifest)$/i.test(rel)) {
            res.setHeader("Cache-Control", "no-cache");
          } else {
            res.setHeader("Cache-Control", "public, max-age=86400");
          }
        }
      })
    );
    const STATIC_NON_SPA_RE = /^\/(?:api(?:\/|$)|assets\/|scripts\/|(?:manifest\.webmanifest|sw\.js|registerSW\.js|workbox-[^/]+\.js|favicon[^/]*|icon\.svg|apple-touch-icon\.png|pwa-[^/]+\.png)$)/i;
    app.get("*", (req, res) => {
      if (STATIC_NON_SPA_RE.test(req.path)) {
        res.status(404).end();
        return;
      }
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`TallyNX Mall Server running on http://localhost:${PORT}`);
  });
}
var isDirectServerRun = Boolean(process.argv[1]) && /(^|[\\/])server\.(ts|js|mjs|cjs)$/i.test(process.argv[1]);
if (isDirectServerRun && !process.env.VERCEL && !process.env.VERCEL_ENV) {
  startServer();
}
export {
  checkChatRateLimit,
  createApp,
  server_default as default
};
