import { GoogleGenAI } from '@google/genai';

export const GEMINI_DECISION_MODEL = 'gemini-decision-1' as const;
export const GEMINI_4_HYDROGEN = 'gemini-4-hydrogen' as const;
export const GEMINI_FLASH_LITE_35 = 'gemini-3.5-flash-lite' as const;
export const GEMINI_FLASH_LITE_31 = 'gemini-3.1-flash-lite' as const;
export const GEMMA_4_31B_IT = 'gemma-4-31b-it' as const;
export const GEMMA_4_26B_A4B_IT = 'gemma-4-26b-a4b-it' as const;

export const GEMINI_38_LIVE = 'gemini-3.8-live' as const;
export const GEMINI_38_LIVE_THINKING = 'gemini-3.8-live-extended-thinking' as const;
export const GEMINI_35_TRANSCRIBE = 'gemini-3.5-transcribe' as const;
export const GEMINI_38_FLASH_LITE_TTS = 'gemini-3.8-flash-lite-tts' as const;
export const GEMINI_38_FLASH_TTS = 'gemini-3.8-flash-tts' as const;

export const FREE_TIER_CHAT_MODELS = [
  GEMINI_4_HYDROGEN,
  GEMINI_FLASH_LITE_35,
  GEMINI_FLASH_LITE_31,
  GEMMA_4_31B_IT,
  GEMMA_4_26B_A4B_IT,
] as const;

export type GeminiGenerationModel = (typeof FREE_TIER_CHAT_MODELS)[number];

export type ChatModelPreference = 'auto' | GeminiGenerationModel;

export type DecisionRouteTier =
  | 'frontier_multimodal'
  | 'balanced_analysis'
  | 'deep_open_reasoning'
  | 'quick_reply';

export interface FreeTierModelInfo {
  id: GeminiGenerationModel;
  label: string;
  shortLabel: string;
  badge: string;
  tier: DecisionRouteTier;
  supportsVision: boolean;
  supportsPdf: boolean;
  supportsGoogleSearch: boolean;
  supportsThinking: boolean;
  descriptionTh: string;
}

export const FREE_TIER_MODEL_CATALOG: readonly FreeTierModelInfo[] = [
  {
    id: GEMINI_4_HYDROGEN,
    label: 'Gemini 4 Hydrogen (Frontier Free)',
    shortLabel: '4 Hydrogen',
    badge: '1M · Frontier',
    tier: 'frontier_multimodal',
    supportsVision: true,
    supportsPdf: true,
    supportsGoogleSearch: true,
    supportsThinking: true,
    descriptionTh: 'อ่านกราฟและ PDF แบบละเอียด วิเคราะห์พอร์ตหลายขั้น และอ้างอิงข้อมูลจากเว็บ (1M context)',
  },
  {
    id: GEMINI_FLASH_LITE_35,
    label: 'Gemini 3.5 Flash-Lite (Balanced)',
    shortLabel: '3.5 Lite',
    badge: '1M · Balanced',
    tier: 'balanced_analysis',
    supportsVision: true,
    supportsPdf: true,
    supportsGoogleSearch: true,
    supportsThinking: true,
    descriptionTh: 'สมดุลความเร็วและความละเอียด เหมาะกับการคำนวณความเสี่ยง GHR 3-TP และกฎ 40%',
  },
  {
    id: GEMINI_FLASH_LITE_31,
    label: 'Gemini 3.1 Flash-Lite (Fast)',
    shortLabel: '3.1 Lite',
    badge: 'Ultra-Fast',
    tier: 'quick_reply',
    supportsVision: true,
    supportsPdf: true,
    supportsGoogleSearch: true,
    supportsThinking: false,
    descriptionTh: 'ตอบคำถามสั้น เช็กค่าบนหน้าจอ หรือช่วยหาวิธีใช้เมนู',
  },
  {
    id: GEMMA_4_31B_IT,
    label: 'Gemma 4 31B (Open Dense)',
    shortLabel: 'Gemma 31B',
    badge: 'Open · High RPD',
    tier: 'deep_open_reasoning',
    supportsVision: true,
    supportsPdf: false,
    supportsGoogleSearch: false,
    supportsThinking: false,
    descriptionTh: 'โมเดลเปิด Gemma 4 Dense 31B โควต้ารายวันสูง เหมาะกับทบทวนสถิติ Journal และคณิตศาสตร์ความเสี่ยง',
  },
  {
    id: GEMMA_4_26B_A4B_IT,
    label: 'Gemma 4 26B MoE (High RPD)',
    shortLabel: 'Gemma 26B MoE',
    badge: 'MoE · High RPM',
    tier: 'quick_reply',
    supportsVision: true,
    supportsPdf: false,
    supportsGoogleSearch: false,
    supportsThinking: false,
    descriptionTh: 'โมเดล Mixture-of-Experts 26B/4B active ไวเป็นพิเศษและรับ RPM/RPD ได้มากบน Free Tier',
  },
] as const;

