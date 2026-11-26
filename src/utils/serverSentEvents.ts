export function isEventStream(response: Response): boolean {
  return response.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() === 'text/event-stream';
}

export async function* readServerSentEvents(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const maxSize = 512_000;
  let buffer = '';
  let name = 'message';
  let lines: string[] = [];
  let size = 0;

  try {
    for (;;) {
      const { value, done } = await reader.read();
      const chunk = buffer + decoder.decode(value, { stream: !done });
      const pendingCr = !done && chunk.endsWith('\r');
      const linesInChunk = (pendingCr ? chunk.slice(0, -1) : chunk).split(/\r\n|\n|\r/);
      buffer = (linesInChunk.pop() ?? '') + (pendingCr ? '\r' : '');
      if (buffer.length > maxSize) throw new Error('Event stream line is too large.');
      if (done) {
        if (buffer) linesInChunk.push(buffer);
        linesInChunk.push('');
      }
      for (const line of linesInChunk) {
        if (line === '') {
          if (lines.length > 0) yield { name, data: lines.join('\n') };
          name = 'message';
          lines = [];
          size = 0;
        } else if (line.startsWith('event:')) {
          name = line.slice(6).trim() || 'message';
        } else if (line === 'data' || line.startsWith('data:')) {
          const value = line.slice(5).replace(/^ /, '');
          size += value.length + 1;
          if (size > maxSize) throw new Error('Event stream message is too large.');
          lines.push(value);
        }
      }
      if (done) return;
    }
  } finally {
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
