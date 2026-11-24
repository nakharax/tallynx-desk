import { Decimal } from 'decimal.js';

// Bound input size before expanding exponents. Working precision covers the entire
// admitted exponent range, all fractional places and the carry from a large batch.
const Money = Decimal.clone({ precision: 1024 });
const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e([+-]?\d+))?$/i;

export function toDecimalString(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) return null;
  const input = String(value).trim();
  if (input.length > 256) return null;
  const match = numeric.exec(input);
  // A mantissa of up to 256 characters cannot offset a larger exponent into range.
  if (!match || Math.abs(Number(match[1] ?? 0)) > 512) return null;
  const decimal = new Money(input);
  if (!decimal.isFinite() || Math.abs(decimal.e) > 256 || decimal.dp() > 512) return null;
  return decimal.isZero() ? '0' : decimal.toFixed();
}

export function addDecimals(...values: unknown[]): string | null {
  if (!values.length) return null;
  let total = new Money(0);
  for (const value of values) {
    const normalized = toDecimalString(value);
    if (normalized === null) return null;
    total = total.plus(normalized);
  }
  return total.toFixed();
}

export function subDecimals(left: unknown, right: unknown): string | null {
  const a = toDecimalString(left);
  const b = toDecimalString(right);
  return a === null || b === null ? null : new Money(a).minus(b).toFixed();
}

export function computeNetExecutionPnl(parts: {
  kind?: 'TRADE' | 'DEPOSIT' | 'WITHDRAWAL' | 'OTHER_CASHFLOW';
  grossPnl: unknown; commission: string | null; swap: string | null; fee: string | null; reportedNet?: unknown;
}): string | null {
  if (parts.kind && parts.kind !== 'TRADE') return null;
  if (parts.commission === null || parts.swap === null || parts.fee === null) return null;
  const reported = toDecimalString(parts.reportedNet);
  if (reported !== null) return reported;
  return addDecimals(parts.grossPnl, parts.commission, parts.swap, parts.fee);
}
