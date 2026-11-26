import assert from 'node:assert/strict';
import test from 'node:test';
import { readCoachReplyStream } from './coachReplyStream.ts';

test('reads split CRLF and multibyte UTF-8, then stops at the terminal reply', async () => {
  const bytes = new TextEncoder().encode('event: delta\r\ndata: {"text":"ไทย"}\r\n\r\nevent: done\r\ndata: {"reply":"ไทย"}\r\n\r\n');
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    },
    cancel() { cancelled = true; },
  });
  const seen: string[] = [];
  const reply = await readCoachReplyStream(body, name => seen.push(name));
  assert.deepEqual(seen, ['delta']);
  assert.equal(reply.reply, 'ไทย');
  assert.equal(cancelled, true);
});

test('rejects a BYOK error after partial text and a stream closed before done', async () => {
  const delta = 'event: delta\ndata: {"text":"Partial"}\n\n';
  const payload = 'event: error\ndata: {"code":"BYOK_REQUIRED"}\n\n';
  await assert.rejects(readCoachReplyStream(new Response(delta + payload).body!, () => {}), { code: 'BYOK_REQUIRED' });
  await assert.rejects(readCoachReplyStream(new Response(delta).body!, () => {}), { code: 'AI_STREAM_INCOMPLETE' });
});
