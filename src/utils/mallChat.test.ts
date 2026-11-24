import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  createMallChatEngine, DESK_ROOM_ZONE_ID, evaluateMallMessageSafeHarbor,
  sanitizeMallSetupBlueprint, sanitizeMallSnapshot, toDeskRoomMessage,
} from '../../server/mall/mallChatEngine.ts';
import { MALL_ZONES, isMt5VerifiedMallPost, type MallChatMessage } from '../types/mallChat.ts';
import {
  MALL_FEED_WINDOW_STEP,
  computeZoneMetricsMap,
  filterMallPosts,
  formatMallDate,
  formatMallTime,
  mergeMallMessages,
  selectPinnedBlueprints,
  sliceVisibleMallWindow,
} from './mallChat.ts';
import { REFERENCE_WORKSHEETS, referenceProofPayload } from './referenceWorksheets.ts';

test('moderates signal solicitation, calls and automated copy trading in EN and TH', () => {
  for (const text of ['buy now @ 2400', 'sell now @ 2400', 'BUY LIMIT XAUUSD @ 2400', 'BUY XAUUSD', 'XAUUSD SELL', 'Any buy signals?', 'Entry price: 2400; SL price: 2390', 'ซิกแนลแม่น', 'การันตีกำไร', 'copy trade อัตโนมัติ', 'ฝากเทรด', 'ขอสัญญาณซื้อขาย']) {
    const verdict = evaluateMallMessageSafeHarbor(text);
    assert.equal(verdict.allowed, false, text);
    assert.equal('code' in verdict && verdict.code, 'SIGNAL_LANGUAGE');
  }
  for (const text of ['Review SL and TP distance, 4% drawdown and consistency', 'ทบทวนแผนความเสี่ยงและระยะ SL', 'Yesterday I bought XAUUSD and recorded a 1R loss.', 'Do not share buy/sell signals.']) {
    assert.deepEqual(evaluateMallMessageSafeHarbor(text), { allowed: true });
  }
});

test('ships four structured zones and seeds empty discussion feeds', () => {
  assert.deepEqual(MALL_ZONES.map((zone) => zone.id), ['lounge-general', 'xauusd-session', 'prop-rules-qa', 'setup-showroom']);
  const engine = createMallChatEngine();
  for (const zone of MALL_ZONES) {
    const { messages, presence } = engine.list(zone.id);
    assert.ok(messages.length >= 3 && messages.length <= 4);
    assert.deepEqual(presence, []);
    assert.deepEqual(messages[0].reactions, {});
    assert.ok(messages.some(item => item.setupBlueprint?.checklistNotes.length));
    const thread = messages.find(item => item.replyCount > 0);
    assert.ok(thread);
    const replies = engine.list(zone.id, undefined, thread.id).messages.filter(item => item.threadRootId);
    assert.equal(replies.length, thread.replyCount);
    for (const item of [...messages, ...replies]) {
      assert.equal(item.authorRole, 'example');
      assert.equal(evaluateMallMessageSafeHarbor(item.text).allowed, true, item.text);
      assert.equal(isMt5VerifiedMallPost(item), false);
    }
  }
  assert.deepEqual(engine.deskMessages(), []);
});

test('editorial worksheet hashes cover the published distances and remain distinct from MT5 evidence', () => {
  for (const sheet of REFERENCE_WORKSHEETS) {
    assert.equal(createHash('sha256').update(referenceProofPayload(sheet)).digest('hex'), sheet.proofHash);
    const engine = createMallChatEngine();
    const { message } = engine.post('setup-showroom', {
      clientMessageId: 'reference', setupBlueprint: { listingId: sheet.id },
    }, 'local', { setupBlueprint: { ...sheet.blueprint, listingId: sheet.id, proofKind: 'reference', proofHash: sheet.proofHash } });
    assert.equal(isMt5VerifiedMallPost(message), false);
    const summary = engine.zones().find(zone => zone.id === 'setup-showroom');
    assert.equal(summary?.verifiedPostCount, 0);
    assert.equal(summary?.blueprintCount, engine.list('setup-showroom').messages.filter(item => item.setupBlueprint).length);
  }
});

