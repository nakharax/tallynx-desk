import type { ChatSuggestedAction } from '../types/ghr';

export interface SlashCommandDef {
  command: string;
  label: string;
  description: string;
  action: 'prompt' | 'mode' | 'new_session';
  template?: string;
  forceWebSearch?: boolean;
  mode?: 'text' | 'voice' | 'live';
}

export const SLASH_COMMANDS: readonly SlashCommandDef[] = [
  {
    command: '/plan',
    label: '/plan',
    description: 'สรุปแผนปฏิบัติการ GHR v3.2 จากพอร์ตและโพย 3-TP ปัจจุบัน',
    action: 'prompt',
    template: 'ช่วยวางแผนการเทรดวันนี้จากข้อมูลพอร์ตปัจจุบัน โพย 3-TP ความเสี่ยงที่เหลือ และเป้าหมาย Target Profit',
  },
  {
    command: '/chart',
    label: '/chart',
    description: 'วิเคราะห์กราฟสด H1/M5 + EMA20/50/RSI/ATR เทียบระยะ SL -1,000p',
    action: 'prompt',
    template: 'ช่วยอ่านกราฟสดตอนนี้ (Trend Bias, EMA20/50, RSI, ATR, แนวรับ/ต้าน) เทียบกับโพย 3-TP และระยะ SL มาตรฐาน',
  },
  {
    command: '/12gate',
    label: '/12gate',
    description: 'ตรวจสอบเช็กลิสต์วินัย 12-Gate ที่ยังไม่ผ่านก่อนวางออเดอร์',
    action: 'prompt',
    template: 'ช่วยตรวจสอบรายการ 12-Gate Checklist บนโต๊ะตอนนี้ ว่ามีด่านไหนยัง BLOCKED และต้องระวังอะไรบ้าง',
  },
  {
    command: '/risk',
    label: '/risk',
    description: 'เช็ก Daily DD Buffer, กฎ 40% Consistency และ Lot ที่ปลอดภัย',
    action: 'prompt',
    template: 'ช่วยประเมินความเสี่ยง Margin/Drawdown Buffer ขนาด Lot และเช็กกฎ 40% Consistency ของพอร์ตนี้',
  },
  {
    command: '/search',
    label: '/search <คำค้น>',
    description: 'บังคับเปิด Google Search Grounding ค้นข่าวเศรษฐกิจ/กฎ Prop ล่าสุด',
    action: 'prompt',
    forceWebSearch: true,
    template: 'ช่วยค้นหาข่าวเศรษฐกิจสำคัญวันนี้ (FOMC, CPI, NFP, ผลตอบแทนพันธบัตร/ทองคำ) ที่มีผลต่อความผันผวนของ XAUUSD',
  },
  {
    command: '/journal',
    label: '/journal',
    description: 'วิเคราะห์จุดรั่วไหล สถิติ Winrate และค่าคาดหวังจาก Trade Journal',
    action: 'prompt',
    template: 'ช่วยวิเคราะห์ Trade Journal ของพอร์ตนี้ (Win Ratio, Avg Win/Loss, ช่วงเวลาทำกำไร และวินัย GHR)',
  },
  {
    command: '/voice',
    label: '/voice',
    description: 'สลับเข้าโหมด Voice (พูดสั่งงาน + อ่านคำตอบออกเสียง)',
    action: 'mode',
    mode: 'voice',
  },
  {
    command: '/live',
    label: '/live',
    description: 'สลับเข้าโหมด Live (คุยเสียงเรียลไทม์ 2 ทาง Gemini 3.8 Live)',
    action: 'mode',
    mode: 'live',
  },
  {
    command: '/new',
    label: '/new',
    description: 'เปิด Session แชทใหม่และเก็บแชทนี้เข้าประวัติแชทล่าสุด',
    action: 'new_session',
  },
] as const;

export interface ParsedSlashCommand {
  matched: SlashCommandDef;
  argumentText: string;
  effectivePrompt: string;
  forceWebSearch: boolean;
}

