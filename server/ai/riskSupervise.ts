import express, { type Request } from 'express';
import { computeQuantSupervisionSnapshot } from '../../src/utils/quantSupervisionEngine.js';
import {
  buildDeterministicSupervisionReport,
  buildRiskSupervisionResponseSchema,
  parseRiskSuperviseRequest,
  sanitizeAiRiskSupervisionReport,
  type RiskSupervisionFallbackReason,
} from '../../src/utils/riskSupervisionReport.js';
import {
  BYOK_REQUIRED_MESSAGE, generateStructuredRiskSupervision, isAiCredentialError, isGoogleConnection,
  type createDeskAiAccessResolver,
} from './byokProvider.js';

interface RiskSuperviseDependencies {
  resolveDeskAiAccess: ReturnType<typeof createDeskAiAccessResolver>;
  checkDistributedRateLimit: (key: string) => Promise<{ allowed: boolean; retryAfterSec: number }>;
}

function parseModelJson(response: string): unknown {
  try {
    const text = response.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function createRiskSuperviseRouter(deps: RiskSuperviseDependencies) {
  const router = express.Router();
  router.post('/ai/risk-supervise', async (req: Request<object, unknown, unknown>, res) => {
    res.set('Cache-Control', 'no-store');
    const request = parseRiskSuperviseRequest(req.body);
    if (!request) {
      res.status(400).json({ ok: false, code: 'INVALID_MARKET_SNAPSHOT', error: 'Provide a supported symbol and timeframe with valid OHLC candles.' });
      return;
    }

    const { symbol, timeframe, candles, portfolio, lang } = request;
    const snapshot = computeQuantSupervisionSnapshot(symbol, timeframe, candles, portfolio);
    const deterministic = buildDeterministicSupervisionReport(snapshot, lang, new Date().toISOString());
    function sendFallback(reason: RiskSupervisionFallbackReason, status = 200, error?: string) {
      const report = { ...deterministic, fallbackReason: reason };
      const payload = { fallbackUsed: true, fallbackReason: reason };
      if (status === 403) {
        res.status(status).json({ ok: false, code: reason, error, ...payload, deterministicReport: report });
      } else {
        res.status(status).json({ ok: status === 200, ...(status !== 200 ? { code: reason, error } : {}), ...payload, report });
      }
    }

    const access = await deps.resolveDeskAiAccess(req, 'text');
    if (!access.ok) {
      if (access.code === 'MISSING_API_KEY') sendFallback('GEMINI_API_KEY_MISSING');
      else sendFallback(access.code, access.status, access.error);
      return;
    }
    const { connection } = access;
    const provider = isGoogleConnection(connection) ? 'gemini' : connection.provider;
    try {
      const rate = await deps.checkDistributedRateLimit(`risk-supervise:${access.rateSubject}`);
      if (!rate.allowed) {
        res.set('Retry-After', String(rate.retryAfterSec));
        sendFallback('RATE_LIMITED', 429);
        return;
      }
      const result = await generateStructuredRiskSupervision(connection, {
        prompt: JSON.stringify({
          task: 'Select the most relevant approved analysis and review checklist for this observed market and account context.',
          language: lang === 'th' ? 'Thai' : 'English',
          candleCount: snapshot.candleCount,
          observedMarket: deterministic.deskBrief,
          indicators: deterministic.quantitativeInsight,
          feedVolume: snapshot.hasVolumeData,
          support: deterministic.structuralSupportZones,
          resistance: deterministic.structuralResistanceZones,
          accountRisk: deterministic.portfolioRiskAudit,
        }),
        system: 'Analytical & Risk Supervision Only. Describe observed market structure, data quality, and measured risk. Use only wording allowed by the schema. Include distinct checklist items and each reported structural band. Keep all content educational and descriptive.',
        schema: buildRiskSupervisionResponseSchema(deterministic),
      }, AbortSignal.timeout(28_000));
      const report = sanitizeAiRiskSupervisionReport(parseModelJson(result.reply), deterministic, result.model, provider);
      if (!report) {
        sendFallback(provider === 'gemini' ? 'GEMINI_REPORT_INVALID' : 'AI_REPORT_INVALID');
        return;
      }
      res.json({ ok: true, fallbackUsed: false, report });
    } catch (error) {
      if (connection.provider !== 'platform' && isAiCredentialError(error)) {
        sendFallback('BYOK_REQUIRED', 403, BYOK_REQUIRED_MESSAGE);
      } else {
        sendFallback(provider === 'gemini' ? 'GEMINI_UNAVAILABLE' : 'AI_PROVIDER_UNAVAILABLE');
      }
    }
  });
  return router;
}
