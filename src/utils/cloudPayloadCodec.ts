export const CLOUD_GZIP_PREFIX = 'GZB64:';
export const CLOUD_GZIP_THRESHOLD_BYTES = 24_000;

interface NodeBufferLike {
  from(input: Uint8Array | string, encoding?: string): {
    toString(encoding?: string): string;
  } & Uint8Array;
}

function getGlobalBuffer(): NodeBufferLike | undefined {
  return (globalThis as unknown as { Buffer?: NodeBufferLike }).Buffer;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const globalBuf = getGlobalBuffer();
  if (globalBuf) {
    return globalBuf.from(bytes).toString('base64');
  }
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToUint8Array(b64: string): Uint8Array {
  const globalBuf = getGlobalBuffer();
  if (globalBuf) {
    return new Uint8Array(globalBuf.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function gzipBytes(input: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'function') {
    const stream = new CompressionStream('gzip');
    const bufPromise = new Response(stream.readable).arrayBuffer();
    const writer = stream.writable.getWriter();
    await writer.write(new Uint8Array(input));
    await writer.close();
    const buf = await bufPromise;
    return new Uint8Array(buf);
  }
  return null;
}

async function gunzipBytes(input: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'function') {
    const stream = new DecompressionStream('gzip');
    const bufPromise = new Response(stream.readable).arrayBuffer();
    const writer = stream.writable.getWriter();
    await writer.write(new Uint8Array(input));
    await writer.close();
    const buf = await bufPromise;
    return new Uint8Array(buf);
  }
  throw new Error('DecompressionStream is not supported in this runtime');
}

/**
 * Encodes serialized workspace JSON into GZB64:<base64-gzip> when >= threshold
 * and compression actually reduces byte length, fitting ~5x-10x more trades
 * inside Firestore's 900KB document rule while remaining backward-compatible.
 */
export async function compressWorkspaceJsonForCloud(
  rawJson: string,
  thresholdBytes: number = CLOUD_GZIP_THRESHOLD_BYTES
): Promise<string> {
  if (!rawJson || rawJson.length < thresholdBytes) {
    return rawJson;
  }
  try {
    const encodedBytes = new TextEncoder().encode(rawJson);
    const compressed = await gzipBytes(encodedBytes);
    if (!compressed) return rawJson;
    const candidate = `${CLOUD_GZIP_PREFIX}${uint8ArrayToBase64(compressed)}`;
    return candidate.length < rawJson.length ? candidate : rawJson;
  } catch {
    return rawJson;
  }
}

/**
 * Decodes either plain JSON or GZB64:<base64-gzip> Cloud payloads back to parsed object.
 */
export async function decodeCloudWorkspacePayload<T = unknown>(payloadJson: string): Promise<T> {
  const trimmed = String(payloadJson || '').trim();
  if (!trimmed.startsWith(CLOUD_GZIP_PREFIX)) {
    return JSON.parse(trimmed) as T;
  }
  const b64 = trimmed.slice(CLOUD_GZIP_PREFIX.length);
  const gzBytes = base64ToUint8Array(b64);
  const plainBytes = await gunzipBytes(gzBytes);
  const jsonText = new TextDecoder().decode(plainBytes);
  return JSON.parse(jsonText) as T;
}

/**
 * Escapes one cell safely for UTF-8 CSV (Google Drive / Google Sheets / Excel compatible).
 */
function csvCell(val: unknown): string {
  const raw = String(val ?? '');
  const neutralized = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

export function buildTradesArchiveCsv(
  accounts: Record<string, { name?: string; firm?: string; initial?: number }>,
  journal: Array<{
    id?: string;
    port?: string;
    date?: string;
    time?: string;
    dir?: string;
    entry?: number;
    slPrice?: number;
    tp1Price?: number;
    tp2Price?: number;
    tp3Price?: number;
    lotLeg?: number;
    risk?: number;
    rr?: number;
    pnlUsd?: number;
    status?: string;
    note?: string;
  }>
): string {
  const headers = [
    'Trade ID',
    'Port ID',
    'Port Name',
    'Prop Firm / Type',
    'Date',
    'Time (ICT)',
    'Direction',
    'Entry Price',
    'SL Price',
    'TP1 Price',
    'TP2 Price',
    'TP3 Price',
    'Lot / Leg',
    'Risk (USD)',
    'Result (R)',
    'PnL (USD)',
    'Status',
    'Notes',
  ];
  const rows = [headers.map(csvCell).join(',')];
  for (const tr of journal) {
    const acc = tr.port ? accounts[tr.port] : undefined;
    rows.push(
      [
        tr.id || '',
        tr.port || '',
        acc?.name || tr.port || '',
        acc?.firm || '',
        tr.date || '',
        tr.time || '',
        tr.dir || '',
        tr.entry ?? '',
        tr.slPrice ?? '',
        tr.tp1Price ?? '',
        tr.tp2Price ?? '',
        tr.tp3Price ?? '',
        tr.lotLeg ?? '',
        tr.risk ?? '',
        tr.rr ?? '',
        tr.pnlUsd ?? '',
        tr.status || '',
        tr.note || '',
      ]
        .map(csvCell)
        .join(',')
    );
  }
  return `\uFEFF${rows.join('\r\n')}`;
}