const MODEL_CAPABILITY_MAP: Record<GeminiGenerationModel, FreeTierModelInfo> = {
  [GEMINI_4_HYDROGEN]: FREE_TIER_MODEL_CATALOG[0],
  [GEMINI_FLASH_LITE_35]: FREE_TIER_MODEL_CATALOG[1],
  [GEMINI_FLASH_LITE_31]: FREE_TIER_MODEL_CATALOG[2],
  [GEMMA_4_31B_IT]: FREE_TIER_MODEL_CATALOG[3],
  [GEMMA_4_26B_A4B_IT]: FREE_TIER_MODEL_CATALOG[4],
};

const TIER_CASCADES: Record<DecisionRouteTier, readonly GeminiGenerationModel[]> = {
  frontier_multimodal: [
    GEMINI_4_HYDROGEN,
    GEMINI_FLASH_LITE_35,
    GEMMA_4_31B_IT,
    GEMINI_FLASH_LITE_31,
    GEMMA_4_26B_A4B_IT,
  ],
  balanced_analysis: [
    GEMINI_FLASH_LITE_35,
    GEMINI_4_HYDROGEN,
    GEMMA_4_31B_IT,
    GEMINI_FLASH_LITE_31,
    GEMMA_4_26B_A4B_IT,
  ],
  deep_open_reasoning: [
    GEMMA_4_31B_IT,
    GEMINI_FLASH_LITE_35,
    GEMMA_4_26B_A4B_IT,
    GEMINI_4_HYDROGEN,
    GEMINI_FLASH_LITE_31,
  ],
  quick_reply: [
    GEMINI_FLASH_LITE_31,
    GEMMA_4_26B_A4B_IT,
    GEMINI_FLASH_LITE_35,
    GEMMA_4_31B_IT,
    GEMINI_4_HYDROGEN,
  ],
};

export interface DecisionRoutePlan {
  requestedPreference: ChatModelPreference;
  candidateModels: GeminiGenerationModel[];
  routedBy: 'decision-1' | 'heuristic' | 'manual';
  routeTier: DecisionRouteTier;
  decisionConfidence: number;
  asksForTradeSignal: boolean;
  needsWebSearch: boolean;
  hasPdfAttachment?: boolean;
  decisionModel: typeof GEMINI_DECISION_MODEL;
}

export interface OrchestratedResult {
  reply: string;
  model: GeminiGenerationModel;
  failoverUsed: boolean;
  attemptedModels: GeminiGenerationModel[];
  route: DecisionRoutePlan;
}

export interface DecisionClientLike {
  decisions: {
    create: (params: {
      model: string;
      input: string;
      questions: Record<
        string,
        | {
            type: 'choice';
            instructions: string;
            criteria: Record<string, string>;
          }
        | {
            type: 'noul';
            instructions: string;
            criteria?: {
              true_description?: string;
              false_description?: string;
            };
          }
      >;
    }) => Promise<{
      answers?: Record<
        string,
        | {
            type: 'choice';
            choice: string;
            confidence: number;
          }
        | {
            type: 'noul';
            noul: number;
            confidence: number;
          }
        | Record<string, unknown>
      >;
    }>;
  };
}

export const SAFE_HARBOR_REMINDER =
  '\n\n[Decision-1 Compliance Guard]: User query may request trade signals or profit predictions. Strictly decline giving buy/sell signals, entry targets, or profit guarantees; provide only objective risk math, drawdown telemetry, and discipline rules.';

export function modelSupportsGoogleSearch(model: GeminiGenerationModel): boolean {
  return MODEL_CAPABILITY_MAP[model]?.supportsGoogleSearch ?? false;
}

export function modelSupportsPdf(model: GeminiGenerationModel): boolean {
  return MODEL_CAPABILITY_MAP[model]?.supportsPdf ?? false;
}

export function isOpenWeightGemmaModel(model: GeminiGenerationModel): boolean {
  return model === GEMMA_4_31B_IT || model === GEMMA_4_26B_A4B_IT;
}

export function normalizeChatModelPreference(raw: unknown): ChatModelPreference {
  if (typeof raw === 'string' && (FREE_TIER_CHAT_MODELS as readonly string[]).includes(raw)) {
    return raw as GeminiGenerationModel;
  }
  return 'auto';
}

