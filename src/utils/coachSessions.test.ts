import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SESSION_TITLE,
  createChatSession,
  deleteSessionById,
  deriveSessionTitle,
  filterSessions,
  getMostRecentOtherSession,
  migrateLegacyChatMessages,
  renameSession,
  sortSessionsByRecent,
  togglePinSession,
  upsertSession,
} from './coachSessions.ts';
import type { ChatMessage } from '../types/ghr.ts';

test('createChatSession and deriveSessionTitle strip slash prefixes and clamp length', () => {
  const s = createChatSession({
    activePortId: 'port1',
    welcomeMessage: { id: 'w1', role: 'model', text: 'Welcome', timestamp: '09:00' },
  });
  assert.equal(s.title, DEFAULT_SESSION_TITLE);
  assert.equal(s.messages.length, 1);

  const msgs: ChatMessage[] = [
    { id: 'u1', role: 'user', text: '/plan   เช็กความเสี่ยงพอร์ตทองคำวันนี้เทียบกับ Daily DD   ', timestamp: '09:01' },
  ];
  const title = deriveSessionTitle(msgs);
  assert.equal(title.startsWith('/plan'), false);
  assert.ok(title.length <= 46);
  assert.ok(title.includes('เช็กความเสี่ยง'));
});

test('sortSessionsByRecent puts pinned sessions first, then updatedAt desc', () => {
  const s1 = createChatSession({ id: 's1', title: 'Old', nowIso: '2026-11-18T10:00:00Z' });
  const s2 = createChatSession({ id: 's2', title: 'Newer', nowIso: '2026-11-18T12:00:00Z' });
  const s3 = {
    ...createChatSession({ id: 's3', title: 'Pinned Old', nowIso: '2026-11-18T08:00:00Z' }),
    pinned: true,
  };
  const sorted = sortSessionsByRecent([s1, s2, s3]);
  assert.deepEqual(sorted.map((s) => s.id), ['s3', 's2', 's1']);
});

test('upsertSession, togglePinSession, renameSession, deleteSessionById, and filterSessions behave cleanly', () => {
  let list = upsertSession([], createChatSession({ id: 'a', title: 'FOMC Check', nowIso: '2026-11-18T10:00:00Z' }));
  list = upsertSession(list, createChatSession({ id: 'b', title: 'GHR 3-TP Math', nowIso: '2026-11-18T11:00:00Z' }));
  assert.equal(list[0].id, 'b');

  list = togglePinSession(list, 'a');
  assert.equal(list[0].id, 'a');

  list = renameSession(list, 'b', '  Prop 40% Rule Audit  ');
  assert.equal(list.find((s) => s.id === 'b')?.title, 'Prop 40% Rule Audit');

  const recentOther = getMostRecentOtherSession(list, 'a');
  assert.equal(recentOther?.id, 'b');

  const filtered = filterSessions(list, 'fomc');
  assert.deepEqual(filtered.map((s) => s.id), ['a']);

  list = deleteSessionById(list, 'a');
  assert.deepEqual(list.map((s) => s.id), ['b']);
});

test('migrateLegacyChatMessages creates a clean primary session from existing messages', () => {
  const legacy: ChatMessage[] = [
    { id: 'm1', role: 'model', text: 'Ready', timestamp: '08:00', model: 'System' },
    { id: 'u1', role: 'user', text: 'Check 12-Gate status', timestamp: '08:05' },
  ];
  const migrated = migrateLegacyChatMessages(legacy, 'port1');
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].messages.length, 2);
  assert.equal(migrated[0].title, 'Check 12-Gate status');
});
