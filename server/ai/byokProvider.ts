import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { FinishReason, GoogleGenAI } from '@google/genai';
import { isEventStream, readServerSentEvents } from '../../src/utils/serverSentEvents.js';
import {
  AI_HEADERS, AI_MODEL_CATALOG, asRecord, decodeCodexJwtMetadata, isByokKeyFormat, isOpenAiApiKey,
  normalizeAiModel, normalizeAiProvider, normalizeCodexAccountId, normalizeHeaderSecret,
  type ByokProvider,
} from '../../src/utils/aiProviderConfig.js';
import { executeWithModelFailover, isOpenWeightGemmaModel, planModelRoute } from '../../src/utils/geminiOrchestrator.js';
import type { PlatformAiPrivilege, VerifiedAiCaller } from './platformPrivilege.js';

export const BYOK_REQUIRED_MESSAGE = 'Connect a valid provider key in Settings → API Keys / Codex OAuth.';

export type PersonalAiConnection = {
  provider: ByokProvider;
  key: string;
  model: string;
  chatgptAccountId?: string;
};
export type GoogleAiConnection = { provider: 'platform' | 'google'; key: string; model?: string };
export type AiConnection = GoogleAiConnection | (PersonalAiConnection & { provider: 'openrouter' | 'codex_oauth' });
type DeskAiCapability = 'text' | 'voice';
interface AiRequest {
  get(name: string): string | undefined;
  ip?: string;
  socket: { remoteAddress?: string };
}

interface AccessDependencies {
  resolvePlatformAiPrivilege: (authorization: string | undefined) => Promise<PlatformAiPrivilege>;
  verifyFirebaseBearerToken: (authorization: string | undefined) => Promise<VerifiedAiCaller | null>;
  getPlatformKey: () => string | undefined;
}

type AccessFailure = { ok: false; status: 400 | 401 | 403 | 503; code: 'AUTH_REQUIRED' | 'INVALID_AI_MODEL' | 'BYOK_REQUIRED' | 'MISSING_API_KEY'; error: string };
type AccessSuccess<Connection> = { ok: true; connection: Connection; rateSubject: string };

export function isGoogleConnection(connection: AiConnection): connection is GoogleAiConnection {
  return connection.provider === 'platform' || connection.provider === 'google';
}

export function aiRateSubject(req: AiRequest, uid?: string | null): string {
  if (uid) return `uid:${uid}`;
  const forwarded = process.env.VERCEL === '1' ? req.get('x-vercel-forwarded-for')?.split(',')[0].trim() : undefined;
  const ip = forwarded && isIP(forwarded) ? forwarded : req.ip || req.socket.remoteAddress || 'unknown';
  return `ip:${createHash('sha256').update(ip).digest('hex')}`;
}

export function readPersonalAiConnection(req: Pick<AiRequest, 'get'>): PersonalAiConnection | null {
  const provider = normalizeAiProvider(req.get(AI_HEADERS.provider));
  if (!provider || provider === 'platform') return null;
  const key = normalizeHeaderSecret(req.get(AI_HEADERS.key));
  if (!key) return null;
  const account = provider === 'codex_oauth' && !isOpenAiApiKey(key)
    ? decodeCodexJwtMetadata(key).chatgptAccountId ?? normalizeCodexAccountId(req.get(AI_HEADERS.account))
    : undefined;
  const model = normalizeAiModel(provider, req.get(AI_HEADERS.model)) ?? AI_MODEL_CATALOG[provider][0];
  if (!isByokKeyFormat(provider, key, account) || model === key.toLowerCase()) return null;
  return { provider, key, model, ...(account ? { chatgptAccountId: account } : {}) };
}

