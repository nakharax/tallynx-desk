export interface Mt5BrokerCatalogItem {
  id: string;
  broker: string;
  category: 'PROP_FIRM' | 'RETAIL_BROKER';
  aliases: string[];
  servers: string[];
}

function expandNumberedServers(
  baseName: string,
  max: number,
  options?: { separator?: string; padZero?: boolean; includeFirstNumber?: boolean }
): string[] {
  const sep = options?.separator ?? '';
  const padZero = options?.padZero ?? false;
  const includeFirstNumber = options?.includeFirstNumber ?? false;
  const list: string[] = [];
  for (let i = 1; i <= max; i += 1) {
    if (i === 1 && !includeFirstNumber) {
      list.push(baseName);
    } else {
      const numStr = padZero && i < 10 ? `0${i}` : String(i);
      list.push(`${baseName}${sep}${numStr}`);
    }
  }
  return list;
}

export const MT5_BROKER_CATALOG: Mt5BrokerCatalogItem[] = [
  // ============================================================================
  // 1. PROP FIRMS (กองทุน Prop Firm ยอดนิยม)
  // ============================================================================
  {
    id: 'ftmo',
    broker: 'FTMO',
    category: 'PROP_FIRM',
    aliases: ['ftmo'],
    servers: [
      ...expandNumberedServers('FTMO-Server', 5),
      ...expandNumberedServers('FTMO-Demo', 3),
      'FTMO-Classic',
    ],
  },
  {
    id: 'the5ers',
    broker: 'The5ers (Five Percent Online)',
    category: 'PROP_FIRM',
    aliases: ['the5ers', '5ers', 'fivepercent', 'five percent'],
    servers: [
      'FivePercentOnline-Real',
      'FivePercentOnline-Demo',
      'The5ers-MT5',
      'The5ers-Live',
      'The5ers-Demo',
    ],
  },
  {
    id: 'fundednext',
    broker: 'FundedNext',
    category: 'PROP_FIRM',
    aliases: ['fundednext', 'growthnext'],
    servers: [
      ...expandNumberedServers('FundedNext-Server', 5, { separator: ' ' }),
      ...expandNumberedServers('FundedNext-Server', 5),
      'FundedNext-Trial',
      'FundedNext-Demo',
      'GrowthNext-Server',
      'GrowthNext-Trial',
    ],
  },
  {
    id: 'fundingpips',
    broker: 'FundingPips',
    category: 'PROP_FIRM',
    aliases: ['fundingpips', 'funding pips'],
    servers: [
      'FundingPips-MT5',
      'FundingPips-Real',
      'FundingPips-Demo',
      'FundingPips2-SIM',
      'BlackBullMarkets-Demo',
      'BlackBullMarkets-Live',
    ],
  },
  {
    id: 'alphacapital',
    broker: 'Alpha Capital Group (ACG)',
    category: 'PROP_FIRM',
    aliases: ['alpha capital', 'acg', 'acgmarkets'],
    servers: [
      'ACGMarkets-Main',
      'ACGMarkets-Live',
      'ACGMarkets-Demo',
      'AlphaCapitalGroup-MT5',
      'AlphaCapital-Live',
      'AlphaCapital-Demo',
    ],
  },
  {
    id: 'maven',
    broker: 'Maven Trading',
    category: 'PROP_FIRM',
    aliases: ['maven', 'maventrade'],
    servers: [
      'MavenTrade-Live',
      'MavenTrade-Demo',
      'MavenTrading-Server',
      'MavenTrading-MT5',
    ],
  },
  {
    id: 'e8markets',
    broker: 'E8 Markets (E8 Funding)',
    category: 'PROP_FIRM',
    aliases: ['e8', 'e8markets', 'e8funding'],
    servers: [
      'E8Markets-Live',
      'E8Markets-Demo',
      'E8Markets-Server',
      'E8Funding-Server',
      'E8Funding-Demo',
    ],
  },
  {
    id: 'goatfunded',
    broker: 'Goat Funded Trader (GFT)',
    category: 'PROP_FIRM',
    aliases: ['goat', 'gft', 'goatfunded'],
    servers: [
      'GoatFunded-Server',
      'GoatFundedTrader-MT5',
      'GoatFundedTrader-Demo',
      'GoatFundedTrader-Live',
    ],
  },
  {
    id: 'blueberryfunded',
    broker: 'Blueberry Funded',
    category: 'PROP_FIRM',
    aliases: ['blueberry funded', 'blueberryfunded'],
    servers: [
      'BlueberryFunded-MT5',
      'BlueberryFunded-Live',
      'BlueberryFunded-Demo',
      'BlueberryMarkets-Live',
      'BlueberryMarkets-Live02',
      'BlueberryMarkets-Demo',
      'BlueberryMarkets-Demo02',
    ],
  },
  {
    id: 'fxify',
    broker: 'FXIFY',
    category: 'PROP_FIRM',
    aliases: ['fxify', 'fxpig'],
    servers: [
      'FXIFY-Live',
      'FXIFY-Demo',
      'FXIFY-MT5',
      'FXPIG-MT5',
      'FXPIG-Demo',
    ],
  },
  {
    id: 'instantfunding',
    broker: 'Instant Funding',
    category: 'PROP_FIRM',
    aliases: ['instant funding', 'instantfunding', 'ifmicro'],
    servers: [
      'InstantFunding-Live',
      'InstantFunding-Demo',
      'IFMicro-Server',
      'IFMicro-Live',
      'IFMicro-Demo',
    ],
  },
  {
    id: 'aquafunded',
    broker: 'AquaFunded',
    category: 'PROP_FIRM',
    aliases: ['aquafunded', 'aqua funded'],
    servers: [
      'AquaFunded-Server',
      'AquaFunded-MT5',
      'AquaFunded-Live',
      'AquaFunded-Demo',
    ],
  },
  {
    id: 'brightfunded',
    broker: 'BrightFunded',
    category: 'PROP_FIRM',
    aliases: ['brightfunded', 'bright funded'],
    servers: [
      'BrightFunded-Server',
      'BrightFunded-Live',
      'BrightFunded-Demo',
    ],
  },
  {
    id: 'audacity',
    broker: 'Audacity Capital',
    category: 'PROP_FIRM',
    aliases: ['audacity', 'audacity capital'],
    servers: [
      'AudacityCapital-Live',
      'AudacityCapital-Demo',
      'Audacity-MT5',
    ],
  },
  {
    id: 'cti',
    broker: 'City Traders Imperium (CTI)',
    category: 'PROP_FIRM',
    aliases: ['cti', 'city traders imperium'],
    servers: [
      'CTI-Live',
      'CTI-Demo',
      'CityTradersImperium-MT5',
    ],
  },
  {
    id: 'finotive',
    broker: 'Finotive Funding',
    category: 'PROP_FIRM',
    aliases: ['finotive', 'finotivemarkets'],
    servers: [
      'FinotiveMarkets-Live',
      'FinotiveMarkets-Demo',
      'FinotiveFunding-MT5',
    ],
  },
  {
    id: 'seacrest',
    broker: 'Seacrest Funded (MyFundedFX)',
    category: 'PROP_FIRM',
    aliases: ['seacrest', 'myfundedfx', 'mffx'],
    servers: [
      'SeacrestMarkets-MT5',
      'SeacrestMarkets-Live',
      'SeacrestMarkets-Demo',
      'MyFundedFX-Server',
    ],
  },
  {
    id: 'larkfunding',
    broker: 'Lark Funding',
    category: 'PROP_FIRM',
    aliases: ['lark', 'lark funding'],
    servers: [
      'LarkFunding-Live',
      'LarkFunding-Demo',
      'Eightcap-Demo',
      'ThinkMarkets-Demo',
    ],
  },
  {
    id: 'darwinexzero',
    broker: 'Darwinex Zero',
    category: 'PROP_FIRM',
    aliases: ['darwinex', 'darwinex zero'],
    servers: [
      'Darwinex-Live',
      'Darwinex-Demo',
      'DarwinexZero-MT5',
    ],
  },
  {
    id: 'luxtrading',
    broker: 'Lux Trading Firm',
    category: 'PROP_FIRM',
    aliases: ['lux', 'lux trading'],
    servers: [
      'LuxTradingFirm-Live',
      'LuxTradingFirm-Demo',
      'GlobalPrime-Live',
      'GlobalPrime-Demo',
    ],
  },

  // ============================================================================
  // 2. RETAIL BROKERS (โบรกเกอร์ชั้นนำยอดนิยมในไทยและทั่วโลก)
  // ============================================================================
  {
    id: 'exness',
    broker: 'Exness',
    category: 'RETAIL_BROKER',
    aliases: ['exness'],
    servers: [
      ...expandNumberedServers('Exness-MT5Real', 40),
      ...expandNumberedServers('Exness-MT5Trial', 20),
    ],
  },
  {
    id: 'xm',
    broker: 'XM (XMGlobal)',
    category: 'RETAIL_BROKER',
    aliases: ['xm', 'xmglobal'],
    servers: [
      ...expandNumberedServers('XMGlobal-MT5', 15, { separator: ' ' }),
      'XMGlobal-Demo',
      'XMGlobal-Demo 2',
      'XMGlobal-Demo 3',
    ],
  },
  {
    id: 'icmarkets',
    broker: 'IC Markets / IC Trading',
    category: 'RETAIL_BROKER',
    aliases: ['icmarkets', 'ic markets', 'ictrading', 'ic trading'],
    servers: [
      ...expandNumberedServers('ICMarketsSC-MT5', 6, { separator: '-' }),
      'ICMarketsSC-Demo',
      'ICMarketsGlobal-MT5',
      'ICMarketsGlobal-Demo',
      'ICMarketsEU-MT5-5',
      'ICMarketsAU-MT5',
      'ICTrading-MT5',
      'ICTrading-MT5-2',
      'ICTrading-Demo',
    ],
  },
  {
    id: 'iux',
    broker: 'IUX (IUX Markets)',
    category: 'RETAIL_BROKER',
    aliases: ['iux', 'iuxmarkets'],
    servers: [
      ...expandNumberedServers('IUXMarkets-Real', 6),
      'IUXMarkets-Demo',
      ...expandNumberedServers('IUX-MT5-Real', 4),
      'IUX-MT5-Demo',
    ],
  },
  {
    id: 'vantage',
    broker: 'Vantage Markets',
    category: 'RETAIL_BROKER',
    aliases: ['vantage', 'vantageinternational'],
    servers: [
      ...expandNumberedServers('VantageInternational-Live', 12, { separator: ' ' }),
      ...expandNumberedServers('VantageInternational-Live', 6),
      'VantageInternational-Demo',
      'VantageGlobalPrime-Live',
      'VantageGlobalPrime-Demo',
    ],
  },
  {
    id: 'pepperstone',
    broker: 'Pepperstone',
    category: 'RETAIL_BROKER',
    aliases: ['pepperstone'],
    servers: [
      ...expandNumberedServers('Pepperstone-MT5-Live', 4, { padZero: true, includeFirstNumber: true }),
      ...expandNumberedServers('Pepperstone-MT5-Edge', 4, { padZero: true, includeFirstNumber: true }),
      'Pepperstone-Demo01',
      'Pepperstone-Demo02',
      'PepperstoneUK-Live',
      'PepperstoneUK-Demo',
      'PepperstoneMarkets-Live',
    ],
  },
  {
    id: 'eightcap',
    broker: 'Eightcap',
    category: 'RETAIL_BROKER',
    aliases: ['eightcap'],
    servers: [
      ...expandNumberedServers('Eightcap-Real', 5, { separator: ' ' }),
      'Eightcap-Demo',
      'EightcapGlobal-Real',
      'EightcapGlobal-Real 2',
      'EightcapGlobal-Demo',
      'EightcapEU-Real',
    ],
  },
  {
    id: 'hfm',
    broker: 'HFM (HotForex)',
    category: 'RETAIL_BROKER',
    aliases: ['hfm', 'hotforex', 'hfmarkets'],
    servers: [
      ...expandNumberedServers('HFMarketsSV-Live Server', 6, { separator: ' ' }),
      'HFMarketsSV-Demo Server',
      ...expandNumberedServers('HFMarketsGlobal-Live', 4, { separator: ' ' }),
      'HFMarketsGlobal-Demo',
      'HFMarketsSA-Live',
      'HFMarketsUK-Live',
    ],
  },
  {
    id: 'tickmill',
    broker: 'Tickmill',
    category: 'RETAIL_BROKER',
    aliases: ['tickmill'],
    servers: [
      'Tickmill-Live',
      'Tickmill-Live02',
      'Tickmill-Live03',
      'Tickmill-Live04',
      'Tickmill-Live10',
      'Tickmill-Demo',
      'TickmillUK-Live',
      'TickmillUK-Demo',
      'TickmillEU-Live',
    ],
  },
  {
    id: 'fbs',
    broker: 'FBS',
    category: 'RETAIL_BROKER',
    aliases: ['fbs'],
    servers: [
      'FBS-Real',
      'FBS-Real-2',
      'FBS-Real-3',
      'FBS-Demo',
      'FBS-MT5-Real',
      'FBS-MT5-Demo',
    ],
  },
  {
    id: 'gmi',
    broker: 'GMI (Global Market Index)',
    category: 'RETAIL_BROKER',
    aliases: ['gmi', 'gmimarkets', 'global market index'],
    servers: [
      'GMIMarkets-Live',
      'GMIMarkets-Live02',
      'GMIMarkets-Live03',
      'GMIMarkets-Demo',
      'GlobalMarketIndex-Live',
      'GlobalMarketIndex-Demo',
    ],
  },
  {
    id: 'ebc',
    broker: 'EBC Financial Group',
    category: 'RETAIL_BROKER',
    aliases: ['ebc', 'ebc financial'],
    servers: [
      'EBCFinancialGroup-Live',
      'EBCFinancialGroup-Live02',
      'EBCFinancialGroup-Demo',
      'EBC-MT5-Live',
      'EBC-MT5-Demo',
    ],
  },
  {
    id: 'xs',
    broker: 'XS.com',
    category: 'RETAIL_BROKER',
    aliases: ['xs', 'xs.com', 'xsmarkets'],
    servers: [
      'XS-MT5-Live',
      'XS-MT5-Live2',
      'XS-MT5-Demo',
      'XSMarkets-Live',
      'XSMarkets-Demo',
      'XSFintech-Live',
    ],
  },
  {
    id: 'fpmarkets',
    broker: 'FP Markets',
    category: 'RETAIL_BROKER',
    aliases: ['fpmarkets', 'fp markets'],
    servers: [
      'FPMarketsLLC-Live',
      'FPMarketsLLC-Live2',
      'FPMarketsLLC-Demo',
      'FPMarketsKE-Live',
      'FPMarkets-MT5-Live',
      'FPMarkets-MT5-Demo',
    ],
  },
  {
    id: 'axi',
    broker: 'Axi (AxiTrader)',
    category: 'RETAIL_BROKER',
    aliases: ['axi', 'axitrader'],
    servers: [
      'Axi-US03-Live',
      'Axi-US03-Demo',
      'Axi-US04-Live',
      'AxiTrader-MT5-Live',
      'AxiTrader-MT5-Demo',
    ],
  },
  {
    id: 'thinkmarkets',
    broker: 'ThinkMarkets',
    category: 'RETAIL_BROKER',
    aliases: ['thinkmarkets', 'tfglobal'],
    servers: [
      'ThinkMarkets-Live',
      'ThinkMarkets-Live 2',
      'ThinkMarkets-Demo',
      'TFGlobalMarkets-Live',
      'TFGlobalMarkets-Demo',
    ],
  },
  {
    id: 'blackbull',
    broker: 'BlackBull Markets',
    category: 'RETAIL_BROKER',
    aliases: ['blackbull', 'blackbull markets'],
    servers: [
      'BlackBullMarkets-Live',
      'BlackBullMarkets-Live 2',
      'BlackBullMarkets-Demo',
    ],
  },
  {
    id: 'blueberry',
    broker: 'Blueberry Markets',
    category: 'RETAIL_BROKER',
    aliases: ['blueberry', 'blueberry markets'],
    servers: [
      'BlueberryMarkets-Live',
      'BlueberryMarkets-Live02',
      'BlueberryMarkets-Demo',
      'BlueberryMarkets-Demo02',
    ],
  },
  {
    id: 'puprime',
    broker: 'PU Prime',
    category: 'RETAIL_BROKER',
    aliases: ['puprime', 'pu prime'],
    servers: [
      'PUPrime-Live',
      'PUPrime-Live 2',
      'PUPrime-Live 3',
      'PUPrime-Demo',
    ],
  },
  {
    id: 'vtmarkets',
    broker: 'VT Markets',
    category: 'RETAIL_BROKER',
    aliases: ['vtmarkets', 'vt markets'],
    servers: [
      'VTMarkets-Live',
      'VTMarkets-Live 2',
      'VTMarkets-Live 3',
      'VTMarkets-Demo',
    ],
  },
  {
    id: 'ultimamarkets',
    broker: 'Ultima Markets',
    category: 'RETAIL_BROKER',
    aliases: ['ultima', 'ultimamarkets'],
    servers: [
      'UltimaMarkets-Live',
      'UltimaMarkets-Live 2',
      'UltimaMarkets-Demo',
    ],
  },
  {
    id: 'tmgm',
    broker: 'TMGM (TradeMax)',
    category: 'RETAIL_BROKER',
    aliases: ['tmgm', 'trademax'],
    servers: [
      'TMGMServers-Live',
      'TMGMServers-Live 2',
      'TMGMServers-Live 3',
      'TMGMServers-Demo',
      'TradeMaxGlobal-Live',
    ],
  },
  {
    id: 'startrader',
    broker: 'STARTRADER',
    category: 'RETAIL_BROKER',
    aliases: ['startrader', 'star trader'],
    servers: [
      'STARTRADER-Live',
      'STARTRADER-Live 2',
      'STARTRADER-Demo',
    ],
  },
  {
    id: 'connextfx',
    broker: 'ConnextFX',
    category: 'RETAIL_BROKER',
    aliases: ['connextfx', 'connext'],
    servers: [
      'ConnextFX-Live',
      'ConnextFX-Live 2',
      'ConnextFX-Demo',
    ],
  },
  {
    id: 'landprime',
    broker: 'Land Prime (Land-FX)',
    category: 'RETAIL_BROKER',
    aliases: ['landprime', 'land-fx', 'landfx'],
    servers: [
      'LandPrime-Live',
      'LandPrime-Live 2',
      'LandPrime-Demo',
      'LandFX-MT5-Live',
    ],
  },
  {
    id: 'gomarkets',
    broker: 'GO Markets',
    category: 'RETAIL_BROKER',
    aliases: ['gomarkets', 'go markets'],
    servers: [
      'GOMarkets-Live',
      'GOMarkets-Demo',
      'GOMarketsMU-Live',
      'GOMarketsMU-Demo',
    ],
  },
  {
    id: 'fxpro',
    broker: 'FxPro',
    category: 'RETAIL_BROKER',
    aliases: ['fxpro'],
    servers: [
      'FxPro-MT5',
      'FxPro-MT5 Live01',
      'FxPro-MT5 Live02',
      'FxPro-MT5 Demo01',
    ],
  },
  {
    id: 'oanda',
    broker: 'OANDA',
    category: 'RETAIL_BROKER',
    aliases: ['oanda'],
    servers: [
      'OANDA-MT5 Live-1',
      'OANDA-MT5 Live-2',
      'OANDA-MT5 Demo-1',
      'OANDAGlobalMarkets-Live',
      'OANDATMS-MT5',
    ],
  },
  {
    id: 'forexcom',
    broker: 'FOREX.com (StoneX)',
    category: 'RETAIL_BROKER',
    aliases: ['forex.com', 'stonex', 'gaincapital'],
    servers: [
      'FOREX.comGlobal-Live',
      'FOREX.comGlobal-Demo',
      'GainCapital-Live',
      'GainCapital-Demo',
    ],
  },
  {
    id: 'octa',
    broker: 'Octa (OctaFX)',
    category: 'RETAIL_BROKER',
    aliases: ['octa', 'octafx'],
    servers: [
      'OctaFX-Real',
      'OctaFX-Real2',
      'OctaFX-Real3',
      'OctaFX-Demo',
      'OctaMarkets-Real',
    ],
  },
  {
    id: 'justmarkets',
    broker: 'JustMarkets',
    category: 'RETAIL_BROKER',
    aliases: ['justmarkets', 'justforex'],
    servers: [
      'JustMarkets-Live',
      'JustMarkets-Live2',
      'JustMarkets-Live3',
      'JustMarkets-Demo',
    ],
  },
  {
    id: 'roboforex',
    broker: 'RoboForex',
    category: 'RETAIL_BROKER',
    aliases: ['roboforex'],
    servers: [
      'RoboForex-Pro',
      'RoboForex-ECN',
      'RoboForex-Prime',
      'RoboForex-Demo',
    ],
  },
  {
    id: 'admirals',
    broker: 'Admirals (Admiral Markets)',
    category: 'RETAIL_BROKER',
    aliases: ['admirals', 'admiral markets'],
    servers: [
      'AdmiralsGroup-Live',
      'AdmiralsGroup-Demo',
      'AdmiralMarkets-Live',
      'AdmiralMarkets-Demo',
    ],
  },
  {
    id: 'avatrade',
    broker: 'AvaTrade',
    category: 'RETAIL_BROKER',
    aliases: ['avatrade'],
    servers: [
      'AvaTrade-Live',
      'AvaTrade-Live 2',
      'AvaTrade-Demo',
    ],
  },
  {
    id: 'cmcmarkets',
    broker: 'CMC Markets',
    category: 'RETAIL_BROKER',
    aliases: ['cmc', 'cmcmarkets'],
    servers: [
      'CMCMarkets-Live',
      'CMCMarkets-Demo',
    ],
  },
  {
    id: 'dukascopy',
    broker: 'Dukascopy Bank',
    category: 'RETAIL_BROKER',
    aliases: ['dukascopy'],
    servers: [
      'Dukascopy-LIVE-MT5-1',
      'Dukascopy-DEMO-MT5-1',
    ],
  },
  {
    id: 'swissquote',
    broker: 'Swissquote',
    category: 'RETAIL_BROKER',
    aliases: ['swissquote'],
    servers: [
      'Swissquote-Live',
      'Swissquote-Demo',
      'SwissquoteLtd-Live',
    ],
  },
  {
    id: 'lmax',
    broker: 'LMAX Global',
    category: 'RETAIL_BROKER',
    aliases: ['lmax'],
    servers: [
      'LMAX-LiveUK',
      'LMAX-DemoUK',
      'LMAXGlobal-Live',
    ],
  },
  {
    id: 'purpletrading',
    broker: 'Purple Trading',
    category: 'RETAIL_BROKER',
    aliases: ['purple', 'purpletrading'],
    servers: [
      'PurpleTradingSC-Live',
      'PurpleTradingSC-Demo',
    ],
  },
  {
    id: 'metaquotes',
    broker: 'MetaQuotes (Official Demo)',
    category: 'RETAIL_BROKER',
    aliases: ['metaquotes'],
    servers: ['MetaQuotes-Demo'],
  },
];

