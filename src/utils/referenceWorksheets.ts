import type { MallSetupBlueprint } from '../types/mallChat.js';

export interface ReferenceWorksheet {
  id: string;
  blueprint: MallSetupBlueprint;
  description: readonly [string, string];
  proofHash: string;
}

// Versioned editorial worksheets. The digest covers the ID and the complete distance worksheet.
export function referenceProofPayload({ id, blueprint }: ReferenceWorksheet): string {
  return JSON.stringify({ id, blueprint });
}

export const REFERENCE_WORKSHEETS: readonly ReferenceWorksheet[] = [
  {
    id: 'ref-xau-london',
    blueprint: {
      title: 'London gold worksheet', primarySymbol: 'XAUUSD', timeframe: 'M15', sessionFocus: 'LONDON',
      riskUsd: 60, slPoints: 1000, tp1Points: 500, tp2Points: 1000, tp3Points: 1800,
      checklistNotes: ["Confirm the gold contract point size.","Record the planned risk before reviewing closed deals."],
    },
    description: ['Compare three gold distances against one fixed loss budget.', 'เทียบระยะทองคำสามระดับกับงบขาดทุนต่อแผน'],
    proofHash: '07bddca1a2b423510cd4d5f653069e9ef1229b6c8ba92c793686f5f38b55aa08',
  },
  {
    id: 'ref-eur-asia',
    blueprint: {
      title: 'Asia FX worksheet', primarySymbol: 'EURUSD', timeframe: 'M30', sessionFocus: 'ASIA',
      riskUsd: 45, slPoints: 180, tp1Points: 120, tp2Points: 270, tp3Points: 450,
      checklistNotes: ["Record the broker point convention.","Reconcile closed-session costs before comparing realized R."],
    },
    description: ['Review how spread and fees change the realized R of a closed FX session.', 'ทบทวนผลของสเปรดและค่าธรรมเนียมต่อค่า R หลังปิดรอบฟอเร็กซ์'],
    proofHash: '706539252121ff6e45f763aeaa61297c0ce2327ad558e2510728c2241de6eed3',
  },
  {
    id: 'ref-nas-ny',
    blueprint: {
      title: 'New York index worksheet', primarySymbol: 'NAS100', timeframe: 'H1', sessionFocus: 'NY',
      riskUsd: 80, slPoints: 2400, tp1Points: 1800, tp2Points: 3600, tp3Points: 6000,
      checklistNotes: ["Check index contract specifications.","Compare the modeled loss with remaining daily headroom."],
    },
    description: ['Measure index distances against the daily drawdown buffer.', 'เทียบระยะดัชนีกับวงเงินขาดทุนรายวันที่เหลือ'],
    proofHash: '813d1a9f4f21d82bdf5940a7134d085b5ce391765d2458bc5b2efed9dd203138',
  },
];
