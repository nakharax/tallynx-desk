import * as XLSX from 'xlsx';
import { Mt5PositionRecord, Mt5ReportMeta, Mt5TimeOffsetSetting } from '../types/ghr';
import { getBangkokIsoDate, parseMt5DateTimeToBangkok } from './ghrRules';

function parseMt5Num(val: unknown): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (val === null || val === undefined) return 0;
  const cleaned = String(val).replace(/\s+/g, '').replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function extractMt5RawDateTimeStr(val: unknown): string {
  if (val instanceof Date && !isNaN(val.getTime())) {
    // SheetJS stores Excel serial wall-clock times as UTC components
    return val.toISOString().slice(0, 19).replace('T', ' ');
  }
  return String(val || '').trim();
}

export function parseMt5SpreadsheetBuffer(
  arrayBuffer: ArrayBuffer,
  fileName: string,
  mt5TimeOffset: Mt5TimeOffsetSetting = 'AUTO_MT5'
): { meta: Mt5ReportMeta; positions: Mt5PositionRecord[] } {
  const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array', cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' });

  const meta: Mt5ReportMeta = {
    holderName: '',
    login: '',
    broker: '',
    currency: 'USD',
    initialDeposit: 0,
    summaryNetProfit: null,
  };

  const fileLoginMatch = String(fileName || '').match(/(\d{6,12})/);
  if (fileLoginMatch) {
    meta.login = fileLoginMatch[1];
  }

  let section = 'HEADER';
  const positions: Mt5PositionRecord[] = [];
  let depositSum = 0;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;

    const nonEmpty = row
      .map((c) => String(c === null || c === undefined ? '' : c).trim())
      .filter(Boolean);
    if (nonEmpty.length === 0) continue;

    const firstCell = String(row[0] || '').trim();
    const firstLower = firstCell.toLowerCase();
    const joinedRow = nonEmpty.join(' ');

    if (firstLower.startsWith('name:')) {
      meta.holderName = nonEmpty.slice(1).join(' ').trim();
      continue;
    }
    if (firstLower.startsWith('account:')) {
      const accText = nonEmpty.slice(1).join(' ');
      const loginM = accText.match(/(\d{5,12})/);
      if (loginM) meta.login = loginM[1];
      const currM = accText.match(/\(([A-Z]{3})\b/);
      if (currM) meta.currency = currM[1];
      continue;
    }
    if (firstLower.startsWith('company:')) {
      meta.broker = nonEmpty.slice(1).join(' ').trim();
      continue;
    }

    if (firstLower === 'positions' || joinedRow.toLowerCase() === 'positions') {
      section = 'POSITIONS';
      continue;
    }
    if (firstLower === 'orders' || joinedRow.toLowerCase() === 'orders') {
      section = 'ORDERS';
      continue;
    }
    if (firstLower === 'deals' || joinedRow.toLowerCase() === 'deals') {
      section = 'DEALS';
      continue;
    }
    if (firstLower.startsWith('working orders') || firstLower.startsWith('summary')) {
      section = 'OTHER';
    }

    const totalNetIdx = nonEmpty.findIndex((c) => c.toLowerCase().startsWith('total net profit'));
    if (totalNetIdx !== -1 && nonEmpty[totalNetIdx + 1] !== undefined) {
      meta.summaryNetProfit = parseMt5Num(nonEmpty[totalNetIdx + 1]);
    }

    if (section === 'POSITIONS') {
      if (firstLower === 'time') continue;

      const dateRegex = /^\d{4}[.\-/]\d{2}[.\-/]\d{2}\s+\d{2}:\d{2}/;
      const dateIndices: number[] = [];
      for (let c = 0; c < row.length; c++) {
        const cellStr = String(row[c] === null || row[c] === undefined ? '' : row[c]).trim();
        if (dateRegex.test(cellStr) || row[c] instanceof Date) {
          dateIndices.push(c);
        }
      }
      if (dateIndices.length === 0) continue;

      const openCol = dateIndices[0];
      const closeCol = dateIndices.length > 1 ? dateIndices[1] : -1;

      let typeCol = -1;
      let typeVal = '';
      const searchEnd = closeCol !== -1 ? closeCol : row.length;
      for (let c = openCol + 1; c < searchEnd; c++) {
        const v = String(row[c] || '').trim().toLowerCase();
        if (v === 'buy' || v === 'sell') {
          typeCol = c;
          typeVal = v;
          break;
        }
      }
      if (typeCol === -1) continue;

      let ticket = '';
      for (let c = openCol + 1; c < typeCol; c++) {
        const v = String(row[c] || '').trim();
        if (v) {
          ticket = v;
          break;
        }
      }
      let symbol = 'XAUUSD';
      for (let c = openCol + 2; c < typeCol; c++) {
        const v = String(row[c] || '').trim();
        if (v && v !== ticket) {
          symbol = v;
          break;
        }
      }

      const preCloseNums: number[] = [];
      const stopIdx = closeCol !== -1 ? closeCol : row.length;
      for (let c = typeCol + 1; c < stopIdx; c++) {
        const cellVal = row[c];
        if (cellVal !== '' && cellVal !== null && cellVal !== undefined) {
          preCloseNums.push(parseMt5Num(cellVal));
        } else {
          preCloseNums.push(0);
        }
      }

      const volume = preCloseNums[0] || 0.01;
      const openPrice = preCloseNums[1] || 0;
      const slPrice = preCloseNums[2] || 0;
      const tpPrice = preCloseNums[3] || 0;

      const postCloseVals: unknown[] = [];
      if (closeCol !== -1) {
        for (let c = closeCol + 1; c < row.length; c++) {
          const cellVal = row[c];
          if (cellVal !== '' && cellVal !== null && cellVal !== undefined) {
            postCloseVals.push(cellVal);
          }
        }
      }

      const closePrice = postCloseVals.length > 0 ? parseMt5Num(postCloseVals[0]) : openPrice;
      const commission = postCloseVals.length > 1 ? parseMt5Num(postCloseVals[1]) : 0;
      const swap = postCloseVals.length > 2 ? parseMt5Num(postCloseVals[2]) : 0;
      const rawProfit = postCloseVals.length > 3 ? parseMt5Num(postCloseVals[3]) : 0;
      const comment = postCloseVals.length > 4 ? String(postCloseVals[4] || '').trim() : '';

      if (openPrice <= 0) continue;

      const fallbackDate = getBangkokIsoDate();
      const rawOpenTime = extractMt5RawDateTimeStr(row[openCol]);
      const rawCloseTime = closeCol !== -1 ? extractMt5RawDateTimeStr(row[closeCol]) : rawOpenTime;
      const openDt = parseMt5DateTimeToBangkok(rawOpenTime, fallbackDate, mt5TimeOffset);
      const closeDt = closeCol !== -1 ? parseMt5DateTimeToBangkok(rawCloseTime, openDt.date, mt5TimeOffset) : openDt;

      positions.push({
        ticket: ticket || 'POS-' + (positions.length + 1),
        symbol,
        dir: typeVal === 'sell' ? 'SELL' : 'BUY',
        openDate: openDt.date,
        openTime: openDt.time,
        openTs: openDt.ts,
        closeDate: closeDt.date,
        closeTime: closeDt.time,
        closeTs: closeDt.ts,
        rawOpenTime: rawOpenTime || undefined,
        rawCloseTime: rawCloseTime || rawOpenTime || undefined,
        volume,
        openPrice,
        slPrice,
        tpPrice,
        closePrice,
        commission,
        swap,
        rawProfit,
        netProfit: +(rawProfit + commission + swap).toFixed(2),
        comment,
      });
    } else if (section === 'DEALS') {
      const hasBalanceType = nonEmpty.some((c) => c.toLowerCase() === 'balance');
      if (hasBalanceType) {
        const nums = nonEmpty.map((c) => parseMt5Num(c)).filter((n) => n > 100);
        if (nums.length > 0) {
          depositSum += nums[nums.length - 1];
        }
      }
    }
  }

  meta.initialDeposit = depositSum > 0 ? depositSum : 6000;
  return { meta, positions };
}