test('upgrading earlier editorial posts retains trader replies and reactions across reloads', () => {
  const engine = createMallChatEngine();
  const zone = 'lounge-general';
  const root = engine.list(zone).messages[0];
  const reacted = engine.react(zone, root.id, { emoji: '🔥', handle: '@reader', active: true }).message;
  const reply = engine.post(zone, { text: 'Record all costs.', threadRootId: root.id, clientMessageId: 'costs' }, 'local').message;
  let saved: import('../../server/mall/mallChatEngine.ts').MallChatStore;
  const upgraded = createMallChatEngine({
    stored: { messages: [reacted, reply], reactionReceipts: [] },
    persist: store => { saved = store; },
  });
  const updatedRoot = upgraded.list(zone).messages.find(item => item.id === root.id);
  assert.deepEqual(updatedRoot?.reactions, { '🔥': ['@reader'] });
  assert.equal(updatedRoot?.replyCount, 1);
  assert.ok(upgraded.list(zone, undefined, root.id).messages.some(item => item.id === reply.id));
  assert.deepEqual(createMallChatEngine({ stored: saved! }).list(zone), upgraded.list(zone));
});

test('allows four reaction keys and safely replays add and remove requests', () => {
  const engine = createMallChatEngine();
  const zone = 'lounge-general';
  const id = engine.list(zone).messages[0].id;
  const react = (emoji: string, clientReactionId: string) => engine.react(zone, id, { handle: '@tester', emoji, clientReactionId });
  assert.throws(() => react('💰', 'invalid'));
  assert.deepEqual(react('🛡️', 'add').message.reactions, { '🛡️': ['@tester'] });
  assert.equal(react('🛡️', 'add').changed, false);
  assert.deepEqual(react('🛡️', 'remove').message.reactions, {});
  assert.equal(react('🛡️', 'add').changed, false);
});

test('only shares allowlisted 3-TP distances and strips executable fields and signal notes', () => {
  const blueprint = sanitizeMallSetupBlueprint({
    title: 'Risk review', primarySymbol: 'xauusd', timeframe: 'M15', sessionFocus: 'LONDON',
    riskUsd: 50, slPoints: 100, tp1Points: 40, tp2Points: 80, tp3Points: 120,
    checklistNotes: ['Check drawdown', 'buy now @ 2400', 'Entry price: 2400', 'SL price: 2390'],
    directionMode: 'BUY', entryPrice: 2400, executionPlaybook: 'sell now @ 2400',
  });
  assert.deepEqual(blueprint, {
    title: 'Risk review', primarySymbol: 'XAUUSD', timeframe: 'M15', sessionFocus: 'LONDON',
    riskUsd: 50, slPoints: 100, tp1Points: 40, tp2Points: 80, tp3Points: 120,
    checklistNotes: ['Check drawdown'],
  });
});

test('rejects lookalike snapshot hosts, path traversal, and unsigned SVG', () => {
  const snapshot = { snapshotId: 'closed-1', symbol: 'XAUUSD', capturedAt: '2026-01-01T10:00:00Z' };
  assert.ok(sanitizeMallSnapshot({ ...snapshot, snapshotUrl: 'https://cdn.tallynx.com/snapshots/closed-1.svg' }));
  for (const snapshotUrl of ['https://cdn.tallynx.com.evil.test/snapshots/closed-1.svg', 'https://cdn.tallynx.com/snapshots/../closed-1.svg', 'data:image/svg+xml;utf8,%3Csvg%2F%3E']) {
    assert.equal(sanitizeMallSnapshot({ ...snapshot, snapshotUrl }), undefined);
  }
});