export function detectWebSearchNeed(prompt: string): boolean {
  const normalized = prompt.trim().toLowerCase();
  return /^\/search\b|\b(fomc|cpi|nfp|powell|fed|ecb|boe|news|headline|breaking|today|latest|prop\s*firm\s*rules|fundednext\s*update|ftmo\s*update)\b|(ข่าว|ดอกเบี้ย|เฟด|ตัวเลขเศรษฐกิจ|ข่าวแรง|อัปเดตกฎ|ล่าสุดวันนี้)/i.test(
    normalized,
  );
}

export function heuristicRouteTier(
  prompt: string,
  hasRichContext: boolean,
  hasVisualOrPdf = false,
): DecisionRouteTier {
  const normalized = prompt.trim().toLowerCase();
  if (
    hasVisualOrPdf ||
    normalized.length >= 260 ||
    /(screenshot|chart\s*image|pdf|multi-step|architecture|audit|strategy|portfolio\s*review|compare\s*all|วิเคราะห์กราฟจากภาพ|เทียบทุกพอร์ต|แผนระยะยาว|วิเคราะห์เชิงลึก)/i.test(
      normalized,
    )
  ) {
    return 'frontier_multimodal';
  }
  if (
    /(journal|expectancy|kelly|variance|simulation|statistics|winrate|profit\s*factor|math|review\s*trades|สถิติ|ทบทวน|จุดรั่วไหล|ค่าคาดหวัง|ความน่าจะเป็น)/i.test(
      normalized,
    )
  ) {
    return 'deep_open_reasoning';
  }
  if (
    hasRichContext ||
    normalized.length >= 90 ||
    /(drawdown|consistency|risk|lot|12-gate|ghr|3-tp|trailing\s*lock|วิเคราะห์|วางแผน|คำนวณ|พอร์ต|ความเสี่ยง|กฎ\s*40%|อ่านหน้านี้)/i.test(
      normalized,
    )
  ) {
    return 'balanced_analysis';
  }
  return 'quick_reply';
}

export function isRetryableQuotaOrTransientError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  if (!msg) return true;
  if (/API_KEY_INVALID|PERMISSION_DENIED|UNAUTHENTICATED|\b401\b|\b403\b/i.test(msg)) {
    return false;
  }
  if (/INVALID_ARGUMENT/i.test(msg)) {
    return /unsupported|tool|search|mime|pdf|modality|document|system.?instruction|developer.?instruction/i.test(
      msg,
    );
  }
  return /RESOURCE_EXHAUSTED|TOO_MANY_REQUESTS|UNAVAILABLE|DEADLINE_EXCEEDED|NOT_FOUND|\b429\b|\b500\b|\b502\b|\b503\b|\b504\b|\b404\b|quota|rate.?limit|overloaded/i.test(
    msg,
  );
}

function orderCascadeForCapabilities(
  cascade: readonly GeminiGenerationModel[],
  options: { hasPdfAttachment: boolean; prioritizeSearch: boolean },
): GeminiGenerationModel[] {
  const list = [...cascade];
  if (options.hasPdfAttachment) {
    return [
      ...list.filter((m) => modelSupportsPdf(m)),
      ...list.filter((m) => !modelSupportsPdf(m)),
    ];
  }
  if (options.prioritizeSearch) {
    return [
      ...list.filter((m) => modelSupportsGoogleSearch(m)),
      ...list.filter((m) => !modelSupportsGoogleSearch(m)),
    ];
  }
  return list;
}

