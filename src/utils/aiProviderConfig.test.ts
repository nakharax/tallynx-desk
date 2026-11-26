import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDatabentoRequestHeaders, buildDeskAiRequestHeaders, decodeCodexJwtMetadata,
  maskCredential, normalizeAiModel, normalizeAiProvider, parseCodexCallbackInput,
} from './aiProviderConfig.ts';
import { loadByokCredentials, saveByokCredentials } from './byokStorage.ts';
import { resolvePlatformAiPrivilege, type PrivilegeDependencies } from '../../server/ai/platformPrivilege.ts';
import { createDeskAiAccessResolver, streamOrGenerateCoachReply } from '../../server/ai/byokProvider.ts';

const google = 'AIza' + 'a'.repeat(35);
const openrouter = 'sk-or-v1-' + 'b'.repeat(64);
const jwt = (payload: object) => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.signature';

test('credential headers only contain the selected credential, and the mask never reveals characters', () => {
  const headers = buildDeskAiRequestHeaders({ provider: 'google', key: google, model: 'gemini-2.5-pro', chatgptAccountId: 'account-a' });
  assert.deepEqual(headers, { 'X-TallyNX-AI-Provider': 'google', 'X-TallyNX-AI-Key': google, 'X-TallyNX-AI-Model': 'gemini-2.5-pro' });
  assert.deepEqual(buildDeskAiRequestHeaders({ provider: 'platform', key: google }), { 'X-TallyNX-AI-Provider': 'platform' });
  assert.deepEqual(buildDatabentoRequestHeaders('db-example'), { 'X-TallyNX-Databento-Key': 'db-example' });
  assert.deepEqual(buildDatabentoRequestHeaders('db-example\nother'), {});
  assert.equal(maskCredential(google), '••••••••');
});

test('credential storage isolates signed-in profiles and the guest profile', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  saveByokCredentials(null, { ...loadByokCredentials(null, storage), googleKey: google }, storage);
  saveByokCredentials('alice', { ...loadByokCredentials('alice', storage), openrouterKey: openrouter }, storage);
  assert.equal(loadByokCredentials('alice', storage).googleKey, undefined);
  assert.equal(loadByokCredentials('bob', storage).openrouterKey, undefined);
  assert.equal(loadByokCredentials('guest', storage).googleKey, undefined);
  assert.equal(loadByokCredentials(null, storage).googleKey, google);
  assert.ok(data.has('TALLYNX_BYOK_CREDENTIALS_V1_alice'));
});

test('normalizes aliases and validates provider-specific model IDs', () => {
  assert.equal(normalizeAiProvider(' OpenRouter '), 'openrouter');
  assert.equal(normalizeAiProvider('unknown'), undefined);
  assert.equal(normalizeAiModel('google', 'models/Gemini-2.5-Pro'), 'gemini-2.5-pro');
  assert.equal(normalizeAiModel('openrouter', ' OpenAI/GPT-4.1 '), 'openai/gpt-4.1');
  assert.equal(normalizeAiModel('openrouter', 'gemini-2.5-pro'), undefined);
  assert.equal(normalizeAiModel('google', 'gemini-2.5-pro\r\nAuthorization'), undefined);
  assert.equal(normalizeAiModel('google', google), undefined);
});

test('Desk access reads the platform key only after privilege verification and never falls back from personal providers', async () => {
  let platformReads = 0;
  const unprivileged = { eligible: false, role: null, uid: 'free-user' } as const;
  const resolve = createDeskAiAccessResolver({
    resolvePlatformAiPrivilege: async auth => auth === 'Bearer founder'
      ? { eligible: true, role: 'FOUNDER', uid: 'founder' } : unprivileged,
    verifyFirebaseBearerToken: async () => null,
    getPlatformKey: () => { platformReads++; return 'platform-placeholder'; },
  });
  function request(headers: Record<string, string> = {}) {
    const normalized = new Headers(headers);
    return { get: (name: string) => normalized.get(name) ?? undefined, ip: '192.0.2.1', socket: {} };
  }
  const denied: Array<Record<string, string>> = [
    {},
    { Authorization: 'Bearer free' },
    { Authorization: 'Bearer founder', 'X-TallyNX-AI-Provider': 'google' },
    { Authorization: 'Bearer founder', 'X-TallyNX-AI-Provider': 'unrecognized' },
  ];
  for (const headers of denied) {
    const result = await resolve(request(headers), 'text');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'BYOK_REQUIRED');
  }
  const guestGoogle = await resolve(request(buildDeskAiRequestHeaders({ provider: 'google', key: google })), 'voice');
  assert.ok(guestGoogle.ok && guestGoogle.connection.key === google);
  assert.match(guestGoogle.rateSubject, /^ip:[a-f0-9]{64}$/);
  const guestRouter = request(buildDeskAiRequestHeaders({ provider: 'openrouter', key: openrouter }));
  assert.equal((await resolve(guestRouter, 'text')).ok, true);
  assert.equal((await resolve(guestRouter, 'voice')).ok, false);
  assert.equal(platformReads, 0);
  const founder = await resolve(request({ Authorization: 'Bearer founder' }), 'text');
  assert.ok(founder.ok && founder.connection.provider === 'platform');
  assert.equal(platformReads, 1);
});

