import { asRecord } from './aiProviderConfig.js';
import { readServerSentEvents } from './serverSentEvents.js';

export class CoachStreamError extends Error {
  constructor(readonly code: string, message = 'The response stream was interrupted.') {
    super(message);
  }
}

export async function readCoachReplyStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (name: string, payload: Record<string, unknown>) => void,
): Promise<Record<string, unknown> & { reply: string }> {
  for await (const { name, data } of readServerSentEvents(body)) {
    const payload = asRecord(JSON.parse(data));
    if (!payload) throw new CoachStreamError('AI_STREAM_INCOMPLETE');
    if (name === 'error') {
      throw new CoachStreamError(typeof payload.code === 'string' ? payload.code : 'AI_STREAM_INCOMPLETE',
        typeof payload.error === 'string' ? payload.error : undefined);
    }
    if (name === 'done') {
      if (typeof payload.reply !== 'string' || !payload.reply.trim()) break;
      return { ...payload, reply: payload.reply };
    }
    onEvent(name, payload);
  }
  throw new CoachStreamError('AI_STREAM_INCOMPLETE');
}
