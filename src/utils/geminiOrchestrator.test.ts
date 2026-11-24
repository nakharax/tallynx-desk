import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FREE_TIER_CHAT_MODELS,
  FREE_TIER_MODEL_CATALOG,
  GEMINI_35_TRANSCRIBE,
  GEMINI_38_FLASH_LITE_TTS,
  GEMINI_38_FLASH_TTS,
  GEMINI_38_LIVE,
  GEMINI_38_LIVE_THINKING,
  GEMINI_4_HYDROGEN,
  GEMINI_DECISION_MODEL,
  GEMINI_FLASH_LITE_31,
  GEMINI_FLASH_LITE_35,
  GEMMA_4_26B_A4B_IT,
  GEMMA_4_31B_IT,
  executeWithModelFailover,
  modelSupportsGoogleSearch,
  modelSupportsPdf,
  normalizeChatModelPreference,
  planModelRoute,
  type DecisionClientLike,
} from './geminiOrchestrator.ts';

test('geminiOrchestrator exports complete 2026 Google API Free Tier & audio/live model IDs', () => {
  assert.equal(GEMINI_DECISION_MODEL, 'gemini-decision-1');
  assert.equal(GEMINI_4_HYDROGEN, 'gemini-4-hydrogen');
  assert.equal(GEMINI_FLASH_LITE_35, 'gemini-3.5-flash-lite');
  assert.equal(GEMINI_FLASH_LITE_31, 'gemini-3.1-flash-lite');
  assert.equal(GEMMA_4_31B_IT, 'gemma-4-31b-it');
  assert.equal(GEMMA_4_26B_A4B_IT, 'gemma-4-26b-a4b-it');
  assert.equal(GEMINI_38_LIVE, 'gemini-3.8-live');
  assert.equal(GEMINI_38_LIVE_THINKING, 'gemini-3.8-live-extended-thinking');
  assert.equal(GEMINI_35_TRANSCRIBE, 'gemini-3.5-transcribe');
  assert.equal(GEMINI_38_FLASH_LITE_TTS, 'gemini-3.8-flash-lite-tts');
  assert.equal(GEMINI_38_FLASH_TTS, 'gemini-3.8-flash-tts');

  assert.equal(FREE_TIER_CHAT_MODELS.length, 5);
  assert.equal(FREE_TIER_MODEL_CATALOG.length, 5);
  assert.equal(modelSupportsGoogleSearch(GEMINI_4_HYDROGEN), true);
  assert.equal(modelSupportsGoogleSearch(GEMMA_4_31B_IT), false);
  assert.equal(modelSupportsPdf(GEMINI_FLASH_LITE_35), true);
  assert.equal(modelSupportsPdf(GEMMA_4_26B_A4B_IT), false);
});

test('normalizeChatModelPreference accepts all 5 free-tier models and rejects unknown IDs', () => {
  for (const m of FREE_TIER_CHAT_MODELS) {
    assert.equal(normalizeChatModelPreference(m), m);
  }
  assert.equal(normalizeChatModelPreference('auto'), 'auto');
  assert.equal(normalizeChatModelPreference('gemini-2.0-flash'), 'auto');
  assert.equal(normalizeChatModelPreference(undefined), 'auto');
});

test('planModelRoute routes frontier_multimodal via decision-1 to gemini-4-hydrogen first', async () => {
  const mockDecision: DecisionClientLike = {
    decisions: {
      create: async () => ({
        answers: {
          task_tier: { type: 'choice', choice: 'frontier_multimodal', confidence: 0.94 },
          needs_web_search: { type: 'noul', noul: 0.2, confidence: 0.85 },
          asks_for_trade_signal: { type: 'noul', noul: 0.1, confidence: 0.9 },
        },
      }),
    },
  };

  const plan = await planModelRoute({
    prompt: 'Review attached H1/M5 chart image and full Prop Firm DD portfolio audit.',
    hasRichContext: true,
    hasVisualOrPdf: true,
    preference: 'auto',
    decisionClient: mockDecision,
  });

  assert.equal(plan.routedBy, 'decision-1');
  assert.equal(plan.routeTier, 'frontier_multimodal');
  assert.equal(plan.candidateModels[0], GEMINI_4_HYDROGEN);
  assert.equal(plan.candidateModels.length, 5);
  assert.equal(plan.asksForTradeSignal, false);
});

