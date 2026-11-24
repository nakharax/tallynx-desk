const DESK_SECTIONS = {
  analysis: 'sec-accounts',
  chart: 'tv-chart-root',
  calc: 'sec-calc',
  gate: 'desk-cards-root',
  journal: 'journal-root',
  market: 'sec-market',
  proprules: 'sec-proprules',
  mall: 'sec-mall',
  settings: 'sec-settings',
} as const;

export type DeskSectionId = (typeof DESK_SECTIONS)[keyof typeof DESK_SECTIONS];
export type DeskTheme = 'alabaster' | 'obsidian';
type DeskPage = keyof typeof DESK_SECTIONS;

const sectionByAlias = new Map<string, DeskSectionId>([
  ...Object.entries(DESK_SECTIONS),
  ...Object.values(DESK_SECTIONS).map((id): [string, DeskSectionId] => [id, id]),
  ['calculator-root', 'sec-calc'],
  ['sec-marketplace', 'sec-market'],
  ['community', 'sec-mall'],
]);

const PIP_VALUE_PER_LOT = { XAUUSD: 10, EURUSD: 10, NAS100: 1 } as const;

export interface WebSandboxPreset {
  balance: number;
  riskPct: number;
  slPips: number;
  symbol: keyof typeof PIP_VALUE_PER_LOT;
  mode: 'prop' | 'personal';
  dailyDd: number;
  source?: string;
  connectedVia?: 'xlsx' | 'cloud' | 'ex5';
}

export const WEB_SANDBOX_LIMITS = {
  balance: { min: 500, max: 2_000_000, step: 1 },
  riskPct: { min: 0.25, max: 5, step: 0.01 },
  slPips: { min: 5, max: 500, step: 1 },
  dailyDd: { min: 1, max: 12, step: 0.1 },
} as const;

const TRANSIENT_PARAMS = [
  'balance', 'risk_pct', 'sl_pips', 'symbol', 'mode', 'daily_dd',
  'source', 'connected_via', 'consistency_cap', 'day_share', 'step',
];

export function resolveDeskSection(search: string, hash = ''): DeskSectionId | undefined {
  return sectionByAlias.get(hash.replace(/^#\/?/, '').trim().toLowerCase())
    ?? sectionByAlias.get(new URLSearchParams(search).get('page')?.trim().toLowerCase() ?? '');
}

export function resolveDeskTheme(search: string): DeskTheme | undefined {
  const theme = new URLSearchParams(search).get('theme')?.trim().toLowerCase();
  if (theme === 'light' || theme === 'alabaster') return 'alabaster';
  if (theme === 'dark' || theme === 'obsidian') return 'obsidian';
  return undefined;
}

export function deskThemeToWeb(theme: DeskTheme): 'light' | 'dark' {
  return theme === 'obsidian' ? 'dark' : 'light';
}

export function buildWebPortalUrl(baseUrl: string, lang: 'en' | 'th', theme: DeskTheme): string {
  const url = new URL(baseUrl);
  url.searchParams.set('lang', lang);
  url.searchParams.set('theme', deskThemeToWeb(theme));
  return url.href;
}

export function updateDeskPageUrl(path: string, section: string): string {
  const url = new URL(path, 'https://desk.invalid');
  const resolved = sectionByAlias.get(section);
  const page = (Object.keys(DESK_SECTIONS) as DeskPage[]).find((key) => DESK_SECTIONS[key] === resolved);
  if (!page) return path;

  const wasLinkedByHash = Boolean(resolveDeskSection('', url.hash));
  if (page === 'proprules') {
    url.hash = 'proprules';
  } else if (wasLinkedByHash) {
    url.hash = '';
  }
  if (page === 'mall' || url.searchParams.has('page') || (wasLinkedByHash && page !== 'proprules')) {
    if (url.searchParams.get('page') !== page) url.searchParams.set('page', page);
  }
  return url.pathname + url.search + url.hash;
}

function inRange(value: number, { min, max }: { min: number; max: number }): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

function readNumber(params: URLSearchParams, key: string, field: keyof typeof WEB_SANDBOX_LIMITS) {
  const raw = params.get(key)?.trim();
  if (!raw || !/^\d+(?:\.\d+)?$/.test(raw)) return undefined;
  const value = Number(raw);
  return inRange(value, WEB_SANDBOX_LIMITS[field]) ? value : undefined;
}

export function parseWebHandoff(search: string): WebSandboxPreset | undefined {
  const params = new URLSearchParams(search);
  const balance = readNumber(params, 'balance', 'balance');
  const riskPct = readNumber(params, 'risk_pct', 'riskPct');
  const slPips = readNumber(params, 'sl_pips', 'slPips');
  const dailyDd = readNumber(params, 'daily_dd', 'dailyDd');
  const rawSymbol = params.get('symbol')?.trim().toUpperCase();
  const symbol = rawSymbol === 'XAUUSD' || rawSymbol === 'EURUSD' || rawSymbol === 'NAS100'
    ? rawSymbol
    : undefined;
  const rawMode = params.get('mode')?.trim().toLowerCase();
  const mode = rawMode === 'prop' || rawMode === 'personal' ? rawMode : undefined;
  if (!(balance || riskPct || slPips || dailyDd || symbol || mode)) return undefined;

  const source = params.get('source')?.trim();
  const connectedVia = params.get('connected_via')?.trim().toLowerCase();
  return {
    balance: balance ?? 10_000,
    riskPct: riskPct ?? 1,
    slPips: slPips ?? 25,
    symbol: symbol ?? 'XAUUSD',
    mode: mode ?? 'prop',
    dailyDd: dailyDd ?? (mode === 'personal' ? 5 : 4),
    ...(source && /^[a-z0-9_-]{1,64}$/i.test(source) ? { source } : {}),
    ...(connectedVia === 'xlsx' || connectedVia === 'cloud' || connectedVia === 'ex5'
      ? { connectedVia } : {}),
  };
}

export function stripWebHandoffParams(path: string): string {
  const url = new URL(path, 'https://desk.invalid');
  if (!TRANSIENT_PARAMS.some((key) => url.searchParams.has(key))) return path;
  for (const key of TRANSIENT_PARAMS) url.searchParams.delete(key);
  return url.pathname + url.search + url.hash;
}

export function calculateWebSandboxRisk(preset: WebSandboxPreset) {
  const { balance, riskPct, slPips, symbol, dailyDd } = preset;
  const fields = ['balance', 'riskPct', 'slPips', 'dailyDd'] as const;
  if (fields.some((key) => !inRange(preset[key], WEB_SANDBOX_LIMITS[key]))) return undefined;

  const riskUsd = Math.round(balance * riskPct) / 100;
  return {
    riskUsd,
    dailyLossUsd: Math.round(balance * dailyDd) / 100,
    modeledLots: riskUsd / (slPips * PIP_VALUE_PER_LOT[symbol]),
  };
}
