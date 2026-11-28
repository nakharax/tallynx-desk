// server.ts
import "dotenv/config";
import crypto2 from "crypto";
import { EventEmitter } from "events";
import express5 from "express";
import fs from "fs";
import os from "os";
import path from "path";
import { Modality, ThinkingLevel } from "@google/genai";

// src/utils/geminiOrchestrator.ts
import { GoogleGenAI } from "@google/genai";
var GEMINI_DECISION_MODEL = "gemini-decision-1";
var GEMINI_4_NEON = "gemini-4-neon";
var GEMINI_4_CARBON = "gemini-4-carbon";
var GEMINI_4_ARGON = "gemini-4-argon";
var GEMINI_38_FLASH = "gemini-3.8-flash";
var GEMINI_4_HYDROGEN = "gemini-4-hydrogen";
var GEMINI_FLASH_LITE_35 = "gemini-3.5-flash-lite";
var GEMINI_FLASH_LITE_31 = "gemini-3.1-flash-lite";
var GEMMA_4_31B_IT = "gemma-4-31b-it";
var GEMMA_4_26B_A4B_IT = "gemma-4-26b-a4b-it";
var PLATFORM_FRONTIER_GEMINI_MODELS = [
  GEMINI_4_NEON,
  GEMINI_4_CARBON,
  GEMINI_4_ARGON,
  GEMINI_38_FLASH
];
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
function isPlatformFrontierGeminiModel(raw) {
  return typeof raw === "string" && PLATFORM_FRONTIER_GEMINI_MODELS.includes(raw);
}
function isOpenWeightGemmaModel(model) {
  const clean = model.trim().toLowerCase().replace(/^models\//, "");
  return clean === GEMMA_4_31B_IT || clean === GEMMA_4_26B_A4B_IT || clean.startsWith("gemma-");
}
function modelSupportsGoogleSearch(model) {
  if (isOpenWeightGemmaModel(model)) return false;
  if (isPlatformFrontierGeminiModel(model)) return true;
  if (Object.hasOwn(MODEL_CAPABILITY_MAP, model)) {
    return MODEL_CAPABILITY_MAP[model].supportsGoogleSearch;
  }
  return /^gemini-/i.test(model.trim().replace(/^models\//, ""));
}
function modelSupportsPdf(model) {
  if (isOpenWeightGemmaModel(model)) return false;
  if (isPlatformFrontierGeminiModel(model)) return true;
  if (Object.hasOwn(MODEL_CAPABILITY_MAP, model)) {
    return MODEL_CAPABILITY_MAP[model].supportsPdf;
  }
  return /^gemini-/i.test(model.trim().replace(/^models\//, ""));
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
  if (error instanceof Error && "status" in error && typeof error.status === "number") {
    if ([401, 403].includes(error.status)) return false;
    if ([404, 429, 500, 502, 503, 504].includes(error.status)) return true;
  }
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
  const frontierPref = isPlatformFrontierGeminiModel(params.preference) ? params.preference : null;
  const hasRichContext = Boolean(params.hasRichContext);
  const hasVisualOrPdf = Boolean(params.hasVisualOrPdf);
  const hasPdfAttachment = Boolean(params.hasPdfAttachment);
  const forceWebSearch = Boolean(params.forceWebSearch);
  const heuristicSignal = /(buy|sell|signal|entry\s*now|call\s*trade|tp|sl|target\s*price|แนะนำเข้า|จุดเข้า|ซิก|สัญญาณ|กำไรแน่นอน|ฟันธง)/i.test(
    params.prompt
  );
  const heuristicSearch = forceWebSearch || detectWebSearchNeed(params.prompt);
  if (frontierPref) {
    return {
      requestedPreference: frontierPref,
      candidateModels: [frontierPref, ...FREE_TIER_CHAT_MODELS],
      routedBy: "manual",
      routeTier: "frontier_multimodal",
      decisionConfidence: 1,
      asksForTradeSignal: heuristicSignal,
      needsWebSearch: heuristicSearch,
      hasPdfAttachment,
      decisionModel: GEMINI_DECISION_MODEL
    };
  }
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
    apiKey,
    vertexai: false,
    httpOptions: {
      apiVersion: "v1beta",
      timeout: 7e3,
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
  function readBridgeKey(req) {
    const key = (req.get("X-TallyNX-Api-Key") || req.get("X-Tredyn-Api-Key") || "").trim();
    return key || void 0;
  }
  async function requireMallAuth(req, res) {
    const caller = await options.verifyUser(req.headers.authorization).catch(() => null);
    if (caller) {
      const base = caller.email ? caller.email.split("@")[0] : caller.displayName || `trader_${caller.uid.slice(0, 8)}`;
      return { uid: caller.uid, derivedHandle: mallHandle(base), authenticatedBy: "firebase" };
    }
    const bridgeKey = readBridgeKey(req);
    const hasBridge = bridgeKey ? Boolean(options.hasActiveBridgeFeed?.(bridgeKey) || options.bridgeSnapshot(bridgeKey)) : false;
    if (hasBridge) {
      return { authenticatedBy: "bridge_key" };
    }
    res.status(401).json({
      ok: false,
      code: "AUTH_REQUIRED",
      error: "Sign in with Google or connect an active Live Bridge key to interact in Community Mall.",
      reasonEn: "Sign in with Google or connect an active Live Bridge key to interact in Community Mall.",
      reasonTh: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A\u0E14\u0E49\u0E27\u0E22 Google \u0E2B\u0E23\u0E37\u0E2D\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D Live Bridge \u0E01\u0E48\u0E2D\u0E19\u0E42\u0E1E\u0E2A\u0E15\u0E4C \u0E01\u0E14\u0E23\u0E35\u0E41\u0E2D\u0E47\u0E01\u0E0A\u0E31\u0E19 \u0E2B\u0E23\u0E37\u0E2D\u0E2D\u0E31\u0E1B\u0E40\u0E14\u0E15\u0E2A\u0E16\u0E32\u0E19\u0E30\u0E43\u0E19 Community Mall"
    });
    return null;
  }
  async function resolveSource(req, channel) {
    if (channel === "LIVE_BRIDGE") {
      return options.bridgeSnapshot(readBridgeKey(req));
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
      const authCaller = await requireMallAuth(req, res);
      if (!authCaller) return;
      const body = legacyRequest ? {
        handle: authCaller.derivedHandle ?? req.body?.handle,
        symbol: req.body?.symbol,
        text: String(req.body?.text || "").slice(0, 500),
        clientMessageId: req.body?.clientMessageId || req.body?.id || randomUUID2(),
        isTradeIdea: req.body?.isTradeIdea === true
      } : {
        ...req.body || {},
        ...authCaller.derivedHandle ? { handle: authCaller.derivedHandle } : {}
      };
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
      const output = engine.post(zoneId, body, authCaller.uid ?? (req.ip || req.socket.remoteAddress || "unknown"), {
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
  router.post("/mall/zones/:zoneId/messages/:messageId/reactions", (req, res, next) => {
    const { zoneId, messageId } = req.params;
    if (!isMallZoneId(zoneId)) return res.status(404).json({ ok: false, code: "ZONE_NOT_FOUND" });
    void (async () => {
      try {
        const authCaller = await requireMallAuth(req, res);
        if (!authCaller) return;
        const payload = {
          ...req.body || {},
          ...authCaller.derivedHandle ? { handle: authCaller.derivedHandle } : {}
        };
        const { message, changed } = engine.react(zoneId, messageId, payload);
        if (changed) emit({ type: "reaction", zoneId, message });
        res.json({ ok: true, message });
      } catch (error) {
        respondError(res, error);
      }
    })().catch(next);
  });
  async function updatePresence(req, res, zoneId, legacyRequest = false) {
    const authCaller = await requireMallAuth(req, res);
    if (!authCaller) return;
    const body = {
      ...req.body || {},
      ...authCaller.derivedHandle ? { handle: authCaller.derivedHandle } : {}
    };
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
    res.write("retry: 10000\n\n");
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
    const maxLifetimeMs = process.env.VERCEL || process.env.VERCEL_ENV ? 25e3 : 5 * 6e4;
    const lifetimeTimer = setTimeout(() => {
      if (!res.writableEnded) {
        send("mall.heartbeat", { reconnect: true });
        res.end();
      }
    }, maxLifetimeMs);
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      clearInterval(timer);
      clearTimeout(lifetimeTimer);
      telemetryBus2.off("mall.chat", chat);
      telemetryBus2.off("mall.presence", presence);
    };
    res.on("close", cleanup);
    res.on("finish", cleanup);
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

// server/ai/riskSupervise.ts
import express2 from "express";

// src/utils/quantSupervisionEngine.ts
import Decimal2 from "decimal.js";
var D = Decimal2.clone({ precision: 30, rounding: Decimal2.ROUND_HALF_UP });
var BARS_PER_DAY = { "5m": 288, "15m": 96, "1h": 24, "4h": 6, "1d": 1 };
var NORMAL_QUANTILE_95 = "1.644853626951472";
var MAX_MAGNITUDE = 1e15;
var EMPTY_BOLLINGER = { upper: null, middle: null, lower: null, bandwidthPct: null, zScore: null };
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isBoundedNumber(value, min = 0) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= MAX_MAGNITUDE;
}
function normalizeSupervisionCandles(input) {
  const byTime = /* @__PURE__ */ new Map();
  for (const bar of input) {
    if (!isRecord(bar)) continue;
    const { ts, open, high, low, close, volume } = bar;
    if (!isBoundedNumber(ts) || !Number.isSafeInteger(ts) || !isBoundedNumber(open, 1e-12) || !isBoundedNumber(high, 1e-12) || !isBoundedNumber(low, 1e-12) || !isBoundedNumber(close, 1e-12) || low > Math.min(open, close) || high < Math.max(open, close)) continue;
    byTime.set(ts, {
      ts,
      timeLabel: new Date(ts).toISOString().slice(5, 16).replace("T", " "),
      open,
      high,
      low,
      close,
      ...isBoundedNumber(volume) ? { volume } : {}
    });
  }
  return [...byTime.values()].sort((left, right) => left.ts - right.ts);
}
function sanitizeQuantPortfolioInput(input) {
  if (!isRecord(input) || !isBoundedNumber(input.equityUsd, -MAX_MAGNITUDE)) return void 0;
  const portfolio = { equityUsd: input.equityUsd };
  if (isBoundedNumber(input.balanceUsd, -MAX_MAGNITUDE)) portfolio.balanceUsd = input.balanceUsd;
  if (isBoundedNumber(input.dailyLossLimitUsd, 1e-6)) portfolio.dailyLossLimitUsd = input.dailyLossLimitUsd;
  const metrics = ["dailyLossUsedUsd", "openRiskUsd", "exposureLots"];
  for (const metric of metrics) {
    if (isBoundedNumber(input[metric])) portfolio[metric] = input[metric];
  }
  if (input.accountType === "PROP" || input.accountType === "PERSONAL") portfolio.accountType = input.accountType;
  return portfolio;
}
function mean(values) {
  return values.reduce((sum, value) => sum.plus(value), new D(0)).div(values.length);
}
function standardDeviation(values, center, denominator) {
  return values.reduce((sum, value) => sum.plus(value.minus(center).pow(2)), new D(0)).div(denominator).sqrt();
}
function ema(values, period) {
  let value = null;
  const alpha = new D(2).div(period + 1);
  return values.map((price, index) => {
    if (index < period - 1) return null;
    value = value === null ? mean(values.slice(0, period)) : value.plus(price.minus(value).mul(alpha));
    return value;
  });
}
function wilderAverage(values, period) {
  if (values.length < period) return null;
  return values.slice(period).reduce(
    (average, next) => average.mul(period - 1).plus(next).div(period),
    mean(values.slice(0, period))
  );
}
function computeRsi14(closes) {
  const changes = closes.slice(1).map((close, index) => close.minus(closes[index]));
  const gains = wilderAverage(changes.map((change) => D.max(change, 0)), 14);
  const losses = wilderAverage(changes.map((change) => D.max(change.neg(), 0)), 14);
  if (gains === null || losses === null) return null;
  if (losses.isZero()) return gains.isZero() ? 50 : 100;
  return gains.div(gains.plus(losses)).mul(100).toNumber();
}
function computeMacd(closes) {
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const lines = slow.slice(25).map((value, index) => fast[index + 25].minus(value));
  const line = lines.at(-1);
  const signal = ema(lines, 9).at(-1);
  return {
    line: line?.toNumber() ?? null,
    signal: signal?.toNumber() ?? null,
    histogram: line && signal ? line.minus(signal).toNumber() : null
  };
}
function computeStructuralZones(candles, kind, atr, lastPrice) {
  const recent = candles.slice(-120);
  const isSupport = kind === "SUPPORT";
  const property = isSupport ? "low" : "high";
  const neighborOffsets = [-2, -1, 1, 2];
  const clusters = [];
  const tolerance = D.max(lastPrice.mul("0.0005"), D.min(atr?.mul("0.35") ?? 0, lastPrice.mul("0.008")));
  for (let index = 2; index < recent.length - 2; index++) {
    const value = recent[index][property];
    if (!neighborOffsets.every((offset) => isSupport ? value < recent[index + offset][property] : value > recent[index + offset][property])) continue;
    const level = new D(value);
    if (isSupport ? level.gt(lastPrice) : level.lt(lastPrice)) continue;
    const cluster = clusters.find((candidate) => candidate.total.div(candidate.touches).minus(level).abs().lte(tolerance));
    if (cluster) {
      cluster.total = cluster.total.plus(level);
      cluster.touches++;
      cluster.lastTouch = index;
    } else {
      clusters.push({ total: level, touches: 1, lastTouch: index });
    }
  }
  return clusters.sort((a, b) => b.touches - a.touches || b.lastTouch - a.lastTouch).slice(0, 3).map(({ total, touches }) => {
    const level = total.div(touches);
    const band = D.min(tolerance, level.mul("0.02"));
    return {
      level: level.toNumber(),
      bandLow: level.minus(band).toNumber(),
      bandHigh: level.plus(band).toNumber(),
      kind,
      strength: touches >= 3 ? "HIGH" : "MEDIUM",
      touches,
      label: isSupport ? "Observed support" : "Observed resistance"
    };
  });
}
function resolveVolatilityRegime(closes, trueRanges, atr, ema20, barsPerDay) {
  const price = closes.at(-1);
  if (!price || closes.length < 2) return "RANGE_BOUND";
  const lastRange = trueRanges.at(-1);
  const baseline = mean(trueRanges.slice(-15, -1));
  const spike = lastRange.gt(baseline.mul(3)) && lastRange.div(price).gte("0.005");
  if (spike || atr && atr.div(price).mul(new D(barsPerDay).sqrt()).gte("0.08")) return "HIGH_VOLATILITY";
  const reference = closes.at(-15);
  if (reference && atr && ema20 !== null) {
    const change = price.minus(reference);
    const threshold = D.max(atr.mul("1.5"), price.mul("0.001"));
    if (change.gt(threshold) && price.gt(ema20)) return "TRENDING_UP";
    if (change.lt(threshold.neg()) && price.lt(ema20)) return "TRENDING_DOWN";
  }
  return "RANGE_BOUND";
}
function computePortfolioRisk(closes, barsPerDay, input) {
  const equity = input ? new D(input.equityUsd) : null;
  const limit = input?.dailyLossLimitUsd ? new D(input.dailyLossLimitUsd) : null;
  const loss = input?.dailyLossUsedUsd;
  const openRisk = input?.openRiskUsd;
  const remaining = limit && loss !== void 0 ? D.max(limit.minus(loss), 0) : null;
  const usedPct = limit && loss !== void 0 ? new D(loss).div(limit).mul(100) : null;
  const returns = closes.slice(1).map((close, index) => close.div(closes[index]).minus(1));
  const varRatio = returns.length >= 2 ? standardDeviation(returns, mean(returns), returns.length - 1).mul(NORMAL_QUANTILE_95).mul(new D(barsPerDay).sqrt()) : null;
  const varUsd = equity?.gt(0) && varRatio ? equity.mul(varRatio) : null;
  const notes = [];
  if (usedPct === null) notes.push("Daily loss limit or usage is unavailable.");
  if (varUsd === null) notes.push("Positive equity and at least two observed returns are required for the USD estimate.");
  else notes.push("One-day VaR scales the selected market\u2019s return volatility by equity. It omits position-level exposure and correlations.");
  const openRiskExceedsBuffer = remaining !== null && openRisk !== void 0 && openRisk > 0 && remaining.lt(openRisk);
  if (openRiskExceedsBuffer) notes.push("Reported open risk exceeds the remaining daily drawdown buffer.");
  let riskPosture = "SAFE";
  if (usedPct?.gte(100) || equity?.lte(0)) riskPosture = "CRITICAL";
  else if (usedPct?.gte(75) || openRiskExceedsBuffer || varUsd !== null && varRatio?.gte("0.10")) riskPosture = "ELEVATED";
  else if (usedPct?.gte(50) || usedPct === null || varUsd === null || varRatio?.gte("0.05")) riskPosture = "CAUTION";
  return {
    equityUsd: equity?.toNumber() ?? null,
    var95Usd: varUsd?.toNumber() ?? null,
    var95Pct: varRatio?.mul(100).toNumber() ?? null,
    dailyDdUsedPct: usedPct?.toNumber() ?? null,
    dailyDdBufferUsd: remaining?.toNumber() ?? null,
    openRiskUsd: openRisk ?? null,
    riskPosture,
    notes
  };
}
function computeQuantSupervisionSnapshot(symbol, timeframe, input, portfolio) {
  const candles = normalizeSupervisionCandles(input);
  const closes = candles.map((candle) => new D(candle.close));
  const last = closes.at(-1);
  const barsPerDay = Object.hasOwn(BARS_PER_DAY, timeframe) ? BARS_PER_DAY[timeframe] : 1;
  let cumulativeVolume = new D(0);
  let cumulativeValue = new D(0);
  const vwapSeries = candles.map((candle) => {
    const volume = candle.volume ?? 0;
    const typical = new D(candle.high).plus(candle.low).plus(candle.close).div(3);
    cumulativeValue = cumulativeValue.plus(typical.mul(volume));
    cumulativeVolume = cumulativeVolume.plus(volume);
    return cumulativeVolume.gt(0) ? cumulativeValue.div(cumulativeVolume).toNumber() : null;
  });
  const ema20Series = ema(closes, 20).map((value) => value?.toNumber() ?? null);
  const sma50Series = closes.map((_, index) => index < 49 ? null : mean(closes.slice(index - 49, index + 1)).toNumber());
  const bollingerSeries = closes.map((close, index) => {
    if (index < 19) return null;
    const window2 = closes.slice(index - 19, index + 1);
    const middle = mean(window2);
    const sigma = standardDeviation(window2, middle, 20);
    return {
      upper: middle.plus(sigma.mul(2)).toNumber(),
      middle: middle.toNumber(),
      lower: middle.minus(sigma.mul(2)).toNumber(),
      bandwidthPct: sigma.mul(400).div(middle).toNumber(),
      zScore: sigma.isZero() ? 0 : close.minus(middle).div(sigma).toNumber()
    };
  });
  const trueRanges = candles.map(({ high, low }, index) => {
    const range = new D(high).minus(low);
    const previous = closes[index - 1];
    return previous ? D.max(range, previous.minus(high).abs(), previous.minus(low).abs()) : range;
  });
  const atr = wilderAverage(trueRanges, 14);
  const ema20 = ema20Series.at(-1) ?? null;
  return {
    symbol,
    timeframe,
    candleCount: candles.length,
    lastPrice: last?.toNumber() ?? null,
    vwap: vwapSeries.at(-1) ?? null,
    vwapSeries,
    ema20,
    ema20Series,
    sma50: sma50Series.at(-1) ?? null,
    sma50Series,
    rsi14: computeRsi14(closes),
    macd: computeMacd(closes),
    bollinger: bollingerSeries.at(-1) ?? { ...EMPTY_BOLLINGER },
    bollingerSeries,
    atr14: atr?.toNumber() ?? null,
    atrPctOfPrice: last && atr ? atr.div(last).mul(100).toNumber() : null,
    volatilityRegime: resolveVolatilityRegime(closes, trueRanges, atr, ema20, barsPerDay),
    structuralSupportZones: last ? computeStructuralZones(candles, "SUPPORT", atr, last) : [],
    structuralResistanceZones: last ? computeStructuralZones(candles, "RESISTANCE", atr, last) : [],
    portfolioRiskAudit: computePortfolioRisk(closes, barsPerDay, sanitizeQuantPortfolioInput(portfolio)),
    hasVolumeData: cumulativeVolume.gt(0)
  };
}

// src/utils/deskI18n.ts
function deskText(lang, english, thai) {
  return lang === "th" ? thai : english;
}

// src/utils/aiProviderConfig.ts
var AI_HEADERS = {
  provider: "X-TallyNX-AI-Provider",
  model: "X-TallyNX-AI-Model",
  key: "X-TallyNX-AI-Key",
  account: "X-TallyNX-Codex-Account-Id",
  databento: "X-TallyNX-Databento-Key",
  oauthCode: "X-TallyNX-Codex-Code",
  oauthVerifier: "X-TallyNX-Codex-Verifier",
  oauthState: "X-TallyNX-Codex-State"
};
var AI_MODEL_CATALOG = {
  platform: [
    "auto",
    "gemini-4-neon",
    "gemini-4-carbon",
    "gemini-4-argon",
    "gemini-4-hydrogen",
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemma-4-31b-it",
    "gemma-4-26b-a4b-it"
  ],
  google: [
    "gemini-4-neon",
    "gemini-4-carbon",
    "gemini-4-argon",
    "gemini-4-hydrogen",
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemma-4-31b-it",
    "gemma-4-26b-a4b-it"
  ],
  openrouter: [
    "google/gemini-4-neon",
    "google/gemini-4-carbon",
    "google/gemini-4-argon",
    "google/gemini-4-hydrogen",
    "google/gemini-3.8-flash",
    "openai/gpt-6.2-astra",
    "openai/gpt-6.2-sol",
    "openai/gpt-5.4",
    "openai/o3",
    "anthropic/claude-opus-5.5",
    "anthropic/claude-sonnet-5.5",
    "anthropic/claude-haiku-5.5",
    "anthropic/claude-fable-5.2",
    "anthropic/claude-sonnet-4",
    "x-ai/grok-4.7",
    "x-ai/grok-4.6",
    "x-ai/grok-4",
    "deepseek/deepseek-v4.1-flash",
    "deepseek/deepseek-v4-pro",
    "deepseek/deepseek-r1",
    "qwen/qwen4-max",
    "qwen/qwen3.8-max-prime",
    "qwen/qwen3-next-80b-a3b-instruct",
    "openrouter/auto"
  ],
  codex_oauth: [
    "gpt-6.2-astra",
    "gpt-6.2-sol",
    "gpt-6.1-sol",
    "gpt-5.4",
    "gpt-5.3-codex",
    "o3"
  ]
};
var CODEX_CALLBACK_URI = "http://localhost:1455/auth/callback";
function asRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function normalizeAiProvider(value) {
  if (typeof value !== "string") return void 0;
  const provider = value.trim().toLowerCase();
  if (provider === "gemini") return "google";
  if (provider === "openai" || provider === "codex") return "codex_oauth";
  return Object.hasOwn(AI_MODEL_CATALOG, provider) ? provider : void 0;
}
function normalizeAiModel(provider, value) {
  if (typeof value !== "string") return void 0;
  const id = value.trim();
  if (isOpenAiApiKey(id) || /^sk-or-v1-/i.test(id) || /^AIza[a-zA-Z0-9_-]{35}$/.test(id) || isCodexAccessToken(id)) return void 0;
  const model = id.toLowerCase();
  if (provider === "platform") return AI_MODEL_CATALOG.platform.some((candidate) => candidate === model) ? model : void 0;
  if (provider === "google") {
    const googleModel = model.replace(/^models\//, "");
    return /^[a-z0-9][a-z0-9._-]{0,127}$/.test(googleModel) ? googleModel : void 0;
  }
  if (provider === "openrouter") {
    return model.length <= 128 && /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(?::[a-z0-9._-]+)?$/.test(model) ? model : void 0;
  }
  return /^[a-z0-9][a-z0-9._:-]{0,127}$/.test(model) ? model : void 0;
}
function normalizeHeaderSecret(value, maxLength = 8e3) {
  if (typeof value !== "string" || /[^\x20-\x7e]/.test(value)) return void 0;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength && /^[!-~]+$/.test(trimmed) ? trimmed : void 0;
}
function normalizeCodexAccountId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value) ? value : void 0;
}
function isOpenAiApiKey(key) {
  return /^sk-(?!or-v1-)[a-zA-Z0-9_-]{12,}$/.test(key);
}
function isCodexAccessToken(key) {
  return /^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(key);
}
function isByokKeyFormat(provider, key, accountId) {
  if (provider === "google") return /^AIza[a-zA-Z0-9_-]{35}$/.test(key);
  if (provider === "openrouter") return /^sk-or-v1-[a-zA-Z0-9_-]{16,}$/.test(key);
  return isOpenAiApiKey(key) || isCodexAccessToken(key) || Boolean(accountId && /^[a-zA-Z0-9._~-]{16,}$/.test(key));
}
function buildDatabentoRequestHeaders(key) {
  const clean = normalizeHeaderSecret(key, 256);
  return clean && /^[a-zA-Z0-9_-]+$/.test(clean) ? { [AI_HEADERS.databento]: clean } : {};
}
function displayString(value, limit) {
  return typeof value === "string" && value.length > 0 && value.length <= limit && !/[\x00-\x1f\x7f]/.test(value) ? value : void 0;
}
function decodeCodexJwtMetadata(token) {
  if (typeof token !== "string" || token.length > 24e3 || !isCodexAccessToken(token)) return {};
  try {
    const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const claims = asRecord(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
    if (!claims) return {};
    const auth = asRecord(claims["https://api.openai.com/auth"]);
    const profile = asRecord(claims["https://api.openai.com/profile"]);
    const email = displayString(claims.email ?? profile?.email, 254);
    const accountEmail = email && /^[^\s@]+@[^\s@]+$/.test(email) ? email : void 0;
    const plan = displayString(auth?.chatgpt_plan_type ?? claims.chatgpt_plan_type, 40);
    const planType = plan && /^[a-zA-Z0-9_-]+$/.test(plan) ? plan : void 0;
    const chatgptAccountId = normalizeCodexAccountId(auth?.chatgpt_account_id ?? claims.chatgpt_account_id);
    const expiresAt = typeof claims.exp === "number" && Number.isSafeInteger(claims.exp) && claims.exp > 0 && claims.exp < 864e10 ? claims.exp * 1e3 : void 0;
    return {
      ...accountEmail ? { accountEmail } : {},
      ...planType ? { planType } : {},
      ...chatgptAccountId ? { chatgptAccountId } : {},
      ...expiresAt ? { expiresAt } : {}
    };
  } catch {
    return {};
  }
}
function readCodexOauthCredential(value) {
  const source = asRecord(value);
  if (!source) return void 0;
  const accessToken = normalizeHeaderSecret(source.accessToken ?? source.access_token);
  const idMetadata = decodeCodexJwtMetadata(source.id_token);
  const accessMetadata = decodeCodexJwtMetadata(accessToken);
  const chatgptAccountId = accessMetadata.chatgptAccountId ?? idMetadata.chatgptAccountId ?? normalizeCodexAccountId(source.chatgptAccountId ?? source.account_id);
  if (!accessToken || isOpenAiApiKey(accessToken) || !isByokKeyFormat("codex_oauth", accessToken, chatgptAccountId)) return void 0;
  const refreshToken = normalizeHeaderSecret(source.refreshToken ?? source.refresh_token);
  const expiry = source.expiresAt;
  const expiresAt = accessMetadata.expiresAt ?? (typeof expiry === "number" && Number.isFinite(expiry) && expiry > 0 ? expiry : void 0);
  return {
    accessToken,
    ...refreshToken ? { refreshToken } : {},
    ...chatgptAccountId ? { chatgptAccountId } : {},
    accountEmail: idMetadata.accountEmail ?? accessMetadata.accountEmail ?? displayString(source.accountEmail, 254),
    planType: idMetadata.planType ?? accessMetadata.planType ?? displayString(source.planType, 40),
    expiresAt
  };
}

// src/utils/liveChartMarkets.ts
var LIVE_CHART_SYMBOLS = [
  "XAUUSD",
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "NAS100",
  "US30",
  "BTCUSD"
];
var LIVE_CHART_TIMEFRAMES = ["5m", "15m", "1h", "4h", "1d"];

// src/utils/riskSupervisionReport.ts
var RISK_SUPERVISE_FORBIDDEN_FIELDS = Object.freeze([
  ["suggested", "Entry"],
  ["suggested", "Stop", "Loss"],
  ["suggested", "Take", "Profit"],
  ["trend", "Verdict"],
  ["entry", "Price"],
  ["stop", "Loss"],
  ["take", "Profit"],
  ["onApply", "AiOrder"],
  ["NewOrder", "Modal"]
].map((parts) => parts.join("")));
var REGIME_LABELS = {
  TRENDING_UP: ["Upward structure", "\u0E42\u0E04\u0E23\u0E07\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E02\u0E32\u0E02\u0E36\u0E49\u0E19"],
  TRENDING_DOWN: ["Downward structure", "\u0E42\u0E04\u0E23\u0E07\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E02\u0E32\u0E25\u0E07"],
  RANGE_BOUND: ["Range-bound", "\u0E40\u0E04\u0E25\u0E37\u0E48\u0E2D\u0E19\u0E44\u0E2B\u0E27\u0E43\u0E19\u0E01\u0E23\u0E2D\u0E1A"],
  HIGH_VOLATILITY: ["High volatility", "\u0E04\u0E27\u0E32\u0E21\u0E1C\u0E31\u0E19\u0E1C\u0E27\u0E19\u0E2A\u0E39\u0E07"]
};
function riskSupervisionRegimeLabel(regime, lang) {
  return deskText(lang, ...REGIME_LABELS[regime]);
}
function asRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
function parseRiskSuperviseRequest(input) {
  const body = asRecord2(input);
  if (!body || !Array.isArray(body.candles) || body.candles.length === 0 || body.candles.length > 512) return null;
  const symbolText = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
  const timeframeText = typeof body.timeframe === "string" ? body.timeframe.trim().toLowerCase() : "";
  const symbol = LIVE_CHART_SYMBOLS.find((value) => value === symbolText);
  const timeframe = LIVE_CHART_TIMEFRAMES.find((value) => value === timeframeText);
  if (!symbol || !timeframe) return null;
  const candles = normalizeSupervisionCandles(body.candles);
  if (!candles.length) return null;
  return {
    symbol,
    timeframe,
    lang: body.lang === "th" ? "th" : "en",
    candles,
    portfolio: sanitizeQuantPortfolioInput(body.portfolio)
  };
}
function buildDeterministicSupervisionReport(quantSnapshot, lang, generatedAt, fallbackReason) {
  const { symbol, timeframe, candleCount, volatilityRegime, hasVolumeData, vwap, rsi14, macd, atr14, atrPctOfPrice, bollinger } = quantSnapshot;
  const audit = quantSnapshot.portfolioRiskAudit;
  const t = (en, th) => deskText(lang, en, th);
  const price = new Intl.NumberFormat(lang, { maximumSignificantDigits: 8 });
  const metric = new Intl.NumberFormat(lang, { maximumFractionDigits: 2 });
  const money = new Intl.NumberFormat(lang, { style: "currency", currency: "USD" });
  const regime = riskSupervisionRegimeLabel(volatilityRegime, lang);
  const formatZone = (zone) => t(
    `${price.format(zone.bandLow)}\u2013${price.format(zone.bandHigh)} \xB7 ${zone.touches} confirmed swing ${zone.touches === 1 ? "touch" : "touches"}`,
    `${price.format(zone.bandLow)}\u2013${price.format(zone.bandHigh)} \xB7 \u0E08\u0E38\u0E14\u0E2A\u0E27\u0E34\u0E07\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19 ${zone.touches} \u0E04\u0E23\u0E31\u0E49\u0E07`
  );
  const volatilityRating = volatilityRegime === "HIGH_VOLATILITY" ? (atrPctOfPrice ?? 0) >= 3 || (bollinger.bandwidthPct ?? 0) >= 12 ? "EXTREME" : "HIGH" : atrPctOfPrice === null || atrPctOfPrice >= 0.5 ? "MODERATE" : "LOW";
  const riskRating = audit.riskPosture === "CRITICAL" || audit.riskPosture === "ELEVATED" ? audit.riskPosture : volatilityRating === "HIGH" || volatilityRating === "EXTREME" ? "ELEVATED" : audit.riskPosture === "CAUTION" ? "MODERATE" : "LOW";
  const varText = audit.var95Usd !== null ? t(
    `One-day 95% VaR proxy: ${money.format(audit.var95Usd)}. It scales this market\u2019s volatility by account equity and omits position-level exposure and correlations.`,
    `\u0E04\u0E48\u0E32\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13 VaR 95% \u0E2B\u0E19\u0E36\u0E48\u0E07\u0E27\u0E31\u0E19 ${money.format(audit.var95Usd)} \u0E04\u0E33\u0E19\u0E27\u0E13\u0E08\u0E32\u0E01\u0E04\u0E27\u0E32\u0E21\u0E1C\u0E31\u0E19\u0E1C\u0E27\u0E19\u0E02\u0E2D\u0E07\u0E2A\u0E34\u0E19\u0E17\u0E23\u0E31\u0E1E\u0E22\u0E4C\u0E19\u0E35\u0E49\u0E01\u0E31\u0E1A\u0E21\u0E39\u0E25\u0E04\u0E48\u0E32\u0E2A\u0E38\u0E17\u0E18\u0E34\u0E02\u0E2D\u0E07\u0E1A\u0E31\u0E0D\u0E0A\u0E35 \u0E42\u0E14\u0E22\u0E44\u0E21\u0E48\u0E23\u0E27\u0E21\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E48\u0E22\u0E07\u0E41\u0E15\u0E48\u0E25\u0E30\u0E2A\u0E16\u0E32\u0E19\u0E30\u0E41\u0E25\u0E30\u0E04\u0E27\u0E32\u0E21\u0E2A\u0E31\u0E21\u0E1E\u0E31\u0E19\u0E18\u0E4C\u0E23\u0E30\u0E2B\u0E27\u0E48\u0E32\u0E07\u0E2A\u0E34\u0E19\u0E17\u0E23\u0E31\u0E1E\u0E22\u0E4C`
  ) : t("The equity-scaled VaR estimate is unavailable.", "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E40\u0E1E\u0E35\u0E22\u0E07\u0E1E\u0E2D\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E04\u0E33\u0E19\u0E27\u0E13 VaR \u0E08\u0E32\u0E01\u0E21\u0E39\u0E25\u0E04\u0E48\u0E32\u0E2A\u0E38\u0E17\u0E18\u0E34\u0E02\u0E2D\u0E07\u0E1A\u0E31\u0E0D\u0E0A\u0E35");
  const drawdownText = audit.dailyDdUsedPct !== null && audit.dailyDdBufferUsd !== null ? t(
    `Daily drawdown has used ${metric.format(audit.dailyDdUsedPct)}% of the tracked limit. Remaining buffer: ${money.format(audit.dailyDdBufferUsd)}.`,
    `\u0E43\u0E0A\u0E49\u0E27\u0E07\u0E40\u0E07\u0E34\u0E19\u0E02\u0E32\u0E14\u0E17\u0E38\u0E19\u0E23\u0E32\u0E22\u0E27\u0E31\u0E19\u0E44\u0E1B ${metric.format(audit.dailyDdUsedPct)}% \u0E40\u0E2B\u0E25\u0E37\u0E2D\u0E27\u0E07\u0E40\u0E07\u0E34\u0E19 ${money.format(audit.dailyDdBufferUsd)}`
  ) : t("Daily drawdown data is unavailable.", "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E27\u0E07\u0E40\u0E07\u0E34\u0E19\u0E02\u0E32\u0E14\u0E17\u0E38\u0E19\u0E23\u0E32\u0E22\u0E27\u0E31\u0E19");
  const openRiskText = audit.openRiskUsd !== null ? t(`Reported open risk: ${money.format(audit.openRiskUsd)}.`, `\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E48\u0E22\u0E07\u0E02\u0E2D\u0E07\u0E2A\u0E16\u0E32\u0E19\u0E30\u0E40\u0E1B\u0E34\u0E14\u0E17\u0E35\u0E48\u0E23\u0E32\u0E22\u0E07\u0E32\u0E19 ${money.format(audit.openRiskUsd)}`) : "";
  const deskBrief = candleCount >= 20 ? t(
    `${symbol} \xB7 ${timeframe} shows ${regime.toLowerCase()} across ${candleCount} observed candles.`,
    `${symbol} \xB7 ${timeframe} \u0E21\u0E35${regime}\u0E08\u0E32\u0E01\u0E41\u0E17\u0E48\u0E07\u0E23\u0E32\u0E04\u0E32\u0E17\u0E35\u0E48\u0E2A\u0E31\u0E07\u0E40\u0E01\u0E15\u0E44\u0E14\u0E49 ${candleCount} \u0E41\u0E17\u0E48\u0E07`
  ) : t(
    `${symbol} \xB7 ${timeframe} has ${candleCount} observed candles. Market structure is provisional while indicators accumulate history.`,
    `${symbol} \xB7 ${timeframe} \u0E21\u0E35\u0E41\u0E17\u0E48\u0E07\u0E23\u0E32\u0E04\u0E32\u0E17\u0E35\u0E48\u0E2A\u0E31\u0E07\u0E40\u0E01\u0E15\u0E44\u0E14\u0E49 ${candleCount} \u0E41\u0E17\u0E48\u0E07 \u0E42\u0E04\u0E23\u0E07\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E15\u0E25\u0E32\u0E14\u0E22\u0E31\u0E07\u0E40\u0E1B\u0E47\u0E19\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E40\u0E1A\u0E37\u0E49\u0E2D\u0E07\u0E15\u0E49\u0E19\u0E23\u0E30\u0E2B\u0E27\u0E48\u0E32\u0E07\u0E2A\u0E30\u0E2A\u0E21\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25`
  );
  return {
    structureRegime: volatilityRegime,
    volatilityRating,
    riskRating,
    deskBrief,
    quantitativeInsight: [
      vwap === null ? null : `VWAP ${price.format(vwap)}`,
      rsi14 === null ? null : `RSI14 ${metric.format(rsi14)}`,
      macd.histogram === null ? null : t(`MACD histogram ${price.format(macd.histogram)}`, `\u0E2E\u0E34\u0E2A\u0E42\u0E15\u0E41\u0E01\u0E23\u0E21 MACD ${price.format(macd.histogram)}`),
      atr14 === null ? null : `ATR14 ${price.format(atr14)}`,
      bollinger.bandwidthPct === null ? null : t(`BB width ${metric.format(bollinger.bandwidthPct)}%`, `\u0E04\u0E27\u0E32\u0E21\u0E01\u0E27\u0E49\u0E32\u0E07 BB ${metric.format(bollinger.bandwidthPct)}%`)
    ].filter(Boolean).join(" \xB7 ") || t("Indicators are accumulating candle history.", "\u0E15\u0E31\u0E27\u0E0A\u0E35\u0E49\u0E27\u0E31\u0E14\u0E01\u0E33\u0E25\u0E31\u0E07\u0E2A\u0E30\u0E2A\u0E21\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E41\u0E17\u0E48\u0E07\u0E23\u0E32\u0E04\u0E32"),
    liquidityNote: hasVolumeData ? t(
      "VWAP uses volume reported by the chart feed over the displayed history. Candle volume alone cannot measure order-book depth.",
      "VWAP \u0E43\u0E0A\u0E49\u0E1B\u0E23\u0E34\u0E21\u0E32\u0E13\u0E08\u0E32\u0E01\u0E41\u0E2B\u0E25\u0E48\u0E07\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E01\u0E23\u0E32\u0E1F\u0E43\u0E19\u0E0A\u0E48\u0E27\u0E07\u0E17\u0E35\u0E48\u0E41\u0E2A\u0E14\u0E07 \u0E1B\u0E23\u0E34\u0E21\u0E32\u0E13\u0E23\u0E32\u0E22\u0E41\u0E17\u0E48\u0E07\u0E40\u0E1E\u0E35\u0E22\u0E07\u0E2D\u0E22\u0E48\u0E32\u0E07\u0E40\u0E14\u0E35\u0E22\u0E27\u0E27\u0E31\u0E14\u0E04\u0E27\u0E32\u0E21\u0E25\u0E36\u0E01\u0E02\u0E2D\u0E07\u0E2A\u0E21\u0E38\u0E14\u0E04\u0E33\u0E2A\u0E31\u0E48\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49"
    ) : t(
      "The feed provides no positive candle volume. VWAP and volume-based observations are unavailable.",
      "\u0E41\u0E2B\u0E25\u0E48\u0E07\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E44\u0E21\u0E48\u0E21\u0E35\u0E1B\u0E23\u0E34\u0E21\u0E32\u0E13\u0E23\u0E32\u0E22\u0E41\u0E17\u0E48\u0E07\u0E17\u0E35\u0E48\u0E21\u0E32\u0E01\u0E01\u0E27\u0E48\u0E32\u0E28\u0E39\u0E19\u0E22\u0E4C \u0E08\u0E36\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E04\u0E48\u0E32 VWAP \u0E41\u0E25\u0E30\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C\u0E08\u0E32\u0E01\u0E1B\u0E23\u0E34\u0E21\u0E32\u0E13"
    ),
    portfolioRiskAudit: [varText, drawdownText, openRiskText].filter(Boolean).join(" "),
    structuralSupportZones: quantSnapshot.structuralSupportZones.map(formatZone),
    structuralResistanceZones: quantSnapshot.structuralResistanceZones.map(formatZone),
    riskGuardrailNote: t(
      "Treat structural bands as descriptions of observed swings. Verify daily drawdown against the account provider\u2019s active rules.",
      "\u0E2D\u0E48\u0E32\u0E19\u0E42\u0E0B\u0E19\u0E42\u0E04\u0E23\u0E07\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E40\u0E1B\u0E47\u0E19\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E08\u0E38\u0E14\u0E2A\u0E27\u0E34\u0E07\u0E43\u0E19\u0E2D\u0E14\u0E35\u0E15 \u0E41\u0E25\u0E30\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E27\u0E07\u0E40\u0E07\u0E34\u0E19\u0E02\u0E32\u0E14\u0E17\u0E38\u0E19\u0E23\u0E32\u0E22\u0E27\u0E31\u0E19\u0E01\u0E31\u0E1A\u0E01\u0E0E\u0E1B\u0E31\u0E08\u0E08\u0E38\u0E1A\u0E31\u0E19\u0E02\u0E2D\u0E07\u0E1C\u0E39\u0E49\u0E43\u0E2B\u0E49\u0E1A\u0E23\u0E34\u0E01\u0E32\u0E23\u0E1A\u0E31\u0E0D\u0E0A\u0E35"
    ),
    disciplineChecklist: [
      t("Verify the chart feed, timeframe and timestamp.", "\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E41\u0E2B\u0E25\u0E48\u0E07\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25 \u0E01\u0E23\u0E2D\u0E1A\u0E40\u0E27\u0E25\u0E32 \u0E41\u0E25\u0E30\u0E40\u0E27\u0E25\u0E32\u0E17\u0E35\u0E48\u0E2D\u0E31\u0E1B\u0E40\u0E14\u0E15"),
      t("Reconcile daily drawdown with the account\u2019s records.", "\u0E40\u0E17\u0E35\u0E22\u0E1A\u0E22\u0E2D\u0E14\u0E02\u0E32\u0E14\u0E17\u0E38\u0E19\u0E23\u0E32\u0E22\u0E27\u0E31\u0E19\u0E01\u0E31\u0E1A\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E02\u0E2D\u0E07\u0E1A\u0E31\u0E0D\u0E0A\u0E35"),
      t("Record missing data and model assumptions in the review.", "\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E17\u0E35\u0E48\u0E02\u0E32\u0E14\u0E41\u0E25\u0E30\u0E2A\u0E21\u0E21\u0E15\u0E34\u0E10\u0E32\u0E19\u0E17\u0E35\u0E48\u0E43\u0E0A\u0E49\u0E43\u0E19\u0E01\u0E32\u0E23\u0E17\u0E1A\u0E17\u0E27\u0E19")
    ],
    symbol,
    timeframe,
    lang,
    generatedAt,
    quantSnapshot,
    source: "deterministic",
    model: null,
    fallbackUsed: true,
    ...fallbackReason ? { fallbackReason } : {}
  };
}
var SCALAR_FIELDS = [
  "structureRegime",
  "volatilityRating",
  "riskRating",
  "deskBrief",
  "quantitativeInsight",
  "liquidityNote",
  "portfolioRiskAudit",
  "riskGuardrailNote"
];
var ARRAY_FIELDS = ["structuralSupportZones", "structuralResistanceZones", "disciplineChecklist"];
function reportWording(report) {
  const t = (en, th) => deskText(report.lang, en, th);
  const highVolatility = report.structureRegime === "HIGH_VOLATILITY";
  const hasVolume = report.quantSnapshot?.hasVolumeData === true;
  return {
    structureRegime: [report.structureRegime],
    volatilityRating: [report.volatilityRating],
    riskRating: [report.riskRating],
    deskBrief: [
      report.deskBrief,
      report.deskBrief + " " + (highVolatility ? t(
        "The observed range expansion increases uncertainty in recent structure.",
        "\u0E0A\u0E48\u0E27\u0E07\u0E23\u0E32\u0E04\u0E32\u0E17\u0E35\u0E48\u0E02\u0E22\u0E32\u0E22\u0E15\u0E31\u0E27\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E04\u0E27\u0E32\u0E21\u0E44\u0E21\u0E48\u0E41\u0E19\u0E48\u0E19\u0E2D\u0E19\u0E02\u0E2D\u0E07\u0E42\u0E04\u0E23\u0E07\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E25\u0E48\u0E32\u0E2A\u0E38\u0E14"
      ) : t(
        "The structure label summarizes the observed window and can change as new candles arrive.",
        "\u0E1B\u0E49\u0E32\u0E22\u0E42\u0E04\u0E23\u0E07\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E2A\u0E23\u0E38\u0E1B\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E0A\u0E48\u0E27\u0E07\u0E17\u0E35\u0E48\u0E2A\u0E31\u0E07\u0E40\u0E01\u0E15\u0E41\u0E25\u0E30\u0E2D\u0E32\u0E08\u0E40\u0E1B\u0E25\u0E35\u0E48\u0E22\u0E19\u0E40\u0E21\u0E37\u0E48\u0E2D\u0E21\u0E35\u0E41\u0E17\u0E48\u0E07\u0E23\u0E32\u0E04\u0E32\u0E43\u0E2B\u0E21\u0E48"
      ))
    ],
    quantitativeInsight: [
      report.quantitativeInsight,
      report.quantitativeInsight + " " + t(
        "ATR describes price range. Bollinger width describes dispersion around the moving average.",
        "ATR \u0E2D\u0E18\u0E34\u0E1A\u0E32\u0E22\u0E0A\u0E48\u0E27\u0E07\u0E01\u0E32\u0E23\u0E40\u0E04\u0E25\u0E37\u0E48\u0E2D\u0E19\u0E44\u0E2B\u0E27\u0E02\u0E2D\u0E07\u0E23\u0E32\u0E04\u0E32 \u0E2A\u0E48\u0E27\u0E19\u0E04\u0E27\u0E32\u0E21\u0E01\u0E27\u0E49\u0E32\u0E07 Bollinger \u0E2D\u0E18\u0E34\u0E1A\u0E32\u0E22\u0E01\u0E32\u0E23\u0E01\u0E23\u0E30\u0E08\u0E32\u0E22\u0E23\u0E2D\u0E1A\u0E04\u0E48\u0E32\u0E40\u0E09\u0E25\u0E35\u0E48\u0E22\u0E40\u0E04\u0E25\u0E37\u0E48\u0E2D\u0E19\u0E17\u0E35\u0E48"
      )
    ],
    liquidityNote: [
      report.liquidityNote,
      report.liquidityNote + " " + (hasVolume ? t("Volume can reflect proxy activity depending on the data source.", "\u0E1B\u0E23\u0E34\u0E21\u0E32\u0E13\u0E2D\u0E32\u0E08\u0E40\u0E1B\u0E47\u0E19\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E15\u0E31\u0E27\u0E41\u0E17\u0E19\u0E15\u0E32\u0E21\u0E41\u0E2B\u0E25\u0E48\u0E07\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E17\u0E35\u0E48\u0E43\u0E0A\u0E49") : t("Observed candle ranges describe price dispersion only.", "\u0E0A\u0E48\u0E27\u0E07\u0E23\u0E32\u0E04\u0E32\u0E41\u0E15\u0E48\u0E25\u0E30\u0E41\u0E17\u0E48\u0E07\u0E2D\u0E18\u0E34\u0E1A\u0E32\u0E22\u0E01\u0E32\u0E23\u0E01\u0E23\u0E30\u0E08\u0E32\u0E22\u0E02\u0E2D\u0E07\u0E23\u0E32\u0E04\u0E32\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19"))
    ],
    portfolioRiskAudit: [
      report.portfolioRiskAudit,
      report.portfolioRiskAudit + " " + t(
        "A 95% VaR estimate leaves a loss tail outside the modeled threshold.",
        "\u0E04\u0E48\u0E32 VaR 95% \u0E22\u0E31\u0E07\u0E21\u0E35\u0E42\u0E2D\u0E01\u0E32\u0E2A\u0E40\u0E01\u0E34\u0E14\u0E01\u0E32\u0E23\u0E02\u0E32\u0E14\u0E17\u0E38\u0E19\u0E17\u0E35\u0E48\u0E2A\u0E39\u0E07\u0E01\u0E27\u0E48\u0E32\u0E40\u0E01\u0E13\u0E11\u0E4C\u0E1B\u0E23\u0E30\u0E21\u0E32\u0E13\u0E01\u0E32\u0E23"
      )
    ],
    structuralSupportZones: report.structuralSupportZones,
    structuralResistanceZones: report.structuralResistanceZones,
    riskGuardrailNote: [
      report.riskGuardrailNote,
      report.riskGuardrailNote + " " + t(
        "Review the account reset time when interpreting daily loss figures.",
        "\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E40\u0E27\u0E25\u0E32\u0E23\u0E35\u0E40\u0E0B\u0E47\u0E15\u0E23\u0E2D\u0E1A\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E40\u0E21\u0E37\u0E48\u0E2D\u0E2D\u0E48\u0E32\u0E19\u0E22\u0E2D\u0E14\u0E02\u0E32\u0E14\u0E17\u0E38\u0E19\u0E23\u0E32\u0E22\u0E27\u0E31\u0E19"
      )
    ],
    disciplineChecklist: [
      ...report.disciplineChecklist,
      t("Confirm the daily loss reset time.", "\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E40\u0E27\u0E25\u0E32\u0E23\u0E35\u0E40\u0E0B\u0E47\u0E15\u0E27\u0E07\u0E40\u0E07\u0E34\u0E19\u0E02\u0E32\u0E14\u0E17\u0E38\u0E19\u0E23\u0E32\u0E22\u0E27\u0E31\u0E19"),
      t("Check whether the feed reports actual or proxy volume.", "\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E27\u0E48\u0E32\u0E41\u0E2B\u0E25\u0E48\u0E07\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E23\u0E32\u0E22\u0E07\u0E32\u0E19\u0E1B\u0E23\u0E34\u0E21\u0E32\u0E13\u0E08\u0E23\u0E34\u0E07\u0E2B\u0E23\u0E37\u0E2D\u0E1B\u0E23\u0E34\u0E21\u0E32\u0E13\u0E15\u0E31\u0E27\u0E41\u0E17\u0E19"),
      t("Note the limits of a single-market VaR estimate.", "\u0E23\u0E30\u0E1A\u0E38\u0E02\u0E49\u0E2D\u0E08\u0E33\u0E01\u0E31\u0E14\u0E02\u0E2D\u0E07 VaR \u0E17\u0E35\u0E48\u0E43\u0E0A\u0E49\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E08\u0E32\u0E01\u0E2A\u0E34\u0E19\u0E17\u0E23\u0E31\u0E1E\u0E22\u0E4C\u0E40\u0E14\u0E35\u0E22\u0E27")
    ]
  };
}
function buildRiskSupervisionResponseSchema(report) {
  const wording = reportWording(report);
  return {
    type: "object",
    additionalProperties: false,
    required: [...SCALAR_FIELDS, ...ARRAY_FIELDS],
    properties: {
      ...Object.fromEntries(SCALAR_FIELDS.map((key) => [key, { type: "string", enum: wording[key] }])),
      ...Object.fromEntries(ARRAY_FIELDS.map((key) => [key, {
        type: "array",
        minItems: report[key].length,
        maxItems: report[key].length,
        items: wording[key].length ? { type: "string", enum: wording[key] } : { type: "string" }
      }]))
    }
  };
}
function containsForbiddenField(input) {
  const forbidden = new Set(RISK_SUPERVISE_FORBIDDEN_FIELDS.map((key) => key.toLowerCase()));
  const pending = [input];
  const visited = /* @__PURE__ */ new Set();
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object" || visited.has(value)) continue;
    visited.add(value);
    const entries = Object.entries(value);
    if (entries.some(([key]) => forbidden.has(key.toLowerCase().replace(/[^a-z]/g, "")))) return true;
    for (const [, child] of entries) pending.push(child);
  }
  return false;
}
function sanitizeAiRiskSupervisionReport(input, deterministicReport, model, source = "gemini") {
  const parsed = asRecord2(input);
  if (!parsed || containsForbiddenField(parsed)) return null;
  const wording = reportWording(deterministicReport);
  const { fallbackReason: _fallbackReason, ...base } = deterministicReport;
  const clean = { ...base, model, source, fallbackUsed: false };
  for (const key of SCALAR_FIELDS) {
    const value = parsed[key];
    if (typeof value !== "string" || !wording[key].includes(value)) return null;
    if (key !== "structureRegime" && key !== "volatilityRating" && key !== "riskRating") clean[key] = value;
  }
  for (const key of ARRAY_FIELDS) {
    const value = parsed[key];
    if (!Array.isArray(value) || value.length !== base[key].length) return null;
    const items = value;
    if (!items.every((item) => typeof item === "string" && wording[key].includes(item)) || new Set(items).size !== items.length) return null;
    clean[key] = items;
  }
  return clean;
}

// server/ai/byokProvider.ts
import { createHash as createHash3 } from "node:crypto";
import { isIP } from "node:net";
import { FinishReason, GoogleGenAI as GoogleGenAI2 } from "@google/genai";

// src/utils/serverSentEvents.ts
function isEventStream(response) {
  return response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() === "text/event-stream";
}
async function* readServerSentEvents(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const maxSize = 512e3;
  let buffer = "";
  let name = "message";
  let lines = [];
  let size = 0;
  try {
    for (; ; ) {
      const { value, done } = await reader.read();
      const chunk = buffer + decoder.decode(value, { stream: !done });
      const pendingCr = !done && chunk.endsWith("\r");
      const linesInChunk = (pendingCr ? chunk.slice(0, -1) : chunk).split(/\r\n|\n|\r/);
      buffer = (linesInChunk.pop() ?? "") + (pendingCr ? "\r" : "");
      if (buffer.length > maxSize) throw new Error("Event stream line is too large.");
      if (done) {
        if (buffer) linesInChunk.push(buffer);
        linesInChunk.push("");
      }
      for (const line of linesInChunk) {
        if (line === "") {
          if (lines.length > 0) yield { name, data: lines.join("\n") };
          name = "message";
          lines = [];
          size = 0;
        } else if (line.startsWith("event:")) {
          name = line.slice(6).trim() || "message";
        } else if (line === "data" || line.startsWith("data:")) {
          const value2 = line.slice(5).replace(/^ /, "");
          size += value2.length + 1;
          if (size > maxSize) throw new Error("Event stream message is too large.");
          lines.push(value2);
        }
      }
      if (done) return;
    }
  } finally {
    void reader.cancel().catch(() => void 0);
    reader.releaseLock();
  }
}

// server/ai/byokProvider.ts
var BYOK_REQUIRED_MESSAGE = "Connect a valid provider key in Settings \u2192 API Keys / Codex OAuth.";
function isGoogleConnection(connection) {
  return connection.provider === "platform" || connection.provider === "google";
}
function aiRateSubject(req, uid) {
  if (uid) return `uid:${uid}`;
  const forwarded = process.env.VERCEL === "1" ? req.get("x-vercel-forwarded-for")?.split(",")[0].trim() : void 0;
  const ip = forwarded && isIP(forwarded) ? forwarded : req.ip || req.socket.remoteAddress || "unknown";
  return `ip:${createHash3("sha256").update(ip).digest("hex")}`;
}
function readPersonalAiConnection(req) {
  const provider = normalizeAiProvider(req.get(AI_HEADERS.provider));
  if (!provider || provider === "platform") return null;
  const key = normalizeHeaderSecret(req.get(AI_HEADERS.key));
  if (!key) return null;
  const account = provider === "codex_oauth" && !isOpenAiApiKey(key) ? decodeCodexJwtMetadata(key).chatgptAccountId ?? normalizeCodexAccountId(req.get(AI_HEADERS.account)) : void 0;
  const model = normalizeAiModel(provider, req.get(AI_HEADERS.model)) ?? AI_MODEL_CATALOG[provider][0];
  if (!isByokKeyFormat(provider, key, account) || model === key.toLowerCase()) return null;
  return { provider, key, model, ...account ? { chatgptAccountId: account } : {} };
}
function createDeskAiAccessResolver(deps) {
  async function resolveDeskAiAccess2(req, capability) {
    const rawProvider = req.get(AI_HEADERS.provider);
    const provider = normalizeAiProvider(rawProvider);
    const rawModel = req.get(AI_HEADERS.model);
    const authorization = req.get("Authorization");
    const byokRequired = { ok: false, status: 403, code: "BYOK_REQUIRED", error: BYOK_REQUIRED_MESSAGE };
    if (rawProvider === void 0 || provider === "platform") {
      if (req.get(AI_HEADERS.key) !== void 0) return byokRequired;
      const privilege = await deps.resolvePlatformAiPrivilege(authorization);
      if (authorization && !privilege.uid) {
        return { ok: false, status: 401, code: "AUTH_REQUIRED", error: "Sign in again to use Platform Gemini." };
      }
      if (!privilege.eligible || !privilege.uid) return byokRequired;
      const model = normalizeAiModel("platform", rawModel);
      if (rawModel !== void 0 && !model) {
        return { ok: false, status: 400, code: "INVALID_AI_MODEL", error: "Choose a valid Platform Gemini model in Settings." };
      }
      const key = deps.getPlatformKey()?.trim();
      if (!key) return { ok: false, status: 503, code: "MISSING_API_KEY", error: "Platform Gemini is unavailable. Connect your own provider key in Settings." };
      return {
        ok: true,
        connection: { provider: "platform", key, model },
        rateSubject: aiRateSubject(req, privilege.uid)
      };
    }
    const connection = readPersonalAiConnection(req);
    if (!connection) return byokRequired;
    if (capability === "voice" && connection.provider !== "google") {
      return { ...byokRequired, error: "Connect a valid Google Gemini key in Settings to use cloud voice or Live." };
    }
    if (rawModel !== void 0 && !normalizeAiModel(connection.provider, rawModel)) {
      return { ok: false, status: 400, code: "INVALID_AI_MODEL", error: "Choose a valid model ID for this provider in Settings." };
    }
    const caller = authorization ? await deps.verifyFirebaseBearerToken(authorization).catch(() => null) : null;
    const rateSubject = aiRateSubject(req, caller?.uid);
    if (connection.provider === "google") {
      return { ok: true, connection: { provider: "google", key: connection.key, model: connection.model }, rateSubject };
    }
    return { ok: true, connection: { ...connection, provider: connection.provider }, rateSubject };
  }
  return resolveDeskAiAccess2;
}
function createGoogleAiClient(key, apiVersion, fetcher) {
  return new GoogleGenAI2({
    apiKey: key,
    vertexai: false,
    httpOptions: {
      ...apiVersion ? { apiVersion } : {},
      timeout: 25e3,
      ...fetcher ? { fetch: fetcher } : {},
      headers: { "User-Agent": "aistudio-build" }
    }
  });
}
var AiUpstreamError = class extends Error {
  constructor(status) {
    super("AI provider request failed");
    this.status = status;
  }
};
function aiUpstreamStatus(error) {
  if (error instanceof AiUpstreamError) return error.status;
  const status = asRecord(error)?.status;
  if (error instanceof Error && /\b(?:API_KEY_INVALID|API key not valid)\b/i.test(error.message)) return 401;
  return typeof status === "number" ? status : void 0;
}
function isAiCredentialError(error) {
  const status = aiUpstreamStatus(error);
  return status === 401 || status === 403;
}
function assertCompleteGoogleReply(finishReason) {
  if (finishReason && finishReason !== FinishReason.STOP && finishReason !== FinishReason.FINISH_REASON_UNSPECIFIED) {
    throw new AiUpstreamError(502);
  }
}
var CODEX_ORIGINATOR = "codex_cli_rs";
var CODEX_API = "https://chatgpt.com/backend-api";
var OPENAI_API = "https://api.openai.com/v1";
var OPENROUTER_API = "https://openrouter.ai/api/v1";
function usesCodexBackend(connection) {
  return connection.provider === "codex_oauth" && !isOpenAiApiKey(connection.key);
}
function textProviderHeaders(connection) {
  const headers = { Authorization: `Bearer ${connection.key}` };
  if (usesCodexBackend(connection)) {
    headers.originator = CODEX_ORIGINATOR;
    headers["User-Agent"] = `${CODEX_ORIGINATOR}/0.1.0`;
    headers.Accept = "application/json";
    if (connection.chatgptAccountId) headers["chatgpt-account-id"] = connection.chatgptAccountId;
  }
  return headers;
}
async function verifyPersonalAiConnection(connection, fetcher = fetch) {
  const url = connection.provider === "google" ? "https://generativelanguage.googleapis.com/v1beta/models" : connection.provider === "openrouter" ? `${OPENROUTER_API}/key` : usesCodexBackend(connection) ? `${CODEX_API}/wham/usage` : `${OPENAI_API}/models`;
  const headers = connection.provider === "google" ? { "x-goog-api-key": connection.key } : textProviderHeaders(connection);
  const response = await fetcher(url, { headers, redirect: "error", signal: AbortSignal.timeout(8e3) });
  if (connection.provider === "google" && response.status === 400) {
    const error = await response.text();
    if (/API_KEY_INVALID|API key not valid/i.test(error)) return 401;
  } else {
    await response.body?.cancel();
  }
  return response.status;
}
function textFromResponse(payload, codex) {
  const value = asRecord(payload);
  if (codex) {
    if (typeof value?.output_text === "string") return value.output_text;
    const output = Array.isArray(value?.output) ? value.output : [];
    return output.map((item) => {
      const message2 = asRecord(item);
      const content = message2?.type === "message" && Array.isArray(message2.content) ? message2.content : [];
      return content.map((part) => {
        const text = asRecord(part);
        return text?.type === "output_text" && typeof text.text === "string" ? text.text : "";
      }).join("");
    }).join("");
  }
  const choices = Array.isArray(value?.choices) ? value.choices : [];
  const message = asRecord(asRecord(choices[0])?.message);
  return typeof message?.content === "string" ? message.content : "";
}
function parseProviderPayload(data) {
  try {
    const value = asRecord(JSON.parse(data));
    if (value) return value;
  } catch {
  }
  throw new AiUpstreamError(502);
}
function assertProviderSuccess(value) {
  const response = asRecord(value.response) ?? value;
  const error = asRecord(value.error) ?? asRecord(response.error);
  if (error || value.type === "error" || value.type === "response.failed" || value.type === "response.incomplete" || response.status === "failed" || response.status === "incomplete") {
    const code = error?.code ?? value.code;
    throw new AiUpstreamError(typeof code === "number" && code >= 400 && code <= 599 ? code : code === "invalid_api_key" || code === "token_expired" ? 401 : code === "rate_limit_exceeded" ? 429 : 502);
  }
  const choice = firstChoice(value);
  if (choice?.finish_reason === "error" || choice?.finish_reason === "length" || choice?.finish_reason === "content_filter") {
    throw new AiUpstreamError(502);
  }
}
function firstChoice(value) {
  return asRecord(Array.isArray(value.choices) ? value.choices[0] : void 0);
}
var MAX_PROVIDER_TEXT = 256e3;
async function readProviderStream(response, connection, onText) {
  if (!response.body) throw new AiUpstreamError(502);
  const codex = usesCodexBackend(connection);
  let model = connection.model;
  let reply = "";
  let finished = false;
  let outputItems = "";
  function append(delta) {
    reply += delta;
    if (reply.length > MAX_PROVIDER_TEXT) throw new AiUpstreamError(502);
    if (delta) onText?.(delta);
  }
  for await (const { data } of readServerSentEvents(response.body)) {
    if (data === "[DONE]") {
      if (!codex) finished = true;
      break;
    }
    const value = parseProviderPayload(data);
    assertProviderSuccess(value);
    const choice = firstChoice(value);
    const codexResponse = asRecord(value.response);
    model = normalizeAiModel(connection.provider, codex ? codexResponse?.model : value.model) ?? model;
    const delta = codex ? value.type === "response.output_text.delta" ? value.delta : void 0 : asRecord(choice?.delta)?.content;
    if (typeof delta === "string") append(delta);
    if (codex && value.type === "response.output_item.done") {
      outputItems += textFromResponse({ output: [value.item] }, true);
      if (outputItems.length > MAX_PROVIDER_TEXT) throw new AiUpstreamError(502);
    }
    if (codex && value.type === "response.completed") {
      if (!reply.trim()) append(textFromResponse(codexResponse, true) || outputItems);
      finished = true;
      break;
    }
    if (!codex && choice?.finish_reason === "stop") finished = true;
  }
  if (!finished || !reply.trim()) throw new AiUpstreamError(502);
  return { reply, model };
}
async function requestTextProvider(connection, input, signal, schema, stream, fetcher = fetch) {
  const codex = usesCodexBackend(connection);
  const openrouter = connection.provider === "openrouter";
  const url = codex ? `${CODEX_API}/codex/responses` : `${openrouter ? OPENROUTER_API : OPENAI_API}/chat/completions`;
  const history = input.history ?? [];
  const prompt = { role: "user", content: input.prompt };
  const format = schema ? { name: "risk_supervision", schema, strict: true } : void 0;
  const request = codex ? {
    model: connection.model,
    instructions: input.system,
    input: [...history, prompt].map((message) => ({
      type: "message",
      role: message.role,
      content: [{ type: message.role === "assistant" ? "output_text" : "input_text", text: message.content }]
    })),
    stream: true,
    store: false,
    ...format ? { text: { format: { type: "json_schema", ...format } } } : {}
  } : {
    model: connection.model,
    messages: [{ role: "system", content: input.system }, ...history, prompt],
    stream: Boolean(stream),
    ...openrouter ? { max_tokens: 8e3 } : { max_completion_tokens: 8e3, store: false },
    ...format ? { response_format: { type: "json_schema", json_schema: format } } : {}
  };
  const response = await fetcher(url, {
    method: "POST",
    headers: {
      ...textProviderHeaders(connection),
      "Content-Type": "application/json",
      Accept: codex || stream ? "text/event-stream, application/json" : "application/json"
    },
    body: JSON.stringify(request),
    redirect: "error",
    signal
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new AiUpstreamError(response.status);
  }
  if (isEventStream(response)) return readProviderStream(response, connection, stream?.onText);
  const value = parseProviderPayload(await response.text());
  assertProviderSuccess(value);
  const reply = textFromResponse(value, codex);
  if (!reply.trim() || reply.length > MAX_PROVIDER_TEXT) throw new AiUpstreamError(502);
  stream?.onText(reply);
  return { reply, model: normalizeAiModel(connection.provider, value.model) ?? connection.model };
}
async function streamOrGenerateCoachReply(connection, input, options) {
  if (!isGoogleConnection(connection)) {
    const result = await requestTextProvider(connection, input, options.signal, void 0, options.stream, options.fetcher);
    return { ...result, sources: [] };
  }
  const model = connection.model ?? AI_MODEL_CATALOG.google[0];
  const ai = createGoogleAiClient(connection.key, void 0, options.fetcher);
  const isGemma = isOpenWeightGemmaModel(model);
  const allowPdf = modelSupportsPdf(model);
  const shouldSearch = Boolean(input.webSearch) && modelSupportsGoogleSearch(model);
  const filteredAttachments = (input.attachments ?? []).filter((att) => allowPdf || att.mimeType !== "application/pdf");
  const historyContents = (input.history ?? []).map((item) => ({
    role: item.role === "assistant" ? "model" : "user",
    parts: [{ text: item.content }]
  }));
  const userTurn = {
    role: "user",
    parts: [{ text: input.prompt }, ...filteredAttachments.map((inlineData) => ({ inlineData }))]
  };
  const contents = isGemma ? [
    { role: "user", parts: [{ text: `[System Directives \u2014 Strictly Follow]
${input.system}` }] },
    { role: "model", parts: [{ text: "Understood. I will strictly follow these directives and risk-only Safe Harbor rules." }] },
    ...historyContents,
    userTurn
  ] : [...historyContents, userTurn];
  const request = {
    model,
    contents,
    config: {
      ...isGemma ? {} : { systemInstruction: input.system },
      abortSignal: options.signal,
      ...shouldSearch ? { tools: [{ googleSearch: {} }] } : {}
    }
  };
  const sourceMap = /* @__PURE__ */ new Map();
  function collectSources(chunks = []) {
    for (const { web } of chunks) {
      if (web?.uri && /^https?:\/\//i.test(web.uri)) sourceMap.set(web.uri, { title: web.title || web.uri, uri: web.uri });
    }
  }
  let reply = "";
  if (options.stream) {
    const response = await ai.models.generateContentStream(request);
    for await (const chunk of response) {
      assertCompleteGoogleReply(chunk.candidates?.[0]?.finishReason);
      const text = chunk.text ?? "";
      reply += text;
      if (reply.length > MAX_PROVIDER_TEXT) throw new AiUpstreamError(502);
      if (text) options.stream.onText(text);
      collectSources(chunk.candidates?.[0]?.groundingMetadata?.groundingChunks);
    }
  } else {
    const response = await ai.models.generateContent(request);
    assertCompleteGoogleReply(response.candidates?.[0]?.finishReason);
    reply = response.text ?? "";
    collectSources(response.candidates?.[0]?.groundingMetadata?.groundingChunks);
  }
  if (!reply.trim() || reply.length > MAX_PROVIDER_TEXT) throw new AiUpstreamError(502);
  return { reply, model, sources: [...sourceMap.values()] };
}
async function generateStructuredRiskSupervision(connection, input, signal) {
  if (!isGoogleConnection(connection)) {
    const structuredInput = {
      ...input,
      system: `${input.system}
Return one JSON object matching this schema:
${JSON.stringify(input.schema)}`
    };
    try {
      return await requestTextProvider(connection, structuredInput, signal, input.schema);
    } catch (error) {
      if (![400, 422].includes(aiUpstreamStatus(error) ?? 0)) throw error;
      return requestTextProvider(connection, structuredInput, signal);
    }
  }
  const ai = createGoogleAiClient(connection.key);
  const generate = async (model) => {
    if (isOpenWeightGemmaModel(model)) {
      const gemmaPrompt = `[System Directives \u2014 Strictly Follow]
${input.system}
Return one valid JSON object matching this schema (no markdown fences):
${JSON.stringify(input.schema)}

${input.prompt}`;
      return (await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: gemmaPrompt }] }],
        config: {
          maxOutputTokens: 3e3,
          abortSignal: signal
        }
      })).text ?? "";
    }
    return (await ai.models.generateContent({
      model,
      contents: input.prompt,
      config: {
        systemInstruction: input.system,
        responseMimeType: "application/json",
        responseJsonSchema: input.schema,
        maxOutputTokens: 3e3,
        abortSignal: signal
      }
    })).text ?? "";
  };
  if (connection.provider === "google") {
    const model = connection.model ?? AI_MODEL_CATALOG.google[0];
    return { model, reply: await generate(model) };
  }
  const plan = await planModelRoute({ prompt: input.prompt, hasRichContext: true, preference: connection.model });
  return executeWithModelFailover({
    ...plan,
    candidateModels: plan.candidateModels.filter((model) => !isOpenWeightGemmaModel(model))
  }, generate);
}

// server/ai/riskSupervise.ts
function parseModelJson(response) {
  try {
    const text = response.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, "$1");
    return JSON.parse(text);
  } catch {
    return null;
  }
}
function createRiskSuperviseRouter(deps) {
  const router = express2.Router();
  router.post("/ai/risk-supervise", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const request = parseRiskSuperviseRequest(req.body);
    if (!request) {
      res.status(400).json({ ok: false, code: "INVALID_MARKET_SNAPSHOT", error: "Provide a supported symbol and timeframe with valid OHLC candles." });
      return;
    }
    const { symbol, timeframe, candles, portfolio, lang } = request;
    const snapshot = computeQuantSupervisionSnapshot(symbol, timeframe, candles, portfolio);
    const deterministic = buildDeterministicSupervisionReport(snapshot, lang, (/* @__PURE__ */ new Date()).toISOString());
    function sendFallback(reason, status = 200, error) {
      if (res.destroyed) return;
      const report = { ...deterministic, fallbackReason: reason };
      const payload = { fallbackUsed: true, fallbackReason: reason };
      if (status === 403) {
        res.status(status).json({ ok: false, code: reason, error, ...payload, deterministicReport: report });
      } else {
        res.status(status).json({ ok: status === 200, ...status !== 200 ? { code: reason, error } : {}, ...payload, report });
      }
    }
    const disconnected = new AbortController();
    const onClose = () => disconnected.abort();
    res.once("close", onClose);
    let connection;
    try {
      const access = await deps.resolveDeskAiAccess(req, "text");
      if (!access.ok) {
        if (access.code === "MISSING_API_KEY") sendFallback("GEMINI_API_KEY_MISSING");
        else sendFallback(access.code, access.status, access.error);
        return;
      }
      connection = access.connection;
      const provider = isGoogleConnection(connection) ? "gemini" : connection.provider;
      const rate = await deps.checkDistributedRateLimit(`risk-supervise:${access.rateSubject}`);
      if (!rate.allowed) {
        res.set("Retry-After", String(rate.retryAfterSec));
        sendFallback("RATE_LIMITED", 429);
        return;
      }
      const result = await generateStructuredRiskSupervision(connection, {
        prompt: JSON.stringify({
          task: "Select the most relevant approved analysis and review checklist for this observed market and account context.",
          language: lang === "th" ? "Thai" : "English",
          candleCount: snapshot.candleCount,
          observedMarket: deterministic.deskBrief,
          indicators: deterministic.quantitativeInsight,
          feedVolume: snapshot.hasVolumeData,
          support: deterministic.structuralSupportZones,
          resistance: deterministic.structuralResistanceZones,
          accountRisk: deterministic.portfolioRiskAudit
        }),
        system: "Analytical & Risk Supervision Only. Describe observed market structure, data quality, and measured risk. Use only wording allowed by the schema. Include distinct checklist items and each reported structural band. Keep all content educational and descriptive.",
        schema: buildRiskSupervisionResponseSchema(deterministic)
      }, AbortSignal.any([disconnected.signal, AbortSignal.timeout(28e3)]));
      const report = sanitizeAiRiskSupervisionReport(parseModelJson(result.reply), deterministic, result.model, provider);
      if (!report) {
        sendFallback(provider === "gemini" ? "GEMINI_REPORT_INVALID" : "AI_REPORT_INVALID");
        return;
      }
      if (!res.destroyed) res.json({ ok: true, fallbackUsed: false, report });
    } catch (error) {
      if (connection && connection.provider !== "platform" && isAiCredentialError(error)) {
        sendFallback("BYOK_REQUIRED", 403, BYOK_REQUIRED_MESSAGE);
      } else {
        sendFallback(connection && isGoogleConnection(connection) ? "GEMINI_UNAVAILABLE" : "AI_PROVIDER_UNAVAILABLE");
      }
    } finally {
      res.off("close", onClose);
    }
  });
  return router;
}

// server/ai/byokRouter.ts
import { createHash as createHash4, randomBytes as randomBytes4, timingSafeEqual as timingSafeEqual3 } from "node:crypto";
import express3 from "express";
var CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
var AUTH_ORIGIN = "https://auth.openai.com";
var OAUTH_WINDOW_MS = 10 * 6e4;
function digest(value) {
  return createHash4("sha256").update(value).digest("base64url");
}
function oauthState(verifier, expiresAt, clientId, redirectUri) {
  return `${expiresAt}.${digest(JSON.stringify(["codex-state", verifier, expiresAt, clientId, redirectUri]))}`;
}
function resolveRedirectUri(value) {
  try {
    const url = new URL(value);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback) || url.username || url.password || url.hash || url.search) return null;
    return value;
  } catch {
    return null;
  }
}
function createByokRouter(deps) {
  const router = express3.Router();
  const fetcher = deps.fetcher ?? fetch;
  const clientId = deps.env?.OPENAI_CODEX_OAUTH_CLIENT_ID?.trim() || CODEX_CLIENT_ID;
  const redirectUri = resolveRedirectUri(deps.env?.OPENAI_CODEX_OAUTH_REDIRECT_URI?.trim() || CODEX_CALLBACK_URI);
  const limited = (name, maxRequests, handler) => async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    try {
      const rate = await deps.checkDistributedRateLimit(`${name}:${aiRateSubject(req)}`, maxRequests);
      if (!rate.allowed) {
        res.set("Retry-After", String(rate.retryAfterSec));
        res.status(429).json({ ok: false, code: "RATE_LIMITED", error: "Too many requests. Try again later." });
        return;
      }
      await handler(req, res, next);
    } catch {
      if (!res.headersSent) res.status(502).json({ ok: false, code: "PROVIDER_UNAVAILABLE", error: "The provider is temporarily unavailable." });
    }
  };
  router.get("/ai/provider-status", limited("ai-status", 180, async (req, res) => {
    const privilege = await deps.resolvePlatformAiPrivilege(req.get("Authorization"));
    res.json({
      platformEligible: privilege.eligible,
      role: privilege.role,
      platformConfigured: privilege.eligible && deps.isPlatformConfigured(),
      defaults: {
        platform: {
          chat: "auto",
          decision: GEMINI_DECISION_MODEL,
          fast: GEMINI_FLASH_LITE_31,
          risk: GEMINI_FLASH_LITE_35,
          live: GEMINI_38_LIVE
        },
        google: AI_MODEL_CATALOG.google[0],
        openrouter: AI_MODEL_CATALOG.openrouter[0],
        codex_oauth: AI_MODEL_CATALOG.codex_oauth[0]
      }
    });
  }));
  router.post("/ai/codex-oauth/start", limited("codex-start", 20, (_req, res) => {
    if (!redirectUri) {
      res.status(503).json({ ok: false, code: "OAUTH_CONFIGURATION", error: "The Codex redirect URI is unavailable." });
      return;
    }
    const verifier = randomBytes4(32).toString("base64url");
    const expiresAt = Date.now() + OAUTH_WINDOW_MS;
    const state = oauthState(verifier, expiresAt, clientId, redirectUri);
    const query = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: "openid profile email offline_access",
      code_challenge: digest(verifier),
      code_challenge_method: "S256",
      state,
      id_token_add_organizations: "true",
      codex_cli_simplified_flow: "true",
      originator: CODEX_ORIGINATOR
    });
    res.json({ ok: true, authorizationUrl: `${AUTH_ORIGIN}/oauth/authorize?${query}`, verifier, state, redirectUri, expiresAt });
  }));
  async function tokenRequest(params, previous) {
    const response = await fetcher(`${AUTH_ORIGIN}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": previous ? "application/json" : "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": `${CODEX_ORIGINATOR}/0.1.0`
      },
      body: previous ? JSON.stringify(params) : new URLSearchParams(params).toString(),
      redirect: "error",
      signal: AbortSignal.timeout(12e3)
    });
    if (!response.ok) {
      let detail;
      try {
        const errPayload = asRecord(await response.json());
        const rawErr = typeof errPayload?.error === "string" ? errPayload.error : typeof asRecord(errPayload?.error)?.code === "string" ? String(asRecord(errPayload?.error)?.code) : void 0;
        if (rawErr && /^[a-zA-Z0-9._-]{1,64}$/.test(rawErr)) detail = rawErr;
      } catch {
      }
      return { status: response.status, detail };
    }
    const data = asRecord(await response.json());
    const seconds = Number(data?.expires_in);
    const credential = readCodexOauthCredential({
      ...data,
      account_id: data?.account_id ?? previous?.accountId,
      refresh_token: normalizeHeaderSecret(data?.refresh_token) ?? previous?.token,
      expiresAt: Number.isFinite(seconds) && seconds > 0 && seconds <= 31536e3 ? Date.now() + seconds * 1e3 : void 0
    });
    return { status: response.status, credential, detail: credential ? void 0 : "invalid_token_payload" };
  }
  router.post("/ai/codex-oauth/exchange", limited("codex-exchange", 25, async (req, res) => {
    const code = normalizeHeaderSecret(req.get(AI_HEADERS.oauthCode), 2048);
    const verifier = req.get(AI_HEADERS.oauthVerifier);
    const state = req.get(AI_HEADERS.oauthState);
    const timestamp = state?.match(/^(\d{13})\.[a-zA-Z0-9_-]{43}$/)?.[1];
    const expiry = Number(timestamp);
    const now = Date.now();
    const CLOCK_SKEW_MS = 6e4;
    if (!redirectUri || !code || !verifier || !/^[a-zA-Z0-9_-]{43}$/.test(verifier) || !state || !timestamp || expiry <= now || expiry > now + OAUTH_WINDOW_MS + CLOCK_SKEW_MS || !timingSafeEqual3(Buffer.from(state), Buffer.from(oauthState(verifier, expiry, clientId, redirectUri)))) {
      res.status(400).json({ ok: false, code: "INVALID_OAUTH_CALLBACK", error: "Start a new Codex sign-in and paste its callback or code." });
      return;
    }
    const result = await tokenRequest({
      client_id: clientId,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
      code_verifier: verifier
    });
    if (!result.credential) {
      res.status(result.status === 429 ? 429 : result.status >= 400 && result.status < 500 ? 400 : 502).json({
        ok: false,
        code: "OAUTH_EXCHANGE_FAILED",
        detail: result.detail ?? `http_${result.status}`,
        error: "Codex could not exchange this code. Start a new sign-in or import ~/.codex/auth.json."
      });
      return;
    }
    res.json({ ok: true, credential: result.credential });
  }));
  router.post("/ai/codex-oauth/refresh", limited("codex-refresh", 60, async (req, res) => {
    const refreshToken = normalizeHeaderSecret(req.get(AI_HEADERS.key));
    if (!refreshToken) {
      res.status(400).json({ ok: false, code: "INVALID_REFRESH_TOKEN", error: "Reconnect your Codex account." });
      return;
    }
    const result = await tokenRequest({ client_id: clientId, grant_type: "refresh_token", refresh_token: refreshToken }, {
      token: refreshToken,
      accountId: normalizeCodexAccountId(req.get(AI_HEADERS.account))
    });
    if (!result.credential) {
      const rejected = [400, 401, 403].includes(result.status);
      res.status(rejected ? 403 : result.status === 429 ? 429 : 502).json({
        ok: false,
        code: rejected ? "BYOK_REQUIRED" : result.status === 429 ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE",
        error: rejected ? "Reconnect your Codex account." : "Codex is temporarily unavailable."
      });
      return;
    }
    res.json({ ok: true, credential: result.credential });
  }));
  router.post("/ai/byok/verify", limited("byok-verify", 40, async (req, res) => {
    const connection = readPersonalAiConnection(req);
    const dataKey = buildDatabentoRequestHeaders(req.get(AI_HEADERS.databento))[AI_HEADERS.databento];
    const checkDatabento = req.get(AI_HEADERS.databento) !== void 0;
    if (checkDatabento ? !dataKey || req.get(AI_HEADERS.provider) !== void 0 : !connection) {
      res.status(400).json({ ok: false, code: "INVALID_CREDENTIAL", error: "Enter a valid credential for one provider." });
      return;
    }
    let status;
    if (checkDatabento) {
      const response = await fetcher("https://hist.databento.com/v0/metadata.list_datasets", {
        headers: { Authorization: `Basic ${Buffer.from(`${dataKey}:`).toString("base64")}` },
        signal: AbortSignal.timeout(8e3),
        redirect: "error"
      });
      status = response.status;
      await response.body?.cancel();
    } else if (connection) {
      status = await verifyPersonalAiConnection(connection, fetcher);
    } else {
      return;
    }
    if (status < 200 || status >= 300) {
      const rejected = [400, 401, 403].includes(status);
      res.status(rejected ? 403 : status === 429 ? 429 : 502).json({
        ok: false,
        code: rejected ? "INVALID_CREDENTIAL" : status === 429 ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE",
        error: rejected ? "The provider rejected this credential." : "The provider could not verify this credential right now."
      });
      return;
    }
    res.json({ ok: true, provider: checkDatabento ? "databento" : connection?.provider });
  }));
  return router;
}

// server/market/comexBridge.ts
import { Router as Router2 } from "express";

// src/utils/comexBridgeEngine.ts
import Decimal3 from "decimal.js";
var COMEX_TIMEFRAMES = ["5m", "15m", "1h", "4h", "1d"];
function computeSmoothedBasis(gcPrices, xauPrices, alpha = 0.25) {
  const weight = new Decimal3(Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 0.25);
  const size = Math.min(gcPrices.length, xauPrices.length);
  let raw = new Decimal3(0);
  let ema2 = raw;
  let spot = raw;
  let basisSampleCount = 0;
  for (let i = 0; i < size; i++) {
    const gc = gcPrices[gcPrices.length - size + i];
    const xau = xauPrices[xauPrices.length - size + i];
    if (!Number.isFinite(gc) || !Number.isFinite(xau) || gc <= 0 || xau <= 0) continue;
    spot = new Decimal3(xau);
    raw = new Decimal3(gc).minus(spot);
    ema2 = basisSampleCount === 0 ? raw : ema2.plus(raw.minus(ema2).times(weight));
    basisSampleCount++;
  }
  return {
    rawBasis: raw.toNumber(),
    smoothedBasis: ema2.toNumber(),
    basisPct: spot.isZero() ? 0 : raw.div(spot).times(100).toNumber(),
    basisSampleCount
  };
}
function computeVolumeProfile(candles, { bins = 24, valueAreaPct = 0.7, basisOffset = 0 } = {}) {
  const offset = new Decimal3(Number.isFinite(basisOffset) ? basisOffset : 0);
  const valid = candles.filter(({ low, high }) => Number.isFinite(low) && Number.isFinite(high) && high >= low);
  let min = Infinity;
  let max = -Infinity;
  for (const candle of valid) {
    min = Math.min(min, candle.low);
    max = Math.max(max, candle.high);
  }
  const count = !valid.length ? 0 : min === max ? 1 : Math.max(1, Math.min(48, Number.isFinite(bins) ? Math.trunc(bins) : 24));
  const bottom = new Decimal3(count ? min : 0);
  const top = new Decimal3(count ? max : 0);
  const width = count ? top.minus(bottom).div(count) : new Decimal3(0);
  const edges = Array.from({ length: count + 1 }, (_, index) => index === count ? top : bottom.plus(width.times(index)));
  const upperEdges = edges.slice(1);
  const volumes = Array.from({ length: count }, () => new Decimal3(0));
  let total = new Decimal3(0);
  for (const candle of valid) {
    const volume = candle.volume ?? 0;
    if (!Number.isFinite(volume) || volume <= 0) continue;
    const amount = new Decimal3(volume);
    total = total.plus(amount);
    if (width.isZero()) {
      volumes[0] = volumes[0].plus(amount);
      continue;
    }
    const low = new Decimal3(candle.low);
    const high = new Decimal3(candle.high);
    const first = low.eq(top) ? count - 1 : upperEdges.findIndex((edge) => edge.gt(low));
    if (low.eq(high)) {
      volumes[first] = volumes[first].plus(amount);
      continue;
    }
    const last = upperEdges.findIndex((edge) => edge.gte(high));
    const range = high.minus(low);
    let allocated = new Decimal3(0);
    for (let index = first; index <= last; index++) {
      const cumulative = index === last ? amount : upperEdges[index].minus(low).div(range).times(amount);
      volumes[index] = volumes[index].plus(cumulative.minus(allocated));
      allocated = cumulative;
    }
  }
  let poc = -1;
  let lower = -1;
  let upper = -1;
  const hvn = /* @__PURE__ */ new Set();
  if (total.gt(0)) {
    poc = volumes.reduce((best, volume, index) => volume.gt(volumes[best]) ? index : best, 0);
    lower = upper = poc;
    let cumulative = volumes[poc];
    const fraction = Number.isFinite(valueAreaPct) ? Math.max(0, Math.min(1, valueAreaPct)) : 0.7;
    const target = total.times(fraction);
    while (cumulative.lt(target) && (lower > 0 || upper < count - 1)) {
      if (upper === count - 1 || lower > 0 && volumes[lower - 1].gte(volumes[upper + 1])) {
        cumulative = cumulative.plus(volumes[--lower]);
      } else {
        cumulative = cumulative.plus(volumes[++upper]);
      }
    }
    const peaks = volumes.map((volume, index) => ({ volume, index })).filter(({ volume, index }) => index !== poc && volume.gt(volumes[index - 1] ?? 0) && volume.gte(volumes[index + 1] ?? 0)).sort((a, b) => b.volume.cmp(a.volume) || a.index - b.index);
    for (const { index } of peaks.slice(0, 3)) hvn.add(index);
  }
  const profileBins = volumes.map((volume, index) => {
    const priceLow = edges[index];
    const priceHigh = edges[index + 1];
    const mid = priceLow.plus(priceHigh).div(2);
    return {
      priceLow: priceLow.toNumber(),
      priceHigh: priceHigh.toNumber(),
      midPrice: mid.toNumber(),
      mappedXauPrice: mid.minus(offset).toNumber(),
      volume: volume.toNumber(),
      volumePct: total.isZero() ? 0 : volume.div(total).times(100).toNumber(),
      isPoc: index === poc,
      isInValueArea: index >= lower && index <= upper,
      isHvn: hvn.has(index)
    };
  });
  return {
    bins: profileBins,
    pocGc: profileBins[poc]?.midPrice ?? null,
    vahGc: upper < 0 ? null : edges[upper + 1].toNumber(),
    valGc: lower < 0 ? null : edges[lower].toNumber(),
    pocXau: profileBins[poc]?.mappedXauPrice ?? null,
    vahXau: upper < 0 ? null : edges[upper + 1].minus(offset).toNumber(),
    valXau: lower < 0 ? null : edges[lower].minus(offset).toNumber(),
    hvnZones: Array.from(hvn, (index) => profileBins[index]),
    totalVolume: total.toNumber(),
    hasVolumeData: total.gt(0)
  };
}
function buildComexBridgeSnapshot(input) {
  const basis = computeSmoothedBasis(input.gcPrices, input.xauPrices);
  const lastBar = new Date(input.candles.at(-1)?.ts ?? NaN);
  const gcPrice = input.gcPrices.at(-1);
  const xauSpotPrice = input.xauPrices.at(-1);
  const data = {
    ...basis,
    timeframe: input.timeframe,
    fetchedAt: input.fetchedAt,
    gcCandleAt: Number.isFinite(lastBar.getTime()) ? lastBar.toISOString() : null,
    gcPrice: gcPrice !== void 0 && Number.isFinite(gcPrice) && gcPrice > 0 ? gcPrice : null,
    xauSpotPrice: xauSpotPrice !== void 0 && Number.isFinite(xauSpotPrice) && xauSpotPrice > 0 ? xauSpotPrice : null,
    profile: computeVolumeProfile(input.candles, { bins: input.bins, basisOffset: basis.smoothedBasis }),
    dataSource: input.dataSource,
    databentoUsed: input.databentoUsed,
    databentoStatus: input.databentoStatus ?? (input.databentoUsed ? "used" : "public"),
    databentoNote: input.databentoNote ?? null
  };
  return {
    ...data,
    exports: {
      mql5: generateMql5ReadOnlyIndicator(data),
      json: generateBridgeJsonExport(data),
      pineScript: generatePineScriptV5Indicator(data),
      python: generatePythonDatabentoScript(data)
    }
  };
}
function mappedLevels(profile) {
  const levels = [
    { name: "POC", price: profile.pocXau },
    { name: "VAH", price: profile.vahXau },
    { name: "VAL", price: profile.valXau },
    ...profile.hvnZones.map((zone, index) => ({ name: `HVN ${index + 1}`, price: zone.mappedXauPrice }))
  ];
  return levels.flatMap(({ name, price }) => price !== null && Number.isFinite(price) ? [{ name, price: new Decimal3(price).toDecimalPlaces(8).toFixed() }] : []);
}
function generateMql5ReadOnlyIndicator(snapshot) {
  const lines = mappedLevels(snapshot.profile).map(({ name, price }) => `   if (!AddLevel("${name}", ${price})) return(INIT_FAILED);`).join("\n");
  return `// TallyNX COMEX-to-Spot snapshot. Read-only analytical levels for XAUUSD.
#property indicator_chart_window
#property indicator_plots 0

string prefix;

bool AddLevel(const string label, const double price)
{
   string name = prefix + label;
   if (!ObjectCreate(0, name, OBJ_HLINE, 0, 0, price)) return(false);
   ObjectSetString(0, name, OBJPROP_TEXT, label);
   ObjectSetInteger(0, name, OBJPROP_COLOR, label == "POC" ? clrGold : clrSteelBlue);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   return(true);
}

int OnInit()
{
   if (StringFind(_Symbol, "XAUUSD") < 0) return(INIT_FAILED);
   prefix = "TallyNX_COMEX_" + IntegerToString(GetMicrosecondCount()) + "_";
${lines ? lines + "\n" : ""}   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   if (prefix != "") ObjectsDeleteAll(0, prefix, 0, OBJ_HLINE);
}

int OnCalculate(const int rates_total, const int prev_calculated,
                const int begin, const double &price[])
{
   return(rates_total);
}
`;
}
function generateBridgeJsonExport(snapshot) {
  const {
    timeframe,
    fetchedAt,
    gcCandleAt,
    gcPrice,
    xauSpotPrice,
    rawBasis,
    smoothedBasis,
    basisPct,
    basisSampleCount,
    profile,
    dataSource,
    databentoUsed,
    databentoStatus,
    databentoNote
  } = snapshot;
  return JSON.stringify({
    readOnly: true,
    kind: "comex-to-spot-analytical-levels",
    sourceInstrument: "COMEX GC",
    mappedInstrument: "XAU/USD",
    timeframe,
    fetchedAt,
    gcCandleAt,
    gcPrice,
    xauSpotPrice,
    rawBasis,
    smoothedBasis,
    basisPct,
    basisSampleCount,
    profile,
    dataSource,
    databentoUsed,
    databentoStatus,
    databentoNote
  }, null, 2);
}
function generatePineScriptV5Indicator(snapshot) {
  const lines = mappedLevels(snapshot.profile).map(({ name, price }) => `hline(${price}, title="${name}", color=color.${name === "POC" ? "orange" : "blue"})`);
  return `//@version=5
indicator("TallyNX COMEX-to-Spot \xB7 Read-only", overlay=true)
// Static analytical levels mapped to XAUUSD at the time of the snapshot.
if not str.contains(str.upper(syminfo.ticker), "XAUUSD")
    runtime.error("Use an XAUUSD chart")
${lines.length ? lines.join("\n") : 'plot(float(na), title="No volume data")'}
`;
}
function generatePythonDatabentoScript(snapshot) {
  return `# Read-only Databento GC bars mapped using the fixed snapshot basis.
# Run without arguments for historical bars, or with --live for streaming bars.
import argparse
import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import databento as db

DATASET = "GLBX.MDP3"
SYMBOL = "GC.c.0"
SCHEMA = "ohlcv-1m"
BASIS = Decimal("${new Decimal3(snapshot.smoothedBasis).toFixed()}")


def show_bar(record):
    if isinstance(record, db.OHLCVMsg):
        gc_close = Decimal(record.close).scaleb(-9)
        print(record.ts_event, gc_close, gc_close - BASIS, record.volume)


def main():
    parser = argparse.ArgumentParser(description="Read-only GC-to-XAU analytical mapping")
    parser.add_argument("--live", action="store_true")
    args = parser.parse_args()
    key = os.environ["DATABENTO_API_KEY"]
    print("timestamp_ns gc_close mapped_xau_close volume", flush=True)

    if args.live:
        live = db.Live(key=key)
        live.subscribe(dataset=DATASET, symbols=[SYMBOL], stype_in="continuous", schema=SCHEMA)
        live.add_callback(show_bar)
        live.start()
        try:
            live.block_for_close()
        except KeyboardInterrupt:
            live.stop()
        return

    historical = db.Historical(key=key)
    available = historical.metadata.get_dataset_range(dataset=DATASET)
    end = datetime.fromisoformat(available["schema"][SCHEMA]["end"].replace("Z", "+00:00"))
    end = min(end, datetime.now(timezone.utc))
    bars = historical.timeseries.get_range(
        dataset=DATASET, symbols=[SYMBOL], stype_in="continuous", schema=SCHEMA,
        start=end - timedelta(days=1), end=end,
    )
    bars.replay(callback=show_bar)


if __name__ == "__main__":
    main()
`;
}

// server/market/comexBridge.ts
var MINUTE = 6e4;
var HOUR = 60 * MINUTE;
var DAY = 24 * HOUR;
var PUBLIC_TTL = 15e3;
var DATABENTO_BASE = "https://hist.databento.com/v0/";
var DATASET = "GLBX.MDP3";
var TIMEFRAME_CONFIG = {
  "5m": { interval: "5m", range: "5d", ms: 5 * MINUTE, schema: "ohlcv-1m", sourceMs: MINUTE, days: 5 },
  "15m": { interval: "15m", range: "5d", ms: 15 * MINUTE, schema: "ohlcv-1m", sourceMs: MINUTE, days: 7 },
  "1h": { interval: "60m", range: "1mo", ms: HOUR, schema: "ohlcv-1h", sourceMs: HOUR, days: 30 },
  "4h": { interval: "60m", range: "3mo", ms: 4 * HOUR, schema: "ohlcv-1h", sourceMs: HOUR, days: 90 },
  "1d": { interval: "1d", range: "6mo", ms: DAY, schema: "ohlcv-1d", sourceMs: DAY, days: 180 }
};
var DATABENTO_NOTES = {
  public: null,
  used: "GC bars are from your Databento historical feed. The spot quote is fetched separately.",
  "invalid-key": "The Databento key format is invalid. Using public Yahoo Finance GC=F bars.",
  "access-denied": "Databento denied access to GC history. Using public Yahoo Finance GC=F bars.",
  empty: "Databento returned no usable GC bars. Using public Yahoo Finance GC=F bars.",
  timeout: "The Databento request timed out. Using public Yahoo Finance GC=F bars.",
  unavailable: "Databento is currently unavailable. Using public Yahoo Finance GC=F bars."
};
function createPublicCache(load) {
  const entries = /* @__PURE__ */ new Map();
  const pending = /* @__PURE__ */ new Map();
  return (key) => {
    const entry = entries.get(key);
    if (entry && Date.now() < entry.expires) return Promise.resolve(entry.value);
    const inFlight = pending.get(key);
    if (inFlight) return inFlight;
    const request = load(key).then((value) => {
      if (value !== null) entries.set(key, { value, expires: Date.now() + PUBLIC_TTL });
      return value;
    }).finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  };
}
function positiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function makeCandle(ts, open, high, low, close, volume) {
  if (!positiveNumber(ts) || ts > 864e13 || !positiveNumber(open) || !positiveNumber(high) || !positiveNumber(low) || !positiveNumber(close) || low > Math.min(open, close) || high < Math.max(open, close)) {
    return null;
  }
  return {
    ts,
    timeLabel: new Date(ts).toISOString(),
    open,
    high,
    low,
    close,
    volume: positiveNumber(volume) ? volume : 0
  };
}
function bucketStart(ts, ms) {
  return Math.floor(ts / ms) * ms;
}
function aggregateBars(candles, ms) {
  const buckets = /* @__PURE__ */ new Map();
  for (const candle of candles) {
    const ts = bucketStart(candle.ts, ms);
    const prior = buckets.get(ts);
    if (!prior) {
      buckets.set(ts, { ...candle, ts, timeLabel: new Date(ts).toISOString() });
      continue;
    }
    prior.high = Math.max(prior.high, candle.high);
    prior.low = Math.min(prior.low, candle.low);
    prior.close = candle.close;
    prior.volume = (prior.volume ?? 0) + (candle.volume ?? 0);
  }
  return [...buckets.values()];
}
function array(value) {
  return Array.isArray(value) ? value : [];
}
async function loadYahooBars(symbol, timeframe) {
  try {
    const { interval, range, ms } = TIMEFRAME_CONFIG[timeframe];
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
    url.search = new URLSearchParams({ interval, range }).toString();
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (TallyNXDesk/3.2)" },
      signal: AbortSignal.timeout(symbol === "GC=F" ? 7e3 : 4e3)
    });
    if (!response.ok) return null;
    const payload = asRecord(await response.json());
    const result = asRecord(array(asRecord(payload?.chart)?.result)[0]);
    const quote = asRecord(array(asRecord(result?.indicators)?.quote)[0]);
    const timestamps = array(result?.timestamp);
    const open = array(quote?.open);
    const high = array(quote?.high);
    const low = array(quote?.low);
    const close = array(quote?.close);
    const volume = array(quote?.volume);
    const candles = [];
    timestamps.forEach((timestamp, index) => {
      if (!positiveNumber(timestamp)) return;
      const candle = makeCandle(timestamp * 1e3, open[index], high[index], low[index], close[index], volume[index]);
      if (candle) candles.push(candle);
    });
    if (!candles.length) return null;
    candles.sort((a, b) => a.ts - b.ts);
    return timeframe === "4h" ? aggregateBars(candles, ms) : candles;
  } catch {
    return null;
  }
}
function upstreamStatus(status) {
  return [401, 402, 403].includes(status) ? "access-denied" : "unavailable";
}
function decimalField(value) {
  if (typeof value === "number") return value;
  return typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
}
async function loadDatabentoBars(key, timeframe) {
  const signal = AbortSignal.timeout(5e3);
  const headers = { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` };
  const { schema, sourceMs, days, ms } = TIMEFRAME_CONFIG[timeframe];
  try {
    const metadata = await fetch(`${DATABENTO_BASE}metadata.get_dataset_range?dataset=${DATASET}`, {
      headers,
      signal,
      cache: "no-store",
      redirect: "error"
    });
    if (!metadata.ok) {
      await metadata.body?.cancel();
      return { status: upstreamStatus(metadata.status), candles: null };
    }
    const range = asRecord(await metadata.json());
    const schemaRange = asRecord(asRecord(range?.schema)?.[schema]);
    const availableFrom = schemaRange?.start ?? range?.start;
    const availableTo = schemaRange?.end ?? range?.end;
    if (typeof availableFrom !== "string" || typeof availableTo !== "string") return { status: "empty", candles: null };
    const end = bucketStart(Math.min(Date.parse(availableTo), Date.now()), sourceMs);
    const start = Math.max(Date.parse(availableFrom), end - days * DAY);
    if (!Number.isFinite(start) || !(start < end)) return { status: "empty", candles: null };
    const response = await fetch(`${DATABENTO_BASE}timeseries.get_range`, {
      method: "POST",
      headers,
      body: new URLSearchParams({
        dataset: DATASET,
        symbols: "GC.c.0",
        stype_in: "continuous",
        schema,
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        encoding: "json",
        compression: "none",
        pretty_px: "true",
        pretty_ts: "true"
      }),
      signal,
      cache: "no-store",
      redirect: "error"
    });
    if (!response.ok) {
      await response.body?.cancel();
      return { status: upstreamStatus(response.status), candles: null };
    }
    const candles = [];
    for (const line of (await response.text()).split("\n")) {
      if (!line.trim()) continue;
      const row = asRecord(JSON.parse(line));
      const timestamp = asRecord(row?.hd)?.ts_event;
      const ts = typeof timestamp === "string" ? Date.parse(timestamp) : NaN;
      if (!(ts >= start && ts < end)) continue;
      const candle = makeCandle(
        ts,
        decimalField(row?.open),
        decimalField(row?.high),
        decimalField(row?.low),
        decimalField(row?.close),
        decimalField(row?.volume)
      );
      if (candle) candles.push(candle);
    }
    if (!candles.length) return { status: "empty", candles: null };
    candles.sort((a, b) => a.ts - b.ts);
    return { status: "used", candles: sourceMs === ms ? candles : aggregateBars(candles, ms) };
  } catch {
    return { status: signal.aborted ? "timeout" : "unavailable", candles: null };
  }
}
function createComexBridgeRouter({ fetchLiveSpotQuote }) {
  const router = Router2();
  const getPublicGc = createPublicCache((timeframe) => loadYahooBars("GC=F", timeframe));
  const getSpotHistory = createPublicCache((timeframe) => loadYahooBars("XAUUSD=X", timeframe));
  const getSpotQuote = createPublicCache(async (symbol) => {
    try {
      const quote = await fetchLiveSpotQuote(symbol);
      return positiveNumber(quote?.price) ? quote.price : null;
    } catch {
      return null;
    }
  });
  router.get("/bridge/comex-gold", async (req, res) => {
    const header = req.get(AI_HEADERS.databento);
    res.set("Cache-Control", header === void 0 ? "no-store" : "private, no-store");
    const timeframe = COMEX_TIMEFRAMES.find((tf) => tf === (req.query.timeframe ?? "15m"));
    if (!timeframe) {
      res.status(400).json({ error: "Unsupported COMEX bridge timeframe." });
      return;
    }
    const binsQuery = typeof req.query.bins === "string" ? Number(req.query.bins) : NaN;
    const bins = Number.isFinite(binsQuery) ? Math.min(48, Math.max(10, Math.trunc(binsQuery))) : 24;
    const key = buildDatabentoRequestHeaders(header)[AI_HEADERS.databento];
    try {
      const futures = async () => {
        const databento = key ? await loadDatabentoBars(key, timeframe) : null;
        return {
          status: databento?.status ?? (header === void 0 ? "public" : "invalid-key"),
          candles: databento?.candles ?? await getPublicGc(timeframe)
        };
      };
      const [spotPrice, spotHistory, { status, candles }] = await Promise.all([
        getSpotQuote("XAUUSD"),
        getSpotHistory(timeframe),
        futures()
      ]);
      const last = candles?.at(-1);
      if (!candles || !last || spotPrice === null) {
        res.status(502).json({ error: "COMEX futures or the XAU/USD spot quote is unavailable." });
        return;
      }
      const { ms } = TIMEFRAME_CONFIG[timeframe];
      const historicalSpot = new Map(spotHistory?.map((bar) => [bucketStart(bar.ts, ms), bar.close]));
      const gcPrices = [];
      const xauPrices = [];
      const latestBucket = bucketStart(last.ts, ms);
      for (const candle of candles) {
        const bucket = bucketStart(candle.ts, ms);
        if (bucket >= latestBucket) break;
        const spotClose = historicalSpot.get(bucket);
        if (spotClose === void 0) continue;
        gcPrices.push(candle.close);
        xauPrices.push(spotClose);
      }
      gcPrices.push(last.close);
      xauPrices.push(spotPrice);
      const databentoUsed = status === "used";
      res.json(buildComexBridgeSnapshot({
        timeframe,
        bins,
        candles,
        gcPrices,
        xauPrices,
        fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
        databentoUsed,
        databentoStatus: status,
        databentoNote: DATABENTO_NOTES[status],
        dataSource: databentoUsed ? "Databento GLBX.MDP3 (BYOK) + Live XAU Spot" : "Yahoo Finance GC=F + Live XAU Spot"
      }));
    } catch {
      res.status(502).json({ error: "COMEX bridge data is currently unavailable." });
    }
  });
  return router;
}

