import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EventEmitter } from 'node:events';
import express from 'express';
import type { MarketplaceDeskSetup } from '../../src/types/ghr.js';
import { REFERENCE_WORKSHEETS, referenceProofPayload } from '../../src/utils/referenceWorksheets.js';
import { type MallEvent, type MallSnapshotAttachment, type MallVerifiedBadge, type MallZoneId } from '../../src/types/mallChat.js';
import {
  createMallChatEngine, DESK_ROOM_ZONE_ID, isMallZoneId, MallChatError, mallSymbol,
  mallHandle, sanitizeMallSetupBlueprint, toDeskRoomMessage, toDeskRoomPresence, type MallChatStore,
} from './mallChatEngine.js';

const processSnapshotSecret = randomBytes(32);

function loadJson(filename: string): unknown {
  try {
    return JSON.parse(readFileSync(filename, 'utf8'));
  } catch {
    return undefined;
  }
}

function respondError(res: express.Response, error: unknown) {
  if (error instanceof MallChatError) {
    if (error.retryAfterSec) res.setHeader('Retry-After', error.retryAfterSec);
    res.status(error.status).json({
      ok: false, code: error.code, error: error.reasonEn, reasonEn: error.reasonEn,
      reasonTh: error.reasonTh, retryAfterSec: error.retryAfterSec,
    });
    return;
  }
  throw error;
}

function hasListingProof(listing: MarketplaceDeskSetup) {
  return /^[a-f0-9]{64}$/i.test(listing.proofHash) && listing.metrics?.tradeCount > 0
    && Number.isFinite(Date.parse(listing.verifiedAt));
}

export interface MallSnapshotSource {
  reference: string;
  symbol: string;
  capturedAt: string;
  pnl: number;
  movement?: { open: number; close: number };
  verifiedBadge: MallVerifiedBadge;
}

function createVerifiedSnapshot(source: MallSnapshotSource): MallSnapshotAttachment | undefined {
  const symbol = mallSymbol(source.symbol);
  const timestamp = Date.parse(source.capturedAt);
  if (!symbol || !Number.isFinite(timestamp) || !Number.isFinite(source.pnl)) return undefined;
  const snapshotId = 'closed-' + createHash('sha256').update(source.reference + ':' + timestamp).digest('hex').slice(0, 20);
  const move = source.movement;
  const hasHistoricalPrices = move && move.open > 0 && move.close > 0;
  const closedUp = hasHistoricalPrices ? move.close >= move.open : source.pnl >= 0;
  const color = source.pnl >= 0 ? '#62d5b1' : '#f49d9d';
  const sign = source.pnl > 0 ? '+' : '';
  const closeY = closedUp ? 68 : 154;
  const graphic = hasHistoricalPrices
    ? '<path d="M32 110H190L430 ' + closeY + 'H608" fill="none" stroke="' + color + '" stroke-width="3"/><circle cx="190" cy="110" r="5" fill="' + color + '"/><circle cx="430" cy="' + closeY + '" r="5" fill="' + color + '"/><text x="32" y="176">OPEN</text><text x="550" y="176">CLOSE</text>'
    : '<rect x="32" y="109" width="576" height="1" fill="#39464d"/><circle cx="320" cy="110" r="8" fill="' + color + '"/><text x="32" y="176">CLOSED DEAL RECORD</text>';
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 200"><rect width="640" height="200" fill="#132128"/>' +
    '<path d="M32 64H608M32 110H608M32 156H608" stroke="#2a3b43"/>' +
    '<g fill="#c2d2d7" font-family="monospace" font-size="14"><text x="32" y="35">' + symbol +
    ' · CLOSED MT5 DEAL</text><text x="608" y="35" text-anchor="end" fill="' + color + '">' + sign + source.pnl.toFixed(2) +
    '</text>' + graphic + '</g></svg>';
  return {
    snapshotId, snapshotUrl: 'data:image/svg+xml;utf8,' + encodeURIComponent(svg),
    symbol, capturedAt: new Date(timestamp).toISOString(),
  };
}

