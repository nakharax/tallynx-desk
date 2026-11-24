import { deskText, type DeskLanguage } from '../utils/deskI18n';
import type { MallSetupBlueprint } from '../types/mallChat';

type Distances = Pick<MallSetupBlueprint, 'slPoints' | 'tp1Points' | 'tp2Points' | 'tp3Points'>;

export function BlueprintLadder({ distances, lang }: { distances: Distances; lang: DeskLanguage }) {
  const { slPoints, tp1Points, tp2Points, tp3Points } = distances;
  if (![slPoints, tp1Points, tp2Points, tp3Points].every(n => Number.isFinite(n) && n > 0)) {
    return <p className="mkt-caption">{deskText(lang, 'Enter four positive distances to calculate R.', 'ระบุระยะทั้งสี่ค่าให้มากกว่าศูนย์เพื่อคำนวณ R')}</p>;
  }
  const targets = [tp1Points, tp2Points, tp3Points].map(points => +(points / slPoints).toFixed(2));
  const average = +(targets.reduce((sum, r) => sum + r, 0) / 3).toFixed(2);
  const levels = ['SL', 'TP1', 'TP2', 'TP3'] as const;
  const ratios = [1, ...targets];
  return (
    <div className="blueprint-ladder">
      <div className="ladder-caption"><span>{deskText(lang, 'Reward / risk', 'ผลตอบแทน / ความเสี่ยง')}</span>
        <strong className="mono">{deskText(lang, 'Avg R:R', 'R:R เฉลี่ย')} 1 : {average}R</strong>
      </div>
      <div className="ladder-track" aria-hidden="true">
        {levels.map((level, index) => <i key={level} data-level={level} style={{ flexGrow: ratios[index] }} />)}
      </div>
      <div className="ladder-key mono">{levels.map((level, index) => (
        <span key={level} data-level={level}><i aria-hidden="true" />{level} <b>{level === 'SL' ? '−1.0' : '+' + ratios[index]}R</b></span>
      ))}</div>
    </div>
  );
}
