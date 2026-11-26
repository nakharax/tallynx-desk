import assert from 'node:assert/strict';
import test from 'node:test';
import { speakTextWithFallback, VoiceWavRecorder } from './liveAudioEngine.ts';

test('switching away during the microphone permission prompt releases late-arriving tracks', async t => {
  let release!: (stream: MediaStream) => void;
  const pending = new Promise<MediaStream>(resolve => { release = resolve; });
  const original = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: () => pending } });
  t.after(() => {
    if (original) Object.defineProperty(navigator, 'mediaDevices', original);
    else Reflect.deleteProperty(navigator, 'mediaDevices');
  });
  let stopped = false;
  const recorder = new VoiceWavRecorder();
  const starting = recorder.start();
  await recorder.stop();
  release({ getTracks: () => [{ stop: () => { stopped = true; } }] } as unknown as MediaStream);
  await starting;
  assert.equal(stopped, true);
});

test('canceling a cloud speech request prevents audio playback and fallback', async t => {
  const controller = new AbortController();
  let signal: AbortSignal | null | undefined;
  let resolveFetch!: (response: Response) => void;
  const pending = new Promise<Response>(resolve => { resolveFetch = resolve; });
  t.mock.method(globalThis, 'fetch', (_url: string, init?: RequestInit) => {
    signal = init?.signal;
    return pending;
  });
  const options = { text: 'Read the review.', requestHeaders: {}, signal: controller.signal };
  const speech = speakTextWithFallback(options);
  controller.abort();
  resolveFetch(Response.json({ fallbackClientTts: true }));
  await assert.rejects(speech, { name: 'AbortError' });
  assert.equal(signal?.aborted, true);
});
