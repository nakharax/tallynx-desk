import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SLASH_COMMANDS,
  base64ToPcm16Float32,
  downsampleFloat32ToPcm16,
  encodePcm16ToWavBase64,
  extractDeskActionSuggestions,
  filterSlashCommands,
  parseSlashCommand,
  pcm16ToBase64,
  stripMarkdownForSpeech,
} from './liveAudioUtils.ts';

test('parseSlashCommand and filterSlashCommands parse AI Live Desk commands accurately', () => {
  assert.ok(SLASH_COMMANDS.length >= 8);
  const all = filterSlashCommands('/');
  assert.equal(all.length, SLASH_COMMANDS.length);

  const parsedSearch = parseSlashCommand('/search FOMC rate cut gold today');
  assert.ok(parsedSearch);
  assert.equal(parsedSearch.matched.command, '/search');
  assert.equal(parsedSearch.forceWebSearch, true);
  assert.equal(parsedSearch.effectivePrompt, 'FOMC rate cut gold today');

  const parsedVoice = parseSlashCommand('/live');
  assert.ok(parsedVoice);
  assert.equal(parsedVoice.matched.action, 'mode');
  assert.equal(parsedVoice.matched.mode, 'live');

  assert.equal(parseSlashCommand('normal question'), null);
});

test('PCM16 downsampling, base64 round-trip, and WAV header encoding produce valid audio payloads', () => {
  const input = new Float32Array(4800); // 100ms @ 48kHz
  for (let i = 0; i < input.length; i++) {
    input[i] = Math.sin((i / 48000) * 2 * Math.PI * 440) * 0.5;
  }
  const pcm16 = downsampleFloat32ToPcm16(input, 48000, 16000);
  assert.equal(pcm16.length, 1600);

  const b64 = pcm16ToBase64(pcm16);
  const roundTrip = base64ToPcm16Float32(b64);
  assert.equal(roundTrip.length, 1600);
  assert.ok(Math.abs(roundTrip[10] - pcm16[10] / 0x8000) < 1e-4);

  const wavB64 = encodePcm16ToWavBase64(pcm16, 16000);
  const wavBytes = Buffer.from(wavB64, 'base64');
  assert.equal(wavBytes.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(wavBytes.subarray(8, 12).toString('ascii'), 'WAVE');
  assert.equal(wavBytes.length, 44 + 1600 * 2);
});

test('stripMarkdownForSpeech and extractDeskActionSuggestions clean text and detect Desk routes', () => {
  const cleaned = stripMarkdownForSpeech('### แผน **GHR v3.2**\n- ตรวจ `12-Gate` [docs](https://tallynx.com)');
  assert.equal(cleaned.includes('**'), false);
  assert.equal(cleaned.includes('###'), false);
  assert.ok(cleaned.includes('GHR v3.2'));

  const actions = extractDeskActionSuggestions(
    'กรุณาตรวจด่าน 12-Gate ก่อนตั้งโพย 3-TP และดูกราฟสดบน Live Chart',
    'sec-accounts',
  );
  assert.equal(actions.length, 3);
  assert.deepEqual(
    actions.map((a) => a.value),
    ['desk-cards-root', 'calculator-root', 'tv-chart-root'],
  );
});