export function createMallRouter(options: {
  telemetryBus: EventEmitter;
  legacyBaseUrl: string;
  listings: () => Promise<MarketplaceDeskSetup[]>;
  localListings: () => MarketplaceDeskSetup[];
  verifyUser: (authHeader: string | undefined) => Promise<{ uid: string } | null>;
  bridgeSnapshot: (bridgeKey: string | undefined) => MallSnapshotSource | undefined;
  connectedSnapshot: (uid: string, channel: 'FUNDEDNEXT_MCP' | 'MYFXBOOK_API', accountId: string) => Promise<MallSnapshotSource | undefined>;
}) {
  const router = express.Router();
  const storePath = join(tmpdir(), 'tallynx_mall_chat_v1.json');
  const legacy = loadJson(join(tmpdir(), 'tallynx_desk_room_v1.json'));
  const loaded = loadJson(storePath) as Partial<MallChatStore> | undefined;
  const engine = createMallChatEngine({
    stored: Array.isArray(loaded?.messages)
      ? { starterVersion: loaded.starterVersion, messages: loaded.messages, reactionReceipts: Array.isArray(loaded.reactionReceipts) ? loaded.reactionReceipts : [] }
      : undefined,
    legacyMessages: Array.isArray(legacy) ? legacy : [],
    persist: (store) => {
      const temporary = storePath + '.' + randomUUID() + '.tmp';
      try {
        writeFileSync(temporary, JSON.stringify(store), { encoding: 'utf8', mode: 0o600 });
        renameSync(temporary, storePath);
      } catch {
        try { rmSync(temporary, { force: true }); } catch { /* memory fallback */ }
      }
    },
  });
  const { telemetryBus } = options;
  const configuredSecret = (process.env.TALLYNX_SSO_SECRET || process.env.SSO_SHARED_SECRET)?.trim();
  const snapshotSecret = configuredSecret && configuredSecret.length >= 16 ? configuredSecret : processSnapshotSecret;
  const snapshotSignature = (snapshot: MallSnapshotAttachment) => createHmac('sha256', snapshotSecret)
    .update('mall:snapshot:v1:' + JSON.stringify(snapshot)).digest('hex');
  function verifyInternalSnapshot(snapshot: MallSnapshotAttachment, proof: unknown) {
    return typeof proof === 'string' && /^[a-f0-9]{64}$/.test(proof)
      && timingSafeEqual(Buffer.from(proof, 'hex'), Buffer.from(snapshotSignature(snapshot), 'hex'));
  }

  async function resolveSource(req: express.Request, channel: unknown) {
    if (channel === 'LIVE_BRIDGE') {
      return options.bridgeSnapshot(req.get('X-Tredyn-Api-Key'));
    }
    if (channel !== 'FUNDEDNEXT_MCP' && channel !== 'MYFXBOOK_API') return undefined;
    const accountId = req.get('X-TallyNX-Mall-Account');
    if (!accountId || !/^[a-z0-9._:-]{1,120}$/i.test(accountId)) return undefined;
    const caller = await options.verifyUser(req.headers.authorization);
    if (!caller) return undefined;
    return options.connectedSnapshot(caller.uid, channel, accountId).catch(() => undefined);
  }

  let legacyRead: Promise<void> | undefined;
  let nextLegacyRead = 0;
  let legacyAvailable = false;
  function readLegacyHistory() {
    if (legacyRead) return legacyRead;
    if (Date.now() < nextLegacyRead) return Promise.resolve();
    legacyAvailable = false;
    legacyRead = fetch(options.legacyBaseUrl + '/desk-room', {
      headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(2500),
    }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json();
      if (!data?.ok) return;
      legacyAvailable = true;
      if (Array.isArray(data.messages)) engine.mergeDeskMessages(data.messages);
      if (Array.isArray(data.participants)) engine.replaceLegacyPresence(data.participants);
    }).catch(() => {}).finally(() => {
      nextLegacyRead = Date.now() + 60_000;
      legacyRead = undefined;
    });
    return legacyRead;
  }

  function emit(event: MallEvent) {
    telemetryBus.emit(event.type === 'presence' ? 'mall.presence' : 'mall.chat', event);
    if (event.zoneId !== DESK_ROOM_ZONE_ID) return;
    if (event.type === 'presence') {
      telemetryBus.emit('desk_room_update', { type: 'presence', participants: event.presence.map(toDeskRoomPresence) });
    } else if (event.type === 'message' && !event.message.threadRootId) {
      const item = toDeskRoomMessage(event.message);
      telemetryBus.emit('desk_room_update', { type: 'message', item });
      if (item.text) {
        void fetch(options.legacyBaseUrl + '/desk-room', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item }),
          signal: AbortSignal.timeout(2500),
        }).catch(() => {});
      }
    }
  }

  router.use(['/mall', '/desk-room'], (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.get('/mall/zones', (_req, res) => res.json({ ok: true, zones: engine.zones() }));

  router.get('/mall/zones/:zoneId/messages', async (req, res) => {
    const { zoneId } = req.params;
    if (!isMallZoneId(zoneId)) return res.status(404).json({ ok: false, code: 'ZONE_NOT_FOUND' });
    if (zoneId === DESK_ROOM_ZONE_ID) await readLegacyHistory();
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const thread = typeof req.query.threadRootId === 'string' ? req.query.threadRootId : undefined;
    res.json({ ok: true, ...engine.list(zoneId, cursor, thread) });
  });

  async function postMessage(req: express.Request, res: express.Response, zoneId: MallZoneId, legacyRequest = false) {
    try {
      const body = legacyRequest ? {
        handle: req.body?.handle, symbol: req.body?.symbol, text: String(req.body?.text || '').slice(0, 500),
        clientMessageId: req.body?.clientMessageId || req.body?.id || randomUUID(),
        isTradeIdea: req.body?.isTradeIdea === true,
      } : req.body || {};
      const rawListingId = body.setupBlueprint?.listingId;
      let setupBlueprint;
      const reference = REFERENCE_WORKSHEETS.find(item => item.id === rawListingId);
      if (reference) {
        if (createHash('sha256').update(referenceProofPayload(reference)).digest('hex') !== reference.proofHash) {
          throw new MallChatError(409, 'REFERENCE_PROOF', 'Worksheet proof mismatch.', 'แฮชของเวิร์กชีตไม่ตรงกัน');
        }
        setupBlueprint = { ...reference.blueprint, listingId: reference.id, proofHash: reference.proofHash, proofKind: 'reference' as const };
      } else if (typeof rawListingId === 'string' && /^[a-z0-9._:-]{1,120}$/i.test(rawListingId)) {
        const listing = options.localListings().find((entry) => entry.id === rawListingId)
          ?? (await options.listings()).find((entry) => entry.id === rawListingId);
        if (listing && hasListingProof(listing)) {
          setupBlueprint = sanitizeMallSetupBlueprint({
            ...listing.blueprint, title: listing.title, listingId: listing.id, proofHash: listing.proofHash,
            winRatePct: listing.metrics.winRatePct, profitFactor: listing.metrics.profitFactor,
            checklistNotes: listing.priceUsd > 0 ? [] : listing.blueprint.checklistNotes,
          });
          if (!setupBlueprint) throw new MallChatError(422, 'SIGNAL_LANGUAGE',
            'The listing title or setup labels need risk-only wording before they can be shared.',
            'กรุณาปรับชื่อรายการหรือป้ายกำกับชุดตั้งค่าให้เป็นข้อความเกี่ยวกับความเสี่ยงก่อนแชร์');
        }
      }
      const source = await resolveSource(req, 'verifiedChannel' in body ? body.verifiedChannel : undefined);
      const output = engine.post(zoneId, body, req.ip || req.socket.remoteAddress || 'unknown', {
        setupBlueprint, verifiedBadge: source?.verifiedBadge, verifyInternalSnapshot,
      });
      if (output.created) emit({ type: 'message', zoneId, message: output.message, threadRoot: output.threadRoot });
      res.status(output.created && !legacyRequest ? 201 : 200).json(legacyRequest
        ? { ok: true, item: toDeskRoomMessage(output.message) }
        : { ok: true, message: output.message, threadRoot: output.threadRoot });
    } catch (error) {
      respondError(res, error);
    }
  }

  router.post('/mall/zones/:zoneId/messages', (req, res, next) => {
    const { zoneId } = req.params;
    if (!isMallZoneId(zoneId)) return res.status(404).json({ ok: false, code: 'ZONE_NOT_FOUND' });
    void postMessage(req, res, zoneId).catch(next);
  });

  router.post('/mall/zones/:zoneId/messages/:messageId/reactions', (req, res) => {
    const { zoneId, messageId } = req.params;
    if (!isMallZoneId(zoneId)) return res.status(404).json({ ok: false, code: 'ZONE_NOT_FOUND' });
    try {
      const { message, changed } = engine.react(zoneId, messageId, req.body || {});
      if (changed) emit({ type: 'reaction', zoneId, message });
      res.json({ ok: true, message });
    } catch (error) {
      respondError(res, error);
    }
  });

  async function updatePresence(req: express.Request, res: express.Response, zoneId: MallZoneId, legacyRequest = false) {
    const body = req.body || {};
    const source = await resolveSource(req, body.verifiedChannel);
    const local = engine.updatePresence(zoneId, body, source?.verifiedBadge.channel);
    if (zoneId === DESK_ROOM_ZONE_ID) {
      const current = local.find((item) => item.handle === mallHandle(body.handle))!;
      try {
        const response = await fetch(options.legacyBaseUrl + '/desk-room/presence', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(2500),
          body: JSON.stringify(toDeskRoomPresence(current)),
        });
        const data = response.ok ? await response.json() : null;
        if (data?.ok && Array.isArray(data.participants)) engine.replaceLegacyPresence(data.participants);
      } catch { /* Keep local presence during a gateway outage. */ }
    }
    const presence = engine.activePresence(zoneId);
    emit({ type: 'presence', zoneId, presence });
    res.json(legacyRequest ? { ok: true, participants: presence.map(toDeskRoomPresence) } : { ok: true, presence });
  }

  router.post('/mall/zones/:zoneId/presence', (req, res, next) => {
    const { zoneId } = req.params;
    if (!isMallZoneId(zoneId)) return res.status(404).json({ ok: false, code: 'ZONE_NOT_FOUND' });
    void updatePresence(req, res, zoneId).catch(next);
  });

  router.get('/mall/snapshots/latest', (req, res, next) => {
    void (async () => {
      const source = await resolveSource(req, req.get('X-TallyNX-Mall-Channel'));
      const snapshot = source && createVerifiedSnapshot(source);
      if (!snapshot) return res.status(404).json({ ok: false, code: 'SNAPSHOT_UNAVAILABLE' });
      res.json({ ok: true, snapshot: { ...snapshot, proof: snapshotSignature(snapshot) } });
    })().catch(next);
  });

  router.get('/mall/stream', (_req, res) => {
    res.set({
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    const send = (event: string, payload: unknown) => {
      if (!res.writableEnded) res.write('data: ' + JSON.stringify({ event, payload, ts: new Date().toISOString() }) + '\n\n');
    };
    const heartbeat = () => send('mall.heartbeat', {});
    const chat = (event: MallEvent) => send('mall.chat', event);
    const presence = (event: MallEvent) => send('mall.presence', event);
    telemetryBus.on('mall.chat', chat);
    telemetryBus.on('mall.presence', presence);
    heartbeat();
    const timer = setInterval(heartbeat, 15_000);
    res.on('close', () => {
      clearInterval(timer);
      telemetryBus.off('mall.chat', chat);
      telemetryBus.off('mall.presence', presence);
    });
  });

  router.get('/desk-room', (_req, res, next) => {
    void readLegacyHistory().then(() => res.json({
      ok: true, room: 'global-xauusd', messages: engine.deskMessages(),
      participants: engine.activePresence(DESK_ROOM_ZONE_ID).map(toDeskRoomPresence), persistentStore: legacyAvailable ? 'VPS01' : 'LOCAL_FALLBACK',
    })).catch(next);
  });
  router.post('/desk-room', (req, res, next) => void postMessage(req, res, DESK_ROOM_ZONE_ID, true).catch(next));
  router.post('/desk-room/presence', (req, res, next) => void updatePresence(req, res, DESK_ROOM_ZONE_ID, true).catch(next));
  return router;
}
