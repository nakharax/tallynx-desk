import type { GoogleGenAI } from '@google/genai';
import express, { type Request, type Response } from 'express';
import {
  executeWithModelFailover,
  isOpenWeightGemmaModel,
  planModelRoute,
} from '../../src/utils/geminiOrchestrator.js';
import { computeQuantSupervisionSnapshot } from '../../src/utils/quantSupervisionEngine.js';
import {
  buildDeterministicSupervisionReport,
  buildRiskSupervisionResponseSchema,
  parseRiskSuperviseRequest,
  sanitizeAiRiskSupervisionReport,
  type RiskSupervisionFallbackReason,
} from '../../src/utils/riskSupervisionReport.js';

interface RiskSuperviseDependencies {
  verifyFirebaseBearerToken: (authorization: string | undefined) => Promise<{ uid: string } | null>;
  checkDistributedRateLimit: (key: string) => Promise<{ allowed: boolean; retryAfterSec: number }>;
  getGenAIClient: () => Pick<GoogleGenAI, 'models'>;
  isGeminiConfigured: () => boolean;
}

function parseModelJson(response: string): unknown {
  try {
    return JSON.parse(response);
  } catch {
    return null;
  }
}

export function createRiskSuperviseRouter(deps: RiskSuperviseDependencies) {
  const router = express.Router();
  router.post('/ai/risk-supervise', async (req: Request<object, unknown, unknown>, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const request = parseRiskSuperviseRequest(req.body);
    if (!request) {
      res.status(400).json({ ok: false, code: 'INVALID_MARKET_SNAPSHOT', error: 'Provide a supported symbol and timeframe with valid OHLC candles.' });
      return;
    }

    const { symbol, timeframe, candles, portfolio, lang } = request;
    const snapshot = computeQuantSupervisionSnapshot(symbol, timeframe, candles, portfolio);
    const deterministic = buildDeterministicSupervisionReport(snapshot, lang, new Date().toISOString());
    function sendFallback(reason: RiskSupervisionFallbackReason, status = 200) {
      const report = { ...deterministic, fallbackReason: reason };
      const payload = { fallbackUsed: true, fallbackReason: reason };
      if (status === 401) {
        res.status(status).json({ ok: false, code: 'AUTH_REQUIRED', ...payload, deterministicReport: report });
      } else {
        res.status(status).json({ ok: status === 200, ...payload, report });
      }
    }

    const caller = await deps.verifyFirebaseBearerToken(req.headers.authorization).catch(() => null);
    if (!caller) {
      sendFallback('AUTH_REQUIRED', 401);
      return;
    }
    try {
      if (!deps.isGeminiConfigured()) {
        sendFallback('GEMINI_API_KEY_MISSING');
        return;
      }
      const rate = await deps.checkDistributedRateLimit(`risk-supervise:${caller.uid}`);
      if (!rate.allowed) {
        res.set('Retry-After', String(rate.retryAfterSec));
        sendFallback('RATE_LIMITED', 429);
        return;
      }
      const prompt = 'Select the most relevant approved analysis and review checklist for this observed market and account context.';
      const routePlan = await planModelRoute({ prompt, hasRichContext: true });
      const candidateModels = routePlan.candidateModels.filter(candidate => !isOpenWeightGemmaModel(candidate));
      const ai = deps.getGenAIClient();
      const schema = buildRiskSupervisionResponseSchema(deterministic);
      const abortSignal = AbortSignal.timeout(12_000);
      const result = await executeWithModelFailover({ ...routePlan, candidateModels }, async model => {
        const response = await ai.models.generateContent({
          model,
          contents: JSON.stringify({
            task: prompt,
            language: lang === 'th' ? 'Thai' : 'English',
            candleCount: snapshot.candleCount,
            observedMarket: deterministic.deskBrief,
            indicators: deterministic.quantitativeInsight,
            feedVolume: snapshot.hasVolumeData,
            support: deterministic.structuralSupportZones,
            resistance: deterministic.structuralResistanceZones,
            accountRisk: deterministic.portfolioRiskAudit,
          }),
          config: {
            systemInstruction: 'Analytical & Risk Supervision Only. Describe observed market structure, data quality, and measured risk. Use only wording allowed by the schema. Include distinct checklist items and each reported structural band. Keep all content educational and descriptive.',
            responseMimeType: 'application/json',
            responseJsonSchema: schema,
            temperature: 0,
            maxOutputTokens: 3_000,
            abortSignal,
          },
        });
        return response.text ?? '';
      });
      const report = sanitizeAiRiskSupervisionReport(parseModelJson(result.reply), deterministic, result.model);
      if (!report) {
        sendFallback('GEMINI_REPORT_INVALID');
        return;
      }
      res.json({ ok: true, fallbackUsed: false, report });
    } catch {
      sendFallback('GEMINI_UNAVAILABLE');
    }
  });
  return router;
}