test('bridges legacy XAUUSD messages to the same feed with the old response shape', () => {
  const engine = createMallChatEngine({ legacyMessages: [{ id: 'room-42', handle: 'old_desk', text: 'Review daily drawdown', createdAt: '14:42' }] });
  assert.equal(DESK_ROOM_ZONE_ID, 'xauusd-session');
  const message = engine.list(DESK_ROOM_ZONE_ID).messages.find((item) => item.id === 'room-42');
  assert.ok(message);
  assert.deepEqual(toDeskRoomMessage(message), {
    id: 'room-42', handle: '@old_desk', text: 'Review daily drawdown', symbol: 'XAUUSD', createdAt: '14:42', isTradeIdea: false,
  });
  assert.equal(engine.list('lounge-general').messages.some((item) => item.id === 'room-42'), false);
  engine.post(DESK_ROOM_ZONE_ID, { text: 'Review realized R', threadRootId: message.id, clientMessageId: 'reply' }, '127.0.0.1');
  assert.deepEqual(engine.deskMessages().map((item) => item.id), ['room-42']);
  engine.replaceLegacyPresence([{ handle: 'old_desk', status: 'CLOSED_FOR_DAY', rMultipleToday: 0.7 }]);
  assert.equal(engine.list(DESK_ROOM_ZONE_ID).presence[0]?.rMultipleToday, 0.7);
  assert.equal(engine.list('lounge-general').presence.length, 0);
  assert.throws(() => engine.post(DESK_ROOM_ZONE_ID, { text: 'Setup', clientMessageId: 'idea', isTradeIdea: true }, '127.0.0.1'), { code: 'SIGNAL_LANGUAGE' });
});

test('replayed posts bypass the rate limit and only increment thread counts once', () => {
  const engine = createMallChatEngine();
  const zone = 'lounge-general';
  const root = engine.list(zone).messages[0];
  const post = { handle: 'member', text: 'Review SL distance', threadRootId: root.id, clientMessageId: 'reply-0' };
  const reply = engine.post(zone, post, '127.0.0.1');
  for (let i = 1; i < 10; i += 1) engine.post(zone, { ...post, clientMessageId: `reply-${i}` }, '127.0.0.1');
  assert.equal(engine.post(zone, post, '127.0.0.1').message.id, reply.message.id);
  assert.equal(engine.list(zone).messages.find((item) => item.id === root.id)?.replyCount, 10);
  assert.throws(() => engine.post(zone, { ...post, clientMessageId: 'another' }, '127.0.0.1'), { code: 'RATE_LIMITED' });
});

function makeMallMsg(overrides: Partial<MallChatMessage> & { id: string }): MallChatMessage {
  return {
    clientMessageId: overrides.id,
    zoneId: 'xauusd-session',
    handle: '@desk_trader',
    authorRole: 'trader',
    createdAt: '2026-11-24T10:00:00.000Z',
    text: 'Review daily drawdown and realized R.',
    replyCount: 0,
    reactions: {},
    ...overrides,
  };
}

test('mergeMallMessages preserves identity on empty updates and fast-appends chronological posts', () => {
  const m1 = makeMallMsg({ id: 'm1', createdAt: '2026-11-24T10:00:00.000Z' });
  const m2 = makeMallMsg({ id: 'm2', createdAt: '2026-11-24T10:05:00.000Z' });
  const m0 = makeMallMsg({ id: 'm0', createdAt: '2026-11-24T09:55:00.000Z' });

  const initial = [m1];
  assert.equal(mergeMallMessages(initial, []), initial);

  const appended = mergeMallMessages(initial, [m2]);
  assert.deepEqual(appended.map((m) => m.id), ['m1', 'm2']);

  const updated = mergeMallMessages(appended, [{ ...m2, replyCount: 2 }]);
  assert.equal(updated[1].replyCount, 2);

  const prepended = mergeMallMessages(updated, [m0]);
  assert.deepEqual(prepended.map((m) => m.id), ['m0', 'm1', 'm2']);
});