export async function planModelRoute(params: {
  prompt: string;
  hasRichContext?: boolean;
  hasVisualOrPdf?: boolean;
  hasPdfAttachment?: boolean;
  forceWebSearch?: boolean;
  preference?: unknown;
  decisionClient?: DecisionClientLike | null;
}): Promise<DecisionRoutePlan> {
  const pref = normalizeChatModelPreference(params.preference);
  const hasRichContext = Boolean(params.hasRichContext);
  const hasVisualOrPdf = Boolean(params.hasVisualOrPdf);
  const hasPdfAttachment = Boolean(params.hasPdfAttachment);
  const forceWebSearch = Boolean(params.forceWebSearch);
  const heuristicSignal =
    /(buy|sell|signal|entry\s*now|call\s*trade|tp|sl|target\s*price|แนะนำเข้า|จุดเข้า|ซิก|สัญญาณ|กำไรแน่นอน|ฟันธง)/i.test(
      params.prompt,
    );
  const heuristicSearch = forceWebSearch || detectWebSearchNeed(params.prompt);

  if (pref !== 'auto') {
    const info = MODEL_CAPABILITY_MAP[pref];
    const remaining = FREE_TIER_CHAT_MODELS.filter((m) => m !== pref);
    return {
      requestedPreference: pref,
      candidateModels: [pref, ...remaining],
      routedBy: 'manual',
      routeTier: info.tier,
      decisionConfidence: 1,
      asksForTradeSignal: heuristicSignal,
      needsWebSearch: heuristicSearch,
      hasPdfAttachment,
      decisionModel: GEMINI_DECISION_MODEL,
    };
  }

  let routeTier: DecisionRouteTier = heuristicRouteTier(
    params.prompt,
    hasRichContext,
    hasVisualOrPdf || hasPdfAttachment,
  );
  let routedBy: DecisionRoutePlan['routedBy'] = 'heuristic';
  let decisionConfidence = 0.5;
  let asksForTradeSignal = heuristicSignal;
  let needsWebSearch = heuristicSearch;

  if (params.decisionClient) {
    try {
      const response = await params.decisionClient.decisions.create({
        model: GEMINI_DECISION_MODEL,
        input: `User message: ${params.prompt.slice(0, 1500)} | Context: ${hasRichContext ? 'yes' : 'no'} | VisualOrPdf: ${
          hasVisualOrPdf || hasPdfAttachment ? 'yes' : 'no'
        }`,
        questions: {
          task_tier: {
            type: 'choice',
            instructions:
              'Route the request across Google API Free Tier models based on reasoning depth, visual/document complexity, and latency sensitivity.',
            criteria: {
              frontier_multimodal:
                'Chart images or PDFs that need detailed review, multi-step portfolio analysis, macroeconomic analysis, or strategy planning with multiple constraints.',
              balanced_analysis:
                'Desk calculation checks (3-TP, RRR, 40% consistency, 12-Gate, active page analysis) needing balanced speed and accuracy.',
              deep_open_reasoning:
                'Trade journal statistical pattern review, mathematical expectancy calculations, or long textual reflection suitable for Gemma 4 31B.',
              quick_reply:
                'Greeting, brief definition, quick metric check, or simple navigation/UI help.',
            },
          },
          needs_web_search: {
            type: 'noul',
            instructions:
              'Does answering accurately require current real-world web information such as today macro news (FOMC/CPI/NFP/gold news) or up-to-date prop firm rules?',
          },
          asks_for_trade_signal: {
            type: 'noul',
            instructions:
              'Is the user asking for direct buy/sell trade signals, directional entry calls, financial advice, or guaranteed profit?',
          },
        },
      });

      const tierAns = response.answers?.task_tier;
      if (tierAns && 'type' in tierAns && tierAns.type === 'choice') {
        const chosen = tierAns.choice;
        if (
          chosen === 'frontier_multimodal' ||
          chosen === 'balanced_analysis' ||
          chosen === 'deep_open_reasoning' ||
          chosen === 'quick_reply'
        ) {
          routeTier = chosen;
          decisionConfidence =
            typeof tierAns.confidence === 'number' ? Number(tierAns.confidence.toFixed(3)) : 0.78;
          routedBy = 'decision-1';
        }
      }

      const searchAns = response.answers?.needs_web_search;
      if (
        !forceWebSearch &&
        searchAns &&
        'type' in searchAns &&
        searchAns.type === 'noul' &&
        typeof searchAns.noul === 'number'
      ) {
        needsWebSearch = needsWebSearch || searchAns.noul >= 0.65;
      }

      const signalAns = response.answers?.asks_for_trade_signal;
      if (
        signalAns &&
        'type' in signalAns &&
        signalAns.type === 'noul' &&
        typeof signalAns.noul === 'number'
      ) {
        asksForTradeSignal = signalAns.noul >= 0.65;
      }
    } catch {
      // Fail-open to deterministic heuristic so a Decision API error never blocks AI chat
    }
  }

  const candidateModels = orderCascadeForCapabilities(TIER_CASCADES[routeTier], {
    hasPdfAttachment,
    prioritizeSearch: needsWebSearch,
  });

  return {
    requestedPreference: 'auto',
    candidateModels,
    routedBy,
    routeTier,
    decisionConfidence,
    asksForTradeSignal,
    needsWebSearch,
    hasPdfAttachment,
    decisionModel: GEMINI_DECISION_MODEL,
  };
}

export async function executeWithModelFailover(
  route: DecisionRoutePlan,
  runModel: (model: GeminiGenerationModel, systemInstructionSuffix: string) => Promise<string>,
): Promise<OrchestratedResult> {
  const suffix = route.asksForTradeSignal ? SAFE_HARBOR_REMINDER : '';
  const attemptedModels: GeminiGenerationModel[] = [];
  let lastError: unknown;

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
        route,
      };
    } catch (err) {
      lastError = err;
      const canRetryNext = i < route.candidateModels.length - 1 && isRetryableQuotaOrTransientError(err);
      if (!canRetryNext) {
        throw err;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('All Free Tier Gemini/Gemma candidates failed');
}

export const executeWithFlashLiteFailover = executeWithModelFailover;

export function createDecisionGenAIClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    vertexai: false,
    httpOptions: {
      apiVersion: 'v1beta',
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}