test('parses callback, raw code and auth.json while decoding display-only token metadata', () => {
  assert.deepEqual(parseCodexCallbackInput('http://localhost:1455/auth/callback?code=test-code&state=xyz'), { kind: 'code', code: 'test-code', state: 'xyz' });
  assert.deepEqual(parseCodexCallbackInput('test-code'), { kind: 'code', code: 'test-code' });
  assert.equal(parseCodexCallbackInput('http://evil.example/auth/callback?code=test-code&state=xyz'), null);
  assert.equal(parseCodexCallbackInput('http://localhost:1455/auth/callback?code=a&code=b&state=xyz'), null);
  const accessToken = jwt({ exp: 2000000000, 'https://api.openai.com/auth': { chatgpt_account_id: 'account-a', chatgpt_plan_type: 'plus' }, 'https://api.openai.com/profile': { email: 'example@example.com' } });
  const metadata = { accountEmail: 'example@example.com', planType: 'plus', chatgptAccountId: 'account-a', expiresAt: 2000000000000 };
  assert.deepEqual(decodeCodexJwtMetadata(accessToken), metadata);
  assert.deepEqual(parseCodexCallbackInput(JSON.stringify({ tokens: { access_token: accessToken, refresh_token: 'rt-example' } })), {
    kind: 'oauth', credential: { ...metadata, accessToken, refreshToken: 'rt-example' },
  });
  assert.deepEqual(decodeCodexJwtMetadata('broken'), {});
});

test('privilege requires a verified caller, honors active entitlements, and expires cached lookups', async () => {
  let now = 10;
  let status = 'ACTIVE';
  let plan = 'LIFETIME';
  let count = 0;
  const deps: PrivilegeDependencies = {
    verifyFirebaseBearerToken: async auth => auth === 'Bearer verified' ? { uid: 'member', email: 'member@example.com' }
      : auth === 'Bearer founder' ? { uid: 'founder', email: '', customAttributes: '{"founder":true}' }
        : auth === 'Bearer admin' ? { uid: 'admin', email: 'ADMIN@example.com', emailVerified: true } : null,
    projectId: 'project',
    databaseId: 'database',
    env: { ADMIN_EMAILS: 'admin@example.com' },
    now: () => now,
    fetcher: async (url, init) => {
      count++;
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer verified');
      assert.match(String(url), /\/databases\/database\/documents\/(admins|entitlements)\/member$/);
      return String(url).includes('/admins/') ? new Response(null, { status: 404 }) : Response.json({
        fields: { ownerId: { stringValue: 'member' }, status: { stringValue: status }, plan: { stringValue: plan } },
      });
    },
  };
  const resolve = (authorization: string) => resolvePlatformAiPrivilege(authorization, deps);
  assert.equal((await resolve('Bearer spoofed')).eligible, false);
  assert.equal((await resolve('Bearer founder')).role, 'FOUNDER');
  assert.equal((await resolve('Bearer admin')).role, 'ADMIN');
  assert.equal((await resolve('Bearer verified')).role, 'LIFETIME');
  status = 'SUSPENDED';
  assert.equal((await resolve('Bearer verified')).eligible, true);
  assert.equal(count, 2);
  now += 60_001;
  assert.equal((await resolve('Bearer verified')).eligible, false);
  assert.equal(count, 4);
  status = 'ACTIVE';
  for (const standardPlan of ['FREE', 'TRIAL', 'PRO']) {
    now += 60_001;
    plan = standardPlan;
    assert.equal((await resolve('Bearer verified')).eligible, false);
  }
  now += 60_001;
  plan = 'ADMIN';
  assert.equal((await resolve('Bearer verified')).role, 'ADMIN');
});

test('OpenRouter SSE is translated into text deltas without including provider credentials in the URL or body', async () => {
  const encoder = new TextEncoder();
  const deltas: string[] = [];
  const chunks = [
    'data: {"choices":[{"delta":{"content":"Aud',
    'it "}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"ready"},"finish_reason":"stop"}]}\r\n\r\n',
    'data: [DONE]\r\n\r\n',
  ];
  const result = await streamOrGenerateCoachReply({ provider: 'openrouter', key: openrouter, model: 'openai/gpt-4.1' },
    { system: 'Summarize the audit.', prompt: 'Proceed.' }, {
      signal: new AbortController().signal,
      stream: { onText: text => deltas.push(text) },
      fetcher: async (url, init) => {
        assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
        assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${openrouter}`);
        assert.equal(String(init?.body).includes(openrouter), false);
        return new Response(new ReadableStream({
          start(controller) {
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
            controller.close();
          },
        }), { headers: { 'Content-Type': 'text/event-stream' } });
      },
    });
  assert.deepEqual(deltas, ['Audit ', 'ready']);
  assert.equal(result.reply, 'Audit ready');
});

test('Codex and OpenAI API credentials select distinct endpoints and authentication headers', async () => {
  const signal = new AbortController().signal;
  const input = { system: 'Summarize the audit.', prompt: 'Proceed.' };
  const token = jwt({ exp: 2000000000 });
  const codex = await streamOrGenerateCoachReply(
    { provider: 'codex_oauth', key: token, chatgptAccountId: 'account-a', model: 'gpt-5.4' },
    input, { signal, fetcher: async (url, init) => {
      const headers = new Headers(init?.headers);
      assert.equal(url, 'https://chatgpt.com/backend-api/codex/responses');
      assert.equal(headers.get('originator'), 'codex_cli_rs');
      assert.equal(headers.get('chatgpt-account-id'), 'account-a');
      assert.equal(String(init?.body).includes(token), false);
      return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Codex response' }] }] });
    } },
  );
  const openai = await streamOrGenerateCoachReply(
    { provider: 'codex_oauth', key: 'sk-proj-example123456789', chatgptAccountId: 'ignored', model: 'gpt-4.1' },
    input, { signal, fetcher: async (url, init) => {
      const headers = new Headers(init?.headers);
      assert.equal(url, 'https://api.openai.com/v1/chat/completions');
      assert.equal(headers.get('chatgpt-account-id'), null);
      return Response.json({ choices: [{ message: { content: 'OpenAI response' } }] });
    } },
  );
  assert.equal(codex.reply, 'Codex response');
  assert.equal(openai.reply, 'OpenAI response');
});