test('filterMallPosts filters by type, symbol, query, and localized example text', () => {
  const posts: MallChatMessage[] = [
    makeMallMsg({
      id: 'p1',
      handle: '@alice',
      symbol: 'XAUUSD',
      text: 'London close audit',
      replyCount: 2,
      verifiedBadge: { channel: 'LIVE_BRIDGE', brokerName: 'BrokerA', verifiedAt: '2026-11-24T09:00:00Z' },
    }),
    makeMallMsg({
      id: 'p2',
      handle: '@bob',
      authorRole: 'example',
      text: 'English worksheet text',
      setupBlueprint: {
        title: 'NAS100 Session Ladder',
        primarySymbol: 'NAS100',
        timeframe: 'M15',
        sessionFocus: 'NY',
        riskUsd: 50,
        slPoints: 100,
        tp1Points: 100,
        tp2Points: 200,
        tp3Points: 300,
        checklistNotes: ['Check daily cap'],
        proofHash: 'a'.repeat(64),
      },
    }),
  ];

  assert.equal(filterMallPosts(posts, { filter: 'ALL', symbol: 'ALL', query: '' }), posts);
  assert.deepEqual(
    filterMallPosts(posts, { filter: 'VERIFIED', symbol: 'ALL', query: '' }).map((p) => p.id),
    ['p1'],
  );
  assert.deepEqual(
    filterMallPosts(posts, { filter: 'BLUEPRINTS', symbol: 'NAS100', query: '' }).map((p) => p.id),
    ['p2'],
  );
  assert.deepEqual(
    filterMallPosts(posts, { filter: 'THREADS', symbol: 'ALL', query: '' }).map((p) => p.id),
    ['p1'],
  );
  assert.deepEqual(
    filterMallPosts(posts, {
      filter: 'ALL',
      symbol: 'ALL',
      query: 'เวิร์กชีต',
      getLocalizedText: (m) => (m.id === 'p2' ? 'เวิร์กชีตดัชนี' : m.text),
    }).map((p) => p.id),
    ['p2'],
  );
});

test('selectPinnedBlueprints, sliceVisibleMallWindow, computeZoneMetricsMap, and date formatters work deterministically', () => {
  const posts: MallChatMessage[] = Array.from({ length: 55 }, (_, i) =>
    makeMallMsg({
      id: `msg-${i}`,
      createdAt: `2026-11-24T10:${String(i).padStart(2, '0')}:00.000Z`,
      setupBlueprint:
        i === 5 || i === 50
          ? {
              listingId: `list-${i}`,
              title: `Blueprint ${i}`,
              primarySymbol: 'XAUUSD',
              timeframe: 'M15',
              sessionFocus: 'LONDON',
              riskUsd: 60,
              slPoints: 100,
              tp1Points: 100,
              tp2Points: 200,
              tp3Points: 300,
              checklistNotes: ['Verify buffer'],
              proofHash: i === 50 ? 'b'.repeat(64) : undefined,
            }
          : undefined,
      authorRole: i === 5 ? 'example' : 'trader',
    }),
  );

  const pinned = selectPinnedBlueprints(posts, 2);
  assert.deepEqual(pinned.map((p) => p.id), ['msg-50', 'msg-5']);

  const windowed = sliceVisibleMallWindow(posts, MALL_FEED_WINDOW_STEP);
  assert.equal(windowed.visible.length, MALL_FEED_WINDOW_STEP);
  assert.equal(windowed.hiddenCount, 15);
  assert.equal(windowed.visible[0].id, 'msg-15');
  assert.equal(windowed.visible[windowed.visible.length - 1].id, 'msg-54');

  const metrics = computeZoneMetricsMap([], { 'xauusd-session': posts });
  assert.equal(metrics['xauusd-session'].messageCount, 55);
  assert.equal(metrics['xauusd-session'].blueprintCount, 2);
  assert.equal(metrics['xauusd-session'].verifiedCount, 1);

  assert.ok(formatMallTime('2026-11-24T10:30:00.000Z', 'en').length > 0);
  assert.ok(formatMallDate('2026-11-24T10:30:00.000Z', 'th').length > 0);
  assert.equal(formatMallTime('not-a-date', 'en'), 'not-a-date');
});
