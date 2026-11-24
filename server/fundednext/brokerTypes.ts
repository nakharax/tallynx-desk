export type RawRow = Record<string, unknown>;

export interface BrokerAccount {
  accountId: string;
  login: string | null;
  rawPayload: RawRow;
  fetchedAt: string;
}

interface BrokerEvidence {
  accountId: string;
  rawPayload: RawRow;
  fetchedAt: string;
  sourceTimestampRaw: string | null;
  sourceTimestampUtc: string | null;
  sourceTimezone: string | null;
  missingFields: string[];
  unverifiedFields: string[];
}

export interface OpenPosition extends BrokerEvidence {
  id: string;
  symbol: string | null;
  side: 'BUY' | 'SELL' | null;
  volume: string | null;
  openPrice: string | null;
  stopLoss: string | null;
  takeProfit: string | null;
  risk: string | null;
  floatingPnl: string | null;
}

export interface AccountSnapshot extends BrokerEvidence {
  digest: string;
  balance: string | null;
  equity: string | null;
  initialBalance: string | null;
  currency: string | null;
  floatingPnl: string | null;
  netProfit: string | null;
  openPositions: OpenPosition[];
  marketQuietConfirmed: boolean;
}

export interface TradeExecution extends BrokerEvidence {
  id: string;
  dealId: string;
  cycleId: string | null;
  revision: number;
  digest: string;
  kind: 'TRADE' | 'DEPOSIT' | 'WITHDRAWAL' | 'OTHER_CASHFLOW';
  symbol: string | null;
  side: 'BUY' | 'SELL' | null;
  volume: string | null;
  risk: string | null;
  openPrice: string | null;
  closePrice: string | null;
  openedAt: string | null;
  closedAt: string | null;
  grossPnl: string | null;
  commission: string | null;
  swap: string | null;
  fee: string | null;
  netPnl: string | null;
  cashflowAmount: string | null;
}

export interface HistoryCursor {
  stage: 'cycles' | 'history';
  cycleIds: string[];
  cycleIndex: number;
  page: number;
  token: string | null;
  seen: string[];
  seenPages: string[];
}

export interface HistoryPage {
  trades: TradeExecution[];
  openPositions: OpenPosition[];
  cursor: HistoryCursor | null;
  status: 'PARTIAL' | 'COMPLETE';
  blockedReason: string | null;
}