test('planModelRoute routes deep_open_reasoning to gemma-4-31b-it when no PDF or Search needed', async () => {
  const mockDecision: DecisionClientLike = {
    decisions: {
      create: async () => ({
        answers: {
          task_tier: { type: 'choice', choice: 'deep_open_reasoning', confidence: 0.89 },
          needs_web_search: { type: 'noul', noul: 0.05, confidence: 0.92 },
          asks_for_trade_signal: { type: 'noul', noul: 0.08, confidence: 0.95 },
        },
      }),
    },
  };

  const plan = await planModelRoute({
    prompt: 'Analyze my 30-trade journal statistical expectancy and RRR variance.',
    preference: 'auto',
    decisionClient: mockDecision,
  });

  assert.equal(plan.routedBy, 'decision-1');
  assert.equal(plan.routeTier, 'deep_open_reasoning');
  assert.equal(plan.candidateModels[0], GEMMA_4_31B_IT);
  assert.equal(plan.needsWebSearch, false);
});

test('planModelRoute prioritizes Gemini search/PDF models when PDF or Web Search is required', async () => {
  const mockDecision: DecisionClientLike = {
    decisions: {
      create: async () => ({
        answers: {
          task_tier: { type: 'choice', choice: 'deep_open_reasoning', confidence: 0.85 },
          needs_web_search: { type: 'noul', noul: 0.88, confidence: 0.91 },
          asks_for_trade_signal: { type: 'noul', noul: 0.91, confidence: 0.95 },
        },
      }),
    },
  };

  const plan = await planModelRoute({
    prompt: 'Should I buy XAUUSD right before FOMC news today? Check the attached PDF statement.',
    hasPdfAttachment: true,
    preference: 'auto',
    decisionClient: mockDecision,
  });

  assert.equal(plan.needsWebSearch, true);
  assert.equal(plan.asksForTradeSignal, true);
  assert.equal(modelSupportsPdf(plan.candidateModels[0]), true);
  assert.equal(modelSupportsGoogleSearch(plan.candidateModels[0]), true);
});

test('planModelRoute fails open to deterministic heuristic when gemini-decision-1 throws 429', async () => {
  const brokenDecision: DecisionClientLike = {
    decisions: {
      create: async () => {
        throw new Error('429 RESOURCE_EXHAUSTED');
      },
    },
  };

  const plan = await planModelRoute({
    prompt: 'Hello!',
    preference: 'auto',
    decisionClient: brokenDecision,
  });

  assert.equal(plan.routedBy, 'heuristic');
  assert.equal(plan.routeTier, 'quick_reply');
  assert.deepEqual(plan.candidateModels, [
    GEMINI_FLASH_LITE_31,
    GEMMA_4_26B_A4B_IT,
    GEMINI_FLASH_LITE_35,
    GEMMA_4_31B_IT,
    GEMINI_4_HYDROGEN,
  ]);
});

test('executeWithModelFailover cascades smoothly across Free Tier models on 429', async () => {
  const plan = await planModelRoute({
    prompt: 'Analyze MT5 risk telemetry',
    preference: GEMINI_4_HYDROGEN,
  });

  const called: string[] = [];
  const result = await executeWithModelFailover(plan, async (model) => {
    called.push(model);
    if (model === GEMINI_4_HYDROGEN || model === GEMINI_FLASH_LITE_35) {
      throw new Error('429 RESOURCE_EXHAUSTED: free tier RPM exceeded');
    }
    return 'Telemetry verified via 5-model free-tier cascade';
  });

  assert.deepEqual(called, [GEMINI_4_HYDROGEN, GEMINI_FLASH_LITE_35, GEMINI_FLASH_LITE_31]);
  assert.equal(result.model, GEMINI_FLASH_LITE_31);
  assert.equal(result.failoverUsed, true);
  assert.equal(result.reply, 'Telemetry verified via 5-model free-tier cascade');
});

test('executeWithModelFailover does not swallow 401/403 API key errors', async () => {
  const plan = await planModelRoute({
    prompt: 'Hi',
    preference: GEMINI_FLASH_LITE_31,
  });

  await assert.rejects(
    executeWithModelFailover(plan, async () => {
      throw new Error('403 API_KEY_INVALID');
    }),
    /API_KEY_INVALID/,
  );
});