export const ALL_MT5_BROKERS: string[] = MT5_BROKER_CATALOG.map((item) => item.broker);

export const ALL_MT5_SERVERS: string[] = Array.from(
  new Set(MT5_BROKER_CATALOG.flatMap((item) => item.servers))
);

export function getServersForBroker(brokerInput: string): string[] {
  const q = String(brokerInput || '').trim().toLowerCase();
  if (!q) {
    return ALL_MT5_SERVERS;
  }

  const matchedItems = MT5_BROKER_CATALOG.filter(
    (item) =>
      item.broker.toLowerCase().includes(q) ||
      q.includes(item.id.toLowerCase()) ||
      item.aliases.some((alias) => alias.toLowerCase().includes(q) || q.includes(alias.toLowerCase()))
  );

  if (matchedItems.length === 0) {
    return ALL_MT5_SERVERS;
  }

  return Array.from(new Set(matchedItems.flatMap((item) => item.servers)));
}

export function inferBrokerFromServer(serverInput: string): string | null {
  const s = String(serverInput || '').trim().toLowerCase();
  if (!s) return null;

  for (const item of MT5_BROKER_CATALOG) {
    if (item.servers.some((srv) => srv.toLowerCase() === s)) {
      return item.broker;
    }
  }

  for (const item of MT5_BROKER_CATALOG) {
    if (
      s.startsWith(item.id.toLowerCase()) ||
      item.aliases.some((alias) => s.includes(alias.toLowerCase()))
    ) {
      return item.broker;
    }
  }

  return null;
}