export function createDeskAiAccessResolver(deps: AccessDependencies) {
  function resolveDeskAiAccess(req: AiRequest, capability: 'voice'): Promise<AccessFailure | AccessSuccess<GoogleAiConnection>>;
  function resolveDeskAiAccess(req: AiRequest, capability: 'text'): Promise<AccessFailure | AccessSuccess<AiConnection>>;
  async function resolveDeskAiAccess(req: AiRequest, capability: DeskAiCapability): Promise<AccessFailure | AccessSuccess<AiConnection>> {
    const rawProvider = req.get(AI_HEADERS.provider);
    const provider = normalizeAiProvider(rawProvider);
    const rawModel = req.get(AI_HEADERS.model);
    const authorization = req.get('Authorization');
    const byokRequired: AccessFailure = { ok: false, status: 403, code: 'BYOK_REQUIRED', error: BYOK_REQUIRED_MESSAGE };
    if (rawProvider === undefined || provider === 'platform') {
      if (req.get(AI_HEADERS.key) !== undefined) return byokRequired;
      const privilege = await deps.resolvePlatformAiPrivilege(authorization);
      if (authorization && !privilege.uid) {
        return { ok: false, status: 401, code: 'AUTH_REQUIRED', error: 'Sign in again to use Platform Gemini.' };
      }
      if (!privilege.eligible || !privilege.uid) return byokRequired;
      const model = normalizeAiModel('platform', rawModel);
      if (rawModel !== undefined && !model) {
        return { ok: false, status: 400, code: 'INVALID_AI_MODEL', error: 'Choose a valid Platform Gemini model in Settings.' };
      }
      const key = deps.getPlatformKey()?.trim();
      if (!key) return { ok: false, status: 503, code: 'MISSING_API_KEY', error: 'Platform Gemini is unavailable. Connect your own provider key in Settings.' };
      return {
        ok: true,
        connection: { provider: 'platform', key, model },
        rateSubject: aiRateSubject(req, privilege.uid),
      };
    }

    const connection = readPersonalAiConnection(req);
    if (!connection) return byokRequired;
    if (capability === 'voice' && connection.provider !== 'google') {
      return { ...byokRequired, error: 'Connect a valid Google Gemini key in Settings to use cloud voice or Live.' };
    }
    if (rawModel !== undefined && !normalizeAiModel(connection.provider, rawModel)) {
      return { ok: false, status: 400, code: 'INVALID_AI_MODEL', error: 'Choose a valid model ID for this provider in Settings.' };
    }
    const caller = authorization ? await deps.verifyFirebaseBearerToken(authorization).catch(() => null) : null;
    const rateSubject = aiRateSubject(req, caller?.uid);
    if (connection.provider === 'google') {
      return { ok: true, connection: { provider: 'google', key: connection.key, model: connection.model }, rateSubject };
    }
    return { ok: true, connection: { ...connection, provider: connection.provider }, rateSubject };
  }
  return resolveDeskAiAccess;
}

export function createGoogleAiClient(key: string, apiVersion?: 'v1alpha' | 'v1beta', fetcher?: typeof fetch) {
  return new GoogleGenAI({
    apiKey: key,
    vertexai: false,
    httpOptions: {
      ...(apiVersion ? { apiVersion } : {}),
      timeout: 25_000,
      ...(fetcher ? { fetch: fetcher } : {}),
      headers: { 'User-Agent': 'aistudio-build' },
    },
  });
}

export class AiUpstreamError extends Error {
  constructor(readonly status: number) {
    super('AI provider request failed');
  }
}

export function aiUpstreamStatus(error: unknown): number | undefined {
  if (error instanceof AiUpstreamError) return error.status;
  const status = asRecord(error)?.status;
  if (error instanceof Error && /\b(?:API_KEY_INVALID|API key not valid)\b/i.test(error.message)) return 401;
  return typeof status === 'number' ? status : undefined;
}

export function isAiCredentialError(error: unknown): boolean {
  const status = aiUpstreamStatus(error);
  return status === 401 || status === 403;
}

export function assertCompleteGoogleReply(finishReason?: FinishReason): void {
  if (finishReason && finishReason !== FinishReason.STOP && finishReason !== FinishReason.FINISH_REASON_UNSPECIFIED) {
    throw new AiUpstreamError(502);
  }
}

