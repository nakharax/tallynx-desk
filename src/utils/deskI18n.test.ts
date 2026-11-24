import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESK_I18N,
  formatAccountDisplayName,
  formatDeskPromptDisplay,
  formatMt5SyncMessage,
  formatMt5TimeOffsetLabel,
  formatSessionTitleDisplay,
  formatTradeNoteDisplay,
  getSlashCommandDescription,
  maskWorkspaceEmail,
  normalizeDeskLanguage,
  resolveInitialDeskLanguage,
} from './deskI18n';

test('deskI18n defaults to English and honors explicit language query parameters', () => {
  assert.equal(resolveInitialDeskLanguage(), 'en');
  assert.equal(resolveInitialDeskLanguage('?lang=unknown'), 'en');
  assert.equal(resolveInitialDeskLanguage('?lang=en'), 'en');
  assert.equal(resolveInitialDeskLanguage('?lang=en&source=tallynx-portal'), 'en');
  assert.equal(resolveInitialDeskLanguage('?lang=th'), 'th');
  assert.equal(normalizeDeskLanguage('EN'), 'en');
  assert.equal(normalizeDeskLanguage(' TH '), 'th');
  assert.equal(normalizeDeskLanguage('other'), 'en');
  assert.equal(normalizeDeskLanguage(undefined), 'en');

  const enKeys = Object.keys(DESK_I18N.en.analytics);
  const thKeys = Object.keys(DESK_I18N.th.analytics);
  assert.deepEqual(enKeys, thKeys);
});

test('display helpers localize built-in names and preserve custom names', () => {
  assert.equal(formatAccountDisplayName('พอร์ตหลัก · Prop $6K', 'en'), 'Primary · Prop $6K');
  assert.equal(formatAccountDisplayName('พอร์ต 2 · Funded 90%', 'en'), 'Port 2 · Funded 90%');
  assert.equal(formatAccountDisplayName('พอร์ต 3 · #12345', 'en'), 'Port 3 · #12345');
  assert.equal(formatAccountDisplayName('พอร์ตหลัก · Prop $6K', 'th'), 'พอร์ตหลัก · Prop $6K');
  assert.equal(formatAccountDisplayName('พอร์ตของฉัน', 'en'), 'พอร์ตของฉัน');
  assert.equal(formatAccountDisplayName('พอร์ตหลัก · Prop $60K', 'en'), 'พอร์ตหลัก · Prop $60K');
  assert.equal(formatSessionTitleDisplay('แชทวางแผนเทรดใหม่', 'en'), 'New Trading Session');
  assert.equal(formatSessionTitleDisplay('AI Live Desk · Session หลัก', 'en'), 'AI Live Desk · Primary Session');
  assert.equal(formatSessionTitleDisplay('แชทวางแผนเทรดใหม่', 'th'), 'แชทวางแผนเทรดใหม่');
  assert.equal(formatSessionTitleDisplay('แผนเทรดทอง', 'en'), 'แผนเทรดทอง');
});

test('every supported slash command has an English and Thai description', () => {
  const commands = ['/plan', '/chart', '/12gate', '/risk', '/search', '/journal', '/voice', '/live', '/new'];
  for (const command of commands) {
    const english = getSlashCommandDescription(command, 'en');
    assert.ok(english.length > 0);
    assert.doesNotMatch(english, /\p{Script=Thai}/u);
    assert.match(getSlashCommandDescription(command, 'th'), /\p{Script=Thai}/u);
  }
  assert.equal(getSlashCommandDescription(' /PLAN ', 'en'), getSlashCommandDescription('/plan', 'en'));
  assert.equal(getSlashCommandDescription('/unknown', 'en'), '');
});

test('trade note display translates generated text and preserves user comments', () => {
  assert.equal(formatTradeNoteDisplay('เก็บ TP1 แพ้ไม้ 2-3', 'en'), 'TP1 hit, legs 2 and 3 stopped out');
  assert.equal(formatTradeNoteDisplay('เก็บ TP1 แพ้ไม้ 2-3 (Copy)', 'en'), 'TP1 hit, legs 2 and 3 stopped out (Copy)');
  assert.equal(formatTradeNoteDisplay('MT5 #12 (0.02L · ปิด 4042.59 · โน้ต)', 'en'), 'MT5 #12 (0.02L · Closed at 4042.59 · โน้ต)');
  assert.equal(formatTradeNoteDisplay('รอกราฟยืนยัน', 'en'), 'รอกราฟยืนยัน');
});

test('legacy MT5 sync feedback and offset labels use English without changing source values', () => {
  const message = 'ซิงก์ #123 สำเร็จ: ดึง 5 โพซิชั่น → รวมเป็น 3 รายการใน Journal';
  assert.equal(formatMt5SyncMessage(message, 'en'), 'Synced #123. Imported 5 positions into 3 journal entries.');
  assert.equal(formatMt5SyncMessage(message, 'th'), message);
  const option = { value: '0', label: 'เวลาไทยอยู่แล้ว', shortLabel: 'ไม่ชดเชย' };
  assert.equal(formatMt5TimeOffsetLabel(option, 'en', true), '0h (no offset)');
  assert.equal(formatMt5TimeOffsetLabel(option, 'th'), option.label);
});

test('Desk prompt formatting translates generated prompts and preserves user text', () => {
  const chartPrompt = 'วิเคราะห์กราฟสด XAUUSD พร้อมสรุปโครงสร้าง EMA20/EMA50, RSI(14), ATR(14), แนวรับ-แนวต้าน และแผนความเสี่ยง 3-TP ปัจจุบัน';
  assert.match(formatDeskPromptDisplay(chartPrompt, 'en'), /Analyze the live XAUUSD chart/);
  assert.equal(formatDeskPromptDisplay(chartPrompt, 'th'), chartPrompt);
  assert.equal(formatDeskPromptDisplay('วิเคราะห์กราฟทอง', 'en'), 'วิเคราะห์กราฟทอง');
});

test('maskWorkspaceEmail hides internal/personal email handles while preserving domain recognition', () => {
  assert.equal(maskWorkspaceEmail('trader.desk@example.com'), 'tr***@example.com');
  assert.equal(maskWorkspaceEmail(null), 'Guest Workspace');
  assert.equal(maskWorkspaceEmail(''), 'Guest Workspace');
});