export function parseSlashCommand(rawInput: string): ParsedSlashCommand | null {
  const trimmed = rawInput.trim();
  if (!trimmed.startsWith('/')) return null;
  const match = trimmed.match(/^(\/[a-z0-9_-]+)(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  const cmdName = match[1].toLowerCase();
  const arg = (match[2] || '').trim();
  const def = SLASH_COMMANDS.find((c) => c.command.toLowerCase() === cmdName);
  if (!def) return null;

  let effectivePrompt = arg;
  if (def.action === 'prompt') {
    if (cmdName === '/search') {
      effectivePrompt = arg || def.template || trimmed;
    } else if (arg) {
      effectivePrompt = `${def.template}\n\nรายละเอียดเพิ่มเติม: ${arg}`;
    } else {
      effectivePrompt = def.template || trimmed;
    }
  }

  return {
    matched: def,
    argumentText: arg,
    effectivePrompt,
    forceWebSearch: Boolean(def.forceWebSearch),
  };
}

export function filterSlashCommands(query: string): SlashCommandDef[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed.startsWith('/')) return [];
  const token = trimmed.split(/\s+/)[0];
  if (token === '/') return [...SLASH_COMMANDS];
  return SLASH_COMMANDS.filter(
    (c) =>
      c.command.toLowerCase().startsWith(token) ||
      c.description.toLowerCase().includes(token.slice(1)),
  );
}

export function downsampleFloat32ToPcm16(
  input: Float32Array,
  inputSampleRate: number,
  targetSampleRate = 16000,
): Int16Array {
  if (input.length === 0) return new Int16Array(0);
  const srcRate = Math.max(1000, Math.round(inputSampleRate || 16000));
  const dstRate = Math.max(1000, Math.round(targetSampleRate || 16000));

  if (srcRate === dstRate) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
    }
    return out;
  }

  const ratio = srcRate / dstRate;
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const out = new Int16Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += input[j];
      count++;
    }
    const sample = count > 0 ? sum / count : input[Math.min(start, input.length - 1)];
    const clamped = Math.max(-1, Math.min(1, sample));
    out[i] = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
  }
  return out;
}

function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  }
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function pcm16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  return uint8ToBase64(bytes);
}

export function base64ToPcm16Float32(base64: string): Float32Array {
  if (!base64) return new Float32Array(0);
  const bytes = base64ToUint8(base64);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const out = new Float32Array(sampleCount);
  const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
  for (let i = 0; i < sampleCount; i++) {
    out[i] = view.getInt16(i * 2, true) / 0x8000;
  }
  return out;
}

export function encodePcm16ToWavBase64(pcm: Int16Array, sampleRate = 16000): string {
  const dataByteLen = pcm.byteLength;
  const buffer = new ArrayBuffer(44 + dataByteLen);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLen, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byteRate = sampleRate * numChannels * 2
  view.setUint16(32, 2, true); // blockAlign
  view.setUint16(34, 16, true); // bitsPerSample
  writeAscii(36, 'data');
  view.setUint32(40, dataByteLen, true);

  const wavBytes = new Uint8Array(buffer);
  const pcmBytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  wavBytes.set(pcmBytes, 44);
  return uint8ToBase64(wavBytes);
}

export function stripMarkdownForSpeech(text: string): string {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' (ดูโค้ดหรือตารางในหน้าจอ) ')
    .replace(/\|[^\n]+\|/g, ' ')
    .replace(/[#>*_`~]+/g, ' ')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractDeskActionSuggestions(
  replyText: string,
  activePageId?: string,
): ChatSuggestedAction[] {
  const suggestions: ChatSuggestedAction[] = [];
  const lower = replyText.toLowerCase();

  if (/(12-gate|ด่านตรวจ|เช็กลิสต์|blocked)/i.test(lower) && activePageId !== 'desk-cards-root') {
    suggestions.push({ label: 'เปิดหน้า 12-Gate', type: 'PAGE', value: 'desk-cards-root' });
  }
  if (/(3-tp|trailing\s*lock|คำนวณ|lot|stop\s*loss|rules?)/i.test(lower) && activePageId !== 'calculator-root') {
    suggestions.push({ label: 'เปิดเครื่องคำนวณ 3-TP', type: 'PAGE', value: 'calculator-root' });
  }
  if (/(กราฟสด|ema|rsi|atr|tradingview|live\s*chart)/i.test(lower) && activePageId !== 'tv-chart-root') {
    suggestions.push({ label: 'เปิดกราฟสด Live Chart', type: 'PAGE', value: 'tv-chart-root' });
  }
  if (/(journal|สมุดเทรด|บันทึกเทรด|สถิติไม้)/i.test(lower) && activePageId !== 'journal-root') {
    suggestions.push({ label: 'เปิดสมุดเทรด Journal', type: 'PAGE', value: 'journal-root' });
  }
  if (/(mt5|ซิงก์พอร์ต|fundednext|live\s*bridge)/i.test(lower)) {
    suggestions.push({ label: 'เปิด MT5 Sync', type: 'MT5_SYNC', value: 'open' });
  }
  if (/(prop\s*rules|ftmo|fundednext|the5ers|consistency)/i.test(lower) && activePageId !== 'sec-proprules') {
    suggestions.push({ label: 'ดูตาราง PropRules', type: 'PAGE', value: 'sec-proprules' });
  }

  return suggestions.slice(0, 3);
}