// server/telemetry/siteTraffic.ts
import { readFileSync as readFileSync2, renameSync as renameSync2, rmSync as rmSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { randomUUID as randomUUID3 } from "node:crypto";
import { tmpdir as tmpdir2 } from "node:os";
import { join as join2 } from "node:path";
import express4 from "express";

// src/utils/siteTraffic.ts
var BOT_USER_AGENT_RE = /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|discordbot|headlesschrome|lighthouse|pagespeed|pingdom|uptimerobot|statuscake|curl|wget|python-requests|go-http-client|axios|node-fetch|playwright|puppeteer/i;
var SESSION_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;
function normalizeTrafficSite(value, fallback = "desk") {
  if (typeof value !== "string") return fallback;
  const norm = value.trim().toLowerCase();
  if (norm === "web" || norm === "tallynx-web" || norm === "tallynx.com") return "web";
  if (norm === "desk" || norm === "tallynx-desk" || norm === "desk.tallynx.com") return "desk";
  return fallback;
}
function normalizeSessionId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return SESSION_ID_RE.test(trimmed) ? trimmed : null;
}
function isLikelyBotUserAgent(userAgent) {
  if (typeof userAgent !== "string" || !userAgent.trim()) return false;
  return BOT_USER_AGENT_RE.test(userAgent);
}
function getBangkokDayKey(nowMs = Date.now()) {
  const shifted = new Date(nowMs + 7 * 60 * 60 * 1e3);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// server/telemetry/siteTraffic.ts
var ONLINE_WINDOW_MS = 5 * 60 * 1e3;
var DAY_KEY_TTL_SEC = 60 * 60 * 48;
var REDIS_PREFIX = "tallynx:traffic:v1";
var ALLOWED_CORS_ORIGINS = /* @__PURE__ */ new Set([
  "https://tallynx.com",
  "https://www.tallynx.com",
  "https://desk.tallynx.com",
  "https://mall.tallynx.com"
]);
function resolveUpstashConfig(env = process.env) {
  const url = (env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || "").trim().replace(/\/+$/, "");
  const token = (env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || "").trim();
  if (!url || !token || !/^https?:\/\//i.test(url)) return null;
  return { url, token };
}
function isAllowedCorsOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_CORS_ORIGINS.has(origin)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}
async function runRedisPipeline(config, commands, fetcher = fetch) {
  const response = await fetcher(`${config.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(4e3),
    redirect: "error"
  });
  if (!response.ok) {
    throw new Error(`Upstash REST pipeline failed (${response.status})`);
  }
  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("Unexpected Upstash pipeline payload");
  }
  return payload.map((item) => item?.result);
}
function toCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}
async function recordAndReadRedis(config, site, sessionId, pageView, nowMs, fetcher) {
  const dayKey = getBangkokDayKey(nowMs);
  const cutoffMs = nowMs - ONLINE_WINDOW_MS;
  const totalKey = (s) => `${REDIS_PREFIX}:total:${s}`;
  const dayCountKey = (s) => `${REDIS_PREFIX}:day:${s}:${dayKey}`;
  const seenKey = (s) => `${REDIS_PREFIX}:seen:${s}:${dayKey}`;
  const onlineKey = (s) => `${REDIS_PREFIX}:online:${s}`;
  if (sessionId) {
    if (pageView) {
      const [added] = await runRedisPipeline(
        config,
        [
          ["SADD", seenKey(site), sessionId],
          ["EXPIRE", seenKey(site), DAY_KEY_TTL_SEC]
        ],
        fetcher
      );
      if (toCount(added) > 0) {
        await runRedisPipeline(
          config,
          [
            ["INCR", totalKey(site)],
            ["INCR", dayCountKey(site)],
            ["EXPIRE", dayCountKey(site), DAY_KEY_TTL_SEC]
          ],
          fetcher
        );
      }
    }
    await runRedisPipeline(
      config,
      [
        ["ZADD", onlineKey(site), nowMs, sessionId],
        ["EXPIRE", onlineKey(site), 900]
      ],
      fetcher
    );
  }
  const results = await runRedisPipeline(
    config,
    [
      ["ZREMRANGEBYSCORE", onlineKey("web"), 0, cutoffMs],
      ["ZREMRANGEBYSCORE", onlineKey("desk"), 0, cutoffMs],
      ["GET", totalKey("web")],
      ["GET", dayCountKey("web")],
      ["ZCARD", onlineKey("web")],
      ["GET", totalKey("desk")],
      ["GET", dayCountKey("desk")],
      ["ZCARD", onlineKey("desk")]
    ],
    fetcher
  );
  const webTotal = toCount(results[2]);
  const webToday = toCount(results[3]);
  const webOnline = toCount(results[4]);
  const deskTotal = toCount(results[5]);
  const deskToday = toCount(results[6]);
  const deskOnline = toCount(results[7]);
  const isWeb = site === "web";
  const siteTotalVisits = isWeb ? webTotal : deskTotal;
  const siteTodayVisits = isWeb ? webToday : deskToday;
  const siteOnlineNow = Math.max(sessionId ? 1 : 0, isWeb ? webOnline : deskOnline);
  return {
    site,
    dayKey,
    siteTotalVisits,
    siteTodayVisits,
    siteOnlineNow,
    ecosystemTotalVisits: webTotal + deskTotal,
    ecosystemTodayVisits: webToday + deskToday,
    ecosystemOnlineNow: Math.max(siteOnlineNow, webOnline + deskOnline),
    storageMode: "redis",
    updatedAt: new Date(nowMs).toISOString()
  };
}
function emptySiteState(dayKey) {
  return { total: 0, dayKey, today: 0, seenToday: [], online: {} };
}
function createMemoryTrafficStore(filePath) {
  let state = null;
  function load(dayKey) {
    if (state) return state;
    try {
      const parsed = JSON.parse(readFileSync2(filePath, "utf8"));
      state = {
        web: parsed.web ? { ...emptySiteState(dayKey), ...parsed.web } : emptySiteState(dayKey),
        desk: parsed.desk ? { ...emptySiteState(dayKey), ...parsed.desk } : emptySiteState(dayKey)
      };
    } catch {
      state = { web: emptySiteState(dayKey), desk: emptySiteState(dayKey) };
    }
    return state;
  }
  function persist(next) {
    const tmp = `${filePath}.${randomUUID3()}.tmp`;
    try {
      writeFileSync2(tmp, JSON.stringify(next), { encoding: "utf8", mode: 384 });
      renameSync2(tmp, filePath);
    } catch {
      try {
        rmSync2(tmp, { force: true });
      } catch {
      }
    }
  }
  function pruneAndRollover(siteState, dayKey, cutoffMs) {
    if (siteState.dayKey !== dayKey) {
      siteState.dayKey = dayKey;
      siteState.today = 0;
      siteState.seenToday = [];
    }
    for (const [sid, ts] of Object.entries(siteState.online)) {
      if (!Number.isFinite(ts) || ts < cutoffMs) {
        delete siteState.online[sid];
      }
    }
    if (siteState.seenToday.length > 5e3) {
      siteState.seenToday = siteState.seenToday.slice(-2500);
    }
  }
  return function recordAndReadMemory(site, sessionId, pageView, nowMs) {
    const dayKey = getBangkokDayKey(nowMs);
    const cutoffMs = nowMs - ONLINE_WINDOW_MS;
    const store = load(dayKey);
    pruneAndRollover(store.web, dayKey, cutoffMs);
    pruneAndRollover(store.desk, dayKey, cutoffMs);
    const target = store[site];
    let dirty = false;
    if (sessionId) {
      target.online[sessionId] = nowMs;
      dirty = true;
      if (pageView && !target.seenToday.includes(sessionId)) {
        target.seenToday.push(sessionId);
        target.total += 1;
        target.today += 1;
      }
    }
    if (dirty) persist(store);
    const webOnline = Object.keys(store.web.online).length;
    const deskOnline = Object.keys(store.desk.online).length;
    const isWeb = site === "web";
    const siteOnlineNow = Math.max(sessionId ? 1 : 0, isWeb ? webOnline : deskOnline);
    return {
      site,
      dayKey,
      siteTotalVisits: target.total,
      siteTodayVisits: target.today,
      siteOnlineNow,
      ecosystemTotalVisits: store.web.total + store.desk.total,
      ecosystemTodayVisits: store.web.today + store.desk.today,
      ecosystemOnlineNow: Math.max(siteOnlineNow, webOnline + deskOnline),
      storageMode: "memory",
      updatedAt: new Date(nowMs).toISOString()
    };
  };
}
function createSiteTrafficRouter(options = {}) {
  const router = express4.Router();
  const defaultSite = options.defaultSite ?? "desk";
  const env = options.env ?? process.env;
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const rateLimitMax = options.rateLimitMax ?? 60;
  const rateLimitWindowMs = options.rateLimitWindowMs ?? 15 * 60 * 1e3;
  const postRateBuckets = /* @__PURE__ */ new Map();
  let nextSweepAt = 0;
  const recordMemory = createMemoryTrafficStore(
    options.storeFile ?? join2(tmpdir2(), "tallynx_site_traffic_v1.json")
  );
  function checkTrafficRateLimit(ipKey, nowMs) {
    const windowStart = nowMs - rateLimitWindowMs;
    if (nowMs >= nextSweepAt) {
      for (const [key, stamps2] of postRateBuckets) {
        if ((stamps2.at(-1) ?? 0) <= windowStart) postRateBuckets.delete(key);
      }
      nextSweepAt = nowMs + rateLimitWindowMs;
    }
    const stamps = (postRateBuckets.get(ipKey) ?? []).filter((ts) => ts > windowStart);
    if (stamps.length >= rateLimitMax) {
      const oldest = stamps[0] ?? nowMs;
      postRateBuckets.set(ipKey, stamps);
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((oldest + rateLimitWindowMs - nowMs) / 1e3)) };
    }
    stamps.push(nowMs);
    postRateBuckets.set(ipKey, stamps);
    return { allowed: true, retryAfterSec: 0 };
  }
  function applyCors(req, res) {
    const origin = req.headers.origin;
    if (typeof origin === "string" && isAllowedCorsOrigin(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
  }
  router.options("/telemetry/traffic", (req, res) => {
    applyCors(req, res);
    res.status(204).end();
  });
  router.get("/telemetry/traffic", async (req, res) => {
    applyCors(req, res);
    res.setHeader("Cache-Control", "no-store");
    const site = normalizeTrafficSite(req.query.site, defaultSite);
    const nowMs = now();
    const redisConfig = resolveUpstashConfig(env);
    if (redisConfig) {
      try {
        const snapshot = await recordAndReadRedis(redisConfig, site, null, false, nowMs, fetcher);
        return res.json(snapshot);
      } catch {
      }
    }
    return res.json(recordMemory(site, null, false, nowMs));
  });
  router.post("/telemetry/traffic", async (req, res) => {
    applyCors(req, res);
    res.setHeader("Cache-Control", "no-store");
    const nowMs = now();
    const clientIp = (process.env.VERCEL === "1" ? req.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() : void 0) || req.ip || req.socket?.remoteAddress || "unknown";
    const rate = checkTrafficRateLimit(clientIp, nowMs);
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfterSec));
      return res.status(429).json({
        ok: false,
        code: "RATE_LIMITED",
        error: "Too many traffic telemetry pings. Try again later."
      });
    }
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const site = normalizeTrafficSite(body.site, defaultSite);
    const isBot = isLikelyBotUserAgent(req.headers["user-agent"]);
    const rawSessionId = typeof body.sessionId === "string" && body.sessionId.length <= 128 ? body.sessionId : null;
    const sessionId = isBot ? null : normalizeSessionId(rawSessionId);
    const pageView = !isBot && body.pageView === true && Boolean(sessionId);
    const redisConfig = resolveUpstashConfig(env);
    if (redisConfig) {
      try {
        const snapshot = await recordAndReadRedis(redisConfig, site, sessionId, pageView, nowMs, fetcher);
        return res.json(snapshot);
      } catch {
      }
    }
    return res.json(recordMemory(site, sessionId, pageView, nowMs));
  });
  return router;
}

// server/ai/platformPrivilege.ts
function readFirebaseLookupCaller(payload, requireVerifiedEmail) {
  const users = asRecord(payload)?.users;
  const user = asRecord(Array.isArray(users) ? users[0] : void 0);
  if (!user || typeof user.localId !== "string" || !user.localId.trim() || user.disabled === true || requireVerifiedEmail && user.emailVerified !== true) return null;
  const displayName = typeof user.displayName === "string" && user.displayName.trim() ? user.displayName.trim().slice(0, 80) : void 0;
  return {
    uid: user.localId,
    email: typeof user.email === "string" ? user.email : "",
    emailVerified: user.emailVerified === true,
    ...displayName ? { displayName } : {},
    customAttributes: typeof user.customAttributes === "string" ? user.customAttributes : void 0
  };
}
var caches = /* @__PURE__ */ new WeakMap();
function listed(value, list, ignoreCase = false) {
  if (!value || !list) return false;
  return list.split(/[\s,;]+/).some((entry) => ignoreCase ? entry.toLowerCase() === value.toLowerCase() : entry === value);
}
function claimsFrom(value) {
  try {
    return value ? asRecord(JSON.parse(value)) : void 0;
  } catch {
    return void 0;
  }
}
function field(document2, name) {
  return asRecord(asRecord(document2?.fields)?.[name])?.stringValue;
}
async function lookupFirestoreRole(uid, authorization, deps) {
  const fetcher = deps.fetcher ?? fetch;
  const now = deps.now ?? Date.now;
  const ttl = 6e4;
  const project = deps.projectId;
  if (!project) return null;
  const database = deps.databaseId || "(default)";
  let cache = caches.get(deps);
  if (!cache) {
    cache = /* @__PURE__ */ new Map();
    caches.set(deps, cache);
  }
  const cached = cache.get(uid);
  if (cached && cached.expiresAt > now()) return cached.role;
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases/${encodeURIComponent(database)}/documents`;
  async function read(collection) {
    try {
      const response = await fetcher(`${base}/${collection}/${encodeURIComponent(uid)}`, {
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(4e3),
        redirect: "error"
      });
      if (response.status === 404) return { complete: true };
      if (!response.ok) return { complete: false };
      return { complete: true, document: asRecord(await response.json()) };
    } catch {
      return { complete: false };
    }
  }
  const [admin, entitlement] = await Promise.all([read("admins"), read("entitlements")]);
  const activePlan = field(entitlement.document, "ownerId") === uid && field(entitlement.document, "status") === "ACTIVE" ? field(entitlement.document, "plan") : void 0;
  const role = field(admin.document, "uid") === uid || activePlan === "ADMIN" ? "ADMIN" : activePlan === "LIFETIME" ? "LIFETIME" : null;
  if (admin.complete && entitlement.complete) {
    if (cache.size >= 1e3) {
      for (const [key, entry] of cache) {
        if (entry.expiresAt <= now()) cache.delete(key);
      }
      const oldest = cache.keys().next().value;
      if (cache.size >= 1e3 && oldest !== void 0) cache.delete(oldest);
    }
    cache.set(uid, { expiresAt: now() + ttl, role });
  }
  return role;
}
async function resolvePlatformAiPrivilege(authorization, deps) {
  if (!authorization || !/^Bearer [^\s]+$/.test(authorization)) return { eligible: false, role: null, uid: null };
  const caller = await deps.verifyFirebaseBearerToken(authorization).catch(() => null);
  if (!caller) return { eligible: false, role: null, uid: null };
  const env = deps.env ?? {};
  const claims = claimsFrom(caller.customAttributes);
  const email = caller.emailVerified === true ? caller.email.trim() : "";
  let role;
  if (claims?.founder === true || listed(caller.uid, env.FOUNDER_UIDS) || listed(email, env.FOUNDER_EMAILS, true)) {
    role = "FOUNDER";
  } else if (claims?.admin === true || [env.ADMIN_EMAILS, env.BOOTSTRAP_ADMIN_EMAILS, env.VITE_BOOTSTRAP_ADMIN_EMAILS].some((list) => listed(email, list, true))) {
    role = "ADMIN";
  } else {
    role = await lookupFirestoreRole(caller.uid, authorization, deps);
  }
  return { eligible: role !== null, role, uid: caller.uid };
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
function computeRsi142(closes, period = 14) {
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
  const rsi14 = computeRsi142(closes, 14);
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
    const existingFlight = this.inFlight.get(cacheKey);
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
    const flightPromise = Promise.resolve().then(fetcher).then((telemetry) => {
      if (this.inFlight.get(cacheKey) !== flightPromise) return telemetry;
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
var nextRateBucketSweep = 0;
var telemetryBus = new EventEmitter();
telemetryBus.setMaxListeners(100);
function checkChatRateLimit(key, nowMs = Date.now(), maxRequests = RATE_MAX_REQUESTS) {
  const windowStart = nowMs - RATE_WINDOW_MS;
  if (nowMs >= nextRateBucketSweep) {
    for (const [bucket, timestamps2] of rateBucket) {
      if ((timestamps2.at(-1) ?? 0) <= windowStart) rateBucket.delete(bucket);
    }
    nextRateBucketSweep = nowMs + RATE_WINDOW_MS;
  }
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
      body: JSON.stringify({ idToken }),
      redirect: "error",
      signal: AbortSignal.timeout(4e3)
    });
    if (!resp.ok) return null;
    return readFirebaseLookupCaller(await resp.json(), requireVerifiedEmail);
  } catch {
    return null;
  }
}
var platformPrivilegeDeps = {
  verifyFirebaseBearerToken: (authorization) => verifyFirebaseBearerToken(authorization, false),
  projectId: FIREBASE_CFG.projectId,
  databaseId: FIREBASE_CFG.firestoreDatabaseId,
  env: process.env
};
var resolveCallerPlatformAiPrivilege = (authorization) => resolvePlatformAiPrivilege(authorization, platformPrivilegeDeps);
var getPlatformGeminiKey = () => process.env.GEMINI_API_KEY?.trim();
var resolveDeskAiAccess = createDeskAiAccessResolver({
  resolvePlatformAiPrivilege: resolveCallerPlatformAiPrivilege,
  verifyFirebaseBearerToken: (authorization) => verifyFirebaseBearerToken(authorization, false),
  getPlatformKey: getPlatformGeminiKey
});
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
  return crypto2.createHash("sha256").update(rawKey.trim()).digest("hex");
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
  const app2 = express5();
  app2.use(express5.json({ limit: "8mb" }));
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
      const latest = executions.filter((trade) => trade.kind === "TRADE" && trade.symbol && trade.closedAt && trade.netPnl !== null && Number.isFinite(Number(trade.netPnl)) && Number.isFinite(Date.parse(trade.closedAt)) && Date.parse(trade.closedAt) <= Date.now() && !trade.unverifiedFields?.some((field2) => field2 === "closedAt" || field2 === "netPnl")).sort((a, b) => Date.parse(b.closedAt) - Date.parse(a.closedAt))[0];
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
  const bridgeKeyOwners = /* @__PURE__ */ new Map();
  function bindBridgeKeyOwner(apiKey, uid) {
    if (!uid) return;
    const keyHash = hashTredynApiKey(apiKey);
    bridgeKeyOwners.set(keyHash, uid);
    if (bridgeKeyOwners.size > 2048) {
      const oldest = bridgeKeyOwners.keys().next().value;
      if (oldest) bridgeKeyOwners.delete(oldest);
    }
  }
  app2.get("/api/mt5/engine-status", (_req, res) => {
    const eaBinExists = fs.existsSync(path.join(process.cwd(), "scripts", "TredynLiveBridge.ex5"));
    const eaSrcExists = fs.existsSync(path.join(process.cwd(), "scripts", "TredynLiveBridge.mq5"));
    const liveBridgeReady = eaBinExists && eaSrcExists;
    const fundedNextGatewayReady = Boolean(fundedNextVpsBaseUrl);
    const sovereignStoreReady = Boolean(DEFAULT_SOVEREIGN_MT5_BASE_URL);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      liveBridgeReady,
      cloudConnectorsReady: true,
      fundedNextGatewayReady,
      sovereignStoreReady,
      sharedVpsDisabled: true,
      engineReady: liveBridgeReady,
      activeBridgeFeeds: liveBridgeMemoryStore.size,
      checkedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app2.post("/api/mt5/live-bridge/push", async (req, res) => {
    try {
      const ipRate = checkChatRateLimit(`live_bridge_push_ip:${req.ip || req.socket.remoteAddress || "unknown"}`, Date.now(), 900);
      if (!ipRate.allowed) {
        res.setHeader("Retry-After", String(ipRate.retryAfterSec));
        res.status(429).json({
          ok: false,
          code: "RATE_LIMITED",
          error: `Live Bridge push rate limit exceeded; retry in ${ipRate.retryAfterSec}s`
        });
        return;
      }
      const body = req.body || {};
      const headerKey = typeof req.headers["x-tallynx-api-key"] === "string" ? req.headers["x-tallynx-api-key"].trim() : typeof req.headers["x-tredyn-api-key"] === "string" ? req.headers["x-tredyn-api-key"].trim() : typeof body.tallynxApiKey === "string" ? body.tallynxApiKey.trim() : typeof body.tredynApiKey === "string" ? body.tredynApiKey.trim() : "";
      if (!isValidTredynApiKey(headerKey)) {
        res.status(401).json({
          ok: false,
          error: "Invalid or missing X-TallyNX-Api-Key (or X-Tredyn-Api-Key) header"
        });
        return;
      }
      const keyHash = hashTredynApiKey(headerKey);
      const keyRate = checkChatRateLimit(`live_bridge_push_key:${keyHash}`, Date.now(), 600);
      if (!keyRate.allowed) {
        res.setHeader("Retry-After", String(keyRate.retryAfterSec));
        res.status(429).json({
          ok: false,
          code: "RATE_LIMITED",
          error: `Live Bridge push rate limit exceeded for this key; retry in ${keyRate.retryAfterSec}s`
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
          holderName: String(rawMeta.holderName || rawMeta.name || "TallyNX MT5 Trader"),
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
        keyHash,
        ownerUid: bridgeKeyOwners.get(keyHash) ?? null,
        payload: {
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
        }
      });
      if (DEFAULT_SOVEREIGN_MT5_BASE_URL) {
        await fetch(`${DEFAULT_SOVEREIGN_MT5_BASE_URL}/live-bridge/push`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-TallyNX-Api-Key": headerKey,
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
    if (req.headers.authorization) {
      const caller = await verifyFirebaseBearerToken(req.headers.authorization, false).catch(() => null);
      if (caller) bindBridgeKeyOwner(headerKey, caller.uid);
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
              "X-TallyNX-Api-Key": headerKey,
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
                holderName: String(rawMeta.holderName || rawMeta.name || "TallyNX MT5 Trader"),
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
        error: "Waiting for MT5 Live Bridge heartbeat for this bridge API key",
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
        const tredynApiKey = typeof body.tallynxApiKey === "string" && body.tallynxApiKey.trim() ? body.tallynxApiKey.trim() : typeof body.tredynApiKey === "string" && body.tredynApiKey.trim() ? body.tredynApiKey.trim() : userToken;
        if (!isValidTredynApiKey(tredynApiKey)) {
          res.status(400).json({
            error: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E30\u0E1A\u0E38 Live Bridge API key \u0E17\u0E35\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07 (\u0E40\u0E0A\u0E48\u0E19 trd_live_...)",
            code: "INVALID_TREDYN_API_KEY"
          });
          return;
        }
        if (caller) bindBridgeKeyOwner(tredynApiKey, caller.uid);
        let feed = getLiveBridgeFeed(tredynApiKey);
        if (!feed && DEFAULT_SOVEREIGN_MT5_BASE_URL) {
          try {
            const pullResp = await fetch(
              `${DEFAULT_SOVEREIGN_MT5_BASE_URL}/live-bridge/pull?apiKey=${encodeURIComponent(tredynApiKey)}`,
              {
                method: "GET",
                headers: {
                  Accept: "application/json",
                  "X-TallyNX-Api-Key": tredynApiKey,
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
                    holderName: String(rawMeta.holderName || rawMeta.name || "TallyNX MT5 Trader"),
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
            error: "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E13\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E08\u0E32\u0E01 MT5 Live Bridge \u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A API key \u0E19\u0E35\u0E49 \u2014 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E15\u0E34\u0E14\u0E15\u0E31\u0E49\u0E07 TredynLiveBridge.ex5 \u0E25\u0E07\u0E1A\u0E19\u0E01\u0E23\u0E32\u0E1F\u0E43\u0E19 MT5 \u0E41\u0E25\u0E30\u0E40\u0E1B\u0E34\u0E14 Allow WebRequest",
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
      const rawChannel = typeof body.verificationChannel === "string" ? body.verificationChannel.trim() : "";
      if (rawChannel === "DIRECT_INVESTOR" || rawChannel === "METAAPI_CLOUD" || rawChannel === "BRIDGE_API") {
        res.status(410).json({
          ok: false,
          code: "DEPRECATED_CHANNEL",
          error: "\u0E0A\u0E48\u0E2D\u0E07\u0E17\u0E32\u0E07\u0E25\u0E47\u0E2D\u0E01\u0E2D\u0E34\u0E19 Investor Password / MetaApi Cloud / Shared VPS \u0E16\u0E39\u0E01\u0E16\u0E2D\u0E14\u0E2D\u0E2D\u0E01\u0E16\u0E32\u0E27\u0E23\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E1B\u0E49\u0E2D\u0E07\u0E01\u0E31\u0E19\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E48\u0E22\u0E07\u0E1C\u0E34\u0E14\u0E01\u0E0E Shared IP \u0E02\u0E2D\u0E07\u0E01\u0E2D\u0E07\u0E17\u0E38\u0E19 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E43\u0E0A\u0E49 Live Bridge (.ex5), Myfxbook API, FundedNext MCP, ProjectX API \u0E2B\u0E23\u0E37\u0E2D\u0E44\u0E1F\u0E25\u0E4C .xlsx"
        });
        return;
      }
      const allowedChannels = [
        "LIVE_BRIDGE",
        "MANUAL_XLSX",
        "FUNDEDNEXT_MCP",
        "MYFXBOOK_API",
        "PROJECTX_API"
      ];
      let verificationChannel = allowedChannels.includes(
        rawChannel
      ) ? rawChannel : "MANUAL_XLSX";
      let proofOrigin = "CLIENT_SUBMITTED";
      let brokerServer = String(body.brokerServer || "").trim();
      let brokerName = String(body.brokerName || "").trim() || "MT5 Verified Broker";
      let rawLogin = String(body.login || "").trim();
      let initialDeposit = Math.max(100, Number(body.initialDeposit) || 1e4);
      let candidatePositions = Array.isArray(body.mt5Positions) ? body.mt5Positions : [];
      if (verificationChannel === "LIVE_BRIDGE") {
        const bridgeKey = typeof req.headers["x-tallynx-api-key"] === "string" ? req.headers["x-tallynx-api-key"].trim() : typeof req.headers["x-tredyn-api-key"] === "string" ? req.headers["x-tredyn-api-key"].trim() : "";
        const serverFeed = bridgeKey && isValidTredynApiKey(bridgeKey) ? getLiveBridgeFeed(bridgeKey) : null;
        if (serverFeed && serverFeed.positions.length > 0) {
          proofOrigin = "SERVER_LIVE_BRIDGE";
          candidatePositions = serverFeed.positions;
          rawLogin = serverFeed.meta.login || rawLogin;
          brokerName = serverFeed.meta.broker || brokerName;
          brokerServer = serverFeed.meta.server || brokerServer;
          if (serverFeed.meta.initialDeposit >= 100) {
            initialDeposit = serverFeed.meta.initialDeposit;
          }
        } else {
          verificationChannel = "MANUAL_XLSX";
          proofOrigin = "CLIENT_SUBMITTED";
        }
      }
      if (!rawLogin || rawLogin.length < 3) {
        res.status(400).json({
          ok: false,
          error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E40\u0E25\u0E02\u0E1E\u0E2D\u0E23\u0E4C\u0E15 MT5 (Account Login) \u2014 \u0E23\u0E30\u0E1A\u0E1A\u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1E\u0E2D\u0E23\u0E4C\u0E15\u0E17\u0E35\u0E48\u0E0B\u0E34\u0E07\u0E01\u0E4C MT5 \u0E08\u0E23\u0E34\u0E07\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19"
        });
        return;
      }
      const { valid: verifiedPositions } = validateVerifiedMt5Positions(candidatePositions);
      if (verifiedPositions.length === 0) {
        res.status(400).json({
          ok: false,
          error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E1B\u0E23\u0E30\u0E27\u0E31\u0E15\u0E34\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C MT5 \u0E08\u0E23\u0E34\u0E07\u0E17\u0E35\u0E48\u0E1C\u0E48\u0E32\u0E19\u0E01\u0E32\u0E23\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A (\u0E15\u0E49\u0E2D\u0E07\u0E0B\u0E34\u0E07\u0E01\u0E4C\u0E1C\u0E48\u0E32\u0E19 Live Bridge .ex5, Cloud API \u0E17\u0E32\u0E07\u0E01\u0E32\u0E23 \u0E2B\u0E23\u0E37\u0E2D Report .xlsx \u0E01\u0E48\u0E2D\u0E19\u0E40\u0E1C\u0E22\u0E41\u0E1E\u0E23\u0E48)"
        });
        return;
      }
      const metrics = computeVerifiedSetupMetrics(verifiedPositions, initialDeposit);
      const verifiedAt = (/* @__PURE__ */ new Date()).toISOString();
      const proofPayload = JSON.stringify({
        sellerUid: caller.uid,
        login: rawLogin,
        brokerServer: brokerServer || brokerName,
        verificationChannel,
        proofOrigin,
        tradeCount: metrics.tradeCount,
        netProfitUsd: metrics.netProfitUsd,
        firstTicket: verifiedPositions[0].ticket,
        lastTicket: verifiedPositions[verifiedPositions.length - 1].ticket
      });
      const proofHash = crypto2.createHash("sha256").update(proofPayload).digest("hex");
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
        proofOrigin,
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
      let target = marketplaceMemoryStore.get(setupId);
      if (!target) {
        const allListings = await getMarketplaceListings();
        target = allListings.find((item) => item.id === setupId);
      }
      if (!target) {
        res.status(404).json({ ok: false, error: "Marketplace setup not found." });
        return;
      }
      if (target.priceUsd > 0 && target.sellerUid !== caller.uid) {
        res.status(501).json({
          ok: false,
          error: "PAYMENT_GATEWAY_REQUIRED",
          message: "Paid marketplace checkout is not yet active. Free community blueprints ($0) are available now."
        });
        return;
      }
      target.buyerCount = (target.buyerCount || 0) + 1;
      saveMarketplaceSetup(target);
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
        buyerCount: target.buyerCount
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
      if (!id) {
        res.status(400).json({ ok: false, error: "Missing listing id" });
        return;
      }
      loadMarketplaceStore();
      const localTarget = marketplaceMemoryStore.get(id);
      if (localTarget && localTarget.sellerUid !== caller.uid) {
        res.status(403).json({ ok: false, error: "\u0E04\u0E38\u0E13\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E25\u0E1A Setup \u0E02\u0E2D\u0E07\u0E1C\u0E39\u0E49\u0E02\u0E32\u0E22\u0E23\u0E32\u0E22\u0E2D\u0E37\u0E48\u0E19" });
        return;
      }
      if (!localTarget) {
        if (!DEFAULT_SOVEREIGN_MT5_BASE_URL) {
          res.status(404).json({ ok: false, error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A Setup \u0E17\u0E35\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E25\u0E1A" });
          return;
        }
        const remoteListings = await getMarketplaceListings();
        const remoteTarget = remoteListings.find((item) => item.id === id);
        if (!remoteTarget) {
          res.status(404).json({ ok: false, error: "\u0E44\u0E21\u0E48\u0E1E\u0E1A Setup \u0E17\u0E35\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E25\u0E1A" });
          return;
        }
        if (remoteTarget.sellerUid !== caller.uid) {
          res.status(403).json({ ok: false, error: "\u0E04\u0E38\u0E13\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E25\u0E1A Setup \u0E02\u0E2D\u0E07\u0E1C\u0E39\u0E49\u0E02\u0E32\u0E22\u0E23\u0E32\u0E22\u0E2D\u0E37\u0E48\u0E19" });
          return;
        }
      }
      if (DEFAULT_SOVEREIGN_MT5_BASE_URL) {
        const delResp = await fetch(`${DEFAULT_SOVEREIGN_MT5_BASE_URL}/marketplace/delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, sellerUid: caller.uid }),
          signal: AbortSignal.timeout(3e3)
        }).catch(() => null);
        if (delResp && (delResp.status === 403 || delResp.status === 404)) {
          res.status(delResp.status).json({
            ok: false,
            error: delResp.status === 403 ? "\u0E04\u0E38\u0E13\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E25\u0E1A Setup \u0E02\u0E2D\u0E07\u0E1C\u0E39\u0E49\u0E02\u0E32\u0E22\u0E23\u0E32\u0E22\u0E2D\u0E37\u0E48\u0E19" : "\u0E44\u0E21\u0E48\u0E1E\u0E1A Setup \u0E17\u0E35\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E25\u0E1A"
          });
          return;
        }
        if (!localTarget && (!delResp || !delResp.ok)) {
          res.status(502).json({ ok: false, error: "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E01\u0E32\u0E23\u0E25\u0E1A\u0E01\u0E31\u0E1A\u0E40\u0E0B\u0E34\u0E23\u0E4C\u0E1F\u0E40\u0E27\u0E2D\u0E23\u0E4C\u0E08\u0E31\u0E14\u0E40\u0E01\u0E47\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E44\u0E14\u0E49" });
          return;
        }
      }
      if (localTarget) {
        removeMarketplaceSetup(id);
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
    const disconnected = new AbortController();
    const onClose = () => disconnected.abort();
    res.once("close", onClose);
    const signal = AbortSignal.any([disconnected.signal, AbortSignal.timeout(55e3)]);
    let isSseStarted = false;
    let usingPersonalKey = false;
    res.set("Cache-Control", "no-store");
    const emitSse = (event, data) => {
      if (res.writableEnded || res.destroyed) return;
      if (!isSseStarted) {
        isSseStarted = true;
        res.set({
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-store, no-transform",
          "X-Accel-Buffering": "no"
        });
        res.flushHeaders();
      }
      res.write(`event: ${event}
data: ${JSON.stringify(data)}

`);
    };
    try {
      const access = await resolveDeskAiAccess(req, "text");
      if (!access.ok) {
        res.status(access.status).json({ error: access.error, code: access.code });
        return;
      }
      const { connection } = access;
      usingPersonalKey = connection.provider !== "platform";
      const rate = await checkDistributedRateLimit(`chat:${access.rateSubject}`, 35);
      if (!rate.allowed) {
        res.set("Retry-After", String(rate.retryAfterSec));
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
      } = asRecord(req.body) ?? {};
      if (!message || typeof message !== "string" || !message.trim()) {
        res.status(400).json({ error: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E1E\u0E34\u0E21\u0E1E\u0E4C\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E17\u0E35\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E16\u0E32\u0E21\u0E42\u0E04\u0E49\u0E0A\u0E40\u0E17\u0E23\u0E14" });
        return;
      }
      if (message.length > 4e3) {
        res.status(400).json({ error: "\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E22\u0E32\u0E27\u0E40\u0E01\u0E34\u0E19 4,000 \u0E15\u0E31\u0E27\u0E2D\u0E31\u0E01\u0E29\u0E23 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E22\u0E48\u0E2D\u0E04\u0E33\u0E16\u0E32\u0E21\u0E43\u0E2B\u0E49\u0E01\u0E23\u0E30\u0E0A\u0E31\u0E1A\u0E02\u0E36\u0E49\u0E19" });
        return;
      }
      const safeContext = typeof deskContext === "string" ? deskContext.slice(0, 6e3) : "";
      const safeChartContext = typeof liveChartContext === "string" ? liveChartContext.slice(0, 4e3) : "";
      const binaryParts = [];
      const decodedTextSnippets = [];
      let hasPdfAttachment = false;
      let hasVisualAttachment = false;
      const attachmentList = Array.isArray(attachments) ? attachments : [];
      if (attachmentList.length) {
        for (const input of attachmentList.slice(0, 3)) {
          const item = asRecord(input);
          if (!item) continue;
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
      const formattedHistory = Array.isArray(history) ? history.filter((item) => {
        if (!item || typeof item !== "object" || !("role" in item) || !("text" in item)) return false;
        return (item.role === "user" || item.role === "model") && typeof item.text === "string" && item.text.trim() !== "";
      }).slice(-20).map((item) => ({
        role: item.role,
        parts: [{ text: item.text.slice(0, 4e3) }]
      })) : [];
      const userPromptText = attachedDocsText ? `${attachedDocsText}

\u0E04\u0E33\u0E16\u0E32\u0E21\u0E02\u0E2D\u0E07\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49:
${message.trim()}` : message.trim();
      if (connection.provider !== "platform") {
        if (connection.provider !== "google" && binaryParts.length > 0) {
          res.status(400).json({ code: "TEXT_ONLY_PROVIDER", error: "Use Google Gemini for images and PDFs, or remove the attachment." });
          return;
        }
        const search = connection.provider === "google" && Boolean(enableWebSearch);
        const route = { model: connection.model, failoverUsed: false, webSearchUsed: search, router: { routedBy: "manual" } };
        signal.throwIfAborted();
        const reply = await streamOrGenerateCoachReply(connection, {
          system: baseSystemInstruction + SAFE_HARBOR_REMINDER,
          history: formattedHistory.map((item) => ({
            role: item.role === "model" ? "assistant" : "user",
            content: item.parts[0].text
          })),
          prompt: userPromptText,
          attachments: binaryParts,
          webSearch: search
        }, {
          signal,
          ...stream === true ? { stream: { onText: (delta) => {
            if (!isSseStarted) emitSse("route", route);
            emitSse("delta", { text: delta });
          } } } : {}
        });
        if (res.destroyed) return;
        const payload = { ...route, ...reply, timestamp: (/* @__PURE__ */ new Date()).toISOString() };
        if (stream === true) {
          emitSse("done", payload);
          res.end();
        } else {
          res.json(payload);
        }
        return;
      }
      signal.throwIfAborted();
      const routePlan = await planModelRoute({
        prompt: message.trim(),
        hasRichContext: Boolean(safeContext || safeChartContext || attachedDocsText),
        hasVisualOrPdf: hasVisualAttachment || hasPdfAttachment,
        hasPdfAttachment,
        forceWebSearch: Boolean(enableWebSearch),
        preference: connection.model ?? model,
        decisionClient: createDecisionGenAIClient(connection.key)
      });
      signal.throwIfAborted();
      const buildContentsForModel = (candidateModel, suffix) => {
        const allowPdf = modelSupportsPdf(candidateModel);
        const filteredBinary = binaryParts.filter((b) => allowPdf || b.mimeType !== "application/pdf");
        const userParts = [{ text: userPromptText }];
        for (const bin of filteredBinary) {
          userParts.push({ inlineData: { mimeType: bin.mimeType, data: bin.data } });
        }
        const fullSys = baseSystemInstruction + (suffix || SAFE_HARBOR_REMINDER);
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
      const ai = createGoogleAiClient(connection.key);
      const useWebSearch = Boolean(enableWebSearch || routePlan.needsWebSearch);
      if (stream === true) {
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
                abortSignal: signal,
                ...systemInstruction ? { systemInstruction } : {},
                ...shouldSearch ? { tools: [{ googleSearch: {} }] } : {}
              }
            });
            for await (const chunk of responseStream) {
              assertCompleteGoogleReply(chunk.candidates?.[0]?.finishReason);
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
                if (accumulated.length > 256e3) throw new AiUpstreamError(502);
                emitSse("delta", { text: deltaText });
              }
              for (const src of extractGroundingSources(chunk)) {
                if (!seenUris.has(src.uri)) {
                  seenUris.add(src.uri);
                  collectedSources.push(src);
                }
              }
            }
            if (!accumulated.trim()) throw new AiUpstreamError(502);
            if (collectedSources.length > 0) {
              emitSse("sources", { sources: collectedSources });
            }
            emitSse("done", {
              reply: accumulated,
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
            const canRetry = !signal.aborted && accumulated.length === 0 && i < routePlan.candidateModels.length - 1 && isRetryableQuotaOrTransientError(err);
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
        signal.throwIfAborted();
        const shouldSearch = useWebSearch && modelSupportsGoogleSearch(candidateModel);
        const { systemInstruction, contents } = buildContentsForModel(candidateModel, suffix);
        const response = await ai.models.generateContent({
          model: candidateModel,
          contents,
          config: {
            abortSignal: signal,
            ...systemInstruction ? { systemInstruction } : {},
            ...shouldSearch ? { tools: [{ googleSearch: {} }] } : {}
          }
        });
        assertCompleteGoogleReply(response.candidates?.[0]?.finishReason);
        const reply = response.text?.trim();
        if (!reply || reply.length > 256e3) throw new AiUpstreamError(502);
        finalSources = extractGroundingSources(response);
        return reply;
      });
      if (res.destroyed) return;
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
      if (res.destroyed) return;
      const byokRequired = usingPersonalKey && isAiCredentialError(err);
      const quota = aiUpstreamStatus(err) === 429;
      const code = byokRequired ? "BYOK_REQUIRED" : quota ? "RATE_LIMITED" : "AI_PROVIDER_UNAVAILABLE";
      const errorMsg = byokRequired ? BYOK_REQUIRED_MESSAGE : quota ? "The provider limit has been reached. Try again later." : "The AI provider could not complete the request.";
      if (isSseStarted && res.headersSent) {
        if (!res.writableEnded) {
          res.write(`event: error
data: ${JSON.stringify({ code, error: errorMsg })}

`);
          res.end();
        }
        return;
      }
      res.status(byokRequired ? 403 : quota ? 429 : 502).json({ code, error: errorMsg });
    } finally {
      res.off("close", onClose);
    }
  });
  async function authorizeDeskVoice(req, res, bucket) {
    res.set("Cache-Control", "no-store");
    try {
      const access = await resolveDeskAiAccess(req, "voice");
      if (!access.ok) {
        res.status(access.status).json({ error: access.error, code: access.code });
        return null;
      }
      const rate = await checkDistributedRateLimit(`${bucket}:${access.rateSubject}`, bucket === "live" ? 15 : 50);
      if (!rate.allowed) {
        res.set("Retry-After", String(rate.retryAfterSec));
        res.status(429).json({ error: "The voice request limit has been reached. Try again later.", code: "RATE_LIMITED" });
        return null;
      }
      return res.destroyed ? null : access.connection;
    } catch {
      if (!res.destroyed) res.status(502).json({ error: "Voice authorization is temporarily unavailable.", code: "AI_PROVIDER_UNAVAILABLE" });
      return null;
    }
  }
  function sendVoiceCredentialError(res, error, personal) {
    if (!personal || !isAiCredentialError(error)) return false;
    res.status(403).json({ error: BYOK_REQUIRED_MESSAGE, code: "BYOK_REQUIRED" });
    return true;
  }
  function voiceRequestSignal(res) {
    const disconnected = new AbortController();
    res.once("close", () => disconnected.abort());
    return AbortSignal.any([disconnected.signal, AbortSignal.timeout(28e3)]);
  }
  app2.post("/api/ai/transcribe", async (req, res) => {
    const connection = await authorizeDeskVoice(req, res, "voice");
    if (!connection) return;
    const signal = voiceRequestSignal(res);
    try {
      const { audioBase64, mimeType } = asRecord(req.body) ?? {};
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
      const ai = createGoogleAiClient(connection.key);
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
          }, { signal });
          const transcript = (interaction.output_text || "").trim();
          if (transcript) {
            res.json({ text: transcript, model: GEMINI_35_TRANSCRIBE, failoverUsed: false });
            return;
          }
        } catch (err) {
          if (!isRetryableQuotaOrTransientError(err) && ![400, 404].includes(aiUpstreamStatus(err) ?? 0)) {
            throw err;
          }
        }
      }
      const fallbackCandidates = connection.provider === "google" ? [.../* @__PURE__ */ new Set([connection.model || GEMINI_4_HYDROGEN, GEMINI_4_HYDROGEN, GEMINI_FLASH_LITE_35])] : [GEMINI_FLASH_LITE_35, GEMINI_4_HYDROGEN, GEMINI_FLASH_LITE_31];
      let lastErr;
      for (const fallbackModel of fallbackCandidates) {
        signal.throwIfAborted();
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
            ],
            config: { abortSignal: signal }
          });
          assertCompleteGoogleReply(resp.candidates?.[0]?.finishReason);
          const text = (resp.text || "").trim();
          if (text) {
            res.json({ text, model: fallbackModel, failoverUsed: true });
            return;
          }
        } catch (err) {
          lastErr = err;
          if (!isRetryableQuotaOrTransientError(err) && ![400, 404].includes(aiUpstreamStatus(err) ?? 0)) throw err;
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error("Transcription failed");
    } catch (err) {
      if (res.destroyed) return;
      if (!sendVoiceCredentialError(res, err, connection.provider === "google")) {
        res.status(502).json({ error: "The provider could not transcribe this audio.", code: "TRANSCRIBE_FAILED" });
      }
    }
  });
  app2.post("/api/ai/tts", async (req, res) => {
    const connection = await authorizeDeskVoice(req, res, "voice");
    if (!connection) return;
    const signal = voiceRequestSignal(res);
    try {
      const { text, voice, lang } = asRecord(req.body) ?? {};
      const cleanText = stripMarkdownForSpeech(typeof text === "string" ? text : "").slice(0, 1800);
      if (!cleanText) {
        res.status(400).json({ error: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E2A\u0E31\u0E07\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C\u0E40\u0E2A\u0E35\u0E22\u0E07" });
        return;
      }
      const safeVoice = sanitizeVoiceName(voice);
      const ai = createGoogleAiClient(connection.key);
      const ttsModels = [GEMINI_38_FLASH_LITE_TTS, GEMINI_38_FLASH_TTS];
      for (let i = 0; i < ttsModels.length; i++) {
        signal.throwIfAborted();
        const ttsModel = ttsModels[i];
        try {
          const interaction = await ai.interactions.create({
            model: ttsModel,
            store: false,
            input: cleanText,
            response_modalities: ["audio"],
            generation_config: {
              speech_config: [{ voice: safeVoice, language: lang === "en" ? "en" : "th" }]
            }
          }, { signal });
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
          if (sendVoiceCredentialError(res, err, connection.provider === "google")) return;
          if (!isRetryableQuotaOrTransientError(err) && ![400, 404].includes(aiUpstreamStatus(err) ?? 0)) break;
        }
      }
      res.json({ ok: true, fallbackClientTts: true });
    } catch {
      if (!res.destroyed) res.json({ ok: true, fallbackClientTts: true });
    }
  });
  app2.post("/api/ai/live-token", async (req, res) => {
    const connection = await authorizeDeskVoice(req, res, "live");
    if (!connection) return;
    const signal = voiceRequestSignal(res);
    try {
      const { mode, voice, deskContext, liveChartContext } = asRecord(req.body) ?? {};
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
${safeChart}` : ""}${SAFE_HARBOR_REMINDER}`;
      const now = Date.now();
      const expireTime = new Date(now + 30 * 60 * 1e3).toISOString();
      const newSessionExpireTime = new Date(now + 90 * 1e3).toISOString();
      const apiVersion = "v1beta";
      const tokenClient = createGoogleAiClient(connection.key, apiVersion);
      const candidateLiveModels = liveMode === "thinking" ? [GEMINI_38_LIVE_THINKING, GEMINI_38_LIVE] : [GEMINI_38_LIVE];
      let lastErr;
      for (const candidateModel of candidateLiveModels) {
        signal.throwIfAborted();
        try {
          const authToken = await tokenClient.authTokens.create({
            config: {
              abortSignal: signal,
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
                  ...candidateModel === GEMINI_38_LIVE_THINKING ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}
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
              apiVersion,
              expiresAt: expireTime,
              newSessionExpiresAt: newSessionExpireTime,
              voice: safeVoice,
              lockedConstraints: true
            });
            return;
          }
        } catch (err) {
          signal.throwIfAborted();
          if (isAiCredentialError(err)) throw err;
          lastErr = err;
          try {
            const minimalToken = await tokenClient.authTokens.create({
              config: {
                abortSignal: signal,
                uses: 1,
                expireTime,
                newSessionExpireTime,
                liveConnectConstraints: {
                  model: candidateModel,
                  config: {
                    responseModalities: [Modality.AUDIO],
                    systemInstruction: { parts: [{ text: liveInstruction }] },
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: safeVoice } } },
                    inputAudioTranscription: {},
                    outputAudioTranscription: {}
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
                apiVersion,
                expiresAt: expireTime,
                newSessionExpiresAt: newSessionExpireTime,
                voice: safeVoice,
                lockedConstraints: true
              });
              return;
            }
          } catch (innerErr) {
            if (isAiCredentialError(innerErr)) throw innerErr;
            lastErr = innerErr;
          }
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error("Failed to mint ephemeral Live token");
    } catch (err) {
      if (res.destroyed) return;
      if (!sendVoiceCredentialError(res, err, connection.provider === "google")) {
        res.status(502).json({ error: "The provider could not create a temporary Live token.", code: "LIVE_TOKEN_FAILED" });
      }
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
      devEphemeralSsoSecret = crypto2.randomBytes(32).toString("hex");
    }
    return devEphemeralSsoSecret;
  }
  const signSsoPayload = (payload, key) => {
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const sig = crypto2.createHmac("sha256", key).update(encoded).digest("base64url");
    return `${encoded}.${sig}`;
  };
  const verifySsoToken = (token, key) => {
    const parts = String(token || "").trim().split(".");
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expectedSig = crypto2.createHmac("sha256", key).update(encoded).digest("base64url");
    const sigBuf = Buffer.from(sig, "utf8");
    const expBuf = Buffer.from(expectedSig, "utf8");
    if (sigBuf.length !== expBuf.length || !crypto2.timingSafeEqual(sigBuf, expBuf)) return null;
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
  app2.post("/api/auth/sso-handoff", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const caller = await verifyFirebaseBearerToken(req.headers.authorization);
    if (!caller) {
      res.status(401).json({ ok: false, error: "Authentication required for SSO handoff." });
      return;
    }
    const ssoHmacKey = getSsoSigningKey();
    if (!ssoHmacKey) {
      res.status(503).json({ ok: false, error: "TALLYNX_SSO_SECRET is not configured on the server." });
      return;
    }
    const email = caller.email?.trim() || void 0;
    const displayName = caller.displayName?.trim() || (email ? email.split("@")[0] : void 0);
    const rawBase = (email ? email.split("@")[0] : displayName || `trader_${caller.uid.slice(0, 8)}`).normalize("NFKC").toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32);
    const handle = `@${rawBase || `trader_${caller.uid.slice(0, 8)}`}`;
    const expSec = Math.floor(Date.now() / 1e3) + 300;
    const ssoToken = signSsoPayload({
      handle,
      sub: caller.uid,
      ...email ? { email } : {},
      ...displayName ? { displayName } : {},
      exp: expSec,
      nonce: crypto2.randomUUID()
    }, ssoHmacKey);
    res.json({
      ok: true,
      token: ssoToken,
      ssoToken,
      handle,
      ...email ? { email } : {},
      ...displayName ? { displayName } : {},
      expiresInSec: 300
    });
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
    hasActiveBridgeFeed: (bridgeKey) => Boolean(bridgeKey && isValidTredynApiKey(bridgeKey) && getLiveBridgeFeed(bridgeKey)),
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
  app2.get("/api/telemetry/stream", async (req, res) => {
    const authHeader = req.headers.authorization || (typeof req.query.token === "string" && req.query.token.trim() ? `Bearer ${req.query.token.trim()}` : void 0);
    const caller = await verifyFirebaseBearerToken(authHeader, false);
    if (!caller) {
      res.setHeader("Cache-Control", "no-store");
      res.status(401).json({ ok: false, code: "AUTH_REQUIRED", error: "Authentication required for live telemetry stream." });
      return;
    }
    const subscribedKeyHashes = /* @__PURE__ */ new Set();
    const rawHashes = typeof req.query.keyHashes === "string" ? req.query.keyHashes : "";
    for (const part of rawHashes.split(",").slice(0, 16)) {
      const clean = part.trim().toLowerCase();
      if (/^[a-f0-9]{64}$/.test(clean)) {
        const existingOwner = bridgeKeyOwners.get(clean);
        if (!existingOwner || existingOwner === caller.uid) {
          subscribedKeyHashes.add(clean);
        }
      }
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write("retry: 10000\n\n");
    const sendEvent = (eventName, data) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ event: eventName, payload: data, ts: (/* @__PURE__ */ new Date()).toISOString() })}

`);
      }
    };
    sendEvent("account.heartbeat", { stream: "SSE_LIVE", readOnlyVerified: true });
    const onBridgePush = (evt) => {
      const record = asRecord(evt);
      const keyHash = typeof record?.keyHash === "string" ? record.keyHash : "";
      if (!keyHash) return;
      const ownerUid = bridgeKeyOwners.get(keyHash) ?? (typeof record?.ownerUid === "string" ? record.ownerUid : null);
      const allowed = ownerUid ? ownerUid === caller.uid : subscribedKeyHashes.has(keyHash);
      if (!allowed) return;
      sendEvent("bridge.push", record?.payload ?? {});
    };
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
    const maxLifetimeMs = process.env.VERCEL || process.env.VERCEL_ENV ? 25e3 : 5 * 6e4;
    const lifetimeTimer = setTimeout(() => {
      if (!res.writableEnded) {
        sendEvent("account.heartbeat", { stream: "SSE_LIVE", reconnect: true });
        res.end();
      }
    }, maxLifetimeMs);
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      clearInterval(timer);
      clearTimeout(lifetimeTimer);
      telemetryBus.off("bridge_push", onBridgePush);
      telemetryBus.off("desk_room_update", onDeskUpdate);
      telemetryBus.off("mall.chat", onMallChat);
      telemetryBus.off("mall.presence", onMallPresence);
    };
    res.on("close", cleanup);
    res.on("finish", cleanup);
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
  app2.use("/api", createByokRouter({
    resolvePlatformAiPrivilege: resolveCallerPlatformAiPrivilege,
    isPlatformConfigured: () => Boolean(getPlatformGeminiKey()),
    checkDistributedRateLimit,
    env: process.env
  }));
  app2.use("/api", createRiskSuperviseRouter({ resolveDeskAiAccess, checkDistributedRateLimit }));
  app2.use("/api", createComexBridgeRouter({ fetchLiveSpotQuote }));
  app2.use("/api", createSiteTrafficRouter({ defaultSite: "desk" }));
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
      express5.static(distPath, {
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