export const CODEX_ORIGINATOR = 'codex_cli_rs';
const CODEX_API = 'https://chatgpt.com/backend-api';
const OPENAI_API = 'https://api.openai.com/v1';
const OPENROUTER_API = 'https://openrouter.ai/api/v1';
type TextConnection = Exclude<AiConnection, GoogleAiConnection>;

function usesCodexBackend(connection: PersonalAiConnection): boolean {
  return connection.provider === 'codex_oauth' && !isOpenAiApiKey(connection.key);
}

function textProviderHeaders(connection: PersonalAiConnection): Record<string, string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${connection.key}` };
  if (usesCodexBackend(connection)) {
    headers.originator = CODEX_ORIGINATOR;
    headers['User-Agent'] = `${CODEX_ORIGINATOR}/0.1.0`;
    headers.Accept = 'application/json';
    if (connection.chatgptAccountId) headers['chatgpt-account-id'] = connection.chatgptAccountId;
  }
  return headers;
}

export async function verifyPersonalAiConnection(connection: PersonalAiConnection, fetcher = fetch): Promise<number> {
  const url = connection.provider === 'google' ? 'https://generativelanguage.googleapis.com/v1beta/models'
    : connection.provider === 'openrouter' ? `${OPENROUTER_API}/key`
    : usesCodexBackend(connection) ? `${CODEX_API}/wham/usage` : `${OPENAI_API}/models`;
  const headers = connection.provider === 'google' ? { 'x-goog-api-key': connection.key } : textProviderHeaders(connection);
  const response = await fetcher(url, { headers, redirect: 'error', signal: AbortSignal.timeout(8_000) });
  if (connection.provider === 'google' && response.status === 400) {
    const error = await response.text();
    if (/API_KEY_INVALID|API key not valid/i.test(error)) return 401;
  } else {
    await response.body?.cancel();
  }
  return response.status;
}

interface CoachPrompt {
  system: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  prompt: string;
  attachments?: Array<{ mimeType: string; data: string }>;
  webSearch?: boolean;
}
type CoachStream = { onText: (delta: string) => void };
type ReportSchema = ReturnType<typeof import('../../src/utils/riskSupervisionReport.js').buildRiskSupervisionResponseSchema>;

function textFromResponse(payload: unknown, codex: boolean): string {
  const value = asRecord(payload);
  if (codex) {
    if (typeof value?.output_text === 'string') return value.output_text;
    const output: unknown[] = Array.isArray(value?.output) ? value.output : [];
    return output.map(item => {
      const message = asRecord(item);
      const content: unknown[] = message?.type === 'message' && Array.isArray(message.content) ? message.content : [];
      return content.map(part => {
        const text = asRecord(part);
        return text?.type === 'output_text' && typeof text.text === 'string' ? text.text : '';
      }).join('');
    }).join('');
  }
  const choices: unknown[] = Array.isArray(value?.choices) ? value.choices : [];
  const message = asRecord(asRecord(choices[0])?.message);
  return typeof message?.content === 'string' ? message.content : '';
}

function parseProviderPayload(data: string): Record<string, unknown> {
  try {
    const value = asRecord(JSON.parse(data));
    if (value) return value;
  } catch {
    // Fall through to the standard upstream error.
  }
  throw new AiUpstreamError(502);
}

function assertProviderSuccess(value: Record<string, unknown>) {
  const response = asRecord(value.response) ?? value;
  const error = asRecord(value.error) ?? asRecord(response.error);
  if (error || value.type === 'error' || value.type === 'response.failed' ||
      value.type === 'response.incomplete' || response.status === 'failed' || response.status === 'incomplete') {
    const code = error?.code ?? value.code;
    throw new AiUpstreamError(typeof code === 'number' && code >= 400 && code <= 599
      ? code : code === 'invalid_api_key' || code === 'token_expired' ? 401
        : code === 'rate_limit_exceeded' ? 429 : 502);
  }
  const choice = firstChoice(value);
  if (choice?.finish_reason === 'error' || choice?.finish_reason === 'length' || choice?.finish_reason === 'content_filter') {
    throw new AiUpstreamError(502);
  }
}

function firstChoice(value: Record<string, unknown>) {
  return asRecord(Array.isArray(value.choices) ? value.choices[0] : undefined);
}

const MAX_PROVIDER_TEXT = 256_000;

async function readProviderStream(response: Response, connection: TextConnection, onText?: CoachStream['onText']) {
  if (!response.body) throw new AiUpstreamError(502);
  const codex = usesCodexBackend(connection);
  let model = connection.model;
  let reply = '';
  let finished = false;
  let outputItems = '';

  function append(delta: string) {
    reply += delta;
    if (reply.length > MAX_PROVIDER_TEXT) throw new AiUpstreamError(502);
    if (delta) onText?.(delta);
  }

  for await (const { data } of readServerSentEvents(response.body)) {
    if (data === '[DONE]') {
      if (!codex) finished = true;
      break;
    }
    const value = parseProviderPayload(data);
    assertProviderSuccess(value);
    const choice = firstChoice(value);
    const codexResponse = asRecord(value.response);
    model = normalizeAiModel(connection.provider, codex ? codexResponse?.model : value.model) ?? model;
    const delta = codex
      ? value.type === 'response.output_text.delta' ? value.delta : undefined
      : asRecord(choice?.delta)?.content;
    if (typeof delta === 'string') append(delta);
    if (codex && value.type === 'response.output_item.done') {
      outputItems += textFromResponse({ output: [value.item] }, true);
      if (outputItems.length > MAX_PROVIDER_TEXT) throw new AiUpstreamError(502);
    }
    if (codex && value.type === 'response.completed') {
      if (!reply.trim()) append(textFromResponse(codexResponse, true) || outputItems);
      finished = true;
      break;
    }
    if (!codex && choice?.finish_reason === 'stop') finished = true;
  }
  if (!finished || !reply.trim()) throw new AiUpstreamError(502);
  return { reply, model };
}

async function requestTextProvider(
  connection: TextConnection, input: CoachPrompt, signal: AbortSignal, schema?: ReportSchema, stream?: CoachStream,
  fetcher: typeof fetch = fetch,
): Promise<{ reply: string; model: string }> {
  const codex = usesCodexBackend(connection);
  const openrouter = connection.provider === 'openrouter';
  const url = codex ? `${CODEX_API}/codex/responses` : `${openrouter ? OPENROUTER_API : OPENAI_API}/chat/completions`;
  const history = input.history ?? [];
  const prompt = { role: 'user' as const, content: input.prompt };
  const format = schema ? { name: 'risk_supervision', schema, strict: true } : undefined;
  const request = codex ? {
    model: connection.model,
    instructions: input.system,
    input: [...history, prompt].map(message => ({
      type: 'message',
      role: message.role,
      content: [{ type: message.role === 'assistant' ? 'output_text' : 'input_text', text: message.content }],
    })),
    stream: true,
    store: false,
    ...(format ? { text: { format: { type: 'json_schema', ...format } } } : {}),
  } : {
    model: connection.model,
    messages: [{ role: 'system', content: input.system }, ...history, prompt],
    stream: Boolean(stream),
    ...(openrouter ? { max_tokens: 8_000 } : { max_completion_tokens: 8_000, store: false }),
    ...(format ? { response_format: { type: 'json_schema', json_schema: format } } : {}),
  };

  const response = await fetcher(url, {
    method: 'POST',
    headers: {
      ...textProviderHeaders(connection),
      'Content-Type': 'application/json',
      Accept: codex || stream ? 'text/event-stream, application/json' : 'application/json',
    },
    body: JSON.stringify(request),
    redirect: 'error',
    signal,
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

export async function streamOrGenerateCoachReply(
  connection: AiConnection,
  input: CoachPrompt,
  options: { signal: AbortSignal; stream?: CoachStream; fetcher?: typeof fetch },
): Promise<{ reply: string; model: string; sources: Array<{ title: string; uri: string }> }> {
  if (!isGoogleConnection(connection)) {
    const result = await requestTextProvider(connection, input, options.signal, undefined, options.stream, options.fetcher);
    return { ...result, sources: [] };
  }
  const model = connection.model ?? AI_MODEL_CATALOG.google[0];
  const ai = createGoogleAiClient(connection.key, undefined, options.fetcher);
  const request = {
    model,
    contents: [
      ...(input.history ?? []).map(item => ({
        role: item.role === 'assistant' ? 'model' : 'user', parts: [{ text: item.content }],
      })),
      { role: 'user', parts: [{ text: input.prompt }, ...(input.attachments ?? []).map(inlineData => ({ inlineData }))] },
    ],
    config: {
      systemInstruction: input.system,
      abortSignal: options.signal,
      ...(input.webSearch ? { tools: [{ googleSearch: {} }] } : {}),
    },
  };
  const sourceMap = new Map<string, { title: string; uri: string }>();
  function collectSources(chunks: Array<{ web?: { title?: string; uri?: string } }> = []) {
    for (const { web } of chunks) {
      if (web?.uri && /^https?:\/\//i.test(web.uri)) sourceMap.set(web.uri, { title: web.title || web.uri, uri: web.uri });
    }
  }
  let reply = '';
  if (options.stream) {
    const response = await ai.models.generateContentStream(request);
    for await (const chunk of response) {
      assertCompleteGoogleReply(chunk.candidates?.[0]?.finishReason);
      const text = chunk.text ?? '';
      reply += text;
      if (reply.length > MAX_PROVIDER_TEXT) throw new AiUpstreamError(502);
      if (text) options.stream.onText(text);
      collectSources(chunk.candidates?.[0]?.groundingMetadata?.groundingChunks);
    }
  } else {
    const response = await ai.models.generateContent(request);
    assertCompleteGoogleReply(response.candidates?.[0]?.finishReason);
    reply = response.text ?? '';
    collectSources(response.candidates?.[0]?.groundingMetadata?.groundingChunks);
  }
  if (!reply.trim() || reply.length > MAX_PROVIDER_TEXT) throw new AiUpstreamError(502);
  return { reply, model, sources: [...sourceMap.values()] };
}

export async function generateStructuredRiskSupervision(
  connection: AiConnection, input: CoachPrompt & { schema: ReportSchema }, signal: AbortSignal,
): Promise<{ reply: string; model: string }> {
  if (!isGoogleConnection(connection)) {
    const structuredInput = {
      ...input,
      system: `${input.system}\nReturn one JSON object matching this schema:\n${JSON.stringify(input.schema)}`,
    };
    try {
      return await requestTextProvider(connection, structuredInput, signal, input.schema);
    } catch (error) {
      if (![400, 422].includes(aiUpstreamStatus(error) ?? 0)) throw error;
      // Some custom models accept a JSON prompt but reject the structured output parameter.
      return requestTextProvider(connection, structuredInput, signal);
    }
  }
  const ai = createGoogleAiClient(connection.key);
  const generate = async (model: string) => (await ai.models.generateContent({
    model,
    contents: input.prompt,
    config: {
      systemInstruction: input.system,
      responseMimeType: 'application/json',
      responseJsonSchema: input.schema,
      maxOutputTokens: 3_000,
      abortSignal: signal,
    },
  })).text ?? '';
  if (connection.provider === 'google') {
    const model = connection.model ?? AI_MODEL_CATALOG.google[0];
    return { model, reply: await generate(model) };
  }
  const plan = await planModelRoute({ prompt: input.prompt, hasRichContext: true, preference: connection.model });
  return executeWithModelFailover({
    ...plan, candidateModels: plan.candidateModels.filter(model => !isOpenWeightGemmaModel(model)),
  }, generate);
}
